import type { Character, Enemy, TileBehaviorConfig } from '../types/game';

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
  idleSpriteSheet?: SpriteSheetConfig; // Sprite sheet for idle animation

  // Moving state (actively moving) - for this specific direction
  movingImageData?: string; // Base64 encoded GIF for moving state
  movingSpriteSheet?: SpriteSheetConfig; // Sprite sheet for moving animation

  // Death state - for this specific direction
  deathImageData?: string; // Base64 encoded PNG/GIF for death state
  deathSpriteSheet?: SpriteSheetConfig; // Sprite sheet for death animation

  // Casting state - when casting spell while stationary
  castingImageData?: string; // Base64 encoded PNG/GIF for casting state
  castingSpriteSheet?: SpriteSheetConfig; // Sprite sheet for casting animation

  // Deprecated - for backwards compatibility
  imageData?: string; // Will be used as idleImageData if idleImageData not set
}

export interface SpriteSheetConfig {
  imageData: string; // Base64 encoded sprite sheet image
  frameCount: number; // Number of frames in the sheet
  frameWidth?: number; // Width of each frame (if not provided, calculated from image width / frameCount)
  frameHeight?: number; // Height of each frame (if not provided, uses full image height)
  frameRate: number; // Frames per second (e.g., 10 fps)
  loop?: boolean; // Whether to loop animation (default true)
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
  idleSpriteSheet?: SpriteSheetConfig; // Sprite sheet for idle animation
  movingSpriteSheet?: SpriteSheetConfig; // Sprite sheet for moving animation
  deathImageData?: string; // Base64 encoded PNG/GIF for death state
  deathSpriteSheet?: SpriteSheetConfig; // Sprite sheet for death animation
  castingImageData?: string; // Base64 encoded PNG/GIF for casting state
  castingSpriteSheet?: SpriteSheetConfig; // Sprite sheet for casting animation

  // Corpse sprite - left behind after death animation completes (non-directional)
  corpseSpriteSheet?: SpriteSheetConfig; // Sprite sheet for corpse (typically static, 1 frame)
  corpseImageData?: string; // Base64 encoded PNG/GIF for corpse
  corpseHasCollision?: boolean; // Whether corpse blocks movement (default: false)

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
  description?: string;
  baseType: 'empty' | 'wall';
  behaviors: TileBehaviorConfig[];  // Multiple behaviors allowed (stacking)
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

export const loadTileType = (tileId: string): CustomTileType | null => {
  const tiles = getCustomTileTypes();
  return tiles.find(t => t.id === tileId) || null;
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

// ==========================================
// CUSTOM ATTACKS (Attack System - Phase 1)
// ==========================================

import type { CustomAttack } from '../types/game';

const ATTACK_STORAGE_KEY = 'custom_attacks';

export const saveCustomAttack = (attack: CustomAttack): void => {
  const attacks = getCustomAttacks();

  const existingIndex = attacks.findIndex(a => a.id === attack.id);
  if (existingIndex >= 0) {
    attacks[existingIndex] = attack;
  } else {
    attacks.push(attack);
  }

  localStorage.setItem(ATTACK_STORAGE_KEY, JSON.stringify(attacks));
};

export const getCustomAttacks = (): CustomAttack[] => {
  try {
    const stored = localStorage.getItem(ATTACK_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load custom attacks:', e);
    return [];
  }
};

export const deleteCustomAttack = (attackId: string): void => {
  const attacks = getCustomAttacks();
  const filtered = attacks.filter(a => a.id !== attackId);
  localStorage.setItem(ATTACK_STORAGE_KEY, JSON.stringify(filtered));
};

export const loadCustomAttack = (attackId: string): CustomAttack | null => {
  const attacks = getCustomAttacks();
  return attacks.find(a => a.id === attackId) || null;
};

// ==========================================
// SPELL ASSETS (New Spell System)
// ==========================================

import type { SpellAsset } from '../types/game';

const SPELL_STORAGE_KEY = 'spell_assets';

export const saveSpellAsset = (spell: SpellAsset): void => {
  const spells = getSpellAssets();

  const existingIndex = spells.findIndex(s => s.id === spell.id);
  if (existingIndex >= 0) {
    spells[existingIndex] = spell;
  } else {
    spells.push(spell);
  }

  localStorage.setItem(SPELL_STORAGE_KEY, JSON.stringify(spells));
};

export const getSpellAssets = (): SpellAsset[] => {
  try {
    const stored = localStorage.getItem(SPELL_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load spell assets:', e);
    return [];
  }
};

export const deleteSpellAsset = (spellId: string): void => {
  const spells = getSpellAssets();
  const filtered = spells.filter(s => s.id !== spellId);
  localStorage.setItem(SPELL_STORAGE_KEY, JSON.stringify(filtered));
};

export const loadSpellAsset = (spellId: string): SpellAsset | null => {
  const spells = getSpellAssets();
  return spells.find(s => s.id === spellId) || null;
};

// ==========================================
// CUSTOM BORDER SPRITES
// ==========================================

import type { CustomBorderSprites } from '../types/game';

const BORDER_SPRITES_STORAGE_KEY = 'custom_border_sprites';

export interface SavedBorderSpriteSet {
  id: string;
  name: string;
  sprites: CustomBorderSprites;
  createdAt: string;
}

export const saveBorderSpriteSet = (spriteSet: SavedBorderSpriteSet): void => {
  const sets = getBorderSpriteSets();

  const existingIndex = sets.findIndex(s => s.id === spriteSet.id);
  if (existingIndex >= 0) {
    sets[existingIndex] = spriteSet;
  } else {
    sets.push(spriteSet);
  }

  localStorage.setItem(BORDER_SPRITES_STORAGE_KEY, JSON.stringify(sets));
};

export const getBorderSpriteSets = (): SavedBorderSpriteSet[] => {
  try {
    const stored = localStorage.getItem(BORDER_SPRITES_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load border sprite sets:', e);
    return [];
  }
};

export const deleteBorderSpriteSet = (setId: string): void => {
  const sets = getBorderSpriteSets();
  const filtered = sets.filter(s => s.id !== setId);
  localStorage.setItem(BORDER_SPRITES_STORAGE_KEY, JSON.stringify(filtered));
};

export const loadBorderSpriteSet = (setId: string): SavedBorderSpriteSet | null => {
  const sets = getBorderSpriteSets();
  return sets.find(s => s.id === setId) || null;
};

// ==========================================
// PUZZLE SKINS
// ==========================================

import type { PuzzleSkin } from '../types/game';

const PUZZLE_SKINS_STORAGE_KEY = 'puzzle_skins';

// Built-in default skin (dungeon style)
export const DEFAULT_DUNGEON_SKIN: PuzzleSkin = {
  id: 'builtin_dungeon',
  name: 'Classic Dungeon',
  description: 'Default dungeon-style borders with stone walls',
  borderSprites: {}, // Empty = use default dungeon rendering
  createdAt: '2024-01-01T00:00:00.000Z',
  isBuiltIn: true,
};

export const savePuzzleSkin = (skin: PuzzleSkin): void => {
  const skins = getPuzzleSkins();

  const existingIndex = skins.findIndex(s => s.id === skin.id);
  if (existingIndex >= 0) {
    skins[existingIndex] = skin;
  } else {
    skins.push(skin);
  }

  localStorage.setItem(PUZZLE_SKINS_STORAGE_KEY, JSON.stringify(skins));
};

export const getPuzzleSkins = (): PuzzleSkin[] => {
  try {
    const stored = localStorage.getItem(PUZZLE_SKINS_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load puzzle skins:', e);
    return [];
  }
};

export const getAllPuzzleSkins = (): PuzzleSkin[] => {
  // Return built-in skins + custom skins
  return [DEFAULT_DUNGEON_SKIN, ...getPuzzleSkins()];
};

export const deletePuzzleSkin = (skinId: string): void => {
  // Don't allow deleting built-in skins
  if (skinId.startsWith('builtin_')) return;

  const skins = getPuzzleSkins();
  const filtered = skins.filter(s => s.id !== skinId);
  localStorage.setItem(PUZZLE_SKINS_STORAGE_KEY, JSON.stringify(filtered));
};

export const loadPuzzleSkin = (skinId: string): PuzzleSkin | null => {
  // Check built-in skins first
  if (skinId === 'builtin_dungeon') return DEFAULT_DUNGEON_SKIN;

  const skins = getPuzzleSkins();
  return skins.find(s => s.id === skinId) || null;
};
