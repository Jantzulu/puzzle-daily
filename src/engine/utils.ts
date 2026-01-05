import { Direction } from '../types/game';

/**
 * Get the offset (dx, dy) for a given direction
 */
export function getDirectionOffset(direction: Direction): { dx: number; dy: number } {
  switch (direction) {
    case Direction.NORTH:
      return { dx: 0, dy: -1 };
    case Direction.EAST:
      return { dx: 1, dy: 0 };
    case Direction.SOUTH:
      return { dx: 0, dy: 1 };
    case Direction.WEST:
      return { dx: -1, dy: 0 };
    default:
      return { dx: 0, dy: 0 };
  }
}

/**
 * Turn left (counter-clockwise)
 */
export function turnLeft(direction: Direction): Direction {
  switch (direction) {
    case Direction.NORTH:
      return Direction.WEST;
    case Direction.WEST:
      return Direction.SOUTH;
    case Direction.SOUTH:
      return Direction.EAST;
    case Direction.EAST:
      return Direction.NORTH;
    default:
      return direction;
  }
}

/**
 * Turn right (clockwise)
 */
export function turnRight(direction: Direction): Direction {
  switch (direction) {
    case Direction.NORTH:
      return Direction.EAST;
    case Direction.EAST:
      return Direction.SOUTH;
    case Direction.SOUTH:
      return Direction.WEST;
    case Direction.WEST:
      return Direction.NORTH;
    default:
      return direction;
  }
}

/**
 * Turn around (180 degrees)
 */
export function turnAround(direction: Direction): Direction {
  switch (direction) {
    case Direction.NORTH:
      return Direction.SOUTH;
    case Direction.SOUTH:
      return Direction.NORTH;
    case Direction.EAST:
      return Direction.WEST;
    case Direction.WEST:
      return Direction.EAST;
    default:
      return direction;
  }
}

/**
 * Check if coordinates are within grid bounds
 */
export function isInBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && x < width && y >= 0 && y < height;
}
