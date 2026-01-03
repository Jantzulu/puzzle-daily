import React, { useState } from 'react';
import { Direction, ActionType } from '../../types/game';
import type { CharacterAction, EnemyBehavior } from '../../types/game';
import type { CustomEnemy, CustomSprite } from '../../utils/assetStorage';
import { saveEnemy, getCustomEnemies, deleteEnemy } from '../../utils/assetStorage';
import { getAllEnemies } from '../../data/enemies';
import { SpriteEditor } from './SpriteEditor';
import { SpriteThumbnail } from './SpriteThumbnail';

const ACTION_TYPES = Object.values(ActionType);

export const EnemyEditor: React.FC = () => {
  const [enemies, setEnemies] = useState<CustomEnemy[]>(() => {
    return getAllEnemies().map(e => ({
      ...e,
      isCustom: true,
      createdAt: e.createdAt || new Date().toISOString(),
      customSprite: e.customSprite
    } as CustomEnemy));
  });
  const [editingEnemy, setEditingEnemy] = useState<CustomEnemy | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const createNewEnemy = () => {
    const newEnemy: CustomEnemy = {
      id: 'enemy_' + Date.now(),
      name: 'New Enemy',
      spriteId: 'custom_sprite_' + Date.now(),
      health: 1,
      attackDamage: 1,
      behavior: {
        type: 'static', // Default to static (doesn't move)
        defaultFacing: Direction.SOUTH,
        pattern: []
      },
      customSprite: {
        id: 'sprite_' + Date.now(),
        name: 'Custom Sprite',
        type: 'simple',
        shape: 'circle',
        primaryColor: '#f44336',
        secondaryColor: '#ffffff',
        size: 0.6,
        createdAt: new Date().toISOString(),
      },
      isCustom: true,
      createdAt: new Date().toISOString(),
    };

    setEditingEnemy(newEnemy);
    setShowEditor(true);
  };

  const handleSave = () => {
    if (!editingEnemy) return;

    saveEnemy(editingEnemy);

    // Refresh list
    setEnemies(getAllEnemies().map(e => ({
      ...e,
      isCustom: true,
      createdAt: e.createdAt || new Date().toISOString(),
      customSprite: e.customSprite
    } as CustomEnemy)));

    setShowEditor(false);
    setEditingEnemy(null);
    alert(`Saved "${editingEnemy.name}"!`);
  };

  const handleEdit = (enemy: CustomEnemy) => {
    setEditingEnemy({ ...enemy });
    setShowEditor(true);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this enemy?')) return;
    deleteEnemy(id);

    // Refresh list
    setEnemies(getAllEnemies().map(e => ({
      ...e,
      isCustom: true,
      createdAt: e.createdAt || new Date().toISOString(),
      customSprite: e.customSprite
    } as CustomEnemy)));
  };

  const handleCancel = () => {
    setShowEditor(false);
    setEditingEnemy(null);
  };

  const updateEnemy = (updates: Partial<CustomEnemy>) => {
    if (!editingEnemy) return;
    setEditingEnemy({ ...editingEnemy, ...updates });
  };

  const updateSprite = (sprite: CustomSprite) => {
    if (!editingEnemy) return;
    setEditingEnemy({ ...editingEnemy, customSprite: sprite });
  };

  const updateBehavior = (behavior: EnemyBehavior) => {
    if (!editingEnemy) return;
    setEditingEnemy({ ...editingEnemy, behavior });
  };

  const addBehaviorAction = () => {
    if (!editingEnemy || !editingEnemy.behavior) return;
    const newPattern = [...(editingEnemy.behavior.pattern || []), { type: ActionType.MOVE_FORWARD }];
    updateBehavior({ ...editingEnemy.behavior, pattern: newPattern });
  };

  const removeBehaviorAction = (index: number) => {
    if (!editingEnemy || !editingEnemy.behavior) return;
    const newPattern = editingEnemy.behavior.pattern?.filter((_, i) => i !== index) || [];
    updateBehavior({ ...editingEnemy.behavior, pattern: newPattern });
  };

  const updateBehaviorAction = (index: number, action: CharacterAction) => {
    if (!editingEnemy || !editingEnemy.behavior) return;
    const newPattern = [...(editingEnemy.behavior.pattern || [])];
    newPattern[index] = action;
    updateBehavior({ ...editingEnemy.behavior, pattern: newPattern });
  };

  if (showEditor && editingEnemy) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex justify-between items-center">
            <h1 className="text-3xl font-bold">Enemy Editor</h1>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-green-600 rounded hover:bg-green-700"
              >
                💾 Save
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-600 rounded hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left column - Stats */}
            <div className="bg-gray-800 p-4 rounded">
              <h2 className="text-xl font-bold mb-4">Enemy Stats</h2>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-bold mb-1">Name</label>
                  <input
                    type="text"
                    value={editingEnemy.name}
                    onChange={(e) => updateEnemy({ name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold mb-1">Health</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={editingEnemy.health}
                    onChange={(e) => updateEnemy({ health: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                  />
                  <p className="text-xs text-gray-400 mt-1">Hit points before death</p>
                </div>

                <div>
                  <label className="block text-sm font-bold mb-1">Attack Damage</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={editingEnemy.attackDamage}
                    onChange={(e) => updateEnemy({ attackDamage: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                  />
                  <p className="text-xs text-gray-400 mt-1">Damage dealt when counterattacking</p>
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editingEnemy.blocksMovementAlive || false}
                      onChange={(e) => updateEnemy({ blocksMovementAlive: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-bold">Blocks Movement (Alive)</span>
                  </label>
                  <p className="text-xs text-gray-400 mt-1">Characters can't move through when alive</p>
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editingEnemy.blocksMovementDead || false}
                      onChange={(e) => updateEnemy({ blocksMovementDead: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-bold">Blocks Movement (Dead)</span>
                  </label>
                  <p className="text-xs text-gray-400 mt-1">Corpse acts like a wall after death</p>
                </div>
              </div>

              <div className="mt-6 p-3 bg-gray-700 rounded">
                <h3 className="text-sm font-bold mb-2">Combat Preview</h3>
                <p className="text-xs text-gray-300">
                  • Takes {editingEnemy.health} hit{editingEnemy.health > 1 ? 's' : ''} to kill
                  <br />
                  • Deals {editingEnemy.attackDamage} damage on counterattack
                  <br />
                  • {editingEnemy.blocksMovementAlive ? 'Blocks movement when alive' : 'Can pass through when alive'}
                  <br />
                  • {editingEnemy.blocksMovementDead ? 'Corpse blocks movement' : 'Can walk over corpse'}
                </p>
              </div>
            </div>

            {/* Right column - Sprite Editor */}
            <div className="bg-gray-800 p-4 rounded">
              <h2 className="text-xl font-bold mb-4">Sprite Appearance</h2>
              {editingEnemy.customSprite && (
                <SpriteEditor
                  sprite={editingEnemy.customSprite}
                  onChange={updateSprite}
                />
              )}
            </div>
          </div>

          {/* Behavior Section */}
          <div className="bg-gray-800 p-4 rounded">
            <h2 className="text-xl font-bold mb-4">Enemy Behavior</h2>

            <div className="space-y-4">
              {/* Behavior Type */}
              <div>
                <label className="block text-sm font-bold mb-2">Behavior Type</label>
                <select
                  value={editingEnemy.behavior?.type || 'static'}
                  onChange={(e) => updateBehavior({
                    ...editingEnemy.behavior,
                    type: e.target.value as 'static' | 'active',
                    defaultFacing: editingEnemy.behavior?.defaultFacing || Direction.SOUTH,
                    pattern: editingEnemy.behavior?.pattern || []
                  })}
                  className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                >
                  <option value="static">Static (Doesn't Move)</option>
                  <option value="active">Active (Has AI Behavior)</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  {editingEnemy.behavior?.type === 'static'
                    ? 'Enemy stays in place and only fights when attacked'
                    : 'Enemy moves and acts according to its behavior pattern'}
                </p>
              </div>

              {/* Active Behavior Configuration */}
              {editingEnemy.behavior?.type === 'active' && (
                <>
                  {/* Default Facing */}
                  <div>
                    <label className="block text-sm font-bold mb-2">Default Facing Direction</label>
                    <select
                      value={editingEnemy.behavior?.defaultFacing || Direction.SOUTH}
                      onChange={(e) => updateBehavior({
                        ...editingEnemy.behavior!,
                        defaultFacing: e.target.value as Direction
                      })}
                      className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                    >
                      <option value={Direction.NORTH}>North ↑</option>
                      <option value={Direction.EAST}>East →</option>
                      <option value={Direction.SOUTH}>South ↓</option>
                      <option value={Direction.WEST}>West ←</option>
                    </select>
                  </div>

                  {/* Action Pattern */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-bold">Action Pattern</label>
                      <button
                        onClick={addBehaviorAction}
                        className="px-3 py-1 text-sm bg-blue-600 rounded hover:bg-blue-700"
                      >
                        + Add Action
                      </button>
                    </div>

                    <div className="space-y-2">
                      {(editingEnemy.behavior?.pattern || []).length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">
                          No actions yet. Add actions to define how this enemy moves and behaves.
                        </p>
                      ) : (
                        editingEnemy.behavior!.pattern!.map((action, index) => (
                          <div key={index} className="bg-gray-700 p-3 rounded">
                            <div className="flex gap-2 items-center mb-2">
                              <span className="text-sm text-gray-400 w-6">{index + 1}.</span>
                              <select
                                value={action.type}
                                onChange={(e) => updateBehaviorAction(index, { ...action, type: e.target.value as ActionType })}
                                className="flex-1 px-2 py-1 bg-gray-600 rounded text-sm text-white"
                              >
                                {ACTION_TYPES.map(type => (
                                  <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => removeBehaviorAction(index)}
                                className="px-2 py-1 text-sm bg-red-600 rounded hover:bg-red-700"
                              >
                                ✕
                              </button>
                            </div>
                            {action.type.startsWith('move_') && (
                              <div className="ml-8 space-y-2">
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-gray-400">Tiles per move:</label>
                                  <input
                                    type="number"
                                    min="1"
                                    max="5"
                                    value={action.tilesPerMove || 1}
                                    onChange={(e) => updateBehaviorAction(index, { ...action, tilesPerMove: parseInt(e.target.value) || 1 })}
                                    className="w-16 px-2 py-1 bg-gray-600 rounded text-sm text-white"
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-gray-400">On wall collision:</label>
                                  <select
                                    value={action.onWallCollision || 'stop'}
                                    onChange={(e) => updateBehaviorAction(index, { ...action, onWallCollision: e.target.value as any })}
                                    className="flex-1 px-2 py-1 bg-gray-600 rounded text-xs text-white"
                                  >
                                    <option value="stop">Stop</option>
                                    <option value="turn_left">Turn Left</option>
                                    <option value="turn_right">Turn Right</option>
                                    <option value="turn_around">Turn Around</option>
                                    <option value="continue">Continue (skip wall)</option>
                                  </select>
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    <p className="text-xs text-gray-400 mt-2">
                      Tip: Add REPEAT at the end to loop the behavior pattern
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Library view
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold">Enemy Library</h1>
          <button
            onClick={createNewEnemy}
            className="px-4 py-2 bg-green-600 rounded hover:bg-green-700"
          >
            + New Enemy
          </button>
        </div>

        {enemies.length === 0 ? (
          <div className="bg-gray-800 p-8 rounded text-center">
            <p className="text-gray-400">No custom enemies yet. Create one to get started!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {enemies.map((enemy) => (
              <div key={enemy.id} className="bg-gray-800 p-4 rounded">
                <div className="flex gap-3 mb-3">
                  <SpriteThumbnail sprite={enemy.customSprite} size={64} />
                  <div className="flex-1">
                    <h3 className="font-bold text-lg">{enemy.name}</h3>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div>
                    <span className="text-gray-400">HP:</span> {enemy.health}
                  </div>
                  <div>
                    <span className="text-gray-400">ATK:</span> {enemy.attackDamage}
                  </div>
                  {enemy.blocksMovement && (
                    <div className="col-span-2 text-xs text-yellow-400">
                      🚧 Blocks movement
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(enemy)}
                    className="flex-1 px-3 py-1 text-sm bg-blue-600 rounded hover:bg-blue-700"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(enemy.id)}
                    className="px-3 py-1 text-sm bg-red-600 rounded hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>

                <p className="text-xs text-gray-500 mt-2">
                  {new Date(enemy.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
