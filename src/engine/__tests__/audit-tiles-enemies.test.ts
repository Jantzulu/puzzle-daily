/**
 * Engine audit sweep 9 (docs/engine-audit-plan.md): tile behaviors × ENEMY
 * actors. Tile processing rides moveCharacter, which serves enemy wrappers
 * too — but the details (damage-once dedupe keys, teleports, ice, turns,
 * plates) were only ever exercised by heroes.
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestEnemy as regEnemy,
  registerTestTileType,
  createEmptyGrid,
  createTestPuzzle,
  createTestEnemyDef,
  createTestEnemy,
  createTestGameState,
  setTile,
} from './helpers';
import { Direction, TileType, ActionType } from '../../types/game';
import type { PlacedEnemy, PlacedCharacter, TileOrNull } from '../../types/game';
import { executeTurn } from '../simulation';

const baseState = (opts: {
  tiles: TileOrNull[][];
  enemies?: PlacedEnemy[];
  heroes?: PlacedCharacter[];
}) =>
  createTestGameState({
    puzzle: createTestPuzzle({
      width: 8, height: 5,
      tiles: opts.tiles,
      enemies: opts.enemies ?? [],
    }),
    placedCharacters: opts.heroes ?? [],
    gameStatus: 'running',
    currentTurn: 0,
    testMode: true,
  });

const customTile = (grid: TileOrNull[][], x: number, y: number, typeId: string) => {
  grid[y][x] = { x, y, type: TileType.EMPTY, customTileTypeId: typeId };
};

const walkerAt = (x: number, y: number, overrides?: Partial<PlacedEnemy>) =>
  createTestEnemy({
    enemyId: 'walker', x, y, currentHealth: 5,
    actionIndex: 0, active: true, facing: Direction.EAST,
    ...overrides,
  });

beforeEach(() => {
  clearAllRegistries();
  regEnemy(createTestEnemyDef({
    id: 'walker', health: 5,
    behavior: {
      type: 'active',
      pattern: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }],
      defaultFacing: Direction.EAST,
    },
  }));
});

describe('damage tiles × enemy actors', () => {
  it('an enemy stepping on a damage tile takes the damage', () => {
    registerTestTileType('spikes', {
      id: 'spikes', name: 'Spikes', baseType: 'empty',
      behaviors: [{ type: 'damage', damageAmount: 2 }],
    });
    const tiles = createEmptyGrid(8, 5);
    customTile(tiles, 3, 2, 'spikes');
    const gs = baseState({ tiles, enemies: [walkerAt(2, 2)] });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].x).toBe(3);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(3); // 5 - 2
  });

  it('damage-once: TWO enemies of the same asset each take their own hit', () => {
    // The dedupe key must identify the entity INSTANCE. Keying by
    // characterId (which is the shared enemyId for wrapped enemies) let
    // every same-asset enemy after the first cross for free.
    registerTestTileType('trap', {
      id: 'trap', name: 'Trap', baseType: 'empty',
      behaviors: [{ type: 'damage', damageAmount: 2, damageOnce: true }],
    });
    const tiles = createEmptyGrid(8, 5);
    customTile(tiles, 3, 2, 'trap');
    const gs = baseState({
      tiles,
      enemies: [walkerAt(2, 2), walkerAt(1, 2)], // marching in file
    });
    executeTurn(gs); // A crosses the trap
    executeTurn(gs); // B crosses the trap
    expect(gs.puzzle.enemies[0].currentHealth).toBe(3); // A: bitten once
    expect(gs.puzzle.enemies[1].currentHealth).toBe(3); // B: bitten too — own instance
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(3); // and only once each
    expect(gs.puzzle.enemies[1].currentHealth).toBe(3);
  });
});

describe('teleport tiles × enemy actors', () => {
  it('an enemy stepping on a teleporter arrives at its paired tile', () => {
    registerTestTileType('porter', {
      id: 'porter', name: 'Porter', baseType: 'empty',
      behaviors: [{ type: 'teleport', teleportGroupId: 'tp1' }],
    });
    const tiles = createEmptyGrid(8, 5);
    customTile(tiles, 3, 2, 'porter');
    customTile(tiles, 6, 4, 'porter');
    const gs = baseState({ tiles, enemies: [walkerAt(2, 2)] });
    executeTurn(gs); // steps onto (3,2) → whisked to (6,4)
    expect(gs.puzzle.enemies[0].x).toBe(6);
    expect(gs.puzzle.enemies[0].y).toBe(4);
  });
});

describe('ice tiles × enemy actors', () => {
  it('an enemy slides across ice until the first non-ice tile', () => {
    registerTestTileType('ice', {
      id: 'ice', name: 'Ice', baseType: 'empty',
      behaviors: [{ type: 'ice' }],
    });
    const tiles = createEmptyGrid(8, 5);
    customTile(tiles, 3, 2, 'ice');
    customTile(tiles, 4, 2, 'ice');
    const gs = baseState({ tiles, enemies: [walkerAt(2, 2)] });
    executeTurn(gs); // steps onto (3,2), slides through (4,2) to (5,2)
    expect(gs.puzzle.enemies[0].x).toBe(5);
    expect(gs.puzzle.enemies[0].y).toBe(2);
  });
});

describe('direction-change tiles × enemy actors', () => {
  it('an enemy crossing a turn tile changes facing and walks the new way', () => {
    registerTestTileType('turn-north', {
      id: 'turn-north', name: 'Turn North', baseType: 'empty',
      behaviors: [{ type: 'direction_change', directionChangeMode: 'fixed', newFacing: Direction.NORTH }],
    });
    const tiles = createEmptyGrid(8, 5);
    customTile(tiles, 3, 2, 'turn-north');
    const gs = baseState({ tiles, enemies: [walkerAt(2, 2)] });
    executeTurn(gs); // steps onto the tile, gets spun north
    expect(gs.puzzle.enemies[0].facing).toBe(Direction.NORTH);
    executeTurn(gs); // walks the new heading
    expect(gs.puzzle.enemies[0].x).toBe(3);
    expect(gs.puzzle.enemies[0].y).toBe(1);
  });
});

describe('pressure plates × enemy actors', () => {
  it('an enemy stepping on a plate fires its effects (toggle a wall)', () => {
    registerTestTileType('plate', {
      id: 'plate', name: 'Plate', baseType: 'empty',
      behaviors: [{
        type: 'pressure_plate',
        pressurePlateEffects: [{ type: 'toggle_wall', targetX: 6, targetY: 1 }],
      }],
    });
    const tiles = createEmptyGrid(8, 5);
    customTile(tiles, 3, 2, 'plate');
    setTile(tiles, 6, 1, TileType.WALL);
    const gs = baseState({ tiles, enemies: [walkerAt(2, 2)] });
    executeTurn(gs); // enemy weight counts
    expect(gs.puzzle.tiles[1][6]!.type).toBe(TileType.EMPTY);
  });
});
