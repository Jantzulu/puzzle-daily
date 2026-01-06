import React, { useState } from 'react';
import { Direction, ActionType } from '../../types/game';
import type { CharacterAction, EnemyBehavior, SpellAsset, ExecutionMode, TriggerConfig, RelativeDirection } from '../../types/game';
import type { CustomEnemy, CustomSprite } from '../../utils/assetStorage';
import { saveEnemy, getCustomEnemies, deleteEnemy, loadSpellAsset } from '../../utils/assetStorage';
import { getAllEnemies } from '../../data/enemies';
import { SpriteEditor } from './SpriteEditor';
import { SpriteThumbnail } from './SpriteThumbnail';
import { SpellPicker } from './SpellPicker';

// Filter out legacy attack actions - use SPELL instead
const ACTION_TYPES = Object.values(ActionType).filter(
  type => !['attack_forward', 'attack_range', 'attack_aoe', 'custom_attack'].includes(type)
);

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
  const [showSpellPicker, setShowSpellPicker] = useState<number | null>(null); // Index of action being edited

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

  const moveActionUp = (index: number) => {
    if (!editingEnemy || !editingEnemy.behavior || index === 0) return;
    const newPattern = [...(editingEnemy.behavior.pattern || [])];
    [newPattern[index - 1], newPattern[index]] = [newPattern[index], newPattern[index - 1]];
    updateBehavior({ ...editingEnemy.behavior, pattern: newPattern });
  };

  const moveActionDown = (index: number) => {
    if (!editingEnemy || !editingEnemy.behavior) return;
    const pattern = editingEnemy.behavior.pattern || [];
    if (index === pattern.length - 1) return;
    const newPattern = [...pattern];
    [newPattern[index], newPattern[index + 1]] = [newPattern[index + 1], newPattern[index]];
    updateBehavior({ ...editingEnemy.behavior, pattern: newPattern });
  };

  // Enemy Editor Modal
  const renderEditor = () => {
    if (!showEditor || !editingEnemy) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-6 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Enemy Editor</h2>

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
            {/* Left column - Stats and Behavior */}
            <div className="space-y-4">
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
                  <label className="block text-sm font-bold mb-1">Retaliation Damage (Optional)</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={editingEnemy.retaliationDamage !== undefined ? editingEnemy.retaliationDamage : editingEnemy.attackDamage}
                    onChange={(e) => updateEnemy({ retaliationDamage: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                  />
                  <p className="text-xs text-gray-400 mt-1">Counterattack damage (defaults to Attack Damage if not set)</p>
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editingEnemy.blocksMovementAlive || false}
                      onChange={(e) => updateEnemy({
                        blocksMovementAlive: e.target.checked,
                        behavesLikeWall: e.target.checked ? false : editingEnemy.behavesLikeWall // Mutually exclusive
                      })}
                      className="w-4 h-4"
                      disabled={editingEnemy.behavesLikeWall}
                    />
                    <span className="text-sm font-bold">Blocks Movement (Alive)</span>
                  </label>
                  <p className="text-xs text-gray-400 mt-1">Characters stop when colliding (no turn behavior)</p>
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editingEnemy.behavesLikeWall || false}
                      onChange={(e) => updateEnemy({
                        behavesLikeWall: e.target.checked,
                        blocksMovementAlive: e.target.checked ? false : editingEnemy.blocksMovementAlive // Mutually exclusive
                      })}
                      className="w-4 h-4"
                      disabled={editingEnemy.blocksMovementAlive}
                    />
                    <span className="text-sm font-bold">Behaves Like Wall (Alive)</span>
                  </label>
                  <p className="text-xs text-gray-400 mt-1">Triggers wall collision behaviors (turn_left, turn_right, etc.)</p>
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editingEnemy.blocksMovementDead || false}
                      onChange={(e) => updateEnemy({
                        blocksMovementDead: e.target.checked,
                        behavesLikeWallDead: e.target.checked ? false : editingEnemy.behavesLikeWallDead // Mutually exclusive
                      })}
                      className="w-4 h-4"
                      disabled={editingEnemy.behavesLikeWallDead}
                    />
                    <span className="text-sm font-bold">Blocks Movement (Dead)</span>
                  </label>
                  <p className="text-xs text-gray-400 mt-1">Corpse stops movement (no turn behavior)</p>
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editingEnemy.behavesLikeWallDead || false}
                      onChange={(e) => updateEnemy({
                        behavesLikeWallDead: e.target.checked,
                        blocksMovementDead: e.target.checked ? false : editingEnemy.blocksMovementDead // Mutually exclusive
                      })}
                      className="w-4 h-4"
                      disabled={editingEnemy.blocksMovementDead}
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
                        checked={editingEnemy.useAttackDamage || false}
                        onChange={(e) => updateEnemy({
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
                        checked={editingEnemy.useRetaliationDamage || false}
                        onChange={(e) => updateEnemy({
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

              {/* Behavior Editor (moved to left column) */}
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
                                  disabled={index === editingEnemy.behavior!.pattern!.length - 1}
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
                                      onChange={(e) => updateBehaviorAction(index, { ...action, turnDegrees: parseInt(e.target.value) as 45 | 90 | 135 })}
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

        {/* Spell Picker Modal */}
        {showSpellPicker !== null && editingEnemy && editingEnemy.behavior && (
          <SpellPicker
            onSelect={(spell) => {
              // Update the action with the selected spell
              const pattern = editingEnemy.behavior!.pattern || [];
              updateBehaviorAction(showSpellPicker, {
                ...pattern[showSpellPicker],
                spellId: spell.id,
                executionMode: pattern[showSpellPicker].executionMode || 'sequential',
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

      {/* Enemy Editor Modal */}
      {renderEditor()}
    </div>
  );
};
