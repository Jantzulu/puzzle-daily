/**
 * Shared constants for in-game hero / enemy "cards" (CharacterSelector,
 * EnemyDisplay, etc.). Kept in one place so tuning is a single-line edit.
 */

import type { CustomSprite } from '../../utils/assetStorage';

/**
 * Pixel scale for sprites shown inside selector/info cards.
 *
 * Each native art pixel of a sprite is rendered as this many display pixels.
 * A sprite natively 21 pixels tall displays at `21 × CARD_PIXEL_SCALE` pixels
 * inside its card. This is pixel-perfect integer scaling — no half-pixels,
 * no fit-to-box math.
 *
 * Taller native sprites will visually appear taller in the card than shorter
 * ones (which is the intended model — think of characters sitting next to
 * each other on a shared floor in a reference image, all magnified uniformly).
 *
 * Adjust this constant to make all card sprites bigger or smaller.
 */
export const CARD_PIXEL_SCALE = 3;

/**
 * Fallback native-pixel height for sprites whose native dimensions cannot
 * be determined synchronously (e.g. static-image sprites where the image
 * hasn't loaded yet, or shape-based sprites without any dimensions).
 *
 * Used by `computeMaxSpriteNativeHeight` when a sprite's sprite-sheet
 * config doesn't expose `frameHeight`.
 */
export const FALLBACK_NATIVE_HEIGHT = 24;

/**
 * Minimum card sprite-area height (in native pixels, before multiplying by
 * CARD_PIXEL_SCALE). Prevents cards from becoming absurdly short when all
 * sprites in a row are tiny.
 */
export const MIN_NATIVE_HEIGHT = 16;

/**
 * Read the native pixel height of a sprite's idle frame synchronously.
 *
 * Prefers the sprite-sheet's explicit `frameHeight` (which is configured
 * by the Pixel Editor when the sheet is created). For sprites without a
 * sprite sheet (static image or shape fallback), returns the fallback.
 *
 * Directional sprites use the `default` direction's idle sheet as the
 * reference — that's the frame that shows in card previews.
 */
export function getSpriteNativeHeight(sprite?: CustomSprite): number {
  if (!sprite) return FALLBACK_NATIVE_HEIGHT;

  if (sprite.useDirectional && sprite.directionalSprites?.default) {
    const sheet = sprite.directionalSprites.default.idleSpriteSheet;
    if (sheet?.frameHeight) return sheet.frameHeight;
  } else if (sprite.idleSpriteSheet?.frameHeight) {
    return sprite.idleSpriteSheet.frameHeight;
  }

  return FALLBACK_NATIVE_HEIGHT;
}

/**
 * Compute the display-pixel height for a card's sprite area, given the
 * collection of sprites that will appear in the same card row.
 *
 * The tallest native sprite in the row determines the row's sprite-area
 * height: `max(native heights) × CARD_PIXEL_SCALE`. All cards in the same
 * row get this height, so they render at a uniform size and the tallest
 * sprite is never clipped at the top.
 *
 * Clamped to a minimum so selectors with only very small sprites still
 * have a reasonable card height.
 */
export function computeCardSpriteAreaHeight(sprites: Array<CustomSprite | undefined>): number {
  let maxNative = MIN_NATIVE_HEIGHT;
  for (const sprite of sprites) {
    const h = getSpriteNativeHeight(sprite);
    if (h > maxNative) maxNative = h;
  }
  return maxNative * CARD_PIXEL_SCALE;
}
