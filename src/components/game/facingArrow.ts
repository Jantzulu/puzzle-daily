import { ActionType, Direction } from '../../types/game';
import type { CharacterAction, EnemyBehavior } from '../../types/game';

/**
 * THE FACING ARROW — the small arrow by an entity's health bar on the board
 * (where it walks next: yellow for movers, grey for the stationary), and the
 * movement test behind its colour. Moved out of AnimatedGameBoard.tsx
 * unchanged on 2026-10-15, so the direction picker's hub can show a redirect
 * target's arrow turning through the board's own drawing.
 */

// Movement action types - entities with these actions should show direction arrow
const MOVEMENT_ACTIONS = new Set([
  ActionType.MOVE_FORWARD,
  ActionType.MOVE_BACKWARD,
  ActionType.MOVE_LEFT,
  ActionType.MOVE_RIGHT,
  ActionType.MOVE_DIAGONAL_NE,
  ActionType.MOVE_DIAGONAL_NW,
  ActionType.MOVE_DIAGONAL_SE,
  ActionType.MOVE_DIAGONAL_SW,
]);

/**
 * Check if a character's behavior contains any movement actions
 */
export function hasMovementActions(behavior: CharacterAction[]): boolean {
  return behavior.some(action => MOVEMENT_ACTIONS.has(action.type));
}

/**
 * Check if an enemy's behavior pattern contains any movement actions
 */
export function enemyHasMovementActions(behavior: EnemyBehavior | undefined): boolean {
  if (!behavior || behavior.type !== 'active') return false;
  if (!behavior.pattern || behavior.pattern.length === 0) return false;
  return behavior.pattern.some(action => MOVEMENT_ACTIONS.has(action.type));
}

/**
 * The arrow itself, centred at (x, y), pointing `direction`.
 */
export function drawFacingArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: Direction,
  isMoving: boolean = true
) {
  const arrowSize = 3; // Small arrow

  // Draw arrow rotated based on direction
  ctx.save();
  ctx.translate(x, y);

  // Rotate based on direction (0 = East/right, rotating clockwise)
  const rotationAngles: Record<Direction, number> = {
    [Direction.EAST]: 0,
    [Direction.SOUTHEAST]: Math.PI / 4,
    [Direction.SOUTH]: Math.PI / 2,
    [Direction.SOUTHWEST]: (3 * Math.PI) / 4,
    [Direction.WEST]: Math.PI,
    [Direction.NORTHWEST]: (-3 * Math.PI) / 4,
    [Direction.NORTH]: -Math.PI / 2,
    [Direction.NORTHEAST]: -Math.PI / 4,
  };

  ctx.rotate(rotationAngles[direction] || 0);

  // Draw a simple arrow pointing right (will be rotated)
  // Green for moving entities, grey for facing-only entities
  ctx.fillStyle = isMoving ? 'rgba(255, 200, 50, 0.95)' : 'rgba(180, 180, 180, 0.7)';
  ctx.beginPath();
  // Arrow shape: triangle pointing right
  const baseHalfWidth = arrowSize / 2 + 0.5; // Make base 1px wider
  ctx.moveTo(arrowSize, 0); // Tip
  ctx.lineTo(-arrowSize / 2, -baseHalfWidth); // Top left
  ctx.lineTo(-arrowSize / 2, baseHalfWidth); // Bottom left
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}
