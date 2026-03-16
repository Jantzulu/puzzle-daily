/**
 * Asset dependency tracking — scans puzzles and assets for references to a given asset.
 * Used to warn users before deleting assets that are still in use.
 */
import { getSavedPuzzles } from './puzzleStorage';
import {
  getCustomCharacters,
  getCustomEnemies,
  getAllCollectibles,
  getSpellAssets,
  getSoundAssets,
  getPuzzleSkins,
} from './assetStorage';
import type { CharacterAction } from '../types/game';

export type AssetType = 'character' | 'enemy' | 'spell' | 'tile_type' | 'collectible' | 'object' | 'skin' | 'sound' | 'status_effect';

export interface AssetUsage {
  type: 'puzzle' | 'character' | 'enemy' | 'spell' | 'collectible' | 'skin';
  id: string;
  name: string;
  detail: string; // e.g. "used as placed enemy", "referenced in behavior"
}

/** Scan character action lists for spell references */
function scanActionsForSpell(actions: CharacterAction[], spellId: string): boolean {
  for (const action of actions) {
    if (action.spellId === spellId) return true;
    if (action.params?.thenActions && scanActionsForSpell(action.params.thenActions, spellId)) return true;
    if (action.params?.elseActions && scanActionsForSpell(action.params.elseActions, spellId)) return true;
  }
  return false;
}

/**
 * Find all usages of a given asset across puzzles and other assets.
 * Returns an array of usage descriptions, or empty if the asset is unused.
 */
export function findAssetUsages(assetType: AssetType, assetId: string): AssetUsage[] {
  const usages: AssetUsage[] = [];
  const puzzles = getSavedPuzzles();

  switch (assetType) {
    case 'enemy': {
      for (const p of puzzles) {
        if (p.enemies?.some(e => e.enemyId === assetId)) {
          usages.push({ type: 'puzzle', id: p.id, name: p.name || p.id, detail: 'placed on map' });
        }
      }
      break;
    }

    case 'character': {
      for (const p of puzzles) {
        if (p.availableCharacters?.includes(assetId)) {
          usages.push({ type: 'puzzle', id: p.id, name: p.name || p.id, detail: 'in available characters' });
        }
      }
      break;
    }

    case 'spell': {
      // Check characters
      for (const char of getCustomCharacters()) {
        if (char.behavior && scanActionsForSpell(char.behavior, assetId)) {
          usages.push({ type: 'character', id: char.id, name: char.name, detail: 'in behavior actions' });
        }
      }
      // Check enemies
      for (const enemy of getCustomEnemies()) {
        const pattern = enemy.behavior?.type === 'active' ? enemy.behavior.pattern : undefined;
        if (pattern && scanActionsForSpell(pattern, assetId)) {
          usages.push({ type: 'enemy', id: enemy.id, name: enemy.name, detail: 'in behavior pattern' });
        }
      }
      break;
    }

    case 'tile_type': {
      for (const p of puzzles) {
        if (p.tiles) {
          const found = p.tiles.some(row =>
            row?.some(tile => tile?.customTileTypeId === assetId)
          );
          if (found) {
            usages.push({ type: 'puzzle', id: p.id, name: p.name || p.id, detail: 'used as tile' });
          }
        }
      }
      // Check skins for custom tile sprites
      for (const skin of getPuzzleSkins()) {
        if (skin.customTileSprites && assetId in skin.customTileSprites) {
          usages.push({ type: 'skin', id: skin.id, name: skin.name, detail: 'has custom sprite override' });
        }
      }
      break;
    }

    case 'collectible': {
      for (const p of puzzles) {
        if (p.collectibles?.some(c => c.collectibleId === assetId)) {
          usages.push({ type: 'puzzle', id: p.id, name: p.name || p.id, detail: 'placed on map' });
        }
      }
      // Check characters/enemies for death drops
      for (const char of getCustomCharacters()) {
        if (char.droppedCollectibleId === assetId) {
          usages.push({ type: 'character', id: char.id, name: char.name, detail: 'as death drop' });
        }
      }
      for (const enemy of getCustomEnemies()) {
        if (enemy.droppedCollectibleId === assetId) {
          usages.push({ type: 'enemy', id: enemy.id, name: enemy.name, detail: 'as death drop' });
        }
      }
      break;
    }

    case 'object': {
      for (const p of puzzles) {
        if (p.placedObjects?.some(o => o.objectId === assetId)) {
          usages.push({ type: 'puzzle', id: p.id, name: p.name || p.id, detail: 'placed on map' });
        }
      }
      break;
    }

    case 'skin': {
      for (const p of puzzles) {
        if (p.skinId === assetId) {
          usages.push({ type: 'puzzle', id: p.id, name: p.name || p.id, detail: 'as puzzle skin' });
        }
      }
      break;
    }

    case 'sound': {
      // Check puzzles for background music
      for (const p of puzzles) {
        if (p.backgroundMusicId === assetId) {
          usages.push({ type: 'puzzle', id: p.id, name: p.name || p.id, detail: 'as background music' });
        }
      }
      // Check spells for cast/hit sounds
      for (const spell of getSpellAssets()) {
        if (spell.castSound === assetId || spell.hitSound === assetId) {
          usages.push({ type: 'spell', id: spell.id, name: spell.name, detail: spell.castSound === assetId ? 'as cast sound' : 'as hit sound' });
        }
      }
      // Check characters/enemies for entity sounds
      for (const char of getCustomCharacters()) {
        if (char.sounds?.death === assetId || char.sounds?.damageTaken === assetId) {
          usages.push({ type: 'character', id: char.id, name: char.name, detail: 'as entity sound' });
        }
      }
      for (const enemy of getCustomEnemies()) {
        if (enemy.sounds?.death === assetId || enemy.sounds?.damageTaken === assetId) {
          usages.push({ type: 'enemy', id: enemy.id, name: enemy.name, detail: 'as entity sound' });
        }
      }
      // Check collectibles for pickup sound
      for (const coll of getAllCollectibles()) {
        if (coll.pickupSound === assetId) {
          usages.push({ type: 'collectible', id: coll.id, name: coll.name, detail: 'as pickup sound' });
        }
      }
      break;
    }

    case 'status_effect': {
      // Check spells
      for (const spell of getSpellAssets()) {
        if (spell.appliesStatusEffect?.statusAssetId === assetId) {
          usages.push({ type: 'spell', id: spell.id, name: spell.name, detail: 'applied on hit' });
        }
      }
      // Check collectibles
      for (const coll of getAllCollectibles()) {
        if (coll.effects?.some(e => e.statusAssetId === assetId)) {
          usages.push({ type: 'collectible', id: coll.id, name: coll.name, detail: 'applied on pickup' });
        }
      }
      break;
    }
  }

  return usages;
}

/**
 * Format usages into a human-readable warning message.
 */
export function formatUsageWarning(usages: AssetUsage[]): string {
  if (usages.length === 0) return '';
  const lines = usages.slice(0, 5).map(u => `- ${u.type}: "${u.name}" (${u.detail})`);
  if (usages.length > 5) {
    lines.push(`...and ${usages.length - 5} more`);
  }
  return `This asset is referenced by:\n${lines.join('\n')}\n\nDeleting it may break these items.`;
}
