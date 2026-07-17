/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, no-case-declarations */
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
  ThrowPlaceConfig,
  HitStampKind,
  HitStamps,
  HitStampWindow,
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
import { getDirectionOffset, turnLeft, turnRight, turnAround, isInBounds, calculateDistance, calculateDirectionTo, isAttackFromBehind, isEntityFunctional } from './utils';
import { loadSpellAsset, loadTileType, loadStatusEffectAsset, loadCollectible } from '../utils/assetStorage';
import { isEntityCharmed, effectiveParty, entityParty, isAttackTarget, combatId } from './party';
import { spawnEnemyMidGame } from './spawning';
import type { EntityParty } from '../types/game';
import type { CollectibleEffectConfig, PlacedCollectible } from '../types/game';
import { canEntityAct, canEntityCastSpell, canEntityMove, hasHasteBonus, isHomingDebug, handleEntityDeathDrop, applyInstantStatusStrip } from './simulation';
import { wakeFromSleep } from './simulation';

// ── Trait helpers ────────────────────────────────────────────────────────────
// These replace the old property-flag reads (canOverlapEntities, behavesLikeWall, etc.)
// by checking the placed entity's live statusEffects array instead.

function hasTraitType(entity: PlacedCharacter | PlacedEnemy, ...types: StatusEffectType[]): boolean {
  return entity.statusEffects?.some(e => types.includes(e.type)) ?? false;
}

const isGhost      = (e: PlacedCharacter | PlacedEnemy) => hasTraitType(e, StatusEffectType.GHOST);
const isWallAlive  = (e: PlacedCharacter | PlacedEnemy) => hasTraitType(e, StatusEffectType.WALL_ALIVE, StatusEffectType.WALL_BOTH);
const isWallDead   = (e: PlacedCharacter | PlacedEnemy) => hasTraitType(e, StatusEffectType.WALL_DEAD,  StatusEffectType.WALL_BOTH);
const isHaltAlive  = (e: PlacedCharacter | PlacedEnemy) => hasTraitType(e, StatusEffectType.HALT_ALIVE, StatusEffectType.HALT_BOTH);
const isHaltDead   = (e: PlacedCharacter | PlacedEnemy) => hasTraitType(e, StatusEffectType.HALT_DEAD,  StatusEffectType.HALT_BOTH);
const isSturdy     = (e: PlacedCharacter | PlacedEnemy) => hasTraitType(e, StatusEffectType.STURDY);

// ─────────────────────────────────────────────────────────────────────────────

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
 * Normalize action type - handles both enum keys (e.g., "MOVE_FORWARD")
 * and enum values (e.g., "move_forward")
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
    'FACE_DIRECTION': ActionType.FACE_DIRECTION,
    'SPELL': ActionType.SPELL,
    'IF_WALL': ActionType.IF_WALL,
    'IF_ENEMY': ActionType.IF_ENEMY,
    'WAIT': ActionType.WAIT,
    'TELEPORT': ActionType.TELEPORT,
    'DEPART': ActionType.DEPART,
    'REPEAT': ActionType.REPEAT,
    'REPEAT_UNTIL': ActionType.REPEAT_UNTIL,
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

  if (isMovementAction && !canEntityMove(character, gameState.currentTurn)) {
    // Slow effect or Thorns/Trample movement halt - skip this movement
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

    // Strafes: move perpendicular to facing WITHOUT turning. These enum
    // values were always offered in the behavior editor but had no case
    // here — they fell to the default warn and silently did nothing
    // (found during the 2026-07 engine audit, fixed 2026-07-12).
    case ActionType.MOVE_LEFT:
    case ActionType.MOVE_RIGHT: {
      const strafe = (facing: Direction) =>
        normalizedType === ActionType.MOVE_LEFT ? turnLeft(facing, 90) : turnRight(facing, 90);
      let movedCharacter = moveCharacter(updatedCharacter, strafe(character.facing), gameState, action.tilesPerMove || 1, action.onWallCollision ?? 'stop', action.turnDegrees ?? 90);
      // Haste bonus, like the other movement actions
      if (hasHasteBonus(movedCharacter)) {
        movedCharacter = moveCharacter(movedCharacter, strafe(movedCharacter.facing), gameState, action.tilesPerMove || 1, action.onWallCollision ?? 'stop', action.turnDegrees ?? 90);
      }
      return movedCharacter;
    }

    // Diagonals: move on the ABSOLUTE compass diagonal, facing unchanged.
    case ActionType.MOVE_DIAGONAL_NE:
    case ActionType.MOVE_DIAGONAL_NW:
    case ActionType.MOVE_DIAGONAL_SE:
    case ActionType.MOVE_DIAGONAL_SW: {
      const diagDir =
        normalizedType === ActionType.MOVE_DIAGONAL_NE ? Direction.NORTHEAST :
        normalizedType === ActionType.MOVE_DIAGONAL_NW ? Direction.NORTHWEST :
        normalizedType === ActionType.MOVE_DIAGONAL_SE ? Direction.SOUTHEAST :
        Direction.SOUTHWEST;
      let movedCharacter = moveCharacter(updatedCharacter, diagDir, gameState, action.tilesPerMove || 1, action.onWallCollision ?? 'stop', action.turnDegrees ?? 90);
      if (hasHasteBonus(movedCharacter)) {
        movedCharacter = moveCharacter(movedCharacter, diagDir, gameState, action.tilesPerMove || 1, action.onWallCollision ?? 'stop', action.turnDegrees ?? 90);
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

    case ActionType.FACE_DIRECTION: {
      if (action.faceTarget) {
        // Face the nearest hero/enemy, snapped to the 8 compass directions.
        // The names are ABSOLUTE teams, routed through the team-relative
        // finder off the actor's BASE party (engine/party.ts) so charm
        // keeps flipping the result the way it always has — a charmed
        // actor's "enemies" are its own base team. Stealthed entities on
        // the opposing side can't be faced (stealth baseline 2026-07-11).
        // If no valid target is in range, facing is left unchanged.
        const range = action.faceTargetRange ?? 0;
        const wantHero = action.faceTarget === 'nearest_hero';
        const actorBaseIsHero = entityParty(updatedCharacter, gameState) === 'hero';
        const faceTeam: 'opposing' | 'same' = wantHero === actorBaseIsHero ? 'same' : 'opposing';
        const nearest = findNearestTeamMembers(updatedCharacter, gameState, faceTeam, 1, 'omnidirectional', range);
        if (nearest.length > 0) {
          updatedCharacter.facing = nearest[0].direction;
        }
      } else if (action.faceDirection !== undefined) {
        updatedCharacter.facing = action.faceDirection;
      }
      return updatedCharacter;
    }

    case ActionType.WAIT:
      // Do nothing
      return updatedCharacter;

    case ActionType.DEPART:
      // Passerby departure (2026-07-17): the entity leaves the board on its
      // own terms. NOT a death (summon-expiry semantics): no drops, no death
      // triggers, no corpse — but dead+despawned so win checks settle and
      // the tile frees immediately (diedOnTurn deliberately stays unset).
      // departedOnTurn is the render hook: the board plays a full-opacity
      // walk-out to the nearest opening (the escape ghost machinery).
      // Stun/sleep already gate this via canEntityAct above — a disabled
      // passerby can't slip away.
      updatedCharacter.dead = true;
      updatedCharacter.despawned = true;
      updatedCharacter.departedOnTurn = gameState.currentTurn;
      return updatedCharacter;

    case ActionType.IF_WALL:
      return handleIfWall(updatedCharacter, action, gameState);

    case ActionType.REPEAT:
    case ActionType.REPEAT_UNTIL:
      // Control-flow actions are handled at the simulation level, not here
      return updatedCharacter;

    case ActionType.SPELL:
      // Mark this turn as a cast for the casting animation (visual only, per-turn).
      updatedCharacter.isCasting = true;
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
 * Check if a tile is active, considering both cadence AND override state from trigger groups
 * This is the preferred function to use when checking tile active state in gameplay
 */
export function isTileActive(tile: Tile, gameState: GameState): boolean {
  // Check for override state from pressure plate trigger groups
  const tileState = gameState.tileStates?.get(`${tile.x},${tile.y}`);
  if (tileState?.overrideState) {
    return tileState.overrideState === 'on';
  }

  // No override - check cadence
  if (!tile.customTileTypeId) return true;

  const customTileType = loadTileType(tile.customTileTypeId);
  if (!customTileType?.cadence?.enabled) return true;

  return isTileActiveOnTurn(customTileType.cadence, gameState.currentTurn);
}

/**
 * True during the turn on which the entity's visual death plays.
 * `diedOnTurn` is stamped to represent that turn directly:
 *   - Immediate deaths stamp `currentTurn` (visual plays same turn).
 *   - Deferred (projectile-pending) deaths stamp `currentTurn + 1` (visual
 *     plays next turn when the bolt arrives).
 * So the uniform rule is: block while `currentTurn === diedOnTurn`, and
 * let the tile free up the turn after. Movement blockers use this to
 * defeat the race where the deferred pending→dead visual commit can land
 * on different sides of executeTurn between runs — both paths converge
 * on "tile blocked during the visual-death turn" regardless of which
 * side of the race won, because either pending (not yet committed) or
 * fresh-dead (committed) blocks.
 */
export function isFreshlyDead(
  entity: PlacedCharacter | PlacedEnemy,
  currentTurn: number
): boolean {
  return !!entity.dead &&
         entity.diedOnTurn !== undefined &&
         currentTurn <= entity.diedOnTurn;
}

/**
 * Check if a tile blocks movement, considering:
 * - Static TileType.WALL
 * - Custom tile baseType === 'wall' (with cadence awareness)
 * - Custom tile onStateBlocksMovement (blocks when active/on)
 * - Null/void tiles
 */
export function isTileBlockingMovement(
  tile: Tile | null | undefined,
  gameState: GameState
): boolean {
  if (!tile) return true; // void/null treated as wall
  if (tile.type === TileType.WALL) return true;

  if (tile.customTileTypeId) {
    const customType = loadTileType(tile.customTileTypeId);
    if (!customType) return false;

    const isActive = isTileActive(tile, gameState);

    // Static wall base type: blocks when on, passable when off (if toggling)
    if (customType.baseType === 'wall') {
      if (customType.cadence?.enabled || customType.canBeTriggered) {
        return isActive;
      }
      return true; // Always wall (no toggling)
    }

    // Dynamic wall mode: empty tile that blocks when on
    if (customType.onStateBlocksMovement) {
      return isActive;
    }
  }

  return false;
}

/**
 * Run a list of tile behaviors on a character.
 * Shared by both on-state and off-state processing.
 */
function runBehaviors(
  character: PlacedCharacter,
  tile: Tile,
  behaviors: TileBehaviorConfig[],
  movementDirection: Direction,
  gameState: GameState
): PlacedCharacter {
  let updatedChar = { ...character };

  for (const behavior of behaviors) {
    switch (behavior.type) {
      case 'damage':
        updatedChar = processDamageBehavior(updatedChar, tile, behavior, gameState);
        break;
      case 'teleport':
        updatedChar = processTeleportBehavior(updatedChar, tile, behavior, gameState);
        break;
      case 'direction_change': {
        if (isSteadfast(updatedChar)) break; // Steadfast prevents direction changes
        const mode = behavior.directionChangeMode || 'fixed';
        const angle = behavior.directionChangeAngle || 90;
        switch (mode) {
          case 'fixed':
            if (behavior.newFacing) {
              updatedChar.facing = behavior.newFacing;
            }
            break;
          case 'clockwise':
            updatedChar.facing = turnRight(updatedChar.facing, angle);
            break;
          case 'counter_clockwise':
            updatedChar.facing = turnLeft(updatedChar.facing, angle);
            break;
        }
        break;
      }
      case 'ice':
        updatedChar = processIceBehavior(updatedChar, movementDirection, gameState);
        break;
      case 'pressure_plate':
        processPressurePlateBehavior(tile, behavior, gameState);
        break;
    }

    if (updatedChar.dead) break;
  }

  return updatedChar;
}

/**
 * Projectile linger: an entity stepped onto its current tile — trigger any
 * live hazard lying there. Single-trigger: the walker "takes the bolt" (its
 * damage + on-hit status, drops on kill via applyDamageToEntity's guard)
 * and the hazard is consumed. Own-side entities walk over safely; hostility
 * is effective-party vs the bolt's landed side, matching the hit the bolt
 * would have dealt in flight. Runs at the same movement sites as tile
 * behaviors (main move steps, which also cover ice-slide stops and teleport
 * arrivals since those mutate x/y before this) — shared by real and
 * headless modes, so solver parity holds. Damage stamps as 'any' kind (no
 * attacker attribution), like tile damage.
 */
function processLingeringHazardsAt(
  character: PlacedCharacter,
  gameState: GameState
): PlacedCharacter {
  const hazards = gameState.lingeringHazards;
  if (!hazards || hazards.length === 0) return character;

  let updatedChar = character;
  for (const hazard of hazards) {
    if (hazard.consumed) continue;
    if (hazard.x !== updatedChar.x || hazard.y !== updatedChar.y) continue;
    if (effectiveParty(updatedChar, gameState) === (hazard.sourceParty ?? 'hero')) continue;

    hazard.consumed = true; // spent whether or not the damage got through — it's the bolt connecting
    updatedChar = { ...updatedChar };
    applyDamageToEntity(updatedChar, hazard.damage, gameState);
    if (!updatedChar.dead && hazard.spellAssetId) {
      const spell = loadSpellAsset(hazard.spellAssetId);
      if (spell) {
        applyStatusEffectFromSpell(
          updatedChar, spell,
          hazard.sourceCharacterId ?? hazard.sourceEnemyId ?? '',
          !!hazard.sourceEnemyId, gameState.currentTurn);
      }
    }
    if (hazard.hitEffectSprite) {
      spawnParticle(updatedChar.x, updatedChar.y, hazard.hitEffectSprite, 300, gameState);
    }
    if (updatedChar.dead) break;
  }
  return updatedChar;
}

/**
 * Process all tile behaviors when a character steps on a tile.
 * When tile is ON → runs normal behaviors.
 * When tile is OFF → runs offStateBehaviors (if any).
 */
function processTileBehaviors(
  character: PlacedCharacter,
  tile: Tile,
  movementDirection: Direction,
  gameState: GameState
): PlacedCharacter {
  if (!tile.customTileTypeId) return character;

  const tileType = loadTileType(tile.customTileTypeId);
  if (!tileType) return character;

  const isActive = isTileActive(tile, gameState);

  if (isActive) {
    // ON state: run normal behaviors
    if (!tileType.behaviors || tileType.behaviors.length === 0) return character;
    return runBehaviors(character, tile, tileType.behaviors, movementDirection, gameState);
  } else {
    // OFF state: run off-state behaviors if defined
    if (!tileType.offStateBehaviors || tileType.offStateBehaviors.length === 0) return character;
    return runBehaviors(character, tile, tileType.offStateBehaviors, movementDirection, gameState);
  }
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
    // Per-INSTANCE key: same-asset enemies share an enemyId (which is the
    // wrapper's characterId), so an id key let every duplicate after the
    // first cross for free (audit sweep 9). instanceKey is the executeTurn
    // loop's index-based identity; the id remains a fallback for entities
    // damaged outside the loops (e.g. setup states in tests).
    const entityKey = character.instanceKey ?? character.characterId;
    if (tileState.damagedEntities.has(entityKey)) {
      // Already damaged this entity
      return character;
    }
    tileState.damagedEntities.add(entityKey);
  }

  const updatedChar = { ...character };

  // Use centralized damage function to respect shields
  applyDamageToEntity(updatedChar, damage, gameState);

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
    if (isTileBlockingMovement(nextTile, gameState)) {
      break; // Hit wall, void, or blocking custom tile
    }

    // Check for blocking entities
    const blockingChar = gameState.placedCharacters.find(
      c => c.x === nextX && c.y === nextY && !c.dead && c !== updatedChar
    );
    if (blockingChar) {
      if (!isGhost(blockingChar)) {
        break; // Hit character
      }
    }

    const blockingEnemy = gameState.puzzle.enemies.find(
      e => e.x === nextX && e.y === nextY && !e.dead
    );
    if (blockingEnemy) {
      if (!isGhost(blockingEnemy)) {
        break; // Hit enemy
      }
    }

    // Move to next tile
    updatedChar.x = nextX;
    updatedChar.y = nextY;
    slideCount++;

    // Check if the new tile is NOT ice - stop sliding
    const newTile = gameState.puzzle.tiles[nextY]?.[nextX];
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

      case 'toggle_trigger_group':
        // Toggle or set all tiles in the same trigger group
        if (effect.targetTriggerGroupId) {
          const groupId = effect.targetTriggerGroupId;
          const isHoldMode = effect.triggerMode === 'hold';

          // Find all tiles with this trigger group ID
          for (let y = 0; y < gameState.puzzle.tiles.length; y++) {
            const row = gameState.puzzle.tiles[y];
            if (!row) continue;
            for (let x = 0; x < row.length; x++) {
              const targetTile = row[x];
              if (targetTile && targetTile.triggerGroupId === groupId) {
                const targetTileState = getTileState(gameState, x, y);

                if (isHoldMode) {
                  // Hold mode: simply set to 'on' while standing on plate
                  // (gets reset to 'off' at start of next turn by resetHeldTriggerGroups)
                  targetTileState.overrideState = 'on';
                } else {
                  // Toggle mode: flip the state
                  if (targetTileState.overrideState === 'on') {
                    targetTileState.overrideState = 'off';
                  } else if (targetTileState.overrideState === 'off') {
                    targetTileState.overrideState = 'on';
                  } else {
                    // No override yet - determine current state and toggle to opposite
                    // Check if tile has cadence by looking up its custom tile type
                    const customTileType = targetTile.customTileTypeId
                      ? loadTileType(targetTile.customTileTypeId)
                      : null;
                    const cadence = customTileType?.cadence;
                    if (cadence?.enabled) {
                      // Has cadence - toggle opposite of current cadence state
                      const currentlyOn = isTileActiveOnTurn(cadence, gameState.currentTurn);
                      targetTileState.overrideState = currentlyOn ? 'off' : 'on';
                    } else {
                      // No cadence - assume starts 'on', toggle to 'off'
                      targetTileState.overrideState = 'off';
                    }
                  }
                }
              }
            }
          }
        }
        break;
    }
  }
}

/**
 * When a stationary contact-damage holder is walked into, optionally react per its
 * effect asset config: play its cast animation (turn-stamped via contactReactionTurn
 * so it survives the enemy turn-reset) and face the incoming attacker. Facing the
 * attacker is visual-only by default (the reaction turn renders the holder facing the
 * attacker via contactReactionFacing); it only persists logically when
 * contactDamageKeepFacing is set. `holder` is a live gameState reference — mutations
 * persist. Facing is snapped to the 8 compass dirs by calculateDirectionTo.
 */
function applyContactDamageReaction(
  holder: PlacedCharacter | PlacedEnemy,
  attacker: PlacedCharacter | PlacedEnemy,
  effect: StatusEffectInstance | undefined,
  gameState: GameState
): void {
  if (!effect) return;
  const asset = loadStatusEffectAsset(effect.statusAssetId);
  if (!asset) return;

  if (asset.contactDamageAnimate) {
    const reactionFacing = asset.contactDamageFaceAttacker
      ? calculateDirectionTo(holder.x, holder.y, attacker.x, attacker.y)
      : (holder.facing ?? Direction.SOUTH);
    holder.contactReactionTurn = gameState.currentTurn;
    holder.contactReactionFacing = reactionFacing;
    if (asset.contactDamageFaceAttacker && asset.contactDamageKeepFacing) {
      holder.facing = reactionFacing; // persist the new facing (logical); otherwise it reverts (visual-only)
    }
  }

  // Borrowed hit presentation: play a spell's LANDED-HIT visuals when the
  // contact fires — the melee-attack sprite on the attacker's tile oriented
  // toward them (it's the holder striking whoever walked in), plus the
  // spell's damage effect there. Visuals only: no damage, cooldowns, or
  // mechanics are inherited.
  //
  // Resolution: the HOLDER's own visual identity wins (a golem punches, an
  // imp fireballs — even while sharing one reusable contact-damage effect,
  // or gaining contact damage mid-game from a spell); the effect asset's
  // visual is the fallback default for inherently-themed effects.
  const holderData = 'enemyId' in holder ? getEnemy(holder.enemyId) : getCharacter(holder.characterId);
  const visualSpellId = holderData?.contactHitSpellVisualId ?? asset.contactDamageSpellVisualId;
  if (visualSpellId) {
    const spell = loadSpellAsset(visualSpellId);
    if (spell) {
      const toward = calculateDirectionTo(holder.x, holder.y, attacker.x, attacker.y);
      // The bolt itself: a one-tile flight from the holder to the attacker,
      // oriented along its travel. A traveling PARTICLE, not a real
      // projectile — it can't collide, pierce, or enter the logic loop.
      // The hit visuals below hold until it arrives.
      let hitDelayMs = 0;
      if (spell.sprites?.projectile?.spriteData) {
        const FLIGHT_MS = 180;
        spawnParticle(attacker.x, attacker.y, spell.sprites.projectile, FLIGHT_MS, gameState, toward, {
          fromX: holder.x,
          fromY: holder.y,
        });
        hitDelayMs = FLIGHT_MS;
      }
      if (spell.sprites?.meleeAttack?.spriteData) {
        spawnParticle(attacker.x, attacker.y, spell.sprites.meleeAttack, 300, gameState, toward, hitDelayMs ? { delayMs: hitDelayMs } : undefined);
      }
      if (spell.sprites?.damageEffect?.spriteData) {
        spawnParticle(attacker.x, attacker.y, spell.sprites.damageEffect, 400, gameState, undefined, hitDelayMs ? { delayMs: hitDelayMs } : undefined);
      }
    }
  }
}

/**
 * A holder's contact strike against a victim, if it applies: the effect
 * must exist with positive damage and the victim must be a valid attack
 * target (holder EFFECTIVE vs victim BASE — charm moves the strike's
 * allegiance with its holder; charmed victims can still be hit by their
 * original foes).
 */
function getContactStrike(
  holder: PlacedCharacter | PlacedEnemy,
  victim: PlacedCharacter | PlacedEnemy,
  type: StatusEffectType,
  gameState: GameState
): { effect: StatusEffectInstance; damage: number } | null {
  const effect = holder.statusEffects?.find(e => e.type === type);
  if (!effect) return null;
  const damage = effect.value ?? 0;
  if (damage <= 0) return null;
  if (!isAttackTarget(holder, victim, gameState)) return null;
  return { effect, damage };
}

/** Stamp the holder's movement halt if its Thorns/Trample asset opts in. */
function applyContactHaltFlags(
  holder: PlacedCharacter | PlacedEnemy,
  effect: StatusEffectInstance,
  gameState: GameState
): void {
  const asset = loadStatusEffectAsset(effect.statusAssetId);
  if (!asset?.haltMovementOnContact) return;
  if (asset.haltMovementMode === 'forever') {
    holder.contactHaltForever = true;
  } else {
    holder.contactHaltTurn = gameState.currentTurn;
  }
}

/**
 * Walk-in collision (user design 2026-07-12): THORNS (CONTACT_DAMAGE) on
 * the defender bites hostile movers — every attempt, lethal to dumb
 * walkers by design; TRAMPLE on the mover gores hostile defenders it
 * walks into, plowing through on a kill.
 *
 * When both compete, the HERO-SIDE entity strikes first (player
 * satisfaction rule) — unless the enemy-side entity has PRIORITY, which
 * flips it: "this one is faster; you can't just plow through it."
 * Sides use EFFECTIVE party (a charmed unit carries the player's
 * initiative while it fights for them); degenerate same-side edges from
 * charm asymmetry default to the defender striking first, matching the
 * reactive spirit of thorns. Each strike fires only while both parties to
 * it are alive.
 *
 * Returns whether the mover may advance into the tile: only over a
 * trample-killed defender, and not if the mover's own halt flag stopped
 * it in place (the goring beast stays to gore).
 */
function resolveWalkInCollision(
  mover: PlacedCharacter,
  defender: PlacedCharacter | PlacedEnemy,
  gameState: GameState
): { moverMayAdvance: boolean } {
  const thorns = getContactStrike(defender, mover, StatusEffectType.CONTACT_DAMAGE, gameState);
  const trample = getContactStrike(mover, defender, StatusEffectType.TRAMPLE, gameState);
  if (!thorns && !trample) return { moverMayAdvance: false };

  const moverSide = effectiveParty(mover, gameState);
  const defenderSide = effectiveParty(defender, gameState);
  let defenderFirst = true;
  if (moverSide !== defenderSide) {
    const enemySideEntity = moverSide === 'enemy' ? mover : defender;
    const enemySideHasPriority =
      enemySideEntity.statusEffects?.some(e => e.type === StatusEffectType.PRIORITY) ?? false;
    const heroSideFirst = !enemySideHasPriority;
    defenderFirst = (defenderSide === 'hero') === heroSideFirst;
  }

  let moverHalted = false;
  const strikeThorns = () => {
    if (!thorns || defender.dead || mover.dead) return;
    applyDamageToEntity(mover, thorns.damage, gameState, defender, 'contact');
    applyContactDamageReaction(defender, mover, thorns.effect, gameState);
    applyContactHaltFlags(defender, thorns.effect, gameState);
  };
  const strikeTrample = () => {
    if (!trample || mover.dead || defender.dead) return;
    applyDamageToEntity(defender, trample.damage, gameState, mover, 'contact');
    applyContactHaltFlags(mover, trample.effect, gameState);
    if (mover.contactHaltForever || mover.contactHaltTurn === gameState.currentTurn) {
      moverHalted = true;
    }
  };

  if (defenderFirst) {
    strikeThorns();
    strikeTrample();
  } else {
    strikeTrample();
    strikeThorns();
  }

  return { moverMayAdvance: !!defender.dead && !mover.dead && !moverHalted };
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

  let willHitWall = !isInBounds(firstX, firstY, gameState.puzzle.width, gameState.puzzle.height) ||
    isTileBlockingMovement(gameState.puzzle.tiles[firstY]?.[firstX], gameState);

  // Also check for entities that behave like walls
  if (!willHitWall && isInBounds(firstX, firstY, gameState.puzzle.width, gameState.puzzle.height)) {
    // Check for living character/enemy with wall trait
    const wallCharacter = gameState.placedCharacters.find(
      (c) => c.x === firstX && c.y === firstY && !c.dead && c !== updatedChar
    );
    if (wallCharacter && isWallAlive(wallCharacter)) willHitWall = true;

    if (!willHitWall) {
      const wallEnemy = gameState.puzzle.enemies.find(
        (e) => e.x === firstX && e.y === firstY && !e.dead
      );
      if (wallEnemy && isWallAlive(wallEnemy)) willHitWall = true;
    }

    // Check for dead entity with wall-dead trait
    if (!willHitWall) {
      const deadWallEnemy = gameState.puzzle.enemies.find(
        (e) => e.x === firstX && e.y === firstY && e.dead
      );
      if (deadWallEnemy && isWallDead(deadWallEnemy)) willHitWall = true;
    }

    if (!willHitWall) {
      const deadWallChar = gameState.placedCharacters.find(
        (c) => c.x === firstX && c.y === firstY && c.dead
      );
      if (deadWallChar && isWallDead(deadWallChar)) willHitWall = true;
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

  const currentDirection = direction;

  for (let i = 0; i < tilesPerMove; i++) {
    const { dx, dy } = getDirectionOffset(currentDirection);
    const newX = updatedChar.x + dx;
    const newY = updatedChar.y + dy;

    // Check for wall conditions (includes custom tiles with wall baseType, onStateBlocksMovement, cadence)
    const isWallCollision = !isInBounds(newX, newY, gameState.puzzle.width, gameState.puzzle.height) ||
      isTileBlockingMovement(gameState.puzzle.tiles[newY]?.[newX], gameState);

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
      // Ghost mode — either entity being a ghost allows passing through
      if (isGhost(updatedChar) || isGhost(otherCharacter)) {
        updatedChar.x = newX;
        updatedChar.y = newY;
        continue;
      }

      // Check if character behaves like a wall (triggers wall collision behaviors)
      if (isWallAlive(otherCharacter)) {
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
            continue;
          case 'stop':
          default:
            return updatedChar;
        }
      }

      // Check if character halts movement (stops without triggering wall reactions)
      if (isHaltAlive(otherCharacter)) {
        return updatedChar;
      }

      // Check if the target tile is being vacated (train-like movement)
      const targetKey = `${Math.floor(newX)},${Math.floor(newY)}`;
      if (gameState.tilesBeingVacated?.has(targetKey)) {
        // Check if the other character is trying to move into OUR current tile (swap attempt)
        // This would cause them to pass through each other, which we want to prevent
        const ourCurrentKey = `${Math.floor(updatedChar.x)},${Math.floor(updatedChar.y)}`;
        const otherCharData = getCharacter(otherCharacter.characterId);

        // Calculate where the other character would move to based on their facing
        const otherOffset = getDirectionOffset(otherCharacter.facing);
        const otherTargetX = Math.floor(otherCharacter.x + otherOffset.dx);
        const otherTargetY = Math.floor(otherCharacter.y + otherOffset.dy);
        const otherTargetKey = `${otherTargetX},${otherTargetY}`;

        // If the other character is trying to move into our tile, block (swap attempt)
        if (otherTargetKey === ourCurrentKey) {
          // Both trying to swap tiles - block this move (head-on bump:
          // thorns/trample still resolve; the other side gets its own
          // resolution when ITS move processes)
          const swapCollision = resolveWalkInCollision(updatedChar, otherCharacter, gameState);
          if (swapCollision.moverMayAdvance) {
            // Trample-killed mid-swap: plow into the tile. (Pickup/tile
            // processing is skipped for this step — character-shaped
            // defenders are a rare trample target; revisit if it matters.)
            updatedChar.x = newX;
            updatedChar.y = newY;
            continue;
          }
          return updatedChar;
        }

        // The character at this tile is moving away (not toward us) - allow train behavior
        updatedChar.x = newX;
        updatedChar.y = newY;
        continue;
      }

      // Otherwise, blocked: resolve thorns/trample (a blocked walker gets
      // bitten EVERY attempt — spiky defenders are lethal to dumb walkers
      // by design) and wait, unless the trample killed the defender.
      const charCollision = resolveWalkInCollision(updatedChar, otherCharacter, gameState);
      if (charCollision.moverMayAdvance) {
        // Plow through the fallen defender. (Pickup/tile processing is
        // skipped for this step — see the swap branch note.)
        updatedChar.x = newX;
        updatedChar.y = newY;
        continue;
      }
      return updatedChar;
    }

    // Check for dead enemy that blocks movement (like a wall corpse).
    // Despawned remains (summon expiry, vessel hatch, escapes-on-defeat)
    // left the board entirely — no corpse to wall/halt on.
    const deadEnemy = gameState.puzzle.enemies.find(
      (e) => e.x === newX && e.y === newY && e.dead && !e.despawned
    );
    if (deadEnemy) {
      // Freshly-dead enemies (died this turn or last turn) keep blocking the
      // tile regardless of corpse wall/halt traits. Keeps tile occupancy
      // deterministic across the deferred pending→dead visual commit race:
      // both "commit before executeTurn" and "commit after" now see a
      // blocked tile during the next turn's action phase.
      if (isFreshlyDead(deadEnemy, gameState.currentTurn)) {
        return updatedChar;
      }

      const enemyData = getEnemy(deadEnemy.enemyId);

      // Check if dead enemy behaves like a wall (triggers wall collision behaviors)
      if (isWallDead(deadEnemy)) {
        if (isGhost(updatedChar)) {
          updatedChar.x = newX;
          updatedChar.y = newY;
          continue;
        }
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
            continue;
          case 'stop':
          default:
            return updatedChar;
        }
      }

      // Check if dead enemy halts movement
      if (isHaltDead(deadEnemy) && !isGhost(updatedChar)) {
        return updatedChar;
      }
      // Dead enemies without wall/halt traits can be walked over
    }

    // Symmetric freshly-dead check for characters (characters can also be
    // racing pending→dead visual commits if hit by enemy projectiles).
    const freshlyDeadChar = gameState.placedCharacters.find(
      (c) => c.x === newX && c.y === newY && c !== updatedChar &&
             isFreshlyDead(c, gameState.currentTurn)
    );
    if (freshlyDeadChar) {
      return updatedChar;
    }

    // Check for living enemy at target position
    const enemyAtTarget = gameState.puzzle.enemies.find(
      (e) => e.x === newX && e.y === newY && !e.dead
    );

    if (enemyAtTarget) {
      // Ghost mode
      if (isGhost(updatedChar) || isGhost(enemyAtTarget)) {
        updatedChar.x = newX;
        updatedChar.y = newY;
        continue;
      }

      // Check if enemy behaves like a wall
      if (isWallAlive(enemyAtTarget)) {
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
            continue;
          case 'stop':
          default:
            return updatedChar;
        }
      }

      // Check if enemy halts movement
      if (isHaltAlive(enemyAtTarget)) {
        return updatedChar;
      }

      // Check if this is an enemy trying to move into another enemy (no combat, just block)
      const isEnemyMoving = getEnemy(updatedChar.characterId) !== undefined;

      if (isEnemyMoving) {
        // Check if the target tile is being vacated (train-like movement)
        const targetKey = `${Math.floor(newX)},${Math.floor(newY)}`;
        if (gameState.tilesBeingVacated?.has(targetKey)) {
          // Check if the other enemy is trying to move into OUR current tile (swap attempt)
          const ourCurrentKey = `${Math.floor(updatedChar.x)},${Math.floor(updatedChar.y)}`;

          // Calculate where the other enemy would move to based on their facing
          const otherOffset = getDirectionOffset(enemyAtTarget.facing || Direction.SOUTH);
          const otherTargetX = Math.floor(enemyAtTarget.x + otherOffset.dx);
          const otherTargetY = Math.floor(enemyAtTarget.y + otherOffset.dy);
          const otherTargetKey = `${otherTargetX},${otherTargetY}`;

          // If the other enemy is trying to move into our tile, block (swap attempt)
          if (otherTargetKey === ourCurrentKey) {
            // Both trying to swap tiles - block this move (head-on bump:
            // thorns/trample still resolve, e.g. a summon meeting an enemy)
            const swapCollision = resolveWalkInCollision(updatedChar, enemyAtTarget, gameState);
            if (swapCollision.moverMayAdvance) {
              updatedChar.x = newX;
              updatedChar.y = newY;
              continue;
            }
            return updatedChar;
          }

          // The enemy at this tile is moving away (not toward us) - allow train behavior
          updatedChar.x = newX;
          updatedChar.y = newY;
          continue;
        }
        // Enemy-to-enemy collision: blocked, but thorns/trample resolve for
        // HOSTILE pairs (a hero-party summon bumping an enemy, or vice
        // versa) — party decides, not shape. A trample kill plows through.
        const enemyCollision = resolveWalkInCollision(updatedChar, enemyAtTarget, gameState);
        if (enemyCollision.moverMayAdvance) {
          updatedChar.x = newX;
          updatedChar.y = newY;
          continue;
        }
        return updatedChar;
      }

      // Thorns/Trample walk-in resolution (user design 2026-07-12): the
      // defender's thorns bite the hostile walker; the mover's trample
      // gores the defender; hero-side initiative unless enemy-side
      // PRIORITY. A living (or merely gored) defender blocks; a
      // trample-killed one is plowed through.
      const collision = resolveWalkInCollision(updatedChar, enemyAtTarget, gameState);
      if (!collision.moverMayAdvance) {
        return updatedChar;
      }
      // Plow through: take the vacated tile and keep processing (pickup,
      // tile behaviors, remaining tilesPerMove).
      updatedChar.x = newX;
      updatedChar.y = newY;
    } else {
      // No obstacles, move freely
      updatedChar.x = newX;
      updatedChar.y = newY;
    }

    // Check for collectibles — pickup side is the entity's EFFECTIVE party
    // (audit sweep 10): "characters can collect" means the hero SIDE, so a
    // hero-party summon collects (and scores) like a hero, and charm keeps
    // flipping allegiance exactly as the old manual charm-flip did.
    // effectiveParty handles the wrapper (characterId = enemyId id fallback),
    // the explicit party field, and charm in one place.
    const effectiveIsEnemy = effectiveParty(updatedChar, gameState) === 'enemy';
    processCollectiblePickup(updatedChar, effectiveIsEnemy, newX, newY, gameState);

    // Process custom tile behaviors (damage, teleport, ice, etc.)
    const currentTile = gameState.puzzle.tiles[updatedChar.y]?.[updatedChar.x];
    if (currentTile && currentTile.customTileTypeId) {
      updatedChar = processTileBehaviors(updatedChar, currentTile, currentDirection, gameState);

      // If character died from tile damage, stop processing
      if (updatedChar.dead) {
        return updatedChar;
      }
    }

    // Lingering projectile hazards — checked on EVERY tile (not just custom
    // ones), after tile behaviors so ice slides and teleports have already
    // settled the entity on its final tile.
    updatedChar = processLingeringHazardsAt(updatedChar, gameState);
    if (updatedChar.dead) {
      return updatedChar;
    }
  }

  // POST-MOVEMENT LOOKAHEAD: After successfully moving, check if next tile is a wall
  // This prevents wasting a turn on the next action
  if (onWallCollision !== 'stop' && onWallCollision !== 'continue') {
    const { dx: nextDx, dy: nextDy } = getDirectionOffset(updatedChar.facing);
    const nextX = updatedChar.x + nextDx;
    const nextY = updatedChar.y + nextDy;

    let willHitWallNext = !isInBounds(nextX, nextY, gameState.puzzle.width, gameState.puzzle.height) ||
      isTileBlockingMovement(gameState.puzzle.tiles[nextY]?.[nextX], gameState);

    // Also check for entities that behave like walls
    if (!willHitWallNext && isInBounds(nextX, nextY, gameState.puzzle.width, gameState.puzzle.height)) {
      const wallCharNext = gameState.placedCharacters.find(
        (c) => c.x === nextX && c.y === nextY && !c.dead && c !== updatedChar
      );
      if (wallCharNext && isWallAlive(wallCharNext)) willHitWallNext = true;

      if (!willHitWallNext) {
        const wallEnemyNext = gameState.puzzle.enemies.find(
          (e) => e.x === nextX && e.y === nextY && !e.dead
        );
        if (wallEnemyNext && isWallAlive(wallEnemyNext)) willHitWallNext = true;
      }

      if (!willHitWallNext) {
        const deadWallEnemyNext = gameState.puzzle.enemies.find(
          (e) => e.x === nextX && e.y === nextY && e.dead
        );
        if (deadWallEnemyNext && isWallDead(deadWallEnemyNext)) willHitWallNext = true;
      }

      if (!willHitWallNext) {
        const deadWallCharNext = gameState.placedCharacters.find(
          (c) => c.x === nextX && c.y === nextY && c.dead
        );
        if (deadWallCharNext && isWallDead(deadWallCharNext)) willHitWallNext = true;
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
    ? gameState.puzzle.tiles[checkY]?.[checkX]
    : null;

  const blockingCharacter = gameState.placedCharacters.find(
    (c) => c.x === checkX && c.y === checkY && !c.dead && c !== character
  );
  const blockingDeadEnemy = gameState.puzzle.enemies.find(
    (e) => e.x === checkX && e.y === checkY && e.dead
  );

  const movingIsGhost = isGhost(character);
  const isWallLikeCharacter = blockingCharacter ? isWallAlive(blockingCharacter) : false;
  const isBlockingCorpse = blockingDeadEnemy ? isWallDead(blockingDeadEnemy) : false;

  const isWall =
    !isInBounds(checkX, checkY, gameState.puzzle.width, gameState.puzzle.height) ||
    isTileBlockingMovement(tile, gameState) ||
    (!movingIsGhost && isWallLikeCharacter) ||
    (!movingIsGhost && isBlockingCorpse);

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
  const absoluteAngle = (currentAngle + offset) % 360;

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
 * For auto-target SPELL actions with faceTargetOnCast: rotate the caster to face
 * the (nearest) target, snapped to the 8 compass directions. `direction` is the
 * already-snapped direction to that target. When revertFacingAfterCast is set, the
 * pre-cast facing is stashed once per turn (guarded so multiple casts in a turn
 * don't overwrite the true original) and restored at the next turn start by the
 * simulation. Mutates `character` in place. Facing is logical state, so this flows
 * through the single executeAction path and the headless solver reflects it.
 */
function applyFaceOnCast(
  character: PlacedCharacter,
  action: CharacterAction,
  direction: Direction | undefined
): void {
  if (!action.faceTargetOnCast || direction === undefined) return;
  if (action.revertFacingAfterCast && character.preCastFacing === undefined) {
    character.preCastFacing = character.facing;
  }
  character.facing = direction;
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

  // Check if spell is on cooldown
  if (character.spellCooldowns && character.spellCooldowns[action.spellId] > 0) {
    // Spell is on cooldown - skip this action
    return;
  }

  // Check if spell has reached max uses per game
  if (spell.maxUsesPerGame && spell.maxUsesPerGame > 0) {
    const currentUses = character.spellUseCounts?.[action.spellId] || 0;
    if (currentUses >= spell.maxUsesPerGame) {
      // Spell has been used the maximum number of times this game
      return;
    }
  }

  // Check if entity can cast this type of spell (Silenced/Disarmed check)
  const castCheck = canEntityCastSpell(character, spell.templateType);
  if (!castCheck.allowed) {
    // Entity is silenced or disarmed - cannot cast this spell
    return;
  }

  // Handle RESURRECT and NECROMANCY specially - they target corpses, not directions
  if (spell.templateType === SpellTemplate.RESURRECT || spell.templateType === SpellTemplate.NECROMANCY) {
    if (spell.templateType === SpellTemplate.RESURRECT) {
      executeResurrect(character, spell, action, gameState);
    } else {
      executeNecromancy(character, spell, action, gameState);
    }
    // Track usage
    if (spell.maxUsesPerGame && spell.maxUsesPerGame > 0 && action.spellId) {
      if (!character.spellUseCounts) {
        character.spellUseCounts = {};
      }
      character.spellUseCounts[action.spellId] = (character.spellUseCounts[action.spellId] || 0) + 1;
    }
    // Set cooldown if spell has one
    if (spell.cooldown && spell.cooldown > 0 && action.spellId) {
      if (!character.spellCooldowns) {
        character.spellCooldowns = {};
      }
      character.spellCooldowns[action.spellId] = spell.cooldown + 1;
    }
    return;
  }

  // Determine which directions to cast the spell
  let castDirections: Direction[] = [];

  // Track targets for homing projectiles
  interface HomingTarget {
    direction: Direction;
    targetEntityId: string;
    targetIsEnemy: boolean;
    /** Array index of target enemy — disambiguates duplicate enemyIds. */
    targetEnemyIndex?: number;
  }
  let homingTargets: HomingTarget[] | undefined;

  // Auto-target range fallback: if unset, inherit from the trigger's
  // eventRange. This matches the user's mental model — "trigger at range N"
  // implies "target enemies within range N." Without this inheritance, the
  // trigger fires based on a close enemy but auto-target can pick a far enemy
  // beyond spell range, producing a downgrade to a non-homing bolt.
  const autoTargetRangeFallback = action.autoTargetRange || action.trigger?.eventRange || 0;

  // Check for auto-targeting (enemies targeting characters OR characters targeting enemies)
  // Authored auto-target flags are TEAM-RELATIVE (user decision 2026-07-11:
  // "Opposing Team" / "Same Team"). The legacy field names persist in
  // storage; their MEANING depends on the authoring side, because enemy
  // authors wrote "characters" meaning their targets and "enemies" meaning
  // their own side. Authoring side = which id namespace the caster's id
  // lives in — a hero-party summon still runs ENEMY-authored actions, so
  // its "nearest character" flag correctly resolves to its opposing team.
  // Historical priority preserved: the NearestCharacter flag wins when
  // both are set.
  const authoredAsEnemy = gameState.puzzle.enemies.some(e => e.enemyId === character.characterId);
  const autoTeam: 'opposing' | 'same' | undefined = action.autoTargetNearestCharacter
    ? (authoredAsEnemy ? 'opposing' : 'same')
    : action.autoTargetNearestEnemy
      ? (authoredAsEnemy ? 'same' : 'opposing')
      : undefined;

  // Builds the homing payload off the FOUND entity's shape: id namespace
  // follows the target, and enemies carry their array index so duplicate
  // enemyIds resolve to the right instance. (This also fixes the old
  // charmed-homing dead end, where a charmed caster's bolt stored
  // targetIsEnemy: true with an undefined id and never tracked anything.)
  const toHomingTargets = (targets: Array<{ entity: PlacedCharacter | PlacedEnemy; direction: Direction; enemyIndex: number }>) =>
    targets.map(t => ({
      direction: t.direction,
      targetEntityId: combatId(t.entity),
      targetIsEnemy: 'enemyId' in t.entity,
      targetEnemyIndex: 'enemyId' in t.entity ? t.enemyIndex : undefined,
    }));

  // Player-aimed cast direction (setup-time compass input, generalized from
  // the redirect compass 2026-07-17). The chosen direction replaces every
  // authored direction source INCLUDING auto-target — the flag means "the
  // player aims this spell". Casters without a stored choice (enemies/AI
  // casting the same asset, or a hero the player never aimed) fall through
  // to the authored config below, mirroring redirectAcceptsUserInput's
  // fallback. Homing is deliberately not engaged: an aimed bolt flies where
  // it was pointed.
  const aimedDirection = spell.directionAcceptsUserInput
    ? character.spellDirectionOverrides?.[spell.id]
    : undefined;

  if (aimedDirection) {
    castDirections = [aimedDirection];
    applyFaceOnCast(character, action, aimedDirection);
  } else if (autoTeam) {
    const maxTargets = action.maxTargets || 1;
    const targetMode = action.autoTargetMode || 'omnidirectional';
    const maxRange = autoTargetRangeFallback;
    const targets = findNearestTeamMembers(character, gameState, autoTeam, maxTargets, targetMode, maxRange);

    if (targets.length > 0) {
      castDirections = targets.map(t => t.direction);
      applyFaceOnCast(character, action, targets[0].direction);
      if (action.homing) {
        homingTargets = toHomingTargets(targets);
      }
    } else {
      return;
    }
  } else if (spell.appliesStatusEffect?.statusAssetId) {
    // Infer targeting from the status asset's targetingIntent (Dispel/
    // Cleanse-style): 'hostile' = opposing team, 'friendly' = same team.
    // findNearestTeamMembers is charm-aware (effectiveParty), so charm
    // genuinely flips these now — the old manual wantsEnemies inversion
    // exactly cancelled the finders' internal charm flip, making charm a
    // no-op for intent spells; removed per user decision 2026-07-11.
    const statusAsset = loadStatusEffectAsset(spell.appliesStatusEffect.statusAssetId);
    if (statusAsset?.targetingIntent) {
      const maxTargets = action.maxTargets || 1;
      const targetMode = action.autoTargetMode || 'omnidirectional';
      const maxRange = autoTargetRangeFallback;
      const team = statusAsset.targetingIntent === 'hostile' ? 'opposing' : 'same';
      const targets = findNearestTeamMembers(character, gameState, team, maxTargets, targetMode, maxRange);
      if (targets.length > 0) {
        castDirections = targets.map(t => t.direction);
        if (action.homing) {
          homingTargets = toHomingTargets(targets);
        }
      } else {
        return;
      }
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

  // Handle self-targeting (only targets self)
  if (action.targetSelfOnly) {
    applySpellToSelf(character, spell, gameState);
    // Set cooldown and return (don't execute in other directions)
    if (spell.cooldown && spell.cooldown > 0 && action.spellId) {
      if (!character.spellCooldowns) {
        character.spellCooldowns = {};
      }
      character.spellCooldowns[action.spellId] = spell.cooldown + 1;
    }
    return;
  }

  // Handle self-targeting in addition to other targets
  if (action.targetSelf) {
    applySpellToSelf(character, spell, gameState);
  }

  // Execute spell for each direction based on template type
  for (let i = 0; i < castDirections.length; i++) {
    const direction = castDirections[i];
    const homingTarget = homingTargets?.[i];
    executeSpellInDirection(character, spell, direction, gameState, homingTarget, action.homingPathStyle, action.homingIgnoreWalls, action.homingHitAlongPath);
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
  homingTarget?: { targetEntityId: string; targetIsEnemy: boolean; targetEnemyIndex?: number },
  homingPathStyle?: 'grid' | 'straight' | 'pathfinding',
  homingIgnoreWalls?: boolean,
  homingHitAlongPath?: boolean
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
    aoeSingleSprite: spell.aoeSingleSprite,
    persistDuration: spell.persistDuration,
    persistDamagePerTurn: spell.persistDamagePerTurn,
    persistDestroysProjectiles: spell.persistDestroysProjectiles,
    lingerDuration: spell.lingerDuration,
    persistVisualSprite: spell.sprites.persistentArea,
    projectileSprite: spell.sprites.projectile,
    aoeEffectSprite: spell.sprites.aoeEffect,
    hitEffectSprite: spell.sprites.damageEffect,
    healingEffectSprite: spell.sprites.healingEffect,
    castEffectSprite: spell.sprites.castEffect,
    bounceEffectSprite: spell.sprites.bounceEffect,
    criticalHitEffectSprite: spell.sprites.criticalHitEffect,
    backstabEnabled: spell.backstabEnabled,
    effectDuration: 300,
    projectileScale: spell.projectileScale,
    homingPathStyle: homingPathStyle || 'straight',
    homingIgnoreWalls: homingIgnoreWalls ?? true,
    homingHitAlongPath: homingHitAlongPath || false,
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

    case SpellTemplate.MELEE_CONE:
      attackData.pattern = AttackPattern.MELEE;
      const origFacingCone = character.facing;
      character.facing = direction;
      executeConeAttack(character, attackData, gameState, spell.meleeRange || 1, spell.coneAngle || 90, spell);
      character.facing = origFacingCone;
      break;

    case SpellTemplate.LINEAR:
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

    case SpellTemplate.REDIRECT: {
      // Redirect spell - projectile that changes target's facing direction
      attackData.pattern = AttackPattern.PROJECTILE;
      attackData.isRedirect = true;
      // Check if player chose a direction during setup (overrides spell defaults)
      const userOverride = spell.redirectAcceptsUserInput && character.spellDirectionOverrides?.[spell.id];
      if (userOverride) {
        attackData.redirectMode = 'fixed';
        attackData.redirectFixedDirection = userOverride;
      } else {
        attackData.redirectMode = spell.redirectMode || 'clockwise';
        attackData.redirectAngle = spell.redirectAngle || 90;
        attackData.redirectFixedDirection = spell.redirectFixedDirection;
      }
      const origFacingRedirect = character.facing;
      character.facing = direction;
      spawnProjectile(character, attackData, gameState, spell, homingTarget);
      character.facing = origFacingRedirect;
      break;
    }

    case SpellTemplate.PUSH:
      // Push spell - push entities in a direction
      executePushSpell(character, spell, direction, gameState);
      break;

    case SpellTemplate.THROW_PLACE: {
      // Throw/Place spell - place or throw a collectible item onto a tile
      if (!spell.spawnCollectibleId) {
        console.warn('THROW_PLACE spell missing spawnCollectibleId');
        break;
      }

      const collectibleAsset = loadCollectible(spell.spawnCollectibleId);
      if (!collectibleAsset) {
        console.warn(`THROW_PLACE: collectible asset not found: ${spell.spawnCollectibleId}`);
        break;
      }

      // Determine if source is an enemy
      const tpIsEnemy = gameState.puzzle.enemies.some(e => e.enemyId === character.characterId);

      // Build placement config
      const throwConfig: ThrowPlaceConfig = {
        collectibleId: spell.spawnCollectibleId,
        duration: spell.throwPlaceDuration !== undefined && spell.throwPlaceDuration > 0
          ? spell.throwPlaceDuration
          : (collectibleAsset.duration && collectibleAsset.duration > 0 ? collectibleAsset.duration : undefined),
        overridePermissions: spell.throwPlaceOverridePermissions,
        placerEntityId: character.characterId,
        placerEntityType: tpIsEnemy ? 'enemy' : 'character',
        gracePeriodTurns: spell.throwPlaceGracePeriod ?? 1,
        placerPermanentlyImmune: spell.throwPlacePermanentImmunity ?? false,
        sourceSpellId: spell.id,
      };

      const tpRange = spell.range || 0;

      if (tpRange <= 1) {
        // Place directly (no projectile)
        let placeX = character.x;
        let placeY = character.y;

        if (tpRange === 1) {
          // Place on adjacent tile in facing direction
          const { dx, dy } = getDirectionOffset(direction);
          const adjX = character.x + dx;
          const adjY = character.y + dy;

          // Check if adjacent tile is valid (not wall, in bounds)
          if (isInBounds(adjX, adjY, gameState.puzzle.width, gameState.puzzle.height)) {
            const adjTile = gameState.puzzle.tiles[adjY]?.[adjX];
            if (adjTile && adjTile.type !== TileType.WALL) {
              placeX = adjX;
              placeY = adjY;
            }
            // else: wall, fail silently (don't place)
            else return;
          } else {
            return; // Out of bounds, fail silently
          }
        }

        placeCollectibleFromSpell(placeX, placeY, throwConfig, gameState);
      } else {
        // Throw as projectile (range 2+)
        attackData.pattern = AttackPattern.PROJECTILE;
        attackData.damage = 0;
        attackData.healing = 0;

        // Use collectible's sprite as projectile visual
        if (collectibleAsset.customSprite) {
          attackData.projectileSprite = {
            type: 'inline' as const,
            spriteData: collectibleAsset.customSprite,
          };
        }

        // Scale down during flight (will scale up on arrival)
        attackData.projectileScale = (spell.projectileScale ?? 1) * 0.6;

        const origFacingTP = character.facing;
        character.facing = direction;
        spawnProjectile(character, attackData, gameState, spell, homingTarget);

        // Attach throwPlaceConfig to the just-spawned projectile
        const lastProj = gameState.activeProjectiles?.[gameState.activeProjectiles.length - 1];
        if (lastProj) {
          lastProj.throwPlaceConfig = throwConfig;
        }

        character.facing = origFacingTP;
      }
      break;
    }

    case SpellTemplate.SUMMON: {
      // One spawn attempt per cast direction, on the adjacent tile (locked
      // design: placement rides the standard direction config). Invalid
      // tiles fail silently, like THROW_PLACE.
      if (!spell.summonEnemyId) {
        console.warn('SUMMON spell missing summonEnemyId');
        break;
      }

      const { dx, dy } = getDirectionOffset(direction);
      const spawnX = Math.floor(character.x) + dx;
      const spawnY = Math.floor(character.y) + dy;

      if (!isInBounds(spawnX, spawnY, gameState.puzzle.width, gameState.puzzle.height)) break;
      const spawnTile = gameState.puzzle.tiles[spawnY]?.[spawnX];
      if (isTileBlockingMovement(spawnTile, gameState)) break;

      // Occupancy uses movement semantics: living entities block, and so do
      // freshly-dead ones (isFreshlyDead — keeps spawn placement deterministic
      // regardless of when the death visual commits). Stale corpses don't
      // block, same as walking over them.
      const blockedByEntity =
        gameState.puzzle.enemies.some(e =>
          Math.floor(e.x) === spawnX && Math.floor(e.y) === spawnY &&
          (!e.dead || isFreshlyDead(e, gameState.currentTurn))) ||
        gameState.placedCharacters.some(c =>
          Math.floor(c.x) === spawnX && Math.floor(c.y) === spawnY &&
          (!c.dead || isFreshlyDead(c, gameState.currentTurn)));
      if (blockedByEntity) break;

      // Facing override — relative modes resolve against the summoner NOW,
      // then the result is a plain compass facing on the unit (it doesn't
      // track the summoner afterwards). Unset = asset defaultFacing.
      let summonFacing: Direction | undefined;
      switch (spell.summonFacing) {
        case 'away_from_summoner': summonFacing = direction; break;
        case 'toward_summoner': summonFacing = turnAround(direction); break;
        case 'match_summoner': summonFacing = character.facing; break;
        case 'fixed': summonFacing = spell.summonFacingFixed; break;
      }

      // Effective party at cast time (locked design): a charmed caster's
      // summon permanently joins the charmer's team. Always excluded from
      // win conditions — a summon must never become a kill requirement.
      const spawned = spawnEnemyMidGame(gameState, {
        enemyId: spell.summonEnemyId,
        x: spawnX,
        y: spawnY,
        facing: summonFacing,
        party: effectiveParty(character, gameState),
        excludeFromWinConditions: true,
        durationTurns: spell.summonDuration,
        sourceSpellId: spell.id,
        startingStatus: spell.summonStartingStatus,
      });

      if (spawned) {
        if (spell.sprites.castEffect) {
          spawnParticle(character.x, character.y, spell.sprites.castEffect, 300, gameState);
        }
        // Materialize overlay on the summoned unit's tile — draws over the
        // entity, portal-tile style. Longer default than hit effects so a
        // multi-frame sheet has room to play.
        if (spell.sprites.summonEffect) {
          spawnParticle(spawnX, spawnY, spell.sprites.summonEffect, 600, gameState, undefined, { aboveEntities: true });
        }
      }
      break;
    }

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
  homingTarget?: { targetEntityId: string; targetIsEnemy: boolean; targetEnemyIndex?: number }
): void {
  if (!gameState.activeProjectiles) {
    gameState.activeProjectiles = [];
  }

  const range = attackData.range || 10; // Default max range
  const speed = attackData.projectileSpeed || 4; // Tiles per turn

  // If the homing target is beyond the spell's range, downgrade to a
  // non-homing straight bolt aimed at the max-range point in the target's
  // direction. Reason: the straight-line homing visual interpolates from
  // current position to target over `dist / speed` seconds — for targets
  // much farther than one turn's travel, the visual overshoots the logical
  // per-turn position, and `resolveProjectiles`' turn-boundary anchor reset
  // snaps it backward to the logical position. Multiple out-of-range bolts
  // each snap by different amounts, producing a "projectiles appearing at
  // random locations" visual. The logical range gate still works correctly
  // either way (no damage), but treating these as non-homing avoids the
  // visual snap entirely.
  let effectiveHomingTarget = homingTarget;

  // Calculate target position
  let targetX: number;
  let targetY: number;

  // For homing projectiles, set initial target to the actual target entity's position
  if (effectiveHomingTarget) {
    let targetEntity: { x: number; y: number } | undefined;
    if (effectiveHomingTarget.targetIsEnemy) {
      // Prefer array-index lookup so duplicate enemyIds resolve to the
      // specific instance findNearestEnemies actually picked. Without this,
      // .find(enemyId) returns the first placement-order match, which makes
      // the bolt aim at (and downgrade against) a different enemy than the
      // one intended — the critical bug that caused wrong-target firing,
      // spurious downgrades, and winning-with-enemies-alive.
      const idx = effectiveHomingTarget.targetEnemyIndex;
      if (idx !== undefined) {
        const indexed = gameState.puzzle.enemies[idx];
        if (indexed && indexed.enemyId === effectiveHomingTarget.targetEntityId && !indexed.dead) {
          targetEntity = indexed;
        }
      }
      if (!targetEntity) {
        targetEntity = gameState.puzzle.enemies.find(e => e.enemyId === effectiveHomingTarget!.targetEntityId && !e.dead);
      }
    } else {
      targetEntity = gameState.placedCharacters.find(c => c.characterId === effectiveHomingTarget!.targetEntityId);
    }
    if (targetEntity) {
      targetX = targetEntity.x;
      targetY = targetEntity.y;

      // Downgrade to non-homing if target is out of spell range.
      const distToTarget = Math.sqrt(
        Math.pow(targetX - character.x, 2) + Math.pow(targetY - character.y, 2)
      );
      if (distToTarget > range && distToTarget > 0) {
        // Use character.facing × range rather than scaling toward the
        // unreachable target. Rationale: the projectile is non-homing from
        // here on and walkNonHomingTick moves in proj.direction
        // (= character.facing). If we clamp target in the target's direction,
        // tilePath (computed from caster to target) and the walker diverge
        // whenever facing doesn't match the target direction — the bolt hits
        // enemies at positions beyond tilePath's end, the VFX fires at the
        // walker's hit tile while the visual sits at tilePath's end, and
        // impact doesn't line up with the projectile. Aligning target with
        // facing keeps both paths in sync.
        const { dx: fDx, dy: fDy } = getDirectionOffset(character.facing);
        targetX = character.x + fDx * range;
        targetY = character.y + fDy * range;
        effectiveHomingTarget = undefined;
      }
    } else {
      // Fallback to max range in facing direction if target not found
      const { dx, dy } = getDirectionOffset(character.facing);
      targetX = character.x + dx * range;
      targetY = character.y + dy * range;
      effectiveHomingTarget = undefined;
    }
  } else {
    // Non-homing: use snapped compass direction × range for clean straight-line paths
    const { dx, dy } = getDirectionOffset(character.facing);
    targetX = character.x + dx * range;
    targetY = character.y + dy * range;
  }

  // The firer's BASE party (engine/party.ts): explicit field, else the
  // structural id lookup this line used to do inline. isEnemy keeps feeding
  // the id-namespace fields (sourceCharacterId vs sourceEnemyId), which
  // stay shape-based for lookups/visuals.
  const firerParty = entityParty(character, gameState);
  const isEnemy = gameState.puzzle.enemies.some(e => e.enemyId === character.characterId);
  // Store enemy array index for reflect targeting (duplicate enemies share the same ID)
  const sourceEnemyIndex = isEnemy
    ? gameState.puzzle.enemies.findIndex(e => e.enemyId === character.characterId && e.x === character.x && e.y === character.y)
    : undefined;
  // Charmed entities fire with teamSwapped so getEffectiveTeams() hits their structural team
  const casterIsCharmed = isEntityCharmed(character);

  // Pre-compute tile path for deterministic collision detection
  // For non-homing projectiles, this path is fixed at creation time
  // Stop path before walls so projectiles never visually enter wall tiles
  let tilePath: Array<{ x: number; y: number }> | undefined;
  if (!effectiveHomingTarget) {
    const rawPath = computeTilePath(character.x, character.y, targetX, targetY);
    const validPath: Array<{ x: number; y: number }> = [];
    for (const tile of rawPath) {
      const tileIsWall = !isInBounds(tile.x, tile.y, gameState.puzzle.width, gameState.puzzle.height) ||
          gameState.puzzle.tiles[tile.y]?.[tile.x]?.type === TileType.WALL ||
          gameState.puzzle.tiles[tile.y]?.[tile.x] === null;
      if (tileIsWall) break;
      validPath.push(tile);
    }
    tilePath = validPath.length > 0 ? validPath : [{ x: Math.floor(character.x), y: Math.floor(character.y) }];
  }

  // Create projectile. Use effectiveHomingTarget rather than the raw
  // homingTarget so out-of-range bolts spawn as non-homing — the homing
  // flag + visual-anchor fields must be left off, otherwise
  // updateStraightLineHomingVisual would still engage on frame 0.
  const projectile: Projectile = {
    id: `proj_${Date.now()}_${Math.random()}`,
    attackData,
    logicalX: character.x,
    logicalY: character.y,
    startX: character.x,
    startY: character.y,
    targetX,
    targetY,
    direction: character.facing,
    speed,
    active: true,
    startTime: Date.now(),
    // Homing behavior
    isHoming: !!effectiveHomingTarget,
    homingPathStyle: attackData.homingPathStyle || 'straight',
    homingIgnoreWalls: attackData.homingIgnoreWalls ?? true,
    homingHitAlongPath: attackData.homingHitAlongPath || false,
    homingVisualStartX: effectiveHomingTarget ? character.x : undefined,
    homingVisualStartY: effectiveHomingTarget ? character.y : undefined,
    homingVisualStartTime: effectiveHomingTarget ? Date.now() : undefined,
    // Preserve the originally-selected target even when downgraded. The
    // homing branch in resolveProjectiles is gated on proj.isHoming (so
    // downgraded bolts skip it), but the health-bar glow uses targetEntityId
    // to indicate "this entity is the intended target" — the indicator
    // should still appear for downgraded shots since the caster did aim at
    // that specific enemy.
    targetEntityId: effectiveHomingTarget?.targetEntityId ?? homingTarget?.targetEntityId,
    targetIsEnemy: effectiveHomingTarget?.targetIsEnemy ?? homingTarget?.targetIsEnemy,
    targetEnemyIndex: effectiveHomingTarget?.targetEnemyIndex ?? homingTarget?.targetEnemyIndex,
    sourceCharacterId: isEnemy ? undefined : character.characterId,
    sourceEnemyId: isEnemy ? character.characterId : undefined,
    sourceEnemyIndex: sourceEnemyIndex !== undefined && sourceEnemyIndex >= 0 ? sourceEnemyIndex : undefined,
    sourceParty: firerParty,
    teamSwapped: casterIsCharmed || undefined,  // Charm: flip hit resolution via getEffectiveTeams()
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
    // Deterministic turn resolution metadata
    spawnTurn: gameState.currentTurn,
    logicalTileIndex: 0,
  };

  gameState.activeProjectiles.push(projectile);

  // Optional spawn-time dump (gated on HOMING_DEBUG in simulation.ts).
  // Logs homing bolts AND homing-that-got-downgraded (the action intended a
  // homing cast, but spawnProjectile flipped it to non-homing because the
  // target was out of spell range). See simulation.ts for the flag.
  if (isHomingDebug() && (projectile.isHoming || !!homingTarget)) {
    const pid = projectile.id.slice(-6);
    // Resolve the initially-selected target for logging
    let initialTargetStr = 'none';
    if (homingTarget) {
      if (homingTarget.targetIsEnemy && homingTarget.targetEnemyIndex !== undefined) {
        const e = gameState.puzzle.enemies[homingTarget.targetEnemyIndex];
        initialTargetStr = `enemies[${homingTarget.targetEnemyIndex}]${e ? `@(${e.x},${e.y}) id=${e.enemyId.slice(-6)} dead=${e.dead} pending=${e.pendingProjectileDeath}` : 'MISSING'}`;
      } else if (homingTarget.targetIsEnemy) {
        initialTargetStr = `enemy id=${homingTarget.targetEntityId.slice(-6)} (no index)`;
      } else {
        initialTargetStr = `char id=${homingTarget.targetEntityId.slice(-6)}`;
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `[HOMING-SPAWN ${pid}] style=${projectile.homingPathStyle ?? 'n/a'} ` +
      `caster=(${character.x.toFixed(2)},${character.y.toFixed(2)}) ` +
      `target=(${targetX.toFixed(2)},${targetY.toFixed(2)}) ` +
      `spellRange=${range} speed=${speed} ` +
      `homing=${!!effectiveHomingTarget} downgraded=${!effectiveHomingTarget && !!homingTarget} ` +
      `initialTarget=${initialTargetStr} ` +
      `visStart=(${projectile.homingVisualStartX?.toFixed(2)},${projectile.homingVisualStartY?.toFixed(2)}) ` +
      `logical=(${projectile.logicalX.toFixed(2)},${projectile.logicalY.toFixed(2)}) ` +
      `spawnTurn=${projectile.spawnTurn}`
    );
  }

  // Spawn cast effect if configured
  if (attackData.castEffectSprite) {
    spawnParticle(character.x, character.y, attackData.castEffectSprite, attackData.effectDuration || 300, gameState);
  }
}

/**
 * Execute melee attack (instant, no projectile)
 * Supports meleeRange to hit multiple tiles in attack direction
 */
/**
 * First living entity at (x, y) the caster may strike (party.ts
 * isAttackTarget). Characters are scanned before enemies; with all existing
 * content only one of the two lists can ever hold a legal target, so the
 * order is a deterministic tiebreak reserved for future mixed-party tiles.
 */
function findAttackTargetAt(
  caster: PlacedCharacter,
  x: number,
  y: number,
  gameState: GameState
): PlacedCharacter | PlacedEnemy | undefined {
  return (
    gameState.placedCharacters.find(c => c.x === x && c.y === y && !c.dead && isAttackTarget(caster, c, gameState)) ??
    gameState.puzzle.enemies.find(e => e.x === x && e.y === y && !e.dead && isAttackTarget(caster, e, gameState))
  );
}

/**
 * One melee strike landing on a found target: backstab crit, damage, the
 * spell's status effect, hit sprite. (x, y) is the struck tile — passed
 * explicitly because damage side effects may move the target before the
 * sprite spawns. casterIsEnemy is the caster's effective party, derived
 * once when the swing starts.
 */
function applyMeleeHit(
  caster: PlacedCharacter,
  target: PlacedCharacter | PlacedEnemy,
  x: number,
  y: number,
  attackData: CustomAttack,
  casterIsEnemy: boolean,
  gameState: GameState,
  spell?: SpellAsset
): void {
  const damage = attackData.damage ?? 1;
  const isCrit = attackData.backstabEnabled && isAttackFromBehind(caster.facing, target.facing || Direction.SOUTH);
  applyDamageToEntity(target, isCrit ? damage * 2 : damage, gameState, caster, 'melee');

  if (spell && !target.dead) {
    applyStatusEffectFromSpell(target, spell, caster.characterId, casterIsEnemy, gameState.currentTurn);
  }

  const hitSprite = isCrit && attackData.criticalHitEffectSprite ? attackData.criticalHitEffectSprite : attackData.hitEffectSprite;
  if (hitSprite) {
    spawnParticle(x, y, hitSprite, attackData.effectDuration || 300, gameState, caster.facing);
  }
}

function executeMeleeAttack(
  character: PlacedCharacter,
  attackData: CustomAttack,
  gameState: GameState,
  meleeRange: number = 1,
  spell?: SpellAsset
): void {
  const { dx, dy } = getDirectionOffset(character.facing);

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

  // Party model (engine/party.ts): the caster's effective party decides which
  // entities are legal targets — see isAttackTarget for the charm asymmetry.
  // The old code picked a list (placedCharacters vs puzzle.enemies) off this
  // flag; identical outcome for all existing content.
  const casterIsEnemy = effectiveParty(character, gameState) === 'enemy';

  // Handle range 0 as self-target
  if (meleeRange === 0) {
    // Show attack sprite on caster's tile if not skipped
    if (attackSprite && !skipCasterTile) {
      spawnParticle(character.x, character.y, attackSprite, attackData.effectDuration || 300, gameState, character.facing);
    }

    const target = findAttackTargetAt(character, character.x, character.y, gameState);
    if (target) {
      applyMeleeHit(character, target, character.x, character.y, attackData, casterIsEnemy, gameState, spell);
    }
    return;
  }

  // Multi-tile stitching (docs/feature-backlog.md): begin/middle/end parts
  // compose one long weapon across a range≥2 melee — begin on tile 1 (sword
  // base), end on the last tile (tip), meleeAttack repeated between. Range 1
  // keeps the single-sprite path untouched. A lunge clipped by the board
  // edge draws base+middles with no tip — the blade continues off-board.
  const beginPart = spell?.sprites.meleeAttackBegin;
  const endPart = spell?.sprites.meleeAttackEnd;
  const stitching = meleeRange >= 2 && (hasValidSprite(beginPart) || hasValidSprite(endPart));
  const partForTile = (i: number) => {
    if (!stitching) return attackSprite;
    if (i === 1 && hasValidSprite(beginPart)) return beginPart;
    if (i === meleeRange && hasValidSprite(endPart)) return endPart;
    return attackSprite;
  };

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
      spawnParticle(targetX, targetY, partForTile(i), attackData.effectDuration || 300, gameState, character.facing);
    }

    const target = findAttackTargetAt(character, targetX, targetY, gameState);
    if (target) {
      applyMeleeHit(character, target, targetX, targetY, attackData, casterIsEnemy, gameState, spell);
    }
  }
}

/**
 * Execute cone/arc melee attack
 * Hits tiles in a cone shape emanating from the caster's facing direction.
 * Uses angle-based targeting: each candidate tile's angle from the caster is checked
 * against the facing direction ± half the cone angle.
 */
function executeConeAttack(
  character: PlacedCharacter,
  attackData: CustomAttack,
  gameState: GameState,
  meleeRange: number = 1,
  coneAngle: number = 90,
  spell?: SpellAsset
): void {
  const skipCasterTile = spell?.skipSpriteOnCasterTile || false;
  // Party model (engine/party.ts): the caster's effective party decides which
  // entities are legal targets — see isAttackTarget for the charm asymmetry.
  const casterIsEnemy = effectiveParty(character, gameState) === 'enemy';

  // Get attack sprite (same logic as executeMeleeAttack)
  let attackSprite = spell?.sprites.meleeAttack;
  const hasValidSprite = (sprite: any) => {
    if (!sprite?.spriteData) return false;
    const data = sprite.spriteData;
    return data.shape || data.idleImageData || data.spriteSheet;
  };
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

  // Calculate facing angle in degrees (atan2 convention: 0=east, positive=clockwise on screen)
  const { dx: faceDx, dy: faceDy } = getDirectionOffset(character.facing);
  const facingAngle = Math.atan2(faceDy, faceDx) * (180 / Math.PI);
  const halfCone = coneAngle / 2;

  // Collect all tiles in the cone
  const coneTiles: { x: number; y: number }[] = [];

  for (let dy = -meleeRange; dy <= meleeRange; dy++) {
    for (let dx = -meleeRange; dx <= meleeRange; dx++) {
      if (dx === 0 && dy === 0) continue; // Skip caster tile

      const tileX = character.x + dx;
      const tileY = character.y + dy;

      // Bounds check
      if (!isInBounds(tileX, tileY, gameState.puzzle.width, gameState.puzzle.height)) continue;

      // Wall check
      const tile = gameState.puzzle.tiles[tileY]?.[tileX];
      if (!tile || tile.type === 'wall') continue;

      // Distance check (Chebyshev distance for grid — max of |dx|, |dy|)
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (dist > meleeRange) continue;

      // Angle check
      const tileAngle = Math.atan2(dy, dx) * (180 / Math.PI);
      let angleDiff = tileAngle - facingAngle;
      // Normalize to [-180, 180]
      while (angleDiff > 180) angleDiff -= 360;
      while (angleDiff < -180) angleDiff += 360;

      if (Math.abs(angleDiff) <= halfCone) {
        coneTiles.push({ x: tileX, y: tileY });
      }
    }
  }

  // Apply attack to all tiles in cone
  for (const target of coneTiles) {
    // Show attack sprite
    if (attackSprite) {
      spawnParticle(target.x, target.y, attackSprite, attackData.effectDuration || 300, gameState, character.facing);
    }

    const struck = findAttackTargetAt(character, target.x, target.y, gameState);
    if (struck) {
      applyMeleeHit(character, struck, target.x, target.y, attackData, casterIsEnemy, gameState, spell);
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

  // Party model (engine/party.ts): the caster's effective party decides who
  // gets hurt (isAttackTarget — opposing side) and who gets healed (its
  // complement — own side). Charm steers the heal the same way it steers
  // the blade; the old code picked a list off this flag, identical outcome
  // for all existing content.
  const isEnemyCaster = effectiveParty(character, gameState) === 'enemy';

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
    // Both entity lists, characters first — with existing content the party
    // filter selects exactly the list the old branched code searched, in
    // the same order. Entities are flagged dead, never removed, so the
    // combined array is stable during iteration.
    const candidates: (PlacedCharacter | PlacedEnemy)[] = [
      ...gameState.placedCharacters,
      ...gameState.puzzle.enemies,
    ];

    if (isHeal) {
      // Heal allies in radius — everyone on the caster's effective side.
      candidates.forEach(ally => {
        if (ally.dead) return;
        // Self-exclusion: a hero caster IS its list element (reference);
        // a wrapped enemy caster is a copy, so match its id instead.
        if (ally === character) return;
        if ('enemyId' in ally && ally.enemyId === character.characterId) return;
        if (isAttackTarget(character, ally, gameState)) return; // opposing side

        const distance = Math.sqrt(
          Math.pow(ally.x - centerX, 2) + Math.pow(ally.y - centerY, 2)
        );

        if (distance <= radius) {
          // Cap at the source asset's health, like the pre-party branches did.
          const maxHealth = 'enemyId' in ally
            ? getEnemy(ally.enemyId)?.health
            : getCharacter(ally.characterId)?.health;
          ally.currentHealth = Math.min(ally.currentHealth + healing, maxHealth ?? ally.currentHealth);

          // Use healing effect sprite if available, fallback to hit effect
          const healSprite = attackData.healingEffectSprite || attackData.hitEffectSprite;
          if (healSprite) {
            spawnParticle(ally.x, ally.y, healSprite, attackData.effectDuration || 300, gameState);
          }
        }
      });
    } else {
      // Damage everyone on the opposing side in radius. Deliberately NO
      // self-exclusion, matching the old branches: a charmed enemy's blast
      // can catch its own base side — itself included.
      candidates.forEach(target => {
        if (target.dead) return;
        if (!isAttackTarget(character, target, gameState)) return;

        const distance = Math.sqrt(
          Math.pow(target.x - centerX, 2) + Math.pow(target.y - centerY, 2)
        );

        if (distance <= radius) {
          applyDamageToEntity(target, damage, gameState, character);

          // Apply status effect if spell has one configured
          if (spell && !target.dead) {
            applyStatusEffectFromSpell(target, spell, character.characterId, isEnemyCaster, gameState.currentTurn);
          }

          if (attackData.hitEffectSprite) {
            spawnParticle(target.x, target.y, attackData.hitEffectSprite, attackData.effectDuration || 300, gameState);
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
      // Deterministic id (turn + index) — the determinism rule. Nothing
      // logical keys on zone ids, but identical runs must produce
      // identical GameState contents (state-hash / replay diffing).
      id: `persist_${gameState.currentTurn}_${gameState.persistentAreaEffects.length}`,
      x: centerX,
      y: centerY,
      radius,
      damagePerTurn: attackData.persistDamagePerTurn || damage,
      turnsRemaining: attackData.persistDuration,
      visualSprite: attackData.persistVisualSprite,
      loopAnimation: true, // Persistent effects should loop by default
      excludeCenter: attackData.aoeExcludeCenter,
      sourceCharacterId: character.characterId,
      // The zone fights for whoever the caster fought for at cast time —
      // same allegiance the instant AOE hit above used (isEnemyCaster).
      sourceParty: isEnemyCaster ? 'enemy' : 'hero',
      destroysProjectiles: attackData.persistDestroysProjectiles,
    };

    gameState.persistentAreaEffects.push(persistentEffect);
  }

  // Spawn AOE effect particles on all affected tiles (instant visual effect when cast)
  if (attackData.aoeEffectSprite && attackData.aoeSingleSprite) {
    // Single-sprite mode: one particle at the area center whose render box
    // spans the whole blast — a consistent large visual instead of
    // per-tile repeats. Art drawn at 24 art px per tile scales uniformly.
    spawnParticle(centerX, centerY, attackData.aoeEffectSprite, attackData.effectDuration || 500, gameState, undefined, {
      sizeTiles: radius * 2 + 1,
    });
  } else if (attackData.aoeEffectSprite) {
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
  direction?: Direction,
  opts?: { delayMs?: number; fromX?: number; fromY?: number; sizeTiles?: number; aboveEntities?: boolean }
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
    ...opts, // delayMs (hold) / fromX,fromY (travel) / sizeTiles / aboveEntities (draw over the entity layer)
  };

  gameState.activeParticles.push(particle);
}

// ==========================================
// SELF-TARGETING SPELL APPLICATION
// ==========================================

/**
 * Apply spell effects directly to the caster (self-targeting)
 */
function applySpellToSelf(
  character: PlacedCharacter,
  spell: SpellAsset,
  gameState: GameState
): void {
  // Determine if this is an enemy caster
  const isEnemy = 'enemyId' in character;

  // Apply healing to self
  if (spell.healing && spell.healing > 0) {
    // Look up source's max health to clamp the heal — char-then-enemy id
    // fallback, NOT shape: enemy casters arrive as hero-shaped wrappers
    // (characterId = enemyId, no enemyId field), so the old `'enemyId' in
    // character` check read them as heroes, found no character asset, and
    // let enemy self-heals run UNCAPPED (audit sweep 5, 2026-07-12).
    const sourceMaxHealth =
      getCharacter(character.characterId)?.health ??
      getEnemy(character.characterId)?.health;
    character.currentHealth = Math.min(
      character.currentHealth + spell.healing,
      sourceMaxHealth ?? character.currentHealth + spell.healing
    );

    // Spawn healing visual effect
    if (spell.sprites.healingEffect || spell.sprites.damageEffect) {
      spawnParticle(
        character.x,
        character.y,
        spell.sprites.healingEffect || spell.sprites.damageEffect,
        300,
        gameState,
        character.facing
      );
    }
  }

  // Apply damage to self (for self-harm spells)
  if (spell.damage && spell.damage > 0) {
    applyDamageToEntity(character, spell.damage, gameState);

    // Spawn damage visual effect
    if (spell.sprites.damageEffect) {
      spawnParticle(
        character.x,
        character.y,
        spell.sprites.damageEffect,
        300,
        gameState,
        character.facing
      );
    }
  }

  // Apply status effect to self
  if (spell.appliesStatusEffect && !character.dead) {
    applyStatusEffectFromSpell(
      character,
      spell,
      character.characterId || (character as any).enemyId,
      isEnemy,
      gameState.currentTurn
    );
  }

  // Spawn cast effect on self
  if (spell.sprites.castEffect) {
    spawnParticle(
      character.x,
      character.y,
      spell.sprites.castEffect,
      300,
      gameState,
      character.facing
    );
  }
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

  // DISPEL/CLEANSE are instant: strip now, never push an instance.
  if (applyInstantStatusStrip(target, effectAsset)) {
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
 * Check if an entity is invulnerable (has INVULNERABLE status effect)
 */
function isInvulnerable(entity: PlacedCharacter | PlacedEnemy): boolean {
  if (!entity.statusEffects) return false;
  return entity.statusEffects.some(
    e => e.type === StatusEffectType.INVULNERABLE
  );
}

/**
 * Check if an entity is steadfast (immune to direction changes)
 */
function isSteadfast(entity: PlacedCharacter | PlacedEnemy): boolean {
  if (!entity.statusEffects) return false;
  return entity.statusEffects.some(
    e => e.type === StatusEffectType.STEADFAST
  );
}

// isStealthed alias — uses the existing isEntityStealthed function defined below

/**
 * Hit-stamp bookkeeping on the sacred damage path (2026-07-14). Stamps the
 * victim's hitStamps (and the attacker's dealtStamps when known) with the
 * current turn under the delivery kind plus 'any'. New-object writes only —
 * replay snapshots and wrapper copies share references.
 *
 * Stamps record CONNECTION, not damage-got-through (user decision
 * 2026-07-14): invulnerable, deflecting, reflecting, and shield-absorbed
 * targets are all stamped, and the attacker gets dealt credit — mitigation
 * gates the damage, not the hit. This is what makes "immune until struck
 * by a projectile" entities authorable. Only zero-damage deliveries never
 * stamp (combined-lethality bookkeeping, healing/redirect projectiles).
 */
export function stampHitLanded(
  victim: PlacedCharacter | PlacedEnemy,
  attacker: PlacedCharacter | PlacedEnemy | undefined,
  kind: Exclude<HitStampKind, 'any'> | undefined,
  gameState: GameState
): void {
  const turn = gameState.currentTurn;
  const write = (prev?: HitStamps): HitStamps =>
    kind ? { ...prev, [kind]: turn, any: turn } : { ...prev, any: turn };
  victim.hitStamps = write(victim.hitStamps);
  if (attacker) attacker.dealtStamps = write(attacker.dealtStamps);
}

/**
 * Attacker-only half of stampHitLanded — for deliveries where the victim
 * stamp happens inside applyDamageToEntityNoDeflect but the attacker must
 * be looked up separately (projectile hits: the caster is found in live
 * state from the projectile's source fields at resolve time).
 */
export function stampDealtHit(
  attacker: PlacedCharacter | PlacedEnemy,
  kind: Exclude<HitStampKind, 'any'> | undefined,
  gameState: GameState
): void {
  const turn = gameState.currentTurn;
  attacker.dealtStamps = kind
    ? { ...attacker.dealtStamps, [kind]: turn, any: turn }
    : { ...attacker.dealtStamps, any: turn };
}

/**
 * Merge two stamp records, keeping the LATEST turn per kind. Used by the
 * actor-loop write-backs: while an entity's acting copy runs, feedback
 * damage (a victim's on_death spell, deflect) stamps the ORIGINAL array
 * object — same window the externalHealthBefore merges protect. Stamps are
 * monotonically increasing turn numbers, so per-key max is always safe and
 * idempotent (merging identical references is a no-op).
 */
export function mergeHitStamps(a?: HitStamps, b?: HitStamps): HitStamps | undefined {
  if (!a || a === b) return b ?? a;
  if (!b) return a;
  const out: HitStamps = { ...a };
  for (const key of Object.keys(b) as Array<keyof HitStamps>) {
    const stamp = b[key];
    if (stamp !== undefined && stamp > (out[key] ?? -1)) out[key] = stamp;
  }
  return out;
}

/**
 * Helper to apply damage and handle sleep wake-up and shield absorption.
 * This is the centralized damage function - ALL damage should go through here
 * to ensure shields, invulnerability, and deflect are properly checked.
 */
export function applyDamageToEntity(
  target: PlacedCharacter | PlacedEnemy,
  damage: number,
  gameState: GameState,
  source?: PlacedCharacter | PlacedEnemy,  // Who dealt the damage (for deflect + dealtStamps)
  deliveryKind?: Exclude<HitStampKind, 'any'>  // Hit-stamp kind; undefined deliveries stamp 'any' only
): void {
  // Hit stamps record CONNECTION — before invulnerability and deflect, so
  // mitigated hits still stamp both sides (see stampHitLanded). The
  // damage > 0 gate keeps the combined-lethality applyDamageToEntity(x, 0)
  // bookkeeping calls in simulation.ts from counting as hits.
  if (damage > 0) {
    stampHitLanded(target, source, deliveryKind, gameState);
  }

  // Check for invulnerability - if invulnerable, take no damage
  if (isInvulnerable(target)) {
    return;
  }

  let remainingDamage = damage;

  // Check for deflect effect - reflects damage back to source
  if (source && target.statusEffects) {
    const hasDeflect = target.statusEffects.some(
      e => e.type === StatusEffectType.DEFLECT
    );

    if (hasDeflect && remainingDamage > 0) {
      // Deflect all damage back to source (don't recurse - source can't deflect reflected damage)
      const sourceWasAlive = !source.dead;
      // The bounced damage keeps its delivery kind (NoDeflect stamps the
      // source's hitStamps with it — "your own blade came back at you").
      applyDamageToEntityNoDeflect(source, remainingDamage, gameState, deliveryKind);
      // A deflect kill drops the source's loot (same as simulation's own
      // deflect helper) — NoDeflect itself never drops, its projectile/DOT
      // callers handle their own.
      if (sourceWasAlive && source.dead) {
        handleEntityDeathDrop(source, 'enemyId' in source, gameState);
      }
      // Target takes no damage
      return;
    }
  }

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
    // Create a PlacedCharacter-like object for death triggers
    const entityForTriggers: PlacedCharacter = {
      characterId: (target as PlacedCharacter).characterId || (target as PlacedEnemy).enemyId,
      party: target.party, // wrappers carry the explicit party through (engine/party.ts)
      excludeFromWinConditions: target.excludeFromWinConditions,
      x: target.x,
      y: target.y,
      facing: target.facing || Direction.EAST,
      currentHealth: target.currentHealth,
      actionIndex: (target as PlacedCharacter).actionIndex || (target as PlacedEnemy).actionIndex || 0,
      active: (target as PlacedCharacter).active ?? (target as PlacedEnemy).active ?? true,
      dead: false,
      parallelTrackers: target.parallelTrackers,
      statusEffects: target.statusEffects,
      spellCooldowns: target.spellCooldowns,
    };
    const firstDeath = !target.dead;
    executeDeathTriggers(entityForTriggers, gameState);
    target.dead = true;
    // Stamp logical death turn once. Survives the pending→dead→pending
    // flip in applyEntityHit (visual mode sets dead=false right after),
    // so movement blockers can use it to keep the tile occupied through
    // the next turn's action phase — defeating the race where the
    // deferred pending→dead visual commit lands on different sides of
    // executeTurn between runs (making the tile flip between
    // "blocking" and "walkable corpse" non-deterministically).
    if (target.diedOnTurn === undefined) {
      target.diedOnTurn = gameState.currentTurn;
    }
    if (firstDeath) {
      // Death drop for DIRECT-damage kills (melee, cone, AOE, contact,
      // tile damage, push). Fixed 2026-07-11: before this, only projectile
      // kills (deferred visual commit) and status-effect deaths ever fired
      // drops — a melee'd enemy never dropped its loot. Projectile and DOT
      // paths keep their own drop calls; they damage via NoDeflect, which
      // never drops.
      handleEntityDeathDrop(target, 'enemyId' in target, gameState);
    }
  }
}

/**
 * Apply damage without checking deflect (used for reflected damage to prevent infinite loops).
 * Still checks shields and invulnerability.
 */
export function applyDamageToEntityNoDeflect(
  target: PlacedCharacter | PlacedEnemy,
  damage: number,
  gameState: GameState,
  deliveryKind?: Exclude<HitStampKind, 'any'>  // Hit-stamp kind; undefined deliveries stamp 'any' only
): void {
  // Victim-side hit stamp — before invulnerability, since stamps record
  // connection, not damage-got-through. Attacker dealtStamps for projectile
  // deliveries are handled at the applyEntityHit call sites (the caster
  // must be looked up in live state — this function has no source param).
  if (damage > 0) {
    stampHitLanded(target, undefined, deliveryKind, gameState);
  }

  // Check for invulnerability - if invulnerable, take no damage
  if (isInvulnerable(target)) {
    return;
  }

  let remainingDamage = damage;

  // Check for shield effects and absorb damage
  if (target.statusEffects) {
    for (const effect of target.statusEffects) {
      if (effect.type === StatusEffectType.SHIELD && remainingDamage > 0) {
        const shieldAmount = effect.value ?? 0;

        if (shieldAmount <= 0) {
          remainingDamage = 0;
        } else if (shieldAmount >= remainingDamage) {
          effect.value = shieldAmount - remainingDamage;
          remainingDamage = 0;
        } else {
          remainingDamage -= shieldAmount;
          effect.value = 0;
          effect.duration = 0;
        }
      }
    }

    target.statusEffects = target.statusEffects.filter(
      e => !(e.type === StatusEffectType.SHIELD && e.duration <= 0 && (e.value ?? 0) <= 0)
    );
  }

  if (remainingDamage > 0) {
    target.currentHealth -= remainingDamage;
    wakeFromSleep(target);
  }

  if (target.currentHealth <= 0) {
    const entityForTriggers: PlacedCharacter = {
      characterId: (target as PlacedCharacter).characterId || (target as PlacedEnemy).enemyId,
      party: target.party, // wrappers carry the explicit party through (engine/party.ts)
      excludeFromWinConditions: target.excludeFromWinConditions,
      x: target.x,
      y: target.y,
      facing: target.facing || Direction.EAST,
      currentHealth: target.currentHealth,
      actionIndex: (target as PlacedCharacter).actionIndex || (target as PlacedEnemy).actionIndex || 0,
      active: (target as PlacedCharacter).active ?? (target as PlacedEnemy).active ?? true,
      dead: false,
      parallelTrackers: target.parallelTrackers,
      statusEffects: target.statusEffects,
      spellCooldowns: target.spellCooldowns,
    };
    executeDeathTriggers(entityForTriggers, gameState);
    target.dead = true;
    // Stamp logical death turn once. Survives the pending→dead→pending
    // flip in applyEntityHit (visual mode sets dead=false right after),
    // so movement blockers can use it to keep the tile occupied through
    // the next turn's action phase — defeating the race where the
    // deferred pending→dead visual commit lands on different sides of
    // executeTurn between runs (making the tile flip between
    // "blocking" and "walkable corpse" non-deterministically).
    if (target.diedOnTurn === undefined) {
      target.diedOnTurn = gameState.currentTurn;
    }
  }
}

// ==========================================
// THROW/PLACE ITEM SYSTEM
// ==========================================

/**
 * Place a collectible item on the board from a Throw/Place spell.
 * Handles grace period, override permissions, and immediate pickup.
 */
export function placeCollectibleFromSpell(
  x: number,
  y: number,
  config: ThrowPlaceConfig,
  gameState: GameState
): void {
  const collectibleAsset = loadCollectible(config.collectibleId);
  if (!collectibleAsset) {
    console.warn(`placeCollectibleFromSpell: collectible not found: ${config.collectibleId}`);
    return;
  }

  const placedItem: PlacedCollectible = {
    collectibleId: config.collectibleId,
    x,
    y,
    collected: false,
    instanceId: `spell_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    spawnTurn: gameState.currentTurn,
    spawnTime: Date.now(),
    duration: config.duration,
    placedByEntityId: config.placerEntityId,
    placedByEntityType: config.placerEntityType,
    placerImmuneUntilTurn: gameState.currentTurn + config.gracePeriodTurns,
    placerPermanentlyImmune: config.placerPermanentlyImmune || undefined,
    overridePermissions: config.overridePermissions,
    sourceSpellId: config.sourceSpellId,
  };

  gameState.puzzle.collectibles.push(placedItem);

  // Check if any entity is standing on the landing tile for immediate pickup
  // Check characters
  for (const char of gameState.placedCharacters) {
    if (char.x === x && char.y === y && char.currentHealth > 0) {
      processCollectiblePickup(char, false, x, y, gameState);
      break;
    }
  }
  // Check enemies (if not already collected)
  if (!placedItem.collected) {
    for (const enemy of gameState.puzzle.enemies) {
      if (enemy.x === x && enemy.y === y && enemy.currentHealth > 0) {
        processCollectiblePickup(enemy, true, x, y, gameState);
        break;
      }
    }
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

  // Don't pick up despawning items
  if (collectible.despawning) return;

  // Check grace period / permanent placer immunity. Id by field fallback,
  // NOT by the party flag: movers arrive as hero-shaped wrappers
  // (characterId = enemyId, no enemyId field), so the old flag-based read
  // returned undefined for every enemy collector — enemy placers were
  // never recognized as their own item's placer (audit sweep 10).
  const entityId = (entity as PlacedCharacter).characterId || (entity as PlacedEnemy).enemyId;
  if (collectible.placedByEntityId && collectible.placedByEntityId === entityId) {
    if (collectible.placerPermanentlyImmune) return;
    if (collectible.placerImmuneUntilTurn !== undefined &&
        gameState.currentTurn < collectible.placerImmuneUntilTurn) return;
  }

  // Check pickup permissions (override takes priority over base)
  const permissions = collectible.overridePermissions || collectibleData.pickupPermissions;
  if (isEnemy && !permissions.enemies) return;
  if (!isEnemy && !permissions.characters) return;

  // Mark as collected (same field-fallback id as the grace check above)
  collectible.collected = true;
  collectible.collectedBy = entityId;
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

    case 'heal': {
      // Max-health lookup by ID, not by the party flag: `isEnemy` is now the
      // collector's ALLEGIANCE (a hero-party summon picks up as a hero) but
      // its asset still lives in the enemy registry. Char-then-enemy
      // fallback covers every shape (wrappers carry characterId = enemyId).
      const collectorId = (entity as PlacedCharacter).characterId || (entity as PlacedEnemy).enemyId;
      const maxHealth =
        getCharacter(collectorId)?.health ??
        getEnemy(collectorId)?.health ??
        entity.currentHealth;
      entity.currentHealth = Math.min(entity.currentHealth + (effect.amount ?? 0), maxHealth);
      break;
    }

    case 'damage':
      // Use centralized damage to respect shields (no source for trigger damage)
      applyDamageToEntityNoDeflect(entity, effect.amount ?? 0, gameState);
      break;

    case 'redirect': {
      if (isSteadfast(entity)) break; // Steadfast prevents direction changes
      const mode = effect.redirectMode || 'clockwise';
      const angle = effect.redirectAngle || 90;
      switch (mode) {
        case 'clockwise':
          entity.facing = turnRight(entity.facing || Direction.SOUTH, angle);
          break;
        case 'counter_clockwise':
          entity.facing = turnLeft(entity.facing || Direction.SOUTH, angle);
          break;
        case 'fixed':
          entity.facing = effect.redirectFixedDirection || Direction.NORTH;
          break;
      }
      break;
    }
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
 * Check if an entity has an active stealth effect.
 * (Exported for the vessel proximity hatch in simulation.ts.)
 */
export function isEntityStealthed(entity: PlacedCharacter | PlacedEnemy): boolean {
  if (!entity.statusEffects) return false;
  return entity.statusEffects.some(e => e.type === StatusEffectType.STEALTH);
}

/**
 * Check if an entity has an active charm effect (team allegiance inverted)
 */
// isEntityCharmed moved to engine/party.ts (imported above) — charm is part
// of the party model now: a temporary inversion on top of the base party.

/**
 * Find the nearest living members of a team RELATIVE to the caster, up to
 * maxTargets, sorted by distance (closest first).
 *
 * TEAM SEMANTICS (user decision 2026-07-11): 'opposing' selects entities
 * the caster may strike — party.ts isAttackTarget, i.e. the caster's
 * EFFECTIVE party (charm flips the caster's own aim) against the target's
 * BASE party (charm never changes who may aim at you — "outgoing only").
 * 'same' is the complement, excluding the caster itself. This replaces the
 * old array-literal findNearestEnemies/findNearestCharacters pair; callers
 * translate authored flags to a team via their authoring side.
 *
 * STEALTH (new baseline, user decision 2026-07-11): stealthed entities are
 * invisible to OPPOSING-team finds from BOTH sides — enemy auto-targeting
 * can no longer see a stealthed hero (the old guard for that was dead
 * code). Same-team finds still see them: allies can heal/buff a stealthed
 * friend. Stealth defeats targeting, not damage — sweeps and blasts that
 * cover the tile still connect.
 */
function findNearestTeamMembers(
  caster: PlacedCharacter,
  gameState: GameState,
  team: 'opposing' | 'same',
  maxTargets: number = 1,
  mode: 'omnidirectional' | 'cardinal' | 'diagonal' = 'omnidirectional',
  maxRange: number = 0  // 0 = unlimited
): Array<{ entity: PlacedCharacter | PlacedEnemy; direction: Direction; distance: number; enemyIndex: number }> {
  // Both lists, tracking the enemies-array index so the caller can
  // disambiguate duplicate enemyIds downstream (characters get -1).
  const livingTargets = [
    ...gameState.placedCharacters.map(c => ({ entity: c as PlacedCharacter | PlacedEnemy, enemyIndex: -1 })),
    ...gameState.puzzle.enemies.map((e, i) => ({ entity: e as PlacedCharacter | PlacedEnemy, enemyIndex: i })),
  ].filter(({ entity: e }) => {
    if (e.dead) return false;
    // Exclude pendingProjectileDeath: the entity is logically dead — a
    // hit has resolved but the visual hasn't caught up. Without this
    // filter, a second homing spell fired the same turn would pick this
    // entity as its target, then resolveProjectiles' target lookup (which
    // does exclude pendingDeath) falls back to .find() by enemyId and
    // returns a different instance sharing the same id. The bolt then
    // redirects to that instance mid-flight.
    if ((e as any).pendingProjectileDeath) return false;
    if (combatId(e) === caster.characterId) return false;
    const opposing = isAttackTarget(caster, e, gameState);
    if (team === 'opposing') {
      if (!opposing) return false;
      if (isEntityStealthed(e)) return false; // hidden from hostile senses
    } else {
      if (opposing) return false;
    }
    return true;
  });

  // Cardinal directions: N, S, E, W
  const cardinalDirections: Direction[] = [Direction.NORTH, Direction.SOUTH, Direction.EAST, Direction.WEST];

  // Diagonal directions: NE, SE, SW, NW
  const diagonalDirections: Direction[] = [Direction.NORTHEAST, Direction.SOUTHEAST, Direction.SOUTHWEST, Direction.NORTHWEST];

  const withDistance = livingTargets.map(({ entity, enemyIndex }) => ({
    entity,
    enemyIndex,
    distance: calculateDistance(caster.x, caster.y, entity.x, entity.y),
    direction: calculateDirectionTo(caster.x, caster.y, entity.x, entity.y),
  }));

  // Filter by directional mode
  let filtered = withDistance;
  if (mode === 'cardinal') {
    filtered = filtered.filter(t => cardinalDirections.includes(t.direction));
  } else if (mode === 'diagonal') {
    filtered = filtered.filter(t => diagonalDirections.includes(t.direction));
  }

  // Filter by max range if specified
  if (maxRange > 0) {
    filtered = filtered.filter(t => t.distance <= maxRange);
  }

  // Sort by distance (closest first; stable, so characters tie-break first)
  filtered.sort((a, b) => a.distance - b.distance);

  // Return up to maxTargets
  return filtered.slice(0, maxTargets);
}

/**
 * Find the nearest dead allies to an entity, up to maxTargets
 * Characters find dead characters, enemies find dead enemies
 * Returns array of {entity, direction, distance} sorted by distance (closest first)
 */
function findNearestDeadAllies(
  caster: PlacedCharacter,
  gameState: GameState,
  maxTargets: number = 1,
  mode: 'omnidirectional' | 'cardinal' | 'diagonal' = 'omnidirectional',
  maxRange: number = 0,  // 0 = unlimited
  side: 'same' | 'opposing' = 'same'  // 'same' = resurrect, 'opposing' = necromancy
): Array<{ entity: PlacedCharacter | PlacedEnemy; direction: Direction; distance: number; isEnemy: boolean }> {
  // Same-Team semantics for the dead (user decision 2026-07-11): the
  // caster resurrects its EFFECTIVE side's fallen — a charmed unit raises
  // its charmer's dead. Enemy-authored resurrectors now correctly raise
  // dead enemies (the old hero-viewpoint derivation had them raising dead
  // heroes). isEnemy stays a SHAPE flag — it tells the resurrect path
  // which asset registry the corpse's id lives in, regardless of party.
  // Necromancy inverts to the opposing side; the corpse's party is judged
  // by BASE party like every target-side check (charm ignored on corpses).
  const casterSide: EntityParty = effectiveParty(caster, gameState);
  const targetSide: EntityParty = side === 'same'
    ? casterSide
    : (casterSide === 'hero' ? 'enemy' : 'hero');

  const deadAllies: Array<{ entity: PlacedCharacter | PlacedEnemy; isEnemy: boolean }> = [
    ...gameState.placedCharacters,
    ...gameState.puzzle.enemies,
  ]
    .filter(t =>
      t.dead &&
      // Consumed/expired remains: a despawned entity left the board — there
      // is no corpse for resurrect OR necromancy to work with.
      !t.despawned &&
      combatId(t) !== caster.characterId &&
      entityParty(t, gameState) === targetSide
    )
    .map(t => ({ entity: t, isEnemy: 'enemyId' in t }));

  // Cardinal directions: N, S, E, W
  const cardinalDirections: Direction[] = [Direction.NORTH, Direction.SOUTH, Direction.EAST, Direction.WEST];

  // Diagonal directions: NE, SE, SW, NW
  const diagonalDirections: Direction[] = [Direction.NORTHEAST, Direction.SOUTHEAST, Direction.SOUTHWEST, Direction.NORTHWEST];

  // Calculate distance and direction to each dead ally
  const alliesWithDistance = deadAllies.map(ally => ({
    entity: ally.entity,
    isEnemy: ally.isEnemy,
    distance: calculateDistance(caster.x, caster.y, ally.entity.x, ally.entity.y),
    direction: calculateDirectionTo(caster.x, caster.y, ally.entity.x, ally.entity.y),
  }));

  // Filter by directional mode
  let filteredAllies = alliesWithDistance;
  if (mode === 'cardinal') {
    filteredAllies = filteredAllies.filter(a => cardinalDirections.includes(a.direction));
  } else if (mode === 'diagonal') {
    filteredAllies = filteredAllies.filter(a => diagonalDirections.includes(a.direction));
  }

  // Filter by max range if specified
  if (maxRange > 0) {
    filteredAllies = filteredAllies.filter(a => a.distance <= maxRange);
  }

  // Sort by distance (closest first)
  filteredAllies.sort((a, b) => a.distance - b.distance);

  // Return up to maxTargets
  return filteredAllies.slice(0, maxTargets);
}

/**
 * Execute push spell - push entities in the spell direction
 * The push direction can be 'away' (from caster), 'toward' (to caster), or 'spell_direction' (same as spell cast direction)
 */
function executePushSpell(
  caster: PlacedCharacter,
  spell: SpellAsset,
  castDirection: Direction,
  gameState: GameState
): void {
  const range = spell.range || 1; // How far to look for targets
  const pushDistance = spell.pushDistance || 1;
  const pushDirectionMode = spell.pushDirection || 'away';

  // Get direction offset for finding targets
  const offset = getDirectionOffset(castDirection);

  // Helper using shared wall-check logic
  const isTileWall = (tile: Tile | null | undefined): boolean =>
    isTileBlockingMovement(tile, gameState);

  // Find all entities in range along the spell direction
  const entitiesToPush: Array<{ entity: PlacedCharacter | PlacedEnemy; x: number; y: number; isEnemy: boolean }> = [];

  // Log all entity positions for debugging

  // Check each tile in the spell direction up to range
  for (let i = 1; i <= range; i++) {
    const checkX = Math.floor(caster.x + offset.dx * i);
    const checkY = Math.floor(caster.y + offset.dy * i);


    // Check bounds
    if (!isInBounds(checkX, checkY, gameState.puzzle.width, gameState.puzzle.height)) {
      break;
    }

    // Check for wall (including custom wall tiles)
    const tile = gameState.puzzle.tiles[checkY]?.[checkX];
    if (isTileWall(tile)) {
      break;
    }

    // Check for enemies at this position
    for (const enemy of gameState.puzzle.enemies) {
      if (enemy.dead) continue;
      const enemyTileX = Math.floor(enemy.x);
      const enemyTileY = Math.floor(enemy.y);
      if (enemyTileX === checkX && enemyTileY === checkY) {
        if (isSturdy(enemy)) continue;
        entitiesToPush.push({ entity: enemy, x: enemy.x, y: enemy.y, isEnemy: true });
      }
    }

    // Check for characters at this position (if spell can push allies)
    for (const char of gameState.placedCharacters) {
      if (char.dead) continue;
      if (char.characterId === caster.characterId) continue; // Don't push self
      const charTileX = Math.floor(char.x);
      const charTileY = Math.floor(char.y);
      if (charTileX === checkX && charTileY === checkY) {
        if (isSturdy(char)) continue;
        entitiesToPush.push({ entity: char, x: char.x, y: char.y, isEnemy: false });
      }
    }
  }


  // No entities to push
  if (entitiesToPush.length === 0) {
    return;
  }

  // Spawn cast effect on caster
  if (spell.sprites.castEffect) {
    spawnParticle(caster.x, caster.y, spell.sprites.castEffect, 300, gameState);
  }

  // Push each entity
  for (const targetInfo of entitiesToPush) {
    const target = targetInfo.entity;

    // Determine push direction
    let pushDirOffset: { dx: number; dy: number };
    if (pushDirectionMode === 'away') {
      // Push away from caster
      const dx = target.x - caster.x;
      const dy = target.y - caster.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) {
        pushDirOffset = getDirectionOffset(castDirection); // Fall back to cast direction
      } else {
        // Normalize and round to nearest cardinal/diagonal
        pushDirOffset = { dx: Math.sign(dx), dy: Math.sign(dy) };
      }
    } else if (pushDirectionMode === 'toward') {
      // Push toward caster
      const dx = caster.x - target.x;
      const dy = caster.y - target.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) {
        pushDirOffset = getDirectionOffset(turnAround(castDirection));
      } else {
        pushDirOffset = { dx: Math.sign(dx), dy: Math.sign(dy) };
      }
    } else {
      // spell_direction - push in same direction as spell was cast
      pushDirOffset = getDirectionOffset(castDirection);
    }

    // Calculate final position after push
    let finalX = target.x;
    let finalY = target.y;
    let tilesActuallyPushed = 0;

    for (let i = 0; i < pushDistance; i++) {
      const nextX = finalX + pushDirOffset.dx;
      const nextY = finalY + pushDirOffset.dy;

      // Check bounds
      if (!isInBounds(Math.floor(nextX), Math.floor(nextY), gameState.puzzle.width, gameState.puzzle.height)) break;

      // Check for wall (including custom wall tiles)
      const nextTile = gameState.puzzle.tiles[Math.floor(nextY)]?.[Math.floor(nextX)];
      if (isTileWall(nextTile)) break;

      // Check for other entities at this position (can't push into occupied tile)
      let tileOccupied = false;
      for (const enemy of gameState.puzzle.enemies) {
        if (enemy.dead || enemy === target) continue;
        if (Math.floor(enemy.x) === Math.floor(nextX) && Math.floor(enemy.y) === Math.floor(nextY)) {
          tileOccupied = true;
          break;
        }
      }
      if (!tileOccupied) {
        for (const char of gameState.placedCharacters) {
          if (char.dead || char === target) continue;
          if (Math.floor(char.x) === Math.floor(nextX) && Math.floor(char.y) === Math.floor(nextY)) {
            tileOccupied = true;
            break;
          }
        }
      }
      if (tileOccupied) break;

      finalX = nextX;
      finalY = nextY;
      tilesActuallyPushed++;
    }


    // Apply push (move entity to final position)
    if (tilesActuallyPushed > 0) {
      target.x = finalX;
      target.y = finalY;

      // Spawn visual effect on pushed entity
      if (spell.sprites.damageEffect) {
        spawnParticle(finalX, finalY, spell.sprites.damageEffect, 400, gameState);
      }

      // Apply damage if spell has damage - use centralized damage for shields
      if (spell.damage && spell.damage > 0) {
        applyDamageToEntity(target, spell.damage, gameState, caster);
      }
    }
  }
}

/**
 * Execute resurrect spell - bring a dead ally back to life
 */
function executeResurrect(
  caster: PlacedCharacter,
  spell: SpellAsset,
  action: CharacterAction,
  gameState: GameState
): void {
  // Find dead allies to resurrect.
  // Mirror the auto-target inheritance from the regular cast path:
  // autoTargetRange wins when set; otherwise inherit the trigger's eventRange
  // (so a "resurrect when ally dies in range N" trigger naturally also looks
  // for dead allies within range N). Falls through to 0 (unlimited) when
  // neither is configured — typical for purely interval-driven resurrects.
  const maxTargets = action.maxTargets || 1;
  const targetMode = action.autoTargetMode || 'omnidirectional';
  const maxRange = action.autoTargetRange || action.trigger?.eventRange || 0;
  const nearestDeadAllies = findNearestDeadAllies(caster, gameState, maxTargets, targetMode, maxRange);

  if (nearestDeadAllies.length === 0) {
    // No dead allies to resurrect
    return;
  }

  // Process each target
  for (const target of nearestDeadAllies) {
    const entity = target.entity;

    // Get max health for the entity
    let maxHealth: number;
    if (target.isEnemy) {
      const enemyData = getEnemy((entity as PlacedEnemy).enemyId);
      maxHealth = enemyData?.health || entity.currentHealth || 1;
    } else {
      const charData = getCharacter((entity as PlacedCharacter).characterId);
      maxHealth = charData?.health || entity.currentHealth || 1;
    }

    // Calculate restored health (default 100%)
    const healthPercent = spell.resurrectHealthPercent ?? 100;
    const restoredHealth = Math.max(1, Math.floor(maxHealth * (healthPercent / 100)));

    // Resurrect the entity
    entity.dead = false;
    entity.currentHealth = restoredHealth;

    // Spawn visual effect on resurrected entity
    if (spell.sprites.damageEffect) {
      spawnParticle(entity.x, entity.y, spell.sprites.damageEffect, 500, gameState);
    }

    // Spawn cast effect on caster
    if (spell.sprites.castEffect) {
      spawnParticle(caster.x, caster.y, spell.sprites.castEffect, 300, gameState);
    }
  }
}

/**
 * NECROMANCY — raise an opposing-party corpse as a NEW combatant on the
 * caster's side. Locked design: the original death already happened and
 * still counts for win conditions; the corpse entry stays dead and is
 * CONSUMED (despawned — corpse art vanishes, can't be raised again), while
 * a fresh win-exempt entity spawns on its tile via the summon primitive,
 * inheriting all the summon overrides (duration, facing, starting status,
 * overlays) plus resurrect's health-percent convention.
 *
 * v1 limitation: only corpses living in puzzle.enemies can be raised —
 * a dead HERO (placedCharacters shape) has no enemy-asset id to respawn
 * from, and character-shaped combatants in the enemies array are the shape
 * landmine the party-model notes warn about. Enemy-cast necromancy is
 * therefore inert against hero corpses until that lands.
 */
function executeNecromancy(
  caster: PlacedCharacter,
  spell: SpellAsset,
  action: CharacterAction,
  gameState: GameState
): void {
  const maxTargets = action.maxTargets || 1;
  const targetMode = action.autoTargetMode || 'omnidirectional';
  const maxRange = action.autoTargetRange || action.trigger?.eventRange || 0;
  const corpses = findNearestDeadAllies(caster, gameState, maxTargets, targetMode, maxRange, 'opposing');

  for (const target of corpses) {
    if (!target.isEnemy) continue; // v1: hero corpses can't be raised (see above)
    const corpse = target.entity as PlacedEnemy;

    // The corpse tile must not hold a living (or freshly-dead) entity —
    // same deterministic occupancy rule as summon placement. The corpse
    // itself is expected here and doesn't block its own raise.
    const blockedByEntity =
      gameState.puzzle.enemies.some(e =>
        e !== corpse &&
        Math.floor(e.x) === Math.floor(corpse.x) && Math.floor(e.y) === Math.floor(corpse.y) &&
        (!e.dead || isFreshlyDead(e, gameState.currentTurn))) ||
      gameState.placedCharacters.some(c =>
        Math.floor(c.x) === Math.floor(corpse.x) && Math.floor(c.y) === Math.floor(corpse.y) &&
        (!c.dead || isFreshlyDead(c, gameState.currentTurn)));
    if (blockedByEntity) continue;

    // Facing override — the "spawn axis" for relative modes is the line
    // from caster to corpse (target.direction from the finder).
    let raiseFacing: Direction | undefined;
    switch (spell.summonFacing) {
      case 'away_from_summoner': raiseFacing = target.direction; break;
      case 'toward_summoner': raiseFacing = turnAround(target.direction); break;
      case 'match_summoner': raiseFacing = caster.facing; break;
      case 'fixed': raiseFacing = spell.summonFacingFixed; break;
    }

    const raised = spawnEnemyMidGame(gameState, {
      enemyId: corpse.enemyId,
      x: Math.floor(corpse.x),
      y: Math.floor(corpse.y),
      facing: raiseFacing,
      party: effectiveParty(caster, gameState),
      excludeFromWinConditions: true,
      durationTurns: spell.summonDuration,
      sourceSpellId: spell.id,
      startingStatus: spell.summonStartingStatus,
      healthPercent: spell.resurrectHealthPercent,
    });
    if (!raised) continue;

    // Consume the corpse: stays dead (its death already counted), draws
    // nothing anymore, and no resurrect/necromancy can touch it again.
    corpse.despawned = true;

    if (spell.sprites.castEffect) {
      spawnParticle(caster.x, caster.y, spell.sprites.castEffect, 300, gameState);
    }
    if (spell.sprites.summonEffect) {
      spawnParticle(raised.x, raised.y, spell.sprites.summonEffect, 600, gameState, undefined, { aboveEntities: true });
    }
  }
}

// ==========================================
// TRIGGER SYSTEM (Phase 2)
// ==========================================

/**
 * Map legacy ABSOLUTE trigger events to the team-relative vocabulary, by
 * AUTHORING SIDE — the same convention authored auto-target flags resolve
 * with (enemy-authored "NearestCharacter" = opposing): hero Characters wrote
 * "enemy_*" to mean opponents; enemy-shaped assets (enemies, allies, vessels)
 * wrote "character_*" to mean opponents. Read-time only — stored assets keep
 * their legacy values, nothing is migrated. This is also what fixes allies:
 * an ally's enemy-shaped "character_adjacent" now senses its OPPONENTS
 * instead of the hero party it fights for.
 */
export function resolveTriggerEvent(event: TriggerEvent, authoredAsEnemy: boolean): TriggerEvent {
  switch (event) {
    case 'enemy_adjacent':         return authoredAsEnemy ? 'same_team_adjacent'    : 'opposing_adjacent';
    case 'enemy_in_range':         return authoredAsEnemy ? 'same_team_in_range'    : 'opposing_in_range';
    case 'contact_with_enemy':     return authoredAsEnemy ? 'contact_with_same_team' : 'contact_with_opposing';
    case 'character_adjacent':     return authoredAsEnemy ? 'opposing_adjacent'      : 'same_team_adjacent';
    case 'character_in_range':     return authoredAsEnemy ? 'opposing_in_range'      : 'same_team_in_range';
    case 'contact_with_character': return authoredAsEnemy ? 'contact_with_opposing'  : 'contact_with_same_team';
    default: return event;
  }
}

/**
 * Check if a trigger condition is met for a character
 */
export function checkTriggerCondition(
  character: PlacedCharacter,
  event: TriggerEvent,
  eventRange: number | undefined,
  gameState: GameState,
  eventValue?: number, // numeric parameter for the value-based conditions (% / turn / count)
  eventWindow?: HitStampWindow // freshness window for the hit-stamp conditions
): boolean {
  // Proximity events are TEAM-RELATIVE, resolved against the holder's BASE
  // party — charm-blind, like the finders in engine/party.ts ("opposing"
  // senses whoever the holder really fights, charmed or not). Legacy
  // absolute events map through resolveTriggerEvent by authoring side so
  // existing assets keep their meaning. Same-team events EXCLUDE the holder
  // itself (else they are always true — the ally bug this redesign fixed)
  // and DO see stealthed teammates; opposing events never see stealthed
  // entities. Both match the findNearestTeamMembers stealth baseline.
  const holderSide = entityParty(character, gameState);
  const opposingSide: EntityParty = holderSide === 'hero' ? 'enemy' : 'hero';

  // Self-identity across the enemy→character wrapper boundary: instanceKey
  // when both sides carry the executeTurn stamp (duplicate same-asset
  // entities share ids, so ids cannot discriminate), reference equality as
  // the fallback for direct calls with the real entity object.
  const isSelf = (t: PlacedCharacter | PlacedEnemy): boolean =>
    t === (character as PlacedCharacter | PlacedEnemy) ||
    (!!character.instanceKey && t.instanceKey === character.instanceKey);

  const livingMembers = (side: EntityParty): Array<PlacedCharacter | PlacedEnemy> =>
    [...gameState.placedCharacters, ...gameState.puzzle.enemies].filter(t =>
      isEntityFunctional(t) && entityParty(t, gameState) === side
    );
  const opposingMembers = () => livingMembers(opposingSide).filter(t => !isEntityStealthed(t));
  const sameTeamMembers = () => livingMembers(holderSide).filter(t => !isSelf(t));

  const anyWithin = (targets: Array<PlacedCharacter | PlacedEnemy>, maxDistance: number) =>
    targets.some(t => calculateDistance(character.x, character.y, t.x, t.y) <= maxDistance);
  const anyOnMyTile = (targets: Array<PlacedCharacter | PlacedEnemy>) =>
    targets.some(t => t.x === character.x && t.y === character.y);

  const ADJACENT = 1.42; // sqrt(2) for diagonal adjacency

  // Hit-stamp freshness (user design 2026-07-14). 'previous_action' spans
  // this turn AND the one before — projectiles resolve after actions, so a
  // turn-N bolt hit must still be reactable during turn N+1's action phase.
  // 'this_cycle' measures from the last REPEAT / REPEAT_UNTIL loop-back
  // (unset = 0, i.e. since the game started). 'ever' is sticky.
  const stampFresh = (stamp: number | undefined): boolean => {
    if (stamp === undefined) return false;
    switch (eventWindow ?? 'previous_action') {
      case 'ever': return true;
      case 'this_cycle': return stamp >= (character.cycleStartTurn ?? 0);
      case 'previous_action': return stamp >= gameState.currentTurn - 1;
    }
  };

  switch (resolveTriggerEvent(event, !getCharacter(character.characterId))) {
    case 'hit_by_melee':        return stampFresh(character.hitStamps?.melee);
    case 'hit_by_projectile':   return stampFresh(character.hitStamps?.projectile);
    case 'hit_by_contact':      return stampFresh(character.hitStamps?.contact);
    case 'hit_by_any':          return stampFresh(character.hitStamps?.any);
    case 'landed_melee_hit':      return stampFresh(character.dealtStamps?.melee);
    case 'landed_projectile_hit': return stampFresh(character.dealtStamps?.projectile);
    case 'landed_contact_hit':    return stampFresh(character.dealtStamps?.contact);
    case 'landed_any_hit':        return stampFresh(character.dealtStamps?.any);
    case 'opposing_adjacent':
      return anyWithin(opposingMembers(), ADJACENT);

    case 'opposing_in_range':
      return anyWithin(opposingMembers(), eventRange || 3);

    case 'contact_with_opposing':
      return anyOnMyTile(opposingMembers());

    case 'same_team_adjacent':
      return anyWithin(sameTeamMembers(), ADJACENT);

    case 'same_team_in_range':
      return anyWithin(sameTeamMembers(), eventRange || 3);

    case 'contact_with_same_team':
      return anyOnMyTile(sameTeamMembers());

    case 'health_below_pct': {
      // Parameterized generalization of health_below_50 (same id fallback;
      // combatId also tolerates a raw PlacedEnemy holder).
      const pct = eventValue ?? 50;
      const holderId = combatId(character);
      const maxHealth = getCharacter(holderId)?.health ?? getEnemy(holderId)?.health;
      if (maxHealth === undefined) return false;
      return character.currentHealth < maxHealth * (pct / 100);
    }

    case 'same_team_health_below_pct': {
      // Any TEAMMATE (self excluded — combine with health_below_pct for
      // self) under the threshold. Raw list entities, so shape-based asset
      // lookup is safe here (wrappers never appear in the state arrays).
      const pct = eventValue ?? 50;
      return sameTeamMembers().some(t => {
        const maxHealth = 'enemyId' in t
          ? getEnemy(t.enemyId)?.health
          : (getCharacter(t.characterId)?.health ?? getEnemy(t.characterId)?.health);
        if (maxHealth === undefined) return false;
        return t.currentHealth < maxHealth * (pct / 100);
      });
    }

    case 'noble_in_danger': {
      // An opposing entity within eventRange tiles of any living SAME-TEAM
      // Noble (asset isNoble — hero Characters and allies; mirrors
      // getPlacedNobles in simulation.ts). Nobles are a hero-party concept,
      // so enemy-side holders simply never fire this. Threats are
      // stealth-filtered like all opposing sensing.
      const dangerRange = eventRange || 2;
      const nobles = livingMembers(holderSide).filter(t =>
        'enemyId' in t ? !!getEnemy(t.enemyId)?.isNoble : !!getCharacter(t.characterId)?.isNoble
      );
      if (nobles.length === 0) return false;
      const threats = opposingMembers();
      return nobles.some(noble =>
        threats.some(t => calculateDistance(noble.x, noble.y, t.x, t.y) <= dangerRange)
      );
    }

    case 'turn_reached':
      // currentTurn increments at the top of executeTurn, so "turn N" fires
      // during turn N's processing — the author-facing turn number.
      return gameState.currentTurn >= (eventValue ?? 1);

    case 'opposing_count_at_most':
      // Board-state census, not a sense — stealth does NOT hide from counts
      // (0 = "all opponents defeated" must be truthful).
      return livingMembers(opposingSide).length <= (eventValue ?? 0);

    case 'same_team_count_at_most':
      // Self excluded, consistent with all same-team vocabulary.
      return livingMembers(holderSide).filter(t => !isSelf(t)).length <= (eventValue ?? 0);

    case 'standing_on_goal':
      return gameState.puzzle.tiles[character.y]?.[character.x]?.type === TileType.GOAL;

    case 'repeated_times':
      // REPEAT_UNTIL-only: needs the block's pass counter, which lives on
      // the entity keyed by action index — the loop branches in
      // simulation.ts resolve it there. False everywhere else (a parallel
      // trigger can't meaningfully ask it).
      return false;

    case 'wall_ahead': {
      // Check if there's a wall in front of the character (includes custom wall tiles)
      const { dx, dy } = getDirectionOffset(character.facing);
      const checkX = character.x + dx;
      const checkY = character.y + dy;

      if (!isInBounds(checkX, checkY, gameState.puzzle.width, gameState.puzzle.height)) {
        return true;
      }

      return isTileBlockingMovement(gameState.puzzle.tiles[checkY]?.[checkX], gameState);
    }

    case 'health_below_50': {
      // Check if the holder's health is below 50%. Char-then-enemy id
      // fallback: enemy wrappers carry enemyId as characterId, so the
      // character-only lookup silently returned false for every enemy,
      // ally, and vessel (same shape-check bug as the heal-cap fix).
      const holderId = combatId(character);
      const maxHealth = getCharacter(holderId)?.health ?? getEnemy(holderId)?.health;
      if (maxHealth === undefined) return false;
      return character.currentHealth < maxHealth * 0.5;
    }

    case 'on_death':
      // Death trigger is handled specially via executeDeathTriggers()
      // This condition returns false because death triggers are only fired
      // at the moment of death, not during normal trigger evaluation
      return false;

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
        gameState,
        action.trigger.eventValue,
        action.trigger.eventWindow
      );

      if (triggered) {
        // Trigger determines WHEN the action fires, not WHERE it aims
        // Direction is controlled by the action's own targeting settings
        const updatedCharacter = executeAction(character, action, gameState);
        Object.assign(character, updatedCharacter);
      }
    }
  });
}

/**
 * Execute death triggers for an entity that is about to die
 * This should be called BEFORE the entity is marked as dead, so the spell can still execute
 * Returns true if any death triggers were executed
 */
export function executeDeathTriggers(
  character: PlacedCharacter,
  gameState: GameState
): boolean {
  // Try to get character data first, then fall back to enemy data
  const charData = getCharacter(character.characterId);
  const enemyData = !charData ? getEnemy(character.characterId) : null;

  // Get the behavior array from character or enemy
  let behaviorActions: CharacterAction[] | undefined;

  if (charData?.behavior) {
    behaviorActions = charData.behavior;
  } else if (enemyData?.behavior?.pattern) {
    behaviorActions = enemyData.behavior.pattern;
  }

  if (!behaviorActions) {
    return false;
  }

  let triggeredAny = false;

  // Check each action for on_death triggers
  behaviorActions.forEach((action: CharacterAction) => {
    if (action.trigger?.mode === 'on_event' && action.trigger.event === 'on_death') {
      // Execute the death trigger action
      // The entity is still alive at this point, so the spell can execute properly
      const updatedCharacter = executeAction(character, action, gameState);
      Object.assign(character, updatedCharacter);
      triggeredAny = true;
    }
  });

  return triggeredAny;
}
