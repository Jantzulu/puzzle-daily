import type { Character, Enemy, TileBehaviorConfig } from '../types/game';

const CHARACTER_STORAGE_KEY = 'custom_characters';
const ENEMY_STORAGE_KEY = 'custom_enemies';
const TILE_STORAGE_KEY = 'custom_tiles';
const COLLECTIBLE_STORAGE_KEY = 'custom_collectibles';
const OBJECT_STORAGE_KEY = 'custom_objects';
const HIDDEN_ASSETS_KEY = 'hidden_official_assets';
const PENDING_ASSET_DELETIONS_KEY = 'pending_asset_deletions';

// ============ PENDING DELETIONS TRACKING ============
// Tracks assets deleted locally so they can be synced to cloud on next push

export interface PendingDeletion {
  id: string;
  type: 'tile_type' | 'enemy' | 'character' | 'object' | 'skin' | 'spell' | 'status_effect' | 'folder' | 'collectible_type';
  deletedAt: string;
}

export const getPendingAssetDeletions = (): PendingDeletion[] => {
  const stored = localStorage.getItem(PENDING_ASSET_DELETIONS_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch (e) {
    return [];
  }
};

export const addPendingAssetDeletion = (id: string, type: PendingDeletion['type']): void => {
  const deletions = getPendingAssetDeletions();
  // Don't add duplicates
  if (!deletions.some(d => d.id === id)) {
    deletions.push({ id, type, deletedAt: new Date().toISOString() });
    localStorage.setItem(PENDING_ASSET_DELETIONS_KEY, JSON.stringify(deletions));
  }
};

export const clearPendingAssetDeletions = (): void => {
  localStorage.removeItem(PENDING_ASSET_DELETIONS_KEY);
};

export const removePendingAssetDeletion = (id: string): void => {
  const deletions = getPendingAssetDeletions().filter(d => d.id !== id);
  localStorage.setItem(PENDING_ASSET_DELETIONS_KEY, JSON.stringify(deletions));
};

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

// ============ FOLDER MANAGEMENT ============

const FOLDERS_STORAGE_KEY = 'asset_folders';

export type AssetCategory = 'characters' | 'enemies' | 'spells' | 'tiles' | 'skins' | 'objects' | 'collectibles';

export interface AssetFolder {
  id: string;
  name: string;
  category: AssetCategory;
  createdAt: string;
}

export const getFolders = (category?: AssetCategory): AssetFolder[] => {
  const stored = localStorage.getItem(FOLDERS_STORAGE_KEY);
  if (!stored) return [];
  try {
    const folders: AssetFolder[] = JSON.parse(stored);
    if (category) {
      return folders.filter(f => f.category === category);
    }
    return folders;
  } catch (e) {
    return [];
  }
};

export const saveFolder = (folder: AssetFolder): void => {
  const folders = getFolders();
  const existingIndex = folders.findIndex(f => f.id === folder.id);
  if (existingIndex >= 0) {
    folders[existingIndex] = folder;
  } else {
    folders.push(folder);
  }
  localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders));
};

export const deleteFolder = (folderId: string): void => {
  const folders = getFolders().filter(f => f.id !== folderId);
  localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders));

  // Track deletion for cloud sync
  addPendingAssetDeletion(folderId, 'folder');
};

export const createFolder = (name: string, category: AssetCategory): AssetFolder => {
  const folder: AssetFolder = {
    id: 'folder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    name,
    category,
    createdAt: new Date().toISOString(),
  };
  saveFolder(folder);
  return folder;
};

export const renameFolder = (folderId: string, newName: string): void => {
  const folders = getFolders();
  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.name = newName;
    localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders));
  }
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

  // Note: Corpse appearance is handled by the final frame of the Death sprite sheet

  // Deprecated - for backwards compatibility
  imageData?: string; // Will be used as idleImageData if idleImageData not set

  // Directional sprites (different appearance per direction with idle/moving states)
  directionalSprites?: Partial<Record<SpriteDirection, DirectionalSpriteConfig>>;
  useDirectional?: boolean; // If true, use directional sprites when available

  // Triggered sprite (for static objects - alternate appearance when entity nearby)
  triggerType?: 'none' | 'character_nearby' | 'enemy_nearby' | 'any_entity_nearby';
  triggeredImageData?: string; // Base64 encoded PNG/GIF for triggered state
  triggeredSpriteSheet?: SpriteSheetConfig; // Sprite sheet for triggered animation

  createdAt: string;
}

export interface CustomCharacter extends Character {
  customSprite?: CustomSprite;
  isCustom: boolean;
  createdAt: string;
  folderId?: string; // Optional folder assignment
  allowOversizedSprite?: boolean; // Allow sprite to exceed tile bounds (like objects)
}

export interface CustomEnemy extends Enemy {
  customSprite?: CustomSprite;
  isCustom: boolean;
  createdAt: string;
  folderId?: string; // Optional folder assignment
  allowOversizedSprite?: boolean; // Allow sprite to exceed tile bounds (like objects)
}

export interface CustomTileType {
  id: string;
  name: string;
  description?: string;
  baseType: 'empty' | 'wall';
  behaviors: TileBehaviorConfig[];  // Multiple behaviors allowed (stacking)
  customSprite?: CustomSprite;
  hideBehaviorIndicators?: boolean;  // Hide default behavior overlays (purple teleport, blue ice, etc.)
  isCustom: boolean;
  createdAt: string;
  folderId?: string; // Optional folder assignment
}

export interface CustomCollectibleType {
  id: string;
  name: string;
  baseType: 'coin' | 'gem';
  customSprite?: CustomSprite;
  scoreValue: number;
  isCustom: boolean;
  createdAt: string;
  folderId?: string; // Optional folder assignment
}

// ============ CUSTOM OBJECT TYPES ============

export type ObjectCollisionType = 'none' | 'wall' | 'stop_movement';
export type ObjectAnchorPoint = 'center' | 'bottom_center';

export interface ObjectEffectConfig {
  type: 'damage' | 'heal' | 'slow' | 'speed_boost' | 'teleport';
  value?: number; // Damage/heal amount, or speed multiplier
  radius: number; // Tiles from object center
  affectsCharacters?: boolean;
  affectsEnemies?: boolean;
  triggerOnTurnStart?: boolean; // Effect triggers at start of each turn
  triggerOnEnter?: boolean; // Effect triggers when entity enters radius
}

export interface CustomObject {
  id: string;
  name: string;
  description?: string;
  customSprite?: CustomSprite;

  // Positioning
  anchorPoint: ObjectAnchorPoint; // Where sprite is anchored to tile

  // Collision
  collisionType: ObjectCollisionType;

  // Effects
  effects: ObjectEffectConfig[];

  // Visual properties
  renderLayer?: 'below_entities' | 'above_entities'; // Render order relative to entities on same tile
  castsShadow?: boolean;

  // Metadata
  isCustom: boolean;
  createdAt: string;
  folderId?: string; // Optional folder assignment
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

  // Track deletion for cloud sync
  addPendingAssetDeletion(characterId, 'character');

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

  // Track deletion for cloud sync
  addPendingAssetDeletion(enemyId, 'enemy');

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

  // Track deletion for cloud sync
  addPendingAssetDeletion(tileId, 'tile_type');
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

  // Track deletion for cloud sync
  addPendingAssetDeletion(collectibleId, 'collectible_type');
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

  // Track deletion for cloud sync
  addPendingAssetDeletion(spellId, 'spell');
};

export const loadSpellAsset = (spellId: string): SpellAsset | null => {
  const spells = getSpellAssets();
  return spells.find(s => s.id === spellId) || null;
};

// ==========================================
// STATUS EFFECT ASSETS
// ==========================================

import type { StatusEffectAsset, StatusEffectType } from '../types/game';

const STATUS_EFFECT_STORAGE_KEY = 'status_effect_assets';

/**
 * Get built-in status effects that are always available
 */
export const getBuiltInStatusEffects = (): StatusEffectAsset[] => {
  return [
    {
      id: 'builtin_poison',
      name: 'Poison',
      description: 'Take damage each turn',
      type: 'poison' as StatusEffectType,
      iconSprite: { type: 'inline', spriteData: { shape: 'circle', primaryColor: '#22cc22', type: 'simple' } },
      defaultDuration: 3,
      defaultValue: 1,
      processAtTurnStart: false,
      stackingBehavior: 'stack',
      maxStacks: 5,
      createdAt: '2024-01-01T00:00:00.000Z',
      isBuiltIn: true,
    },
    {
      id: 'builtin_sleep',
      name: 'Sleep',
      description: 'Cannot act (broken by damage)',
      type: 'sleep' as StatusEffectType,
      iconSprite: { type: 'inline', spriteData: { shape: 'circle', primaryColor: '#8888ff', type: 'simple' } },
      defaultDuration: 2,
      processAtTurnStart: true,
      preventsAllActions: true,
      removedOnDamage: true,
      stackingBehavior: 'refresh',
      createdAt: '2024-01-01T00:00:00.000Z',
      isBuiltIn: true,
    },
    {
      id: 'builtin_slow',
      name: 'Slow',
      description: 'Skips every other movement action',
      type: 'slow' as StatusEffectType,
      iconSprite: { type: 'inline', spriteData: { shape: 'diamond', primaryColor: '#6666ff', type: 'simple' } },
      defaultDuration: 3,
      processAtTurnStart: true,
      preventsMovement: true,
      stackingBehavior: 'refresh',
      createdAt: '2024-01-01T00:00:00.000Z',
      isBuiltIn: true,
    },
    {
      id: 'builtin_silenced',
      name: 'Silenced',
      description: 'Cannot cast ranged/AOE spells',
      type: 'silenced' as StatusEffectType,
      iconSprite: { type: 'inline', spriteData: { shape: 'square', primaryColor: '#cc44cc', type: 'simple' } },
      defaultDuration: 2,
      processAtTurnStart: true,
      preventsRanged: true,
      stackingBehavior: 'refresh',
      createdAt: '2024-01-01T00:00:00.000Z',
      isBuiltIn: true,
    },
    {
      id: 'builtin_disarmed',
      name: 'Disarmed',
      description: 'Cannot use melee attacks',
      type: 'disarmed' as StatusEffectType,
      iconSprite: { type: 'inline', spriteData: { shape: 'triangle', primaryColor: '#cc8844', type: 'simple' } },
      defaultDuration: 2,
      processAtTurnStart: true,
      preventsMelee: true,
      stackingBehavior: 'refresh',
      createdAt: '2024-01-01T00:00:00.000Z',
      isBuiltIn: true,
    },
    {
      id: 'builtin_stun',
      name: 'Stun',
      description: 'Cannot act (not broken by damage)',
      type: 'stun' as StatusEffectType,
      iconSprite: { type: 'inline', spriteData: { shape: 'star', primaryColor: '#ffff00', type: 'simple' } },
      defaultDuration: 1,
      processAtTurnStart: true,
      preventsAllActions: true,
      stackingBehavior: 'refresh',
      createdAt: '2024-01-01T00:00:00.000Z',
      isBuiltIn: true,
    },
    {
      id: 'builtin_regen',
      name: 'Regeneration',
      description: 'Heal each turn',
      type: 'regen' as StatusEffectType,
      iconSprite: { type: 'inline', spriteData: { shape: 'circle', primaryColor: '#44ff44', type: 'simple' } },
      defaultDuration: 3,
      defaultValue: 1,
      processAtTurnStart: false,
      stackingBehavior: 'stack',
      maxStacks: 3,
      createdAt: '2024-01-01T00:00:00.000Z',
      isBuiltIn: true,
    },
    {
      id: 'builtin_shield',
      name: 'Shield',
      description: 'Absorbs incoming damage',
      type: 'shield' as StatusEffectType,
      iconSprite: { type: 'inline', spriteData: { shape: 'diamond', primaryColor: '#88ccff', type: 'simple' } },
      defaultDuration: 3,
      defaultValue: 5,
      processAtTurnStart: false,
      stackingBehavior: 'stack',
      maxStacks: 3,
      createdAt: '2024-01-01T00:00:00.000Z',
      isBuiltIn: true,
    },
    {
      id: 'builtin_haste',
      name: 'Haste',
      description: 'Gains extra movement every other action',
      type: 'haste' as StatusEffectType,
      iconSprite: { type: 'inline', spriteData: { shape: 'triangle', primaryColor: '#ffcc00', type: 'simple' } },
      defaultDuration: 3,
      processAtTurnStart: true,
      stackingBehavior: 'refresh',
      createdAt: '2024-01-01T00:00:00.000Z',
      isBuiltIn: true,
    },
    {
      id: 'builtin_burn',
      name: 'Burn',
      description: 'Take fire damage each turn',
      type: 'burn' as StatusEffectType,
      iconSprite: { type: 'inline', spriteData: { shape: 'star', primaryColor: '#ff6600', type: 'simple' } },
      defaultDuration: 3,
      defaultValue: 1,
      processAtTurnStart: false,
      stackingBehavior: 'stack',
      maxStacks: 5,
      createdAt: '2024-01-01T00:00:00.000Z',
      isBuiltIn: true,
    },
    {
      id: 'builtin_bleed',
      name: 'Bleed',
      description: 'Take physical damage each turn',
      type: 'bleed' as StatusEffectType,
      iconSprite: { type: 'inline', spriteData: { shape: 'circle', primaryColor: '#cc0000', type: 'simple' } },
      defaultDuration: 3,
      defaultValue: 1,
      processAtTurnStart: false,
      stackingBehavior: 'stack',
      maxStacks: 5,
      createdAt: '2024-01-01T00:00:00.000Z',
      isBuiltIn: true,
    },
  ];
};

export const saveStatusEffectAsset = (effect: StatusEffectAsset): void => {
  // Don't allow saving/overwriting built-in effects
  if (effect.isBuiltIn) return;

  const effects = getCustomStatusEffects();

  const existingIndex = effects.findIndex(e => e.id === effect.id);
  if (existingIndex >= 0) {
    effects[existingIndex] = effect;
  } else {
    effects.push(effect);
  }

  localStorage.setItem(STATUS_EFFECT_STORAGE_KEY, JSON.stringify(effects));
};

/**
 * Get only custom (user-created) status effects
 */
const getCustomStatusEffects = (): StatusEffectAsset[] => {
  try {
    const stored = localStorage.getItem(STATUS_EFFECT_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load custom status effects:', e);
    return [];
  }
};

/**
 * Get all status effects (built-in + custom)
 */
export const getStatusEffectAssets = (): StatusEffectAsset[] => {
  const builtIn = getBuiltInStatusEffects();
  const custom = getCustomStatusEffects();
  return [...builtIn, ...custom];
};

export const deleteStatusEffectAsset = (effectId: string): void => {
  // Don't allow deleting built-in effects
  if (effectId.startsWith('builtin_')) return;

  const effects = getCustomStatusEffects();
  const filtered = effects.filter(e => e.id !== effectId);
  localStorage.setItem(STATUS_EFFECT_STORAGE_KEY, JSON.stringify(filtered));

  // Track deletion for cloud sync
  addPendingAssetDeletion(effectId, 'status_effect');
};

export const loadStatusEffectAsset = (effectId: string): StatusEffectAsset | null => {
  const effects = getStatusEffectAssets();
  return effects.find(e => e.id === effectId) || null;
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

  // Track deletion for cloud sync
  addPendingAssetDeletion(skinId, 'skin');
};

export const loadPuzzleSkin = (skinId: string): PuzzleSkin | null => {
  // Check built-in skins first
  if (skinId === 'builtin_dungeon') return DEFAULT_DUNGEON_SKIN;

  const skins = getPuzzleSkins();
  return skins.find(s => s.id === skinId) || null;
};

// ============ OBJECT STORAGE ============

export const saveObject = (object: CustomObject): void => {
  const objects = getCustomObjects();
  const existingIndex = objects.findIndex(o => o.id === object.id);

  if (existingIndex >= 0) {
    objects[existingIndex] = { ...object, createdAt: new Date().toISOString() };
  } else {
    objects.push({ ...object, createdAt: new Date().toISOString(), isCustom: true });
  }

  localStorage.setItem(OBJECT_STORAGE_KEY, JSON.stringify(objects));
};

export const getCustomObjects = (): CustomObject[] => {
  const stored = localStorage.getItem(OBJECT_STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to parse custom objects:', e);
    return [];
  }
};

export const deleteObject = (objectId: string): void => {
  const objects = getCustomObjects();
  const filtered = objects.filter(o => o.id !== objectId);
  localStorage.setItem(OBJECT_STORAGE_KEY, JSON.stringify(filtered));

  // Track deletion for cloud sync
  addPendingAssetDeletion(objectId, 'object');
};

export const loadObject = (objectId: string): CustomObject | null => {
  const objects = getCustomObjects();
  return objects.find(o => o.id === objectId) || null;
};

export const getAllObjects = (): CustomObject[] => {
  return getCustomObjects();
};
