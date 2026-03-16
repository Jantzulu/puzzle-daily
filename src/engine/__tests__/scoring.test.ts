/**
 * Tests for src/engine/scoring.ts — score calculation, rankings, side quests.
 * No external mocking needed; scoring operates on pure GameState data.
 */
import { Direction, ActionType } from '../../types/game';
import type { GameState, Puzzle, PlacedCharacter, SideQuest, PuzzleScore } from '../../types/game';
import {
  calculateScore,
  checkSideQuests,
  getRankEmoji,
  getRankName,
  formatScoreForSharing,
} from '../scoring';

// ==========================================
// HELPERS
// ==========================================

function makePuzzle(overrides?: Partial<Puzzle>): Puzzle {
  return {
    id: 'p1',
    date: '2026-01-01',
    name: 'Test',
    width: 5,
    height: 5,
    tiles: [],
    enemies: [],
    collectibles: [],
    availableCharacters: ['hero-1'],
    winConditions: [{ type: 'defeat_all_enemies' }],
    maxCharacters: 3,
    ...overrides,
  };
}

function makeChar(overrides?: Partial<PlacedCharacter>): PlacedCharacter {
  return {
    characterId: 'hero-1',
    x: 0, y: 0,
    facing: Direction.EAST,
    currentHealth: 10,
    actionIndex: 0,
    active: true,
    dead: false,
    ...overrides,
  } as PlacedCharacter;
}

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    puzzle: makePuzzle(),
    placedCharacters: [makeChar()],
    currentTurn: 5,
    simulationRunning: false,
    gameStatus: 'victory',
    score: 0,
    activeProjectiles: [],
    activeParticles: [],
    persistentAreaEffects: [],
    tileStates: new Map(),
    ...overrides,
  };
}

// ==========================================
// calculateScore — Rank logic
// ==========================================
describe('calculateScore', () => {
  describe('rank determination', () => {
    it('Gold when both pars met and no lives lost', () => {
      const gs = makeState({
        puzzle: makePuzzle({ parCharacters: 2, parTurns: 10 }),
        placedCharacters: [makeChar(), makeChar({ characterId: 'hero-2' })],
        currentTurn: 8,
      });
      const score = calculateScore(gs, 3, 3);
      expect(score.rank).toBe('gold');
    });

    it('Silver when both pars met but lives lost', () => {
      const gs = makeState({
        puzzle: makePuzzle({ parCharacters: 2, parTurns: 10 }),
        placedCharacters: [makeChar(), makeChar({ characterId: 'hero-2' })],
        currentTurn: 8,
      });
      const score = calculateScore(gs, 2, 3);
      expect(score.rank).toBe('silver');
    });

    it('Silver when only char par met', () => {
      const gs = makeState({
        puzzle: makePuzzle({ parCharacters: 2, parTurns: 5 }),
        placedCharacters: [makeChar()],
        currentTurn: 10,
      });
      const score = calculateScore(gs, 3, 3);
      expect(score.rank).toBe('silver');
    });

    it('Silver when only turn par met', () => {
      const gs = makeState({
        puzzle: makePuzzle({ parCharacters: 1, parTurns: 10 }),
        placedCharacters: [makeChar(), makeChar({ characterId: 'hero-2' })],
        currentTurn: 8,
      });
      const score = calculateScore(gs, 3, 3);
      expect(score.rank).toBe('silver');
    });

    it('Bronze when no pars met', () => {
      const gs = makeState({
        puzzle: makePuzzle({ parCharacters: 1, parTurns: 3 }),
        placedCharacters: [makeChar(), makeChar({ characterId: 'hero-2' })],
        currentTurn: 10,
      });
      const score = calculateScore(gs, 3, 3);
      expect(score.rank).toBe('bronze');
    });

    it('Gold when no pars are set (defaults to met)', () => {
      const gs = makeState({
        puzzle: makePuzzle(), // no parCharacters or parTurns
      });
      const score = calculateScore(gs, 3, 3);
      expect(score.rank).toBe('gold');
    });
  });

  describe('point calculation', () => {
    it('base points = 1000', () => {
      const gs = makeState({ puzzle: makePuzzle() });
      const score = calculateScore(gs, 0, 0);
      expect(score.breakdown.basePoints).toBe(1000);
    });

    it('character bonus: 200 per character under par', () => {
      const gs = makeState({
        puzzle: makePuzzle({ parCharacters: 3 }),
        placedCharacters: [makeChar()], // 1 char, par 3 → 2 under
      });
      const score = calculateScore(gs, 0, 0);
      expect(score.breakdown.characterBonus).toBe(400);
    });

    it('character penalty: -100 per character over par', () => {
      const gs = makeState({
        puzzle: makePuzzle({ parCharacters: 1 }),
        placedCharacters: [makeChar(), makeChar({ characterId: 'h2' }), makeChar({ characterId: 'h3' })],
      });
      const score = calculateScore(gs, 0, 0);
      expect(score.breakdown.characterBonus).toBe(-200);
    });

    it('turn bonus: 25 per turn under par', () => {
      const gs = makeState({
        puzzle: makePuzzle({ parTurns: 10 }),
        currentTurn: 7, // 3 under
      });
      const score = calculateScore(gs, 0, 0);
      expect(score.breakdown.turnBonus).toBe(75);
    });

    it('turn penalty: -15 per turn over par', () => {
      const gs = makeState({
        puzzle: makePuzzle({ parTurns: 5 }),
        currentTurn: 8, // 3 over
      });
      const score = calculateScore(gs, 0, 0);
      expect(score.breakdown.turnBonus).toBe(-45);
    });

    it('lives bonus: 100 per remaining life', () => {
      const gs = makeState({ puzzle: makePuzzle() });
      const score = calculateScore(gs, 2, 3);
      expect(score.breakdown.livesBonus).toBe(200);
    });

    it('totalPoints sums all components', () => {
      const gs = makeState({
        puzzle: makePuzzle({ parCharacters: 2, parTurns: 10 }),
        placedCharacters: [makeChar()], // 1 under char par → +200
        currentTurn: 8,                  // 2 under turn par → +50
      });
      const score = calculateScore(gs, 2, 3); // 2 lives → +200
      // 1000 + 200 + 50 + 200 = 1450
      expect(score.totalPoints).toBe(1450);
    });

    it('no bonus/penalty when par not set', () => {
      const gs = makeState({ puzzle: makePuzzle() }); // no pars
      const score = calculateScore(gs, 0, 0);
      expect(score.breakdown.characterBonus).toBe(0);
      expect(score.breakdown.turnBonus).toBe(0);
    });
  });

  describe('side quest points', () => {
    it('adds bonus points for completed side quests', () => {
      const quests: SideQuest[] = [
        { id: 'sq1', type: 'no_deaths', title: 'No deaths', bonusPoints: 150 },
      ];
      const gs = makeState({
        puzzle: makePuzzle({ sideQuests: quests }),
        placedCharacters: [makeChar({ dead: false })],
      });
      const score = calculateScore(gs, 0, 0);
      expect(score.breakdown.sideQuestPoints).toBe(150);
      expect(score.completedSideQuests).toContain('sq1');
    });

    it('no points for failed side quests', () => {
      const quests: SideQuest[] = [
        { id: 'sq1', type: 'no_deaths', title: 'No deaths', bonusPoints: 150 },
      ];
      const gs = makeState({
        puzzle: makePuzzle({ sideQuests: quests }),
        placedCharacters: [makeChar({ dead: true })],
      });
      const score = calculateScore(gs, 0, 0);
      expect(score.breakdown.sideQuestPoints).toBe(0);
    });
  });

  describe('stats tracking', () => {
    it('tracks characters used', () => {
      const gs = makeState({
        placedCharacters: [makeChar(), makeChar({ characterId: 'h2' })],
      });
      const score = calculateScore(gs, 1, 3);
      expect(score.stats.charactersUsed).toBe(2);
    });

    it('tracks turns used', () => {
      const gs = makeState({ currentTurn: 12 });
      const score = calculateScore(gs, 1, 3);
      expect(score.stats.turnsUsed).toBe(12);
    });

    it('tracks lives remaining', () => {
      const gs = makeState();
      const score = calculateScore(gs, 2, 3);
      expect(score.stats.livesRemaining).toBe(2);
    });
  });
});

// ==========================================
// checkSideQuests
// ==========================================
describe('checkSideQuests', () => {
  it('collect_all_items — all collected', () => {
    const gs = makeState({
      puzzle: makePuzzle({
        collectibles: [
          { x: 0, y: 0, collected: true },
          { x: 1, y: 1, collected: true },
        ],
        sideQuests: [{ id: 'sq1', type: 'collect_all_items', title: 'Collect all', bonusPoints: 100 }],
      }),
    });
    expect(checkSideQuests(gs)).toContain('sq1');
  });

  it('collect_all_items — not all collected', () => {
    const gs = makeState({
      puzzle: makePuzzle({
        collectibles: [
          { x: 0, y: 0, collected: true },
          { x: 1, y: 1, collected: false },
        ],
        sideQuests: [{ id: 'sq1', type: 'collect_all_items', title: 'Collect all', bonusPoints: 100 }],
      }),
    });
    expect(checkSideQuests(gs)).not.toContain('sq1');
  });

  it('no_damage_taken — all at max health', () => {
    const gs = makeState({
      puzzle: makePuzzle({
        sideQuests: [{ id: 'sq1', type: 'no_damage_taken', title: 'Untouched', bonusPoints: 100 }],
      }),
      placedCharacters: [makeChar({ currentHealth: 10, maxHealth: 10 } as any)],
    });
    expect(checkSideQuests(gs)).toContain('sq1');
  });

  it('no_damage_taken — character took damage', () => {
    const gs = makeState({
      puzzle: makePuzzle({
        sideQuests: [{ id: 'sq1', type: 'no_damage_taken', title: 'Untouched', bonusPoints: 100 }],
      }),
      placedCharacters: [makeChar({ currentHealth: 7, maxHealth: 10 } as any)],
    });
    expect(checkSideQuests(gs)).not.toContain('sq1');
  });

  it('use_specific_character — character present', () => {
    const gs = makeState({
      puzzle: makePuzzle({
        sideQuests: [{
          id: 'sq1', type: 'use_specific_character', title: 'Use Knight', bonusPoints: 100,
          params: { characterId: 'hero-1' },
        }],
      }),
      placedCharacters: [makeChar({ characterId: 'hero-1' })],
    });
    expect(checkSideQuests(gs)).toContain('sq1');
  });

  it('use_specific_character — character absent', () => {
    const gs = makeState({
      puzzle: makePuzzle({
        sideQuests: [{
          id: 'sq1', type: 'use_specific_character', title: 'Use Knight', bonusPoints: 100,
          params: { characterId: 'hero-2' },
        }],
      }),
      placedCharacters: [makeChar({ characterId: 'hero-1' })],
    });
    expect(checkSideQuests(gs)).not.toContain('sq1');
  });

  it('avoid_character — character absent (pass)', () => {
    const gs = makeState({
      puzzle: makePuzzle({
        sideQuests: [{
          id: 'sq1', type: 'avoid_character', title: 'No mage', bonusPoints: 100,
          params: { characterId: 'mage-1' },
        }],
      }),
      placedCharacters: [makeChar({ characterId: 'hero-1' })],
    });
    expect(checkSideQuests(gs)).toContain('sq1');
  });

  it('avoid_character — character present (fail)', () => {
    const gs = makeState({
      puzzle: makePuzzle({
        sideQuests: [{
          id: 'sq1', type: 'avoid_character', title: 'No mage', bonusPoints: 100,
          params: { characterId: 'hero-1' },
        }],
      }),
      placedCharacters: [makeChar({ characterId: 'hero-1' })],
    });
    expect(checkSideQuests(gs)).not.toContain('sq1');
  });

  it('speed_run — under turn limit', () => {
    const gs = makeState({
      puzzle: makePuzzle({
        sideQuests: [{
          id: 'sq1', type: 'speed_run', title: 'Fast', bonusPoints: 100,
          params: { turns: 5 },
        }],
      }),
      currentTurn: 3,
    });
    expect(checkSideQuests(gs)).toContain('sq1');
  });

  it('speed_run — over turn limit', () => {
    const gs = makeState({
      puzzle: makePuzzle({
        sideQuests: [{
          id: 'sq1', type: 'speed_run', title: 'Fast', bonusPoints: 100,
          params: { turns: 5 },
        }],
      }),
      currentTurn: 8,
    });
    expect(checkSideQuests(gs)).not.toContain('sq1');
  });

  it('minimalist — at or under character count', () => {
    const gs = makeState({
      puzzle: makePuzzle({
        sideQuests: [{
          id: 'sq1', type: 'minimalist', title: 'Solo', bonusPoints: 100,
          params: { characterCount: 1 },
        }],
      }),
      placedCharacters: [makeChar()],
    });
    expect(checkSideQuests(gs)).toContain('sq1');
  });

  it('minimalist — over character count', () => {
    const gs = makeState({
      puzzle: makePuzzle({
        sideQuests: [{
          id: 'sq1', type: 'minimalist', title: 'Solo', bonusPoints: 100,
          params: { characterCount: 1 },
        }],
      }),
      placedCharacters: [makeChar(), makeChar({ characterId: 'h2' })],
    });
    expect(checkSideQuests(gs)).not.toContain('sq1');
  });

  it('no_deaths — all alive', () => {
    const gs = makeState({
      puzzle: makePuzzle({
        sideQuests: [{ id: 'sq1', type: 'no_deaths', title: 'Survive', bonusPoints: 100 }],
      }),
      placedCharacters: [makeChar({ dead: false })],
    });
    expect(checkSideQuests(gs)).toContain('sq1');
  });

  it('no_deaths — one dead', () => {
    const gs = makeState({
      puzzle: makePuzzle({
        sideQuests: [{ id: 'sq1', type: 'no_deaths', title: 'Survive', bonusPoints: 100 }],
      }),
      placedCharacters: [makeChar({ dead: false }), makeChar({ characterId: 'h2', dead: true })],
    });
    expect(checkSideQuests(gs)).not.toContain('sq1');
  });

  it('custom quests always return false', () => {
    const gs = makeState({
      puzzle: makePuzzle({
        sideQuests: [{ id: 'sq1', type: 'custom', title: 'Custom', bonusPoints: 100 }],
      }),
    });
    expect(checkSideQuests(gs)).not.toContain('sq1');
  });

  it('no side quests → empty array', () => {
    const gs = makeState({ puzzle: makePuzzle() });
    expect(checkSideQuests(gs)).toEqual([]);
  });
});

// ==========================================
// getRankEmoji / getRankName
// ==========================================
describe('getRankEmoji', () => {
  it.each([
    ['gold', '🏆'],
    ['silver', '🥈'],
    ['bronze', '🥉'],
  ] as const)('%s → %s', (rank, emoji) => {
    expect(getRankEmoji(rank)).toBe(emoji);
  });
});

describe('getRankName', () => {
  it.each([
    ['gold', 'Gold Trophy'],
    ['silver', 'Silver Trophy'],
    ['bronze', 'Bronze Trophy'],
  ] as const)('%s → %s', (rank, name) => {
    expect(getRankName(rank)).toBe(name);
  });
});

// ==========================================
// formatScoreForSharing
// ==========================================
describe('formatScoreForSharing', () => {
  it('formats a gold score correctly', () => {
    const score: PuzzleScore = {
      rank: 'gold',
      totalPoints: 1450,
      breakdown: { basePoints: 1000, characterBonus: 200, turnBonus: 50, livesBonus: 200, sideQuestPoints: 0 },
      completedSideQuests: [],
      parMet: { characters: true, turns: true },
      stats: { charactersUsed: 1, turnsUsed: 8, livesRemaining: 2 },
    };
    const result = formatScoreForSharing(score, 'My Puzzle');
    expect(result).toContain('🏆');
    expect(result).toContain('Gold Trophy');
    expect(result).toContain('1 char');
    expect(result).toContain('8 turns');
    expect(result).toContain('1450 pts');
    expect(result).toContain('"My Puzzle"');
  });

  it('pluralizes characters and turns', () => {
    const score: PuzzleScore = {
      rank: 'bronze',
      totalPoints: 1000,
      breakdown: { basePoints: 1000, characterBonus: 0, turnBonus: 0, livesBonus: 0, sideQuestPoints: 0 },
      completedSideQuests: [],
      parMet: { characters: false, turns: false },
      stats: { charactersUsed: 3, turnsUsed: 1, livesRemaining: 0 },
    };
    const result = formatScoreForSharing(score, 'Hard Puzzle');
    expect(result).toContain('3 chars');
    expect(result).toContain('1 turn');
  });
});
