import React, { useRef, useEffect } from 'react';
import type { Puzzle, PlacedCharacter } from '../../types/game';

interface MiniGridPreviewProps {
  puzzle: Puzzle;
  placements: PlacedCharacter[];
  size?: number;
}

/**
 * A tiny canvas rendering of the puzzle grid showing tile layout,
 * enemy positions (red), and hero placements (blue).
 * Used in the bug report modal for quick visual identification of runs.
 */
export const MiniGridPreview: React.FC<MiniGridPreviewProps> = ({
  puzzle,
  placements,
  size = 100,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    ctx.fillStyle = '#1c1917'; // stone-950
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Draw tiles
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const tile = puzzle.tiles[y]?.[x];
        const px = x * cellSize;
        const py = y * cellSize;

        if (!tile) {
          // Null tile — dark void
          ctx.fillStyle = '#0c0a09'; // stone-950 darker
          ctx.fillRect(px, py, cellSize, cellSize);
        } else if (tile.type === 'wall') {
          ctx.fillStyle = '#44403c'; // stone-700
          ctx.fillRect(px, py, cellSize, cellSize);
        } else {
          ctx.fillStyle = '#292524'; // stone-800
          ctx.fillRect(px, py, cellSize, cellSize);
        }

        // Grid lines
        ctx.strokeStyle = '#1c1917';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px, py, cellSize, cellSize);
      }
    }

    const dotRadius = Math.max(cellSize * 0.3, 2);

    // Draw enemies (red)
    for (const enemy of puzzle.enemies) {
      const cx = enemy.x * cellSize + cellSize / 2;
      const cy = enemy.y * cellSize + cellSize / 2;
      ctx.fillStyle = '#ef4444'; // red-500
      ctx.beginPath();
      ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw heroes (blue)
    for (const char of placements) {
      if (char.dead) continue;
      const cx = char.x * cellSize + cellSize / 2;
      const cy = char.y * cellSize + cellSize / 2;
      ctx.fillStyle = '#3b82f6'; // blue-500
      ctx.beginPath();
      ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [puzzle, placements, size]);

  return (
    <canvas
      ref={canvasRef}
      className="rounded border border-stone-700/50"
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  );
};
