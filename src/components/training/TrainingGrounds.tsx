import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllPuzzles } from '../../data/puzzles';
import { getSavedPuzzles } from '../../utils/puzzleStorage';
import type { Puzzle } from '../../types/game';

export const TrainingGrounds: React.FC = () => {
  const navigate = useNavigate();

  const trainingPuzzles = useMemo(() => {
    const official = getAllPuzzles();
    const saved = getSavedPuzzles();
    const all: Puzzle[] = [...official, ...saved];
    // Dedupe by id (saved overrides official)
    const seen = new Set<string>();
    const deduped: Puzzle[] = [];
    for (const p of all) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        deduped.push(p);
      }
    }
    return deduped.filter(p => p.isTraining);
  }, []);

  const handlePlay = (puzzleId: string) => {
    navigate(`/?puzzle=${encodeURIComponent(puzzleId)}`);
  };

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl md:text-3xl font-medieval text-copper-400">Training Grounds</h1>
          <p className="text-sm text-stone-400 mt-1">
            Practice arenas to learn hero abilities and tactics
          </p>
        </div>

        {/* Arena Grid */}
        {trainingPuzzles.length === 0 ? (
          <div className="dungeon-panel p-8 text-center">
            <p className="text-stone-400 text-lg mb-2">No training arenas yet</p>
            <p className="text-stone-500 text-sm">
              Create a puzzle in the Editor and check "Training Arena" to add it here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {trainingPuzzles.map(puzzle => (
              <div
                key={puzzle.id}
                className="dungeon-panel p-4 hover:border-copper-500/50 transition-colors cursor-pointer"
                onClick={() => handlePlay(puzzle.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medieval text-copper-300 text-lg truncate">
                      {puzzle.name}
                    </h3>
                    {puzzle.description && (
                      <p className="text-stone-400 text-sm mt-1 line-clamp-2">
                        {puzzle.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-stone-500">
                      <span>{puzzle.width}x{puzzle.height}</span>
                      <span>{puzzle.enemies.length} {puzzle.enemies.length === 1 ? 'enemy' : 'enemies'}</span>
                      <span>{puzzle.maxCharacters} hero slots</span>
                    </div>
                  </div>
                  <button
                    className="dungeon-btn-primary px-3 py-1.5 text-sm font-bold shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlay(puzzle.id);
                    }}
                  >
                    Play
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
