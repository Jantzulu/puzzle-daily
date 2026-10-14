/**
 * QUEST CHROME ICONS — hardcoded art, the nav chrome's drop path
 * (navChrome.ts): core chrome is SOURCE, git is the custodian.
 *
 * THE DROP PATH: paint at 7×7 art px (odd = a true CENTRE PIXEL; it renders
 * 14 CSS at the scroll art's 2× scale — the icon sits inside the objective's
 * 17px text line on phones, so 7 is the largest odd size that never grows
 * the line; any other canvas size renders at native × 2 too) and save into
 * THIS folder as
 *   quest-rollup.png — the roll-up control that ends the objective line
 * Vite's glob picks the file up (dev reload), the built-in SVG glyph
 * retires, and committing the PNG ships it. Delete the file to revert.
 * Painted art is baked: it doesn't take the ink colour or hover tint.
 */
const files = import.meta.glob('./quest-*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export type QuestChromeIconName = 'rollup';

export const questChromeIcon = (name: QuestChromeIconName): string | undefined =>
  files[`./quest-${name}.png`];
