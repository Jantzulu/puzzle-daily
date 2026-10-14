/**
 * QUEST CHROME ICONS — hardcoded art, the nav chrome's drop path
 * (navChrome.ts): core chrome is SOURCE, git is the custodian.
 *
 * THE DROP PATH: paint the WHOLE button — plate and glyph — at 11×11 art
 * px (odd = a true CENTRE PIXEL; it renders 22 CSS at the scroll art's 2×
 * scale, the size of the CSS placeholder; any other canvas size renders at
 * native × 2 too) and save into THIS folder as
 *   quest-rollup.png — the roll-up button on the scroll's upper-right
 *                      corner (it straddles the paper's top edge)
 * Vite's glob picks the file up (dev reload), the built-in SVG glyph
 * retires, and committing the PNG ships it. Delete the file to revert.
 * Painted art is baked: it doesn't take the ink colour or hover tint.
 */
const files = import.meta.glob('./quest-*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export type QuestChromeIconName = 'rollup';

export const questChromeIcon = (name: QuestChromeIconName): string | undefined =>
  files[`./quest-${name}.png`];
