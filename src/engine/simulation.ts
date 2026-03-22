/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, no-case-declarations, prefer-const */
import type { GameState, PlacedCharacter, PlacedEnemy, ParallelActionTracker, StatusEffectInstance, SpellTemplate, SpellAsset, PlacedCollectible, CharacterAction, Puzzle, Projectile, SpriteReference } from '../types/game';
import { ActionType, Direction, StatusEffectType, TileType as TileTypeEnum } from '../types/game';
import { getCharacter } from '../data/characters';
import { getEnemy } from '../data/enemies';
import { executeAction, executeAOEAttack, evaluateTriggers, executeDeathTriggers, applyDamageToEntity, applyDamageToEntityNoDeflect } from './actions';
import { loadStatusEffectAsset, loadSpellAsset, loadCollectible, loadEnemy, loadCharacter, loadTileType } from '../utils/assetStorage';
import { turnLeft, turnRight, turnAround, getDirectionOffset, calculateDirectionTo, isAttackFromBehind } from './utils';

/**
 * BFS pathfinding: find shortest path from start to target avoiding walls.
 * Returns array of tile positions, or empty array if no path exists.
 */
function findPathBFS(
  startX: number, startY: number,
  targetX: number, targetY: number,
  gameState: GameState
): Array<{x: number; y: number}> {
  const sx = Math.floor(startX), sy = Math.floor(startY);
  const tx = Math.floor(targetX), ty = Math.floor(targetY);
  if (sx === tx && sy === ty) return [{x: sx, y: sy}];

  const width = gameState.puzzle.width;
  const height = gameState.puzzle.height;
  const visited = new Set<string>();
  const queue: Array<{x: number; y: number; path: Array<{x: number; y: number}>}> = [];

  visited.add(`${sx},${sy}`);
  queue.push({x: sx, y: sy, path: [{x: sx, y: sy}]});

  // 8-directional movement
  const dirs = [
    {dx: 0, dy: -1}, {dx: 1, dy: -1}, {dx: 1, dy: 0}, {dx: 1, dy: 1},
    {dx: 0, dy: 1}, {dx: -1, dy: 1}, {dx: -1, dy: 0}, {dx: -1, dy: -1},
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const dir of dirs) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      const key = `${nx},${ny}`;

      if (visited.has(key)) continue;
      if (!isInBounds(nx, ny, width, height)) continue;

      const tile = gameState.puzzle.tiles[ny]?.[nx];
      const isWall = !tile || tile.type === TileTypeEnum.WALL;

      // Allow target tile even if it's technically blocked
      if (isWall && !(nx === tx && ny === ty)) continue;

      visited.add(key);
      const newPath = [...current.path, {x: nx, y: ny}];

      if (nx === tx && ny === ty) return newPath;

      queue.push({x: nx, y: ny, path: newPath});
    }
  }

  // No path found — fall back to direct line
  return getTilesAlongLine(startX, startY, targetX, targetY);
}

/**
 * For grid homing with hit-along-path: check each tile for non-target entities and apply damage
 */
function checkHomingPathForHits(proj: Projectile, tiles: Array<{x: number; y: number}>, gameState: GameState): void {
  if (!proj.hitEntityIds) proj.hitEntityIds = [];
  const isHealingProjectile = proj.attackData.healing !== undefined;
  if (isHealingProjectile) return; // Don't damage along path for healing spells

  const effectivelyCharFired = proj.teamSwapped ? !!proj.sourceEnemyId : !!proj.sourceCharacterId;
  const effectivelyEnemyFired = proj.teamSwapped ? !!proj.sourceCharacterId : !!proj.sourceEnemyId;

  for (const tile of tiles) {
    // Skip the starting tile
    if (tile.x === Math.floor(proj.x) && tile.y === Math.floor(proj.y)) continue;

    if (effectivelyCharFired) {
      // Check for enemy hits
      const hitEnemy = gameState.puzzle.enemies.find(
        e => !e.dead && !e.pendingProjectileDeath &&
             Math.floor(e.x) === tile.x && Math.floor(e.y) === tile.y &&
             !proj.hitEntityIds!.includes(e.enemyId) &&
             e.enemyId !== proj.targetEntityId // Don't hit designated target along path
      );
      if (hitEnemy) {
        proj.hitEntityIds!.push(hitEnemy.enemyId);
        const baseDmg = proj.attackData.damage ?? 0;
        const isCrit = proj.attackData.backstabEnabled && isAttackFromBehind(proj.direction, hitEnemy.facing);
        const damage = isCrit ? baseDmg * 2 : baseDmg;
        hitEnemy.visualHealth = hitEnemy.currentHealth;
        applyDamageToEntityNoDeflect(hitEnemy, damage, gameState);
        if (hitEnemy.dead) {
          hitEnemy.dead = false;
          hitEnemy.pendingProjectileDeath = true;
        }
        if (!proj.attackData.projectilePierces) break;
      }
    } else if (effectivelyEnemyFired) {
      // Check for character hits
      const hitChar = gameState.placedCharacters.find(
        c => !c.dead && !c.pendingProjectileDeath &&
             Math.floor(c.x) === tile.x && Math.floor(c.y) === tile.y &&
             !proj.hitEntityIds!.includes(c.characterId) &&
             c.characterId !== proj.targetEntityId
      );
      if (hitChar) {
        proj.hitEntityIds!.push(hitChar.characterId);
        const baseDmg = proj.attackData.damage ?? 0;
        const isCrit = proj.attackData.backstabEnabled && isAttackFromBehind(proj.direction, hitChar.facing);
        const damage = isCrit ? baseDmg * 2 : baseDmg;
        hitChar.visualHealth = hitChar.currentHealth;
        applyDamageToEntityNoDeflect(hitChar, damage, gameState);
        if (hitChar.dead) {
          hitChar.dead = false;
          hitChar.pendingProjectileDeath = true;
        }
        if (!proj.attackData.projectilePierces) break;
      }
    }
  }
}

/**
 * Check if an entity has the deflect status effect
 */
function hasDeflect(entity: PlacedCharacter | PlacedEnemy): boolean {
  if (!entity.statusEffects) return false;
  return entity.statusEffects.some(
    e => e.type === StatusEffectType.DEFLECT || e.type === 'deflect'
  );
}

/**
 * Check if an entity is invulnerable (has INVULNERABLE status effect)
 */
function isInvulnerable(entity: PlacedCharacter | PlacedEnemy): boolean {
  if (!entity.statusEffects) return false;
  return entity.statusEffects.some(
    e => e.type === StatusEffectType.INVULNERABLE || e.type === 'invulnerable'
  );
}

/**
 * Check if an entity is steadfast (immune to direction changes)
 */
function isSteadfast(entity: PlacedCharacter | PlacedEnemy): boolean {
  if (!entity.statusEffects) return false;
  return entity.statusEffects.some(
    e => e.type === StatusEffectType.STEADFAST || e.type === 'steadfast'
  );
}

/**
 * Check if an entity has the reflect status effect
 */
function hasReflect(entity: PlacedCharacter | PlacedEnemy): boolean {
  if (!entity.statusEffects) return false;
  return entity.statusEffects.some(
    e => e.type === StatusEffectType.REFLECT || e.type === 'reflect'
  );
}

/**
 * Check if a projectile's approach direction falls within the reflect effect's allowed zones.
 * Zones are relative to the entity's facing: front, back, left, right (each ± 45°).
 */
function canReflectDirection(entity: PlacedCharacter | PlacedEnemy, projectileDirection: Direction): boolean {
  if (!entity.statusEffects) return false;
  const reflectEffect = entity.statusEffects.find(
    e => e.type === StatusEffectType.REFLECT || e.type === 'reflect'
  );
  if (!reflectEffect) return false;
  const asset = loadStatusEffectAsset(reflectEffect.statusAssetId);
  if (!asset) return true; // No asset = reflect all
  const dirs = asset.reflectDirections;
  if (!dirs || dirs.length === 0 || dirs.length === 4) return true; // All directions or not configured

  const entityFacing = entity.facing || Direction.NORTH;
  // Approach direction = where the projectile is coming FROM (opposite of travel direction)
  const approachDir = turnAround(projectileDirection);

  // Check each allowed zone
  for (const zone of dirs) {
    let zoneCenter: Direction;
    switch (zone) {
      case 'front': zoneCenter = entityFacing; break;
      case 'back': zoneCenter = turnAround(entityFacing); break;
      case 'left': zoneCenter = turnLeft(entityFacing, 90); break;
      case 'right': zoneCenter = turnRight(entityFacing, 90); break;
      default: continue;
    }
    // Match if approach direction is within ± 45° of zone center
    if (approachDir === zoneCenter ||
        approachDir === turnLeft(zoneCenter, 45) ||
        approachDir === turnRight(zoneCenter, 45)) {
      return true;
    }
  }
  return false;
}

/**
 * Get the reflect status effect's visual config from an entity's active reflect effect.
 * Returns the tint color and override sprite from the StatusEffectAsset.
 */
function getReflectVisuals(entity: PlacedCharacter | PlacedEnemy): { tintColor?: string; overrideSprite?: SpriteReference } {
  if (!entity.statusEffects) return {};
  const reflectEffect = entity.statusEffects.find(
    e => e.type === StatusEffectType.REFLECT || e.type === 'reflect'
  );
  if (!reflectEffect) return {};
  const asset = loadStatusEffectAsset(reflectEffect.statusAssetId);
  if (!asset) return {};
  return {
    tintColor: asset.reflectTintColor,
    overrideSprite: asset.reflectOverrideSprite,
  };
}

/**
 * Reflect a projectile off an entity with the Reflect status effect.
 * Reverses direction, swaps team targeting, disables bouncing, and applies visual treatment.
 * Returns true if the projectile was reflected.
 */
function reflectProjectile(
  proj: Projectile,
  reflector: PlacedCharacter | PlacedEnemy,
  gameState: GameState,
  now: number
): boolean {
  // Can't reflect an already-reflected projectile (prevents ping-pong)
  if (proj.reflected) return false;
  // Only reflect damage/redirect projectiles, not healing
  if (proj.attackData.healing !== undefined) return false;

  const visuals = getReflectVisuals(reflector);

  // Mark as reflected
  proj.reflected = true;
  proj.teamSwapped = !proj.teamSwapped; // Flip targeting
  proj.reflectTintColor = visuals.tintColor || '#ff0000';
  proj.reflectOverrideSprite = visuals.overrideSprite;

  // Disable all bouncing — reflected projectiles travel in a straight line
  proj.bounceOffWalls = false;
  proj.maxBounces = 0;
  proj.bounceCount = 0;

  // Reverse direction 180°
  proj.direction = turnAround(proj.direction);
  const offset = getDirectionOffset(proj.direction);

  // For homing projectiles: retarget back to the caster
  if (proj.isHoming) {
    let casterEntity: { x: number; y: number } | undefined;
    let casterIndex: number | undefined;
    if (proj.sourceCharacterId) {
      casterEntity = gameState.placedCharacters.find(c => c.characterId === proj.sourceCharacterId && !c.dead);
    } else if (proj.sourceEnemyId) {
      // Use sourceEnemyIndex to find the exact enemy instance (duplicate enemies share IDs)
      if (proj.sourceEnemyIndex !== undefined && gameState.puzzle.enemies[proj.sourceEnemyIndex]) {
        const enemy = gameState.puzzle.enemies[proj.sourceEnemyIndex];
        if (!enemy.dead) {
          casterEntity = enemy;
          casterIndex = proj.sourceEnemyIndex;
        }
      }
      // Fallback to ID-based lookup if index didn't work
      if (!casterEntity) {
        casterEntity = gameState.puzzle.enemies.find(e => e.enemyId === proj.sourceEnemyId && !e.dead);
      }
    }
    if (casterEntity) {
      proj.targetX = casterEntity.x;
      proj.targetY = casterEntity.y;
      // Swap homing target type
      proj.targetIsEnemy = !proj.targetIsEnemy;
      if (proj.sourceCharacterId) {
        proj.targetEntityId = proj.sourceCharacterId;
      } else if (proj.sourceEnemyId) {
        proj.targetEntityId = proj.sourceEnemyId;
        // Store the specific enemy index so homing tracks the right instance
        proj.sourceEnemyIndex = casterIndex ?? proj.sourceEnemyIndex;
      }
    } else {
      // Caster is dead — disable homing, just fly straight
      proj.isHoming = false;
    }
  }

  // Recompute position and path from reflector's position
  const startX = Math.floor(reflector.x);
  const startY = Math.floor(reflector.y);
  const range = proj.attackData.range ?? 5;

  proj.x = startX;
  proj.y = startY;
  proj.startX = startX;
  proj.startY = startY;
  if (!proj.isHoming) {
    proj.targetX = startX + offset.dx * range;
    proj.targetY = startY + offset.dy * range;
  }
  proj.startTime = now;

  // Recompute tile path
  if (proj.tilePath) {
    proj.tilePath = computeTilePathWithWallLookahead(startX, startY, proj.targetX, proj.targetY, gameState);
    proj.currentTileIndex = 0;
    proj.tileEntryTime = now;
  }

  // Clear piercing tracking so reflected projectile can hit new targets
  proj.hitEntityIds = [(reflector as any).characterId || (reflector as any).enemyId];

  // Spawn reflect VFX
  gameState.activeParticles = gameState.activeParticles || [];
  gameState.activeParticles.push({
    id: `reflect_vfx_${proj.id}_${Date.now()}`,
    sprite: visuals.overrideSprite || { type: 'inline', spriteData: { shape: 'circle', primaryColor: visuals.tintColor || '#06b6d4' } },
    x: reflector.x,
    y: reflector.y,
    startTime: now,
    duration: 300,
    scale: 0.8,
  });

  return true;
}

/**
 * Apply damage with deflect checking for projectiles.
 * Uses centralized damage function to respect shields.
 * Returns true if damage was deflected (and applied to source instead) OR if target is invulnerable
 */
function applyProjectileDamageWithDeflect(
  target: PlacedCharacter | PlacedEnemy,
  damage: number,
  sourceCharacterId: string | undefined,
  sourceEnemyId: string | undefined,
  gameState: GameState
): boolean {
  // Check for invulnerability - if invulnerable, take no damage
  if (isInvulnerable(target)) {
    return true; // Treat as "absorbed" - no damage applied
  }

  // Check for deflect
  if (hasDeflect(target)) {
    // Find the source entity to reflect damage back to
    let sourceEntity: PlacedCharacter | PlacedEnemy | undefined;

    if (sourceCharacterId) {
      sourceEntity = gameState.placedCharacters.find(c => c.characterId === sourceCharacterId && !c.dead);
    } else if (sourceEnemyId) {
      sourceEntity = gameState.puzzle.enemies.find(e => e.enemyId === sourceEnemyId && !e.dead);
    }

    if (sourceEntity) {
      // Apply damage to source using centralized function (no deflect to prevent loops)
      applyDamageToEntityNoDeflect(sourceEntity, damage, gameState);

      // Handle death drop if entity died
      if (sourceEntity.dead) {
        handleEntityDeathDrop(sourceEntity, 'enemyId' in sourceEntity, gameState);
      }

      return true; // Damage was deflected
    }
  }

  return false; // No deflect, apply damage normally
}

/**
 * Floor a number with epsilon tolerance to handle floating point issues
 * Math.floor(-0.0000001) would give -1, but we want 0
 */
function safeFloor(n: number): number {
  // Handle negative zero explicitly
  if (Object.is(n, -0)) {
    return 0;
  }
  // Round to nearest integer if very close (within epsilon)
  const rounded = Math.round(n);
  if (Math.abs(n - rounded) < 0.0001) {
    return rounded;
  }
  return Math.floor(n);
}

/**
 * Get all integer tile coordinates along a line segment
 * Uses simple tile stepping based on start/end tile coordinates
 * For a diagonal from (11,2) to (13,0), we want: (11,2) -> (12,1) -> (13,0)
 */
function getTilesAlongLine(x0: number, y0: number, x1: number, y1: number): Array<{x: number, y: number}> {
  const tiles: Array<{x: number, y: number}> = [];
  const seen = new Set<string>();

  // Helper to add a tile if not seen
  const addTile = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (!seen.has(key)) {
      seen.add(key);
      tiles.push({ x, y });
    }
  };

  // Get start and end tiles
  // Use safeFloor for start position (where projectile actually is)
  // Use Math.round for end position to handle animation overshoot (e.g., -0.015 -> 0, not -1)
  const startTileX = safeFloor(x0);
  const startTileY = safeFloor(y0);
  const endTileX = Math.round(x1);
  const endTileY = Math.round(y1);

  // Always add starting tile
  addTile(startTileX, startTileY);

  // If same tile, we're done
  if (startTileX === endTileX && startTileY === endTileY) {
    return tiles;
  }

  // Calculate how many tiles we need to traverse
  const dx = endTileX - startTileX;
  const dy = endTileY - startTileY;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));

  // Step through each tile along the path
  // For a diagonal, this will visit exactly the diagonal tiles
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const tileX = startTileX + Math.round(dx * t);
    const tileY = startTileY + Math.round(dy * t);
    addTile(tileX, tileY);
  }

  return tiles;
}

/**
 * Compute tile path for bounced projectiles (used when projectile bounces off wall)
 * Same logic as computeTilePath in actions.ts
 */
function computeTilePathForBounce(startX: number, startY: number, targetX: number, targetY: number): Array<{ x: number; y: number }> {
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
  const endTileX = Math.round(targetX);
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
 * Compute tile path for bounced projectiles with wall lookahead
 * Stops the path at the last valid tile BEFORE any wall
 */
function computeTilePathWithWallLookahead(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  gameState: GameState
): Array<{ x: number; y: number }> {
  const allTiles = computeTilePathForBounce(startX, startY, targetX, targetY);
  const validTiles: Array<{ x: number; y: number }> = [];

  for (const tile of allTiles) {
    const isWall = !isInBounds(tile.x, tile.y, gameState.puzzle.width, gameState.puzzle.height) ||
        gameState.puzzle.tiles[tile.y]?.[tile.x]?.type === TileTypeEnum.WALL ||
        gameState.puzzle.tiles[tile.y]?.[tile.x] === null;

    if (isWall) {
      // Stop at the tile before the wall
      break;
    }
    validTiles.push(tile);
  }

  // Always return at least the starting tile
  return validTiles.length > 0 ? validTiles : [{ x: Math.floor(startX), y: Math.floor(startY) }];
}

/**
 * Mark an entity as dead, executing death triggers BEFORE setting the dead flag
 * This ensures on_death spell triggers fire while the entity is still "alive"
 */
function markEntityAsDead(
  entity: PlacedCharacter | PlacedEnemy,
  gameState: GameState
): void {
  // Execute death triggers BEFORE marking as dead
  // Create a compatible PlacedCharacter-like object for the trigger system
  const entityForTriggers: PlacedCharacter = {
    characterId: (entity as PlacedCharacter).characterId || (entity as PlacedEnemy).enemyId,
    x: entity.x,
    y: entity.y,
    facing: entity.facing || 'right',
    currentHealth: entity.currentHealth,
    actionIndex: (entity as PlacedCharacter).actionIndex || 0,
    active: (entity as PlacedCharacter).active ?? (entity as PlacedEnemy).active ?? true,
    dead: false, // Still alive for trigger execution
    parallelTrackers: entity.parallelTrackers,
    statusEffects: entity.statusEffects,
    spellCooldowns: entity.spellCooldowns,
  };

  executeDeathTriggers(entityForTriggers, gameState);

  // Now mark as dead
  entity.dead = true;
}

/**
 * Initialize parallel action trackers for a character
 */
function initializeParallelTrackers(character: PlacedCharacter, charData: any): void {
  if (!character.parallelTrackers) {
    character.parallelTrackers = [];
  }

  // Find all parallel actions in behavior
  charData.behavior.forEach((action: any, index: number) => {
    if (action.executionMode === 'parallel') {
      // Check if tracker already exists for this index
      const existingTracker = character.parallelTrackers!.find(t => t.actionIndex === index);
      if (!existingTracker) {
        character.parallelTrackers!.push({
          actionIndex: index,
          lastTriggerTime: Date.now(),
          active: true,
        });
      }
    }
  });
}

/**
 * Execute parallel actions for all characters (called from animation loop)
 * This runs independently of the turn-based sequential actions
 */
export function executeParallelActions(gameState: GameState): void {
  const now = Date.now();

  // Process characters
  for (const character of gameState.placedCharacters) {
    if (!character.active || character.dead) {
      continue;
    }

    const charData = getCharacter(character.characterId);
    if (!charData) continue;

    // Initialize trackers if needed
    initializeParallelTrackers(character, charData);

    // Check each parallel tracker
    if (character.parallelTrackers) {
      for (const tracker of character.parallelTrackers) {
        if (!tracker.active) continue;

        const action = charData.behavior[tracker.actionIndex];
        if (!action || action.executionMode !== 'parallel') continue;

        let shouldExecute = false;

        // Check trigger condition
        if (action.trigger?.mode === 'interval') {
          const intervalMs = action.trigger.intervalMs || 600;
          const timeSinceLastTrigger = now - tracker.lastTriggerTime;
          if (timeSinceLastTrigger >= intervalMs) {
            shouldExecute = true;
            tracker.lastTriggerTime = now;
          }
        } else if (action.trigger?.mode === 'on_event') {
          // Event-based triggers are evaluated via evaluateTriggers()
          shouldExecute = false;
        }

        if (shouldExecute) {
          const updatedCharacter = executeAction(character, action, gameState);
          Object.assign(character, updatedCharacter);
        }
      }
    }
  }
}

// ==========================================
// STATUS EFFECT PROCESSING
// ==========================================

/**
 * Get max health for an entity (character or enemy)
 */
function getEntityMaxHealth(entity: PlacedCharacter | PlacedEnemy): number {
  // Try character first
  const charData = getCharacter((entity as PlacedCharacter).characterId);
  if (charData) return charData.health;

  // Try enemy
  const enemyData = getEnemy((entity as PlacedEnemy).enemyId);
  if (enemyData) return enemyData.health;

  return entity.currentHealth;
}

/**
 * Process status effects for an entity at the specified timing
 * @param entity - PlacedCharacter or PlacedEnemy
 * @param timing - 'start' or 'end' of turn
 * @param currentTurn - Current turn number
 * @param gameState - Game state for death trigger execution
 * @returns Updated entity with effects processed
 */
function processEntityStatusEffects(
  entity: PlacedCharacter | PlacedEnemy,
  timing: 'start' | 'end',
  currentTurn: number,
  gameState: GameState
): PlacedCharacter | PlacedEnemy {
  if (!entity.statusEffects || entity.statusEffects.length === 0) {
    return entity;
  }

  const updatedEntity = { ...entity };
  const effectsToRemove: string[] = [];

  for (const effect of updatedEntity.statusEffects || []) {
    const effectAsset = loadStatusEffectAsset(effect.statusAssetId);

    // Check if this effect should process at this timing
    const shouldProcessAtStart = effect.type === StatusEffectType.STUN ||
                                  effect.type === StatusEffectType.SLEEP ||
                                  effect.type === StatusEffectType.POLYMORPH ||
                                  effect.type === StatusEffectType.SLOW ||
                                  effect.type === StatusEffectType.SILENCED ||
                                  effect.type === StatusEffectType.DISARMED ||
                                  effectAsset?.processAtTurnStart;

    const processNow = timing === 'start' ? shouldProcessAtStart : !shouldProcessAtStart;

    if (!processNow) continue;

    // Apply effect based on type
    switch (effect.type) {
      case StatusEffectType.POISON:
      case StatusEffectType.BURN:
      case StatusEffectType.BLEED:
        // Damage over time - use centralized damage to respect shields
        const damage = effect.value ?? effectAsset?.defaultValue ?? 1;
        const stacks = effect.currentStacks ?? 1;
        // DOT effects have no source, so use NoDeflect version
        applyDamageToEntityNoDeflect(updatedEntity, damage * stacks, gameState);
        break;

      case StatusEffectType.REGEN:
        // Healing over time
        const heal = effect.value ?? effectAsset?.defaultValue ?? 1;
        const maxHealth = getEntityMaxHealth(updatedEntity);
        updatedEntity.currentHealth = Math.min(
          updatedEntity.currentHealth + heal,
          maxHealth
        );
        break;

      // Action-preventing effects are checked in canEntityAct()
      // Duration handling is done at the end of processing
    }

    // Decrement duration at end of turn only
    if (timing === 'end') {
      effect.duration--;

      // Mark for removal if expired
      if (effect.duration <= 0) {
        effectsToRemove.push(effect.id);
      }
    }
  }

  // Remove expired effects
  if (effectsToRemove.length > 0) {
    updatedEntity.statusEffects = (updatedEntity.statusEffects || [])
      .filter(e => !effectsToRemove.includes(e.id));
  }

  return updatedEntity;
}

/**
 * Check if an entity can perform actions based on status effects
 */
export function canEntityAct(entity: PlacedCharacter | PlacedEnemy): { allowed: boolean; reason?: string } {
  if (!entity.statusEffects) return { allowed: true };

  for (const effect of entity.statusEffects) {
    const effectAsset = loadStatusEffectAsset(effect.statusAssetId);

    // Check for action-preventing effects
    if (effectAsset?.preventsAllActions ||
        effect.type === StatusEffectType.STUN ||
        effect.type === StatusEffectType.SLEEP ||
        effect.type === StatusEffectType.POLYMORPH) {
      const reasonMap: Record<string, string> = {
        [StatusEffectType.SLEEP]: 'Asleep',
        [StatusEffectType.POLYMORPH]: 'Polymorphed',
      };
      return { allowed: false, reason: reasonMap[effect.type] || 'Stunned' };
    }
  }

  return { allowed: true };
}

/**
 * Check if an entity can perform a specific spell type based on status effects
 */
export function canEntityCastSpell(
  entity: PlacedCharacter | PlacedEnemy,
  spellTemplate?: SpellTemplate
): { allowed: boolean; reason?: string } {
  if (!entity.statusEffects) return { allowed: true };

  // First check if entity can act at all
  const actCheck = canEntityAct(entity);
  if (!actCheck.allowed) return actCheck;

  for (const effect of entity.statusEffects) {
    const effectAsset = loadStatusEffectAsset(effect.statusAssetId);

    // Check melee prevention (Disarmed) - applies to both melee and melee_cone
    if ((spellTemplate === 'melee' || spellTemplate === 'melee_cone') && (effectAsset?.preventsMelee || effect.type === StatusEffectType.DISARMED)) {
      return { allowed: false, reason: 'Disarmed' };
    }

    // Check ranged/AOE prevention (Silenced)
    if ((spellTemplate === 'magic_linear' || spellTemplate === 'redirect' || spellTemplate === 'aoe') &&
        (effectAsset?.preventsRanged || effect.type === StatusEffectType.SILENCED)) {
      return { allowed: false, reason: 'Silenced' };
    }
  }

  return { allowed: true };
}

/**
 * Check if an entity can move based on status effects (for Slow effect)
 * Returns true if entity can move, false if this movement should be skipped
 */
export function canEntityMove(entity: PlacedCharacter | PlacedEnemy): boolean {
  if (!entity.statusEffects) return true;

  for (const effect of entity.statusEffects) {
    if (effect.type === StatusEffectType.SLOW) {
      // Slow effect: skip every other movement action
      const counter = effect.movementSkipCounter ?? 0;
      effect.movementSkipCounter = counter + 1;

      // Skip odd-numbered movement actions (1, 3, 5, ...)
      if (counter % 2 === 1) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Check if an entity has Haste and should get a bonus movement
 * Returns true if entity should get an extra movement this turn
 * Uses a counter similar to Slow to track alternate turns
 */
export function hasHasteBonus(entity: PlacedCharacter | PlacedEnemy): boolean {
  if (!entity.statusEffects) return false;

  for (const effect of entity.statusEffects) {
    if (effect.type === StatusEffectType.HASTE) {
      // Haste effect: grants bonus movement on even-numbered checks (0, 2, 4...)
      const counter = effect.movementSkipCounter ?? 0;
      effect.movementSkipCounter = counter + 1;

      // Grant bonus on even counts (every other movement gets doubled)
      if (counter % 2 === 0) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Remove effects that are broken by damage (sleep, polymorph, etc.)
 * Called when entity takes damage
 */
export function removeEffectsOnDamage(entity: PlacedCharacter | PlacedEnemy): void {
  if (!entity.statusEffects) return;

  entity.statusEffects = entity.statusEffects.filter(e => {
    // Sleep and Polymorph are always removed by damage (built-in behavior)
    if (e.type === StatusEffectType.SLEEP || e.type === StatusEffectType.POLYMORPH) {
      const effectAsset = loadStatusEffectAsset(e.statusAssetId);
      // Check if the asset explicitly disables removal on damage
      if (effectAsset?.removedOnDamage === false) {
        return true;
      }
      return false;
    }
    // For other effects, check the removedOnDamage flag
    const effectAsset = loadStatusEffectAsset(e.statusAssetId);
    if (effectAsset?.removedOnDamage) {
      return false;
    }
    return true;
  });
}

/**
 * @deprecated Use removeEffectsOnDamage instead
 */
export function wakeFromSleep(entity: PlacedCharacter | PlacedEnemy): void {
  removeEffectsOnDamage(entity);
}

// ==========================================
// DEATH DROP SYSTEM
// ==========================================

/**
 * Find a valid position to drop a collectible
 * First tries the death location, then adjacent tiles (cardinal, then diagonal)
 */
function findDropPosition(
  x: number,
  y: number,
  gameState: GameState
): { x: number; y: number } | null {
  const { width, height, tiles, collectibles } = gameState.puzzle;

  // Helper to check if a position is valid for dropping
  const isValidDropPosition = (checkX: number, checkY: number): boolean => {
    // Must be in bounds
    if (checkX < 0 || checkX >= width || checkY < 0 || checkY >= height) {
      return false;
    }

    // Must have a valid tile (not null, not wall)
    const tile = tiles[checkY]?.[checkX];
    if (!tile || tile.type === TileTypeEnum.WALL) {
      return false;
    }

    // Check if tile prevents placement
    if (tile.preventPlacement) {
      return false;
    }

    // Check if there's already an uncollected collectible at this position
    const existingCollectible = collectibles.find(
      c => !c.collected && c.x === checkX && c.y === checkY
    );
    if (existingCollectible) {
      return false;
    }

    return true;
  };

  // Try death location first
  if (isValidDropPosition(x, y)) {
    return { x, y };
  }

  // Try cardinal directions (N, E, S, W)
  const cardinalOffsets = [
    { dx: 0, dy: -1 }, // North
    { dx: 1, dy: 0 },  // East
    { dx: 0, dy: 1 },  // South
    { dx: -1, dy: 0 }, // West
  ];

  for (const offset of cardinalOffsets) {
    const checkX = x + offset.dx;
    const checkY = y + offset.dy;
    if (isValidDropPosition(checkX, checkY)) {
      return { x: checkX, y: checkY };
    }
  }

  // Try diagonal directions (NE, SE, SW, NW)
  const diagonalOffsets = [
    { dx: 1, dy: -1 },  // Northeast
    { dx: 1, dy: 1 },   // Southeast
    { dx: -1, dy: 1 },  // Southwest
    { dx: -1, dy: -1 }, // Northwest
  ];

  for (const offset of diagonalOffsets) {
    const checkX = x + offset.dx;
    const checkY = y + offset.dy;
    if (isValidDropPosition(checkX, checkY)) {
      return { x: checkX, y: checkY };
    }
  }

  // No valid position found
  return null;
}

/**
 * Handle death drop for an entity
 * Spawns a collectible if the entity has droppedCollectibleId configured
 */
export function handleEntityDeathDrop(
  entity: PlacedCharacter | PlacedEnemy,
  isEnemy: boolean,
  gameState: GameState
): void {
  // Get the entity's data to check for droppedCollectibleId
  let droppedCollectibleId: string | undefined;

  if (isEnemy) {
    const enemyData = getEnemy((entity as PlacedEnemy).enemyId);
    droppedCollectibleId = enemyData?.droppedCollectibleId;
  } else {
    const charData = getCharacter((entity as PlacedCharacter).characterId);
    droppedCollectibleId = charData?.droppedCollectibleId;
  }

  // No collectible to drop
  if (!droppedCollectibleId) {
    return;
  }

  // Load the collectible data to make sure it exists
  const collectibleData = loadCollectible(droppedCollectibleId);
  if (!collectibleData) {
    console.warn(`Death drop collectible not found: ${droppedCollectibleId}`);
    return;
  }

  // Find a valid drop position
  const dropPos = findDropPosition(entity.x, entity.y, gameState);
  if (!dropPos) {
    console.warn(`No valid drop position found for collectible near (${entity.x}, ${entity.y})`);
    return;
  }

  // Create the new collectible instance
  const newCollectible: PlacedCollectible = {
    collectibleId: droppedCollectibleId,
    x: dropPos.x,
    y: dropPos.y,
    collected: false,
    instanceId: `drop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  };

  // Add to puzzle collectibles
  gameState.puzzle.collectibles.push(newCollectible);
}

/**
 * Apply status effect from a projectile hit
 */
function applyStatusEffectFromProjectile(
  target: PlacedCharacter | PlacedEnemy,
  spellAssetId: string,
  sourceId: string,
  sourceIsEnemy: boolean,
  currentTurn: number
): void {

  const spell = loadSpellAsset(spellAssetId);
  if (!spell?.appliesStatusEffect) {
    return;
  }

  const effectConfig = spell.appliesStatusEffect;

  if (!effectConfig.statusAssetId) {
    return;
  }

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
 * Process status effects for all entities at turn start
 */
function processAllStatusEffectsTurnStart(gameState: GameState): void {
  // Process characters
  for (let i = 0; i < gameState.placedCharacters.length; i++) {
    const wasAlive = !gameState.placedCharacters[i].dead;
    if (wasAlive) {
      gameState.placedCharacters[i] = processEntityStatusEffects(
        gameState.placedCharacters[i],
        'start',
        gameState.currentTurn,
        gameState
      ) as PlacedCharacter;

      // Check if entity died from DOT and handle death drop
      if (gameState.placedCharacters[i].dead) {
        handleEntityDeathDrop(gameState.placedCharacters[i], false, gameState);
      }
    }
  }

  // Process enemies
  for (let i = 0; i < gameState.puzzle.enemies.length; i++) {
    const wasAlive = !gameState.puzzle.enemies[i].dead;
    if (wasAlive) {
      gameState.puzzle.enemies[i] = processEntityStatusEffects(
        gameState.puzzle.enemies[i],
        'start',
        gameState.currentTurn,
        gameState
      ) as PlacedEnemy;

      // Check if entity died from DOT and handle death drop
      if (gameState.puzzle.enemies[i].dead) {
        handleEntityDeathDrop(gameState.puzzle.enemies[i], true, gameState);
      }
    }
  }
}

/**
 * Process status effects for all entities at turn end
 */
function processAllStatusEffectsTurnEnd(gameState: GameState): void {
  // Process characters
  for (let i = 0; i < gameState.placedCharacters.length; i++) {
    const wasAlive = !gameState.placedCharacters[i].dead;
    if (wasAlive) {
      gameState.placedCharacters[i] = processEntityStatusEffects(
        gameState.placedCharacters[i],
        'end',
        gameState.currentTurn,
        gameState
      ) as PlacedCharacter;

      // Check if entity died from DOT and handle death drop
      if (gameState.placedCharacters[i].dead) {
        handleEntityDeathDrop(gameState.placedCharacters[i], false, gameState);
      }
    }
  }

  // Process enemies
  for (let i = 0; i < gameState.puzzle.enemies.length; i++) {
    const wasAlive = !gameState.puzzle.enemies[i].dead;
    if (wasAlive) {
      gameState.puzzle.enemies[i] = processEntityStatusEffects(
        gameState.puzzle.enemies[i],
        'end',
        gameState.currentTurn,
        gameState
      ) as PlacedEnemy;

      // Check if entity died from DOT and handle death drop
      if (gameState.puzzle.enemies[i].dead) {
        handleEntityDeathDrop(gameState.puzzle.enemies[i], true, gameState);
      }
    }
  }
}

/**
 * Decrement spell cooldowns for all entities at turn end
 */
function decrementSpellCooldowns(gameState: GameState): void {
  // Decrement character cooldowns
  for (const character of gameState.placedCharacters) {
    if (character.spellCooldowns) {
      for (const spellId of Object.keys(character.spellCooldowns)) {
        if (character.spellCooldowns[spellId] > 0) {
          character.spellCooldowns[spellId]--;
        }
      }
    }
  }

  // Decrement enemy cooldowns
  for (const enemy of gameState.puzzle.enemies) {
    if (enemy.spellCooldowns) {
      for (const spellId of Object.keys(enemy.spellCooldowns)) {
        if (enemy.spellCooldowns[spellId] > 0) {
          enemy.spellCooldowns[spellId]--;
        }
      }
    }
  }
}

/**
 * Reset trigger groups that are controlled by "hold" mode pressure plates.
 * This resets them to 'off' at the start of each turn; they'll be set to 'on'
 * if an entity is standing on the pressure plate when it's processed.
 */
function resetHeldTriggerGroups(gameState: GameState): void {
  // Find all pressure plates with hold mode and collect their trigger group IDs
  const heldTriggerGroups = new Set<string>();

  for (let y = 0; y < gameState.puzzle.tiles.length; y++) {
    const row = gameState.puzzle.tiles[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      const tile = row[x];
      if (!tile?.customTileTypeId) continue;

      const tileType = loadTileType(tile.customTileTypeId);
      if (!tileType) continue;

      // Check if this tile has a pressure plate behavior with hold mode
      for (const behavior of tileType.behaviors) {
        if (behavior.type !== 'pressure_plate') continue;
        if (!behavior.pressurePlateEffects) continue;

        for (const effect of behavior.pressurePlateEffects) {
          if (effect.type === 'toggle_trigger_group' &&
              effect.triggerMode === 'hold' &&
              effect.targetTriggerGroupId) {
            heldTriggerGroups.add(effect.targetTriggerGroupId);
          }
        }
      }
    }
  }

  // Reset all tiles in held trigger groups to 'off'
  if (heldTriggerGroups.size === 0) return;

  for (let y = 0; y < gameState.puzzle.tiles.length; y++) {
    const row = gameState.puzzle.tiles[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      const tile = row[x];
      if (tile && tile.triggerGroupId && heldTriggerGroups.has(tile.triggerGroupId)) {
        // Get or create tile runtime state and set to 'off'
        if (!gameState.tileStates) {
          gameState.tileStates = {};
        }
        const key = `${x},${y}`;
        if (!gameState.tileStates[key]) {
          gameState.tileStates[key] = {};
        }
        gameState.tileStates[key].overrideState = 'off';
      }
    }
  }
}

/**
 * Execute one turn of the simulation
 * Modifies gameState in place and returns it
 */
export function executeTurn(gameState: GameState): GameState {
  if (gameState.gameStatus !== 'running') {
    return gameState;
  }

  gameState.currentTurn++;

  // Reset held trigger groups at the start of each turn
  // They will be reactivated if entities are standing on hold-mode pressure plates
  resetHeldTriggerGroups(gameState);

  // Process turn-start status effects for all entities
  processAllStatusEffectsTurnStart(gameState);

  // Pre-compute which tiles are being vacated by characters this turn (for train-like movement)
  gameState.tilesBeingVacated = new Set<string>();
  for (const character of gameState.placedCharacters) {
    if (character.dead || character.pendingProjectileDeath || !character.active) continue;
    const charData = getCharacter(character.characterId);
    if (!charData) continue;

    // Find the current action (accounting for parallel actions)
    let actionIndex = character.actionIndex || 0;
    let currentAction = charData.behavior[actionIndex];
    while (currentAction && (currentAction.executionMode === 'parallel')) {
      actionIndex++;
      currentAction = charData.behavior[actionIndex];
    }

    if (!currentAction) continue;

    // Check if this is a movement action
    const actionType = currentAction.type;
    if (actionType === ActionType.MOVE_FORWARD || actionType === 'MOVE_FORWARD' ||
        actionType === ActionType.MOVE_BACKWARD || actionType === 'MOVE_BACKWARD' ||
        actionType === ActionType.MOVE_LEFT || actionType === 'MOVE_LEFT' ||
        actionType === ActionType.MOVE_RIGHT || actionType === 'MOVE_RIGHT') {
      // This character intends to move, so its current tile will be vacated
      gameState.tilesBeingVacated.add(`${Math.floor(character.x)},${Math.floor(character.y)}`);
    }
  }

  // Create new array with new character objects to trigger React re-render
  // Process sequentially to ensure collision detection works correctly
  const newCharacters: PlacedCharacter[] = [];
  for (let i = 0; i < gameState.placedCharacters.length; i++) {
    const character = gameState.placedCharacters[i];
    // Create a new character object (shallow copy)
    const newCharacter = { ...character };

    // Clear animation flags from previous turn (animation has completed)
    newCharacter.justTeleported = false;
    newCharacter.teleportFromX = undefined;
    newCharacter.teleportFromY = undefined;
    newCharacter.iceSlideDistance = undefined;

    if (!newCharacter.active || newCharacter.dead || newCharacter.pendingProjectileDeath) {
      newCharacters.push(newCharacter);
      continue;
    }

    const charData = getCharacter(newCharacter.characterId);
    if (!charData) {
      console.error(`Character ${newCharacter.characterId} not found`);
      newCharacters.push(newCharacter);
      continue;
    }

    // Initialize parallel trackers if needed
    initializeParallelTrackers(newCharacter, charData);

    // Find the next sequential action (skip forward-looking parallel actions)
    let currentAction = charData.behavior[newCharacter.actionIndex];
    let skippedAnyActions = false;

    // Skip forward-looking parallel actions until we find a sequential one
    while (currentAction && currentAction.executionMode === 'parallel') {
      newCharacter.actionIndex++;
      currentAction = charData.behavior[newCharacter.actionIndex];
      skippedAnyActions = true;
    }

    if (!currentAction) {
      // No more actions, deactivate
      newCharacter.active = false;
      newCharacters.push(newCharacter);
      continue;
    }

    // Handle REPEAT action - loop back to beginning AND execute first action
    // Check for both enum value and string key
    if (currentAction.type === ActionType.REPEAT || currentAction.type === 'REPEAT') {
      // Reset to beginning
      newCharacter.actionIndex = 0;

      // Find the first SEQUENTIAL action (skip parallel actions)
      let firstSequentialIndex = 0;
      while (firstSequentialIndex < charData.behavior.length) {
        const action = charData.behavior[firstSequentialIndex];
        if (action.executionMode === 'parallel') {
          firstSequentialIndex++;
          continue;
        }
        break;
      }

      // Execute the first sequential action (and any linked actions)
      if (firstSequentialIndex < charData.behavior.length) {
        const firstAction = charData.behavior[firstSequentialIndex];
        if (firstAction.type !== ActionType.REPEAT && firstAction.type !== 'REPEAT') {
          newCharacter.actionIndex = firstSequentialIndex;
          const updatedCharacter = executeAction(newCharacter, firstAction, gameState);
          Object.assign(newCharacter, updatedCharacter);

          // Execute linkedToNext chain
          while (charData.behavior[newCharacter.actionIndex]?.linkedToNext) {
            newCharacter.actionIndex++;
            const linkedAction = charData.behavior[newCharacter.actionIndex];
            if (linkedAction && linkedAction.executionMode !== 'parallel') {
              const linkedResult = executeAction(newCharacter, linkedAction, gameState);
              Object.assign(newCharacter, linkedResult);
            } else {
              break;
            }
          }
        }
      }
    } else {
      // Execute the current sequential action
      const updatedCharacter = executeAction(newCharacter, currentAction, gameState);
      Object.assign(newCharacter, updatedCharacter);

      // Execute linkedToNext chain — linked actions fire on the same turn
      while (charData.behavior[newCharacter.actionIndex]?.linkedToNext) {
        newCharacter.actionIndex++;
        const linkedAction = charData.behavior[newCharacter.actionIndex];
        if (linkedAction && linkedAction.executionMode !== 'parallel') {
          const linkedResult = executeAction(newCharacter, linkedAction, gameState);
          Object.assign(newCharacter, linkedResult);
        } else {
          break;
        }
      }
    }

    // Advance to next action
    newCharacter.actionIndex++;

    newCharacters.push(newCharacter);

    // Update gameState immediately so collision detection sees the new position
    gameState.placedCharacters = newCharacters.concat(gameState.placedCharacters.slice(i + 1));
  }

  gameState.placedCharacters = newCharacters;

  // Collect all pending character triggers (defer evaluation for melee priority)
  const pendingCharacterTriggers: PlacedCharacter[] = [];
  for (const character of gameState.placedCharacters) {
    if (!character.dead && character.active) {
      pendingCharacterTriggers.push(character);
    }
  }

  // Pre-compute which tiles are being vacated by enemies this turn (for train-like movement)
  // This allows enemies following each other to move together without blocking
  gameState.tilesBeingVacated = new Set<string>();
  for (const enemy of gameState.puzzle.enemies) {
    if (enemy.dead) continue;
    const enemyData = getEnemy(enemy.enemyId);
    if (!enemyData || !enemyData.behavior || enemyData.behavior.type !== 'active') continue;
    if (!enemy.active) continue;

    const pattern = enemyData.behavior.pattern;
    if (!pattern || pattern.length === 0) continue;

    // Find the current action (accounting for parallel actions)
    let actionIndex = enemy.actionIndex || 0;
    let currentAction = pattern[actionIndex];
    while (currentAction && (currentAction.executionMode === 'parallel')) {
      actionIndex++;
      currentAction = pattern[actionIndex];
    }

    if (!currentAction) continue;

    // Check if this is a movement action
    const actionType = currentAction.type;
    if (actionType === ActionType.MOVE_FORWARD || actionType === 'MOVE_FORWARD' ||
        actionType === ActionType.MOVE_BACKWARD || actionType === 'MOVE_BACKWARD' ||
        actionType === ActionType.MOVE_LEFT || actionType === 'MOVE_LEFT' ||
        actionType === ActionType.MOVE_RIGHT || actionType === 'MOVE_RIGHT') {
      // This enemy intends to move, so its current tile will be vacated
      gameState.tilesBeingVacated.add(`${Math.floor(enemy.x)},${Math.floor(enemy.y)}`);
    }
  }

  // Create new enemy array with new enemy objects to trigger React re-render
  // Process sequentially to ensure collision detection works correctly
  const newEnemies: PlacedEnemy[] = [];
  for (let i = 0; i < gameState.puzzle.enemies.length; i++) {
    const enemy = gameState.puzzle.enemies[i];
    // Create a new enemy object (shallow copy)
    const newEnemy = { ...enemy };

    // Clear animation flags from previous turn (animation has completed)
    newEnemy.justTeleported = false;
    newEnemy.teleportFromX = undefined;
    newEnemy.teleportFromY = undefined;
    newEnemy.iceSlideDistance = undefined;

    if (newEnemy.dead) {
      newEnemies.push(newEnemy);
      continue;
    }

    // Skip enemies awaiting deferred projectile death — don't let them act
    if (newEnemy.pendingProjectileDeath) {
      newEnemies.push(newEnemy);
      continue;
    }

    const enemyData = getEnemy(newEnemy.enemyId);
    if (!enemyData || !enemyData.behavior || enemyData.behavior.type !== 'active') {
      newEnemies.push(newEnemy); // Skip static enemies
      continue;
    }

    // Initialize enemy behavior if needed
    if (newEnemy.actionIndex === undefined) {
      newEnemy.actionIndex = 0;
      newEnemy.active = true;
      newEnemy.facing = enemyData.behavior.defaultFacing || Direction.SOUTH;
    }

    if (!newEnemy.active) {
      newEnemies.push(newEnemy);
      continue;
    }

    const pattern = enemyData.behavior.pattern;
    if (!pattern || pattern.length === 0) {
      newEnemies.push(newEnemy);
      continue;
    }

    // Get current action (skip forward-looking parallel actions)
    let currentAction = pattern[newEnemy.actionIndex!];
    let skippedAnyActions = false;

    // Skip forward-looking parallel actions
    while (currentAction && currentAction.executionMode === 'parallel') {
      newEnemy.actionIndex = (newEnemy.actionIndex || 0) + 1;
      currentAction = pattern[newEnemy.actionIndex!];
      skippedAnyActions = true;
    }

    if (!currentAction) {
      // No more actions, deactivate
      newEnemy.active = false;
      newEnemies.push(newEnemy);
      continue;
    }

    // Helper: execute an action via tempChar and copy results back to enemy
    const executeEnemyAction = (action: CharacterAction) => {
      const tempChar: PlacedCharacter = {
        characterId: newEnemy.enemyId,
        x: newEnemy.x,
        y: newEnemy.y,
        facing: newEnemy.facing || Direction.SOUTH,
        currentHealth: newEnemy.currentHealth,
        actionIndex: newEnemy.actionIndex || 0,
        active: newEnemy.active || true,
        dead: newEnemy.dead,
        spellCooldowns: newEnemy.spellCooldowns,
      };
      const result = executeAction(tempChar, action, gameState);
      newEnemy.x = result.x;
      newEnemy.y = result.y;
      newEnemy.facing = result.facing;
      newEnemy.currentHealth = result.currentHealth;
      newEnemy.dead = result.dead;
      newEnemy.spellCooldowns = result.spellCooldowns;
      newEnemy.justTeleported = result.justTeleported;
      newEnemy.teleportFromX = result.teleportFromX;
      newEnemy.teleportFromY = result.teleportFromY;
      newEnemy.iceSlideDistance = result.iceSlideDistance;
    };

    // Helper: execute linkedToNext chain for enemy
    const executeEnemyLinkedChain = () => {
      while (pattern[newEnemy.actionIndex!]?.linkedToNext) {
        newEnemy.actionIndex = (newEnemy.actionIndex || 0) + 1;
        const linkedAction = pattern[newEnemy.actionIndex!];
        if (linkedAction && linkedAction.executionMode !== 'parallel') {
          executeEnemyAction(linkedAction);
        } else {
          break;
        }
      }
    };

    // Handle REPEAT action - loop back to beginning AND execute first action
    if (currentAction.type === ActionType.REPEAT || currentAction.type === 'REPEAT') {
      // Reset to beginning
      newEnemy.actionIndex = 0;

      // Find the first SEQUENTIAL action (skip parallel actions)
      let firstSequentialIndex = 0;
      while (firstSequentialIndex < pattern.length) {
        const action = pattern[firstSequentialIndex];
        if (action.executionMode === 'parallel') {
          firstSequentialIndex++;
          continue;
        }
        break;
      }

      // Execute the first sequential action (and any linked actions)
      if (firstSequentialIndex < pattern.length) {
        const firstAction = pattern[firstSequentialIndex];
        if (firstAction.type !== ActionType.REPEAT && firstAction.type !== 'REPEAT') {
          newEnemy.actionIndex = firstSequentialIndex;
          executeEnemyAction(firstAction);
          executeEnemyLinkedChain();
        }
      }
    } else {
      // Execute the current sequential action
      executeEnemyAction(currentAction);

      // Execute linkedToNext chain — linked actions fire on the same turn
      executeEnemyLinkedChain();
    }

    // Advance to next action
    newEnemy.actionIndex = (newEnemy.actionIndex || 0) + 1;

    newEnemies.push(newEnemy);

    // Update gameState immediately so collision detection sees the new position
    gameState.puzzle.enemies = newEnemies.concat(gameState.puzzle.enemies.slice(i + 1));
  }

  gameState.puzzle.enemies = newEnemies;

  // Collect all pending enemy triggers
  // Note: Include enemies that are not dead, regardless of 'active' status
  // Static enemies (behavior.type !== 'active') don't have active=true but can still have triggers
  const pendingEnemyTriggers: PlacedEnemy[] = [];
  for (const enemy of gameState.puzzle.enemies) {
    if (!enemy.dead) {
      pendingEnemyTriggers.push(enemy);
    }
  }

  // Execute triggers in priority order:
  // 1. Enemies with hasMeleePriority
  // 2. Characters (normal priority)
  // 3. Enemies without hasMeleePriority

  // Execute priority enemies first
  for (const enemy of pendingEnemyTriggers) {
    const enemyData = getEnemy(enemy.enemyId);
    if (enemyData?.hasMeleePriority) {
      const tempCharForTrigger: PlacedCharacter = {
        characterId: enemy.enemyId,
        x: enemy.x,
        y: enemy.y,
        facing: enemy.facing || Direction.SOUTH,
        currentHealth: enemy.currentHealth,
        actionIndex: enemy.actionIndex || 0,
        active: enemy.active || true,
        dead: enemy.dead,
        spellCooldowns: enemy.spellCooldowns,
      };
      evaluateTriggers(tempCharForTrigger, gameState);

      // Copy back any changes from trigger execution
      enemy.x = tempCharForTrigger.x;
      enemy.y = tempCharForTrigger.y;
      enemy.facing = tempCharForTrigger.facing;
      enemy.currentHealth = tempCharForTrigger.currentHealth;
      enemy.dead = tempCharForTrigger.dead;
      enemy.spellCooldowns = tempCharForTrigger.spellCooldowns;
    }
  }

  // Execute character triggers (normal priority)
  for (const character of pendingCharacterTriggers) {
    if (!character.dead) {
      evaluateTriggers(character, gameState);
    }
  }

  // Execute non-priority enemy triggers
  for (const enemy of pendingEnemyTriggers) {
    const enemyData = getEnemy(enemy.enemyId);
    if (!enemyData?.hasMeleePriority && !enemy.dead) {
      const tempCharForTrigger: PlacedCharacter = {
        characterId: enemy.enemyId,
        x: enemy.x,
        y: enemy.y,
        facing: enemy.facing || Direction.SOUTH,
        currentHealth: enemy.currentHealth,
        actionIndex: enemy.actionIndex || 0,
        active: enemy.active || true,
        dead: enemy.dead,
        spellCooldowns: enemy.spellCooldowns,
      };
      evaluateTriggers(tempCharForTrigger, gameState);

      // Copy back any changes from trigger execution
      enemy.x = tempCharForTrigger.x;
      enemy.y = tempCharForTrigger.y;
      enemy.facing = tempCharForTrigger.facing;
      enemy.currentHealth = tempCharForTrigger.currentHealth;
      enemy.dead = tempCharForTrigger.dead;
      enemy.spellCooldowns = tempCharForTrigger.spellCooldowns;
    }
  }

  // Update projectiles — deterministic turn-based resolution
  if (gameState.headlessMode) {
    updateProjectilesHeadless(gameState);
  } else {
    resolveProjectiles(gameState);
  }

  // Update particles (Phase 2)
  updateParticles(gameState);

  // Process persistent area effects
  processPersistentAreaEffects(gameState);

  // Process turn-end status effects for all entities
  processAllStatusEffectsTurnEnd(gameState);

  // Decrement spell cooldowns at end of turn
  // This happens AFTER actions, so cooldown of N means "skip N turns"
  decrementSpellCooldowns(gameState);

  // Check win/lose conditions (skip in test mode)
  if (!gameState.testMode) {
    checkGameConditions(gameState);

    // Check if we've exceeded the turn limit
    const maxTurns = gameState.puzzle.maxTurns || 1000; // Default to 1000 if not specified
    if (gameState.currentTurn >= maxTurns && gameState.gameStatus === 'running') {
      gameState.gameStatus = 'defeat';
      return gameState;
    }

    // Check if all characters are inactive
    const hasActiveCharacters = gameState.placedCharacters.some((c) => c.active && !c.dead);
    if (!hasActiveCharacters && gameState.gameStatus === 'running') {
      // All characters done, check if we won
      if (checkVictoryConditions(gameState)) {
        gameState.gameStatus = 'victory';
      } else {
        gameState.gameStatus = 'defeat';
      }
    }
  }

  return gameState;
}

/**
 * Check win/lose conditions
 */
function checkGameConditions(gameState: GameState): void {
  // Check victory conditions
  if (checkVictoryConditions(gameState)) {
    gameState.gameStatus = 'victory';
    return;
  }

  // Check defeat conditions (early failure detection)
  if (checkDefeatConditions(gameState)) {
    gameState.gameStatus = 'defeat';
    return;
  }

  // Check if all characters are dead (including pending projectile deaths)
  const allCharactersDead = gameState.placedCharacters.every((c) => c.dead || c.pendingProjectileDeath);
  if (allCharactersDead && gameState.placedCharacters.length > 0) {
    gameState.gameStatus = 'defeat';
  }
}

/**
 * Check if victory conditions are met
 * Exported so it can be called from animation loop when projectiles kill enemies
 */
export function checkVictoryConditions(gameState: GameState): boolean {
  for (const condition of gameState.puzzle.winConditions) {
    switch (condition.type) {
      case 'defeat_all_enemies':
        const allEnemiesDead = gameState.puzzle.enemies.every((e) => e.dead || e.pendingProjectileDeath);
        if (!allEnemiesDead) return false;
        break;

      case 'defeat_boss':
        // All boss enemies must be defeated
        const bossEnemies = gameState.puzzle.enemies.filter(placedEnemy => {
          const enemyData = loadEnemy(placedEnemy.enemyId);
          return enemyData?.isBoss === true;
        });
        // If there are no bosses, this condition is vacuously true
        if (bossEnemies.length > 0) {
          const allBossesDead = bossEnemies.every(e => e.dead || e.pendingProjectileDeath);
          if (!allBossesDead) return false;
        }
        break;

      case 'collect_all':
        const allCollected = gameState.puzzle.collectibles.every((c) => c.collected);
        if (!allCollected) return false;
        break;

      case 'reach_goal':
        // Check if any character is on a goal tile
        const hasReachedGoal = gameState.placedCharacters.some((char) => {
          if (char.dead || char.pendingProjectileDeath) return false;
          const tile = gameState.puzzle.tiles[char.y]?.[char.x];
          return tile?.type === TileType.GOAL;
        });
        if (!hasReachedGoal) return false;
        break;

      case 'survive_turns':
        // Must survive for at least X turns - check at turn end
        const surviveTurns = condition.params?.turns ?? 10;
        if (gameState.currentTurn < surviveTurns) return false;
        // Also need at least one character alive
        const hasAliveCharacter = gameState.placedCharacters.some((c) => !c.dead && !c.pendingProjectileDeath);
        if (!hasAliveCharacter) return false;
        break;

      case 'win_in_turns':
        // Must complete within X turns (checked elsewhere as a constraint)
        // This condition passes if we're still within the turn limit
        const maxTurns = condition.params?.turns ?? 10;
        if (gameState.currentTurn > maxTurns) return false;
        break;

      case 'max_characters':
        // Must use at most X characters (already enforced by placement, but verify)
        const maxChars = condition.params?.characterCount ?? 1;
        const usedChars = gameState.placedCharacters.length;
        if (usedChars > maxChars) return false;
        break;

      case 'characters_alive':
        // Must have at least X characters alive at the end
        const minAlive = condition.params?.characterCount ?? 1;
        const aliveCount = gameState.placedCharacters.filter((c) => !c.dead && !c.pendingProjectileDeath).length;
        if (aliveCount < minAlive) return false;
        break;

      case 'collect_keys':
        // Must collect all collectibles that have win_key effects
        // Load collectible data to check which ones are keys
        const keyCollectibles = gameState.puzzle.collectibles.filter(c => {
          if (!c.collectibleId) return false;
          const collectibleData = loadCollectible(c.collectibleId);
          if (!collectibleData) return false;
          return collectibleData.effects.some(e => e.type === 'win_key');
        });
        // All key collectibles must be collected
        const allKeysCollected = keyCollectibles.every(c => c.collected);
        if (!allKeysCollected) return false;
        break;
    }
  }

  return true;
}

/**
 * Check if the player has violated any win conditions (early defeat detection)
 * Returns true if any condition is impossible to satisfy
 */
function checkDefeatConditions(gameState: GameState): boolean {
  for (const condition of gameState.puzzle.winConditions) {
    switch (condition.type) {
      case 'win_in_turns':
        // Exceeded turn limit
        const maxTurns = condition.params?.turns ?? 10;
        if (gameState.currentTurn > maxTurns) return true;
        break;

      case 'characters_alive':
        // Can't possibly have enough characters alive anymore
        const minAliveDefeat = condition.params?.characterCount ?? 1;
        const aliveCountDefeat = gameState.placedCharacters.filter((c) => !c.dead && !c.pendingProjectileDeath).length;
        if (aliveCountDefeat < minAliveDefeat) return true;
        break;
    }
  }

  return false;
}

/**
 * Initialize game state from puzzle
 */
export function initializeGameState(puzzle: Puzzle): GameState {
  return {
    puzzle: {
      ...puzzle,
      enemies: puzzle.enemies.map((e) => {
        // Look up the enemy definition to get the current max health
        const enemyData = getEnemy(e.enemyId);
        const maxHealth = enemyData?.health || e.currentHealth || 1;
        return {
          ...e,
          dead: false, // Always reset dead status
          currentHealth: maxHealth // Reset to full health from enemy definition
        };
      }),
      collectibles: puzzle.collectibles.map((c) => ({ ...c, collected: false })),
    },
    placedCharacters: [],
    currentTurn: 0,
    simulationRunning: false,
    gameStatus: 'setup',
    score: 0,
    activeProjectiles: [],
    activeParticles: [],
    persistentAreaEffects: [],
    tileStates: new Map(), // Initialize empty tile runtime states
  };
}

/**
 * Reset game state
 */
export function resetGameState(gameState: GameState, originalPuzzle: Puzzle): GameState {
  return initializeGameState(originalPuzzle);
}

// ==========================================
// PROJECTILE & PARTICLE UPDATES (Phase 2)
// ==========================================

import type { Projectile, ParticleEffect } from '../types/game';
import { TileType } from '../types/game';

/**
 * Visual-only projectile update — called from animation loop.
 * All damage/effects are already resolved by resolveProjectiles() during executeTurn.
 * This function only handles position interpolation and consuming pre-resolved hitResults.
 */
export function updateProjectiles(gameState: GameState): void {
  if (!gameState.activeProjectiles || gameState.activeProjectiles.length === 0) {
    return;
  }

  const now = Date.now();
  const projectilesToRemove: string[] = [];

  for (const proj of gameState.activeProjectiles) {
    if (!proj.active) {
      projectilesToRemove.push(proj.id);
      continue;
    }

    // Calculate position based on whether this is a homing projectile or not
    let newX: number;
    let newY: number;
    let reachedTarget = false;

    if (proj.isHoming && proj.homingPathStyle === 'straight' && proj.homingVisualStartX !== undefined) {
      // STRAIGHT-LINE HOMING: smooth interpolation from original start to target
      const startX = proj.homingVisualStartX;
      const startY = proj.homingVisualStartY ?? proj.y;
      const elapsed = (now - (proj.homingVisualStartTime ?? proj.startTime)) / 1000;
      const speedTilesPerSecond = (proj.speed || 4) / 0.8;
      const totalDist = Math.sqrt(Math.pow(proj.targetX - startX, 2) + Math.pow(proj.targetY - startY, 2));
      const totalTime = Math.max(0.1, totalDist / speedTilesPerSecond);
      const progress = Math.min(elapsed / totalTime, 1);
      newX = startX + (proj.targetX - startX) * progress;
      newY = startY + (proj.targetY - startY) * progress;
      if (progress >= 1) reachedTarget = true;

      // Update direction for sprite rotation
      const sdx = proj.targetX - startX;
      const sdy = proj.targetY - startY;
      if (sdx !== 0 || sdy !== 0) {
        proj.direction = calculateDirectionTo(startX, startY, proj.targetX, proj.targetY);
      }
    } else if (proj.isHoming && !(proj.tilePath && proj.tilePath.length > 0)) {
      // Grid homing projectiles without tilePath: move towards current target from current position
      const dx = proj.targetX - proj.x;
      const dy = proj.targetY - proj.y;
      const distanceToTarget = Math.sqrt(dx * dx + dy * dy);

      const frameTime = 0.016; // 16ms in seconds
      const speedTilesPerSecond = (proj.speed || 4) / 0.8;
      const moveDistance = speedTilesPerSecond * frameTime;

      if (distanceToTarget <= moveDistance || distanceToTarget < 0.1) {
        newX = proj.targetX;
        newY = proj.targetY;
        reachedTarget = true;
      } else {
        const normalizedDx = dx / distanceToTarget;
        const normalizedDy = dy / distanceToTarget;
        newX = proj.x + normalizedDx * moveDistance;
        newY = proj.y + normalizedDy * moveDistance;
      }

      // Update direction for sprite rotation
      if (dx !== 0 || dy !== 0) {
        proj.direction = calculateDirectionTo(proj.x, proj.y, proj.targetX, proj.targetY);
      }
    } else if (proj.tilePath && proj.tilePath.length > 0) {
      // TILE-BASED MOVEMENT: Use pre-computed tile path for visual interpolation

      const tileEntryTime = proj.tileEntryTime ?? proj.startTime;
      const timeSinceTileEntry = (now - tileEntryTime) / 1000; // seconds
      const speedTilesPerSecond = (proj.speed || 4) / 0.8;
      const tileTransitTime = 1 / speedTilesPerSecond;

      const tilesAdvanced = Math.floor(timeSinceTileEntry / tileTransitTime);
      const newTileIndex = Math.min(
        (proj.currentTileIndex ?? 0) + tilesAdvanced,
        proj.tilePath.length - 1
      );

      if (proj.homingPathStyle === 'straight' && proj.tilePath.length >= 2) {
        // STRAIGHT-LINE: smooth interpolation from first to last tile (ignores grid)
        const firstTile = proj.tilePath[0];
        const lastTile = proj.tilePath[proj.tilePath.length - 1];
        // Use actual distance for timing, not tile count (avoids rapid short bursts)
        const actualDistance = Math.max(1, Math.sqrt(
          Math.pow(lastTile.x - firstTile.x, 2) + Math.pow(lastTile.y - firstTile.y, 2)
        ));
        const totalTransitTime = actualDistance * tileTransitTime;
        const progress = Math.min(timeSinceTileEntry / totalTransitTime, 1);
        newX = firstTile.x + (lastTile.x - firstTile.x) * progress;
        newY = firstTile.y + (lastTile.y - firstTile.y) * progress;
        if (progress >= 1) reachedTarget = true;
      } else if (newTileIndex >= proj.tilePath.length - 1) {
        reachedTarget = true;
        const finalTile = proj.tilePath[proj.tilePath.length - 1];
        newX = finalTile.x;
        newY = finalTile.y;
      } else {
        const currentTile = proj.tilePath[newTileIndex];
        const nextTile = proj.tilePath[Math.min(newTileIndex + 1, proj.tilePath.length - 1)];
        const tileProgress = (timeSinceTileEntry % tileTransitTime) / tileTransitTime;
        newX = currentTile.x + (nextTile.x - currentTile.x) * tileProgress;
        newY = currentTile.y + (nextTile.y - currentTile.y) * tileProgress;
      }

      // Update tile index and entry time if we moved to a new tile
      if (newTileIndex > (proj.currentTileIndex ?? 0)) {
        proj.currentTileIndex = newTileIndex;
        proj.tileEntryTime = now - ((timeSinceTileEntry % tileTransitTime) * 1000);
      }

      // Update direction for sprite rotation
      if (proj.tilePath.length >= 2) {
        const firstTile = proj.tilePath[0];
        const lastTile = proj.tilePath[proj.tilePath.length - 1];
        const dx = lastTile.x - firstTile.x;
        const dy = lastTile.y - firstTile.y;
        if (dx !== 0 || dy !== 0) {
          proj.direction = calculateDirectionTo(firstTile.x, firstTile.y, lastTile.x, lastTile.y);
        }
      }
    } else {
      // LEGACY: Non-homing projectiles without tilePath
      const elapsed = (now - proj.startTime) / 1000;
      const speedTilesPerSecond = (proj.speed || 4) / 0.8;
      const distanceTraveled = speedTilesPerSecond * elapsed;

      const dx = proj.targetX - proj.startX;
      const dy = proj.targetY - proj.startY;
      const totalDistance = Math.sqrt(dx * dx + dy * dy);

      if (distanceTraveled >= totalDistance) {
        reachedTarget = true;
        newX = proj.targetX;
        newY = proj.targetY;
      } else {
        const progress = distanceTraveled / totalDistance;
        newX = proj.startX + dx * progress;
        newY = proj.startY + dy * progress;
      }

      // Update direction for sprite rotation
      if (dx !== 0 || dy !== 0) {
        proj.direction = calculateDirectionTo(proj.startX, proj.startY, proj.targetX, proj.targetY);
      }
    }

    // Update position
    proj.x = newX;
    proj.y = newY;

    // Consume pre-resolved hit results from resolveProjectiles
    const currentTileIdx = proj.currentTileIndex ?? 0;
    const straightLineReached = proj.homingPathStyle === 'straight' && reachedTarget;
    if (proj.hitResult && (currentTileIdx >= proj.hitResult.hitTileIndex || straightLineReached)) {
      // Spawn hit VFX
      if (proj.hitResult.vfxSprite && proj.hitResult.vfxX !== undefined && proj.hitResult.vfxY !== undefined) {
        spawnParticleEffect(proj.hitResult.vfxX, proj.hitResult.vfxY, proj.hitResult.vfxSprite,
          proj.attackData.effectDuration || 300, gameState);
      }
      // Trigger deferred death — now set entity.dead = true so AnimatedGameBoard plays death animation
      // Also clear visualHealth so health bar shows actual HP now that projectile arrived
      if (proj.hitResult.deferredDeathEntityId) {
        if (proj.hitResult.deferredDeathIsEnemy) {
          const enemy = proj.hitResult.deferredDeathIndex !== undefined
            ? gameState.puzzle.enemies[proj.hitResult.deferredDeathIndex]
            : gameState.puzzle.enemies.find(e => e.enemyId === proj.hitResult!.deferredDeathEntityId);
          if (enemy) {
            enemy.visualHealth = undefined;
            if (enemy.pendingProjectileDeath) {
              enemy.dead = true;
              enemy.pendingProjectileDeath = false;
              handleEntityDeathDrop(enemy, true, gameState);
            }
          }
        } else {
          const char = gameState.placedCharacters.find(c => c.characterId === proj.hitResult!.deferredDeathEntityId);
          if (char) {
            char.visualHealth = undefined;
            if (char.pendingProjectileDeath) {
              char.dead = true;
              char.pendingProjectileDeath = false;
              handleEntityDeathDrop(char, false, gameState);
            }
          }
        }
      }
      if (proj.hitResult.deactivate) {
        proj.active = false;
        projectilesToRemove.push(proj.id);
      }
      proj.hitResult = undefined;
      continue;
    }

    // Deactivate at end of tile path if no hit result
    if (reachedTarget && !proj.hitResult) {
      // Projectile reached end of this turn's visual path, sits until next resolveProjectiles
      // Don't deactivate — resolveProjectiles will set hitResult.deactivate when appropriate
    }
  }

  // Remove inactive projectiles
  gameState.activeProjectiles = gameState.activeProjectiles.filter(
    p => !projectilesToRemove.includes(p.id)
  );
}

/**
 * Trigger an AOE explosion at a specific position
 */
function triggerAOEExplosion(
  x: number,
  y: number,
  attackData: any,
  sourceCharacterId: string | undefined,
  sourceEnemyId: string | undefined,
  gameState: GameState,
  spellAssetId?: string
): void {
  // Create a temporary character at the explosion point
  const tempChar: PlacedCharacter = {
    characterId: sourceCharacterId || sourceEnemyId || 'explosion_source',
    x,
    y,
    facing: Direction.SOUTH,
    currentHealth: 1,
    actionIndex: 0,
    active: true,
    dead: false,
  };

  // Set the center to be at the explosion point (caster-centered mode)
  const modifiedAttackData = {
    ...attackData,
    aoeCenteredOnCaster: true, // Force AOE to center on explosion point
  };

  // Load spell for status effect application
  const spell = spellAssetId ? loadSpellAsset(spellAssetId) : undefined;

  executeAOEAttack(tempChar, modifiedAttackData, Direction.SOUTH, gameState, spell || undefined);
}

/**
 * Deterministic turn-based projectile resolution for non-headless mode.
 * Mirrors updateProjectilesHeadless for game logic (damage, effects, death)
 * but stores visual metadata (tilePath, hitResult) instead of removing projectiles,
 * so the visual updateProjectiles can animate them.
 */
function resolveProjectiles(gameState: GameState): void {
  if (!gameState.activeProjectiles) return;

  const projectilesToRemove: string[] = [];

  for (const proj of gameState.activeProjectiles) {
    if (!proj.active) {
      projectilesToRemove.push(proj.id);
      continue;
    }

    // Skip projectiles that already have a hitResult — they've been resolved
    // and are just waiting for the visual system to consume the result
    if (proj.hitResult) continue;

    // Skip reflected projectiles — their full path and collisions were resolved
    // at reflect time. Re-processing would reset the visual and cause duplication.
    if (proj.reflected) continue;

    const isHealingProjectile = proj.attackData.healing !== undefined;
    const range = proj.attackData.range || 10;
    const tilesPerTurn = proj.speed || 4;

    let hitSomething = false;
    let shouldRemove = false;
    let logicalEndTile = 0; // Track the logical end tile for hitResult positioning

    // === HOMING PROJECTILES ===
    if (proj.isHoming && proj.targetEntityId) {
      let targetEntity: { x: number; y: number; dead?: boolean; pendingProjectileDeath?: boolean } | undefined;
      if (proj.targetIsEnemy) {
        if (proj.reflected && proj.sourceEnemyIndex !== undefined && gameState.puzzle.enemies[proj.sourceEnemyIndex]) {
          const enemy = gameState.puzzle.enemies[proj.sourceEnemyIndex];
          if (!enemy.dead && !enemy.pendingProjectileDeath) targetEntity = enemy;
        }
        if (!targetEntity) {
          targetEntity = gameState.puzzle.enemies.find(e => e.enemyId === proj.targetEntityId && !e.dead && !e.pendingProjectileDeath);
        }
      } else {
        targetEntity = gameState.placedCharacters.find(c => c.characterId === proj.targetEntityId && !c.dead && !c.pendingProjectileDeath);
      }

      if (targetEntity) {
        const dx = targetEntity.x - proj.x;
        const dy = targetEntity.y - proj.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Wall check for homing projectiles that don't ignore walls
        if (!proj.homingIgnoreWalls) {
          const pathTiles = getTilesAlongLine(proj.x, proj.y, targetEntity.x, targetEntity.y);
          let wallBlocked = false;
          for (const tile of pathTiles) {
            if (tile.x === Math.floor(proj.x) && tile.y === Math.floor(proj.y)) continue; // Skip start tile
            const isWall = !isInBounds(tile.x, tile.y, gameState.puzzle.width, gameState.puzzle.height) ||
              gameState.puzzle.tiles[tile.y]?.[tile.x]?.type === TileTypeEnum.WALL ||
              gameState.puzzle.tiles[tile.y]?.[tile.x] === null;
            if (isWall) {
              // Hit wall — build visual path to wall, deactivate
              const wallPath = getTilesAlongLine(proj.homingVisualStartX ?? proj.x, proj.homingVisualStartY ?? proj.y, tile.x, tile.y);
              // Remove the wall tile itself, stop one before
              if (wallPath.length > 1) wallPath.pop();
              proj.tilePath = wallPath;
              proj.currentTileIndex = 0;
              proj.tileEntryTime = proj.homingVisualStartTime ?? Date.now();
              proj.hitResult = { hitTileIndex: wallPath.length - 1, deactivate: true };
              wallBlocked = true;
              break;
            }
          }
          if (wallBlocked) continue;
        }

        if (distance <= tilesPerTurn) {
          // Reached target — apply damage/effects (same as headless)
          const hitX = targetEntity.x;
          const hitY = targetEntity.y;
          let vfxSprite: any;
          let deferredDeathEntityId: string | undefined;
          let deferredDeathIsEnemy: boolean | undefined;
          let deferredDeathIndex: number | undefined;

          if (proj.sourceCharacterId && proj.targetIsEnemy) {
            const enemy = targetEntity as PlacedEnemy;
            if (hasReflect(enemy) && !proj.reflected && canReflectDirection(enemy, proj.direction)) {
              reflectProjectile(proj, enemy, gameState, Date.now());
              continue;
            }
            if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
              triggerAOEExplosion(enemy.x, enemy.y, proj.attackData,
                proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
            } else if (proj.attackData.isRedirect) {
              if (!isSteadfast(enemy)) applyRedirect(enemy, proj.attackData, proj.direction);
              vfxSprite = proj.attackData.hitEffectSprite;
            } else {
              const baseDmg = proj.attackData.damage ?? 0;
              const isCrit = proj.attackData.backstabEnabled && isAttackFromBehind(proj.direction, enemy.facing);
              const damage = isCrit ? baseDmg * 2 : baseDmg;
              const wasDeflected = applyProjectileDamageWithDeflect(
                enemy, damage, proj.sourceCharacterId, proj.sourceEnemyId, gameState);
              if (!wasDeflected) {
                enemy.visualHealth = enemy.currentHealth;
                applyDamageToEntityNoDeflect(enemy, damage, gameState);
                if (enemy.dead) {
                  // Defer death visual — undo dead flag, set pendingProjectileDeath
                  enemy.dead = false;
                  enemy.pendingProjectileDeath = true;
                }
                deferredDeathEntityId = enemy.enemyId;
                deferredDeathIsEnemy = true;
                deferredDeathIndex = gameState.puzzle.enemies.indexOf(enemy);
              }
              if (proj.spellAssetId && !enemy.dead && !enemy.pendingProjectileDeath) {
                applyStatusEffectFromProjectile(enemy, proj.spellAssetId,
                  proj.sourceCharacterId || 'unknown', false, gameState.currentTurn);
              }
              vfxSprite = isCrit && proj.attackData.criticalHitEffectSprite
                ? proj.attackData.criticalHitEffectSprite : proj.attackData.hitEffectSprite;
            }
          } else if (proj.sourceEnemyId && !proj.targetIsEnemy) {
            const char = targetEntity as PlacedCharacter;
            if (hasReflect(char) && !proj.reflected && canReflectDirection(char, proj.direction)) {
              reflectProjectile(proj, char, gameState, Date.now());
              continue;
            }
            if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
              triggerAOEExplosion(char.x, char.y, proj.attackData,
                proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
            } else if (proj.attackData.isRedirect) {
              if (!isSteadfast(char)) applyRedirect(char, proj.attackData, proj.direction);
              vfxSprite = proj.attackData.hitEffectSprite;
            } else {
              const baseDmg = proj.attackData.damage ?? 0;
              const isCrit = proj.attackData.backstabEnabled && isAttackFromBehind(proj.direction, char.facing);
              const damage = isCrit ? baseDmg * 2 : baseDmg;
              const wasDeflected = applyProjectileDamageWithDeflect(
                char, damage, proj.sourceCharacterId, proj.sourceEnemyId, gameState);
              if (!wasDeflected) {
                char.visualHealth = char.currentHealth;
                applyDamageToEntityNoDeflect(char, damage, gameState);
                if (char.dead) {
                  // Defer death visual — undo dead flag, set pendingProjectileDeath
                  char.dead = false;
                  char.pendingProjectileDeath = true;
                }
                deferredDeathEntityId = char.characterId;
                deferredDeathIsEnemy = false;
              }
              if (proj.spellAssetId && !char.dead && !char.pendingProjectileDeath) {
                applyStatusEffectFromProjectile(char, proj.spellAssetId,
                  proj.sourceEnemyId || 'unknown', true, gameState.currentTurn);
              }
              vfxSprite = isCrit && proj.attackData.criticalHitEffectSprite
                ? proj.attackData.criticalHitEffectSprite : proj.attackData.hitEffectSprite;
            }
          } else if (proj.sourceCharacterId && !proj.targetIsEnemy) {
            // Friendly homing heal/buff
            const char = targetEntity as PlacedCharacter;
            const healing = proj.attackData.healing ?? 0;
            if (healing > 0) {
              const charData = getCharacter(char.characterId) || loadCharacter(char.characterId);
              const maxHealth = charData?.health || char.currentHealth;
              char.currentHealth = Math.min(char.currentHealth + healing, maxHealth);
            }
            if (proj.spellAssetId && !char.dead) {
              applyStatusEffectFromProjectile(char, proj.spellAssetId,
                proj.sourceCharacterId || 'unknown', false, gameState.currentTurn);
            }
            vfxSprite = proj.attackData.healingEffectSprite || proj.attackData.hitEffectSprite;
          } else if (proj.sourceEnemyId && proj.targetIsEnemy) {
            // Friendly enemy homing heal/buff
            const enemy = targetEntity as PlacedEnemy;
            const healing = proj.attackData.healing ?? 0;
            if (healing > 0) {
              const enemyData = loadEnemy(enemy.enemyId) || { health: enemy.currentHealth };
              const maxHealth = enemyData?.health || enemy.currentHealth;
              enemy.currentHealth = Math.min(enemy.currentHealth + healing, maxHealth);
            }
            if (proj.spellAssetId && !enemy.dead) {
              applyStatusEffectFromProjectile(enemy, proj.spellAssetId,
                proj.sourceEnemyId || 'unknown', true, gameState.currentTurn);
            }
            vfxSprite = proj.attackData.healingEffectSprite || proj.attackData.hitEffectSprite;
          }

          // Build tile path for visual: from visual start (or current) to hit position
          const vStartX = proj.homingPathStyle === 'straight' ? (proj.homingVisualStartX ?? proj.x) : proj.x;
          const vStartY = proj.homingPathStyle === 'straight' ? (proj.homingVisualStartY ?? proj.y) : proj.y;
          const turnTiles = proj.homingPathStyle === 'pathfinding'
            ? findPathBFS(vStartX, vStartY, hitX, hitY, gameState)
            : getTilesAlongLine(vStartX, vStartY, hitX, hitY);
          proj.tilePath = turnTiles;
          proj.currentTileIndex = 0;
          proj.tileEntryTime = proj.homingPathStyle === 'straight'
            ? (proj.homingVisualStartTime ?? Date.now())
            : Date.now();
          proj.hitResult = {
            hitTileIndex: turnTiles.length - 1,
            deactivate: true,
            vfxSprite,
            vfxX: hitX,
            vfxY: hitY,
            deferredDeathEntityId,
            deferredDeathIsEnemy,
            deferredDeathIndex,
          };
          proj.x = turnTiles[turnTiles.length - 1].x;
          proj.y = turnTiles[turnTiles.length - 1].y;
        } else {
          // Move toward target but don't reach it yet
          let turnTiles: Array<{x: number; y: number}>;
          let newX: number;
          let newY: number;

          if (proj.homingPathStyle === 'pathfinding') {
            // Pathfinding: compute full BFS path, take first tilesPerTurn tiles
            const fullPath = findPathBFS(proj.x, proj.y, targetEntity.x, targetEntity.y, gameState);
            turnTiles = fullPath.slice(0, tilesPerTurn + 1); // +1 includes start tile
            const lastTile = turnTiles[turnTiles.length - 1];
            newX = lastTile.x;
            newY = lastTile.y;
          } else {
            const moveRatio = tilesPerTurn / distance;
            newX = proj.x + dx * moveRatio;
            newY = proj.y + dy * moveRatio;
            turnTiles = getTilesAlongLine(proj.x, proj.y, newX, newY);
          }

          // Hit-along-path: check for entities on each tile (grid homing only)
          if (proj.homingHitAlongPath && (proj.homingPathStyle === 'grid' || proj.homingPathStyle === 'pathfinding')) {
            checkHomingPathForHits(proj, turnTiles, gameState);
          }

          proj.tilePath = turnTiles;
          proj.currentTileIndex = 0;
          proj.tileEntryTime = Date.now();
          proj.x = newX;
          proj.y = newY;
          proj.targetX = targetEntity.x;
          proj.targetY = targetEntity.y;
        }
      } else {
        // Target died or not found - remove projectile
        shouldRemove = true;
      }
    } else {
      // === NON-HOMING PROJECTILES ===
      const { dx, dy } = getDirectionOffset(proj.direction);
      const canPierce = proj.attackData.projectilePierces === true;

      if (!proj.hitEntityIds) proj.hitEntityIds = [];
      const hitEntityIds = proj.hitEntityIds;

      // Use logicalTileIndex for deterministic positioning
      const startTile = (proj.logicalTileIndex ?? 0) + 1;
      const endTile = Math.min(startTile + tilesPerTurn - 1, range);
      logicalEndTile = endTile;
      let hitWall = false;
      let reflectedThisTurn = false;
      let reflectAtDist: number | undefined;

      const turnTiles: Array<{ x: number; y: number }> = [];
      // Start with current position so visual begins from where the projectile is
      const currentLogicalDist = proj.logicalTileIndex ?? 0;
      turnTiles.push({
        x: Math.floor(proj.startX + dx * currentLogicalDist),
        y: Math.floor(proj.startY + dy * currentLogicalDist)
      });

      for (let dist = startTile; dist <= endTile; dist++) {
        if (hitSomething && !canPierce) {
          shouldRemove = true;
          break;
        }

        const checkX = Math.floor(proj.startX + dx * dist);
        const checkY = Math.floor(proj.startY + dy * dist);

        // Check bounds — include the edge tile in visual path so projectile reaches it
        if (!isInBounds(checkX, checkY, gameState.puzzle.width, gameState.puzzle.height)) {
          // Don't add out-of-bounds tile to visual path
          shouldRemove = true;
          break;
        }

        // Check wall/void
        const tile = gameState.puzzle.tiles[checkY]?.[checkX];
        const isOutOfBounds = !isInBounds(checkX, checkY, gameState.puzzle.width, gameState.puzzle.height);
        if (!tile || tile.type === TileTypeEnum.WALL || isOutOfBounds) {
          // Only include wall/boundary tiles in visual path (not void tiles)
          // Void tiles render as empty space, so projectile should stop before them
          if (tile?.type === TileTypeEnum.WALL || isOutOfBounds) {
            turnTiles.push({ x: checkX, y: checkY });
          }
          if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
            triggerAOEExplosion(checkX, checkY, proj.attackData,
              proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
          }
          hitWall = true;
          shouldRemove = true;
          break;
        }

        turnTiles.push({ x: checkX, y: checkY });

        // Check for entity hits at this tile
        const hEffCharFired = proj.teamSwapped ? !!proj.sourceEnemyId : !!proj.sourceCharacterId;
        const hEffEnemyFired = proj.teamSwapped ? !!proj.sourceCharacterId : !!proj.sourceEnemyId;

        if (hEffCharFired) {
          if (isHealingProjectile) {
            const hitAlly = gameState.placedCharacters.find(
              c => !c.dead && Math.floor(c.x) === checkX && Math.floor(c.y) === checkY &&
                   c.characterId !== proj.sourceCharacterId &&
                   !hitEntityIds.includes(c.characterId)
            );
            if (hitAlly) {
              hitEntityIds.push(hitAlly.characterId);
              if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
                triggerAOEExplosion(hitAlly.x, hitAlly.y, proj.attackData,
                  proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
              } else {
                const healing = proj.attackData.healing ?? 0;
                if (healing > 0) {
                  const charData = getCharacter(hitAlly.characterId);
                  const maxHealth = charData?.health ?? hitAlly.currentHealth;
                  hitAlly.currentHealth = Math.min(hitAlly.currentHealth + healing, maxHealth);
                }
                if (proj.spellAssetId && !hitAlly.dead) {
                  applyStatusEffectFromProjectile(hitAlly, proj.spellAssetId,
                    proj.sourceCharacterId || 'unknown', false, gameState.currentTurn);
                }
              }
              hitSomething = true;
              if (!canPierce) {
                shouldRemove = true;
                // Store hit result for visual
                const vfxSprite = proj.attackData.healingEffectSprite || proj.attackData.hitEffectSprite;
                proj.hitResult = {
                  hitTileIndex: dist,
                  deactivate: true,
                  vfxSprite,
                  vfxX: hitAlly.x,
                  vfxY: hitAlly.y,
                };
              }
            }
          } else {
            const hitEnemy = gameState.puzzle.enemies.find(
              e => !e.dead && !e.pendingProjectileDeath && Math.floor(e.x) === checkX && Math.floor(e.y) === checkY &&
                   !hitEntityIds.includes(e.enemyId)
            );
            if (hitEnemy) {
              // Check for Reflect
              if (hasReflect(hitEnemy) && !proj.reflected && canReflectDirection(hitEnemy, proj.direction)) {
                // Build approach path up to reflect point
                reflectAtDist = dist;
                const approachTiles = [...turnTiles];
                reflectProjectile(proj, hitEnemy, gameState, Date.now());
                reflectedThisTurn = true;

                // Continue advancing in reflected direction for full range
                const reflectedDx = getDirectionOffset(proj.direction).dx;
                const reflectedDy = getDirectionOffset(proj.direction).dy;
                const reflectedRange = proj.attackData.range ?? 5;
                const reflectedTiles: Array<{ x: number; y: number }> = [];
                const rEffCharFired = proj.teamSwapped ? !!proj.sourceEnemyId : !!proj.sourceCharacterId;
                const rEffEnemyFired = proj.teamSwapped ? !!proj.sourceCharacterId : !!proj.sourceEnemyId;
                let reflectedHit = false;

                for (let rDist = 1; rDist <= reflectedRange; rDist++) {
                  const rx = Math.floor(proj.startX + reflectedDx * rDist);
                  const ry = Math.floor(proj.startY + reflectedDy * rDist);
                  if (!isInBounds(rx, ry, gameState.puzzle.width, gameState.puzzle.height)) break;
                  const rTile = gameState.puzzle.tiles[ry]?.[rx];
                  if (!rTile || rTile.type === TileTypeEnum.WALL) {
                    reflectedTiles.push({ x: rx, y: ry }); // Include wall tile visually
                    break;
                  }
                  reflectedTiles.push({ x: rx, y: ry });

                  // Check for entity hits along reflected path
                  if (rEffCharFired && !isHealingProjectile) {
                    const rHitEnemy = gameState.puzzle.enemies.find(
                      e => !e.dead && !e.pendingProjectileDeath && Math.floor(e.x) === rx && Math.floor(e.y) === ry &&
                           !(proj.hitEntityIds?.includes(e.enemyId))
                    );
                    if (rHitEnemy) {
                      proj.hitEntityIds?.push(rHitEnemy.enemyId);
                      if (proj.attackData.isRedirect) {
                        if (!isSteadfast(rHitEnemy)) applyRedirect(rHitEnemy, proj.attackData, proj.direction);
                      } else {
                        const baseDmg = proj.attackData.damage ?? 0;
                        const isCrit = proj.attackData.backstabEnabled && isAttackFromBehind(proj.direction, rHitEnemy.facing);
                        const dmg = isCrit ? baseDmg * 2 : baseDmg;
                        rHitEnemy.visualHealth = rHitEnemy.currentHealth;
                        applyDamageToEntityNoDeflect(rHitEnemy, dmg, gameState);
                        if (rHitEnemy.dead) {
                          // Defer death visual
                          rHitEnemy.dead = false;
                          rHitEnemy.pendingProjectileDeath = true;
                        }
                        if (proj.spellAssetId && !rHitEnemy.dead && !rHitEnemy.pendingProjectileDeath) {
                          applyStatusEffectFromProjectile(rHitEnemy, proj.spellAssetId,
                            proj.sourceCharacterId || 'unknown', false, gameState.currentTurn);
                        }
                      }
                      const combinedSoFar = [...approachTiles, ...reflectedTiles];
                      proj.hitResult = {
                        hitTileIndex: combinedSoFar.length - 1,
                        deactivate: true,
                        vfxSprite: proj.attackData.hitEffectSprite,
                        vfxX: rHitEnemy.x, vfxY: rHitEnemy.y,
                        deferredDeathEntityId: rHitEnemy.enemyId,
                        deferredDeathIsEnemy: true,
                        deferredDeathIndex: gameState.puzzle.enemies.indexOf(rHitEnemy),
                      };
                      reflectedHit = true;
                      if (!canPierce) break;
                    }
                  } else if (rEffEnemyFired && !isHealingProjectile) {
                    const rHitChar = gameState.placedCharacters.find(
                      c => !c.dead && !c.pendingProjectileDeath && Math.floor(c.x) === rx && Math.floor(c.y) === ry &&
                           !(proj.hitEntityIds?.includes(c.characterId))
                    );
                    if (rHitChar) {
                      proj.hitEntityIds?.push(rHitChar.characterId);
                      if (proj.attackData.isRedirect) {
                        if (!isSteadfast(rHitChar)) applyRedirect(rHitChar, proj.attackData, proj.direction);
                      } else {
                        const baseDmg = proj.attackData.damage ?? 0;
                        const isCrit = proj.attackData.backstabEnabled && isAttackFromBehind(proj.direction, rHitChar.facing);
                        const dmg = isCrit ? baseDmg * 2 : baseDmg;
                        rHitChar.visualHealth = rHitChar.currentHealth;
                        applyDamageToEntityNoDeflect(rHitChar, dmg, gameState);
                        if (rHitChar.dead) {
                          // Defer death visual
                          rHitChar.dead = false;
                          rHitChar.pendingProjectileDeath = true;
                        }
                        if (proj.spellAssetId && !rHitChar.dead && !rHitChar.pendingProjectileDeath) {
                          applyStatusEffectFromProjectile(rHitChar, proj.spellAssetId,
                            proj.sourceEnemyId || 'unknown', true, gameState.currentTurn);
                        }
                      }
                      const combinedSoFar = [...approachTiles, ...reflectedTiles];
                      proj.hitResult = {
                        hitTileIndex: combinedSoFar.length - 1,
                        deactivate: true,
                        vfxSprite: proj.attackData.hitEffectSprite,
                        vfxX: rHitChar.x, vfxY: rHitChar.y,
                        deferredDeathEntityId: rHitChar.characterId,
                        deferredDeathIsEnemy: false,
                      };
                      reflectedHit = true;
                      if (!canPierce) break;
                    }
                  }
                }

                // Combine approach + reflected tiles
                const combinedPath = [...approachTiles, ...reflectedTiles];
                proj.tilePath = combinedPath;
                proj.currentTileIndex = 0;
                proj.tileEntryTime = Date.now();
                proj.reflectAtTileIndex = approachTiles.length - 1;
                proj.logicalTileIndex = 0;

                // If no hit, set deactivate at end of reflected path
                if (!reflectedHit) {
                  proj.hitResult = {
                    hitTileIndex: combinedPath.length - 1,
                    deactivate: true,
                  };
                }

                if (combinedPath.length > 0) {
                  proj.x = combinedPath[combinedPath.length - 1].x;
                  proj.y = combinedPath[combinedPath.length - 1].y;
                }
                break;
              }

              hitEntityIds.push(hitEnemy.enemyId);
              let vfxSprite: any;
              let deferredDeathEntityId: string | undefined;
              let deferredDeathIsEnemy: boolean | undefined;
              let deferredDeathIndex: number | undefined;

              if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
                triggerAOEExplosion(hitEnemy.x, hitEnemy.y, proj.attackData,
                  proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
              } else if (proj.attackData.isRedirect) {
                if (!isSteadfast(hitEnemy)) applyRedirect(hitEnemy, proj.attackData, proj.direction);
                vfxSprite = proj.attackData.hitEffectSprite;
              } else {
                const baseDmg = proj.attackData.damage ?? 0;
                const isCrit = proj.attackData.backstabEnabled && isAttackFromBehind(proj.direction, hitEnemy.facing);
                const damage = isCrit ? baseDmg * 2 : baseDmg;
                const wasDeflected = applyProjectileDamageWithDeflect(
                  hitEnemy, damage, proj.sourceCharacterId, proj.sourceEnemyId, gameState);
                if (!wasDeflected) {
                  hitEnemy.visualHealth = hitEnemy.currentHealth;
                  applyDamageToEntityNoDeflect(hitEnemy, damage, gameState);
                  if (hitEnemy.dead) {
                    // Defer death visual — undo dead flag, set pendingProjectileDeath
                    hitEnemy.dead = false;
                    hitEnemy.pendingProjectileDeath = true;
                  }
                  deferredDeathEntityId = hitEnemy.enemyId;
                  deferredDeathIsEnemy = true;
                  deferredDeathIndex = gameState.puzzle.enemies.indexOf(hitEnemy);
                }
                if (proj.spellAssetId && !hitEnemy.dead && !hitEnemy.pendingProjectileDeath) {
                  applyStatusEffectFromProjectile(hitEnemy, proj.spellAssetId,
                    proj.sourceCharacterId || 'unknown', false, gameState.currentTurn);
                }
                vfxSprite = isCrit && proj.attackData.criticalHitEffectSprite
                  ? proj.attackData.criticalHitEffectSprite : proj.attackData.hitEffectSprite;
              }
              hitSomething = true;
              if (!canPierce) {
                shouldRemove = true;
                proj.hitResult = {
                  hitTileIndex: dist,
                  deactivate: true,
                  vfxSprite,
                  vfxX: hitEnemy.x,
                  vfxY: hitEnemy.y,
                  deferredDeathEntityId,
                  deferredDeathIsEnemy,
                  deferredDeathIndex,
                };
              }
            }
          }
        } else if (hEffEnemyFired) {
          if (isHealingProjectile) {
            const hitAllyEnemy = gameState.puzzle.enemies.find(
              e => !e.dead && Math.floor(e.x) === checkX && Math.floor(e.y) === checkY &&
                   e.enemyId !== proj.sourceEnemyId &&
                   !hitEntityIds.includes(e.enemyId)
            );
            if (hitAllyEnemy) {
              hitEntityIds.push(hitAllyEnemy.enemyId);
              const healing = proj.attackData.healing ?? 0;
              const enemyData = getEnemy(hitAllyEnemy.enemyId);
              const maxHealth = enemyData?.health ?? hitAllyEnemy.currentHealth;
              hitAllyEnemy.currentHealth = Math.min(hitAllyEnemy.currentHealth + healing, maxHealth);
              hitSomething = true;
              if (!canPierce) {
                shouldRemove = true;
                proj.hitResult = {
                  hitTileIndex: dist,
                  deactivate: true,
                  vfxSprite: proj.attackData.healingEffectSprite || proj.attackData.hitEffectSprite,
                  vfxX: hitAllyEnemy.x,
                  vfxY: hitAllyEnemy.y,
                };
              }
            }
          } else {
            const hitChar = gameState.placedCharacters.find(
              c => !c.dead && !c.pendingProjectileDeath && Math.floor(c.x) === checkX && Math.floor(c.y) === checkY &&
                   !hitEntityIds.includes(c.characterId)
            );
            if (hitChar) {
              // Check for Reflect
              if (hasReflect(hitChar) && !proj.reflected && canReflectDirection(hitChar, proj.direction)) {
                reflectAtDist = dist;
                const approachTiles = [...turnTiles];
                reflectProjectile(proj, hitChar, gameState, Date.now());
                reflectedThisTurn = true;

                const reflectedDx2 = getDirectionOffset(proj.direction).dx;
                const reflectedDy2 = getDirectionOffset(proj.direction).dy;
                const reflectedRange2 = proj.attackData.range ?? 5;
                const reflectedTiles2: Array<{ x: number; y: number }> = [];
                const rEffCharFired2 = proj.teamSwapped ? !!proj.sourceEnemyId : !!proj.sourceCharacterId;
                const rEffEnemyFired2 = proj.teamSwapped ? !!proj.sourceCharacterId : !!proj.sourceEnemyId;
                let reflectedHit2 = false;

                for (let rDist = 1; rDist <= reflectedRange2; rDist++) {
                  const rx = Math.floor(proj.startX + reflectedDx2 * rDist);
                  const ry = Math.floor(proj.startY + reflectedDy2 * rDist);
                  if (!isInBounds(rx, ry, gameState.puzzle.width, gameState.puzzle.height)) break;
                  const rTile = gameState.puzzle.tiles[ry]?.[rx];
                  if (!rTile || rTile.type === TileTypeEnum.WALL) {
                    reflectedTiles2.push({ x: rx, y: ry });
                    break;
                  }
                  reflectedTiles2.push({ x: rx, y: ry });

                  // Check for entity hits along reflected path
                  if (rEffCharFired2 && !isHealingProjectile) {
                    const rHitEnemy2 = gameState.puzzle.enemies.find(
                      e => !e.dead && !e.pendingProjectileDeath && Math.floor(e.x) === rx && Math.floor(e.y) === ry &&
                           !(proj.hitEntityIds?.includes(e.enemyId))
                    );
                    if (rHitEnemy2) {
                      proj.hitEntityIds?.push(rHitEnemy2.enemyId);
                      if (!proj.attackData.isRedirect) {
                        const baseDmg = proj.attackData.damage ?? 0;
                        const isCrit = proj.attackData.backstabEnabled && isAttackFromBehind(proj.direction, rHitEnemy2.facing);
                        const dmg = isCrit ? baseDmg * 2 : baseDmg;
                        rHitEnemy2.visualHealth = rHitEnemy2.currentHealth;
                        applyDamageToEntityNoDeflect(rHitEnemy2, dmg, gameState);
                        if (rHitEnemy2.dead) {
                          // Defer death visual
                          rHitEnemy2.dead = false;
                          rHitEnemy2.pendingProjectileDeath = true;
                        }
                        if (proj.spellAssetId && !rHitEnemy2.dead && !rHitEnemy2.pendingProjectileDeath) {
                          applyStatusEffectFromProjectile(rHitEnemy2, proj.spellAssetId,
                            proj.sourceCharacterId || 'unknown', false, gameState.currentTurn);
                        }
                      } else {
                        if (!isSteadfast(rHitEnemy2)) applyRedirect(rHitEnemy2, proj.attackData, proj.direction);
                      }
                      const combinedSoFar2 = [...approachTiles, ...reflectedTiles2];
                      proj.hitResult = {
                        hitTileIndex: combinedSoFar2.length - 1,
                        deactivate: true,
                        vfxSprite: proj.attackData.hitEffectSprite,
                        vfxX: rHitEnemy2.x, vfxY: rHitEnemy2.y,
                        deferredDeathEntityId: rHitEnemy2.enemyId,
                        deferredDeathIsEnemy: true,
                        deferredDeathIndex: gameState.puzzle.enemies.indexOf(rHitEnemy2),
                      };
                      reflectedHit2 = true;
                      if (!canPierce) break;
                    }
                  } else if (rEffEnemyFired2 && !isHealingProjectile) {
                    const rHitChar2 = gameState.placedCharacters.find(
                      c => !c.dead && !c.pendingProjectileDeath && Math.floor(c.x) === rx && Math.floor(c.y) === ry &&
                           !(proj.hitEntityIds?.includes(c.characterId))
                    );
                    if (rHitChar2) {
                      proj.hitEntityIds?.push(rHitChar2.characterId);
                      if (!proj.attackData.isRedirect) {
                        const baseDmg = proj.attackData.damage ?? 0;
                        const isCrit = proj.attackData.backstabEnabled && isAttackFromBehind(proj.direction, rHitChar2.facing);
                        const dmg = isCrit ? baseDmg * 2 : baseDmg;
                        rHitChar2.visualHealth = rHitChar2.currentHealth;
                        applyDamageToEntityNoDeflect(rHitChar2, dmg, gameState);
                        if (rHitChar2.dead) {
                          // Defer death visual
                          rHitChar2.dead = false;
                          rHitChar2.pendingProjectileDeath = true;
                        }
                        if (proj.spellAssetId && !rHitChar2.dead && !rHitChar2.pendingProjectileDeath) {
                          applyStatusEffectFromProjectile(rHitChar2, proj.spellAssetId,
                            proj.sourceEnemyId || 'unknown', true, gameState.currentTurn);
                        }
                      } else {
                        if (!isSteadfast(rHitChar2)) applyRedirect(rHitChar2, proj.attackData, proj.direction);
                      }
                      const combinedSoFar2 = [...approachTiles, ...reflectedTiles2];
                      proj.hitResult = {
                        hitTileIndex: combinedSoFar2.length - 1,
                        deactivate: true,
                        vfxSprite: proj.attackData.hitEffectSprite,
                        vfxX: rHitChar2.x, vfxY: rHitChar2.y,
                        deferredDeathEntityId: rHitChar2.characterId,
                        deferredDeathIsEnemy: false,
                      };
                      reflectedHit2 = true;
                      if (!canPierce) break;
                    }
                  }
                }

                const combinedPath2 = [...approachTiles, ...reflectedTiles2];
                proj.tilePath = combinedPath2;
                proj.currentTileIndex = 0;
                proj.tileEntryTime = Date.now();
                proj.reflectAtTileIndex = approachTiles.length - 1;
                proj.logicalTileIndex = 0;

                if (!reflectedHit2) {
                  proj.hitResult = {
                    hitTileIndex: combinedPath2.length - 1,
                    deactivate: true,
                  };
                }

                if (combinedPath2.length > 0) {
                  proj.x = combinedPath2[combinedPath2.length - 1].x;
                  proj.y = combinedPath2[combinedPath2.length - 1].y;
                }
                break;
              }

              hitEntityIds.push(hitChar.characterId);
              let vfxSprite: any;
              let deferredDeathEntityId: string | undefined;
              let deferredDeathIsEnemy: boolean | undefined;

              if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
                triggerAOEExplosion(hitChar.x, hitChar.y, proj.attackData,
                  proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
              } else if (proj.attackData.isRedirect) {
                if (!isSteadfast(hitChar)) applyRedirect(hitChar, proj.attackData, proj.direction);
                vfxSprite = proj.attackData.hitEffectSprite;
              } else {
                const baseDmg = proj.attackData.damage ?? 0;
                const isCrit = proj.attackData.backstabEnabled && isAttackFromBehind(proj.direction, hitChar.facing);
                const damage = isCrit ? baseDmg * 2 : baseDmg;
                const wasDeflected = applyProjectileDamageWithDeflect(
                  hitChar, damage, proj.sourceCharacterId, proj.sourceEnemyId, gameState);
                if (!wasDeflected) {
                  hitChar.visualHealth = hitChar.currentHealth;
                  applyDamageToEntityNoDeflect(hitChar, damage, gameState);
                  if (hitChar.dead) {
                    // Defer death visual — undo dead flag, set pendingProjectileDeath
                    hitChar.dead = false;
                    hitChar.pendingProjectileDeath = true;
                  }
                  deferredDeathEntityId = hitChar.characterId;
                  deferredDeathIsEnemy = false;
                }
                if (proj.spellAssetId && !hitChar.dead && !hitChar.pendingProjectileDeath) {
                  applyStatusEffectFromProjectile(hitChar, proj.spellAssetId,
                    proj.sourceEnemyId || 'unknown', true, gameState.currentTurn);
                }
                vfxSprite = isCrit && proj.attackData.criticalHitEffectSprite
                  ? proj.attackData.criticalHitEffectSprite : proj.attackData.hitEffectSprite;
              }
              hitSomething = true;
              if (!canPierce) {
                shouldRemove = true;
                proj.hitResult = {
                  hitTileIndex: dist,
                  deactivate: true,
                  vfxSprite,
                  vfxX: hitChar.x,
                  vfxY: hitChar.y,
                  deferredDeathEntityId,
                  deferredDeathIsEnemy,
                };
              }
            }
          }
        }

        if (dist === endTile) {
          // Reached end of this turn's travel
        }
      }

      // Skip position/tilePath updates if reflected (already handled above)
      if (reflectedThisTurn) continue;

      // Update projectile position if still active
      if (!shouldRemove && !hitWall) {
        const newDist = Math.min(endTile, range);
        proj.x = proj.startX + dx * newDist;
        proj.y = proj.startY + dy * newDist;
        proj.logicalTileIndex = newDist;

        // Check if reached max range
        if (newDist >= range) {
          if (!hitSomething && proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
            const finalX = Math.floor(proj.startX + dx * range);
            const finalY = Math.floor(proj.startY + dy * range);
            if (isInBounds(finalX, finalY, gameState.puzzle.width, gameState.puzzle.height)) {
              triggerAOEExplosion(finalX, finalY, proj.attackData,
                proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
            }
          }
          shouldRemove = true;
        }
      } else if (hitSomething || hitWall) {
        // Update logicalTileIndex to the last tile we reached
        const lastDist = turnTiles.length > 0 ? startTile + turnTiles.length - 1 : startTile;
        proj.logicalTileIndex = lastDist;
      }

      // Don't overwrite tilePath — it was set at spawn time with the full visual path.
      // Only update the logical position for next turn's distance calculation.
      if (turnTiles.length > 0) {
        proj.x = turnTiles[turnTiles.length - 1].x;
        proj.y = turnTiles[turnTiles.length - 1].y;
      }
    }

    if (shouldRemove) {
      // Always let the visual system handle deactivation.
      // If no hitResult, create one that just deactivates at end of path.
      if (!proj.hitResult) {
        proj.hitResult = {
          hitTileIndex: Math.min(logicalEndTile, (proj.tilePath?.length ?? 1) - 1),
          deactivate: true,
        };
      }
      // If hitResult exists, the visual system will deactivate when animation reaches hitTileIndex
    }
  }

  // Remove projectiles that have no visual to show
  gameState.activeProjectiles = gameState.activeProjectiles.filter(
    p => !projectilesToRemove.includes(p.id)
  );
}

/**
 * Update projectiles in headless mode (turn-based movement for solver/validator)
 * Projectiles move a fixed number of tiles per turn based on their speed
 * Speed is stored directly as tiles per turn (no conversion needed)
 */
function updateProjectilesHeadless(gameState: GameState): void {
  if (!gameState.activeProjectiles) return;

  const projectilesToRemove: string[] = [];

  for (const proj of gameState.activeProjectiles) {
    if (!proj.active) {
      projectilesToRemove.push(proj.id);
      continue;
    }

    // A projectile is considered "friendly" if healing is defined (even if 0 for status-effect-only spells)
    const isHealingProjectile = proj.attackData.healing !== undefined;
    const range = proj.attackData.range || 10;
    const tilesPerTurn = proj.speed || 4; // Speed is now directly tiles per turn

    let hitSomething = false;
    let shouldRemove = false;

    // For homing projectiles, move toward target
    if (proj.isHoming && proj.targetEntityId) {
      let targetEntity: { x: number; y: number; dead?: boolean } | undefined;
      if (proj.targetIsEnemy) {
        // Use sourceEnemyIndex for reflected projectiles targeting duplicate enemies
        if (proj.reflected && proj.sourceEnemyIndex !== undefined && gameState.puzzle.enemies[proj.sourceEnemyIndex]) {
          const enemy = gameState.puzzle.enemies[proj.sourceEnemyIndex];
          if (!enemy.dead) targetEntity = enemy;
        }
        if (!targetEntity) {
          targetEntity = gameState.puzzle.enemies.find(e => e.enemyId === proj.targetEntityId && !e.dead);
        }
      } else {
        targetEntity = gameState.placedCharacters.find(c => c.characterId === proj.targetEntityId && !c.dead);
      }

      if (targetEntity) {
        // Calculate distance to target
        const dx = targetEntity.x - proj.x;
        const dy = targetEntity.y - proj.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if we reach the target this turn
        if (distance <= tilesPerTurn) {
          // Hit the target
          if (proj.sourceCharacterId && proj.targetIsEnemy) {
            // Character's homing projectile hitting enemy
            const enemy = targetEntity as PlacedEnemy;
            // Check for Reflect
            if (hasReflect(enemy) && !proj.reflected && canReflectDirection(enemy, proj.direction)) {
              reflectProjectile(proj, enemy, gameState, Date.now());
              continue;
            }
            if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
              triggerAOEExplosion(enemy.x, enemy.y, proj.attackData,
                proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
            } else if (proj.attackData.isRedirect) {
              if (!isSteadfast(enemy)) applyRedirect(enemy, proj.attackData, proj.direction);
              const hs3 = proj.attackData.hitEffectSprite;
              if (hs3) spawnParticleEffect(enemy.x, enemy.y, hs3, proj.attackData.effectDuration || 300, gameState);
            } else {
              const baseDmg = proj.attackData.damage ?? 0;
              const isCrit = proj.attackData.backstabEnabled && isAttackFromBehind(proj.direction, enemy.facing);
              const damage = isCrit ? baseDmg * 2 : baseDmg;
              const wasDeflected = applyProjectileDamageWithDeflect(
                enemy, damage, proj.sourceCharacterId, proj.sourceEnemyId, gameState);
              if (!wasDeflected) {
                applyDamageToEntityNoDeflect(enemy, damage, gameState);
                if (enemy.dead) {
                  handleEntityDeathDrop(enemy, true, gameState);
                }
              }
              if (proj.spellAssetId && !enemy.dead) {
                applyStatusEffectFromProjectile(enemy, proj.spellAssetId,
                  proj.sourceCharacterId || 'unknown', false, gameState.currentTurn);
              }
            }
          } else if (proj.sourceEnemyId && !proj.targetIsEnemy) {
            // Enemy's homing projectile hitting character
            const char = targetEntity as PlacedCharacter;
            // Check for Reflect
            if (hasReflect(char) && !proj.reflected && canReflectDirection(char, proj.direction)) {
              reflectProjectile(proj, char, gameState, Date.now());
              continue;
            }
            if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
              triggerAOEExplosion(char.x, char.y, proj.attackData,
                proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
            } else if (proj.attackData.isRedirect) {
              if (!isSteadfast(char)) applyRedirect(char, proj.attackData, proj.direction);
              const hs4 = proj.attackData.hitEffectSprite;
              if (hs4) spawnParticleEffect(char.x, char.y, hs4, proj.attackData.effectDuration || 300, gameState);
            } else {
              const baseDmg = proj.attackData.damage ?? 0;
              const isCrit = proj.attackData.backstabEnabled && isAttackFromBehind(proj.direction, char.facing);
              const damage = isCrit ? baseDmg * 2 : baseDmg;
              const wasDeflected = applyProjectileDamageWithDeflect(
                char, damage, proj.sourceCharacterId, proj.sourceEnemyId, gameState);
              if (!wasDeflected) {
                applyDamageToEntityNoDeflect(char, damage, gameState);
                if (char.dead) {
                  handleEntityDeathDrop(char, false, gameState);
                }
              }
              if (proj.spellAssetId && !char.dead) {
                applyStatusEffectFromProjectile(char, proj.spellAssetId,
                  proj.sourceEnemyId || 'unknown', true, gameState.currentTurn);
              }
            }
          } else if (proj.sourceCharacterId && !proj.targetIsEnemy) {
            // Character's homing projectile hitting friendly character (buff/heal spell)
            const char = targetEntity as PlacedCharacter;
            // Apply healing if spell has healing value (friendly fire damage is NOT applied)
            const healing = proj.attackData.healing ?? 0;
            if (healing > 0) {
              const charData = getCharacter(char.characterId) || loadCharacter(char.characterId);
              const maxHealth = charData?.health || char.currentHealth;
              char.currentHealth = Math.min(char.currentHealth + healing, maxHealth);
            }
            // Apply status effect (shield, regen, etc.) if spell has one
            if (proj.spellAssetId && !char.dead) {
              applyStatusEffectFromProjectile(char, proj.spellAssetId,
                proj.sourceCharacterId || 'unknown', false, gameState.currentTurn);
            }
          } else if (proj.sourceEnemyId && proj.targetIsEnemy) {
            // Enemy's homing projectile hitting friendly enemy (buff/heal spell)
            const enemy = targetEntity as PlacedEnemy;
            // Apply healing if spell has healing value (friendly fire damage is NOT applied)
            const healing = proj.attackData.healing ?? 0;
            if (healing > 0) {
              const enemyData = loadEnemy(enemy.enemyId) || { health: enemy.currentHealth };
              const maxHealth = enemyData?.health || enemy.currentHealth;
              enemy.currentHealth = Math.min(enemy.currentHealth + healing, maxHealth);
            }
            // Apply status effect (shield, regen, etc.) if spell has one
            if (proj.spellAssetId && !enemy.dead) {
              applyStatusEffectFromProjectile(enemy, proj.spellAssetId,
                proj.sourceEnemyId || 'unknown', true, gameState.currentTurn);
            }
          }
          shouldRemove = true;
        } else {
          // Move toward target but don't reach it yet
          const moveRatio = tilesPerTurn / distance;
          proj.x += dx * moveRatio;
          proj.y += dy * moveRatio;
          // Update target position for next turn (target may have moved)
          proj.targetX = targetEntity.x;
          proj.targetY = targetEntity.y;
        }
      } else {
        // Target died or not found - remove projectile
        shouldRemove = true;
      }
    } else {
      // Non-homing projectile: move along direction, check for hits
      const { dx, dy } = getDirectionOffset(proj.direction);
      const canPierce = proj.attackData.projectilePierces === true;

      // Initialize hit tracking if not present
      if (!proj.hitEntityIds) proj.hitEntityIds = [];
      const hitEntityIds = proj.hitEntityIds;

      // Calculate how far projectile has traveled from start
      const currentDist = Math.sqrt(
        Math.pow(proj.x - proj.startX, 2) + Math.pow(proj.y - proj.startY, 2)
      );
      const startTile = Math.floor(currentDist) + 1; // Next tile to check (1-indexed from start)
      const endTile = Math.min(startTile + tilesPerTurn - 1, range);
      let reachedEnd = false;
      let hitWall = false;

      for (let dist = startTile; dist <= endTile; dist++) {
        // Stop if we hit something and can't pierce
        if (hitSomething && !canPierce) {
          shouldRemove = true;
          break;
        }

        const checkX = Math.floor(proj.startX + dx * dist);
        const checkY = Math.floor(proj.startY + dy * dist);

        // Check bounds
        if (!isInBounds(checkX, checkY, gameState.puzzle.width, gameState.puzzle.height)) {
          shouldRemove = true;
          break;
        }

        // Check wall
        const tile = gameState.puzzle.tiles[checkY]?.[checkX];
        if (!tile || tile.type === TileTypeEnum.WALL) {
          // Hit wall - trigger AOE if configured, then stop
          if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
            triggerAOEExplosion(checkX, checkY, proj.attackData,
              proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
          }
          hitWall = true;
          shouldRemove = true;
          break;
        }

        // Check for entity hits at this tile
        // teamSwapped flips targeting (reflected projectiles hit the caster's team)
        const hEffCharFired = proj.teamSwapped ? !!proj.sourceEnemyId : !!proj.sourceCharacterId;
        const hEffEnemyFired = proj.teamSwapped ? !!proj.sourceCharacterId : !!proj.sourceEnemyId;
        if (hEffCharFired) {
          // Effectively targeting enemies
          if (isHealingProjectile) {
            const hitAlly = gameState.placedCharacters.find(
              c => !c.dead && Math.floor(c.x) === checkX && Math.floor(c.y) === checkY &&
                   c.characterId !== proj.sourceCharacterId &&
                   !hitEntityIds.includes(c.characterId)
            );
            if (hitAlly) {
              hitEntityIds.push(hitAlly.characterId);
              if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
                triggerAOEExplosion(hitAlly.x, hitAlly.y, proj.attackData,
                  proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
              } else {
                const healing = proj.attackData.healing ?? 0;
                if (healing > 0) {
                  const charData = getCharacter(hitAlly.characterId);
                  const maxHealth = charData?.health ?? hitAlly.currentHealth;
                  hitAlly.currentHealth = Math.min(hitAlly.currentHealth + healing, maxHealth);
                }
                // Apply status effect (shield, regen, etc.) if spell has one
                if (proj.spellAssetId && !hitAlly.dead) {
                  applyStatusEffectFromProjectile(hitAlly, proj.spellAssetId,
                    proj.sourceCharacterId || 'unknown', false, gameState.currentTurn);
                }
              }
              hitSomething = true;
              if (!canPierce) shouldRemove = true;
            }
          } else {
            // Check for enemy hits
            // For projectiles spawned this turn, also check pre-move positions
            // This allows same-turn hits (projectile reaches tile before enemy moves away)
            let hitEnemy: PlacedEnemy | undefined;

            // Check current (post-move) positions only — in the real game, projectiles
            // travel over time and won't hit enemies that have already moved away
            hitEnemy = gameState.puzzle.enemies.find(
              e => !e.dead && Math.floor(e.x) === checkX && Math.floor(e.y) === checkY &&
                   !hitEntityIds.includes(e.enemyId)
            );

            if (hitEnemy) {
              // Check for Reflect
              if (hasReflect(hitEnemy) && !proj.reflected && canReflectDirection(hitEnemy, proj.direction)) {
                reflectProjectile(proj, hitEnemy, gameState, Date.now());
                break;
              }
              hitEntityIds.push(hitEnemy.enemyId);
              if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
                triggerAOEExplosion(hitEnemy.x, hitEnemy.y, proj.attackData,
                  proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
              } else if (proj.attackData.isRedirect) {
                if (!isSteadfast(hitEnemy)) applyRedirect(hitEnemy, proj.attackData, proj.direction);
                const hs5 = proj.attackData.hitEffectSprite;
                if (hs5) spawnParticleEffect(hitEnemy.x, hitEnemy.y, hs5, proj.attackData.effectDuration || 300, gameState);
              } else {
                const baseDmg = proj.attackData.damage ?? 0;
                const isCrit = proj.attackData.backstabEnabled && isAttackFromBehind(proj.direction, hitEnemy.facing);
                const damage = isCrit ? baseDmg * 2 : baseDmg;
                const wasDeflected = applyProjectileDamageWithDeflect(
                  hitEnemy, damage, proj.sourceCharacterId, proj.sourceEnemyId, gameState);
                if (!wasDeflected) {
                  applyDamageToEntityNoDeflect(hitEnemy, damage, gameState);
                  if (hitEnemy.dead) {
                    handleEntityDeathDrop(hitEnemy, true, gameState);
                  }
                }
                if (proj.spellAssetId && !hitEnemy.dead) {
                  applyStatusEffectFromProjectile(hitEnemy, proj.spellAssetId,
                    proj.sourceCharacterId || 'unknown', false, gameState.currentTurn);
                }
              }
              hitSomething = true;
              if (!canPierce) shouldRemove = true;
            }
          }
        } else if (hEffEnemyFired) {
          // Effectively targeting characters
          if (isHealingProjectile) {
            const hitAllyEnemy = gameState.puzzle.enemies.find(
              e => !e.dead && Math.floor(e.x) === checkX && Math.floor(e.y) === checkY &&
                   e.enemyId !== proj.sourceEnemyId &&
                   !hitEntityIds.includes(e.enemyId)
            );
            if (hitAllyEnemy) {
              hitEntityIds.push(hitAllyEnemy.enemyId);
              const healing = proj.attackData.healing ?? 0;
              const enemyData = getEnemy(hitAllyEnemy.enemyId);
              const maxHealth = enemyData?.health ?? hitAllyEnemy.currentHealth;
              hitAllyEnemy.currentHealth = Math.min(hitAllyEnemy.currentHealth + healing, maxHealth);
              hitSomething = true;
              if (!canPierce) shouldRemove = true;
            }
          } else {
            // Check for character hits
            // For projectiles spawned this turn, also check pre-move positions
            let hitChar: PlacedCharacter | undefined;

            // Check current (post-move) positions only — in the real game, projectiles
            // travel over time and won't hit characters that have already moved away
            hitChar = gameState.placedCharacters.find(
              c => !c.dead && Math.floor(c.x) === checkX && Math.floor(c.y) === checkY &&
                   !hitEntityIds.includes(c.characterId)
            );

            if (hitChar) {
              // Check for Reflect
              if (hasReflect(hitChar) && !proj.reflected && canReflectDirection(hitChar, proj.direction)) {
                reflectProjectile(proj, hitChar, gameState, Date.now());
                break;
              }
              hitEntityIds.push(hitChar.characterId);
              if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
                triggerAOEExplosion(hitChar.x, hitChar.y, proj.attackData,
                  proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
              } else if (proj.attackData.isRedirect) {
                if (!isSteadfast(hitChar)) applyRedirect(hitChar, proj.attackData, proj.direction);
                const hs6 = proj.attackData.hitEffectSprite;
                if (hs6) spawnParticleEffect(hitChar.x, hitChar.y, hs6, proj.attackData.effectDuration || 300, gameState);
              } else {
                const baseDmg = proj.attackData.damage ?? 0;
                const isCrit = proj.attackData.backstabEnabled && isAttackFromBehind(proj.direction, hitChar.facing);
                const damage = isCrit ? baseDmg * 2 : baseDmg;
                const wasDeflected = applyProjectileDamageWithDeflect(
                  hitChar, damage, proj.sourceCharacterId, proj.sourceEnemyId, gameState);
                if (!wasDeflected) {
                  applyDamageToEntityNoDeflect(hitChar, damage, gameState);
                  if (hitChar.dead) {
                    handleEntityDeathDrop(hitChar, false, gameState);
                  }
                }
                if (proj.spellAssetId && !hitChar.dead) {
                  applyStatusEffectFromProjectile(hitChar, proj.spellAssetId,
                    proj.sourceEnemyId || 'unknown', true, gameState.currentTurn);
                }
              }
              hitSomething = true;
              if (!canPierce) shouldRemove = true;
            }
          }
        }

        // Track how far we've traveled this turn
        if (dist === endTile) {
          reachedEnd = true;
        }
      }

      // Update projectile position if it's still active
      if (!shouldRemove && !hitWall) {
        // Move projectile to end of this turn's travel
        const newDist = Math.min(endTile, range);
        proj.x = proj.startX + dx * newDist;
        proj.y = proj.startY + dy * newDist;

        // Check if reached max range
        if (newDist >= range) {
          // If reached max range with no hit, check for AOE at final position
          if (!hitSomething && proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
            const finalX = Math.floor(proj.startX + dx * range);
            const finalY = Math.floor(proj.startY + dy * range);
            if (isInBounds(finalX, finalY, gameState.puzzle.width, gameState.puzzle.height)) {
              triggerAOEExplosion(finalX, finalY, proj.attackData,
                proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
            }
          }
          shouldRemove = true;
        }
      }
    }

    if (shouldRemove) {
      proj.active = false;
      projectilesToRemove.push(proj.id);
    }
  }

  // Remove processed projectiles
  gameState.activeProjectiles = gameState.activeProjectiles.filter(
    p => !projectilesToRemove.includes(p.id)
  );
}

/**
 * Update all active particles (remove expired ones, should be called from animation loop)
 */
export function updateParticles(gameState: GameState): void {
  if (!gameState.activeParticles || gameState.activeParticles.length === 0) {
    return;
  }

  const now = Date.now();

  // Remove expired particles
  gameState.activeParticles = gameState.activeParticles.filter(p => {
    const elapsed = now - p.startTime;
    return elapsed < p.duration;
  });
}

/**
 * Helper to spawn particle effects
 */
/**
 * Apply redirect effect to an entity — changes its facing direction
 * Returns the new direction for logging/effects
 */
function applyRedirect(
  entity: { facing: Direction },
  attackData: { redirectMode?: string; redirectAngle?: number; redirectFixedDirection?: Direction },
  projectileDirection: Direction
): Direction {
  const mode = attackData.redirectMode || 'clockwise';
  const angle = attackData.redirectAngle || 90;

  switch (mode) {
    case 'clockwise':
      entity.facing = turnRight(entity.facing, angle);
      break;
    case 'counter_clockwise':
      entity.facing = turnLeft(entity.facing, angle);
      break;
    case 'face_projectile':
      // Face the direction the projectile is coming from
      entity.facing = turnAround(projectileDirection);
      break;
    case 'face_away':
      // Face the same direction as the projectile (pushed away)
      entity.facing = projectileDirection;
      break;
    case 'fixed':
      entity.facing = attackData.redirectFixedDirection || Direction.NORTH;
      break;
  }
  return entity.facing;
}

function spawnParticleEffect(
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

function isInBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && x < width && y >= 0 && y < height;
}

/**
 * Convert a direction vector to a Direction enum
 */
function getDirectionFromVector(dx: number, dy: number): Direction {
  // Normalize to determine primary direction
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Check for diagonal movement
  if (absDx > 0.1 && absDy > 0.1) {
    // Diagonal
    if (dx > 0 && dy < 0) return Direction.NORTHEAST;
    if (dx > 0 && dy > 0) return Direction.SOUTHEAST;
    if (dx < 0 && dy > 0) return Direction.SOUTHWEST;
    if (dx < 0 && dy < 0) return Direction.NORTHWEST;
  }

  // Cardinal directions
  if (absDx > absDy) {
    return dx > 0 ? Direction.EAST : Direction.WEST;
  } else {
    return dy > 0 ? Direction.SOUTH : Direction.NORTH;
  }
}

/**
 * Process persistent area effects (like fire on the ground)
 * Damages enemies in the area each turn and decrements duration
 */
function processPersistentAreaEffects(gameState: GameState): void {
  if (!gameState.persistentAreaEffects || gameState.persistentAreaEffects.length === 0) {
    return;
  }

  // Process each persistent effect
  gameState.persistentAreaEffects.forEach(effect => {
    // Damage all enemies in radius
    gameState.puzzle.enemies.forEach(enemy => {
      if (enemy.dead) return;

      const distance = Math.sqrt(
        Math.pow(enemy.x - effect.x, 2) + Math.pow(enemy.y - effect.y, 2)
      );

      if (distance <= effect.radius) {
        // Use centralized damage for shields
        applyDamageToEntityNoDeflect(enemy, effect.damagePerTurn, gameState);
        if (enemy.dead) {
          handleEntityDeathDrop(enemy, true, gameState);
        }
      }
    });

    // Decrement duration
    effect.turnsRemaining--;
  });

  // Remove expired effects
  gameState.persistentAreaEffects = gameState.persistentAreaEffects.filter(
    effect => effect.turnsRemaining > 0
  );
}
