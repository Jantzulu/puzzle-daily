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

      {/* Test mode indicator */}
      {isTestMode && (
        <div className="p-2 bg-purple-900 rounded text-center mb-2">
          <span className="text-purple-300 text-sm font-medium">
            Testing {testMode === 'enemies' ? 'Enemies' : 'Characters'} - {testTurnsRemaining} turns left
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {!isTestMode && (gameStatus === 'setup' || (gameStatus === 'running' && !isSimulating)) ? (
          <button
            onClick={onPlay}
            className="col-span-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-semibold transition"
          >
            ▶ Play
          </button>
        ) : null}

        {isSimulating && gameStatus === 'running' && !isTestMode ? (
          <button
            onClick={onPause}
            className="col-span-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded font-semibold transition"
          >
            ⏸ Pause
          </button>
        ) : null}

        {gameStatus === 'running' && !isSimulating && !isTestMode ? (
          <button
            onClick={onStep}
            className="col-span-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-semibold transition"
          >
            ⏭ Step
          </button>
        ) : null}

        {!isTestMode && (
          <>
            <button
              onClick={onReset}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded font-semibold transition"
            >
              🔄 Reset
            </button>

            <button
              onClick={onWipe}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded font-semibold transition"
            >
              🗑 Wipe
            </button>
          </>
        )}

        {/* Test mode buttons - only show in setup mode */}
        {gameStatus === 'setup' && onTestEnemies && onTestCharacters && (
          <>
            <button
              onClick={onTestEnemies}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded font-semibold transition text-sm"
            >
              👁 Test Enemies
            </button>

            <button
              onClick={onTestCharacters}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded font-semibold transition text-sm"
            >
              👁 Test Characters
            </button>
          </>
        )}
      </div>

      {gameStatus === 'setup' && !isTestMode && (
        <p className="text-sm text-gray-400 mt-4">
          Select a character and click on the board to place it.
        </p>
      )}
    </div>
  );
};
