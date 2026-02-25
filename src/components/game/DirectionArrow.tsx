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
