/**
 * Mid-game entity spawning — the shared foundation for summon spells,
 * necromancy, and breakable containers.
 *
 * Contract (locked design, 2026-07-11):
 * - APPEND-ONLY into gameState.puzzle.enemies. Existing indices never shift,
 *   so every index-keyed system (spawn/death animation maps, pierce dedup via
 *   hitEnemyIndices, sourceEnemyIndex/targetEnemyIndex) stays stable, and the
 *   spawned entity acts LAST among enemies in turn order.
 * - The entity is FULLY LIVE the moment it exists: it blocks movement, can be
 *   hit by anything still resolving this turn (projectiles, sweeps), and its
 *   contact damage applies reactively. It just doesn't ACT until next turn —
 *   executeTurn skips entities whose spawnedOnTurn === currentTurn.
 * - Pure data in, pure data out: no clocks in any decision, deep-copy safe
 *   (plain fields only), so replay snapshots and the headless solver see
 *   identical behavior.
 */
import type {
  GameState,
  PlacedEnemy,
  EntityParty,
  Direction,
} from '../types/game';
import { getEnemy } from '../data/enemies';
import { loadStatusEffectAsset } from '../utils/assetStorage';

export interface MidGameSpawnRequest {
  enemyId: string;
  x: number;
  y: number;
  /** Explicit facing wins; falls back to the asset's defaultFacing. */
  facing?: Direction;
  /** Summons inherit the summoner's party — the caller resolves and passes it. */
  party?: EntityParty;
  /** Summons pass true so they never become kill requirements. */
  excludeFromWinConditions?: boolean;
  /** Turns the entity remains after appearing (each = one action). Unset/0 = permanent. Expiry despawns at end of turn spawnedOnTurn + durationTurns — an exit transition, NOT a death. */
  durationTurns?: number;
  /** Spell that requested the spawn — despawn reads its exit overlay sprite. */
  sourceSpellId?: string;
  /** Status effect applied at spawn ON TOP of the asset's initial effects (per-spell override: starting status / contact damage — contact damage IS a CONTACT_DAMAGE status). */
  startingStatus?: {
    statusAssetId: string;
    durationOverride?: number; // -1 = permanent
    valueOverride?: number;
  };
  /** Spawn at this percent of the asset's max health (floored, min 1). Unset = full health. Necromancy shares resurrect's health-percent convention. */
  healthPercent?: number;
}

/**
 * Append a fully-initialized enemy to the board mid-game.
 *
 * Mirrors initializeGameState's per-enemy setup (health from the current
 * asset, initial status effects) but stamps spawnedOnTurn so the turn loop
 * knows to keep it idle for the remainder of this turn. actionIndex/active
 * are pre-initialized so the enemy loop's lazy init doesn't clobber the
 * explicit facing with the asset's defaultFacing next turn.
 *
 * Returns the placed entity, or null if the enemy asset doesn't exist
 * (the caller decides whether that's an authoring error worth surfacing).
 * Tile validity (bounds/blocked/occupied) is the CALLER's responsibility —
 * spell-level placement rules choose the tile before asking for the spawn.
 */
export function spawnEnemyMidGame(
  gameState: GameState,
  request: MidGameSpawnRequest,
): PlacedEnemy | null {
  const enemyData = getEnemy(request.enemyId);
  if (!enemyData) return null;

  const maxHealth = enemyData.health || 1;
  const spawned: PlacedEnemy = {
    enemyId: request.enemyId,
    x: request.x,
    y: request.y,
    currentHealth: request.healthPercent !== undefined
      ? Math.max(1, Math.floor(maxHealth * (request.healthPercent / 100)))
      : maxHealth,
    facing: request.facing ?? enemyData.behavior?.defaultFacing,
    dead: false,
    party: request.party,
    excludeFromWinConditions: request.excludeFromWinConditions,
    actionIndex: 0,
    active: true,
    spawnedOnTurn: gameState.currentTurn,
    despawnOnTurn: request.durationTurns && request.durationTurns > 0
      ? gameState.currentTurn + request.durationTurns
      : undefined,
    sourceSpellId: request.sourceSpellId,
  };

  // Initial status effects from the enemy definition — same rules as
  // initializeGameState, but applied on the spawn turn. Instance ids follow
  // the engine-wide convention (identity only, never read by logic).
  if (enemyData.initialStatusEffects && enemyData.initialStatusEffects.length > 0) {
    spawned.statusEffects = enemyData.initialStatusEffects
      .map((ise) => {
        const effectAsset = loadStatusEffectAsset(ise.statusAssetId);
        if (!effectAsset) return null;
        return {
          id: `initial_${ise.statusAssetId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: effectAsset.type,
          statusAssetId: ise.statusAssetId,
          duration: ise.durationOverride === -1 ? 99999 : (ise.durationOverride ?? effectAsset.defaultDuration),
          value: ise.valueOverride ?? effectAsset.defaultValue,
          currentStacks: 1,
          appliedOnTurn: gameState.currentTurn,
          sourceEntityId: 'initial',
          sourceIsEnemy: true,
          movementSkipCounter: 0,
        };
      })
      .filter(Boolean) as NonNullable<PlacedEnemy['statusEffects']>;
  }

  // Per-spell starting status — appended AFTER the asset initials so an
  // authored override rides on top of whatever the entity always carries.
  if (request.startingStatus) {
    const effectAsset = loadStatusEffectAsset(request.startingStatus.statusAssetId);
    if (effectAsset) {
      const instance = {
        id: `summonstatus_${request.startingStatus.statusAssetId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: effectAsset.type,
        statusAssetId: request.startingStatus.statusAssetId,
        duration: request.startingStatus.durationOverride === -1 ? 99999 : (request.startingStatus.durationOverride ?? effectAsset.defaultDuration),
        value: request.startingStatus.valueOverride ?? effectAsset.defaultValue,
        currentStacks: 1,
        appliedOnTurn: gameState.currentTurn,
        sourceEntityId: 'summon',
        sourceIsEnemy: true,
        movementSkipCounter: 0,
      };
      spawned.statusEffects = [...(spawned.statusEffects ?? []), instance];
    }
  }

  gameState.puzzle.enemies.push(spawned);
  return spawned;
}
