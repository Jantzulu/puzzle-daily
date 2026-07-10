import { describe, it, expect } from 'vitest';
import { localDateKey, msUntilNextLocalMidnight } from '../localDate';

describe('localDateKey', () => {
  it('formats as YYYY-MM-DD with zero padding', () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(localDateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('uses the local calendar date, not UTC', () => {
    // 23:30 local on Jan 5 — UTC may already be Jan 6 in negative-offset
    // timezones, but the key must stay on the local day.
    expect(localDateKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});

describe('msUntilNextLocalMidnight', () => {
  it('is exactly 24h at midnight', () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 0, 5, 0, 0, 0, 0))).toBe(24 * 3600 * 1000);
  });

  it('is 1s at 23:59:59', () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 0, 5, 23, 59, 59, 0))).toBe(1000);
  });

  it('crosses month and year boundaries', () => {
    const nye = new Date(2026, 11, 31, 23, 0, 0, 0);
    expect(msUntilNextLocalMidnight(nye)).toBe(3600 * 1000);
    expect(localDateKey(new Date(nye.getTime() + 3600 * 1000))).toBe('2027-01-01');
  });
});
