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
  WinCondition,
  CharacterAction,
} from '../../types/game';
import { Direction, TileType, ActionType } from '../../types/game';

// ==========================================
// TEST REGISTRIES
// ==========================================

const characterRegistry = new Map<string, Character>();
const enemyRegistry = new Map<string, Enemy>();
const tileTypeRegistry = new Map<string, any>();
const collectibleRegistry = new Map<string, any>();
const spellRegistry = new Map<string, any>();
const statusEffectRegistry = new Map<string, any>();
const customAttackRegistry = new Map<string, any>();

export function registerTestCharacter(char: Character) {
  characterRegistry.set(char.id, char);
}

export function registerTestEnemy(enemy: Enemy) {
  enemyRegistry.set(enemy.id, enemy);
}

export function registerTestTileType(id: string, tileDef: any) {
  tileTypeRegistry.set(id, tileDef);
}

export function registerTestCollectible(id: string, def: any) {
  collectibleRegistry.set(id, def);
}

export function registerTestSpell(id: string, def: any) {
  spellRegistry.set(id, def);
}

export function registerTestStatusEffect(id: string, def: any) {
  statusEffectRegistry.set(id, def);
}

export function registerTestCustomAttack(id: string, def: any) {
  customAttackRegistry.set(id, def);
}

export function clearAllRegistries() {
  characterRegistry.clear();
  enemyRegistry.clear();
  tileTypeRegistry.clear();
  collectibleRegistry.clear();
  spellRegistry.clear();
  statusEffectRegistry.clear();
  customAttackRegistry.clear();
}

// ==========================================
// MODULE MOCKS
// ==========================================

vi.mock('../../data/characters', () => ({
  getCharacter: (id: string) => characterRegistry.get(id) ?? null,
  getAllCharacters: () => Array.from(characterRegistry.values()),
}));

vi.mock('../../data/enemies', () => ({
  getEnemy: (id: string) => enemyRegistry.get(id) ?? null,
}));

vi.mock('../../utils/assetStorage', () => ({
  loadTileType: (id: string) => tileTypeRegistry.get(id) ?? null,
  loadCollectible: (id: string) => collectibleRegistry.get(id) ?? null,
  loadSpellAsset: (id: string) => spellRegistry.get(id) ?? null,
  loadStatusEffectAsset: (id: string) => statusEffectRegistry.get(id) ?? null,
  loadCustomAttack: (id: string) => customAttackRegistry.get(id) ?? null,
  loadEnemy: (id: string) => enemyRegistry.get(id) ?? null,
  loadCharacter: (id: string) => characterRegistry.get(id) ?? null,
  isAssetHidden: () => false,
  getCustomCharacters: () => Array.from(characterRegistry.values()),
  getCustomEnemies: () => Array.from(enemyRegistry.values()),
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
    attackDamage: 3,
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
    attackDamage: 2,
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
