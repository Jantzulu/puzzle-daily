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
  // Logo
  logo?: string; // data URL or external URL
  logoAlt?: string; // Alt text for logo

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
}

export type ThemeAssetKey = keyof ThemeAssets;

// Asset metadata for the editor UI
export const THEME_ASSET_CONFIG: Record<ThemeAssetKey, { label: string; description: string; category: string }> = {
  logo: { label: 'Logo', description: 'Main game logo (recommended: PNG with transparency)', category: 'branding' },
  logoAlt: { label: 'Logo Alt Text', description: 'Alternative text for accessibility', category: 'branding' },
  bgMain: { label: 'Main Background', description: 'Background for the entire page', category: 'backgrounds' },
  bgPanel: { label: 'Panel Background', description: 'Background texture for panels and cards', category: 'backgrounds' },
  bgGameArea: { label: 'Game Area Background', description: 'Underground/cave background surrounding the dungeon', category: 'backgrounds' },
  bgNavbar: { label: 'Navbar Background', description: 'Navigation bar background', category: 'backgrounds' },
  buttonPrimary: { label: 'Primary Button', description: 'Main action button style', category: 'buttons' },
  buttonSecondary: { label: 'Secondary Button', description: 'Secondary button style', category: 'buttons' },
  buttonDanger: { label: 'Danger Button', description: 'Warning/delete button style', category: 'buttons' },
  buttonSuccess: { label: 'Success Button', description: 'Confirm/success button style', category: 'buttons' },
  borderFrame: { label: 'Border Frame', description: 'Decorative border for large panels', category: 'borders' },
  borderFrameSmall: { label: 'Small Border Frame', description: 'Decorative border for smaller elements', category: 'borders' },
  iconHeart: { label: 'Heart Icon (Filled)', description: 'Custom filled heart for lives display', category: 'icons' },
  iconHeartEmpty: { label: 'Heart Icon (Empty)', description: 'Custom empty heart for lives display', category: 'icons' },
  iconSword: { label: 'Sword Icon', description: 'Attack/combat icon', category: 'icons' },
  iconShield: { label: 'Shield Icon', description: 'Defense/protection icon', category: 'icons' },
  overlayVignette: { label: 'Vignette Overlay', description: 'Edge darkening effect', category: 'effects' },
  overlayNoise: { label: 'Noise Overlay', description: 'Texture noise overlay', category: 'effects' },
};

export const ASSET_CATEGORIES = ['branding', 'backgrounds', 'buttons', 'borders', 'icons', 'effects'] as const;
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

  if (assets.logo) properties['--asset-logo'] = `url(${assets.logo})`;
  if (assets.bgMain) properties['--asset-bg-main'] = `url(${assets.bgMain})`;
  if (assets.bgPanel) properties['--asset-bg-panel'] = `url(${assets.bgPanel})`;
  if (assets.bgGameArea) properties['--asset-bg-game-area'] = `url(${assets.bgGameArea})`;
  if (assets.buttonPrimary) properties['--asset-button-primary'] = `url(${assets.buttonPrimary})`;
  if (assets.borderFrame) properties['--asset-border-frame'] = `url(${assets.borderFrame})`;

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
