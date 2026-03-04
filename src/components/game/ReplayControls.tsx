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

// Inline SVG icons — render consistently on all platforms (no emoji rendering)
const IconSkipBack = () => (
  <svg width="16" height="14" viewBox="0 0 16 14" fill="currentColor">
    <rect x="0" y="1" width="2.5" height="12" />
    <polygon points="15,1 5,7 15,13" />
  </svg>
);
const IconStepBack = () => (
  <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
    <polygon points="12,1 2,7 12,13" />
  </svg>
);
const IconPlay = () => (
  <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
    <polygon points="0,0 12,7 0,14" />
  </svg>
);
const IconPause = () => (
  <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
    <rect x="0" y="0" width="4" height="14" />
    <rect x="8" y="0" width="4" height="14" />
  </svg>
);
const IconStepForward = () => (
  <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
    <polygon points="0,1 10,7 0,13" />
  </svg>
);
const IconSkipForward = () => (
  <svg width="16" height="14" viewBox="0 0 16 14" fill="currentColor">
    <polygon points="1,1 11,7 1,13" />
    <rect x="13.5" y="1" width="2.5" height="12" />
  </svg>
);

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
      {/* Row 1: Exit button | "Replay" label (absolutely centered) | Speed buttons */}
      <div className="relative flex items-center justify-between">
        <button
          onClick={onExit}
          className="dungeon-btn px-2 py-1 text-xs font-bold flex items-center gap-1 z-10"
        >
          <span>&times;</span>
          <span>Exit</span>
        </button>
        <span className="absolute inset-0 flex items-center justify-center text-sm text-stone-300 font-medieval pointer-events-none">Replay</span>
        <div className="flex items-center gap-1 z-10">
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
          className="w-10 h-10 flex items-center justify-center rounded dungeon-btn disabled:opacity-30 disabled:cursor-not-allowed"
          title="Jump to start"
        >
          <IconSkipBack />
        </button>
        <button
          onClick={onStepBack}
          disabled={atStart}
          className="w-10 h-10 flex items-center justify-center rounded dungeon-btn disabled:opacity-30 disabled:cursor-not-allowed"
          title="Step back"
        >
          <IconStepBack />
        </button>
        <button
          onClick={onPlayPause}
          className="w-12 h-10 flex items-center justify-center rounded dungeon-btn-primary"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <IconPause /> : <IconPlay />}
        </button>
        <button
          onClick={onStepForward}
          disabled={atEnd}
          className="w-10 h-10 flex items-center justify-center rounded dungeon-btn disabled:opacity-30 disabled:cursor-not-allowed"
          title="Step forward"
        >
          <IconStepForward />
        </button>
        <button
          onClick={() => onSeek(totalTurns)}
          disabled={atEnd}
          className="w-10 h-10 flex items-center justify-center rounded dungeon-btn disabled:opacity-30 disabled:cursor-not-allowed"
          title="Jump to end"
        >
          <IconSkipForward />
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
