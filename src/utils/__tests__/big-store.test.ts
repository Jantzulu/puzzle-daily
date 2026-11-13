/**
 * bigStore: the asset library's IndexedDB-backed store with a synchronous
 * face (utils/bigStore.ts). Run against an in-memory backend and a stubbed
 * localStorage; the real IndexedDB adapter is exercised in the browser.
 *
 * What must hold, because creative work sits behind it:
 *   - first run copies the library out of localStorage, once;
 *   - after that IndexedDB is the only truth (a stale localStorage copy
 *     can't resurrect or overwrite anything);
 *   - a failed IndexedDB never silently swaps in stale data.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BigStoreUnavailableError,
  bigStoreMode,
  clearBigStore,
  flushBigStore,
  hydrateBigStore,
  onBigStoreError,
  store,
  type BigStoreBackend,
} from '../bigStore';

function fakeLocalStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
}

function fakeBackend(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  const backend: BigStoreBackend = {
    getAll: async () => new Map(data),
    set: async (k, v) => { data.set(k, v); },
    remove: async (k) => { data.delete(k); },
  };
  return { data, backend };
}

const brokenBackend: BigStoreBackend = {
  getAll: async () => { throw new Error('open failed'); },
  set: async () => { throw new Error('unreachable'); },
  remove: async () => { throw new Error('unreachable'); },
};

let ls: ReturnType<typeof fakeLocalStorage>;

beforeEach(() => {
  ls = fakeLocalStorage();
  vi.stubGlobal('localStorage', ls);
  onBigStoreError(() => {});
});

describe('bigStore', () => {
  it('before hydration, everything passes through to localStorage', async () => {
    await hydrateBigStore({ keepLegacyCopy: true, backend: null });
    expect(bigStoreMode()).toBe('local');
    store.setItem('spell_assets', '[1]');
    expect(ls.data.get('spell_assets')).toBe('[1]');
    expect(store.getItem('spell_assets')).toBe('[1]');
  });

  it('first run migrates big keys out of localStorage and leaves small keys alone', async () => {
    ls.data.set('spell_assets', '[{"id":"a"}]');
    ls.data.set('saved_puzzles', '[]');
    ls.data.set('theme_assets', '{"x":1}');
    const { data, backend } = fakeBackend();

    expect(await hydrateBigStore({ keepLegacyCopy: true, backend })).toBe('idb');

    expect(data.get('spell_assets')).toBe('[{"id":"a"}]');
    expect(data.get('saved_puzzles')).toBe('[]');
    expect(data.has('theme_assets')).toBe(false);
    expect(store.getItem('spell_assets')).toBe('[{"id":"a"}]');
    expect(store.getItem('theme_assets')).toBe('{"x":1}');
  });

  it('the editor keeps the old copy as a frozen backup; the player drops it', async () => {
    ls.data.set('spell_assets', '[1]');
    await hydrateBigStore({ keepLegacyCopy: true, backend: fakeBackend().backend });
    expect(ls.data.get('spell_assets')).toBe('[1]');

    ls.data.set('spell_assets', '[1]');
    await hydrateBigStore({ keepLegacyCopy: false, backend: fakeBackend().backend });
    expect(ls.data.has('spell_assets')).toBe(false);
  });

  it('writes go to the backend, not localStorage, and read back synchronously', async () => {
    const { data, backend } = fakeBackend();
    await hydrateBigStore({ keepLegacyCopy: true, backend });

    store.setItem('custom_characters', '[2]');
    expect(store.getItem('custom_characters')).toBe('[2]'); // before the write lands
    await flushBigStore();

    expect(data.get('custom_characters')).toBe('[2]');
    expect(ls.data.has('custom_characters')).toBe(false);
  });

  it('two quick writes to one key land in order', async () => {
    const { data, backend } = fakeBackend();
    await hydrateBigStore({ keepLegacyCopy: true, backend });
    store.setItem('spell_assets', 'first');
    store.setItem('spell_assets', 'second');
    await flushBigStore();
    expect(data.get('spell_assets')).toBe('second');
  });

  it('after migration a stale localStorage copy is never read again', async () => {
    ls.data.set('spell_assets', 'old');
    const { data, backend } = fakeBackend();
    await hydrateBigStore({ keepLegacyCopy: true, backend });
    store.setItem('spell_assets', 'new');
    await flushBigStore();

    // A stale tab on older code rewrites the localStorage copy...
    ls.data.set('spell_assets', 'written by a stale tab');
    await hydrateBigStore({ keepLegacyCopy: true, backend });

    expect(store.getItem('spell_assets')).toBe('new');
    expect(data.get('spell_assets')).toBe('new');
    expect(ls.data.get('spell_assets')).toBe('written by a stale tab'); // ...and it's left alone, not destroyed
  });

  it('a removed key stays removed even though the old copy still exists', async () => {
    ls.data.set('puzzle_skins', 'old');
    const { backend } = fakeBackend();
    await hydrateBigStore({ keepLegacyCopy: true, backend });
    store.removeItem('puzzle_skins');
    await flushBigStore();

    await hydrateBigStore({ keepLegacyCopy: true, backend });
    expect(store.getItem('puzzle_skins')).toBeNull();
  });

  it('clearBigStore empties the library', async () => {
    ls.data.set('spell_assets', 'a');
    ls.data.set('saved_puzzles', 'b');
    const { data, backend } = fakeBackend();
    await hydrateBigStore({ keepLegacyCopy: true, backend });
    await clearBigStore();
    expect(store.getItem('spell_assets')).toBeNull();
    expect(data.has('spell_assets')).toBe(false);
    expect(data.has('saved_puzzles')).toBe(false);
  });

  it('no IndexedDB and never migrated: stays on localStorage', async () => {
    ls.data.set('spell_assets', 'a');
    expect(await hydrateBigStore({ keepLegacyCopy: true, backend: brokenBackend })).toBe('local');
    expect(store.getItem('spell_assets')).toBe('a');
  });

  it('IndexedDB failing AFTER a migration: the editor refuses to run on the stale copy', async () => {
    ls.data.set('spell_assets', 'snapshot from migration day');
    await hydrateBigStore({ keepLegacyCopy: true, backend: fakeBackend().backend });

    await expect(hydrateBigStore({ keepLegacyCopy: true, backend: brokenBackend }))
      .rejects.toBeInstanceOf(BigStoreUnavailableError);
  });

  it('IndexedDB failing AFTER a migration: the player runs from memory and persists nothing', async () => {
    await hydrateBigStore({ keepLegacyCopy: false, backend: fakeBackend().backend });

    expect(await hydrateBigStore({ keepLegacyCopy: false, backend: brokenBackend })).toBe('memory');
    store.setItem('spell_assets', 'refetched');
    expect(store.getItem('spell_assets')).toBe('refetched');
    expect(ls.data.has('spell_assets')).toBe(false);
  });

  it('a failed background write is reported', async () => {
    const { backend } = fakeBackend();
    await hydrateBigStore({ keepLegacyCopy: true, backend });
    backend.set = async () => { throw new Error('disk full'); };
    const seen: unknown[] = [];
    onBigStoreError(e => seen.push(e));

    store.setItem('spell_assets', 'x');
    await flushBigStore();
    expect(seen).toHaveLength(1);
  });
});
