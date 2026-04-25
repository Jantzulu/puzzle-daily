/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, no-case-declarations, prefer-const */
import type { GameState, PlacedCharacter, PlacedEnemy, ParallelActionTracker, StatusEffectInstance, SpellTemplate, SpellAsset, PlacedCollectible, CharacterAction, Puzzle, Projectile, ProjectileVisualState, SpriteReference, ProjectileEvent } from '../types/game';
import { ActionType, Direction, StatusEffectType, TileType as TileTypeEnum } from '../types/game';
import { getCharacter } from '../data/characters';
import { getEnemy } from '../data/enemies';
import { executeAction, executeAOEAttack, evaluateTriggers, executeDeathTriggers, applyDamageToEntity, applyDamageToEntityNoDeflect, placeCollectibleFromSpell } from './actions';
import { loadStatusEffectAsset, loadSpellAsset, loadCollectible, loadEnemy, loadCharacter, loadTileType } from '../utils/assetStorage';
import { turnLeft, turnRight, turnAround, getDirectionOffset, calculateDirectionTo, isAttackFromBehind } from './utils';

// Debug flag for projectile tracing: flip to true to enable detailed logs
// covering spawn, per-turn resolve events, per-frame visual interpolation,
// hit consumption, death mutations, and victory checks. Used during the
// April 2026 homing/duplicate-enemyId investigation — left in place so the
// same diagnostic trail is one edit away next time a projectile regression
// surfaces. Search for HOMING_DEBUG to find all gated sites.
//
// `_homingDebugSilenced` lets the UI layer silence logs without flipping the
// base flag — e.g. after victory/defeat so the console stays copyable while
// lingering projectiles finish animating.
export const HOMING_DEBUG = false;
let _homingDebugSilenced = false;
export function setHomingDebugSilenced(silenced: boolean): void {
  _homingDebugSilenced = silenced;
}
export function isHomingDebug(): boolean {
  return HOMING_DEBUG && !_homingDebugSilenced;
}

// Pierce-specific diagnostic flag. Lets us trace pierce-through hits
// (capture → consume) without enabling HOMING_DEBUG's firehose. Look for
// [PIERCE-CAPTURE-LINEAR], [PIERCE-CAPTURE-HOMING], [PIERCE-CONSUME],
// [PIERCE-DISPLACE], [PIERCE-POPULATE] in the console.
export const PIERCE_DEBUG = false;
export function isPierceDebug(): boolean { return PIERCE_DEBUG; }

/**
 * Duration of the shrink-to-nothing despawn animation for projectiles that
 * fizzle without landing on a target (out-of-range / wall hit). Exported
 * so drawProjectile can compute the same scale multiplier against the
 * same elapsed window. Front-loaded into the final portion of travel for
 * cases that have a travel window.
 */
export const DESPAWN_SHRINK_MS = 250;

/**
 * Shorter lingering variant for bolts that lose their approach window —
 * specifically, homing bolts whose target dies mid-flight from another
 * bolt. These have no way to know in advance, so the shrink can't be
 * front-loaded; it runs AS a linger post-consume. Half the main duration
 * to minimize the wall-clock extension.
 */
export const TARGET_LOST_LINGER_MS = 125;

/**
 * Set `proj.despawning` if a freshly-set clean `hitResult` has insufficient
 * travel window for the approach-shrink to cover visually. When consumeAtMs
 * is less than DESPAWN_SHRINK_MS away from now, the approach path would
 * flash scale 0 with no visible animation — switch to the lingering path
 * instead. Called right after setting `proj.hitResult = { deactivate: true, ... }`.
 *
 * Skips the linger when the predictive shrink (in `drawProjectile`) already
 * handled the animation during the prior turn's approach — otherwise the
 * linger restarts from scale 1 and the user sees a "shrink → expand →
 * shrink" pop. Specifically:
 *   - Homing OUT OF RANGE: predictive fires when
 *     `range - pathTraveled < 0.5` (or `< 1` for pathfinding). If those
 *     conditions hold at this moment, predictive was running on the prior
 *     turn's last 250ms; bolt is already at scale ~0.
 *   - Non-homing endpoint fizzle: predictive fires on approach to tilePath
 *     endpoint. If the visual is already AT the endpoint
 *     (`elapsed >= (tilePath.length - 1) * tileTransitMs`), predictive
 *     ran. Detect via elapsed vs endpoint time.
 */
export function maybeMarkLingerDespawn(proj: Projectile, hitTileIndex: number, now: number): void {
  const tileTransitMs = proj.isHoming && proj.tilePath && proj.tilePath.length > 1
    ? 800 / (proj.tilePath.length - 1)
    : 800 / (proj.speed || 4);
  const anchorMs = proj.tileEntryTime ?? proj.startTime ?? now;
  const consumeAtMs = anchorMs + hitTileIndex * tileTransitMs;
  if (consumeAtMs - now >= DESPAWN_SHRINK_MS) {
    // Plenty of travel window left — approach-shrink will handle it.
    return;
  }

  // Check if predictive shrink already covered the animation. If yes,
  // skip the linger to avoid a scale-1 pop.
  let predictiveCovered = false;
  if (proj.isHoming) {
    if (proj.attackData.range !== undefined && proj.pathTraveled !== undefined) {
      const remaining = proj.attackData.range - proj.pathTraveled;
      predictiveCovered =
        remaining < 0.5 ||
        (proj.homingPathStyle === 'pathfinding' && remaining < 1);
    }
  } else if (proj.tilePath && proj.tilePath.length > 0) {
    const elapsed = now - anchorMs;
    const endpointAtMs = (proj.tilePath.length - 1) * tileTransitMs;
    predictiveCovered = elapsed >= endpointAtMs;
  }
  if (predictiveCovered) return;

  proj.despawning = true;
  proj.despawnStartTime = now;
}

/**
 * BFS pathfinding: find shortest path from start to target avoiding walls.
 * Returns array of tile positions, or empty array if no path exists.
 */
export function findPathBFS(
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

    // Collect valid unvisited neighbors first, then enqueue them sorted by
    // distance-to-target. All shortest paths are equivalent length on a
    // uniform-cost grid, but BFS returns whichever is discovered first —
    // and discovery order depends on enqueue order. Without the sort, the
    // fixed N/NE/E/SE/S/SW/W/NW `dirs` order makes SW neighbors dequeue
    // before W and NW, so bolts aiming NW pick up a (2,2) intermediate and
    // visibly detour south before correcting. Sorting by target-distance
    // gives BFS a greedy bias: neighbors closer to the target get explored
    // first, so the returned path trends straight at the target. Still
    // deterministic (stable sort + dist tie-break falls back to dirs order),
    // still shortest, just visually direct.
    const candidates: Array<{x: number; y: number; dist: number}> = [];
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

      const dx = nx - tx;
      const dy = ny - ty;
      candidates.push({x: nx, y: ny, dist: dx * dx + dy * dy});
    }
    candidates.sort((a, b) => a.dist - b.dist);

    for (const c of candidates) {
      const key = `${c.x},${c.y}`;
      if (visited.has(key)) continue; // Another candidate may have beaten this one
      visited.add(key);
      const newPath = [...current.path, {x: c.x, y: c.y}];

      if (c.x === tx && c.y === ty) return newPath;

      queue.push({x: c.x, y: c.y, path: newPath});
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

  for (let tileIdx = 0; tileIdx < tiles.length; tileIdx++) {
    const tile = tiles[tileIdx];
    // Skip the starting tile
    if (tile.x === Math.floor(proj.logicalX) && tile.y === Math.floor(proj.logicalY)) continue;

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
        if (isHomingDebug()) {
          console.log(
            `[PATH-HIT ${proj.id.slice(-6)}] (along-path) enemy=${hitEnemy.enemyId.slice(-6)}[idx=${hitEnemyIndex}]@(${tile.x},${tile.y}) ` +
            `baseDmg=${baseDmg} isCrit=${isCrit} finalDmg=${damage} ` +
            `hpBefore=${hitEnemy.currentHealth} pendingVisDmg=${hitEnemy.pendingVisualDamage ?? 0}→${(hitEnemy.pendingVisualDamage ?? 0) + damage}`
          );
        }
        hitEnemy.pendingVisualDamage = (hitEnemy.pendingVisualDamage ?? 0) + damage;
        applyDamageToEntityNoDeflect(hitEnemy, damage, gameState);
        if (hitEnemy.dead) {
          hitEnemy.dead = false;
          hitEnemy.pendingProjectileDeath = true;
          // Bump diedOnTurn to the turn the visual death will play
          // (one turn later, since the bolt takes a turn to arrive).
          // applyDamageToEntityNoDeflect stamped `currentTurn`; override
          // now that we know this is a deferred death.
          hitEnemy.diedOnTurn = gameState.currentTurn + 1;
          if (isHomingDebug()) console.log(`[DEATH-MUT enemy] idx=${hitEnemyIndex} id=${hitEnemy.enemyId.slice(-6)}@(${hitEnemy.x},${hitEnemy.y}) → pendingDeath (from checkEntityCollisions, proj=${proj.id.slice(-6)})`);
        }
        // Pierce pass-through — stage a decrement with this tile's index
        // in the incoming `tiles` array, which is about to become
        // proj.tilePath this turn. The decrement fires when the visual
        // sprite reaches this tile (mid-turn), matching how other spells
        // apply damage on visual contact.
        if (!proj.pendingVisualDecrements) proj.pendingVisualDecrements = [];
        proj.pendingVisualDecrements.push({
          targetEntityId: hitEnemy.enemyId,
          targetIsEnemy: true,
          targetIndex: hitEnemyIndex,
          damage,
          hitTileIndex: tileIdx,
        });
        if (isPierceDebug()) {
          console.log(
            `[PIERCE-CAPTURE-HOMING ${proj.id.slice(-6)}] turn=${gameState.currentTurn} ` +
            `enemy=${hitEnemy.enemyId.slice(-6)}[idx=${hitEnemyIndex}]@(${tile.x},${tile.y}) ` +
            `tileIdx=${tileIdx} tilesLen=${tiles.length} damage=${damage} now=${Date.now()}`
          );
        }
        // Replay event — emit a `hit` for every pierce target along the
        // path. The replay aggregator distinguishes pierce-through from
        // pierce-stop by which event ends up "shadowed" by a later end
        // event for the same projId. deferredDeath* lets replay commit
        // pendingDeath → dead at the right moment.
        recordProjectileEvent(gameState, {
          type: 'hit',
          projId: proj.id,
          x: tile.x, y: tile.y,
          targetEntityId: hitEnemy.enemyId,
          targetIsEnemy: true,
          hitTileIndex: tileIdx,
          hitVfxSprite: proj.attackData.hitEffectSprite,
          damage,
          deferredDeathEntityId: hitEnemy.enemyId,
          deferredDeathIsEnemy: true,
          deferredDeathIndex: hitEnemyIndex,
        });
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
        if (isHomingDebug()) {
          console.log(
            `[PATH-HIT ${proj.id.slice(-6)}] (along-path) char=${hitChar.characterId.slice(-6)}@(${tile.x},${tile.y}) ` +
            `baseDmg=${baseDmg} isCrit=${isCrit} finalDmg=${damage} ` +
            `hpBefore=${hitChar.currentHealth} pendingVisDmg=${hitChar.pendingVisualDamage ?? 0}→${(hitChar.pendingVisualDamage ?? 0) + damage}`
          );
        }
        hitChar.pendingVisualDamage = (hitChar.pendingVisualDamage ?? 0) + damage;
        applyDamageToEntityNoDeflect(hitChar, damage, gameState);
        if (hitChar.dead) {
          hitChar.dead = false;
          hitChar.pendingProjectileDeath = true;
          hitChar.diedOnTurn = gameState.currentTurn + 1;
        }
        if (!proj.pendingVisualDecrements) proj.pendingVisualDecrements = [];
        proj.pendingVisualDecrements.push({
          targetEntityId: hitChar.characterId,
          targetIsEnemy: false,
          damage,
          hitTileIndex: tileIdx,
        });
        if (isPierceDebug()) {
          console.log(
            `[PIERCE-CAPTURE-HOMING ${proj.id.slice(-6)}] turn=${gameState.currentTurn} ` +
            `char=${hitChar.characterId.slice(-6)}@(${tile.x},${tile.y}) ` +
            `tileIdx=${tileIdx} tilesLen=${tiles.length} damage=${damage} now=${Date.now()}`
          );
        }
        // Replay event — see corresponding emission in the enemy branch.
        recordProjectileEvent(gameState, {
          type: 'hit',
          projId: proj.id,
          x: tile.x, y: tile.y,
          targetEntityId: hitChar.characterId,
          targetIsEnemy: false,
          hitTileIndex: tileIdx,
          hitVfxSprite: proj.attackData.hitEffectSprite,
          damage,
          deferredDeathEntityId: hitChar.characterId,
          deferredDeathIsEnemy: false,
        });
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

  proj.logicalX = startX;
  proj.logicalY = startY;
  proj.startX = startX;
  proj.startY = startY;
  // Reset cumulative path length — reflected bolts get a fresh range budget
  // from the reflector's position (matches original 8b049df semantics).
  proj.pathTraveled = 0;
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
export function getTilesAlongLine(x0: number, y0: number, x1: number, y1: number): Array<{x: number, y: number}> {
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
  if (entity.diedOnTurn === undefined) {
    entity.diedOnTurn = gameState.currentTurn;
  }
  if (isHomingDebug()) {
    const isEnemy = 'enemyId' in entity;
    const id = isEnemy ? (entity as PlacedEnemy).enemyId : (entity as PlacedCharacter).characterId;
    console.log(`[DEATH-MUT ${isEnemy ? 'enemy' : 'char'}] id=${id.slice(-6)}@(${entity.x},${entity.y}) → dead (from applyEntityDeath/triggers)`);
  }
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
        if (isHomingDebug()) {
          // Dump full enemy state when the defeat_all_enemies check runs, so
          // we can see if win fires with anything non-dead.
          const states = gameState.puzzle.enemies.map((e, i) =>
            `[${i}]${e.enemyId.slice(-6)}@(${e.x},${e.y}) dead=${e.dead} pending=${e.pendingProjectileDeath} hp=${e.currentHealth}+${e.pendingVisualDamage ?? 0}`
          ).join(' | ');
          console.log(`[WIN-CHECK defeat_all_enemies] turn=${gameState.currentTurn} allDead=${allEnemiesDead} enemies: ${states}`);
        }
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
// PROJECTILE VISUAL UPDATE HELPERS (Phase B + C of projectile refactor)
// ==========================================
// Each helper is a movement branch extracted from updateProjectiles() in
// Phase B. Phase C-2/C-3 made them pure w.r.t. visual state: they compute
// positions and tile progress and return them through
// ProjectileMovementResult; the caller writes to the visual-state side-table.
// The only write each helper still makes to `proj` is `proj.direction` for
// sprite rotation (a logical field — writing from visual code is a pre-
// existing quirk tolerated to avoid over-scoping Phase C).
//
// See docs/projectile-refactor-plan.md.

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
  /**
   * Phase C-3: visual progress through tilePath. Helpers compute and return
   * this rather than writing `proj.currentTileIndex` per-frame — that was the
   * last remaining per-frame visual mutation captured by GameState deep
   * copies. The caller uses it for hitResult-timing checks and (optionally)
   * mirrors it into the visual-state side-table.
   */
  visualTileIndex?: number;
}

/**
 * Compute the current straight-line-homing visual position using the same
 * formula `updateStraightLineHomingVisual` uses per-frame. Used by
 * resolveProjectiles to preserve visual continuity when re-anchoring: if we
 * re-anchor `homingVisualStartX/Y` to `logicalX/Y` for a moving target, the
 * visual snaps because it had been interpolating toward the OLD target along
 * a different line. Re-anchoring to the CURRENT visual position instead makes
 * the new trajectory continue smoothly from where the bolt actually appears.
 */
function currentStraightLineHomingVisualPos(proj: Projectile, now: number): { x: number; y: number } {
  if (proj.homingPathStyle !== 'straight' || proj.homingVisualStartX === undefined) {
    return { x: proj.logicalX, y: proj.logicalY };
  }
  const startX = proj.homingVisualStartX;
  const startY = proj.homingVisualStartY ?? proj.logicalY;
  const elapsed = (now - (proj.homingVisualStartTime ?? proj.startTime)) / 1000;
  const speedTilesPerSecond = (proj.speed || 4) / 0.8;
  const totalDist = Math.sqrt(Math.pow(proj.targetX - startX, 2) + Math.pow(proj.targetY - startY, 2));
  const totalTime = Math.max(0.1, totalDist / speedTilesPerSecond);
  const progress = Math.min(elapsed / totalTime, 1);
  return {
    x: startX + (proj.targetX - startX) * progress,
    y: startY + (proj.targetY - startY) * progress,
  };
}

/**
 * STRAIGHT-LINE HOMING: smooth interpolation from original start to target.
 * Active when: proj.isHoming && proj.homingPathStyle === 'straight' && proj.homingVisualStartX !== undefined
 */
function updateStraightLineHomingVisual(proj: Projectile, now: number): ProjectileMovementResult {
  const startX = proj.homingVisualStartX!;
  const startY = proj.homingVisualStartY ?? proj.logicalY;
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

  if (isHomingDebug()) {
    // Log sparsely: first frame, last frame, and every ~5th frame in between
    const pid = proj.id.slice(-6);
    const visualStateKey = `${pid}_lastProgress`;
    const lastProgress = (proj as any)._debugLastProgress ?? -1;
    const shouldLog = lastProgress < 0 || progress >= 1 || Math.abs(progress - lastProgress) > 0.1;
    if (shouldLog) {
      (proj as any)._debugLastProgress = progress;
      console.log(
        `[HOMING-VISUAL ${pid}] t=${elapsed.toFixed(3)}s ` +
        `anchor=(${startX.toFixed(2)},${startY.toFixed(2)}) ` +
        `target=(${proj.targetX.toFixed(2)},${proj.targetY.toFixed(2)}) ` +
        `logical=(${proj.logicalX.toFixed(2)},${proj.logicalY.toFixed(2)}) ` +
        `totalDist=${totalDist.toFixed(2)} totalTime=${totalTime.toFixed(2)}s ` +
        `progress=${progress.toFixed(3)} visual=(${newX.toFixed(2)},${newY.toFixed(2)}) ` +
        `reached=${reachedTarget}`
      );
    }
  }

  return { newX, newY, reachedTarget };
}

/**
 * GRID HOMING (no tilePath): move toward current target from current position.
 * Active when: proj.isHoming && !(proj.tilePath && proj.tilePath.length > 0)
 *
 * Phase C-2: `currentX`/`currentY` are read from the visual-state side-table
 * by the caller — no longer from `proj.x/y`, which is migrating out.
 */
function updateGridHomingVisual(
  proj: Projectile,
  currentX: number,
  currentY: number,
): ProjectileMovementResult {
  const dx = proj.targetX - currentX;
  const dy = proj.targetY - currentY;
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
    newX = currentX + normalizedDx * moveDistance;
    newY = currentY + normalizedDy * moveDistance;
  }

  // Update direction for sprite rotation
  if (dx !== 0 || dy !== 0) {
    proj.direction = calculateDirectionTo(currentX, currentY, proj.targetX, proj.targetY);
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
 * Phase C-3: this helper is pure — it does not mutate proj.currentTileIndex
 * or proj.tileEntryTime. Visual progress flows out via the result's
 * `visualTileIndex`; the caller mirrors it into the side-table. Prevents
 * deep-copies of GameState from capturing stale per-frame visual state.
 */
function updateTileBasedVisual(proj: Projectile, now: number): ProjectileMovementResult {
  const tilePath = proj.tilePath!;
  const spawnTime = proj.tileEntryTime ?? proj.startTime;
  const elapsed = (now - spawnTime) / 1000; // seconds since spawn
  const speedTilesPerSecond = (proj.speed || 4) / 0.8;
  // Homing projectiles have a per-turn tilePath rebuilt by resolveProjectiles.
  // The path is Chebyshev-stepped by getTilesAlongLine, so a diagonal move of
  // `speed` Euclidean tiles produces fewer tile steps than `speed`. Using the
  // fixed per-tile transit time (0.8s/speed) would finish the path before the
  // turn ends and leave the bolt visibly frozen. Pace the whole path to
  // exactly one turn (800ms) instead.
  //
  // Non-homing bolts have a full-flight tilePath from spawn; keep per-tile
  // pacing so travel time matches speed across the entire flight.
  const tileTransitTime = proj.isHoming && tilePath.length > 1
    ? 0.8 / (tilePath.length - 1)
    : 1 / speedTilesPerSecond;

  // Calculate which tile we should be on based purely on elapsed time.
  // STRAIGHT-LINE branch overrides this to match its Euclidean-based
  // progress — per-tile pacing and Euclidean interpolation complete at
  // different times for diagonal paths (tile count < Euclidean distance),
  // and consuming hitResult based on tile-pacing while the visual is still
  // mid-flight spawns VFX at the target with the bolt visibly short.
  let visualTileIndex = Math.min(
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
    // Derive visualTileIndex from interp progress so hit-consume timing
    // matches the bolt's actual visual position (Math.floor so the final
    // index is reached exactly when progress=1.0, i.e. visually at target).
    visualTileIndex = Math.min(
      Math.floor(progress * (tilePath.length - 1)),
      tilePath.length - 1
    );
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

  // Compute visual tile index for hitResult consumption. Phase C-3: return
  // through the result rather than mutating `proj.currentTileIndex` per-frame.
  // For two-segment straight-line reflects, estimate tile index from position.
  let emittedTileIndex: number;
  if (proj.homingPathStyle === 'straight' && proj.reflected && proj.reflectAtTileIndex !== undefined) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let ti = 0; ti < tilePath.length; ti++) {
      const td = Math.abs(tilePath[ti].x - newX) + Math.abs(tilePath[ti].y - newY);
      if (td < bestDist) { bestDist = td; bestIdx = ti; }
    }
    emittedTileIndex = bestIdx;
  } else {
    emittedTileIndex = visualTileIndex;
  }

  // Update direction for sprite rotation — per-segment, so bouncing /
  // reflected bolts rotate to face their actual current heading rather than
  // an averaged first-to-last angle. Pick the segment containing the bolt's
  // current visual position: usually [visualTileIndex → visualTileIndex+1],
  // but at the final tile (no "next") fall back to the last completed
  // segment [length-2 → length-1] so the sprite holds the final heading.
  //
  // SKIP for the two-segment-reflected straight-homing branch: that branch
  // already sets proj.direction per-segment based on the actual Euclidean
  // phase (approach vs reflected leg), which is more accurate than our
  // time-based visualTileIndex lookup. visualTileIndex assumes 1 tile per
  // tileTransit, but the two-segment animation uses approach/reflect times
  // scaled by Euclidean distances — they drift for diagonal segments.
  const isTwoSegmentReflect =
    proj.homingPathStyle === 'straight' && proj.reflected && proj.reflectAtTileIndex !== undefined && tilePath.length >= 2;
  if (tilePath.length >= 2 && !isTwoSegmentReflect) {
    const segStart = Math.min(visualTileIndex, tilePath.length - 2);
    const segEnd = segStart + 1;
    const fromTile = tilePath[segStart];
    const toTile = tilePath[segEnd];
    const dx = toTile.x - fromTile.x;
    const dy = toTile.y - fromTile.y;
    if (dx !== 0 || dy !== 0) {
      proj.direction = calculateDirectionTo(fromTile.x, fromTile.y, toTile.x, toTile.y);
    }
  }

  if (isHomingDebug()) {
    const pid = proj.id.slice(-6);
    const lastLogged = (proj as any)._debugLastTileIdx ?? -999;
    if (emittedTileIndex !== lastLogged || reachedTarget) {
      (proj as any)._debugLastTileIdx = emittedTileIndex;
      console.log(
        `[PROJ-VISUAL-TILE ${pid}] homing=${proj.isHoming} style=${proj.homingPathStyle ?? 'n/a'} t=${elapsed.toFixed(3)}s ` +
        `tilePath.len=${tilePath.length} tileTransit=${tileTransitTime.toFixed(3)}s ` +
        `visualTileIdx=${emittedTileIndex} visual=(${newX.toFixed(2)},${newY.toFixed(2)}) reached=${reachedTarget}`
      );
    }
  }

  return { newX, newY, reachedTarget, pastReflectPoint, visualTileIndex: emittedTileIndex };
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

    // Target-lost lingering despawn: skip movement/consume, render the
    // shrinking sprite for TARGET_LOST_LINGER_MS, then flip inactive and
    // remove. `despawning` was set at hitResult-creation time for bolts
    // whose approach-shrink had no travel window (e.g. homing bolt whose
    // target just died from another bolt). Bolts with a full approach
    // window leave `despawning` false and remove instantly at consume.
    if (proj.despawning && proj.despawnStartTime !== undefined) {
      const elapsed = now - proj.despawnStartTime;
      if (elapsed >= TARGET_LOST_LINGER_MS) {
        proj.active = false;
        projectilesToRemove.push(proj.id);
      }
      continue;
    }

    // Phase C-2: visual position lives in the side-table. Seed an entry on
    // first sight of a projectile, anchored to its current logical position.
    let vs = visualState?.get(proj.id);
    if (visualState && !vs) {
      vs = { x: proj.logicalX, y: proj.logicalY, startTime: proj.startTime };
      visualState.set(proj.id, vs);
    }
    const currentX = vs?.x ?? proj.logicalX;
    const currentY = vs?.y ?? proj.logicalY;

    // Dispatch to the appropriate movement branch. Same conditions as before
    // the Phase B extraction — behavior is identical.
    let result: ProjectileMovementResult;
    if (proj.isHoming && proj.homingPathStyle === 'straight' && proj.homingVisualStartX !== undefined) {
      result = updateStraightLineHomingVisual(proj, now);
    } else if (proj.isHoming && !(proj.tilePath && proj.tilePath.length > 0)) {
      result = updateGridHomingVisual(proj, currentX, currentY);
    } else if (proj.tilePath && proj.tilePath.length > 0) {
      result = updateTileBasedVisual(proj, now);
    } else {
      result = updateLegacyNoPathVisual(proj, now);
    }
    const { newX, newY, reachedTarget } = result;

    // Write interpolated visual position to the side-table (Phase C-2).
    if (vs) {
      vs.x = newX;
      vs.y = newY;
      // Stamp the turn so drawProjectile knows this entry is fresh for the
      // current turn. During replay, a paused mid-flight projectile keeps its
      // vs entry at the CURRENT turn — drawProjectile reads it. After a
      // replay seek/step, the new turn's logical has changed but the vs
      // entry still holds the previous turn's position; the turn mismatch
      // tells drawProjectile to fall back to logicalX/Y.
      vs.lastUpdateTurn = gameState.currentTurn;
    }

    // Phase C-3: mirror the helper-computed visual tile index into the
    // side-table. updateTileBasedVisual no longer mutates proj.currentTileIndex
    // per-frame — that was the last mutation captured by GameState deep copies.
    if (result.visualTileIndex !== undefined && vs) {
      vs.currentTileIndex = result.visualTileIndex;
    }

    // Phase C: propagate the "past reflect point" signal into the visual-state
    // side-table. Stable — once set, stays set for this projectile.
    if (result.pastReflectPoint && vs) {
      vs.visualPastReflectPoint = true;
    }
    const pastReflectPoint = !!vs?.visualPastReflectPoint;

    // Spawn deferred reflect VFX when visual reaches the reflect point
    if (proj.pendingReflectVfx && pastReflectPoint) {
      const vfx = proj.pendingReflectVfx;
      spawnParticleEffect(vfx.x, vfx.y, vfx.sprite, vfx.duration, gameState);
      proj.pendingReflectVfx = undefined; // Only spawn once
    }

    // Consume pre-resolved hit results from resolveProjectiles. Prefer the
    // side-table's visual index (Phase C-3); fall back to the logical field
    // for branches without tilePath (which don't emit visualTileIndex).
    const currentTileIdx = vs?.currentTileIndex ?? proj.currentTileIndex ?? 0;
    const straightLineReached = proj.homingPathStyle === 'straight' && reachedTarget;

    // Per-hit pierce pass-through consume. Each decrement fires when the
    // visual sprite reaches its hitTileIndex — matching how other spells
    // apply damage on visual contact. Decrements consumed here are
    // removed from the list; any remaining (e.g. missed due to tilePath
    // replacement) get swept up by the batch consume below on hitResult
    // arrival.
    if (proj.pendingVisualDecrements && proj.pendingVisualDecrements.length > 0) {
      const remaining: typeof proj.pendingVisualDecrements = [];
      for (const dec of proj.pendingVisualDecrements) {
        const ready = currentTileIdx >= dec.hitTileIndex;
        if (isPierceDebug()) {
          console.log(
            `[PIERCE-CONSUME ${proj.id.slice(-6)}] target=${dec.targetEntityId.slice(-6)} ` +
            `currentTileIdx=${currentTileIdx} hitTileIndex=${dec.hitTileIndex} ` +
            `tilePathLen=${proj.tilePath?.length ?? 'none'} tileEntryTime=${proj.tileEntryTime ?? 'unset'} ` +
            `elapsed=${proj.tileEntryTime !== undefined ? (now - proj.tileEntryTime).toFixed(0) : 'n/a'}ms ` +
            `${ready ? 'FIRING' : 'waiting'}`
          );
        }
        if (ready) {
          commitDeferredVisualDamage(
            gameState, proj.id,
            dec.targetEntityId, dec.targetIsEnemy, dec.targetIndex, dec.damage,
          );
        } else {
          remaining.push(dec);
        }
      }
      proj.pendingVisualDecrements = remaining.length > 0 ? remaining : undefined;
    }

    // Watchdog: hitResult set but consumption not firing. Log once ~1 turn
    // past expected arrival so stale hitResults (the suspected cause of the
    // "missed damage that catches up next hit" bug) are visible.
    if (isHomingDebug() && proj.hitResult && currentTileIdx < proj.hitResult.hitTileIndex && !straightLineReached) {
      const elapsedMs = now - (proj.tileEntryTime ?? proj.startTime ?? now);
      const pathLen = proj.tilePath?.length ?? 0;
      // Expected max: 1 turn = 800ms for homing, or (pathLen * 1000/speed) for non-homing.
      const expectedMs = proj.isHoming ? 800 : Math.max(800, pathLen * 250);
      if (elapsedMs > expectedMs + 400 && !(proj as { _stuckLogged?: boolean })._stuckLogged) {
        console.log(
          `[HIT-CONSUME-MISS ${proj.id.slice(-6)}] homing=${proj.isHoming} style=${proj.homingPathStyle ?? 'n/a'} ` +
          `currentTileIdx=${currentTileIdx} hitTile=${proj.hitResult.hitTileIndex} pathLen=${pathLen} ` +
          `elapsed=${elapsedMs.toFixed(0)}ms expected=${expectedMs}ms ` +
          `deferredDeath=${proj.hitResult.deferredDeathEntityId?.slice(-6) ?? 'none'} ` +
          `— hitResult stuck, pendingVisualDamage will NOT decrement for this hit`
        );
        (proj as { _stuckLogged?: boolean })._stuckLogged = true;
      }
    }

    if (proj.hitResult && (currentTileIdx >= proj.hitResult.hitTileIndex || straightLineReached)) {
      if (isHomingDebug()) {
        console.log(
          `[PROJ-HIT-CONSUME ${proj.id.slice(-6)}] homing=${proj.isHoming} style=${proj.homingPathStyle ?? 'n/a'} ` +
          `hitTile=${proj.hitResult.hitTileIndex} currentTileIdx=${currentTileIdx} ` +
          `vfx=(${proj.hitResult.vfxX},${proj.hitResult.vfxY}) ` +
          `deferredDeath=${proj.hitResult.deferredDeathEntityId?.slice(-6) ?? 'none'} ` +
          `idx=${proj.hitResult.deferredDeathIndex ?? '-'} deactivate=${proj.hitResult.deactivate}`
        );
      }
      // Spawn hit VFX
      if (proj.hitResult.vfxSprite && proj.hitResult.vfxX !== undefined && proj.hitResult.vfxY !== undefined) {
        spawnParticleEffect(proj.hitResult.vfxX, proj.hitResult.vfxY, proj.hitResult.vfxSprite,
          proj.attackData.effectDuration || 300, gameState);
      }
      // Trigger deferred death — now set entity.dead = true so AnimatedGameBoard plays death animation.
      // Also decrement pendingVisualDamage by this hit's damage so the bar drops by exactly 1 hit.
      // With multi-bolt overlap, each arrival decrements independently (no more stale captures).
      if (proj.hitResult.deferredDeathEntityId) {
        commitDeferredVisualDamage(
          gameState, proj.id,
          proj.hitResult.deferredDeathEntityId,
          proj.hitResult.deferredDeathIsEnemy ?? false,
          proj.hitResult.deferredDeathIndex,
          proj.hitResult.damage ?? 0,
        );
      }
      // Pierce pass-through decrements — bolt pierced through these targets
      // on prior turns (or earlier this turn before reaching its stop).
      // Each entry drops that target's bar by its hit's damage and commits
      // pendingProjectileDeath if the hit killed them. All fire at the same
      // visual moment as the bolt's final landing.
      if (proj.pendingVisualDecrements) {
        for (const dec of proj.pendingVisualDecrements) {
          commitDeferredVisualDamage(
            gameState, proj.id,
            dec.targetEntityId, dec.targetIsEnemy, dec.targetIndex, dec.damage,
          );
        }
        proj.pendingVisualDecrements = undefined;
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

/**
 * Commit a single deferred-visual-damage record on visual arrival:
 * decrements pendingVisualDamage by `damage`, and if the entity is in
 * pendingProjectileDeath, flips it to dead and fires the drop handler.
 * Shared by the landing target (from hitResult.deferredDeath*) and every
 * pierce pass-through (from proj.pendingVisualDecrements).
 */
function commitDeferredVisualDamage(
  gameState: GameState,
  projIdForLog: string,
  entityId: string,
  isEnemy: boolean,
  index: number | undefined,
  damage: number,
): void {
  if (isEnemy) {
    const enemy = index !== undefined
      ? gameState.puzzle.enemies[index]
      : gameState.puzzle.enemies.find(e => e.enemyId === entityId);
    if (!enemy) return;
    const priorPending = enemy.pendingVisualDamage ?? 0;
    const newPending = Math.max(0, priorPending - damage);
    enemy.pendingVisualDamage = newPending > 0 ? newPending : undefined;
    if (isHomingDebug()) {
      console.log(
        `[VDMG-DECREMENT ${projIdForLog.slice(-6)}] enemy=${enemy.enemyId.slice(-6)}@(${enemy.x},${enemy.y}) ` +
        `pendingVisDmg=${priorPending}→${enemy.pendingVisualDamage ?? 0} hitDmg=${damage}; bar now shows ${enemy.currentHealth + (enemy.pendingVisualDamage ?? 0)}`
      );
    }
    if (enemy.pendingProjectileDeath) {
      enemy.dead = true;
      enemy.pendingProjectileDeath = false;
      enemy.pendingVisualDamage = undefined;
      if (isHomingDebug()) console.log(`[DEATH-MUT enemy] id=${enemy.enemyId.slice(-6)}@(${enemy.x},${enemy.y}) → dead (deferred, from proj=${projIdForLog.slice(-6)} hit visual arrival)`);
      handleEntityDeathDrop(enemy, true, gameState);
    }
  } else {
    const char = gameState.placedCharacters.find(c => c.characterId === entityId);
    if (!char) return;
    const priorPending = char.pendingVisualDamage ?? 0;
    const newPending = Math.max(0, priorPending - damage);
    char.pendingVisualDamage = newPending > 0 ? newPending : undefined;
    if (isHomingDebug()) {
      console.log(
        `[VDMG-DECREMENT ${projIdForLog.slice(-6)}] char=${char.characterId.slice(-6)}@(${char.x},${char.y}) ` +
        `pendingVisDmg=${priorPending}→${char.pendingVisualDamage ?? 0} hitDmg=${damage}; bar now shows ${char.currentHealth + (char.pendingVisualDamage ?? 0)}`
      );
    }
    if (char.pendingProjectileDeath) {
      char.dead = true;
      char.pendingProjectileDeath = false;
      char.pendingVisualDamage = undefined;
      if (isHomingDebug()) console.log(`[DEATH-MUT char] id=${char.characterId.slice(-6)}@(${char.x},${char.y}) → dead (deferred, from proj=${projIdForLog.slice(-6)})`);
      handleEntityDeathDrop(char, false, gameState);
    }
  }
}

interface EntityHitResult {
  reflected: boolean;
  vfxSprite?: any;
  deferredDeathEntityId?: string;
  deferredDeathIsEnemy?: boolean;
  deferredDeathIndex?: number;
  damageApplied?: number; // For pendingVisualDamage bookkeeping on visual arrival
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
  const tgtId = targetIsEnemy ? (target as PlacedEnemy).enemyId : (target as PlacedCharacter).characterId;
  const tgtIdx = targetIsEnemy ? gameState.puzzle.enemies.indexOf(target as PlacedEnemy) : -1;
  if (isHomingDebug()) {
    console.log(
      `[APPLY-HIT ENTRY ${proj.id.slice(-6)}] → tgt=${tgtId.slice(-6)}${targetIsEnemy ? `[idx=${tgtIdx}]` : ''}@(${target.x},${target.y}) ` +
      `mode=${mode} homing=${proj.isHoming} reflected=${proj.reflected ?? false} ` +
      `hp=${target.currentHealth} pendingVisDmg=${target.pendingVisualDamage ?? 0} pendingDeath=${target.pendingProjectileDeath ?? false}`
    );
  }

  // 1. Reflect check
  if (hasReflect(target) && !proj.reflected && canReflectDirection(target, proj.direction)) {
    if (isHomingDebug()) console.log(`[APPLY-HIT ${proj.id.slice(-6)}] → REFLECT branch`);
    reflectProjectile(proj, target, gameState, Date.now());
    return { reflected: true };
  }

  // 2. AOE explosion
  if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
    if (isHomingDebug()) console.log(`[APPLY-HIT ${proj.id.slice(-6)}] → AOE branch`);
    triggerAOEExplosion(target.x, target.y, proj.attackData,
      proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
    return { reflected: false };
  }

  // 3. Redirect
  if (proj.attackData.isRedirect) {
    if (isHomingDebug()) console.log(`[APPLY-HIT ${proj.id.slice(-6)}] → REDIRECT branch (no damage, no pendingVisualDamage capture)`);
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

  const hpBeforeDeflect = target.currentHealth;
  const wasDeflected = applyProjectileDamageWithDeflect(
    target, damage, proj.sourceCharacterId, proj.sourceEnemyId, gameState);
  if (isHomingDebug()) {
    console.log(
      `[APPLY-HIT ${proj.id.slice(-6)}] → DAMAGE branch tgt=${tgtId.slice(-6)} ` +
      `baseDmg=${baseDmg} isCrit=${isCrit} finalDmg=${damage} ` +
      `hpBeforeDeflect=${hpBeforeDeflect} hpAfterDeflect=${target.currentHealth} wasDeflected=${wasDeflected}`
    );
  }

  let deferredDeathEntityId: string | undefined;
  let deferredDeathIsEnemy: boolean | undefined;
  let deferredDeathIndex: number | undefined;

  if (!wasDeflected) {
    // 5. Death handling — mode-specific
    if (mode === 'visual') {
      const priorPending = target.pendingVisualDamage ?? 0;
      target.pendingVisualDamage = priorPending + damage;
      if (isHomingDebug()) {
        console.log(
          `[VDMG-CAPTURE ${proj.id.slice(-6)}] tgt=${tgtId.slice(-6)} ` +
          `pendingVisDmg=${priorPending}→${target.pendingVisualDamage} (hp ${target.currentHealth}→${target.currentHealth - damage}, bar stays at ${target.currentHealth + priorPending})`
        );
      }
    }
    applyDamageToEntityNoDeflect(target, damage, gameState);
    if (target.dead) {
      if (mode === 'visual') {
        target.dead = false;
        target.pendingProjectileDeath = true;
        // Bump diedOnTurn to the visual-death turn (one turn later, when
        // the projectile visual arrives). applyDamageToEntityNoDeflect
        // stamped `currentTurn` for the immediate-death case; override
        // now that we know this is deferred.
        target.diedOnTurn = gameState.currentTurn + 1;
        if (isHomingDebug()) {
          const id = targetIsEnemy ? (target as PlacedEnemy).enemyId : (target as PlacedCharacter).characterId;
          console.log(`[DEATH-MUT ${targetIsEnemy ? 'enemy' : 'char'}] id=${id.slice(-6)}@(${target.x},${target.y}) → pendingDeath (from applyEntityHit, proj=${proj.id.slice(-6)} dmg=${damage})`);
        }
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

  return { reflected: false, vfxSprite, deferredDeathEntityId, deferredDeathIsEnemy, deferredDeathIndex, damageApplied: wasDeflected ? 0 : damage };
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
  | { kind: 'reflect'; x: number; y: number; dist: number; target: PlacedCharacter | PlacedEnemy; targetIsEnemy: boolean }
  /**
   * Wall bounce (restored 2026-04-20, previously dropped in the March
   * deterministic refactor). `atX/Y` is the pre-wall tile the bolt is
   * bouncing FROM (last valid traversed tile). `wallX/Y` is the wall that
   * was blocked — the bolt does NOT enter this tile. `newDirection` is the
   * post-bounce direction. The walker has already mutated
   * `proj.direction` / `proj.startX/Y` / `proj.logicalTileIndex = 0` /
   * `proj.bounceCount++` before emitting this step; callers just need
   * to record / visualize it.
   */
  | { kind: 'bounce'; atX: number; atY: number; wallX: number; wallY: number; newDirection: Direction };

interface NonHomingWalkResult {
  steps: NonHomingStep[];
  hitSomething: boolean;
  endedAtWall: boolean;
  endedAtBounds: boolean;
  endedAtReflect: boolean;
  endedAtPierceStop: boolean;
  bounced: boolean;
  /** Final logical position after the walk (last traversed tile). */
  endX: number;
  endY: number;
  /**
   * Final `proj.logicalTileIndex` value — tiles traveled in the current
   * (post-last-bounce) segment. Callers write this to proj.logicalTileIndex
   * to continue tracking range budget into the next turn.
   */
  endDist: number;
}

/**
 * Compute the post-bounce direction + offset for a projectile that has hit a
 * wall. Returns null when the bounce would be a no-op (same direction).
 *
 * For 'reflect' on diagonal moves, determines which axis is blocked by
 * probing the two neighboring tiles — if the horizontal neighbor is a wall,
 * flip dx; if vertical, flip dy. Matches the original pre-refactor
 * implementation (commit `8b049df`).
 */
function computeBounceDirection(
  proj: Projectile,
  dx: number,
  dy: number,
  preX: number,
  preY: number,
  wallX: number,
  wallY: number,
  gameState: GameState,
): { direction: Direction; dx: number; dy: number } | null {
  const behavior = proj.bounceBehavior || 'reflect';
  const turnDegrees = proj.bounceTurnDegrees ?? 90;

  let newDx = dx;
  let newDy = dy;

  switch (behavior) {
    case 'reflect': {
      if (dx !== 0 && dy !== 0) {
        // Diagonal — probe neighbors to see which axis is blocked.
        const horizontalBlocked = isTileBlocked(preX + dx, preY, gameState);
        const verticalBlocked = isTileBlocked(preX, preY + dy, gameState);
        if (horizontalBlocked && !verticalBlocked) newDx = -dx;
        else if (verticalBlocked && !horizontalBlocked) newDy = -dy;
        else { newDx = -dx; newDy = -dy; }
      } else if (dx !== 0) {
        newDx = -dx;
      } else {
        newDy = -dy;
      }
      break;
    }
    case 'turn_around': {
      newDx = -dx;
      newDy = -dy;
      break;
    }
    case 'turn_right': {
      const newDir = turnRight(proj.direction, turnDegrees);
      const off = getDirectionOffset(newDir);
      newDx = off.dx;
      newDy = off.dy;
      break;
    }
    case 'turn_left': {
      const newDir = turnLeft(proj.direction, turnDegrees);
      const off = getDirectionOffset(newDir);
      newDx = off.dx;
      newDy = off.dy;
      break;
    }
  }

  // No-op bounces (same direction) would infinite-loop the walker; reject.
  if (newDx === dx && newDy === dy) return null;

  // Translate offset back to Direction enum via calculateDirectionTo from origin.
  const newDirection = calculateDirectionTo(0, 0, newDx, newDy);
  // Suppress unused-var lint for wallX/wallY — they're part of the API signature
  // so future bounce behaviors can use them; current ones only need pre-wall pos.
  void wallX; void wallY;
  return { direction: newDirection, dx: newDx, dy: newDy };
}

function walkNonHomingTick(
  proj: Projectile,
  gameState: GameState,
  mode: HitMode,
  tilesPerTurn: number,
  range: number,
): NonHomingWalkResult {
  let { dx, dy } = getDirectionOffset(proj.direction);
  const canPierce = proj.attackData.projectilePierces === true;
  const isHealingProjectile = proj.attackData.healing !== undefined;
  const maxBouncesAllowed = proj.maxBounces ?? 3;

  if (!proj.hitEntityIds) proj.hitEntityIds = [];

  const steps: NonHomingStep[] = [];
  let hitSomething = false;
  let endedAtWall = false;
  let endedAtBounds = false;
  let endedAtReflect = false;
  let endedAtPierceStop = false;
  let bounced = false;

  // `segDist` is the tile index within the current segment (relative to
  // proj.startX/Y). On bounce, proj.startX/Y is rewritten to the pre-wall
  // tile and segDist resets to 1. `tilesUsedThisTurn` is the turn budget
  // that persists across bounces (a bouncing bolt still only travels
  // tilesPerTurn tiles total per turn).
  let segDist = (proj.logicalTileIndex ?? 0) + 1;
  let tilesUsedThisTurn = 0;

  // Track final end position so the caller can update proj.logicalX/Y and
  // logicalTileIndex without needing to inspect turnTiles or assume a
  // straight-line trajectory.
  let endX = Math.floor(proj.startX + dx * (proj.logicalTileIndex ?? 0));
  let endY = Math.floor(proj.startY + dy * (proj.logicalTileIndex ?? 0));
  let endDist = proj.logicalTileIndex ?? 0;

  while (tilesUsedThisTurn < tilesPerTurn && segDist <= range) {
    if (hitSomething && !canPierce) {
      endedAtPierceStop = true;
      break;
    }

    const checkX = Math.floor(proj.startX + dx * segDist);
    const checkY = Math.floor(proj.startY + dy * segDist);

    if (!isInBounds(checkX, checkY, gameState.puzzle.width, gameState.puzzle.height)) {
      endedAtBounds = true;
      steps.push({ kind: 'bounds_exit', dist: segDist });
      break;
    }

    const tile = gameState.puzzle.tiles[checkY]?.[checkX];
    if (!tile || tile.type === TileTypeEnum.WALL) {
      // Wall hit. If bounce is configured and we haven't exhausted the
      // bounce budget, redirect and continue walking from the pre-wall tile.
      const canBounce = !!proj.bounceOffWalls && (proj.bounceCount ?? 0) < maxBouncesAllowed;
      if (canBounce) {
        const preX = Math.floor(proj.startX + dx * (segDist - 1));
        const preY = Math.floor(proj.startY + dy * (segDist - 1));
        const newDir = computeBounceDirection(proj, dx, dy, preX, preY, checkX, checkY, gameState);
        if (newDir !== null) {
          steps.push({
            kind: 'bounce',
            atX: preX, atY: preY,
            wallX: checkX, wallY: checkY,
            newDirection: newDir.direction,
          });
          proj.bounceCount = (proj.bounceCount ?? 0) + 1;
          proj.direction = newDir.direction;
          proj.startX = preX;
          proj.startY = preY;
          proj.logicalTileIndex = 0;
          dx = newDir.dx;
          dy = newDir.dy;
          segDist = 1;
          bounced = true;
          // tilesUsedThisTurn persists — bounces don't refund the turn budget.
          continue;
        }
        // computeBounceDirection returned null (unsupported behavior) —
        // fall through to regular wall hit.
      }
      if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
        triggerAOEExplosion(checkX, checkY, proj.attackData,
          proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
      }
      endedAtWall = true;
      steps.push({ kind: 'wall', x: checkX, y: checkY, dist: segDist });
      break;
    }

    steps.push({ kind: 'travel', x: checkX, y: checkY, dist: segDist });
    endX = checkX;
    endY = checkY;
    endDist = segDist;
    tilesUsedThisTurn++;

    // THROW_PLACE projectiles pass through entities — no collision checks this tile.
    if (proj.throwPlaceConfig) { segDist++; continue; }

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
            kind: 'healing_hit', x: checkX, y: checkY, dist: segDist,
            target: hitAlly, targetIsEnemy: false, vfxSprite, pierceStop: !canPierce,
          });
        }
      } else {
        const hitEnemy = findEntityAtTile(checkX, checkY, gameState, proj, true, true) as PlacedEnemy | null;
        if (hitEnemy) {
          const entityHitResult = applyEntityHit(hitEnemy, true, proj, gameState, mode);
          if (entityHitResult.reflected) {
            endedAtReflect = true;
            steps.push({ kind: 'reflect', x: checkX, y: checkY, dist: segDist, target: hitEnemy, targetIsEnemy: true });
            break;
          }
          recordEnemyHit(proj, hitEnemy, gameState.puzzle.enemies);
          hitSomething = true;
          steps.push({
            kind: 'hostile_hit', x: checkX, y: checkY, dist: segDist,
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
            kind: 'healing_hit', x: checkX, y: checkY, dist: segDist,
            target: hitAllyEnemy, targetIsEnemy: true, vfxSprite, pierceStop: !canPierce,
          });
        }
      } else {
        const hitChar = findEntityAtTile(checkX, checkY, gameState, proj, false, true) as PlacedCharacter | null;
        if (hitChar) {
          const entityHitResult = applyEntityHit(hitChar, false, proj, gameState, mode);
          if (entityHitResult.reflected) {
            endedAtReflect = true;
            steps.push({ kind: 'reflect', x: checkX, y: checkY, dist: segDist, target: hitChar, targetIsEnemy: false });
            break;
          }
          proj.hitEntityIds.push(hitChar.characterId);
          hitSomething = true;
          steps.push({
            kind: 'hostile_hit', x: checkX, y: checkY, dist: segDist,
            target: hitChar, targetIsEnemy: false, hitResult: entityHitResult, pierceStop: !canPierce,
          });
        }
      }
    }

    segDist++;
  }

  return { steps, hitSomething, endedAtWall, endedAtBounds, endedAtReflect, endedAtPierceStop, bounced, endX, endY, endDist };
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
    if (step.type === 'travel') {
      reflectedTiles.push({ x: step.x, y: step.y });
    } else if (step.type === 'wall') {
      reflectedTiles.push({ x: step.x, y: step.y });
      // Replay end event for a reflected bolt stopped at a wall.
      recordProjectileEvent(gameState, {
        type: 'wall_hit', projId: proj.id, x: step.x, y: step.y,
      });
    } else if (step.type === 'hit') {
      // Reflected piercing bolts hit multiple targets; `proj.hitResult` can
      // only point at one (the bolt's final landing). Any earlier hit this
      // walk already set becomes a pierce pass-through — stage its
      // decrement (with its hitTileIndex) before we overwrite hitResult.
      if (proj.hitResult?.deferredDeathEntityId && (proj.hitResult.damage ?? 0) > 0) {
        if (!proj.pendingVisualDecrements) proj.pendingVisualDecrements = [];
        proj.pendingVisualDecrements.push({
          targetEntityId: proj.hitResult.deferredDeathEntityId,
          targetIsEnemy: proj.hitResult.deferredDeathIsEnemy ?? false,
          targetIndex: proj.hitResult.deferredDeathIndex,
          damage: proj.hitResult.damage,
          hitTileIndex: proj.hitResult.hitTileIndex,
        });
      }
      const combinedSoFar = [...approachTiles, ...reflectedTiles];
      proj.hitResult = {
        hitTileIndex: combinedSoFar.length - 1,
        deactivate: true,
        vfxSprite: proj.attackData.hitEffectSprite,
        vfxX: step.target.x, vfxY: step.target.y,
        deferredDeathEntityId: step.hitResult.deferredDeathEntityId,
        deferredDeathIsEnemy: step.hitResult.deferredDeathIsEnemy,
        deferredDeathIndex: step.hitResult.deferredDeathIndex,
        damage: step.hitResult.damageApplied ?? 0,
      };
      // Replay hit event — parity with non-homing hostile_hit. deferredDeath
      // fields carry through so replay can commit the pendingDeath → dead
      // transition on visual arrival.
      recordProjectileEvent(gameState, {
        type: 'hit',
        projId: proj.id,
        x: step.target.x, y: step.target.y,
        targetEntityId: step.targetIsEnemy
          ? (step.target as PlacedEnemy).enemyId
          : (step.target as PlacedCharacter).characterId,
        targetIsEnemy: step.targetIsEnemy,
        hitTileIndex: combinedSoFar.length - 1,
        hitVfxSprite: proj.attackData.hitEffectSprite,
        damage: step.hitResult.damageApplied ?? 0,
        deferredDeathEntityId: step.hitResult.deferredDeathEntityId,
        deferredDeathIsEnemy: step.hitResult.deferredDeathIsEnemy,
        deferredDeathIndex: step.hitResult.deferredDeathIndex,
      });
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
  // REPLAY-DIFF log: fires once per recorded event with a compact single-
  // line summary. The same projId+turn+type+pos should appear in replay's
  // reconstruction — if it doesn't, that's where real and replay diverge.
  if (isHomingDebug()) {
    const pathStr = event.tilePath ? event.tilePath.map(t => `(${t.x},${t.y})`).join('→') : '';
    const extra = [
      event.isHoming !== undefined ? `homing=${event.isHoming}` : '',
      event.homingPathStyle ? `style=${event.homingPathStyle}` : '',
      event.speed !== undefined ? `speed=${event.speed}` : '',
      pathStr ? `tilePath=${pathStr}` : '',
      event.hitTileIndex !== undefined ? `hitTileIdx=${event.hitTileIndex}` : '',
    ].filter(Boolean).join(' ');
    console.log(
      `[RDIFF REAL] turn=${gameState.currentTurn} proj=${event.projId.slice(-6)} ` +
      `type=${event.type} pos=(${event.x.toFixed(2)},${event.y.toFixed(2)})` +
      (extra ? ` ${extra}` : '')
    );
  }
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
  proj.logicalX = proj.startX + dx * walk.lastDist;
  proj.logicalY = proj.startY + dy * walk.lastDist;
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

    // Record spawn event on first encounter. Mirrors the same block in
    // updateProjectilesHeadless so the real-play replay has the spawn events
    // buildReplayProjectiles needs to create a lifetime per projectile.
    // Placed BEFORE the hitResult skip so a bolt that range-gates immediately
    // still gets its spawn recorded (followed by the deactivate at the gate).
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
        // Prefer the array-index lookup when available so duplicate enemyIds
        // resolve to the specific instance findNearestEnemies actually picked.
        // Without this, .find(enemyId) returns the first placement-order match
        // regardless of which instance is closest.
        let resolveMode: 'reflected-src' | 'index' | 'find-fallback' | 'none' = targetEntity ? 'reflected-src' : 'none';
        if (!targetEntity && proj.targetEnemyIndex !== undefined) {
          const enemy = gameState.puzzle.enemies[proj.targetEnemyIndex];
          if (enemy && enemy.enemyId === proj.targetEntityId && !enemy.dead && !enemy.pendingProjectileDeath) {
            targetEntity = enemy;
            resolveMode = 'index';
          }
        }
        if (!targetEntity) {
          targetEntity = gameState.puzzle.enemies.find(e => e.enemyId === proj.targetEntityId && !e.dead && !e.pendingProjectileDeath);
          if (targetEntity) resolveMode = 'find-fallback';
        }
        if (isHomingDebug() && proj.isHoming) {
          const foundIdx = targetEntity ? gameState.puzzle.enemies.indexOf(targetEntity as PlacedEnemy) : -1;
          console.log(
            `[HOMING-TARGET ${proj.id.slice(-6)}] turn=${gameState.currentTurn} resolve=${resolveMode} ` +
            `targetEntityId=${proj.targetEntityId} targetEnemyIndex=${proj.targetEnemyIndex} ` +
            `found=enemies[${foundIdx}]${targetEntity ? `@(${(targetEntity as any).x},${(targetEntity as any).y}) enemyId=${(targetEntity as PlacedEnemy).enemyId}` : 'NONE'}`
          );
        }
      } else {
        targetEntity = gameState.placedCharacters.find(c => c.characterId === proj.targetEntityId && !c.dead && !c.pendingProjectileDeath);
      }

      if (targetEntity) {
        const dx = targetEntity.x - proj.logicalX;
        const dy = targetEntity.y - proj.logicalY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Range check — homing projectiles should respect their range.
        // Use cumulative path length (proj.pathTraveled), not Euclidean
        // displacement from spawn. A bolt chasing a moving target curves,
        // and the straight-line distance from spawn can *decrease* as the
        // bolt curves around — which would reset the range budget. Each
        // turn's MOVE TOWARD / REACHED TARGET below adds its segment length
        // to proj.pathTraveled so the counter is monotonic.
        const totalDistanceTraveled = proj.pathTraveled ?? 0;
        const remainingRange = Math.max(0, range - totalDistanceTraveled);
        if (isHomingDebug()) {
          console.log(
            `[HOMING-RESOLVE ${proj.id.slice(-6)}] style=${proj.homingPathStyle} turn=${gameState.currentTurn} ` +
            `distToTarget=${distance.toFixed(2)} range=${range} ` +
            `traveled=${totalDistanceTraveled.toFixed(2)} remaining=${remainingRange.toFixed(2)} ` +
            `tilesPerTurn=${tilesPerTurn} ` +
            `logical=(${proj.logicalX.toFixed(2)},${proj.logicalY.toFixed(2)}) ` +
            `target=(${targetEntity.x.toFixed(2)},${targetEntity.y.toFixed(2)}) ` +
            `visStart=(${proj.homingVisualStartX?.toFixed(2)},${proj.homingVisualStartY?.toFixed(2)})`
          );
        }
        // Threshold 0.5 (not 0) to catch the "infinite crawl" case: when a
        // bolt chases a moving target whose path bends, the Euclidean
        // traveled distance grows asymptotically slowly as the bolt closes
        // in, leaving tiny fractions of remainingRange. clampedMove rounds
        // to the same tile each turn and the visual freezes forever. Treat
        // sub-half-tile range as exhausted.
        // Pathfinding moves in whole-tile BFS steps and can't advance
        // fractionally — if we can't afford a full tile's worth of movement,
        // treat as out of range. Otherwise the bolt stalls: it fails the
        // < 0.5 gate (remainingRange ~0.5-1.0), takes MOVE TOWARD, but
        // Math.floor(remainingRange) = 0 produces a 1-tile tilePath containing
        // only the start position, so logical never advances and hitResult is
        // never set. Bolt lingers indefinitely at max-reach tile.
        const pathfindingCantAdvance = proj.homingPathStyle === 'pathfinding' && remainingRange < 1;
        if (remainingRange < 0.5 || pathfindingCantAdvance) {
          // Out of range — fizzle. To avoid a visual stutter (bolt visibly
          // snapping backward/forward over the fizzle animation), freeze the
          // bolt at its CURRENT visual position and consume immediately.
          //
          // Previously OUT OF RANGE built a tile-based tilePath and let the
          // animation play over ~0.8-0.9s, which caused:
          //   1. A backward snap on first frame (from straight-line interp
          //      position to tile-based interp position at the same elapsed).
          //   2. A forward trip to the final tile.
          //   3. Consume/deactivate.
          //
          // New behavior: compute current straight-line visual position, set
          // logical/homingVisualStart/target all to that point, set a trivial
          // 1-tile tilePath with hitTileIndex=0 so consume fires on the very
          // next frame. Bolt disappears cleanly from its last visual position.
          let freezeX = proj.logicalX;
          let freezeY = proj.logicalY;
          if (proj.homingPathStyle === 'straight' && proj.homingVisualStartX !== undefined) {
            const visPos = currentStraightLineHomingVisualPos(proj, Date.now());
            freezeX = visPos.x;
            freezeY = visPos.y;
          }
          proj.logicalX = freezeX;
          proj.logicalY = freezeY;
          proj.homingVisualStartX = freezeX;
          proj.homingVisualStartY = freezeY;
          proj.homingVisualStartTime = Date.now();
          proj.targetX = freezeX;
          proj.targetY = freezeY;
          proj.tilePath = [{ x: Math.round(freezeX), y: Math.round(freezeY) }];
          proj.currentTileIndex = 0;
          proj.tileEntryTime = Date.now();
          proj.hitResult = { hitTileIndex: 0, deactivate: true, damage: 0 };
          maybeMarkLingerDespawn(proj, 0, Date.now());
          // Replay needs an end event for this lifetime. OUT OF RANGE is a
          // deactivate (no hit, no wall) — matches headless' range-gate emission.
          // targetX/Y = the frozen position so replay's interp sits there
          // instead of aiming at a tile center (fixes one-frame snap glitch).
          recordProjectileEvent(gameState, {
            type: 'deactivate',
            projId: proj.id,
            x: freezeX, y: freezeY,
            targetX: freezeX, targetY: freezeY,
          });
          if (isHomingDebug()) {
            console.log(
              `[HOMING-RESOLVE ${proj.id.slice(-6)}] → OUT OF RANGE style=${proj.homingPathStyle} ` +
              `frozen at (${freezeX.toFixed(2)},${freezeY.toFixed(2)}) speed=${proj.speed} ` +
              `(immediate consume, no fizzle animation)`
            );
          }
          continue;
        }

        // Wall check for homing projectiles that don't ignore walls.
        // Pathfinding mode inherently routes around walls via BFS, so skip
        // the straight-line wall block here — otherwise the pathfinder never
        // gets a chance to run.
        if (!proj.homingIgnoreWalls && proj.homingPathStyle !== 'pathfinding') {
          const pathTiles = getTilesAlongLine(proj.logicalX, proj.logicalY, targetEntity.x, targetEntity.y);
          let wallBlocked = false;
          for (const tile of pathTiles) {
            if (tile.x === Math.floor(proj.logicalX) && tile.y === Math.floor(proj.logicalY)) continue;
            if (isTileBlocked(tile.x, tile.y, gameState)) {
              const wallPath = getTilesAlongLine(proj.homingVisualStartX ?? proj.logicalX, proj.homingVisualStartY ?? proj.logicalY, tile.x, tile.y);
              if (wallPath.length > 1) wallPath.pop();
              proj.tilePath = wallPath;
              proj.currentTileIndex = 0;
              proj.tileEntryTime = proj.homingVisualStartTime ?? Date.now();
              proj.hitResult = { hitTileIndex: wallPath.length - 1, deactivate: true };
              maybeMarkLingerDespawn(proj, wallPath.length - 1, Date.now());
              // Replay end event — homing bolt stopped at a wall.
              recordProjectileEvent(gameState, {
                type: 'wall_hit',
                projId: proj.id,
                x: tile.x, y: tile.y,
              });
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

        // Pathfinding can reach the target within this turn's tile budget even
        // when Euclidean `distance > effectiveReach` — the BFS path wraps
        // around walls but may still be short enough in step count to arrive.
        // Without this check, MOVE TOWARD would move logical to the target
        // tile without registering the hit; next turn's REACHED TARGET fires
        // with a degenerate 1-tile tilePath and the player sees the bolt
        // "touch" the enemy with no effect, then a delayed "pop" hit VFX.
        let pathfindingReachesThisTurn = false;
        if (proj.homingPathStyle === 'pathfinding') {
          const psx = Math.round(proj.logicalX);
          const psy = Math.round(proj.logicalY);
          const bfsPath = findPathBFS(psx, psy, targetEntity.x, targetEntity.y, gameState);
          const tileBudget = Math.min(tilesPerTurn, Math.floor(remainingRange));
          pathfindingReachesThisTurn = bfsPath.length > 0 && bfsPath.length - 1 <= tileBudget;
        }

        if (distance <= effectiveReach || pathfindingReachesThisTurn) {
          // Reached target — determine if hostile or healing
          const hitX = targetEntity.x;
          const hitY = targetEntity.y;
          let vfxSprite: any;
          let deferredDeathEntityId: string | undefined;
          let deferredDeathIsEnemy: boolean | undefined;
          let deferredDeathIndex: number | undefined;
          let damageForHit = 0;

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
            // and overwrites proj.logicalX/logicalY and clears homingVisualStartX)
            const preReflectStartX = proj.homingVisualStartX ?? proj.logicalX;
            const preReflectStartY = proj.homingVisualStartY ?? proj.logicalY;
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
                    damage: step.hitResult.damageApplied ?? 0,
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

              // Replay reflect event — must be emitted AFTER combinedPath +
              // reflectAtTileIndex are finalized since buildReplayProjectiles
              // consumes both to position the bolt's tint swap correctly.
              recordProjectileEvent(gameState, {
                type: 'reflect',
                projId: proj.id,
                x: hitX, y: hitY,
                reflected: true,
                reflectTintColor: proj.reflectTintColor,
                reflectOverrideSprite: proj.reflectOverrideSprite,
                reflectAtTileIndex: proj.reflectAtTileIndex,
                combinedPath: [...combinedPath],
              });

              if (!reflectedHit) {
                proj.hitResult = {
                  hitTileIndex: combinedPath.length - 1,
                  deactivate: true,
                };
                maybeMarkLingerDespawn(proj, combinedPath.length - 1, Date.now());
                // No hit on return leg — the reflected bolt fizzled. Emit a
                // deactivate as the end event so the replay lifetime closes.
                recordProjectileEvent(gameState, {
                  type: 'deactivate',
                  projId: proj.id,
                  x: combinedPath[combinedPath.length - 1]?.x ?? hitX,
                  y: combinedPath[combinedPath.length - 1]?.y ?? hitY,
                });
              } else {
                // Reflected bolt hit a target. Emit the hit event now so the
                // lifetime's end turn is set (and buildReplayProjectiles can
                // pick up the hit VFX). The inner hit-step above already set
                // proj.hitResult; mirror those fields into the event.
                recordProjectileEvent(gameState, {
                  type: 'hit',
                  projId: proj.id,
                  x: proj.hitResult?.vfxX ?? hitX,
                  y: proj.hitResult?.vfxY ?? hitY,
                  hitTileIndex: proj.hitResult?.hitTileIndex ?? (combinedPath.length - 1),
                  hitVfxSprite: proj.hitResult?.vfxSprite,
                  damage: proj.hitResult?.damage ?? 0,
                });
              }

              if (combinedPath.length > 0) {
                proj.logicalX = combinedPath[combinedPath.length - 1].x;
                proj.logicalY = combinedPath[combinedPath.length - 1].y;
              }
              continue;
            }
            vfxSprite = hitResult.vfxSprite;
            deferredDeathEntityId = hitResult.deferredDeathEntityId;
            deferredDeathIsEnemy = hitResult.deferredDeathIsEnemy;
            deferredDeathIndex = hitResult.deferredDeathIndex;
            damageForHit = hitResult.damageApplied ?? 0;
          } else {
            // Friendly homing heal/buff
            const targetIsEnemy = !!(proj.sourceEnemyId && proj.targetIsEnemy);
            vfxSprite = applyHealingHit(
              targetEntity as (PlacedCharacter | PlacedEnemy), targetIsEnemy,
              proj, gameState, true);
          }

          // Build tile path for visual. For non-straight homing, round the
          // logical position when picking the start tile so the new tilePath
          // begins at the same tile where the previous turn's tilePath ended
          // (getTilesAlongLine rounds the END tile but floors the START tile;
          // without matching on round, the bolt jumps back one tile whenever
          // fractional logical has a >=0.5 component).
          const vStartX = proj.homingPathStyle === 'straight'
            ? (proj.homingVisualStartX ?? proj.logicalX)
            : Math.round(proj.logicalX);
          const vStartY = proj.homingPathStyle === 'straight'
            ? (proj.homingVisualStartY ?? proj.logicalY)
            : Math.round(proj.logicalY);
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
            damage: damageForHit,
          };
          // Replay end event — homing bolt reached target. Emitted even for
          // heal hits so the lifetime has an end turn. Carry deferredDeath
          // fields so replay's hitResult can drive the pendingDeath → dead
          // commit on visual arrival (otherwise the last kill's enemy stays
          // pendingDeath forever in replay).
          recordProjectileEvent(gameState, {
            type: 'hit',
            projId: proj.id,
            x: hitX, y: hitY,
            targetEntityId: proj.targetEntityId,
            targetIsEnemy: !!proj.targetIsEnemy,
            hitTileIndex: turnTiles.length - 1,
            hitVfxSprite: vfxSprite,
            damage: damageForHit,
            targetX: hitX, targetY: hitY,
            deferredDeathEntityId,
            deferredDeathIsEnemy,
            deferredDeathIndex,
          });
          // Accumulate cumulative path length for the range gate (see
          // pathTraveled field doc on Projectile). Segment = distance from
          // pre-move logical to hit point.
          const reachSegment = Math.sqrt(
            Math.pow(turnTiles[turnTiles.length - 1].x - proj.logicalX, 2) +
            Math.pow(turnTiles[turnTiles.length - 1].y - proj.logicalY, 2)
          );
          proj.pathTraveled = (proj.pathTraveled ?? 0) + reachSegment;
          proj.logicalX = turnTiles[turnTiles.length - 1].x;
          proj.logicalY = turnTiles[turnTiles.length - 1].y;
          // Record per-turn homing position for replay reconstruction.
          // targetX/Y = the hit point, so replay's straight-line interp
          // aims at the same spot the engine did (fractional-accurate).
          recordProjectileEvent(gameState, {
            type: 'homing_move',
            projId: proj.id,
            x: proj.logicalX, y: proj.logicalY,
            targetX: hitX, targetY: hitY,
          });
          // Update targetX/Y to the current hit point. If the target moved
          // since spawn, updateStraightLineHomingVisual needs to interpolate
          // toward the CURRENT position, not the stale spawn-time position —
          // otherwise the bolt visually flies to where the entity was on the
          // previous turn, even though the hit registers at its current tile.
          //
          // If the target actually changed, also re-anchor visStart to the
          // current visual position. Otherwise, keeping the old visStart with
          // a new target changes the interpolation line and the bolt snaps to
          // a different position at the same elapsed time. Anchoring to the
          // current visual position keeps the bolt where it is and lets it
          // continue smoothly toward the new target.
          const prevTargetX = proj.targetX;
          const prevTargetY = proj.targetY;
          const tgtChanged = prevTargetX !== hitX || prevTargetY !== hitY;
          if (tgtChanged && proj.homingPathStyle === 'straight' && proj.homingVisualStartX !== undefined) {
            const visPos = currentStraightLineHomingVisualPos(proj, Date.now());
            proj.homingVisualStartX = visPos.x;
            proj.homingVisualStartY = visPos.y;
            proj.homingVisualStartTime = Date.now();
          }
          proj.targetX = hitX;
          proj.targetY = hitY;
          if (isHomingDebug() && proj.isHoming) {
            const tgtChanged = prevTargetX !== hitX || prevTargetY !== hitY;
            const pathStr = turnTiles.map(t => `(${t.x},${t.y})`).join('→');
            console.log(
              `[HOMING-RESOLVE ${proj.id.slice(-6)}] → REACHED TARGET style=${proj.homingPathStyle} hitTile=${turnTiles.length - 1}, ` +
              `tilePath=${pathStr}, logical→(${proj.logicalX},${proj.logicalY}), ` +
              `visStart=(${proj.homingVisualStartX?.toFixed(2)},${proj.homingVisualStartY?.toFixed(2)}), ` +
              `target ${tgtChanged ? `${prevTargetX.toFixed(2)},${prevTargetY.toFixed(2)}→${hitX.toFixed(2)},${hitY.toFixed(2)}` : `unchanged=(${hitX.toFixed(2)},${hitY.toFixed(2)})`}`
            );
          }
        } else {
          // Move toward target but don't reach it yet
          let turnTiles: Array<{x: number; y: number}>;
          let newX: number;
          let newY: number;

          // Round the logical start when building the path so the new
          // tilePath begins at the same tile where the previous turn's
          // visual ended. See the REACHED TARGET branch for full reasoning.
          const pathStartX = Math.round(proj.logicalX);
          const pathStartY = Math.round(proj.logicalY);
          if (proj.homingPathStyle === 'pathfinding') {
            const clampedTiles = Math.min(tilesPerTurn, Math.floor(remainingRange));
            const fullPath = findPathBFS(pathStartX, pathStartY, targetEntity.x, targetEntity.y, gameState);
            turnTiles = fullPath.slice(0, clampedTiles + 1);
            const lastTile = turnTiles[turnTiles.length - 1];
            newX = lastTile.x;
            newY = lastTile.y;
            if (isHomingDebug()) {
              const pathStr = fullPath.map(t => `(${t.x},${t.y})`).join('→');
              console.log(
                `[PATHFIND-HOMING ${proj.id.slice(-6)}] turn=${gameState.currentTurn} ` +
                `from=(${pathStartX},${pathStartY}) to=(${targetEntity.x},${targetEntity.y}) ` +
                `fullPath=${pathStr} clampedTiles=${clampedTiles} turnEnd=(${newX},${newY})`
              );
            }
          } else {
            const clampedMove = Math.min(tilesPerTurn, remainingRange);
            const moveRatio = clampedMove / distance;
            newX = proj.logicalX + dx * moveRatio;
            newY = proj.logicalY + dy * moveRatio;
            turnTiles = getTilesAlongLine(pathStartX, pathStartY, newX, newY);
          }

          if (proj.homingHitAlongPath && (proj.homingPathStyle === 'grid' || proj.homingPathStyle === 'pathfinding')) {
            checkHomingPathForHits(proj, turnTiles, gameState);
          }

          proj.tilePath = turnTiles;
          proj.currentTileIndex = 0;
          proj.tileEntryTime = Date.now();
          // Accumulate cumulative path length for the range gate (see
          // pathTraveled field doc on Projectile). Segment = distance from
          // pre-move logical to post-move logical.
          const moveSegment = Math.sqrt(
            Math.pow(newX - proj.logicalX, 2) +
            Math.pow(newY - proj.logicalY, 2)
          );
          proj.pathTraveled = (proj.pathTraveled ?? 0) + moveSegment;
          proj.logicalX = newX;
          proj.logicalY = newY;
          // Record per-turn homing position so replay can reconstruct the
          // actual turn-by-turn path (pathfinding routes around walls, grid
          // steps, etc.) rather than a straight-line reconstruction. Spawn
          // event's tilePath only captures the FIRST turn's segment.
          // targetX/Y = where the engine's interp was aiming (fractional).
          recordProjectileEvent(gameState, {
            type: 'homing_move',
            projId: proj.id,
            x: newX, y: newY,
            targetX: targetEntity.x, targetY: targetEntity.y,
          });
          // Re-anchor the visual each turn so slow projectiles (speed 1-2)
          // don't interpolate from the stale original spawn point forever.
          // SKIP on the spawn turn: resolveProjectiles runs in the same
          // executeTurn as spawnProjectile with no frames in between, so
          // re-anchoring there would overwrite visStart=caster before any
          // spawn-turn visual motion could render.
          //
          // Anchor to the CURRENT VISUAL POSITION, not newLogical. For a
          // stationary target they're the same, but for a moving target the
          // visual was tracking toward the OLD target while logical advanced
          // toward the NEW target — anchoring to newLogical would snap the
          // bolt. Anchoring to current visual keeps continuity.
          //
          // CRITICAL ORDER: compute the visual position BEFORE mutating
          // targetX/Y. The helper uses proj.targetX/Y to reconstruct the
          // current interpolation — if we've already written the new target,
          // the helper computes the position for the NEW trajectory, not
          // where the bolt actually is, and the re-anchor misses by a lot.
          const isSpawnTurn = proj.spawnTurn === gameState.currentTurn;
          let reanchorTo: { x: number; y: number } | undefined;
          if (proj.homingPathStyle === 'straight' && !isSpawnTurn) {
            reanchorTo = currentStraightLineHomingVisualPos(proj, Date.now());
            proj.homingVisualStartX = reanchorTo.x;
            proj.homingVisualStartY = reanchorTo.y;
            proj.homingVisualStartTime = Date.now();
          }
          proj.targetX = targetEntity.x;
          proj.targetY = targetEntity.y;
          if (isHomingDebug() && proj.isHoming) {
            const pathStr = turnTiles.map(t => `(${t.x},${t.y})`).join('→');
            console.log(
              `[HOMING-RESOLVE ${proj.id.slice(-6)}] → MOVE TOWARD style=${proj.homingPathStyle} newLogical=(${newX.toFixed(2)},${newY.toFixed(2)}), ` +
              `tilePath=${pathStr}, ` +
              `${isSpawnTurn ? 'SPAWN TURN — visStart preserved' : proj.homingPathStyle === 'straight' ? `re-anchored visStart=(${reanchorTo!.x.toFixed(2)},${reanchorTo!.y.toFixed(2)})` : 'non-straight: no visStart change'}, ` +
              `target→(${proj.targetX.toFixed(2)},${proj.targetY.toFixed(2)})`
            );
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

      if (isHomingDebug()) {
        const stepsSummary = walk.steps.map(s => {
          if (s.kind === 'hostile_hit') return `hostile_hit@(${s.target.x},${s.target.y}) pierce=${s.pierceStop}`;
          if (s.kind === 'healing_hit') return `healing_hit@(${s.target.x},${s.target.y})`;
          if (s.kind === 'wall') return `wall@(${s.x},${s.y})`;
          if (s.kind === 'bounds_exit') return `bounds_exit`;
          if (s.kind === 'reflect') return `reflect`;
          if (s.kind === 'travel') return `travel@(${s.x},${s.y})`;
          return s.kind;
        }).join(' / ');
        console.log(
          `[PROJ-NONHOMING-RESOLVE ${proj.id.slice(-6)}] turn=${gameState.currentTurn} ` +
          `logicalTileIdx=${proj.logicalTileIndex} range=${range} tilesPerTurn=${tilesPerTurn} ` +
          `startXY=(${proj.startX.toFixed(2)},${proj.startY.toFixed(2)}) dir=${proj.direction} ` +
          `steps: ${stepsSummary || '(none)'}`
        );
      }

      for (const step of walk.steps) {
        if (step.kind === 'bounds_exit') {
          // nothing added to turnTiles
        } else if (step.kind === 'wall') {
          turnTiles.push({ x: step.x, y: step.y });
          // Replay end event — non-homing bolt stopped at a wall.
          recordProjectileEvent(gameState, {
            type: 'wall_hit', projId: proj.id, x: step.x, y: step.y,
          });
        } else if (step.kind === 'travel') {
          turnTiles.push({ x: step.x, y: step.y });
        } else if (step.kind === 'hostile_hit') {
          // Replay hit event — emitted for every pierce target, not just the
          // pierce-stop. (Pierce-through hits along the path need events too
          // so the replay's damage VFX timing matches the live game.)
          // deferredDeath fields carry through so replay can commit
          // pendingDeath → dead on visual arrival.
          const maxHitIdxForEvent = proj.tilePath ? proj.tilePath.length - 1 : step.dist;
          recordProjectileEvent(gameState, {
            type: 'hit',
            projId: proj.id,
            x: step.target.x, y: step.target.y,
            targetEntityId: step.targetIsEnemy
              ? (step.target as PlacedEnemy).enemyId
              : (step.target as PlacedCharacter).characterId,
            targetIsEnemy: step.targetIsEnemy,
            hitTileIndex: Math.min(step.dist, maxHitIdxForEvent),
            hitVfxSprite: step.hitResult.vfxSprite,
            damage: step.hitResult.damageApplied ?? 0,
            deferredDeathEntityId: step.hitResult.deferredDeathEntityId,
            deferredDeathIsEnemy: step.hitResult.deferredDeathIsEnemy,
            deferredDeathIndex: step.hitResult.deferredDeathIndex,
          });
          if (step.pierceStop) {
            // Clamp hitTileIndex to tilePath bounds. For downgraded non-
            // homing bolts, walker moves in proj.direction while tilePath
            // points at the clamped target — these can diverge, and if the
            // walker hits an enemy past tilePath's end, step.dist exceeds
            // tilePath.length-1. The visual check
            // `currentTileIdx >= hitTileIndex` would never fire and the
            // bolt/entity would be stuck (entity pendingDeath forever,
            // bolt visually persisting indefinitely).
            const maxHitIdx = proj.tilePath ? proj.tilePath.length - 1 : step.dist;
            proj.hitResult = {
              hitTileIndex: Math.min(step.dist, maxHitIdx),
              deactivate: true,
              vfxSprite: step.hitResult.vfxSprite,
              vfxX: step.target.x,
              vfxY: step.target.y,
              deferredDeathEntityId: step.hitResult.deferredDeathEntityId,
              deferredDeathIsEnemy: step.hitResult.deferredDeathIsEnemy,
              deferredDeathIndex: step.hitResult.deferredDeathIndex,
              damage: step.hitResult.damageApplied ?? 0,
            };
          } else if ((step.hitResult.damageApplied ?? 0) > 0 && step.hitResult.deferredDeathEntityId) {
            // Pierce pass-through — bolt damaged this target but kept going.
            // Stage the decrement with its tile index so it fires when the
            // visual sprite crosses this target's tile (not at the bolt's
            // final landing). Clamp like the pierce-stop above — if the
            // walker moved past tilePath's end, index the last valid tile.
            const maxHitIdx = proj.tilePath ? proj.tilePath.length - 1 : step.dist;
            const clampedHitTileIdx = Math.min(step.dist, maxHitIdx);
            if (!proj.pendingVisualDecrements) proj.pendingVisualDecrements = [];
            proj.pendingVisualDecrements.push({
              targetEntityId: step.hitResult.deferredDeathEntityId,
              targetIsEnemy: step.hitResult.deferredDeathIsEnemy ?? false,
              targetIndex: step.hitResult.deferredDeathIndex,
              damage: step.hitResult.damageApplied ?? 0,
              hitTileIndex: clampedHitTileIdx,
            });
            if (isPierceDebug()) {
              console.log(
                `[PIERCE-CAPTURE-LINEAR ${proj.id.slice(-6)}] turn=${gameState.currentTurn} ` +
                `target=${step.hitResult.deferredDeathEntityId.slice(-6)} step.dist=${step.dist} ` +
                `clampedHitTileIdx=${clampedHitTileIdx} tilePathLen=${proj.tilePath?.length ?? 'none'} ` +
                `damage=${step.hitResult.damageApplied ?? 0} tileEntryTime=${proj.tileEntryTime ?? 'unset'} now=${Date.now()}`
              );
            }
          }
        } else if (step.kind === 'healing_hit') {
          // Replay hit event for heals too — parity with hostile_hit.
          const maxHitIdxForEvent = proj.tilePath ? proj.tilePath.length - 1 : step.dist;
          recordProjectileEvent(gameState, {
            type: 'hit',
            projId: proj.id,
            x: step.target.x, y: step.target.y,
            targetEntityId: step.targetIsEnemy
              ? (step.target as PlacedEnemy).enemyId
              : (step.target as PlacedCharacter).characterId,
            targetIsEnemy: step.targetIsEnemy,
            hitTileIndex: Math.min(step.dist, maxHitIdxForEvent),
            hitVfxSprite: step.vfxSprite,
          });
          if (step.pierceStop) {
            const maxHitIdx = proj.tilePath ? proj.tilePath.length - 1 : step.dist;
            proj.hitResult = {
              hitTileIndex: Math.min(step.dist, maxHitIdx),
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

          // Replay reflect event — emitted after combinedPath / reflectAtTileIndex
          // are finalized. Position is the reflector's tile (end of approach leg).
          const reflectorTile = approachTiles[approachTiles.length - 1] ?? { x: proj.logicalX, y: proj.logicalY };
          recordProjectileEvent(gameState, {
            type: 'reflect',
            projId: proj.id,
            x: reflectorTile.x, y: reflectorTile.y,
            reflected: true,
            reflectTintColor: proj.reflectTintColor,
            reflectOverrideSprite: proj.reflectOverrideSprite,
            reflectAtTileIndex: proj.reflectAtTileIndex,
            combinedPath: [...combinedPath],
          });

          if (!reflectedHit) {
            proj.hitResult = {
              hitTileIndex: combinedPath.length - 1,
              deactivate: true,
            };
            // Reflected leg fizzled without hitting — emit deactivate as
            // the lifetime's end event.
            const endTile = combinedPath[combinedPath.length - 1] ?? reflectorTile;
            recordProjectileEvent(gameState, {
              type: 'deactivate',
              projId: proj.id,
              x: endTile.x, y: endTile.y,
            });
          }
          // If reflectedHit is true, resolveReflectedPath set proj.hitResult
          // with a hit. We emit the hit event from resolveReflectedPath itself
          // (below) so both real and headless paths stay in sync.

          if (combinedPath.length > 0) {
            proj.logicalX = combinedPath[combinedPath.length - 1].x;
            proj.logicalY = combinedPath[combinedPath.length - 1].y;
          }
        }
      }

      shouldRemove = walk.endedAtBounds || walk.endedAtWall || walk.endedAtPierceStop
        || walk.steps.some(s => (s.kind === 'hostile_hit' || s.kind === 'healing_hit') && s.pierceStop);

      // Skip position/tilePath updates if reflected (already handled above)
      if (reflectedThisTurn) continue;

      // Update projectile position if still active
      if (!shouldRemove && !hitWall) {
        // Use the walker's authoritative endDist — for bouncing projectiles
        // this is the tile count within the post-last-bounce segment (walker
        // resets logicalTileIndex to 0 on each bounce). The old
        // `newDist = Math.min(endTile, range)` formula assumed a straight-line
        // trajectory from proj.startX/Y along the pre-walk direction and
        // doesn't hold after a bounce.
        proj.logicalTileIndex = walk.endDist;

        if (walk.endDist >= range) {
          if (!hitSomething && proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
            // AOE at range end — fire at the actual final position (walker's
            // endX/endY), not along the original straight line.
            if (isInBounds(walk.endX, walk.endY, gameState.puzzle.width, gameState.puzzle.height)) {
              triggerAOEExplosion(walk.endX, walk.endY, proj.attackData,
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
        proj.logicalX = turnTiles[turnTiles.length - 1].x;
        proj.logicalY = turnTiles[turnTiles.length - 1].y;
      }

      // For bouncing projectiles, install the traversed turnTiles as the
      // visual tilePath so updateTileBasedVisual animates the bolt through
      // its bounced trajectory. Non-bouncing projectiles still use the
      // spawn-time tilePath from actions.ts.
      if (walk.bounced) {
        proj.tilePath = [...turnTiles];
        proj.currentTileIndex = 0;
        proj.tileEntryTime = Date.now();
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
        // Replay end event — throw/place bolt landed an item on the tile.
        recordProjectileEvent(gameState, {
          type: 'deactivate',
          projId: proj.id,
          x: placeTile.x, y: placeTile.y,
        });
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
      maybeMarkLingerDespawn(proj, endTileIndex, Date.now());
      // Replay end event — the walker hit wall/bounds without a hit/reflect
      // emission. `wall` steps already emit wall_hit events, but the
      // bounds-exit and pure range-exhausted cases reach here with no
      // emitted end event. Guard against double-recording by checking if
      // any end event was already emitted this turn for this projectile.
      if (gameState.projectileTimeline) {
        const alreadyEnded = gameState.projectileTimeline.some(e =>
          e.projId === proj.id && e.turn === gameState.currentTurn &&
          (e.type === 'hit' || e.type === 'wall_hit' || e.type === 'deactivate' || e.type === 'reflect')
        );
        if (!alreadyEnded) {
          const endTile = proj.tilePath && proj.tilePath.length > 0
            ? proj.tilePath[proj.tilePath.length - 1]
            : { x: proj.logicalX, y: proj.logicalY };
          recordProjectileEvent(gameState, {
            type: 'deactivate',
            projId: proj.id,
            x: endTile.x, y: endTile.y,
          });
        }
      }
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
        // Prefer array-index lookup to disambiguate duplicate enemyIds.
        if (!targetEntity && proj.targetEnemyIndex !== undefined) {
          const enemy = gameState.puzzle.enemies[proj.targetEnemyIndex];
          if (enemy && enemy.enemyId === proj.targetEntityId && !enemy.dead) {
            targetEntity = enemy; targetEntityId = enemy.enemyId; targetIsEnemyFlag = true;
          }
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
        const dx = targetEntity.x - proj.logicalX;
        const dy = targetEntity.y - proj.logicalY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Range gate — mirror resolveProjectiles homing range check so
        // headless (replay/solver) agrees with real on which bolts fizzle vs.
        // hit. Without this, OUT OF RANGE bolts in real mode keep hunting in
        // headless until they hit, and replay shows hits that never happened.
        const pathTraveledSoFar = proj.pathTraveled ?? 0;
        const remainingRange = Math.max(0, range - pathTraveledSoFar);
        const pathfindingCantAdvance = proj.homingPathStyle === 'pathfinding' && remainingRange < 1;
        if (remainingRange < 0.5 || pathfindingCantAdvance) {
          recordProjectileEvent(gameState, {
            type: 'deactivate',
            projId: proj.id,
            x: proj.logicalX, y: proj.logicalY,
          });
          proj.active = false;
          projectilesToRemove.push(proj.id);
          continue;
        }

        // Pathfinding: if the BFS partial reaches target within this turn's
        // budget, treat as REACHED — mirrors the real-mode fix so solver and
        // live game agree on timing. Without this, real kills on turn N and
        // headless on turn N+1 for pathfinding paths that step-count shorter
        // than Euclidean distance.
        let pathfindingReachesThisTurn = false;
        let pathfindingPartialPath: Array<{ x: number; y: number }> | undefined;
        if (proj.homingPathStyle === 'pathfinding') {
          const psx = Math.round(proj.logicalX);
          const psy = Math.round(proj.logicalY);
          const bfsPath = findPathBFS(psx, psy, targetEntity.x, targetEntity.y, gameState);
          const tileBudget = Math.min(tilesPerTurn, Math.floor(remainingRange));
          if (bfsPath.length > 0 && bfsPath.length - 1 <= tileBudget) {
            pathfindingReachesThisTurn = true;
          } else if (bfsPath.length > 0) {
            pathfindingPartialPath = bfsPath.slice(0, tileBudget + 1);
          }
        }

        // effectiveReach clamps per-turn movement by remaining range so the
        // last turn of a fizzling bolt moves only what's left in its budget
        // (matches real-mode). tilesPerTurn alone would overshoot.
        const effectiveReach = Math.min(tilesPerTurn, remainingRange);

        if (distance <= effectiveReach || pathfindingReachesThisTurn) {
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
        } else if (pathfindingPartialPath) {
          const lastTile = pathfindingPartialPath[pathfindingPartialPath.length - 1];
          const segLen = Math.sqrt(
            Math.pow(lastTile.x - proj.logicalX, 2) +
            Math.pow(lastTile.y - proj.logicalY, 2)
          );
          proj.pathTraveled = (proj.pathTraveled ?? 0) + segLen;
          proj.logicalX = lastTile.x;
          proj.logicalY = lastTile.y;
          proj.targetX = targetEntity.x;
          proj.targetY = targetEntity.y;
          recordProjectileEvent(gameState, {
            type: 'homing_move',
            projId: proj.id,
            x: proj.logicalX, y: proj.logicalY,
          });
        } else {
          // Clamp per-turn motion to effectiveReach (remaining range) so the
          // final turn of a fizzling bolt stops exactly at its range budget.
          const clampedMove = Math.min(tilesPerTurn, remainingRange);
          const moveRatio = clampedMove / distance;
          const newX = proj.logicalX + dx * moveRatio;
          const newY = proj.logicalY + dy * moveRatio;
          const segLen = Math.sqrt(
            Math.pow(newX - proj.logicalX, 2) +
            Math.pow(newY - proj.logicalY, 2)
          );
          proj.pathTraveled = (proj.pathTraveled ?? 0) + segLen;
          proj.logicalX = newX;
          proj.logicalY = newY;
          proj.targetX = targetEntity.x;
          proj.targetY = targetEntity.y;
          recordProjectileEvent(gameState, {
            type: 'homing_move',
            projId: proj.id,
            x: proj.logicalX, y: proj.logicalY,
          });
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
        } else if (step.kind === 'bounce') {
          // Record as wall_hit for replay purposes — visuals get a "bounced
          // off this wall" marker without introducing a new event type.
          recordProjectileEvent(gameState, {
            type: 'wall_hit', projId: proj.id, x: step.wallX, y: step.wallY,
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

      // Update projectile position if it's still active. Use the walker's
      // authoritative endX/endY/endDist — these correctly reflect post-bounce
      // state for bouncing projectiles.
      if (!reflectHandled && !shouldRemove && !hitWall) {
        proj.logicalX = walk.endX;
        proj.logicalY = walk.endY;
        proj.logicalTileIndex = walk.endDist;

        if (walk.endDist >= range) {
          if (!hitSomething && proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
            if (isInBounds(walk.endX, walk.endY, gameState.puzzle.width, gameState.puzzle.height)) {
              triggerAOEExplosion(walk.endX, walk.endY, proj.attackData,
                proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
            }
          }
          shouldRemove = true;
        }
      }
    }

    // THROW_PLACE: place item when headless projectile reaches destination
    if (shouldRemove && proj.throwPlaceConfig) {
      const placeX = Math.floor(proj.logicalX);
      const placeY = Math.floor(proj.logicalY);
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
            x: proj.logicalX, y: proj.logicalY,
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
