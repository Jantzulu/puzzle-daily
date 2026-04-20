/**
 * Snapshot serialization for the golden-test corpus.
 *
 * Captures LOGICAL state only. VISUAL and BRIDGE fields are excluded so that:
 *   1. Phase C (visual state moves to a side-table) does not invalidate goldens.
 *   2. Phase D (bridge-flag consolidation) does not invalidate goldens.
 *   3. The real-sim / headless-sim parity check compares apples to apples —
 *      BRIDGE fields exist for the visual loop and differ legitimately between
 *      the two paths even when logical outcomes match.
 *
 * Field categorization follows the LOGICAL/VISUAL/BRIDGE annotations on
 * Projectile in src/types/game.ts.
 *
 * Non-deterministic IDs (status-effect instance ids that embed Date.now() and
 * Math.random, projectile ids that may embed wall-clock time) are normalized
 * to stable per-run indices via an IdNormalizer so snapshots are reproducible
 * across runs.
 */
import type { GameState, PlacedCharacter, PlacedEnemy, PlacedCollectible, Projectile, StatusEffect } from '../../../types/game';

export class IdNormalizer {
  private map = new Map<string, string>();
  private counters: Record<string, number> = {};

  /** Returns a stable short id for `raw`, prefixed by `kind`. Same input → same output within one run. */
  normalize(kind: string, raw: string | undefined | null): string | undefined {
    if (raw == null) return undefined;
    const key = `${kind}:${raw}`;
    const existing = this.map.get(key);
    if (existing) return existing;
    const n = this.counters[kind] ?? 0;
    this.counters[kind] = n + 1;
    const stable = `${kind}-${n}`;
    this.map.set(key, stable);
    return stable;
  }
}

export interface StatusEffectSnapshot {
  id: string;
  type: string;
  statusAssetId?: string;
  duration: number;
  value?: unknown;
  currentStacks?: number;
  appliedOnTurn?: number;
  sourceEntityId?: string;
}

export interface CharacterSnapshot {
  characterId: string;
  x: number;
  y: number;
  facing: string;
  currentHealth: number;
  dead: boolean;
  active: boolean;
  actionIndex: number;
  spellCooldowns?: Record<string, number>;
  statusEffects?: StatusEffectSnapshot[];
}

export interface EnemySnapshot {
  enemyId: string;
  x: number;
  y: number;
  facing?: string;
  currentHealth: number;
  dead: boolean;
  actionIndex?: number;
  spellCooldowns?: Record<string, number>;
  statusEffects?: StatusEffectSnapshot[];
}

export interface CollectibleSnapshot {
  collectibleId?: string;
  x: number;
  y: number;
  collected: boolean;
  despawning?: boolean;
  spawnTurn?: number;
}

export interface ProjectileSnapshot {
  id: string;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  direction: string;
  speed: number;
  active: boolean;
  spellAssetId?: string;
  sourceCharacterId?: string;
  sourceEnemyId?: string;
  isHoming?: boolean;
  homingPathStyle?: string;
  homingIgnoreWalls?: boolean;
  homingHitAlongPath?: boolean;
  targetEntityId?: string;
  targetIsEnemy?: boolean;
  reflected?: boolean;
  teamSwapped?: boolean;
  spawnTurn?: number;
  logicalTileIndex?: number;
  tilePath?: Array<{ x: number; y: number }>;
  hitEntityIds?: string[];
  hitEnemyIndices?: number[];
  bounceCount?: number;
  damage?: number;
  healing?: number;
  range?: number;
}

export interface TurnSnapshot {
  turn: number;
  gameStatus: string;
  score: number;
  characters: CharacterSnapshot[];
  enemies: EnemySnapshot[];
  collectibles: CollectibleSnapshot[];
  projectiles: ProjectileSnapshot[];
}

function snapshotStatusEffect(se: StatusEffect, ids: IdNormalizer): StatusEffectSnapshot {
  return {
    id: ids.normalize('se', se.id) ?? se.id,
    type: se.type,
    statusAssetId: se.statusAssetId,
    duration: se.duration,
    value: se.value,
    currentStacks: se.currentStacks,
    appliedOnTurn: se.appliedOnTurn,
    sourceEntityId: se.sourceEntityId,
  };
}

function snapshotCharacter(c: PlacedCharacter, ids: IdNormalizer): CharacterSnapshot {
  return {
    characterId: c.characterId,
    x: c.x,
    y: c.y,
    facing: c.facing,
    currentHealth: c.currentHealth,
    dead: !!c.dead,
    active: !!c.active,
    actionIndex: c.actionIndex,
    spellCooldowns: c.spellCooldowns,
    statusEffects: c.statusEffects?.map((se) => snapshotStatusEffect(se, ids)),
  };
}

function snapshotEnemy(e: PlacedEnemy, ids: IdNormalizer): EnemySnapshot {
  return {
    enemyId: e.enemyId,
    x: e.x,
    y: e.y,
    facing: e.facing,
    currentHealth: e.currentHealth,
    dead: !!e.dead,
    actionIndex: e.actionIndex,
    spellCooldowns: e.spellCooldowns,
    statusEffects: e.statusEffects?.map((se) => snapshotStatusEffect(se, ids)),
  };
}

function snapshotCollectible(col: PlacedCollectible): CollectibleSnapshot {
  return {
    collectibleId: col.collectibleId,
    x: col.x,
    y: col.y,
    collected: !!col.collected,
    despawning: col.despawning,
    spawnTurn: col.spawnTurn,
  };
}

function snapshotProjectile(p: Projectile, ids: IdNormalizer): ProjectileSnapshot {
  return {
    id: ids.normalize('proj', p.id) ?? p.id,
    startX: p.startX,
    startY: p.startY,
    targetX: p.targetX,
    targetY: p.targetY,
    direction: p.direction,
    speed: p.speed,
    active: !!p.active,
    spellAssetId: p.spellAssetId,
    sourceCharacterId: p.sourceCharacterId,
    sourceEnemyId: p.sourceEnemyId,
    isHoming: p.isHoming,
    homingPathStyle: p.homingPathStyle,
    homingIgnoreWalls: p.homingIgnoreWalls,
    homingHitAlongPath: p.homingHitAlongPath,
    targetEntityId: p.targetEntityId,
    targetIsEnemy: p.targetIsEnemy,
    reflected: p.reflected,
    teamSwapped: p.teamSwapped,
    spawnTurn: p.spawnTurn,
    logicalTileIndex: p.logicalTileIndex,
    tilePath: p.tilePath ? p.tilePath.map((t) => ({ x: t.x, y: t.y })) : undefined,
    hitEntityIds: p.hitEntityIds,
    hitEnemyIndices: p.hitEnemyIndices,
    bounceCount: p.bounceCount,
    damage: p.attackData?.damage,
    healing: p.attackData?.healing,
    range: p.attackData?.range,
  };
}

/**
 * Strip `undefined` from an object recursively so JSON.stringify output is
 * stable (undefined keys vs missing keys can differ).
 */
function stripUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(stripUndefined) as unknown as T;
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return obj;
}

export function serializeTurn(gs: GameState, ids: IdNormalizer): TurnSnapshot {
  const snap: TurnSnapshot = {
    turn: gs.currentTurn,
    gameStatus: gs.gameStatus,
    score: gs.score,
    characters: gs.placedCharacters.map((c) => snapshotCharacter(c, ids)),
    enemies: gs.puzzle.enemies.map((e) => snapshotEnemy(e, ids)),
    collectibles: gs.puzzle.collectibles.map(snapshotCollectible),
    projectiles: (gs.activeProjectiles ?? []).map((p) => snapshotProjectile(p, ids)),
  };
  return stripUndefined(snap);
}
