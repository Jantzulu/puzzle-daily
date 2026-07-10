import type { Puzzle } from '../types/game';
import { localDateKey } from './localDate';

// Same-day cache of the fetched daily puzzle. Lets a reload (or an offline
// visit later the same day) boot straight into the real daily instead of the
// local default, and keeps daily-lock/lives hydration pointed at the right
// puzzle from the first render. Keyed by LOCAL date to match
// fetchTodaysPuzzle's definition of "today" (rollover at local midnight).

const KEY = 'puzzle-daily-cached-daily';

export interface CachedDaily {
  dateKey: string;
  puzzle: Puzzle;
  puzzleNumber: number | null;
}

function todayKey(): string {
  return localDateKey();
}

export function saveCachedDailyPuzzle(puzzle: Puzzle, puzzleNumber: number | null): void {
  try {
    const entry: CachedDaily = { dateKey: todayKey(), puzzle, puzzleNumber };
    localStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // Storage full or unavailable — the cache is best-effort only.
  }
}

export function loadCachedDailyPuzzle(): CachedDaily | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CachedDaily;
    // Yesterday's daily must never impersonate today's.
    if (entry.dateKey !== todayKey()) return null;
    if (!entry.puzzle?.id) return null;
    return entry;
  } catch {
    return null;
  }
}
