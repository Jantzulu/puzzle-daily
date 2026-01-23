// Puzzle Generator - Creates solvable puzzles based on user-specified parameters
// Uses the puzzle solver to validate generated puzzles

import { solvePuzzleAsync, quickValidate, type SolverResult } from './puzzleSolver';
import { getEnemy } from '../data/enemies';
import { loadTileType } from '../utils/assetStorage';
import type {
  Puzzle,
  PlacedEnemy,
  PlacedCollectible,
  Tile,
  TileType,
  WinCondition,
  Direction,
} from '../types/game';

// Re-export for convenience
export type { SolverResult };

// ==========================================
// TYPES AND INTERFACES
// ==========================================

export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'expert';

export type EnemyPlacementStrategy = 'random' | 'clustered' | 'spread';

export interface EnemyConfig {
  enemyId: string;
  count: number;
  placement?: EnemyPlacementStrategy;
}

export interface GenerationParameters {
  // Map dimensions
  width: number;                    // 5-20
  height: number;                   // 5-20

  // Character constraints
  availableCharacters: string[];    // Character IDs to use
  maxCharacters: number;            // 1-4

  // Enemy configuration
  enemyTypes: EnemyConfig[];        // Which enemies and how many

  // Difficulty
  difficulty: DifficultyLevel;

  // Special tile options
  enabledTileTypes: string[];       // Custom tile type IDs to potentially use
  forceSpecialTiles?: boolean;      // If true, guarantee at least one special tile is placed
  enableVoidTiles: boolean;         // Allow non-rectangular shapes
  forceVoidTiles?: boolean;         // If true, guarantee at least one void region is placed

  // Win conditions
  winConditions: WinCondition[];

  // Optional constraints
  maxTurns?: number;
  lives?: number;
  skinId?: string;
}

export interface GenerationProgress {
  attempt: number;
  maxAttempts: number;
  phase: 'generating' | 'validating';
  message?: string;
}

export interface GenerationResult {
  success: boolean;
  puzzle?: Puzzle;
  validationResult?: SolverResult;
  generationTimeMs: number;
  attemptsUsed: number;
  error?: string;
}

// Internal structures
interface VoidRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  isEdge: boolean;
}

interface LayoutCandidate {
  tiles: (Tile | null)[][];
  enemies: PlacedEnemy[];
  collectibles: PlacedCollectible[];
}

type TileOrNull = Tile | null;

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Get appropriate max combinations limit based on difficulty and enemy count
 * Lower limits = faster generation but may miss some solvable puzzles
 * Higher limits = slower but more thorough search
 */
function getMaxCombinationsForDifficulty(difficulty: DifficultyLevel, enemyCount: number): number {
  // Base limits by difficulty
  const baseLimits: Record<DifficultyLevel, number> = {
    easy: 2000,
    medium: 3000,
    hard: 4000,
    expert: 5000,
  };

  // Reduce limit as enemy count increases (more enemies = harder to solve = longer search)
  const enemyMultiplier = Math.max(0.5, 1 - (enemyCount - 1) * 0.15);

  return Math.floor(baseLimits[difficulty] * enemyMultiplier);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function deepCloneTiles(tiles: TileOrNull[][]): TileOrNull[][] {
  return tiles.map(row =>
    row.map(tile => tile ? { ...tile } : null)
  );
}

function createEmptyGrid(width: number, height: number): TileOrNull[][] {
  const grid: TileOrNull[][] = [];
  for (let y = 0; y < height; y++) {
    const row: TileOrNull[] = [];
    for (let x = 0; x < width; x++) {
      row.push({ x, y, type: 'empty' as TileType });
    }
    grid.push(row);
  }
  return grid;
}

function getValidEmptyTiles(tiles: TileOrNull[][], enemies: PlacedEnemy[]): {x: number, y: number}[] {
  const occupied = new Set(enemies.map(e => `${e.x},${e.y}`));
  const valid: {x: number, y: number}[] = [];

  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[y].length; x++) {
      const tile = tiles[y][x];
      if (tile && tile.type === ('empty' as TileType) && !occupied.has(`${x},${y}`)) {
        // Check if custom tile prevents placement
        if (tile.customTileTypeId) {
          const customTile = loadTileType(tile.customTileTypeId);
          if (customTile?.preventPlacement) continue;
        }
        valid.push({ x, y });
      }
    }
  }

  return valid;
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// ==========================================
// VOID REGION GENERATION
// ==========================================

/**
 * Check if two void regions have problematic adjacency.
 * Problems include:
 * 1. Diagonal corner touching (corners meet but no edge overlap)
 * 2. Edge sharing with only 1 tile overlap (creates concave corner rendering issues)
 *
 * Returns true if adjacency is problematic (bad).
 */
function hasProblematicAdjacency(
  r1: { x: number; y: number; width: number; height: number },
  r2: { x: number; y: number; width: number; height: number }
): boolean {
  // Get the edges of each rectangle
  const r1Left = r1.x;
  const r1Right = r1.x + r1.width;
  const r1Top = r1.y;
  const r1Bottom = r1.y + r1.height;

  const r2Left = r2.x;
  const r2Right = r2.x + r2.width;
  const r2Top = r2.y;
  const r2Bottom = r2.y + r2.height;

  // Check for diagonal corner touching:
  // This happens when corners touch but edges don't overlap
  const corners = [
    // r1's bottom-right touches r2's top-left
    r1Right === r2Left && r1Bottom === r2Top,
    // r1's bottom-left touches r2's top-right
    r1Left === r2Right && r1Bottom === r2Top,
    // r1's top-right touches r2's bottom-left
    r1Right === r2Left && r1Top === r2Bottom,
    // r1's top-left touches r2's bottom-right
    r1Left === r2Right && r1Top === r2Bottom,
  ];

  if (corners.some(c => c)) {
    return true; // Pure diagonal touching is bad
  }

  // Check for horizontal adjacency (r1 left of r2 or r2 left of r1)
  // and verify overlap is at least 2 tiles
  if (r1Right === r2Left || r2Right === r1Left) {
    // They share a vertical edge
    // Calculate vertical overlap
    const overlapTop = Math.max(r1Top, r2Top);
    const overlapBottom = Math.min(r1Bottom, r2Bottom);
    const verticalOverlap = overlapBottom - overlapTop;

    // If they have ANY vertical overlap but less than 2 tiles, it's problematic
    if (verticalOverlap > 0 && verticalOverlap < 2) {
      return true;
    }
  }

  // Check for vertical adjacency (r1 above r2 or r2 above r1)
  // and verify overlap is at least 2 tiles
  if (r1Bottom === r2Top || r2Bottom === r1Top) {
    // They share a horizontal edge
    // Calculate horizontal overlap
    const overlapLeft = Math.max(r1Left, r2Left);
    const overlapRight = Math.min(r1Right, r2Right);
    const horizontalOverlap = overlapRight - overlapLeft;

    // If they have ANY horizontal overlap but less than 2 tiles, it's problematic
    if (horizontalOverlap > 0 && horizontalOverlap < 2) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a new void region conflicts with existing voids.
 * Conflicts include:
 * - Overlapping regions
 * - Diagonal-only adjacency (corner touching)
 * - Edge sharing with less than 2 tiles overlap (causes wall rendering issues)
 */
function voidConflictsWithExisting(
  newVoid: { x: number; y: number; width: number; height: number },
  existingVoids: VoidRegion[]
): boolean {
  for (const existing of existingVoids) {
    // Check for overlap
    const overlaps =
      newVoid.x < existing.x + existing.width &&
      newVoid.x + newVoid.width > existing.x &&
      newVoid.y < existing.y + existing.height &&
      newVoid.y + newVoid.height > existing.y;

    if (overlaps) return true;

    // Check for problematic adjacency (diagonal corner or insufficient edge overlap)
    if (hasProblematicAdjacency(newVoid, existing)) return true;
  }

  return false;
}

function generateInteriorVoid(
  gridWidth: number,
  gridHeight: number,
  existingVoids: VoidRegion[]
): VoidRegion | null {
  // Interior void must be at least 2 tiles wide AND 2 tiles tall
  const minSize = 2;
  const maxWidth = Math.min(4, Math.floor(gridWidth / 3));
  const maxHeight = Math.min(4, Math.floor(gridHeight / 3));

  if (maxWidth < minSize || maxHeight < minSize) {
    return null; // Grid too small for interior void
  }

  const voidWidth = randomInt(minSize, maxWidth);
  const voidHeight = randomInt(minSize, maxHeight);

  // Position must leave at least 1 tile border on all sides
  const maxX = gridWidth - voidWidth - 1;
  const maxY = gridHeight - voidHeight - 1;

  if (maxX < 1 || maxY < 1) {
    return null;
  }

  // Try to find a position that doesn't conflict with existing voids
  for (let attempt = 0; attempt < 10; attempt++) {
    const x = randomInt(1, maxX);
    const y = randomInt(1, maxY);

    const candidate = { x, y, width: voidWidth, height: voidHeight };

    if (!voidConflictsWithExisting(candidate, existingVoids)) {
      return { ...candidate, isEdge: false };
    }
  }

  return null;
}

function generateEdgeVoid(
  gridWidth: number,
  gridHeight: number,
  existingVoids: VoidRegion[]
): VoidRegion | null {
  // Pick an edge (0=top, 1=right, 2=bottom, 3=left)
  const edge = randomInt(0, 3);

  let region: VoidRegion;

  switch (edge) {
    case 0: // Top edge
      region = {
        x: randomInt(0, Math.max(0, gridWidth - 3)),
        y: 0,
        width: randomInt(2, Math.min(4, gridWidth - 1)),
        height: randomInt(1, 2),
        isEdge: true,
      };
      break;
    case 1: // Right edge
      region = {
        x: gridWidth - randomInt(1, 2),
        y: randomInt(0, Math.max(0, gridHeight - 3)),
        width: randomInt(1, 2),
        height: randomInt(2, Math.min(4, gridHeight - 1)),
        isEdge: true,
      };
      break;
    case 2: // Bottom edge
      region = {
        x: randomInt(0, Math.max(0, gridWidth - 3)),
        y: gridHeight - randomInt(1, 2),
        width: randomInt(2, Math.min(4, gridWidth - 1)),
        height: randomInt(1, 2),
        isEdge: true,
      };
      break;
    case 3: // Left edge
    default:
      region = {
        x: 0,
        y: randomInt(0, Math.max(0, gridHeight - 3)),
        width: randomInt(1, 2),
        height: randomInt(2, Math.min(4, gridHeight - 1)),
        isEdge: true,
      };
      break;
  }

  // Clamp to grid bounds
  region.width = Math.min(region.width, gridWidth - region.x);
  region.height = Math.min(region.height, gridHeight - region.y);

  // Check for conflicts (overlap or diagonal adjacency)
  if (voidConflictsWithExisting(region, existingVoids)) {
    return null;
  }

  return region;
}

function applyVoidRegion(tiles: TileOrNull[][], region: VoidRegion): void {
  for (let y = region.y; y < region.y + region.height && y < tiles.length; y++) {
    for (let x = region.x; x < region.x + region.width && x < tiles[y].length; x++) {
      tiles[y][x] = null;
    }
  }
}

function addVoidRegions(
  tiles: TileOrNull[][],
  difficulty: DifficultyLevel,
  forceVoid: boolean = false
): TileOrNull[][] {
  const height = tiles.length;
  const width = tiles[0].length;

  // Determine number of void regions based on difficulty
  let voidCount = {
    easy: 0,
    medium: 0,
    hard: randomInt(1, 2),
    expert: randomInt(1, 3),
  }[difficulty];

  // If force is enabled, guarantee at least 1 void region
  if (forceVoid && voidCount === 0) {
    voidCount = 1;
  }

  if (voidCount === 0) return tiles;

  const result = deepCloneTiles(tiles);
  const voids: VoidRegion[] = [];

  for (let i = 0; i < voidCount; i++) {
    // 60% chance of edge void, 40% chance of interior void
    const isEdge = Math.random() < 0.6;

    const region = isEdge
      ? generateEdgeVoid(width, height, voids)
      : generateInteriorVoid(width, height, voids);

    if (region) {
      applyVoidRegion(result, region);
      voids.push(region);
    }
  }

  return result;
}

// ==========================================
// WALL GENERATION
// ==========================================

function addWalls(
  tiles: TileOrNull[][],
  difficulty: DifficultyLevel
): TileOrNull[][] {
  const result = deepCloneTiles(tiles);

  // Wall density based on difficulty
  const wallDensity = {
    easy: 0.05,
    medium: 0.12,
    hard: 0.18,
    expert: 0.25,
  }[difficulty];

  // Get valid tiles (non-void)
  const validTiles: {x: number, y: number}[] = [];
  for (let y = 0; y < result.length; y++) {
    for (let x = 0; x < result[y].length; x++) {
      if (result[y][x] !== null) {
        validTiles.push({ x, y });
      }
    }
  }

  const wallCount = Math.floor(validTiles.length * wallDensity);

  // Use different placement strategies based on difficulty
  if (difficulty === 'easy') {
    placeRandomWalls(result, wallCount, validTiles);
  } else if (difficulty === 'medium') {
    placeCorridorWalls(result, wallCount, validTiles);
  } else {
    placeMazeWalls(result, wallCount, validTiles);
  }

  return result;
}

function placeRandomWalls(
  tiles: TileOrNull[][],
  count: number,
  validTiles: {x: number, y: number}[]
): void {
  const shuffled = shuffleArray(validTiles);

  for (let i = 0; i < count && i < shuffled.length; i++) {
    const { x, y } = shuffled[i];
    if (tiles[y][x]) {
      tiles[y][x] = { x, y, type: 'wall' as TileType };
    }
  }
}

function placeCorridorWalls(
  tiles: TileOrNull[][],
  count: number,
  validTiles: {x: number, y: number}[]
): void {
  const height = tiles.length;
  const width = tiles[0].length;
  let placed = 0;

  // Create 1-2 horizontal or vertical wall segments
  const segments = randomInt(1, 2);

  for (let s = 0; s < segments && placed < count; s++) {
    const isHorizontal = Math.random() < 0.5;

    if (isHorizontal) {
      // Horizontal wall segment
      const y = randomInt(1, height - 2);
      const startX = randomInt(0, Math.floor(width / 2));
      const length = randomInt(2, Math.min(4, width - startX));

      for (let x = startX; x < startX + length && placed < count; x++) {
        if (tiles[y][x] && tiles[y][x]!.type !== ('wall' as TileType)) {
          tiles[y][x] = { x, y, type: 'wall' as TileType };
          placed++;
        }
      }
    } else {
      // Vertical wall segment
      const x = randomInt(1, width - 2);
      const startY = randomInt(0, Math.floor(height / 2));
      const length = randomInt(2, Math.min(4, height - startY));

      for (let y = startY; y < startY + length && placed < count; y++) {
        if (tiles[y][x] && tiles[y][x]!.type !== ('wall' as TileType)) {
          tiles[y][x] = { x, y, type: 'wall' as TileType };
          placed++;
        }
      }
    }
  }

  // Fill remaining with random walls
  if (placed < count) {
    const remaining = validTiles.filter(t =>
      tiles[t.y][t.x] && tiles[t.y][t.x]!.type !== ('wall' as TileType)
    );
    placeRandomWalls(tiles, count - placed, remaining);
  }
}

function placeMazeWalls(
  tiles: TileOrNull[][],
  count: number,
  validTiles: {x: number, y: number}[]
): void {
  const height = tiles.length;
  const width = tiles[0].length;
  let placed = 0;

  // Create L-shaped or T-shaped wall patterns
  const patterns = randomInt(2, 3);

  for (let p = 0; p < patterns && placed < count; p++) {
    const patternType = randomInt(0, 1); // 0 = L, 1 = T
    const centerX = randomInt(2, width - 3);
    const centerY = randomInt(2, height - 3);

    const positions: {x: number, y: number}[] = [];

    if (patternType === 0) {
      // L-shape
      const armLength = randomInt(2, 3);
      const horizontal = Math.random() < 0.5;

      for (let i = 0; i < armLength; i++) {
        if (horizontal) {
          positions.push({ x: centerX + i, y: centerY });
          positions.push({ x: centerX, y: centerY + i });
        } else {
          positions.push({ x: centerX - i, y: centerY });
          positions.push({ x: centerX, y: centerY - i });
        }
      }
    } else {
      // T-shape
      const armLength = 2;
      positions.push({ x: centerX, y: centerY });
      positions.push({ x: centerX - 1, y: centerY });
      positions.push({ x: centerX + 1, y: centerY });
      for (let i = 1; i <= armLength; i++) {
        positions.push({ x: centerX, y: centerY + i });
      }
    }

    for (const pos of positions) {
      if (pos.x >= 0 && pos.x < width && pos.y >= 0 && pos.y < height &&
          tiles[pos.y][pos.x] && tiles[pos.y][pos.x]!.type !== ('wall' as TileType) &&
          placed < count) {
        tiles[pos.y][pos.x] = { x: pos.x, y: pos.y, type: 'wall' as TileType };
        placed++;
      }
    }
  }

  // Fill remaining with some random walls
  if (placed < count) {
    const remaining = validTiles.filter(t =>
      tiles[t.y][t.x] && tiles[t.y][t.x]!.type !== ('wall' as TileType)
    );
    placeRandomWalls(tiles, count - placed, remaining);
  }
}

// ==========================================
// CONNECTIVITY
// ==========================================

function floodFill(
  tiles: TileOrNull[][],
  startX: number,
  startY: number,
  visited: Set<string>,
  region: Set<string>
): void {
  const stack: {x: number, y: number}[] = [{ x: startX, y: startY }];
  const height = tiles.length;
  const width = tiles[0].length;

  while (stack.length > 0) {
    const { x, y } = stack.pop()!;
    const key = `${x},${y}`;

    if (visited.has(key)) continue;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;

    const tile = tiles[y][x];
    if (!tile) continue; // Void
    if (tile.type === ('wall' as TileType)) continue;

    visited.add(key);
    region.add(key);

    // Check 4 neighbors
    stack.push({ x: x + 1, y });
    stack.push({ x: x - 1, y });
    stack.push({ x, y: y + 1 });
    stack.push({ x, y: y - 1 });
  }
}

function findConnectedRegions(tiles: TileOrNull[][]): Set<string>[] {
  const visited = new Set<string>();
  const regions: Set<string>[] = [];

  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[y].length; x++) {
      const key = `${x},${y}`;
      if (visited.has(key)) continue;

      const tile = tiles[y][x];
      if (!tile) continue; // Skip void
      if (tile.type === ('wall' as TileType)) continue;

      const region = new Set<string>();
      floodFill(tiles, x, y, visited, region);

      if (region.size > 0) {
        regions.push(region);
      }
    }
  }

  return regions;
}

function connectRegions(
  tiles: TileOrNull[][],
  region1: Set<string>,
  region2: Set<string>
): void {
  // Find closest pair of tiles between regions
  let minDist = Infinity;
  let best1: {x: number, y: number} | null = null;
  let best2: {x: number, y: number} | null = null;

  for (const key1 of region1) {
    const [x1, y1] = key1.split(',').map(Number);
    for (const key2 of region2) {
      const [x2, y2] = key2.split(',').map(Number);
      const d = Math.abs(x2 - x1) + Math.abs(y2 - y1); // Manhattan distance
      if (d < minDist) {
        minDist = d;
        best1 = { x: x1, y: y1 };
        best2 = { x: x2, y: y2 };
      }
    }
  }

  if (!best1 || !best2) return;

  // Carve path from best1 to best2
  let cx = best1.x;
  let cy = best1.y;

  // Move horizontally first
  while (cx !== best2.x) {
    if (tiles[cy][cx] && tiles[cy][cx]!.type === ('wall' as TileType)) {
      tiles[cy][cx] = { x: cx, y: cy, type: 'empty' as TileType };
    }
    cx += cx < best2.x ? 1 : -1;
  }

  // Then vertically
  while (cy !== best2.y) {
    if (tiles[cy][cx] && tiles[cy][cx]!.type === ('wall' as TileType)) {
      tiles[cy][cx] = { x: cx, y: cy, type: 'empty' as TileType };
    }
    cy += cy < best2.y ? 1 : -1;
  }
}

function ensureConnectivity(tiles: TileOrNull[][]): TileOrNull[][] {
  const result = deepCloneTiles(tiles);
  const regions = findConnectedRegions(result);

  if (regions.length <= 1) {
    return result; // Already connected
  }

  // Connect all regions to the first (largest) one
  const mainRegion = regions.reduce((a, b) => a.size >= b.size ? a : b);

  for (const region of regions) {
    if (region !== mainRegion) {
      connectRegions(result, mainRegion, region);
      // Merge into main region
      for (const key of region) {
        mainRegion.add(key);
      }
    }
  }

  return result;
}

// ==========================================
// ENEMY PLACEMENT
// ==========================================

function selectEnemyPosition(
  validTiles: {x: number, y: number}[],
  occupiedTiles: Set<string>,
  strategy: EnemyPlacementStrategy,
  existingEnemies: PlacedEnemy[]
): {x: number, y: number} | null {
  const available = validTiles.filter(t =>
    !occupiedTiles.has(`${t.x},${t.y}`)
  );

  if (available.length === 0) return null;

  switch (strategy) {
    case 'clustered':
      // Place near existing enemies
      if (existingEnemies.length > 0) {
        const lastEnemy = existingEnemies[existingEnemies.length - 1];
        // Sort by distance to last enemy
        available.sort((a, b) =>
          distance(a.x, a.y, lastEnemy.x, lastEnemy.y) -
          distance(b.x, b.y, lastEnemy.x, lastEnemy.y)
        );
        // Pick from nearest third
        const nearCount = Math.max(1, Math.floor(available.length / 3));
        return available[randomInt(0, nearCount - 1)];
      }
      // Fall through to random for first enemy
      break;

    case 'spread':
      // Maximize distance from other enemies
      if (existingEnemies.length > 0) {
        let bestTile = available[0];
        let bestMinDist = 0;

        for (const tile of available) {
          let minDist = Infinity;
          for (const enemy of existingEnemies) {
            const d = distance(tile.x, tile.y, enemy.x, enemy.y);
            minDist = Math.min(minDist, d);
          }
          if (minDist > bestMinDist) {
            bestMinDist = minDist;
            bestTile = tile;
          }
        }
        return bestTile;
      }
      // Fall through to random for first enemy
      break;
  }

  // Random placement
  return available[randomInt(0, available.length - 1)];
}

function placeEnemies(
  tiles: TileOrNull[][],
  params: GenerationParameters
): PlacedEnemy[] {
  const enemies: PlacedEnemy[] = [];
  const occupiedTiles = new Set<string>();

  // Get valid placement tiles
  const validTiles = getValidEmptyTiles(tiles, []);

  for (const enemyConfig of params.enemyTypes) {
    for (let i = 0; i < enemyConfig.count; i++) {
      const position = selectEnemyPosition(
        validTiles,
        occupiedTiles,
        enemyConfig.placement || 'random',
        enemies
      );

      if (position) {
        const enemyData = getEnemy(enemyConfig.enemyId);
        enemies.push({
          enemyId: enemyConfig.enemyId,
          x: position.x,
          y: position.y,
          currentHealth: enemyData?.health || 1,
          facing: (enemyData?.behavior?.defaultFacing || 'south') as Direction,
          dead: false,
          actionIndex: 0,
          active: enemyData?.behavior?.type === 'active',
        });
        occupiedTiles.add(`${position.x},${position.y}`);
      }
    }
  }

  return enemies;
}

// ==========================================
// TELEPORTER PLACEMENT HELPERS
// ==========================================

type TileOrNull = Tile | null;

interface TileCoord {
  x: number;
  y: number;
}

/**
 * Calculate walking distance from a start tile to all reachable tiles using BFS
 * Returns a map of "x,y" -> distance (number of moves)
 */
function calculateWalkingDistances(
  tiles: TileOrNull[][],
  start: TileCoord,
  enemies: PlacedEnemy[]
): Map<string, number> {
  const distances = new Map<string, number>();
  const height = tiles.length;
  const width = tiles[0]?.length || 0;
  const enemyPositions = new Set(enemies.map(e => `${e.x},${e.y}`));

  const queue: { x: number; y: number; dist: number }[] = [{ x: start.x, y: start.y, dist: 0 }];
  distances.set(`${start.x},${start.y}`, 0);

  // Cardinal directions only (most characters move cardinally)
  const dirs = [
    { dx: 0, dy: -1 }, // north
    { dx: 0, dy: 1 },  // south
    { dx: -1, dy: 0 }, // west
    { dx: 1, dy: 0 },  // east
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const dir of dirs) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      const key = `${nx},${ny}`;

      // Skip if out of bounds
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      // Skip if already visited
      if (distances.has(key)) continue;

      // Skip if not walkable (null, wall, or enemy)
      const tile = tiles[ny]?.[nx];
      if (!tile || tile.type === ('wall' as TileType)) continue;
      if (enemyPositions.has(key)) continue;

      distances.set(key, current.dist + 1);
      queue.push({ x: nx, y: ny, dist: current.dist + 1 });
    }
  }

  return distances;
}

/**
 * Calculate Euclidean distance between two points
 */
function euclideanDistance(a: TileCoord, b: TileCoord): number {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

/**
 * Check if a tile is near an enemy (within specified range)
 */
function isNearEnemy(pos: TileCoord, enemies: PlacedEnemy[], range: number): boolean {
  return enemies.some(e => euclideanDistance(pos, { x: e.x, y: e.y }) <= range);
}

/**
 * Check if a tile is in a "corner" or hard-to-reach area
 * (surrounded by walls on 2+ sides)
 */
function isCornerOrEdge(pos: TileCoord, tiles: TileOrNull[][]): boolean {
  const height = tiles.length;
  const width = tiles[0]?.length || 0;

  let wallCount = 0;
  const dirs = [
    { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
    { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
  ];

  for (const dir of dirs) {
    const nx = pos.x + dir.dx;
    const ny = pos.y + dir.dy;

    // Out of bounds or wall counts as blocked
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
      wallCount++;
    } else {
      const tile = tiles[ny]?.[nx];
      if (!tile || tile.type === ('wall' as TileType)) {
        wallCount++;
      }
    }
  }

  return wallCount >= 2;
}

interface TeleporterPairCandidate {
  tile1: TileCoord;
  tile2: TileCoord;
  score: number;
  walkingDistance: number;
  directDistance: number;
}

/**
 * Find strategic positions for teleporter pairs
 * Returns pairs of coordinates sorted by strategic value
 */
function findStrategicTeleporterPositions(
  tiles: TileOrNull[][],
  enemies: PlacedEnemy[],
  validTiles: TileCoord[],
  maxPairs: number = 2
): TeleporterPairCandidate[] {
  if (validTiles.length < 4) return []; // Need at least 4 tiles for meaningful teleporters

  const candidates: TeleporterPairCandidate[] = [];
  const height = tiles.length;
  const width = tiles[0]?.length || 0;
  const mapSize = Math.max(width, height);

  // Pre-calculate walking distances from each tile
  const distanceCache = new Map<string, Map<string, number>>();

  // Only calculate distances for a subset of tiles to keep it fast
  const sampleTiles = validTiles.length > 20
    ? shuffleArray([...validTiles]).slice(0, 20)
    : validTiles;

  for (const tile of sampleTiles) {
    const key = `${tile.x},${tile.y}`;
    distanceCache.set(key, calculateWalkingDistances(tiles, tile, enemies));
  }

  // Evaluate pairs of tiles
  for (let i = 0; i < sampleTiles.length; i++) {
    for (let j = i + 1; j < sampleTiles.length; j++) {
      const tile1 = sampleTiles[i];
      const tile2 = sampleTiles[j];

      const key1 = `${tile1.x},${tile1.y}`;
      const key2 = `${tile2.x},${tile2.y}`;

      // Get walking distance between them
      const distances1 = distanceCache.get(key1);
      const walkingDistance = distances1?.get(key2) ?? Infinity;

      // If unreachable by walking, teleporter is very valuable!
      // If reachable, check if teleporter saves significant distance
      const directDistance = euclideanDistance(tile1, tile2);

      // Skip if tiles are too close (teleporter not useful)
      if (directDistance < 3) continue;

      // Calculate strategic score with randomization
      // The score has a strategic component and a random component
      // This ensures placements are generally good but not always "optimal"
      let strategicScore = 0;

      // High walking distance = more valuable teleporter
      if (walkingDistance === Infinity) {
        // Connects otherwise unreachable areas - very valuable!
        strategicScore += 100;
      } else {
        // Saves moves - value based on moves saved
        const movesSaved = walkingDistance - 1; // Teleporting takes 1 move
        strategicScore += movesSaved * 5;
      }

      // Bonus if near enemies (tactical positioning)
      // But not TOO close (that makes it too obvious)
      const nearEnemy1 = isNearEnemy(tile1, enemies, 4);
      const nearEnemy2 = isNearEnemy(tile2, enemies, 4);
      const veryNearEnemy1 = isNearEnemy(tile1, enemies, 2);
      const veryNearEnemy2 = isNearEnemy(tile2, enemies, 2);

      // Near enemies is good, but very near is sometimes too obvious
      if (nearEnemy1 && !veryNearEnemy1) strategicScore += 15;
      else if (veryNearEnemy1) strategicScore += 8; // Still useful but maybe too obvious
      if (nearEnemy2 && !veryNearEnemy2) strategicScore += 15;
      else if (veryNearEnemy2) strategicScore += 8;

      // Bonus for corner/edge positions (hard to reach otherwise)
      if (isCornerOrEdge(tile1, tiles)) strategicScore += 10;
      if (isCornerOrEdge(tile2, tiles)) strategicScore += 10;

      // Slight bonus for moderate distances (not too close, not at opposite corners)
      const idealDistanceRatio = directDistance / mapSize;
      if (idealDistanceRatio > 0.3 && idealDistanceRatio < 0.7) {
        strategicScore += 5;
      }

      // Add randomness to make placements less predictable
      // Random factor is 0-40% of the strategic score (or 10-30 base points)
      const randomFactor = Math.random() * Math.max(strategicScore * 0.4, 30);

      // Final score combines strategy and randomness
      const score = strategicScore + randomFactor;

      // Lower minimum threshold to allow more variety
      if (strategicScore > 5 || (strategicScore > 0 && Math.random() < 0.3)) {
        candidates.push({
          tile1,
          tile2,
          score,
          walkingDistance,
          directDistance,
        });
      }
    }
  }

  // Sort by score (highest first, but randomness means not always "best" picks)
  candidates.sort((a, b) => b.score - a.score);

  // Sometimes skip the top candidate to add variety
  // This prevents always picking the "most obvious" strategic spot
  const selectedPairs: TeleporterPairCandidate[] = [];
  const usedTiles = new Set<string>();
  let skipCount = 0;
  const maxSkips = Math.floor(Math.random() * 3); // Skip 0-2 top candidates randomly

  for (const candidate of candidates) {
    const key1 = `${candidate.tile1.x},${candidate.tile1.y}`;
    const key2 = `${candidate.tile2.x},${candidate.tile2.y}`;

    if (!usedTiles.has(key1) && !usedTiles.has(key2)) {
      // Randomly skip some top candidates to add variety
      if (skipCount < maxSkips && Math.random() < 0.4) {
        skipCount++;
        continue;
      }

      selectedPairs.push(candidate);
      usedTiles.add(key1);
      usedTiles.add(key2);

      if (selectedPairs.length >= maxPairs) break;
    }
  }

  return selectedPairs;
}

// ==========================================
// SPECIAL TILE PLACEMENT
// ==========================================

function placeSpecialTiles(
  tiles: TileOrNull[][],
  enemies: PlacedEnemy[],
  params: GenerationParameters
): TileOrNull[][] {
  if (params.enabledTileTypes.length === 0) {
    return tiles;
  }

  const result = deepCloneTiles(tiles);

  // Tile count based on difficulty
  let tileCount = {
    easy: 0,
    medium: randomInt(1, 2),
    hard: randomInt(2, 4),
    expert: randomInt(3, 6),
  }[params.difficulty];

  // If force is enabled, guarantee at least 1 special tile (or 2 for teleporters which need pairs)
  if (params.forceSpecialTiles && tileCount === 0) {
    tileCount = 2; // Use 2 to allow for teleporter pairs
  }

  if (tileCount === 0) return result;

  // Get valid tiles (empty, not occupied by enemy)
  const occupiedSet = new Set(enemies.map(e => `${e.x},${e.y}`));
  const validTiles: TileCoord[] = [];

  for (let y = 0; y < result.length; y++) {
    for (let x = 0; x < result[y].length; x++) {
      const tile = result[y][x];
      if (tile && tile.type === ('empty' as TileType) && !occupiedSet.has(`${x},${y}`)) {
        validTiles.push({ x, y });
      }
    }
  }

  // Separate teleport tile types from non-teleport types
  const teleportTileTypes: string[] = [];
  const nonTeleportTileTypes: string[] = [];

  for (const tileTypeId of params.enabledTileTypes) {
    const customTile = loadTileType(tileTypeId);
    if (!customTile) continue;

    const hasTeleport = customTile.behaviors?.some(b => b.type === 'teleport');
    if (hasTeleport) {
      teleportTileTypes.push(tileTypeId);
    } else {
      nonTeleportTileTypes.push(tileTypeId);
    }
  }

  let tilesPlaced = 0;
  const usedTiles = new Set<string>();

  // STRATEGIC TELEPORTER PLACEMENT
  // Place teleporters first using smart positioning
  if (teleportTileTypes.length > 0) {
    // Determine how many teleporter pairs to place (max 1-2 based on difficulty)
    const maxTeleporterPairs = {
      easy: 0,
      medium: 1,
      hard: 1,
      expert: 2,
    }[params.difficulty];

    // How many pairs can we actually place?
    const teleporterPairsToPlace = Math.min(
      maxTeleporterPairs,
      teleportTileTypes.length,
      Math.floor((tileCount - tilesPlaced) / 2)
    );

    if (teleporterPairsToPlace > 0) {
      // Find strategic positions for teleporters
      const strategicPairs = findStrategicTeleporterPositions(
        result,
        enemies,
        validTiles.filter(t => !usedTiles.has(`${t.x},${t.y}`)),
        teleporterPairsToPlace
      );

      // Place teleporter pairs at strategic positions
      const shuffledTeleportTypes = shuffleArray([...teleportTileTypes]);

      for (let i = 0; i < strategicPairs.length && i < shuffledTeleportTypes.length; i++) {
        const pair = strategicPairs[i];
        const tileTypeId = shuffledTeleportTypes[i];
        const groupId = `gen_teleport_${Date.now()}_${Math.random().toString(36).substr(2, 5)}_${i}`;

        // Place first tile of pair
        result[pair.tile1.y][pair.tile1.x] = {
          ...result[pair.tile1.y][pair.tile1.x]!,
          customTileTypeId: tileTypeId,
          teleportGroupId: groupId,
        };
        usedTiles.add(`${pair.tile1.x},${pair.tile1.y}`);

        // Place second tile of pair
        result[pair.tile2.y][pair.tile2.x] = {
          ...result[pair.tile2.y][pair.tile2.x]!,
          customTileTypeId: tileTypeId,
          teleportGroupId: groupId,
        };
        usedTiles.add(`${pair.tile2.x},${pair.tile2.y}`);

        tilesPlaced += 2;
      }
    }
  }

  // PLACE NON-TELEPORT SPECIAL TILES
  // Use remaining tile count for non-teleport special tiles
  if (nonTeleportTileTypes.length > 0 && tilesPlaced < tileCount) {
    const shuffledTypes = shuffleArray([...nonTeleportTileTypes]);
    const availableTiles = validTiles.filter(t => !usedTiles.has(`${t.x},${t.y}`));
    const shuffledTiles = shuffleArray(availableTiles);

    let typeIndex = 0;
    for (const pos of shuffledTiles) {
      if (tilesPlaced >= tileCount) break;

      const tileTypeId = shuffledTypes[typeIndex % shuffledTypes.length];
      result[pos.y][pos.x] = {
        ...result[pos.y][pos.x]!,
        customTileTypeId: tileTypeId,
      };
      usedTiles.add(`${pos.x},${pos.y}`);
      tilesPlaced++;
      typeIndex++;
    }
  }

  return result;
}

// ==========================================
// MAIN GENERATION
// ==========================================

function generateLayout(params: GenerationParameters): TileOrNull[][] {
  // Step 1: Create empty grid
  let tiles = createEmptyGrid(params.width, params.height);

  // Step 2: Add void regions if enabled
  if (params.enableVoidTiles) {
    tiles = addVoidRegions(tiles, params.difficulty, params.forceVoidTiles);
  }

  // Step 3: Add walls based on difficulty
  tiles = addWalls(tiles, params.difficulty);

  // Step 4: Ensure connectivity
  tiles = ensureConnectivity(tiles);

  return tiles;
}

function buildPuzzle(
  layout: LayoutCandidate,
  params: GenerationParameters
): Puzzle {
  return {
    id: `puzzle_gen_${Date.now()}`,
    date: new Date().toISOString().split('T')[0],
    name: `Generated ${params.difficulty.charAt(0).toUpperCase() + params.difficulty.slice(1)} Puzzle`,
    width: params.width,
    height: params.height,
    tiles: layout.tiles,
    enemies: layout.enemies,
    collectibles: layout.collectibles,
    placedObjects: [],
    availableCharacters: params.availableCharacters,
    winConditions: params.winConditions,
    maxCharacters: params.maxCharacters,
    maxTurns: Math.min(params.maxTurns || 100, 100), // Hard cap at 100 turns
    lives: params.lives ?? 3,
    skinId: params.skinId || 'builtin_dungeon',
  };
}

/**
 * Generate a solvable puzzle based on the given parameters
 */
export async function generatePuzzle(
  params: GenerationParameters,
  options: {
    maxAttempts?: number;
    progressCallback?: (progress: GenerationProgress) => void;
  } = {}
): Promise<GenerationResult> {
  const startTime = performance.now();
  const maxAttempts = options.maxAttempts ?? 10;

  // Validate parameters
  const validationErrors = validateGenerationParams(params);
  if (validationErrors.length > 0) {
    return {
      success: false,
      generationTimeMs: performance.now() - startTime,
      attemptsUsed: 0,
      error: validationErrors.join('; '),
    };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Yield to UI before each attempt
    await new Promise(resolve => setTimeout(resolve, 10));

    options.progressCallback?.({
      attempt,
      maxAttempts,
      phase: 'generating',
      message: `Generating layout (attempt ${attempt}/${maxAttempts})...`,
    });

    // Yield again after callback
    await new Promise(resolve => setTimeout(resolve, 10));

    // Step 1: Generate base layout
    const tiles = generateLayout(params);

    // Step 2: Place enemies
    const enemies = placeEnemies(tiles, params);

    // Step 3: Add special tiles
    const tilesWithSpecial = placeSpecialTiles(tiles, enemies, params);

    // Step 4: Build layout candidate
    const layout: LayoutCandidate = {
      tiles: tilesWithSpecial,
      enemies,
      collectibles: [],
    };

    // Step 5: Build puzzle object
    const puzzle = buildPuzzle(layout, params);

    // Step 6: Quick validate
    const quickResult = quickValidate(puzzle);
    if (!quickResult.valid) {
      continue; // Try again
    }

    // Step 7: Full validation with solver
    options.progressCallback?.({
      attempt,
      maxAttempts,
      phase: 'validating',
      message: `Validating solvability (attempt ${attempt}/${maxAttempts})...`,
    });

    // Use setTimeout to allow UI updates (async yield)
    await new Promise(resolve => setTimeout(resolve, 50));

    // Use much lower limits for generation - we just need to know if it's solvable
    // not find the absolute optimal solution
    const maxCombos = getMaxCombinationsForDifficulty(params.difficulty, enemies.length);

    // Use async solver that yields to browser to prevent freezing
    const validation = await solvePuzzleAsync(puzzle, {
      maxSimulationTurns: Math.min(params.maxTurns || 100, 50), // Cap at 50 turns for speed
      maxCombinations: maxCombos,
      findFastest: false, // Don't search for fastest - just find ANY solution
      yieldEvery: 20, // Yield frequently to keep UI responsive
    });

    if (validation.solvable) {
      // Set par values from solution
      puzzle.parCharacters = validation.minCharactersNeeded ?? undefined;
      puzzle.parTurns = validation.solutionFound?.turnsToWin ?? undefined;

      return {
        success: true,
        puzzle,
        validationResult: validation,
        generationTimeMs: performance.now() - startTime,
        attemptsUsed: attempt,
      };
    }
  }

  return {
    success: false,
    generationTimeMs: performance.now() - startTime,
    attemptsUsed: maxAttempts,
    error: `Could not generate solvable puzzle after ${maxAttempts} attempts. Try adjusting parameters (fewer enemies, more characters, or larger map).`,
  };
}

/**
 * Validate generation parameters before attempting generation
 */
export function validateGenerationParams(params: GenerationParameters): string[] {
  const errors: string[] = [];

  // Grid size validation
  if (params.width < 4 || params.width > 20) {
    errors.push('Width must be between 4 and 20');
  }
  if (params.height < 4 || params.height > 20) {
    errors.push('Height must be between 4 and 20');
  }

  // Character validation
  if (!params.availableCharacters || params.availableCharacters.length === 0) {
    errors.push('At least one character must be selected');
  }
  if (params.maxCharacters < 1 || params.maxCharacters > 4) {
    errors.push('Max characters must be between 1 and 4');
  }

  // Enemy validation for defeat_all_enemies condition
  const hasDefeatCondition = params.winConditions?.some(
    c => c.type === 'defeat_all_enemies' || c.type === 'defeat_boss'
  );
  const totalEnemies = params.enemyTypes?.reduce((sum, e) => sum + e.count, 0) || 0;

  if (hasDefeatCondition && totalEnemies === 0) {
    errors.push('Need at least one enemy for "defeat enemies" win condition');
  }

  // Space validation
  const gridArea = params.width * params.height;
  const minRequired = totalEnemies + params.maxCharacters + 5;

  if (gridArea < minRequired) {
    errors.push('Grid too small for the number of enemies and characters');
  }

  // Win condition validation
  if (!params.winConditions || params.winConditions.length === 0) {
    errors.push('At least one win condition must be specified');
  }

  return errors;
}

/**
 * Get recommended parameters for a difficulty level
 */
export function getDifficultyPreset(difficulty: DifficultyLevel): Partial<GenerationParameters> {
  const presets: Record<DifficultyLevel, Partial<GenerationParameters>> = {
    easy: {
      width: 6,
      height: 6,
      maxCharacters: 2,
      enableVoidTiles: false,
      enabledTileTypes: [],
      maxTurns: 100,
    },
    medium: {
      width: 8,
      height: 8,
      maxCharacters: 3,
      enableVoidTiles: false,
      enabledTileTypes: [],
      maxTurns: 100,
    },
    hard: {
      width: 10,
      height: 10,
      maxCharacters: 3,
      enableVoidTiles: true,
      enabledTileTypes: [],
      maxTurns: 100,
    },
    expert: {
      width: 12,
      height: 10,
      maxCharacters: 4,
      enableVoidTiles: true,
      enabledTileTypes: [],
      maxTurns: 100,
    },
  };

  return presets[difficulty];
}
