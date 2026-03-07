/**
 * Tests for src/engine/utils.ts — pure direction/math helpers.
 * No mocking needed; these are stateless functions.
 */
import { Direction } from '../../types/game';
import {
  getDirectionOffset,
  turnLeft,
  turnRight,
  turnAround,
  isInBounds,
  calculateDistance,
  calculateDirectionTo,
} from '../utils';

// ==========================================
// getDirectionOffset
// ==========================================
describe('getDirectionOffset', () => {
  it.each([
    [Direction.NORTH, 0, -1],
    [Direction.NORTHEAST, 1, -1],
    [Direction.EAST, 1, 0],
    [Direction.SOUTHEAST, 1, 1],
    [Direction.SOUTH, 0, 1],
    [Direction.SOUTHWEST, -1, 1],
    [Direction.WEST, -1, 0],
    [Direction.NORTHWEST, -1, -1],
  ])('%s → dx=%d, dy=%d', (dir, expectedDx, expectedDy) => {
    const { dx, dy } = getDirectionOffset(dir);
    expect(dx).toBe(expectedDx);
    expect(dy).toBe(expectedDy);
  });
});

// ==========================================
// turnLeft
// ==========================================
describe('turnLeft', () => {
  describe('45°', () => {
    it.each([
      [Direction.NORTH, Direction.NORTHWEST],
      [Direction.EAST, Direction.NORTHEAST],
      [Direction.SOUTH, Direction.SOUTHEAST],
      [Direction.WEST, Direction.SOUTHWEST],
    ])('%s → %s', (from, expected) => {
      expect(turnLeft(from, 45)).toBe(expected);
    });
  });

  describe('90° (default)', () => {
    it.each([
      [Direction.NORTH, Direction.WEST],
      [Direction.EAST, Direction.NORTH],
      [Direction.SOUTH, Direction.EAST],
      [Direction.WEST, Direction.SOUTH],
    ])('%s → %s', (from, expected) => {
      expect(turnLeft(from)).toBe(expected);
    });

    it('normalises diagonals — NORTHEAST → WEST', () => {
      expect(turnLeft(Direction.NORTHEAST)).toBe(Direction.WEST);
    });
  });

  describe('135°', () => {
    it.each([
      [Direction.NORTH, Direction.SOUTHWEST],
      [Direction.EAST, Direction.NORTHWEST],
      [Direction.SOUTH, Direction.NORTHEAST],
      [Direction.WEST, Direction.SOUTHEAST],
    ])('%s → %s', (from, expected) => {
      expect(turnLeft(from, 135)).toBe(expected);
    });
  });
});

// ==========================================
// turnRight
// ==========================================
describe('turnRight', () => {
  describe('45°', () => {
    it.each([
      [Direction.NORTH, Direction.NORTHEAST],
      [Direction.EAST, Direction.SOUTHEAST],
      [Direction.SOUTH, Direction.SOUTHWEST],
      [Direction.WEST, Direction.NORTHWEST],
    ])('%s → %s', (from, expected) => {
      expect(turnRight(from, 45)).toBe(expected);
    });
  });

  describe('90° (default)', () => {
    it.each([
      [Direction.NORTH, Direction.EAST],
      [Direction.EAST, Direction.SOUTH],
      [Direction.SOUTH, Direction.WEST],
      [Direction.WEST, Direction.NORTH],
    ])('%s → %s', (from, expected) => {
      expect(turnRight(from)).toBe(expected);
    });

    it('normalises diagonals — SOUTHEAST → SOUTH', () => {
      expect(turnRight(Direction.SOUTHEAST)).toBe(Direction.SOUTH);
    });
  });

  describe('135°', () => {
    it.each([
      [Direction.NORTH, Direction.SOUTHEAST],
      [Direction.EAST, Direction.SOUTHWEST],
      [Direction.SOUTH, Direction.NORTHWEST],
      [Direction.WEST, Direction.NORTHEAST],
    ])('%s → %s', (from, expected) => {
      expect(turnRight(from, 135)).toBe(expected);
    });
  });
});

// ==========================================
// turnAround (180°)
// ==========================================
describe('turnAround', () => {
  it.each([
    [Direction.NORTH, Direction.SOUTH],
    [Direction.NORTHEAST, Direction.SOUTHWEST],
    [Direction.EAST, Direction.WEST],
    [Direction.SOUTHEAST, Direction.NORTHWEST],
    [Direction.SOUTH, Direction.NORTH],
    [Direction.SOUTHWEST, Direction.NORTHEAST],
    [Direction.WEST, Direction.EAST],
    [Direction.NORTHWEST, Direction.SOUTHEAST],
  ])('%s → %s', (from, expected) => {
    expect(turnAround(from)).toBe(expected);
  });
});

// ==========================================
// isInBounds
// ==========================================
describe('isInBounds', () => {
  const W = 5, H = 5;

  it('center tile is in bounds', () => {
    expect(isInBounds(2, 2, W, H)).toBe(true);
  });

  it('origin is in bounds', () => {
    expect(isInBounds(0, 0, W, H)).toBe(true);
  });

  it('bottom-right edge is in bounds', () => {
    expect(isInBounds(4, 4, W, H)).toBe(true);
  });

  it('x = width is out of bounds', () => {
    expect(isInBounds(5, 2, W, H)).toBe(false);
  });

  it('y = height is out of bounds', () => {
    expect(isInBounds(2, 5, W, H)).toBe(false);
  });

  it('negative x is out of bounds', () => {
    expect(isInBounds(-1, 2, W, H)).toBe(false);
  });

  it('negative y is out of bounds', () => {
    expect(isInBounds(2, -1, W, H)).toBe(false);
  });
});

// ==========================================
// calculateDistance
// ==========================================
describe('calculateDistance', () => {
  it('horizontal distance', () => {
    expect(calculateDistance(0, 0, 3, 0)).toBe(3);
  });

  it('vertical distance', () => {
    expect(calculateDistance(0, 0, 0, 4)).toBe(4);
  });

  it('same point → 0', () => {
    expect(calculateDistance(2, 3, 2, 3)).toBe(0);
  });

  it('diagonal distance', () => {
    expect(calculateDistance(0, 0, 1, 1)).toBeCloseTo(Math.SQRT2);
  });

  it('larger diagonal', () => {
    expect(calculateDistance(0, 0, 3, 4)).toBe(5); // 3-4-5 triangle
  });
});

// ==========================================
// calculateDirectionTo
// ==========================================
describe('calculateDirectionTo', () => {
  it('due east', () => {
    expect(calculateDirectionTo(0, 0, 3, 0)).toBe(Direction.EAST);
  });

  it('due west', () => {
    expect(calculateDirectionTo(3, 0, 0, 0)).toBe(Direction.WEST);
  });

  it('due south', () => {
    expect(calculateDirectionTo(0, 0, 0, 3)).toBe(Direction.SOUTH);
  });

  it('due north', () => {
    expect(calculateDirectionTo(0, 3, 0, 0)).toBe(Direction.NORTH);
  });

  it('southeast diagonal', () => {
    expect(calculateDirectionTo(0, 0, 2, 2)).toBe(Direction.SOUTHEAST);
  });

  it('northwest diagonal', () => {
    expect(calculateDirectionTo(3, 3, 0, 0)).toBe(Direction.NORTHWEST);
  });

  it('northeast diagonal', () => {
    expect(calculateDirectionTo(0, 3, 3, 0)).toBe(Direction.NORTHEAST);
  });

  it('southwest diagonal', () => {
    expect(calculateDirectionTo(3, 0, 0, 3)).toBe(Direction.SOUTHWEST);
  });

  it('same point falls back to EAST', () => {
    // atan2(0,0) = 0 → EAST
    expect(calculateDirectionTo(2, 2, 2, 2)).toBe(Direction.EAST);
  });
});
