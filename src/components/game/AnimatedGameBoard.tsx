import React, { useRef, useEffect, useState } from 'react';
import type { GameState, PlacedCharacter, PlacedEnemy, Projectile, ParticleEffect, BorderConfig, CharacterAction, EnemyBehavior, TileSprites } from '../../types/game';
import { TileType, Direction, ActionType } from '../../types/game';
import { getCharacter } from '../../data/characters';
import { getEnemy } from '../../data/enemies';
import { drawSprite, drawDeathSprite, hasDeathAnimation } from '../editor/SpriteEditor';
import type { CustomCharacter, CustomEnemy, CustomTileType } from '../../utils/assetStorage';
import { loadPuzzleSkin, loadTileType } from '../../utils/assetStorage';
import type { Tile } from '../../types/game';
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
const BORDER_SIZE = 48; // Border thickness for top/bottom
const SIDE_BORDER_SIZE = 24; // Thinner side borders to match pixel art style
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
  isOuterEdge: boolean; // True if this edge is on the outer perimeter of the puzzle
}

// Corner types for smart border rendering
// Convex = outer corner (puzzle sticks out), Concave = inner corner (puzzle goes inward)
type CornerType = 'convex-tl' | 'convex-tr' | 'convex-bl' | 'convex-br' |
                  'concave-tl' | 'concave-tr' | 'concave-bl' | 'concave-br';

interface BorderCorner {
  x: number;
  y: number;
  type: CornerType;
  isOuterBottom: boolean; // True if this corner connects to outer perimeter bottom edge
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
 * Compute smart border edges and corners based on actual playable tile shapes
 */
function computeSmartBorder(tiles: (import('../../types/game').TileOrNull)[][], width: number, height: number): SmartBorderData {
  const edges: BorderEdge[] = [];
  const corners: BorderCorner[] = [];
  let minX = width, maxX = -1, minY = height, maxY = -1;

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
      const hasTop = !isTilePlayable(tiles, x, y - 1, width, height);
      const hasBottom = !isTilePlayable(tiles, x, y + 1, width, height);
      const hasLeft = !isTilePlayable(tiles, x - 1, y, width, height);
      const hasRight = !isTilePlayable(tiles, x + 1, y, width, height);

      // Determine if edges are on outer perimeter (adjacent to out-of-bounds) vs interior (adjacent to void tile)
      const isTopOuter = y - 1 < 0;
      const isBottomOuter = y + 1 >= height;
      const isLeftOuter = x - 1 < 0;
      const isRightOuter = x + 1 >= width;

      if (hasTop) edges.push({ x, y, edge: 'top', isOuterEdge: isTopOuter });
      if (hasBottom) edges.push({ x, y, edge: 'bottom', isOuterEdge: isBottomOuter });
      if (hasLeft) edges.push({ x, y, edge: 'left', isOuterEdge: isLeftOuter });
      if (hasRight) edges.push({ x, y, edge: 'right', isOuterEdge: isRightOuter });

      // Detect corners by checking diagonal neighbors and edge combinations
      const topLeft = !isTilePlayable(tiles, x - 1, y - 1, width, height);
      const topRight = !isTilePlayable(tiles, x + 1, y - 1, width, height);
      const bottomLeft = !isTilePlayable(tiles, x - 1, y + 1, width, height);
      const bottomRight = !isTilePlayable(tiles, x + 1, y + 1, width, height);

      // Convex corners (outer corners - where two edges meet)
      if (hasTop && hasLeft) corners.push({ x, y, type: 'convex-tl', isOuterBottom: false });
      if (hasTop && hasRight) corners.push({ x, y, type: 'convex-tr', isOuterBottom: false });
      if (hasBottom && hasLeft) corners.push({ x, y, type: 'convex-bl', isOuterBottom: isBottomOuter });
      if (hasBottom && hasRight) corners.push({ x, y, type: 'convex-br', isOuterBottom: isBottomOuter });

      // Concave corners (inner corners - where diagonal is void but adjacent are playable)
      if (!hasTop && !hasLeft && topLeft) corners.push({ x, y, type: 'concave-tl', isOuterBottom: false });
      if (!hasTop && !hasRight && topRight) corners.push({ x, y, type: 'concave-tr', isOuterBottom: false });
      if (!hasBottom && !hasLeft && bottomLeft) corners.push({ x, y, type: 'concave-bl', isOuterBottom: isBottomOuter });
      if (!hasBottom && !hasRight && bottomRight) corners.push({ x, y, type: 'concave-br', isOuterBottom: isBottomOuter });
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

      // Load skin for tile sprites
      const skin = gameState.puzzle.skinId ? loadPuzzleSkin(gameState.puzzle.skinId) : null;
      const tileSprites = skin?.tileSprites;

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
            drawTile(ctx, x, y, tile.type, tileSprites, tile);
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

  const gridWidth = gameState.puzzle.width * TILE_SIZE;
  const gridHeight = gameState.puzzle.height * TILE_SIZE;

  const canvasWidth = hasBorder ? gridWidth + (SIDE_BORDER_SIZE * 2) : gridWidth;
  const canvasHeight = hasBorder ? gridHeight + (BORDER_SIZE * 2) : gridHeight;

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      onClick={handleCanvasClick}
      className="cursor-pointer"
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
    if (useSmartBorder && tiles) {
      drawSmartCustomBorder(ctx, tiles, gridWidth, gridHeight, config.customBorderSprites);
    } else {
      drawCustomBorder(ctx, gridWidth, gridHeight, totalWidth, totalHeight, config.customBorderSprites);
    }
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
  borderData.edges.forEach(({ x, y, edge, isOuterEdge }) => {
    const px = offsetX + x * TILE_SIZE;
    const py = offsetY + y * TILE_SIZE;

    switch (edge) {
      case 'top':
        drawTopWallSegment(ctx, px, py);
        break;
      case 'bottom':
        drawBottomWallSegment(ctx, px, py, isOuterEdge);
        break;
      case 'left':
        drawLeftWallSegment(ctx, px, py);
        break;
      case 'right':
        drawRightWallSegment(ctx, px, py);
        break;
    }
  });

  // Draw corners on top of edges
  borderData.corners.forEach(({ x, y, type, isOuterBottom }) => {
    const px = offsetX + x * TILE_SIZE;
    const py = offsetY + y * TILE_SIZE;
    drawCornerSegment(ctx, px, py, type, isOuterBottom);
  });

  ctx.restore();
}

/**
 * Draw a top wall segment for a single tile edge
 */
function drawTopWallSegment(ctx: CanvasRenderingContext2D, px: number, py: number) {
  // Main wall body (extends upward from tile)
  ctx.fillStyle = '#3a3a4a';
  ctx.fillRect(px, py - BORDER_SIZE, TILE_SIZE, BORDER_SIZE);

  // Shadow at bottom of wall
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(px, py - 12, TILE_SIZE, 12);

  // Highlight at top
  ctx.fillStyle = '#4a4a5a';
  ctx.fillRect(px, py - BORDER_SIZE, TILE_SIZE, 8);
}

/**
 * Draw a bottom wall segment for a single tile edge
 * Interior voids: thin wall-top (looking down at top surface)
 * Outer perimeter: full thickness wall
 */
function drawBottomWallSegment(ctx: CanvasRenderingContext2D, px: number, py: number, isOuterEdge: boolean = false) {
  if (isOuterEdge) {
    // Full thickness for outer perimeter bottom wall
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(px, py + TILE_SIZE, TILE_SIZE, BORDER_SIZE);

    // Top edge highlight
    ctx.fillStyle = '#3a3a4a';
    ctx.fillRect(px, py + TILE_SIZE, TILE_SIZE, 8);
  } else {
    // Thin wall top for interior voids
    ctx.fillStyle = '#323242';
    ctx.fillRect(px, py + TILE_SIZE, TILE_SIZE, SIDE_BORDER_SIZE);

    // Inner edge (top of the wall top, darker)
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(px, py + TILE_SIZE, TILE_SIZE, 6);
  }
}

/**
 * Draw a left wall segment for a single tile edge
 */
function drawLeftWallSegment(ctx: CanvasRenderingContext2D, px: number, py: number) {
  // Main wall body (extends leftward from tile)
  ctx.fillStyle = '#323242';
  ctx.fillRect(px - SIDE_BORDER_SIZE, py, SIDE_BORDER_SIZE, TILE_SIZE);

  // Inner edge (right side of left wall, darker)
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(px - 6, py, 6, TILE_SIZE);
}

/**
 * Draw a right wall segment for a single tile edge
 */
function drawRightWallSegment(ctx: CanvasRenderingContext2D, px: number, py: number) {
  // Main wall body (extends rightward from tile)
  ctx.fillStyle = '#323242';
  ctx.fillRect(px + TILE_SIZE, py, SIDE_BORDER_SIZE, TILE_SIZE);

  // Inner edge (left side of right wall, lighter)
  ctx.fillStyle = '#3a3a4a';
  ctx.fillRect(px + TILE_SIZE, py, 6, TILE_SIZE);
}

/**
 * Draw corner pieces for smart borders
 * Top corners connect tall front-facing walls (BORDER_SIZE height)
 * Bottom corners: outer perimeter = full thickness, interior = thin wall-top
 */
function drawCornerSegment(ctx: CanvasRenderingContext2D, px: number, py: number, type: CornerType, isOuterBottom: boolean = false) {
  ctx.fillStyle = '#1a1a2a'; // Dark corner color

  // Determine bottom corner height based on whether it's outer perimeter
  const bottomHeight = isOuterBottom ? BORDER_SIZE : SIDE_BORDER_SIZE;

  switch (type) {
    // Convex corners (outer corners - puzzle sticks out)
    case 'convex-tl':
      // Top-left corner - connects to tall front-facing wall
      ctx.fillRect(px - SIDE_BORDER_SIZE, py - BORDER_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
      break;
    case 'convex-tr':
      // Top-right corner - connects to tall front-facing wall
      ctx.fillRect(px + TILE_SIZE, py - BORDER_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
      break;
    case 'convex-bl':
      // Bottom-left corner
      ctx.fillRect(px - SIDE_BORDER_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, bottomHeight);
      break;
    case 'convex-br':
      // Bottom-right corner
      ctx.fillRect(px + TILE_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, bottomHeight);
      break;

    // Concave corners (inner corners - puzzle goes inward)
    case 'concave-tl':
      // Inner top-left - connects to tall front-facing wall
      ctx.fillStyle = '#323242';
      ctx.fillRect(px - SIDE_BORDER_SIZE, py - BORDER_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
      break;
    case 'concave-tr':
      // Inner top-right - connects to tall front-facing wall
      ctx.fillStyle = '#323242';
      ctx.fillRect(px + TILE_SIZE, py - BORDER_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
      break;
    case 'concave-bl':
      // Inner bottom-left
      ctx.fillStyle = '#323242';
      ctx.fillRect(px - SIDE_BORDER_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, bottomHeight);
      break;
    case 'concave-br':
      // Inner bottom-right
      ctx.fillStyle = '#323242';
      ctx.fillRect(px + TILE_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, bottomHeight);
      break;
  }
}

function drawDungeonBorder(ctx: CanvasRenderingContext2D, gridWidth: number, gridHeight: number, totalWidth: number, totalHeight: number) {
  const gridPixelWidth = gridWidth * TILE_SIZE;
  const gridPixelHeight = gridHeight * TILE_SIZE;

  ctx.save();

  // Background behind border (dark void)
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // Top wall (front-facing with depth)
  ctx.fillStyle = '#3a3a4a'; // Stone color
  ctx.fillRect(0, 0, totalWidth, BORDER_SIZE);

  // Add stone texture/depth to top wall
  ctx.fillStyle = '#2a2a3a'; // Shadow
  for (let x = 0; x < totalWidth; x += TILE_SIZE) {
    ctx.fillRect(x, BORDER_SIZE - 12, TILE_SIZE - 2, 12);
  }

  // Top wall highlight
  ctx.fillStyle = '#4a4a5a';
  for (let x = 0; x < totalWidth; x += TILE_SIZE) {
    ctx.fillRect(x, 0, TILE_SIZE - 2, 8);
  }

  // Bottom wall - full thickness for outer perimeter (special case)
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(0, BORDER_SIZE + gridPixelHeight, totalWidth, BORDER_SIZE);

  // Bottom wall top edge highlight
  ctx.fillStyle = '#3a3a4a';
  ctx.fillRect(0, BORDER_SIZE + gridPixelHeight, totalWidth, 8);

  // Left wall (side view - THINNER)
  ctx.fillStyle = '#323242';
  ctx.fillRect(0, BORDER_SIZE, SIDE_BORDER_SIZE, gridPixelHeight);

  // Left wall inner edge
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(SIDE_BORDER_SIZE - 6, BORDER_SIZE, 6, gridPixelHeight);

  // Right wall (side view - THINNER)
  ctx.fillStyle = '#323242';
  ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE, SIDE_BORDER_SIZE, gridPixelHeight);

  // Right wall inner edge
  ctx.fillStyle = '#3a3a4a';
  ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE, 6, gridPixelHeight);

  // Corners (darker, showing depth)
  ctx.fillStyle = '#1a1a2a';
  // Top-left - connects to tall front-facing wall
  ctx.fillRect(0, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
  // Top-right - connects to tall front-facing wall
  ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
  // Bottom-left - connects to full thickness bottom wall
  ctx.fillRect(0, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);
  // Bottom-right - connects to full thickness bottom wall
  ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);

  ctx.restore();
}

// Image cache for custom border sprites
const borderImageCache = new Map<string, HTMLImageElement>();

function loadBorderImage(src: string): HTMLImageElement | null {
  if (!src) return null;

  let img = borderImageCache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    borderImageCache.set(src, img);
  }
  return img;
}

// Image cache for tile sprites
const tileImageCache = new Map<string, HTMLImageElement>();

function loadTileImage(src: string): HTMLImageElement | null {
  if (!src) return null;

  let img = tileImageCache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    tileImageCache.set(src, img);
  }
  return img;
}

function drawCustomBorder(
  ctx: CanvasRenderingContext2D,
  gridWidth: number,
  gridHeight: number,
  totalWidth: number,
  totalHeight: number,
  sprites: import('../../types/game').CustomBorderSprites
) {
  const gridPixelWidth = gridWidth * TILE_SIZE;
  const gridPixelHeight = gridHeight * TILE_SIZE;

  ctx.save();

  // Background behind border (dark void)
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // Load all sprite images
  const wallFrontImg = loadBorderImage(sprites.wallFront || '');
  const wallTopImg = loadBorderImage(sprites.wallTop || '');
  const wallSideImg = loadBorderImage(sprites.wallSide || '');
  const wallBottomOuterImg = loadBorderImage(sprites.wallBottomOuter || sprites.wallFront || '');
  const cornerTLImg = loadBorderImage(sprites.cornerTopLeft || '');
  const cornerTRImg = loadBorderImage(sprites.cornerTopRight || '');
  const cornerBLImg = loadBorderImage(sprites.cornerBottomLeft || '');
  const cornerBRImg = loadBorderImage(sprites.cornerBottomRight || '');

  // Draw top wall - fixed size (48x48), tiled horizontally
  if (wallFrontImg && wallFrontImg.complete) {
    for (let x = SIDE_BORDER_SIZE; x < SIDE_BORDER_SIZE + gridPixelWidth; x += TILE_SIZE) {
      ctx.drawImage(wallFrontImg, x, 0, TILE_SIZE, BORDER_SIZE);
    }
  } else {
    // Fallback to dungeon style
    ctx.fillStyle = '#3a3a4a';
    ctx.fillRect(SIDE_BORDER_SIZE, 0, gridPixelWidth, BORDER_SIZE);
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(SIDE_BORDER_SIZE, BORDER_SIZE - 12, gridPixelWidth, 12);
  }

  // Draw bottom wall - fixed size (48x48), tiled horizontally
  if (wallBottomOuterImg && wallBottomOuterImg.complete) {
    for (let x = SIDE_BORDER_SIZE; x < SIDE_BORDER_SIZE + gridPixelWidth; x += TILE_SIZE) {
      ctx.drawImage(wallBottomOuterImg, x, BORDER_SIZE + gridPixelHeight, TILE_SIZE, BORDER_SIZE);
    }
  } else {
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(SIDE_BORDER_SIZE, BORDER_SIZE + gridPixelHeight, gridPixelWidth, BORDER_SIZE);
    ctx.fillStyle = '#3a3a4a';
    ctx.fillRect(SIDE_BORDER_SIZE, BORDER_SIZE + gridPixelHeight, gridPixelWidth, 8);
  }

  // Draw left wall - fixed size tiled vertically
  if (wallSideImg && wallSideImg.complete) {
    for (let y = BORDER_SIZE; y < BORDER_SIZE + gridPixelHeight; y += TILE_SIZE) {
      ctx.drawImage(wallSideImg, 0, y, SIDE_BORDER_SIZE, TILE_SIZE);
    }
  } else {
    ctx.fillStyle = '#323242';
    ctx.fillRect(0, BORDER_SIZE, SIDE_BORDER_SIZE, gridPixelHeight);
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(SIDE_BORDER_SIZE - 6, BORDER_SIZE, 6, gridPixelHeight);
  }

  // Draw right wall (mirrored) - fixed size tiled vertically
  if (wallSideImg && wallSideImg.complete) {
    for (let y = BORDER_SIZE; y < BORDER_SIZE + gridPixelHeight; y += TILE_SIZE) {
      ctx.save();
      ctx.translate(SIDE_BORDER_SIZE + gridPixelWidth + SIDE_BORDER_SIZE, y);
      ctx.scale(-1, 1);
      ctx.drawImage(wallSideImg, 0, 0, SIDE_BORDER_SIZE, TILE_SIZE);
      ctx.restore();
    }
  } else {
    ctx.fillStyle = '#323242';
    ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE, SIDE_BORDER_SIZE, gridPixelHeight);
    ctx.fillStyle = '#3a3a4a';
    ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE, 6, gridPixelHeight);
  }

  // Draw corners - fixed sizes
  // Top-left corner
  if (cornerTLImg && cornerTLImg.complete) {
    ctx.drawImage(cornerTLImg, 0, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
  } else {
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(0, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
  }

  // Top-right corner
  if (cornerTRImg && cornerTRImg.complete) {
    ctx.drawImage(cornerTRImg, SIDE_BORDER_SIZE + gridPixelWidth, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
  } else {
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
  }

  // Bottom-left corner
  if (cornerBLImg && cornerBLImg.complete) {
    ctx.drawImage(cornerBLImg, 0, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);
  } else {
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(0, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);
  }

  // Bottom-right corner
  if (cornerBRImg && cornerBRImg.complete) {
    ctx.drawImage(cornerBRImg, SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);
  } else {
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);
  }

  ctx.restore();
}

/**
 * Draw smart custom border that conforms to irregular puzzle shapes using custom sprites
 */
function drawSmartCustomBorder(
  ctx: CanvasRenderingContext2D,
  tiles: (import('../../types/game').TileOrNull)[][],
  gridWidth: number,
  gridHeight: number,
  sprites: import('../../types/game').CustomBorderSprites
) {
  const borderData = computeSmartBorder(tiles, gridWidth, gridHeight);
  const offsetX = SIDE_BORDER_SIZE;
  const offsetY = BORDER_SIZE;

  // Load all sprite images
  const wallFrontImg = loadBorderImage(sprites.wallFront || '');
  const wallTopImg = loadBorderImage(sprites.wallTop || '');
  const wallSideImg = loadBorderImage(sprites.wallSide || '');
  const wallBottomOuterImg = loadBorderImage(sprites.wallBottomOuter || sprites.wallFront || '');
  // Full-size corners (24x48)
  const cornerTLImg = loadBorderImage(sprites.cornerTopLeft || '');
  const cornerTRImg = loadBorderImage(sprites.cornerTopRight || '');
  const cornerBLImg = loadBorderImage(sprites.cornerBottomLeft || '');
  const cornerBRImg = loadBorderImage(sprites.cornerBottomRight || '');
  // Thin corners (24x24) - fall back to full-size if not provided
  const cornerBLThinImg = loadBorderImage(sprites.cornerBottomLeftThin || sprites.cornerBottomLeft || '');
  const cornerBRThinImg = loadBorderImage(sprites.cornerBottomRightThin || sprites.cornerBottomRight || '');
  // Full-size inner corners (24x48)
  const innerCornerTLImg = loadBorderImage(sprites.innerCornerTopLeft || '');
  const innerCornerTRImg = loadBorderImage(sprites.innerCornerTopRight || '');
  const innerCornerBLImg = loadBorderImage(sprites.innerCornerBottomLeft || '');
  const innerCornerBRImg = loadBorderImage(sprites.innerCornerBottomRight || '');
  // Thin inner corners (24x24) - fall back to full-size if not provided
  const innerCornerBLThinImg = loadBorderImage(sprites.innerCornerBottomLeftThin || sprites.innerCornerBottomLeft || '');
  const innerCornerBRThinImg = loadBorderImage(sprites.innerCornerBottomRightThin || sprites.innerCornerBottomRight || '');

  ctx.save();

  // Draw edge borders for each exposed tile edge
  borderData.edges.forEach(({ x, y, edge, isOuterEdge }) => {
    const px = offsetX + x * TILE_SIZE;
    const py = offsetY + y * TILE_SIZE;

    switch (edge) {
      case 'top':
        // Top edge - front-facing wall (fixed 48x48 size)
        if (wallFrontImg && wallFrontImg.complete) {
          ctx.drawImage(wallFrontImg, px, py - BORDER_SIZE, TILE_SIZE, BORDER_SIZE);
        } else {
          drawTopWallSegment(ctx, px, py);
        }
        break;
      case 'bottom':
        // Bottom edge - thin wall-top for interior, full for outer
        if (isOuterEdge) {
          if (wallBottomOuterImg && wallBottomOuterImg.complete) {
            ctx.drawImage(wallBottomOuterImg, px, py + TILE_SIZE, TILE_SIZE, BORDER_SIZE);
          } else {
            drawBottomWallSegment(ctx, px, py, true);
          }
        } else {
          if (wallTopImg && wallTopImg.complete) {
            ctx.drawImage(wallTopImg, px, py + TILE_SIZE, TILE_SIZE, SIDE_BORDER_SIZE);
          } else {
            drawBottomWallSegment(ctx, px, py, false);
          }
        }
        break;
      case 'left':
        // Left edge - side wall (fixed size)
        if (wallSideImg && wallSideImg.complete) {
          ctx.drawImage(wallSideImg, px - SIDE_BORDER_SIZE, py, SIDE_BORDER_SIZE, TILE_SIZE);
        } else {
          drawLeftWallSegment(ctx, px, py);
        }
        break;
      case 'right':
        // Right edge - side wall (mirrored, fixed size)
        if (wallSideImg && wallSideImg.complete) {
          ctx.save();
          ctx.translate(px + TILE_SIZE + SIDE_BORDER_SIZE, py);
          ctx.scale(-1, 1);
          ctx.drawImage(wallSideImg, 0, 0, SIDE_BORDER_SIZE, TILE_SIZE);
          ctx.restore();
        } else {
          drawRightWallSegment(ctx, px, py);
        }
        break;
    }
  });

  // Draw corners on top of edges (fixed sizes)
  borderData.corners.forEach(({ x, y, type, isOuterBottom }) => {
    const px = offsetX + x * TILE_SIZE;
    const py = offsetY + y * TILE_SIZE;

    // Determine corner height based on outer/inner positioning
    const cornerHeight = isOuterBottom ? BORDER_SIZE : SIDE_BORDER_SIZE;

    switch (type) {
      case 'convex-tl':
        if (cornerTLImg && cornerTLImg.complete) {
          ctx.drawImage(cornerTLImg, px - SIDE_BORDER_SIZE, py - BORDER_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
        } else {
          drawCornerSegment(ctx, px, py, type, isOuterBottom);
        }
        break;
      case 'convex-tr':
        if (cornerTRImg && cornerTRImg.complete) {
          ctx.drawImage(cornerTRImg, px + TILE_SIZE, py - BORDER_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
        } else {
          drawCornerSegment(ctx, px, py, type, isOuterBottom);
        }
        break;
      case 'convex-bl':
        // Use thin variant for interior voids, full for outer perimeter
        if (isOuterBottom) {
          if (cornerBLImg && cornerBLImg.complete) {
            ctx.drawImage(cornerBLImg, px - SIDE_BORDER_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
          } else {
            drawCornerSegment(ctx, px, py, type, isOuterBottom);
          }
        } else {
          if (cornerBLThinImg && cornerBLThinImg.complete) {
            ctx.drawImage(cornerBLThinImg, px - SIDE_BORDER_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, SIDE_BORDER_SIZE);
          } else {
            drawCornerSegment(ctx, px, py, type, isOuterBottom);
          }
        }
        break;
      case 'convex-br':
        // Use thin variant for interior voids, full for outer perimeter
        if (isOuterBottom) {
          if (cornerBRImg && cornerBRImg.complete) {
            ctx.drawImage(cornerBRImg, px + TILE_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
          } else {
            drawCornerSegment(ctx, px, py, type, isOuterBottom);
          }
        } else {
          if (cornerBRThinImg && cornerBRThinImg.complete) {
            ctx.drawImage(cornerBRThinImg, px + TILE_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, SIDE_BORDER_SIZE);
          } else {
            drawCornerSegment(ctx, px, py, type, isOuterBottom);
          }
        }
        break;
      case 'concave-tl':
        if (innerCornerTLImg && innerCornerTLImg.complete) {
          ctx.drawImage(innerCornerTLImg, px - SIDE_BORDER_SIZE, py - BORDER_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
        } else {
          drawCornerSegment(ctx, px, py, type, isOuterBottom);
        }
        break;
      case 'concave-tr':
        if (innerCornerTRImg && innerCornerTRImg.complete) {
          ctx.drawImage(innerCornerTRImg, px + TILE_SIZE, py - BORDER_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
        } else {
          drawCornerSegment(ctx, px, py, type, isOuterBottom);
        }
        break;
      case 'concave-bl':
        // Use thin variant for interior voids, full for outer perimeter
        if (isOuterBottom) {
          if (innerCornerBLImg && innerCornerBLImg.complete) {
            ctx.drawImage(innerCornerBLImg, px - SIDE_BORDER_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
          } else {
            drawCornerSegment(ctx, px, py, type, isOuterBottom);
          }
        } else {
          if (innerCornerBLThinImg && innerCornerBLThinImg.complete) {
            ctx.drawImage(innerCornerBLThinImg, px - SIDE_BORDER_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, SIDE_BORDER_SIZE);
          } else {
            drawCornerSegment(ctx, px, py, type, isOuterBottom);
          }
        }
        break;
      case 'concave-br':
        // Use thin variant for interior voids, full for outer perimeter
        if (isOuterBottom) {
          if (innerCornerBRImg && innerCornerBRImg.complete) {
            ctx.drawImage(innerCornerBRImg, px + TILE_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
          } else {
            drawCornerSegment(ctx, px, py, type, isOuterBottom);
          }
        } else {
          if (innerCornerBRThinImg && innerCornerBRThinImg.complete) {
            ctx.drawImage(innerCornerBRThinImg, px + TILE_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, SIDE_BORDER_SIZE);
          } else {
            drawCornerSegment(ctx, px, py, type, isOuterBottom);
          }
        }
        break;
    }
  });

  ctx.restore();
}

function drawVoidTile(_ctx: CanvasRenderingContext2D, _x: number, _y: number) {
  // Void tiles are truly transparent - we don't draw anything here.
  // The border will be drawn around the edges of playable tiles instead.
  // This allows the page background or parent element to show through.
}

function drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, type: TileType, tileSprites?: TileSprites, tile?: Tile | null) {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;

  // Check for custom tile type
  let customTileType: CustomTileType | null = null;
  if (tile?.customTileTypeId) {
    customTileType = loadTileType(tile.customTileTypeId);
  }

  // First: Draw custom tile sprite if available
  if (customTileType?.customSprite?.idleImageData) {
    const customImg = loadTileImage(customTileType.customSprite.idleImageData);
    if (customImg?.complete) {
      ctx.drawImage(customImg, px, py, TILE_SIZE, TILE_SIZE);
      // Draw grid lines
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      // Draw behavior indicators on top
      drawTileBehaviorIndicators(ctx, px, py, customTileType, tile);
      return;
    }
  }

  // Second: Use skin tile sprites if available
  const isWall = type === TileType.WALL;
  const isGoal = type === TileType.GOAL;
  const spriteKey = isGoal ? 'goal' : (isWall ? 'wall' : 'empty');
  const spriteUrl = tileSprites?.[spriteKey];

  if (spriteUrl) {
    const tileImg = loadTileImage(spriteUrl);
    if (tileImg?.complete) {
      ctx.drawImage(tileImg, px, py, TILE_SIZE, TILE_SIZE);
      // Still draw grid lines on top
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      // Draw behavior indicators if this is a custom tile
      if (customTileType) {
        drawTileBehaviorIndicators(ctx, px, py, customTileType, tile);
      }
      return;
    }
  }

  // Fallback to default colors
  ctx.fillStyle = type === TileType.WALL ? COLORS.wall : COLORS.empty;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

  // Draw behavior indicators if this is a custom tile without custom sprite
  if (customTileType) {
    drawTileBehaviorIndicators(ctx, px, py, customTileType, tile);
  }
}

/**
 * Draw visual indicators for tile behaviors
 */
function drawTileBehaviorIndicators(ctx: CanvasRenderingContext2D, px: number, py: number, tileType: CustomTileType, tile?: Tile | null) {
  const centerX = px + TILE_SIZE / 2;
  const centerY = py + TILE_SIZE / 2;

  for (const behavior of tileType.behaviors) {
    switch (behavior.type) {
      case 'damage':
        // Red tint overlay
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        // Fire icon
        ctx.font = '16px Arial';
        ctx.fillStyle = 'rgba(255, 100, 0, 0.8)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔥', centerX, centerY);
        break;

      case 'teleport':
        // Purple glow
        ctx.fillStyle = 'rgba(128, 0, 255, 0.2)';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        // Show teleport group letter
        const groupId = tile?.teleportGroupId || behavior.teleportGroupId || 'A';
        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = 'rgba(200, 100, 255, 0.9)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(groupId, centerX, centerY);
        break;

      case 'direction_change':
        // Arrow showing forced direction
        ctx.fillStyle = 'rgba(0, 200, 255, 0.3)';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        const arrow = getDirectionArrow(behavior.newFacing);
        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = 'rgba(0, 200, 255, 0.9)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(arrow, centerX, centerY);
        break;

      case 'ice':
        // Blue tint with diagonal lines
        ctx.fillStyle = 'rgba(100, 200, 255, 0.3)';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        // Draw diagonal lines pattern with clipping
        ctx.save();
        ctx.beginPath();
        ctx.rect(px, py, TILE_SIZE, TILE_SIZE);
        ctx.clip();
        ctx.strokeStyle = 'rgba(150, 220, 255, 0.6)';
        ctx.lineWidth = 1;
        for (let i = -TILE_SIZE; i < TILE_SIZE * 2; i += 8) {
          ctx.beginPath();
          ctx.moveTo(px + i, py);
          ctx.lineTo(px + i + TILE_SIZE, py + TILE_SIZE);
          ctx.stroke();
        }
        ctx.restore();
        break;

      case 'pressure_plate':
        // Button-like appearance
        ctx.fillStyle = 'rgba(100, 100, 100, 0.3)';
        ctx.fillRect(px + 8, py + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        ctx.strokeStyle = 'rgba(80, 80, 80, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 8, py + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        break;
    }
  }
}

/**
 * Get arrow character for direction
 */
function getDirectionArrow(direction?: string): string {
  switch (direction) {
    case 'north': return '↑';
    case 'northeast': return '↗';
    case 'east': return '→';
    case 'southeast': return '↘';
    case 'south': return '↓';
    case 'southwest': return '↙';
    case 'west': return '←';
    case 'northwest': return '↖';
    default: return '→';
  }
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
