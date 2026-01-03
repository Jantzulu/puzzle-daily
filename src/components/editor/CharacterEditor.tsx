import React, { useState } from 'react';
import { Direction, ActionType } from '../../types/game';
import type { CharacterAction, CustomAttack } from '../../types/game';
import type { CustomCharacter, CustomSprite } from '../../utils/assetStorage';
import { saveCharacter, getCustomCharacters, deleteCharacter } from '../../utils/assetStorage';
import { getAllCharacters } from '../../data/characters';
import { SpriteEditor } from './SpriteEditor';
import { SpriteThumbnail } from './SpriteThumbnail';
import { AttackEditor } from './AttackEditor';

const ACTION_TYPES = Object.values(ActionType);

export const CharacterEditor: React.FC = () => {
  // Helper to ensure all characters have a default customSprite
  const ensureCustomSprite = (char: any): CustomCharacter => {
    return {
      ...char,
      isCustom: true,
      createdAt: char.createdAt || new Date().toISOString(),
      customSprite: char.customSprite || {
        id: 'sprite_' + Date.now() + '_' + Math.random(),
        name: char.name + ' Sprite',
        type: 'simple',
        shape: 'circle',
        primaryColor: '#4caf50',
        secondaryColor: '#ffffff',
        size: 0.6,
        createdAt: new Date().toISOString(),
      }
    } as CustomCharacter;
  };

  const [characters, setCharacters] = useState<CustomCharacter[]>(() => {
    return getAllCharacters().map(ensureCustomSprite);
  });
  const [editingCharacter, setEditingCharacter] = useState<CustomCharacter | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingAttack, setEditingAttack] = useState<{ attack: CustomAttack; actionIndex: number } | null>(null);

  const createNewCharacter = () => {
    const newChar: CustomCharacter = {
      id: 'char_' + Date.now(),
      name: 'New Character',
      spriteId: 'custom_sprite_' + Date.now(),
      description: 'Custom character',
      health: 1,
      attackDamage: 1,
      defaultFacing: Direction.EAST,
      behavior: [
        { type: ActionType.MOVE_FORWARD },
        { type: ActionType.REPEAT }
      ],
      customSprite: {
        id: 'sprite_' + Date.now(),
        name: 'Custom Sprite',
        type: 'simple',
        shape: 'square',
        primaryColor: '#4caf50',
        secondaryColor: '#ffffff',
        size: 0.6,
        createdAt: new Date().toISOString(),
      },
      isCustom: true,
      createdAt: new Date().toISOString(),
    };

    setEditingCharacter(newChar);
    setShowEditor(true);
  };

  const handleSave = () => {
    if (!editingCharacter) return;

    saveCharacter(editingCharacter);

    // Refresh list
    setCharacters(getAllCharacters().map(ensureCustomSprite));

    setShowEditor(false);
    setEditingCharacter(null);
    alert(`Saved "${editingCharacter.name}"!`);
  };

  const handleEdit = (char: CustomCharacter) => {
    setEditingCharacter(ensureCustomSprite(char));
    setShowEditor(true);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this character?')) return;
    deleteCharacter(id);

    // Refresh list
    setCharacters(getAllCharacters().map(ensureCustomSprite));
  };

  const handleCancel = () => {
    setShowEditor(false);
    setEditingCharacter(null);
  };

  const updateCharacter = (updates: Partial<CustomCharacter>) => {
    if (!editingCharacter) return;
    setEditingCharacter({ ...editingCharacter, ...updates });
  };

  const updateSprite = (sprite: CustomSprite) => {
    if (!editingCharacter) return;
    setEditingCharacter({ ...editingCharacter, customSprite: sprite });
  };

  const addBehaviorAction = () => {
    if (!editingCharacter) return;
    const newBehavior = [...editingCharacter.behavior];
    // Insert before REPEAT if it exists
    const repeatIndex = newBehavior.findIndex(a => a.type === ActionType.REPEAT);
    if (repeatIndex >= 0) {
      newBehavior.splice(repeatIndex, 0, { type: ActionType.MOVE_FORWARD });
    } else {
      newBehavior.push({ type: ActionType.MOVE_FORWARD });
    }
    setEditingCharacter({ ...editingCharacter, behavior: newBehavior });
  };

  const removeBehaviorAction = (index: number) => {
    if (!editingCharacter) return;
    const newBehavior = editingCharacter.behavior.filter((_, i) => i !== index);
    setEditingCharacter({ ...editingCharacter, behavior: newBehavior });
  };

  const updateBehaviorAction = (index: number, action: CharacterAction) => {
    if (!editingCharacter) return;
    const newBehavior = [...editingCharacter.behavior];
    newBehavior[index] = action;
    setEditingCharacter({ ...editingCharacter, behavior: newBehavior });
  };

  if (showEditor && editingCharacter) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex justify-between items-center">
            <h1 className="text-3xl font-bold">Character Editor</h1>
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
            {/* Left column - Stats and Info */}
            <div className="space-y-4">
              <div className="bg-gray-800 p-4 rounded">
                <h2 className="text-xl font-bold mb-4">Basic Info</h2>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-bold mb-1">Name</label>
                    <input
                      type="text"
                      value={editingCharacter.name}
                      onChange={(e) => updateCharacter({ name: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold mb-1">Description</label>
                    <textarea
                      value={editingCharacter.description}
                      onChange={(e) => updateCharacter({ description: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold mb-1">Health</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={editingCharacter.health}
                      onChange={(e) => updateCharacter({ health: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold mb-1">Attack Damage</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={editingCharacter.attackDamage}
                      onChange={(e) => updateCharacter({ attackDamage: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold mb-1">Default Facing</label>
                    <select
                      value={editingCharacter.defaultFacing}
                      onChange={(e) => updateCharacter({ defaultFacing: e.target.value as Direction })}
                      className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                    >
                      <option value={Direction.NORTH}>North ↑</option>
                      <option value={Direction.EAST}>East →</option>
                      <option value={Direction.SOUTH}>South ↓</option>
                      <option value={Direction.WEST}>West ←</option>
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editingCharacter.blocksMovementAlive || false}
                        onChange={(e) => updateCharacter({ blocksMovementAlive: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-bold">Blocks Movement (Alive)</span>
                    </label>
                    <p className="text-xs text-gray-400 mt-1">Other characters can't pass through</p>
                  </div>

                  <div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editingCharacter.blocksMovementDead || false}
                        onChange={(e) => updateCharacter({ blocksMovementDead: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-bold">Blocks Movement (Dead)</span>
                    </label>
                    <p className="text-xs text-gray-400 mt-1">Corpse blocks movement like a wall</p>
                  </div>
                </div>
              </div>

              {/* Behavior Editor */}
              <div className="bg-gray-800 p-4 rounded">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold">Behavior</h2>
                  <button
                    onClick={addBehaviorAction}
                    className="px-3 py-1 text-sm bg-blue-600 rounded hover:bg-blue-700"
                  >
                    + Add Action
                  </button>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {editingCharacter.behavior.map((action, index) => (
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
                      {action.type === ActionType.CUSTOM_ATTACK && (
                        <div className="ml-8 space-y-2">
                          <div className="text-xs text-gray-400">
                            {action.customAttack ? (
                              <div className="space-y-2">
                                <div><strong>Attack:</strong> {action.customAttack.name || 'Unnamed'}</div>
                                <div><strong>Pattern:</strong> {action.customAttack.pattern}</div>
                                <div><strong>Damage:</strong> {action.customAttack.damage || 1}</div>
                                <div><strong>Range:</strong> {action.customAttack.range || 1} tiles</div>
                                {action.customAttack.pattern === 'projectile' && (
                                  <div><strong>Speed:</strong> {action.customAttack.projectileSpeed || 5} tiles/sec</div>
                                )}
                                <button
                                  onClick={() => {
                                    setEditingAttack({ attack: action.customAttack!, actionIndex: index });
                                  }}
                                  className="mt-2 px-3 py-1 bg-blue-600 rounded text-xs hover:bg-blue-700"
                                >
                                  Edit Attack
                                </button>
                              </div>
                            ) : (
                              <div>
                                <p className="mb-2">No attack configured</p>
                                <button
                                  onClick={() => {
                                    // Open editor with default attack
                                    const defaultAttack: CustomAttack = {
                                      id: 'attack_' + Date.now(),
                                      name: 'New Attack',
                                      pattern: 'projectile',
                                      damage: 1,
                                      range: 5,
                                      projectileSpeed: 5,
                                      projectilePierces: false,
                                      effectDuration: 300
                                    };
                                    setEditingAttack({ attack: defaultAttack, actionIndex: index });
                                  }}
                                  className="px-3 py-1 bg-green-600 rounded text-xs hover:bg-green-700"
                                >
                                  Create Attack
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <p className="text-xs text-gray-400 mt-2">
                  Tip: Add REPEAT at the end to loop the behavior
                </p>
              </div>
            </div>

            {/* Right column - Sprite Editor */}
            <div className="bg-gray-800 p-4 rounded">
              <h2 className="text-xl font-bold mb-4">Sprite Appearance</h2>
              {editingCharacter.customSprite && (
                <SpriteEditor
                  sprite={editingCharacter.customSprite}
                  onChange={updateSprite}
                />
              )}
            </div>
          </div>
        </div>

        {/* Attack Editor Modal */}
        {editingAttack && editingCharacter && (
          <AttackEditor
            attack={editingAttack.attack}
            onSave={(updatedAttack) => {
              // Update the action with the new attack
              updateBehaviorAction(editingAttack.actionIndex, {
                ...editingCharacter.behavior[editingAttack.actionIndex],
                customAttack: updatedAttack
              });
              setEditingAttack(null);
            }}
            onCancel={() => setEditingAttack(null)}
          />
        )}
      </div>
    );
  }

  // Library view
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold">Character Library</h1>
          <button
            onClick={createNewCharacter}
            className="px-4 py-2 bg-green-600 rounded hover:bg-green-700"
          >
            + New Character
          </button>
        </div>

        {characters.length === 0 ? (
          <div className="bg-gray-800 p-8 rounded text-center">
            <p className="text-gray-400">No custom characters yet. Create one to get started!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {characters.map((char) => (
              <div key={char.id} className="bg-gray-800 p-4 rounded">
                <div className="flex gap-3 mb-3">
                  <SpriteThumbnail sprite={char.customSprite} size={64} />
                  <div className="flex-1">
                    <h3 className="font-bold text-lg">{char.name}</h3>
                    <p className="text-xs text-gray-400">{char.description}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div>
                    <span className="text-gray-400">HP:</span> {char.health}
                  </div>
                  <div>
                    <span className="text-gray-400">ATK:</span> {char.attackDamage}
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-400">Actions:</span> {char.behavior.length}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(char)}
                    className="flex-1 px-3 py-1 text-sm bg-blue-600 rounded hover:bg-blue-700"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(char.id)}
                    className="px-3 py-1 text-sm bg-red-600 rounded hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>

                <p className="text-xs text-gray-500 mt-2">
                  {new Date(char.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
