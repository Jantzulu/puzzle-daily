import React, { useState } from 'react';
import { Direction, ActionType } from '../../types/game';
import type { CharacterAction, CustomAttack, SpellAsset, ExecutionMode, TriggerConfig, RelativeDirection } from '../../types/game';
import type { CustomCharacter, CustomSprite } from '../../utils/assetStorage';
import { saveCharacter, getCustomCharacters, deleteCharacter, loadSpellAsset } from '../../utils/assetStorage';
import { getAllCharacters } from '../../data/characters';
import { SpriteEditor } from './SpriteEditor';
import { SpriteThumbnail } from './SpriteThumbnail';
import { AttackEditor } from './AttackEditor';
import { SpellPicker } from './SpellPicker';

// Filter out legacy attack actions - use SPELL instead
const ACTION_TYPES = Object.values(ActionType).filter(
  type => !['attack_forward', 'attack_range', 'attack_aoe', 'custom_attack'].includes(type)
);

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
  const [showSpellPicker, setShowSpellPicker] = useState<number | null>(null); // Index of action being edited

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

    console.log('[CharacterEditor] Saving character:', editingCharacter.name);
    console.log('[CharacterEditor] Behavior being saved:', JSON.stringify(editingCharacter.behavior, null, 2));

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

  const moveActionUp = (index: number) => {
    if (!editingCharacter || index === 0) return;
    const newBehavior = [...editingCharacter.behavior];
    [newBehavior[index - 1], newBehavior[index]] = [newBehavior[index], newBehavior[index - 1]];
    setEditingCharacter({ ...editingCharacter, behavior: newBehavior });
  };

  const moveActionDown = (index: number) => {
    if (!editingCharacter || index === editingCharacter.behavior.length - 1) return;
    const newBehavior = [...editingCharacter.behavior];
    [newBehavior[index], newBehavior[index + 1]] = [newBehavior[index + 1], newBehavior[index]];
    setEditingCharacter({ ...editingCharacter, behavior: newBehavior });
  };

  // Character Editor Modal
  const renderEditor = () => {
    if (!showEditor || !editingCharacter) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-6 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Character Editor</h2>

            {/* Action Buttons - Top */}
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-green-600 rounded hover:bg-green-700 font-semibold"
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
                    <label className="block text-sm font-bold mb-1">Retaliation Damage</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={editingCharacter.retaliationDamage || 0}
                      onChange={(e) => updateCharacter({ retaliationDamage: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                    />
                    <p className="text-xs text-gray-400 mt-1">Damage dealt when enemies try to move onto this character (0 = no retaliation)</p>
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
                        onChange={(e) => updateCharacter({
                          blocksMovementAlive: e.target.checked,
                          behavesLikeWall: e.target.checked ? false : editingCharacter.behavesLikeWall // Mutually exclusive
                        })}
                        className="w-4 h-4"
                        disabled={editingCharacter.behavesLikeWall}
                      />
                      <span className="text-sm font-bold">Blocks Movement (Alive)</span>
                    </label>
                    <p className="text-xs text-gray-400 mt-1">Other characters stop when colliding (no turn behavior)</p>
                  </div>

                  <div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editingCharacter.behavesLikeWall || false}
                        onChange={(e) => updateCharacter({
                          behavesLikeWall: e.target.checked,
                          blocksMovementAlive: e.target.checked ? false : editingCharacter.blocksMovementAlive // Mutually exclusive
                        })}
                        className="w-4 h-4"
                        disabled={editingCharacter.blocksMovementAlive}
                      />
                      <span className="text-sm font-bold">Behaves Like Wall (Alive)</span>
                    </label>
                    <p className="text-xs text-gray-400 mt-1">Triggers wall collision behaviors (turn_left, turn_right, etc.)</p>
                  </div>

                  <div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editingCharacter.blocksMovementDead || false}
                        onChange={(e) => updateCharacter({
                          blocksMovementDead: e.target.checked,
                          behavesLikeWallDead: e.target.checked ? false : editingCharacter.behavesLikeWallDead // Mutually exclusive
                        })}
                        className="w-4 h-4"
                        disabled={editingCharacter.behavesLikeWallDead}
                      />
                      <span className="text-sm font-bold">Blocks Movement (Dead)</span>
                    </label>
                    <p className="text-xs text-gray-400 mt-1">Corpse stops movement (no turn behavior)</p>
                  </div>

                  <div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editingCharacter.behavesLikeWallDead || false}
                        onChange={(e) => updateCharacter({
                          behavesLikeWallDead: e.target.checked,
                          blocksMovementDead: e.target.checked ? false : editingCharacter.blocksMovementDead // Mutually exclusive
                        })}
                        className="w-4 h-4"
                        disabled={editingCharacter.blocksMovementDead}
                      />
                      <span className="text-sm font-bold">Behaves Like Wall (Dead)</span>
                    </label>
                    <p className="text-xs text-gray-400 mt-1">Corpse triggers wall collision behaviors (turn_left, turn_right, etc.)</p>
                  </div>

                  {/* Combat Toggles */}
                  <div className="mt-4 pt-4 border-t border-gray-700 space-y-3">
                    <h3 className="text-sm font-bold text-gray-300">Combat Toggles (Backwards Compatibility)</h3>
                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editingCharacter.useAttackDamage || false}
                          onChange={(e) => updateCharacter({
                            useAttackDamage: e.target.checked
                          })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm font-bold">Use Attack Damage</span>
                      </label>
                      <p className="text-xs text-gray-400 mt-1">Use legacy collision damage system (default: false)</p>
                    </div>

                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editingCharacter.useRetaliationDamage || false}
                          onChange={(e) => updateCharacter({
                            useRetaliationDamage: e.target.checked
                          })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm font-bold">Use Retaliation Damage</span>
                      </label>
                      <p className="text-xs text-gray-400 mt-1">Use legacy retaliation system (default: false)</p>
                    </div>
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
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => moveActionUp(index)}
                            disabled={index === 0}
                            className="px-1 py-0.5 text-xs bg-gray-600 rounded hover:bg-gray-500 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveActionDown(index)}
                            disabled={index === editingCharacter.behavior.length - 1}
                            className="px-1 py-0.5 text-xs bg-gray-600 rounded hover:bg-gray-500 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move down"
                          >
                            ↓
                          </button>
                        </div>
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
                          {(action.onWallCollision === 'turn_left' || action.onWallCollision === 'turn_right') && (
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-gray-400">Turn degrees:</label>
                              <select
                                value={action.turnDegrees || 90}
                                onChange={(e) => {
                                  const newDegrees = parseInt(e.target.value) as 45 | 90 | 135;
                                  console.log('[CharacterEditor] Changing turnDegrees to:', newDegrees, 'for action:', action);
                                  updateBehaviorAction(index, { ...action, turnDegrees: newDegrees });
                                }}
                                className="flex-1 px-2 py-1 bg-gray-600 rounded text-xs text-white"
                              >
                                <option value={45}>45° (One diagonal step)</option>
                                <option value={90}>90° (Cardinal directions)</option>
                                <option value={135}>135° (Skip diagonal - for corners)</option>
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                      {(action.type === ActionType.TURN_LEFT || action.type === ActionType.TURN_RIGHT) && (
                        <div className="ml-8 space-y-2">
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-400">Turn degrees:</label>
                            <select
                              value={action.turnDegrees || 90}
                              onChange={(e) => updateBehaviorAction(index, { ...action, turnDegrees: parseInt(e.target.value) as 45 | 90 | 135 })}
                              className="flex-1 px-2 py-1 bg-gray-600 rounded text-xs text-white"
                            >
                              <option value={45}>45° (One diagonal step)</option>
                              <option value={90}>90° (Cardinal directions)</option>
                              <option value={135}>135° (Skip diagonal - for corners)</option>
                            </select>
                          </div>
                        </div>
                      )}
                      {action.type === ActionType.SPELL && (() => {
                        const spell = action.spellId ? loadSpellAsset(action.spellId) : null;
                        return (
                          <div className="ml-8 space-y-3">
                            {spell ? (
                              <div className="space-y-2">
                                {/* Spell Info */}
                                <div className="flex items-start gap-2 bg-gray-800 p-2 rounded">
                                  {spell.thumbnailIcon && (
                                    <img src={spell.thumbnailIcon} alt={spell.name} className="w-10 h-10 object-contain bg-gray-900 rounded border border-gray-600" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-sm">{spell.name}</div>
                                    <div className="text-xs text-gray-400 capitalize">{spell.templateType.replace('_', ' ')}</div>
                                    {spell.description && <div className="text-xs text-gray-400 mt-1">{spell.description}</div>}
                                  </div>
                                </div>

                                {/* Execution Mode */}
                                <div>
                                  <label className="text-xs text-gray-400">Execution Mode:</label>
                                  <select
                                    value={action.executionMode || 'sequential'}
                                    onChange={(e) => updateBehaviorAction(index, { ...action, executionMode: e.target.value as ExecutionMode })}
                                    className="w-full px-2 py-1 bg-gray-600 rounded text-sm text-white mt-1"
                                  >
                                    <option value="sequential">Sequential (waits its turn)</option>
                                    <option value="parallel">Parallel (runs independently)</option>
                                    <option value="parallel_with_previous">Parallel with Previous (runs with previous action)</option>
                                  </select>
                                </div>

                                {/* Trigger Config (for parallel mode) */}
                                {action.executionMode === 'parallel' && (
                                  <div className="bg-gray-800 p-2 rounded space-y-2">
                                    <div className="text-xs font-semibold text-gray-300">Parallel Trigger:</div>
                                    <div>
                                      <label className="text-xs text-gray-400">Mode:</label>
                                      <select
                                        value={action.trigger?.mode || 'interval'}
                                        onChange={(e) => {
                                          const newTrigger: TriggerConfig = {
                                            mode: e.target.value as any,
                                            ...(e.target.value === 'interval' ? { intervalMs: 600 } : { event: 'enemy_adjacent' })
                                          };
                                          updateBehaviorAction(index, { ...action, trigger: newTrigger });
                                        }}
                                        className="w-full px-2 py-1 bg-gray-600 rounded text-xs text-white mt-1"
                                      >
                                        <option value="interval">Interval (every X ms)</option>
                                        <option value="on_event">On Event</option>
                                      </select>
                                    </div>
                                    {action.trigger?.mode === 'interval' && (
                                      <div>
                                        <label className="text-xs text-gray-400">Interval (ms):</label>
                                        <input
                                          type="number"
                                          min="100"
                                          max="5000"
                                          step="100"
                                          value={action.trigger.intervalMs || 600}
                                          onChange={(e) => updateBehaviorAction(index, {
                                            ...action,
                                            trigger: { ...action.trigger!, intervalMs: parseInt(e.target.value) || 600 }
                                          })}
                                          className="w-full px-2 py-1 bg-gray-600 rounded text-xs text-white mt-1"
                                        />
                                      </div>
                                    )}
                                    {action.trigger?.mode === 'on_event' && (
                                      <>
                                        <div>
                                          <label className="text-xs text-gray-400">Event:</label>
                                          <select
                                            value={action.trigger.event || 'enemy_adjacent'}
                                            onChange={(e) => updateBehaviorAction(index, {
                                              ...action,
                                              trigger: { ...action.trigger!, event: e.target.value as any }
                                            })}
                                            className="w-full px-2 py-1 bg-gray-600 rounded text-xs text-white mt-1"
                                          >
                                            <option value="enemy_adjacent">Enemy Adjacent</option>
                                            <option value="enemy_in_range">Enemy in Range</option>
                                            <option value="contact_with_enemy">Contact with Enemy</option>
                                            <option value="wall_ahead">Wall Ahead</option>
                                            <option value="health_below_50">Health Below 50%</option>
                                          </select>
                                        </div>
                                        {action.trigger.event === 'enemy_in_range' && (
                                          <div>
                                            <label className="text-xs text-gray-400">Detection Range (tiles):</label>
                                            <input
                                              type="number"
                                              min="1"
                                              max="10"
                                              value={action.trigger.eventRange || 3}
                                              onChange={(e) => updateBehaviorAction(index, {
                                                ...action,
                                                trigger: { ...action.trigger!, eventRange: parseInt(e.target.value) || 3 }
                                              })}
                                              className="w-full px-2 py-1 bg-gray-600 rounded text-xs text-white mt-1"
                                            />
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                )}

                                {/* Direction Override */}
                                <div className="bg-gray-800 p-2 rounded space-y-2">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      id={`override-dir-${index}`}
                                      checked={(!!action.directionOverride && action.directionOverride.length > 0) || (!!action.relativeDirectionOverride && action.relativeDirectionOverride.length > 0)}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          updateBehaviorAction(index, { ...action, directionOverride: [Direction.NORTH], useRelativeOverride: false });
                                        } else {
                                          updateBehaviorAction(index, { ...action, directionOverride: undefined, relativeDirectionOverride: undefined, useRelativeOverride: false });
                                        }
                                      }}
                                      className="w-4 h-4"
                                    />
                                    <label htmlFor={`override-dir-${index}`} className="text-xs font-semibold text-gray-300 cursor-pointer">
                                      Override Spell Directions
                                    </label>
                                  </div>

                                  {((action.directionOverride && action.directionOverride.length > 0) || (action.relativeDirectionOverride && action.relativeDirectionOverride.length > 0)) && (
                                    <>
                                      {/* Mode Toggle */}
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => updateBehaviorAction(index, { ...action, useRelativeOverride: false, relativeDirectionOverride: undefined, directionOverride: action.directionOverride || [Direction.NORTH] })}
                                          className={`flex-1 px-2 py-1 rounded text-[10px] transition-colors ${
                                            !action.useRelativeOverride
                                              ? 'bg-blue-600 text-white'
                                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                          }`}
                                        >
                                          Absolute
                                        </button>
                                        <button
                                          onClick={() => updateBehaviorAction(index, { ...action, useRelativeOverride: true, directionOverride: undefined, relativeDirectionOverride: action.relativeDirectionOverride || ['forward' as RelativeDirection] })}
                                          className={`flex-1 px-2 py-1 rounded text-[10px] transition-colors ${
                                            action.useRelativeOverride
                                              ? 'bg-blue-600 text-white'
                                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                          }`}
                                        >
                                          Relative
                                        </button>
                                      </div>

                                      {/* Absolute Directions */}
                                      {!action.useRelativeOverride && (
                                        <div className="grid grid-cols-4 gap-1">
                                          {[
                                            { dir: Direction.NORTH, label: 'N', arrow: '↑' },
                                            { dir: Direction.NORTHEAST, label: 'NE', arrow: '↗' },
                                            { dir: Direction.EAST, label: 'E', arrow: '→' },
                                            { dir: Direction.SOUTHEAST, label: 'SE', arrow: '↘' },
                                            { dir: Direction.SOUTH, label: 'S', arrow: '↓' },
                                            { dir: Direction.SOUTHWEST, label: 'SW', arrow: '↙' },
                                            { dir: Direction.WEST, label: 'W', arrow: '←' },
                                            { dir: Direction.NORTHWEST, label: 'NW', arrow: '↖' },
                                          ].map(({ dir, label, arrow }) => {
                                            const isSelected = action.directionOverride?.includes(dir);
                                            return (
                                              <button
                                                key={dir}
                                                onClick={() => {
                                                  const current = action.directionOverride || [];
                                                  const newDirs = isSelected
                                                    ? current.filter(d => d !== dir)
                                                    : [...current, dir];
                                                  updateBehaviorAction(index, { ...action, directionOverride: newDirs.length > 0 ? newDirs : [Direction.NORTH] });
                                                }}
                                                className={`p-1 rounded border text-xs transition-colors ${
                                                  isSelected
                                                    ? 'border-green-500 bg-green-900'
                                                    : 'border-gray-600 bg-gray-700 hover:border-gray-500'
                                                }`}
                                              >
                                                <div className="text-sm">{arrow}</div>
                                                <div className="text-[10px]">{label}</div>
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}

                                      {/* Relative Directions */}
                                      {action.useRelativeOverride && (
                                        <div className="grid grid-cols-4 gap-1">
                                          {[
                                            { value: 'forward' as RelativeDirection, label: 'Fwd', arrow: '↑' },
                                            { value: 'forward_right' as RelativeDirection, label: 'F-R', arrow: '↗' },
                                            { value: 'right' as RelativeDirection, label: 'Right', arrow: '→' },
                                            { value: 'backward_right' as RelativeDirection, label: 'B-R', arrow: '↘' },
                                            { value: 'backward' as RelativeDirection, label: 'Back', arrow: '↓' },
                                            { value: 'backward_left' as RelativeDirection, label: 'B-L', arrow: '↙' },
                                            { value: 'left' as RelativeDirection, label: 'Left', arrow: '←' },
                                            { value: 'forward_left' as RelativeDirection, label: 'F-L', arrow: '↖' },
                                          ].map(({ value, label, arrow }) => {
                                            const isSelected = action.relativeDirectionOverride?.includes(value);
                                            return (
                                              <button
                                                key={value}
                                                onClick={() => {
                                                  const current = action.relativeDirectionOverride || [];
                                                  const newDirs = isSelected
                                                    ? current.filter(d => d !== value)
                                                    : [...current, value];
                                                  updateBehaviorAction(index, { ...action, relativeDirectionOverride: newDirs.length > 0 ? newDirs : ['forward' as RelativeDirection] });
                                                }}
                                                className={`p-1 rounded border text-xs transition-colors ${
                                                  isSelected
                                                    ? 'border-green-500 bg-green-900'
                                                    : 'border-gray-600 bg-gray-700 hover:border-gray-500'
                                                }`}
                                              >
                                                <div className="text-sm">{arrow}</div>
                                                <div className="text-[10px]">{label}</div>
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}

                                      <p className="text-[10px] text-gray-500">
                                        {action.useRelativeOverride
                                          ? `Relative override: ${action.relativeDirectionOverride?.length || 0} direction(s)`
                                          : `Absolute override: ${action.directionOverride?.length || 0} direction(s)`}
                                      </p>
                                    </>
                                  )}
                                </div>

                                {/* Auto-Targeting */}
                                <div className="bg-gray-800 p-2 rounded space-y-2">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      id={`auto-target-${index}`}
                                      checked={action.autoTargetNearestEnemy || false}
                                      onChange={(e) => updateBehaviorAction(index, {
                                        ...action,
                                        autoTargetNearestEnemy: e.target.checked,
                                        maxTargets: e.target.checked ? (action.maxTargets || 1) : undefined
                                      })}
                                      className="w-4 h-4"
                                    />
                                    <label htmlFor={`auto-target-${index}`} className="text-xs font-semibold text-gray-300 cursor-pointer">
                                      Auto-Target Nearest Enemy
                                    </label>
                                  </div>
                                  {action.autoTargetNearestEnemy && (
                                    <div>
                                      <label className="text-xs text-gray-400">Max Targets:</label>
                                      <input
                                        type="number"
                                        min="1"
                                        max="10"
                                        value={action.maxTargets || 1}
                                        onChange={(e) => updateBehaviorAction(index, {
                                          ...action,
                                          maxTargets: parseInt(e.target.value) || 1
                                        })}
                                        className="w-full px-2 py-1 bg-gray-600 rounded text-xs text-white mt-1"
                                      />
                                      <p className="text-[10px] text-gray-500 mt-1">
                                        Number of nearest enemies to attack (for multi-target)
                                      </p>
                                    </div>
                                  )}
                                </div>

                                {/* Change Spell Button */}
                                <button
                                  onClick={() => setShowSpellPicker(index)}
                                  className="w-full px-3 py-1.5 bg-blue-600 rounded text-xs hover:bg-blue-700"
                                >
                                  Change Spell
                                </button>
                              </div>
                            ) : (
                              <div>
                                <p className="text-xs text-gray-400 mb-2">No spell selected</p>
                                <button
                                  onClick={() => setShowSpellPicker(index)}
                                  className="px-3 py-1 bg-green-600 rounded text-xs hover:bg-green-700"
                                >
                                  Select Spell
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })()}
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

        {/* Spell Picker Modal */}
        {showSpellPicker !== null && editingCharacter && (
          <SpellPicker
            onSelect={(spell) => {
              // Update the action with the selected spell
              updateBehaviorAction(showSpellPicker, {
                ...editingCharacter.behavior[showSpellPicker],
                spellId: spell.id,
                executionMode: editingCharacter.behavior[showSpellPicker].executionMode || 'sequential',
              });
              setShowSpellPicker(null);
            }}
            onCancel={() => setShowSpellPicker(null)}
          />
        )}
        </div>
      </div>
    );
  };

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

      {/* Character Editor Modal */}
      {renderEditor()}
    </div>
  );
};
