/**
 * Local-calendar date helpers for the daily puzzle.
 *
 * The daily rolls over at the PLAYER'S local midnight (Wordle-style): the
 * schedule row a player sees is chosen by their local calendar date, so
 * players in different timezones can be a day apart — that's intended.
 * Everything that answers "what day is it for the daily?" must go through
 * localDateKey so the fetch, the same-day cache, and the countdown all agree.
 */

/** YYYY-MM-DD in the player's local timezone. */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Milliseconds from `from` until the next local midnight. */
export function msUntilNextLocalMidnight(from: Date = new Date()): number {
  const nextMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  return nextMidnight.getTime() - from.getTime();
}
