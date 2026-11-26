import React from 'react';
import { Direction } from '../../types/game';
import { PixelIcon } from '../shared/PixelIcon';

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

/**
 * The arrow as a PIXEL glyph (shared/PixelIcon): a straight one drawn
 * pointing east and a diagonal one drawn pointing north-east, each turned
 * by whole quarter turns only, so its pixels stay square on the grid (a
 * 45 degree turn of the east arrow, as the line icon had, would tilt them).
 */
const PIXEL_ARROW: Record<Direction, { icon: 'arrow' | 'arrowDiag'; turns: number }> = {
  [Direction.EAST]: { icon: 'arrow', turns: 0 },
  [Direction.SOUTH]: { icon: 'arrow', turns: 1 },
  [Direction.WEST]: { icon: 'arrow', turns: 2 },
  [Direction.NORTH]: { icon: 'arrow', turns: 3 },
  [Direction.NORTHEAST]: { icon: 'arrowDiag', turns: 0 },
  [Direction.SOUTHEAST]: { icon: 'arrowDiag', turns: 1 },
  [Direction.SOUTHWEST]: { icon: 'arrowDiag', turns: 2 },
  [Direction.NORTHWEST]: { icon: 'arrowDiag', turns: 3 },
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
      {/* (The glyph is drawn already turned to its heading; the wrapper's
          rotation is only the heading the glide travels along. So the
          glyph is turned back by it here, to stand as drawn.) */}
      <span className="movement-arrow-anim inline-flex" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <span className="inline-flex" style={{ transform: `rotate(${-rotation}deg)` }}>
          <PixelIcon icon={PIXEL_ARROW[direction].icon} turns={PIXEL_ARROW[direction].turns} />
        </span>
      </span>
    </span>
  );
}
