import React from 'react';
import type { GameStatus } from '../../types/game';

interface ControlsProps {
  gameStatus: GameStatus;
  isSimulating: boolean;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onWipe: () => void;
  onStep: () => void;
  onTestEnemies?: () => void;
  onTestCharacters?: () => void;
  testMode?: 'none' | 'enemies' | 'characters';
  testTurnsRemaining?: number;
}

export const Controls: React.FC<ControlsProps> = ({
  gameStatus,
  isSimulating,
  onPlay,
  onPause,
  onReset,
  onWipe,
  onStep,
  onTestEnemies,
  onTestCharacters,
  testMode = 'none',
  testTurnsRemaining = 0,
}) => {
  const isTestMode = testMode !== 'none';

  return (
    <div className="p-4 bg-gray-800 rounded space-y-3">
      <h3 className="text-lg font-bold mb-4">Controls</h3>

      <div className="grid grid-cols-2 gap-2">
        {/* Play button - shows when game is running but paused */}
        {!isTestMode && gameStatus === 'running' && !isSimulating ? (
          <button
            onClick={onPlay}
            className="col-span-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-semibold transition"
          >
            Resume
          </button>
        ) : null}

        {isSimulating && gameStatus === 'running' && !isTestMode ? (
          <button
            onClick={onPause}
            className="col-span-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded font-semibold transition"
          >
            Pause
          </button>
        ) : null}

        {gameStatus === 'running' && !isSimulating && !isTestMode ? (
          <button
            onClick={onStep}
            className="col-span-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-semibold transition"
          >
            Step
          </button>
        ) : null}

        {!isTestMode && (
          <>
            <button
              onClick={onReset}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded font-semibold transition"
            >
              Reset
            </button>

            <button
              onClick={onWipe}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded font-semibold transition"
            >
              Wipe
            </button>
          </>
        )}
      </div>

      {/* Play and Test buttons - show in setup mode */}
      {gameStatus === 'setup' && !isTestMode && (
        <div className="space-y-2 pt-2 border-t border-gray-700">
          <button
            onClick={onPlay}
            className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-bold transition"
          >
            Play
          </button>

          <div className="grid grid-cols-2 gap-2">
            {onTestCharacters && (
              <button
                onClick={onTestCharacters}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 rounded font-semibold transition text-sm"
                title="Test your characters without enemies for 5 turns"
              >
                Test Characters
              </button>
            )}

            {onTestEnemies && (
              <button
                onClick={onTestEnemies}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded font-semibold transition text-sm"
                title="Watch enemies move without characters for 5 turns"
              >
                Test Enemies
              </button>
            )}
          </div>
        </div>
      )}

      {gameStatus === 'setup' && !isTestMode && (
        <p className="text-sm text-gray-400 mt-4">
          Select a character and click on the board to place it.
        </p>
      )}
    </div>
  );
};
