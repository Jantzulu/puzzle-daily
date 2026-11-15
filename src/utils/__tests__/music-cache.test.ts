/**
 * The background track is downloaded once per device (utils/musicCache.ts).
 * Run against a stubbed Cache Storage, fetch and localStorage.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMusicBlob } from '../musicCache';

const A = 'https://example.test/storage/castle.mp3';
const B = 'https://example.test/storage/crypt.mp3';

let stored: Map<string, Response>;
let fetched: string[];
let local: Map<string, string>;

const audio = (text: string, status = 200) =>
  new Response(text, { status, headers: { 'content-type': 'audio/mpeg' } });

beforeEach(() => {
  stored = new Map();
  fetched = [];
  local = new Map();
  vi.stubGlobal('caches', {
    open: async () => ({
      match: async (url: string) => stored.get(url)?.clone(),
      put: async (url: string, response: Response) => { stored.set(url, response); },
      delete: async (url: string) => stored.delete(url),
    }),
  });
  vi.stubGlobal('fetch', async (url: string) => {
    fetched.push(url);
    return audio(`bytes of ${url}`);
  });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => { local.set(k, v); },
  });
});

describe('music cache', () => {
  it('downloads a track once, then plays from the saved copy', async () => {
    const first = await getMusicBlob(A);
    expect(await first!.text()).toBe(`bytes of ${A}`);
    expect(fetched).toEqual([A]);
    expect(stored.has(A)).toBe(true);

    const second = await getMusicBlob(A);
    expect(await second!.text()).toBe(`bytes of ${A}`);
    expect(fetched).toEqual([A]); // no second download
  });

  it('two requests at once share one download', async () => {
    const [x, y] = await Promise.all([getMusicBlob(A), getMusicBlob(A)]);
    expect(fetched).toEqual([A]);
    expect(x).not.toBeNull();
    expect(y).not.toBeNull();
  });

  it('keeps only the current track: a new one deletes the one before', async () => {
    await getMusicBlob(A);
    await getMusicBlob(B);
    expect([...stored.keys()]).toEqual([B]);
  });

  it('does not delete what it did not save', async () => {
    stored.set('https://example.test/storage/hero.png', new Response('png'));
    await getMusicBlob(A);
    await getMusicBlob(B);
    expect([...stored.keys()].sort()).toEqual(['https://example.test/storage/hero.png', B].sort());
  });

  it('a failed download saves nothing and returns null (the caller streams)', async () => {
    vi.stubGlobal('fetch', async () => audio('not found', 404));
    expect(await getMusicBlob(A)).toBeNull();
    expect(stored.size).toBe(0);

    vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
    expect(await getMusicBlob(A)).toBeNull();
  });

  it('a partial (streamed) response is never saved as the whole track', async () => {
    vi.stubGlobal('fetch', async () => audio('first bytes only', 206));
    expect(await getMusicBlob(A)).toBeNull();
    expect(stored.size).toBe(0);
  });

  it('without Cache Storage it returns null and downloads nothing', async () => {
    vi.stubGlobal('caches', undefined);
    expect(await getMusicBlob(A)).toBeNull();
    expect(fetched).toEqual([]);
  });
});
