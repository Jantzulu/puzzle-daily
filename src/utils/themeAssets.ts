/**
 * Theme Assets Storage System
 *
 * Allows users to upload and manage custom images for:
 * - Logo
 * - Backgrounds (main, panels, game area)
 * - Buttons (primary, secondary, danger, etc.)
 * - Border frames
 * - Icons
 *
 * These assets can be synced to the player-facing game through the skin/theme system.
 */

const STORAGE_KEY = 'theme_assets';

export interface ThemeAssets {
  // Branding
  logo?: string; // data URL or external URL
  logoAlt?: string; // Alt text for logo
  siteTitle?: string; // Site title (default: "Puzzle Daily")

  // Backgrounds
  bgMain?: string; // Main page background
  bgPanel?: string; // Panel/card background
  bgGameArea?: string; // Underground/cave background for game area
  bgNavbar?: string; // Navigation bar background

  // Buttons (can be 9-slice sprites or simple images)
  buttonPrimary?: string;
  buttonSecondary?: string;
  buttonDanger?: string;
  buttonSuccess?: string;

  // Border frames
  borderFrame?: string; // Decorative border for panels
  borderFrameSmall?: string; // Smaller decorative border

  // Icons (optional custom icons)
  iconHeart?: string;
  iconHeartEmpty?: string;
  iconSword?: string;
  iconShield?: string;

  // Overlay effects
  overlayVignette?: string;
  overlayNoise?: string;

  // === COLOR SETTINGS ===
  // Background colors
  colorBgPrimary?: string;    // Main page background color
  colorBgSecondary?: string;  // Panel/card background color
  colorBgNavbar?: string;     // Navigation bar background color
  colorBgInput?: string;      // Input field background color

  // Text colors
  colorTextPrimary?: string;  // Main text color
  colorTextSecondary?: string; // Secondary/muted text color
  colorTextHeading?: string;  // Heading text color

  // Border colors
  colorBorderPrimary?: string; // Main border color
  colorBorderAccent?: string;  // Accent border color (for focus/highlight)

  // Accent colors
  colorAccentPrimary?: string;  // Primary accent (buttons, links)
  colorAccentSuccess?: string;  // Success/positive actions
  colorAccentDanger?: string;   // Danger/warning actions
  colorAccentMagic?: string;    // Magic/special effects

  // === STYLE SETTINGS ===
  borderRadius?: string;        // Border radius (e.g., "4px", "8px", "0px")
  borderWidth?: string;         // Border width (e.g., "1px", "2px", "3px")
  shadowIntensity?: string;     // Shadow intensity ("none", "light", "medium", "heavy")
  fontFamily?: string;          // Font family override
}

export type ThemeAssetKey = keyof ThemeAssets;

// Asset metadata for the editor UI
export const THEME_ASSET_CONFIG: Record<ThemeAssetKey, { label: string; description: string; category: string; inputType?: 'image' | 'text' | 'color' | 'select' }> = {
  // Branding
  logo: { label: 'Logo', description: 'Logo image shown in navbar (recommended: PNG with transparency, ~32-48px height)', category: 'branding', inputType: 'image' },
  logoAlt: { label: 'Logo Alt Text', description: 'Alternative text for accessibility', category: 'branding', inputType: 'text' },
  siteTitle: { label: 'Site Title', description: 'Title shown in navbar (default: "Puzzle Daily")', category: 'branding', inputType: 'text' },
  // Images
  bgMain: { label: 'Main Background', description: 'Background for the entire page', category: 'backgrounds', inputType: 'image' },
  bgPanel: { label: 'Panel Background', description: 'Background texture for panels and cards', category: 'backgrounds', inputType: 'image' },
  bgGameArea: { label: 'Game Area Background', description: 'Underground/cave background surrounding the dungeon', category: 'backgrounds', inputType: 'image' },
  bgNavbar: { label: 'Navbar Background', description: 'Navigation bar background', category: 'backgrounds', inputType: 'image' },
  buttonPrimary: { label: 'Primary Button', description: 'Main action button style', category: 'buttons', inputType: 'image' },
  buttonSecondary: { label: 'Secondary Button', description: 'Secondary button style', category: 'buttons', inputType: 'image' },
  buttonDanger: { label: 'Danger Button', description: 'Warning/delete button style', category: 'buttons', inputType: 'image' },
  buttonSuccess: { label: 'Success Button', description: 'Confirm/success button style', category: 'buttons', inputType: 'image' },
  borderFrame: { label: 'Border Frame', description: 'Decorative border for large panels', category: 'borders', inputType: 'image' },
  borderFrameSmall: { label: 'Small Border Frame', description: 'Decorative border for smaller elements', category: 'borders', inputType: 'image' },
  iconHeart: { label: 'Heart Icon (Filled)', description: 'Custom filled heart for lives display', category: 'icons', inputType: 'image' },
  iconHeartEmpty: { label: 'Heart Icon (Empty)', description: 'Custom empty heart for lives display', category: 'icons', inputType: 'image' },
  iconSword: { label: 'Sword Icon', description: 'Attack/combat icon', category: 'icons', inputType: 'image' },
  iconShield: { label: 'Shield Icon', description: 'Defense/protection icon', category: 'icons', inputType: 'image' },
  overlayVignette: { label: 'Vignette Overlay', description: 'Edge darkening effect', category: 'effects', inputType: 'image' },
  overlayNoise: { label: 'Noise Overlay', description: 'Texture noise overlay', category: 'effects', inputType: 'image' },

  // Color settings
  colorBgPrimary: { label: 'Page Background', description: 'Main page background color', category: 'colors', inputType: 'color' },
  colorBgSecondary: { label: 'Panel Background', description: 'Panel and card background color', category: 'colors', inputType: 'color' },
  colorBgNavbar: { label: 'Navbar Background', description: 'Navigation bar background color', category: 'colors', inputType: 'color' },
  colorBgInput: { label: 'Input Background', description: 'Input field background color', category: 'colors', inputType: 'color' },
  colorTextPrimary: { label: 'Primary Text', description: 'Main text color', category: 'colors', inputType: 'color' },
  colorTextSecondary: { label: 'Secondary Text', description: 'Muted/secondary text color', category: 'colors', inputType: 'color' },
  colorTextHeading: { label: 'Heading Text', description: 'Heading and title color', category: 'colors', inputType: 'color' },
  colorBorderPrimary: { label: 'Primary Border', description: 'Main border color', category: 'colors', inputType: 'color' },
  colorBorderAccent: { label: 'Accent Border', description: 'Focus and highlight border color', category: 'colors', inputType: 'color' },
  colorAccentPrimary: { label: 'Primary Accent', description: 'Main accent color for buttons and links', category: 'colors', inputType: 'color' },
  colorAccentSuccess: { label: 'Success Color', description: 'Positive/success actions color', category: 'colors', inputType: 'color' },
  colorAccentDanger: { label: 'Danger Color', description: 'Warning/danger actions color', category: 'colors', inputType: 'color' },
  colorAccentMagic: { label: 'Magic Color', description: 'Magic/arcane effect color', category: 'colors', inputType: 'color' },

  // Style settings
  borderRadius: { label: 'Border Radius', description: 'Roundness of corners', category: 'styles', inputType: 'select' },
  borderWidth: { label: 'Border Width', description: 'Thickness of borders', category: 'styles', inputType: 'select' },
  shadowIntensity: { label: 'Shadow Intensity', description: 'Strength of drop shadows', category: 'styles', inputType: 'select' },
  fontFamily: { label: 'Font Style', description: 'Typography style', category: 'styles', inputType: 'select' },
};

export const ASSET_CATEGORIES = ['branding', 'backgrounds', 'buttons', 'borders', 'icons', 'effects', 'colors', 'styles'] as const;
export type AssetCategory = typeof ASSET_CATEGORIES[number];

/**
 * Load theme assets from localStorage
 */
export function loadThemeAssets(): ThemeAssets {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load theme assets:', e);
  }
  return {};
}

/**
 * Save theme assets to localStorage
 */
export function saveThemeAssets(assets: ThemeAssets): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
  } catch (e) {
    console.error('Failed to save theme assets:', e);
  }
}

/**
 * Get a single theme asset
 */
export function getThemeAsset(key: ThemeAssetKey): string | undefined {
  const assets = loadThemeAssets();
  return assets[key];
}

/**
 * Set a single theme asset
 */
export function setThemeAsset(key: ThemeAssetKey, value: string | undefined): void {
  const assets = loadThemeAssets();
  if (value) {
    assets[key] = value;
  } else {
    delete assets[key];
  }
  saveThemeAssets(assets);
}

/**
 * Delete a theme asset
 */
export function deleteThemeAsset(key: ThemeAssetKey): void {
  setThemeAsset(key, undefined);
}

/**
 * Convert a File to a data URL
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Export theme assets as a JSON file
 */
export function exportThemeAssets(): string {
  const assets = loadThemeAssets();
  return JSON.stringify(assets, null, 2);
}

/**
 * Import theme assets from a JSON string
 */
export function importThemeAssets(json: string): boolean {
  try {
    const assets = JSON.parse(json);
    saveThemeAssets(assets);
    return true;
  } catch (e) {
    console.error('Failed to import theme assets:', e);
    return false;
  }
}

/**
 * Get CSS custom properties for the current theme assets
 * These can be injected into the :root element
 */
export function getThemeAssetsCSSProperties(): Record<string, string> {
  const assets = loadThemeAssets();
  const properties: Record<string, string> = {};

  // Image assets
  if (assets.logo) properties['--asset-logo'] = `url(${assets.logo})`;
  if (assets.bgMain) properties['--asset-bg-main'] = `url(${assets.bgMain})`;
  if (assets.bgPanel) properties['--asset-bg-panel'] = `url(${assets.bgPanel})`;
  if (assets.bgGameArea) properties['--asset-bg-game-area'] = `url(${assets.bgGameArea})`;
  if (assets.buttonPrimary) properties['--asset-button-primary'] = `url(${assets.buttonPrimary})`;
  if (assets.borderFrame) properties['--asset-border-frame'] = `url(${assets.borderFrame})`;

  // Color settings
  if (assets.colorBgPrimary) properties['--theme-bg-primary'] = assets.colorBgPrimary;
  if (assets.colorBgSecondary) properties['--theme-bg-secondary'] = assets.colorBgSecondary;
  if (assets.colorBgNavbar) properties['--theme-bg-navbar'] = assets.colorBgNavbar;
  if (assets.colorBgInput) properties['--theme-bg-input'] = assets.colorBgInput;
  if (assets.colorTextPrimary) properties['--theme-text-primary'] = assets.colorTextPrimary;
  if (assets.colorTextSecondary) properties['--theme-text-secondary'] = assets.colorTextSecondary;
  if (assets.colorTextHeading) properties['--theme-text-heading'] = assets.colorTextHeading;
  if (assets.colorBorderPrimary) properties['--theme-border-primary'] = assets.colorBorderPrimary;
  if (assets.colorBorderAccent) properties['--theme-border-accent'] = assets.colorBorderAccent;
  if (assets.colorAccentPrimary) properties['--theme-accent-primary'] = assets.colorAccentPrimary;
  if (assets.colorAccentSuccess) properties['--theme-accent-success'] = assets.colorAccentSuccess;
  if (assets.colorAccentDanger) properties['--theme-accent-danger'] = assets.colorAccentDanger;
  if (assets.colorAccentMagic) properties['--theme-accent-magic'] = assets.colorAccentMagic;

  // Style settings
  if (assets.borderRadius) properties['--theme-border-radius'] = assets.borderRadius;
  if (assets.borderWidth) properties['--theme-border-width'] = assets.borderWidth;

  return properties;
}

/**
 * Apply theme assets as CSS custom properties to the document
 */
export function applyThemeAssets(): void {
  const properties = getThemeAssetsCSSProperties();
  const root = document.documentElement;

  for (const [key, value] of Object.entries(properties)) {
    root.style.setProperty(key, value);
  }
}

// Subscribe to changes (for React components)
type ThemeAssetsListener = (assets: ThemeAssets) => void;
const listeners: Set<ThemeAssetsListener> = new Set();

export function subscribeToThemeAssets(listener: ThemeAssetsListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyThemeAssetsChanged(): void {
  const assets = loadThemeAssets();
  listeners.forEach(listener => listener(assets));
  applyThemeAssets();
}
