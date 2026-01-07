import React, { useState } from 'react';
import type { TileBehaviorType, TileBehaviorConfig, PressurePlateEffect, Direction } from '../../types/game';
import type { CustomTileType, CustomSprite } from '../../utils/assetStorage';
import { getCustomTileTypes, saveTileType, deleteTileType } from '../../utils/assetStorage';

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
  { value: 'north', label: 'North (↑)' },
  { value: 'northeast', label: 'Northeast (↗)' },
  { value: 'east', label: 'East (→)' },
  { value: 'southeast', label: 'Southeast (↘)' },
  { value: 'south', label: 'South (↓)' },
  { value: 'southwest', label: 'Southwest (↙)' },
  { value: 'west', label: 'West (←)' },
  { value: 'northwest', label: 'Northwest (↖)' },
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
          className="text-red-400 hover:text-red-300 text-sm"
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

export const TileTypeEditor: React.FC = () => {
  const [tileTypes, setTileTypes] = useState<CustomTileType[]>(() => getCustomTileTypes());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomTileType | null>(null);
  const [isCreating, setIsCreating] = useState(false);

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

  return (
    <div className="flex h-full">
      {/* Left sidebar - Tile type list */}
      <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold mb-3">Tile Types</h2>
          <button
            onClick={handleNew}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded text-sm"
          >
            + New Tile Type
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {tileTypes.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">
              No custom tile types yet.
              <br />
              Click "New Tile Type" to create one.
            </p>
          ) : (
            tileTypes.map(tileType => (
              <div
                key={tileType.id}
                onClick={() => handleSelect(tileType.id)}
                className={`p-3 rounded cursor-pointer mb-2 ${
                  selectedId === tileType.id
                    ? 'bg-blue-600'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  {/* Preview thumbnail */}
                  <div className="w-10 h-10 bg-gray-600 rounded flex items-center justify-center overflow-hidden">
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
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{tileType.name}</div>
                    <div className="text-xs text-gray-400">
                      {tileType.baseType} • {tileType.behaviors.length} behavior{tileType.behaviors.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right panel - Editor */}
      <div className="flex-1 overflow-y-auto p-6">
        {editing ? (
          <div className="max-w-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">
                {isCreating ? 'Create Tile Type' : 'Edit Tile Type'}
              </h2>
              <div className="flex gap-2">
                {!isCreating && (
                  <button
                    onClick={() => handleDelete(editing.id)}
                    className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded text-sm"
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={handleSave}
                  className="bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded text-sm"
                >
                  Save
                </button>
              </div>
            </div>

            {/* Basic Info */}
            <div className="bg-gray-800 rounded p-4 mb-4">
              <h3 className="font-medium mb-3">Basic Info</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-300">Name</label>
                  <input
                    type="text"
                    value={editing.name}
                    onChange={e => setEditing({ ...editing, name: e.target.value })}
                    className="w-full bg-gray-700 rounded px-3 py-2 mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-300">Description</label>
                  <textarea
                    value={editing.description || ''}
                    onChange={e => setEditing({ ...editing, description: e.target.value })}
                    className="w-full bg-gray-700 rounded px-3 py-2 mt-1 h-20 resize-none"
                    placeholder="Optional description..."
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-300">Base Type</label>
                  <select
                    value={editing.baseType}
                    onChange={e => setEditing({ ...editing, baseType: e.target.value as 'empty' | 'wall' })}
                    className="w-full bg-gray-700 rounded px-3 py-2 mt-1"
                  >
                    <option value="empty">Empty (Walkable)</option>
                    <option value="wall">Wall (Blocked)</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    Determines if characters can walk on this tile.
                  </p>
                </div>
              </div>
            </div>

            {/* Behaviors */}
            <div className="bg-gray-800 rounded p-4 mb-4">
              <h3 className="font-medium mb-3">Behaviors</h3>
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
                className="w-full bg-gray-700 rounded px-3 py-2"
              >
                <option value="">+ Add Behavior...</option>
                {BEHAVIOR_OPTIONS.map(opt => (
                  <option key={opt.type} value={opt.type}>
                    {opt.label} - {opt.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Sprite */}
            <div className="bg-gray-800 rounded p-4">
              <h3 className="font-medium mb-3">Tile Sprite</h3>
              <p className="text-sm text-gray-400 mb-3">
                Upload a custom sprite for this tile type. If not set, a default visual will be used based on behaviors.
              </p>

              {editing.customSprite?.idleImageData ? (
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 bg-gray-700 rounded overflow-hidden">
                    <img
                      src={editing.customSprite.idleImageData}
                      alt="Tile sprite"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <button
                    onClick={handleSpriteRemove}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Remove Sprite
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-600 rounded cursor-pointer hover:border-gray-500">
                  <span className="text-gray-400">Click to upload sprite</span>
                  <span className="text-xs text-gray-500 mt-1">48x48 recommended</span>
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
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <p className="text-lg mb-2">Select a tile type to edit</p>
              <p className="text-sm">or create a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TileTypeEditor;
