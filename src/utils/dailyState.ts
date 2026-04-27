/**
 * Daily-puzzle persistence — Wordle-style lock state for the player site.
 *
 * Stores the player's progress on the current day's puzzle in localStorage so
 * that a refresh, browser close, or return-visit later in the day can't
 * "reset" their attempt or replay a finished puzzle. Once the local calendar
 * day rolls over (puzzleDate changes), stored state for the prior day is
 * treated as stale and the new puzzle starts fresh.
 *
 * Scope:
 *  - Player site only — Game.tsx reads these helpers when the
 *    `enableDailyLock` prop is true AND `currentPuzzle.date` is set.
 *  - localStorage is authoritative for the lock. Logged-in users still get
 *    `puzzle_completions` analytics rows via the existing pipeline, but the
 *    daily lock itself doesn't round-trip to Supabase. Cross-device resume
 *    isn't a goal — puzzles are short enough that "restart on a new device"
 *    is fine.
 *  - No mid-puzzle save. Lives + final outcome only.
 */

const DAILY_STATE_KEY = 'daily_puzzle_state_v1';

export type DailyStatus = 'in_progress' | 'won' | 'lost';

export interface DailyState {
  /** Puzzle.date this state belongs to. Mismatch → stale, treat as fresh. */
  puzzleDate: string;
  /** Lives remaining; persists deductions across reloads within the same day. */
  livesRemaining: number;
  /** Final outcome lock. 'in_progress' means player is mid-attempt. */
  status: DailyStatus;
}

/**
 * Read stored state for `puzzleDate`. Returns null if there's nothing stored,
 * or the stored entry belongs to a different (older) date — both cases mean
 * "start fresh."
 *
 * Caller is responsible for passing the puzzle's own .date string. We don't
 * try to derive "today" here because the puzzle list / scheduler already
 * picks today's puzzle based on local time.
 */
export function getDailyState(puzzleDate: string): DailyState | null {
  try {
    const raw = localStorage.getItem(DAILY_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DailyState;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.puzzleDate !== puzzleDate) return null;
    if (parsed.status !== 'in_progress' && parsed.status !== 'won' && parsed.status !== 'lost') {
      return null;
    }
    if (typeof parsed.livesRemaining !== 'number' || !Number.isFinite(parsed.livesRemaining)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Write the current state. Called after lives change or status flips.
 * Errors are swallowed because localStorage failures (private browsing,
 * quota) shouldn't break gameplay — we just lose the lock for that session,
 * which degrades to today's pre-persistence behavior.
 */
export function setDailyState(state: DailyState): void {
  try {
    localStorage.setItem(DAILY_STATE_KEY, JSON.stringify(state));
  } catch {
    // Intentionally silent — see jsdoc.
  }
}

/**
 * Convenience: update just the livesRemaining for a still-in-progress
 * attempt. Reads, mutates, writes. Caller already knows puzzleDate.
 */
export function updateDailyLives(puzzleDate: string, livesRemaining: number): void {
  const existing = getDailyState(puzzleDate);
  setDailyState({
    puzzleDate,
    livesRemaining,
    status: existing?.status ?? 'in_progress',
  });
}

/**
 * Convenience: lock the puzzle as won or lost. Lives are persisted at
 * whatever value they hold at the moment of completion.
 */
export function lockDailyOutcome(puzzleDate: string, status: 'won' | 'lost', livesRemaining: number): void {
  setDailyState({
    puzzleDate,
    livesRemaining,
    status,
  });
}

/**
 * Wipe state. Mostly for tests / dev tooling. Day rollover handles the normal
 * stale-state case implicitly via the date check in `getDailyState`.
 */
export function clearDailyState(): void {
  try {
    localStorage.removeItem(DAILY_STATE_KEY);
  } catch {
    // ditto
  }
}
