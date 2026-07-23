import type { Puzzle } from '../types/game';
import { localDateKey } from './localDate';

// Same-day cache of the player-facing live-content fetch (published showcase
// puzzles, published training puzzles, and the revealed-asset-id index for
// the Slab). Mirrors dailyPuzzleCache: keyed by LOCAL date so it refreshes
// once per local day. Unlike the daily, stale entries are still loadable on
// request — a day-old reveal set or demo list beats an empty Slab when the
// player is offline (the reveal set only ever grows).

// v2 (2026-07-21 closure-prefetch round): showcase puzzles are cached as an
// id→attachments INDEX, never full JSON — full demo JSON cached here was a
// snoop surface (layouts/names of demos attached to un-debuted assets sat
// inspectable in localStorage). Full rows are fetched per revealed asset
// page instead. Key bumped so stale v1 shapes self-invalidate.
const KEY = 'puzzle-daily-cached-live-content-v2';

/** One published showcase puzzle's attachment info (never its full JSON). */
export interface ShowcaseIndexEntry {
  id: string;
  /** Asset ids whose Slab pages embed this demo (showcase.entityIds). */
  entityIds: string[];
}

/** What the player app needs from puzzles_live beyond the daily itself. */
export interface LiveContent {
  /** Index of published showcase puzzles — Slab demo boards. */
  showcaseIndex: ShowcaseIndexEntry[];
  /** Published training puzzles — the player Training Grounds list. */
  trainingPuzzles: Puzzle[];
  /**
   * Union of publishedAssetIds across every RELEASED, non-showcase puzzle
   * (past/today dailies + published training levels). The Slab reveal set:
   * showcase publishing primes but never reveals.
   */
  revealedAssetIds: string[];
}

interface CachedLiveContent {
  dateKey: string;
  content: LiveContent;
}

export function saveCachedLiveContent(content: LiveContent): void {
  try {
    const entry: CachedLiveContent = { dateKey: localDateKey(), content };
    localStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // Storage full or unavailable — the cache is best-effort only.
  }
}

export function loadCachedLiveContent(): { content: LiveContent; fresh: boolean } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CachedLiveContent;
    if (!Array.isArray(entry.content?.revealedAssetIds) || !Array.isArray(entry.content?.showcaseIndex)) return null;
    return { content: entry.content, fresh: entry.dateKey === localDateKey() };
  } catch {
    return null;
  }
}
