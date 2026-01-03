import React from 'react';
import type { GameStatus } from '../../types/game';

interface ControlsProps {
  gameStatus: GameStatus;
  isSimulating: boolean;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onStep: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  gameStatus,
  isSimulating,
  onPlay,
  onPause,
  onReset,
  onStep,
}) => {
  return (
    <div className="p-4 bg-gray-800 rounded space-y-3">
      <h3 className="text-lg font-bold mb-4">Controls</h3>

      <div className="grid grid-cols-2 gap-2">
        {gameStatus === 'setup' || (gameStatus === 'running' && !isSimulating) ? (
          <button
            onClick={onPlay}
            className="col-span-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-semibold transition"
          >
            ▶ Play
          </button>
        ) : null}

        {isSimulating && gameStatus === 'running' ? (
          <button
            onClick={onPause}
            className="col-span-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded font-semibold transition"
          >
            ⏸ Pause
          </button>
        ) : null}

        {gameStatus === 'running' && !isSimulating ? (
          <button
            onClick={onStep}
            className="col-span-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-semibold transition"
          >
            ⏭ Step
          </button>
        ) : null}

        <button
          onClick={onReset}
          className="col-span-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded font-semibold transition"
        >
          🔄 Reset
        </button>
      </div>

      {gameStatus === 'setup' && (
        <p className="text-sm text-gray-400 mt-4">
          Select a character and click on the board to place it.
        </p>
      )}
    </div>
  );
};
