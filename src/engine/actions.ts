import type {
  CharacterAction,
  PlacedCharacter,
  GameState,
  WallCollisionBehavior,
  CustomAttack,
  Projectile,
  ParticleEffect,
  PersistentAreaEffect,
  SpellAsset,
  RelativeDirection,
} from '../types/game';
import {
  ActionType,
  Direction,
  TileType,
  AttackPattern,
  SpellTemplate,
} from '../types/game';
import { getCharacter } from '../data/characters';
import { getEnemy } from '../data/enemies';
import { getDirectionOffset, turnLeft, turnRight, turnAround, isInBounds } from './utils';
import { loadCustomAttack, loadSpellAsset } from '../utils/assetStorage';

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

  // Normalize action type - handle both enum keys and values
  const normalizedType = normalizeActionType(action.type);

  switch (normalizedType) {
    case ActionType.MOVE_FORWARD:
      return moveCharacter(updatedCharacter, character.facing, gameState, action.tilesPerMove || 1, action.onWallCollision ?? 'stop', action.turnDegrees ?? 90);

    case ActionType.MOVE_BACKWARD:
      const backwardDir = turnAround(character.facing);
      return moveCharacter(updatedCharacter, backwardDir, gameState, action.tilesPerMove || 1, action.onWallCollision ?? 'stop', action.turnDegrees ?? 90);

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
      executeSpell(updatedCharacter, action, gameState);
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
  onWallCollision: WallCollisionBehavior = 'stop',
  turnDegrees: 45 | 90 = 90
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
      // Check if this is an enemy trying to move into another enemy (no combat, just block)
      const isEnemyMoving = getEnemy(updatedChar.characterId) !== undefined;

      if (isEnemyMoving) {
        // Enemy-to-enemy collision: just wait, don't move, don't fight
        return updatedChar;
      }

      // Combat: Character attacks enemy (player initiative)
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
            // Use retaliationDamage if set, otherwise use regular attackDamage
            const damageToApply = enemyData.retaliationDamage !== undefined
              ? enemyData.retaliationDamage
              : enemyData.attackDamage;
            updatedChar.currentHealth -= damageToApply;
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
  const isWallLikeCharacter = blockingCharacter ?
    getCharacter(blockingCharacter.characterId)?.blocksMovementAlive : false;

  // Check for blocking dead enemy
  const blockingDeadEnemy = gameState.puzzle.enemies.find(
    (e) => e.x === checkX && e.y === checkY && e.dead
  );
  const isBlockingCorpse = blockingDeadEnemy ?
    getEnemy(blockingDeadEnemy.enemyId)?.blocksMovementDead : false;

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
      executeMeleeAttack(character, attackData, gameState);
      break;

    case AttackPattern.AOE_CIRCLE:
      executeAOEAttack(character, attackData, gameState);
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

  // Determine which directions to cast the spell
  let castDirections: Direction[] = [];

  if (action.useRelativeOverride && action.relativeDirectionOverride && action.relativeDirectionOverride.length > 0) {
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
  for (const direction of castDirections) {
    executeSpellInDirection(character, spell, direction, gameState);
  }
}

/**
 * Execute spell in a specific direction
 */
function executeSpellInDirection(
  character: PlacedCharacter,
  spell: SpellAsset,
  direction: Direction,
  gameState: GameState
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
    persistDuration: spell.persistDuration,
    persistDamagePerTurn: spell.persistDamagePerTurn,
    persistVisualSprite: spell.sprites.persistentArea,
    projectileSprite: spell.sprites.projectile,
    hitEffectSprite: spell.sprites.damageEffect,
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
      executeMeleeAttack(character, attackData, gameState);
      character.facing = originalFacing;
      break;

    case SpellTemplate.RANGE_LINEAR:
    case SpellTemplate.MAGIC_LINEAR:
      attackData.pattern = AttackPattern.PROJECTILE;
      // Temporarily set character facing for projectile direction
      const origFacing = character.facing;
      character.facing = direction;
      spawnProjectile(character, attackData, gameState);
      character.facing = origFacing;
      break;

    case SpellTemplate.AOE:
      attackData.pattern = AttackPattern.AOE_CIRCLE;
      executeAOEAttack(character, attackData, gameState);
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
  gameState: GameState
): void {
  if (!gameState.activeProjectiles) {
    gameState.activeProjectiles = [];
  }

  const range = attackData.range || 10; // Default max range
  const speed = attackData.projectileSpeed || 5; // Tiles per second

  // Calculate target position (max range in facing direction)
  const { dx, dy } = getDirectionOffset(character.facing);
  const targetX = character.x + dx * range;
  const targetY = character.y + dy * range;

  // Determine if source is an enemy or character
  const isEnemy = gameState.puzzle.enemies.some(e => e.enemyId === character.characterId);

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
    sourceCharacterId: isEnemy ? undefined : character.characterId,
    sourceEnemyId: isEnemy ? character.characterId : undefined,
  };

  gameState.activeProjectiles.push(projectile);

  // Spawn cast effect if configured
  if (attackData.castEffectSprite) {
    spawnParticle(character.x, character.y, attackData.castEffectSprite, attackData.effectDuration || 300, gameState);
  }
}

/**
 * Execute melee attack (instant, no projectile)
 */
function executeMeleeAttack(
  character: PlacedCharacter,
  attackData: CustomAttack,
  gameState: GameState
): void {
  const { dx, dy } = getDirectionOffset(character.facing);
  const targetX = character.x + dx;
  const targetY = character.y + dy;

  // Find enemy at target position
  const enemy = gameState.puzzle.enemies.find(
    e => e.x === targetX && e.y === targetY && !e.dead
  );

  if (enemy) {
    const damage = attackData.damage ?? 1;
    enemy.currentHealth -= damage;

    if (enemy.currentHealth <= 0) {
      enemy.dead = true;
    }

    // Spawn hit effect
    if (attackData.hitEffectSprite) {
      spawnParticle(targetX, targetY, attackData.hitEffectSprite, attackData.effectDuration || 300, gameState);
    }
  }
}

/**
 * Execute AOE attack/heal (circular area)
 */
export function executeAOEAttack(
  character: PlacedCharacter,
  attackData: CustomAttack,
  gameState: GameState
): void {
  const radius = attackData.aoeRadius || 2;
  const damage = attackData.damage ?? 0;
  const healing = attackData.healing ?? 0;
  const isHeal = healing > 0;

  // Determine center point
  let centerX = character.x;
  let centerY = character.y;

  if (!attackData.aoeCenteredOnCaster) {
    // AOE at target tile (in facing direction at range)
    const range = attackData.range || 1;
    const { dx, dy } = getDirectionOffset(character.facing);
    centerX = character.x + dx * range;
    centerY = character.y + dy * range;
  }

  // Apply instant damage/healing
  if (!attackData.persistDuration || attackData.persistDuration === 0) {
    if (isHeal) {
      // Heal allies (characters) in radius
      gameState.placedCharacters.forEach(ally => {
        if (ally.dead || ally === character) return;

        const distance = Math.sqrt(
          Math.pow(ally.x - centerX, 2) + Math.pow(ally.y - centerY, 2)
        );

        if (distance <= radius) {
          ally.currentHealth = Math.min(ally.currentHealth + healing, getCharacter(ally.characterId)?.health ?? ally.currentHealth);

          // Spawn hit effect
          if (attackData.hitEffectSprite) {
            spawnParticle(ally.x, ally.y, attackData.hitEffectSprite, attackData.effectDuration || 300, gameState);
          }
        }
      });
    } else {
      // Damage enemies in radius
      gameState.puzzle.enemies.forEach(enemy => {
        if (enemy.dead) return;

        const distance = Math.sqrt(
          Math.pow(enemy.x - centerX, 2) + Math.pow(enemy.y - centerY, 2)
        );

        if (distance <= radius) {
          enemy.currentHealth -= damage;
          if (enemy.currentHealth <= 0) {
            enemy.dead = true;
          }

          // Spawn hit effect
          if (attackData.hitEffectSprite) {
            spawnParticle(enemy.x, enemy.y, attackData.hitEffectSprite, attackData.effectDuration || 300, gameState);
          }
        }
      });
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
      sourceCharacterId: character.characterId,
    };

    gameState.persistentAreaEffects.push(persistentEffect);
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
 */
function spawnParticle(
  x: number,
  y: number,
  sprite: any,
  duration: number,
  gameState: GameState
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
  };

  gameState.activeParticles.push(particle);
}
