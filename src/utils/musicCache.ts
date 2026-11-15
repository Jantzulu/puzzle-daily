// ============================================================================
// MUSIC CACHE — the background track, downloaded once per device
// ============================================================================
// User call 2026-11-14: the lightest download. A streamed track is fetched
// again on every visit (the host says "revalidate", and a stream arrives in
// pieces no cache keeps), which for a daily game means the whole file every
// day. So the looping background track is downloaded ONCE, in full, kept in
// Cache Storage, and played from that copy from then on.
//
// Bounds on what a device holds:
//   - only for a player with sound on (the caller only asks while enabled);
//   - only the CURRENT track: saving a new one deletes the one before it;
//   - the browser may clear it by itself (storage pressure; Safari drops a
//     site's storage after a week without a visit). Then it is re-fetched.
// One-shot stingers are not kept: they stream.
//
// The cache is the one the player app's service worker already uses for
// files from storage (vite.config.player.ts, 'supabase-storage'). Sharing
// the name on purpose: the worker also stores a full file fetched through
// it, and two caches would hold the track twice.

const CACHE_NAME = 'supabase-storage';
/** localStorage: the URL of the track this module saved, to delete it later. */
const CURRENT_KEY = 'music-cache-current';

const inFlight = new Map<string, Promise<Blob | null>>();

const remember = (url: string): string | null => {
  try {
    const previous = localStorage.getItem(CURRENT_KEY);
    localStorage.setItem(CURRENT_KEY, url);
    return previous;
  } catch {
    return null; // storage unavailable: nothing to clean up later
  }
};

async function load(url: string): Promise<Blob | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const saved = await cache.match(url);
    // (An opaque entry can't be read; only a real 200 counts.)
    if (saved && saved.status === 200) return await saved.blob();

    const response = await fetch(url);
    if (response.status !== 200) return null;
    await cache.put(url, response.clone());
    const previous = remember(url);
    if (previous && previous !== url) await cache.delete(previous);
    return await response.blob();
  } catch {
    // Offline, storage full, or the host refused: the caller streams instead.
    return null;
  }
}

/**
 * The track at `url` as a Blob: from this device's saved copy, or downloaded
 * once and saved. Null when that isn't possible (no Cache Storage, offline,
 * a failed fetch); the caller then streams the URL as before.
 */
export function getMusicBlob(url: string): Promise<Blob | null> {
  let pending = inFlight.get(url);
  if (!pending) {
    pending = load(url).finally(() => { inFlight.delete(url); });
    inFlight.set(url, pending);
  }
  return pending;
}
