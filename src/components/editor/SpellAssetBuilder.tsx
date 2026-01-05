import React, { useState, useRef } from 'react';
import type { SpellAsset, SpellTemplate, DirectionMode, Direction, SpriteReference, RelativeDirection } from '../../types/game';
import { saveSpellAsset } from '../../utils/assetStorage';

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
    onSave(editedSpell);
  };

  const templateNeedsRange = editedSpell.templateType === 'range_linear' || editedSpell.templateType === 'magic_linear';
  const templateNeedsRadius = editedSpell.templateType === 'aoe';
  const templateNeedsProjectileSettings = templateNeedsRange;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">
            {spell ? 'Edit Spell' : 'Create New Spell'}
          </h2>

          {/* Action Buttons - Top */}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-green-600 rounded hover:bg-green-700 font-semibold"
            >
              Save to Library
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-600 rounded hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-gray-700 pb-2">Basic Information</h3>

            {/* Spell Name */}
            <div>
              <label className="block text-sm font-medium mb-1">Spell Name *</label>
              <input
                type="text"
                value={editedSpell.name}
                onChange={(e) => setEditedSpell({ ...editedSpell, name: e.target.value })}
                className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                placeholder="e.g., Fireball, Lightning Bolt, Whirlwind"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={editedSpell.description}
                onChange={(e) => setEditedSpell({ ...editedSpell, description: e.target.value })}
                className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                placeholder="Describe what this spell does..."
                rows={2}
              />
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
                      className="w-12 h-12 object-contain bg-gray-900 rounded border border-gray-600"
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
              <p className="text-xs text-gray-400 mt-1">Upload a small icon to represent this spell in the library</p>
            </div>
          </div>

          {/* Template Type */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-gray-700 pb-2">Spell Type</h3>

            <div>
              <label className="block text-sm font-medium mb-2">Template *</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setEditedSpell({ ...editedSpell, templateType: 'melee' as SpellTemplate })}
                  className={`p-3 rounded border-2 transition-colors ${
                    editedSpell.templateType === 'melee'
                      ? 'border-blue-500 bg-blue-900'
                      : 'border-gray-600 bg-gray-700 hover:border-gray-500'
                  }`}
                >
                  <div className="font-semibold">Melee</div>
                  <div className="text-xs text-gray-400">Adjacent tile attack</div>
                </button>

                <button
                  onClick={() => setEditedSpell({ ...editedSpell, templateType: 'range_linear' as SpellTemplate })}
                  className={`p-3 rounded border-2 transition-colors ${
                    editedSpell.templateType === 'range_linear'
                      ? 'border-blue-500 bg-blue-900'
                      : 'border-gray-600 bg-gray-700 hover:border-gray-500'
                  }`}
                >
                  <div className="font-semibold">Range Linear</div>
                  <div className="text-xs text-gray-400">Physical projectile</div>
                </button>

                <button
                  onClick={() => setEditedSpell({ ...editedSpell, templateType: 'magic_linear' as SpellTemplate })}
                  className={`p-3 rounded border-2 transition-colors ${
                    editedSpell.templateType === 'magic_linear'
                      ? 'border-blue-500 bg-blue-900'
                      : 'border-gray-600 bg-gray-700 hover:border-gray-500'
                  }`}
                >
                  <div className="font-semibold">Magic Linear</div>
                  <div className="text-xs text-gray-400">Magic projectile</div>
                </button>

                <button
                  onClick={() => setEditedSpell({ ...editedSpell, templateType: 'aoe' as SpellTemplate })}
                  className={`p-3 rounded border-2 transition-colors ${
                    editedSpell.templateType === 'aoe'
                      ? 'border-blue-500 bg-blue-900'
                      : 'border-gray-600 bg-gray-700 hover:border-gray-500'
                  }`}
                >
                  <div className="font-semibold">AOE</div>
                  <div className="text-xs text-gray-400">Area of effect</div>
                </button>
              </div>
            </div>
          </div>

          {/* Direction Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-gray-700 pb-2">Direction Configuration</h3>

            <div>
              <label className="block text-sm font-medium mb-2">Direction Mode *</label>
              <select
                value={editedSpell.directionMode}
                onChange={(e) => setEditedSpell({ ...editedSpell, directionMode: e.target.value as DirectionMode })}
                className="w-full px-3 py-2 bg-gray-700 rounded text-white"
              >
                <option value="current_facing">Current Facing (follows character direction)</option>
                <option value="relative">Relative (relative to character facing)</option>
                <option value="fixed">Fixed Directions (always same)</option>
                <option value="all_directions">All Directions (360°)</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
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
                            : 'border-gray-600 bg-gray-700 hover:border-gray-500'
                        }`}
                      >
                        <div className="text-2xl">{dir.arrow}</div>
                        <div className="text-xs">{dir.label}</div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2">
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
                            : 'border-gray-600 bg-gray-700 hover:border-gray-500'
                        }`}
                      >
                        <div className="text-2xl">{dir.arrow}</div>
                        <div className="text-xs">{dir.label}</div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2">
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

          {/* Combat Stats */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-gray-700 pb-2">Combat Stats</h3>

            {/* Damage */}
            <div>
              <label className="block text-sm font-medium mb-1">Damage *</label>
              <input
                type="number"
                min="0"
                max="100"
                value={editedSpell.damage}
                onChange={(e) => setEditedSpell({ ...editedSpell, damage: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-gray-700 rounded text-white"
              />
            </div>

            {/* Range (for linear spells) */}
            {templateNeedsRange && (
              <div>
                <label className="block text-sm font-medium mb-1">Max Range (tiles)</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={editedSpell.range || 5}
                  onChange={(e) => setEditedSpell({ ...editedSpell, range: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                />
              </div>
            )}

            {/* Radius (for AOE) */}
            {templateNeedsRadius && (
              <div>
                <label className="block text-sm font-medium mb-1">Radius (tiles)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={editedSpell.radius || 2}
                  onChange={(e) => setEditedSpell({ ...editedSpell, radius: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                />
              </div>
            )}
          </div>

          {/* Projectile Settings */}
          {templateNeedsProjectileSettings && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b border-gray-700 pb-2">Projectile Settings</h3>

              {/* Speed */}
              <div>
                <label className="block text-sm font-medium mb-1">Projectile Speed (tiles/second)</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={editedSpell.projectileSpeed || 5}
                  onChange={(e) => setEditedSpell({ ...editedSpell, projectileSpeed: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                />
                <p className="text-xs text-gray-400 mt-1">Higher = faster projectile</p>
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
                <p className="text-xs text-gray-400 ml-6">If enabled, projectile continues through enemies</p>
              </div>
            </div>
          )}

          {/* Visual Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-gray-700 pb-2">Visual Effects</h3>

            {/* Projectile Visual (for linear spells) */}
            {templateNeedsProjectileSettings && (
              <div className="bg-gray-900 p-3 rounded">
                <label className="block text-sm font-medium mb-2">Projectile Appearance</label>

                {/* Mode Toggle: Shape vs Image */}
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => {
                      const sprites = editedSpell.sprites || {};
                      const projectile = sprites.projectile || { type: 'inline' as const, spriteData: {} };
                      setEditedSpell({
                        ...editedSpell,
                        sprites: {
                          ...sprites,
                          projectile: {
                            ...projectile,
                            spriteData: {
                              ...(projectile.spriteData || {}),
                              type: 'simple',
                              idleImageData: undefined,
                            }
                          }
                        }
                      });
                    }}
                    className={`flex-1 px-2 py-1 rounded text-xs transition-colors ${
                      !editedSpell.sprites?.projectile?.spriteData?.idleImageData
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    Basic Shape
                  </button>
                  <button
                    onClick={() => {
                      const sprites = editedSpell.sprites || {};
                      const projectile = sprites.projectile || { type: 'inline' as const, spriteData: {} };
                      setEditedSpell({
                        ...editedSpell,
                        sprites: {
                          ...sprites,
                          projectile: {
                            ...projectile,
                            spriteData: {
                              ...(projectile.spriteData || {}),
                              type: 'image',
                              // Initialize with empty string to trigger UI display
                              idleImageData: projectile.spriteData?.idleImageData || '',
                            }
                          }
                        }
                      });
                    }}
                    className={`flex-1 px-2 py-1 rounded text-xs transition-colors ${
                      editedSpell.sprites?.projectile?.spriteData?.type === 'image'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    Custom Image
                  </button>
                </div>

                {/* Shape-based (default) */}
                {editedSpell.sprites?.projectile?.spriteData?.type !== 'image' && (
                  <>
                    {/* Shape */}
                    <div className="mb-2">
                      <label className="block text-xs text-gray-400 mb-1">Shape</label>
                      <div className="grid grid-cols-5 gap-2">
                        {['circle', 'square', 'triangle', 'star', 'diamond'].map((shape) => (
                          <button
                            key={shape}
                            onClick={() => {
                              const sprites = editedSpell.sprites || {};
                              const projectile = sprites.projectile || { type: 'inline' as const, spriteData: {} };
                              setEditedSpell({
                                ...editedSpell,
                                sprites: {
                                  ...sprites,
                                  projectile: {
                                    ...projectile,
                                    spriteData: {
                                      ...(projectile.spriteData || {}),
                                      shape,
                                      type: 'simple',
                                    }
                                  }
                                }
                              });
                            }}
                            className={`px-2 py-1 rounded text-xs transition-colors ${
                              editedSpell.sprites?.projectile?.spriteData?.shape === shape
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                          >
                            {shape}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Color */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Color</label>
                      <input
                        type="color"
                        value={editedSpell.sprites?.projectile?.spriteData?.primaryColor || '#ff6600'}
                        onChange={(e) => {
                          const sprites = editedSpell.sprites || {};
                          const projectile = sprites.projectile || { type: 'inline' as const, spriteData: {} };
                          setEditedSpell({
                            ...editedSpell,
                            sprites: {
                              ...sprites,
                              projectile: {
                                ...projectile,
                                spriteData: {
                                  ...(projectile.spriteData || {}),
                                  primaryColor: e.target.value,
                                  type: 'simple',
                                }
                              }
                            }
                          });
                        }}
                        className="w-full h-10 rounded cursor-pointer"
                      />
                    </div>
                  </>
                )}

                {/* Image Upload */}
                {editedSpell.sprites?.projectile?.spriteData?.type === 'image' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Upload PNG/GIF (Base Image)</label>
                      <p className="text-xs text-gray-500 mb-2">
                        Upload your projectile image pointing <strong>East (left-to-right →)</strong>.
                        The system will automatically rotate/mirror it for all 8 directions.
                      </p>
                      <input
                        type="file"
                        accept="image/png,image/gif"
                        onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const imageData = event.target?.result as string;
                            const sprites = editedSpell.sprites || {};
                            const projectile = sprites.projectile || { type: 'inline' as const, spriteData: {} };
                            setEditedSpell({
                              ...editedSpell,
                              sprites: {
                                ...sprites,
                                projectile: {
                                  ...projectile,
                                  spriteData: {
                                    ...(projectile.spriteData || {}),
                                    type: 'image',
                                    idleImageData: imageData,
                                  }
                                }
                              }
                            });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="w-full text-xs text-gray-300 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                    />
                    {editedSpell.sprites?.projectile?.spriteData?.idleImageData && (
                      <div className="mt-2 p-2 bg-gray-800 rounded flex items-center justify-center">
                        <img
                          src={editedSpell.sprites.projectile.spriteData.idleImageData}
                          alt="Projectile preview"
                          className="max-h-16 pixelated"
                        />
                      </div>
                    )}
                    </div>

                    {/* Rotation Preview */}
                    {editedSpell.sprites?.projectile?.spriteData?.idleImageData && (
                      <div>
                        <label className="block text-xs text-gray-400 mb-2">Directional Preview</label>
                        <div className="grid grid-cols-4 gap-2 bg-gray-800 p-3 rounded">
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
                            <div key={label} className="flex flex-col items-center gap-1 p-2 bg-gray-900 rounded">
                              <span className="text-xs text-gray-400 font-bold">{label}</span>
                              <div className="w-12 h-12 flex items-center justify-center bg-gray-700 rounded">
                                <img
                                  src={editedSpell.sprites.projectile?.spriteData?.idleImageData || ''}
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
              </div>
            )}

            {/* Damage Effect Visual */}
            <div className="bg-gray-900 p-3 rounded">
              <label className="block text-sm font-medium mb-2">Damage Effect (on hit)</label>

              {/* Mode Toggle: Shape vs Image */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => {
                    const sprites = editedSpell.sprites || {};
                    const damageEffect = sprites.damageEffect || { type: 'inline' as const, spriteData: {} };
                    setEditedSpell({
                      ...editedSpell,
                      sprites: {
                        ...sprites,
                        damageEffect: {
                          ...damageEffect,
                          spriteData: {
                            ...(damageEffect.spriteData || {}),
                            type: 'simple',
                            idleImageData: undefined,
                          }
                        }
                      }
                    });
                  }}
                  className={`flex-1 px-2 py-1 rounded text-xs transition-colors ${
                    !editedSpell.sprites?.damageEffect?.spriteData?.idleImageData
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Basic Shape
                </button>
                <button
                  onClick={() => {
                    const sprites = editedSpell.sprites || {};
                    const damageEffect = sprites.damageEffect || { type: 'inline' as const, spriteData: {} };
                    setEditedSpell({
                      ...editedSpell,
                      sprites: {
                        ...sprites,
                        damageEffect: {
                          ...damageEffect,
                          spriteData: {
                            ...(damageEffect.spriteData || {}),
                            type: 'image',
                          }
                        }
                      }
                    });
                  }}
                  className={`flex-1 px-2 py-1 rounded text-xs transition-colors ${
                    editedSpell.sprites?.damageEffect?.spriteData?.idleImageData
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Custom Image
                </button>
              </div>

              {/* Shape-based (default) */}
              {!editedSpell.sprites?.damageEffect?.spriteData?.idleImageData && (
                <>
                  {/* Shape */}
                  <div className="mb-2">
                    <label className="block text-xs text-gray-400 mb-1">Shape</label>
                    <div className="grid grid-cols-5 gap-2">
                      {['circle', 'square', 'triangle', 'star', 'diamond'].map((shape) => (
                        <button
                          key={shape}
                          onClick={() => {
                            const sprites = editedSpell.sprites || {};
                            const damageEffect = sprites.damageEffect || { type: 'inline' as const, spriteData: {} };
                            setEditedSpell({
                              ...editedSpell,
                              sprites: {
                                ...sprites,
                                damageEffect: {
                                  ...damageEffect,
                                  spriteData: {
                                    ...(damageEffect.spriteData || {}),
                                    shape,
                                    type: 'simple',
                                  }
                                }
                              }
                            });
                          }}
                          className={`px-2 py-1 rounded text-xs transition-colors ${
                            editedSpell.sprites?.damageEffect?.spriteData?.shape === shape
                              ? 'bg-red-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {shape}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Color</label>
                    <input
                      type="color"
                      value={editedSpell.sprites?.damageEffect?.spriteData?.primaryColor || '#ff0000'}
                      onChange={(e) => {
                        const sprites = editedSpell.sprites || {};
                        const damageEffect = sprites.damageEffect || { type: 'inline' as const, spriteData: {} };
                        setEditedSpell({
                          ...editedSpell,
                          sprites: {
                            ...sprites,
                            damageEffect: {
                              ...damageEffect,
                              spriteData: {
                                ...(damageEffect.spriteData || {}),
                                primaryColor: e.target.value,
                                type: 'simple',
                              }
                            }
                          }
                        });
                      }}
                      className="w-full h-10 rounded cursor-pointer"
                    />
                  </div>
                </>
              )}

              {/* Image Upload */}
              {editedSpell.sprites?.damageEffect?.spriteData?.idleImageData && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Upload PNG/GIF</label>
                  <input
                    type="file"
                    accept="image/png,image/gif"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const imageData = event.target?.result as string;
                          const sprites = editedSpell.sprites || {};
                          const damageEffect = sprites.damageEffect || { type: 'inline' as const, spriteData: {} };
                          setEditedSpell({
                            ...editedSpell,
                            sprites: {
                              ...sprites,
                              damageEffect: {
                                ...damageEffect,
                                spriteData: {
                                  ...(damageEffect.spriteData || {}),
                                  type: 'image',
                                  idleImageData: imageData,
                                }
                              }
                            }
                          });
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="w-full text-xs text-gray-300 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-red-600 file:text-white hover:file:bg-red-700"
                  />
                  {editedSpell.sprites?.damageEffect?.spriteData?.idleImageData && (
                    <div className="mt-2 p-2 bg-gray-800 rounded flex items-center justify-center">
                      <img
                        src={editedSpell.sprites.damageEffect.spriteData.idleImageData}
                        alt="Damage effect preview"
                        className="max-h-16 pixelated"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
