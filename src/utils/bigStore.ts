// ============================================================================
// BIG STORE — the asset library's home: IndexedDB with a synchronous face
// ============================================================================
// localStorage caps at roughly 5 million characters per origin (less on
// Safari). The asset library (spells, characters, enemies, skins, puzzles)
// was ~3 million in the 2026-07 backup, one embedded-image spell alone 2.1
// million, so it WILL hit that ceiling as art arrives.
//
// The library's keys (BIG_KEYS) live in IndexedDB instead. Every reader in
// the app is synchronous (the engine reads characters mid-turn), so this
// keeps an in-memory copy that is filled ONCE before the app boots
// (hydrateBigStore; main*.tsx waits for it before the first render) and
// written through on every set.
// `store` has localStorage's getItem/setItem/removeItem shape; keys outside
// BIG_KEYS pass straight through to localStorage.
//
// MIGRATION (first load with this code): each big key's localStorage value
// is copied into IndexedDB. After that IndexedDB is the only truth and the
// localStorage copies are never read again:
//   - editor app (keepLegacyCopy): the old copies are LEFT in place as a
//     frozen backup of the moment of migration. A stale tab still running
//     older code may keep writing them; those writes are ignored here but
//     not destroyed.
//   - player app: the old copies are deleted (it's a re-fetchable cache, and
//     phones are the tightest on quota).
//
// OTHER TABS: every write is announced on a BroadcastChannel so each tab's
// copy stays current, and re-raised as a `storage` event so existing
// cross-tab listeners keep working.

export const BIG_KEYS: ReadonlySet<string> = new Set([
  'custom_characters',
  'custom_enemies',
  'custom_vessels',
  'custom_allies',
  'custom_tiles',
  'custom_objects',
  'custom_collectibles',
  'custom_collectible_assets',
  'spell_assets',
  'status_effect_assets',
  'custom_border_sprites',
  'puzzle_skins',
  'sound_assets',
  'saved_puzzles',
]);

/** Where the bytes go. Injectable so tests can run without IndexedDB. */
export interface BigStoreBackend {
  getAll(): Promise<Map<string, string>>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export type BigStoreMode =
  /** Not hydrated, or IndexedDB unavailable and never used: plain localStorage, as before. */
  | 'local'
  /** Normal: IndexedDB behind the in-memory copy. */
  | 'idb'
  /** IndexedDB failed AFTER a migration: this session only, nothing persisted. */
  | 'memory';

/** In IndexedDB: set once every big key has been migrated. */
const MIGRATED_META_KEY = '__migrated_v1';
/** In localStorage: lets a later session tell "IndexedDB never used" from "IndexedDB failed". */
const MIGRATED_FLAG = 'bigstore_migrated_v1';
const CHANNEL_NAME = 'puzzle-big-store';

const cache = new Map<string, string>();
let mode: BigStoreMode = 'local';
/**
 * True in a browser until hydrateBigStore settles. A big-key read in that
 * window would see the wrong data (the old localStorage copy, or nothing),
 * so it is a bug: it throws in dev and is logged in production.
 */
let awaitingHydration = typeof indexedDB !== 'undefined';
let backend: BigStoreBackend | null = null;
let channel: BroadcastChannel | null = null;
let onError: (error: unknown) => void = () => {};
/** Per-key write chain so two quick writes to one key land in order. */
const pendingWrites = new Map<string, Promise<void>>();

/** Raised when the editor app can't reach its migrated library. */
export class BigStoreUnavailableError extends Error {
  constructor(cause: unknown) {
    super('The asset library lives in IndexedDB on this device and it could not be opened.', { cause });
    this.name = 'BigStoreUnavailableError';
  }
}

/** Called when a background write to IndexedDB fails (the UI should say so). */
export function onBigStoreError(handler: (error: unknown) => void): void {
  onError = handler;
}

export function bigStoreMode(): BigStoreMode {
  return mode;
}

const lsGet = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const lsRemove = (key: string): void => {
  try { localStorage.removeItem(key); } catch { /* unavailable */ }
};
const lsSet = (key: string, value: string): void => {
  try { localStorage.setItem(key, value); } catch { /* unavailable or full */ }
};

function persist(key: string, value: string | null): void {
  if (!backend) return;
  const b = backend;
  const prev = pendingWrites.get(key) ?? Promise.resolve();
  const next = prev
    .then(() => (value === null ? b.remove(key) : b.set(key, value)))
    .catch(error => { onError(error); });
  pendingWrites.set(key, next);
  void next.then(() => { if (pendingWrites.get(key) === next) pendingWrites.delete(key); });
}

/** Resolves once every write issued so far has reached the backend. */
export function flushBigStore(): Promise<void> {
  return Promise.all([...pendingWrites.values()]).then(() => undefined);
}

function announce(key: string, value: string | null): void {
  try { channel?.postMessage({ key, value }); } catch { /* channel closed */ }
}

function listenToOtherTabs(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (e: MessageEvent<{ key: string; value: string | null }>) => {
    const { key, value } = e.data ?? {};
    if (typeof key !== 'string' || !BIG_KEYS.has(key)) return;
    if (value === null) cache.delete(key); else cache.set(key, value);
    // Existing cross-tab listeners watch `storage` events.
    if (typeof window !== 'undefined' && typeof StorageEvent !== 'undefined') {
      window.dispatchEvent(new StorageEvent('storage', { key }));
    }
  };
}

/**
 * Fill the in-memory copy from IndexedDB, migrating localStorage on first
 * run. Await this before the first render: nothing may read the library
 * until it settles.
 *
 * Without a usable IndexedDB: if nothing was ever migrated the store stays a
 * localStorage passthrough (exactly the old behavior). If a migration HAD
 * happened, the player app runs from memory for the session; the editor app
 * throws BigStoreUnavailableError rather than run on a stale library.
 */
export async function hydrateBigStore(opts: {
  keepLegacyCopy: boolean;
  /** Defaults to IndexedDB; pass null to simulate "no IndexedDB". */
  backend?: BigStoreBackend | null;
}): Promise<BigStoreMode> {
  cache.clear();
  backend = null;
  mode = 'local';
  channel?.close();
  channel = null;
  try {
    return await hydrate(opts);
  } finally {
    awaitingHydration = false;
  }
}

async function hydrate(opts: {
  keepLegacyCopy: boolean;
  backend?: BigStoreBackend | null;
}): Promise<BigStoreMode> {
  const candidate = opts.backend === undefined ? openIndexedDbBackend() : opts.backend;
  let all: Map<string, string>;
  try {
    if (!candidate) throw new Error('IndexedDB is not available');
    all = await candidate.getAll();
  } catch (error) {
    if (lsGet(MIGRATED_FLAG) !== '1') return mode; // never migrated: stay on localStorage
    if (opts.keepLegacyCopy) throw new BigStoreUnavailableError(error);
    mode = 'memory';
    return mode;
  }

  for (const [key, value] of all) {
    if (BIG_KEYS.has(key)) cache.set(key, value);
  }

  if (all.get(MIGRATED_META_KEY) !== '1') {
    for (const key of BIG_KEYS) {
      if (cache.has(key)) continue;
      const legacy = lsGet(key);
      if (legacy === null) continue;
      await candidate.set(key, legacy);
      cache.set(key, legacy);
    }
    await candidate.set(MIGRATED_META_KEY, '1');
  }
  lsSet(MIGRATED_FLAG, '1');
  if (!opts.keepLegacyCopy) {
    for (const key of BIG_KEYS) lsRemove(key);
  }

  backend = candidate;
  mode = 'idb';
  listenToOtherTabs();
  return mode;
}

/** localStorage's shape. Big keys go to IndexedDB; the rest pass through. */
function guardEarlyAccess(key: string): void {
  if (!awaitingHydration) return;
  const message = `[bigStore] "${key}" was accessed before the store was hydrated`;
  if (import.meta.env?.DEV) throw new Error(message);
  console.error(message);
}

export const store = {
  getItem(key: string): string | null {
    if (BIG_KEYS.has(key)) guardEarlyAccess(key);
    if (mode === 'local' || !BIG_KEYS.has(key)) return localStorage.getItem(key);
    return cache.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    if (BIG_KEYS.has(key)) guardEarlyAccess(key);
    if (mode === 'local' || !BIG_KEYS.has(key)) {
      localStorage.setItem(key, value);
      return;
    }
    cache.set(key, value);
    persist(key, value);
    announce(key, value);
  },
  removeItem(key: string): void {
    if (mode === 'local' || !BIG_KEYS.has(key)) {
      localStorage.removeItem(key);
      return;
    }
    cache.delete(key);
    persist(key, null);
    announce(key, null);
  },
};

/** Empty the library (the editor's "clear cache"). Pair with localStorage.clear(). */
export function clearBigStore(): Promise<void> {
  if (mode !== 'local') {
    for (const key of BIG_KEYS) {
      if (cache.has(key)) store.removeItem(key);
    }
  }
  return flushBigStore();
}

// ---------------------------------------------------------------------------
// IndexedDB backend: one object store of string values keyed by storage key.
// ---------------------------------------------------------------------------

const DB_NAME = 'puzzle-game';
const DB_STORE = 'kv';
/** Some WebKit builds leave indexedDB.open() pending forever; don't hang the boot. */
const OPEN_TIMEOUT_MS = 4000;

function openIndexedDbBackend(): BigStoreBackend | null {
  if (typeof indexedDB === 'undefined') return null;

  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = (): Promise<IDBDatabase> => {
    dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('IndexedDB open timed out')), OPEN_TIMEOUT_MS);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(DB_STORE); };
      req.onsuccess = () => { clearTimeout(timer); resolve(req.result); };
      req.onerror = () => { clearTimeout(timer); reject(req.error); };
      req.onblocked = () => { clearTimeout(timer); reject(new Error('IndexedDB open blocked')); };
    });
    return dbPromise;
  };

  const write = async (run: (s: IDBObjectStore) => void): Promise<void> => {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(DB_STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      run(tx.objectStore(DB_STORE));
    });
  };

  return {
    async getAll() {
      const d = await db();
      return new Promise<Map<string, string>>((resolve, reject) => {
        const out = new Map<string, string>();
        const tx = d.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          if (typeof cursor.key === 'string' && typeof cursor.value === 'string') out.set(cursor.key, cursor.value);
          cursor.continue();
        };
        tx.oncomplete = () => resolve(out);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    },
    set: (key, value) => write(s => { s.put(value, key); }),
    remove: key => write(s => { s.delete(key); }),
  };
}
