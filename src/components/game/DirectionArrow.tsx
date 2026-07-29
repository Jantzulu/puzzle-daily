import React from 'react';
import { Direction } from '../../types/game';

const directionRotation: Record<Direction, number> = {
  [Direction.NORTH]: -90,
  [Direction.NORTHEAST]: -45,
  [Direction.EAST]: 0,
  [Direction.SOUTHEAST]: 45,
  [Direction.SOUTH]: 90,
  [Direction.SOUTHWEST]: 135,
  [Direction.WEST]: 180,
  [Direction.NORTHWEST]: -135,
};

interface DirectionArrowProps {
  direction: Direction;
  className?: string;
  size?: number;
}

export function DirectionArrow({ direction, className = '', size = 12 }: DirectionArrowProps) {
  const rotation = directionRotation[direction];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      className={className}
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      {/* Arrow pointing right (east) as base, rotated for other directions */}
      <path
        d="M2 6 L9 6 M6 3 L9 6 L6 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Movement glyph for the entity-card attribute row: the direction arrow
 * itself travels — a slow glide along its own heading, fading in at the back
 * and out at the front (see .movement-arrow-anim in index.css; transform/
 * opacity only per the page-decoration perf rule). Rotation sits on the
 * wrapper so the animated translateX inside always follows the arrow's
 * heading. Same east-pointing base + rotation convention as DirectionArrow.
 */
export function MovementArrow({ direction, className = '', size = 13 }: DirectionArrowProps) {
  const rotation = directionRotation[direction];

  return (
    <span
      className={`inline-flex ${className}`}
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 12 12"
        className="movement-arrow-anim"
      >
        <path
          d="M2 6 L9 6 M6 3 L9 6 L6 9"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </span>
  );
}
