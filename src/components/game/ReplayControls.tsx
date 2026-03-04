import React from 'react';

interface ReplayControlsProps {
  currentTurn: number;
  totalTurns: number;
  isPlaying: boolean;
  speed: number;
  onPlayPause: () => void;
  onStepForward: () => void;
  onStepBack: () => void;
  onSeek: (turn: number) => void;
  onSpeedChange: (speed: number) => void;
  onExit: () => void;
}

const SPEEDS = [0.5, 1, 2];

export const ReplayControls: React.FC<ReplayControlsProps> = ({
  currentTurn,
  totalTurns,
  isPlaying,
  speed,
  onPlayPause,
  onStepForward,
  onStepBack,
  onSeek,
  onSpeedChange,
  onExit,
}) => {
  const atStart = currentTurn <= 0;
  const atEnd = currentTurn >= totalTurns;

  return (
    <div className="dungeon-panel p-3 space-y-2">
      {/* Row 1: Exit button | "Replay" label | Speed buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={onExit}
          className="dungeon-btn px-2 py-1 text-xs font-bold flex items-center gap-1"
        >
          <span>&times;</span>
          <span>Exit</span>
        </button>
        <span className="text-sm text-stone-300 font-medieval">Replay</span>
        <div className="flex items-center gap-1">
          {SPEEDS.map(s => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`px-1.5 h-7 rounded text-xs font-bold transition-colors ${
                speed === s
                  ? 'bg-copper-600 text-white'
                  : 'bg-stone-700 text-stone-400 hover:bg-stone-600'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Row 2: Transport buttons centered */}
      <div className="flex items-center justify-center gap-1.5">
        <button
          onClick={() => onSeek(0)}
          disabled={atStart}
          className="w-10 h-10 flex items-center justify-center rounded dungeon-btn text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed"
          title="Jump to start"
        >
          {'|\u25C0'}
        </button>
        <button
          onClick={onStepBack}
          disabled={atStart}
          className="w-10 h-10 flex items-center justify-center rounded dungeon-btn text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed"
          title="Step back"
        >
          {'\u25C0'}
        </button>
        <button
          onClick={onPlayPause}
          className="w-12 h-10 flex items-center justify-center rounded dungeon-btn-primary text-base font-bold"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '\u275A\u275A' : '\u25B6'}
        </button>
        <button
          onClick={onStepForward}
          disabled={atEnd}
          className="w-10 h-10 flex items-center justify-center rounded dungeon-btn text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed"
          title="Step forward"
        >
          {'\u25B6'}
        </button>
        <button
          onClick={() => onSeek(totalTurns)}
          disabled={atEnd}
          className="w-10 h-10 flex items-center justify-center rounded dungeon-btn text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed"
          title="Jump to end"
        >
          {'\u25B6|'}
        </button>
      </div>

      {/* Row 3: Scrubber */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-stone-400">
          <span>Turn {currentTurn}</span>
          <span>{totalTurns}</span>
        </div>
        <input
          type="range"
          min={0}
          max={totalTurns}
          value={currentTurn}
          onChange={e => onSeek(Number(e.target.value))}
          className="w-full h-2 bg-stone-700 rounded-lg appearance-none cursor-pointer accent-copper-500"
        />
      </div>
    </div>
  );
};
