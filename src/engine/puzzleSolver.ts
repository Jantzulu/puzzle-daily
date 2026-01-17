// Puzzle Solver - Validates if a puzzle is solvable and finds minimum characters needed
// Uses brute-force search across all valid placement combinations

import { initializeGameState, executeTurn } from './simulation';
import { getCharacter } from '../data/characters';
import { loadTileType, loadCollectible } from '../utils/assetStorage';
import type { Puzzle, PlacedCharacter, GameState, Direction, TileType } from '../types/game';

export interface SolverResult {
  solvable: boolean;
  minCharactersNeeded: number | null;
  solutionFound: PlacementSolution | null;
  totalCombinationsTested: number;
  searchTimeMs: number;
  error?: string;
}

export interface PlacementSolution {
  placements: CharacterPlacement[];
  turnsToWin: number;
}

export interface CharacterPlacement {
  characterId: string;
  x: number;
  y: number;
  facing: Direction;
}

interface ValidTile {
  x: number;
  y: number;
}

/**
 * Find all valid tiles where characters can be placed
 */
function findValidPlacementTiles(puzzle: Puzzle): ValidTile[] {
  const validTiles: ValidTile[] = [];

  for (let y = 0; y < puzzle.height; y++) {
    for (let x = 0; x < puzzle.width; x++) {
      const tile = puzzle.tiles[y]?.[x];
      if (!tile) continue; // Non-existent tile

      // Can't place on walls
      if (tile.type === 'wall' as TileType) continue;

      // Can't place on tiles with enemies
      const hasEnemy = puzzle.enemies.some(e => e.x === x && e.y === y && !e.dead);
      if (hasEnemy) continue;

      // Can't place on custom tiles that have preventPlacement enabled
      if (tile.customTileTypeId) {
        const customTileType = loadTileType(tile.customTileTypeId);
        if (customTileType?.preventPlacement) continue;
      }

      // Can't place on tiles with collectibles that have preventPlacement enabled
      const collectiblesAtPosition = puzzle.collectibles.filter(
        c => c.x === x && c.y === y && !c.collected
      );
      let hasBlockingCollectible = false;
      for (const placed of collectiblesAtPosition) {
        if (placed.collectibleId) {
          const collectible = loadCollectible(placed.collectibleId);
          if (collectible?.preventPlacement) {
            hasBlockingCollectible = true;
            break;
          }
        }
      }
      if (hasBlockingCollectible) continue;

      validTiles.push({ x, y });
    }
  }

  return validTiles;
}

/**
 * Generate all combinations of k items from array
 */
function* combinations<T>(array: T[], k: number): Generator<T[]> {
  if (k === 0) {
    yield [];
    return;
  }
  if (array.length < k) return;

  const [first, ...rest] = array;

  // Combinations including first element
  for (const combo of combinations(rest, k - 1)) {
    yield [first, ...combo];
  }

  // Combinations excluding first element
  yield* combinations(rest, k);
}

/**
 * Generate all possible placements for a set of characters on valid tiles
 * Uses each character's actual defaultFacing (not all 8 directions)
 */
function* generatePlacements(
  characters: string[],
  tiles: ValidTile[]
): Generator<CharacterPlacement[]> {
  if (characters.length === 0) {
    yield [];
    return;
  }

  const [charId, ...remainingChars] = characters;

  // Get the character's actual default facing direction
  const charData = getCharacter(charId);
  const facing = charData?.defaultFacing || ('south' as Direction);

  for (const tile of tiles) {
    const placement: CharacterPlacement = {
      characterId: charId,
      x: tile.x,
      y: tile.y,
      facing,
    };

    // Remaining tiles (exclude current to prevent overlaps)
    const remainingTiles = tiles.filter(t => t.x !== tile.x || t.y !== tile.y);

    for (const restPlacements of generatePlacements(remainingChars, remainingTiles)) {
      yield [placement, ...restPlacements];
    }
  }
}

/**
 * Create PlacedCharacter array from placements
 */
function createPlacedCharacters(placements: CharacterPlacement[]): PlacedCharacter[] {
  return placements.map(p => {
    const charData = getCharacter(p.characterId);
    return {
      characterId: p.characterId,
      x: p.x,
      y: p.y,
      facing: p.facing,
      currentHealth: charData?.health || 1,
      actionIndex: 0,
      active: true,
      dead: false,
    };
  });
}

/**
 * Deep clone a puzzle to avoid mutation
 */
function clonePuzzle(puzzle: Puzzle): Puzzle {
  return {
    ...puzzle,
    tiles: puzzle.tiles.map(row =>
      row.map(tile => tile ? { ...tile } : null)
    ),
    enemies: puzzle.enemies.map(e => ({ ...e })),
    collectibles: puzzle.collectibles.map(c => ({ ...c })),
    placedObjects: puzzle.placedObjects?.map(o => ({ ...o })),
    winConditions: [...puzzle.winConditions],
    availableCharacters: [...puzzle.availableCharacters],
  };
}

/**
 * Simulate a puzzle with given character placements
 * Returns 'victory' | 'defeat' | 'timeout' and turn count
 */
function simulatePuzzle(
  puzzle: Puzzle,
  placements: CharacterPlacement[],
  maxTurns: number = 200
): { result: 'victory' | 'defeat' | 'timeout'; turns: number } {
  // Clone puzzle to avoid mutation
  const puzzleCopy = clonePuzzle(puzzle);

  // Initialize game state
  const gameState = initializeGameState(puzzleCopy);

  // Add placed characters
  gameState.placedCharacters = createPlacedCharacters(placements);
  gameState.gameStatus = 'running';

  // Enable headless mode for instant projectile resolution
  gameState.headlessMode = true;

  // Run simulation
  let turns = 0;
  while (turns < maxTurns) {
    executeTurn(gameState);
    turns++;

    if (gameState.gameStatus === 'victory') {
      return { result: 'victory', turns };
    }

    if (gameState.gameStatus === 'defeat') {
      return { result: 'defeat', turns };
    }

    // Extra check: if no active characters left and still running, it's effectively over
    const hasActiveOrAlive = gameState.placedCharacters.some(c =>
      (c.active && !c.dead) || (!c.dead)
    );
    if (!hasActiveOrAlive && gameState.gameStatus === 'running') {
      return { result: 'defeat', turns };
    }
  }

  return { result: 'timeout', turns };
}

/**
 * Validate a puzzle and find the minimum characters needed to solve it
 *
 * @param puzzle The puzzle to validate
 * @param options Configuration options
 * @returns SolverResult with solvability info
 */
export function solvePuzzle(
  puzzle: Puzzle,
  options: {
    maxSimulationTurns?: number;
    maxCombinations?: number;
    findFastest?: boolean; // If true, find fastest solution among minimum chars (slower but better)
    progressCallback?: (progress: { tested: number; found: boolean }) => void;
  } = {}
): SolverResult {
  const startTime = performance.now();
  const maxTurns = options.maxSimulationTurns ?? 200;
  const maxCombinations = options.maxCombinations ?? 100000;
  const findFastest = options.findFastest ?? true; // Default to finding fastest solution

  // Find valid placement tiles
  const validTiles = findValidPlacementTiles(puzzle);

  if (validTiles.length === 0) {
    return {
      solvable: false,
      minCharactersNeeded: null,
      solutionFound: null,
      totalCombinationsTested: 0,
      searchTimeMs: performance.now() - startTime,
      error: 'No valid tiles for character placement',
    };
  }

  const availableCharacters = puzzle.availableCharacters;

  if (availableCharacters.length === 0) {
    return {
      solvable: false,
      minCharactersNeeded: null,
      solutionFound: null,
      totalCombinationsTested: 0,
      searchTimeMs: performance.now() - startTime,
      error: 'No available characters',
    };
  }

  let totalTested = 0;
  let bestSolution: PlacementSolution | null = null;
  let foundMinChars: number | null = null;

  // Try with increasing number of characters (to find minimum)
  const maxChars = Math.min(puzzle.maxCharacters, availableCharacters.length);

  for (let numChars = 1; numChars <= maxChars; numChars++) {
    // If we already found a solution with fewer characters, stop
    if (foundMinChars !== null && numChars > foundMinChars) {
      break;
    }

    // Get all combinations of numChars characters from available
    for (const charCombo of combinations(availableCharacters, numChars)) {
      // Generate all placements for this character combination
      // Each character uses its own defaultFacing (not all 8 directions)
      for (const placements of generatePlacements(charCombo, validTiles)) {
        totalTested++;

        if (totalTested > maxCombinations) {
          return {
            solvable: bestSolution !== null,
            minCharactersNeeded: foundMinChars,
            solutionFound: bestSolution,
            totalCombinationsTested: totalTested,
            searchTimeMs: performance.now() - startTime,
            error: `Search limit reached (${maxCombinations} combinations)`,
          };
        }

        // Report progress periodically
        if (options.progressCallback && totalTested % 1000 === 0) {
          options.progressCallback({ tested: totalTested, found: bestSolution !== null });
        }

        const { result, turns } = simulatePuzzle(puzzle, placements, maxTurns);

        if (result === 'victory') {
          // Found a solution!
          if (foundMinChars === null) {
            // First solution found - this is the minimum character count
            foundMinChars = numChars;
          }

          // Check if this is the fastest solution so far
          if (!bestSolution || turns < bestSolution.turnsToWin) {
            bestSolution = {
              placements,
              turnsToWin: turns,
            };
          }

          // If not finding fastest, return immediately
          if (!findFastest) {
            return {
              solvable: true,
              minCharactersNeeded: numChars,
              solutionFound: bestSolution,
              totalCombinationsTested: totalTested,
              searchTimeMs: performance.now() - startTime,
            };
          }
        }
      }
    }

    // If we found a solution at this character count and we're finding fastest,
    // we've now tested all placements with min chars, so return the best
    if (foundMinChars !== null && foundMinChars === numChars) {
      return {
        solvable: true,
        minCharactersNeeded: foundMinChars,
        solutionFound: bestSolution,
        totalCombinationsTested: totalTested,
        searchTimeMs: performance.now() - startTime,
      };
    }
  }

  // No solution found with any combination
  return {
    solvable: false,
    minCharactersNeeded: null,
    solutionFound: null,
    totalCombinationsTested: totalTested,
    searchTimeMs: performance.now() - startTime,
  };
}

/**
 * Quick check if a puzzle has any chance of being solvable
 * (basic sanity checks before running full solver)
 */
export function quickValidate(puzzle: Puzzle): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check for available characters
  if (!puzzle.availableCharacters || puzzle.availableCharacters.length === 0) {
    issues.push('No characters available for this puzzle');
  }

  // Check for valid placement tiles
  const validTiles = findValidPlacementTiles(puzzle);
  if (validTiles.length === 0) {
    issues.push('No valid tiles for character placement');
  }

  // Check win conditions
  if (!puzzle.winConditions || puzzle.winConditions.length === 0) {
    issues.push('No win conditions defined');
  }

  // Check for defeat_all_enemies condition with no enemies
  const hasDefeatAllCondition = puzzle.winConditions?.some(c => c.type === 'defeat_all_enemies');
  if (hasDefeatAllCondition && (!puzzle.enemies || puzzle.enemies.length === 0)) {
    issues.push('Win condition requires defeating enemies, but no enemies exist');
  }

  // Check for collect_all condition with no collectibles
  const hasCollectAllCondition = puzzle.winConditions?.some(c => c.type === 'collect_all');
  if (hasCollectAllCondition && (!puzzle.collectibles || puzzle.collectibles.length === 0)) {
    issues.push('Win condition requires collecting items, but no collectibles exist');
  }

  // Check for reach_goal condition with no goal tiles
  const hasReachGoalCondition = puzzle.winConditions?.some(c => c.type === 'reach_goal');
  if (hasReachGoalCondition) {
    const hasGoalTile = puzzle.tiles.some(row =>
      row.some(tile => tile?.type === 'goal' as TileType)
    );
    if (!hasGoalTile) {
      issues.push('Win condition requires reaching a goal, but no goal tiles exist');
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
