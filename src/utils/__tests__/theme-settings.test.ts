/**
 * Theme settings pins (2026-07-26 settings audit).
 *
 * Two things the Settings page got wrong for a long time and that only a
 * test can keep right:
 *
 * 1. THEME_COLOR_DEFAULTS is a transcription of the CSS fallbacks in
 *    index.css. It replaced a hand-kept map in ThemeAssetsEditor that
 *    covered 18 of ~60 keys and had drifted from the stylesheet (it claimed
 *    #556b2f for success where the CSS says #3d4d21, #1f1810 for the sprite
 *    preview where the CSS says #15100a, and so on). If index.css changes,
 *    this test fails rather than the swatches quietly lying.
 *
 * 2. Import used to accept ANY valid JSON and write it straight over the
 *    theme — a number, an array, someone else's export — and reported
 *    success either way.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  THEME_COLOR_DEFAULTS,
  THEME_ASSET_CONFIG,
  importThemeAssets,
  loadThemeAssets,
  saveThemeAssets,
  getThemeAssetsCSSProperties,
  type ThemeAssetKey,
} from '../themeAssets';

const CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../index.css'),
  'utf8'
);

/**
 * Every literal index.css ends up on for a given custom property.
 * A fallback can chain — `var(--a, var(--b, #841919))` — in which case the
 * colour a user actually sees with nothing set is the innermost literal.
 */
function cssFallbacks(varName: string): string[] {
  const found: string[] = [];
  // The fallback may itself be a call — rgba(…) or a nested var(…) — so
  // allow one level of nesting before the closing paren.
  const re = new RegExp(`var\\(${varName},\\s*((?:[^()]|\\([^()]*\\))+)\\)`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(CSS)) !== null) {
    let fallback = m[1].trim();
    // Unwrap chained var() references down to the terminal literal
    let chained = fallback.match(/^var\(\s*(--[\w-]+)\s*,\s*(.+)\)$/);
    while (chained) {
      fallback = chained[2].trim();
      chained = fallback.match(/^var\(\s*(--[\w-]+)\s*,\s*(.+)\)$/);
    }
    // A bare `var(--x)` with no fallback resolves elsewhere; follow it once
    const bare = fallback.match(/^var\(\s*(--[\w-]+)\s*\)$/);
    if (bare) {
      const declared = CSS.match(new RegExp(`${bare[1]}:\\s*([^;]+);`));
      fallback = declared ? declared[1].trim() : fallback;
    }
    found.push(fallback);
  }
  return found;
}

// Colour key -> the CSS custom property it drives. Only keys whose fallback
// lives in index.css; the rest are consumed inline by components.
const CSS_BACKED: Partial<Record<ThemeAssetKey, string>> = {
  colorBgPrimary: '--theme-bg-primary',
  colorBgSecondary: '--theme-bg-secondary',
  colorBgCard: '--theme-bg-card',
  colorBgNavbar: '--theme-bg-navbar',
  colorBgInput: '--theme-bg-input',
  colorBgControlPanel: '--theme-bg-control-panel',
  colorTextPrimary: '--theme-text-primary',
  colorTextSecondary: '--theme-text-secondary',
  colorAccentPrimary: '--theme-accent-primary',
  colorAccentSuccess: '--theme-accent-success',
  colorAccentDanger: '--theme-accent-danger',
  colorTextHeading: '--theme-text-heading',
  colorBorderPrimary: '--theme-border-primary',
  colorBorderAccent: '--theme-border-accent',
  colorButtonBg: '--theme-button-bg',
  colorButtonBorder: '--theme-button-border',
  colorButtonPrimaryBg: '--theme-button-primary-bg',
  colorButtonPrimaryBorder: '--theme-button-primary-border',
  colorButtonDangerBg: '--theme-button-danger-bg',
  colorButtonDangerBorder: '--theme-button-danger-border',
  colorBgPreview: '--theme-bg-preview',
};

function installLocalStorageMock() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  });
}

describe('THEME_COLOR_DEFAULTS', () => {
  it('matches a real fallback in index.css for every CSS-backed colour', () => {
    for (const [key, varName] of Object.entries(CSS_BACKED)) {
      const declared = THEME_COLOR_DEFAULTS[key as ThemeAssetKey];
      const fallbacks = cssFallbacks(varName!);
      expect(fallbacks.length, `${varName} is never read in index.css`).toBeGreaterThan(0);
      expect(
        fallbacks,
        `${key}: editor shows ${declared}, index.css falls back to ${fallbacks.join(' / ')}`
      ).toContain(declared);
    }
  });

  it('only claims defaults for keys that are actually colour settings', () => {
    for (const key of Object.keys(THEME_COLOR_DEFAULTS) as ThemeAssetKey[]) {
      expect(THEME_ASSET_CONFIG[key]?.inputType, `${key}`).toBe('color');
    }
  });

  it('leaves keys whose unset state is not a flat colour undefined', () => {
    // These render as a Tailwind gradient or a dungeon-btn plate when unset;
    // a swatch would be a fiction. (The old map showed them as black.)
    expect(THEME_COLOR_DEFAULTS.concedeModalPanelBg).toBeUndefined();
    expect(THEME_COLOR_DEFAULTS.gameOverPanelButtonBg).toBeUndefined();
  });
});

describe('importThemeAssets', () => {
  beforeEach(() => installLocalStorageMock());

  it('rejects malformed JSON without touching the stored theme', () => {
    saveThemeAssets({ colorBgPrimary: '#123456' });
    const result = importThemeAssets('{ not json');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(loadThemeAssets().colorBgPrimary).toBe('#123456');
  });

  it('rejects valid JSON that is not a theme export', () => {
    saveThemeAssets({ colorBgPrimary: '#123456' });
    for (const payload of ['42', '"hello"', '[1,2,3]', 'null', '{"unrelated":true}']) {
      expect(importThemeAssets(payload).success, payload).toBe(false);
    }
    expect(loadThemeAssets().colorBgPrimary).toBe('#123456');
  });

  it('accepts a real export', () => {
    const result = importThemeAssets(JSON.stringify({ colorBgPrimary: '#abcdef' }));
    expect(result.success).toBe(true);
    expect(loadThemeAssets().colorBgPrimary).toBe('#abcdef');
  });
});

describe('font family settings', () => {
  beforeEach(() => installLocalStorageMock());

  it('writes Inter explicitly so the menu and heading fonts can leave Almendra', () => {
    // Both variables fall back to Almendra when unset, so skipping the write
    // for 'default' made "Inter" unselectable on those two surfaces.
    saveThemeAssets({ fontFamilyMenu: 'default', fontFamilyHeading: 'default' });
    const props = getThemeAssetsCSSProperties();
    expect(props['--theme-font-family-menu']).toContain('Inter');
    expect(props['--theme-font-family-heading']).toContain('Inter');
  });

  it('writes nothing when the setting is cleared', () => {
    saveThemeAssets({});
    const props = getThemeAssetsCSSProperties();
    expect(props['--theme-font-family-menu']).toBeUndefined();
    expect(props['--theme-font-family-heading']).toBeUndefined();
  });

  it('leaves font SIZE at medium unset so .font-medieval keeps inheriting', () => {
    saveThemeAssets({ fontSizeHeading: 'medium' });
    expect(getThemeAssetsCSSProperties()['--theme-font-size-heading-px']).toBeUndefined();
  });
});
