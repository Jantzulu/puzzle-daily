import React, { useState, useEffect, useRef } from 'react';
import {
  loadThemeAssets,
  setThemeAsset,
  deleteThemeAsset,
  fileToDataUrl,
  exportThemeAssets,
  importThemeAssets,
  notifyThemeAssetsChanged,
  THEME_ASSET_CONFIG,
  ASSET_CATEGORIES,
  type ThemeAssets,
  type ThemeAssetKey,
  type AssetCategory,
} from '../../utils/themeAssets';

interface AssetUploadProps {
  assetKey: ThemeAssetKey;
  value?: string;
  onChange: (value: string | undefined) => void;
}

const AssetUpload: React.FC<AssetUploadProps> = ({ assetKey, value, onChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const config = THEME_ASSET_CONFIG[assetKey];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const dataUrl = await fileToDataUrl(file);
        onChange(dataUrl);
      } catch (err) {
        console.error('Failed to load file:', err);
      }
    }
  };

  const handleRemove = () => {
    onChange(undefined);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  // For text fields like logoAlt
  if (assetKey === 'logoAlt') {
    return (
      <div className="dungeon-panel-dark p-3">
        <label className="block text-sm font-medium text-copper-400 mb-1">{config.label}</label>
        <p className="text-xs text-stone-500 mb-2">{config.description}</p>
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="dungeon-input w-full"
          placeholder="Enter alt text..."
        />
      </div>
    );
  }

  return (
    <div className="dungeon-panel-dark p-3">
      <label className="block text-sm font-medium text-copper-400 mb-1">{config.label}</label>
      <p className="text-xs text-stone-500 mb-2">{config.description}</p>

      {value ? (
        <div className="space-y-2">
          {/* Preview */}
          <div className="relative bg-stone-800 rounded-pixel p-2 border border-stone-600 flex items-center justify-center min-h-[60px]">
            <img
              src={value}
              alt={config.label}
              className="max-w-full max-h-20 object-contain pixelated"
            />
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

export const ThemeAssetsEditor: React.FC = () => {
  const [assets, setAssets] = useState<ThemeAssets>({});
  const [activeCategory, setActiveCategory] = useState<AssetCategory>('branding');
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAssets(loadThemeAssets());
  }, []);

  const handleAssetChange = (key: ThemeAssetKey, value: string | undefined) => {
    if (value) {
      setThemeAsset(key, value);
    } else {
      deleteThemeAsset(key);
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
  };

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-4 md:py-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold font-medieval text-copper-400 mb-2">Theme Assets</h2>
        <p className="text-sm text-stone-400">
          Upload custom images to personalize the look of your game. These assets will apply to both the editor and player-facing game.
        </p>
      </div>

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
            className={`dungeon-tab ${activeCategory === category ? 'dungeon-tab-active' : ''}`}
          >
            {categoryLabels[category]}
          </button>
        ))}
      </div>

      {/* Asset grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {categoryAssets.map((key) => (
          <AssetUpload
            key={key}
            assetKey={key}
            value={assets[key]}
            onChange={(value) => handleAssetChange(key, value)}
          />
        ))}
      </div>

      {/* Usage hint */}
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
    </div>
  );
};
