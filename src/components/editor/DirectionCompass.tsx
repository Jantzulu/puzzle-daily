import React from 'react';
import { Direction } from '../../types/game';
import type { RelativeDirection } from '../../types/game';

interface DirectionCompassProps {
  mode: 'relative' | 'absolute';
  selectedDirections: (RelativeDirection | Direction)[];
  onChange: (directions: (RelativeDirection | Direction)[]) => void;
}

// Positions for 8 directions arranged in a compass (relative to center)
// Forward/North is at top (12 o'clock), going clockwise
const COMPASS_POSITIONS = {
  // Relative directions
  forward: { top: 0, left: 50 },           // 12 o'clock (0°)
  forward_right: { top: 15, left: 85 },    // 1:30 (45°)
  right: { top: 50, left: 100 },           // 3 o'clock (90°)
  backward_right: { top: 85, left: 85 },   // 4:30 (135°)
  backward: { top: 100, left: 50 },        // 6 o'clock (180°)
  backward_left: { top: 85, left: 15 },    // 7:30 (225°)
  left: { top: 50, left: 0 },              // 9 o'clock (270°)
  forward_left: { top: 15, left: 15 },     // 10:30 (315°)
  // Absolute directions (same positions, different labels)
  north: { top: 0, left: 50 },
  northeast: { top: 15, left: 85 },
  east: { top: 50, left: 100 },
  southeast: { top: 85, left: 85 },
  south: { top: 100, left: 50 },
  southwest: { top: 85, left: 15 },
  west: { top: 50, left: 0 },
  northwest: { top: 15, left: 15 },
};

const RELATIVE_DIRECTIONS: { dir: RelativeDirection; label: string; shortLabel: string }[] = [
  { dir: 'forward', label: '0° Forward', shortLabel: '0°' },
  { dir: 'forward_right', label: '45°', shortLabel: '45°' },
  { dir: 'right', label: '90° Right', shortLabel: '90°' },
  { dir: 'backward_right', label: '135°', shortLabel: '135°' },
  { dir: 'backward', label: '180° Back', shortLabel: '180°' },
  { dir: 'backward_left', label: '225°', shortLabel: '225°' },
  { dir: 'left', label: '270° Left', shortLabel: '270°' },
  { dir: 'forward_left', label: '315°', shortLabel: '315°' },
];

const ABSOLUTE_DIRECTIONS: { dir: Direction; label: string; shortLabel: string }[] = [
  { dir: Direction.NORTH, label: 'North', shortLabel: 'N' },
  { dir: Direction.NORTHEAST, label: 'Northeast', shortLabel: 'NE' },
  { dir: Direction.EAST, label: 'East', shortLabel: 'E' },
  { dir: Direction.SOUTHEAST, label: 'Southeast', shortLabel: 'SE' },
  { dir: Direction.SOUTH, label: 'South', shortLabel: 'S' },
  { dir: Direction.SOUTHWEST, label: 'Southwest', shortLabel: 'SW' },
  { dir: Direction.WEST, label: 'West', shortLabel: 'W' },
  { dir: Direction.NORTHWEST, label: 'Northwest', shortLabel: 'NW' },
];

export const DirectionCompass: React.FC<DirectionCompassProps> = ({
  mode,
  selectedDirections,
  onChange,
}) => {
  const directions = mode === 'relative' ? RELATIVE_DIRECTIONS : ABSOLUTE_DIRECTIONS;

  const toggleDirection = (dir: RelativeDirection | Direction) => {
    const isSelected = selectedDirections.includes(dir);
    if (isSelected) {
      // Don't allow deselecting if it's the last one
      if (selectedDirections.length > 1) {
        onChange(selectedDirections.filter(d => d !== dir));
      }
    } else {
      onChange([...selectedDirections, dir]);
    }
  };

  const isSelected = (dir: RelativeDirection | Direction) => selectedDirections.includes(dir);

  return (
    <div className="relative w-32 h-32 mx-auto">
      {/* Center indicator showing facing direction */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-stone-700 border-2 border-stone-500 flex items-center justify-center">
        {mode === 'relative' ? (
          // Arrow pointing up to indicate "forward"
          <svg className="w-4 h-4 text-copper-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4l-8 8h5v8h6v-8h5z" />
          </svg>
        ) : (
          // Compass rose for absolute
          <span className="text-xs text-copper-400 font-bold">N</span>
        )}
      </div>

      {/* Direction buttons */}
      {directions.map(({ dir, label, shortLabel }) => {
        const pos = COMPASS_POSITIONS[dir as keyof typeof COMPASS_POSITIONS];
        const selected = isSelected(dir);

        return (
          <button
            key={dir}
            onClick={() => toggleDirection(dir)}
            title={label}
            className={`absolute w-7 h-7 -ml-3.5 -mt-3.5 rounded-full text-xs font-bold transition-all
              ${selected
                ? 'bg-arcane-600 text-white border-2 border-arcane-400 shadow-lg scale-110'
                : 'bg-stone-600 text-stone-300 border border-stone-500 hover:bg-stone-500 hover:scale-105'
              }`}
            style={{
              top: `${pos.top}%`,
              left: `${pos.left}%`,
            }}
          >
            {shortLabel}
          </button>
        );
      })}

      {/* Connecting lines (decorative) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
        {/* Cardinal direction lines */}
        <line x1="50" y1="50" x2="50" y2="12" stroke="currentColor" strokeWidth="1" className="text-stone-600" />
        <line x1="50" y1="50" x2="88" y2="50" stroke="currentColor" strokeWidth="1" className="text-stone-600" />
        <line x1="50" y1="50" x2="50" y2="88" stroke="currentColor" strokeWidth="1" className="text-stone-600" />
        <line x1="50" y1="50" x2="12" y2="50" stroke="currentColor" strokeWidth="1" className="text-stone-600" />
        {/* Diagonal direction lines */}
        <line x1="50" y1="50" x2="77" y2="23" stroke="currentColor" strokeWidth="0.5" className="text-stone-700" />
        <line x1="50" y1="50" x2="77" y2="77" stroke="currentColor" strokeWidth="0.5" className="text-stone-700" />
        <line x1="50" y1="50" x2="23" y2="77" stroke="currentColor" strokeWidth="0.5" className="text-stone-700" />
        <line x1="50" y1="50" x2="23" y2="23" stroke="currentColor" strokeWidth="0.5" className="text-stone-700" />
      </svg>

      {/* "Facing" label for relative mode */}
      {mode === 'relative' && (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-stone-400 whitespace-nowrap">
          Facing
        </div>
      )}
    </div>
  );
};

export default DirectionCompass;
