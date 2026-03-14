import React, { useRef, useEffect, useState } from 'react';
import type { Puzzle, PlacedCharacter } from '../../types/game';
import { getCharacter } from '../../data/characters';
import { getEnemy } from '../../data/enemies';
import { loadImage, isImageReady, subscribeToImageLoads } from '../../utils/imageLoader';

interface MiniGridPreviewProps {
  puzzle: Puzzle;
  placements: PlacedCharacter[];
  outcome?: 'victory' | 'defeat';
  size?: number;
}

/** Get the best available image source from a sprite (idle > legacy fallback). */
function getSpriteImageSrc(sprite?: { idleImageData?: string; idleImageUrl?: string; imageData?: string; imageUrl?: string }): string | undefined {
  if (!sprite) return undefined;
  return sprite.idleImageData || sprite.idleImageUrl || sprite.imageData || sprite.imageUrl;
}

/**
 * A tiny canvas rendering of the puzzle grid showing tile layout,
 * enemy sprites, and hero sprites.
 * Used in the bug report modal for quick visual identification of runs.
 */
export const MiniGridPreview: React.FC<MiniGridPreviewProps> = ({
  puzzle,
  placements,
  outcome,
  size = 100,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, setRenderTick] = useState(0);

  // Re-render when images finish loading
  useEffect(() => {
    return subscribeToImageLoads(() => setRenderTick(t => t + 1));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width: cols, height: rows } = puzzle;
    const cellSize = Math.floor(Math.min(size / cols, size / rows));
    const canvasW = cellSize * cols;
    const canvasH = cellSize * rows;

    canvas.width = canvasW;
    canvas.height = canvasH;

    // Clear
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Draw tiles
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const tile = puzzle.tiles[y]?.[x];
        const px = x * cellSize;
        const py = y * cellSize;

        if (!tile) {
          ctx.fillStyle = '#0c0a09';
          ctx.fillRect(px, py, cellSize, cellSize);
        } else if (tile.type === 'wall') {
          ctx.fillStyle = '#44403c';
          ctx.fillRect(px, py, cellSize, cellSize);
        } else {
          ctx.fillStyle = '#292524';
          ctx.fillRect(px, py, cellSize, cellSize);
        }

        ctx.strokeStyle = '#1c1917';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px, py, cellSize, cellSize);
      }
    }

    const drawEntitySprite = (
      x: number,
      y: number,
      spriteSrc: string | undefined,
      fallbackColor: string,
    ) => {
      const px = x * cellSize;
      const py = y * cellSize;
      const padding = Math.max(1, Math.floor(cellSize * 0.1));
      const drawSize = cellSize - padding * 2;

      if (spriteSrc) {
        const img = loadImage(spriteSrc);
        if (isImageReady(img)) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img!, px + padding, py + padding, drawSize, drawSize);
          return;
        }
      }

      // Fallback: colored dot
      const dotRadius = Math.max(cellSize * 0.3, 2);
      const cx = px + cellSize / 2;
      const cy = py + cellSize / 2;
      ctx.fillStyle = fallbackColor;
      ctx.beginPath();
      ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    };

    // Draw enemies
    for (const enemy of puzzle.enemies) {
      const enemyData = getEnemy(enemy.enemyId);
      const spriteSrc = getSpriteImageSrc(enemyData?.customSprite);
      drawEntitySprite(enemy.x, enemy.y, spriteSrc, '#ef4444');
    }

    // Draw heroes
    for (const char of placements) {
      if (char.dead) continue;
      const charData = getCharacter(char.characterId);
      const spriteSrc = getSpriteImageSrc(charData?.customSprite);
      drawEntitySprite(char.x, char.y, spriteSrc, '#3b82f6');
    }

    // Outcome border
    if (outcome) {
      ctx.strokeStyle = outcome === 'victory' ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, canvasW - 2, canvasH - 2);
    }
  }, [puzzle, placements, outcome, size]);

  return (
    <canvas
      ref={canvasRef}
      className="rounded border border-stone-700/50"
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  );
};
