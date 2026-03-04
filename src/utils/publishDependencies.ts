import type { Puzzle } from '../types/game';
import { loadTileType, loadCollectible, loadObject, loadSpellAsset, loadEnemy } from './assetStorage';
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

/**
 * Extract all asset IDs referenced by a puzzle and check their publish status.
 */
export async function getPuzzleDependencies(puzzle: Puzzle): Promise<AssetDependency[]> {
  const deps = new Map<string, { type: string; name: string }>();

  // --- Skin ---
  if (puzzle.skinId && !puzzle.skinId.startsWith('builtin_')) {
    deps.set(puzzle.skinId, { type: 'skin', name: puzzle.skinId });
  }

  // --- Background music ---
  if (puzzle.backgroundMusicId) {
    deps.set(puzzle.backgroundMusicId, { type: 'sound', name: puzzle.backgroundMusicId });
  }

  // --- Custom tiles ---
  const tileTypeIds = new Set<string>();
  for (const row of puzzle.tiles) {
    for (const tile of row) {
      if (tile === null) continue;
      if (typeof tile === 'object' && 'customType' in tile && tile.customType) {
        tileTypeIds.add(tile.customType);
      }
    }
  }
  for (const tileId of tileTypeIds) {
    const tileDef = loadTileType(tileId);
    deps.set(tileId, { type: 'tile_type', name: tileDef?.name || tileId });
  }

  // --- Enemies + their spells ---
  const spellIds = new Set<string>();
  for (const pe of puzzle.enemies) {
    const enemy = getEnemy(pe.enemyId);
    deps.set(pe.enemyId, { type: 'enemy', name: enemy?.name || pe.enemyId });

    // Collect spells from enemy behavior
    if (enemy?.behavior?.pattern) {
      for (const action of enemy.behavior.pattern) {
        if (action.spellId) spellIds.add(action.spellId);
      }
    }
  }

  // --- Characters + their spells ---
  for (const charId of puzzle.availableCharacters) {
    const char = getCharacter(charId);
    deps.set(charId, { type: 'character', name: char?.name || charId });

    // Collect spells from character behavior
    if (char?.behavior) {
      for (const action of char.behavior) {
        if (action.spellId) spellIds.add(action.spellId);
      }
    }
  }

  // --- Spells ---
  for (const spellId of spellIds) {
    const spell = loadSpellAsset(spellId);
    deps.set(spellId, { type: 'spell', name: spell?.name || spellId });
  }

  // --- Collectibles ---
  if (puzzle.collectibles) {
    for (const c of puzzle.collectibles) {
      if (c.collectibleId) {
        const item = loadCollectible(c.collectibleId);
        deps.set(c.collectibleId, { type: 'collectible', name: item?.name || c.collectibleId });
      }
    }
  }

  // --- Objects ---
  if (puzzle.placedObjects) {
    for (const obj of puzzle.placedObjects) {
      const objDef = loadObject(obj.objectId);
      deps.set(obj.objectId, { type: 'object', name: objDef?.name || obj.objectId });
    }
  }

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

  // Build result
  return assetIds.map(id => {
    const dep = deps.get(id)!;
    return {
      assetId: id,
      type: dep.type,
      name: dep.name,
      isPublished: publishedIds.has(id),
      isMissing: dep.name === id, // If name === id, we couldn't load the asset
    };
  });
}

/**
 * Get just the unpublished dependencies.
 */
export async function getUnpublishedDependencies(puzzle: Puzzle): Promise<AssetDependency[]> {
  const deps = await getPuzzleDependencies(puzzle);
  return deps.filter(d => !d.isPublished && !d.isMissing);
}
