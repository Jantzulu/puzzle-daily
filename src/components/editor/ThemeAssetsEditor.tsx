import React, { useState, useEffect, useRef } from 'react';
import {
  loadThemeAssets,
  setThemeAsset,
  deleteThemeAsset,
  compressImage,
  exportThemeAssets,
  importThemeAssets,
  notifyThemeAssetsChanged,
  uploadImageWithFallback,
  deleteThemeImageFromStorage,
  isSupabaseStorageUrl,
  THEME_ASSET_CONFIG,
  ASSET_CATEGORIES,
  type ThemeAssets,
  type ThemeAssetKey,
  type AssetCategory,
} from '../../utils/themeAssets';

// Default dungeon theme colors for reset functionality
const DEFAULT_COLORS: Partial<ThemeAssets> = {
  colorBgPrimary: '#0a0805',      // Page background (darkest)
  colorBgSecondary: '#2a2118',    // Panel background
  colorBgNavbar: '#3d3224',       // Navbar background
  colorBgInput: '#15100a',        // Input/dark panel background
  colorTextPrimary: '#f2e0b5',
  colorTextSecondary: '#7d6c52',
  colorTextHeading: '#d4a574',
  colorBorderPrimary: '#5a4a35',
  colorBorderAccent: '#c4915c',
  colorAccentPrimary: '#c4915c',
  colorAccentSuccess: '#556b2f',
  colorAccentDanger: '#c12525',
  colorAccentMagic: '#8a5fc4',
  colorButtonBg: '#44403c',
  colorButtonBorder: '#57534e',
  colorButtonPrimaryBg: '#8c5c37',
  colorButtonPrimaryBorder: '#c4915c',
  colorButtonDangerBg: '#841919',
  colorButtonDangerBorder: '#b91c1c',
};

// Style options
const BORDER_RADIUS_OPTIONS = [
  { value: '0px', label: 'Sharp (0px)' },
  { value: '2px', label: 'Pixel (2px)' },
  { value: '4px', label: 'Rounded (4px)' },
  { value: '8px', label: 'Soft (8px)' },
  { value: '12px', label: 'Very Soft (12px)' },
];

const BORDER_WIDTH_OPTIONS = [
  { value: '1px', label: 'Thin (1px)' },
  { value: '2px', label: 'Normal (2px)' },
  { value: '3px', label: 'Thick (3px)' },
  { value: '4px', label: 'Heavy (4px)' },
];

const SHADOW_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'heavy', label: 'Heavy' },
];

const FONT_OPTIONS = [
  { value: 'default', label: 'Default (Inter)' },
  { value: 'medieval', label: 'Medieval (Almendra)' },
  { value: 'pixel', label: 'Pixel (Press Start 2P)' },
  { value: 'fantasy', label: 'Fantasy (MedievalSharp)' },
  { value: 'handwritten', label: 'Handwritten (Caveat)' },
  { value: 'serif', label: 'Classic Serif (Crimson)' },
  { value: 'gothic', label: 'Gothic (UnifrakturCook)' },
  { value: 'elegant', label: 'Elegant (Cinzel)' },
  { value: 'grenze', label: 'Grenze Gotisch' },
  { value: 'germania', label: 'Germania One' },
  { value: 'jacquard', label: 'Jacquard 24' },
  { value: 'jacquarda', label: 'Jacquarda Bastarda 9' },
  { value: 'amarante', label: 'Amarante' },
  { value: 'faculty', label: 'Faculty Glyphic' },
];

const FONT_SIZE_OPTIONS = [
  { value: 'x-small', label: 'Extra Small (0.75x)' },
  { value: 'small', label: 'Small (0.875x)' },
  { value: 'medium', label: 'Medium (1x)' },
  { value: 'large', label: 'Large (1.125x)' },
  { value: 'x-large', label: 'Extra Large (1.25x)' },
];

const SUBTITLE_SIZE_OPTIONS = [
  { value: 'x-small', label: 'Extra Small' },
  { value: 'small', label: 'Small (default)' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'x-large', label: 'Extra Large (1.25x)' },
];

interface AssetUploadProps {
  assetKey: ThemeAssetKey;
  value?: string;
  onChange: (value: string | undefined) => void;
  onError?: (error: string) => void;
}

const AssetUpload: React.FC<AssetUploadProps> = ({ assetKey, value, onChange, onError }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const config = THEME_ASSET_CONFIG[assetKey];

  // Determine max dimensions based on asset type
  const getMaxDimensions = () => {
    if (assetKey === 'logo') return { maxWidth: 128, maxHeight: 64 };
    if (assetKey.startsWith('icon')) return { maxWidth: 64, maxHeight: 64 };
    if (assetKey.startsWith('bg')) return { maxWidth: 1024, maxHeight: 1024 };
    return { maxWidth: 512, maxHeight: 512 };
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsLoading(true);
      try {
        const { maxWidth, maxHeight } = getMaxDimensions();
        // Compress the image first
        const dataUrl = await compressImage(file, maxWidth, maxHeight, 0.85);

        // Upload to Supabase Storage (falls back to data URL if upload fails)
        const result = await uploadImageWithFallback(assetKey, dataUrl);

        if (result.error && !result.isStorageUrl) {
          // Show warning but still use the data URL
          console.warn('Using local storage fallback:', result.error);
        }

        onChange(result.url);

        if (result.isStorageUrl) {
          console.log(`Uploaded ${assetKey} to Supabase Storage`);
        }
      } catch (err) {
        console.error('Failed to load file:', err);
        onError?.('Failed to process image. Try a smaller file.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleRemove = async () => {
    // Delete from Supabase Storage if it's a storage URL
    if (value && isSupabaseStorageUrl(value)) {
      await deleteThemeImageFromStorage(value);
    }
    onChange(undefined);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  // For text fields like logoAlt
  if (config.inputType === 'text') {
    return (
      <div className="dungeon-panel-dark p-3">
        <label className="block text-sm font-medium text-copper-400 mb-1">{config.label}</label>
        <p className="text-xs text-stone-500 mb-2">{config.description}</p>
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="dungeon-input w-full"
          placeholder="Enter text..."
        />
      </div>
    );
  }

  return (
    <div className="dungeon-panel-dark p-3">
      <label className="block text-sm font-medium text-copper-400 mb-1">{config.label}</label>
      <p className="text-xs text-stone-500 mb-2">{config.description}</p>

      {isLoading ? (
        <div className="flex items-center justify-center py-4 text-stone-400">
          <span className="animate-pulse">Uploading to cloud...</span>
        </div>
      ) : value ? (
        <div className="space-y-2">
          {/* Preview */}
          <div className="relative bg-stone-800 rounded-pixel p-2 border border-stone-600 flex items-center justify-center min-h-[60px]">
            <img
              src={value}
              alt={config.label}
              className="max-w-full max-h-20 object-contain pixelated"
            />
            {/* Cloud/Local indicator */}
            <span
              className={`absolute top-1 right-1 text-xs px-1.5 py-0.5 rounded ${
                isSupabaseStorageUrl(value)
                  ? 'bg-arcane-900/80 text-arcane-300'
                  : 'bg-stone-700/80 text-stone-400'
              }`}
              title={isSupabaseStorageUrl(value) ? 'Stored in cloud' : 'Stored locally'}
            >
              {isSupabaseStorageUrl(value) ? '☁️' : '💾'}
            </span>
          </div>
          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => inputRef.current?.click()}
              className="dungeon-btn text-xs flex-1"
            >
              Replace
            </button>
            <button
              onClick={handleRemove}
              className="dungeon-btn-danger text-xs"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="dungeon-btn w-full text-sm"
        >
          Upload Image
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
};

interface ColorPickerProps {
  assetKey: ThemeAssetKey;
  value?: string;
  onChange: (value: string | undefined) => void;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ assetKey, value, onChange }) => {
  const config = THEME_ASSET_CONFIG[assetKey];
  const defaultColor = DEFAULT_COLORS[assetKey as keyof typeof DEFAULT_COLORS] || '#000000';
  const isCustom = value !== undefined && value !== defaultColor;

  const handleReset = () => {
    // Set to undefined to use the CSS default, then notify
    onChange(undefined);
  };

  return (
    <div className="dungeon-panel-dark p-3">
      <label className="block text-sm font-medium text-copper-400 mb-1">
        {config.label}
        {isCustom && <span className="ml-2 text-xs text-copper-600">(custom)</span>}
      </label>
      <p className="text-xs text-stone-500 mb-2">{config.description}</p>

      <div className="flex items-center gap-3">
        {/* Color picker */}
        <div className="relative">
          <input
            type="color"
            value={value || defaultColor}
            onChange={(e) => onChange(e.target.value)}
            className="w-12 h-10 rounded-pixel border-2 border-stone-600 cursor-pointer bg-transparent"
          />
        </div>

        {/* Hex input */}
        <input
          type="text"
          value={value || ''}
          onChange={(e) => {
            const val = e.target.value;
            if (val === '' || /^#[0-9A-Fa-f]{0,6}$/.test(val)) {
              onChange(val || undefined);
            }
          }}
          placeholder={defaultColor}
          className="dungeon-input flex-1 text-sm font-mono"
        />

        {/* Reset button - always visible */}
        <button
          onClick={handleReset}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            isCustom
              ? 'bg-copper-700 hover:bg-copper-600 text-parchment-100'
              : 'bg-stone-700 text-stone-500 cursor-default'
          }`}
          title={isCustom ? 'Reset to default' : 'Using default'}
          disabled={!isCustom}
        >
          {isCustom ? 'Reset' : 'Default'}
        </button>
      </div>

      {/* Preview swatch with label */}
      <div className="mt-2 flex items-center gap-2">
        <div
          className="flex-1 h-6 rounded-pixel border border-stone-600"
          style={{ backgroundColor: value || defaultColor }}
        />
        <span className="text-xs text-stone-500 font-mono">{value || defaultColor}</span>
      </div>
    </div>
  );
};

interface StyleSelectorProps {
  assetKey: ThemeAssetKey;
  value?: string;
  onChange: (value: string | undefined) => void;
}

const StyleSelector: React.FC<StyleSelectorProps> = ({ assetKey, value, onChange }) => {
  const config = THEME_ASSET_CONFIG[assetKey];

  let options: { value: string; label: string }[] = [];
  let defaultValue = '';

  switch (assetKey) {
    case 'borderRadius':
      options = BORDER_RADIUS_OPTIONS;
      defaultValue = '2px';
      break;
    case 'borderWidth':
      options = BORDER_WIDTH_OPTIONS;
      defaultValue = '2px';
      break;
    case 'shadowIntensity':
      options = SHADOW_OPTIONS;
      defaultValue = 'medium';
      break;
    case 'fontFamily':
    case 'fontFamilyHeading':
      options = FONT_OPTIONS;
      defaultValue = 'default';
      break;
    case 'fontSizeBody':
    case 'fontSizeHeading':
      options = FONT_SIZE_OPTIONS;
      defaultValue = 'medium';
      break;
    case 'siteSubtitleSize':
      options = SUBTITLE_SIZE_OPTIONS;
      defaultValue = 'small';
      break;
  }

  return (
    <div className="dungeon-panel-dark p-3">
      <label className="block text-sm font-medium text-copper-400 mb-1">{config.label}</label>
      <p className="text-xs text-stone-500 mb-2">{config.description}</p>

      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value === defaultValue ? undefined : option.value)}
            className={`px-3 py-2 rounded-pixel text-sm transition-all border-2 ${
              (value || defaultValue) === option.value
                ? 'bg-copper-700 border-copper-500 text-parchment-100'
                : 'bg-stone-800 border-stone-600 text-stone-400 hover:bg-stone-700 hover:text-parchment-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Preview for border radius */}
      {assetKey === 'borderRadius' && (
        <div className="mt-3">
          <div
            className="w-full h-12 bg-copper-700 border-2 border-copper-500"
            style={{ borderRadius: value || defaultValue }}
          />
        </div>
      )}

      {/* Preview for border width */}
      {assetKey === 'borderWidth' && (
        <div className="mt-3">
          <div
            className="w-full h-12 bg-stone-800 border-copper-500"
            style={{ borderWidth: value || defaultValue, borderStyle: 'solid' }}
          />
        </div>
      )}

      {/* Preview for font family */}
      {(assetKey === 'fontFamily' || assetKey === 'fontFamilyHeading') && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-stone-500">Preview:</p>
          <div
            className="p-3 bg-stone-800 rounded-pixel border border-stone-600"
            style={{
              fontFamily: (() => {
                const fontMap: Record<string, string> = {
                  'default': "'Inter', system-ui, sans-serif",
                  'medieval': "'Almendra', serif",
                  'pixel': "'Press Start 2P', monospace",
                  'fantasy': "'MedievalSharp', cursive",
                  'handwritten': "'Caveat', cursive",
                  'serif': "'Crimson Text', Georgia, serif",
                  'gothic': "'UnifrakturCook', cursive",
                  'elegant': "'Cinzel', serif",
                  'grenze': "'Grenze Gotisch', serif",
                  'germania': "'Germania One', sans-serif",
                  'jacquard': "'Jacquard 24', serif",
                  'jacquarda': "'Jacquarda Bastarda 9', serif",
                  'amarante': "'Amarante', serif",
                  'faculty': "'Faculty Glyphic', serif",
                };
                return fontMap[value || defaultValue] || fontMap['default'];
              })()
            }}
          >
            <p className="text-lg text-parchment-200">The quick brown fox</p>
            <p className="text-sm text-parchment-400">ABCDEFGHIJKLMNOPQRSTUVWXYZ</p>
            <p className="text-sm text-parchment-400">abcdefghijklmnopqrstuvwxyz</p>
            <p className="text-sm text-parchment-400">0123456789</p>
          </div>
        </div>
      )}

      {/* Preview for font size */}
      {(assetKey === 'fontSizeBody' || assetKey === 'fontSizeHeading') && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-stone-500">Preview:</p>
          <div
            className="p-3 bg-stone-800 rounded-pixel border border-stone-600"
            style={{
              fontSize: (() => {
                const sizeMap: Record<string, string> = {
                  'x-small': '12px',
                  'small': '14px',
                  'medium': '16px',
                  'large': '18px',
                  'x-large': '20px',
                };
                return sizeMap[value || defaultValue] || sizeMap['medium'];
              })()
            }}
          >
            <p className="text-parchment-200">The quick brown fox jumps over the lazy dog</p>
          </div>
        </div>
      )}
    </div>
  );
};

export const ThemeAssetsEditor: React.FC = () => {
  const [assets, setAssets] = useState<ThemeAssets>({});
  const [activeCategory, setActiveCategory] = useState<AssetCategory>('branding');
  const [error, setError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAssets(loadThemeAssets());
  }, []);

  const handleAssetChange = (key: ThemeAssetKey, value: string | undefined) => {
    setError(null);
    if (value) {
      setThemeAsset(key, value);
    } else {
      deleteThemeAsset(key);
    }
    // Check if save was successful
    const currentAssets = loadThemeAssets();
    setAssets(currentAssets);
    notifyThemeAssetsChanged();
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    // Auto-clear error after 5 seconds
    setTimeout(() => setError(null), 5000);
  };

  const handleExport = () => {
    const json = exportThemeAssets();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'theme-assets.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const text = await file.text();
      if (importThemeAssets(text)) {
        setAssets(loadThemeAssets());
        notifyThemeAssetsChanged();
      }
    }
    if (importInputRef.current) {
      importInputRef.current.value = '';
    }
  };

  const handleResetAllColors = () => {
    // Clear all color settings
    const colorKeys = Object.keys(THEME_ASSET_CONFIG).filter(
      key => THEME_ASSET_CONFIG[key as ThemeAssetKey].inputType === 'color'
    );
    colorKeys.forEach(key => deleteThemeAsset(key as ThemeAssetKey));
    setAssets(loadThemeAssets());
    notifyThemeAssetsChanged();
  };

  const handleResetAllStyles = () => {
    // Clear all style settings
    const styleKeys = Object.keys(THEME_ASSET_CONFIG).filter(
      key => THEME_ASSET_CONFIG[key as ThemeAssetKey].inputType === 'select'
    );
    styleKeys.forEach(key => deleteThemeAsset(key as ThemeAssetKey));
    setAssets(loadThemeAssets());
    notifyThemeAssetsChanged();
  };

  // Get assets for current category
  const categoryAssets = Object.entries(THEME_ASSET_CONFIG)
    .filter(([_, config]) => config.category === activeCategory)
    .map(([key]) => key as ThemeAssetKey);

  const categoryLabels: Record<AssetCategory, string> = {
    branding: 'Branding',
    backgrounds: 'Backgrounds',
    buttons: 'Buttons',
    borders: 'Borders',
    icons: 'Icons',
    effects: 'Effects',
    colors: 'Colors',
    styles: 'Styles',
  };

  const categoryIcons: Record<AssetCategory, string> = {
    branding: '🏷️',
    backgrounds: '🖼️',
    buttons: '🔘',
    borders: '🖼️',
    icons: '⚔️',
    effects: '✨',
    colors: '🎨',
    styles: '⚙️',
  };

  const renderAssetControl = (key: ThemeAssetKey) => {
    const config = THEME_ASSET_CONFIG[key];

    if (config.inputType === 'color') {
      return (
        <ColorPicker
          key={key}
          assetKey={key}
          value={assets[key]}
          onChange={(value) => handleAssetChange(key, value)}
        />
      );
    }

    if (config.inputType === 'select') {
      return (
        <StyleSelector
          key={key}
          assetKey={key}
          value={assets[key]}
          onChange={(value) => handleAssetChange(key, value)}
        />
      );
    }

    return (
      <AssetUpload
        key={key}
        assetKey={key}
        value={assets[key]}
        onChange={(value) => handleAssetChange(key, value)}
        onError={handleError}
      />
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-4 md:py-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold font-medieval text-copper-400 mb-2">Theme Assets</h2>
        <p className="text-sm text-stone-400">
          Customize colors, styles, and upload images to personalize the look of your game. Changes apply to both the editor and player-facing game.
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-blood-900/50 border border-blood-600 rounded-pixel text-blood-200 text-sm">
          {error}
        </div>
      )}

      {/* Import/Export */}
      <div className="flex gap-2 mb-6">
        <button onClick={handleExport} className="dungeon-btn text-sm">
          Export All Assets
        </button>
        <button onClick={() => importInputRef.current?.click()} className="dungeon-btn text-sm">
          Import Assets
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          className="hidden"
        />
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b-2 border-stone-700 pb-4">
        {ASSET_CATEGORIES.map((category) => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={`dungeon-tab flex items-center gap-1 ${activeCategory === category ? 'dungeon-tab-active' : ''}`}
          >
            <span>{categoryIcons[category]}</span>
            <span>{categoryLabels[category]}</span>
          </button>
        ))}
      </div>

      {/* Reset buttons for colors and styles */}
      {activeCategory === 'colors' && (
        <div className="mb-4">
          <button
            onClick={handleResetAllColors}
            className="dungeon-btn-danger text-sm"
          >
            Reset All Colors to Default
          </button>
        </div>
      )}
      {activeCategory === 'styles' && (
        <div className="mb-4">
          <button
            onClick={handleResetAllStyles}
            className="dungeon-btn-danger text-sm"
          >
            Reset All Styles to Default
          </button>
        </div>
      )}

      {/* Asset grid */}
      <div className={`grid gap-4 ${
        activeCategory === 'colors' || activeCategory === 'styles'
          ? 'grid-cols-1 sm:grid-cols-2'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      }`}>
        {categoryAssets.map((key) => renderAssetControl(key))}
      </div>

      {/* Usage hints based on category */}
      {activeCategory !== 'colors' && activeCategory !== 'styles' && (
        <div className="mt-8 parchment-panel p-4">
          <h3 className="font-medium text-parchment-800 mb-2">How to use custom assets</h3>
          <ul className="text-sm text-parchment-700 space-y-1 list-disc list-inside">
            <li>Upload images in PNG format with transparency for best results</li>
            <li>Background images work best as tileable textures or large images</li>
            <li>Button images can be 9-slice sprites for proper scaling</li>
            <li>Icons should be square (e.g., 32x32 or 64x64 pixels)</li>
            <li>Assets are stored locally and will sync with your puzzle skins</li>
          </ul>
        </div>
      )}

      {activeCategory === 'colors' && (
        <div className="mt-8 parchment-panel p-4">
          <h3 className="font-medium text-parchment-800 mb-2">Color Customization</h3>
          <ul className="text-sm text-parchment-700 space-y-1 list-disc list-inside">
            <li>Click the color swatch to open a color picker</li>
            <li>Enter hex codes directly (e.g., #ff0000 for red)</li>
            <li>Use the Reset button to restore individual colors to default</li>
            <li>Colors apply to UI elements throughout the game</li>
          </ul>
        </div>
      )}

      {activeCategory === 'styles' && (
        <div className="mt-8 parchment-panel p-4">
          <h3 className="font-medium text-parchment-800 mb-2">Style Settings</h3>
          <ul className="text-sm text-parchment-700 space-y-1 list-disc list-inside">
            <li>Border radius controls the roundness of corners</li>
            <li>Border width affects the thickness of element borders</li>
            <li>Shadow intensity controls the depth effect of panels</li>
            <li>Font style changes the typography throughout the game</li>
          </ul>
        </div>
      )}
    </div>
  );
};
