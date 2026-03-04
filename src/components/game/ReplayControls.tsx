import React from 'react';
import type { LogEventType } from '../../engine/combatLog';

interface ReplayControlsProps {
  currentTurn: number;
  totalTurns: number;
  isPlaying: boolean;
  speed: number;
  events?: Map<number, Set<LogEventType>>;
  onPlayPause: () => void;
  onStepForward: () => void;
  onStepBack: () => void;
  onSeek: (turn: number) => void;
  onSpeedChange: (speed: number) => void;
  onExit: () => void;
}

const SPEEDS = [0.5, 1, 2];

// Inline SVG icons — render consistently on all platforms (no emoji rendering)
// Use className for sizing so Tailwind responsive classes work
const IconSkipBack = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 14" fill="currentColor">
    <rect x="0" y="1" width="2.5" height="12" />
    <polygon points="15,1 5,7 15,13" />
  </svg>
);
const IconStepBack = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 12 14" fill="currentColor">
    <polygon points="12,1 2,7 12,13" />
  </svg>
);
const IconPlay = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 12 14" fill="currentColor">
    <polygon points="0,0 12,7 0,14" />
  </svg>
);
const IconPause = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 12 14" fill="currentColor">
    <rect x="0" y="0" width="4" height="14" />
    <rect x="8" y="0" width="4" height="14" />
  </svg>
);
const IconStepForward = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 12 14" fill="currentColor">
    <polygon points="0,1 10,7 0,13" />
  </svg>
);
const IconSkipForward = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 14" fill="currentColor">
    <polygon points="1,1 11,7 1,13" />
    <rect x="13.5" y="1" width="2.5" height="12" />
  </svg>
);

// Event marker colors — priority order (first match wins when multiple events on same turn)
// These are placeholder colors; can be made configurable later via icon settings
const EVENT_PRIORITY: { type: LogEventType; color: string; label: string }[] = [
  { type: 'death', color: 'bg-red-500', label: 'Death' },
  { type: 'damage', color: 'bg-orange-400', label: 'Damage' },
  { type: 'collect', color: 'bg-yellow-400', label: 'Collected' },
  { type: 'spell', color: 'bg-purple-400', label: 'Spell' },
  { type: 'game', color: 'bg-amber-400', label: 'Game Event' },
  { type: 'status', color: 'bg-green-400', label: 'Status' },
];

function getMarkerStyle(eventTypes: Set<LogEventType>): { color: string; label: string } | null {
  for (const entry of EVENT_PRIORITY) {
    if (eventTypes.has(entry.type)) return entry;
  }
  return null;
}

const iconClass = 'w-5 h-5 md:w-7 md:h-7';

export const ReplayControls: React.FC<ReplayControlsProps> = ({
  currentTurn,
  totalTurns,
  isPlaying,
  speed,
  events,
  onPlayPause,
  onStepForward,
  onStepBack,
  onSeek,
  onSpeedChange,
  onExit,
}) => {
  const atStart = currentTurn <= 0;
  const atEnd = currentTurn >= totalTurns;

  // Build event markers
  const markers: { turn: number; color: string; label: string }[] = [];
  if (events && totalTurns > 0) {
    events.forEach((types, turn) => {
      const style = getMarkerStyle(types);
      if (style) markers.push({ turn, ...style });
    });
  }

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
          className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded dungeon-btn disabled:opacity-30 disabled:cursor-not-allowed"
          title="Jump to start"
        >
          <IconSkipBack className={iconClass} />
        </button>
        <button
          onClick={onStepBack}
          disabled={atStart}
          className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded dungeon-btn disabled:opacity-30 disabled:cursor-not-allowed"
          title="Step back"
        >
          <IconStepBack className={iconClass} />
        </button>
        <button
          onClick={onPlayPause}
          className="w-12 h-10 md:w-14 md:h-12 flex items-center justify-center rounded dungeon-btn-primary"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <IconPause className={iconClass} /> : <IconPlay className={iconClass} />}
        </button>
        <button
          onClick={onStepForward}
          disabled={atEnd}
          className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded dungeon-btn disabled:opacity-30 disabled:cursor-not-allowed"
          title="Step forward"
        >
          <IconStepForward className={iconClass} />
        </button>
        <button
          onClick={() => onSeek(totalTurns)}
          disabled={atEnd}
          className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded dungeon-btn disabled:opacity-30 disabled:cursor-not-allowed"
          title="Jump to end"
        >
          <IconSkipForward className={iconClass} />
        </button>
      </div>

      {/* Row 3: Event markers + Scrubber + Turn counter */}
      <div>
        {/* Event marker dots above scrubber */}
        {markers.length > 0 && (
          <div className="relative h-3 mx-1" style={{ marginBottom: '-6px' }}>
            {markers.map(({ turn, color, label }) => (
              <button
                key={turn}
                onClick={() => onSeek(turn)}
                className={`absolute bottom-0 w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${color} hover:scale-150 transition-transform -translate-x-1/2`}
                style={{ left: `${(turn / totalTurns) * 100}%` }}
                title={`Turn ${turn}: ${label}`}
              />
            ))}
          </div>
        )}
        <input
          type="range"
          min={0}
          max={totalTurns}
          value={currentTurn}
          onChange={e => onSeek(Number(e.target.value))}
          className="w-full h-2 bg-stone-700 rounded-lg appearance-none cursor-pointer accent-copper-500"
          style={{ margin: 0, padding: 0 }}
        />
        <div className="flex items-center justify-between text-xs text-stone-400">
          <span>Turn {currentTurn}</span>
          <span>{totalTurns}</span>
        </div>
      </div>
    </div>
  );
};
