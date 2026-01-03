/**
 * Sprite Asset Configuration
 *
 * This file maps sprite IDs to their visual representations.
 * To customize the look of characters/enemies/tiles:
 * 1. Add your image files to /public/sprites/
 * 2. Update the sprite definitions below to reference your images
 * 3. Or modify the render functions to change how sprites are drawn
 */

export interface SpriteConfig {
  type: 'shape' | 'image' | 'emoji';

  // For shape-based sprites (current system)
  color?: string;
  shape?: 'square' | 'circle' | 'triangle' | 'diamond';

  // For image-based sprites
  imagePath?: string;

  // For emoji-based sprites (simple alternative)
  emoji?: string;

  // Common properties
  scale?: number;
  rotation?: number;
}

/**
 * Character sprite configurations
 * Each character's spriteId maps to one of these
 */
export const CHARACTER_SPRITES: Record<string, SpriteConfig> = {
  knight_sprite: {
    type: 'shape',
    color: '#4caf50',
    shape: 'square',
    scale: 0.6,
  },

  archer_sprite: {
    type: 'shape',
    color: '#2196f3',
    shape: 'triangle',
    scale: 0.6,
  },

  // Example of how to use images instead:
  // knight_sprite: {
  //   type: 'image',
  //   imagePath: '/sprites/knight.png',
  //   scale: 1.0,
  // },

  // Example of how to use emoji:
  // knight_sprite: {
  //   type: 'emoji',
  //   emoji: '⚔️',
  //   scale: 1.2,
  // },
};

/**
 * Enemy sprite configurations
 */
export const ENEMY_SPRITES: Record<string, SpriteConfig> = {
  goblin_sprite: {
    type: 'shape',
    color: '#f44336',
    shape: 'circle',
    scale: 0.7,
  },

  skeleton_sprite: {
    type: 'shape',
    color: '#9e9e9e',
    shape: 'diamond',
    scale: 0.7,
  },
};

/**
 * Tile/environment sprite configurations
 */
export const TILE_SPRITES = {
  wall: {
    type: 'shape' as const,
    color: '#4a4a4a',
  },

  floor: {
    type: 'shape' as const,
    color: '#2a2a2a',
  },

  void: {
    type: 'shape' as const,
    color: '#0a0a0a',
  },
};

/**
 * Collectible sprite configurations
 */
export const COLLECTIBLE_SPRITES = {
  coin: {
    type: 'shape' as const,
    color: '#ffd700',
    shape: 'circle' as const,
  },

  gem: {
    type: 'shape' as const,
    color: '#9c27b0',
    shape: 'diamond' as const,
  },
};

/**
 * Helper to get sprite config
 */
export function getSpriteConfig(category: 'character' | 'enemy' | 'tile' | 'collectible', id: string): SpriteConfig | undefined {
  switch (category) {
    case 'character':
      return CHARACTER_SPRITES[id];
    case 'enemy':
      return ENEMY_SPRITES[id];
    case 'tile':
      return TILE_SPRITES[id as keyof typeof TILE_SPRITES];
    case 'collectible':
      return COLLECTIBLE_SPRITES[id as keyof typeof COLLECTIBLE_SPRITES];
    default:
      return undefined;
  }
}
