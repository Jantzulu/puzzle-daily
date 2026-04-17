/**
 * Shared constants for in-game hero / enemy "cards" (CharacterSelector,
 * EnemyDisplay, etc.). Kept in one place so tuning is a single-line edit.
 */

import type { CustomSprite } from '../../utils/assetStorage';
import { resolveImageSource, resolveSpriteSheetSource } from '../../utils/assetStorage';
import { loadImage, isImageReady } from '../../utils/imageLoader';

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
 * Lookup order:
 *  1. Explicit `frameHeight` on the sprite-sheet config (set by the
 *     in-game Pixel Editor when sheets are authored there).
 *  2. `img.naturalHeight` from the image loader's cache — covers
 *     imported sheets (e.g. authored in Aseprite) where the config
 *     doesn't carry an explicit `frameHeight`. Images are cached
 *     globally and are usually loaded by the time card rows render.
 *  3. For static-image sprites (no sheet): same `img.naturalHeight`
 *     fallback.
 *  4. `FALLBACK_NATIVE_HEIGHT` if nothing is loaded yet.
 *
 * Directional sprites use the `default` direction's idle variant —
 * that's the frame shown in card previews. Card components should
 * subscribe to image-load events and trigger a re-compute on each,
 * so when the fallback path was hit initially, the true height is
 * picked up once the image finishes loading.
 */
export function getSpriteNativeHeight(sprite?: CustomSprite): number {
  if (!sprite) return FALLBACK_NATIVE_HEIGHT;

  const isDirectional = sprite.useDirectional && sprite.directionalSprites?.default;
  const config = isDirectional ? sprite.directionalSprites!.default : sprite;

  // 1. Explicit frameHeight from config
  const sheet = config.idleSpriteSheet;
  if (sheet?.frameHeight) return sheet.frameHeight;

  // 2. For sprite sheets: read from loaded image's natural height.
  //    For a horizontal strip (game convention), each frame's height
  //    equals the full image's naturalHeight.
  if (sheet) {
    const src = resolveSpriteSheetSource(sheet);
    if (src) {
      const img = loadImage(src);
      if (img && isImageReady(img) && img.naturalHeight > 0) {
        return img.naturalHeight;
      }
    }
  }

  // 3. For static-image sprites: use the image's natural height
  const imageSrc = resolveImageSource(
    config.idleImageData || config.imageData,
    config.idleImageUrl || config.imageUrl,
  );
  if (imageSrc) {
    const img = loadImage(imageSrc);
    if (img && isImageReady(img) && img.naturalHeight > 0) {
      return img.naturalHeight;
    }
  }

  // 4. Fallback when nothing is loaded yet. The card row should subscribe
  //    to image-load events and re-compute so this value gets replaced
  //    with the true height once images load.
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
