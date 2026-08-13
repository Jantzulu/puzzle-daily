/**
 * NAV CHROME ICONS — hardcoded art, the hearts precedent (core chrome is
 * SOURCE, not a theme knob: git is the custodian, both apps get it on
 * deploy, no sync step).
 *
 * THE DROP PATH: paint at 12×12 art px (renders 24 CSS at the page's 2×
 * scale; other sizes render proportionally) and save into THIS folder as
 *   nav-calendar.png      — the navbar calendar button
 *   nav-menu.png          — the hamburger (menu open) button
 *   nav-menu-close.png    — the X (menu open state of the same button)
 * Vite's glob picks the file up (dev reload), the built-in SVG glyph
 * retires, and committing the PNG ships it. Delete the file to revert.
 */
const files = import.meta.glob('./nav-*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export type NavChromeIconName = 'calendar' | 'menu' | 'menu-close';

export const navChromeIcon = (name: NavChromeIconName): string | undefined =>
  files[`./nav-${name}.png`];
