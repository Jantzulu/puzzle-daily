import React, { useState, useEffect, useRef } from 'react';
import {
  loadThemeAssets,
  saveThemeAssets,
  setThemeAsset,
  deleteThemeAsset,
  compressImage,
  fileToDataUrl,
  exportThemeAssets,
  importThemeAssets,
  notifyThemeAssetsChanged,
  uploadImageWithFallback,
  deleteThemeImageFromStorage,
  isSupabaseStorageUrl,
  THEME_ASSET_CONFIG,
  THEME_COLOR_DEFAULTS,
  ASSET_CATEGORIES,
  type ThemeAssets,
  type ThemeAssetKey,
  type AssetCategory,
  type LogoVariant,
} from '../../utils/themeAssets';

// Colour defaults live in themeAssets.ts (THEME_COLOR_DEFAULTS), transcribed
// from the CSS fallbacks and pinned by a test. The map that used to sit here
// covered 18 of ~60 keys and had drifted from index.css.

// `<input type="color">` only accepts hex, but a default can legitimately be
// an rgba() — show the picker the opaque equivalent.
const toHexForPicker = (color: string): string | undefined => {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return '#' + color.slice(1).split('').map((c) => c + c).join('');
  }
  const rgb = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    return '#' + [rgb[1], rgb[2], rgb[3]]
      .map((n) => Math.min(255, parseInt(n, 10)).toString(16).padStart(2, '0'))
      .join('');
  }
  return undefined;
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

const FONT_OPTIONS = [
  // "Default" is its own chip now (it clears the setting); picking Inter here
  // writes Inter explicitly, which is the only way to get it on the heading
  // and gate-menu fonts — their unset fallback is Almendra.
  { value: 'default', label: 'Inter' },
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
  { value: 'jacquard12', label: 'Jacquard 12' },
  { value: 'metamorphous', label: 'Metamorphous' },
  { value: 'modernantiqua', label: 'Modern Antiqua' },
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
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'x-large', label: 'Extra Large (1.25x)' },
];

// ── Shared chrome (2026-07-25 dev-page restyle) ─────────────────────────────
// Thin borders + uppercase header strips, matching ProductionDashboard and
// CollapsiblePanel. Presentation only — the dungeon-panel/dungeon-btn plates
// carried border-2 plus bevel shadows and fought the dense dev-page look.
const BTN =
  'px-2 py-1 text-xs rounded border border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors disabled:opacity-50';
const BTN_DANGER =
  'px-2 py-1 text-xs rounded border bg-red-900/40 text-red-300 border-red-700/50 hover:bg-red-900/60 transition-colors';
const BTN_CONFIRM =
  'px-2 py-1 text-xs rounded border bg-green-900/40 text-green-300 border-green-700/50 hover:bg-green-900/60 transition-colors';
const INPUT =
  'bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm text-parchment-100 placeholder-stone-500 focus:outline-none focus:border-arcane-500';
const CHIP_ACTIVE = 'bg-stone-700 text-parchment-100 border-arcane-500';
const CHIP_IDLE = 'text-stone-400 border-stone-700 hover:text-stone-200';

/** One setting: bordered box, uppercase header strip, tight body. */
const ControlCard: React.FC<{
  title: string;
  description?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, description, badge, children }) => (
  <div className="border border-stone-700 rounded overflow-hidden">
    <div className="flex items-center justify-between gap-2 bg-stone-800 px-2 py-1.5 text-xs uppercase text-stone-400">
      <span>{title}</span>
      {badge}
    </div>
    <div className="p-3 space-y-2">
      {description && <p className="text-xs text-stone-500">{description}</p>}
      {children}
    </div>
  </div>
);

interface LogoVariantsEditorProps {
  variants: LogoVariant[];
  onChange: (variants: LogoVariant[]) => void;
  onError?: (error: string) => void;
}

const LogoVariantsEditor: React.FC<LogoVariantsEditorProps> = ({ variants, onChange, onError }) => {
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAddVariant = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // Same lossless path as the main logo — re-encoding degrades pixel art
      const dataUrl =
        file.size <= 2 * 1024 * 1024
          ? await fileToDataUrl(file)
          : await compressImage(file, 2048, 256, 0.85);

      // Upload to Supabase Storage (falls back to data URL if upload fails)
      const result = await uploadImageWithFallback('logo_variant', dataUrl);

      if (result.error && !result.isStorageUrl) {
        console.warn('Using local storage fallback:', result.error);
      }

      // Add new variant with default settings
      const newVariant: LogoVariant = {
        image: result.url,
        frameCount: 1, // User must set this manually if animated
        frameRate: 10,
      };

      onChange([...variants, newVariant]);
    } catch (err) {
      console.error('Failed to upload variant:', err);
      onError?.('Failed to process image. Try a smaller file.');
    } finally {
      setIsUploading(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const handleUpdateVariant = (index: number, updates: Partial<LogoVariant>) => {
    const newVariants = [...variants];
    newVariants[index] = { ...newVariants[index], ...updates };
    onChange(newVariants);
  };

  const handleRemoveVariant = async (index: number) => {
    const variant = variants[index];
    // Delete from storage if it's a Supabase URL
    if (variant.image && isSupabaseStorageUrl(variant.image)) {
      await deleteThemeImageFromStorage(variant.image);
    }
    const newVariants = variants.filter((_, i) => i !== index);
    onChange(newVariants);
  };

  return (
    <ControlCard
      title="Logo Variants"
      description={'Add additional logo sprite sheets for random selection. When "Randomize Logo" is enabled, a random logo will be chosen from the main logo and these variants on each visit.'}
      badge={
        variants.length > 0 ? (
          <span className="px-2 py-0.5 rounded border text-xs bg-sky-900/40 text-sky-300 border-sky-700/50 normal-case">
            {variants.length}
          </span>
        ) : undefined
      }
    >
      {/* Existing variants */}
      {variants.length > 0 && (
        <div className="space-y-2">
          {variants.map((variant, index) => (
            <div key={index} className="border border-stone-700 rounded p-2">
              <div className="flex items-start gap-3">
                {/* Preview */}
                <div className="flex-shrink-0 w-16 h-12 rounded border border-stone-700 overflow-hidden sprite-preview-bg flex items-center justify-center">
                  {variant.image ? (
                    <img
                      src={variant.image}
                      alt={`Variant ${index + 1}`}
                      className="max-w-full max-h-full object-contain pixelated"
                      loading="lazy" decoding="async"
                    />
                  ) : (
                    <span className="text-stone-500 text-xs">No image</span>
                  )}
                </div>

                {/* Settings */}
                <div className="flex-1 min-w-0">
                  <div className="flex gap-2">
                    <div className="flex-1 min-w-0">
                      <label className="block text-xs text-stone-400 mb-0.5">Frame Count</label>
                      <input
                        type="number"
                        min="1"
                        value={variant.frameCount || 1}
                        onChange={(e) => handleUpdateVariant(index, { frameCount: parseInt(e.target.value) || 1 })}
                        className={`${INPUT} w-full`}
                        placeholder="1"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="block text-xs text-stone-400 mb-0.5">Frame Rate</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={variant.frameRate || 10}
                        onChange={(e) => handleUpdateVariant(index, { frameRate: parseInt(e.target.value) || 10 })}
                        className={`${INPUT} w-full`}
                        placeholder="10"
                      />
                    </div>
                  </div>
                </div>

                {/* Remove button */}
                <button
                  onClick={() => handleRemoveVariant(index)}
                  className={`${BTN_DANGER} flex-shrink-0`}
                  title="Remove variant"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add new variant button */}
      <button
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
        className={`${BTN} w-full`}
      >
        {isUploading ? 'Uploading...' : '+ Add Logo Variant'}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleAddVariant}
        className="hidden"
      />

      {variants.length === 0 && (
        <p className="text-xs text-stone-500 text-center">
          No variants yet. Add sprite sheets to enable random logo selection.
        </p>
      )}
    </ControlCard>
  );
};

interface ToggleSwitchProps {
  assetKey: ThemeAssetKey;
  value?: string | boolean;
  onChange: (value: string | undefined) => void;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ assetKey, value, onChange }) => {
  const config = THEME_ASSET_CONFIG[assetKey];
  // Handle both boolean and string 'true'
  const isEnabled = value === true || value === 'true';

  return (
    <ControlCard
      title={config.label}
      badge={
        <span
          className={`px-2 py-0.5 rounded border text-xs normal-case ${
            isEnabled
              ? 'bg-green-900/40 text-green-300 border-green-700/50'
              : 'bg-stone-700/60 text-stone-300 border-stone-600'
          }`}
        >
          {isEnabled ? 'On' : 'Off'}
        </span>
      }
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-stone-500">{config.description}</p>
        <button
          onClick={() => onChange(isEnabled ? undefined : 'true')}
          className={`relative flex-shrink-0 w-9 h-5 rounded-full border transition-colors ${
            isEnabled ? 'bg-copper-700 border-copper-500' : 'bg-stone-800 border-stone-700'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-parchment-200 transition-transform ${
              isEnabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </ControlCard>
  );
};

interface AssetUploadProps {
  assetKey: ThemeAssetKey;
  value?: string;
  onChange: (value: string | undefined) => void;
  onError?: (error: string) => void;
}

const AssetUpload: React.FC<AssetUploadProps> = ({ assetKey, value, onChange, onError }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const config = THEME_ASSET_CONFIG[assetKey];

  // Determine max dimensions based on asset type
  const getMaxDimensions = () => {
    // Logos are horizontal sprite sheets — must pass through at native
    // resolution or every frame gets crushed (grainy navbar logo)
    if (assetKey === 'logo') return { maxWidth: 2048, maxHeight: 256 };
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
        // Logos are pixel art: any canvas re-encode degrades them (non-PNG
        // sources came back as JPEG). Upload the file byte-for-byte unless
        // it's unreasonably large.
        const dataUrl =
          assetKey === 'logo' && file.size <= 2 * 1024 * 1024
            ? await fileToDataUrl(file)
            : await compressImage(file, maxWidth, maxHeight, 0.85);

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

  const handleUrlSubmit = () => {
    if (urlValue.trim()) {
      // Basic URL validation
      try {
        new URL(urlValue.trim());
        onChange(urlValue.trim());
        setUrlValue('');
        setShowUrlInput(false);
      } catch {
        onError?.('Please enter a valid URL');
      }
    }
  };

  const isExternalUrl = (url: string) => {
    return url.startsWith('http://') || url.startsWith('https://');
  };

  // For text fields like logoAlt
  if (config.inputType === 'text') {
    return (
      <ControlCard title={config.label} description={config.description}>
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className={`${INPUT} w-full`}
          placeholder="Enter text..."
        />
      </ControlCard>
    );
  }

  return (
    <ControlCard title={config.label} description={config.description}>
      {isLoading ? (
        <div className="flex items-center justify-center py-4 text-stone-400">
          <span className="animate-pulse">Uploading to cloud...</span>
        </div>
      ) : value ? (
        <div className="space-y-2">
          {/* Preview */}
          <div
            className="relative rounded p-2 border border-stone-700 flex items-center justify-center min-h-[60px] sprite-preview-bg"
          >
            <img
              src={value}
              alt={config.label}
              className="max-w-full max-h-20 object-contain pixelated"
              loading="lazy" decoding="async"
            />
            {/* Cloud/Local/External indicator */}
            <span
              className={`absolute top-1 right-1 text-xs px-2 py-0.5 rounded border ${
                isSupabaseStorageUrl(value)
                  ? 'bg-arcane-900/40 text-arcane-300 border-arcane-700/50'
                  : isExternalUrl(value)
                  ? 'bg-green-900/40 text-green-300 border-green-700/50'
                  : 'bg-stone-700/60 text-stone-300 border-stone-600'
              }`}
              title={
                isSupabaseStorageUrl(value)
                  ? 'Stored in cloud'
                  : isExternalUrl(value)
                  ? 'External URL'
                  : 'Stored locally'
              }
            >
              {isSupabaseStorageUrl(value) ? '☁️' : isExternalUrl(value) ? '🔗' : '💾'}
            </span>
          </div>
          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => inputRef.current?.click()}
              className={`${BTN} flex-1`}
            >
              Replace
            </button>
            <button
              onClick={handleRemove}
              className={BTN_DANGER}
            >
              Remove
            </button>
          </div>
        </div>
      ) : showUrlInput ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="url"
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              placeholder="https://example.com/image.png"
              className={`${INPUT} flex-1 min-w-0`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUrlSubmit();
                if (e.key === 'Escape') {
                  setShowUrlInput(false);
                  setUrlValue('');
                }
              }}
              autoFocus
            />
            <button
              onClick={handleUrlSubmit}
              className={`${BTN_CONFIRM} flex-shrink-0`}
            >
              Use
            </button>
          </div>
          <button
            onClick={() => {
              setShowUrlInput(false);
              setUrlValue('');
            }}
            className="text-xs text-stone-500 hover:text-stone-400"
          >
            ← Back to upload
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => inputRef.current?.click()}
            className={`${BTN} flex-1`}
          >
            Upload Image
          </button>
          <button
            onClick={() => setShowUrlInput(true)}
            className={BTN}
            title="Use a public URL"
          >
            🔗 URL
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </ControlCard>
  );
};

interface ColorPickerProps {
  assetKey: ThemeAssetKey;
  value?: string;
  onChange: (value: string | undefined) => void;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ assetKey, value, onChange }) => {
  const config = THEME_ASSET_CONFIG[assetKey];
  // Undefined where the unset state is not a flat colour (a gradient, a plate)
  const defaultColor = THEME_COLOR_DEFAULTS[assetKey];
  // A stored value IS the custom state — comparing against a default made
  // "set it to exactly the default" read as unset and disabled its Reset.
  const isCustom = value !== undefined;
  const shown = value ?? defaultColor;
  const pickerValue = (shown && toHexForPicker(shown)) || '#000000';

  const handleReset = () => {
    // Set to undefined to use the CSS default, then notify
    onChange(undefined);
  };

  return (
    <ControlCard
      title={config.label}
      description={config.description}
      badge={
        isCustom ? (
          <span className="px-2 py-0.5 rounded border text-xs normal-case bg-amber-900/40 text-amber-300 border-amber-700/50">
            custom
          </span>
        ) : undefined
      }
    >
      <div className="flex items-center gap-2 flex-wrap">
        {/* Color picker */}
        <div className="relative flex-shrink-0">
          <input
            type="color"
            value={pickerValue}
            onChange={(e) => onChange(e.target.value)}
            className="w-10 h-8 rounded border border-stone-700 cursor-pointer bg-transparent"
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
          placeholder={defaultColor ?? 'not set'}
          className={`${INPUT} flex-1 min-w-[80px] font-mono`}
        />

        {/* Reset button - always visible */}
        <button
          onClick={handleReset}
          className={`px-2 py-1 text-xs rounded border flex-shrink-0 transition-colors ${
            isCustom
              ? 'border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800'
              : 'border-stone-800 text-stone-600 cursor-default'
          }`}
          title={isCustom ? 'Reset to default' : 'Using default'}
          disabled={!isCustom}
        >
          {isCustom ? 'Reset' : 'Default'}
        </button>
      </div>

      {/* Preview swatch with label — hatched when nothing is set and the
          unset appearance is not a flat colour we can honestly show */}
      <div className="flex items-center gap-2">
        <div
          className="flex-1 h-6 rounded border border-stone-700"
          style={
            shown
              ? { backgroundColor: shown }
              : {
                  backgroundImage:
                    'repeating-linear-gradient(45deg, #292524 0 6px, #1c1917 6px 12px)',
                }
          }
        />
        <span className="text-xs text-stone-500 font-mono">
          {shown ?? 'not set'}
        </span>
      </div>
    </ControlCard>
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
  // What the surface renders as when the setting is CLEARED. Used for the
  // "Default" chip's tooltip and for the previews below — never to decide
  // which chip is lit, which is what made the old indicator untrustworthy
  // (its guesses disagreed with the CSS fallbacks, and the gate menu's
  // "Default (Inter)" cleared the key and rendered Almendra instead).
  let defaultHint = '';
  let previewFallback = '';

  switch (assetKey) {
    case 'borderRadius':
      options = BORDER_RADIUS_OPTIONS;
      defaultHint = '4px on panels, 3px on buttons';
      previewFallback = '4px';
      break;
    case 'borderWidth':
      options = BORDER_WIDTH_OPTIONS;
      defaultHint = '2px';
      previewFallback = '2px';
      break;
    case 'fontFamily':
      options = FONT_OPTIONS;
      defaultHint = 'Inter';
      previewFallback = 'default';
      break;
    case 'fontFamilyHeading':
      options = FONT_OPTIONS;
      defaultHint = 'the body font, or Almendra when that is unset too';
      previewFallback = 'medieval';
      break;
    case 'fontFamilyMenu':
      options = FONT_OPTIONS;
      defaultHint = 'Almendra';
      previewFallback = 'medieval';
      break;
    case 'fontSizeBody':
    case 'fontSizeHeading':
      options = FONT_SIZE_OPTIONS;
      defaultHint = 'medium (1x)';
      previewFallback = 'medium';
      break;
    case 'siteSubtitleSize':
      options = SUBTITLE_SIZE_OPTIONS;
      defaultHint = 'small';
      previewFallback = 'small';
      break;
  }

  const effective = value ?? previewFallback;

  return (
    <ControlCard title={config.label} description={config.description}>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => onChange(undefined)}
          title={defaultHint ? `Unset — renders as ${defaultHint}` : 'Unset'}
          className={`px-2 py-0.5 rounded text-xs border transition-colors ${
            value === undefined ? CHIP_ACTIVE : CHIP_IDLE
          }`}
        >
          Default
        </button>
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${
              value === option.value ? CHIP_ACTIVE : CHIP_IDLE
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Preview for border radius */}
      {assetKey === 'borderRadius' && (
        <div>
          <div
            className="w-full h-12 bg-copper-700 border border-copper-500"
            style={{ borderRadius: effective }}
          />
        </div>
      )}

      {/* Preview for border width */}
      {assetKey === 'borderWidth' && (
        <div>
          <div
            className="w-full h-12 bg-stone-800 border-copper-500"
            style={{ borderWidth: effective, borderStyle: 'solid' }}
          />
        </div>
      )}

      {/* Preview for font family */}
      {(assetKey === 'fontFamily' || assetKey === 'fontFamilyHeading' || assetKey === 'fontFamilyMenu') && (
        <div className="space-y-1">
          <p className="text-xs uppercase text-stone-500">Preview</p>
          <div
            className="p-3 bg-stone-800 rounded border border-stone-700"
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
                  'jacquard12': "'Jacquard 12', serif",
                  'metamorphous': "'Metamorphous', serif",
                  'modernantiqua': "'Modern Antiqua', serif",
                  'amarante': "'Amarante', serif",
                  'faculty': "'Faculty Glyphic', serif",
                };
                return fontMap[effective] || fontMap['default'];
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
        <div className="space-y-1">
          <p className="text-xs uppercase text-stone-500">Preview</p>
          <div
            className="p-3 bg-stone-800 rounded border border-stone-700"
            style={{
              fontSize: (() => {
                const sizeMap: Record<string, string> = {
                  'x-small': '12px',
                  'small': '14px',
                  'medium': '16px',
                  'large': '18px',
                  'x-large': '20px',
                };
                return sizeMap[effective] || sizeMap['medium'];
              })()
            }}
          >
            <p className="text-parchment-200">The quick brown fox jumps over the lazy dog</p>
          </div>
        </div>
      )}
    </ControlCard>
  );
};

export const ThemeAssetsEditor: React.FC = () => {
  const [assets, setAssets] = useState<ThemeAssets>({});
  const [activeCategory, setActiveCategory] = useState<AssetCategory>('branding');
  const [error, setError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAssets(loadThemeAssets());
  }, []);

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    // Auto-clear error after 5 seconds
    setTimeout(() => setError(null), 5000);
  };

  const handleAssetChange = (key: ThemeAssetKey, value: string | undefined) => {
    setError(null);
    const result = value ? setThemeAsset(key, value) : deleteThemeAsset(key);
    if (!result.success) {
      handleError(result.error || 'Failed to save theme settings.');
    }
    setAssets(loadThemeAssets());
    notifyThemeAssetsChanged();
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
      setError(null);
      const text = await file.text();
      const result = importThemeAssets(text);
      if (result.success) {
        setAssets(loadThemeAssets());
        notifyThemeAssetsChanged();
      } else {
        handleError(result.error || 'Failed to import theme settings.');
      }
    }
    if (importInputRef.current) {
      importInputRef.current.value = '';
    }
  };

  // Reset clears THIS TAB only. It used to clear every colour (or every
  // select) in the whole theme from a button that only appeared on the
  // Colors/Styles tab — so it silently wiped Action Buttons, Concede,
  // Defeat and Game Over settings as well.
  const handleResetCategory = () => {
    const keys = (Object.keys(THEME_ASSET_CONFIG) as ThemeAssetKey[]).filter(
      (key) =>
        THEME_ASSET_CONFIG[key].category === activeCategory &&
        assets[key] !== undefined
    );
    if (keys.length === 0) return;
    const label = categoryLabels[activeCategory];
    if (!window.confirm(
      `Reset ${keys.length} customised ${label} setting${keys.length === 1 ? '' : 's'} to their defaults? Other tabs are not affected.`
    )) {
      return;
    }
    let failure: string | undefined;
    keys.forEach((key) => {
      const result = deleteThemeAsset(key);
      if (!result.success && !failure) failure = result.error;
    });
    if (failure) handleError(failure);
    setAssets(loadThemeAssets());
    notifyThemeAssetsChanged();
  };

  // Get assets for current category
  const categoryAssets = Object.entries(THEME_ASSET_CONFIG)
    .filter(([_, config]) => config.category === activeCategory)
    .map(([key]) => key as ThemeAssetKey);

  // Bulk reset is offered only where every setting is a colour or a select —
  // uploaded images are cleared one card at a time, deliberately.
  const canResetCategory =
    categoryAssets.some((key) => assets[key] !== undefined) &&
    categoryAssets.every((key) => {
      const type = THEME_ASSET_CONFIG[key].inputType;
      return type === 'color' || type === 'select';
    });

  const categoryLabels: Record<AssetCategory, string> = {
    branding: 'Branding',
    backgrounds: 'Backgrounds',
    buttons: 'Buttons',
    borders: 'Borders',
    icons: 'Icons',
    colors: 'Colors',
    actionButtons: 'Action Buttons',
    concedeModal: 'Concede Overlay',
    gameOverPanel: 'Game Over Panel',
    styles: 'Styles',
  };

  const categoryIcons: Record<AssetCategory, string> = {
    branding: '🏷️',
    backgrounds: '🖼️',
    buttons: '🔘',
    borders: '🖼️',
    icons: '⚔️',
    colors: '🎨',
    actionButtons: '▶️',
    concedeModal: '🏳️',
    gameOverPanel: '🏁',
    styles: '⚙️',
  };

  // Handler for logo variants (stored as array, not string)
  const handleLogoVariantsChange = (variants: LogoVariant[]) => {
    setError(null);
    const currentAssets = loadThemeAssets();
    if (variants.length > 0) {
      currentAssets.logoVariants = variants;
    } else {
      delete currentAssets.logoVariants;
    }
    const result = saveThemeAssets(currentAssets);
    if (!result.success) {
      handleError(result.error || 'Failed to save theme settings.');
    }
    setAssets(loadThemeAssets());
    notifyThemeAssetsChanged();
  };

  const renderAssetControl = (key: ThemeAssetKey) => {
    const config = THEME_ASSET_CONFIG[key];

    // Special handling for logo variants (array type)
    if (key === 'logoVariants') {
      return (
        <LogoVariantsEditor
          key={key}
          variants={assets.logoVariants || []}
          onChange={handleLogoVariantsChange}
          onError={handleError}
        />
      );
    }

    if (config.inputType === 'color') {
      return (
        <ColorPicker
          key={key}
          assetKey={key}
          value={assets[key] as string | undefined}
          onChange={(value) => handleAssetChange(key, value)}
        />
      );
    }

    if (config.inputType === 'select') {
      return (
        <StyleSelector
          key={key}
          assetKey={key}
          value={assets[key] as string | undefined}
          onChange={(value) => handleAssetChange(key, value)}
        />
      );
    }

    if (config.inputType === 'toggle') {
      return (
        <ToggleSwitch
          key={key}
          assetKey={key}
          value={assets[key] as string | boolean | undefined}
          onChange={(value) => handleAssetChange(key, value)}
        />
      );
    }

    return (
      <AssetUpload
        key={key}
        assetKey={key}
        value={assets[key] as string | undefined}
        onChange={(value) => handleAssetChange(key, value)}
        onError={handleError}
      />
    );
  };

  return (
    <div className="p-4 space-y-4 max-w-7xl mx-auto">
      {/* Error message */}
      {error && (
        <div className="px-2 py-1.5 rounded border bg-red-900/40 text-red-300 border-red-700/50 text-xs">
          {error}
        </div>
      )}

      {/* Category tabs + actions */}
      <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-stone-700">
        {ASSET_CATEGORIES.map((category) => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${
              activeCategory === category ? CHIP_ACTIVE : CHIP_IDLE
            }`}
          >
            <span className="mr-1">{categoryIcons[category]}</span>
            {categoryLabels[category]}
          </button>
        ))}
        <div className="flex gap-1.5 ml-auto flex-shrink-0">
          {canResetCategory && (
            <button
              onClick={handleResetCategory}
              className={BTN_DANGER}
              title={`Clear the customised ${categoryLabels[activeCategory]} settings on this tab`}
            >
              Reset {categoryLabels[activeCategory]}
            </button>
          )}
          <button onClick={handleExport} className={BTN}>
            Export
          </button>
          <button onClick={() => importInputRef.current?.click()} className={BTN}>
            Import
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </div>
      </div>

      {/* Active category */}
      <div className="flex items-baseline gap-2">
        <h2 className="text-lg font-medieval text-copper-400">{categoryLabels[activeCategory]}</h2>
        <span className="text-xs text-stone-500">
          {categoryAssets.length} setting{categoryAssets.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Asset grid */}
      <div className={`grid gap-3 ${
        activeCategory === 'colors' || activeCategory === 'styles'
          ? 'grid-cols-1 sm:grid-cols-2'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      }`}>
        {categoryAssets.map((key) => renderAssetControl(key))}
      </div>

      {/* Usage hints based on category */}
      {activeCategory !== 'colors' && activeCategory !== 'styles' && (
        <div className="border border-stone-700 rounded overflow-hidden">
          <div className="bg-stone-800 px-2 py-1.5 text-xs uppercase text-stone-400">
            How to use custom assets
          </div>
          <ul className="p-3 text-sm text-stone-400 space-y-1 list-disc list-inside">
            <li>Upload images or paste a public URL (click 🔗 URL button)</li>
            <li>Upload images in PNG format with transparency for best results</li>
            <li>Background images work best as tileable textures or large images</li>
            <li>Enable "Tile" toggle to repeat smaller textures instead of stretching</li>
            <li>Button images can be 9-slice sprites for proper scaling</li>
            <li>Icons should be square (e.g., 32x32 or 64x64 pixels)</li>
            <li>Uploaded assets are stored in cloud, URLs are referenced directly</li>
          </ul>
        </div>
      )}

      {activeCategory === 'colors' && (
        <div className="border border-stone-700 rounded overflow-hidden">
          <div className="bg-stone-800 px-2 py-1.5 text-xs uppercase text-stone-400">
            Color customization
          </div>
          <ul className="p-3 text-sm text-stone-400 space-y-1 list-disc list-inside">
            <li>Click the color swatch to open a color picker</li>
            <li>Enter hex codes directly (e.g., #ff0000 for red)</li>
            <li>Use the Reset button to restore individual colors to default</li>
            <li>Colors apply to UI elements throughout the game</li>
          </ul>
        </div>
      )}

      {activeCategory === 'styles' && (
        <div className="border border-stone-700 rounded overflow-hidden">
          <div className="bg-stone-800 px-2 py-1.5 text-xs uppercase text-stone-400">
            Style settings
          </div>
          <ul className="p-3 text-sm text-stone-400 space-y-1 list-disc list-inside">
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
