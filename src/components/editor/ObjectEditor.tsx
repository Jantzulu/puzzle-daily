import React, { useState } from 'react';
import type { CustomObject, CustomSprite, ObjectEffectConfig, ObjectCollisionType, ObjectAnchorPoint } from '../../utils/assetStorage';
import { saveObject, getCustomObjects, deleteObject } from '../../utils/assetStorage';
import { StaticSpriteEditor } from './StaticSpriteEditor';
import { SpriteThumbnail } from './SpriteThumbnail';

const COLLISION_TYPES: { value: ObjectCollisionType; label: string; description: string }[] = [
  { value: 'none', label: 'No Collision', description: 'Entities can walk through freely' },
  { value: 'wall', label: 'Wall', description: 'Acts like a wall - triggers wall collision behaviors' },
  { value: 'stop_movement', label: 'Stop Movement', description: 'Stops entity movement but no wall reaction' },
];

const ANCHOR_POINTS: { value: ObjectAnchorPoint; label: string; description: string }[] = [
  { value: 'center', label: 'Center', description: 'Sprite center aligned to tile center' },
  { value: 'bottom_center', label: 'Bottom Center', description: 'Sprite bottom aligned to tile center (for tall objects)' },
];

const EFFECT_TYPES: { value: ObjectEffectConfig['type']; label: string }[] = [
  { value: 'damage', label: 'Damage' },
  { value: 'heal', label: 'Heal' },
  { value: 'slow', label: 'Slow' },
  { value: 'speed_boost', label: 'Speed Boost' },
  { value: 'teleport', label: 'Teleport' },
];

// Get effect icon
const getEffectIcon = (type: ObjectEffectConfig['type']): string => {
  switch (type) {
    case 'damage': return '🔥';
    case 'heal': return '💚';
    case 'slow': return '🐌';
    case 'speed_boost': return '⚡';
    case 'teleport': return '🌀';
    default: return '?';
  }
};

export const ObjectEditor: React.FC = () => {
  const [objects, setObjects] = useState<CustomObject[]>(() => getCustomObjects());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomObject | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const refreshObjects = () => {
    setObjects(getCustomObjects());
  };

  const handleSelect = (id: string) => {
    const obj = objects.find(o => o.id === id);
    if (obj) {
      setSelectedId(id);
      setEditing({ ...obj, effects: [...obj.effects] });
      setIsCreating(false);
    }
  };

  const handleNew = () => {
    const newObj: CustomObject = {
      id: 'obj_' + Date.now(),
      name: 'New Object',
      description: '',
      customSprite: {
        id: 'sprite_' + Date.now(),
        name: 'Object Sprite',
        type: 'simple',
        shape: 'square',
        primaryColor: '#8b4513',
        secondaryColor: '#d2691e',
        size: 0.8,
        createdAt: new Date().toISOString(),
      },
      anchorPoint: 'center',
      collisionType: 'none',
      effects: [],
      renderLayer: 'below_entities',
      castsShadow: false,
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
    setEditing(newObj);
    setSelectedId(null);
    setIsCreating(true);
  };

  const handleSave = () => {
    if (!editing) return;
    saveObject(editing);
    refreshObjects();
    setSelectedId(editing.id);
    setIsCreating(false);
    alert(`Saved "${editing.name}"!`);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this object?')) return;
    deleteObject(id);
    refreshObjects();
    if (selectedId === id) {
      setSelectedId(null);
      setEditing(null);
    }
  };

  const updateSprite = (sprite: CustomSprite) => {
    if (!editing) return;
    setEditing({ ...editing, customSprite: sprite });
  };

  const addEffect = () => {
    if (!editing) return;
    const newEffect: ObjectEffectConfig = {
      type: 'damage',
      value: 1,
      radius: 1,
      affectsCharacters: true,
      affectsEnemies: false,
      triggerOnTurnStart: true,
      triggerOnEnter: false,
    };
    setEditing({
      ...editing,
      effects: [...editing.effects, newEffect],
    });
  };

  const updateEffect = (index: number, effect: ObjectEffectConfig) => {
    if (!editing) return;
    const newEffects = [...editing.effects];
    newEffects[index] = effect;
    setEditing({ ...editing, effects: newEffects });
  };

  const removeEffect = (index: number) => {
    if (!editing) return;
    const newEffects = editing.effects.filter((_, i) => i !== index);
    setEditing({ ...editing, effects: newEffects });
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex gap-8">
          {/* Object List */}
          <div className="w-72 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">Objects</h2>
              <button
                onClick={handleNew}
                className="px-3 py-1 bg-green-600 rounded text-sm hover:bg-green-700"
              >
                + New
              </button>
            </div>

            <div className="space-y-2 max-h-[calc(100vh-250px)] overflow-y-auto">
              {objects.length === 0 ? (
                <div className="bg-gray-800 p-4 rounded text-center text-gray-400 text-sm">
                  No objects yet.
                  <br />
                  Click "+ New" to create one.
                </div>
              ) : (
                objects.map(obj => (
                  <div
                    key={obj.id}
                    className={`p-3 rounded cursor-pointer transition-colors ${
                      selectedId === obj.id
                        ? 'bg-blue-600'
                        : 'bg-gray-800 hover:bg-gray-700'
                    }`}
                    onClick={() => handleSelect(obj.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        {/* Preview thumbnail */}
                        <div className="w-10 h-10 bg-gray-600 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
                          <SpriteThumbnail sprite={obj.customSprite} size={40} />
                        </div>
                        <div>
                          <h3 className="font-bold">{obj.name}</h3>
                          <p className="text-xs text-gray-400 capitalize">
                            {obj.collisionType.replace('_', ' ')}
                            {obj.effects.length > 0 && ` • ${obj.effects.length} effect${obj.effects.length !== 1 ? 's' : ''}`}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(obj.id);
                        }}
                        className="px-2 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Object Editor */}
          <div className="flex-1">
            {editing ? (
              <div className="space-y-6">
                {/* Header */}
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">
                    {isCreating ? 'Create New Object' : `Edit: ${editing.name}`}
                  </h2>
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-green-600 rounded hover:bg-green-700"
                  >
                    Save Object
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
                </div>

                {/* Sprite */}
                <div className="bg-gray-800 p-4 rounded">
                  <h3 className="text-lg font-bold mb-4">Sprite</h3>
                  {editing.customSprite && (
                    <StaticSpriteEditor
                      sprite={editing.customSprite}
                      onChange={updateSprite}
                    />
                  )}
                </div>

                {/* Positioning */}
                <div className="bg-gray-800 p-4 rounded space-y-3">
                  <h3 className="text-lg font-bold">Positioning</h3>
                  <div>
                    <label className="block text-sm mb-1">Anchor Point</label>
                    <select
                      value={editing.anchorPoint}
                      onChange={(e) => setEditing({ ...editing, anchorPoint: e.target.value as ObjectAnchorPoint })}
                      className="w-full px-3 py-2 bg-gray-700 rounded"
                    >
                      {ANCHOR_POINTS.map(ap => (
                        <option key={ap.value} value={ap.value}>{ap.label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      {ANCHOR_POINTS.find(ap => ap.value === editing.anchorPoint)?.description}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Render Layer</label>
                    <select
                      value={editing.renderLayer || 'below_entities'}
                      onChange={(e) => setEditing({ ...editing, renderLayer: e.target.value as 'below_entities' | 'above_entities' })}
                      className="w-full px-3 py-2 bg-gray-700 rounded"
                    >
                      <option value="below_entities">Below Entities</option>
                      <option value="above_entities">Above Entities</option>
                    </select>
                  </div>
                </div>

                {/* Collision */}
                <div className="bg-gray-800 p-4 rounded">
                  <h3 className="text-lg font-bold mb-3">Collision</h3>
                  <div>
                    <label className="block text-sm mb-1">Collision Type</label>
                    <select
                      value={editing.collisionType}
                      onChange={(e) => setEditing({ ...editing, collisionType: e.target.value as ObjectCollisionType })}
                      className="w-full px-3 py-2 bg-gray-700 rounded"
                    >
                      {COLLISION_TYPES.map(ct => (
                        <option key={ct.value} value={ct.value}>{ct.label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      {COLLISION_TYPES.find(ct => ct.value === editing.collisionType)?.description}
                    </p>
                  </div>
                </div>

                {/* Effects */}
                <div className="bg-gray-800 p-4 rounded">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold">Effects</h3>
                    <button
                      onClick={addEffect}
                      className="px-3 py-1 text-sm bg-blue-600 rounded hover:bg-blue-700"
                    >
                      + Add Effect
                    </button>
                  </div>

                  {editing.effects.length === 0 ? (
                    <p className="text-gray-400 text-sm">
                      No effects added. Add effects to make this object interact with entities.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {editing.effects.map((effect, index) => (
                        <div key={index} className="bg-gray-700 rounded p-3">
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                              <span>{getEffectIcon(effect.type)}</span>
                              <select
                                value={effect.type}
                                onChange={(e) => updateEffect(index, { ...effect, type: e.target.value as ObjectEffectConfig['type'] })}
                                className="px-2 py-1 bg-gray-600 rounded text-sm"
                              >
                                {EFFECT_TYPES.map(et => (
                                  <option key={et.value} value={et.value}>{et.label}</option>
                                ))}
                              </select>
                            </div>
                            <button
                              onClick={() => removeEffect(index)}
                              className="px-2 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                            >
                              Remove
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {(effect.type === 'damage' || effect.type === 'heal') && (
                              <div>
                                <label className="block text-xs text-gray-400">Value</label>
                                <input
                                  type="number"
                                  min="1"
                                  value={effect.value || 1}
                                  onChange={(e) => updateEffect(index, { ...effect, value: Number(e.target.value) })}
                                  className="w-full px-2 py-1 bg-gray-600 rounded"
                                />
                              </div>
                            )}
                            <div>
                              <label className="block text-xs text-gray-400">Radius (tiles)</label>
                              <input
                                type="number"
                                min="0"
                                max="10"
                                value={effect.radius}
                                onChange={(e) => updateEffect(index, { ...effect, radius: Number(e.target.value) })}
                                className="w-full px-2 py-1 bg-gray-600 rounded"
                              />
                            </div>
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={effect.affectsCharacters ?? true}
                                onChange={(e) => updateEffect(index, { ...effect, affectsCharacters: e.target.checked })}
                              />
                              Affects Characters
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={effect.affectsEnemies ?? false}
                                onChange={(e) => updateEffect(index, { ...effect, affectsEnemies: e.target.checked })}
                              />
                              Affects Enemies
                            </label>
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={effect.triggerOnTurnStart ?? true}
                                onChange={(e) => updateEffect(index, { ...effect, triggerOnTurnStart: e.target.checked })}
                              />
                              On Turn Start
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={effect.triggerOnEnter ?? false}
                                onChange={(e) => updateEffect(index, { ...effect, triggerOnEnter: e.target.checked })}
                              />
                              On Enter Radius
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-gray-800 p-8 rounded text-center">
                <h2 className="text-2xl font-bold mb-4">Object Editor</h2>
                <p className="text-gray-400 mb-6">
                  Create objects with custom sprites that can be placed on tiles.
                  Objects can have collision, deal damage, heal, and more!
                </p>
                <button
                  onClick={handleNew}
                  className="px-6 py-3 bg-green-600 rounded text-lg hover:bg-green-700"
                >
                  + Create New Object
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
