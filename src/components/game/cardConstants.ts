/**
 * Shared constants for in-game hero / enemy "cards" (CharacterSelector,
 * EnemyDisplay, etc.). Kept in one place so tuning is a single-line edit.
 */

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
 * Adjust this constant to make all card sprites bigger or smaller. Card
 * containers (`size={52}` in CharacterSelector/EnemyDisplay today) are tuned
 * to hold sprites of typical native heights at this scale without overflow.
 * If you raise the constant, you may need to widen the card container or
 * accept sprites extending past the card edges.
 */
export const CARD_PIXEL_SCALE = 2;
