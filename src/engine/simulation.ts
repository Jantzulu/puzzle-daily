/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, no-case-declarations, prefer-const */
import type { GameState, PlacedCharacter, PlacedEnemy, ParallelActionTracker, StatusEffectInstance, SpellTemplate, SpellAsset, PlacedCollectible, CharacterAction, Puzzle, Projectile, ProjectileVisualState, SpriteReference, ProjectileEvent } from '../types/game';
import { ActionType, Direction, StatusEffectType, TileType as TileTypeEnum } from '../types/game';
import { getCharacter } from '../data/characters';
import { getEnemy } from '../data/enemies';
import { executeAction, executeAOEAttack, evaluateTriggers, executeDeathTriggers, applyDamageToEntity, applyDamageToEntityNoDeflect, placeCollectibleFromSpell } from './actions';
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
  if (!proj.hitEnemyIndices) proj.hitEnemyIndices = [];
  const isHealingProjectile = proj.attackData.healing !== undefined;
  if (isHealingProjectile) return; // Don't damage along path for healing spells

  const effectivelyCharFired = proj.teamSwapped ? !!proj.sourceEnemyId : !!proj.sourceCharacterId;
  const effectivelyEnemyFired = proj.teamSwapped ? !!proj.sourceCharacterId : !!proj.sourceEnemyId;

  for (const tile of tiles) {
    // Skip the starting tile
    if (tile.x === Math.floor(proj.x) && tile.y === Math.floor(proj.y)) continue;

    if (effectivelyCharFired) {
      // Check for enemy hits — dedup by array index (hitEnemyIndices), not
      // by enemyId, so multiple enemies sharing an enemyId all get hit by
      // pierce.
      const hitEnemyIndex = gameState.puzzle.enemies.findIndex(
        (e, i) => !e.dead && !e.pendingProjectileDeath &&
             Math.floor(e.x) === tile.x && Math.floor(e.y) === tile.y &&
             !proj.hitEnemyIndices!.includes(i) &&
             e.enemyId !== proj.targetEntityId // Don't hit designated target along path
      );
      const hitEnemy = hitEnemyIndex >= 0 ? gameState.puzzle.enemies[hitEnemyIndex] : undefined;
      if (hitEnemy) {
        proj.hitEnemyIndices!.push(hitEnemyIndex);
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
function getReflectVisuals(entity: PlacedCharacter | PlacedEnemy): { tintColor?: string; overrideSprite?: SpriteReference; impactSprite?: SpriteReference } {
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
    impactSprite: asset.reflectImpactSprite,
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

  // Clear homing visual state — reflected projectiles use tile-by-tile animation
  // (straight-line would interpolate from start to end, missing the V-shaped bounce)
  proj.homingVisualStartX = undefined;
  proj.homingVisualStartY = undefined;
  proj.homingVisualStartTime = undefined;

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

  // Clear piercing tracking so reflected projectile can hit new targets.
  // Seed with the reflector so the reflected projectile doesn't immediately
  // re-hit the entity it bounced off — tracked by array index for enemies
  // (duplicate-id safe) and by characterId for characters (always unique).
  const reflectorIsEnemy = 'enemyId' in reflector;
  if (reflectorIsEnemy) {
    proj.hitEntityIds = [];
    const reflectorIdx = gameState.puzzle.enemies.indexOf(reflector as PlacedEnemy);
    proj.hitEnemyIndices = reflectorIdx >= 0 ? [reflectorIdx] : [];
  } else {
    proj.hitEntityIds = [(reflector as PlacedCharacter).characterId];
    proj.hitEnemyIndices = [];
  }

  // Store reflect VFX data — will be spawned when visual reaches reflect point
  // (not now, because the approach animation hasn't played yet)
  proj.pendingReflectVfx = {
    sprite: visuals.impactSprite || { type: 'inline', spriteData: { shape: 'circle', primaryColor: visuals.tintColor || '#06b6d4' } },
    x: reflector.x,
    y: reflector.y,
    duration: 300,
    scale: 0.8,
  };

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
                                  effect.type === StatusEffectType.HASTE ||
                                  effect.type === StatusEffectType.SILENCED ||
                                  effect.type === StatusEffectType.DISARMED ||
                                  effect.type === StatusEffectType.DISPEL ||
                                  effect.type === StatusEffectType.CLEANSE;

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

      case StatusEffectType.DISPEL:
      case StatusEffectType.CLEANSE: {
        const isDispel = effect.type === StatusEffectType.DISPEL;
        const targetPolarity = isDispel ? 'positive' : 'negative';
        const immuneKey = isDispel ? 'immuneToDispel' : 'immuneToCleanse';
        const targetTypes = effectAsset?.targetEffectTypes;

        (updatedEntity.statusEffects || []).forEach(other => {
          if (other.id === effect.id) return; // skip self
          const otherAsset = loadStatusEffectAsset(other.statusAssetId);
          if (otherAsset?.[immuneKey]) return; // immune
          const polarity = STATUS_EFFECT_POLARITY[other.type];
          if (polarity !== targetPolarity) return; // wrong polarity
          // Check targetEffectTypes filter
          if (targetTypes && targetTypes !== 'all' && !targetTypes.includes(other.type)) return;
          effectsToRemove.push(other.id);
        });
        // DISPEL/CLEANSE itself is also consumed (duration 1)
        effectsToRemove.push(effect.id);
        break;
      }

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
 * Polarity of each status effect type — used by DISPEL (removes positive) and CLEANSE (removes negative).
 * 'neutral' effects (innate traits) are never removed by either.
 */
const STATUS_EFFECT_POLARITY: Record<StatusEffectType, 'positive' | 'negative' | 'neutral'> = {
  [StatusEffectType.POISON]:          'negative',
  [StatusEffectType.BURN]:            'negative',
  [StatusEffectType.BLEED]:           'negative',
  [StatusEffectType.STUN]:            'negative',
  [StatusEffectType.SLEEP]:           'negative',
  [StatusEffectType.SLOW]:            'negative',
  [StatusEffectType.SILENCED]:        'negative',
  [StatusEffectType.DISARMED]:        'negative',
  [StatusEffectType.CHARM]:           'negative',
  [StatusEffectType.DISPEL]:          'neutral',  // instant, shouldn't linger
  [StatusEffectType.CLEANSE]:         'neutral',  // instant, shouldn't linger
  [StatusEffectType.REGEN]:           'positive',
  [StatusEffectType.SHIELD]:          'positive',
  [StatusEffectType.HASTE]:           'positive',
  [StatusEffectType.STEALTH]:         'positive',
  [StatusEffectType.DEFLECT]:         'positive',
  [StatusEffectType.INVULNERABLE]:    'positive',
  [StatusEffectType.STEADFAST]:       'positive',
  [StatusEffectType.REFLECT]:         'positive',
  [StatusEffectType.POLYMORPH]:       'negative',
  // Innate traits — never removed by Dispel/Cleanse
  [StatusEffectType.CONTACT_DAMAGE]:  'neutral',
  [StatusEffectType.GHOST]:           'neutral',
  [StatusEffectType.WALL_ALIVE]:      'neutral',
  [StatusEffectType.WALL_DEAD]:       'neutral',
  [StatusEffectType.WALL_BOTH]:       'neutral',
  [StatusEffectType.HALT_ALIVE]:      'neutral',
  [StatusEffectType.HALT_DEAD]:       'neutral',
  [StatusEffectType.HALT_BOTH]:       'neutral',
  [StatusEffectType.PRIORITY]:        'neutral',
  [StatusEffectType.STURDY]:          'neutral',
};

/**
 * Check if an entity can perform actions based on status effects
 */
export function canEntityAct(entity: PlacedCharacter | PlacedEnemy): { allowed: boolean; reason?: string } {
  if (!entity.statusEffects) return { allowed: true };

  for (const effect of entity.statusEffects) {
    if (effect.type === StatusEffectType.STUN ||
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
    // Check melee prevention (Disarmed) - applies to both melee and melee_cone
    if ((spellTemplate === 'melee' || spellTemplate === 'melee_cone') && effect.type === StatusEffectType.DISARMED) {
      return { allowed: false, reason: 'Disarmed' };
    }

    // Check ranged/AOE prevention (Silenced) — includes throw/place
    if ((spellTemplate === 'magic_linear' || spellTemplate === 'redirect' || spellTemplate === 'aoe' || spellTemplate === 'throw_place') &&
        effect.type === StatusEffectType.SILENCED) {
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

  // Sleep and Polymorph are removed when the entity takes damage
  entity.statusEffects = entity.statusEffects.filter(e =>
    e.type !== StatusEffectType.SLEEP && e.type !== StatusEffectType.POLYMORPH
  );
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
    if (enemy.statusEffects?.some(e => e.type === StatusEffectType.PRIORITY)) {
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
    if (!enemy.statusEffects?.some(e => e.type === StatusEffectType.PRIORITY) && !enemy.dead) {
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

  // Process collectible durations (despawn expired items)
  processCollectibleDurations(gameState);

  // Process turn-end status effects for all entities
  processAllStatusEffectsTurnEnd(gameState);

  // Decrement spell cooldowns at end of turn
  // This happens AFTER actions, so cooldown of N means "skip N turns"
  decrementSpellCooldowns(gameState);

  // Check win/lose conditions (skip in test mode)
  if (!gameState.testMode) {
    checkGameConditions(gameState);

    // Are there projectiles still in flight that could still cause damage
    // or land hits this game? "In flight" = active AND not yet resolved
    // (hitResult means damage already applied awaiting visual; pendingDeactivation
    // means logically terminated awaiting visual deactivation). If so, don't
    // declare defeat yet — a slow bolt fired on the last active turn still
    // deserves a chance to land.
    const hasInFlightProjectile = (gameState.activeProjectiles ?? []).some(
      (p) => p.active && !p.hitResult,
    );

    // Check if we've exceeded the turn limit
    const maxTurns = gameState.puzzle.maxTurns || 1000; // Default to 1000 if not specified
    if (gameState.currentTurn >= maxTurns && gameState.gameStatus === 'running' && !hasInFlightProjectile) {
      gameState.gameStatus = 'defeat';
      return gameState;
    }

    // Check if all characters are inactive
    const hasActiveCharacters = gameState.placedCharacters.some((c) => c.active && !c.dead);
    if (!hasActiveCharacters && gameState.gameStatus === 'running' && !hasInFlightProjectile) {
      // All characters done and no projectiles still flying — decide outcome now.
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
        const placedEnemy = {
          ...e,
          dead: false, // Always reset dead status
          currentHealth: maxHealth // Reset to full health from enemy definition
        };

        // Apply initial status effects from enemy definition
        if (enemyData?.initialStatusEffects && enemyData.initialStatusEffects.length > 0) {
          placedEnemy.statusEffects = enemyData.initialStatusEffects.map(ise => {
            const effectAsset = loadStatusEffectAsset(ise.statusAssetId);
            if (!effectAsset) return null;
            return {
              id: `initial_${ise.statusAssetId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: effectAsset.type,
              statusAssetId: ise.statusAssetId,
              duration: ise.durationOverride === -1 ? 99999 : (ise.durationOverride ?? effectAsset.defaultDuration),
              value: ise.valueOverride ?? effectAsset.defaultValue,
              currentStacks: 1,
              appliedOnTurn: 0,
              sourceEntityId: 'initial',
              sourceIsEnemy: true,
              movementSkipCounter: 0,
            };
          }).filter(Boolean) as NonNullable<typeof placedEnemy.statusEffects>;
        }

        return placedEnemy;
      }),
      collectibles: puzzle.collectibles.map((c) => {
        const placed = { ...c, collected: false };
        // Initialize duration from base collectible asset if it has one
        if (placed.collectibleId && placed.duration === undefined) {
          const asset = loadCollectible(placed.collectibleId);
          if (asset?.duration && asset.duration > 0) {
            placed.duration = asset.duration;
            placed.spawnTurn = 0;
          }
        }
        return placed;
      }),
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

import type { ParticleEffect } from '../types/game';
import { TileType } from '../types/game';

// ==========================================
// PROJECTILE VISUAL UPDATE HELPERS (Phase B of projectile refactor)
// ==========================================
// Each helper is a verbatim extraction of a movement branch previously nested
// in updateProjectiles(). Same math, same side effects on
// proj.direction / proj.visualPastReflectPoint / proj.currentTileIndex.
// No behavior change — only code organization. See
// docs/projectile-refactor-plan.md Phase B.
//
// Each returns { newX, newY, reachedTarget }; updateProjectiles applies
// proj.x = newX, proj.y = newY and runs shared bridge-field consumption.

interface ProjectileMovementResult {
  newX: number;
  newY: number;
  reachedTarget: boolean;
  /**
   * Phase C migration: when the visual crosses the reflect pivot in a
   * two-segment straight-line reflected path, helpers signal that here
   * rather than mutating `proj.visualPastReflectPoint`. The caller
   * (updateProjectiles) writes to the visual-state side-table.
   */
  pastReflectPoint?: boolean;
}

/**
 * STRAIGHT-LINE HOMING: smooth interpolation from original start to target.
 * Active when: proj.isHoming && proj.homingPathStyle === 'straight' && proj.homingVisualStartX !== undefined
 */
function updateStraightLineHomingVisual(proj: Projectile, now: number): ProjectileMovementResult {
  const startX = proj.homingVisualStartX!;
  const startY = proj.homingVisualStartY ?? proj.y;
  const elapsed = (now - (proj.homingVisualStartTime ?? proj.startTime)) / 1000;
  const speedTilesPerSecond = (proj.speed || 4) / 0.8;
  const totalDist = Math.sqrt(Math.pow(proj.targetX - startX, 2) + Math.pow(proj.targetY - startY, 2));
  const totalTime = Math.max(0.1, totalDist / speedTilesPerSecond);
  const progress = Math.min(elapsed / totalTime, 1);
  const newX = startX + (proj.targetX - startX) * progress;
  const newY = startY + (proj.targetY - startY) * progress;
  const reachedTarget = progress >= 1;

  // Update direction for sprite rotation
  const sdx = proj.targetX - startX;
  const sdy = proj.targetY - startY;
  if (sdx !== 0 || sdy !== 0) {
    proj.direction = calculateDirectionTo(startX, startY, proj.targetX, proj.targetY);
  }

  return { newX, newY, reachedTarget };
}

/**
 * GRID HOMING (no tilePath): move toward current target from current position.
 * Active when: proj.isHoming && !(proj.tilePath && proj.tilePath.length > 0)
 */
function updateGridHomingVisual(proj: Projectile): ProjectileMovementResult {
  const dx = proj.targetX - proj.x;
  const dy = proj.targetY - proj.y;
  const distanceToTarget = Math.sqrt(dx * dx + dy * dy);

  const frameTime = 0.016; // 16ms in seconds
  const speedTilesPerSecond = (proj.speed || 4) / 0.8;
  const moveDistance = speedTilesPerSecond * frameTime;

  let newX: number;
  let newY: number;
  let reachedTarget = false;

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

  return { newX, newY, reachedTarget };
}

/**
 * TILE-BASED MOVEMENT: visual position computed purely from elapsed time.
 * Handles three sub-cases internally:
 *  - straight-line interpolation (non-reflected homing)
 *  - two-segment reflected path
 *  - standard tile-to-tile interpolation
 * Active when: proj.tilePath && proj.tilePath.length > 0
 * (and not already handled by straight-line homing branch above)
 *
 * Don't mutate currentTileIndex or tileEntryTime mid-interpolation — they
 * get deep-copied into game state and would cause resolveProjectiles to see
 * stale visual state.
 */
function updateTileBasedVisual(proj: Projectile, now: number): ProjectileMovementResult {
  const tilePath = proj.tilePath!;
  const spawnTime = proj.tileEntryTime ?? proj.startTime;
  const elapsed = (now - spawnTime) / 1000; // seconds since spawn
  const speedTilesPerSecond = (proj.speed || 4) / 0.8;
  const tileTransitTime = 1 / speedTilesPerSecond;

  // Calculate which tile we should be on based purely on elapsed time
  const visualTileIndex = Math.min(
    Math.floor(elapsed / tileTransitTime),
    tilePath.length - 1
  );

  let newX: number;
  let newY: number;
  let reachedTarget = false;
  let pastReflectPoint = false;

  if (proj.homingPathStyle === 'straight' && tilePath.length >= 2 && !proj.reflected) {
    // STRAIGHT-LINE: smooth interpolation from first to last tile
    const firstTile = tilePath[0];
    const lastTile = tilePath[tilePath.length - 1];
    const actualDistance = Math.max(1, Math.sqrt(
      Math.pow(lastTile.x - firstTile.x, 2) + Math.pow(lastTile.y - firstTile.y, 2)
    ));
    const totalTransitTime = actualDistance * tileTransitTime;
    const progress = Math.min(elapsed / totalTransitTime, 1);
    newX = firstTile.x + (lastTile.x - firstTile.x) * progress;
    newY = firstTile.y + (lastTile.y - firstTile.y) * progress;
    if (progress >= 1) reachedTarget = true;
  } else if (proj.homingPathStyle === 'straight' && proj.reflected && proj.reflectAtTileIndex !== undefined && tilePath.length >= 2) {
    // TWO-SEGMENT STRAIGHT-LINE: approach straight to reflect point, then straight back
    const pivotIdx = proj.reflectAtTileIndex;
    const firstTile = tilePath[0];
    const pivotTile = tilePath[Math.min(pivotIdx, tilePath.length - 1)];
    const lastTile = tilePath[tilePath.length - 1];

    // Calculate distances for each segment
    const approachDist = Math.max(0.5, Math.sqrt(
      Math.pow(pivotTile.x - firstTile.x, 2) + Math.pow(pivotTile.y - firstTile.y, 2)
    ));
    const reflectDist = Math.max(0.5, Math.sqrt(
      Math.pow(lastTile.x - pivotTile.x, 2) + Math.pow(lastTile.y - pivotTile.y, 2)
    ));
    const approachTime = approachDist * tileTransitTime;
    const reflectTime = reflectDist * tileTransitTime;
    const totalTime = approachTime + reflectTime;

    if (elapsed >= totalTime) {
      newX = lastTile.x;
      newY = lastTile.y;
      reachedTarget = true;
      pastReflectPoint = true;
    } else if (elapsed < approachTime) {
      // Segment 1: straight line from start to pivot (reflect point)
      const segProgress = elapsed / approachTime;
      newX = firstTile.x + (pivotTile.x - firstTile.x) * segProgress;
      newY = firstTile.y + (pivotTile.y - firstTile.y) * segProgress;
      proj.direction = calculateDirectionTo(firstTile.x, firstTile.y, pivotTile.x, pivotTile.y);
      // Still approaching — not past reflect point
    } else {
      // Segment 2: straight line from pivot back to end
      const segElapsed = elapsed - approachTime;
      const segProgress = segElapsed / reflectTime;
      newX = pivotTile.x + (lastTile.x - pivotTile.x) * segProgress;
      newY = pivotTile.y + (lastTile.y - pivotTile.y) * segProgress;
      proj.direction = calculateDirectionTo(pivotTile.x, pivotTile.y, lastTile.x, lastTile.y);
      // Signal past reflect point (stable, never toggles back — caller ORs
      // this into the side-table entry).
      pastReflectPoint = true;
    }
  } else if (visualTileIndex >= tilePath.length - 1) {
    reachedTarget = true;
    const finalTile = tilePath[tilePath.length - 1];
    newX = finalTile.x;
    newY = finalTile.y;
  } else {
    // Interpolate between current and next tile for smooth movement
    const currentTile = tilePath[visualTileIndex];
    const nextTile = tilePath[visualTileIndex + 1];
    const tileProgress = (elapsed % tileTransitTime) / tileTransitTime;
    newX = currentTile.x + (nextTile.x - currentTile.x) * tileProgress;
    newY = currentTile.y + (nextTile.y - currentTile.y) * tileProgress;
  }

  // Store visual tile index for hitResult consumption
  // For two-segment straight-line reflects, estimate tile index from position
  if (proj.homingPathStyle === 'straight' && proj.reflected && proj.reflectAtTileIndex !== undefined) {
    // Map current position to nearest tile in the combined path
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let ti = 0; ti < tilePath.length; ti++) {
      const td = Math.abs(tilePath[ti].x - newX) + Math.abs(tilePath[ti].y - newY);
      if (td < bestDist) { bestDist = td; bestIdx = ti; }
    }
    proj.currentTileIndex = bestIdx;
  } else {
    proj.currentTileIndex = visualTileIndex;
  }

  // Update direction for sprite rotation
  if (tilePath.length >= 2) {
    const firstTile = tilePath[0];
    const lastTile = tilePath[tilePath.length - 1];
    const dx = lastTile.x - firstTile.x;
    const dy = lastTile.y - firstTile.y;
    if (dx !== 0 || dy !== 0) {
      proj.direction = calculateDirectionTo(firstTile.x, firstTile.y, lastTile.x, lastTile.y);
    }
  }

  return { newX, newY, reachedTarget, pastReflectPoint };
}

/**
 * LEGACY: non-homing projectiles without tilePath.
 * Simple A-to-B linear interpolation from spawn to target.
 * Active when: none of the other branches match.
 */
function updateLegacyNoPathVisual(proj: Projectile, now: number): ProjectileMovementResult {
  const elapsed = (now - proj.startTime) / 1000;
  const speedTilesPerSecond = (proj.speed || 4) / 0.8;
  const distanceTraveled = speedTilesPerSecond * elapsed;

  const dx = proj.targetX - proj.startX;
  const dy = proj.targetY - proj.startY;
  const totalDistance = Math.sqrt(dx * dx + dy * dy);

  let newX: number;
  let newY: number;
  let reachedTarget = false;

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

  return { newX, newY, reachedTarget };
}

/**
 * Visual-only projectile update — called from animation loop.
 * All damage/effects are already resolved by resolveProjectiles() during executeTurn.
 * This function only handles position interpolation and consuming pre-resolved hitResults.
 */
/**
 * Per-frame visual update for active projectiles. Consumes BRIDGE fields
 * (hitResult, pendingReflectVfx) and updates interpolated position.
 *
 * Phase C: visual-only state (currently `visualPastReflectPoint`) lives in a
 * side-table owned by AnimatedGameBoard as a React ref. This function takes
 * the map as a parameter so visual state can be read back on the next frame
 * without needing to live on Projectile (and therefore without ending up in
 * GameState deep copies, which was the pre-Phase-C bug class).
 */
export function updateProjectiles(
  gameState: GameState,
  visualState?: Map<string, ProjectileVisualState>,
): void {
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

    // Dispatch to the appropriate movement branch. Same conditions as before
    // the Phase B extraction — behavior is identical.
    let result: ProjectileMovementResult;
    if (proj.isHoming && proj.homingPathStyle === 'straight' && proj.homingVisualStartX !== undefined) {
      result = updateStraightLineHomingVisual(proj, now);
    } else if (proj.isHoming && !(proj.tilePath && proj.tilePath.length > 0)) {
      result = updateGridHomingVisual(proj);
    } else if (proj.tilePath && proj.tilePath.length > 0) {
      result = updateTileBasedVisual(proj, now);
    } else {
      result = updateLegacyNoPathVisual(proj, now);
    }
    const { newX, newY, reachedTarget } = result;

    // Update position
    proj.x = newX;
    proj.y = newY;

    // Phase C: propagate the "past reflect point" signal into the visual-state
    // side-table. Stable — once set, stays set for this projectile.
    if (result.pastReflectPoint && visualState) {
      let vs = visualState.get(proj.id);
      if (!vs) {
        vs = { x: newX, y: newY, startTime: proj.startTime };
        visualState.set(proj.id, vs);
      }
      vs.visualPastReflectPoint = true;
    }
    const pastReflectPoint = !!visualState?.get(proj.id)?.visualPastReflectPoint;

    // Spawn deferred reflect VFX when visual reaches the reflect point
    if (proj.pendingReflectVfx && pastReflectPoint) {
      const vfx = proj.pendingReflectVfx;
      spawnParticleEffect(vfx.x, vfx.y, vfx.sprite, vfx.duration, gameState);
      proj.pendingReflectVfx = undefined; // Only spawn once
    }

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
  }

  // Remove inactive projectiles
  gameState.activeProjectiles = gameState.activeProjectiles.filter(
    p => !projectilesToRemove.includes(p.id)
  );

  // Phase C: clean up the side-table so it doesn't leak across games.
  if (visualState) {
    for (const id of projectilesToRemove) visualState.delete(id);
  }
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

// ==========================================
// PROJECTILE RESOLUTION HELPERS
// ==========================================

/** Get effective team targeting based on teamSwapped flag */
function getEffectiveTeams(proj: Projectile): { targetsEnemies: boolean; targetsCharacters: boolean } {
  const targetsEnemies = proj.teamSwapped ? !!proj.sourceEnemyId : !!proj.sourceCharacterId;
  const targetsCharacters = proj.teamSwapped ? !!proj.sourceCharacterId : !!proj.sourceEnemyId;
  return { targetsEnemies, targetsCharacters };
}

/** Check if a tile is blocked (wall, void, or out of bounds) */
function isTileBlocked(x: number, y: number, gameState: GameState): boolean {
  if (!isInBounds(x, y, gameState.puzzle.width, gameState.puzzle.height)) return true;
  const tile = gameState.puzzle.tiles[y]?.[x];
  return !tile || tile.type === TileTypeEnum.WALL;
}

/**
 * Find a hostile entity at a tile position, respecting piercing-dedup filtering.
 * Enemies are deduped by array index (hitEnemyIndices) because multiple
 * enemies can share the same enemyId in real puzzles; characters are deduped
 * by characterId (hitEntityIds) since character IDs are unique.
 */
function findEntityAtTile(
  x: number, y: number, gameState: GameState, proj: Projectile,
  targetEnemies: boolean, excludePendingDeath: boolean
): PlacedCharacter | PlacedEnemy | null {
  if (targetEnemies) {
    const idx = gameState.puzzle.enemies.findIndex(
      (e, i) => !e.dead && (!excludePendingDeath || !e.pendingProjectileDeath) &&
           Math.floor(e.x) === x && Math.floor(e.y) === y &&
           !(proj.hitEnemyIndices?.includes(i))
    );
    return idx >= 0 ? gameState.puzzle.enemies[idx] : null;
  } else {
    return gameState.placedCharacters.find(
      c => !c.dead && (!excludePendingDeath || !c.pendingProjectileDeath) &&
           Math.floor(c.x) === x && Math.floor(c.y) === y &&
           !(proj.hitEntityIds?.includes(c.characterId))
    ) || null;
  }
}

/** Find a friendly (healing) entity at a tile position, excluding self */
function findHealTargetAtTile(
  x: number, y: number, gameState: GameState, proj: Projectile,
  targetEnemies: boolean
): PlacedCharacter | PlacedEnemy | null {
  if (!targetEnemies) {
    // charFired healing targets characters (allies)
    return gameState.placedCharacters.find(
      c => !c.dead && Math.floor(c.x) === x && Math.floor(c.y) === y &&
           c.characterId !== proj.sourceCharacterId &&
           !(proj.hitEntityIds?.includes(c.characterId))
    ) || null;
  } else {
    // enemyFired healing targets enemies (allies) — dedup by array index
    const idx = gameState.puzzle.enemies.findIndex(
      (e, i) => !e.dead && Math.floor(e.x) === x && Math.floor(e.y) === y &&
           i !== proj.sourceEnemyIndex &&
           !(proj.hitEnemyIndices?.includes(i))
    );
    return idx >= 0 ? gameState.puzzle.enemies[idx] : null;
  }
}

/** Record a pierce-dedup hit on an enemy by its array index. */
function recordEnemyHit(proj: Projectile, enemy: PlacedEnemy, enemies: PlacedEnemy[]): void {
  if (!proj.hitEnemyIndices) proj.hitEnemyIndices = [];
  const idx = enemies.indexOf(enemy);
  if (idx >= 0 && !proj.hitEnemyIndices.includes(idx)) {
    proj.hitEnemyIndices.push(idx);
  }
}

type HitMode = 'visual' | 'headless';

interface EntityHitResult {
  reflected: boolean;
  vfxSprite?: any;
  deferredDeathEntityId?: string;
  deferredDeathIsEnemy?: boolean;
  deferredDeathIndex?: number;
}

/**
 * Apply the full hit sequence when a hostile projectile hits an entity.
 * Handles reflect, AOE, redirect, damage, death, status effects, and VFX.
 * mode='visual' defers deaths; mode='headless' processes them immediately.
 */
function applyEntityHit(
  target: PlacedCharacter | PlacedEnemy,
  targetIsEnemy: boolean,
  proj: Projectile,
  gameState: GameState,
  mode: HitMode
): EntityHitResult {
  // 1. Reflect check
  if (hasReflect(target) && !proj.reflected && canReflectDirection(target, proj.direction)) {
    reflectProjectile(proj, target, gameState, Date.now());
    return { reflected: true };
  }

  // 2. AOE explosion
  if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
    triggerAOEExplosion(target.x, target.y, proj.attackData,
      proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
    return { reflected: false };
  }

  // 3. Redirect
  if (proj.attackData.isRedirect) {
    if (!isSteadfast(target)) applyRedirect(target, proj.attackData, proj.direction);
    if (mode === 'headless') {
      const hs = proj.attackData.hitEffectSprite;
      if (hs) spawnParticleEffect(target.x, target.y, hs, proj.attackData.effectDuration || 300, gameState);
    }
    return { reflected: false, vfxSprite: proj.attackData.hitEffectSprite };
  }

  // 4. Damage calculation
  const baseDmg = proj.attackData.damage ?? 0;
  const isCrit = proj.attackData.backstabEnabled && isAttackFromBehind(proj.direction, target.facing);
  const damage = isCrit ? baseDmg * 2 : baseDmg;

  const wasDeflected = applyProjectileDamageWithDeflect(
    target, damage, proj.sourceCharacterId, proj.sourceEnemyId, gameState);

  let deferredDeathEntityId: string | undefined;
  let deferredDeathIsEnemy: boolean | undefined;
  let deferredDeathIndex: number | undefined;

  if (!wasDeflected) {
    // 5. Death handling — mode-specific
    if (mode === 'visual') {
      target.visualHealth = target.currentHealth;
    }
    applyDamageToEntityNoDeflect(target, damage, gameState);
    if (target.dead) {
      if (mode === 'visual') {
        target.dead = false;
        target.pendingProjectileDeath = true;
      } else {
        handleEntityDeathDrop(target, targetIsEnemy, gameState);
      }
    }
    const entityId = targetIsEnemy
      ? (target as PlacedEnemy).enemyId
      : (target as PlacedCharacter).characterId;
    deferredDeathEntityId = entityId;
    deferredDeathIsEnemy = targetIsEnemy;
    if (targetIsEnemy) {
      deferredDeathIndex = gameState.puzzle.enemies.indexOf(target as PlacedEnemy);
    }
  }

  // 6. Status effect
  const deadCheck = mode === 'visual'
    ? (target.dead || target.pendingProjectileDeath)
    : target.dead;
  if (proj.spellAssetId && !deadCheck) {
    const sourceId = targetIsEnemy
      ? (proj.sourceCharacterId || 'unknown')
      : (proj.sourceEnemyId || 'unknown');
    const sourceIsEnemy = !targetIsEnemy;
    applyStatusEffectFromProjectile(target, proj.spellAssetId,
      sourceId, sourceIsEnemy, gameState.currentTurn);
  }

  // 7. VFX sprite
  const vfxSprite = isCrit && proj.attackData.criticalHitEffectSprite
    ? proj.attackData.criticalHitEffectSprite : proj.attackData.hitEffectSprite;

  return { reflected: false, vfxSprite, deferredDeathEntityId, deferredDeathIsEnemy, deferredDeathIndex };
}

/**
 * Apply healing when a friendly projectile hits an ally.
 * Returns the VFX sprite to display.
 */
function applyHealingHit(
  target: PlacedCharacter | PlacedEnemy,
  targetIsEnemy: boolean,
  proj: Projectile,
  gameState: GameState,
  applyStatusEffect: boolean
): any {
  if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
    triggerAOEExplosion(target.x, target.y, proj.attackData,
      proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
    return proj.attackData.healingEffectSprite || proj.attackData.hitEffectSprite;
  }

  const healing = proj.attackData.healing ?? 0;
  if (healing > 0) {
    if (targetIsEnemy) {
      const enemyData = getEnemy((target as PlacedEnemy).enemyId) || loadEnemy((target as PlacedEnemy).enemyId) || { health: target.currentHealth };
      const maxHealth = enemyData?.health || target.currentHealth;
      target.currentHealth = Math.min(target.currentHealth + healing, maxHealth);
    } else {
      const charData = getCharacter((target as PlacedCharacter).characterId) || loadCharacter((target as PlacedCharacter).characterId);
      const maxHealth = charData?.health ?? target.currentHealth;
      target.currentHealth = Math.min(target.currentHealth + healing, maxHealth);
    }
  }
  if (applyStatusEffect && proj.spellAssetId && !target.dead) {
    const sourceId = targetIsEnemy
      ? (proj.sourceEnemyId || 'unknown')
      : (proj.sourceCharacterId || 'unknown');
    const sourceIsEnemy = targetIsEnemy;
    applyStatusEffectFromProjectile(target, proj.spellAssetId,
      sourceId, sourceIsEnemy, gameState.currentTurn);
  }
  return proj.attackData.healingEffectSprite || proj.attackData.hitEffectSprite;
}

/**
 * Resolve the reflected path after a projectile reflects off an entity.
 * Walks the reflected direction checking for collisions. Visual mode only.
 * Returns the reflected tiles array and whether any entity was hit.
 */
/**
 * Pure-logic walk of a single turn of a non-homing projectile's trajectory.
 * Iterates tile by tile from the current logical position up to the range
 * cap, handling bounds, walls, healing + hostile hits, pierce dedup, and
 * reflect detection. Side effects that must happen inline (applyEntityHit,
 * applyHealingHit, recordEnemyHit, triggerAOEExplosion) happen in the
 * requested `mode`; everything else (timeline events, bridge fields,
 * turnTiles/tilePath) is the caller's responsibility.
 *
 * The output `steps` array is what the real and headless callers translate
 * into their mode-specific bookkeeping. This is the same pattern
 * `walkReflectedPath` uses for reflect-walks (Phase E2).
 */
type NonHomingStep =
  | { kind: 'bounds_exit'; dist: number }
  | { kind: 'wall'; x: number; y: number; dist: number }
  | { kind: 'travel'; x: number; y: number; dist: number }
  | { kind: 'hostile_hit'; x: number; y: number; dist: number; target: PlacedCharacter | PlacedEnemy; targetIsEnemy: boolean; hitResult: EntityHitResult; pierceStop: boolean }
  | { kind: 'healing_hit'; x: number; y: number; dist: number; target: PlacedCharacter | PlacedEnemy; targetIsEnemy: boolean; vfxSprite: any; pierceStop: boolean }
  | { kind: 'reflect'; x: number; y: number; dist: number; target: PlacedCharacter | PlacedEnemy; targetIsEnemy: boolean };

interface NonHomingWalkResult {
  steps: NonHomingStep[];
  hitSomething: boolean;
  endedAtWall: boolean;
  endedAtBounds: boolean;
  endedAtReflect: boolean;
  endedAtPierceStop: boolean;
}

function walkNonHomingTick(
  proj: Projectile,
  gameState: GameState,
  mode: HitMode,
  tilesPerTurn: number,
  range: number,
): NonHomingWalkResult {
  const { dx, dy } = getDirectionOffset(proj.direction);
  const canPierce = proj.attackData.projectilePierces === true;
  const isHealingProjectile = proj.attackData.healing !== undefined;
  const startTile = (proj.logicalTileIndex ?? 0) + 1;
  const endTile = Math.min(startTile + tilesPerTurn - 1, range);

  if (!proj.hitEntityIds) proj.hitEntityIds = [];

  const steps: NonHomingStep[] = [];
  let hitSomething = false;
  let endedAtWall = false;
  let endedAtBounds = false;
  let endedAtReflect = false;
  let endedAtPierceStop = false;

  for (let dist = startTile; dist <= endTile; dist++) {
    if (hitSomething && !canPierce) {
      endedAtPierceStop = true;
      break;
    }

    const checkX = Math.floor(proj.startX + dx * dist);
    const checkY = Math.floor(proj.startY + dy * dist);

    if (!isInBounds(checkX, checkY, gameState.puzzle.width, gameState.puzzle.height)) {
      endedAtBounds = true;
      steps.push({ kind: 'bounds_exit', dist });
      break;
    }

    const tile = gameState.puzzle.tiles[checkY]?.[checkX];
    if (!tile || tile.type === TileTypeEnum.WALL) {
      if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
        triggerAOEExplosion(checkX, checkY, proj.attackData,
          proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
      }
      endedAtWall = true;
      steps.push({ kind: 'wall', x: checkX, y: checkY, dist });
      break;
    }

    steps.push({ kind: 'travel', x: checkX, y: checkY, dist });

    // THROW_PLACE projectiles pass through entities — no collision checks this tile.
    if (proj.throwPlaceConfig) continue;

    const { targetsEnemies, targetsCharacters } = getEffectiveTeams(proj);

    if (targetsEnemies) {
      if (isHealingProjectile) {
        // charFired healing targets allied characters.
        const hitAlly = findHealTargetAtTile(checkX, checkY, gameState, proj, false) as PlacedCharacter | null;
        if (hitAlly) {
          proj.hitEntityIds.push(hitAlly.characterId);
          const vfxSprite = applyHealingHit(hitAlly, false, proj, gameState, true);
          hitSomething = true;
          steps.push({
            kind: 'healing_hit', x: checkX, y: checkY, dist,
            target: hitAlly, targetIsEnemy: false, vfxSprite, pierceStop: !canPierce,
          });
        }
      } else {
        const hitEnemy = findEntityAtTile(checkX, checkY, gameState, proj, true, true) as PlacedEnemy | null;
        if (hitEnemy) {
          const entityHitResult = applyEntityHit(hitEnemy, true, proj, gameState, mode);
          if (entityHitResult.reflected) {
            endedAtReflect = true;
            steps.push({ kind: 'reflect', x: checkX, y: checkY, dist, target: hitEnemy, targetIsEnemy: true });
            break;
          }
          recordEnemyHit(proj, hitEnemy, gameState.puzzle.enemies);
          hitSomething = true;
          steps.push({
            kind: 'hostile_hit', x: checkX, y: checkY, dist,
            target: hitEnemy, targetIsEnemy: true, hitResult: entityHitResult, pierceStop: !canPierce,
          });
        }
      }
    } else if (targetsCharacters) {
      if (isHealingProjectile) {
        // enemyFired healing targets allied enemies. Applied inline (no applyHealingHit helper call).
        const hitAllyEnemy = findHealTargetAtTile(checkX, checkY, gameState, proj, true) as PlacedEnemy | null;
        if (hitAllyEnemy) {
          recordEnemyHit(proj, hitAllyEnemy, gameState.puzzle.enemies);
          const healing = proj.attackData.healing ?? 0;
          const enemyData = getEnemy(hitAllyEnemy.enemyId);
          const maxHealth = enemyData?.health ?? hitAllyEnemy.currentHealth;
          hitAllyEnemy.currentHealth = Math.min(hitAllyEnemy.currentHealth + healing, maxHealth);
          hitSomething = true;
          const vfxSprite = proj.attackData.healingEffectSprite || proj.attackData.hitEffectSprite;
          steps.push({
            kind: 'healing_hit', x: checkX, y: checkY, dist,
            target: hitAllyEnemy, targetIsEnemy: true, vfxSprite, pierceStop: !canPierce,
          });
        }
      } else {
        const hitChar = findEntityAtTile(checkX, checkY, gameState, proj, false, true) as PlacedCharacter | null;
        if (hitChar) {
          const entityHitResult = applyEntityHit(hitChar, false, proj, gameState, mode);
          if (entityHitResult.reflected) {
            endedAtReflect = true;
            steps.push({ kind: 'reflect', x: checkX, y: checkY, dist, target: hitChar, targetIsEnemy: false });
            break;
          }
          proj.hitEntityIds.push(hitChar.characterId);
          hitSomething = true;
          steps.push({
            kind: 'hostile_hit', x: checkX, y: checkY, dist,
            target: hitChar, targetIsEnemy: false, hitResult: entityHitResult, pierceStop: !canPierce,
          });
        }
      }
    }
  }

  return { steps, hitSomething, endedAtWall, endedAtBounds, endedAtReflect, endedAtPierceStop };
}

/**
 * Pure-logic walk of the reflected projectile's trajectory. Iterates tile by
 * tile in the direction `proj` is now heading (post-reflect), stopping at
 * out-of-bounds, wall, or the configured range. Calls `applyEntityHit` in the
 * requested mode when it encounters a valid target; the caller translates the
 * resulting `steps` log into mode-specific bookkeeping (bridge fields for the
 * real game, timeline events for the solver).
 *
 * Returning a step log instead of mutating bridge fields is what makes this
 * safe to share: the drift risk between `resolveProjectiles` and
 * `updateProjectilesHeadless` lived in this collision walk, and now they
 * can't disagree because they call the same walker.
 */
type ReflectedStep =
  | { type: 'travel'; x: number; y: number; dist: number }
  | { type: 'wall'; x: number; y: number; dist: number }
  | { type: 'hit'; x: number; y: number; dist: number; target: PlacedCharacter | PlacedEnemy; targetIsEnemy: boolean; hitResult: EntityHitResult };

function walkReflectedPath(
  proj: Projectile, gameState: GameState, canPierce: boolean, mode: HitMode,
): { steps: ReflectedStep[]; lastDist: number; reflectedHit: boolean; stoppedAtRangeEnd: boolean } {
  // Straight-line reflected flight (non-homing reflect). Compute tiles along
  // the projectile's current direction for its full range, then delegate the
  // per-tile collision work to walkReflectedPathOnTiles.
  const { dx, dy } = getDirectionOffset(proj.direction);
  const range = proj.attackData.range ?? 5;
  const tiles: Array<{ x: number; y: number }> = [];
  for (let rDist = 1; rDist <= range; rDist++) {
    tiles.push({ x: Math.floor(proj.startX + dx * rDist), y: Math.floor(proj.startY + dy * rDist) });
  }
  return walkReflectedPathOnTiles(proj, tiles, gameState, canPierce, mode);
}

/**
 * Pure-logic walk along an arbitrary precomputed tile path (used by both
 * straight-line reflected flight via walkReflectedPath and homing reflected
 * flight where the reflected trajectory routes toward the original caster).
 *
 * Emits `travel`, `wall`, and `hit` steps exactly like walkReflectedPath does
 * so the same mode-wrappers (resolveReflectedPath / resolveReflectedPathHeadless)
 * can consume the log without caring how the tiles were computed.
 */
function walkReflectedPathOnTiles(
  proj: Projectile, tiles: Array<{ x: number; y: number }>,
  gameState: GameState, canPierce: boolean, mode: HitMode,
): { steps: ReflectedStep[]; lastDist: number; reflectedHit: boolean; stoppedAtRangeEnd: boolean } {
  const { targetsEnemies } = getEffectiveTeams(proj);
  const isHealingProjectile = proj.attackData.healing !== undefined;

  const steps: ReflectedStep[] = [];
  let lastDist = 0;
  let reflectedHit = false;
  let stoppedAtRangeEnd = false;

  for (let i = 0; i < tiles.length; i++) {
    const dist = i + 1;
    const { x: rx, y: ry } = tiles[i];

    if (!isInBounds(rx, ry, gameState.puzzle.width, gameState.puzzle.height)) {
      lastDist = dist - 1;
      break;
    }
    const rTile = gameState.puzzle.tiles[ry]?.[rx];
    if (!rTile || rTile.type === TileTypeEnum.WALL) {
      steps.push({ type: 'wall', x: rx, y: ry, dist });
      lastDist = dist;
      break;
    }
    steps.push({ type: 'travel', x: rx, y: ry, dist });
    lastDist = dist;

    if (!isHealingProjectile) {
      const hitTarget = findEntityAtTile(rx, ry, gameState, proj, targetsEnemies, true);
      if (hitTarget) {
        const targetIsEnemy = 'enemyId' in hitTarget;
        if (targetIsEnemy) {
          recordEnemyHit(proj, hitTarget as PlacedEnemy, gameState.puzzle.enemies);
        } else {
          if (!proj.hitEntityIds) proj.hitEntityIds = [];
          proj.hitEntityIds.push((hitTarget as PlacedCharacter).characterId);
        }

        const hitResult = applyEntityHit(hitTarget, targetIsEnemy, proj, gameState, mode);
        // reflected won't happen here (proj is already reflected)

        steps.push({ type: 'hit', x: rx, y: ry, dist, target: hitTarget, targetIsEnemy, hitResult });
        reflectedHit = true;
        if (!canPierce) break;
      }
    }

    if (i === tiles.length - 1) stoppedAtRangeEnd = true;
  }

  return { steps, lastDist, reflectedHit, stoppedAtRangeEnd };
}

/**
 * Real-game (visual-mode) wrapper around `walkReflectedPath`.
 * Translates the step log into:
 *   - `reflectedTiles[]` — used by the caller to build the combined approach+reflect
 *     tilePath the visual system animates over.
 *   - `proj.hitResult` — BRIDGE field so the visual loop spawns VFX and applies
 *     deferred death at the right tile index when the sprite arrives.
 */
function resolveReflectedPath(
  proj: Projectile,
  approachTiles: Array<{ x: number; y: number }>,
  gameState: GameState,
  canPierce: boolean,
): { reflectedTiles: Array<{ x: number; y: number }>; reflectedHit: boolean } {
  const walk = walkReflectedPath(proj, gameState, canPierce, 'visual');
  const reflectedTiles: Array<{ x: number; y: number }> = [];
  for (const step of walk.steps) {
    if (step.type === 'travel' || step.type === 'wall') {
      reflectedTiles.push({ x: step.x, y: step.y });
    } else if (step.type === 'hit') {
      const combinedSoFar = [...approachTiles, ...reflectedTiles];
      proj.hitResult = {
        hitTileIndex: combinedSoFar.length - 1,
        deactivate: true,
        vfxSprite: proj.attackData.hitEffectSprite,
        vfxX: step.target.x, vfxY: step.target.y,
        deferredDeathEntityId: step.hitResult.deferredDeathEntityId,
        deferredDeathIsEnemy: step.hitResult.deferredDeathIsEnemy,
        deferredDeathIndex: step.hitResult.deferredDeathIndex,
      };
    }
  }
  return { reflectedTiles, reflectedHit: walk.reflectedHit };
}

/**
 * Record a projectile event to the timeline (only when timeline exists).
 * Used during replay generation to capture projectile lifecycle events.
 */
function recordProjectileEvent(gameState: GameState, event: Omit<ProjectileEvent, 'turn'>) {
  if (!gameState.projectileTimeline) return;
  gameState.projectileTimeline.push({ ...event, turn: gameState.currentTurn });
}

/**
 * Process collectible durations — decrement turn counters and despawn expired items.
 * Called once per turn after projectile resolution.
 */
const ITEM_DESPAWN_DURATION = 400; // ms for scale-down animation (matches AnimatedGameBoard)

function processCollectibleDurations(gameState: GameState): void {
  for (const collectible of gameState.puzzle.collectibles) {
    if (collectible.collected) continue;
    if (collectible.duration === undefined) continue;

    // Handle already-despawning items: finalize after animation
    if (collectible.despawning) {
      if (gameState.headlessMode) {
        // Headless: no animation, remove immediately
        collectible.collected = true;
      } else if (collectible.despawnTime && Date.now() - collectible.despawnTime > ITEM_DESPAWN_DURATION) {
        collectible.collected = true;
      }
      continue;
    }

    // Decrement duration
    collectible.duration--;

    if (collectible.duration <= 0) {
      if (gameState.headlessMode) {
        // Headless: remove immediately
        collectible.collected = true;
      } else {
        // Visual: start despawn animation
        collectible.despawning = true;
        collectible.despawnTime = Date.now();
      }
    }
  }
}

/**
 * Headless (solver) wrapper around `walkReflectedPath`. Translates the step
 * log into timeline events (wall_hit, hit) for replay, then syncs the
 * projectile's logical position from `lastDist`. Returns true if the
 * projectile should be removed after the walk — either because it pierced
 * through and reached range end, hit a wall/out-of-bounds, or hit a target
 * it can't pierce through.
 */
function resolveReflectedPathHeadless(
  proj: Projectile, gameState: GameState, canPierce: boolean,
): boolean {
  const walk = walkReflectedPath(proj, gameState, canPierce, 'headless');
  let shouldRemove = walk.stoppedAtRangeEnd;

  for (const step of walk.steps) {
    if (step.type === 'wall') {
      recordProjectileEvent(gameState, { type: 'wall_hit', projId: proj.id, x: step.x, y: step.y });
      shouldRemove = true;
    } else if (step.type === 'hit') {
      recordProjectileEvent(gameState, {
        type: 'hit', projId: proj.id, x: step.x, y: step.y,
        targetEntityId: step.targetIsEnemy
          ? (step.target as PlacedEnemy).enemyId
          : (step.target as PlacedCharacter).characterId,
        targetIsEnemy: step.targetIsEnemy,
        damage: proj.attackData.damage,
      });
      if (!canPierce) shouldRemove = true;
    }
  }

  const { dx, dy } = getDirectionOffset(proj.direction);
  proj.x = proj.startX + dx * walk.lastDist;
  proj.y = proj.startY + dy * walk.lastDist;
  proj.logicalTileIndex = walk.lastDist;

  // Out-of-bounds (no step recorded at all) is also a stop condition.
  if (walk.steps.length === 0) shouldRemove = true;

  return shouldRemove;
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
    // and are just waiting for the visual system to consume the result.
    // (Pre Phase-D this was two separate checks: hitResult handled "hit
    // landed, waiting for VFX" while pendingDeactivation handled "no hit,
    // waiting for end-of-path deactivation." Now both use hitResult with
    // deactivate=true, so a single check covers both.)
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

        // Range check — homing projectiles should respect their range
        const totalDistanceTraveled = Math.sqrt(
          Math.pow(proj.x - (proj.homingVisualStartX ?? proj.startX), 2) +
          Math.pow(proj.y - (proj.homingVisualStartY ?? proj.startY), 2)
        );
        const remainingRange = Math.max(0, range - totalDistanceTraveled);
        if (remainingRange <= 0) {
          // Out of range — deactivate. Clear homing visual state so tile-based branch handles it.
          const vStartX = proj.homingVisualStartX ?? proj.x;
          const vStartY = proj.homingVisualStartY ?? proj.y;
          const endPath = getTilesAlongLine(vStartX, vStartY, proj.x, proj.y);
          proj.tilePath = endPath.length > 0 ? endPath : [{ x: Math.floor(proj.x), y: Math.floor(proj.y) }];
          proj.currentTileIndex = 0;
          proj.tileEntryTime = proj.homingVisualStartTime ?? Date.now();
          proj.hitResult = { hitTileIndex: proj.tilePath.length - 1, deactivate: true };
          proj.homingVisualStartX = undefined;
          proj.homingVisualStartY = undefined;
          proj.homingVisualStartTime = undefined;
          continue;
        }

        // Wall check for homing projectiles that don't ignore walls.
        // Pathfinding mode inherently routes around walls via BFS, so skip
        // the straight-line wall block here — otherwise the pathfinder never
        // gets a chance to run.
        if (!proj.homingIgnoreWalls && proj.homingPathStyle !== 'pathfinding') {
          const pathTiles = getTilesAlongLine(proj.x, proj.y, targetEntity.x, targetEntity.y);
          let wallBlocked = false;
          for (const tile of pathTiles) {
            if (tile.x === Math.floor(proj.x) && tile.y === Math.floor(proj.y)) continue;
            if (isTileBlocked(tile.x, tile.y, gameState)) {
              const wallPath = getTilesAlongLine(proj.homingVisualStartX ?? proj.x, proj.homingVisualStartY ?? proj.y, tile.x, tile.y);
              if (wallPath.length > 1) wallPath.pop();
              proj.tilePath = wallPath;
              proj.currentTileIndex = 0;
              proj.tileEntryTime = proj.homingVisualStartTime ?? Date.now();
              proj.hitResult = { hitTileIndex: wallPath.length - 1, deactivate: true };
              proj.homingVisualStartX = undefined;
              proj.homingVisualStartY = undefined;
              proj.homingVisualStartTime = undefined;
              wallBlocked = true;
              break;
            }
          }
          if (wallBlocked) continue;
        }

        // Clamp effective reach to remaining range
        const effectiveReach = Math.min(tilesPerTurn, remainingRange);

        if (distance <= effectiveReach) {
          // Reached target — determine if hostile or healing
          const hitX = targetEntity.x;
          const hitY = targetEntity.y;
          let vfxSprite: any;
          let deferredDeathEntityId: string | undefined;
          let deferredDeathIsEnemy: boolean | undefined;
          let deferredDeathIndex: number | undefined;

          // Reflected projectiles are always treated as hostile hits — the
          // reflector bounced a damage-only bolt back and targetIsEnemy was
          // flipped to point at the ORIGINAL caster's team. Without this
          // override, the flipped flag makes the check misclassify the hit as
          // a heal on an ally (see Task 5 retro).
          const isHostileHit = proj.reflected || (proj.sourceCharacterId && proj.targetIsEnemy) ||
                               (proj.sourceEnemyId && !proj.targetIsEnemy);

          if (isHostileHit) {
            const targetIsEnemy = !!proj.targetIsEnemy;
            // Save pre-reflect position BEFORE applyEntityHit (which calls reflectProjectile
            // and overwrites proj.x/y and clears homingVisualStartX)
            const preReflectStartX = proj.homingVisualStartX ?? proj.x;
            const preReflectStartY = proj.homingVisualStartY ?? proj.y;
            const preReflectStartTime = proj.homingVisualStartTime;
            const hitResult = applyEntityHit(
              targetEntity as (PlacedCharacter | PlacedEnemy), targetIsEnemy,
              proj, gameState, 'visual');
            if (hitResult.reflected) {
              // Build visual path: approach to reflector + reflected path back.
              // The reflected leg uses the SAME homing path style as the approach
              // (straight/grid → line, pathfinding → BFS) so the bolt routes
              // back to the caster instead of flying straight off into the void.
              const approachStartX = preReflectStartX;
              const approachStartY = preReflectStartY;
              const approachTiles = proj.homingPathStyle === 'pathfinding'
                ? findPathBFS(approachStartX, approachStartY, hitX, hitY, gameState)
                : getTilesAlongLine(approachStartX, approachStartY, hitX, hitY);

              // reflectProjectile set proj.startX/Y to the reflector and
              // proj.targetX/Y to the caster; compute the reflected leg along
              // that new homing trajectory.
              const reflectorX = proj.startX;
              const reflectorY = proj.startY;
              const casterX = proj.targetX;
              const casterY = proj.targetY;
              let reflectedInputTiles = proj.homingPathStyle === 'pathfinding'
                ? findPathBFS(reflectorX, reflectorY, casterX, casterY, gameState)
                : getTilesAlongLine(reflectorX, reflectorY, casterX, casterY);
              // Drop the reflector tile — it was already the end of approachTiles.
              if (reflectedInputTiles[0]?.x === reflectorX && reflectedInputTiles[0]?.y === reflectorY) {
                reflectedInputTiles = reflectedInputTiles.slice(1);
              }

              const walk = walkReflectedPathOnTiles(
                proj, reflectedInputTiles, gameState, !!proj.attackData.projectilePierces, 'visual');
              const reflectedTiles: Array<{ x: number; y: number }> = [];
              for (const step of walk.steps) {
                if (step.type === 'travel' || step.type === 'wall') {
                  reflectedTiles.push({ x: step.x, y: step.y });
                } else if (step.type === 'hit') {
                  const combinedSoFar = [...approachTiles, ...reflectedTiles];
                  proj.hitResult = {
                    hitTileIndex: combinedSoFar.length - 1,
                    deactivate: true,
                    vfxSprite: proj.attackData.hitEffectSprite,
                    vfxX: step.target.x, vfxY: step.target.y,
                    deferredDeathEntityId: step.hitResult.deferredDeathEntityId,
                    deferredDeathIsEnemy: step.hitResult.deferredDeathIsEnemy,
                    deferredDeathIndex: step.hitResult.deferredDeathIndex,
                  };
                }
              }
              const reflectedHit = walk.reflectedHit;

              const combinedPath = [...approachTiles, ...reflectedTiles];
              proj.tilePath = combinedPath;
              proj.currentTileIndex = 0;
              proj.tileEntryTime = proj.homingPathStyle === 'straight'
                ? (preReflectStartTime ?? Date.now()) : Date.now();
              proj.reflectAtTileIndex = approachTiles.length - 1;

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
              continue;
            }
            vfxSprite = hitResult.vfxSprite;
            deferredDeathEntityId = hitResult.deferredDeathEntityId;
            deferredDeathIsEnemy = hitResult.deferredDeathIsEnemy;
            deferredDeathIndex = hitResult.deferredDeathIndex;
          } else {
            // Friendly homing heal/buff
            const targetIsEnemy = !!(proj.sourceEnemyId && proj.targetIsEnemy);
            vfxSprite = applyHealingHit(
              targetEntity as (PlacedCharacter | PlacedEnemy), targetIsEnemy,
              proj, gameState, true);
          }

          // Build tile path for visual
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
            const clampedTiles = Math.min(tilesPerTurn, Math.floor(remainingRange));
            const fullPath = findPathBFS(proj.x, proj.y, targetEntity.x, targetEntity.y, gameState);
            turnTiles = fullPath.slice(0, clampedTiles + 1);
            const lastTile = turnTiles[turnTiles.length - 1];
            newX = lastTile.x;
            newY = lastTile.y;
          } else {
            const clampedMove = Math.min(tilesPerTurn, remainingRange);
            const moveRatio = clampedMove / distance;
            newX = proj.x + dx * moveRatio;
            newY = proj.y + dy * moveRatio;
            turnTiles = getTilesAlongLine(proj.x, proj.y, newX, newY);
          }

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
          // Update visual start to current position each turn so slow projectiles (speed 1-2)
          // interpolate from their actual logical position instead of the original spawn point
          if (proj.homingPathStyle === 'straight') {
            proj.homingVisualStartX = newX;
            proj.homingVisualStartY = newY;
            proj.homingVisualStartTime = Date.now();
          }
        }
      } else {
        shouldRemove = true;
      }
    } else {
      // === NON-HOMING PROJECTILES (real mode) ===
      // Shared collision walk returns a step log; this branch translates it
      // into the visual/bridge bookkeeping (turnTiles, proj.hitResult,
      // tilePath, reflectAtTileIndex, logicalTileIndex).
      const { dx, dy } = getDirectionOffset(proj.direction);
      const canPierce = proj.attackData.projectilePierces === true;
      const startTile = (proj.logicalTileIndex ?? 0) + 1;
      const endTile = Math.min(startTile + tilesPerTurn - 1, range);
      logicalEndTile = endTile;

      const turnTiles: Array<{ x: number; y: number }> = [];
      const currentLogicalDist = proj.logicalTileIndex ?? 0;
      turnTiles.push({
        x: Math.floor(proj.startX + dx * currentLogicalDist),
        y: Math.floor(proj.startY + dy * currentLogicalDist),
      });

      const walk = walkNonHomingTick(proj, gameState, 'visual', tilesPerTurn, range);
      hitSomething = walk.hitSomething;
      const hitWall = walk.endedAtWall;
      let reflectedThisTurn = false;

      for (const step of walk.steps) {
        if (step.kind === 'bounds_exit') {
          // nothing added to turnTiles
        } else if (step.kind === 'wall') {
          turnTiles.push({ x: step.x, y: step.y });
        } else if (step.kind === 'travel') {
          turnTiles.push({ x: step.x, y: step.y });
        } else if (step.kind === 'hostile_hit') {
          if (step.pierceStop) {
            proj.hitResult = {
              hitTileIndex: step.dist,
              deactivate: true,
              vfxSprite: step.hitResult.vfxSprite,
              vfxX: step.target.x,
              vfxY: step.target.y,
              deferredDeathEntityId: step.hitResult.deferredDeathEntityId,
              deferredDeathIsEnemy: step.hitResult.deferredDeathIsEnemy,
              deferredDeathIndex: step.hitResult.deferredDeathIndex,
            };
          }
        } else if (step.kind === 'healing_hit') {
          if (step.pierceStop) {
            proj.hitResult = {
              hitTileIndex: step.dist,
              deactivate: true,
              vfxSprite: step.vfxSprite,
              vfxX: step.target.x,
              vfxY: step.target.y,
            };
          }
        } else if (step.kind === 'reflect') {
          // Reflect happened. Resolve the reflected walk and build the
          // combined approach+reflect tilePath for the visual system.
          reflectedThisTurn = true;
          const approachTiles = [...turnTiles];
          const { reflectedTiles, reflectedHit } = resolveReflectedPath(
            proj, approachTiles, gameState, canPierce);

          const combinedPath = [...approachTiles, ...reflectedTiles];
          proj.tilePath = combinedPath;
          proj.currentTileIndex = 0;
          proj.tileEntryTime = Date.now();
          proj.reflectAtTileIndex = approachTiles.length - 1;
          proj.logicalTileIndex = 0;

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
        }
      }

      shouldRemove = walk.endedAtBounds || walk.endedAtWall || walk.endedAtPierceStop
        || walk.steps.some(s => (s.kind === 'hostile_hit' || s.kind === 'healing_hit') && s.pierceStop);

      // Skip position/tilePath updates if reflected (already handled above)
      if (reflectedThisTurn) continue;

      // Update projectile position if still active
      if (!shouldRemove && !hitWall) {
        const newDist = Math.min(endTile, range);
        proj.x = proj.startX + dx * newDist;
        proj.y = proj.startY + dy * newDist;
        proj.logicalTileIndex = newDist;

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
        let lastDist = turnTiles.length > 0 ? startTile + turnTiles.length - 1 : startTile;
        // On wall hit, the wall tile was pushed into turnTiles for visual
        // purposes — but the logical stop is the tile *before* the wall, so
        // subtract it back out. Otherwise logicalTileIndex ends up past the
        // wall, and if the projectile were reprocessed (pre-pendingDeactivation
        // skip) it would continue from the other side.
        if (hitWall) lastDist -= 2;
        proj.logicalTileIndex = lastDist;
      }

      if (turnTiles.length > 0) {
        proj.x = turnTiles[turnTiles.length - 1].x;
        proj.y = turnTiles[turnTiles.length - 1].y;
      }
    }

    // THROW_PLACE: place item when projectile reaches destination
    if (shouldRemove && proj.throwPlaceConfig) {
      // Find the last valid (non-wall) tile to place the item
      let placeTile = turnTiles.length > 0 ? turnTiles[turnTiles.length - 1] : null;
      // If the last tile in turnTiles is a wall, use the one before it
      if (placeTile) {
        const placeTileData = gameState.puzzle.tiles[placeTile.y]?.[placeTile.x];
        if (!placeTileData || placeTileData.type === TileTypeEnum.WALL ||
            !isInBounds(placeTile.x, placeTile.y, gameState.puzzle.width, gameState.puzzle.height)) {
          placeTile = turnTiles.length > 1 ? turnTiles[turnTiles.length - 2] : null;
        }
      }

      if (placeTile) {
        placeCollectibleFromSpell(placeTile.x, placeTile.y, proj.throwPlaceConfig, gameState);
        proj.hitResult = {
          hitTileIndex: turnTiles.length - 1,
          deactivate: true,
          placeCollectibleConfig: proj.throwPlaceConfig,
        };
      }
    }

    if (shouldRemove && !proj.hitResult) {
      // No hit occurred (range exhausted / wall / out of bounds). Tell the
      // visual loop to deactivate at the end of the current tilePath by
      // setting a minimal hitResult (no vfx, no deferred death — just
      // deactivate). Unified with the existing hit path so the visual loop
      // only has one "logic done" signal to consume.
      const endTileIndex = proj.tilePath && proj.tilePath.length > 0 ? proj.tilePath.length - 1 : 0;
      proj.hitResult = { hitTileIndex: endTileIndex, deactivate: true };
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

    // Record spawn event if this projectile hasn't been recorded yet
    if (gameState.projectileTimeline && !proj._recorded) {
      recordProjectileEvent(gameState, {
        type: 'spawn',
        projId: proj.id,
        x: proj.startX, y: proj.startY,
        tilePath: proj.tilePath ? [...proj.tilePath] : undefined,
        direction: proj.direction,
        speed: proj.speed,
        sourceEntityId: proj.sourceCharacterId || proj.sourceEnemyId,
        sourceIsEnemy: !!proj.sourceEnemyId,
        isHoming: proj.isHoming,
        homingPathStyle: proj.homingPathStyle,
        spellAssetId: proj.spellAssetId,
        attackData: proj.attackData,
        projectileScale: proj.attackData.projectileScale,
      });
      proj._recorded = true;
    }

    const isHealingProjectile = proj.attackData.healing !== undefined;
    const range = proj.attackData.range || 10;
    const tilesPerTurn = proj.speed || 4;

    let hitSomething = false;
    let shouldRemove = false;

    // === HOMING PROJECTILES ===
    if (proj.isHoming && proj.targetEntityId) {
      let targetEntity: { x: number; y: number; dead?: boolean } | undefined;
      let targetEntityId: string | undefined;
      let targetIsEnemyFlag = false;
      if (proj.targetIsEnemy) {
        if (proj.reflected && proj.sourceEnemyIndex !== undefined && gameState.puzzle.enemies[proj.sourceEnemyIndex]) {
          const enemy = gameState.puzzle.enemies[proj.sourceEnemyIndex];
          if (!enemy.dead) { targetEntity = enemy; targetEntityId = enemy.enemyId; targetIsEnemyFlag = true; }
        }
        if (!targetEntity) {
          const enemy = gameState.puzzle.enemies.find(e => e.enemyId === proj.targetEntityId && !e.dead);
          if (enemy) { targetEntity = enemy; targetEntityId = enemy.enemyId; targetIsEnemyFlag = true; }
        }
      } else {
        const char = gameState.placedCharacters.find(c => c.characterId === proj.targetEntityId && !c.dead);
        if (char) { targetEntity = char; targetEntityId = char.characterId; targetIsEnemyFlag = false; }
      }

      if (targetEntity) {
        const dx = targetEntity.x - proj.x;
        const dy = targetEntity.y - proj.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= tilesPerTurn) {
          // Reflected projectiles always count as hostile — the reflect flipped
          // targetIsEnemy but the bolt is still damage-only. Without the override
          // the solver misclassifies reflected hits as heals (mirror of the fix
          // in resolveProjectiles' homing branch above).
          const isHostileHit = proj.reflected || (proj.sourceCharacterId && proj.targetIsEnemy) ||
                               (proj.sourceEnemyId && !proj.targetIsEnemy);

          if (isHostileHit) {
            const targetIsEnemy = !!proj.targetIsEnemy;
            const hitResult = applyEntityHit(
              targetEntity as (PlacedCharacter | PlacedEnemy), targetIsEnemy,
              proj, gameState, 'headless');
            if (hitResult.reflected) {
              recordProjectileEvent(gameState, {
                type: 'reflect',
                projId: proj.id,
                x: targetEntity.x, y: targetEntity.y,
                reflected: true,
                reflectTintColor: proj.reflectTintColor,
                reflectOverrideSprite: proj.reflectOverrideSprite,
                reflectAtTileIndex: proj.reflectAtTileIndex,
                combinedPath: proj.tilePath ? [...proj.tilePath] : undefined,
              });
              continue;
            }
            // Record hit event
            recordProjectileEvent(gameState, {
              type: 'hit',
              projId: proj.id,
              x: targetEntity.x, y: targetEntity.y,
              targetEntityId,
              targetIsEnemy: targetIsEnemyFlag,
              damage: proj.attackData.damage,
            });
          } else {
            // Friendly homing heal/buff
            const targetIsEnemy = !!(proj.sourceEnemyId && proj.targetIsEnemy);
            applyHealingHit(
              targetEntity as (PlacedCharacter | PlacedEnemy), targetIsEnemy,
              proj, gameState, true);
            recordProjectileEvent(gameState, {
              type: 'hit',
              projId: proj.id,
              x: targetEntity.x, y: targetEntity.y,
              targetEntityId,
              targetIsEnemy: targetIsEnemyFlag,
            });
          }
          shouldRemove = true;
        } else {
          const moveRatio = tilesPerTurn / distance;
          proj.x += dx * moveRatio;
          proj.y += dy * moveRatio;
          proj.targetX = targetEntity.x;
          proj.targetY = targetEntity.y;
        }
      } else {
        shouldRemove = true;
      }
    } else {
      // === NON-HOMING PROJECTILES (headless mode) ===
      // Shared collision walk returns a step log; this branch translates it
      // into timeline events (wall_hit / hit / reflect) and flips shouldRemove
      // based on wall/bounds/pierce/range-end outcomes.
      const { dx, dy } = getDirectionOffset(proj.direction);
      const canPierce = proj.attackData.projectilePierces === true;
      const startTile = (proj.logicalTileIndex ?? 0) + 1;
      const endTile = Math.min(startTile + tilesPerTurn - 1, range);

      const walk = walkNonHomingTick(proj, gameState, 'headless', tilesPerTurn, range);
      hitSomething = walk.hitSomething;
      const hitWall = walk.endedAtWall;
      let reflectHandled = false;

      for (const step of walk.steps) {
        if (step.kind === 'wall') {
          recordProjectileEvent(gameState, {
            type: 'wall_hit', projId: proj.id, x: step.x, y: step.y,
          });
        } else if (step.kind === 'hostile_hit') {
          recordProjectileEvent(gameState, {
            type: 'hit', projId: proj.id, x: step.x, y: step.y,
            targetEntityId: step.targetIsEnemy
              ? (step.target as PlacedEnemy).enemyId
              : (step.target as PlacedCharacter).characterId,
            targetIsEnemy: step.targetIsEnemy,
            damage: proj.attackData.damage,
          });
        } else if (step.kind === 'healing_hit') {
          recordProjectileEvent(gameState, {
            type: 'hit', projId: proj.id, x: step.x, y: step.y,
            targetEntityId: step.targetIsEnemy
              ? (step.target as PlacedEnemy).enemyId
              : (step.target as PlacedCharacter).characterId,
            targetIsEnemy: step.targetIsEnemy,
          });
        } else if (step.kind === 'reflect') {
          recordProjectileEvent(gameState, {
            type: 'reflect',
            projId: proj.id,
            x: step.x, y: step.y,
            reflected: true,
            reflectTintColor: proj.reflectTintColor,
            reflectOverrideSprite: proj.reflectOverrideSprite,
            reflectAtTileIndex: proj.reflectAtTileIndex,
            combinedPath: proj.tilePath ? [...proj.tilePath] : undefined,
          });
          shouldRemove = resolveReflectedPathHeadless(proj, gameState, canPierce) || shouldRemove;
          reflectHandled = true;
        }
      }

      if (walk.endedAtBounds || walk.endedAtWall || walk.endedAtPierceStop) shouldRemove = true;
      if (walk.steps.some(s => (s.kind === 'hostile_hit' || s.kind === 'healing_hit') && s.pierceStop)) {
        shouldRemove = true;
      }

      // Update projectile position if it's still active
      if (!reflectHandled && !shouldRemove && !hitWall) {
        const newDist = Math.min(endTile, range);
        proj.x = proj.startX + dx * newDist;
        proj.y = proj.startY + dy * newDist;
        proj.logicalTileIndex = newDist;

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
      }
    }

    // THROW_PLACE: place item when headless projectile reaches destination
    if (shouldRemove && proj.throwPlaceConfig) {
      const placeX = Math.floor(proj.x);
      const placeY = Math.floor(proj.y);
      // Verify it's a valid tile (not wall, in bounds)
      if (isInBounds(placeX, placeY, gameState.puzzle.width, gameState.puzzle.height)) {
        const placeTile = gameState.puzzle.tiles[placeY]?.[placeX];
        if (placeTile && placeTile.type !== TileTypeEnum.WALL) {
          placeCollectibleFromSpell(placeX, placeY, proj.throwPlaceConfig, gameState);
        }
      }
    }

    if (shouldRemove) {
      // Record deactivate event for projectiles that weren't already recorded as hit/wall_hit
      if (gameState.projectileTimeline) {
        const lastEvent = gameState.projectileTimeline.filter(e => e.projId === proj.id);
        const hasEndEvent = lastEvent.some(e => e.type === 'hit' || e.type === 'wall_hit' || e.type === 'deactivate');
        if (!hasEndEvent) {
          recordProjectileEvent(gameState, {
            type: 'deactivate',
            projId: proj.id,
            x: proj.x, y: proj.y,
          });
        }
      }
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
