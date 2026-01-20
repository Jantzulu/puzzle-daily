import React, { useRef, useState } from 'react';

interface SpriteImageInputProps {
  /** Current base64 image data (if any) */
  imageData?: string;
  /** Current image URL (if any) */
  imageUrl?: string;
  /** Called when image changes (data, url, or cleared) */
  onImageChange: (data: string | undefined, url: string | undefined) => void;
  /** Label for the section */
  label: string;
  /** Optional sublabel/description */
  sublabel?: string;
  /** Color theme for the button (default: blue) */
  buttonColor?: 'blue' | 'purple' | 'red' | 'green' | 'yellow';
  /** Whether to show frame config inputs (for sprite sheets) */
  showFrameConfig?: boolean;
  /** Current frame count (for sprite sheets) */
  frameCount?: number;
  /** Current frame rate (for sprite sheets) */
  frameRate?: number;
  /** Current loop setting (for sprite sheets) */
  loop?: boolean;
  /** Called when frame config changes */
  onFrameConfigChange?: (key: 'frameCount' | 'frameRate' | 'loop', value: number | boolean) => void;
}

const buttonColorClasses = {
  blue: 'file:bg-blue-600 hover:file:bg-blue-700',
  purple: 'file:bg-purple-600 hover:file:bg-purple-700',
  red: 'file:bg-red-600 hover:file:bg-red-700',
  green: 'file:bg-green-600 hover:file:bg-green-700',
  yellow: 'file:bg-yellow-600 hover:file:bg-yellow-700',
};

const borderColorClasses = {
  blue: 'border-blue-600',
  purple: 'border-purple-600',
  red: 'border-red-600',
  green: 'border-green-600',
  yellow: 'border-yellow-600',
};

/**
 * Reusable component for sprite image input with URL support.
 * Used in SpriteEditor for various animation states.
 */
export const SpriteImageInput: React.FC<SpriteImageInputProps> = ({
  imageData,
  imageUrl,
  onImageChange,
  label,
  sublabel,
  buttonColor = 'blue',
  showFrameConfig = false,
  frameCount = 4,
  frameRate = 10,
  loop = true,
  onFrameConfigChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState(imageUrl || '');
  const [showUrlInput, setShowUrlInput] = useState(false);

  const hasImage = !!(imageData || imageUrl);
  const displaySrc = imageData || imageUrl;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, GIF)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = event.target?.result as string;
      onImageChange(data, undefined);
      setUrlInput('');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleUrlSubmit = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      return;
    }
    try {
      new URL(trimmed);
      onImageChange(undefined, trimmed);
    } catch {
      alert('Please enter a valid URL');
    }
  };

  const handleClear = () => {
    onImageChange(undefined, undefined);
    setUrlInput('');
  };

  return (
    <div>
      <label className="block text-sm font-bold mb-2">{label}</label>
      {sublabel && <p className="text-xs text-stone-400 mb-2">{sublabel}</p>}

      <div className="space-y-2">
        {/* File Upload Row */}
        <div className="flex gap-2 items-start">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpg,image/jpeg,image/gif,image/webp"
            onChange={handleFileUpload}
            className={`flex-1 px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:text-parchment-100 ${buttonColorClasses[buttonColor]}`}
          />
          {hasImage && (
            <div className={`w-16 h-16 sprite-preview-bg rounded border ${borderColorClasses[buttonColor]} flex items-center justify-center overflow-hidden flex-shrink-0`}>
              <img
                src={displaySrc}
                alt="Preview"
                className="max-w-full max-h-full object-contain"
              />
            </div>
          )}
        </div>

        {/* URL Input Toggle */}
        <button
          type="button"
          onClick={() => setShowUrlInput(!showUrlInput)}
          className="text-xs text-arcane-400 hover:text-arcane-300"
        >
          {showUrlInput ? '▼ Hide URL input' : '▶ Or use URL...'}
        </button>

        {/* URL Input */}
        {showUrlInput && (
          <div className="flex gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
              placeholder="https://your-storage.com/sprite.png"
              className="flex-1 px-2 py-1 bg-stone-700 rounded text-sm text-parchment-100 placeholder:text-stone-500"
            />
            <button
              type="button"
              onClick={handleUrlSubmit}
              className="px-3 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-sm"
            >
              Set
            </button>
          </div>
        )}

        {/* Frame Config (for sprite sheets) */}
        {hasImage && showFrameConfig && onFrameConfigChange && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div>
              <label className="block text-xs text-stone-400 mb-1">Frames</label>
              <input
                type="number"
                min="1"
                max="64"
                value={frameCount}
                onChange={(e) => onFrameConfigChange('frameCount', parseInt(e.target.value) || 4)}
                className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">FPS</label>
              <input
                type="number"
                min="1"
                max="60"
                value={frameRate}
                onChange={(e) => onFrameConfigChange('frameRate', parseInt(e.target.value) || 10)}
                className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">Loop</label>
              <button
                type="button"
                onClick={() => onFrameConfigChange('loop', !loop)}
                className={`w-full px-2 py-1 rounded text-sm ${loop ? 'bg-green-700' : 'bg-stone-600'}`}
              >
                {loop ? 'Yes' : 'No'}
              </button>
            </div>
          </div>
        )}

        {/* Clear Button */}
        {hasImage && (
          <button
            type="button"
            onClick={handleClear}
            className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
          >
            ✕ Clear {label}
          </button>
        )}

        {/* Status */}
        <p className="text-xs text-stone-400">
          {hasImage
            ? imageUrl && !imageData
              ? '✓ Using URL'
              : '✓ Image uploaded'
            : 'No image set'}
        </p>
      </div>
    </div>
  );
};
