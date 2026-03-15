import React, { useMemo } from 'react';
import type { Puzzle, PlacedCharacter } from '../../types/game';
import { getCharacter } from '../../data/characters';
import { getEnemy } from '../../data/enemies';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';

interface MiniGridPreviewProps {
  puzzle: Puzzle;
  placements: PlacedCharacter[];
  outcome?: 'victory' | 'defeat';
  size?: number;
}

/**
 * A tiny grid preview showing tile layout with SpriteThumbnail-rendered
 * hero and enemy sprites. Used in the bug report modal for quick visual
 * identification of runs.
 */
export const MiniGridPreview: React.FC<MiniGridPreviewProps> = ({
  puzzle,
  placements,
  outcome,
  size = 100,
}) => {
  const { width: cols, height: rows } = puzzle;
  const cellSize = Math.floor(Math.min(size / cols, size / rows));
  const gridW = cellSize * cols;
  const gridH = cellSize * rows;

  // Build entity lookup: { "x,y": { type, sprite } }
  const entityMap = useMemo(() => {
    const map = new Map<string, { type: 'hero' | 'enemy'; sprite: Parameters<typeof SpriteThumbnail>[0]['sprite'] }>();

    // Enemies first (heroes render on top)
    for (const enemy of puzzle.enemies) {
      const enemyData = getEnemy(enemy.enemyId);
      if (enemyData?.customSprite) {
        map.set(`${enemy.x},${enemy.y}`, { type: 'enemy', sprite: enemyData.customSprite });
      }
    }

    // Heroes
    for (const char of placements) {
      if (char.dead) continue;
      const charData = getCharacter(char.characterId);
      if (charData?.customSprite) {
        map.set(`${char.x},${char.y}`, { type: 'hero', sprite: charData.customSprite });
      }
    }

    return map;
  }, [puzzle, placements]);

  return (
    <div
      className={`rounded relative ${
        outcome === 'victory'
          ? 'ring-2 ring-green-500'
          : outcome === 'defeat'
            ? 'ring-2 ring-red-500'
            : 'border border-stone-700/50'
      }`}
      style={{ width: gridW, height: gridH }}
    >
      {/* Grid cells */}
      {Array.from({ length: rows }, (_, y) =>
        Array.from({ length: cols }, (_, x) => {
          const tile = puzzle.tiles[y]?.[x];
          const entity = entityMap.get(`${x},${y}`);

          let bgColor = '#292524'; // floor
          if (!tile) bgColor = '#0c0a09'; // void
          else if (tile.type === 'wall') bgColor = '#44403c';

          return (
            <div
              key={`${x},${y}`}
              className="absolute"
              style={{
                left: x * cellSize,
                top: y * cellSize,
                width: cellSize,
                height: cellSize,
                backgroundColor: bgColor,
                boxShadow: 'inset 0 0 0 0.5px #1c1917',
              }}
            >
              {entity && (
                <SpriteThumbnail
                  sprite={entity.sprite}
                  size={cellSize}
                  noBackground
                />
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
