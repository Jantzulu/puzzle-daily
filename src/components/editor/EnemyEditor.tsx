import React, { useState } from 'react';
import { Direction, ActionType } from '../../types/game';
import type { CharacterAction, EnemyBehavior, ExecutionMode, TriggerConfig, EntitySoundSet, RelativeDirection } from '../../types/game';
import type { CustomEnemy, CustomSprite } from '../../utils/assetStorage';
import { saveEnemy, getCustomEnemies, deleteEnemy, loadSpellAsset, getFolders, getSoundAssets, getAllCollectibles } from '../../utils/assetStorage';
import { getAllEnemies } from '../../data/enemies';
import { SpriteEditor } from './SpriteEditor';
import { SpriteThumbnail } from './SpriteThumbnail';
import { SpellPicker } from './SpellPicker';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';
import { RichTextEditor } from './RichTextEditor';
import { DirectionCompass } from './DirectionCompass';

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

  const handleDuplicate = (enemy: CustomEnemy, e: React.MouseEvent) => {
    e.stopPropagation();
    const duplicated: CustomEnemy = {
      ...enemy,
      id: 'enemy_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      name: enemy.name + ' (Copy)',
      behavior: enemy.behavior ? { ...enemy.behavior, pattern: [...(enemy.behavior.pattern || [])] } : undefined,
      customSprite: enemy.customSprite ? { ...enemy.customSprite, id: 'sprite_' + Date.now() } : undefined,
      createdAt: new Date().toISOString(),
    };
    setEditing(duplicated);
    setSelectedId(null);
    setIsCreating(true);
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
    <div className="p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">
          {/* Enemy List - Left Sidebar */}
          <div className="w-full md:w-72 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold font-medieval text-copper-400">Enemies</h2>
              <button onClick={handleNew} className="dungeon-btn-success text-sm">
                + New
              </button>
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="dungeon-input text-sm"
            />

            {/* Folder Filter */}
            <FolderDropdown
              category="enemies"
              selectedFolderId={selectedFolderId}
              onFolderSelect={setSelectedFolderId}
            />

            <div className="space-y-2 max-h-[calc(100vh-350px)] overflow-y-auto">
              {filteredEnemies.length === 0 ? (
                <div className="dungeon-panel p-4 rounded text-center text-stone-400 text-sm">
                  {searchTerm ? 'No enemies match your search.' : 'No enemies yet.'}
                  <br />{!searchTerm && 'Click "+ New" to create one.'}
                </div>
              ) : (
                filteredEnemies.map(enemy => (
                  <div
                    key={enemy.id}
                    className={`p-3 rounded cursor-pointer transition-colors ${
                      selectedId === enemy.id ? 'bg-arcane-700' : 'dungeon-panel hover:bg-stone-700'
                    }`}
                    onClick={() => handleSelect(enemy.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-stone-600 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
                          <SpriteThumbnail sprite={enemy.customSprite} size={40} previewType="entity" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold">{enemy.name}</h3>
                            {enemy.isBoss && (
                              <span className="px-1.5 py-0.5 text-xs bg-blood-800 text-blood-200 rounded font-medium">
                                BOSS
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-stone-400">
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
                          onClick={(e) => handleDuplicate(enemy, e)}
                          className="px-1.5 py-1 text-xs bg-stone-600 rounded hover:bg-stone-500"
                          title="Duplicate"
                        >
                          ⎘
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(enemy.id); }}
                          className="px-2 py-1 text-xs bg-blood-700 rounded hover:bg-blood-600"
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
                  <h2 className="text-2xl font-bold font-medieval text-copper-400">
                    {isCreating ? 'Create New Enemy' : `Edit: ${editing.name}`}
                  </h2>
                  <button onClick={handleSave} className="dungeon-btn-success">
                    Save Enemy
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column */}
                  <div className="space-y-6">
                    {/* Basic Info */}
                    <div className="dungeon-panel p-4 rounded space-y-3">
                      <h3 className="text-lg font-bold">Basic Info</h3>
                      <div>
                        <label className="block text-sm mb-1">Name</label>
                        <input
                          type="text"
                          value={editing.name}
                          onChange={(e) => updateEnemy({ name: e.target.value })}
                          className="w-full px-3 py-2 bg-stone-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Title <span className="text-stone-400 font-normal">(optional)</span></label>
                        <input
                          type="text"
                          value={editing.title || ''}
                          onChange={(e) => updateEnemy({ title: e.target.value || undefined })}
                          placeholder="e.g., the Terrible"
                          className="w-full px-3 py-2 bg-stone-700 rounded"
                        />
                        <p className="text-xs text-stone-400 mt-1">Displayed after name in italics</p>
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Description</label>
                        <RichTextEditor
                          value={editing.description || ''}
                          onChange={(value) => updateEnemy({ description: value || undefined })}
                          placeholder="Enter enemy description..."
                          multiline
                        />
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Folder</label>
                        <select
                          value={editing.folderId || ''}
                          onChange={(e) => updateEnemy({ folderId: e.target.value || undefined })}
                          className="w-full px-3 py-2 bg-stone-700 rounded"
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
                          max="99"
                          value={editing.health}
                          onChange={(e) => updateEnemy({ health: parseInt(e.target.value) })}
                          className="w-full px-3 py-2 bg-stone-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Contact Damage</label>
                        <input
                          type="number"
                          min="0"
                          max="99"
                          value={editing.contactDamage ?? 0}
                          onChange={(e) => updateEnemy({ contactDamage: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 bg-stone-700 rounded"
                        />
                      </div>
                    </div>

                    {/* Properties */}
                    <div className="dungeon-panel p-4 rounded space-y-2">
                      <h3 className="text-lg font-bold mb-3">Properties</h3>
                      <label className="flex items-center gap-2 p-2 rounded bg-blood-900/30 border border-blood-700/50">
                        <input type="checkbox" checked={editing.isBoss || false}
                          onChange={(e) => updateEnemy({ isBoss: e.target.checked })} className="w-4 h-4" />
                        <span className="text-sm font-medium text-blood-300">Boss Enemy</span>
                      </label>
                      <p className="text-xs text-stone-400 mb-2 ml-1">
                        Boss enemies enable the "Defeat the Boss" win condition.
                      </p>
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
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={editing.immuneToPush || false}
                          onChange={(e) => updateEnemy({ immuneToPush: e.target.checked })} className="w-4 h-4" />
                        <span className="text-sm">Immune to Push</span>
                      </label>
                    </div>

                    {/* Sound Effects */}
                    <div className="dungeon-panel p-4 rounded">
                      <h3 className="text-lg font-bold mb-3">Sound Effects</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm mb-1">Death Sound</label>
                          <select
                            value={editing.sounds?.death || ''}
                            onChange={(e) => updateEnemy({
                              sounds: {
                                ...editing.sounds,
                                death: e.target.value || undefined,
                              }
                            })}
                            className="w-full px-3 py-2 bg-stone-700 rounded text-sm"
                          >
                            <option value="">None</option>
                            {getSoundAssets().map((sound) => (
                              <option key={sound.id} value={sound.id}>
                                {sound.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm mb-1">Damage Taken Sound</label>
                          <select
                            value={editing.sounds?.damageTaken || ''}
                            onChange={(e) => updateEnemy({
                              sounds: {
                                ...editing.sounds,
                                damageTaken: e.target.value || undefined,
                              }
                            })}
                            className="w-full px-3 py-2 bg-stone-700 rounded text-sm"
                          >
                            <option value="">None</option>
                            {getSoundAssets().map((sound) => (
                              <option key={sound.id} value={sound.id}>
                                {sound.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Death Drop */}
                    <div className="dungeon-panel p-4 rounded">
                      <h3 className="text-lg font-bold mb-3">Death Drop</h3>
                      <p className="text-xs text-stone-400 mb-3">
                        Select a collectible to drop when this enemy dies.
                      </p>
                      <select
                        value={editing.droppedCollectibleId || ''}
                        onChange={(e) => updateEnemy({ droppedCollectibleId: e.target.value || undefined })}
                        className="w-full px-3 py-2 bg-stone-700 rounded"
                      >
                        <option value="">None</option>
                        {getAllCollectibles().map((coll) => (
                          <option key={coll.id} value={coll.id}>
                            {coll.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Tooltip Steps */}
                    <div className="dungeon-panel p-4 rounded">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-lg font-bold">Tooltip Steps</h3>
                        <button
                          onClick={() => {
                            const steps = editing.tooltipSteps || [];
                            updateEnemy({ tooltipSteps: [...steps, ''] });
                          }}
                          className="px-3 py-1 text-sm bg-arcane-700 rounded hover:bg-arcane-600"
                        >
                          + Add Step
                        </button>
                      </div>
                      <p className="text-xs text-stone-400 mb-3">
                        Custom tooltip displayed on play/playtest pages. Each step appears as a bullet point.
                      </p>
                      <div className="space-y-2">
                        {(editing.tooltipSteps || []).map((step, index) => (
                          <div key={index} className="flex gap-2 items-center">
                            <div className="flex flex-col gap-0.5">
                              <button
                                onClick={() => {
                                  if (index === 0) return;
                                  const newSteps = [...(editing.tooltipSteps || [])];
                                  [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]];
                                  updateEnemy({ tooltipSteps: newSteps });
                                }}
                                disabled={index === 0}
                                className="px-1 py-0.5 text-xs bg-stone-600 rounded hover:bg-stone-500 disabled:opacity-30"
                              >
                                ↑
                              </button>
                              <button
                                onClick={() => {
                                  const steps = editing.tooltipSteps || [];
                                  if (index === steps.length - 1) return;
                                  const newSteps = [...steps];
                                  [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]];
                                  updateEnemy({ tooltipSteps: newSteps });
                                }}
                                disabled={index === (editing.tooltipSteps?.length || 0) - 1}
                                className="px-1 py-0.5 text-xs bg-stone-600 rounded hover:bg-stone-500 disabled:opacity-30"
                              >
                                ↓
                              </button>
                            </div>
                            <span className="text-stone-400 text-sm">•</span>
                            <div className="flex-1">
                              <RichTextEditor
                                value={step}
                                onChange={(value) => {
                                  const newSteps = [...(editing.tooltipSteps || [])];
                                  newSteps[index] = value;
                                  updateEnemy({ tooltipSteps: newSteps });
                                }}
                                placeholder="Enter tooltip step..."
                              />
                            </div>
                            <button
                              onClick={() => {
                                const newSteps = (editing.tooltipSteps || []).filter((_, i) => i !== index);
                                updateEnemy({ tooltipSteps: newSteps.length > 0 ? newSteps : undefined });
                              }}
                              className="px-2 py-1 text-sm bg-blood-700 rounded hover:bg-blood-600"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        {(!editing.tooltipSteps || editing.tooltipSteps.length === 0) && (
                          <div className="text-stone-500 text-sm italic">
                            No tooltip steps. Click "+ Add Step" to create one.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Behavior */}
                    <div className="dungeon-panel p-4 rounded space-y-3">
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
                          className="w-full px-3 py-2 bg-stone-700 rounded"
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
                              className="w-full px-3 py-2 bg-stone-700 rounded"
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
                              <button onClick={addAction} className="px-3 py-1 text-sm bg-arcane-700 rounded hover:bg-arcane-600">
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
                  <div className="dungeon-panel p-4 rounded">
                    <h3 className="text-lg font-bold mb-4">Sprite</h3>
                    {/* Allow oversized sprites checkbox */}
                    <div className="mb-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editing.allowOversizedSprite || false}
                          onChange={(e) => updateEnemy({ allowOversizedSprite: e.target.checked })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">Allow sprite to exceed tile size</span>
                      </label>
                      <p className="text-xs text-stone-400 mt-1 ml-6">
                        Enable to allow sprites larger than 100% (for bosses, large creatures, etc.)
                      </p>
                    </div>
                    {editing.customSprite && (
                      <SpriteEditor
                        sprite={editing.customSprite}
                        onChange={updateSprite}
                        allowOversized={editing.allowOversizedSprite}
                      />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="dungeon-panel p-8 text-center">
                <h2 className="text-2xl font-bold font-medieval text-copper-400 mb-4">Enemy Editor</h2>
                <p className="text-stone-400 mb-6">
                  Create and customize enemies with unique sprites and behaviors.
                </p>
                <button onClick={handleNew} className="dungeon-btn-success text-lg">
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
    <div className="bg-stone-700 p-3 rounded">
      <div className="flex gap-2 items-center mb-2">
        <div className="flex flex-col gap-1">
          <button onClick={onMoveUp} disabled={index === 0}
            className="px-1 py-0.5 text-xs bg-stone-600 rounded hover:bg-stone-500 disabled:opacity-30">↑</button>
          <button onClick={onMoveDown} disabled={index === totalActions - 1}
            className="px-1 py-0.5 text-xs bg-stone-600 rounded hover:bg-stone-500 disabled:opacity-30">↓</button>
        </div>
        <span className="text-sm text-stone-400 w-6">{index + 1}.</span>
        <select
          value={action.type}
          onChange={(e) => onUpdate({ ...action, type: e.target.value as ActionType })}
          className="flex-1 px-2 py-1 bg-stone-600 rounded text-sm"
        >
          {ACTION_TYPES.map(type => (
            <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <button onClick={onRemove} className="px-2 py-1 text-sm bg-blood-700 rounded hover:bg-blood-600">✕</button>
      </div>

      {action.type.startsWith('move_') && (
        <div className="ml-8 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-stone-400">Tiles:</label>
            <input type="number" min="1" max="5" value={action.tilesPerMove || 1}
              onChange={(e) => onUpdate({ ...action, tilesPerMove: parseInt(e.target.value) || 1 })}
              className="w-16 px-2 py-1 bg-stone-600 rounded text-sm" />
            <label className="text-xs text-stone-400">Wall:</label>
            <select value={action.onWallCollision || 'stop'}
              onChange={(e) => onUpdate({ ...action, onWallCollision: e.target.value as any })}
              className="flex-1 px-2 py-1 bg-stone-600 rounded text-xs">
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
            <label className="text-xs text-stone-400">Degrees:</label>
            <select value={action.turnDegrees || 90}
              onChange={(e) => onUpdate({ ...action, turnDegrees: parseInt(e.target.value) as 45 | 90 | 135 })}
              className="flex-1 px-2 py-1 bg-stone-600 rounded text-xs">
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
            <div className="flex items-center gap-2 dungeon-panel p-2 rounded">
              {spell.thumbnailIcon && <img src={spell.thumbnailIcon} alt={spell.name} className="w-8 h-8 object-contain" />}
              <div className="flex-1">
                <div className="text-sm font-semibold">{spell.name}</div>
                <div className="text-xs text-stone-400 capitalize">{spell.templateType.replace('_', ' ')}</div>
              </div>
              <button onClick={onSelectSpell} className="px-2 py-1 text-xs bg-arcane-700 rounded hover:bg-arcane-600">Change</button>
            </div>
          ) : (
            <button onClick={onSelectSpell} className="px-3 py-1 bg-moss-700 rounded text-xs hover:bg-moss-600">Select Spell</button>
          )}

          {spell && (
            <>
              <div>
                <label className="text-xs text-stone-400">Execution:</label>
                <select value={action.executionMode || 'sequential'}
                  onChange={(e) => onUpdate({ ...action, executionMode: e.target.value as ExecutionMode })}
                  className="w-full px-2 py-1 bg-stone-600 rounded text-xs mt-1">
                  <option value="sequential">Sequential</option>
                  <option value="parallel">Parallel</option>
                  <option value="parallel_with_previous">Parallel with Previous</option>
                </select>
              </div>

              {action.executionMode === 'parallel' && (
                <div className="dungeon-panel p-2 rounded space-y-2">
                  <div className="text-xs font-semibold text-stone-300">Trigger:</div>
                  <select value={action.trigger?.mode || 'interval'}
                    onChange={(e) => {
                      const newTrigger: TriggerConfig = {
                        mode: e.target.value as any,
                        ...(e.target.value === 'interval' ? { intervalMs: 600 } : { event: 'character_adjacent' })
                      };
                      onUpdate({ ...action, trigger: newTrigger });
                    }}
                    className="w-full px-2 py-1 bg-stone-600 rounded text-xs">
                    <option value="interval">Interval</option>
                    <option value="on_event">On Event</option>
                  </select>
                  {action.trigger?.mode === 'interval' && (
                    <input type="number" min="100" max="5000" step="100" value={action.trigger.intervalMs || 600}
                      onChange={(e) => onUpdate({ ...action, trigger: { ...action.trigger!, intervalMs: parseInt(e.target.value) || 600 } })}
                      className="w-full px-2 py-1 bg-stone-600 rounded text-xs" placeholder="ms" />
                  )}
                  {action.trigger?.mode === 'on_event' && (
                    <>
                      <select value={action.trigger.event || 'character_adjacent'}
                        onChange={(e) => onUpdate({ ...action, trigger: { ...action.trigger!, event: e.target.value as any } })}
                        className="w-full px-2 py-1 bg-stone-600 rounded text-xs">
                        <option value="character_adjacent">Character Adjacent</option>
                        <option value="character_in_range">Character in Range</option>
                        <option value="enemy_in_range">Enemy in Range</option>
                        <option value="wall_ahead">Wall Ahead</option>
                        <option value="health_below_50">Health Below 50%</option>
                      </select>
                      {(action.trigger.event === 'character_in_range' || action.trigger.event === 'enemy_in_range') && (
                        <div className="flex items-center gap-2 mt-1">
                          <label className="text-xs text-stone-400">Range (tiles):</label>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={action.trigger.eventRange || 2}
                            onChange={(e) => onUpdate({ ...action, trigger: { ...action.trigger!, eventRange: parseInt(e.target.value) || 2 } })}
                            className="w-16 px-2 py-1 bg-stone-600 rounded text-xs"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="dungeon-panel p-2 rounded space-y-1">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={action.autoTargetNearestCharacter || false}
                    onChange={(e) => onUpdate({
                      ...action,
                      autoTargetNearestCharacter: e.target.checked,
                      autoTargetNearestEnemy: false,
                      homing: e.target.checked ? action.homing : false
                    })}
                    className="w-3 h-3" />
                  Auto-Target Character
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={action.autoTargetNearestEnemy || false}
                    onChange={(e) => onUpdate({
                      ...action,
                      autoTargetNearestEnemy: e.target.checked,
                      autoTargetNearestCharacter: false,
                      homing: e.target.checked ? action.homing : false
                    })}
                    className="w-3 h-3" />
                  Auto-Target Enemy
                </label>
                {/* Homing option - only available when auto-targeting is enabled */}
                {(action.autoTargetNearestCharacter || action.autoTargetNearestEnemy) && (
                  <>
                    <label className="flex items-center gap-2 text-xs ml-4 text-yellow-300">
                      <input type="checkbox" checked={action.homing || false}
                        onChange={(e) => onUpdate({ ...action, homing: e.target.checked })}
                        className="w-3 h-3" />
                      Homing (guaranteed hit)
                    </label>
                    <label className="flex items-center gap-2 text-xs ml-4">
                      Max Targets:
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={action.maxTargets || 1}
                        onChange={(e) => onUpdate({
                          ...action,
                          maxTargets: parseInt(e.target.value) || 1
                        })}
                        className="w-12 px-1 py-0.5 bg-stone-700 border border-stone-600 rounded text-xs"
                      />
                    </label>
                  </>
                )}
              </div>

              {/* Self-targeting options */}
              <div className="dungeon-panel p-2 rounded space-y-1">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={action.targetSelf || false}
                    onChange={(e) => onUpdate({
                      ...action,
                      targetSelf: e.target.checked,
                      targetSelfOnly: e.target.checked ? false : action.targetSelfOnly
                    })}
                    className="w-3 h-3"
                    disabled={action.targetSelfOnly}
                  />
                  Also Target Self
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={action.targetSelfOnly || false}
                    onChange={(e) => onUpdate({
                      ...action,
                      targetSelfOnly: e.target.checked,
                      targetSelf: e.target.checked ? false : action.targetSelf
                    })}
                    className="w-3 h-3"
                  />
                  Target Self Only
                </label>
                {(action.targetSelf || action.targetSelfOnly) && (
                  <p className="text-xs text-stone-400 ml-5">
                    {action.targetSelfOnly
                      ? 'Spell only affects the caster'
                      : 'Spell affects caster in addition to targets'}
                  </p>
                )}
              </div>

              {/* Direction Override - only show when not auto-targeting */}
              {!action.autoTargetNearestEnemy && !action.autoTargetNearestCharacter && (
                <div className="dungeon-panel p-2 rounded space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={action.useRelativeOverride !== undefined || action.directionOverride !== undefined || action.relativeDirectionOverride !== undefined}
                        onChange={(e) => {
                          if (e.target.checked) {
                            onUpdate({
                              ...action,
                              useRelativeOverride: true,
                              relativeDirectionOverride: ['forward'],
                              directionOverride: undefined
                            });
                          } else {
                            onUpdate({
                              ...action,
                              useRelativeOverride: undefined,
                              relativeDirectionOverride: undefined,
                              directionOverride: undefined
                            });
                          }
                        }}
                        className="w-3 h-3"
                      />
                      Override Direction
                    </label>
                  </div>

                  {(action.useRelativeOverride !== undefined || action.directionOverride !== undefined || action.relativeDirectionOverride !== undefined) && (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <label className="text-xs text-stone-400">Mode:</label>
                        <select
                          value={action.useRelativeOverride ? 'relative' : 'absolute'}
                          onChange={(e) => {
                            const isRelative = e.target.value === 'relative';
                            onUpdate({
                              ...action,
                              useRelativeOverride: isRelative,
                              relativeDirectionOverride: isRelative ? ['forward'] : undefined,
                              directionOverride: isRelative ? undefined : [Direction.NORTH]
                            });
                          }}
                          className="flex-1 px-2 py-1 bg-stone-600 rounded text-xs"
                        >
                          <option value="relative">Relative (to facing)</option>
                          <option value="absolute">Absolute (fixed)</option>
                        </select>
                      </div>

                      <DirectionCompass
                        mode={action.useRelativeOverride ? 'relative' : 'absolute'}
                        selectedDirections={
                          action.useRelativeOverride
                            ? (action.relativeDirectionOverride || ['forward'])
                            : (action.directionOverride || [Direction.NORTH])
                        }
                        onChange={(dirs) => {
                          if (action.useRelativeOverride) {
                            onUpdate({
                              ...action,
                              relativeDirectionOverride: dirs as RelativeDirection[]
                            });
                          } else {
                            onUpdate({
                              ...action,
                              directionOverride: dirs as Direction[]
                            });
                          }
                        }}
                      />
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
