/**
 * Tests for src/engine/simulation.ts — game state lifecycle, turn execution,
 * victory conditions.
 * Uses module mocks from helpers.ts.
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestCharacter as regChar,
  registerTestEnemy as regEnemy,
  registerTestCollectible as regCollectible,
  createEmptyGrid,
  createTestPuzzle,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestCharacter,
  createTestEnemy,
  createTestCollectible,
  createTestGameState,
  setTile,
} from './helpers';
import { Direction, TileType, ActionType } from '../../types/game';
import {
  initializeGameState,
  executeTurn,
  resetGameState,
  checkVictoryConditions,
  canEntityAct,
  canEntityMove,
  hasHasteBonus,
  wakeFromSleep,
} from '../simulation';
import { StatusEffectType } from '../../types/game';

beforeEach(() => {
  clearAllRegistries();
  regChar(createTestCharacterDef());
  regEnemy(createTestEnemyDef());
});

// ==========================================
// initializeGameState
// ==========================================
describe('initializeGameState', () => {
  it('sets gameStatus to setup', () => {
    const puzzle = createTestPuzzle();
    const gs = initializeGameState(puzzle);
    expect(gs.gameStatus).toBe('setup');
  });

  it('starts at turn 0', () => {
    const gs = initializeGameState(createTestPuzzle());
    expect(gs.currentTurn).toBe(0);
  });

  it('resets all enemies to alive with full health', () => {
    const puzzle = createTestPuzzle({
      enemies: [createTestEnemy({ dead: true, currentHealth: 0 })],
    });
    const gs = initializeGameState(puzzle);
    expect(gs.puzzle.enemies[0].dead).toBe(false);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(5); // from registered enemy def
  });

  it('resets collectibles to uncollected', () => {
    const puzzle = createTestPuzzle({
      collectibles: [createTestCollectible({ collected: true })],
    });
    const gs = initializeGameState(puzzle);
    expect(gs.puzzle.collectibles[0].collected).toBe(false);
  });

  it('starts with no placed characters', () => {
    const gs = initializeGameState(createTestPuzzle());
    expect(gs.placedCharacters).toEqual([]);
  });

  it('initializes empty projectile/particle arrays', () => {
    const gs = initializeGameState(createTestPuzzle());
    expect(gs.activeProjectiles).toEqual([]);
    expect(gs.activeParticles).toEqual([]);
    expect(gs.persistentAreaEffects).toEqual([]);
  });
});

// ==========================================
// resetGameState
// ==========================================
describe('resetGameState', () => {
  it('produces a fresh state identical to initializeGameState', () => {
    const puzzle = createTestPuzzle({
      enemies: [createTestEnemy({ currentHealth: 1, dead: true })],
    });
    const gs = initializeGameState(puzzle);
    gs.currentTurn = 10;
    gs.gameStatus = 'victory';

    const reset = resetGameState(gs, puzzle);
    expect(reset.currentTurn).toBe(0);
    expect(reset.gameStatus).toBe('setup');
    expect(reset.puzzle.enemies[0].dead).toBe(false);
  });
});

// ==========================================
// executeTurn
// ==========================================
describe('executeTurn', () => {
  it('does not execute if game is not running', () => {
    const gs = createTestGameState({ gameStatus: 'setup', currentTurn: 0 });
    const result = executeTurn(gs);
    expect(result.currentTurn).toBe(0); // did not increment
  });

  it('increments currentTurn', () => {
    const charDef = createTestCharacterDef({
      behavior: [{ type: ActionType.WAIT }],
    });
    regChar(charDef);

    const gs = createTestGameState({
      gameStatus: 'running',
      currentTurn: 0,
      placedCharacters: [createTestCharacter({ active: true })],
    });

    const result = executeTurn(gs);
    expect(result.currentTurn).toBe(1);
  });

  it('moves character according to its behavior', () => {
    const charDef = createTestCharacterDef({
      behavior: [{ type: ActionType.MOVE_FORWARD }],
    });
    regChar(charDef);

    const gs = createTestGameState({
      puzzle: createTestPuzzle(),
      gameStatus: 'running',
      currentTurn: 0,
      placedCharacters: [createTestCharacter({ x: 0, y: 0, facing: Direction.EAST, actionIndex: 0, active: true })],
    });

    executeTurn(gs);
    expect(gs.placedCharacters[0].x).toBe(1);
  });

  it('deactivates character when no more actions', () => {
    const charDef = createTestCharacterDef({
      behavior: [{ type: ActionType.MOVE_FORWARD }],
    });
    regChar(charDef);

    // Use survive_turns so game doesn't auto-win with no enemies
    const gs = createTestGameState({
      puzzle: createTestPuzzle({
        winConditions: [{ type: 'survive_turns', params: { turns: 99 } }],
      }),
      gameStatus: 'running',
      currentTurn: 0,
      placedCharacters: [createTestCharacter({ x: 0, y: 0, facing: Direction.EAST, actionIndex: 0, active: true })],
    });

    // Turn 1: executes MOVE_FORWARD, advances actionIndex to 1
    executeTurn(gs);
    // Turn 2: no action at index 1, should deactivate
    executeTurn(gs);
    expect(gs.placedCharacters[0].active).toBe(false);
  });

  it('REPEAT loops back to first action', () => {
    const charDef = createTestCharacterDef({
      behavior: [
        { type: ActionType.MOVE_FORWARD },
        { type: ActionType.REPEAT },
      ],
    });
    regChar(charDef);

    // Use survive_turns so game doesn't auto-win with no enemies
    const gs = createTestGameState({
      puzzle: createTestPuzzle({
        width: 10,
        height: 5,
        winConditions: [{ type: 'survive_turns', params: { turns: 99 } }],
      }),
      gameStatus: 'running',
      currentTurn: 0,
      placedCharacters: [createTestCharacter({ x: 0, y: 0, facing: Direction.EAST, actionIndex: 0, active: true })],
    });

    executeTurn(gs); // move to x=1
    executeTurn(gs); // REPEAT → loops back, executes move → x=2
    executeTurn(gs); // move to x=3
    expect(gs.placedCharacters[0].x).toBe(3);
    expect(gs.placedCharacters[0].active).toBe(true);
  });
});

// ==========================================
// checkVictoryConditions
// ==========================================
describe('checkVictoryConditions', () => {
  describe('defeat_all_enemies', () => {
    it('true when all enemies are dead', () => {
      const gs = createTestGameState({
        puzzle: createTestPuzzle({
          winConditions: [{ type: 'defeat_all_enemies' }],
          enemies: [
            createTestEnemy({ dead: true }),
            createTestEnemy({ enemyId: 'goblin-2', dead: true }),
          ],
        }),
      });
      expect(checkVictoryConditions(gs)).toBe(true);
    });

    it('false when an enemy is alive', () => {
      const gs = createTestGameState({
        puzzle: createTestPuzzle({
          winConditions: [{ type: 'defeat_all_enemies' }],
          enemies: [
            createTestEnemy({ dead: true }),
            createTestEnemy({ enemyId: 'goblin-2', dead: false }),
          ],
        }),
      });
      expect(checkVictoryConditions(gs)).toBe(false);
    });
  });

  describe('collect_all', () => {
    it('true when all collectibles collected', () => {
      const gs = createTestGameState({
        puzzle: createTestPuzzle({
          winConditions: [{ type: 'collect_all' }],
          collectibles: [
            createTestCollectible({ collected: true }),
            createTestCollectible({ x: 3, y: 3, collected: true }),
          ],
        }),
      });
      expect(checkVictoryConditions(gs)).toBe(true);
    });

    it('false when a collectible remains', () => {
      const gs = createTestGameState({
        puzzle: createTestPuzzle({
          winConditions: [{ type: 'collect_all' }],
          collectibles: [
            createTestCollectible({ collected: true }),
            createTestCollectible({ x: 3, y: 3, collected: false }),
          ],
        }),
      });
      expect(checkVictoryConditions(gs)).toBe(false);
    });
  });

  describe('reach_goal', () => {
    it('true when a living character is on a GOAL tile', () => {
      const grid = createEmptyGrid(5, 5);
      setTile(grid, 2, 2, TileType.GOAL);
      const gs = createTestGameState({
        puzzle: createTestPuzzle({
          tiles: grid,
          winConditions: [{ type: 'reach_goal' }],
        }),
        placedCharacters: [createTestCharacter({ x: 2, y: 2, dead: false })],
      });
      expect(checkVictoryConditions(gs)).toBe(true);
    });

    it('false when character is on EMPTY tile', () => {
      const gs = createTestGameState({
        puzzle: createTestPuzzle({
          winConditions: [{ type: 'reach_goal' }],
        }),
        placedCharacters: [createTestCharacter({ x: 0, y: 0 })],
      });
      expect(checkVictoryConditions(gs)).toBe(false);
    });

    it('false when dead character is on goal', () => {
      const grid = createEmptyGrid(5, 5);
      setTile(grid, 2, 2, TileType.GOAL);
      const gs = createTestGameState({
        puzzle: createTestPuzzle({
          tiles: grid,
          winConditions: [{ type: 'reach_goal' }],
        }),
        placedCharacters: [createTestCharacter({ x: 2, y: 2, dead: true })],
      });
      expect(checkVictoryConditions(gs)).toBe(false);
    });
  });

  describe('survive_turns', () => {
    it('true when turn count >= required and character alive', () => {
      const gs = createTestGameState({
        puzzle: createTestPuzzle({
          winConditions: [{ type: 'survive_turns', params: { turns: 5 } }],
        }),
        currentTurn: 5,
        placedCharacters: [createTestCharacter({ dead: false })],
      });
      expect(checkVictoryConditions(gs)).toBe(true);
    });

    it('false when turns not yet reached', () => {
      const gs = createTestGameState({
        puzzle: createTestPuzzle({
          winConditions: [{ type: 'survive_turns', params: { turns: 5 } }],
        }),
        currentTurn: 3,
        placedCharacters: [createTestCharacter({ dead: false })],
      });
      expect(checkVictoryConditions(gs)).toBe(false);
    });
  });

  describe('win_in_turns', () => {
    it('true when within turn limit', () => {
      const gs = createTestGameState({
        puzzle: createTestPuzzle({
          winConditions: [{ type: 'win_in_turns', params: { turns: 10 } }],
        }),
        currentTurn: 8,
      });
      expect(checkVictoryConditions(gs)).toBe(true);
    });

    it('false when over turn limit', () => {
      const gs = createTestGameState({
        puzzle: createTestPuzzle({
          winConditions: [{ type: 'win_in_turns', params: { turns: 10 } }],
        }),
        currentTurn: 11,
      });
      expect(checkVictoryConditions(gs)).toBe(false);
    });
  });

  describe('multiple conditions (AND)', () => {
    it('true only when ALL conditions met', () => {
      const gs = createTestGameState({
        puzzle: createTestPuzzle({
          winConditions: [
            { type: 'defeat_all_enemies' },
            { type: 'win_in_turns', params: { turns: 10 } },
          ],
          enemies: [createTestEnemy({ dead: true })],
        }),
        currentTurn: 5,
      });
      expect(checkVictoryConditions(gs)).toBe(true);
    });

    it('false when one condition fails', () => {
      const gs = createTestGameState({
        puzzle: createTestPuzzle({
          winConditions: [
            { type: 'defeat_all_enemies' },
            { type: 'win_in_turns', params: { turns: 10 } },
          ],
          enemies: [createTestEnemy({ dead: false })],
        }),
        currentTurn: 5,
      });
      expect(checkVictoryConditions(gs)).toBe(false);
    });
  });

  describe('max_characters', () => {
    it('true when under character limit', () => {
      const gs = createTestGameState({
        puzzle: createTestPuzzle({
          winConditions: [{ type: 'max_characters', params: { characterCount: 2 } }],
        }),
        placedCharacters: [createTestCharacter()],
      });
      expect(checkVictoryConditions(gs)).toBe(true);
    });

    it('false when over character limit', () => {
      const gs = createTestGameState({
        puzzle: createTestPuzzle({
          winConditions: [{ type: 'max_characters', params: { characterCount: 1 } }],
        }),
        placedCharacters: [createTestCharacter(), createTestCharacter({ characterId: 'h2' })],
      });
      expect(checkVictoryConditions(gs)).toBe(false);
    });
  });

  describe('characters_alive', () => {
    it('true when enough characters alive', () => {
      const gs = createTestGameState({
        puzzle: createTestPuzzle({
          winConditions: [{ type: 'characters_alive', params: { characterCount: 2 } }],
        }),
        placedCharacters: [
          createTestCharacter({ dead: false }),
          createTestCharacter({ characterId: 'h2', dead: false }),
        ],
      });
      expect(checkVictoryConditions(gs)).toBe(true);
    });

    it('false when too many characters dead', () => {
      const gs = createTestGameState({
        puzzle: createTestPuzzle({
          winConditions: [{ type: 'characters_alive', params: { characterCount: 2 } }],
        }),
        placedCharacters: [
          createTestCharacter({ dead: false }),
          createTestCharacter({ characterId: 'h2', dead: true }),
        ],
      });
      expect(checkVictoryConditions(gs)).toBe(false);
    });
  });
});

// ==========================================
// canEntityAct / canEntityMove / hasHasteBonus
// ==========================================
describe('canEntityAct', () => {
  it('returns allowed=true for entity with no effects', () => {
    const char = createTestCharacter();
    expect(canEntityAct(char).allowed).toBe(true);
  });

  it('returns allowed=false for stunned entity', () => {
    const char = createTestCharacter({
      statusEffects: [{
        id: 's1',
        type: StatusEffectType.STUN,
        statusAssetId: 'stun-asset',
        duration: 2,
        appliedOnTurn: 0,
      }],
    });
    expect(canEntityAct(char).allowed).toBe(false);
  });

  it('returns allowed=false for sleeping entity', () => {
    const char = createTestCharacter({
      statusEffects: [{
        id: 's1',
        type: StatusEffectType.SLEEP,
        statusAssetId: 'sleep-asset',
        duration: 2,
        appliedOnTurn: 0,
      }],
    });
    expect(canEntityAct(char).allowed).toBe(false);
  });
});

describe('canEntityMove', () => {
  it('returns true for entity with no effects', () => {
    const char = createTestCharacter();
    expect(canEntityMove(char)).toBe(true);
  });
});

describe('hasHasteBonus', () => {
  it('returns false for entity with no effects', () => {
    const char = createTestCharacter();
    expect(hasHasteBonus(char)).toBe(false);
  });
});

// ==========================================
// wakeFromSleep
// ==========================================
describe('wakeFromSleep', () => {
  it('removes sleep effect', () => {
    const char = createTestCharacter({
      statusEffects: [{
        id: 's1',
        type: StatusEffectType.SLEEP,
        statusAssetId: 'sleep-asset',
        duration: 5,
        appliedOnTurn: 0,
      }],
    });
    wakeFromSleep(char);
    const hasSleep = char.statusEffects?.some(e => e.type === StatusEffectType.SLEEP);
    expect(hasSleep).toBeFalsy();
  });
});
