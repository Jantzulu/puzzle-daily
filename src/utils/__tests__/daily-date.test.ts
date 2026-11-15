import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDailyState, lockDailyOutcome, withDailyDate } from '../dailyState';
import { getTodaysPuzzle } from '../../data/puzzles';
import { localDateKey } from '../localDate';

// A daily belongs to the day it is SCHEDULED for (user decision 2026-11-15).
// A puzzle's stored `date` is only the day it was made in the editor; keyed
// by that, two puzzles made on the same day shared one daily lock.

describe('a daily puzzle carries its scheduled day', () => {
  // The tests run without a browser: a plain in-memory stand-in for storage.
  beforeEach(() => {
    const kept = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => kept.get(k) ?? null,
      setItem: (k: string, v: string) => { kept.set(k, v); },
      removeItem: (k: string) => { kept.delete(k); },
      clear: () => kept.clear(),
    });
  });

  it('withDailyDate replaces the made-on date with the scheduled day', () => {
    const made = { id: 'p1', date: '2026-03-05', name: 'First' };
    const served = withDailyDate(made, '2026-12-01');
    expect(served.date).toBe('2026-12-01');
    expect(served.id).toBe('p1');
    expect(made.date).toBe('2026-03-05'); // the stored puzzle is not touched
  });

  it('leaves a puzzle alone when there is no scheduled day', () => {
    const made = { id: 'p1', date: '2026-03-05' };
    expect(withDailyDate(made, null)).toBe(made);
    expect(withDailyDate(made, undefined)).toBe(made);
  });

  it('two puzzles made on the same day no longer share a lock', () => {
    // Both made on 2026-03-05, scheduled a day apart.
    const first = withDailyDate({ id: 'p1', date: '2026-03-05' }, '2026-12-01');
    const second = withDailyDate({ id: 'p2', date: '2026-03-05' }, '2026-12-02');
    lockDailyOutcome(first.date, 'won', 2);
    expect(getDailyState(first.date)?.status).toBe('won');
    // The next day's puzzle starts fresh. Keyed by the made-on date it would
    // have arrived already "won".
    expect(getDailyState(second.date)).toBeNull();
  });

  it("the built-in fallback puzzle stands in for today's daily", () => {
    expect(getTodaysPuzzle().date).toBe(localDateKey());
  });
});
