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
        drawBorder(ctx, gameState.puzzle.width, gameState.puzzle.height, borderStyle, gameState.puzzle.borderConfig);
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
      className="border-2 border-gray-600 cursor-pointer rounded"
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

function drawBorder(ctx: CanvasRenderingContext2D, gridWidth: number, gridHeight: number, style: string, config?: any) {
  const totalWidth = gridWidth * TILE_SIZE + (SIDE_BORDER_SIZE * 2);
  const totalHeight = gridHeight * TILE_SIZE + (BORDER_SIZE * 2);

  if (style === 'dungeon') {
    drawDungeonBorder(ctx, gridWidth, gridHeight, totalWidth, totalHeight);
  } else if (style === 'custom' && config?.customBorderSprites) {
    drawCustomBorder(ctx, gridWidth, gridHeight, totalWidth, totalHeight, config.customBorderSprites);
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

  // Bottom wall (simpler, just top edge visible)
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(0, BORDER_SIZE + gridPixelHeight, totalWidth, BORDER_SIZE);

  // Bottom wall top edge
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
  // Top-left
  ctx.fillRect(0, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
  // Top-right
  ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
  // Bottom-left
  ctx.fillRect(0, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);
  // Bottom-right
  ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);

  ctx.restore();
}

function drawCustomBorder(ctx: CanvasRenderingContext2D, gridWidth: number, gridHeight: number, totalWidth: number, totalHeight: number, sprites: any) {
  // TODO: Implement custom sprite border rendering
  // For now, fall back to dungeon style
  drawDungeonBorder(ctx, gridWidth, gridHeight, totalWidth, totalHeight);
}

function drawVoidTile(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;

  // Draw as darker/void space to indicate non-playable area
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

  // Optional: add a subtle diagonal pattern to make it clear it's void
  ctx.strokeStyle = '#151515';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + TILE_SIZE, py + TILE_SIZE);
  ctx.moveTo(px + TILE_SIZE, py);
  ctx.lineTo(px, py + TILE_SIZE);
  ctx.stroke();
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
