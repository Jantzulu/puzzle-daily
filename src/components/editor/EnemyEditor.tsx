import React, { useState } from 'react';
import { Direction, ActionType } from '../../types/game';
import type { CharacterAction, EnemyBehavior, ExecutionMode, TriggerConfig } from '../../types/game';
import type { CustomEnemy, CustomSprite } from '../../utils/assetStorage';
import { saveEnemy, getCustomEnemies, deleteEnemy, loadSpellAsset, getFolders } from '../../utils/assetStorage';
import { getAllEnemies } from '../../data/enemies';
import { SpriteEditor } from './SpriteEditor';
import { SpriteThumbnail } from './SpriteThumbnail';
import { SpellPicker } from './SpellPicker';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';

const ACTION_TYPES = Object.values(ActionType).filter(
  type => !['attack_forward', 'attack_range', 'attack_aoe', 'custom_attack'].includes(type)
);

export const EnemyEditor: React.FC = () => {
  const refreshEnemies = () => getAllEnemies().map(e => ({
    ...e,
    isCustom: true,
    createdAt: e.createdAt || new Date().toISOString(),
    customSprite: e.customSprite
  } as CustomEnemy));

  const [enemies, setEnemies] = useState<CustomEnemy[]>(refreshEnemies);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomEnemy | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showSpellPicker, setShowSpellPicker] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Filter enemies based on folder and search term
  const folderFilteredEnemies = useFilteredAssets(enemies, selectedFolderId);
  const filteredEnemies = folderFilteredEnemies.filter(enemy =>
    enemy.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (id: string) => {
    const enemy = enemies.find(e => e.id === id);
    if (enemy) {
      setSelectedId(id);
      setEditing({ ...enemy, behavior: { ...enemy.behavior, pattern: [...(enemy.behavior?.pattern || [])] } });
      setIsCreating(false);
    }
  };

  const handleNew = () => {
    const newEnemy: CustomEnemy = {
      id: 'enemy_' + Date.now(),
      name: 'New Enemy',
      spriteId: 'custom_sprite_' + Date.now(),
      health: 1,
      attackDamage: 1,
      behavior: { type: 'static', defaultFacing: Direction.SOUTH, pattern: [] },
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
    setEditing(newEnemy);
    setSelectedId(null);
    setIsCreating(true);
  };

  const handleSave = () => {
    if (!editing) return;
    saveEnemy(editing);
    setEnemies(refreshEnemies());
    setSelectedId(editing.id);
    setIsCreating(false);
    alert(`Saved "${editing.name}"!`);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this enemy?')) return;
    deleteEnemy(id);
    setEnemies(refreshEnemies());
    if (selectedId === id) {
      setSelectedId(null);
      setEditing(null);
    }
  };

  const handleFolderChange = (enemyId: string, folderId: string | undefined) => {
    const enemy = enemies.find(e => e.id === enemyId);
    if (enemy) {
      saveEnemy({ ...enemy, folderId });
      setEnemies(refreshEnemies());
      if (editing && editing.id === enemyId) {
        setEditing({ ...editing, folderId });
      }
    }
  };

  const updateEnemy = (updates: Partial<CustomEnemy>) => {
    if (!editing) return;
    setEditing({ ...editing, ...updates });
  };

  const updateSprite = (sprite: CustomSprite) => {
    if (!editing) return;
    setEditing({ ...editing, customSprite: sprite });
  };

  const updateBehavior = (behavior: EnemyBehavior) => {
    if (!editing) return;
    setEditing({ ...editing, behavior });
  };

  const addAction = () => {
    if (!editing?.behavior) return;
    const newPattern = [...(editing.behavior.pattern || []), { type: ActionType.MOVE_FORWARD }];
    updateBehavior({ ...editing.behavior, pattern: newPattern });
  };

  const removeAction = (index: number) => {
    if (!editing?.behavior) return;
    const newPattern = editing.behavior.pattern?.filter((_, i) => i !== index) || [];
    updateBehavior({ ...editing.behavior, pattern: newPattern });
  };

  const updateAction = (index: number, action: CharacterAction) => {
    if (!editing?.behavior) return;
    const newPattern = [...(editing.behavior.pattern || [])];
    newPattern[index] = action;
    updateBehavior({ ...editing.behavior, pattern: newPattern });
  };

  const moveAction = (index: number, dir: 'up' | 'down') => {
    if (!editing?.behavior) return;
    const pattern = editing.behavior.pattern || [];
    if (dir === 'up' && index === 0) return;
    if (dir === 'down' && index === pattern.length - 1) return;
    const newPattern = [...pattern];
    const swapIdx = dir === 'up' ? index - 1 : index + 1;
    [newPattern[index], newPattern[swapIdx]] = [newPattern[swapIdx], newPattern[index]];
    updateBehavior({ ...editing.behavior, pattern: newPattern });
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex gap-8">
          {/* Enemy List - Left Sidebar */}
          <div className="w-72 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">Enemies</h2>
              <button onClick={handleNew} className="px-3 py-1 bg-green-600 rounded text-sm hover:bg-green-700">
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
              category="enemies"
              selectedFolderId={selectedFolderId}
              onFolderSelect={setSelectedFolderId}
            />

            <div className="space-y-2 max-h-[calc(100vh-350px)] overflow-y-auto">
              {filteredEnemies.length === 0 ? (
                <div className="bg-gray-800 p-4 rounded text-center text-gray-400 text-sm">
                  {searchTerm ? 'No enemies match your search.' : 'No enemies yet.'}
                  <br />{!searchTerm && 'Click "+ New" to create one.'}
                </div>
              ) : (
                filteredEnemies.map(enemy => (
                  <div
                    key={enemy.id}
                    className={`p-3 rounded cursor-pointer transition-colors ${
                      selectedId === enemy.id ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'
                    }`}
                    onClick={() => handleSelect(enemy.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-gray-600 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
                          <SpriteThumbnail sprite={enemy.customSprite} size={40} />
                        </div>
                        <div>
                          <h3 className="font-bold">{enemy.name}</h3>
                          <p className="text-xs text-gray-400">
                            HP: {enemy.health} • {enemy.behavior?.type || 'static'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <InlineFolderPicker
                          category="enemies"
                          currentFolderId={enemy.folderId}
                          onFolderChange={(folderId) => handleFolderChange(enemy.id, folderId)}
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(enemy.id); }}
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

          {/* Enemy Editor - Right Panel */}
          <div className="flex-1">
            {editing ? (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">
                    {isCreating ? 'Create New Enemy' : `Edit: ${editing.name}`}
                  </h2>
                  <button onClick={handleSave} className="px-4 py-2 bg-green-600 rounded hover:bg-green-700">
                    Save Enemy
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column */}
                  <div className="space-y-6">
                    {/* Basic Info */}
                    <div className="bg-gray-800 p-4 rounded space-y-3">
                      <h3 className="text-lg font-bold">Basic Info</h3>
                      <div>
                        <label className="block text-sm mb-1">Name</label>
                        <input
                          type="text"
                          value={editing.name}
                          onChange={(e) => updateEnemy({ name: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Folder</label>
                        <select
                          value={editing.folderId || ''}
                          onChange={(e) => updateEnemy({ folderId: e.target.value || undefined })}
                          className="w-full px-3 py-2 bg-gray-700 rounded"
                        >
                          <option value="">Uncategorized</option>
                          {getFolders('enemies').map(folder => (
                            <option key={folder.id} value={folder.id}>{folder.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Health</label>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={editing.health}
                          onChange={(e) => updateEnemy({ health: parseInt(e.target.value) })}
                          className="w-full px-3 py-2 bg-gray-700 rounded"
                        />
                      </div>
                    </div>

                    {/* Properties */}
                    <div className="bg-gray-800 p-4 rounded space-y-2">
                      <h3 className="text-lg font-bold mb-3">Properties</h3>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={editing.canOverlapEntities || false}
                          onChange={(e) => updateEnemy({ canOverlapEntities: e.target.checked })} className="w-4 h-4" />
                        <span className="text-sm">Can Overlap Entities (Ghost)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={editing.behavesLikeWall || false}
                          onChange={(e) => updateEnemy({ behavesLikeWall: e.target.checked })} className="w-4 h-4" />
                        <span className="text-sm">Behaves Like Wall (Alive)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={editing.behavesLikeWallDead || false}
                          onChange={(e) => updateEnemy({ behavesLikeWallDead: e.target.checked })} className="w-4 h-4" />
                        <span className="text-sm">Behaves Like Wall (Dead)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={editing.blocksMovement || false}
                          onChange={(e) => updateEnemy({ blocksMovement: e.target.checked })} className="w-4 h-4" />
                        <span className="text-sm">Blocks Movement (Alive)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={editing.blocksMovementDead || false}
                          onChange={(e) => updateEnemy({ blocksMovementDead: e.target.checked })} className="w-4 h-4" />
                        <span className="text-sm">Blocks Movement (Dead)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={editing.hasMeleePriority || false}
                          onChange={(e) => updateEnemy({ hasMeleePriority: e.target.checked })} className="w-4 h-4" />
                        <span className="text-sm">Has Melee Priority</span>
                      </label>
                    </div>

                    {/* Behavior */}
                    <div className="bg-gray-800 p-4 rounded space-y-3">
                      <h3 className="text-lg font-bold">Behavior</h3>
                      <div>
                        <label className="block text-sm mb-1">Type</label>
                        <select
                          value={editing.behavior?.type || 'static'}
                          onChange={(e) => updateBehavior({
                            ...editing.behavior!,
                            type: e.target.value as 'static' | 'active',
                            defaultFacing: editing.behavior?.defaultFacing || Direction.SOUTH,
                            pattern: editing.behavior?.pattern || []
                          })}
                          className="w-full px-3 py-2 bg-gray-700 rounded"
                        >
                          <option value="static">Static</option>
                          <option value="active">Active</option>
                        </select>
                      </div>

                      {editing.behavior?.type === 'active' && (
                        <>
                          <div>
                            <label className="block text-sm mb-1">Default Facing</label>
                            <select
                              value={editing.behavior?.defaultFacing || Direction.SOUTH}
                              onChange={(e) => updateBehavior({ ...editing.behavior!, defaultFacing: e.target.value as Direction })}
                              className="w-full px-3 py-2 bg-gray-700 rounded"
                            >
                              <option value={Direction.NORTH}>North ↑</option>
                              <option value={Direction.EAST}>East →</option>
                              <option value={Direction.SOUTH}>South ↓</option>
                              <option value={Direction.WEST}>West ←</option>
                            </select>
                          </div>

                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <label className="text-sm font-bold">Action Pattern</label>
                              <button onClick={addAction} className="px-3 py-1 text-sm bg-blue-600 rounded hover:bg-blue-700">
                                + Add
                              </button>
                            </div>
                            <div className="space-y-2 max-h-[32rem] overflow-y-auto">
                              {(editing.behavior?.pattern || []).map((action, index) => (
                                <EnemyActionRow
                                  key={index}
                                  action={action}
                                  index={index}
                                  totalActions={editing.behavior!.pattern!.length}
                                  onUpdate={(a) => updateAction(index, a)}
                                  onRemove={() => removeAction(index)}
                                  onMoveUp={() => moveAction(index, 'up')}
                                  onMoveDown={() => moveAction(index, 'down')}
                                  onSelectSpell={() => setShowSpellPicker(index)}
                                />
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right Column - Sprite */}
                  <div className="bg-gray-800 p-4 rounded">
                    <h3 className="text-lg font-bold mb-4">Sprite</h3>
                    {editing.customSprite && (
                      <SpriteEditor sprite={editing.customSprite} onChange={updateSprite} />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-800 p-8 rounded text-center">
                <h2 className="text-2xl font-bold mb-4">Enemy Editor</h2>
                <p className="text-gray-400 mb-6">
                  Create and customize enemies with unique sprites and behaviors.
                </p>
                <button onClick={handleNew} className="px-6 py-3 bg-green-600 rounded text-lg hover:bg-green-700">
                  + Create New Enemy
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Spell Picker Modal */}
      {showSpellPicker !== null && editing?.behavior && (
        <SpellPicker
          onSelect={(spell) => {
            const pattern = editing.behavior!.pattern || [];
            updateAction(showSpellPicker, {
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
  );
};

// Reusable action row component
interface EnemyActionRowProps {
  action: CharacterAction;
  index: number;
  totalActions: number;
  onUpdate: (action: CharacterAction) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSelectSpell: () => void;
}

const EnemyActionRow: React.FC<EnemyActionRowProps> = ({
  action, index, totalActions, onUpdate, onRemove, onMoveUp, onMoveDown, onSelectSpell
}) => {
  const spell = action.spellId ? loadSpellAsset(action.spellId) : null;

  return (
    <div className="bg-gray-700 p-3 rounded">
      <div className="flex gap-2 items-center mb-2">
        <div className="flex flex-col gap-1">
          <button onClick={onMoveUp} disabled={index === 0}
            className="px-1 py-0.5 text-xs bg-gray-600 rounded hover:bg-gray-500 disabled:opacity-30">↑</button>
          <button onClick={onMoveDown} disabled={index === totalActions - 1}
            className="px-1 py-0.5 text-xs bg-gray-600 rounded hover:bg-gray-500 disabled:opacity-30">↓</button>
        </div>
        <span className="text-sm text-gray-400 w-6">{index + 1}.</span>
        <select
          value={action.type}
          onChange={(e) => onUpdate({ ...action, type: e.target.value as ActionType })}
          className="flex-1 px-2 py-1 bg-gray-600 rounded text-sm"
        >
          {ACTION_TYPES.map(type => (
            <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <button onClick={onRemove} className="px-2 py-1 text-sm bg-red-600 rounded hover:bg-red-700">✕</button>
      </div>

      {action.type.startsWith('move_') && (
        <div className="ml-8 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">Tiles:</label>
            <input type="number" min="1" max="5" value={action.tilesPerMove || 1}
              onChange={(e) => onUpdate({ ...action, tilesPerMove: parseInt(e.target.value) || 1 })}
              className="w-16 px-2 py-1 bg-gray-600 rounded text-sm" />
            <label className="text-xs text-gray-400">Wall:</label>
            <select value={action.onWallCollision || 'stop'}
              onChange={(e) => onUpdate({ ...action, onWallCollision: e.target.value as any })}
              className="flex-1 px-2 py-1 bg-gray-600 rounded text-xs">
              <option value="stop">Stop</option>
              <option value="turn_left">Turn Left</option>
              <option value="turn_right">Turn Right</option>
              <option value="turn_around">Turn Around</option>
              <option value="continue">Continue</option>
            </select>
          </div>
        </div>
      )}

      {(action.type === ActionType.TURN_LEFT || action.type === ActionType.TURN_RIGHT) && (
        <div className="ml-8">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">Degrees:</label>
            <select value={action.turnDegrees || 90}
              onChange={(e) => onUpdate({ ...action, turnDegrees: parseInt(e.target.value) as 45 | 90 | 135 })}
              className="flex-1 px-2 py-1 bg-gray-600 rounded text-xs">
              <option value={45}>45°</option>
              <option value={90}>90°</option>
              <option value={135}>135°</option>
            </select>
          </div>
        </div>
      )}

      {action.type === ActionType.SPELL && (
        <div className="ml-8 space-y-2">
          {spell ? (
            <div className="flex items-center gap-2 bg-gray-800 p-2 rounded">
              {spell.thumbnailIcon && <img src={spell.thumbnailIcon} alt={spell.name} className="w-8 h-8 object-contain" />}
              <div className="flex-1">
                <div className="text-sm font-semibold">{spell.name}</div>
                <div className="text-xs text-gray-400 capitalize">{spell.templateType.replace('_', ' ')}</div>
              </div>
              <button onClick={onSelectSpell} className="px-2 py-1 text-xs bg-blue-600 rounded hover:bg-blue-700">Change</button>
            </div>
          ) : (
            <button onClick={onSelectSpell} className="px-3 py-1 bg-green-600 rounded text-xs hover:bg-green-700">Select Spell</button>
          )}

          {spell && (
            <>
              <div>
                <label className="text-xs text-gray-400">Execution:</label>
                <select value={action.executionMode || 'sequential'}
                  onChange={(e) => onUpdate({ ...action, executionMode: e.target.value as ExecutionMode })}
                  className="w-full px-2 py-1 bg-gray-600 rounded text-xs mt-1">
                  <option value="sequential">Sequential</option>
                  <option value="parallel">Parallel</option>
                  <option value="parallel_with_previous">Parallel with Previous</option>
                </select>
              </div>

              {action.executionMode === 'parallel' && (
                <div className="bg-gray-800 p-2 rounded space-y-2">
                  <div className="text-xs font-semibold text-gray-300">Trigger:</div>
                  <select value={action.trigger?.mode || 'interval'}
                    onChange={(e) => {
                      const newTrigger: TriggerConfig = {
                        mode: e.target.value as any,
                        ...(e.target.value === 'interval' ? { intervalMs: 600 } : { event: 'character_adjacent' })
                      };
                      onUpdate({ ...action, trigger: newTrigger });
                    }}
                    className="w-full px-2 py-1 bg-gray-600 rounded text-xs">
                    <option value="interval">Interval</option>
                    <option value="on_event">On Event</option>
                  </select>
                  {action.trigger?.mode === 'interval' && (
                    <input type="number" min="100" max="5000" step="100" value={action.trigger.intervalMs || 600}
                      onChange={(e) => onUpdate({ ...action, trigger: { ...action.trigger!, intervalMs: parseInt(e.target.value) || 600 } })}
                      className="w-full px-2 py-1 bg-gray-600 rounded text-xs" placeholder="ms" />
                  )}
                  {action.trigger?.mode === 'on_event' && (
                    <select value={action.trigger.event || 'character_adjacent'}
                      onChange={(e) => onUpdate({ ...action, trigger: { ...action.trigger!, event: e.target.value as any } })}
                      className="w-full px-2 py-1 bg-gray-600 rounded text-xs">
                      <option value="character_adjacent">Character Adjacent</option>
                      <option value="character_in_range">Character in Range</option>
                      <option value="wall_ahead">Wall Ahead</option>
                      <option value="health_below_50">Health Below 50%</option>
                    </select>
                  )}
                </div>
              )}

              <div className="bg-gray-800 p-2 rounded space-y-1">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={action.autoTargetNearestCharacter || false}
                    onChange={(e) => onUpdate({ ...action, autoTargetNearestCharacter: e.target.checked, autoTargetNearestEnemy: false })}
                    className="w-3 h-3" />
                  Auto-Target Character
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={action.autoTargetNearestEnemy || false}
                    onChange={(e) => onUpdate({ ...action, autoTargetNearestEnemy: e.target.checked, autoTargetNearestCharacter: false })}
                    className="w-3 h-3" />
                  Auto-Target Enemy
                </label>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
