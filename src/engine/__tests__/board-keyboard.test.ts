/**
 * The board's keyboard cursor helpers (components/game/boardKeyboard.ts):
 * cursor movement stays on the board, and each tile is described in words
 * for screen readers.
 */
import {
  clearAllRegistries,
  registerTestCharacter,
  registerTestEnemy,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestPuzzle,
  createTestEnemy,
  createTestGameState,
  createEmptyGrid,
  setTile,
} from './helpers';
import { describe, it, expect, beforeEach } from 'vitest';
import { Direction, TileType } from '../../types/game';
import type { GameState } from '../../types/game';
import { boardLabel, describeTile, initialCursor, moveCursor } from '../../components/game/boardKeyboard';

function scenario(): GameState {
  registerTestCharacter(createTestCharacterDef({ id: 'hero-a', name: 'Simon', health: 4 }));
  registerTestEnemy(createTestEnemyDef({ id: 'skeleton', name: 'Skeleton', health: 2 }));
  const tiles = createEmptyGrid(4, 3);
  setTile(tiles, 1, 0, TileType.WALL);
  tiles[2][3] = null; // void
  const gs = createTestGameState({
    puzzle: createTestPuzzle({
      width: 4,
      height: 3,
      tiles,
      enemies: [
        createTestEnemy({ enemyId: 'skeleton', x: 2, y: 1, currentHealth: 2 }),
        createTestEnemy({ enemyId: 'skeleton', x: 0, y: 2, currentHealth: 0, dead: true }),
      ],
      availableCharacters: ['hero-a'],
    }),
  });
  gs.placedCharacters.push({
    characterId: 'hero-a', x: 0, y: 0, facing: Direction.EAST,
    currentHealth: 3, actionIndex: 0, active: true, dead: false,
  });
  return gs;
}

describe('board keyboard cursor', () => {
  beforeEach(() => clearAllRegistries());

  it('starts near the middle of the board', () => {
    expect(initialCursor(4, 3)).toEqual({ x: 1, y: 1 });
    expect(initialCursor(1, 1)).toEqual({ x: 0, y: 0 });
  });

  it('moves with the arrow keys and stops at the edges', () => {
    expect(moveCursor({ x: 1, y: 1 }, 'ArrowRight', 4, 3)).toEqual({ x: 2, y: 1 });
    expect(moveCursor({ x: 1, y: 1 }, 'ArrowUp', 4, 3)).toEqual({ x: 1, y: 0 });
    expect(moveCursor({ x: 0, y: 0 }, 'ArrowLeft', 4, 3)).toEqual({ x: 0, y: 0 });
    expect(moveCursor({ x: 3, y: 2 }, 'ArrowDown', 4, 3)).toEqual({ x: 3, y: 2 });
  });

  it('ignores keys that are not arrows', () => {
    expect(moveCursor({ x: 1, y: 1 }, 'Enter', 4, 3)).toBeNull();
    expect(moveCursor({ x: 1, y: 1 }, 'a', 4, 3)).toBeNull();
  });

  it('describes terrain, heroes and enemies in words', () => {
    const gs = scenario();
    expect(describeTile(gs, 0, 0)).toBe('Column 1, row 1. Hero Simon, 3 health, facing east.');
    expect(describeTile(gs, 1, 0)).toBe('Column 2, row 1. Wall.');
    expect(describeTile(gs, 2, 1)).toBe('Column 3, row 2. Enemy Skeleton, 2 health.');
    expect(describeTile(gs, 3, 2)).toBe('Column 4, row 3. No floor.');
    expect(describeTile(gs, 3, 0)).toBe('Column 4, row 1. Empty floor.');
  });

  it('does not announce the dead', () => {
    expect(describeTile(scenario(), 0, 2)).toBe('Column 1, row 3. Empty floor.');
  });

  it('names the board and how to drive it', () => {
    expect(boardLabel(8, 6)).toContain('8 columns by 6 rows');
  });
});
