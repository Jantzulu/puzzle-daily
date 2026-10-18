import type { CustomSprite } from '../../utils/assetStorage';
import { hasDeathAnimation } from '../editor/SpriteEditor';

// Moved out of DeathSpriteThumbnail.tsx (2026-10-18 delint): a component
// file that also exports plain values breaks React Fast Refresh.

/** Gate for callers: only swap the skull when the fallen hero has death art. */
export const deathVignetteUsable = (sprite?: CustomSprite | null): sprite is CustomSprite =>
  !!sprite && hasDeathAnimation(sprite);
