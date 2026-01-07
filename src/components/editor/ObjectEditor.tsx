import React, { useState } from 'react';
import type { CustomObject, CustomSprite, ObjectEffectConfig, ObjectCollisionType, ObjectAnchorPoint } from '../../utils/assetStorage';
import { saveObject, getCustomObjects, deleteObject } from '../../utils/assetStorage';
import { SpriteEditor } from './SpriteEditor';
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

export const ObjectEditor: React.FC = () => {
  const [objects, setObjects] = useState<CustomObject[]>(() => getCustomObjects());
  const [editingObject, setEditingObject] = useState<CustomObject | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const createNewObject = () => {
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

    setEditingObject(newObj);
    setShowEditor(true);
  };

  const handleSave = () => {
    if (!editingObject) return;

    saveObject(editingObject);
    setObjects(getCustomObjects());
    setShowEditor(false);
    setEditingObject(null);
    alert(`Saved "${editingObject.name}"!`);
  };

  const handleEdit = (obj: CustomObject) => {
    setEditingObject({ ...obj });
    setShowEditor(true);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this object?')) return;
    deleteObject(id);
    setObjects(getCustomObjects());
  };

  const handleCancel = () => {
    setShowEditor(false);
    setEditingObject(null);
  };

  const updateSprite = (sprite: CustomSprite) => {
    if (!editingObject) return;
    setEditingObject({ ...editingObject, customSprite: sprite });
  };

  const addEffect = () => {
    if (!editingObject) return;
    const newEffect: ObjectEffectConfig = {
      type: 'damage',
      value: 1,
      radius: 1,
      affectsCharacters: true,
      affectsEnemies: false,
      triggerOnTurnStart: true,
      triggerOnEnter: false,
    };
    setEditingObject({
      ...editingObject,
      effects: [...editingObject.effects, newEffect],
    });
  };

  const updateEffect = (index: number, effect: ObjectEffectConfig) => {
    if (!editingObject) return;
    const newEffects = [...editingObject.effects];
    newEffects[index] = effect;
    setEditingObject({ ...editingObject, effects: newEffects });
  };

  const removeEffect = (index: number) => {
    if (!editingObject) return;
    const newEffects = editingObject.effects.filter((_, i) => i !== index);
    setEditingObject({ ...editingObject, effects: newEffects });
  };

  // Editor modal
  if (showEditor && editingObject) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-6 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Object Editor</h2>
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-600 rounded hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-green-600 rounded hover:bg-green-700"
              >
                Save Object
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Left Column - Basic Info & Sprite */}
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="bg-gray-700 p-4 rounded">
                <h3 className="text-lg font-bold mb-3">Basic Info</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm mb-1">Name</label>
                    <input
                      type="text"
                      value={editingObject.name}
                      onChange={(e) => setEditingObject({ ...editingObject, name: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-600 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Description</label>
                    <textarea
                      value={editingObject.description || ''}
                      onChange={(e) => setEditingObject({ ...editingObject, description: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-600 rounded"
                      rows={2}
                    />
                  </div>
                </div>
              </div>

              {/* Sprite Editor */}
              <div className="bg-gray-700 p-4 rounded">
                <h3 className="text-lg font-bold mb-3">Sprite</h3>
                {editingObject.customSprite && (
                  <SpriteEditor
                    sprite={editingObject.customSprite}
                    onUpdate={updateSprite}
                    showDirectional={false}
                  />
                )}
              </div>
            </div>

            {/* Right Column - Properties & Effects */}
            <div className="space-y-6">
              {/* Positioning */}
              <div className="bg-gray-700 p-4 rounded">
                <h3 className="text-lg font-bold mb-3">Positioning</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm mb-1">Anchor Point</label>
                    <select
                      value={editingObject.anchorPoint}
                      onChange={(e) => setEditingObject({ ...editingObject, anchorPoint: e.target.value as ObjectAnchorPoint })}
                      className="w-full px-3 py-2 bg-gray-600 rounded"
                    >
                      {ANCHOR_POINTS.map(ap => (
                        <option key={ap.value} value={ap.value}>{ap.label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      {ANCHOR_POINTS.find(ap => ap.value === editingObject.anchorPoint)?.description}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Render Layer</label>
                    <select
                      value={editingObject.renderLayer || 'below_entities'}
                      onChange={(e) => setEditingObject({ ...editingObject, renderLayer: e.target.value as 'below_entities' | 'above_entities' })}
                      className="w-full px-3 py-2 bg-gray-600 rounded"
                    >
                      <option value="below_entities">Below Entities</option>
                      <option value="above_entities">Above Entities</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Collision */}
              <div className="bg-gray-700 p-4 rounded">
                <h3 className="text-lg font-bold mb-3">Collision</h3>
                <div>
                  <label className="block text-sm mb-1">Collision Type</label>
                  <select
                    value={editingObject.collisionType}
                    onChange={(e) => setEditingObject({ ...editingObject, collisionType: e.target.value as ObjectCollisionType })}
                    className="w-full px-3 py-2 bg-gray-600 rounded"
                  >
                    {COLLISION_TYPES.map(ct => (
                      <option key={ct.value} value={ct.value}>{ct.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    {COLLISION_TYPES.find(ct => ct.value === editingObject.collisionType)?.description}
                  </p>
                </div>
              </div>

              {/* Effects */}
              <div className="bg-gray-700 p-4 rounded">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold">Effects</h3>
                  <button
                    onClick={addEffect}
                    className="px-3 py-1 text-sm bg-blue-600 rounded hover:bg-blue-700"
                  >
                    + Add Effect
                  </button>
                </div>

                {editingObject.effects.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">
                    No effects. Add effects to make this object interact with entities.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-[32rem] overflow-y-auto">
                    {editingObject.effects.map((effect, index) => (
                      <div key={index} className="bg-gray-600 p-3 rounded">
                        <div className="flex items-center justify-between mb-2">
                          <select
                            value={effect.type}
                            onChange={(e) => updateEffect(index, { ...effect, type: e.target.value as ObjectEffectConfig['type'] })}
                            className="px-2 py-1 bg-gray-700 rounded text-sm"
                          >
                            {EFFECT_TYPES.map(et => (
                              <option key={et.value} value={et.value}>{et.label}</option>
                            ))}
                          </select>
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
                                className="w-full px-2 py-1 bg-gray-700 rounded"
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
                              className="w-full px-2 py-1 bg-gray-700 rounded"
                            />
                          </div>
                        </div>

                        <div className="mt-2 space-y-1">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={effect.affectsCharacters ?? true}
                              onChange={(e) => updateEffect(index, { ...effect, affectsCharacters: e.target.checked })}
                            />
                            Affects Characters
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={effect.affectsEnemies ?? false}
                              onChange={(e) => updateEffect(index, { ...effect, affectsEnemies: e.target.checked })}
                            />
                            Affects Enemies
                          </label>
                        </div>

                        <div className="mt-2 space-y-1">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={effect.triggerOnTurnStart ?? true}
                              onChange={(e) => updateEffect(index, { ...effect, triggerOnTurnStart: e.target.checked })}
                            />
                            Trigger on Turn Start
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={effect.triggerOnEnter ?? false}
                              onChange={(e) => updateEffect(index, { ...effect, triggerOnEnter: e.target.checked })}
                            />
                            Trigger on Enter Radius
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Object Library View
  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Object Library</h2>
          <button
            onClick={createNewObject}
            className="px-4 py-2 bg-green-600 rounded hover:bg-green-700"
          >
            + Create New Object
          </button>
        </div>

        {objects.length === 0 ? (
          <div className="bg-gray-800 p-8 rounded text-center">
            <p className="text-gray-400 mb-4">No objects created yet.</p>
            <p className="text-sm text-gray-500">
              Objects are decorations and obstacles that can be placed on tiles.
              <br />
              They can have collision, deal damage, heal, and more!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {objects.map(obj => (
              <div
                key={obj.id}
                className="bg-gray-800 p-4 rounded hover:bg-gray-750 transition-colors"
              >
                <div className="flex items-center gap-3 mb-3">
                  <SpriteThumbnail sprite={obj.customSprite} size={48} />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold truncate">{obj.name}</h3>
                    <p className="text-xs text-gray-400 capitalize">{obj.collisionType.replace('_', ' ')}</p>
                  </div>
                </div>

                {obj.description && (
                  <p className="text-xs text-gray-400 mb-2 line-clamp-2">{obj.description}</p>
                )}

                {obj.effects.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {obj.effects.map((effect, i) => (
                      <span
                        key={i}
                        className={`text-xs px-2 py-0.5 rounded ${
                          effect.type === 'damage' ? 'bg-red-900 text-red-300' :
                          effect.type === 'heal' ? 'bg-green-900 text-green-300' :
                          'bg-blue-900 text-blue-300'
                        }`}
                      >
                        {effect.type} {effect.value ? `(${effect.value})` : ''} r{effect.radius}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(obj)}
                    className="flex-1 px-3 py-1 text-sm bg-blue-600 rounded hover:bg-blue-700"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(obj.id)}
                    className="px-3 py-1 text-sm bg-red-600 rounded hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
