import type { Puzzle } from '../types/game';
import { getCharacter } from '../data/characters';
import { getEnemy } from '../data/enemies';
import {
  loadSpellAsset,
  loadTileType,
  loadCollectible,
  loadObject,
  loadPuzzleSkin,
  extractSpriteImageUrls,
  extractSpriteReferenceUrls,
} from './assetStorage';

/**
 * Walk a puzzle and collect every sprite URL referenced by its content:
 * characters (and their spell sprites), enemies (and their spell sprites),
 * custom tile types, collectibles, placed objects, and the active skin's
 * border / tile / custom-tile sprites.
 *
 * Pass the result to either `preloadImagesEager` (await + ready flag) or
 * `preloadImages` (lazy / idle) depending on the caller's needs.
 */
export function collectPuzzleAssetUrls(puzzle: Puzzle): string[] {
  const urls: string[] = [];

  const pushSpellSprites = (spellId: string) => {
    const spell = loadSpellAsset(spellId);
    if (!spell) return;
    urls.push(...extractSpriteReferenceUrls(spell.sprites.projectile));
    urls.push(...extractSpriteReferenceUrls(spell.sprites.aoeEffect));
    urls.push(...extractSpriteReferenceUrls(spell.sprites.damageEffect));
    urls.push(...extractSpriteReferenceUrls(spell.sprites.healingEffect));
    urls.push(...extractSpriteReferenceUrls(spell.sprites.persistentArea));
  };

  for (const charId of puzzle.availableCharacters) {
    const charData = getCharacter(charId);
    if (charData?.customSprite) {
      urls.push(...extractSpriteImageUrls(charData.customSprite));
    }
    if (charData?.behavior) {
      for (const action of charData.behavior) {
        if (action.spellId) pushSpellSprites(action.spellId);
      }
    }
  }

  for (const enemy of puzzle.enemies) {
    const enemyData = getEnemy(enemy.enemyId);
    if (enemyData?.customSprite) {
      urls.push(...extractSpriteImageUrls(enemyData.customSprite));
    }
    const pattern = enemyData?.behavior?.pattern;
    if (pattern) {
      for (const action of pattern) {
        if (action.spellId) pushSpellSprites(action.spellId);
      }
    }
  }

  for (const row of puzzle.tiles) {
    for (const tile of row) {
      if (tile?.customType) {
        const tileData = loadTileType(tile.customType);
        if (tileData?.customSprite) {
          urls.push(...extractSpriteImageUrls(tileData.customSprite));
        }
        if (tileData?.offStateSprite) {
          urls.push(...extractSpriteImageUrls(tileData.offStateSprite));
        }
      }
    }
  }

  for (const collectible of puzzle.collectibles) {
    if (collectible.collectibleId) {
      const collectibleData = loadCollectible(collectible.collectibleId);
      if (collectibleData?.customSprite) {
        urls.push(...extractSpriteImageUrls(collectibleData.customSprite));
      }
    }
  }

  if (puzzle.placedObjects) {
    for (const obj of puzzle.placedObjects) {
      if (obj.objectId) {
        const objectData = loadObject(obj.objectId);
        if (objectData?.customSprite) {
          urls.push(...extractSpriteImageUrls(objectData.customSprite));
        }
      }
    }
  }

  if (puzzle.skinId) {
    const skin = loadPuzzleSkin(puzzle.skinId);
    if (skin) {
      if (skin.borderSprites) {
        for (const url of Object.values(skin.borderSprites)) {
          if (url) urls.push(url);
        }
      }
      if (skin.tileSprites) {
        const { empty, wall, void: voidSprite, goal } = skin.tileSprites;
        if (empty) urls.push(empty);
        if (wall) urls.push(wall);
        if (voidSprite) urls.push(voidSprite);
        if (goal) urls.push(goal);
      }
      if (skin.customTileSprites) {
        for (const value of Object.values(skin.customTileSprites)) {
          if (typeof value === 'string') {
            urls.push(value);
          } else if (value) {
            if (value.onSprite) urls.push(value.onSprite);
            if (value.offSprite) urls.push(value.offSprite);
          }
        }
      }
    }
  }

  return urls;
}
