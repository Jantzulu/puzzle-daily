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
 *
 * Images are stored in Supabase Storage for unlimited size, while settings are in localStorage.
 */

import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'theme_assets';
const STORAGE_BUCKET = 'theme-assets';

export interface ThemeAssets {
  // Branding
  logo?: string; // data URL or external URL
  logoAlt?: string; // Alt text for logo
  siteTitle?: string; // Site title (default: "Puzzle Daily")
  siteSubtitle?: string; // Secondary title shown next to main title
  siteSubtitleColor?: string; // Subtitle text color
  siteSubtitleSize?: string; // Subtitle font size (small, medium, large)

  // Navigation labels (customizable button text)
  navLabelPlay?: string;       // "Play" button label
  navLabelCompendium?: string; // "Compendium" button label
  navLabelEditor?: string;     // "Map Editor" button label
  navLabelAssets?: string;     // "Assets" button label

  // Backgrounds
  bgMain?: string; // Main page background
  bgPanel?: string; // Panel/card background
  bgGameArea?: string; // Underground/cave background for game area
  bgNavbar?: string; // Navigation bar background
  bgCard?: string; // Inner card background image (heroes, enemies, items)

  // Background tiling options (true/'true' = tile/repeat, false/undefined = cover/stretch)
  bgMainTile?: boolean | string;
  bgPanelTile?: boolean | string;
  bgCardTile?: boolean | string;

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

  // Navigation & Tab Icons (emoji/text)
  iconNavPlay?: string;       // Icon for Play nav button (default: ⚔)
  iconNavCompendium?: string; // Icon for Compendium nav button (default: 📖)
  iconNavEditor?: string;     // Icon for Map Editor nav button (default: 🛠)
  iconNavAssets?: string;     // Icon for Assets nav button (default: 📦)

  // Compendium Tab Icons (emoji/text)
  iconTabHeroes?: string;       // Icon for Heroes tab (default: ⚔️)
  iconTabEnemies?: string;      // Icon for Enemies tab (default: 👹)
  iconTabEnchantments?: string; // Icon for Enchantments tab (default: ✨)
  iconTabTiles?: string;        // Icon for Dungeon Tiles tab (default: 🧱)
  iconTabItems?: string;        // Icon for Items tab (default: 💎)

  // Overlay effects
  overlayVignette?: string;
  overlayNoise?: string;

  // === COLOR SETTINGS ===
  // Background colors
  colorBgPrimary?: string;    // Main page background color
  colorBgSecondary?: string;  // Panel/card background color
  colorBgCard?: string;       // Inner card background (heroes, enemies, items)
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

  // Button colors
  colorButtonBg?: string;         // Default button background
  colorButtonBorder?: string;     // Default button border
  colorButtonPrimaryBg?: string;  // Primary button background
  colorButtonPrimaryBorder?: string; // Primary button border
  colorButtonDangerBg?: string;   // Danger button background
  colorButtonDangerBorder?: string; // Danger button border

  // Preview/thumbnail backgrounds
  // Entity previews (heroes, enemies) - typically shown on tile backgrounds
  colorBgPreviewEntity?: string;        // Background color for hero/enemy previews
  bgPreviewEntity?: string;             // Background image for hero/enemy previews (e.g., a tile sprite)
  bgPreviewEntityTile?: boolean | string; // Tile (repeat) the entity preview background

  // Other asset previews (tiles, items, enchantments, etc.)
  colorBgPreviewAsset?: string;         // Background color for other asset previews
  bgPreviewAsset?: string;              // Background image for other asset previews
  bgPreviewAssetTile?: boolean | string; // Tile (repeat) the asset preview background

  // Legacy/fallback (used if specific ones aren't set)
  colorBgPreview?: string;        // Fallback background for asset thumbnail previews
  bgPreview?: string;             // Fallback background image for asset thumbnail previews
  bgPreviewTile?: boolean | string; // Tile (repeat) the preview background image

  // === STYLE SETTINGS ===
  borderRadius?: string;        // Border radius (e.g., "4px", "8px", "0px")
  borderWidth?: string;         // Border width (e.g., "1px", "2px", "3px")
  shadowIntensity?: string;     // Shadow intensity ("none", "light", "medium", "heavy")
  fontFamily?: string;          // Font family override (applies to body text)
  fontFamilyHeading?: string;   // Font family for headings/titles
  fontSizeBody?: string;        // Body text size multiplier
  fontSizeHeading?: string;     // Heading text size multiplier
}

export type ThemeAssetKey = keyof ThemeAssets;

// Asset metadata for the editor UI
export const THEME_ASSET_CONFIG: Record<ThemeAssetKey, { label: string; description: string; category: string; inputType?: 'image' | 'text' | 'color' | 'select' | 'toggle' }> = {
  // Branding
  logo: { label: 'Logo', description: 'Logo image shown in navbar (recommended: PNG with transparency, ~32-48px height)', category: 'branding', inputType: 'image' },
  logoAlt: { label: 'Logo Alt Text', description: 'Alternative text for accessibility', category: 'branding', inputType: 'text' },
  siteTitle: { label: 'Site Title', description: 'Title shown in navbar (default: "Puzzle Daily")', category: 'branding', inputType: 'text' },
  siteSubtitle: { label: 'Site Subtitle', description: 'Secondary title shown next to main title (e.g., "The Daily Dungeon Puzzle")', category: 'branding', inputType: 'text' },
  siteSubtitleColor: { label: 'Subtitle Color', description: 'Color for the subtitle text', category: 'branding', inputType: 'color' },
  siteSubtitleSize: { label: 'Subtitle Size', description: 'Font size for the subtitle (small, medium, large)', category: 'branding', inputType: 'select' },
  navLabelPlay: { label: 'Play Button Label', description: 'Text for Play navigation button (default: "Play")', category: 'branding', inputType: 'text' },
  navLabelCompendium: { label: 'Compendium Button Label', description: 'Text for Compendium navigation button (default: "Compendium")', category: 'branding', inputType: 'text' },
  navLabelEditor: { label: 'Editor Button Label', description: 'Text for Map Editor navigation button (default: "Map Editor")', category: 'branding', inputType: 'text' },
  navLabelAssets: { label: 'Assets Button Label', description: 'Text for Assets navigation button (default: "Assets")', category: 'branding', inputType: 'text' },
  // Images
  bgMain: { label: 'Main Background', description: 'Background for the entire page', category: 'backgrounds', inputType: 'image' },
  bgMainTile: { label: 'Tile Main Background', description: 'Tile (repeat) instead of stretch to cover', category: 'backgrounds', inputType: 'toggle' },
  bgPanel: { label: 'Panel Background', description: 'Background texture for panels and cards', category: 'backgrounds', inputType: 'image' },
  bgPanelTile: { label: 'Tile Panel Background', description: 'Tile (repeat) instead of stretch to cover', category: 'backgrounds', inputType: 'toggle' },
  bgCard: { label: 'Card Background', description: 'Background image for inner cards (heroes, enemies, items)', category: 'backgrounds', inputType: 'image' },
  bgCardTile: { label: 'Tile Card Background', description: 'Tile (repeat) instead of stretch to cover', category: 'backgrounds', inputType: 'toggle' },
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
  iconNavPlay: { label: 'Play Nav Icon', description: 'Icon/emoji for Play button in navbar (default: ⚔)', category: 'icons', inputType: 'text' },
  iconNavCompendium: { label: 'Compendium Nav Icon', description: 'Icon/emoji for Compendium button in navbar (default: 📖)', category: 'icons', inputType: 'text' },
  iconNavEditor: { label: 'Editor Nav Icon', description: 'Icon/emoji for Map Editor button in navbar (default: 🛠)', category: 'icons', inputType: 'text' },
  iconNavAssets: { label: 'Assets Nav Icon', description: 'Icon/emoji for Assets button in navbar (default: 📦)', category: 'icons', inputType: 'text' },
  iconTabHeroes: { label: 'Heroes Tab Icon', description: 'Icon/emoji for Heroes tab in Compendium (default: ⚔️)', category: 'icons', inputType: 'text' },
  iconTabEnemies: { label: 'Enemies Tab Icon', description: 'Icon/emoji for Enemies tab in Compendium (default: 👹)', category: 'icons', inputType: 'text' },
  iconTabEnchantments: { label: 'Enchantments Tab Icon', description: 'Icon/emoji for Enchantments tab in Compendium (default: ✨)', category: 'icons', inputType: 'text' },
  iconTabTiles: { label: 'Tiles Tab Icon', description: 'Icon/emoji for Dungeon Tiles tab in Compendium (default: 🧱)', category: 'icons', inputType: 'text' },
  iconTabItems: { label: 'Items Tab Icon', description: 'Icon/emoji for Items tab in Compendium (default: 💎)', category: 'icons', inputType: 'text' },
  overlayVignette: { label: 'Vignette Overlay', description: 'Edge darkening effect', category: 'effects', inputType: 'image' },
  overlayNoise: { label: 'Noise Overlay', description: 'Texture noise overlay', category: 'effects', inputType: 'image' },

  // Color settings
  colorBgPrimary: { label: 'Page Background', description: 'Main page background color', category: 'colors', inputType: 'color' },
  colorBgSecondary: { label: 'Panel Background', description: 'Outer panel background color', category: 'colors', inputType: 'color' },
  colorBgCard: { label: 'Card Background', description: 'Inner card background (heroes, enemies, items)', category: 'colors', inputType: 'color' },
  colorBgNavbar: { label: 'Navbar Background', description: 'Navigation bar background color', category: 'colors', inputType: 'color' },
  colorBgInput: { label: 'Input Background', description: 'Input field background color', category: 'colors', inputType: 'color' },
  colorTextPrimary: { label: 'Primary Text', description: 'Main text color', category: 'colors', inputType: 'color' },
  colorTextSecondary: { label: 'Secondary Text', description: 'Muted/secondary text color', category: 'colors', inputType: 'color' },
  colorTextHeading: { label: 'Heading Text', description: 'Heading and title color', category: 'colors', inputType: 'color' },
  colorBorderPrimary: { label: 'Primary Border', description: 'Main border color', category: 'colors', inputType: 'color' },
  colorBorderAccent: { label: 'Accent Border', description: 'Focus and highlight border color', category: 'colors', inputType: 'color' },
  colorAccentPrimary: { label: 'Primary Accent', description: 'Main accent color for links', category: 'colors', inputType: 'color' },
  colorAccentSuccess: { label: 'Success Color', description: 'Positive/success actions color', category: 'colors', inputType: 'color' },
  colorAccentDanger: { label: 'Danger Color', description: 'Warning/danger actions color', category: 'colors', inputType: 'color' },
  colorAccentMagic: { label: 'Magic Color', description: 'Magic/arcane effect color', category: 'colors', inputType: 'color' },
  colorButtonBg: { label: 'Button Background', description: 'Default button background color', category: 'colors', inputType: 'color' },
  colorButtonBorder: { label: 'Button Border', description: 'Default button border color', category: 'colors', inputType: 'color' },
  colorButtonPrimaryBg: { label: 'Primary Button Bg', description: 'Primary/action button background', category: 'colors', inputType: 'color' },
  colorButtonPrimaryBorder: { label: 'Primary Button Border', description: 'Primary button border color', category: 'colors', inputType: 'color' },
  colorButtonDangerBg: { label: 'Danger Button Bg', description: 'Danger/warning button background', category: 'colors', inputType: 'color' },
  colorButtonDangerBorder: { label: 'Danger Button Border', description: 'Danger button border color', category: 'colors', inputType: 'color' },
  // Entity preview backgrounds (heroes, enemies)
  colorBgPreviewEntity: { label: 'Entity Preview Color', description: 'Background color for hero/enemy previews', category: 'colors', inputType: 'color' },
  bgPreviewEntity: { label: 'Entity Preview Image', description: 'Background image for hero/enemy previews (e.g., a floor tile)', category: 'backgrounds', inputType: 'image' },
  bgPreviewEntityTile: { label: 'Tile Entity Preview', description: 'Tile (repeat) the entity preview background', category: 'backgrounds', inputType: 'toggle' },

  // Other asset preview backgrounds (tiles, items, enchantments)
  colorBgPreviewAsset: { label: 'Asset Preview Color', description: 'Background color for tile/item/enchantment previews', category: 'colors', inputType: 'color' },
  bgPreviewAsset: { label: 'Asset Preview Image', description: 'Background image for tile/item/enchantment previews', category: 'backgrounds', inputType: 'image' },
  bgPreviewAssetTile: { label: 'Tile Asset Preview', description: 'Tile (repeat) the asset preview background', category: 'backgrounds', inputType: 'toggle' },

  // Legacy/fallback preview backgrounds
  colorBgPreview: { label: 'Preview Background (Fallback)', description: 'Default background color if specific ones not set', category: 'colors', inputType: 'color' },
  bgPreview: { label: 'Preview Image (Fallback)', description: 'Default background image if specific ones not set', category: 'backgrounds', inputType: 'image' },
  bgPreviewTile: { label: 'Tile Preview (Fallback)', description: 'Tile the fallback preview background', category: 'backgrounds', inputType: 'toggle' },

  // Style settings
  borderRadius: { label: 'Border Radius', description: 'Roundness of corners', category: 'styles', inputType: 'select' },
  borderWidth: { label: 'Border Width', description: 'Thickness of borders', category: 'styles', inputType: 'select' },
  shadowIntensity: { label: 'Shadow Intensity', description: 'Strength of drop shadows', category: 'styles', inputType: 'select' },
  fontFamily: { label: 'Body Font', description: 'Font for body text and UI elements', category: 'styles', inputType: 'select' },
  fontFamilyHeading: { label: 'Heading Font', description: 'Font for titles and headings', category: 'styles', inputType: 'select' },
  fontSizeBody: { label: 'Body Text Size', description: 'Size of body text', category: 'styles', inputType: 'select' },
  fontSizeHeading: { label: 'Heading Size', description: 'Size of headings and titles', category: 'styles', inputType: 'select' },
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
export function saveThemeAssets(assets: ThemeAssets): { success: boolean; error?: string } {
  try {
    const json = JSON.stringify(assets);
    const sizeKB = Math.round(json.length / 1024);

    // Check if we're approaching localStorage limits (typically 5-10MB)
    if (sizeKB > 4000) {
      return {
        success: false,
        error: `Theme data is too large (${sizeKB}KB). Try using smaller images or fewer custom assets.`
      };
    }

    localStorage.setItem(STORAGE_KEY, json);
    return { success: true };
  } catch (e) {
    console.error('Failed to save theme assets:', e);
    if (e instanceof Error && e.name === 'QuotaExceededError') {
      return {
        success: false,
        error: 'Storage quota exceeded. Try removing some images or using smaller files. Images are automatically compressed, but very large images may still exceed limits.'
      };
    }
    return { success: false, error: 'Failed to save theme settings.' };
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
 * Convert a File to a data URL (with optional compression for images)
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
 * Compress an image file and return as data URL
 * Uses canvas to resize and compress images
 */
export function compressImage(
  file: File,
  maxWidth: number = 512,
  maxHeight: number = 512,
  quality: number = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      let { width, height } = img;

      // Calculate new dimensions maintaining aspect ratio
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;

      if (ctx) {
        // Use pixelated rendering for small images (likely pixel art)
        if (img.width <= 64 && img.height <= 64) {
          ctx.imageSmoothingEnabled = false;
        }
        ctx.drawImage(img, 0, 0, width, height);

        // Try WebP first (better compression), fall back to JPEG for photos or PNG for transparency
        const isPng = file.type === 'image/png';
        const format = isPng ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(format, quality);

        resolve(dataUrl);
      } else {
        reject(new Error('Could not get canvas context'));
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));

    // Read the file as data URL first
    const reader = new FileReader();
    reader.onload = () => {
      img.src = reader.result as string;
    };
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
  if (assets.bgCard) properties['--asset-bg-card'] = `url(${assets.bgCard})`;
  if (assets.bgGameArea) properties['--asset-bg-game-area'] = `url(${assets.bgGameArea})`;
  if (assets.buttonPrimary) properties['--asset-button-primary'] = `url(${assets.buttonPrimary})`;
  if (assets.borderFrame) properties['--asset-border-frame'] = `url(${assets.borderFrame})`;

  // Tiling options - always set both repeat and size properties explicitly
  // This ensures toggling works correctly (CSS fallbacks don't apply when variable is unset)
  // Handle both boolean true and string 'true' (from storage)
  if (assets.bgMainTile === true || assets.bgMainTile === 'true') {
    properties['--asset-bg-main-repeat'] = 'repeat';
    properties['--asset-bg-main-size'] = 'auto';
  } else {
    properties['--asset-bg-main-repeat'] = 'no-repeat';
    properties['--asset-bg-main-size'] = 'cover';
  }
  if (assets.bgPanelTile === true || assets.bgPanelTile === 'true') {
    properties['--asset-bg-panel-repeat'] = 'repeat';
    properties['--asset-bg-panel-size'] = 'auto';
  } else {
    properties['--asset-bg-panel-repeat'] = 'no-repeat';
    properties['--asset-bg-panel-size'] = 'cover';
  }
  if (assets.bgCardTile === true || assets.bgCardTile === 'true') {
    properties['--asset-bg-card-repeat'] = 'repeat';
    properties['--asset-bg-card-size'] = 'auto';
  } else {
    properties['--asset-bg-card-repeat'] = 'no-repeat';
    properties['--asset-bg-card-size'] = 'cover';
  }

  // Color settings
  if (assets.colorBgPrimary) properties['--theme-bg-primary'] = assets.colorBgPrimary;
  if (assets.colorBgSecondary) properties['--theme-bg-secondary'] = assets.colorBgSecondary;
  if (assets.colorBgCard) properties['--theme-bg-card'] = assets.colorBgCard;
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

  // Button colors
  if (assets.colorButtonBg) properties['--theme-button-bg'] = assets.colorButtonBg;
  if (assets.colorButtonBorder) properties['--theme-button-border'] = assets.colorButtonBorder;
  if (assets.colorButtonPrimaryBg) properties['--theme-button-primary-bg'] = assets.colorButtonPrimaryBg;
  if (assets.colorButtonPrimaryBorder) properties['--theme-button-primary-border'] = assets.colorButtonPrimaryBorder;
  if (assets.colorButtonDangerBg) properties['--theme-button-danger-bg'] = assets.colorButtonDangerBg;
  if (assets.colorButtonDangerBorder) properties['--theme-button-danger-border'] = assets.colorButtonDangerBorder;
  // Entity preview backgrounds (heroes, enemies)
  if (assets.colorBgPreviewEntity) properties['--theme-bg-preview-entity'] = assets.colorBgPreviewEntity;
  if (assets.bgPreviewEntity) properties['--asset-bg-preview-entity'] = `url(${assets.bgPreviewEntity})`;
  if (assets.bgPreviewEntityTile === true || assets.bgPreviewEntityTile === 'true') {
    properties['--asset-bg-preview-entity-repeat'] = 'repeat';
    properties['--asset-bg-preview-entity-size'] = 'auto';
  } else {
    properties['--asset-bg-preview-entity-repeat'] = 'no-repeat';
    properties['--asset-bg-preview-entity-size'] = 'cover';
  }

  // Asset preview backgrounds (tiles, items, enchantments)
  if (assets.colorBgPreviewAsset) properties['--theme-bg-preview-asset'] = assets.colorBgPreviewAsset;
  if (assets.bgPreviewAsset) properties['--asset-bg-preview-asset'] = `url(${assets.bgPreviewAsset})`;
  if (assets.bgPreviewAssetTile === true || assets.bgPreviewAssetTile === 'true') {
    properties['--asset-bg-preview-asset-repeat'] = 'repeat';
    properties['--asset-bg-preview-asset-size'] = 'auto';
  } else {
    properties['--asset-bg-preview-asset-repeat'] = 'no-repeat';
    properties['--asset-bg-preview-asset-size'] = 'cover';
  }

  // Fallback preview backgrounds
  if (assets.colorBgPreview) properties['--theme-bg-preview'] = assets.colorBgPreview;
  if (assets.bgPreview) properties['--asset-bg-preview'] = `url(${assets.bgPreview})`;
  if (assets.bgPreviewTile === true || assets.bgPreviewTile === 'true') {
    properties['--asset-bg-preview-repeat'] = 'repeat';
    properties['--asset-bg-preview-size'] = 'auto';
  } else {
    properties['--asset-bg-preview-repeat'] = 'no-repeat';
    properties['--asset-bg-preview-size'] = 'cover';
  }

  // Style settings
  if (assets.borderRadius) properties['--theme-border-radius'] = assets.borderRadius;
  if (assets.borderWidth) properties['--theme-border-width'] = assets.borderWidth;

  // Font family - map option values to actual CSS font-family strings
  const fontMap: Record<string, string> = {
    'medieval': "'Almendra', serif",
    'pixel': "'Press Start 2P', monospace",
    'fantasy': "'MedievalSharp', cursive",
    'handwritten': "'Caveat', cursive",
    'serif': "'Crimson Text', Georgia, serif",
    'gothic': "'UnifrakturCook', cursive",
    'runic': "'Noto Sans Runic', sans-serif",
    'elegant': "'Cinzel', serif",
    'grenze': "'Grenze Gotisch', serif",
    'germania': "'Germania One', sans-serif",
    'jacquard': "'Jacquard 24', serif",
    'jacquarda': "'Jacquarda Bastarda 9', serif",
    'amarante': "'Amarante', serif",
    'faculty': "'Faculty Glyphic', serif",
  };

  // Body font
  if (assets.fontFamily && assets.fontFamily !== 'default' && fontMap[assets.fontFamily]) {
    properties['--theme-font-family'] = fontMap[assets.fontFamily];
  }

  // Heading font (separate from body)
  if (assets.fontFamilyHeading && assets.fontFamilyHeading !== 'default' && fontMap[assets.fontFamilyHeading]) {
    properties['--theme-font-family-heading'] = fontMap[assets.fontFamilyHeading];
  }

  // Font sizes - convert size names to pixel values
  const fontSizeMap: Record<string, string> = {
    'x-small': '12px',
    'small': '14px',
    'medium': '16px',
    'large': '18px',
    'x-large': '20px',
  };

  if (assets.fontSizeBody && assets.fontSizeBody !== 'medium' && fontSizeMap[assets.fontSizeBody]) {
    properties['--theme-font-size-body-px'] = fontSizeMap[assets.fontSizeBody];
  }
  if (assets.fontSizeHeading && assets.fontSizeHeading !== 'medium' && fontSizeMap[assets.fontSizeHeading]) {
    properties['--theme-font-size-heading-px'] = fontSizeMap[assets.fontSizeHeading];
  }

  return properties;
}

// All possible CSS variable names that can be set by theme assets
const ALL_THEME_CSS_VARS = [
  '--asset-logo',
  '--asset-bg-main',
  '--asset-bg-panel',
  '--asset-bg-card',
  '--asset-bg-game-area',
  '--asset-button-primary',
  '--asset-border-frame',
  '--asset-bg-main-repeat',
  '--asset-bg-main-size',
  '--asset-bg-panel-repeat',
  '--asset-bg-panel-size',
  '--asset-bg-card-repeat',
  '--asset-bg-card-size',
  '--theme-bg-primary',
  '--theme-bg-secondary',
  '--theme-bg-card',
  '--theme-bg-navbar',
  '--theme-bg-input',
  '--theme-text-primary',
  '--theme-text-secondary',
  '--theme-text-heading',
  '--theme-border-primary',
  '--theme-border-accent',
  '--theme-accent-primary',
  '--theme-accent-success',
  '--theme-accent-danger',
  '--theme-accent-magic',
  '--theme-button-bg',
  '--theme-button-border',
  '--theme-button-primary-bg',
  '--theme-button-primary-border',
  '--theme-button-danger-bg',
  '--theme-button-danger-border',
  // Entity preview backgrounds (heroes, enemies)
  '--theme-bg-preview-entity',
  '--asset-bg-preview-entity',
  '--asset-bg-preview-entity-repeat',
  '--asset-bg-preview-entity-size',
  // Asset preview backgrounds (tiles, items, enchantments)
  '--theme-bg-preview-asset',
  '--asset-bg-preview-asset',
  '--asset-bg-preview-asset-repeat',
  '--asset-bg-preview-asset-size',
  // Fallback preview backgrounds
  '--theme-bg-preview',
  '--asset-bg-preview',
  '--asset-bg-preview-repeat',
  '--asset-bg-preview-size',
  '--theme-border-radius',
  '--theme-border-width',
  '--theme-font-family',
  '--theme-font-family-heading',
  '--theme-font-size-body-px',
  '--theme-font-size-heading-px',
];

/**
 * Apply theme assets as CSS custom properties to the document
 * Also removes any CSS variables that are no longer in use
 */
export function applyThemeAssets(): void {
  const properties = getThemeAssetsCSSProperties();
  const root = document.documentElement;

  // First, remove all theme CSS variables (so defaults can take over)
  for (const varName of ALL_THEME_CSS_VARS) {
    root.style.removeProperty(varName);
  }

  // Then set only the ones that have values
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
  // Clear the preview background cache so it reloads with new settings
  clearPreviewBgCache();
}

// ==========================================
// SUPABASE STORAGE FOR THEME IMAGES
// ==========================================

/**
 * Check if a string is a Supabase Storage URL
 */
export function isSupabaseStorageUrl(url: string): boolean {
  return url.includes('supabase.co/storage/v1/object/public/');
}

/**
 * Check if a string is a data URL (base64)
 */
export function isDataUrl(url: string): boolean {
  return url.startsWith('data:');
}

/**
 * Convert a data URL to a Blob
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
}

/**
 * Generate a unique filename for a theme asset
 */
function generateAssetFilename(assetKey: string, mimeType: string): string {
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
  const timestamp = Date.now();
  return `${assetKey}_${timestamp}.${ext}`;
}

/**
 * Upload a theme image to Supabase Storage
 * Returns the public URL on success, or null on failure
 */
export async function uploadThemeImageToStorage(
  assetKey: string,
  dataUrl: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    // Convert data URL to blob
    const blob = dataUrlToBlob(dataUrl);
    const filename = generateAssetFilename(assetKey, blob.type);
    const filePath = `public/${filename}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, blob, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      console.error('Failed to upload to Supabase Storage:', uploadError);
      return { url: null, error: uploadError.message };
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    if (!urlData?.publicUrl) {
      return { url: null, error: 'Failed to get public URL' };
    }

    return { url: urlData.publicUrl, error: null };
  } catch (e) {
    console.error('Error uploading theme image:', e);
    return { url: null, error: e instanceof Error ? e.message : 'Upload failed' };
  }
}

/**
 * Delete a theme image from Supabase Storage
 */
export async function deleteThemeImageFromStorage(url: string): Promise<boolean> {
  try {
    if (!isSupabaseStorageUrl(url)) {
      return true; // Not a storage URL, nothing to delete
    }

    // Extract the file path from the URL
    // URL format: https://xxx.supabase.co/storage/v1/object/public/theme-assets/public/filename.png
    const match = url.match(/\/theme-assets\/(.+)$/);
    if (!match) {
      console.warn('Could not extract file path from URL:', url);
      return false;
    }

    const filePath = match[1];
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([filePath]);

    if (error) {
      console.error('Failed to delete from Supabase Storage:', error);
      return false;
    }

    return true;
  } catch (e) {
    console.error('Error deleting theme image:', e);
    return false;
  }
}

/**
 * Upload an image and return the storage URL, or fall back to data URL on error
 */
export async function uploadImageWithFallback(
  assetKey: string,
  dataUrl: string
): Promise<{ url: string; isStorageUrl: boolean; error: string | null }> {
  const result = await uploadThemeImageToStorage(assetKey, dataUrl);

  if (result.url) {
    return { url: result.url, isStorageUrl: true, error: null };
  }

  // Fall back to data URL if upload fails
  console.warn('Falling back to data URL for', assetKey);
  return { url: dataUrl, isStorageUrl: false, error: result.error };
}

// ==========================================
// CANVAS BACKGROUND DRAWING UTILITIES
// ==========================================

// Preview type for differentiating entity (heroes/enemies) vs asset (tiles/items/enchantments) backgrounds
export type PreviewType = 'entity' | 'asset';

// Cache for preview background images (keyed by type)
const previewBgImageCache: Record<string, { url: string; img: HTMLImageElement }> = {};

/**
 * Get the preview background color from theme settings
 * @param type - Optional type: 'entity' for heroes/enemies, 'asset' for tiles/items/enchantments
 */
export function getPreviewBgColor(type?: PreviewType): string {
  const style = getComputedStyle(document.documentElement);

  if (type === 'entity') {
    // Try entity-specific, then fallback
    const entityColor = style.getPropertyValue('--theme-bg-preview-entity').trim();
    if (entityColor) return entityColor;
  } else if (type === 'asset') {
    // Try asset-specific, then fallback
    const assetColor = style.getPropertyValue('--theme-bg-preview-asset').trim();
    if (assetColor) return assetColor;
  }

  // Fallback to generic preview color or default
  return style.getPropertyValue('--theme-bg-preview').trim() || '#15100a';
}

/**
 * Get the preview background image URL from theme settings (without the url() wrapper)
 * @param type - Optional type: 'entity' for heroes/enemies, 'asset' for tiles/items/enchantments
 */
export function getPreviewBgImageUrl(type?: PreviewType): string | null {
  const style = getComputedStyle(document.documentElement);

  let cssValue = '';

  if (type === 'entity') {
    // Try entity-specific, then fallback
    cssValue = style.getPropertyValue('--asset-bg-preview-entity').trim();
  } else if (type === 'asset') {
    // Try asset-specific, then fallback
    cssValue = style.getPropertyValue('--asset-bg-preview-asset').trim();
  }

  // If no type-specific value, try fallback
  if (!cssValue || cssValue === 'none') {
    cssValue = style.getPropertyValue('--asset-bg-preview').trim();
  }

  if (!cssValue || cssValue === 'none') return null;

  // Extract URL from url(...)
  const match = cssValue.match(/url\(["']?([^"')]+)["']?\)/);
  return match ? match[1] : null;
}

/**
 * Check if preview background should be tiled
 * @param type - Optional type: 'entity' for heroes/enemies, 'asset' for tiles/items/enchantments
 */
export function getPreviewBgTiled(type?: PreviewType): boolean {
  const style = getComputedStyle(document.documentElement);

  if (type === 'entity') {
    const repeat = style.getPropertyValue('--asset-bg-preview-entity-repeat').trim();
    if (repeat) return repeat === 'repeat';
  } else if (type === 'asset') {
    const repeat = style.getPropertyValue('--asset-bg-preview-asset-repeat').trim();
    if (repeat) return repeat === 'repeat';
  }

  // Fallback
  const repeat = style.getPropertyValue('--asset-bg-preview-repeat').trim();
  return repeat === 'repeat';
}

/**
 * Draw the preview background on a canvas context.
 * Supports both solid color and image backgrounds (tiled or stretched).
 *
 * @param ctx - Canvas 2D rendering context
 * @param width - Canvas width
 * @param height - Canvas height
 * @param onComplete - Optional callback when background is drawn (needed for async image loading)
 * @param type - Optional type: 'entity' for heroes/enemies, 'asset' for tiles/items/enchantments
 */
export function drawPreviewBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  onComplete?: () => void,
  type?: PreviewType
): void {
  const bgColor = getPreviewBgColor(type);
  const bgImageUrl = getPreviewBgImageUrl(type);
  const tiled = getPreviewBgTiled(type);
  const cacheKey = type || 'default';

  // Always draw the background color first (as fallback)
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // If no background image, we're done
  if (!bgImageUrl) {
    onComplete?.();
    return;
  }

  // Check if we have the image cached
  const cached = previewBgImageCache[cacheKey];
  if (cached && cached.url === bgImageUrl && cached.img.complete) {
    drawBgImage(ctx, cached.img, width, height, tiled);
    onComplete?.();
    return;
  }

  // Load the background image
  const img = new Image();
  img.onload = () => {
    previewBgImageCache[cacheKey] = { url: bgImageUrl, img };
    drawBgImage(ctx, img, width, height, tiled);
    onComplete?.();
  };
  img.onerror = () => {
    // Failed to load, just use the color background
    onComplete?.();
  };
  img.src = bgImageUrl;
}

/**
 * Helper to draw the background image (tiled or stretched)
 */
function drawBgImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  tiled: boolean
): void {
  if (tiled) {
    // Create a pattern and fill
    const pattern = ctx.createPattern(img, 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    // Stretch to cover
    ctx.drawImage(img, 0, 0, width, height);
  }
}

/**
 * Clear the preview background image cache (call when theme changes)
 */
export function clearPreviewBgCache(): void {
  for (const key in previewBgImageCache) {
    delete previewBgImageCache[key];
  }
}
