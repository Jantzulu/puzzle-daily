import { Direction } from '../types/game';

/**
 * Get the offset (dx, dy) for a given direction
 */
export function getDirectionOffset(direction: Direction): { dx: number; dy: number } {
  switch (direction) {
    case Direction.NORTH:
      return { dx: 0, dy: -1 };
    case Direction.NORTHEAST:
      return { dx: 1, dy: -1 };
    case Direction.EAST:
      return { dx: 1, dy: 0 };
    case Direction.SOUTHEAST:
      return { dx: 1, dy: 1 };
    case Direction.SOUTH:
      return { dx: 0, dy: 1 };
    case Direction.SOUTHWEST:
      return { dx: -1, dy: 1 };
    case Direction.WEST:
      return { dx: -1, dy: 0 };
    case Direction.NORTHWEST:
      return { dx: -1, dy: -1 };
    default:
      return { dx: 0, dy: 0 };
  }
}

/**
 * Turn left (counter-clockwise) - 45 degrees
 */
export function turnLeft(direction: Direction): Direction {
  switch (direction) {
    case Direction.NORTH:
      return Direction.NORTHWEST;
    case Direction.NORTHWEST:
      return Direction.WEST;
    case Direction.WEST:
      return Direction.SOUTHWEST;
    case Direction.SOUTHWEST:
      return Direction.SOUTH;
    case Direction.SOUTH:
      return Direction.SOUTHEAST;
    case Direction.SOUTHEAST:
      return Direction.EAST;
    case Direction.EAST:
      return Direction.NORTHEAST;
    case Direction.NORTHEAST:
      return Direction.NORTH;
    default:
      return direction;
  }
}

/**
 * Turn right (clockwise) - 45 degrees
 */
export function turnRight(direction: Direction): Direction {
  switch (direction) {
    case Direction.NORTH:
      return Direction.NORTHEAST;
    case Direction.NORTHEAST:
      return Direction.EAST;
    case Direction.EAST:
      return Direction.SOUTHEAST;
    case Direction.SOUTHEAST:
      return Direction.SOUTH;
    case Direction.SOUTH:
      return Direction.SOUTHWEST;
    case Direction.SOUTHWEST:
      return Direction.WEST;
    case Direction.WEST:
      return Direction.NORTHWEST;
    case Direction.NORTHWEST:
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
    case Direction.NORTHEAST:
      return Direction.SOUTHWEST;
    case Direction.EAST:
      return Direction.WEST;
    case Direction.SOUTHEAST:
      return Direction.NORTHWEST;
    case Direction.SOUTH:
      return Direction.NORTH;
    case Direction.SOUTHWEST:
      return Direction.NORTHEAST;
    case Direction.WEST:
      return Direction.EAST;
    case Direction.NORTHWEST:
      return Direction.SOUTHEAST;
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
