import React, { useState, useRef, useEffect } from 'react';
import type { SpellAsset, SpellTemplate, DirectionMode, Direction, SpriteReference, RelativeDirection, StatusEffectAsset, SoundAsset } from '../../types/game';
import type { SpriteSheetConfig } from '../../utils/assetStorage';
import { saveSpellAsset, getFolders, getStatusEffectAssets, getSoundAssets } from '../../utils/assetStorage';
import { RichTextEditor } from './RichTextEditor';

interface SpellAssetBuilderProps {
  spell?: SpellAsset; // If editing existing spell
  onSave: (spell: SpellAsset) => void;
  onCancel: () => void;
}

const ALL_DIRECTIONS: { value: Direction; label: string; arrow: string }[] = [
  { value: 'north' as Direction, label: 'North', arrow: '↑' },
  { value: 'northeast' as Direction, label: 'Northeast', arrow: '↗' },
  { value: 'east' as Direction, label: 'East', arrow: '→' },
  { value: 'southeast' as Direction, label: 'Southeast', arrow: '↘' },
  { value: 'south' as Direction, label: 'South', arrow: '↓' },
  { value: 'southwest' as Direction, label: 'Southwest', arrow: '↙' },
  { value: 'west' as Direction, label: 'West', arrow: '←' },
  { value: 'northwest' as Direction, label: 'Northwest', arrow: '↖' },
];

// Sprite mode type for spell sprites
type SpellSpriteMode = 'shape' | 'image' | 'spritesheet';

// Reusable component for spell sprite configuration (projectile, melee attack, hit effect)
interface SpellSpriteEditorProps {
  label: string;
  spriteRef: SpriteReference | undefined;
  onChange: (sprite: SpriteReference) => void;
  accentColor: string; // 'blue', 'red', 'green', etc.
  showDirectionalPreview?: boolean; // Show 8-direction rotation preview
  helpText?: string;
}

// Static color class mappings for Tailwind JIT compatibility
const colorClasses: Record<string, { bg: string; hover: string; fileBg: string; fileHover: string }> = {
  blue: {
    bg: 'bg-blue-600',
    hover: 'hover:bg-blue-700',
    fileBg: 'file:bg-blue-600',
    fileHover: 'hover:file:bg-blue-700',
  },
  red: {
    bg: 'bg-red-600',
    hover: 'hover:bg-red-700',
    fileBg: 'file:bg-red-600',
    fileHover: 'hover:file:bg-red-700',
  },
  purple: {
    bg: 'bg-purple-600',
    hover: 'hover:bg-purple-700',
    fileBg: 'file:bg-purple-600',
    fileHover: 'hover:file:bg-purple-700',
  },
  green: {
    bg: 'bg-green-600',
    hover: 'hover:bg-green-700',
    fileBg: 'file:bg-green-600',
    fileHover: 'hover:file:bg-green-700',
  },
};

const SpellSpriteEditor: React.FC<SpellSpriteEditorProps> = ({
  label,
  spriteRef,
  onChange,
  accentColor,
  showDirectionalPreview = false,
  helpText,
}) => {
  const spriteData = spriteRef?.spriteData || {};
  const colors = colorClasses[accentColor] || colorClasses.blue;

  // Determine current mode based on sprite data - only used for initial state
  const getCurrentMode = (): SpellSpriteMode => {
    if (spriteData.spriteSheet) return 'spritesheet';
    if (spriteData.idleImageData) return 'image';
    if (spriteData.type === 'spritesheet') return 'spritesheet';
    if (spriteData.type === 'image') return 'image';
    return 'shape';
  };

  const [mode, setMode] = useState<SpellSpriteMode>(getCurrentMode);

  // Only sync mode from external data when the spriteRef ID changes (editing different spell)
  // This prevents the jitter when mode is changed but no file uploaded yet
  const spriteRefId = spriteRef?.spriteId;
  useEffect(() => {
    // Reset to detected mode only when switching to a different stored sprite
    if (spriteRefId) {
      setMode(getCurrentMode());
    }
  }, [spriteRefId]);

  const handleModeChange = (newMode: SpellSpriteMode) => {
    setMode(newMode);
    // Don't call onChange here - just update local mode state
    // The actual data update happens when user uploads a file or changes shape/color
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;
      onChange({
        type: 'inline',
        spriteData: {
          ...spriteData,
          type: 'image',
          idleImageData: imageData,
        }
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSpriteSheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;
      const spriteSheetConfig: SpriteSheetConfig = {
        imageData,
        frameCount: 4,
        frameRate: 10,
        loop: true,
      };
      onChange({
        type: 'inline',
        spriteData: {
          ...spriteData,
          type: 'spritesheet',
          spriteSheet: spriteSheetConfig,
        }
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSpriteSheetConfigChange = (field: keyof SpriteSheetConfig, value: number | boolean) => {
    if (!spriteData.spriteSheet) return;
    onChange({
      type: 'inline',
      spriteData: {
        ...spriteData,
        spriteSheet: {
          ...spriteData.spriteSheet,
          [field]: value,
        }
      }
    });
  };

  return (
    <div className="bg-stone-900 p-3 rounded">
      <label className="block text-sm font-medium mb-2">{label}</label>
      {helpText && <p className="text-xs text-stone-500 mb-2">{helpText}</p>}

      {/* Mode Toggle: Shape vs Image vs Sprite Sheet */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => handleModeChange('shape')}
          className={`flex-1 px-2 py-1 rounded text-xs transition-colors ${
            mode === 'shape'
              ? `${colors.bg} text-parchment-100`
              : 'bg-stone-700 text-stone-300 hover:bg-stone-600'
          }`}
        >
          Basic Shape
        </button>
        <button
          onClick={() => handleModeChange('image')}
          className={`flex-1 px-2 py-1 rounded text-xs transition-colors ${
            mode === 'image'
              ? `${colors.bg} text-parchment-100`
              : 'bg-stone-700 text-stone-300 hover:bg-stone-600'
          }`}
        >
          Image/GIF
        </button>
        <button
          onClick={() => handleModeChange('spritesheet')}
          className={`flex-1 px-2 py-1 rounded text-xs transition-colors ${
            mode === 'spritesheet'
              ? `${colors.bg} text-parchment-100`
              : 'bg-stone-700 text-stone-300 hover:bg-stone-600'
          }`}
        >
          Sprite Sheet
        </button>
      </div>

      {/* Shape Mode */}
      {mode === 'shape' && (
        <>
          <div className="mb-2">
            <label className="block text-xs text-stone-400 mb-1">Shape</label>
            <div className="grid grid-cols-5 gap-2">
              {['circle', 'square', 'triangle', 'star', 'diamond'].map((shape) => (
                <button
                  key={shape}
                  onClick={() => onChange({
                    type: 'inline',
                    spriteData: { ...spriteData, shape, type: 'simple' }
                  })}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    spriteData.shape === shape
                      ? `${colors.bg} text-parchment-100`
                      : 'bg-stone-700 text-stone-300 hover:bg-stone-600'
                  }`}
                >
                  {shape}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-stone-400 mb-1">Color</label>
            <input
              type="color"
              value={spriteData.primaryColor || '#ff6600'}
              onChange={(e) => onChange({
                type: 'inline',
                spriteData: { ...spriteData, primaryColor: e.target.value, type: 'simple' }
              })}
              className="w-full h-10 rounded cursor-pointer"
            />
          </div>
        </>
      )}

      {/* Image Mode */}
      {mode === 'image' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-stone-400 mb-1">Upload PNG/GIF</label>
            {showDirectionalPreview && (
              <p className="text-xs text-stone-500 mb-2">
                Upload image pointing <strong>East (→)</strong>. It will auto-rotate for all directions.
              </p>
            )}
            <input
              type="file"
              accept="image/png,image/gif"
              onChange={handleImageUpload}
              className={`w-full text-xs text-stone-300 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs ${colors.fileBg} file:text-parchment-100 ${colors.fileHover}`}
            />
            {spriteData.idleImageData && (
              <div className="mt-2 p-2 dungeon-panel rounded flex items-center justify-center">
                <img
                  src={spriteData.idleImageData}
                  alt="Preview"
                  className="max-h-16 pixelated"
                />
              </div>
            )}
          </div>

          {/* Directional Preview */}
          {showDirectionalPreview && spriteData.idleImageData && (
            <div>
              <label className="block text-xs text-stone-400 mb-2">Directional Preview</label>
              <div className="grid grid-cols-4 gap-2 dungeon-panel p-3 rounded">
                {[
                  { label: 'E', rotation: 0, mirror: false },
                  { label: 'NE', rotation: 45, mirror: false },
                  { label: 'N', rotation: 90, mirror: false },
                  { label: 'NW', rotation: 45, mirror: true },
                  { label: 'W', rotation: 0, mirror: true },
                  { label: 'SW', rotation: -45, mirror: true },
                  { label: 'S', rotation: -90, mirror: false },
                  { label: 'SE', rotation: -45, mirror: false },
                ].map(({ label, rotation, mirror }) => (
                  <div key={label} className="flex flex-col items-center gap-1 p-2 bg-stone-900 rounded">
                    <span className="text-xs text-stone-400 font-bold">{label}</span>
                    <div className="w-12 h-12 flex items-center justify-center bg-stone-700 rounded">
                      <img
                        src={spriteData.idleImageData}
                        alt={`${label} direction`}
                        className="max-w-10 max-h-10 pixelated"
                        style={{
                          transform: `rotate(${rotation}deg) scaleX(${mirror ? -1 : 1})`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sprite Sheet Mode */}
      {mode === 'spritesheet' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-stone-400 mb-1">Upload Sprite Sheet (horizontal strip)</label>
            {showDirectionalPreview && (
              <p className="text-xs text-stone-500 mb-2">
                Upload sprite sheet with frames pointing <strong>East (→)</strong>. It will auto-rotate for all directions.
              </p>
            )}
            <input
              type="file"
              accept="image/png,image/jpg,image/jpeg"
              onChange={handleSpriteSheetUpload}
              className={`w-full text-xs text-stone-300 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs ${colors.fileBg} file:text-parchment-100 ${colors.fileHover}`}
            />
          </div>

          {spriteData.spriteSheet && (
            <>
              {/* Sprite Sheet Preview */}
              <div className="p-2 dungeon-panel rounded">
                <img
                  src={spriteData.spriteSheet.imageData}
                  alt="Sprite sheet preview"
                  className="max-h-16 pixelated mx-auto"
                />
              </div>

              {/* Sprite Sheet Configuration */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-stone-400 mb-1">Frame Count</label>
                  <input
                    type="number"
                    min="1"
                    max="32"
                    value={spriteData.spriteSheet.frameCount || 4}
                    onChange={(e) => handleSpriteSheetConfigChange('frameCount', parseInt(e.target.value) || 1)}
                    className="w-full px-2 py-1 bg-stone-700 rounded text-sm text-parchment-100"
                  />
                </div>

                <div>
                  <label className="block text-xs text-stone-400 mb-1">Frame Rate (FPS)</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={spriteData.spriteSheet.frameRate || 10}
                    onChange={(e) => handleSpriteSheetConfigChange('frameRate', parseInt(e.target.value) || 10)}
                    className="w-full px-2 py-1 bg-stone-700 rounded text-sm text-parchment-100"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={spriteData.spriteSheet.loop !== false}
                    onChange={(e) => handleSpriteSheetConfigChange('loop', e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-xs text-stone-400">Loop Animation</span>
                </label>
              </div>

              {/* Animated Preview */}
              <div>
                <label className="block text-xs text-stone-400 mb-2">Animation Preview</label>
                <SpriteSheetPreview spriteSheet={spriteData.spriteSheet} />
              </div>

              {/* Directional Preview for Sprite Sheets */}
              {showDirectionalPreview && (
                <div>
                  <label className="block text-xs text-stone-400 mb-2">Directional Preview (first frame)</label>
                  <div className="grid grid-cols-4 gap-2 dungeon-panel p-3 rounded">
                    {[
                      { label: 'E', rotation: 0, mirror: false },
                      { label: 'NE', rotation: 45, mirror: false },
                      { label: 'N', rotation: 90, mirror: false },
                      { label: 'NW', rotation: 45, mirror: true },
                      { label: 'W', rotation: 0, mirror: true },
                      { label: 'SW', rotation: -45, mirror: true },
                      { label: 'S', rotation: -90, mirror: false },
                      { label: 'SE', rotation: -45, mirror: false },
                    ].map(({ label, rotation, mirror }) => (
                      <div key={label} className="flex flex-col items-center gap-1 p-2 bg-stone-900 rounded">
                        <span className="text-xs text-stone-400 font-bold">{label}</span>
                        <SpriteSheetPreview
                          spriteSheet={spriteData.spriteSheet}
                          rotation={rotation}
                          mirror={mirror}
                          size={40}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// Animated sprite sheet preview component
interface SpriteSheetPreviewProps {
  spriteSheet: SpriteSheetConfig;
  rotation?: number;
  mirror?: boolean;
  size?: number;
}

const SpriteSheetPreview: React.FC<SpriteSheetPreviewProps> = ({
  spriteSheet,
  rotation = 0,
  mirror = false,
  size = 48
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentFrame, setCurrentFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFrame(prev => {
        const next = prev + 1;
        if (next >= spriteSheet.frameCount) {
          return spriteSheet.loop !== false ? 0 : spriteSheet.frameCount - 1;
        }
        return next;
      });
    }, 1000 / spriteSheet.frameRate);

    return () => clearInterval(interval);
  }, [spriteSheet.frameCount, spriteSheet.frameRate, spriteSheet.loop]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const frameWidth = spriteSheet.frameWidth || (img.naturalWidth / spriteSheet.frameCount);
      const frameHeight = spriteSheet.frameHeight || img.naturalHeight;

      // Save context
      ctx.save();

      // Move to center for rotation
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      if (mirror) {
        ctx.scale(-1, 1);
      }

      // Calculate display size preserving aspect ratio
      const aspectRatio = frameWidth / frameHeight;
      let drawWidth = size;
      let drawHeight = size;
      if (aspectRatio > 1) {
        drawHeight = size / aspectRatio;
      } else {
        drawWidth = size * aspectRatio;
      }

      // Draw current frame
      ctx.drawImage(
        img,
        currentFrame * frameWidth, 0, frameWidth, frameHeight,
        -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight
      );

      ctx.restore();
    };
    img.src = spriteSheet.imageData;
  }, [spriteSheet, currentFrame, rotation, mirror, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="bg-stone-700 rounded"
    />
  );
};

export const SpellAssetBuilder: React.FC<SpellAssetBuilderProps> = ({ spell, onSave, onCancel }) => {
  const [editedSpell, setEditedSpell] = useState<SpellAsset>(spell || {
    id: 'spell_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    name: '',
    description: '',
    thumbnailIcon: '',
    templateType: 'melee' as SpellTemplate,
    directionMode: 'current_facing' as DirectionMode,
    damage: 1,
    sprites: {
      damageEffect: { type: 'inline', spriteData: null },
    },
    createdAt: new Date().toISOString(),
    isCustom: true,
  });

  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  const handleThumbnailUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, GIF)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const thumbnailIcon = event.target?.result as string;
      setEditedSpell({ ...editedSpell, thumbnailIcon });
    };
    reader.readAsDataURL(file);
  };

  const toggleDirection = (dir: Direction) => {
    const current = editedSpell.defaultDirections || [];
    const exists = current.includes(dir);

    if (exists) {
      setEditedSpell({
        ...editedSpell,
        defaultDirections: current.filter(d => d !== dir),
      });
    } else {
      setEditedSpell({
        ...editedSpell,
        defaultDirections: [...current, dir],
      });
    }
  };

  const toggleRelativeDirection = (dir: RelativeDirection) => {
    const current = editedSpell.relativeDirections || [];
    const exists = current.includes(dir);

    if (exists) {
      setEditedSpell({
        ...editedSpell,
        relativeDirections: current.filter(d => d !== dir),
      });
    } else {
      setEditedSpell({
        ...editedSpell,
        relativeDirections: [...current, dir],
      });
    }
  };

  const handleSave = () => {
    // Validation
    if (!editedSpell.name.trim()) {
      alert('Please enter a spell name');
      return;
    }

    if (editedSpell.directionMode === 'fixed' && (!editedSpell.defaultDirections || editedSpell.defaultDirections.length === 0)) {
      alert('Please select at least one direction for fixed direction mode');
      return;
    }

    if (editedSpell.directionMode === 'relative' && (!editedSpell.relativeDirections || editedSpell.relativeDirections.length === 0)) {
      alert('Please select at least one relative direction');
      return;
    }

    // Save to library
    saveSpellAsset(editedSpell);
    alert(`Saved "${editedSpell.name}"!`);
    onSave(editedSpell);
  };

  const templateNeedsRange = editedSpell.templateType === 'range_linear' || editedSpell.templateType === 'magic_linear';
  const templateNeedsRadius = editedSpell.templateType === 'aoe';
  const templateNeedsProjectileSettings = templateNeedsRange;
  const templateIsMelee = editedSpell.templateType === 'melee';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          {spell ? 'Edit Spell' : 'Create New Spell'}
        </h2>
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-green-600 rounded hover:bg-green-700"
          >
            Save Spell
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-stone-600 rounded hover:bg-stone-700"
          >
            Cancel
          </button>
        </div>
      </div>

        <div className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-stone-700 pb-2">Basic Information</h3>

            {/* Spell Name */}
            <div>
              <label className="block text-sm font-medium mb-1">Spell Name *</label>
              <input
                type="text"
                value={editedSpell.name}
                onChange={(e) => setEditedSpell({ ...editedSpell, name: e.target.value })}
                className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
                placeholder="e.g., Fireball, Lightning Bolt, Whirlwind"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <RichTextEditor
                value={editedSpell.description}
                onChange={(value) => setEditedSpell({ ...editedSpell, description: value })}
                placeholder="Describe what this spell does..."
                multiline
              />
            </div>

            {/* Folder */}
            <div>
              <label className="block text-sm font-medium mb-1">Folder</label>
              <select
                value={editedSpell.folderId || ''}
                onChange={(e) => setEditedSpell({ ...editedSpell, folderId: e.target.value || undefined })}
                className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
              >
                <option value="">Uncategorized</option>
                {getFolders('spells').map(folder => (
                  <option key={folder.id} value={folder.id}>{folder.name}</option>
                ))}
              </select>
            </div>

            {/* Thumbnail Icon */}
            <div>
              <label className="block text-sm font-medium mb-1">Thumbnail Icon *</label>
              <div className="flex items-center gap-3">
                <input
                  ref={thumbnailInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleThumbnailUpload}
                  className="hidden"
                />
                <button
                  onClick={() => thumbnailInputRef.current?.click()}
                  className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
                >
                  Upload Icon
                </button>
                {editedSpell.thumbnailIcon && (
                  <div className="flex items-center gap-2">
                    <img
                      src={editedSpell.thumbnailIcon}
                      alt="Thumbnail"
                      className="w-12 h-12 object-contain bg-stone-900 rounded border border-stone-600"
                    />
                    <button
                      onClick={() => setEditedSpell({ ...editedSpell, thumbnailIcon: '' })}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-stone-400 mt-1">Upload a small icon to represent this spell in the library</p>
            </div>
          </div>

          {/* Template Type */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-stone-700 pb-2">Spell Type</h3>

            <div>
              <label className="block text-sm font-medium mb-2">Template *</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setEditedSpell({ ...editedSpell, templateType: 'melee' as SpellTemplate })}
                  className={`p-3 rounded border-2 transition-colors ${
                    editedSpell.templateType === 'melee'
                      ? 'border-blue-500 bg-blue-900'
                      : 'border-stone-600 bg-stone-700 hover:border-stone-500'
                  }`}
                >
                  <div className="font-semibold">Melee</div>
                  <div className="text-xs text-stone-400">Adjacent tile attack</div>
                </button>

                <button
                  onClick={() => setEditedSpell({ ...editedSpell, templateType: 'range_linear' as SpellTemplate })}
                  className={`p-3 rounded border-2 transition-colors ${
                    editedSpell.templateType === 'range_linear'
                      ? 'border-blue-500 bg-blue-900'
                      : 'border-stone-600 bg-stone-700 hover:border-stone-500'
                  }`}
                >
                  <div className="font-semibold">Range Linear</div>
                  <div className="text-xs text-stone-400">Physical projectile</div>
                </button>

                <button
                  onClick={() => setEditedSpell({ ...editedSpell, templateType: 'magic_linear' as SpellTemplate })}
                  className={`p-3 rounded border-2 transition-colors ${
                    editedSpell.templateType === 'magic_linear'
                      ? 'border-blue-500 bg-blue-900'
                      : 'border-stone-600 bg-stone-700 hover:border-stone-500'
                  }`}
                >
                  <div className="font-semibold">Magic Linear</div>
                  <div className="text-xs text-stone-400">Magic projectile</div>
                </button>

                <button
                  onClick={() => setEditedSpell({ ...editedSpell, templateType: 'aoe' as SpellTemplate })}
                  className={`p-3 rounded border-2 transition-colors ${
                    editedSpell.templateType === 'aoe'
                      ? 'border-blue-500 bg-blue-900'
                      : 'border-stone-600 bg-stone-700 hover:border-stone-500'
                  }`}
                >
                  <div className="font-semibold">AOE</div>
                  <div className="text-xs text-stone-400">Area of effect</div>
                </button>
              </div>
            </div>
          </div>

          {/* Direction Configuration - Hidden for self-centered AOE */}
          {!(templateNeedsRadius && editedSpell.aoeCenteredOnCaster) && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b border-stone-700 pb-2">Direction Configuration</h3>

              <div>
                <label className="block text-sm font-medium mb-2">Direction Mode *</label>
                <select
                  value={editedSpell.directionMode}
                  onChange={(e) => setEditedSpell({ ...editedSpell, directionMode: e.target.value as DirectionMode })}
                  className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
                >
                  <option value="current_facing">Current Facing (follows character direction)</option>
                  <option value="relative">Relative (relative to character facing)</option>
                  <option value="fixed">Fixed Directions (always same)</option>
                  <option value="all_directions">All Directions (360°)</option>
                </select>
                <p className="text-xs text-stone-400 mt-1">
                  {editedSpell.directionMode === 'current_facing' && 'Spell fires in the direction the caster is facing'}
                  {editedSpell.directionMode === 'relative' && 'Spell fires in direction(s) relative to caster (e.g., always to the right)'}
                  {editedSpell.directionMode === 'fixed' && 'Spell always fires in the same absolute direction(s)'}
                  {editedSpell.directionMode === 'all_directions' && 'Spell fires in all 8 directions at once'}
                </p>
              </div>

            {editedSpell.directionMode === 'fixed' && (
              <div>
                <label className="block text-sm font-medium mb-2">Select Directions *</label>
                <div className="grid grid-cols-4 gap-2">
                  {ALL_DIRECTIONS.map((dir) => {
                    const isSelected = editedSpell.defaultDirections?.includes(dir.value);
                    return (
                      <button
                        key={dir.value}
                        onClick={() => toggleDirection(dir.value)}
                        className={`p-2 rounded border-2 transition-colors ${
                          isSelected
                            ? 'border-green-500 bg-green-900'
                            : 'border-stone-600 bg-stone-700 hover:border-stone-500'
                        }`}
                      >
                        <div className="text-2xl">{dir.arrow}</div>
                        <div className="text-xs">{dir.label}</div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-stone-400 mt-2">
                  Selected: {editedSpell.defaultDirections?.length || 0} direction(s)
                </p>
              </div>
            )}

            {editedSpell.directionMode === 'relative' && (
              <div>
                <label className="block text-sm font-medium mb-2">Select Relative Directions *</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: 'forward' as RelativeDirection, label: 'Forward', arrow: '↑' },
                    { value: 'forward_right' as RelativeDirection, label: 'Forward Right', arrow: '↗' },
                    { value: 'right' as RelativeDirection, label: 'Right', arrow: '→' },
                    { value: 'backward_right' as RelativeDirection, label: 'Backward Right', arrow: '↘' },
                    { value: 'backward' as RelativeDirection, label: 'Backward', arrow: '↓' },
                    { value: 'backward_left' as RelativeDirection, label: 'Backward Left', arrow: '↙' },
                    { value: 'left' as RelativeDirection, label: 'Left', arrow: '←' },
                    { value: 'forward_left' as RelativeDirection, label: 'Forward Left', arrow: '↖' },
                  ].map((dir) => {
                    const isSelected = editedSpell.relativeDirections?.includes(dir.value);
                    return (
                      <button
                        key={dir.value}
                        onClick={() => toggleRelativeDirection(dir.value)}
                        className={`p-2 rounded border-2 transition-colors ${
                          isSelected
                            ? 'border-green-500 bg-green-900'
                            : 'border-stone-600 bg-stone-700 hover:border-stone-500'
                        }`}
                      >
                        <div className="text-2xl">{dir.arrow}</div>
                        <div className="text-xs">{dir.label}</div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-stone-400 mt-2">
                  Selected: {editedSpell.relativeDirections?.length || 0} direction(s). These are relative to the caster's facing direction.
                </p>
                <div className="bg-blue-900 border border-blue-600 rounded p-2 mt-2">
                  <p className="text-xs text-blue-200">
                    <strong>Example:</strong> If you select "Right", the spell will always fire to the right of where the character is facing. If the character turns, the spell direction automatically adjusts.
                  </p>
                </div>
              </div>
            )}
            </div>
          )}

          {/* Combat Stats */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-stone-700 pb-2">Combat Stats</h3>

            {/* Damage vs Healing Toggle */}
            <div>
              <label className="block text-sm font-medium mb-2">Effect Type</label>
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setEditedSpell({
                    ...editedSpell,
                    damage: editedSpell.healing || editedSpell.damage || 1,
                    healing: undefined
                  })}
                  className={`flex-1 px-4 py-2 rounded transition-colors ${
                    !editedSpell.healing
                      ? 'bg-red-600 text-parchment-100'
                      : 'bg-stone-700 text-stone-300 hover:bg-stone-600'
                  }`}
                >
                  💥 Damage
                </button>
                <button
                  type="button"
                  onClick={() => setEditedSpell({
                    ...editedSpell,
                    healing: editedSpell.damage || editedSpell.healing || 1,
                    damage: undefined
                  })}
                  className={`flex-1 px-4 py-2 rounded transition-colors ${
                    editedSpell.healing
                      ? 'bg-green-600 text-parchment-100'
                      : 'bg-stone-700 text-stone-300 hover:bg-stone-600'
                  }`}
                >
                  💚 Healing
                </button>
              </div>
            </div>

            {/* Damage or Healing Amount */}
            <div>
              <label className="block text-sm font-medium mb-1">
                {editedSpell.healing ? 'Healing Amount *' : 'Damage Amount *'}
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={editedSpell.healing || editedSpell.damage || 0}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 0;
                  if (editedSpell.healing) {
                    setEditedSpell({ ...editedSpell, healing: value });
                  } else {
                    setEditedSpell({ ...editedSpell, damage: value });
                  }
                }}
                className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
              />
              <p className="text-xs text-stone-400 mt-1">
                {editedSpell.healing
                  ? 'HP restored to allies (same team only)'
                  : 'HP removed from enemies'
                }
              </p>
            </div>

            {/* Cooldown */}
            <div>
              <label className="block text-sm font-medium mb-1">Cooldown (turns)</label>
              <input
                type="number"
                min="0"
                max="99"
                value={editedSpell.cooldown || 0}
                onChange={(e) => setEditedSpell({ ...editedSpell, cooldown: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
              />
              <p className="text-xs text-stone-400 mt-1">
                Turns before spell can be used again (0 = no cooldown)
              </p>
            </div>

            {/* Sound Effects */}
            <div className="border-t border-stone-600 pt-4 mt-4">
              <h4 className="text-sm font-medium mb-3 text-purple-300">Sound Effects</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-stone-400 mb-1">Cast Sound</label>
                  <select
                    value={editedSpell.castSound || ''}
                    onChange={(e) => setEditedSpell({ ...editedSpell, castSound: e.target.value || undefined })}
                    className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm"
                  >
                    <option value="">None</option>
                    {getSoundAssets().map((sound) => (
                      <option key={sound.id} value={sound.id}>
                        {sound.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-stone-500 mt-1">Plays when spell is cast</p>
                </div>
                <div>
                  <label className="block text-xs text-stone-400 mb-1">Hit Sound</label>
                  <select
                    value={editedSpell.hitSound || ''}
                    onChange={(e) => setEditedSpell({ ...editedSpell, hitSound: e.target.value || undefined })}
                    className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm"
                  >
                    <option value="">None</option>
                    {getSoundAssets().map((sound) => (
                      <option key={sound.id} value={sound.id}>
                        {sound.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-stone-500 mt-1">Plays on hit/impact</p>
                </div>
              </div>
            </div>

            {/* Range (for linear spells and non-centered AOE) */}
            {(templateNeedsRange || (templateNeedsRadius && !editedSpell.aoeCenteredOnCaster)) && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  {templateNeedsRange ? 'Max Range (tiles)' : 'AOE Distance (tiles)'}
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={editedSpell.range || (templateNeedsRange ? 5 : 2)}
                  onChange={(e) => setEditedSpell({ ...editedSpell, range: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
                />
                {templateNeedsRadius && !editedSpell.aoeCenteredOnCaster && (
                  <p className="text-xs text-stone-400 mt-1">
                    Distance from caster to AOE center point (in selected direction)
                  </p>
                )}
              </div>
            )}

            {/* Radius (for AOE) */}
            {templateNeedsRadius && (
              <div>
                <label className="block text-sm font-medium mb-1">Radius (tiles)</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={editedSpell.radius ?? 2}
                  onChange={(e) => setEditedSpell({ ...editedSpell, radius: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
                />
                <p className="text-xs text-stone-400 mt-1">
                  0 = single tile only, 1+ = affects surrounding tiles
                </p>
              </div>
            )}

            {/* Melee Range (for melee spells) */}
            {templateIsMelee && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Melee Range (tiles)</label>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    value={editedSpell.meleeRange ?? 1}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setEditedSpell({ ...editedSpell, meleeRange: isNaN(val) ? 1 : val });
                    }}
                    className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
                  />
                  <p className="text-xs text-stone-400 mt-1">
                    How many tiles in attack direction get hit. 0 = self-target only, 1 = adjacent tile (default), 2+ = extended reach
                  </p>
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editedSpell.skipSpriteOnCasterTile || false}
                      onChange={(e) => setEditedSpell({ ...editedSpell, skipSpriteOnCasterTile: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium">Skip Attack Sprite on Caster Tile</span>
                  </label>
                  <p className="text-xs text-stone-400 mt-1">
                    Don't show the attack sprite on the caster's tile (useful for range 1+ spells where you only want to see the sprite on the target tiles)
                  </p>
                </div>
              </>
            )}
          </div>

          {/* AOE Settings */}
          {templateNeedsRadius && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b border-stone-700 pb-2">AOE Behavior</h3>

              {/* AOE Center Point */}
              <div>
                <label className="block text-sm font-medium mb-2">AOE Center</label>
                <div className="flex gap-2 mb-1">
                  <button
                    type="button"
                    onClick={() => setEditedSpell({ ...editedSpell, aoeCenteredOnCaster: true })}
                    className={`flex-1 px-4 py-2 rounded transition-colors ${
                      editedSpell.aoeCenteredOnCaster
                        ? 'bg-blue-600 text-parchment-100'
                        : 'bg-stone-700 text-stone-300 hover:bg-stone-600'
                    }`}
                  >
                    🔵 Caster
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditedSpell({ ...editedSpell, aoeCenteredOnCaster: false })}
                    className={`flex-1 px-4 py-2 rounded transition-colors ${
                      !editedSpell.aoeCenteredOnCaster
                        ? 'bg-blue-600 text-parchment-100'
                        : 'bg-stone-700 text-stone-300 hover:bg-stone-600'
                    }`}
                  >
                    🎯 Target Tile
                  </button>
                </div>
                <p className="text-xs text-stone-400 mt-1">
                  {editedSpell.aoeCenteredOnCaster
                    ? 'AOE centered on caster (e.g., Frost Nova, Healing Aura)'
                    : 'AOE centered on target tile at range (e.g., Flamestrike)'}
                </p>
                {editedSpell.aoeCenteredOnCaster && (
                  <div className="bg-blue-900 border border-blue-600 rounded p-2 mt-2">
                    <p className="text-xs text-blue-200">
                      When centered on caster, the AOE always appears around the caster regardless of direction. Direction settings are hidden because they don't apply.
                    </p>
                  </div>
                )}
                {!editedSpell.aoeCenteredOnCaster && (
                  <div className="bg-purple-900 border border-purple-600 rounded p-2 mt-2">
                    <p className="text-xs text-purple-200">
                      When centered on target tile, the AOE appears at a distance from the caster in the selected direction. Use "AOE Distance" to control how far away the center point is.
                    </p>
                  </div>
                )}
              </div>

              {/* Projectile Before AOE - Only for non-centered AOE */}
              {!editedSpell.aoeCenteredOnCaster && (
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editedSpell.projectileBeforeAOE || false}
                      onChange={(e) => setEditedSpell({ ...editedSpell, projectileBeforeAOE: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium">Fire Projectile First</span>
                  </label>
                  <p className="text-xs text-stone-400 ml-6">
                    If enabled, fires a projectile that travels to the target location and explodes into AOE on impact
                  </p>
                </div>
              )}

              {/* Persistent Effect Duration */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Persistent Duration (turns)
                </label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={editedSpell.persistDuration || 0}
                  onChange={(e) => setEditedSpell({ ...editedSpell, persistDuration: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
                />
                <p className="text-xs text-stone-400 mt-1">
                  0 = instant damage, 1+ = ground effect that persists for N turns
                </p>
              </div>

              {/* Persistent Damage Per Turn */}
              {editedSpell.persistDuration && editedSpell.persistDuration > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Damage Per Turn (persistent)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editedSpell.persistDamagePerTurn || editedSpell.damage || 1}
                    onChange={(e) => setEditedSpell({ ...editedSpell, persistDamagePerTurn: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
                  />
                  <p className="text-xs text-stone-400 mt-1">
                    Damage dealt each turn to units in the area
                  </p>
                </div>
              )}

              {/* Exclude Center Tile */}
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editedSpell.aoeExcludeCenter || false}
                    onChange={(e) => setEditedSpell({ ...editedSpell, aoeExcludeCenter: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">Exclude Center Tile</span>
                </label>
                <p className="text-xs text-stone-400 ml-6">
                  {editedSpell.aoeCenteredOnCaster
                    ? "Don't show effect on caster's tile"
                    : "Don't show effect on the center of the AOE"}
                </p>
              </div>
            </div>
          )}

          {/* Projectile Settings */}
          {templateNeedsProjectileSettings && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b border-stone-700 pb-2">Projectile Settings</h3>

              {/* Speed */}
              <div>
                <label className="block text-sm font-medium mb-1">Projectile Speed (tiles/turn)</label>
                <input
                  type="number"
                  min="1"
                  max="16"
                  step="1"
                  value={editedSpell.projectileSpeed || 4}
                  onChange={(e) => {
                    const tilesPerTurn = parseInt(e.target.value) || 1;
                    setEditedSpell({ ...editedSpell, projectileSpeed: tilesPerTurn });
                  }}
                  className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
                />
                <p className="text-xs text-stone-400 mt-1">
                  How many tiles the projectile travels each turn
                </p>
              </div>

              {/* Pierce */}
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editedSpell.pierceEnemies || false}
                    onChange={(e) => setEditedSpell({ ...editedSpell, pierceEnemies: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Projectile Pierces Enemies</span>
                </label>
                <p className="text-xs text-stone-400 ml-6">If enabled, projectile continues through enemies</p>
              </div>

              {/* Bounce off walls */}
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editedSpell.bounceOffWalls || false}
                    onChange={(e) => setEditedSpell({ ...editedSpell, bounceOffWalls: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Bounce Off Walls</span>
                </label>
                <p className="text-xs text-stone-400 ml-6">If enabled, projectile reflects off walls instead of stopping</p>
              </div>

              {/* Bounce settings (only shown if bounce enabled) */}
              {editedSpell.bounceOffWalls && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Bounce Direction</label>
                    <select
                      value={editedSpell.bounceBehavior || 'reflect'}
                      onChange={(e) => setEditedSpell({ ...editedSpell, bounceBehavior: e.target.value as any })}
                      className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
                    >
                      <option value="reflect">Reflect (mirror angle)</option>
                      <option value="turn_around">Turn Around (180°)</option>
                      <option value="turn_left">Turn Left</option>
                      <option value="turn_right">Turn Right</option>
                      <option value="random">Random direction</option>
                    </select>
                    <p className="text-xs text-stone-400 mt-1">How the projectile changes direction when hitting a wall</p>
                  </div>

                  {/* Turn Amount - only shown for turn_left and turn_right */}
                  {(editedSpell.bounceBehavior === 'turn_left' || editedSpell.bounceBehavior === 'turn_right') && (
                    <div>
                      <label className="block text-sm font-medium mb-1">Turn Amount</label>
                      <select
                        value={editedSpell.bounceTurnDegrees || 90}
                        onChange={(e) => setEditedSpell({ ...editedSpell, bounceTurnDegrees: parseInt(e.target.value) as 45 | 90 | 135 })}
                        className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
                      >
                        <option value={45}>45° (slight turn)</option>
                        <option value={90}>90° (right angle)</option>
                        <option value={135}>135° (sharp turn)</option>
                      </select>
                      <p className="text-xs text-stone-400 mt-1">How many degrees to turn when bouncing</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium mb-1">Max Bounces</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={editedSpell.maxBounces || 3}
                      onChange={(e) => setEditedSpell({ ...editedSpell, maxBounces: parseInt(e.target.value) || 3 })}
                      className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
                    />
                    <p className="text-xs text-stone-400 mt-1">Maximum number of wall bounces before projectile stops</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Visual Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-stone-700 pb-2">Visual Effects</h3>

            {/* Projectile Visual (for linear spells) */}
            {templateNeedsProjectileSettings && (
              <SpellSpriteEditor
                label="Projectile Appearance"
                spriteRef={editedSpell.sprites?.projectile}
                onChange={(sprite) => setEditedSpell({
                  ...editedSpell,
                  sprites: { ...editedSpell.sprites, projectile: sprite }
                })}
                accentColor="blue"
                showDirectionalPreview={true}
                helpText="Configure how the projectile looks as it travels"
              />
            )}

            {/* Attack Appearance (for melee spells) - uses meleeAttack sprite field */}
            {templateIsMelee && (
              <SpellSpriteEditor
                label="Attack Appearance"
                spriteRef={editedSpell.sprites?.meleeAttack}
                onChange={(sprite) => setEditedSpell({
                  ...editedSpell,
                  sprites: { ...editedSpell.sprites, meleeAttack: sprite }
                })}
                accentColor="purple"
                showDirectionalPreview={true}
                helpText="Sprite shown on all attack tiles (may be in different direction than caster is facing)"
              />
            )}

            {/* AOE Effect Visual - only for AOE spells */}
            {templateNeedsRadius && (
              <SpellSpriteEditor
                label="AOE Effect (on cast)"
                spriteRef={editedSpell.sprites?.aoeEffect}
                onChange={(sprite) => setEditedSpell({
                  ...editedSpell,
                  sprites: { ...editedSpell.sprites, aoeEffect: sprite }
                })}
                accentColor="purple"
                showDirectionalPreview={false}
                helpText="Sprite shown on each tile affected by the AOE when cast (use spritesheet for animated effects)"
              />
            )}

            {/* Persistent Effect Visual - only for spells with persist duration */}
            {editedSpell.persistDuration && editedSpell.persistDuration > 0 && (
              <SpellSpriteEditor
                label="Persistent Ground Effect"
                spriteRef={editedSpell.sprites?.persistentArea}
                onChange={(sprite) => setEditedSpell({
                  ...editedSpell,
                  sprites: { ...editedSpell.sprites, persistentArea: sprite }
                })}
                accentColor="purple"
                showDirectionalPreview={false}
                helpText="Sprite shown on each tile while the effect persists (loops continuously)"
              />
            )}

            {/* Healing Effect Visual - only show for healing spells */}
            {editedSpell.healing && (
              <SpellSpriteEditor
                label="Healing Effect (on heal)"
                spriteRef={editedSpell.sprites?.healingEffect}
                onChange={(sprite) => setEditedSpell({
                  ...editedSpell,
                  sprites: { ...editedSpell.sprites, healingEffect: sprite }
                })}
                accentColor="green"
                showDirectionalPreview={false}
                helpText="Visual effect shown when target is healed"
              />
            )}

            {/* Damage Effect Visual - only show for damage spells (last in order) */}
            {!editedSpell.healing && (
              <SpellSpriteEditor
                label="Damage Effect (on hit)"
                spriteRef={editedSpell.sprites?.damageEffect}
                onChange={(sprite) => setEditedSpell({
                  ...editedSpell,
                  sprites: { ...editedSpell.sprites, damageEffect: sprite }
                })}
                accentColor="red"
                showDirectionalPreview={false}
                helpText="Visual effect shown only when target actually takes damage"
              />
            )}
          </div>

          {/* Status Effect Configuration */}
          <StatusEffectConfig
            editedSpell={editedSpell}
            setEditedSpell={setEditedSpell}
          />
        </div>
      </div>
  );
};

// Status Effect Configuration Component
interface StatusEffectConfigProps {
  editedSpell: SpellAsset;
  setEditedSpell: (spell: SpellAsset) => void;
}

const StatusEffectConfig: React.FC<StatusEffectConfigProps> = ({ editedSpell, setEditedSpell }) => {
  const [statusEffects, setStatusEffects] = useState<StatusEffectAsset[]>([]);
  const [enableEffect, setEnableEffect] = useState(!!editedSpell.appliesStatusEffect);

  useEffect(() => {
    setStatusEffects(getStatusEffectAssets());
  }, []);

  const handleToggleEffect = (enabled: boolean) => {
    setEnableEffect(enabled);
    if (!enabled) {
      // Remove the status effect config
      const { appliesStatusEffect, ...rest } = editedSpell;
      setEditedSpell(rest as SpellAsset);
    } else {
      // Initialize with first effect if available
      if (statusEffects.length > 0) {
        setEditedSpell({
          ...editedSpell,
          appliesStatusEffect: {
            statusAssetId: statusEffects[0].id,
          },
        });
      }
    }
  };

  const handleEffectChange = (statusAssetId: string) => {
    setEditedSpell({
      ...editedSpell,
      appliesStatusEffect: {
        ...editedSpell.appliesStatusEffect,
        statusAssetId,
      },
    });
  };

  const handleDurationOverride = (value: string) => {
    const numValue = parseInt(value);
    setEditedSpell({
      ...editedSpell,
      appliesStatusEffect: {
        ...editedSpell.appliesStatusEffect!,
        durationOverride: numValue > 0 ? numValue : undefined,
      },
    });
  };

  const handleValueOverride = (value: string) => {
    const numValue = parseInt(value);
    setEditedSpell({
      ...editedSpell,
      appliesStatusEffect: {
        ...editedSpell.appliesStatusEffect!,
        valueOverride: numValue > 0 ? numValue : undefined,
      },
    });
  };

  const handleChanceChange = (value: string) => {
    const numValue = parseFloat(value) / 100;
    setEditedSpell({
      ...editedSpell,
      appliesStatusEffect: {
        ...editedSpell.appliesStatusEffect!,
        applyChance: numValue >= 0 && numValue <= 1 ? numValue : undefined,
      },
    });
  };

  const selectedEffect = statusEffects.find(e => e.id === editedSpell.appliesStatusEffect?.statusAssetId);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold border-b border-stone-700 pb-2">Status Effect</h3>

      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enableEffect}
            onChange={(e) => handleToggleEffect(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm">Apply Status Effect on Hit</span>
        </label>
        <p className="text-xs text-stone-400 ml-6">When this spell hits a target, apply a status effect</p>
      </div>

      {enableEffect && (
        <div className="space-y-4 pl-4 border-l-2 border-stone-700">
          {statusEffects.length === 0 ? (
            <div className="bg-stone-900 p-3 rounded text-sm text-stone-400">
              No status effects defined. Create one in the Status Effect Library first.
            </div>
          ) : (
            <>
              {/* Effect Selection */}
              <div>
                <label className="block text-sm font-medium mb-1">Status Effect</label>
                <select
                  value={editedSpell.appliesStatusEffect?.statusAssetId || ''}
                  onChange={(e) => handleEffectChange(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
                >
                  <option value="">Select an effect...</option>
                  {statusEffects.map(effect => (
                    <option key={effect.id} value={effect.id}>
                      {effect.name} ({effect.type})
                    </option>
                  ))}
                </select>
              </div>

              {selectedEffect && (
                <>
                  {/* Effect Preview */}
                  <div className="bg-stone-900 p-3 rounded text-sm">
                    <div className="font-medium">{selectedEffect.name}</div>
                    <div className="text-stone-400 text-xs mt-1">{selectedEffect.description}</div>
                    <div className="flex gap-4 mt-2 text-xs text-stone-500">
                      <span>Duration: {selectedEffect.defaultDuration} turns</span>
                      {selectedEffect.defaultValue && <span>Value: {selectedEffect.defaultValue}/turn</span>}
                      <span className="capitalize">{selectedEffect.stackingBehavior}</span>
                    </div>
                  </div>

                  {/* Override Settings */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Duration Override</label>
                      <input
                        type="number"
                        min="0"
                        value={editedSpell.appliesStatusEffect?.durationOverride || ''}
                        onChange={(e) => handleDurationOverride(e.target.value)}
                        placeholder={String(selectedEffect.defaultDuration)}
                        className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
                      />
                      <p className="text-xs text-stone-400 mt-1">Leave blank for default</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Value Override</label>
                      <input
                        type="number"
                        min="0"
                        value={editedSpell.appliesStatusEffect?.valueOverride || ''}
                        onChange={(e) => handleValueOverride(e.target.value)}
                        placeholder={String(selectedEffect.defaultValue || 0)}
                        className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
                      />
                      <p className="text-xs text-stone-400 mt-1">Damage/heal per turn</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Apply Chance %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={editedSpell.appliesStatusEffect?.applyChance !== undefined
                          ? Math.round(editedSpell.appliesStatusEffect.applyChance * 100)
                          : ''}
                        onChange={(e) => handleChanceChange(e.target.value)}
                        placeholder="100"
                        className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
                      />
                      <p className="text-xs text-stone-400 mt-1">100% = always applies</p>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
