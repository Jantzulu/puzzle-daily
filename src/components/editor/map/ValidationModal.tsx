// Validation results modal (solver outcome + optimal-placement mini-map).
// Extracted verbatim from MapEditor.tsx (Phase 1 decomposition, 2026-07-14).
import React from 'react';
import type { TileOrNull, PlacedEnemy } from '../../../types/game';
import { getCharacter } from '../../../data/characters';
import { loadSpellAsset } from '../../../utils/assetStorage';
import { SpriteThumbnail } from '../SpriteThumbnail';
import type { SolverResult } from '../../../engine/puzzleSolver';

interface ValidationModalProps {
  isOpen: boolean;
  isValidating: boolean;
  validationResult: SolverResult | null;
  gridWidth: number;
  gridHeight: number;
  tiles: TileOrNull[][];
  enemies: PlacedEnemy[];
  onClose: () => void;
}

export const ValidationModal: React.FC<ValidationModalProps> = ({
  isOpen,
  isValidating,
  validationResult,
  gridWidth,
  gridHeight,
  tiles,
  enemies,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-stone-800 rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          {isValidating ? (
            <>
              <span className="animate-spin">⏳</span> Validating Puzzle...
            </>
          ) : validationResult?.solvable ? (
            <>
              <span className="text-green-400">✓</span> Puzzle is Solvable!
            </>
          ) : (
            <>
              <span className="text-red-400">✗</span> Puzzle Not Solvable
            </>
          )}
        </h2>

        {isValidating ? (
          <div className="text-stone-400 text-center py-4">
            <p>Testing character placement combinations...</p>
            <p className="text-sm mt-2">This may take a few seconds.</p>
          </div>
        ) : validationResult ? (
          <div className="space-y-3">
            {validationResult.error && (
              <div className="bg-red-900/30 border border-red-700 rounded p-3 text-sm">
                <span className="font-semibold text-red-400">Issue: </span>
                {validationResult.error}
              </div>
            )}

            {validationResult.warnings && validationResult.warnings.length > 0 && (
              <div className="bg-yellow-900/30 border border-yellow-700 rounded p-3 text-sm">
                <span className="font-semibold text-yellow-400 block mb-1">Warnings:</span>
                <ul className="space-y-0.5 text-yellow-200/80">
                  {validationResult.warnings.map((w, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-yellow-500 flex-shrink-0">{'•'}</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {validationResult.solvable && validationResult.solutionFound && (
              <>
                <div className="bg-green-900/30 border border-green-700 rounded p-3">
                  <div className="font-semibold text-green-400 mb-2">Solution Found!</div>
                  <div className="text-sm space-y-1">
                    <div>
                      <span className="text-stone-400">Minimum characters needed: </span>
                      <span className="text-parchment-100 font-bold">{validationResult.minCharactersNeeded}</span>
                    </div>
                    <div>
                      <span className="text-stone-400">Fastest solution: </span>
                      <span className="text-parchment-100 font-bold">{validationResult.solutionFound.turnsToWin} turns</span>
                    </div>
                    <div>
                      <span className="text-stone-400">Combinations tested: </span>
                      <span className="text-parchment-100">{validationResult.totalCombinationsTested.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-stone-400">Search time: </span>
                      <span className="text-parchment-100">{(validationResult.searchTimeMs / 1000).toFixed(2)}s</span>
                    </div>
                  </div>
                </div>

                <div className="bg-stone-700/50 rounded p-3">
                  <div className="font-semibold text-parchment-300 mb-2 text-sm">Optimal Placement:</div>

                  {/* Visual Mini-Map */}
                  <div className="flex justify-center mb-3">
                    <div
                      className="inline-grid gap-px bg-stone-600 p-px rounded"
                      style={{
                        gridTemplateColumns: `repeat(${gridWidth}, minmax(0, 1fr))`,
                      }}
                    >
                      {Array.from({ length: gridHeight }).map((_, y) =>
                        Array.from({ length: gridWidth }).map((_, x) => {
                          const tile = tiles[y]?.[x];
                          const placement = validationResult.solutionFound?.placements.find(
                            p => p.x === x && p.y === y
                          );
                          const charData = placement ? getCharacter(placement.characterId) : null;
                          const enemy = enemies.find(e => e.x === x && e.y === y);

                          // Determine tile background color
                          let bgColor = 'bg-stone-800'; // empty
                          if (!tile) bgColor = 'bg-stone-950'; // void
                          else if (tile.type === 'wall') bgColor = 'bg-stone-600';
                          else if (tile.type === 'goal') bgColor = 'bg-yellow-600/50';
                          else if (tile.customTileTypeId) bgColor = 'bg-purple-900/50';

                          // Calculate cell size based on grid dimensions
                          const maxSize = 280; // max width of mini-map
                          const cellSize = Math.min(24, Math.floor(maxSize / Math.max(gridWidth, gridHeight)));

                          // Direction arrow mapping
                          const directionArrows: Record<string, string> = {
                            north: '↑', northeast: '↗', east: '→', southeast: '↘',
                            south: '↓', southwest: '↙', west: '←', northwest: '↖',
                          };

                          return (
                            <div
                              key={`${x}-${y}`}
                              className={`${bgColor} relative flex items-center justify-center`}
                              style={{ width: cellSize, height: cellSize }}
                              title={placement
                                ? `${charData?.name || placement.characterId} facing ${placement.facing}`
                                : enemy
                                ? 'Enemy'
                                : `(${x}, ${y})`
                              }
                            >
                              {placement && (
                                <div className="absolute inset-0 m-0.5 flex items-center justify-center overflow-hidden rounded">
                                  {charData?.customSprite ? (
                                    <SpriteThumbnail sprite={charData.customSprite} size={cellSize - 2} previewType="entity" />
                                  ) : (
                                    <div className="w-full h-full bg-green-500 rounded-full flex items-center justify-center">
                                      <span className="text-parchment-100 font-bold" style={{ fontSize: Math.max(8, cellSize - 8) }}>
                                        {directionArrows[placement.facing] || '•'}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {enemy && !placement && (
                                <div className="absolute inset-0 bg-red-500 rounded-sm m-0.5 flex items-center justify-center">
                                  <span className="text-parchment-100" style={{ fontSize: Math.max(6, cellSize - 10) }}>E</span>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap gap-3 text-xs text-stone-400 mb-2 justify-center">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span>Character</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
                      <span>Enemy</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-stone-600"></div>
                      <span>Wall</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-yellow-600/50 border border-yellow-600"></div>
                      <span>Goal</span>
                    </div>
                  </div>

                  {/* Text details */}
                  <div className="space-y-1 text-sm border-t border-stone-600 pt-2">
                    {validationResult.solutionFound.placements.map((p, i) => {
                      const charData = getCharacter(p.characterId);
                      const directionArrows: Record<string, string> = {
                        north: '↑', northeast: '↗', east: '→', southeast: '↘',
                        south: '↓', southwest: '↙', west: '←', northwest: '↖',
                      };
                      return (
                        <div key={i} className="flex items-center gap-2">
                          {charData?.customSprite ? (
                            <div className="w-5 h-5 flex-shrink-0">
                              <SpriteThumbnail sprite={charData.customSprite} size={20} previewType="entity" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-parchment-100 text-xs font-bold flex-shrink-0">
                              {directionArrows[p.facing]}
                            </div>
                          )}
                          <span className="text-parchment-100">{charData?.name || p.characterId}</span>
                          <span className="text-stone-500">at ({p.x + 1}, {p.y + 1}) facing {p.facing}</span>
                          {p.spellDirectionOverrides && Object.keys(p.spellDirectionOverrides).length > 0 && (
                            <span className="text-purple-300 text-xs">
                              {Object.entries(p.spellDirectionOverrides).map(([spellId, dir]) => {
                                const spell = loadSpellAsset(spellId);
                                return `[${spell?.name || 'redirect'} → ${dir}]`;
                              }).join(' ')}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <div className="text-xs text-stone-500 pt-2 border-t border-stone-700">
              Tested {validationResult.totalCombinationsTested.toLocaleString()} combinations in{' '}
              {(validationResult.searchTimeMs / 1000).toFixed(2)}s
            </div>
          </div>
        ) : null}

        <button
          onClick={onClose}
          className="mt-4 w-full px-4 py-2 bg-stone-600 rounded hover:bg-stone-700"
        >
          Close
        </button>
      </div>
    </div>
  );
};
