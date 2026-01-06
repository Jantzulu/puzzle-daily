import React, { useRef, useEffect, useState } from 'react';
import type { GameState, PlacedCharacter, PlacedEnemy, Projectile, ParticleEffect, BorderConfig, CharacterAction, EnemyBehavior } from '../../types/game';
import { TileType, Direction, ActionType } from '../../types/game';
import { getCharacter } from '../../data/characters';
import { getEnemy } from '../../data/enemies';
import { drawSprite, drawDeathSprite, hasDeathAnimation } from '../editor/SpriteEditor';
import type { CustomCharacter, CustomEnemy } from '../../utils/assetStorage';
import { updateProjectiles, updateParticles, executeParallelActions } from '../../engine/simulation';

// Movement action types - entities with these actions should show direction arrow
const MOVEMENT_ACTIONS = new Set([
  ActionType.MOVE_FORWARD,
  ActionType.MOVE_BACKWARD,
  ActionType.MOVE_LEFT,
  ActionType.MOVE_RIGHT,
  ActionType.MOVE_DIAGONAL_NE,
  ActionType.MOVE_DIAGONAL_NW,
  ActionType.MOVE_DIAGONAL_SE,
  ActionType.MOVE_DIAGONAL_SW,
]);

/**
 * Check if a character's behavior contains any movement actions
 */
function hasMovementActions(behavior: CharacterAction[]): boolean {
  return behavior.some(action => MOVEMENT_ACTIONS.has(action.type));
}

/**
 * Check if an enemy's behavior pattern contains any movement actions
 */
function enemyHasMovementActions(behavior: EnemyBehavior | undefined): boolean {
  if (!behavior || behavior.type !== 'active') return false;
  if (!behavior.pattern || behavior.pattern.length === 0) return false;
  return behavior.pattern.some(action => MOVEMENT_ACTIONS.has(action.type));
}

interface AnimatedGameBoardProps {
  gameState: GameState;
  onTileClick?: (x: number, y: number) => void;
}

const TILE_SIZE = 48;
const BORDER_SIZE = 48; // Border offset for canvas layout (space reserved for potential interior walls)
const SIDE_BORDER_SIZE = 24; // Side border offset for canvas layout
const ANIMATION_DURATION = 400; // ms per move (faster animation, half the turn interval)
const MOVE_DURATION = 200; // First 50%: moving between tiles
const IDLE_DURATION = 200; // Second 50%: idle on destination tile
const DEATH_ANIMATION_DURATION = 500; // ms for death animation

const COLORS = {
  empty: '#2a2a2a',
  wall: '#4a4a4a',
  grid: '#1a1a1a',
  character: '#4caf50',
  enemy: '#f44336',
  deadEnemy: '#661111',
  collectible: '#ffd700',
};

// ==========================================
// SMART BORDER TYPES AND DETECTION
// ==========================================

type EdgeType = 'top' | 'bottom' | 'left' | 'right';

interface BorderEdge {
  x: number;
  y: number;
  edge: EdgeType;
  isInteriorWall: boolean; // True if this is an interior wall (should be rendered as tall front-facing wall)
}

// Corner types for smart border rendering
// Convex = outer corner (puzzle sticks out), Concave = inner corner (puzzle goes inward)
type CornerType = 'convex-tl' | 'convex-tr' | 'convex-bl' | 'convex-br' |
                  'concave-tl' | 'concave-tr' | 'concave-bl' | 'concave-br';

interface BorderCorner {
  x: number;
  y: number;
  type: CornerType;
}

interface SmartBorderData {
  edges: BorderEdge[];
  corners: BorderCorner[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

/**
 * Check if a tile at (x, y) is playable (exists and is not null)
 */
function isTilePlayable(tiles: (import('../../types/game').TileOrNull)[][], x: number, y: number, width: number, height: number): boolean {
  if (x < 0 || x >= width || y < 0 || y >= height) return false;
  return tiles[y]?.[x] !== null && tiles[y]?.[x] !== undefined;
}

/**
 * Check if a void tile at (voidX, voidY) is a small void that should skip interior borders
 * This includes:
 * - Interior holes (surrounded on all 4 cardinal sides by playable tiles)
 * - Edge notches (1-tile deep voids at the puzzle edge)
 * Small voids look cramped with borders inside, so we skip them
 */
function isSmallVoidForBorderSkip(tiles: (import('../../types/game').TileOrNull)[][], voidX: number, voidY: number, width: number, height: number): boolean {
  // Check cardinal neighbors - count how many are playable vs void/edge
  const topPlayable = isTilePlayable(tiles, voidX, voidY - 1, width, height);
  const bottomPlayable = isTilePlayable(tiles, voidX, voidY + 1, width, height);
  const leftPlayable = isTilePlayable(tiles, voidX - 1, voidY, width, height);
  const rightPlayable = isTilePlayable(tiles, voidX + 1, voidY, width, height);

  // Check if neighbors are out of bounds (edge of puzzle grid)
  const topIsEdge = voidY - 1 < 0;
  const bottomIsEdge = voidY + 1 >= height;
  const leftIsEdge = voidX - 1 < 0;
  const rightIsEdge = voidX + 1 >= width;

  // Count playable neighbors
  const playableCount = [topPlayable, bottomPlayable, leftPlayable, rightPlayable].filter(Boolean).length;

  // If surrounded on all 4 sides by playable tiles, it's an interior hole - skip borders
  if (playableCount === 4) {
    return true;
  }

  // For edge notches: if 3 sides are playable and 1 side is the puzzle edge, skip borders
  // This handles 1-tile deep notches cut into the edge of the puzzle
  if (playableCount === 3) {
    const edgeCount = [topIsEdge, bottomIsEdge, leftIsEdge, rightIsEdge].filter(Boolean).length;
    if (edgeCount >= 1) {
      return true;
    }
  }

  // For corner notches: if 2 sides are playable and 2 sides are puzzle edge
  if (playableCount === 2) {
    const edgeCount = [topIsEdge, bottomIsEdge, leftIsEdge, rightIsEdge].filter(Boolean).length;
    if (edgeCount >= 2) {
      return true;
    }
  }

  return false;
}

/**
 * Check if an edge represents an "interior wall" that should be rendered as a tall front-facing wall.
 *
 * In top-down dungeon style:
 * - Only TOP edges can be interior walls (when you're looking "up" at a wall from below)
 * - A top edge is an interior wall in these cases:
 *   1. It's on the absolute top row of the playable area (the main "ceiling" of the dungeon)
 *   2. There are playable tiles above the void (interior corridors/rooms)
 * - Bottom, left, and right edges are always thin trim (floor edges or side views)
 */
function isInteriorWallEdge(
  tiles: (import('../../types/game').TileOrNull)[][],
  tileX: number,
  tileY: number,
  edge: EdgeType,
  width: number,
  height: number
): boolean {
  // Only top edges can be interior walls (front-facing walls you look up at)
  if (edge !== 'top') {
    return false;
  }

  // Check if this tile is on the topmost row of playable tiles in this column
  // If so, it's the main ceiling wall and should be tall
  let isTopmostInColumn = true;
  for (let checkY = 0; checkY < tileY; checkY++) {
    if (isTilePlayable(tiles, tileX, checkY, width, height)) {
      isTopmostInColumn = false;
      break;
    }
  }

  if (isTopmostInColumn) {
    return true; // This is the ceiling - render as tall interior wall
  }

  // For non-topmost tiles, check if there are playable tiles above the void
  // This handles interior corridors where you look up at a wall with more dungeon above
  const voidY = tileY - 1;
  for (let checkY = voidY - 1; checkY >= 0; checkY--) {
    if (isTilePlayable(tiles, tileX, checkY, width, height)) {
      return true; // Found playable space above - this is an interior wall
    }
  }

  return false; // No playable space above and not the topmost - outer perimeter edge
}

/**
 * Compute smart border edges and corners based on actual playable tile shapes
 */
function computeSmartBorder(tiles: (import('../../types/game').TileOrNull)[][], width: number, height: number): SmartBorderData {
  const edges: BorderEdge[] = [];
  const corners: BorderCorner[] = [];
  let minX = width, maxX = -1, minY = height, maxY = -1;

  // First, identify all small voids where we should skip interior borders
  // This includes interior holes AND edge notches
  const smallVoidsToSkip = new Set<string>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isTilePlayable(tiles, x, y, width, height) && isSmallVoidForBorderSkip(tiles, x, y, width, height)) {
        smallVoidsToSkip.add(`${x},${y}`);
      }
    }
  }

  // Scan all tiles to find edges adjacent to void/null
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isPlayable = isTilePlayable(tiles, x, y, width, height);
      if (!isPlayable) continue;

      // Track bounds
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      // Check all 4 edges - if adjacent tile is void/null/out-of-bounds, we need a border
      // UNLESS the adjacent void is a small interior hole (skip borders for those)
      const topVoid = !isTilePlayable(tiles, x, y - 1, width, height);
      const bottomVoid = !isTilePlayable(tiles, x, y + 1, width, height);
      const leftVoid = !isTilePlayable(tiles, x - 1, y, width, height);
      const rightVoid = !isTilePlayable(tiles, x + 1, y, width, height);

      // Skip border if the adjacent void is a small void (interior hole or edge notch)
      const hasTop = topVoid && !smallVoidsToSkip.has(`${x},${y - 1}`);
      const hasBottom = bottomVoid && !smallVoidsToSkip.has(`${x},${y + 1}`);
      const hasLeft = leftVoid && !smallVoidsToSkip.has(`${x - 1},${y}`);
      const hasRight = rightVoid && !smallVoidsToSkip.has(`${x + 1},${y}`);

      if (hasTop) edges.push({ x, y, edge: 'top', isInteriorWall: isInteriorWallEdge(tiles, x, y, 'top', width, height) });
      if (hasBottom) edges.push({ x, y, edge: 'bottom', isInteriorWall: false }); // Bottom edges are always thin trim
      if (hasLeft) edges.push({ x, y, edge: 'left', isInteriorWall: false }); // Side edges are always thin trim
      if (hasRight) edges.push({ x, y, edge: 'right', isInteriorWall: false }); // Side edges are always thin trim

      // Detect corners by checking diagonal neighbors and edge combinations
      const topLeft = !isTilePlayable(tiles, x - 1, y - 1, width, height);
      const topRight = !isTilePlayable(tiles, x + 1, y - 1, width, height);
      const bottomLeft = !isTilePlayable(tiles, x - 1, y + 1, width, height);
      const bottomRight = !isTilePlayable(tiles, x + 1, y + 1, width, height);

      // Convex corners (outer corners - where two edges meet)
      if (hasTop && hasLeft) corners.push({ x, y, type: 'convex-tl' });
      if (hasTop && hasRight) corners.push({ x, y, type: 'convex-tr' });
      if (hasBottom && hasLeft) corners.push({ x, y, type: 'convex-bl' });
      if (hasBottom && hasRight) corners.push({ x, y, type: 'convex-br' });

      // Concave corners (inner corners - where diagonal is void but adjacent are playable)
      // Only draw if the diagonal void is not a small void (interior hole or edge notch)
      if (!hasTop && !hasLeft && topLeft && !smallVoidsToSkip.has(`${x - 1},${y - 1}`)) {
        corners.push({ x, y, type: 'concave-tl' });
      }
      if (!hasTop && !hasRight && topRight && !smallVoidsToSkip.has(`${x + 1},${y - 1}`)) {
        corners.push({ x, y, type: 'concave-tr' });
      }
      if (!hasBottom && !hasLeft && bottomLeft && !smallVoidsToSkip.has(`${x - 1},${y + 1}`)) {
        corners.push({ x, y, type: 'concave-bl' });
      }
      if (!hasBottom && !hasRight && bottomRight && !smallVoidsToSkip.has(`${x + 1},${y + 1}`)) {
        corners.push({ x, y, type: 'concave-br' });
      }
    }
  }

  return { edges, corners, bounds: { minX, maxX, minY, maxY } };
}

/**
 * Check if puzzle has irregular shape (any null tiles within bounds)
 */
function hasIrregularShape(tiles: (import('../../types/game').TileOrNull)[][], width: number, height: number): boolean {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y]?.[x] === null) return true;
    }
  }
  return false;
}

interface CharacterPosition {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startTime: number;
  facingDuringMove: Direction; // Direction character is moving (before wall lookahead changes it)
}

interface CharacterAttack {
  characterIndex: number;
  startTime: number;
  direction: Direction;
}

// Track death animation state
interface DeathAnimationState {
  startTime: number;
  x: number;
  y: number;
  facing: Direction;
}

export const AnimatedGameBoard: React.FC<AnimatedGameBoardProps> = ({ gameState, onTileClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const [characterPositions, setCharacterPositions] = useState<Map<number, CharacterPosition>>(new Map());
  const [enemyPositions, setEnemyPositions] = useState<Map<number, CharacterPosition>>(new Map());
  const prevCharactersRef = useRef<PlacedCharacter[]>([]);
  const prevEnemiesRef = useRef<PlacedEnemy[]>([]);
  const animationRef = useRef<number>();

  // Track death animations - keyed by entity ID (characterId or index)
  const [characterDeathAnimations, setCharacterDeathAnimations] = useState<Map<string, DeathAnimationState>>(new Map());
  const [enemyDeathAnimations, setEnemyDeathAnimations] = useState<Map<number, DeathAnimationState>>(new Map());
  const prevCharacterDeadStateRef = useRef<Map<string, boolean>>(new Map());
  const prevEnemyDeadStateRef = useRef<Map<number, boolean>>(new Map());

  // Detect character movement
  useEffect(() => {
    const newPositions = new Map<number, CharacterPosition>();
    const now = Date.now();

    gameState.placedCharacters.forEach((char, idx) => {
      const prevChar = prevCharactersRef.current[idx];
      const existing = characterPositions.get(idx);

      if (prevChar && (prevChar.x !== char.x || prevChar.y !== char.y)) {
        // Character moved!
        // Check if facing also changed (wall lookahead: turn + move in same turn)
        const facingChanged = prevChar.facing !== char.facing;

        newPositions.set(idx, {
          fromX: prevChar.x,
          fromY: prevChar.y,
          toX: char.x,
          toY: char.y,
          startTime: now,
          // If facing changed, use NEW facing (wall lookahead scenario)
          // Otherwise use old facing (normal movement)
          facingDuringMove: facingChanged ? char.facing : prevChar.facing,
        });
      } else if (prevChar && prevChar.facing !== char.facing) {
        // Character turned but didn't move (wall lookahead)
        // Create a short "turning" animation to update the arrow immediately
        newPositions.set(idx, {
          fromX: char.x,
          fromY: char.y,
          toX: char.x,
          toY: char.y,
          startTime: now,
          facingDuringMove: char.facing, // Show new facing immediately
        });
      } else if (existing && now - existing.startTime < ANIMATION_DURATION) {
        // Keep existing animation
        newPositions.set(idx, existing);
      }
    });

    setCharacterPositions(newPositions);
    prevCharactersRef.current = [...gameState.placedCharacters];
  }, [gameState.placedCharacters]);

  // Detect enemy movement
  useEffect(() => {
    const newPositions = new Map<number, CharacterPosition>();
    const now = Date.now();

    gameState.puzzle.enemies.forEach((enemy, idx) => {
      const prevEnemy = prevEnemiesRef.current[idx];
      const existing = enemyPositions.get(idx);

      if (prevEnemy && (prevEnemy.x !== enemy.x || prevEnemy.y !== enemy.y)) {
        // Enemy moved!
        // Check if facing also changed (wall lookahead: turn + move in same turn)
        const facingChanged = prevEnemy.facing !== enemy.facing;

        newPositions.set(idx, {
          fromX: prevEnemy.x,
          fromY: prevEnemy.y,
          toX: enemy.x,
          toY: enemy.y,
          startTime: now,
          // If facing changed, use NEW facing (wall lookahead scenario)
          // Otherwise use old facing (normal movement)
          facingDuringMove: facingChanged ? enemy.facing : (prevEnemy.facing || Direction.SOUTH),
        });
      } else if (prevEnemy && prevEnemy.facing !== enemy.facing) {
        // Enemy turned but didn't move (wall lookahead)
        // Create a short "turning" animation to update the arrow immediately
        newPositions.set(idx, {
          fromX: enemy.x,
          fromY: enemy.y,
          toX: enemy.x,
          toY: enemy.y,
          startTime: now,
          facingDuringMove: enemy.facing, // Show new facing immediately
        });
      } else if (existing && now - existing.startTime < ANIMATION_DURATION) {
        // Keep existing animation
        newPositions.set(idx, existing);
      }
    });

    setEnemyPositions(newPositions);
    prevEnemiesRef.current = [...gameState.puzzle.enemies];
  }, [gameState.puzzle.enemies]);

  // Detect character deaths and trigger death animations
  useEffect(() => {
    const now = Date.now();
    const newDeathAnimations = new Map(characterDeathAnimations);
    let hasChanges = false;

    gameState.placedCharacters.forEach((char) => {
      const wasDeadBefore = prevCharacterDeadStateRef.current.get(char.characterId) || false;
      const isDeadNow = char.dead || false;

      // Entity just died - start death animation
      if (!wasDeadBefore && isDeadNow) {
        newDeathAnimations.set(char.characterId, {
          startTime: now,
          x: char.x,
          y: char.y,
          facing: char.facing,
        });
        hasChanges = true;
      }

      prevCharacterDeadStateRef.current.set(char.characterId, isDeadNow);
    });

    // Clean up old death animations that have completed
    for (const [id, anim] of newDeathAnimations.entries()) {
      if (now - anim.startTime > DEATH_ANIMATION_DURATION) {
        newDeathAnimations.delete(id);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      setCharacterDeathAnimations(newDeathAnimations);
    }
  }, [gameState.placedCharacters]);

  // Detect enemy deaths and trigger death animations
  useEffect(() => {
    const now = Date.now();
    const newDeathAnimations = new Map(enemyDeathAnimations);
    let hasChanges = false;

    gameState.puzzle.enemies.forEach((enemy, idx) => {
      const wasDeadBefore = prevEnemyDeadStateRef.current.get(idx) || false;
      const isDeadNow = enemy.dead || false;

      // Entity just died - start death animation
      if (!wasDeadBefore && isDeadNow) {
        newDeathAnimations.set(idx, {
          startTime: now,
          x: enemy.x,
          y: enemy.y,
          facing: enemy.facing || Direction.SOUTH,
        });
        hasChanges = true;
      }

      prevEnemyDeadStateRef.current.set(idx, isDeadNow);
    });

    // Clean up old death animations that have completed
    for (const [idx, anim] of newDeathAnimations.entries()) {
      if (now - anim.startTime > DEATH_ANIMATION_DURATION) {
        newDeathAnimations.delete(idx);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      setEnemyDeathAnimations(newDeathAnimations);
    }
  }, [gameState.puzzle.enemies]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Disable image smoothing for crisp pixel art
      ctx.imageSmoothingEnabled = false;

      // Clear
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Calculate grid offset (for borders)
      const borderStyle = gameState.puzzle.borderConfig?.style || 'none';
      const hasBorder = borderStyle !== 'none';
      const offsetX = hasBorder ? SIDE_BORDER_SIZE : 0;
      const offsetY = hasBorder ? BORDER_SIZE : 0;

      // Draw border first (if enabled)
      if (hasBorder) {
        drawBorder(ctx, gameState.puzzle.width, gameState.puzzle.height, borderStyle, gameState.puzzle.borderConfig, gameState.puzzle.tiles);
      }

      // Save context and translate for grid rendering
      ctx.save();
      ctx.translate(offsetX, offsetY);

      // Execute parallel actions (time-based, runs independently of turns)
      if (gameState.gameStatus === 'running') {
        executeParallelActions(gameState);
      }

      // Update projectiles and particles (time-based, needs to run every frame)
      updateProjectiles(gameState);
      updateParticles(gameState);

      // Draw tiles
      for (let y = 0; y < gameState.puzzle.height; y++) {
        for (let x = 0; x < gameState.puzzle.width; x++) {
          const tile = gameState.puzzle.tiles[y][x];
          if (tile) {
            drawTile(ctx, x, y, tile.type);
          } else {
            // Draw void/null tile
            drawVoidTile(ctx, x, y);
          }
        }
      }

      // Draw collectibles
      gameState.puzzle.collectibles.forEach((collectible) => {
        if (!collectible.collected) {
          drawCollectible(ctx, collectible.x, collectible.y);
        }
      });

      const now = Date.now();

      // Draw projectiles (Phase 2 - between tiles and entities)
      if (gameState.activeProjectiles && gameState.activeProjectiles.length > 0) {
        console.log('[AnimatedGameBoard] Drawing', gameState.activeProjectiles.length, 'projectiles');
        gameState.activeProjectiles.forEach(projectile => {
          console.log('[AnimatedGameBoard] Projectile at', projectile.x, projectile.y, 'active:', projectile.active);
          drawProjectile(ctx, projectile, imageCache.current);
        });
      }

      // Draw particles (Phase 2 - effects layer)
      if (gameState.activeParticles && gameState.activeParticles.length > 0) {
        gameState.activeParticles.forEach(particle => {
          drawParticle(ctx, particle, now, imageCache.current);
        });
      }

      // Determine if game has started (for sprite selection)
      const gameStarted = gameState.gameStatus === 'running' || gameState.gameStatus === 'won' || gameState.gameStatus === 'lost';

      // Collect all entities for z-ordered rendering
      // Ghost entities (canOverlapEntities=true) render on top of normal entities
      interface RenderableEntity {
        type: 'enemy' | 'character';
        index: number;
        isGhost: boolean;
        entity: PlacedEnemy | PlacedCharacter;
      }

      const renderQueue: RenderableEntity[] = [];

      // Add enemies to render queue
      gameState.puzzle.enemies.forEach((enemy, idx) => {
        const enemyData = getEnemy(enemy.enemyId);
        renderQueue.push({
          type: 'enemy',
          index: idx,
          isGhost: enemyData?.canOverlapEntities || false,
          entity: enemy,
        });
      });

      // Add characters to render queue
      gameState.placedCharacters.forEach((character, idx) => {
        const charData = getCharacter(character.characterId);
        renderQueue.push({
          type: 'character',
          index: idx,
          isGhost: charData?.canOverlapEntities || false,
          entity: character,
        });
      });

      // Sort: non-ghosts first, then ghosts (ghosts render on top)
      renderQueue.sort((a, b) => {
        if (a.isGhost === b.isGhost) return 0;
        return a.isGhost ? 1 : -1;
      });

      // Render all entities in z-order
      renderQueue.forEach(({ type, index, entity }) => {
        if (type === 'enemy') {
          const enemy = entity as PlacedEnemy;
          const anim = enemyPositions.get(index);
          const deathAnim = enemyDeathAnimations.get(index);

          if (anim && now - anim.startTime < ANIMATION_DURATION && gameStarted) {
            const elapsed = now - anim.startTime;

            if (elapsed < MOVE_DURATION) {
              const moveProgress = Math.min(1, elapsed / MOVE_DURATION);
              const eased = easeInOutQuad(moveProgress);
              const renderX = anim.fromX + (anim.toX - anim.fromX) * eased;
              const renderY = anim.fromY + (anim.toY - anim.fromY) * eased;
              drawEnemy(ctx, enemy, renderX, renderY, true, anim.facingDuringMove, gameStarted, deathAnim, now);
            } else {
              drawEnemy(ctx, enemy, anim.toX, anim.toY, false, undefined, gameStarted, deathAnim, now);
            }
          } else {
            drawEnemy(ctx, enemy, enemy.x, enemy.y, false, undefined, gameStarted, deathAnim, now);
          }
        } else {
          const character = entity as PlacedCharacter;
          const anim = characterPositions.get(index);
          const deathAnim = characterDeathAnimations.get(character.characterId);

          if (anim && now - anim.startTime < ANIMATION_DURATION && gameStarted) {
            const elapsed = now - anim.startTime;

            if (elapsed < MOVE_DURATION) {
              const moveProgress = Math.min(1, elapsed / MOVE_DURATION);
              const eased = easeInOutQuad(moveProgress);
              const renderX = anim.fromX + (anim.toX - anim.fromX) * eased;
              const renderY = anim.fromY + (anim.toY - anim.fromY) * eased;
              drawCharacter(ctx, character, renderX, renderY, true, anim.facingDuringMove, gameStarted, deathAnim, now);
            } else {
              drawCharacter(ctx, character, anim.toX, anim.toY, false, undefined, gameStarted, deathAnim, now);
            }
          } else {
            drawCharacter(ctx, character, character.x, character.y, false, undefined, gameStarted, deathAnim, now);
          }
        }
      });

      // Restore context (undo translate offset)
      ctx.restore();

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [gameState, characterPositions, enemyPositions, characterDeathAnimations, enemyDeathAnimations]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onTileClick) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const borderStyle = gameState.puzzle.borderConfig?.style || 'none';
    const hasBorder = borderStyle !== 'none';
    const offsetX = hasBorder ? SIDE_BORDER_SIZE : 0;
    const offsetY = hasBorder ? BORDER_SIZE : 0;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left - offsetX;
    const clickY = e.clientY - rect.top - offsetY;

    const x = Math.floor(clickX / TILE_SIZE);
    const y = Math.floor(clickY / TILE_SIZE);

    if (x >= 0 && x < gameState.puzzle.width && y >= 0 && y < gameState.puzzle.height) {
      onTileClick(x, y);
    }
  };

  const borderStyle = gameState.puzzle.borderConfig?.style || 'none';
  const hasBorder = borderStyle !== 'none';
  const isIrregular = hasIrregularShape(gameState.puzzle.tiles, gameState.puzzle.width, gameState.puzzle.height);

  const gridWidth = gameState.puzzle.width * TILE_SIZE;
  const gridHeight = gameState.puzzle.height * TILE_SIZE;

  const canvasWidth = hasBorder ? gridWidth + (SIDE_BORDER_SIZE * 2) : gridWidth;
  const canvasHeight = hasBorder ? gridHeight + (BORDER_SIZE * 2) : gridHeight;

  // For irregular shapes, don't show the canvas border (it shows the rectangular bounds)
  const canvasClassName = isIrregular
    ? "cursor-pointer"
    : "border-2 border-gray-600 cursor-pointer rounded";

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      onClick={handleCanvasClick}
      className={canvasClassName}
      style={{ imageRendering: 'auto' }}
    />
  );
};

// Easing function
function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ==========================================
// BORDER RENDERING
// ==========================================

function drawBorder(
  ctx: CanvasRenderingContext2D,
  gridWidth: number,
  gridHeight: number,
  style: string,
  config?: any,
  tiles?: (import('../../types/game').TileOrNull)[][]
) {
  const totalWidth = gridWidth * TILE_SIZE + (SIDE_BORDER_SIZE * 2);
  const totalHeight = gridHeight * TILE_SIZE + (BORDER_SIZE * 2);

  // Check if we need smart borders (irregular shape with null tiles)
  const useSmartBorder = tiles && hasIrregularShape(tiles, gridWidth, gridHeight);

  if (style === 'dungeon') {
    if (useSmartBorder && tiles) {
      drawSmartDungeonBorder(ctx, tiles, gridWidth, gridHeight);
    } else {
      drawDungeonBorder(ctx, gridWidth, gridHeight, totalWidth, totalHeight);
    }
  } else if (style === 'custom' && config?.customBorderSprites) {
    drawCustomBorder(ctx, gridWidth, gridHeight, totalWidth, totalHeight, config.customBorderSprites);
  }
}

/**
 * Draw smart dungeon border that conforms to irregular puzzle shapes
 */
function drawSmartDungeonBorder(
  ctx: CanvasRenderingContext2D,
  tiles: (import('../../types/game').TileOrNull)[][],
  gridWidth: number,
  gridHeight: number
) {
  const borderData = computeSmartBorder(tiles, gridWidth, gridHeight);
  const offsetX = SIDE_BORDER_SIZE;
  const offsetY = BORDER_SIZE;

  ctx.save();

  // Draw edge borders for each exposed tile edge
  borderData.edges.forEach(({ x, y, edge, isInteriorWall }) => {
    const px = offsetX + x * TILE_SIZE;
    const py = offsetY + y * TILE_SIZE;

    switch (edge) {
      case 'top':
        if (isInteriorWall) {
          drawInteriorWallSegment(ctx, px, py); // Full tall front-facing wall
        } else {
          drawTrimSegment(ctx, px, py, 'top'); // Thin trim for outer perimeter
        }
        break;
      case 'bottom':
        drawTrimSegment(ctx, px, py, 'bottom'); // Always thin trim
        break;
      case 'left':
        drawTrimSegment(ctx, px, py, 'left'); // Always thin trim
        break;
      case 'right':
        drawTrimSegment(ctx, px, py, 'right'); // Always thin trim
        break;
    }
  });

  // Draw corners on top of edges
  borderData.corners.forEach(({ x, y, type }) => {
    const px = offsetX + x * TILE_SIZE;
    const py = offsetY + y * TILE_SIZE;
    drawCornerSegment(ctx, px, py, type);
  });

  ctx.restore();
}

/**
 * Draw a full interior wall segment - this is a front-facing wall you look "up" at
 * Only used for TOP edges that are interior walls (have playable space above the void)
 */
function drawInteriorWallSegment(ctx: CanvasRenderingContext2D, px: number, py: number) {
  // Main wall body (extends upward from tile) - full height for interior walls
  ctx.fillStyle = '#3a3a4a';
  ctx.fillRect(px, py - BORDER_SIZE, TILE_SIZE, BORDER_SIZE);

  // Shadow at bottom of wall (where wall meets floor)
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(px, py - 12, TILE_SIZE, 12);

  // Highlight at top of wall
  ctx.fillStyle = '#4a4a5a';
  ctx.fillRect(px, py - BORDER_SIZE, TILE_SIZE, 8);
}

/**
 * Draw a thin trim segment for outer perimeter edges
 * Used for all edges that are on the outer boundary of the dungeon
 */
function drawTrimSegment(ctx: CanvasRenderingContext2D, px: number, py: number, edge: EdgeType) {
  const TRIM_SIZE = 6; // Thin trim for outer edges

  ctx.fillStyle = '#1a1a2a'; // Dark trim color

  switch (edge) {
    case 'top':
      // Thin trim above the tile
      ctx.fillRect(px, py - TRIM_SIZE, TILE_SIZE, TRIM_SIZE);
      break;
    case 'bottom':
      // Thin trim below the tile
      ctx.fillRect(px, py + TILE_SIZE, TILE_SIZE, TRIM_SIZE);
      break;
    case 'left':
      // Thin trim to the left of the tile
      ctx.fillRect(px - TRIM_SIZE, py, TRIM_SIZE, TILE_SIZE);
      break;
    case 'right':
      // Thin trim to the right of the tile
      ctx.fillRect(px + TILE_SIZE, py, TRIM_SIZE, TILE_SIZE);
      break;
  }
}

/**
 * Draw corner pieces for smart borders
 * All corners use thin trim since they're on the outer perimeter
 */
function drawCornerSegment(ctx: CanvasRenderingContext2D, px: number, py: number, type: CornerType) {
  const TRIM_SIZE = 6; // Match trim size from drawTrimSegment
  ctx.fillStyle = '#1a1a2a'; // Dark trim color

  switch (type) {
    // Convex corners (outer corners - puzzle sticks out)
    case 'convex-tl':
      ctx.fillRect(px - TRIM_SIZE, py - TRIM_SIZE, TRIM_SIZE, TRIM_SIZE);
      break;
    case 'convex-tr':
      ctx.fillRect(px + TILE_SIZE, py - TRIM_SIZE, TRIM_SIZE, TRIM_SIZE);
      break;
    case 'convex-bl':
      ctx.fillRect(px - TRIM_SIZE, py + TILE_SIZE, TRIM_SIZE, TRIM_SIZE);
      break;
    case 'convex-br':
      ctx.fillRect(px + TILE_SIZE, py + TILE_SIZE, TRIM_SIZE, TRIM_SIZE);
      break;

    // Concave corners (inner corners - puzzle goes inward)
    case 'concave-tl':
      ctx.fillRect(px - TRIM_SIZE, py - TRIM_SIZE, TRIM_SIZE, TRIM_SIZE);
      break;
    case 'concave-tr':
      ctx.fillRect(px + TILE_SIZE, py - TRIM_SIZE, TRIM_SIZE, TRIM_SIZE);
      break;
    case 'concave-bl':
      ctx.fillRect(px - TRIM_SIZE, py + TILE_SIZE, TRIM_SIZE, TRIM_SIZE);
      break;
    case 'concave-br':
      ctx.fillRect(px + TILE_SIZE, py + TILE_SIZE, TRIM_SIZE, TRIM_SIZE);
      break;
  }
}

function drawDungeonBorder(ctx: CanvasRenderingContext2D, gridWidth: number, gridHeight: number, totalWidth: number, totalHeight: number) {
  const gridPixelWidth = gridWidth * TILE_SIZE;
  const gridPixelHeight = gridHeight * TILE_SIZE;
  const TRIM_SIZE = 6; // Thin trim for outer perimeter edges

  ctx.save();

  // TOP WALL - This IS an interior wall (you're looking up at it from below)
  // Full tall wall with depth
  ctx.fillStyle = '#3a3a4a'; // Stone color
  ctx.fillRect(SIDE_BORDER_SIZE, 0, gridPixelWidth, BORDER_SIZE);

  // Add shadow at bottom of top wall
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(SIDE_BORDER_SIZE, BORDER_SIZE - 12, gridPixelWidth, 12);

  // Top wall highlight
  ctx.fillStyle = '#4a4a5a';
  ctx.fillRect(SIDE_BORDER_SIZE, 0, gridPixelWidth, 8);

  // BOTTOM, LEFT, RIGHT - These are outer perimeter, use thin trim
  ctx.fillStyle = '#1a1a2a'; // Dark trim color

  // Bottom trim
  ctx.fillRect(SIDE_BORDER_SIZE, BORDER_SIZE + gridPixelHeight, gridPixelWidth, TRIM_SIZE);

  // Left trim
  ctx.fillRect(SIDE_BORDER_SIZE - TRIM_SIZE, BORDER_SIZE, TRIM_SIZE, gridPixelHeight);

  // Right trim
  ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE, TRIM_SIZE, gridPixelHeight);

  // Corners - top corners connect to tall wall, bottom corners are trim
  // Top-left corner (connects tall wall to left trim)
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(SIDE_BORDER_SIZE - TRIM_SIZE, 0, TRIM_SIZE, BORDER_SIZE);

  // Top-right corner (connects tall wall to right trim)
  ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, 0, TRIM_SIZE, BORDER_SIZE);

  // Bottom-left corner (trim)
  ctx.fillRect(SIDE_BORDER_SIZE - TRIM_SIZE, BORDER_SIZE + gridPixelHeight, TRIM_SIZE, TRIM_SIZE);

  // Bottom-right corner (trim)
  ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE + gridPixelHeight, TRIM_SIZE, TRIM_SIZE);

  ctx.restore();
}

function drawCustomBorder(ctx: CanvasRenderingContext2D, gridWidth: number, gridHeight: number, totalWidth: number, totalHeight: number, sprites: any) {
  // TODO: Implement custom sprite border rendering
  // For now, fall back to dungeon style
  drawDungeonBorder(ctx, gridWidth, gridHeight, totalWidth, totalHeight);
}

function drawVoidTile(_ctx: CanvasRenderingContext2D, _x: number, _y: number) {
  // Void tiles are truly transparent - we don't draw anything here.
  // The border will be drawn around the edges of playable tiles instead.
  // This allows the page background or parent element to show through.
}

function drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, type: TileType) {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;

  ctx.fillStyle = type === TileType.WALL ? COLORS.wall : COLORS.empty;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
}

function drawEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: PlacedEnemy,
  renderX?: number,
  renderY?: number,
  isMoving: boolean = false,
  facingOverride?: Direction,
  gameStarted: boolean = true,
  deathAnimState?: DeathAnimationState,
  now: number = Date.now()
) {
  const x = renderX !== undefined ? renderX : enemy.x;
  const y = renderY !== undefined ? renderY : enemy.y;
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;
  const facing = facingOverride !== undefined ? facingOverride : enemy.facing;

  // Use undefined direction before game starts to force 'default' directional sprite
  const directionToUse = gameStarted ? facing : undefined;

  // Check if this enemy has a custom sprite
  const enemyData = getEnemy(enemy.enemyId) as CustomEnemy | undefined;
  const hasCustomSprite = enemyData && 'customSprite' in enemyData && enemyData.customSprite;

  if (hasCustomSprite && enemyData.customSprite) {
    if (!enemy.dead) {
      // Living enemy - draw normal sprite
      drawSprite(ctx, enemyData.customSprite, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, directionToUse, isMoving, now);
    } else {
      // Dead enemy - use death sprite (animates then stays on final frame as corpse)
      const hasDeathSprite = hasDeathAnimation(enemyData.customSprite);

      if (hasDeathSprite) {
        // Death sprite sheet will animate and stop on final frame (corpse state)
        // Use the death animation start time for proper frame calculation
        const deathStartTime = deathAnimState?.startTime || now;
        drawDeathSprite(
          ctx,
          enemyData.customSprite,
          px + TILE_SIZE / 2,
          py + TILE_SIZE / 2,
          TILE_SIZE,
          deathAnimState?.facing || facing,
          deathStartTime
        );
      } else {
        // No death sprite - draw dimmed version with X
        ctx.globalAlpha = 0.3;
        drawSprite(ctx, enemyData.customSprite, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, directionToUse, false, now);
        ctx.globalAlpha = 1.0;
        drawDeadX(ctx, px, py);
      }
    }
  } else {
    // Default rendering (no custom sprite)
    if (!enemy.dead) {
      ctx.fillStyle = COLORS.enemy;
      ctx.beginPath();
      ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE / 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Dead default sprite
      ctx.fillStyle = COLORS.deadEnemy;
      ctx.beginPath();
      ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE / 3, 0, Math.PI * 2);
      ctx.fill();
      drawDeadX(ctx, px, py);
    }
  }

  if (!enemy.dead) {
    // Only draw direction arrow if enemy has movement actions in their behavior
    if (enemyData && enemyHasMovementActions(enemyData.behavior)) {
      drawDirectionArrow(ctx, px + TILE_SIZE / 2, py + TILE_SIZE / 2, facing || Direction.SOUTH);
    }

    // Draw health below the enemy
    ctx.fillStyle = 'white';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`HP:${enemy.currentHealth}`, px + TILE_SIZE / 2, py + TILE_SIZE - 12);
  }
}

// Helper to draw X over dead entities
function drawDeadX(ctx: CanvasRenderingContext2D, px: number, py: number) {
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px + TILE_SIZE / 3, py + TILE_SIZE / 3);
  ctx.lineTo(px + (2 * TILE_SIZE) / 3, py + (2 * TILE_SIZE) / 3);
  ctx.moveTo(px + (2 * TILE_SIZE) / 3, py + TILE_SIZE / 3);
  ctx.lineTo(px + TILE_SIZE / 3, py + (2 * TILE_SIZE) / 3);
  ctx.stroke();
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  character: PlacedCharacter,
  x: number,
  y: number,
  isMoving: boolean = false,
  facingOverride?: Direction,
  gameStarted: boolean = true,
  deathAnimState?: DeathAnimationState,
  now: number = Date.now()
) {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;
  const facing = facingOverride !== undefined ? facingOverride : character.facing;

  // Use undefined direction before game starts to force 'default' directional sprite
  const directionToUse = gameStarted ? facing : undefined;

  // Check if this character has a custom sprite
  const charData = getCharacter(character.characterId) as CustomCharacter | undefined;
  const hasCustomSprite = charData && 'customSprite' in charData && charData.customSprite;

  if (hasCustomSprite && charData.customSprite) {
    if (!character.dead) {
      // Living character - draw custom sprite with directional support and idle/moving state
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      drawSprite(ctx, charData.customSprite, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, directionToUse, isMoving, now);

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    } else {
      // Dead character - use death sprite (animates then stays on final frame as corpse)
      const hasDeathSprite = hasDeathAnimation(charData.customSprite);

      if (hasDeathSprite) {
        // Death sprite sheet will animate and stop on final frame (corpse state)
        const deathStartTime = deathAnimState?.startTime || now;
        drawDeathSprite(
          ctx,
          charData.customSprite,
          px + TILE_SIZE / 2,
          py + TILE_SIZE / 2,
          TILE_SIZE,
          deathAnimState?.facing || facing,
          deathStartTime
        );
      } else {
        // No death sprite - draw dimmed version with X
        ctx.globalAlpha = 0.3;
        drawSprite(ctx, charData.customSprite, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, directionToUse, false, now);
        ctx.globalAlpha = 1.0;
        drawDeadX(ctx, px, py);
      }
    }
  } else {
    // Default rendering (no custom sprite)
    if (!character.dead) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      ctx.fillStyle = COLORS.character;
      const size = TILE_SIZE * 0.6;
      const offset = (TILE_SIZE - size) / 2;
      ctx.fillRect(px + offset, py + offset, size, size);

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    } else {
      // Dead default character - draw dimmed version with X
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = COLORS.character;
      const size = TILE_SIZE * 0.6;
      const offset = (TILE_SIZE - size) / 2;
      ctx.fillRect(px + offset, py + offset, size, size);
      ctx.globalAlpha = 1.0;
      drawDeadX(ctx, px, py);
    }
  }

  if (!character.dead) {
    // Only draw direction arrow if character has movement actions in their behavior
    if (charData && hasMovementActions(charData.behavior || [])) {
      drawDirectionArrow(ctx, px + TILE_SIZE / 2, py + TILE_SIZE / 2, facing);
    }

    // Draw health
    ctx.fillStyle = 'white';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`HP:${character.currentHealth}`, px + TILE_SIZE / 2, py + TILE_SIZE - 12);
  }
}

function drawDirectionArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  direction: Direction
) {
  const arrowSize = 8;
  const diagonalOffset = arrowSize * 0.7; // For diagonal arrows
  ctx.fillStyle = 'white';
  ctx.beginPath();

  switch (direction) {
    case Direction.NORTH:
      ctx.moveTo(cx, cy - arrowSize);
      ctx.lineTo(cx - arrowSize / 2, cy);
      ctx.lineTo(cx + arrowSize / 2, cy);
      break;
    case Direction.NORTHEAST:
      ctx.moveTo(cx + diagonalOffset, cy - diagonalOffset);
      ctx.lineTo(cx - diagonalOffset / 2, cy - diagonalOffset / 2);
      ctx.lineTo(cx + diagonalOffset / 2, cy + diagonalOffset / 2);
      break;
    case Direction.EAST:
      ctx.moveTo(cx + arrowSize, cy);
      ctx.lineTo(cx, cy - arrowSize / 2);
      ctx.lineTo(cx, cy + arrowSize / 2);
      break;
    case Direction.SOUTHEAST:
      ctx.moveTo(cx + diagonalOffset, cy + diagonalOffset);
      ctx.lineTo(cx + diagonalOffset / 2, cy - diagonalOffset / 2);
      ctx.lineTo(cx - diagonalOffset / 2, cy + diagonalOffset / 2);
      break;
    case Direction.SOUTH:
      ctx.moveTo(cx, cy + arrowSize);
      ctx.lineTo(cx - arrowSize / 2, cy);
      ctx.lineTo(cx + arrowSize / 2, cy);
      break;
    case Direction.SOUTHWEST:
      ctx.moveTo(cx - diagonalOffset, cy + diagonalOffset);
      ctx.lineTo(cx + diagonalOffset / 2, cy + diagonalOffset / 2);
      ctx.lineTo(cx - diagonalOffset / 2, cy - diagonalOffset / 2);
      break;
    case Direction.WEST:
      ctx.moveTo(cx - arrowSize, cy);
      ctx.lineTo(cx, cy - arrowSize / 2);
      ctx.lineTo(cx, cy + arrowSize / 2);
      break;
    case Direction.NORTHWEST:
      ctx.moveTo(cx - diagonalOffset, cy - diagonalOffset);
      ctx.lineTo(cx - diagonalOffset / 2, cy + diagonalOffset / 2);
      ctx.lineTo(cx + diagonalOffset / 2, cy - diagonalOffset / 2);
      break;
  }

  ctx.closePath();
  ctx.fill();
}

function drawCollectible(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;

  ctx.fillStyle = COLORS.collectible;
  ctx.beginPath();
  const cx = px + TILE_SIZE / 2;
  const cy = py + TILE_SIZE / 2;
  const spikes = 5;
  const outerRadius = TILE_SIZE / 4;
  const innerRadius = TILE_SIZE / 8;

  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.closePath();
  ctx.fill();
}

// ==========================================
// PROJECTILE & PARTICLE RENDERING (Phase 2c)
// ==========================================

/**
 * Draw a shape or image with given parameters
 */
function drawShape(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  shape: string,
  color: string,
  size: number,
  imageData?: string,
  imageCache?: Map<string, HTMLImageElement>,
  rotationConfig?: { rotation: number; mirror: boolean }
) {
  ctx.save();

  // If there's an image, draw it instead of a shape
  if (imageData && imageCache) {
    let img = imageCache.get(imageData);

    if (!img) {
      // Create and cache the image
      img = new Image();
      img.src = imageData;
      imageCache.set(imageData, img);
    }

    // Draw the image (browser handles GIF animation automatically)
    // Use try-catch to handle cases where image isn't loaded yet
    try {
      const imgSize = size * 3; // Make image larger

      // Apply rotation and mirroring if specified
      if (rotationConfig) {
        // Move to center point
        ctx.translate(px, py);

        // Apply rotation (convert degrees to radians)
        ctx.rotate((rotationConfig.rotation * Math.PI) / 180);

        // Apply mirroring
        if (rotationConfig.mirror) {
          ctx.scale(-1, 1);
        }

        // Draw centered at origin
        ctx.drawImage(img, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
      } else {
        // No rotation - draw normally
        ctx.drawImage(img, px - imgSize / 2, py - imgSize / 2, imgSize, imgSize);
      }
    } catch (e) {
      // Image not ready yet, will draw on next frame
    }
    ctx.restore();
    return;
  }

  // Otherwise draw the shape (existing code)
  // Outer glow
  ctx.fillStyle = color + '40'; // Add transparency for glow
  ctx.beginPath();

  switch (shape) {
    case 'circle':
      ctx.arc(px, py, size * 1.5, 0, Math.PI * 2);
      break;
    case 'square':
      ctx.rect(px - size * 1.5, py - size * 1.5, size * 3, size * 3);
      break;
    case 'triangle':
      ctx.moveTo(px, py - size * 1.5);
      ctx.lineTo(px - size * 1.3, py + size * 1.5);
      ctx.lineTo(px + size * 1.3, py + size * 1.5);
      ctx.closePath();
      break;
    case 'star':
      drawStar(ctx, px, py, 5, size * 1.5, size * 0.7);
      break;
    case 'diamond':
      ctx.moveTo(px, py - size * 1.5);
      ctx.lineTo(px + size * 1.5, py);
      ctx.lineTo(px, py + size * 1.5);
      ctx.lineTo(px - size * 1.5, py);
      ctx.closePath();
      break;
  }

  ctx.fill();

  // Inner core
  ctx.fillStyle = color;
  ctx.beginPath();

  switch (shape) {
    case 'circle':
      ctx.arc(px, py, size * 0.7, 0, Math.PI * 2);
      break;
    case 'square':
      ctx.rect(px - size * 0.7, py - size * 0.7, size * 1.4, size * 1.4);
      break;
    case 'triangle':
      ctx.moveTo(px, py - size * 0.7);
      ctx.lineTo(px - size * 0.6, py + size * 0.7);
      ctx.lineTo(px + size * 0.6, py + size * 0.7);
      ctx.closePath();
      break;
    case 'star':
      drawStar(ctx, px, py, 5, size * 0.7, size * 0.35);
      break;
    case 'diamond':
      ctx.moveTo(px, py - size * 0.7);
      ctx.lineTo(px + size * 0.7, py);
      ctx.lineTo(px, py + size * 0.7);
      ctx.lineTo(px - size * 0.7, py);
      ctx.closePath();
      break;
  }

  ctx.fill();
  ctx.restore();
}

/**
 * Draw a star shape
 */
function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number) {
  let rot = Math.PI / 2 * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  ctx.moveTo(cx, cy - outerRadius);

  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }

  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
}

/**
 * Draw a projectile - uses fractional coordinates for smooth movement
 */
function drawProjectile(ctx: CanvasRenderingContext2D, projectile: Projectile, imageCache: Map<string, HTMLImageElement>) {
  if (!projectile.active) return;

  // Convert tile coordinates to pixel coordinates (fractional for smooth movement)
  const px = projectile.x * TILE_SIZE + TILE_SIZE / 2;
  const py = projectile.y * TILE_SIZE + TILE_SIZE / 2;

  // Check if projectile has custom sprite
  if (projectile.attackData.projectileSprite?.spriteData) {
    const spriteData = projectile.attackData.projectileSprite.spriteData;
    const shape = spriteData.shape || 'circle';
    const color = spriteData.primaryColor || '#ff6600';
    const imageData = spriteData.idleImageData;

    // Calculate rotation and mirroring based on direction
    // Base image is East (→), apply transforms for other directions
    const rotationConfig = getRotationForDirection(projectile.direction);

    drawShape(ctx, px, py, shape, color, 8, imageData, imageCache, rotationConfig);
  } else {
    // Default projectile rendering
    drawDefaultProjectile(ctx, px, py);
  }
}

/**
 * Get rotation/mirror config for a direction
 * Base image points East (left-to-right →)
 */
function getRotationForDirection(direction: Direction): { rotation: number; mirror: boolean } {
  switch (direction) {
    case Direction.EAST:
      return { rotation: 0, mirror: false };
    case Direction.NORTHEAST:
      return { rotation: 45, mirror: false };
    case Direction.NORTH:
      return { rotation: 90, mirror: false };
    case Direction.NORTHWEST:
      return { rotation: 45, mirror: true };
    case Direction.WEST:
      return { rotation: 0, mirror: true };
    case Direction.SOUTHWEST:
      return { rotation: -45, mirror: true };
    case Direction.SOUTH:
      return { rotation: -90, mirror: false };
    case Direction.SOUTHEAST:
      return { rotation: -45, mirror: false };
    default:
      return { rotation: 0, mirror: false };
  }
}

/**
 * Draw default projectile (simple colored circle/arrow)
 */
function drawDefaultProjectile(ctx: CanvasRenderingContext2D, px: number, py: number) {
  // Draw glowing projectile
  ctx.save();

  // Outer glow
  ctx.fillStyle = 'rgba(255, 200, 100, 0.3)';
  ctx.beginPath();
  ctx.arc(px, py, 8, 0, Math.PI * 2);
  ctx.fill();

  // Inner core
  ctx.fillStyle = '#ffaa00';
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a particle effect with fade-out
 */
function drawParticle(ctx: CanvasRenderingContext2D, particle: ParticleEffect, now: number, imageCache: Map<string, HTMLImageElement>) {
  const elapsed = now - particle.startTime;
  if (elapsed >= particle.duration) return;

  const px = particle.x * TILE_SIZE + TILE_SIZE / 2;
  const py = particle.y * TILE_SIZE + TILE_SIZE / 2;

  // Calculate fade-out alpha
  const progress = elapsed / particle.duration;
  const alpha = particle.alpha || (1 - progress); // Fade out over time

  ctx.save();
  ctx.globalAlpha = alpha;

  // Check if particle has custom sprite
  if (particle.sprite?.spriteData) {
    const spriteData = particle.sprite.spriteData;
    const shape = spriteData.shape || 'circle';
    const color = spriteData.primaryColor || '#ffff00';
    const imageData = spriteData.idleImageData;

    // Draw expanding effect
    const radius = 4 + progress * 20;
    drawShape(ctx, px, py, shape, color, radius, imageData, imageCache);

    // Inner flash (only for non-image sprites)
    if (!imageData && progress < 0.3) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, 8 * (1 - progress / 0.3), 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    drawDefaultParticle(ctx, px, py, progress);
  }

  ctx.restore();
}

/**
 * Draw default particle effect (expanding ring)
 */
function drawDefaultParticle(ctx: CanvasRenderingContext2D, px: number, py: number, progress: number) {
  // Expanding ring effect
  const radius = 4 + progress * 20; // Expands from 4 to 24 pixels

  ctx.strokeStyle = '#ffff00';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(px, py, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Inner flash
  if (progress < 0.3) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, 8 * (1 - progress / 0.3), 0, Math.PI * 2);
    ctx.fill();
  }
}
