import React, { useRef, useEffect, useState } from 'react';
import type { GameState, PlacedCharacter, PlacedEnemy, Projectile, ParticleEffect } from '../../types/game';
import { TileType, Direction } from '../../types/game';
import { getCharacter } from '../../data/characters';
import { getEnemy } from '../../data/enemies';
import { drawSprite } from '../editor/SpriteEditor';
import type { CustomCharacter, CustomEnemy } from '../../utils/assetStorage';

interface AnimatedGameBoardProps {
  gameState: GameState;
  onTileClick?: (x: number, y: number) => void;
}

const TILE_SIZE = 48;
const ANIMATION_DURATION = 600; // ms per move (matches slower simulation speed)

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
}

interface CharacterAttack {
  characterIndex: number;
  startTime: number;
  direction: Direction;
}

export const AnimatedGameBoard: React.FC<AnimatedGameBoardProps> = ({ gameState, onTileClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [characterPositions, setCharacterPositions] = useState<Map<number, CharacterPosition>>(new Map());
  const [enemyPositions, setEnemyPositions] = useState<Map<number, CharacterPosition>>(new Map());
  const prevCharactersRef = useRef<PlacedCharacter[]>([]);
  const prevEnemiesRef = useRef<PlacedEnemy[]>([]);
  const animationRef = useRef<number>();

  // Detect character movement
  useEffect(() => {
    const newPositions = new Map<number, CharacterPosition>();
    const now = Date.now();

    gameState.placedCharacters.forEach((char, idx) => {
      const prevChar = prevCharactersRef.current[idx];
      const existing = characterPositions.get(idx);

      if (prevChar && (prevChar.x !== char.x || prevChar.y !== char.y)) {
        // Character moved!
        console.log(`Animation: Character ${idx} moved from (${prevChar.x},${prevChar.y}) to (${char.x},${char.y})`);
        newPositions.set(idx, {
          fromX: prevChar.x,
          fromY: prevChar.y,
          toX: char.x,
          toY: char.y,
          startTime: now,
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
        console.log(`Animation: Enemy ${idx} moved from (${prevEnemy.x},${prevEnemy.y}) to (${enemy.x},${enemy.y})`);
        newPositions.set(idx, {
          fromX: prevEnemy.x,
          fromY: prevEnemy.y,
          toX: enemy.x,
          toY: enemy.y,
          startTime: now,
        });
      } else if (existing && now - existing.startTime < ANIMATION_DURATION) {
        // Keep existing animation
        newPositions.set(idx, existing);
      }
    });

    setEnemyPositions(newPositions);
    prevEnemiesRef.current = [...gameState.puzzle.enemies];
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
        gameState.activeProjectiles.forEach(projectile => {
          drawProjectile(ctx, projectile);
        });
      }

      // Draw particles (Phase 2 - effects layer)
      if (gameState.activeParticles && gameState.activeParticles.length > 0) {
        gameState.activeParticles.forEach(particle => {
          drawParticle(ctx, particle, now);
        });
      }

      // Draw enemies
      gameState.puzzle.enemies.forEach((enemy, idx) => {
        const enemyAnim = enemyPositions.get(idx);
        const isEnemyMoving = enemyAnim && now - enemyAnim.startTime < ANIMATION_DURATION;
        drawEnemy(ctx, enemy, isEnemyMoving || false);
      });

      // Draw characters with animation
      gameState.placedCharacters.forEach((character, idx) => {
        const anim = characterPositions.get(idx);

        if (anim && now - anim.startTime < ANIMATION_DURATION) {
          // Animating
          const elapsed = now - anim.startTime;
          const progress = Math.min(1, elapsed / ANIMATION_DURATION);
          const eased = easeInOutQuad(progress);

          const renderX = anim.fromX + (anim.toX - anim.fromX) * eased;
          const renderY = anim.fromY + (anim.toY - anim.fromY) * eased;

          drawCharacter(ctx, character, renderX, renderY, true); // isMoving = true
        } else {
          // Not animating - draw at actual position
          drawCharacter(ctx, character, character.x, character.y, false); // isMoving = false
        }
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [gameState, characterPositions, enemyPositions]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onTileClick) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / TILE_SIZE);
    const y = Math.floor((e.clientY - rect.top) / TILE_SIZE);

    if (x >= 0 && x < gameState.puzzle.width && y >= 0 && y < gameState.puzzle.height) {
      onTileClick(x, y);
    }
  };

  const canvasWidth = gameState.puzzle.width * TILE_SIZE;
  const canvasHeight = gameState.puzzle.height * TILE_SIZE;

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

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: PlacedEnemy, isMoving: boolean = false) {
  const px = enemy.x * TILE_SIZE;
  const py = enemy.y * TILE_SIZE;

  // Check if this enemy has a custom sprite
  const enemyData = getEnemy(enemy.enemyId) as CustomEnemy | undefined;
  const hasCustomSprite = enemyData && 'customSprite' in enemyData && enemyData.customSprite;

  if (hasCustomSprite && enemyData.customSprite) {
    // Draw custom sprite with idle/moving state
    if (!enemy.dead) {
      drawSprite(ctx, enemyData.customSprite, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, enemy.facing, isMoving);
    } else {
      // Draw dimmed version when dead
      ctx.globalAlpha = 0.3;
      drawSprite(ctx, enemyData.customSprite, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, enemy.facing, false);
      ctx.globalAlpha = 1.0;
    }
  } else {
    // Default rendering
    ctx.fillStyle = enemy.dead ? COLORS.deadEnemy : COLORS.enemy;
    ctx.beginPath();
    ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE / 3, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!enemy.dead) {
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(enemy.currentHealth.toString(), px + TILE_SIZE / 2, py + TILE_SIZE / 2);
  } else {
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + TILE_SIZE / 3, py + TILE_SIZE / 3);
    ctx.lineTo(px + (2 * TILE_SIZE) / 3, py + (2 * TILE_SIZE) / 3);
    ctx.moveTo(px + (2 * TILE_SIZE) / 3, py + TILE_SIZE / 3);
    ctx.lineTo(px + TILE_SIZE / 3, py + (2 * TILE_SIZE) / 3);
    ctx.stroke();
  }
}

function drawCharacter(ctx: CanvasRenderingContext2D, character: PlacedCharacter, x: number, y: number, isMoving: boolean = false) {
  if (character.dead) return;

  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;

  // Check if this character has a custom sprite
  const charData = getCharacter(character.characterId) as CustomCharacter | undefined;
  const hasCustomSprite = charData && 'customSprite' in charData && charData.customSprite;

  if (hasCustomSprite && charData.customSprite) {
    // Draw custom sprite with directional support and idle/moving state
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    drawSprite(ctx, charData.customSprite, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, character.facing, isMoving);

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  } else {
    // Default rendering
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
  }

  // Draw direction arrow
  drawDirectionArrow(ctx, px + TILE_SIZE / 2, py + TILE_SIZE / 2, character.facing);

  // Draw health
  ctx.fillStyle = 'white';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`HP:${character.currentHealth}`, px + TILE_SIZE / 2, py + TILE_SIZE - 12);
}

function drawDirectionArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  direction: Direction
) {
  const arrowSize = 8;
  ctx.fillStyle = 'white';
  ctx.beginPath();

  switch (direction) {
    case Direction.NORTH:
      ctx.moveTo(cx, cy - arrowSize);
      ctx.lineTo(cx - arrowSize / 2, cy);
      ctx.lineTo(cx + arrowSize / 2, cy);
      break;
    case Direction.EAST:
      ctx.moveTo(cx + arrowSize, cy);
      ctx.lineTo(cx, cy - arrowSize / 2);
      ctx.lineTo(cx, cy + arrowSize / 2);
      break;
    case Direction.SOUTH:
      ctx.moveTo(cx, cy + arrowSize);
      ctx.lineTo(cx - arrowSize / 2, cy);
      ctx.lineTo(cx + arrowSize / 2, cy);
      break;
    case Direction.WEST:
      ctx.moveTo(cx - arrowSize, cy);
      ctx.lineTo(cx, cy - arrowSize / 2);
      ctx.lineTo(cx, cy + arrowSize / 2);
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
 * Draw a projectile - uses fractional coordinates for smooth movement
 */
function drawProjectile(ctx: CanvasRenderingContext2D, projectile: Projectile) {
  if (!projectile.active) return;

  // Convert tile coordinates to pixel coordinates (fractional for smooth movement)
  const px = projectile.x * TILE_SIZE + TILE_SIZE / 2;
  const py = projectile.y * TILE_SIZE + TILE_SIZE / 2;

  // Check if projectile has custom sprite
  if (projectile.attackData.projectileSprite) {
    // TODO: Render custom sprite when sprite system is implemented
    // For now, draw a simple circle
    drawDefaultProjectile(ctx, px, py);
  } else {
    // Default projectile rendering
    drawDefaultProjectile(ctx, px, py);
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
function drawParticle(ctx: CanvasRenderingContext2D, particle: ParticleEffect, now: number) {
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
  if (particle.sprite) {
    // TODO: Render custom sprite when sprite system is implemented
    // For now, draw a simple flash effect
    drawDefaultParticle(ctx, px, py, progress);
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
