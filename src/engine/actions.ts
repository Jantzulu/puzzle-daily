import type {
  CharacterAction,
  PlacedCharacter,
  GameState,
  WallCollisionBehavior,
} from '../types/game';
import {
  ActionType,
  Direction,
  TileType,
} from '../types/game';
import { getCharacter } from '../data/characters';
import { getEnemy } from '../data/enemies';
import { getDirectionOffset, turnLeft, turnRight, turnAround, isInBounds } from './utils';

/**
 * Normalize action type - handles both enum keys (e.g., "ATTACK_FORWARD")
 * and enum values (e.g., "attack_forward")
 */
function normalizeActionType(type: string): ActionType {
  // If it's already a valid enum value, return it
  if (Object.values(ActionType).includes(type as ActionType)) {
    return type as ActionType;
  }

  // Map enum keys to values
  const enumKeyToValue: Record<string, ActionType> = {
    'MOVE_FORWARD': ActionType.MOVE_FORWARD,
    'MOVE_BACKWARD': ActionType.MOVE_BACKWARD,
    'MOVE_LEFT': ActionType.MOVE_LEFT,
    'MOVE_RIGHT': ActionType.MOVE_RIGHT,
    'MOVE_DIAGONAL_NE': ActionType.MOVE_DIAGONAL_NE,
    'MOVE_DIAGONAL_NW': ActionType.MOVE_DIAGONAL_NW,
    'MOVE_DIAGONAL_SE': ActionType.MOVE_DIAGONAL_SE,
    'MOVE_DIAGONAL_SW': ActionType.MOVE_DIAGONAL_SW,
    'TURN_LEFT': ActionType.TURN_LEFT,
    'TURN_RIGHT': ActionType.TURN_RIGHT,
    'TURN_AROUND': ActionType.TURN_AROUND,
    'ATTACK_FORWARD': ActionType.ATTACK_FORWARD,
    'ATTACK_RANGE': ActionType.ATTACK_RANGE,
    'ATTACK_AOE': ActionType.ATTACK_AOE,
    'IF_WALL': ActionType.IF_WALL,
    'IF_ENEMY': ActionType.IF_ENEMY,
    'WAIT': ActionType.WAIT,
    'TELEPORT': ActionType.TELEPORT,
    'REPEAT': ActionType.REPEAT,
  };

  return enumKeyToValue[type] || (type as ActionType);
}

/**
 * Execute a single action for a character
 * Returns updated character state
 */
export function executeAction(
  character: PlacedCharacter,
  action: CharacterAction,
  gameState: GameState
): PlacedCharacter {
  const updatedCharacter = { ...character };

  // Normalize action type - handle both enum keys and values
  const normalizedType = normalizeActionType(action.type);

  switch (normalizedType) {
    case ActionType.MOVE_FORWARD:
      return moveCharacter(updatedCharacter, character.facing, gameState, action.tilesPerMove || 1, action.onWallCollision);

    case ActionType.MOVE_BACKWARD:
      const backwardDir = turnAround(character.facing);
      return moveCharacter(updatedCharacter, backwardDir, gameState, action.tilesPerMove || 1, action.onWallCollision);

    case ActionType.TURN_LEFT:
      updatedCharacter.facing = turnLeft(character.facing);
      return updatedCharacter;

    case ActionType.TURN_RIGHT:
      updatedCharacter.facing = turnRight(character.facing);
      return updatedCharacter;

    case ActionType.TURN_AROUND:
      updatedCharacter.facing = turnAround(character.facing);
      return updatedCharacter;

    case ActionType.ATTACK_FORWARD:
      attackInDirection(updatedCharacter, character.facing, gameState, 1);
      return updatedCharacter;

    case ActionType.ATTACK_RANGE:
      const range = action.params?.range || 1;
      attackInDirection(updatedCharacter, character.facing, gameState, range);
      return updatedCharacter;

    case ActionType.WAIT:
      // Do nothing
      return updatedCharacter;

    case ActionType.IF_WALL:
      return handleIfWall(updatedCharacter, action, gameState);

    case ActionType.REPEAT:
      // REPEAT is handled at the simulation level, not here
      return updatedCharacter;

    default:
      console.warn(`Unhandled action type: ${action.type}`);
      return updatedCharacter;
  }
}

/**
 * Move character in a direction, handling collisions
 */
function moveCharacter(
  character: PlacedCharacter,
  direction: Direction,
  gameState: GameState,
  tilesPerMove: number = 1,
  onWallCollision: WallCollisionBehavior = 'stop'
): PlacedCharacter {
  // Move multiple tiles if tilesPerMove > 1
  let updatedChar = { ...character };

  // PRE-CHECK: Look ahead to see if we'll hit a wall on first move
  // This prevents wasting a turn when facing a wall
  const { dx: firstDx, dy: firstDy } = getDirectionOffset(direction);
  const firstX = updatedChar.x + firstDx;
  const firstY = updatedChar.y + firstDy;

  const willHitWall =
    !isInBounds(firstX, firstY, gameState.puzzle.width, gameState.puzzle.height) ||
    gameState.puzzle.tiles[firstY]?.[firstX] === null ||
    gameState.puzzle.tiles[firstY]?.[firstX] === undefined ||
    gameState.puzzle.tiles[firstY]?.[firstX]?.type === TileType.WALL;

  // If we'll hit a wall immediately, handle collision NOW (don't waste a turn)
  // Skip 'stop' and 'continue' behaviors - 'stop' means do nothing, 'continue' means ghost through
  if (willHitWall && onWallCollision !== 'continue' && onWallCollision !== 'stop') {
    switch (onWallCollision) {
      case 'turn_left':
        updatedChar.facing = turnLeft(updatedChar.facing);
        return updatedChar;
      case 'turn_right':
        updatedChar.facing = turnRight(updatedChar.facing);
        return updatedChar;
      case 'turn_around':
        updatedChar.facing = turnAround(updatedChar.facing);
        return updatedChar;
    }
  }

  // If wall ahead and behavior is 'stop', just return without moving (but still consume the action)
  if (willHitWall && onWallCollision === 'stop') {
    return updatedChar;
  }

  let currentDirection = direction;

  for (let i = 0; i < tilesPerMove; i++) {
    const { dx, dy } = getDirectionOffset(currentDirection);
    const newX = updatedChar.x + dx;
    const newY = updatedChar.y + dy;

    // Check for wall conditions
    const isWallCollision =
      !isInBounds(newX, newY, gameState.puzzle.width, gameState.puzzle.height) ||
      !gameState.puzzle.tiles[newY][newX] ||
      gameState.puzzle.tiles[newY][newX]?.type === TileType.WALL;

    if (isWallCollision) {
      // Handle wall collision based on behavior
      switch (onWallCollision) {
        case 'turn_left':
          updatedChar.facing = turnLeft(updatedChar.facing);
          return updatedChar;
        case 'turn_right':
          updatedChar.facing = turnRight(updatedChar.facing);
          return updatedChar;
        case 'turn_around':
          updatedChar.facing = turnAround(updatedChar.facing);
          return updatedChar;
        case 'continue':
          // Skip this tile and continue to next
          continue;
        case 'stop':
        default:
          return updatedChar; // Stop movement
      }
    }

    // Check for other living characters
    const otherCharacter = gameState.placedCharacters.find(
      (c) => c.x === newX && c.y === newY && !c.dead && c !== updatedChar
    );
    if (otherCharacter) {
      // Check if the other character blocks like a wall
      const otherCharData = getCharacter(otherCharacter.characterId);
      if (otherCharData?.blocksMovementAlive) {
        return updatedChar; // Blocked like a wall - stop here
      }
      // Otherwise, just wait (doesn't trigger IF_WALL, character will try again next turn)
      return updatedChar;
    }

    // Check for dead enemy that blocks movement (like a wall corpse)
    const deadEnemy = gameState.puzzle.enemies.find(
      (e) => e.x === newX && e.y === newY && e.dead
    );
    if (deadEnemy) {
      const enemyData = getEnemy(deadEnemy.enemyId);
      if (enemyData?.blocksMovementDead) {
        return updatedChar; // Dead enemy blocks movement - stop here
      }
    }

    // Check for living enemy at target position
    const enemyAtTarget = gameState.puzzle.enemies.find(
      (e) => e.x === newX && e.y === newY && !e.dead
    );

    if (enemyAtTarget) {
      // Combat: Character attacks first (player initiative)
      const charData = getCharacter(updatedChar.characterId);
      if (charData) {
        // Character attacks enemy first
        enemyAtTarget.currentHealth -= charData.attackDamage;
        if (enemyAtTarget.currentHealth <= 0) {
          enemyAtTarget.dead = true;
        }

        // Enemy counterattacks ONLY if still alive
        if (!enemyAtTarget.dead) {
          const enemyData = getEnemy(enemyAtTarget.enemyId);
          if (enemyData) {
            updatedChar.currentHealth -= enemyData.attackDamage;
            if (updatedChar.currentHealth <= 0) {
              updatedChar.dead = true;
            }
          }
        }
      }

      // Only move into space if enemy is now dead
      if (enemyAtTarget.dead) {
        updatedChar.x = newX;
        updatedChar.y = newY;
      } else {
        // If enemy survived, character stays in place - stop movement
        return updatedChar;
      }
    } else {
      // No obstacles, move freely
      updatedChar.x = newX;
      updatedChar.y = newY;
    }

    // Check for collectibles
    const collectible = gameState.puzzle.collectibles.find(
      (c) => c.x === newX && c.y === newY && !c.collected
    );
    if (collectible) {
      collectible.collected = true;
      gameState.score += collectible.scoreValue;
    }
  }

  // POST-MOVEMENT LOOKAHEAD: After successfully moving, check if next tile is a wall
  // This prevents wasting a turn on the next action
  if (onWallCollision !== 'stop' && onWallCollision !== 'continue') {
    const { dx: nextDx, dy: nextDy } = getDirectionOffset(updatedChar.facing);
    const nextX = updatedChar.x + nextDx;
    const nextY = updatedChar.y + nextDy;

    const willHitWallNext =
      !isInBounds(nextX, nextY, gameState.puzzle.width, gameState.puzzle.height) ||
      gameState.puzzle.tiles[nextY]?.[nextX] === null ||
      gameState.puzzle.tiles[nextY]?.[nextX] === undefined ||
      gameState.puzzle.tiles[nextY]?.[nextX]?.type === TileType.WALL;

    if (willHitWallNext) {
      // Turn now to avoid wasting next turn
      switch (onWallCollision) {
        case 'turn_left':
          updatedChar.facing = turnLeft(updatedChar.facing);
          break;
        case 'turn_right':
          updatedChar.facing = turnRight(updatedChar.facing);
          break;
        case 'turn_around':
          updatedChar.facing = turnAround(updatedChar.facing);
          break;
      }
    }
  }

  return updatedChar;
}

/**
 * Attack in a direction (ranged or melee)
 */
function attackInDirection(
  character: PlacedCharacter,
  direction: Direction,
  gameState: GameState,
  range: number
): void {
  const { dx, dy } = getDirectionOffset(direction);
  const charData = getCharacter(character.characterId);
  if (!charData) return;

  // Check each tile in range
  for (let i = 1; i <= range; i++) {
    const targetX = character.x + dx * i;
    const targetY = character.y + dy * i;

    // Stop if out of bounds
    if (!isInBounds(targetX, targetY, gameState.puzzle.width, gameState.puzzle.height)) {
      break;
    }

    // Stop if null tile or wall
    const tile = gameState.puzzle.tiles[targetY][targetX];
    if (!tile || tile.type === TileType.WALL) {
      break;
    }

    // Check for enemy
    const enemy = gameState.puzzle.enemies.find(
      (e) => e.x === targetX && e.y === targetY && !e.dead
    );

    if (enemy) {
      enemy.currentHealth -= charData.attackDamage;
      if (enemy.currentHealth <= 0) {
        enemy.dead = true;
      }
      // Ranged attacks hit first enemy and stop
      break;
    }
  }
}

/**
 * Handle IF_WALL conditional
 */
function handleIfWall(
  character: PlacedCharacter,
  action: CharacterAction,
  gameState: GameState
): PlacedCharacter {
  const { dx, dy } = getDirectionOffset(character.facing);
  const checkX = character.x + dx;
  const checkY = character.y + dy;

  // Check if there's a wall ahead, null tile, or out of bounds
  const tile = isInBounds(checkX, checkY, gameState.puzzle.width, gameState.puzzle.height)
    ? gameState.puzzle.tiles[checkY][checkX]
    : null;

  // Check for wall-like character ahead
  const blockingCharacter = gameState.placedCharacters.find(
    (c) => c.x === checkX && c.y === checkY && !c.dead && c !== character
  );
  const isWallLikeCharacter = blockingCharacter ?
    getCharacter(blockingCharacter.characterId)?.blocksMovement : false;

  // Check for blocking dead enemy
  const blockingDeadEnemy = gameState.puzzle.enemies.find(
    (e) => e.x === checkX && e.y === checkY && e.dead
  );
  const isBlockingCorpse = blockingDeadEnemy ?
    getEnemy(blockingDeadEnemy.enemyId)?.blocksMovement : false;

  const isWall =
    !isInBounds(checkX, checkY, gameState.puzzle.width, gameState.puzzle.height) ||
    !tile ||
    tile.type === TileType.WALL ||
    isWallLikeCharacter ||
    isBlockingCorpse;

  if (isWall && action.params?.then) {
    // Execute the "then" actions
    let updatedChar = { ...character };
    for (const thenAction of action.params.then) {
      updatedChar = executeAction(updatedChar, thenAction, gameState);
    }
    return updatedChar;
  }

  return character;
}
