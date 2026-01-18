import React, { useRef, useEffect } from 'react';
import type { GameState, PlacedCharacter, PlacedEnemy } from '../../types/game';
import { TileType, Direction } from '../../types/game';

interface GameBoardProps {
  gameState: GameState;
  onTileClick?: (x: number, y: number) => void;
}

const TILE_SIZE = 48; // pixels
const COLORS = {
  empty: '#1a1a1a',
  wall: '#4a4a4a',
  grid: '#333',
  character: '#4caf50',
  enemy: '#f44336',
  deadEnemy: '#8B0000',
  collectible: '#ffd700',
  highlight: '#64b5f6',
};

export const GameBoard: React.FC<GameBoardProps> = ({ gameState, onTileClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw tiles
    for (let y = 0; y < gameState.puzzle.height; y++) {
      for (let x = 0; x < gameState.puzzle.width; x++) {
        const tile = gameState.puzzle.tiles[y][x];
        drawTile(ctx, x, y, tile.type);
      }
    }

    // Draw collectibles
    for (const collectible of gameState.puzzle.collectibles) {
      if (!collectible.collected) {
        drawCollectible(ctx, collectible.x, collectible.y);
      }
    }

    // Draw enemies
    for (const enemy of gameState.puzzle.enemies) {
      drawEnemy(ctx, enemy);
    }

    // Draw characters
    for (const character of gameState.placedCharacters) {
      drawCharacter(ctx, character);
    }
  }, [gameState]);

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
      className="border-2 border-stone-600 cursor-pointer"
      style={{ imageRendering: 'pixelated' }}
    />
  );
};

function drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, type: TileType) {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;

  // Fill tile
  ctx.fillStyle = type === TileType.WALL ? COLORS.wall : COLORS.empty;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

  // Draw grid
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: PlacedEnemy) {
  const px = enemy.x * TILE_SIZE;
  const py = enemy.y * TILE_SIZE;

  // Draw enemy as circle
  ctx.fillStyle = enemy.dead ? COLORS.deadEnemy : COLORS.enemy;
  ctx.beginPath();
  ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE / 3, 0, Math.PI * 2);
  ctx.fill();

  // Draw health
  if (!enemy.dead) {
    ctx.fillStyle = 'white';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(enemy.currentHealth.toString(), px + TILE_SIZE / 2, py + TILE_SIZE / 2);
  } else {
    // Draw X for dead enemy
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

function drawCharacter(ctx: CanvasRenderingContext2D, character: PlacedCharacter) {
  if (character.dead) return;

  const px = character.x * TILE_SIZE;
  const py = character.y * TILE_SIZE;

  // Draw character as square
  ctx.fillStyle = COLORS.character;
  const size = TILE_SIZE * 0.6;
  const offset = (TILE_SIZE - size) / 2;
  ctx.fillRect(px + offset, py + offset, size, size);

  // Draw facing direction
  drawDirectionArrow(ctx, px + TILE_SIZE / 2, py + TILE_SIZE / 2, character.facing);

  // Draw health
  ctx.fillStyle = 'white';
  ctx.font = '10px monospace';
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

  // Draw collectible as star
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
