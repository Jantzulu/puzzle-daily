import type { Character, Enemy } from '../types/game';

const CHARACTER_STORAGE_KEY = 'custom_characters';
const ENEMY_STORAGE_KEY = 'custom_enemies';
const TILE_STORAGE_KEY = 'custom_tiles';
const COLLECTIBLE_STORAGE_KEY = 'custom_collectibles';
const HIDDEN_ASSETS_KEY = 'hidden_official_assets';

// ============ HIDDEN ASSETS MANAGEMENT ============

export const getHiddenAssets = (): Set<string> => {
  const stored = localStorage.getItem(HIDDEN_ASSETS_KEY);
  if (!stored) return new Set();
  try {
    return new Set(JSON.parse(stored));
  } catch (e) {
    return new Set();
  }
};

const saveHiddenAssets = (hidden: Set<string>): void => {
  localStorage.setItem(HIDDEN_ASSETS_KEY, JSON.stringify(Array.from(hidden)));
};

export const hideAsset = (assetId: string): void => {
  const hidden = getHiddenAssets();
  hidden.add(assetId);
  saveHiddenAssets(hidden);
};

export const unhideAsset = (assetId: string): void => {
  const hidden = getHiddenAssets();
  hidden.delete(assetId);
  saveHiddenAssets(hidden);
};

export const isAssetHidden = (assetId: string): boolean => {
  return getHiddenAssets().has(assetId);
};

// ============ CUSTOM ASSET TYPES ============

export type SpriteDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' | 'default';

export interface DirectionalSpriteConfig {
  shape?: 'circle' | 'square' | 'triangle' | 'star' | 'diamond';
  primaryColor?: string;
  secondaryColor?: string;
  size?: number; // 0-1 scale

  // Idle state (not moving) - for this specific direction
  idleImageData?: string; // Base64 encoded PNG/GIF for idle state

  // Moving state (actively moving) - for this specific direction
  movingImageData?: string; // Base64 encoded GIF for moving state

  // Deprecated - for backwards compatibility
  imageData?: string; // Will be used as idleImageData if idleImageData not set
}

export interface CustomSprite {
  id: string;
  name: string;
  type: 'simple' | 'directional' | 'image';

  // Simple rendering (single sprite for all directions)
  shape?: 'circle' | 'square' | 'triangle' | 'star' | 'diamond';
  primaryColor?: string;
  secondaryColor?: string;
  size?: number; // 0-1 scale

  // Simple mode images (same for all directions)
  idleImageData?: string; // Base64 encoded PNG/GIF for idle state
  movingImageData?: string; // Base64 encoded GIF for moving state

  // Deprecated - for backwards compatibility
  imageData?: string; // Will be used as idleImageData if idleImageData not set

  // Directional sprites (different appearance per direction with idle/moving states)
  directionalSprites?: Partial<Record<SpriteDirection, DirectionalSpriteConfig>>;
  useDirectional?: boolean; // If true, use directional sprites when available

  createdAt: string;
}

export interface CustomCharacter extends Character {
  customSprite?: CustomSprite;
  isCustom: boolean;
  createdAt: string;
}

export interface CustomEnemy extends Enemy {
  customSprite?: CustomSprite;
  isCustom: boolean;
  createdAt: string;
}

export interface CustomTileType {
  id: string;
  name: string;
  baseType: 'empty' | 'wall';
  customSprite?: CustomSprite;
  isCustom: boolean;
  createdAt: string;
}

export interface CustomCollectibleType {
  id: string;
  name: string;
  baseType: 'coin' | 'gem';
  customSprite?: CustomSprite;
  scoreValue: number;
  isCustom: boolean;
  createdAt: string;
}

// ============ CHARACTER STORAGE ============

export const saveCharacter = (character: CustomCharacter): void => {
  const characters = getCustomCharacters();
  const existingIndex = characters.findIndex(c => c.id === character.id);

  if (existingIndex >= 0) {
    characters[existingIndex] = { ...character, createdAt: new Date().toISOString() };
  } else {
    characters.push({ ...character, createdAt: new Date().toISOString(), isCustom: true });
  }

  localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(characters));
};

export const getCustomCharacters = (): CustomCharacter[] => {
  const stored = localStorage.getItem(CHARACTER_STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to parse custom characters:', e);
    return [];
  }
};

export const deleteCharacter = (characterId: string): void => {
  // Try to delete from custom characters
  const characters = getCustomCharacters();
  const filtered = characters.filter(c => c.id !== characterId);
  localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(filtered));

  // Also hide official asset if it's not in custom storage
  hideAsset(characterId);
};

export const loadCharacter = (characterId: string): CustomCharacter | null => {
  const characters = getCustomCharacters();
  return characters.find(c => c.id === characterId) || null;
};

// ============ ENEMY STORAGE ============

export const saveEnemy = (enemy: CustomEnemy): void => {
  const enemies = getCustomEnemies();
  const existingIndex = enemies.findIndex(e => e.id === enemy.id);

  if (existingIndex >= 0) {
    enemies[existingIndex] = { ...enemy, createdAt: new Date().toISOString() };
  } else {
    enemies.push({ ...enemy, createdAt: new Date().toISOString(), isCustom: true });
  }

  localStorage.setItem(ENEMY_STORAGE_KEY, JSON.stringify(enemies));
};

export const getCustomEnemies = (): CustomEnemy[] => {
  const stored = localStorage.getItem(ENEMY_STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to parse custom enemies:', e);
    return [];
  }
};

export const deleteEnemy = (enemyId: string): void => {
  // Try to delete from custom enemies
  const enemies = getCustomEnemies();
  const filtered = enemies.filter(e => e.id !== enemyId);
  localStorage.setItem(ENEMY_STORAGE_KEY, JSON.stringify(filtered));

  // Also hide official asset if it's not in custom storage
  hideAsset(enemyId);
};

export const loadEnemy = (enemyId: string): CustomEnemy | null => {
  const enemies = getCustomEnemies();
  return enemies.find(e => e.id === enemyId) || null;
};

// ============ TILE STORAGE ============

export const saveTileType = (tile: CustomTileType): void => {
  const tiles = getCustomTileTypes();
  const existingIndex = tiles.findIndex(t => t.id === tile.id);

  if (existingIndex >= 0) {
    tiles[existingIndex] = { ...tile, createdAt: new Date().toISOString() };
  } else {
    tiles.push({ ...tile, createdAt: new Date().toISOString(), isCustom: true });
  }

  localStorage.setItem(TILE_STORAGE_KEY, JSON.stringify(tiles));
};

export const getCustomTileTypes = (): CustomTileType[] => {
  const stored = localStorage.getItem(TILE_STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to parse custom tiles:', e);
    return [];
  }
};

export const deleteTileType = (tileId: string): void => {
  const tiles = getCustomTileTypes();
  const filtered = tiles.filter(t => t.id !== tileId);
  localStorage.setItem(TILE_STORAGE_KEY, JSON.stringify(filtered));
};

// ============ COLLECTIBLE STORAGE ============

export const saveCollectibleType = (collectible: CustomCollectibleType): void => {
  const collectibles = getCustomCollectibleTypes();
  const existingIndex = collectibles.findIndex(c => c.id === collectible.id);

  if (existingIndex >= 0) {
    collectibles[existingIndex] = { ...collectible, createdAt: new Date().toISOString() };
  } else {
    collectibles.push({ ...collectible, createdAt: new Date().toISOString(), isCustom: true });
  }

  localStorage.setItem(COLLECTIBLE_STORAGE_KEY, JSON.stringify(collectibles));
};

export const getCustomCollectibleTypes = (): CustomCollectibleType[] => {
  const stored = localStorage.getItem(COLLECTIBLE_STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to parse custom collectibles:', e);
    return [];
  }
};

export const deleteCollectibleType = (collectibleId: string): void => {
  const collectibles = getCustomCollectibleTypes();
  const filtered = collectibles.filter(c => c.id !== collectibleId);
  localStorage.setItem(COLLECTIBLE_STORAGE_KEY, JSON.stringify(filtered));
};
