/**
 * Test helpers — module mocks, registries, and fixture factories
 * for game engine unit tests.
 */
import { vi } from 'vitest';
import type {
  Character,
  Enemy,
  Puzzle,
  PlacedCharacter,
  PlacedEnemy,
  PlacedCollectible,
  GameState,
  Tile,
  TileOrNull,
} from '../../types/game';
import { Direction, TileType, ActionType } from '../../types/game';

// ==========================================
// TEST REGISTRIES
// ==========================================

const characterRegistry = new Map<string, Character>();
const enemyRegistry = new Map<string, Enemy>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tileTypeRegistry = new Map<string, any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const collectibleRegistry = new Map<string, any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const spellRegistry = new Map<string, any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const statusEffectRegistry = new Map<string, any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vesselRegistry = new Map<string, any>();
// Allies are enemy-shaped assets whose PLACEMENTS carry party: 'hero' —
// the registry stores them as-is (the real adapter is an identity today).
const allyRegistry = new Map<string, Enemy>();

// Mirror of assetStorage.vesselToEnemyAsset for the mocked modules: vessels
// resolve as static Enemy-shaped assets (no behavior) through getEnemy/loadEnemy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const testVesselToEnemy = (vessel: any) => ({
  id: vessel.id,
  name: vessel.name,
  pluralName: vessel.pluralName,
  spriteId: vessel.id,
  health: vessel.health,
  droppedCollectibleId: vessel.droppedCollectibleId,
  isCustom: true,
  createdAt: vessel.createdAt ?? '2026-01-01',
});

export function registerTestCharacter(char: Character) {
  characterRegistry.set(char.id, char);
}

export function registerTestEnemy(enemy: Enemy) {
  enemyRegistry.set(enemy.id, enemy);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerTestTileType(id: string, tileDef: any) {
  tileTypeRegistry.set(id, tileDef);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerTestCollectible(id: string, def: any) {
  collectibleRegistry.set(id, def);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerTestSpell(id: string, def: any) {
  spellRegistry.set(id, def);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerTestStatusEffect(id: string, def: any) {
  statusEffectRegistry.set(id, def);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerTestVessel(vessel: any) {
  vesselRegistry.set(vessel.id, vessel);
}

export function registerTestAlly(ally: Enemy) {
  allyRegistry.set(ally.id, ally);
}

export function clearAllRegistries() {
  characterRegistry.clear();
  enemyRegistry.clear();
  tileTypeRegistry.clear();
  collectibleRegistry.clear();
  spellRegistry.clear();
  statusEffectRegistry.clear();
  vesselRegistry.clear();
  allyRegistry.clear();
}

// ==========================================
// MODULE MOCKS
// ==========================================

vi.mock('../../data/characters', () => ({
  getCharacter: (id: string) => characterRegistry.get(id) ?? null,
  getAllCharacters: () => Array.from(characterRegistry.values()),
}));

vi.mock('../../data/enemies', () => ({
  // Match the real getEnemy signature (EnemyWithSprite | undefined). Returning null
  // for a miss breaks engine checks like `getEnemy(id) !== undefined` (null passes),
  // which misclassifies heroes as enemies in moveCharacter's combat branch.
  // Vessel fallback mirrors the real module.
  getEnemy: (id: string) =>
    enemyRegistry.get(id) ??
    (vesselRegistry.has(id) ? testVesselToEnemy(vesselRegistry.get(id)) : undefined) ??
    allyRegistry.get(id),
}));

vi.mock('../../utils/assetStorage', () => ({
  loadTileType: (id: string) => tileTypeRegistry.get(id) ?? null,
  loadCollectible: (id: string) => collectibleRegistry.get(id) ?? null,
  loadSpellAsset: (id: string) => spellRegistry.get(id) ?? null,
  loadStatusEffectAsset: (id: string) => statusEffectRegistry.get(id) ?? null,
  loadEnemy: (id: string) =>
    enemyRegistry.get(id) ??
    (vesselRegistry.has(id) ? testVesselToEnemy(vesselRegistry.get(id)) : null) ??
    allyRegistry.get(id) ??
    null,
  loadCharacter: (id: string) => characterRegistry.get(id) ?? null,
  loadVessel: (id: string) => vesselRegistry.get(id) ?? null,
  vesselToEnemyAsset: testVesselToEnemy,
  loadAlly: (id: string) => allyRegistry.get(id) ?? null,
  allyToEnemyAsset: (ally: Enemy) => ally,
  loadObject: () => null,
  isAssetHidden: () => false,
  getCustomCharacters: () => Array.from(characterRegistry.values()),
  getCustomEnemies: () => Array.from(enemyRegistry.values()),
  getCustomVessels: () => Array.from(vesselRegistry.values()),
  getCustomAllies: () => Array.from(allyRegistry.values()),
}));

// ==========================================
// FIXTURE FACTORIES
// ==========================================

/** Create a width×height grid of EMPTY tiles */
export function createEmptyGrid(width: number, height: number): TileOrNull[][] {
  const grid: TileOrNull[][] = [];
  for (let y = 0; y < height; y++) {
    const row: TileOrNull[] = [];
    for (let x = 0; x < width; x++) {
      row.push({ x, y, type: TileType.EMPTY });
    }
    grid.push(row);
  }
  return grid;
}

/** Set a specific tile in the grid */
export function setTile(
  grid: TileOrNull[][],
  x: number,
  y: number,
  type: TileType,
  extra?: Partial<Tile>,
): void {
  grid[y][x] = { x, y, type, ...extra };
}

/** Set a tile to null (void) */
export function setNull(grid: TileOrNull[][], x: number, y: number): void {
  grid[y][x] = null;
}

/** Create a minimal Puzzle with sensible defaults */
export function createTestPuzzle(overrides?: Partial<Puzzle>): Puzzle {
  const width = overrides?.width ?? 5;
  const height = overrides?.height ?? 5;
  return {
    id: 'test-puzzle',
    date: '2026-01-01',
    name: 'Test Puzzle',
    width,
    height,
    tiles: overrides?.tiles ?? createEmptyGrid(width, height),
    enemies: [],
    collectibles: [],
    availableCharacters: ['hero-1'],
    winConditions: [{ type: 'defeat_all_enemies' }],
    maxCharacters: 3,
    ...overrides,
  };
}

/** Create a Character definition (asset, not placed) */
export function createTestCharacterDef(overrides?: Partial<Character>): Character {
  return {
    id: 'hero-1',
    name: 'Test Hero',
    spriteId: 'sprite-hero',
    description: 'A test hero',
    health: 10,
    defaultFacing: Direction.EAST,
    behavior: [{ type: ActionType.MOVE_FORWARD }],
    ...overrides,
  };
}

/** Create an Enemy definition (asset, not placed) */
export function createTestEnemyDef(overrides?: Partial<Enemy>): Enemy {
  return {
    id: 'goblin-1',
    name: 'Test Goblin',
    spriteId: 'sprite-goblin',
    health: 5,
    ...overrides,
  };
}

/** Create a PlacedCharacter (instance in a game state) */
export function createTestCharacter(overrides?: Partial<PlacedCharacter> & { maxHealth?: number }): PlacedCharacter {
  return {
    characterId: 'hero-1',
    x: 0,
    y: 0,
    facing: Direction.EAST,
    currentHealth: 10,
    actionIndex: 0,
    active: true,
    dead: false,
    ...overrides,
  } as PlacedCharacter;
}

/** Create a PlacedEnemy (instance in a game state) */
export function createTestEnemy(overrides?: Partial<PlacedEnemy>): PlacedEnemy {
  return {
    enemyId: 'goblin-1',
    x: 3,
    y: 0,
    currentHealth: 5,
    dead: false,
    ...overrides,
  };
}

/** Create a PlacedCollectible */
export function createTestCollectible(overrides?: Partial<PlacedCollectible>): PlacedCollectible {
  return {
    x: 2,
    y: 2,
    collected: false,
    ...overrides,
  };
}

/** Create a minimal GameState with sensible defaults */
export function createTestGameState(overrides?: Partial<GameState>): GameState {
  const puzzle = overrides?.puzzle ?? createTestPuzzle();
  return {
    puzzle,
    placedCharacters: [],
    currentTurn: 0,
    simulationRunning: false,
    gameStatus: 'setup',
    score: 0,
    activeProjectiles: [],
    activeParticles: [],
    persistentAreaEffects: [],
    tileStates: new Map(),
    ...overrides,
  };
}
