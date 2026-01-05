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
 * Turn left (counter-clockwise)
 * @param direction - Current direction
 * @param degrees - 45 for diagonal turns, 90 for cardinal turns (default: 90)
 */
export function turnLeft(direction: Direction, degrees: 45 | 90 = 90): Direction {
  if (degrees === 45) {
    // 45-degree turn (8-direction rotation)
    switch (direction) {
      case Direction.NORTH: return Direction.NORTHWEST;
      case Direction.NORTHWEST: return Direction.WEST;
      case Direction.WEST: return Direction.SOUTHWEST;
      case Direction.SOUTHWEST: return Direction.SOUTH;
      case Direction.SOUTH: return Direction.SOUTHEAST;
      case Direction.SOUTHEAST: return Direction.EAST;
      case Direction.EAST: return Direction.NORTHEAST;
      case Direction.NORTHEAST: return Direction.NORTH;
      default: return direction;
    }
  } else {
    // 90-degree turn (4-direction rotation) - normalize diagonals to nearest cardinal
    switch (direction) {
      case Direction.NORTH:
      case Direction.NORTHWEST:
        return Direction.WEST;
      case Direction.NORTHEAST:
      case Direction.EAST:
        return Direction.NORTH;
      case Direction.SOUTHEAST:
      case Direction.SOUTH:
        return Direction.EAST;
      case Direction.SOUTHWEST:
      case Direction.WEST:
        return Direction.SOUTH;
      default: return direction;
    }
  }
}

/**
 * Turn right (clockwise)
 * @param direction - Current direction
 * @param degrees - 45 for diagonal turns, 90 for cardinal turns (default: 90)
 */
export function turnRight(direction: Direction, degrees: 45 | 90 = 90): Direction {
  if (degrees === 45) {
    // 45-degree turn (8-direction rotation)
    switch (direction) {
      case Direction.NORTH: return Direction.NORTHEAST;
      case Direction.NORTHEAST: return Direction.EAST;
      case Direction.EAST: return Direction.SOUTHEAST;
      case Direction.SOUTHEAST: return Direction.SOUTH;
      case Direction.SOUTH: return Direction.SOUTHWEST;
      case Direction.SOUTHWEST: return Direction.WEST;
      case Direction.WEST: return Direction.NORTHWEST;
      case Direction.NORTHWEST: return Direction.NORTH;
      default: return direction;
    }
  } else {
    // 90-degree turn (4-direction rotation) - normalize diagonals to nearest cardinal
    switch (direction) {
      case Direction.NORTH:
      case Direction.NORTHEAST:
        return Direction.EAST;
      case Direction.EAST:
      case Direction.SOUTHEAST:
        return Direction.SOUTH;
      case Direction.SOUTH:
      case Direction.SOUTHWEST:
        return Direction.WEST;
      case Direction.WEST:
      case Direction.NORTHWEST:
        return Direction.NORTH;
      default: return direction;
    }
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
