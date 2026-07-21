import type { Puzzle } from '../types/game';
import { loadTileType, loadCollectible, loadObject, loadSpellAsset, loadStatusEffectAsset, loadVessel, loadAlly } from './assetStorage';
import { getCharacter } from '../data/characters';
import { getEnemy } from '../data/enemies';
import { supabase } from '../lib/supabase';

export interface AssetDependency {
  assetId: string;
  type: string;
  name: string;
  isPublished: boolean;
  isMissing: boolean;
}

// ─── Transitive asset reference walker (hardened 2026-07-21) ────────────────
// The old scanner only saw direct placements, which let transitive
// references go un-published under a published puzzle: statuses applied by
// spells or starting effects, death-drop / THROW_PLACE collectibles, a
// vessel's nested enemy, summoned enemies, and showcase attach targets.
// This walker recurses every discovered asset OBJECT to a fixpoint,
// following the codebase's uniform reference-field vocabulary. New
// reference fields must be added to REF_FIELDS (or use an existing name).

type RefKind = 'spell' | 'status_effect' | 'collectible' | 'enemy' | 'character' | 'tile_type' | 'object' | 'unknown';

const REF_FIELDS: Record<string, RefKind> = {
  spellId: 'spell',
  contactDamageSpellVisualId: 'spell', // status → contact-damage spell visual
  statusAssetId: 'status_effect',
  collectibleId: 'collectible',
  droppedCollectibleId: 'collectible',
  spawnCollectibleId: 'collectible',
  enemyId: 'enemy',           // placed enemies/allies/vessels share the id space
  transformEnemyId: 'enemy',  // vessel's nested enemy
  summonEnemyId: 'enemy',
  characterId: 'character',   // showcase heroes, placements
  customType: 'tile_type',
  customTileTypeId: 'tile_type',
  objectId: 'object',
};

interface Resolved {
  type: string;
  name: string;
  /** Raw asset object to keep walking, or null for missing/builtin-terminal. */
  walk: unknown;
  /** Builtin assets don't need publishing (and their refs stay builtin). */
  builtin: boolean;
}

// Resolution order matters for the shared enemy id space: vessels and
// allies first (their RAW objects carry fields the getEnemy adapters drop,
// like transformEnemyId), then enemies, which also covers builtins.
function resolve(id: string, kind: RefKind): Resolved | null {
  const tryEnemyLike = (): Resolved | null => {
    const vessel = loadVessel(id);
    if (vessel) return { type: 'vessel', name: vessel.name, walk: vessel, builtin: false };
    const ally = loadAlly(id);
    if (ally) return { type: 'ally', name: ally.name, walk: ally, builtin: false };
    const enemy = getEnemy(id);
    if (enemy) return { type: 'enemy', name: enemy.name, walk: enemy, builtin: !('isCustom' in enemy && enemy.isCustom) };
    return null;
  };
  switch (kind) {
    case 'spell': {
      const spell = loadSpellAsset(id);
      return spell ? { type: 'spell', name: spell.name, walk: spell, builtin: false } : null;
    }
    case 'status_effect': {
      const status = loadStatusEffectAsset(id);
      return status ? { type: 'status_effect', name: status.name, walk: status, builtin: !!status.isBuiltIn } : null;
    }
    case 'collectible': {
      const item = loadCollectible(id);
      return item ? { type: 'collectible', name: item.name, walk: item, builtin: false } : null;
    }
    case 'enemy':
      return tryEnemyLike();
    case 'character': {
      const char = getCharacter(id);
      return char ? { type: 'character', name: char.name, walk: char, builtin: !('isCustom' in char && char.isCustom) } : null;
    }
    case 'tile_type': {
      const tile = loadTileType(id);
      return tile ? { type: 'tile_type', name: tile.name, walk: tile, builtin: false } : null;
    }
    case 'object': {
      const obj = loadObject(id);
      return obj ? { type: 'object', name: obj.name, walk: obj, builtin: false } : null;
    }
    case 'unknown': {
      // Showcase attach targets can be any Slab-listable type.
      return (
        resolve(id, 'character') ?? tryEnemyLike() ?? resolve(id, 'tile_type') ??
        resolve(id, 'collectible') ?? resolve(id, 'status_effect') ?? resolve(id, 'object') ??
        resolve(id, 'spell')
      );
    }
  }
}

/** Deep-walk any JSON-ish value, enqueueing every reference-field string. */
function walkRefs(value: unknown, enqueue: (id: string, kind: RefKind) => void): void {
  if (Array.isArray(value)) {
    for (const v of value) walkRefs(v, enqueue);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    const kind = REF_FIELDS[key];
    if (kind && typeof v === 'string' && v) enqueue(v, kind);
    walkRefs(v, enqueue);
  }
}

/**
 * Every publishable asset id a puzzle needs, transitively — the ids a
 * player's device must have for the puzzle to play (and, later, the same
 * walk the Slab reveal rule will use). Exported for reuse.
 */
export function collectPuzzleAssetIds(puzzle: Puzzle): Map<string, { type: string; name: string; isMissing: boolean }> {
  const found = new Map<string, { type: string; name: string; isMissing: boolean }>();
  const queue: Array<{ id: string; kind: RefKind }> = [];
  const queued = new Set<string>();
  const enqueue = (id: string, kind: RefKind) => {
    if (queued.has(id)) return;
    queued.add(id);
    queue.push({ id, kind });
  };

  // Seed: deep-walk the puzzle itself (placements, tiles, showcase heroes)
  // plus the fields the walker can't infer from names.
  walkRefs(puzzle, enqueue);
  for (const id of puzzle.availableCharacters ?? []) enqueue(id, 'character');
  for (const id of puzzle.showcase?.entityIds ?? []) enqueue(id, 'unknown');
  if (puzzle.skinId && !puzzle.skinId.startsWith('builtin_')) {
    found.set(puzzle.skinId, { type: 'skin', name: puzzle.skinId, isMissing: false });
  }
  if (puzzle.backgroundMusicId) {
    found.set(puzzle.backgroundMusicId, { type: 'sound', name: puzzle.backgroundMusicId, isMissing: false });
  }

  // Fixpoint: resolve each id, record it, walk its asset object for more.
  while (queue.length > 0) {
    const { id, kind } = queue.shift()!;
    if (found.has(id)) continue;
    const resolved = resolve(id, kind);
    if (!resolved) {
      // Deleted/unknown asset — surface it (the modal offers cleanup).
      found.set(id, { type: kind === 'unknown' ? 'asset' : kind, name: id, isMissing: true });
      continue;
    }
    if (resolved.builtin) continue; // builtins ship with the app
    found.set(id, { type: resolved.type, name: resolved.name, isMissing: false });
    walkRefs(resolved.walk, enqueue);
  }

  return found;
}

/**
 * Extract all asset IDs referenced by a puzzle (transitively) and check
 * their publish status against assets_live.
 */
export async function getPuzzleDependencies(puzzle: Puzzle): Promise<AssetDependency[]> {
  const deps = collectPuzzleAssetIds(puzzle);

  // --- Check publish status in batch ---
  const assetIds = Array.from(deps.keys());
  let publishedIds = new Set<string>();

  if (assetIds.length > 0) {
    const { data } = await supabase
      .from('assets_live')
      .select('id')
      .in('id', assetIds);
    if (data) {
      publishedIds = new Set(data.map(d => d.id));
    }
  }

  return assetIds.map(id => {
    const dep = deps.get(id)!;
    return {
      assetId: id,
      type: dep.type,
      name: dep.name,
      isPublished: publishedIds.has(id),
      isMissing: dep.isMissing,
    };
  });
}

/**
 * Get just the unpublished dependencies.
 */
export async function getUnpublishedDependencies(puzzle: Puzzle): Promise<AssetDependency[]> {
  const deps = await getPuzzleDependencies(puzzle);
  return deps.filter(d => !d.isPublished);
}
