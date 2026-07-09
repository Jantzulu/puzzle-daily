import { describe, it, expect } from 'vitest';
import {
  validateCompletion,
  buildCompletionRow,
  type PuzzleLimits,
} from '../../../supabase/functions/submit-completion/validate';

// Base victory submission whose breakdown sums to its total (2000 + 300 +
// (-100) + 50 + 0 = 2250).
const victory = () => ({
  playerId: 'p-1',
  puzzleId: 'puz-1',
  outcome: 'victory',
  charactersUsed: 2,
  characterIds: ['hero-a', 'hero-b'],
  turnsUsed: 12,
  livesRemaining: 2,
  score: {
    rank: 'gold',
    totalPoints: 2250,
    breakdown: { basePoints: 2000, characterBonus: 300, turnBonus: -100, livesBonus: 50, sideQuestPoints: 0 },
    completedSideQuests: [],
    parMet: { characters: true, turns: false },
  },
});

const defeat = () => ({
  playerId: 'p-1',
  puzzleId: 'puz-1',
  outcome: 'defeat',
  charactersUsed: 1,
  characterIds: ['hero-a'],
  turnsUsed: 8,
  defeatReason: 'damage',
  defeatTurn: 8,
});

const puzzle: PuzzleLimits = {
  maxTurns: 100,
  maxCharacters: 3,
  maxPlaceableCharacters: 2,
  availableCharacters: ['hero-a', 'hero-b', 'hero-c'],
};

describe('validateCompletion', () => {
  it('accepts a coherent victory (incl. negative turnBonus)', () => {
    expect(validateCompletion(victory(), puzzle)).toBeNull();
  });

  it('accepts a coherent defeat', () => {
    expect(validateCompletion(defeat(), puzzle)).toBeNull();
  });

  it('rejects a fabricated total that does not match the breakdown', () => {
    const s = victory();
    s.score.totalPoints = 99999; // breakdown still sums to 2250
    expect(validateCompletion(s, puzzle)).toMatch(/breakdown sum/);
  });

  it('rejects a victory with no score', () => {
    const s = victory() as Record<string, unknown>;
    delete s.score;
    expect(validateCompletion(s, puzzle)).toBe('victory without score');
  });

  it('rejects an invalid rank', () => {
    const s = victory();
    (s.score as { rank: string }).rank = 'platinum';
    expect(validateCompletion(s, puzzle)).toBe('bad rank');
  });

  it('rejects more heroes than the puzzle allows', () => {
    const s = victory();
    s.charactersUsed = 3;
    s.characterIds = ['hero-a', 'hero-b', 'hero-c'];
    expect(validateCompletion(s, puzzle)).toBe('charactersUsed exceeds puzzle limit');
  });

  it('rejects a hero not available in the puzzle', () => {
    const s = victory();
    s.characterIds = ['hero-a', 'hero-z'];
    expect(validateCompletion(s, puzzle)).toBe('hero not available in this puzzle');
  });

  it('rejects turns beyond the puzzle limit', () => {
    const s = defeat();
    s.turnsUsed = 150; // within global 200, over the puzzle's 100
    expect(validateCompletion(s, puzzle)).toBe('turnsUsed exceeds puzzle limit');
  });

  it('rejects characterIds length that disagrees with charactersUsed', () => {
    const s = victory();
    s.characterIds = ['hero-a']; // says 2 used
    expect(validateCompletion(s, puzzle)).toMatch(/characterIds length/);
  });

  it('rejects out-of-range turns', () => {
    const s = defeat();
    s.turnsUsed = 999;
    expect(validateCompletion(s, null)).toBe('turnsUsed out of range');
  });

  it('rejects a missing playerId', () => {
    const s = victory() as Record<string, unknown>;
    delete s.playerId;
    expect(validateCompletion(s, puzzle)).toBe('missing playerId');
  });

  it('skips puzzle-limit checks when the puzzle is unknown (still structural)', () => {
    const s = victory();
    s.charactersUsed = 5; // would exceed the puzzle limit, but no puzzle given
    s.characterIds = ['a', 'b', 'c', 'd', 'e'];
    expect(validateCompletion(s, null)).toBeNull();
  });
});

describe('buildCompletionRow', () => {
  it('clamps a negative turnBonus to 0 for storage but keeps the real total', () => {
    const row = buildCompletionRow(victory(), 'user-9');
    expect(row.turn_bonus).toBe(0);          // negative → 0 (matches DB CHECK)
    expect(row.total_points).toBe(2250);     // real total preserved
    expect(row.user_id).toBe('user-9');      // server-derived, not client-sent
    expect(row.rank).toBe('gold');
  });

  it('omits victory-only fields on a defeat row', () => {
    const row = buildCompletionRow(defeat(), null);
    expect(row.rank).toBeUndefined();
    expect(row.outcome).toBe('defeat');
    expect(row.defeat_reason).toBe('damage');
  });
});
