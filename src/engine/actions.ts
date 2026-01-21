import type {
  CharacterAction,
  PlacedCharacter,
  PlacedEnemy,
  GameState,
  WallCollisionBehavior,
  CustomAttack,
  Projectile,
  ParticleEffect,
  PersistentAreaEffect,
  SpellAsset,
  RelativeDirection,
  TriggerEvent,
  Tile,
  TileBehaviorConfig,
  TileRuntimeState,
  StatusEffectInstance,
  CadenceConfig,
} from '../types/game';
import {
  ActionType,
  Direction,
  TileType,
  AttackPattern,
  SpellTemplate,
  StatusEffectType,
} from '../types/game';
import { getCharacter } from '../data/characters';
import { getEnemy } from '../data/enemies';
import { getDirectionOffset, turnLeft, turnRight, turnAround, isInBounds, calculateDistance, calculateDirectionTo } from './utils';
import { loadCustomAttack, loadSpellAsset, loadTileType, loadStatusEffectAsset, loadCollectible } from '../utils/assetStorage';
import type { CollectibleEffectConfig, PlacedCollectible } from '../types/game';
import { canEntityAct, canEntityCastSpell, canEntityMove, hasHasteBonus } from './simulation';
import { wakeFromSleep } from './simulation';

/**
 * Compute the tile path for a projectile from start to target.
 * Uses simple tile stepping - for a diagonal from (11,2) to (13,0), returns: [(11,2), (12,1), (13,0)]
 */
function computeTilePath(startX: number, startY: number, targetX: number, targetY: number): Array<{ x: number; y: number }> {
  const tiles: Array<{ x: number; y: number }> = [];
  const seen = new Set<string>();

  const addTile = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (!seen.has(key)) {
      seen.add(key);
      tiles.push({ x, y });
    }
  };

  const startTileX = Math.floor(startX);
  const startTileY = Math.floor(startY);
  const endTileX = Math.round(targetX); // Use round for target to handle slight overshoot
  const endTileY = Math.round(targetY);

  addTile(startTileX, startTileY);

  if (startTileX === endTileX && startTileY === endTileY) {
    return tiles;
  }

  const dx = endTileX - startTileX;
  const dy = endTileY - startTileY;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const tileX = startTileX + Math.round(dx * t);
    const tileY = startTileY + Math.round(dy * t);
    addTile(tileX, tileY);
  }

  return tiles;
}

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
    'CUSTOM_ATTACK': ActionType.CUSTOM_ATTACK,
    'SPELL': ActionType.SPELL,
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

  // Check if entity can act at all (Stun/Sleep prevention)
  const actCheck = canEntityAct(character);
  if (!actCheck.allowed) {
    // Entity is stunned/asleep - skip this action entirely
    return updatedCharacter;
  }

  // Normalize action type - handle both enum keys and values
  const normalizedType = normalizeActionType(action.type);

  // Check movement restriction (Slow effect)
  const isMovementAction = [
    ActionType.MOVE_FORWARD,
    ActionType.MOVE_BACKWARD,
    ActionType.MOVE_LEFT,
    ActionType.MOVE_RIGHT,
    ActionType.MOVE_DIAGONAL_NE,
    ActionType.MOVE_DIAGONAL_NW,
    ActionType.MOVE_DIAGONAL_SE,
    ActionType.MOVE_DIAGONAL_SW,
  ].includes(normalizedType);

  if (isMovementAction && !canEntityMove(character)) {
    // Slow effect - skip this movement
    return updatedCharacter;
  }

  switch (normalizedType) {
    case ActionType.MOVE_FORWARD: {
      let movedCharacter = moveCharacter(updatedCharacter, character.facing, gameState, action.tilesPerMove || 1, action.onWallCollision ?? 'stop', action.turnDegrees ?? 90);
      // Check for Haste bonus movement
      if (hasHasteBonus(movedCharacter)) {
        movedCharacter = moveCharacter(movedCharacter, movedCharacter.facing, gameState, action.tilesPerMove || 1, action.onWallCollision ?? 'stop', action.turnDegrees ?? 90);
      }
      return movedCharacter;
    }

    case ActionType.MOVE_BACKWARD: {
      const backwardDir = turnAround(character.facing);
      let movedCharacter = moveCharacter(updatedCharacter, backwardDir, gameState, action.tilesPerMove || 1, action.onWallCollision ?? 'stop', action.turnDegrees ?? 90);
      // Check for Haste bonus movement
      if (hasHasteBonus(movedCharacter)) {
        const newBackwardDir = turnAround(movedCharacter.facing);
        movedCharacter = moveCharacter(movedCharacter, newBackwardDir, gameState, action.tilesPerMove || 1, action.onWallCollision ?? 'stop', action.turnDegrees ?? 90);
      }
      return movedCharacter;
    }

    case ActionType.TURN_LEFT:
      updatedCharacter.facing = turnLeft(character.facing, action.turnDegrees ?? 90);
      return updatedCharacter;

    case ActionType.TURN_RIGHT:
      updatedCharacter.facing = turnRight(character.facing, action.turnDegrees ?? 90);
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

    case ActionType.CUSTOM_ATTACK:
      executeCustomAttack(updatedCharacter, action, gameState);
      return updatedCharacter;

    case ActionType.SPELL:
      // Set casting state for visual feedback
      updatedCharacter.isCasting = true;
      updatedCharacter.castingEndTime = Date.now() + 800; // 800ms casting duration
      executeSpell(updatedCharacter, action, gameState);
      return updatedCharacter;

    default:
      console.warn(`Unhandled action type: ${action.type}`);
      return updatedCharacter;
  }
}

// ==========================================
// CUSTOM TILE BEHAVIOR PROCESSING
// ==========================================

/**
 * Get or create tile runtime state
 */
function getTileState(gameState: GameState, x: number, y: number): TileRuntimeState {
  if (!gameState.tileStates) {
    gameState.tileStates = new Map();
  }
  const key = `${x},${y}`;
  if (!gameState.tileStates.has(key)) {
    gameState.tileStates.set(key, {});
  }
  return gameState.tileStates.get(key)!;
}

/**
 * Check if a tile with cadence is currently in the "active/on" state
 * Exported for use in rendering (AnimatedGameBoard)
 */
export function isTileActiveOnTurn(cadence: CadenceConfig, turn: number): boolean {
  if (!cadence.enabled) return true;

  // Game turns are 1-indexed (turn starts at 0, increments to 1 before first processing)
  // Adjust to 0-indexed for clean modulo math
  // Handle turn 0 (initial state before game starts) - treat as pre-turn-1
  const adjustedTurn = Math.max(0, turn - 1);

  // startOffset shifts the pattern: 'off' means we start in the off state
  const startOffset = cadence.startState === 'off' ? 1 : 0;

  switch (cadence.pattern) {
    case 'alternating':
      // Turn 1 with startState 'on': (0 + 0) % 2 = 0 → true (ON) ✓
      // Turn 2 with startState 'on': (1 + 0) % 2 = 1 → false (OFF) ✓
      // Turn 1 with startState 'off': (0 + 1) % 2 = 1 → false (OFF) ✓
      // Turn 2 with startState 'off': (1 + 1) % 2 = 0 → true (ON) ✓
      return (adjustedTurn + startOffset) % 2 === 0;

    case 'interval': {
      const onTurns = cadence.onTurns || 1;
      const offTurns = cadence.offTurns || 1;
      const cycleLength = onTurns + offTurns;
      const posInCycle = (adjustedTurn + startOffset) % cycleLength;
      return posInCycle < onTurns;
    }

    case 'custom':
      if (!cadence.customPattern?.length) return true;
      const patternIndex = (adjustedTurn + startOffset) % cadence.customPattern.length;
      return cadence.customPattern[patternIndex];

    default:
      return true;
  }
}

/**
 * Process all tile behaviors when a character steps on a tile
 * Returns the updated character (may have moved due to teleport/ice)
 */
function processTileBehaviors(
  character: PlacedCharacter,
  tile: Tile,
  movementDirection: Direction,
  gameState: GameState
): PlacedCharacter {
  if (!tile.customTileTypeId) {
    return character;
  }

  const tileType = loadTileType(tile.customTileTypeId);
  if (!tileType || !tileType.behaviors || tileType.behaviors.length === 0) {
    return character;
  }

  // Check if tile type has cadence and if currently inactive
  if (tileType.cadence?.enabled) {
    const isActive = isTileActiveOnTurn(tileType.cadence, gameState.currentTurn);
    if (!isActive) {
      return character; // Skip ALL behaviors this turn - tile is "off"
    }
  }

  let updatedChar = { ...character };

  for (const behavior of tileType.behaviors) {
    switch (behavior.type) {
      case 'damage':
        updatedChar = processDamageBehavior(updatedChar, tile, behavior, gameState);
        break;
      case 'teleport':
        updatedChar = processTeleportBehavior(updatedChar, tile, behavior, gameState);
        break;
      case 'direction_change':
        if (behavior.newFacing) {
          updatedChar.facing = behavior.newFacing;
        }
        break;
      case 'ice':
        updatedChar = processIceBehavior(updatedChar, movementDirection, gameState);
        break;
      case 'pressure_plate':
        processPressurePlateBehavior(tile, behavior, gameState);
        break;
    }

    // Stop processing if character died
    if (updatedChar.dead) {
      break;
    }
  }

  return updatedChar;
}

/**
 * Process damage tile behavior
 */
function processDamageBehavior(
  character: PlacedCharacter,
  tile: Tile,
  behavior: TileBehaviorConfig,
  gameState: GameState
): PlacedCharacter {
  const damage = behavior.damageAmount || 1;
  const tileState = getTileState(gameState, tile.x, tile.y);

  // Check if this should only damage once
  if (behavior.damageOnce) {
    if (!tileState.damagedEntities) {
      tileState.damagedEntities = new Set();
    }
    // Use character position + id as unique key
    const entityKey = character.characterId;
    if (tileState.damagedEntities.has(entityKey)) {
      // Already damaged this entity
      return character;
    }
    tileState.damagedEntities.add(entityKey);
  }

  const updatedChar = { ...character };
  updatedChar.currentHealth -= damage;

  if (updatedChar.currentHealth <= 0) {
    updatedChar.dead = true;
  }

  return updatedChar;
}

/**
 * Process teleport tile behavior (bidirectional)
 */
function processTeleportBehavior(
  character: PlacedCharacter,
  tile: Tile,
  behavior: TileBehaviorConfig,
  gameState: GameState
): PlacedCharacter {
  const groupId = tile.teleportGroupId || behavior.teleportGroupId;
  if (!groupId) {
    return character;
  }

  // Find another tile with the same teleport group ID
  let destinationTile: Tile | null = null;

  for (let y = 0; y < gameState.puzzle.height; y++) {
    for (let x = 0; x < gameState.puzzle.width; x++) {
      const checkTile = gameState.puzzle.tiles[y]?.[x];
      if (!checkTile) continue;
      if (checkTile.x === tile.x && checkTile.y === tile.y) continue; // Skip source tile

      // Check if this tile has the same teleport group
      if (checkTile.teleportGroupId === groupId) {
        destinationTile = checkTile;
        break;
      }

      // Also check if the tile's custom type has teleport behavior with matching group
      if (checkTile.customTileTypeId) {
        const checkTileType = loadTileType(checkTile.customTileTypeId);
        if (checkTileType) {
          const teleportBehavior = checkTileType.behaviors.find(b => b.type === 'teleport');
          if (teleportBehavior?.teleportGroupId === groupId) {
            destinationTile = checkTile;
            break;
          }
        }
      }
    }
    if (destinationTile) break;
  }

  if (!destinationTile) {
    return character;
  }

  return {
    ...character,
    x: destinationTile.x,
    y: destinationTile.y,
    justTeleported: true,
    teleportFromX: tile.x,
    teleportFromY: tile.y,
  };
}

/**
 * Process ice tile behavior - slide until hitting a wall
 */
function processIceBehavior(
  character: PlacedCharacter,
  movementDirection: Direction,
  gameState: GameState
): PlacedCharacter {
  let updatedChar = { ...character };
  const { dx, dy } = getDirectionOffset(movementDirection);
  let slideCount = 0;

  // Keep sliding until we hit something
  let maxSlides = 50; // Prevent infinite loops
  while (maxSlides > 0) {
    maxSlides--;

    const nextX = updatedChar.x + dx;
    const nextY = updatedChar.y + dy;

    // Check if next position is blocked
    if (!isInBounds(nextX, nextY, gameState.puzzle.width, gameState.puzzle.height)) {
      break; // Hit edge
    }

    const nextTile = gameState.puzzle.tiles[nextY]?.[nextX];
    if (!nextTile || nextTile.type === TileType.WALL) {
      break; // Hit wall or void
    }

    // Check for custom tile type that's a wall
    if (nextTile.customTileTypeId) {
      const nextTileType = loadTileType(nextTile.customTileTypeId);
      if (nextTileType?.baseType === 'wall') {
        break; // Hit custom wall
      }
    }

    // Check for blocking entities
    const blockingChar = gameState.placedCharacters.find(
      c => c.x === nextX && c.y === nextY && !c.dead && c !== updatedChar
    );
    if (blockingChar) {
      const blockingCharData = getCharacter(blockingChar.characterId);
      if (!blockingCharData?.canOverlapEntities) {
        break; // Hit character
      }
    }

    const blockingEnemy = gameState.puzzle.enemies.find(
      e => e.x === nextX && e.y === nextY && !e.dead
    );
    if (blockingEnemy) {
      const blockingEnemyData = getEnemy(blockingEnemy.enemyId);
      if (!blockingEnemyData?.canOverlapEntities) {
        break; // Hit enemy
      }
    }

    // Move to next tile
    updatedChar.x = nextX;
    updatedChar.y = nextY;
    slideCount++;

    // Check if the new tile is NOT ice - stop sliding
    const newTile = gameState.puzzle.tiles[nextY][nextX];
    if (newTile?.customTileTypeId) {
      const newTileType = loadTileType(newTile.customTileTypeId);
      if (newTileType) {
        const hasIce = newTileType.behaviors.some(b => b.type === 'ice');
        if (!hasIce) {
          // Process other behaviors on this non-ice tile
          updatedChar = processTileBehaviors(updatedChar, newTile, movementDirection, gameState);
          break;
        }
      }
    } else {
      // Not a custom tile, stop sliding
      break;
    }
  }

  // Track the slide distance for animation pacing
  if (slideCount > 0) {
    updatedChar.iceSlideDistance = slideCount;
  }

  return updatedChar;
}

/**
 * Process pressure plate behavior
 */
function processPressurePlateBehavior(
  tile: Tile,
  behavior: TileBehaviorConfig,
  gameState: GameState
): void {
  const tileState = getTileState(gameState, tile.x, tile.y);
  tileState.pressurePlateActive = true;

  if (!behavior.pressurePlateEffects) {
    return;
  }

  for (const effect of behavior.pressurePlateEffects) {
    switch (effect.type) {
      case 'toggle_wall':
        if (effect.targetX !== undefined && effect.targetY !== undefined) {
          const targetTile = gameState.puzzle.tiles[effect.targetY]?.[effect.targetX];
          if (targetTile) {
            // Toggle between wall and empty
            targetTile.type = targetTile.type === TileType.WALL ? TileType.EMPTY : TileType.WALL;
          }
        }
        break;

      case 'spawn_enemy':
        // Find dormant enemy at target location and activate it
        if (effect.targetX !== undefined && effect.targetY !== undefined) {
          const enemy = gameState.puzzle.enemies.find(
            e => e.x === effect.targetX && e.y === effect.targetY && e.dead
          );
          if (enemy) {
            enemy.dead = false;
            const enemyData = getEnemy(enemy.enemyId);
            if (enemyData) {
              enemy.currentHealth = enemyData.health;
            }
          }
        }
        break;

      case 'despawn_enemy':
        if (effect.targetX !== undefined && effect.targetY !== undefined) {
          const enemy = gameState.puzzle.enemies.find(
            e => e.x === effect.targetX && e.y === effect.targetY && !e.dead
          );
          if (enemy) {
            enemy.dead = true;
          }
        }
        break;

      case 'trigger_teleport':
        // Could trigger a teleport effect at target location
        break;
    }
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
  onWallCollision: WallCollisionBehavior = 'stop',
  turnDegrees: 45 | 90 | 135 = 90
): PlacedCharacter {
  // Move multiple tiles if tilesPerMove > 1
  let updatedChar = { ...character };

  // PRE-CHECK: Look ahead to see if we'll hit a wall or wall-behaving entity on first move
  // This prevents wasting a turn when facing a wall
  const { dx: firstDx, dy: firstDy } = getDirectionOffset(direction);
  const firstX = updatedChar.x + firstDx;
  const firstY = updatedChar.y + firstDy;

  let willHitWall =
    !isInBounds(firstX, firstY, gameState.puzzle.width, gameState.puzzle.height) ||
    gameState.puzzle.tiles[firstY]?.[firstX] === null ||
    gameState.puzzle.tiles[firstY]?.[firstX] === undefined ||
    gameState.puzzle.tiles[firstY]?.[firstX]?.type === TileType.WALL;

  // Also check for entities that behave like walls
  if (!willHitWall && isInBounds(firstX, firstY, gameState.puzzle.width, gameState.puzzle.height)) {
    // Check for living character with behavesLikeWall
    const wallCharacter = gameState.placedCharacters.find(
      (c) => c.x === firstX && c.y === firstY && !c.dead && c !== updatedChar
    );
    if (wallCharacter) {
      const wallCharData = getCharacter(wallCharacter.characterId);
      if (wallCharData?.behavesLikeWall) {
        willHitWall = true;
      }
    }

    // Check for living enemy with behavesLikeWall
    if (!willHitWall) {
      const wallEnemy = gameState.puzzle.enemies.find(
        (e) => e.x === firstX && e.y === firstY && !e.dead
      );
      if (wallEnemy) {
        const wallEnemyData = getEnemy(wallEnemy.enemyId);
        if (wallEnemyData?.behavesLikeWall) {
          willHitWall = true;
        }
      }
    }

    // Check for dead enemy with behavesLikeWallDead
    if (!willHitWall) {
      const deadWallEnemy = gameState.puzzle.enemies.find(
        (e) => e.x === firstX && e.y === firstY && e.dead
      );
      if (deadWallEnemy) {
        const deadWallEnemyData = getEnemy(deadWallEnemy.enemyId);
        if (deadWallEnemyData?.behavesLikeWallDead) {
          willHitWall = true;
        }
      }
    }

    // Check for dead character with behavesLikeWallDead
    if (!willHitWall) {
      const deadWallChar = gameState.placedCharacters.find(
        (c) => c.x === firstX && c.y === firstY && c.dead
      );
      if (deadWallChar) {
        const deadWallCharData = getCharacter(deadWallChar.characterId);
        if (deadWallCharData?.behavesLikeWallDead) {
          willHitWall = true;
        }
      }
    }
  }

  // If we'll hit a wall immediately, handle collision NOW (don't waste a turn)
  // Skip 'stop' and 'continue' behaviors - 'stop' means do nothing, 'continue' means ghost through
  if (willHitWall && onWallCollision !== 'continue' && onWallCollision !== 'stop') {
    // Turn the character based on collision behavior
    switch (onWallCollision) {
      case 'turn_left':
        updatedChar.facing = turnLeft(updatedChar.facing, turnDegrees);
        direction = updatedChar.facing; // Update direction for movement below
        break;
      case 'turn_right':
        updatedChar.facing = turnRight(updatedChar.facing, turnDegrees);
        direction = updatedChar.facing; // Update direction for movement below
        break;
      case 'turn_around':
        updatedChar.facing = turnAround(updatedChar.facing);
        direction = updatedChar.facing; // Update direction for movement below
        break;
      default:
        // Unknown collision behavior, just stop
        return updatedChar;
    }
    // After turning, continue with movement logic below to try moving in new direction
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
          updatedChar.facing = turnLeft(updatedChar.facing, turnDegrees);
          return updatedChar;
        case 'turn_right':
          updatedChar.facing = turnRight(updatedChar.facing, turnDegrees);
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
      // Check if EITHER entity can overlap (ghost mode - bidirectional)
      const movingEntityData = getCharacter(updatedChar.characterId) || getEnemy(updatedChar.characterId);
      const otherCharData = getCharacter(otherCharacter.characterId);
      if (movingEntityData?.canOverlapEntities || otherCharData?.canOverlapEntities) {
        // Ghost mode - can pass through, move to this tile
        updatedChar.x = newX;
        updatedChar.y = newY;
        continue; // Continue to next tile if multi-tile move
      }

      // Check if character behaves like a wall (triggers wall collision behaviors)
      if (otherCharData?.behavesLikeWall) {
        // Handle like a wall collision based on behavior
        switch (onWallCollision) {
          case 'turn_left':
            updatedChar.facing = turnLeft(updatedChar.facing, turnDegrees);
            return updatedChar;
          case 'turn_right':
            updatedChar.facing = turnRight(updatedChar.facing, turnDegrees);
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

      // Check if character blocks movement (stops without triggering wall reactions)
      if (otherCharData?.blocksMovement) {
        return updatedChar; // Just stop, no wall collision behavior
      }

      // Check if the target tile is being vacated (train-like movement)
      const targetKey = `${Math.floor(newX)},${Math.floor(newY)}`;
      if (gameState.tilesBeingVacated?.has(targetKey)) {
        // The character at this tile is moving away - allow the move (train behavior)
        updatedChar.x = newX;
        updatedChar.y = newY;
        continue;
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

      // Check if dead enemy behaves like a wall (triggers wall collision behaviors)
      if (enemyData?.behavesLikeWallDead) {
        // Check if the moving entity can overlap (ghost mode)
        const movingEntityData = getCharacter(updatedChar.characterId) || getEnemy(updatedChar.characterId);
        if (movingEntityData?.canOverlapEntities) {
          // Ghost mode - can pass through corpses too
          updatedChar.x = newX;
          updatedChar.y = newY;
          continue;
        }

        // Handle like a wall collision based on behavior
        switch (onWallCollision) {
          case 'turn_left':
            updatedChar.facing = turnLeft(updatedChar.facing, turnDegrees);
            return updatedChar;
          case 'turn_right':
            updatedChar.facing = turnRight(updatedChar.facing, turnDegrees);
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

      // Check if dead enemy blocks movement (stops without triggering wall reactions)
      if (enemyData?.blocksMovementDead) {
        const movingEntityData = getCharacter(updatedChar.characterId) || getEnemy(updatedChar.characterId);
        if (!movingEntityData?.canOverlapEntities) {
          return updatedChar; // Just stop, no wall collision behavior
        }
      }
      // Dead enemies without behavesLikeWallDead or blocksMovementDead can be walked over
    }

    // Check for living enemy at target position
    const enemyAtTarget = gameState.puzzle.enemies.find(
      (e) => e.x === newX && e.y === newY && !e.dead
    );

    if (enemyAtTarget) {
      // Check if EITHER entity can overlap (ghost mode - bidirectional)
      const movingEntityData = getCharacter(updatedChar.characterId) || getEnemy(updatedChar.characterId);
      const targetEnemyData = getEnemy(enemyAtTarget.enemyId);
      if (movingEntityData?.canOverlapEntities || targetEnemyData?.canOverlapEntities) {
        // Ghost mode - can pass through living enemies too
        updatedChar.x = newX;
        updatedChar.y = newY;
        continue;
      }

      const enemyData = getEnemy(enemyAtTarget.enemyId);

      // Check if enemy behaves like a wall (triggers wall collision behaviors)
      if (enemyData?.behavesLikeWall) {
        // Handle like a wall collision based on behavior
        switch (onWallCollision) {
          case 'turn_left':
            updatedChar.facing = turnLeft(updatedChar.facing, turnDegrees);
            return updatedChar;
          case 'turn_right':
            updatedChar.facing = turnRight(updatedChar.facing, turnDegrees);
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

      // Check if enemy blocks movement (stops without triggering wall reactions)
      if (enemyData?.blocksMovement) {
        return updatedChar; // Just stop, no wall collision behavior, no combat
      }

      // Check if this is an enemy trying to move into another enemy (no combat, just block)
      const isEnemyMoving = getEnemy(updatedChar.characterId) !== undefined;

      if (isEnemyMoving) {
        // Check if the target tile is being vacated (train-like movement)
        const targetKey = `${Math.floor(newX)},${Math.floor(newY)}`;
        if (gameState.tilesBeingVacated?.has(targetKey)) {
          // The enemy at this tile is moving away - allow the move (train behavior)
          updatedChar.x = newX;
          updatedChar.y = newY;
          continue;
        }
        // Enemy-to-enemy collision: just wait, don't move, don't fight
        return updatedChar;
      }

      // Combat: Check if enemy has melee priority
      const charData = getCharacter(updatedChar.characterId);
      const enemyDataForCombat = getEnemy(enemyAtTarget.enemyId);

      if (charData && enemyDataForCombat) {
        // Determine who attacks first based on priority
        const enemyHasPriority = enemyDataForCombat.hasMeleePriority === true;

        // Contact damage is now explicit - 0 or undefined means no contact damage
        const enemyContactDamage = enemyDataForCombat.contactDamage ?? 0;
        const charContactDamage = charData.contactDamage ?? 0;

        if (enemyHasPriority) {
          // Enemy attacks first (enemy has priority)
          updatedChar.currentHealth -= enemyContactDamage;
          if (updatedChar.currentHealth <= 0) {
            updatedChar.dead = true;
          }

          // Character counterattacks ONLY if still alive
          if (!updatedChar.dead) {
            enemyAtTarget.currentHealth -= charContactDamage;
            if (enemyAtTarget.currentHealth <= 0) {
              enemyAtTarget.dead = true;
            }
          }
        } else {
          // Character attacks first (default - player initiative)
          enemyAtTarget.currentHealth -= charContactDamage;
          if (enemyAtTarget.currentHealth <= 0) {
            enemyAtTarget.dead = true;
          }

          // Enemy counterattacks ONLY if still alive
          if (!enemyAtTarget.dead) {
            updatedChar.currentHealth -= enemyContactDamage;
            if (updatedChar.currentHealth <= 0) {
              updatedChar.dead = true;
            }
          }
        }
      } else if (charData) {
        // Fallback: just character data available (shouldn't normally happen)
        const charContactDamage = charData.contactDamage ?? 0;
        enemyAtTarget.currentHealth -= charContactDamage;
        if (enemyAtTarget.currentHealth <= 0) {
          enemyAtTarget.dead = true;
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
    // Detect if this is actually an enemy (enemies use characterId = enemyId when wrapped as PlacedCharacter)
    const isEnemy = !getCharacter(updatedChar.characterId) && !!getEnemy(updatedChar.characterId);
    processCollectiblePickup(updatedChar, isEnemy, newX, newY, gameState);

    // Process custom tile behaviors (damage, teleport, ice, etc.)
    const currentTile = gameState.puzzle.tiles[updatedChar.y]?.[updatedChar.x];
    if (currentTile && currentTile.customTileTypeId) {
      updatedChar = processTileBehaviors(updatedChar, currentTile, currentDirection, gameState);

      // If character died from tile damage, stop processing
      if (updatedChar.dead) {
        return updatedChar;
      }
    }
  }

  // POST-MOVEMENT LOOKAHEAD: After successfully moving, check if next tile is a wall
  // This prevents wasting a turn on the next action
  if (onWallCollision !== 'stop' && onWallCollision !== 'continue') {
    const { dx: nextDx, dy: nextDy } = getDirectionOffset(updatedChar.facing);
    const nextX = updatedChar.x + nextDx;
    const nextY = updatedChar.y + nextDy;

    let willHitWallNext =
      !isInBounds(nextX, nextY, gameState.puzzle.width, gameState.puzzle.height) ||
      gameState.puzzle.tiles[nextY]?.[nextX] === null ||
      gameState.puzzle.tiles[nextY]?.[nextX] === undefined ||
      gameState.puzzle.tiles[nextY]?.[nextX]?.type === TileType.WALL;

    // Also check for entities that behave like walls
    if (!willHitWallNext && isInBounds(nextX, nextY, gameState.puzzle.width, gameState.puzzle.height)) {
      // Check for living character with behavesLikeWall
      const wallCharNext = gameState.placedCharacters.find(
        (c) => c.x === nextX && c.y === nextY && !c.dead && c !== updatedChar
      );
      if (wallCharNext) {
        const wallCharData = getCharacter(wallCharNext.characterId);
        if (wallCharData?.behavesLikeWall) {
          willHitWallNext = true;
        }
      }

      // Check for living enemy with behavesLikeWall
      if (!willHitWallNext) {
        const wallEnemyNext = gameState.puzzle.enemies.find(
          (e) => e.x === nextX && e.y === nextY && !e.dead
        );
        if (wallEnemyNext) {
          const wallEnemyData = getEnemy(wallEnemyNext.enemyId);
          if (wallEnemyData?.behavesLikeWall) {
            willHitWallNext = true;
          }
        }
      }

      // Check for dead enemy with behavesLikeWallDead
      if (!willHitWallNext) {
        const deadWallEnemyNext = gameState.puzzle.enemies.find(
          (e) => e.x === nextX && e.y === nextY && e.dead
        );
        if (deadWallEnemyNext) {
          const deadWallEnemyData = getEnemy(deadWallEnemyNext.enemyId);
          if (deadWallEnemyData?.behavesLikeWallDead) {
            willHitWallNext = true;
          }
        }
      }

      // Check for dead character with behavesLikeWallDead
      if (!willHitWallNext) {
        const deadWallCharNext = gameState.placedCharacters.find(
          (c) => c.x === nextX && c.y === nextY && c.dead
        );
        if (deadWallCharNext) {
          const deadWallCharData = getCharacter(deadWallCharNext.characterId);
          if (deadWallCharData?.behavesLikeWallDead) {
            willHitWallNext = true;
          }
        }
      }
    }

    if (willHitWallNext) {
      // Turn now to avoid wasting next turn
      switch (onWallCollision) {
        case 'turn_left':
          updatedChar.facing = turnLeft(updatedChar.facing, turnDegrees);
          break;
        case 'turn_right':
          updatedChar.facing = turnRight(updatedChar.facing, turnDegrees);
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
  const blockingCharData = blockingCharacter ? getCharacter(blockingCharacter.characterId) : null;
  const isWallLikeCharacter = blockingCharData?.behavesLikeWall || false;

  // Check for blocking dead enemy (behaves like wall)
  const blockingDeadEnemy = gameState.puzzle.enemies.find(
    (e) => e.x === checkX && e.y === checkY && e.dead
  );
  const isBlockingCorpse = blockingDeadEnemy ?
    getEnemy(blockingDeadEnemy.enemyId)?.behavesLikeWallDead : false;

  // Check for blocking living enemy
  const blockingEnemy = gameState.puzzle.enemies.find(
    (e) => e.x === checkX && e.y === checkY && !e.dead
  );
  const blockingEnemyData = blockingEnemy ? getEnemy(blockingEnemy.enemyId) : null;

  // Check if EITHER entity can overlap (ghost mode - bidirectional)
  const movingEntityData = getCharacter(character.characterId) || getEnemy(character.characterId);
  const canOverlapCharacter = movingEntityData?.canOverlapEntities || blockingCharData?.canOverlapEntities;
  const canOverlapEnemy = movingEntityData?.canOverlapEntities || blockingEnemyData?.canOverlapEntities;

  // Check for blocking corpse data
  const blockingCorpseData = blockingDeadEnemy ? getEnemy(blockingDeadEnemy.enemyId) : null;
  const canOverlapCorpse = movingEntityData?.canOverlapEntities || blockingCorpseData?.canOverlapEntities;

  const isWall =
    !isInBounds(checkX, checkY, gameState.puzzle.width, gameState.puzzle.height) ||
    !tile ||
    tile.type === TileType.WALL ||
    (!canOverlapCharacter && isWallLikeCharacter) ||
    (!canOverlapCorpse && isBlockingCorpse);

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

// ==========================================
// CUSTOM ATTACK SYSTEM (Phase 2)
// ==========================================

/**
 * Execute a custom attack action
 */
function executeCustomAttack(
  character: PlacedCharacter,
  action: CharacterAction,
  gameState: GameState
): void {
  // Get attack data from action or load from storage
  let attackData: CustomAttack | null = null;

  if (action.customAttack) {
    attackData = action.customAttack;
  } else if (action.customAttackId) {
    attackData = loadCustomAttack(action.customAttackId);
  }

  if (!attackData) {
    console.warn('Custom attack data not found');
    return;
  }

  // Execute based on attack pattern
  switch (attackData.pattern) {
    case AttackPattern.PROJECTILE:
      spawnProjectile(character, attackData, gameState);
      break;

    case AttackPattern.MELEE:
      // For custom attacks, meleeRange comes from attackData.range (defaults to 1)
      executeMeleeAttack(character, attackData, gameState, attackData.range || 1);
      break;

    case AttackPattern.AOE_CIRCLE:
      executeAOEAttack(character, attackData, character.facing, gameState);
      break;

    case AttackPattern.HEAL:
      executeHeal(character, attackData, gameState);
      break;

    default:
      console.warn(`Attack pattern not yet implemented: ${attackData.pattern}`);
  }
}

/**
 * Convert relative direction to absolute direction based on current facing
 */
function relativeToAbsolute(facing: Direction, relative: RelativeDirection): Direction {
  // Map each cardinal/ordinal direction to numeric angle (0 = North, clockwise)
  const directionAngles: Record<Direction, number> = {
    [Direction.NORTH]: 0,
    [Direction.NORTHEAST]: 45,
    [Direction.EAST]: 90,
    [Direction.SOUTHEAST]: 135,
    [Direction.SOUTH]: 180,
    [Direction.SOUTHWEST]: 225,
    [Direction.WEST]: 270,
    [Direction.NORTHWEST]: 315,
  };

  // Map relative directions to angle offsets
  const relativeOffsets: Record<RelativeDirection, number> = {
    'forward': 0,
    'forward_right': 45,
    'right': 90,
    'backward_right': 135,
    'backward': 180,
    'backward_left': 225,
    'left': 270,
    'forward_left': 315,
  };

  // Calculate absolute angle
  const currentAngle = directionAngles[facing];
  const offset = relativeOffsets[relative];
  let absoluteAngle = (currentAngle + offset) % 360;

  // Convert back to Direction enum
  const angleToDirection: Record<number, Direction> = {
    0: Direction.NORTH,
    45: Direction.NORTHEAST,
    90: Direction.EAST,
    135: Direction.SOUTHEAST,
    180: Direction.SOUTH,
    225: Direction.SOUTHWEST,
    270: Direction.WEST,
    315: Direction.NORTHWEST,
  };

  return angleToDirection[absoluteAngle] || Direction.NORTH;
}

/**
 * Execute a spell from the spell library
 */
function executeSpell(
  character: PlacedCharacter,
  action: CharacterAction,
  gameState: GameState
): void {
  console.log('[SPELL DEBUG] executeSpell called with action:', JSON.stringify({
    type: action.type,
    spellId: action.spellId,
    autoTargetNearestEnemy: action.autoTargetNearestEnemy,
    autoTargetNearestCharacter: action.autoTargetNearestCharacter,
    directionOverride: action.directionOverride,
    relativeDirectionOverride: action.relativeDirectionOverride,
  }));

  // Load spell from library
  if (!action.spellId) {
    console.warn('Spell ID not found in action');
    return;
  }

  const spell = loadSpellAsset(action.spellId);
  if (!spell) {
    console.warn(`Spell not found: ${action.spellId}`);
    return;
  }

  // Check if spell is on cooldown
  if (character.spellCooldowns && character.spellCooldowns[action.spellId] > 0) {
    // Spell is on cooldown - skip this action
    return;
  }

  // Check if entity can cast this type of spell (Silenced/Disarmed check)
  const castCheck = canEntityCastSpell(character, spell.template);
  if (!castCheck.allowed) {
    // Entity is silenced or disarmed - cannot cast this spell
    return;
  }

  // Determine which directions to cast the spell
  let castDirections: Direction[] = [];

  // Track targets for homing projectiles
  interface HomingTarget {
    direction: Direction;
    targetEntityId: string;
    targetIsEnemy: boolean;
  }
  let homingTargets: HomingTarget[] | undefined;

  // Check for auto-targeting (enemies targeting characters OR characters targeting enemies)
  if (action.autoTargetNearestCharacter) {
    // Used by enemies to target characters
    const maxTargets = action.maxTargets || 1;
    const targetMode = action.autoTargetMode || 'omnidirectional';
    const nearestCharacters = findNearestCharacters(character, gameState, maxTargets, targetMode);
    console.log('[SPELL DEBUG] autoTargetNearestCharacter, found:', nearestCharacters.length, 'targets');

    if (nearestCharacters.length > 0) {
      castDirections = nearestCharacters.map(target => target.direction);
      console.log('[SPELL DEBUG] castDirections set to:', castDirections);
      // Store target info for homing
      if (action.homing) {
        homingTargets = nearestCharacters.map(target => ({
          direction: target.direction,
          targetEntityId: target.character.characterId,
          targetIsEnemy: false,
        }));
      }
    } else {
      console.log('[SPELL DEBUG] No characters found, returning early');
      return;
    }
  } else if (action.autoTargetNearestEnemy) {
    // Used by characters to target enemies
    const maxTargets = action.maxTargets || 1;
    const targetMode = action.autoTargetMode || 'omnidirectional';
    const nearestEnemies = findNearestEnemies(character, gameState, maxTargets, targetMode);
    console.log('[SPELL DEBUG] autoTargetNearestEnemy, found:', nearestEnemies.length, 'targets');

    if (nearestEnemies.length > 0) {
      castDirections = nearestEnemies.map(target => target.direction);
      console.log('[SPELL DEBUG] castDirections set to:', castDirections);
      // Store target info for homing
      if (action.homing) {
        homingTargets = nearestEnemies.map(target => ({
          direction: target.direction,
          targetEntityId: target.enemy.enemyId,
          targetIsEnemy: true,
        }));
      }
    } else {
      console.log('[SPELL DEBUG] No enemies found, returning early');
      return;
    }
  } else if (action.useRelativeOverride && action.relativeDirectionOverride && action.relativeDirectionOverride.length > 0) {
    // Use relative override from behavior action
    castDirections = action.relativeDirectionOverride.map(relDir =>
      relativeToAbsolute(character.facing, relDir)
    );
  } else if (action.directionOverride && action.directionOverride.length > 0) {
    // Use absolute override from behavior action
    castDirections = action.directionOverride;
  } else if (spell.directionMode === 'current_facing') {
    // Use character's facing direction
    castDirections = [character.facing];
  } else if (spell.directionMode === 'all_directions') {
    // Cast in all 8 directions
    castDirections = [
      Direction.NORTH,
      Direction.NORTHEAST,
      Direction.EAST,
      Direction.SOUTHEAST,
      Direction.SOUTH,
      Direction.SOUTHWEST,
      Direction.WEST,
      Direction.NORTHWEST,
    ];
  } else if (spell.directionMode === 'fixed' && spell.defaultDirections) {
    // Use spell's configured directions
    castDirections = spell.defaultDirections;
  } else if (spell.directionMode === 'relative' && spell.relativeDirections) {
    // Convert relative directions to absolute based on current facing
    castDirections = spell.relativeDirections.map(relDir =>
      relativeToAbsolute(character.facing, relDir)
    );
  }

  // Execute spell for each direction based on template type
  console.log('[SPELL DEBUG] Final castDirections:', castDirections, 'action flags:', {
    autoTargetNearestEnemy: action.autoTargetNearestEnemy,
    autoTargetNearestCharacter: action.autoTargetNearestCharacter
  });
  for (let i = 0; i < castDirections.length; i++) {
    const direction = castDirections[i];
    const homingTarget = homingTargets?.[i];
    console.log('[SPELL DEBUG] Executing spell in direction:', direction);
    executeSpellInDirection(character, spell, direction, gameState, homingTarget);
  }

  // Set cooldown if spell has one
  // We add 1 because the cooldown is decremented at end of turn, so:
  // cooldown 3 = set to 4 -> end of turn becomes 3 -> skip 3 turns -> becomes 0 -> can cast
  if (spell.cooldown && spell.cooldown > 0 && action.spellId) {
    if (!character.spellCooldowns) {
      character.spellCooldowns = {};
    }
    character.spellCooldowns[action.spellId] = spell.cooldown + 1;
  }
}

/**
 * Execute spell in a specific direction
 */
function executeSpellInDirection(
  character: PlacedCharacter,
  spell: SpellAsset,
  direction: Direction,
  gameState: GameState,
  homingTarget?: { targetEntityId: string; targetIsEnemy: boolean }
): void {
  // Convert SpellAsset to CustomAttack format for execution
  const attackData: CustomAttack = {
    id: spell.id,
    name: spell.name,
    damage: spell.damage,
    healing: spell.healing,
    range: spell.range,
    projectileSpeed: spell.projectileSpeed,
    projectilePierces: spell.pierceEnemies,
    aoeRadius: spell.radius,
    aoeCenteredOnCaster: spell.aoeCenteredOnCaster,
    projectileBeforeAOE: spell.projectileBeforeAOE,
    aoeExcludeCenter: spell.aoeExcludeCenter,
    persistDuration: spell.persistDuration,
    persistDamagePerTurn: spell.persistDamagePerTurn,
    persistVisualSprite: spell.sprites.persistentArea,
    projectileSprite: spell.sprites.projectile,
    aoeEffectSprite: spell.sprites.aoeEffect,
    hitEffectSprite: spell.sprites.damageEffect,
    healingEffectSprite: spell.sprites.healingEffect,
    castEffectSprite: spell.sprites.castEffect,
    effectDuration: 300,
    pattern: AttackPattern.PROJECTILE, // Default, will be set below
  };

  // Map spell template to attack pattern
  switch (spell.templateType) {
    case SpellTemplate.MELEE:
      attackData.pattern = AttackPattern.MELEE;
      // Temporarily set character facing for melee direction
      const originalFacing = character.facing;
      character.facing = direction;
      // Use meleeRange from spell (defaults to 1 if not set)
      executeMeleeAttack(character, attackData, gameState, spell.meleeRange || 1, spell);
      character.facing = originalFacing;
      break;

    case SpellTemplate.RANGE_LINEAR:
    case SpellTemplate.MAGIC_LINEAR:
      attackData.pattern = AttackPattern.PROJECTILE;
      // Temporarily set character facing for projectile direction
      const origFacing = character.facing;
      character.facing = direction;
      spawnProjectile(character, attackData, gameState, spell, homingTarget);
      character.facing = origFacing;
      break;

    case SpellTemplate.AOE:
      attackData.pattern = AttackPattern.AOE_CIRCLE;

      // Check if this should be a projectile that explodes into AOE
      if (attackData.projectileBeforeAOE) {
        // Temporarily set character facing for projectile direction
        const origFacing2 = character.facing;
        character.facing = direction;
        spawnProjectile(character, attackData, gameState, spell, homingTarget);
        character.facing = origFacing2;
      } else {
        // Instant AOE attack
        executeAOEAttack(character, attackData, direction, gameState, spell);
      }
      break;

    default:
      console.warn(`Spell template not yet implemented: ${spell.templateType}`);
  }
}

/**
 * Spawn a projectile for a PROJECTILE attack
 */
function spawnProjectile(
  character: PlacedCharacter,
  attackData: CustomAttack,
  gameState: GameState,
  spell?: SpellAsset,
  homingTarget?: { targetEntityId: string; targetIsEnemy: boolean }
): void {
  if (!gameState.activeProjectiles) {
    gameState.activeProjectiles = [];
  }

  const range = attackData.range || 10; // Default max range
  const speed = attackData.projectileSpeed || 4; // Tiles per turn


  // Calculate target position
  let targetX: number;
  let targetY: number;

  // For homing projectiles, set initial target to the actual target entity's position
  if (homingTarget) {
    let targetEntity: { x: number; y: number } | undefined;
    if (homingTarget.targetIsEnemy) {
      targetEntity = gameState.puzzle.enemies.find(e => e.enemyId === homingTarget.targetEntityId);
    } else {
      targetEntity = gameState.placedCharacters.find(c => c.characterId === homingTarget.targetEntityId);
    }
    if (targetEntity) {
      targetX = targetEntity.x;
      targetY = targetEntity.y;
    } else {
      // Fallback to max range in facing direction if target not found
      const { dx, dy } = getDirectionOffset(character.facing);
      targetX = character.x + dx * range;
      targetY = character.y + dy * range;
    }
  } else {
    // Non-homing: use max range in facing direction
    const { dx, dy } = getDirectionOffset(character.facing);
    targetX = character.x + dx * range;
    targetY = character.y + dy * range;
  }

  // Determine if source is an enemy or character
  const isEnemy = gameState.puzzle.enemies.some(e => e.enemyId === character.characterId);

  // Pre-compute tile path for deterministic collision detection
  // For non-homing projectiles, this path is fixed at creation time
  const tilePath = homingTarget ? undefined : computeTilePath(character.x, character.y, targetX, targetY);

  // Create projectile
  const projectile: Projectile = {
    id: `proj_${Date.now()}_${Math.random()}`,
    attackData,
    x: character.x,
    y: character.y,
    startX: character.x,
    startY: character.y,
    targetX,
    targetY,
    direction: character.facing,
    speed,
    active: true,
    startTime: Date.now(),
    spawnTurn: gameState.currentTurn, // Track spawn turn for same-turn hit detection
    // Homing behavior
    isHoming: !!homingTarget,
    targetEntityId: homingTarget?.targetEntityId,
    targetIsEnemy: homingTarget?.targetIsEnemy,
    sourceCharacterId: isEnemy ? undefined : character.characterId,
    sourceEnemyId: isEnemy ? character.characterId : undefined,
    spellAssetId: spell?.id,
    // Bounce settings from spell
    bounceOffWalls: spell?.bounceOffWalls,
    maxBounces: spell?.maxBounces ?? (spell?.bounceOffWalls ? 3 : undefined),
    bounceCount: 0,
    bounceBehavior: spell?.bounceBehavior || 'reflect',
    bounceTurnDegrees: spell?.bounceTurnDegrees ?? 90,
    // Tile-based movement (for non-homing projectiles)
    tilePath,
    currentTileIndex: 0,
    tileEntryTime: Date.now(),
  };

  gameState.activeProjectiles.push(projectile);

  // Spawn cast effect if configured
  if (attackData.castEffectSprite) {
    spawnParticle(character.x, character.y, attackData.castEffectSprite, attackData.effectDuration || 300, gameState);
  }
}

/**
 * Execute melee attack (instant, no projectile)
 * Supports meleeRange to hit multiple tiles in attack direction
 */
function executeMeleeAttack(
  character: PlacedCharacter,
  attackData: CustomAttack,
  gameState: GameState,
  meleeRange: number = 1,
  spell?: SpellAsset
): void {
  const { dx, dy } = getDirectionOffset(character.facing);
  const damage = attackData.damage ?? 1;

  // Determine which sprite to use for attack visual (shows on all targeted tiles)
  // Priority: spell.sprites.meleeAttack > default visual
  let attackSprite = spell?.sprites.meleeAttack;

  // Helper to check if a sprite is properly configured
  const hasValidSprite = (sprite: any) => {
    if (!sprite?.spriteData) return false;
    const data = sprite.spriteData;
    return data.shape || data.idleImageData || data.spriteSheet;
  };

  // If no dedicated attack sprite configured, use a default attack visual
  // This ensures melee attacks are ALWAYS visible on targeted tiles
  if (!hasValidSprite(attackSprite)) {
    attackSprite = {
      type: 'inline',
      spriteData: {
        shape: 'star',
        primaryColor: '#ffcc00',
        type: 'simple'
      }
    };
  }

  const skipCasterTile = spell?.skipSpriteOnCasterTile || false;

  // Check if the caster is an enemy (attacking characters) or a character (attacking enemies)
  const isEnemyCaster = gameState.puzzle.enemies.some(e => e.enemyId === character.characterId);

  // Handle range 0 as self-target
  if (meleeRange === 0) {
    // Show attack sprite on caster's tile if not skipped
    if (attackSprite && !skipCasterTile) {
      spawnParticle(character.x, character.y, attackSprite, attackData.effectDuration || 300, gameState, character.facing);
    }

    if (isEnemyCaster) {
      // Enemy attacking characters on same tile
      const targetChar = gameState.placedCharacters.find(
        c => c.x === character.x && c.y === character.y && !c.dead
      );

      if (targetChar) {
        applyDamageToEntity(targetChar, damage);

        // Apply status effect if spell has one configured
        if (spell && !targetChar.dead) {
          applyStatusEffectFromSpell(targetChar, spell, character.characterId, true, gameState.currentTurn);
        }

        if (attackData.hitEffectSprite) {
          spawnParticle(character.x, character.y, attackData.hitEffectSprite, attackData.effectDuration || 300, gameState, character.facing);
        }
      }
    } else {
      // Character attacking enemies on same tile
      const enemy = gameState.puzzle.enemies.find(
        e => e.x === character.x && e.y === character.y && !e.dead
      );

      if (enemy) {
        applyDamageToEntity(enemy, damage);

        // Apply status effect if spell has one configured
        if (spell && !enemy.dead) {
          applyStatusEffectFromSpell(enemy, spell, character.characterId, false, gameState.currentTurn);
        }

        if (attackData.hitEffectSprite) {
          spawnParticle(character.x, character.y, attackData.hitEffectSprite, attackData.effectDuration || 300, gameState, character.facing);
        }
      }
    }
    return;
  }

  // For range >= 1, show attack sprites and deal damage
  for (let i = 1; i <= meleeRange; i++) {
    const targetX = character.x + dx * i;
    const targetY = character.y + dy * i;

    // Stop if out of bounds
    if (!isInBounds(targetX, targetY, gameState.puzzle.width, gameState.puzzle.height)) {
      break;
    }

    // Show attack sprite on this tile (simultaneously on all tiles)
    if (attackSprite) {
      spawnParticle(targetX, targetY, attackSprite, attackData.effectDuration || 300, gameState, character.facing);
    }

    if (isEnemyCaster) {
      // Enemy attacking characters
      const targetChar = gameState.placedCharacters.find(
        c => c.x === targetX && c.y === targetY && !c.dead
      );

      if (targetChar) {
        applyDamageToEntity(targetChar, damage);

        // Apply status effect if spell has one configured
        if (spell && !targetChar.dead) {
          applyStatusEffectFromSpell(targetChar, spell, character.characterId, true, gameState.currentTurn);
        }

        if (attackData.hitEffectSprite) {
          spawnParticle(targetX, targetY, attackData.hitEffectSprite, attackData.effectDuration || 300, gameState, character.facing);
        }
      }
    } else {
      // Character attacking enemies
      const enemy = gameState.puzzle.enemies.find(
        e => e.x === targetX && e.y === targetY && !e.dead
      );

      if (enemy) {
        applyDamageToEntity(enemy, damage);

        // Apply status effect if spell has one configured
        if (spell && !enemy.dead) {
          applyStatusEffectFromSpell(enemy, spell, character.characterId, false, gameState.currentTurn);
        }

        if (attackData.hitEffectSprite) {
          spawnParticle(targetX, targetY, attackData.hitEffectSprite, attackData.effectDuration || 300, gameState, character.facing);
        }
      }
    }
  }
}

/**
 * Execute AOE attack/heal (circular area)
 */
export function executeAOEAttack(
  character: PlacedCharacter,
  attackData: CustomAttack,
  direction: Direction,
  gameState: GameState,
  spell?: SpellAsset
): void {
  const radius = attackData.aoeRadius || 2;
  const damage = attackData.damage ?? 0;
  const healing = attackData.healing ?? 0;
  const isHeal = healing > 0;

  // Check if the caster is an enemy (attacking characters) or a character (attacking enemies)
  const isEnemyCaster = gameState.puzzle.enemies.some(e => e.enemyId === character.characterId);

  // Determine center point
  let centerX = character.x;
  let centerY = character.y;

  if (!attackData.aoeCenteredOnCaster) {
    // AOE at target tile (in specified direction at range)
    const range = attackData.range || 1;
    const { dx, dy } = getDirectionOffset(direction);
    centerX = character.x + dx * range;
    centerY = character.y + dy * range;
  }

  // Apply instant damage/healing
  if (!attackData.persistDuration || attackData.persistDuration === 0) {
    if (isHeal) {
      // Heal allies in radius (characters heal characters, enemies heal enemies)
      if (isEnemyCaster) {
        // Enemy heals other enemies
        gameState.puzzle.enemies.forEach(ally => {
          if (ally.dead || ally.enemyId === character.characterId) return;

          const distance = Math.sqrt(
            Math.pow(ally.x - centerX, 2) + Math.pow(ally.y - centerY, 2)
          );

          if (distance <= radius) {
            const enemyData = getEnemy(ally.enemyId);
            ally.currentHealth = Math.min(ally.currentHealth + healing, enemyData?.health ?? ally.currentHealth);

            // Use healing effect sprite if available, fallback to hit effect
            const healSprite = attackData.healingEffectSprite || attackData.hitEffectSprite;
            if (healSprite) {
              spawnParticle(ally.x, ally.y, healSprite, attackData.effectDuration || 300, gameState);
            }
          }
        });
      } else {
        // Character heals other characters
        gameState.placedCharacters.forEach(ally => {
          if (ally.dead || ally === character) return;

          const distance = Math.sqrt(
            Math.pow(ally.x - centerX, 2) + Math.pow(ally.y - centerY, 2)
          );

          if (distance <= radius) {
            ally.currentHealth = Math.min(ally.currentHealth + healing, getCharacter(ally.characterId)?.health ?? ally.currentHealth);

            // Use healing effect sprite if available, fallback to hit effect
            const healSprite = attackData.healingEffectSprite || attackData.hitEffectSprite;
            if (healSprite) {
              spawnParticle(ally.x, ally.y, healSprite, attackData.effectDuration || 300, gameState);
            }
          }
        });
      }
    } else {
      // Damage targets in radius
      if (isEnemyCaster) {
        // Enemy damages characters
        gameState.placedCharacters.forEach(target => {
          if (target.dead) return;

          const distance = Math.sqrt(
            Math.pow(target.x - centerX, 2) + Math.pow(target.y - centerY, 2)
          );

          if (distance <= radius) {
            applyDamageToEntity(target, damage);

            // Apply status effect if spell has one configured
            if (spell && !target.dead) {
              applyStatusEffectFromSpell(target, spell, character.characterId, true, gameState.currentTurn);
            }

            if (attackData.hitEffectSprite) {
              spawnParticle(target.x, target.y, attackData.hitEffectSprite, attackData.effectDuration || 300, gameState);
            }
          }
        });
      } else {
        // Character damages enemies
        gameState.puzzle.enemies.forEach(enemy => {
          if (enemy.dead) return;

          const distance = Math.sqrt(
            Math.pow(enemy.x - centerX, 2) + Math.pow(enemy.y - centerY, 2)
          );

          if (distance <= radius) {
            applyDamageToEntity(enemy, damage);

            // Apply status effect if spell has one configured
            if (spell && !enemy.dead) {
              applyStatusEffectFromSpell(enemy, spell, character.characterId, false, gameState.currentTurn);
            }

            if (attackData.hitEffectSprite) {
              spawnParticle(enemy.x, enemy.y, attackData.hitEffectSprite, attackData.effectDuration || 300, gameState);
            }
          }
        });
      }
    }
  }

  // Create persistent area effect if duration > 0
  if (attackData.persistDuration && attackData.persistDuration > 0) {
    if (!gameState.persistentAreaEffects) {
      gameState.persistentAreaEffects = [];
    }

    const persistentEffect: PersistentAreaEffect = {
      id: `persist_${Date.now()}_${Math.random()}`,
      x: centerX,
      y: centerY,
      radius,
      damagePerTurn: attackData.persistDamagePerTurn || damage,
      turnsRemaining: attackData.persistDuration,
      visualSprite: attackData.persistVisualSprite,
      loopAnimation: true, // Persistent effects should loop by default
      excludeCenter: attackData.aoeExcludeCenter,
      sourceCharacterId: character.characterId,
    };

    gameState.persistentAreaEffects.push(persistentEffect);
  }

  // Spawn AOE effect particles on all affected tiles (instant visual effect when cast)
  if (attackData.aoeEffectSprite) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const tileX = centerX + dx;
        const tileY = centerY + dy;

        // Check if within radius (circular)
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > radius) continue;

        // Skip center tile if excludeCenter is set
        if (attackData.aoeExcludeCenter && dx === 0 && dy === 0) continue;

        // Check if tile is within puzzle bounds
        if (tileX < 0 || tileX >= gameState.puzzle.width ||
            tileY < 0 || tileY >= gameState.puzzle.height) continue;

        // Check if tile is not a wall or void
        const tile = gameState.puzzle.tiles[tileY]?.[tileX];
        if (!tile || tile.type === 'wall') continue;

        // Spawn effect particle on this tile
        spawnParticle(tileX, tileY, attackData.aoeEffectSprite, attackData.effectDuration || 500, gameState);
      }
    }
  }
}

/**
 * Execute heal action
 */
function executeHeal(
  character: PlacedCharacter,
  attackData: CustomAttack,
  gameState: GameState
): void {
  const healing = attackData.healing || 1;
  const charData = getCharacter(character.characterId);

  if (charData) {
    character.currentHealth = Math.min(
      character.currentHealth + healing,
      charData.health
    );

    // Spawn cast effect
    if (attackData.castEffectSprite) {
      spawnParticle(character.x, character.y, attackData.castEffectSprite, attackData.effectDuration || 300, gameState);
    }
  }
}

/**
 * Spawn a particle effect
 * @param direction Optional direction for directional sprites (melee attacks)
 */
function spawnParticle(
  x: number,
  y: number,
  sprite: any,
  duration: number,
  gameState: GameState,
  direction?: Direction
): void {
  if (!gameState.activeParticles) {
    gameState.activeParticles = [];
  }

  const particle: ParticleEffect = {
    id: `particle_${Date.now()}_${Math.random()}`,
    sprite,
    x,
    y,
    startTime: Date.now(),
    duration,
    alpha: 1.0,
    rotation: direction, // Store direction for rotation calculation in rendering
  };

  gameState.activeParticles.push(particle);
}

// ==========================================
// STATUS EFFECT APPLICATION
// ==========================================

/**
 * Apply a status effect to an entity from a spell
 */
function applyStatusEffectFromSpell(
  target: PlacedCharacter | PlacedEnemy,
  spell: SpellAsset,
  sourceId: string,
  sourceIsEnemy: boolean,
  currentTurn: number
): void {
  const effectConfig = spell.appliesStatusEffect;
  if (!effectConfig || !effectConfig.statusAssetId) return;

  const effectAsset = loadStatusEffectAsset(effectConfig.statusAssetId);
  if (!effectAsset) {
    console.warn(`Status effect asset not found: ${effectConfig.statusAssetId}`);
    return;
  }

  // Check apply chance
  const applyChance = effectConfig.applyChance ?? 1;
  if (Math.random() > applyChance) {
    return;
  }

  // Initialize status effects array if needed
  if (!target.statusEffects) {
    target.statusEffects = [];
  }

  // Check for existing effect of same type for stacking
  const existingEffect = target.statusEffects.find(
    e => e.type === effectAsset.type || e.statusAssetId === effectConfig.statusAssetId
  );

  const duration = effectConfig.durationOverride ?? effectAsset.defaultDuration ?? 3;
  const value = effectConfig.valueOverride ?? effectAsset.defaultValue;

  if (existingEffect) {
    switch (effectAsset.stackingBehavior) {
      case 'refresh':
        // Just refresh duration
        existingEffect.duration = duration;
        return;

      case 'stack':
        // Increase stack count up to max
        const maxStacks = effectAsset.maxStacks ?? 5;
        existingEffect.currentStacks = Math.min(
          (existingEffect.currentStacks ?? 1) + 1,
          maxStacks
        );
        existingEffect.duration = duration;
        return;

      case 'highest':
        // Keep the stronger effect
        if (value !== undefined && value > (existingEffect.value ?? 0)) {
          existingEffect.value = value;
          existingEffect.duration = duration;
        }
        return;

      case 'replace':
        // Remove old, add new
        target.statusEffects = target.statusEffects.filter(e => e !== existingEffect);
        break;
    }
  }

  // Create new status effect instance
  const newEffect: StatusEffectInstance = {
    id: `status_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: effectAsset.type,
    statusAssetId: effectConfig.statusAssetId,
    duration,
    value,
    currentStacks: 1,
    appliedOnTurn: currentTurn,
    sourceEntityId: sourceId,
    sourceIsEnemy,
    movementSkipCounter: 0,
  };

  target.statusEffects.push(newEffect);
}

/**
 * Helper to apply damage and handle sleep wake-up and shield absorption
 */
function applyDamageToEntity(
  target: PlacedCharacter | PlacedEnemy,
  damage: number
): void {
  let remainingDamage = damage;

  // Check for shield effects and absorb damage
  if (target.statusEffects) {
    for (const effect of target.statusEffects) {
      if (effect.type === StatusEffectType.SHIELD && remainingDamage > 0) {
        const shieldAmount = effect.value ?? 0;

        if (shieldAmount <= 0) {
          // Shield absorbs ALL damage (infinite shield)
          remainingDamage = 0;
        } else if (shieldAmount >= remainingDamage) {
          // Shield absorbs all remaining damage
          effect.value = shieldAmount - remainingDamage;
          remainingDamage = 0;
        } else {
          // Shield is depleted, remaining damage goes through
          remainingDamage -= shieldAmount;
          effect.value = 0;
          // Mark shield for removal when depleted
          effect.duration = 0;
        }
      }
    }

    // Remove depleted shields
    target.statusEffects = target.statusEffects.filter(
      e => !(e.type === StatusEffectType.SHIELD && e.duration <= 0 && (e.value ?? 0) <= 0)
    );
  }

  // Apply remaining damage after shield absorption
  if (remainingDamage > 0) {
    target.currentHealth -= remainingDamage;

    // Wake from sleep if sleeping (only if actually took damage)
    wakeFromSleep(target);
  }

  if (target.currentHealth <= 0) {
    target.dead = true;
  }
}

// ==========================================
// COLLECTIBLE PICKUP SYSTEM
// ==========================================

/**
 * Check for and process collectible pickup at a position
 * Called when any entity moves to a new tile
 */
export function processCollectiblePickup(
  entity: PlacedCharacter | PlacedEnemy,
  isEnemy: boolean,
  x: number,
  y: number,
  gameState: GameState
): void {
  const collectible = gameState.puzzle.collectibles.find(
    (c) => c.x === x && c.y === y && !c.collected
  );

  if (!collectible) return;

  // Handle legacy collectibles (backwards compatibility)
  if (collectible.type && !collectible.collectibleId) {
    // Legacy coin/gem behavior
    collectible.collected = true;
    gameState.score += collectible.scoreValue || 0;
    return;
  }

  // New collectible system
  if (!collectible.collectibleId) return;

  const collectibleData = loadCollectible(collectible.collectibleId);
  if (!collectibleData) return;

  // Check pickup permissions
  const permissions = collectibleData.pickupPermissions;
  if (isEnemy && !permissions.enemies) return;
  if (!isEnemy && !permissions.characters) return;

  // Mark as collected
  collectible.collected = true;
  collectible.collectedBy = isEnemy
    ? (entity as PlacedEnemy).enemyId
    : (entity as PlacedCharacter).characterId;
  collectible.collectedByType = isEnemy ? 'enemy' : 'character';

  // Apply all effects
  for (const effect of collectibleData.effects) {
    applyCollectibleEffect(entity, effect, isEnemy, gameState);
  }

  // Spawn particle effect for visual feedback
  spawnCollectiblePickupParticle(x, y, gameState);
}

/**
 * Apply a single collectible effect to an entity
 */
function applyCollectibleEffect(
  entity: PlacedCharacter | PlacedEnemy,
  effect: CollectibleEffectConfig,
  isEnemy: boolean,
  gameState: GameState
): void {
  switch (effect.type) {
    case 'score':
      // Only characters contribute to score
      if (!isEnemy) {
        gameState.score += effect.scoreValue ?? 0;
      }
      break;

    case 'status_effect':
      if (effect.statusAssetId) {
        applyStatusEffectFromCollectible(
          entity,
          effect.statusAssetId,
          effect.statusDuration,
          effect.statusValue,
          gameState.currentTurn
        );
      }
      break;

    case 'win_key':
      // Win keys are tracked via the collected state
      // Win condition checker will scan for uncollected win_key collectibles
      break;

    case 'heal':
      const maxHealth = isEnemy
        ? getEnemy((entity as PlacedEnemy).enemyId)?.health ?? entity.currentHealth
        : getCharacter((entity as PlacedCharacter).characterId)?.health ?? entity.currentHealth;
      entity.currentHealth = Math.min(entity.currentHealth + (effect.amount ?? 0), maxHealth);
      break;

    case 'damage':
      entity.currentHealth -= effect.amount ?? 0;
      wakeFromSleep(entity);
      if (entity.currentHealth <= 0) {
        entity.dead = true;
      }
      break;
  }
}

/**
 * Apply status effect from collectible (reuses spell pattern)
 */
function applyStatusEffectFromCollectible(
  target: PlacedCharacter | PlacedEnemy,
  statusAssetId: string,
  durationOverride?: number,
  valueOverride?: number,
  currentTurn: number = 0
): void {
  const effectAsset = loadStatusEffectAsset(statusAssetId);
  if (!effectAsset) {
    console.warn(`Status effect asset not found: ${statusAssetId}`);
    return;
  }

  // Initialize status effects array if needed
  if (!target.statusEffects) {
    target.statusEffects = [];
  }

  // Check for existing effect (same stacking logic as spells)
  const existingEffect = target.statusEffects.find(
    e => e.statusAssetId === statusAssetId
  );

  const duration = durationOverride ?? effectAsset.defaultDuration ?? 3;
  const value = valueOverride ?? effectAsset.defaultValue;

  if (existingEffect) {
    switch (effectAsset.stackingBehavior) {
      case 'refresh':
        existingEffect.duration = duration;
        return;
      case 'stack':
        const maxStacks = effectAsset.maxStacks ?? 5;
        existingEffect.currentStacks = Math.min(
          (existingEffect.currentStacks ?? 1) + 1,
          maxStacks
        );
        existingEffect.duration = duration;
        return;
      case 'highest':
        if (value !== undefined && value > (existingEffect.value ?? 0)) {
          existingEffect.value = value;
          existingEffect.duration = duration;
        }
        return;
      case 'replace':
        target.statusEffects = target.statusEffects.filter(e => e !== existingEffect);
        break;
    }
  }

  // Create new status effect instance
  const newEffect: StatusEffectInstance = {
    id: `status_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: effectAsset.type,
    statusAssetId: statusAssetId,
    duration,
    value,
    currentStacks: 1,
    appliedOnTurn: currentTurn,
    sourceEntityId: 'collectible',
    sourceIsEnemy: false,
    movementSkipCounter: 0,
  };

  target.statusEffects.push(newEffect);
}

/**
 * Spawn visual particle for collectible pickup
 */
function spawnCollectiblePickupParticle(
  x: number,
  y: number,
  gameState: GameState
): void {
  if (!gameState.activeParticles) {
    gameState.activeParticles = [];
  }

  gameState.activeParticles.push({
    id: `collectible_pickup_${Date.now()}`,
    sprite: {
      type: 'inline',
      spriteData: {
        shape: 'star',
        primaryColor: '#ffd700',
        type: 'simple'
      }
    },
    x,
    y,
    startTime: Date.now(),
    duration: 300,
    scale: 1.5,
    alpha: 1,
  });
}

// ==========================================
// AUTO-TARGETING SYSTEM (Phase 2)
// ==========================================

/**
 * Find the nearest living enemies to an entity, up to maxTargets
 * Returns array of {enemy, direction} sorted by distance (closest first)
 * Excludes the entity itself if it's an enemy (when an enemy targets other enemies)
 */
function findNearestEnemies(
  character: PlacedCharacter,
  gameState: GameState,
  maxTargets: number = 1,
  mode: 'omnidirectional' | 'cardinal' | 'diagonal' = 'omnidirectional'
): Array<{ enemy: any; direction: Direction; distance: number }> {
  // Exclude the entity itself if it's an enemy (important when an enemy targets other enemies)
  const livingEnemies = gameState.puzzle.enemies.filter(e => !e.dead && e.enemyId !== character.characterId);

  // Cardinal directions: N, S, E, W
  const cardinalDirections: Direction[] = [Direction.NORTH, Direction.SOUTH, Direction.EAST, Direction.WEST];

  // Diagonal directions: NE, SE, SW, NW
  const diagonalDirections: Direction[] = [Direction.NORTHEAST, Direction.SOUTHEAST, Direction.SOUTHWEST, Direction.NORTHWEST];

  // Calculate distance and direction to each enemy
  const enemiesWithDistance = livingEnemies.map(enemy => ({
    enemy,
    distance: calculateDistance(character.x, character.y, enemy.x, enemy.y),
    direction: calculateDirectionTo(character.x, character.y, enemy.x, enemy.y),
  }));

  // Filter by directional mode
  let filteredEnemies = enemiesWithDistance;
  if (mode === 'cardinal') {
    filteredEnemies = enemiesWithDistance.filter(e => cardinalDirections.includes(e.direction));
  } else if (mode === 'diagonal') {
    filteredEnemies = enemiesWithDistance.filter(e => diagonalDirections.includes(e.direction));
  }

  // Sort by distance (closest first)
  filteredEnemies.sort((a, b) => a.distance - b.distance);

  // Return up to maxTargets
  return filteredEnemies.slice(0, maxTargets);
}

/**
 * Find the nearest living characters to an entity, up to maxTargets
 * Returns array of {character, direction} sorted by distance (closest first)
 * Excludes the casting entity itself if it's a character
 */
function findNearestCharacters(
  entity: PlacedCharacter,
  gameState: GameState,
  maxTargets: number = 1,
  mode: 'omnidirectional' | 'cardinal' | 'diagonal' = 'omnidirectional'
): Array<{ character: PlacedCharacter; direction: Direction; distance: number }> {
  // Exclude the casting entity itself (important when a character targets other characters)
  const livingCharacters = gameState.placedCharacters.filter(c => !c.dead && c !== entity);

  // Cardinal directions: N, S, E, W
  const cardinalDirections: Direction[] = [Direction.NORTH, Direction.SOUTH, Direction.EAST, Direction.WEST];

  // Diagonal directions: NE, SE, SW, NW
  const diagonalDirections: Direction[] = [Direction.NORTHEAST, Direction.SOUTHEAST, Direction.SOUTHWEST, Direction.NORTHWEST];

  // Calculate distance and direction to each character
  const charactersWithDistance = livingCharacters.map(char => {
    const direction = calculateDirectionTo(entity.x, entity.y, char.x, char.y);
    console.log('[SPELL DEBUG] findNearestCharacters: entity at', entity.x, entity.y, 'target at', char.x, char.y, 'direction:', direction);
    return {
      character: char,
      distance: calculateDistance(entity.x, entity.y, char.x, char.y),
      direction,
    };
  });

  // Filter by directional mode
  let filteredCharacters = charactersWithDistance;
  if (mode === 'cardinal') {
    filteredCharacters = charactersWithDistance.filter(c => cardinalDirections.includes(c.direction));
  } else if (mode === 'diagonal') {
    filteredCharacters = charactersWithDistance.filter(c => diagonalDirections.includes(c.direction));
  }

  // Sort by distance (closest first)
  filteredCharacters.sort((a, b) => a.distance - b.distance);

  // Return up to maxTargets
  return filteredCharacters.slice(0, maxTargets);
}

// ==========================================
// TRIGGER SYSTEM (Phase 2)
// ==========================================

/**
 * Check if a trigger condition is met for a character
 */
export function checkTriggerCondition(
  character: PlacedCharacter,
  event: TriggerEvent,
  eventRange: number | undefined,
  gameState: GameState
): boolean {
  switch (event) {
    case 'enemy_adjacent':
      // Check if any enemy is within 1 tile (adjacent, including diagonals)
      return gameState.puzzle.enemies.some(enemy => {
        if (enemy.dead) return false;
        const distance = calculateDistance(character.x, character.y, enemy.x, enemy.y);
        return distance <= 1.42; // sqrt(2) for diagonal adjacency
      });

    case 'enemy_in_range':
      // Check if any enemy is within specified range
      const enemyRange = eventRange || 3; // Default to 3 if not specified
      return gameState.puzzle.enemies.some(enemy => {
        if (enemy.dead) return false;
        const distance = calculateDistance(character.x, character.y, enemy.x, enemy.y);
        return distance <= enemyRange;
      });

    case 'contact_with_enemy':
      // Check if character is on the same tile as an enemy
      return gameState.puzzle.enemies.some(enemy => {
        if (enemy.dead) return false;
        return enemy.x === character.x && enemy.y === character.y;
      });

    case 'character_adjacent':
      // Check if any character is within 1 tile (adjacent, including diagonals)
      // Used by enemies to detect nearby characters
      return gameState.placedCharacters.some(char => {
        if (char.dead) return false;
        const distance = calculateDistance(character.x, character.y, char.x, char.y);
        return distance <= 1.42; // sqrt(2) for diagonal adjacency
      });

    case 'character_in_range':
      // Check if any character is within specified range
      // Used by enemies to detect characters at a distance
      const charRange = eventRange || 3; // Default to 3 if not specified
      return gameState.placedCharacters.some(char => {
        if (char.dead) return false;
        const distance = calculateDistance(character.x, character.y, char.x, char.y);
        return distance <= charRange;
      });

    case 'contact_with_character':
      // Check if entity is on the same tile as a character
      // Used by enemies to detect characters in melee range
      return gameState.placedCharacters.some(char => {
        if (char.dead) return false;
        return char.x === character.x && char.y === character.y;
      });

    case 'wall_ahead':
      // Check if there's a wall in front of the character
      const { dx, dy } = getDirectionOffset(character.facing);
      const checkX = character.x + dx;
      const checkY = character.y + dy;

      if (!isInBounds(checkX, checkY, gameState.puzzle.width, gameState.puzzle.height)) {
        return true;
      }

      const tile = gameState.puzzle.tiles[checkY]?.[checkX];
      return !tile || tile.type === TileType.WALL;

    case 'health_below_50':
      // Check if character health is below 50%
      const charData = getCharacter(character.characterId);
      if (!charData) return false;
      return character.currentHealth < charData.health * 0.5;

    default:
      console.warn(`Unknown trigger event: ${event}`);
      return false;
  }
}

/**
 * Evaluate all triggers for a character or enemy after movement and execute matching actions
 * This should be called AFTER a character/enemy moves to their ending position
 */
export function evaluateTriggers(
  character: PlacedCharacter,
  gameState: GameState
): void {
  // Try to get character data first, then fall back to enemy data
  const charData = getCharacter(character.characterId);
  const enemyData = !charData ? getEnemy(character.characterId) : null;

  // Get the behavior array from character or enemy
  let behaviorActions: CharacterAction[] | undefined;
  let entityType: 'character' | 'enemy' = 'character';

  if (charData?.behavior) {
    behaviorActions = charData.behavior;
    entityType = 'character';
  } else if (enemyData?.behavior?.pattern) {
    behaviorActions = enemyData.behavior.pattern;
    entityType = 'enemy';
  }

  if (!behaviorActions) {
    return;
  }

  // Check each action for event-based triggers
  behaviorActions.forEach((action: CharacterAction) => {
    if (action.trigger?.mode === 'on_event' && action.trigger.event) {
      const triggered = checkTriggerCondition(
        character,
        action.trigger.event,
        action.trigger.eventRange,
        gameState
      );

      if (triggered) {
        // For proximity-based triggers, automatically enable targeting toward the trigger source
        // This ensures spells fire at the adjacent/nearby entity that triggered the event
        let actionToExecute = action;
        const event = action.trigger.event;

        if (event === 'character_adjacent' || event === 'character_in_range' || event === 'contact_with_character') {
          // Enemy triggered by character proximity - auto-target nearest character
          if (!action.autoTargetNearestCharacter && !action.autoTargetNearestEnemy) {
            actionToExecute = { ...action, autoTargetNearestCharacter: true };
          }
        } else if (event === 'enemy_adjacent' || event === 'enemy_in_range' || event === 'contact_with_enemy') {
          // Character triggered by enemy proximity - auto-target nearest enemy
          if (!action.autoTargetNearestEnemy && !action.autoTargetNearestCharacter) {
            actionToExecute = { ...action, autoTargetNearestEnemy: true };
          }
        }

        const updatedCharacter = executeAction(character, actionToExecute, gameState);
        Object.assign(character, updatedCharacter);
      }
    }
  });
}
