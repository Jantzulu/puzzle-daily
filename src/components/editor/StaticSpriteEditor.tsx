import React, { useRef, useEffect, useState } from 'react';
import type { CustomSprite, SpriteSheetConfig } from '../../utils/assetStorage';
import { drawPreviewBackground, type PreviewType } from '../../utils/themeAssets';
import { subscribeToImageLoads } from '../../utils/imageLoader';

// Preview type for static assets (tiles, items, enchantments)
const ASSET_PREVIEW_TYPE: PreviewType = 'asset';

interface StaticSpriteEditorProps {
  sprite: CustomSprite;
  onChange: (sprite: CustomSprite) => void;
  size?: number;
}

const PREVIEW_SIZE = 96;

const SHAPES = [
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'star', label: 'Star' },
];

const TRIGGER_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'character_nearby', label: 'Character Nearby' },
  { value: 'enemy_nearby', label: 'Enemy Nearby' },
  { value: 'any_entity_nearby', label: 'Any Entity Nearby' },
];

/**
 * A simplified sprite editor for static objects that don't need
 * directional sprites or animation states (moving, casting, death).
 * Supports:
 * - Shape with colors (fallback)
 * - Static image (PNG/JPG/GIF)
 * - Spritesheet animation
 * - Optional triggered alternate sprite (when entity nearby)
 */
export const StaticSpriteEditor: React.FC<StaticSpriteEditorProps> = ({
  sprite,
  onChange,
  size = PREVIEW_SIZE
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewMode, setPreviewMode] = useState<'default' | 'triggered'>('default');
  const animationRef = useRef<number>();
  // Trigger re-render when background images load
  const [renderTrigger, setRenderTrigger] = useState(0);

  // Subscribe to image load events to re-render when background images finish loading
  useEffect(() => {
    const unsubscribe = subscribeToImageLoads(() => {
      setRenderTrigger(prev => prev + 1);
    });
    return unsubscribe;
  }, []);

  // URL input states
  const [showDefaultImageUrl, setShowDefaultImageUrl] = useState(false);
  const [defaultImageUrlInput, setDefaultImageUrlInput] = useState(sprite.idleImageUrl || sprite.imageUrl || '');
  const [showDefaultSpriteSheetUrl, setShowDefaultSpriteSheetUrl] = useState(false);
  const [defaultSpriteSheetUrlInput, setDefaultSpriteSheetUrlInput] = useState(sprite.idleSpriteSheet?.imageUrl || '');
  const [showTriggeredImageUrl, setShowTriggeredImageUrl] = useState(false);
  const [triggeredImageUrlInput, setTriggeredImageUrlInput] = useState(sprite.triggeredImageUrl || '');
  const [showTriggeredSpriteSheetUrl, setShowTriggeredSpriteSheetUrl] = useState(false);
  const [triggeredSpriteSheetUrlInput, setTriggeredSpriteSheetUrlInput] = useState(sprite.triggeredSpriteSheet?.imageUrl || '');

  // Draw preview with animation support
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameIndex = 0;
    let lastFrameTime = 0;

    const render = (timestamp: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Determine which sprite data to show based on preview mode
      const showTriggered = previewMode === 'triggered';
      const spriteSheet = showTriggered ? sprite.triggeredSpriteSheet : sprite.idleSpriteSheet;
      const imageData = showTriggered
        ? (sprite.triggeredImageData || sprite.triggeredImageUrl || sprite.idleImageData || sprite.idleImageUrl || sprite.imageData || sprite.imageUrl)
        : (sprite.idleImageData || sprite.idleImageUrl || sprite.imageData || sprite.imageUrl);

      // Resolve sprite sheet image source
      const spriteSheetSrc = spriteSheet?.imageData || spriteSheet?.imageUrl;

      // Draw preview background (color and/or image) using asset type for static sprites
      drawPreviewBackground(ctx, canvas.width, canvas.height, () => {
        if (spriteSheetSrc) {
          // Animated spritesheet
          const img = new Image();
          img.onload = () => {
            const frameWidth = spriteSheet.frameWidth || (img.naturalWidth / spriteSheet.frameCount);
            const frameHeight = spriteSheet.frameHeight || img.naturalHeight;

            // Update frame based on frame rate
            const frameDuration = 1000 / spriteSheet.frameRate;
            if (timestamp - lastFrameTime >= frameDuration) {
              frameIndex = (frameIndex + 1) % spriteSheet.frameCount;
              lastFrameTime = timestamp;
            }

            // Calculate display size
            const maxSize = (sprite.size || 0.8) * canvas.width;
            const aspectRatio = frameWidth / frameHeight;
            let drawWidth = maxSize;
            let drawHeight = maxSize;

            if (aspectRatio > 1) {
              drawHeight = maxSize / aspectRatio;
            } else {
              drawWidth = maxSize * aspectRatio;
            }

            // Redraw background then sprite frame
            drawPreviewBackground(ctx, canvas.width, canvas.height, () => {
              ctx.drawImage(
                img,
                frameIndex * frameWidth, 0, frameWidth, frameHeight,
                canvas.width / 2 - drawWidth / 2,
                canvas.height / 2 - drawHeight / 2,
                drawWidth, drawHeight
              );
            }, ASSET_PREVIEW_TYPE);
          };
          img.src = spriteSheetSrc;
          animationRef.current = requestAnimationFrame(render);
        } else if (imageData) {
          // Static image
          const img = new Image();
          img.onload = () => {
            const maxSize = (sprite.size || 0.8) * canvas.width;
            const aspectRatio = img.width / img.height;
            let drawWidth = maxSize;
            let drawHeight = maxSize;

            if (aspectRatio > 1) {
              drawHeight = maxSize / aspectRatio;
            } else {
              drawWidth = maxSize * aspectRatio;
            }

            // Redraw background then sprite
            drawPreviewBackground(ctx, canvas.width, canvas.height, () => {
              ctx.drawImage(
                img,
                canvas.width / 2 - drawWidth / 2,
                canvas.height / 2 - drawHeight / 2,
                drawWidth, drawHeight
              );
            }, ASSET_PREVIEW_TYPE);
          };
          img.src = imageData;
        } else {
          // Draw shape fallback
          drawShape(ctx, sprite, canvas.width / 2, canvas.height / 2, canvas.width);
        }
      }, ASSET_PREVIEW_TYPE);
    };

    render(0);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [sprite, previewMode, renderTrigger]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, isTriggered: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, GIF)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;
      if (isTriggered) {
        onChange({
          ...sprite,
          triggeredImageData: imageData,
          triggeredImageUrl: undefined, // Clear URL when uploading file
        });
        setTriggeredImageUrlInput('');
      } else {
        onChange({
          ...sprite,
          type: 'image',
          idleImageData: imageData,
          idleImageUrl: undefined, // Clear URL when uploading file
          imageData: imageData,
          imageUrl: undefined,
        });
        setDefaultImageUrlInput('');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleImageUrlSubmit = (isTriggered: boolean = false) => {
    const trimmed = isTriggered ? triggeredImageUrlInput.trim() : defaultImageUrlInput.trim();
    if (!trimmed) return;
    try {
      new URL(trimmed);
      if (isTriggered) {
        onChange({
          ...sprite,
          triggeredImageUrl: trimmed,
          triggeredImageData: undefined, // Clear data when using URL
        });
      } else {
        onChange({
          ...sprite,
          type: 'image',
          idleImageUrl: trimmed,
          idleImageData: undefined, // Clear data when using URL
          imageUrl: trimmed,
          imageData: undefined,
        });
      }
    } catch {
      alert('Please enter a valid URL');
    }
  };

  const handleSpriteSheetUpload = (e: React.ChangeEvent<HTMLInputElement>, isTriggered: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;
      const spriteSheetConfig: SpriteSheetConfig = {
        imageData,
        imageUrl: undefined, // Clear URL when uploading file
        frameCount: 4,
        frameRate: 8,
        loop: true,
      };

      if (isTriggered) {
        onChange({
          ...sprite,
          triggeredSpriteSheet: spriteSheetConfig,
        });
        setTriggeredSpriteSheetUrlInput('');
      } else {
        onChange({
          ...sprite,
          idleSpriteSheet: spriteSheetConfig,
        });
        setDefaultSpriteSheetUrlInput('');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSpriteSheetUrlSubmit = (isTriggered: boolean = false) => {
    const trimmed = isTriggered ? triggeredSpriteSheetUrlInput.trim() : defaultSpriteSheetUrlInput.trim();
    if (!trimmed) return;
    try {
      new URL(trimmed);
      const existingSheet = isTriggered ? sprite.triggeredSpriteSheet : sprite.idleSpriteSheet;
      const spriteSheetConfig: SpriteSheetConfig = {
        ...(existingSheet || {}),
        imageUrl: trimmed,
        imageData: undefined, // Clear data when using URL
        frameCount: existingSheet?.frameCount || 4,
        frameRate: existingSheet?.frameRate || 8,
        loop: existingSheet?.loop !== false,
      };

      if (isTriggered) {
        onChange({
          ...sprite,
          triggeredSpriteSheet: spriteSheetConfig,
        });
      } else {
        onChange({
          ...sprite,
          idleSpriteSheet: spriteSheetConfig,
        });
      }
    } catch {
      alert('Please enter a valid URL');
    }
  };

  const clearImage = (isTriggered: boolean = false) => {
    if (isTriggered) {
      onChange({
        ...sprite,
        triggeredImageData: undefined,
        triggeredImageUrl: undefined,
      });
      setTriggeredImageUrlInput('');
    } else {
      onChange({
        ...sprite,
        type: 'simple',
        idleImageData: undefined,
        idleImageUrl: undefined,
        imageData: undefined,
        imageUrl: undefined,
      });
      setDefaultImageUrlInput('');
    }
  };

  const clearSpriteSheet = (isTriggered: boolean = false) => {
    if (isTriggered) {
      onChange({
        ...sprite,
        triggeredSpriteSheet: undefined,
      });
      setTriggeredSpriteSheetUrlInput('');
    } else {
      onChange({
        ...sprite,
        idleSpriteSheet: undefined,
      });
      setDefaultSpriteSheetUrlInput('');
    }
  };

  const updateSpriteSheet = (key: 'idleSpriteSheet' | 'triggeredSpriteSheet', updates: Partial<SpriteSheetConfig>) => {
    const current = sprite[key];
    if (!current) return;
    onChange({
      ...sprite,
      [key]: { ...current, ...updates },
    });
  };

  const handleShapeChange = (shape: string) => {
    onChange({ ...sprite, shape: shape as CustomSprite['shape'] });
  };

  const handleColorChange = (colorType: 'primary' | 'secondary', color: string) => {
    if (colorType === 'primary') {
      onChange({ ...sprite, primaryColor: color });
    } else {
      onChange({ ...sprite, secondaryColor: color });
    }
  };

  const handleSizeChange = (newSize: number) => {
    onChange({ ...sprite, size: newSize });
  };

  const handleTriggerTypeChange = (triggerType: string) => {
    onChange({ ...sprite, triggerType: triggerType as CustomSprite['triggerType'] });
  };

  const hasDefaultImage = sprite.idleImageData || sprite.idleImageUrl || sprite.imageData || sprite.imageUrl;
  const hasDefaultSpriteSheet = sprite.idleSpriteSheet?.imageData || sprite.idleSpriteSheet?.imageUrl;
  const hasTriggeredImage = sprite.triggeredImageData || sprite.triggeredImageUrl;
  const hasTriggeredSpriteSheet = sprite.triggeredSpriteSheet?.imageData || sprite.triggeredSpriteSheet?.imageUrl;
  const hasTriggeredSprite = hasTriggeredImage || hasTriggeredSpriteSheet;

  return (
    <div className="space-y-4">
      {/* Preview */}
      <div className="flex flex-col items-center gap-2">
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          className="border border-stone-600 rounded sprite-preview-bg"
        />
        {hasTriggeredSprite && (
          <div className="flex gap-2">
            <button
              onClick={() => setPreviewMode('default')}
              className={`px-2 py-1 text-xs rounded ${previewMode === 'default' ? 'bg-blue-600' : 'bg-stone-600'}`}
            >
              Default
            </button>
            <button
              onClick={() => setPreviewMode('triggered')}
              className={`px-2 py-1 text-xs rounded ${previewMode === 'triggered' ? 'bg-blue-600' : 'bg-stone-600'}`}
            >
              Triggered
            </button>
          </div>
        )}
      </div>

      {/* Default Sprite */}
      <div className="bg-stone-700 p-3 rounded">
        <h4 className="text-sm font-bold mb-2">Default Sprite</h4>

        {/* Static Image */}
        <div className="mb-3">
          <label className="text-xs text-stone-400 block mb-1">Static Image</label>
          {hasDefaultImage ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-green-400">
                  {(sprite.idleImageUrl || sprite.imageUrl) && !(sprite.idleImageData || sprite.imageData)
                    ? '✓ Using URL'
                    : '✓ Image set'}
                </span>
                <button
                  onClick={() => clearImage(false)}
                  className="px-2 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <>
              <label className="block cursor-pointer">
                <div className="px-3 py-2 bg-stone-600 rounded text-sm text-center hover:bg-stone-500">
                  Upload Image
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, false)}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={() => setShowDefaultImageUrl(!showDefaultImageUrl)}
                className="mt-1 text-xs text-arcane-400 hover:text-arcane-300"
              >
                {showDefaultImageUrl ? '▼ Hide URL input' : '▶ Or use URL...'}
              </button>
              {showDefaultImageUrl && (
                <div className="flex gap-2 mt-1">
                  <input
                    type="url"
                    value={defaultImageUrlInput}
                    onChange={(e) => setDefaultImageUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleImageUrlSubmit(false)}
                    placeholder="https://..."
                    className="flex-1 px-2 py-1 bg-stone-600 rounded text-xs text-parchment-100"
                  />
                  <button
                    type="button"
                    onClick={() => handleImageUrlSubmit(false)}
                    className="px-2 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-xs"
                  >
                    Set
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Spritesheet */}
        <div>
          <label className="text-xs text-stone-400 block mb-1">Animated Spritesheet</label>
          {hasDefaultSpriteSheet ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-green-400">
                  {sprite.idleSpriteSheet?.imageUrl && !sprite.idleSpriteSheet?.imageData
                    ? '✓ Using URL'
                    : '✓ Spritesheet set'}
                </span>
                <button
                  onClick={() => clearSpriteSheet(false)}
                  className="px-2 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-stone-400">Frames</label>
                  <input
                    type="number"
                    min="1"
                    max="32"
                    value={sprite.idleSpriteSheet?.frameCount || 4}
                    onChange={(e) => updateSpriteSheet('idleSpriteSheet', { frameCount: Number(e.target.value) })}
                    className="w-full px-2 py-1 bg-stone-600 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-stone-400">FPS</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={sprite.idleSpriteSheet?.frameRate || 8}
                    onChange={(e) => updateSpriteSheet('idleSpriteSheet', { frameRate: Number(e.target.value) })}
                    className="w-full px-2 py-1 bg-stone-600 rounded text-sm"
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              <label className="block cursor-pointer">
                <div className="px-3 py-2 bg-stone-600 rounded text-sm text-center hover:bg-stone-500">
                  Upload Spritesheet
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleSpriteSheetUpload(e, false)}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={() => setShowDefaultSpriteSheetUrl(!showDefaultSpriteSheetUrl)}
                className="mt-1 text-xs text-arcane-400 hover:text-arcane-300"
              >
                {showDefaultSpriteSheetUrl ? '▼ Hide URL input' : '▶ Or use URL...'}
              </button>
              {showDefaultSpriteSheetUrl && (
                <div className="flex gap-2 mt-1">
                  <input
                    type="url"
                    value={defaultSpriteSheetUrlInput}
                    onChange={(e) => setDefaultSpriteSheetUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSpriteSheetUrlSubmit(false)}
                    placeholder="https://..."
                    className="flex-1 px-2 py-1 bg-stone-600 rounded text-xs text-parchment-100"
                  />
                  <button
                    type="button"
                    onClick={() => handleSpriteSheetUrlSubmit(false)}
                    className="px-2 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-xs"
                  >
                    Set
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        <p className="text-xs text-stone-500 mt-2">
          Spritesheet takes priority over static image if both are set.
        </p>
      </div>

      {/* Triggered Sprite (optional) */}
      <div className="bg-stone-700 p-3 rounded">
        <h4 className="text-sm font-bold mb-2">Triggered Sprite (Optional)</h4>
        <p className="text-xs text-stone-400 mb-2">
          Alternate appearance when triggered by nearby entities.
        </p>

        {/* Trigger Type */}
        <div className="mb-3">
          <label className="text-xs text-stone-400 block mb-1">Trigger Condition</label>
          <select
            value={sprite.triggerType || 'none'}
            onChange={(e) => handleTriggerTypeChange(e.target.value)}
            className="w-full px-2 py-1 bg-stone-600 rounded text-sm"
          >
            {TRIGGER_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {sprite.triggerType && sprite.triggerType !== 'none' && (
          <>
            {/* Triggered Static Image */}
            <div className="mb-3">
              <label className="text-xs text-stone-400 block mb-1">Triggered Static Image</label>
              {hasTriggeredImage ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-green-400">
                      {sprite.triggeredImageUrl && !sprite.triggeredImageData
                        ? '✓ Using URL'
                        : '✓ Image set'}
                    </span>
                    <button
                      onClick={() => clearImage(true)}
                      className="px-2 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <label className="block cursor-pointer">
                    <div className="px-3 py-2 bg-stone-600 rounded text-sm text-center hover:bg-stone-500">
                      Upload Image
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, true)}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowTriggeredImageUrl(!showTriggeredImageUrl)}
                    className="mt-1 text-xs text-arcane-400 hover:text-arcane-300"
                  >
                    {showTriggeredImageUrl ? '▼ Hide URL input' : '▶ Or use URL...'}
                  </button>
                  {showTriggeredImageUrl && (
                    <div className="flex gap-2 mt-1">
                      <input
                        type="url"
                        value={triggeredImageUrlInput}
                        onChange={(e) => setTriggeredImageUrlInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleImageUrlSubmit(true)}
                        placeholder="https://..."
                        className="flex-1 px-2 py-1 bg-stone-600 rounded text-xs text-parchment-100"
                      />
                      <button
                        type="button"
                        onClick={() => handleImageUrlSubmit(true)}
                        className="px-2 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-xs"
                      >
                        Set
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Triggered Spritesheet */}
            <div>
              <label className="text-xs text-stone-400 block mb-1">Triggered Spritesheet</label>
              {hasTriggeredSpriteSheet ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-green-400">
                      {sprite.triggeredSpriteSheet?.imageUrl && !sprite.triggeredSpriteSheet?.imageData
                        ? '✓ Using URL'
                        : '✓ Spritesheet set'}
                    </span>
                    <button
                      onClick={() => clearSpriteSheet(true)}
                      className="px-2 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-stone-400">Frames</label>
                      <input
                        type="number"
                        min="1"
                        max="32"
                        value={sprite.triggeredSpriteSheet?.frameCount || 4}
                        onChange={(e) => updateSpriteSheet('triggeredSpriteSheet', { frameCount: Number(e.target.value) })}
                        className="w-full px-2 py-1 bg-stone-600 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-stone-400">FPS</label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={sprite.triggeredSpriteSheet?.frameRate || 8}
                        onChange={(e) => updateSpriteSheet('triggeredSpriteSheet', { frameRate: Number(e.target.value) })}
                        className="w-full px-2 py-1 bg-stone-600 rounded text-sm"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <label className="block cursor-pointer">
                    <div className="px-3 py-2 bg-stone-600 rounded text-sm text-center hover:bg-stone-500">
                      Upload Spritesheet
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleSpriteSheetUpload(e, true)}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowTriggeredSpriteSheetUrl(!showTriggeredSpriteSheetUrl)}
                    className="mt-1 text-xs text-arcane-400 hover:text-arcane-300"
                  >
                    {showTriggeredSpriteSheetUrl ? '▼ Hide URL input' : '▶ Or use URL...'}
                  </button>
                  {showTriggeredSpriteSheetUrl && (
                    <div className="flex gap-2 mt-1">
                      <input
                        type="url"
                        value={triggeredSpriteSheetUrlInput}
                        onChange={(e) => setTriggeredSpriteSheetUrlInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSpriteSheetUrlSubmit(true)}
                        placeholder="https://..."
                        className="flex-1 px-2 py-1 bg-stone-600 rounded text-xs text-parchment-100"
                      />
                      <button
                        type="button"
                        onClick={() => handleSpriteSheetUrlSubmit(true)}
                        className="px-2 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-xs"
                      >
                        Set
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Shape Options (only shown if no default image/spritesheet) */}
      {!hasDefaultImage && !hasDefaultSpriteSheet && (
        <>
          <div className="bg-stone-700 p-3 rounded">
            <h4 className="text-sm font-bold mb-2">Fallback Shape</h4>
            <div className="grid grid-cols-5 gap-1">
              {SHAPES.map(s => (
                <button
                  key={s.value}
                  onClick={() => handleShapeChange(s.value)}
                  className={`p-2 rounded text-xs ${
                    sprite.shape === s.value
                      ? 'bg-blue-600'
                      : 'bg-stone-600 hover:bg-stone-500'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="text-xs text-stone-400 block mb-1">Primary</label>
                <input
                  type="color"
                  value={sprite.primaryColor || '#8b4513'}
                  onChange={(e) => handleColorChange('primary', e.target.value)}
                  className="w-full h-8 rounded cursor-pointer"
                />
              </div>
              <div>
                <label className="text-xs text-stone-400 block mb-1">Secondary</label>
                <input
                  type="color"
                  value={sprite.secondaryColor || '#d2691e'}
                  onChange={(e) => handleColorChange('secondary', e.target.value)}
                  className="w-full h-8 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Size */}
      <div className="bg-stone-700 p-3 rounded">
        <h4 className="text-sm font-bold mb-2">Size: {((sprite.size || 0.8) * 100).toFixed(0)}%</h4>
        <input
          type="range"
          min="0.3"
          max="2.0"
          step="0.05"
          value={sprite.size || 0.8}
          onChange={(e) => handleSizeChange(parseFloat(e.target.value))}
          className="w-full"
        />
        <p className="text-xs text-stone-400 mt-1">
          Size relative to tile. Values &gt;100% extend beyond tile bounds.
        </p>
      </div>
    </div>
  );
};

/**
 * Draw a shape-based sprite
 */
function drawShape(
  ctx: CanvasRenderingContext2D,
  sprite: CustomSprite,
  centerX: number,
  centerY: number,
  canvasSize: number
) {
  const size = (sprite.size || 0.8) * canvasSize * 0.8;
  const primaryColor = sprite.primaryColor || '#8b4513';
  const secondaryColor = sprite.secondaryColor || '#d2691e';
  const shape = sprite.shape || 'square';

  ctx.fillStyle = primaryColor;
  ctx.strokeStyle = secondaryColor;
  ctx.lineWidth = 3;

  switch (shape) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;

    case 'square':
      ctx.fillRect(centerX - size / 2, centerY - size / 2, size, size);
      ctx.strokeRect(centerX - size / 2, centerY - size / 2, size, size);
      break;

    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - size / 2);
      ctx.lineTo(centerX + size / 2, centerY + size / 2);
      ctx.lineTo(centerX - size / 2, centerY + size / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;

    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - size / 2);
      ctx.lineTo(centerX + size / 2, centerY);
      ctx.lineTo(centerX, centerY + size / 2);
      ctx.lineTo(centerX - size / 2, centerY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;

    case 'star':
      const spikes = 5;
      const outerRadius = size / 2;
      const innerRadius = size / 4;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = (i * Math.PI) / spikes - Math.PI / 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;

    default:
      ctx.fillRect(centerX - size / 2, centerY - size / 2, size, size);
      ctx.strokeRect(centerX - size / 2, centerY - size / 2, size, size);
  }
}

export default StaticSpriteEditor;
