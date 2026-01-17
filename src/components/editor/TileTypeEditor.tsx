import React, { useState } from 'react';
import type { TileBehaviorType, TileBehaviorConfig, PressurePlateEffect, Direction, ActivationSpriteConfig, CadenceConfig, CadencePattern } from '../../types/game';
import type { CustomTileType, CustomSprite } from '../../utils/assetStorage';
import { getCustomTileTypes, saveTileType, deleteTileType, getFolders } from '../../utils/assetStorage';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';

// Helper to convert file to base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Behavior type labels and descriptions
const BEHAVIOR_OPTIONS: { type: TileBehaviorType; label: string; description: string }[] = [
  { type: 'damage', label: 'Damage', description: 'Deal damage when stepped on' },
  { type: 'teleport', label: 'Teleport', description: 'Transport to linked teleport tile' },
  { type: 'direction_change', label: 'Direction Change', description: 'Force character to face a direction' },
  { type: 'ice', label: 'Ice', description: 'Slide until hitting a wall' },
  { type: 'pressure_plate', label: 'Pressure Plate', description: 'Trigger events when stepped on' },
];

// Direction options for direction_change behavior
const DIRECTION_OPTIONS: { value: Direction; label: string }[] = [
  { value: 'north', label: 'North' },
  { value: 'northeast', label: 'Northeast' },
  { value: 'east', label: 'East' },
  { value: 'southeast', label: 'Southeast' },
  { value: 'south', label: 'South' },
  { value: 'southwest', label: 'Southwest' },
  { value: 'west', label: 'West' },
  { value: 'northwest', label: 'Northwest' },
];

// Teleport group labels (A-Z)
const TELEPORT_GROUPS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Pressure plate effect types
const PRESSURE_PLATE_EFFECTS: { type: PressurePlateEffect['type']; label: string; description: string }[] = [
  { type: 'toggle_wall', label: 'Toggle Wall', description: 'Show/hide a wall tile' },
  { type: 'spawn_enemy', label: 'Spawn Enemy', description: 'Activate a dormant enemy' },
  { type: 'despawn_enemy', label: 'Despawn Enemy', description: 'Remove an enemy' },
  { type: 'trigger_teleport', label: 'Trigger Teleport', description: 'Activate a teleport' },
];

// Cadence pattern options
const CADENCE_PATTERNS: { value: CadencePattern; label: string; description: string }[] = [
  { value: 'alternating', label: 'Alternating', description: 'On, off, on, off...' },
  { value: 'interval', label: 'Interval', description: 'On for X turns, off for Y turns' },
  { value: 'custom', label: 'Custom Pattern', description: 'Define exact on/off sequence' },
];

interface BehaviorEditorProps {
  behavior: TileBehaviorConfig;
  onChange: (behavior: TileBehaviorConfig) => void;
  onRemove: () => void;
}

const BehaviorEditor: React.FC<BehaviorEditorProps> = ({ behavior, onChange, onRemove }) => {
  return (
    <div className="bg-gray-700 rounded p-3 mb-2">
      <div className="flex justify-between items-center mb-2">
        <span className="font-medium text-blue-300">
          {BEHAVIOR_OPTIONS.find(b => b.type === behavior.type)?.label || behavior.type}
        </span>
        <button
          onClick={onRemove}
          className="px-2 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
        >
          Remove
        </button>
      </div>

      {/* Damage behavior config */}
      {behavior.type === 'damage' && (
        <div className="space-y-2">
          <div>
            <label className="text-sm text-gray-300">Damage Amount</label>
            <input
              type="number"
              value={behavior.damageAmount || 1}
              onChange={e => onChange({ ...behavior, damageAmount: parseInt(e.target.value) || 1 })}
              className="w-full bg-gray-600 rounded px-2 py-1 text-sm mt-1"
              min="1"
            />
          </div>
          <label className="flex items-center text-sm text-gray-300">
            <input
              type="checkbox"
              checked={behavior.damageOnce || false}
              onChange={e => onChange({ ...behavior, damageOnce: e.target.checked })}
              className="mr-2"
            />
            Only damage once per character
          </label>
        </div>
      )}

      {/* Teleport behavior config */}
      {behavior.type === 'teleport' && (
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-300">Teleport Group</label>
            <select
              value={behavior.teleportGroupId || 'A'}
              onChange={e => onChange({ ...behavior, teleportGroupId: e.target.value })}
              className="w-full bg-gray-600 rounded px-2 py-1 text-sm mt-1"
            >
              {TELEPORT_GROUPS.map(group => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Tiles with the same group teleport to each other (bidirectional)
            </p>
          </div>

          {/* Activation Sprite (optional) */}
          <div>
            <label className="text-sm text-gray-300">Activation Sprite (Optional)</label>
            <p className="text-xs text-gray-400 mb-2">
              Sprite shown on top of the teleport tile when activated. Displayed above entities.
            </p>
            {behavior.activationSprite?.imageData ? (
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <img
                    src={behavior.activationSprite.imageData}
                    alt="Activation sprite"
                    className="w-16 h-16 object-contain bg-gray-600 rounded"
                  />
                  <button
                    onClick={() => onChange({ ...behavior, activationSprite: undefined })}
                    className="px-2 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-400">Frame Count</label>
                    <input
                      type="number"
                      value={behavior.activationSprite.frameCount || 1}
                      onChange={e => onChange({
                        ...behavior,
                        activationSprite: {
                          ...behavior.activationSprite!,
                          frameCount: Math.max(1, parseInt(e.target.value) || 1)
                        }
                      })}
                      className="w-full bg-gray-600 rounded px-2 py-1 text-sm"
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Frame Rate (fps)</label>
                    <input
                      type="number"
                      value={behavior.activationSprite.frameRate || 10}
                      onChange={e => onChange({
                        ...behavior,
                        activationSprite: {
                          ...behavior.activationSprite!,
                          frameRate: Math.max(1, parseInt(e.target.value) || 10)
                        }
                      })}
                      className="w-full bg-gray-600 rounded px-2 py-1 text-sm"
                      min="1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-400">Opacity (0-100%)</label>
                    <input
                      type="number"
                      value={Math.round((behavior.activationSprite.opacity ?? 1) * 100)}
                      onChange={e => onChange({
                        ...behavior,
                        activationSprite: {
                          ...behavior.activationSprite!,
                          opacity: Math.max(0, Math.min(100, parseInt(e.target.value) || 100)) / 100
                        }
                      })}
                      className="w-full bg-gray-600 rounded px-2 py-1 text-sm"
                      min="0"
                      max="100"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Duration (ms)</label>
                    <input
                      type="number"
                      value={behavior.activationSprite.durationMs || 800}
                      onChange={e => onChange({
                        ...behavior,
                        activationSprite: {
                          ...behavior.activationSprite!,
                          durationMs: Math.max(100, parseInt(e.target.value) || 800)
                        }
                      })}
                      className="w-full bg-gray-600 rounded px-2 py-1 text-sm"
                      min="100"
                    />
                  </div>
                </div>
                <label className="flex items-center text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={behavior.activationSprite.loop !== false}
                    onChange={e => onChange({
                      ...behavior,
                      activationSprite: {
                        ...behavior.activationSprite!,
                        loop: e.target.checked
                      }
                    })}
                    className="mr-2"
                  />
                  Loop animation
                </label>
              </div>
            ) : (
              <label className="block cursor-pointer">
                <div className="w-full h-16 border-2 border-dashed border-gray-500 rounded flex flex-col items-center justify-center text-gray-400 hover:border-gray-400 text-sm">
                  <span>+ Upload Activation Sprite</span>
                  <span className="text-xs text-gray-500">Single image or horizontal spritesheet</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const base64 = await fileToBase64(file);
                      onChange({
                        ...behavior,
                        activationSprite: {
                          imageData: base64,
                          frameCount: 1,
                          frameRate: 10,
                          loop: true,
                          opacity: 1,
                          durationMs: 800
                        }
                      });
                    }
                  }}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>
      )}

      {/* Direction change behavior config */}
      {behavior.type === 'direction_change' && (
        <div>
          <label className="text-sm text-gray-300">Force Direction</label>
          <select
            value={behavior.newFacing || 'south'}
            onChange={e => onChange({ ...behavior, newFacing: e.target.value as Direction })}
            className="w-full bg-gray-600 rounded px-2 py-1 text-sm mt-1"
          >
            {DIRECTION_OPTIONS.map(dir => (
              <option key={dir.value} value={dir.value}>{dir.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Ice behavior - no extra config needed */}
      {behavior.type === 'ice' && (
        <p className="text-sm text-gray-400">
          Characters will slide in their movement direction until hitting a wall.
        </p>
      )}

      {/* Pressure plate behavior config */}
      {behavior.type === 'pressure_plate' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">
            Configure what happens when this plate is stepped on.
          </p>
          {(behavior.pressurePlateEffects || []).map((effect, idx) => (
            <div key={idx} className="bg-gray-600 rounded p-2 text-sm">
              <div className="flex justify-between items-center mb-1">
                <span>{PRESSURE_PLATE_EFFECTS.find(e => e.type === effect.type)?.label}</span>
                <button
                  onClick={() => {
                    const newEffects = [...(behavior.pressurePlateEffects || [])];
                    newEffects.splice(idx, 1);
                    onChange({ ...behavior, pressurePlateEffects: newEffects });
                  }}
                  className="text-red-400 hover:text-red-300 text-xs"
                >
                  ×
                </button>
              </div>
              {(effect.type === 'toggle_wall' || effect.type === 'trigger_teleport') && (
                <div className="flex gap-2 mt-1">
                  <input
                    type="number"
                    placeholder="X"
                    value={effect.targetX ?? ''}
                    onChange={e => {
                      const newEffects = [...(behavior.pressurePlateEffects || [])];
                      newEffects[idx] = { ...effect, targetX: parseInt(e.target.value) };
                      onChange({ ...behavior, pressurePlateEffects: newEffects });
                    }}
                    className="w-16 bg-gray-500 rounded px-2 py-1"
                  />
                  <input
                    type="number"
                    placeholder="Y"
                    value={effect.targetY ?? ''}
                    onChange={e => {
                      const newEffects = [...(behavior.pressurePlateEffects || [])];
                      newEffects[idx] = { ...effect, targetY: parseInt(e.target.value) };
                      onChange({ ...behavior, pressurePlateEffects: newEffects });
                    }}
                    className="w-16 bg-gray-500 rounded px-2 py-1"
                  />
                </div>
              )}
              <label className="flex items-center text-xs text-gray-300 mt-1">
                <input
                  type="checkbox"
                  checked={effect.stayPressed || false}
                  onChange={e => {
                    const newEffects = [...(behavior.pressurePlateEffects || [])];
                    newEffects[idx] = { ...effect, stayPressed: e.target.checked };
                    onChange({ ...behavior, pressurePlateEffects: newEffects });
                  }}
                  className="mr-2"
                />
                Require standing on plate
              </label>
            </div>
          ))}
          <select
            value=""
            onChange={e => {
              if (!e.target.value) return;
              const newEffect: PressurePlateEffect = {
                type: e.target.value as PressurePlateEffect['type'],
                stayPressed: false,
              };
              onChange({
                ...behavior,
                pressurePlateEffects: [...(behavior.pressurePlateEffects || []), newEffect],
              });
              e.target.value = '';
            }}
            className="w-full bg-gray-600 rounded px-2 py-1 text-sm"
          >
            <option value="">+ Add Effect...</option>
            {PRESSURE_PLATE_EFFECTS.map(effect => (
              <option key={effect.type} value={effect.type}>{effect.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

// Get behavior icon
const getBehaviorIcon = (type: TileBehaviorType): string => {
  switch (type) {
    case 'damage': return '🔥';
    case 'teleport': return '🌀';
    case 'direction_change': return '➡️';
    case 'ice': return '❄️';
    case 'pressure_plate': return '⬇️';
    default: return '?';
  }
};

export const TileTypeEditor: React.FC = () => {
  const [tileTypes, setTileTypes] = useState<CustomTileType[]>(() => getCustomTileTypes());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomTileType | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Filter tile types based on folder and search term
  const folderFilteredTileTypes = useFilteredAssets(tileTypes, selectedFolderId);
  const filteredTileTypes = folderFilteredTileTypes.filter(tileType =>
    tileType.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (tileType.description && tileType.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const refreshTileTypes = () => {
    setTileTypes(getCustomTileTypes());
  };

  const handleSelect = (id: string) => {
    const tileType = tileTypes.find(t => t.id === id);
    if (tileType) {
      setSelectedId(id);
      setEditing({ ...tileType, behaviors: [...tileType.behaviors] });
      setIsCreating(false);
    }
  };

  const handleNew = () => {
    const newTileType: CustomTileType = {
      id: 'tiletype_' + Date.now(),
      name: 'New Tile Type',
      description: '',
      baseType: 'empty',
      behaviors: [],
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
    setEditing(newTileType);
    setSelectedId(null);
    setIsCreating(true);
  };

  const handleSave = () => {
    if (!editing) return;
    saveTileType(editing);
    refreshTileTypes();
    setSelectedId(editing.id);
    setIsCreating(false);
    alert('Tile type saved!');
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this tile type?')) return;
    deleteTileType(id);
    refreshTileTypes();
    if (selectedId === id) {
      setSelectedId(null);
      setEditing(null);
    }
  };

  const handleAddBehavior = (type: TileBehaviorType) => {
    if (!editing) return;
    const newBehavior: TileBehaviorConfig = { type };

    // Set defaults based on type
    if (type === 'damage') {
      newBehavior.damageAmount = 1;
    } else if (type === 'teleport') {
      newBehavior.teleportGroupId = 'A';
    } else if (type === 'direction_change') {
      newBehavior.newFacing = 'south';
    }

    setEditing({
      ...editing,
      behaviors: [...editing.behaviors, newBehavior],
    });
  };

  const handleUpdateBehavior = (index: number, behavior: TileBehaviorConfig) => {
    if (!editing) return;
    const newBehaviors = [...editing.behaviors];
    newBehaviors[index] = behavior;
    setEditing({ ...editing, behaviors: newBehaviors });
  };

  const handleRemoveBehavior = (index: number) => {
    if (!editing) return;
    const newBehaviors = [...editing.behaviors];
    newBehaviors.splice(index, 1);
    setEditing({ ...editing, behaviors: newBehaviors });
  };

  const handleSpriteUpload = async (file: File) => {
    if (!editing) return;
    const base64 = await fileToBase64(file);
    setEditing({
      ...editing,
      customSprite: {
        id: 'sprite_' + Date.now(),
        name: editing.name + ' Sprite',
        type: 'image',
        idleImageData: base64,
        createdAt: new Date().toISOString(),
      },
    });
  };

  const handleSpriteRemove = () => {
    if (!editing) return;
    setEditing({ ...editing, customSprite: undefined });
  };

  const handleOffStateSpriteUpload = async (file: File) => {
    if (!editing) return;
    const base64 = await fileToBase64(file);
    setEditing({
      ...editing,
      offStateSprite: {
        id: 'sprite_off_' + Date.now(),
        name: editing.name + ' Off Sprite',
        type: 'image',
        idleImageData: base64,
        createdAt: new Date().toISOString(),
      },
    });
  };

  const handleOffStateSpriteRemove = () => {
    if (!editing) return;
    setEditing({ ...editing, offStateSprite: undefined });
  };

  const handleFolderChange = (tileTypeId: string, folderId: string | undefined) => {
    const tileType = tileTypes.find(t => t.id === tileTypeId);
    if (tileType) {
      saveTileType({ ...tileType, folderId });
      refreshTileTypes();
      if (editing && editing.id === tileTypeId) {
        setEditing({ ...editing, folderId });
      }
    }
  };

  const handleDuplicate = (tileType: CustomTileType, e: React.MouseEvent) => {
    e.stopPropagation();
    const duplicated: CustomTileType = {
      ...tileType,
      id: 'tiletype_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      name: tileType.name + ' (Copy)',
      behaviors: [...tileType.behaviors],
      customSprite: tileType.customSprite ? { ...tileType.customSprite, id: 'sprite_' + Date.now() } : undefined,
      createdAt: new Date().toISOString(),
    };
    setEditing(duplicated);
    setSelectedId(null);
    setIsCreating(true);
  };

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">
          {/* Tile Type List */}
          <div className="w-full md:w-72 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">Custom Tile Types</h2>
              <button
                onClick={handleNew}
                className="px-3 py-1 bg-green-600 rounded text-sm hover:bg-green-700"
              >
                + New
              </button>
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 rounded text-sm"
            />

            {/* Folder Filter */}
            <FolderDropdown
              category="tiles"
              selectedFolderId={selectedFolderId}
              onFolderSelect={setSelectedFolderId}
            />

            <div className="space-y-2 max-h-[calc(100vh-350px)] overflow-y-auto">
              {filteredTileTypes.length === 0 ? (
                <div className="bg-gray-800 p-4 rounded text-center text-gray-400 text-sm">
                  {searchTerm ? 'No tile types match your search.' : 'No custom tile types yet.'}
                  <br />
                  {!searchTerm && 'Click "+ New" to create one.'}
                </div>
              ) : (
                filteredTileTypes.map(tileType => (
                  <div
                    key={tileType.id}
                    className={`p-3 rounded cursor-pointer transition-colors ${
                      selectedId === tileType.id
                        ? 'bg-blue-600'
                        : 'bg-gray-800 hover:bg-gray-700'
                    }`}
                    onClick={() => handleSelect(tileType.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        {/* Preview thumbnail */}
                        <div className="w-10 h-10 bg-gray-600 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
                          {tileType.customSprite?.idleImageData ? (
                            <img
                              src={tileType.customSprite.idleImageData}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-lg">
                              {tileType.behaviors[0] ? getBehaviorIcon(tileType.behaviors[0].type) : '⬜'}
                            </span>
                          )}
                        </div>
                        <div>
                          <h3 className="font-bold">{tileType.name}</h3>
                          <p className="text-xs text-gray-400">
                            {tileType.baseType} • {tileType.behaviors.length} behavior{tileType.behaviors.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <InlineFolderPicker
                          category="tiles"
                          currentFolderId={tileType.folderId}
                          onFolderChange={(folderId) => handleFolderChange(tileType.id, folderId)}
                        />
                        <button
                          onClick={(e) => handleDuplicate(tileType, e)}
                          className="px-1.5 py-1 text-xs bg-gray-600 rounded hover:bg-gray-500"
                          title="Duplicate"
                        >
                          ⎘
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(tileType.id);
                          }}
                          className="px-2 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Tile Type Editor */}
          <div className="flex-1">
            {editing ? (
              <div className="space-y-6">
                {/* Header */}
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">
                    {isCreating ? 'Create New Tile Type' : `Edit: ${editing.name}`}
                  </h2>
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-green-600 rounded hover:bg-green-700"
                  >
                    💾 Save Tile Type
                  </button>
                </div>

                {/* Basic Info */}
                <div className="bg-gray-800 p-4 rounded space-y-3">
                  <h3 className="text-lg font-bold">Basic Info</h3>
                  <div>
                    <label className="block text-sm mb-1">Name</label>
                    <input
                      type="text"
                      value={editing.name}
                      onChange={e => setEditing({ ...editing, name: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-700 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Description</label>
                    <textarea
                      value={editing.description || ''}
                      onChange={e => setEditing({ ...editing, description: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-700 rounded"
                      rows={2}
                      placeholder="Optional description..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Folder</label>
                    <select
                      value={editing.folderId || ''}
                      onChange={e => setEditing({ ...editing, folderId: e.target.value || undefined })}
                      className="w-full px-3 py-2 bg-gray-700 rounded"
                    >
                      <option value="">Uncategorized</option>
                      {getFolders('tiles').map(folder => (
                        <option key={folder.id} value={folder.id}>{folder.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Base Type</label>
                    <select
                      value={editing.baseType}
                      onChange={e => setEditing({ ...editing, baseType: e.target.value as 'empty' | 'wall' })}
                      className="w-full px-3 py-2 bg-gray-700 rounded"
                    >
                      <option value="empty">Empty (Walkable)</option>
                      <option value="wall">Wall (Blocked)</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      Determines if characters can walk on this tile.
                    </p>
                  </div>
                </div>

                {/* Behaviors */}
                <div className="bg-gray-800 p-4 rounded">
                  <h3 className="text-lg font-bold mb-4">Behaviors</h3>
                  {editing.behaviors.length === 0 ? (
                    <p className="text-gray-400 text-sm mb-3">
                      No behaviors added. Add behaviors to make this tile interactive.
                    </p>
                  ) : (
                    editing.behaviors.map((behavior, idx) => (
                      <BehaviorEditor
                        key={idx}
                        behavior={behavior}
                        onChange={b => handleUpdateBehavior(idx, b)}
                        onRemove={() => handleRemoveBehavior(idx)}
                      />
                    ))
                  )}
                  <select
                    value=""
                    onChange={e => {
                      if (!e.target.value) return;
                      handleAddBehavior(e.target.value as TileBehaviorType);
                      e.target.value = '';
                    }}
                    className="w-full px-3 py-2 bg-gray-700 rounded"
                  >
                    <option value="">+ Add Behavior...</option>
                    {BEHAVIOR_OPTIONS.map(opt => (
                      <option key={opt.type} value={opt.type}>
                        {opt.label} - {opt.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Cadence Configuration */}
                <div className="bg-gray-800 p-4 rounded">
                  <h3 className="text-lg font-bold mb-4">On/Off Cadence</h3>
                  <p className="text-sm text-gray-400 mb-4">
                    Make tile behaviors toggle on and off based on turn count.
                  </p>

                  <label className="flex items-center text-sm text-gray-300 cursor-pointer mb-4">
                    <input
                      type="checkbox"
                      checked={editing.cadence?.enabled || false}
                      onChange={e => {
                        if (e.target.checked) {
                          setEditing({
                            ...editing,
                            cadence: {
                              enabled: true,
                              pattern: 'alternating',
                              startState: 'on',
                            },
                          });
                        } else {
                          setEditing({ ...editing, cadence: undefined });
                        }
                      }}
                      className="mr-2"
                    />
                    Enable on/off cadence
                  </label>

                  {editing.cadence?.enabled && (
                    <div className="space-y-4 pl-4 border-l-2 border-blue-500">
                      {/* Pattern Type */}
                      <div>
                        <label className="text-sm text-gray-300 block mb-1">Pattern</label>
                        <select
                          value={editing.cadence.pattern}
                          onChange={e => setEditing({
                            ...editing,
                            cadence: { ...editing.cadence!, pattern: e.target.value as CadencePattern },
                          })}
                          className="w-full px-3 py-2 bg-gray-700 rounded text-sm"
                        >
                          {CADENCE_PATTERNS.map(p => (
                            <option key={p.value} value={p.value}>{p.label} - {p.description}</option>
                          ))}
                        </select>
                      </div>

                      {/* Interval Settings */}
                      {editing.cadence.pattern === 'interval' && (
                        <div className="flex gap-4">
                          <div className="flex-1">
                            <label className="text-sm text-gray-300 block mb-1">On Turns</label>
                            <input
                              type="number"
                              min="1"
                              value={editing.cadence.onTurns || 1}
                              onChange={e => setEditing({
                                ...editing,
                                cadence: { ...editing.cadence!, onTurns: parseInt(e.target.value) || 1 },
                              })}
                              className="w-full px-3 py-2 bg-gray-700 rounded text-sm"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-sm text-gray-300 block mb-1">Off Turns</label>
                            <input
                              type="number"
                              min="1"
                              value={editing.cadence.offTurns || 1}
                              onChange={e => setEditing({
                                ...editing,
                                cadence: { ...editing.cadence!, offTurns: parseInt(e.target.value) || 1 },
                              })}
                              className="w-full px-3 py-2 bg-gray-700 rounded text-sm"
                            />
                          </div>
                        </div>
                      )}

                      {/* Custom Pattern */}
                      {editing.cadence.pattern === 'custom' && (
                        <div>
                          <label className="text-sm text-gray-300 block mb-2">
                            Custom Pattern (click to toggle)
                          </label>
                          <div className="flex flex-wrap gap-1 mb-2">
                            {(editing.cadence.customPattern || [true]).map((isOn, idx) => (
                              <button
                                key={idx}
                                onClick={() => {
                                  const newPattern = [...(editing.cadence!.customPattern || [true])];
                                  newPattern[idx] = !newPattern[idx];
                                  setEditing({
                                    ...editing,
                                    cadence: { ...editing.cadence!, customPattern: newPattern },
                                  });
                                }}
                                className={`w-8 h-8 rounded text-xs font-bold ${
                                  isOn ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-400'
                                }`}
                              >
                                {idx + 1}
                              </button>
                            ))}
                            <button
                              onClick={() => {
                                const newPattern = [...(editing.cadence!.customPattern || [true]), true];
                                setEditing({
                                  ...editing,
                                  cadence: { ...editing.cadence!, customPattern: newPattern },
                                });
                              }}
                              className="w-8 h-8 rounded bg-gray-700 text-gray-400 hover:bg-gray-600 text-lg"
                              title="Add turn"
                            >
                              +
                            </button>
                            {(editing.cadence.customPattern?.length || 1) > 1 && (
                              <button
                                onClick={() => {
                                  const newPattern = (editing.cadence!.customPattern || [true]).slice(0, -1);
                                  setEditing({
                                    ...editing,
                                    cadence: { ...editing.cadence!, customPattern: newPattern },
                                  });
                                }}
                                className="w-8 h-8 rounded bg-gray-700 text-gray-400 hover:bg-red-600 text-lg"
                                title="Remove last turn"
                              >
                                -
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">
                            Green = On, Gray = Off. Pattern repeats.
                          </p>
                        </div>
                      )}

                      {/* Starting State */}
                      <div>
                        <label className="text-sm text-gray-300 block mb-1">Starting State</label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditing({
                              ...editing,
                              cadence: { ...editing.cadence!, startState: 'on' },
                            })}
                            className={`flex-1 px-3 py-2 rounded text-sm ${
                              editing.cadence.startState === 'on'
                                ? 'bg-green-600 text-white'
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                            }`}
                          >
                            On
                          </button>
                          <button
                            onClick={() => setEditing({
                              ...editing,
                              cadence: { ...editing.cadence!, startState: 'off' },
                            })}
                            className={`flex-1 px-3 py-2 rounded text-sm ${
                              editing.cadence.startState === 'off'
                                ? 'bg-gray-500 text-white'
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                            }`}
                          >
                            Off
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Tile Sprite */}
                <div className="bg-gray-800 p-4 rounded">
                  <h3 className="text-lg font-bold mb-4">
                    {editing.cadence?.enabled ? 'On State Sprite' : 'Tile Sprite'}
                  </h3>
                  <p className="text-sm text-gray-400 mb-4">
                    Upload a custom sprite for this tile type. If not set, a default visual will be used based on behaviors.
                  </p>

                  {editing.customSprite?.idleImageData ? (
                    <div className="relative inline-block">
                      <img
                        src={editing.customSprite.idleImageData}
                        alt="Tile sprite"
                        className="w-24 h-24 object-contain bg-gray-600 rounded"
                      />
                      <button
                        onClick={handleSpriteRemove}
                        className="absolute top-0 right-0 px-2 py-1 bg-red-600 rounded text-xs hover:bg-red-700"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <label className="block cursor-pointer">
                      <div className="w-full h-24 border-2 border-dashed border-gray-500 rounded flex flex-col items-center justify-center text-gray-400 hover:border-gray-400">
                        <span>+ Upload Sprite</span>
                        <span className="text-xs text-gray-500 mt-1">48x48 recommended</span>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handleSpriteUpload(file);
                        }}
                        className="hidden"
                      />
                    </label>
                  )}

                  {/* Hide Behavior Indicators Option */}
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <label className="flex items-center text-sm text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editing.hideBehaviorIndicators || false}
                        onChange={e => setEditing({ ...editing, hideBehaviorIndicators: e.target.checked })}
                        className="mr-2"
                      />
                      Hide behavior indicators
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                      Hides the default overlays (purple for teleport, blue for ice, etc.) when the tile has a custom sprite.
                    </p>
                  </div>

                  {/* Prevent Placement Option */}
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <label className="flex items-center text-sm text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editing.preventPlacement || false}
                        onChange={e => setEditing({ ...editing, preventPlacement: e.target.checked })}
                        className="mr-2"
                      />
                      Prevent character placement
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                      Characters cannot be placed on this tile during setup, but can still walk on it during gameplay.
                      Useful for portal destinations, trap areas, or tiles that should only be reached through gameplay.
                    </p>
                  </div>
                </div>

                {/* Off State Sprite (only shown when cadence is enabled) */}
                {editing.cadence?.enabled && (
                  <div className="bg-gray-800 p-4 rounded">
                    <h3 className="text-lg font-bold mb-4">Off State Sprite</h3>
                    <p className="text-sm text-gray-400 mb-4">
                      Sprite shown when tile is in "off" state. If not set, the on state sprite will be used (or greyed out).
                    </p>

                    {editing.offStateSprite?.idleImageData ? (
                      <div className="relative inline-block">
                        <img
                          src={editing.offStateSprite.idleImageData}
                          alt="Off state sprite"
                          className="w-24 h-24 object-contain bg-gray-600 rounded"
                        />
                        <button
                          onClick={handleOffStateSpriteRemove}
                          className="absolute top-0 right-0 px-2 py-1 bg-red-600 rounded text-xs hover:bg-red-700"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <label className="block cursor-pointer">
                        <div className="w-full h-24 border-2 border-dashed border-gray-500 rounded flex flex-col items-center justify-center text-gray-400 hover:border-gray-400">
                          <span>+ Upload Off State Sprite</span>
                          <span className="text-xs text-gray-500 mt-1">48x48 recommended</span>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleOffStateSpriteUpload(file);
                          }}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-800 p-8 rounded text-center">
                <h2 className="text-2xl font-bold mb-4">Custom Tile Type Editor</h2>
                <p className="text-gray-400 mb-6">
                  Create custom tile types with special behaviors like damage zones, teleporters,
                  ice tiles, and pressure plates. Tile types can be placed in the map editor.
                </p>
                <button
                  onClick={handleNew}
                  className="px-6 py-3 bg-green-600 rounded text-lg hover:bg-green-700"
                >
                  + Create New Tile Type
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TileTypeEditor;
