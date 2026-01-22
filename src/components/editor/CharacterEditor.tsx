import React, { useState } from 'react';
import { Direction, ActionType } from '../../types/game';
import type { CharacterAction, CustomAttack, SpellAsset, ExecutionMode, TriggerConfig, RelativeDirection, EntitySoundSet } from '../../types/game';
import type { CustomCharacter, CustomSprite } from '../../utils/assetStorage';
import { saveCharacter, getCustomCharacters, deleteCharacter, loadSpellAsset, getFolders, getSoundAssets, getAllCollectibles } from '../../utils/assetStorage';
import { getAllCharacters } from '../../data/characters';
import { SpriteEditor } from './SpriteEditor';
import { SpriteThumbnail } from './SpriteThumbnail';
import { AttackEditor } from './AttackEditor';
import { SpellPicker } from './SpellPicker';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';
import { RichTextEditor } from './RichTextEditor';
import { DirectionCompass } from './DirectionCompass';

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomCharacter | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingAttack, setEditingAttack] = useState<{ attack: CustomAttack; actionIndex: number } | null>(null);
  const [showSpellPicker, setShowSpellPicker] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Filter characters based on folder and search term
  const folderFilteredCharacters = useFilteredAssets(characters, selectedFolderId);
  const filteredCharacters = folderFilteredCharacters.filter(char =>
    char.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    char.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const refreshCharacters = () => {
    setCharacters(getAllCharacters().map(ensureCustomSprite));
  };

  const handleSelect = (id: string) => {
    const char = characters.find(c => c.id === id);
    if (char) {
      setSelectedId(id);
      setEditing(ensureCustomSprite({ ...char, behavior: [...char.behavior] }));
      setIsCreating(false);
    }
  };

  const handleNew = () => {
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
    setEditing(newChar);
    setSelectedId(null);
    setIsCreating(true);
  };

  const handleSave = () => {
    if (!editing) return;
    saveCharacter(editing);
    refreshCharacters();
    setSelectedId(editing.id);
    setIsCreating(false);
    alert(`Saved "${editing.name}"!`);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this character?')) return;
    deleteCharacter(id);
    refreshCharacters();
    if (selectedId === id) {
      setSelectedId(null);
      setEditing(null);
    }
  };

  const handleFolderChange = (charId: string, folderId: string | undefined) => {
    const char = characters.find(c => c.id === charId);
    if (char) {
      saveCharacter({ ...char, folderId });
      refreshCharacters();
      // Also update editing state if this character is being edited
      if (editing && editing.id === charId) {
        setEditing({ ...editing, folderId });
      }
    }
  };

  const handleDuplicate = (char: CustomCharacter, e: React.MouseEvent) => {
    e.stopPropagation();
    const duplicated: CustomCharacter = {
      ...char,
      id: 'char_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      name: char.name + ' (Copy)',
      behavior: [...char.behavior],
      customSprite: char.customSprite ? { ...char.customSprite, id: 'sprite_' + Date.now() } : undefined,
      createdAt: new Date().toISOString(),
    };
    setEditing(duplicated);
    setSelectedId(null);
    setIsCreating(true);
  };

  const updateCharacter = (updates: Partial<CustomCharacter>) => {
    if (!editing) return;
    setEditing({ ...editing, ...updates });
  };

  const updateSprite = (sprite: CustomSprite) => {
    if (!editing) return;
    setEditing({ ...editing, customSprite: sprite });
  };

  const addBehaviorAction = () => {
    if (!editing) return;
    const newBehavior = [...editing.behavior];
    const repeatIndex = newBehavior.findIndex(a => a.type === ActionType.REPEAT);
    if (repeatIndex >= 0) {
      newBehavior.splice(repeatIndex, 0, { type: ActionType.MOVE_FORWARD });
    } else {
      newBehavior.push({ type: ActionType.MOVE_FORWARD });
    }
    setEditing({ ...editing, behavior: newBehavior });
  };

  const removeBehaviorAction = (index: number) => {
    if (!editing) return;
    const newBehavior = editing.behavior.filter((_, i) => i !== index);
    setEditing({ ...editing, behavior: newBehavior });
  };

  const updateBehaviorAction = (index: number, action: CharacterAction) => {
    if (!editing) return;
    const newBehavior = [...editing.behavior];
    newBehavior[index] = action;
    setEditing({ ...editing, behavior: newBehavior });
  };

  const moveActionUp = (index: number) => {
    if (!editing || index === 0) return;
    const newBehavior = [...editing.behavior];
    [newBehavior[index - 1], newBehavior[index]] = [newBehavior[index], newBehavior[index - 1]];
    setEditing({ ...editing, behavior: newBehavior });
  };

  const moveActionDown = (index: number) => {
    if (!editing || index === editing.behavior.length - 1) return;
    const newBehavior = [...editing.behavior];
    [newBehavior[index], newBehavior[index + 1]] = [newBehavior[index + 1], newBehavior[index]];
    setEditing({ ...editing, behavior: newBehavior });
  };

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">
          {/* Character List - Left Sidebar */}
          <div className="w-full md:w-72 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold font-medieval text-copper-400">Heroes</h2>
              <button
                onClick={handleNew}
                className="dungeon-btn-success text-sm"
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
              className="dungeon-input text-sm"
            />

            {/* Folder Filter */}
            <FolderDropdown
              category="characters"
              selectedFolderId={selectedFolderId}
              onFolderSelect={setSelectedFolderId}
            />

            <div className="space-y-2 max-h-[calc(100vh-350px)] overflow-y-auto dungeon-scrollbar">
              {filteredCharacters.length === 0 ? (
                <div className="dungeon-panel p-4 text-center text-stone-400 text-sm">
                  {searchTerm ? 'No heroes match your search.' : 'No heroes yet.'}
                  <br />
                  {!searchTerm && 'Click "+ New" to create one.'}
                </div>
              ) : (
                filteredCharacters.map(char => (
                  <div
                    key={char.id}
                    className={`p-3 rounded-pixel cursor-pointer transition-colors ${
                      selectedId === char.id
                        ? 'bg-copper-700/50 border border-copper-500'
                        : 'dungeon-panel hover:bg-stone-700'
                    }`}
                    onClick={() => handleSelect(char.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-stone-700 rounded-pixel flex items-center justify-center overflow-hidden flex-shrink-0">
                          <SpriteThumbnail sprite={char.customSprite} size={40} previewType="entity" />
                        </div>
                        <div>
                          <h3 className="font-bold text-parchment-200">{char.name}</h3>
                          <p className="text-xs text-stone-400">
                            HP: {char.health} • {char.behavior.length} actions
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <InlineFolderPicker
                          category="characters"
                          currentFolderId={char.folderId}
                          onFolderChange={(folderId) => handleFolderChange(char.id, folderId)}
                        />
                        <button
                          onClick={(e) => handleDuplicate(char, e)}
                          className="px-1.5 py-1 text-xs bg-stone-600 rounded-pixel hover:bg-stone-500"
                          title="Duplicate"
                        >
                          ⎘
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(char.id);
                          }}
                          className="px-2 py-1 text-xs bg-blood-700 rounded-pixel hover:bg-blood-600"
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

          {/* Character Editor - Right Panel */}
          <div className="flex-1">
            {editing ? (
              <div className="space-y-6">
                {/* Header */}
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold font-medieval text-copper-400">
                    {isCreating ? 'Create New Hero' : `Edit: ${editing.name}`}
                  </h2>
                  <button
                    onClick={handleSave}
                    className="dungeon-btn-success"
                  >
                    Save Hero
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column - Stats */}
                  <div className="space-y-6">
                    {/* Basic Info */}
                    <div className="dungeon-panel p-4 rounded space-y-3">
                      <h3 className="text-lg font-bold">Basic Info</h3>
                      <div>
                        <label className="block text-sm mb-1">Name</label>
                        <input
                          type="text"
                          value={editing.name}
                          onChange={(e) => updateCharacter({ name: e.target.value })}
                          className="w-full px-3 py-2 bg-stone-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Title <span className="text-stone-400 font-normal">(optional)</span></label>
                        <input
                          type="text"
                          value={editing.title || ''}
                          onChange={(e) => updateCharacter({ title: e.target.value || undefined })}
                          placeholder="e.g., the Brave"
                          className="w-full px-3 py-2 bg-stone-700 rounded"
                        />
                        <p className="text-xs text-stone-400 mt-1">Displayed after name in italics</p>
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Description</label>
                        <RichTextEditor
                          value={editing.description}
                          onChange={(value) => updateCharacter({ description: value })}
                          placeholder="Enter character description..."
                          multiline
                        />
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Folder</label>
                        <select
                          value={editing.folderId || ''}
                          onChange={(e) => updateCharacter({ folderId: e.target.value || undefined })}
                          className="w-full px-3 py-2 bg-stone-700 rounded"
                        >
                          <option value="">Uncategorized</option>
                          {getFolders('characters').map(folder => (
                            <option key={folder.id} value={folder.id}>{folder.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm mb-1">Health</label>
                          <input
                            type="number"
                            min="1"
                            max="99"
                            value={editing.health}
                            onChange={(e) => updateCharacter({ health: parseInt(e.target.value) })}
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
                            onChange={(e) => updateCharacter({ contactDamage: parseInt(e.target.value) || 0 })}
                            className="w-full px-3 py-2 bg-stone-700 rounded"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div>
                          <label className="block text-sm mb-1">Default Facing</label>
                          <select
                            value={editing.defaultFacing}
                            onChange={(e) => updateCharacter({ defaultFacing: e.target.value as Direction })}
                            className="w-full px-3 py-2 bg-stone-700 rounded"
                          >
                            <option value={Direction.NORTH}>North ↑</option>
                            <option value={Direction.NORTHEAST}>NE ↗</option>
                            <option value={Direction.EAST}>East →</option>
                            <option value={Direction.SOUTHEAST}>SE ↘</option>
                            <option value={Direction.SOUTH}>South ↓</option>
                            <option value={Direction.SOUTHWEST}>SW ↙</option>
                            <option value={Direction.WEST}>West ←</option>
                            <option value={Direction.NORTHWEST}>NW ↖</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Properties */}
                    <div className="dungeon-panel p-4 rounded space-y-2">
                      <h3 className="text-lg font-bold mb-3">Properties</h3>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editing.canOverlapEntities || false}
                          onChange={(e) => updateCharacter({ canOverlapEntities: e.target.checked })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">Can Overlap Entities (Ghost)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editing.behavesLikeWall || false}
                          onChange={(e) => updateCharacter({ behavesLikeWall: e.target.checked })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">Behaves Like Wall (Alive)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editing.behavesLikeWallDead || false}
                          onChange={(e) => updateCharacter({ behavesLikeWallDead: e.target.checked })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">Behaves Like Wall (Dead)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editing.blocksMovement || false}
                          onChange={(e) => updateCharacter({ blocksMovement: e.target.checked })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">Blocks Movement (Alive)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editing.blocksMovementDead || false}
                          onChange={(e) => updateCharacter({ blocksMovementDead: e.target.checked })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">Blocks Movement (Dead)</span>
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
                            onChange={(e) => updateCharacter({
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
                            onChange={(e) => updateCharacter({
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
                        Select a collectible to drop when this character dies.
                      </p>
                      <select
                        value={editing.droppedCollectibleId || ''}
                        onChange={(e) => updateCharacter({ droppedCollectibleId: e.target.value || undefined })}
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
                            updateCharacter({ tooltipSteps: [...steps, ''] });
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
                                  updateCharacter({ tooltipSteps: newSteps });
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
                                  updateCharacter({ tooltipSteps: newSteps });
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
                                  updateCharacter({ tooltipSteps: newSteps });
                                }}
                                placeholder="Enter tooltip step..."
                              />
                            </div>
                            <button
                              onClick={() => {
                                const newSteps = (editing.tooltipSteps || []).filter((_, i) => i !== index);
                                updateCharacter({ tooltipSteps: newSteps.length > 0 ? newSteps : undefined });
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
                    <div className="dungeon-panel p-4 rounded">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-lg font-bold">Behavior Sequence</h3>
                        <button
                          onClick={addBehaviorAction}
                          className="px-3 py-1 text-sm bg-arcane-700 rounded hover:bg-arcane-600"
                        >
                          + Add Action
                        </button>
                      </div>

                      <div className="space-y-2 max-h-[32rem] overflow-y-auto">
                        {editing.behavior.map((action, index) => (
                          <BehaviorActionRow
                            key={index}
                            action={action}
                            index={index}
                            totalActions={editing.behavior.length}
                            onUpdate={(a) => updateBehaviorAction(index, a)}
                            onRemove={() => removeBehaviorAction(index)}
                            onMoveUp={() => moveActionUp(index)}
                            onMoveDown={() => moveActionDown(index)}
                            onSelectSpell={() => setShowSpellPicker(index)}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-stone-400 mt-2">
                        Tip: Add REPEAT at the end to loop the behavior
                      </p>
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
                          onChange={(e) => updateCharacter({ allowOversizedSprite: e.target.checked })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">Allow sprite to exceed tile size</span>
                      </label>
                      <p className="text-xs text-stone-400 mt-1 ml-6">
                        Enable to allow sprites larger than 100%
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
                <h2 className="text-2xl font-bold font-medieval text-copper-400 mb-4">Hero Editor</h2>
                <p className="text-stone-400 mb-6">
                  Create and customize heroes with unique sprites and behaviors.
                  <br />
                  Select a hero from the list or create a new one.
                </p>
                <button
                  onClick={handleNew}
                  className="dungeon-btn-success text-lg"
                >
                  + Create New Hero
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Spell Picker Modal */}
      {showSpellPicker !== null && editing && (
        <SpellPicker
          onSelect={(spell) => {
            updateBehaviorAction(showSpellPicker, {
              ...editing.behavior[showSpellPicker],
              spellId: spell.id,
              executionMode: editing.behavior[showSpellPicker].executionMode || 'sequential',
            });
            setShowSpellPicker(null);
          }}
          onCancel={() => setShowSpellPicker(null)}
        />
      )}

      {/* Attack Editor Modal */}
      {editingAttack && editing && (
        <AttackEditor
          attack={editingAttack.attack}
          onSave={(updatedAttack) => {
            updateBehaviorAction(editingAttack.actionIndex, {
              ...editing.behavior[editingAttack.actionIndex],
              customAttack: updatedAttack
            });
            setEditingAttack(null);
          }}
          onCancel={() => setEditingAttack(null)}
        />
      )}
    </div>
  );
};

// Separate component for behavior action rows to keep code clean
interface BehaviorActionRowProps {
  action: CharacterAction;
  index: number;
  totalActions: number;
  onUpdate: (action: CharacterAction) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSelectSpell: () => void;
}

const BehaviorActionRow: React.FC<BehaviorActionRowProps> = ({
  action,
  index,
  totalActions,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  onSelectSpell,
}) => {
  const spell = action.spellId ? loadSpellAsset(action.spellId) : null;

  return (
    <div className="bg-stone-700 p-3 rounded">
      <div className="flex gap-2 items-center mb-2">
        <div className="flex flex-col gap-1">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="px-1 py-0.5 text-xs bg-stone-600 rounded hover:bg-stone-500 disabled:opacity-30"
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === totalActions - 1}
            className="px-1 py-0.5 text-xs bg-stone-600 rounded hover:bg-stone-500 disabled:opacity-30"
          >
            ↓
          </button>
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
        <button
          onClick={onRemove}
          className="px-2 py-1 text-sm bg-blood-700 rounded hover:bg-blood-600"
        >
          ✕
        </button>
      </div>

      {/* Movement options */}
      {action.type.startsWith('move_') && (
        <div className="ml-8 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-stone-400">Tiles:</label>
            <input
              type="number"
              min="1"
              max="5"
              value={action.tilesPerMove || 1}
              onChange={(e) => onUpdate({ ...action, tilesPerMove: parseInt(e.target.value) || 1 })}
              className="w-16 px-2 py-1 bg-stone-600 rounded text-sm"
            />
            <label className="text-xs text-stone-400">Wall:</label>
            <select
              value={action.onWallCollision || 'stop'}
              onChange={(e) => onUpdate({ ...action, onWallCollision: e.target.value as any })}
              className="flex-1 px-2 py-1 bg-stone-600 rounded text-xs"
            >
              <option value="stop">Stop</option>
              <option value="turn_left">Turn Left</option>
              <option value="turn_right">Turn Right</option>
              <option value="turn_around">Turn Around</option>
              <option value="continue">Continue</option>
            </select>
          </div>
          {(action.onWallCollision === 'turn_left' || action.onWallCollision === 'turn_right') && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-stone-400">Turn degrees:</label>
              <select
                value={action.turnDegrees || 90}
                onChange={(e) => onUpdate({ ...action, turnDegrees: parseInt(e.target.value) as 45 | 90 | 135 })}
                className="flex-1 px-2 py-1 bg-stone-600 rounded text-xs"
              >
                <option value={45}>45°</option>
                <option value={90}>90°</option>
                <option value={135}>135°</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Turn options */}
      {(action.type === ActionType.TURN_LEFT || action.type === ActionType.TURN_RIGHT) && (
        <div className="ml-8">
          <div className="flex items-center gap-2">
            <label className="text-xs text-stone-400">Turn degrees:</label>
            <select
              value={action.turnDegrees || 90}
              onChange={(e) => onUpdate({ ...action, turnDegrees: parseInt(e.target.value) as 45 | 90 | 135 })}
              className="flex-1 px-2 py-1 bg-stone-600 rounded text-xs"
            >
              <option value={45}>45°</option>
              <option value={90}>90°</option>
              <option value={135}>135°</option>
            </select>
          </div>
        </div>
      )}

      {/* Spell options */}
      {action.type === ActionType.SPELL && (
        <div className="ml-8 space-y-2">
          {spell ? (
            <div className="flex items-center gap-2 dungeon-panel p-2 rounded">
              {spell.thumbnailIcon && (
                <img src={spell.thumbnailIcon} alt={spell.name} className="w-8 h-8 object-contain" />
              )}
              <div className="flex-1">
                <div className="text-sm font-semibold">{spell.name}</div>
                <div className="text-xs text-stone-400 capitalize">{spell.templateType.replace('_', ' ')}</div>
              </div>
              <button
                onClick={onSelectSpell}
                className="px-2 py-1 text-xs bg-arcane-700 rounded hover:bg-arcane-600"
              >
                Change
              </button>
            </div>
          ) : (
            <button
              onClick={onSelectSpell}
              className="px-3 py-1 bg-moss-700 rounded text-xs hover:bg-moss-600"
            >
              Select Spell
            </button>
          )}

          {spell && (
            <>
              <div>
                <label className="text-xs text-stone-400">Execution:</label>
                <select
                  value={action.executionMode || 'sequential'}
                  onChange={(e) => onUpdate({ ...action, executionMode: e.target.value as ExecutionMode })}
                  className="w-full px-2 py-1 bg-stone-600 rounded text-xs mt-1"
                >
                  <option value="sequential">Sequential</option>
                  <option value="parallel">Parallel</option>
                  <option value="parallel_with_previous">Parallel with Previous</option>
                </select>
              </div>

              {action.executionMode === 'parallel' && (
                <div className="dungeon-panel p-2 rounded space-y-2">
                  <div className="text-xs font-semibold text-stone-300">Trigger:</div>
                  <select
                    value={action.trigger?.mode || 'interval'}
                    onChange={(e) => {
                      const newTrigger: TriggerConfig = {
                        mode: e.target.value as any,
                        ...(e.target.value === 'interval' ? { intervalMs: 600 } : { event: 'enemy_adjacent' })
                      };
                      onUpdate({ ...action, trigger: newTrigger });
                    }}
                    className="w-full px-2 py-1 bg-stone-600 rounded text-xs"
                  >
                    <option value="interval">Interval</option>
                    <option value="on_event">On Event</option>
                  </select>
                  {action.trigger?.mode === 'interval' && (
                    <input
                      type="number"
                      min="100"
                      max="5000"
                      step="100"
                      value={action.trigger.intervalMs || 600}
                      onChange={(e) => onUpdate({
                        ...action,
                        trigger: { ...action.trigger!, intervalMs: parseInt(e.target.value) || 600 }
                      })}
                      className="w-full px-2 py-1 bg-stone-600 rounded text-xs"
                      placeholder="Interval (ms)"
                    />
                  )}
                  {action.trigger?.mode === 'on_event' && (
                    <>
                      <select
                        value={action.trigger.event || 'enemy_adjacent'}
                        onChange={(e) => onUpdate({
                          ...action,
                          trigger: { ...action.trigger!, event: e.target.value as any }
                        })}
                        className="w-full px-2 py-1 bg-stone-600 rounded text-xs"
                      >
                        <option value="enemy_adjacent">Enemy Adjacent</option>
                        <option value="enemy_in_range">Enemy in Range</option>
                        <option value="contact_with_enemy">Overlap with Enemy</option>
                        <option value="character_adjacent">Character Adjacent</option>
                        <option value="character_in_range">Character in Range</option>
                        <option value="contact_with_character">Overlap with Character</option>
                        <option value="wall_ahead">Wall Ahead</option>
                        <option value="health_below_50">Health Below 50%</option>
                      </select>
                      {(action.trigger.event === 'enemy_in_range' || action.trigger.event === 'character_in_range') && (
                        <div className="flex items-center gap-2 mt-1">
                          <label className="text-xs text-stone-400">Range (tiles):</label>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={action.trigger.eventRange || 2}
                            onChange={(e) => onUpdate({
                              ...action,
                              trigger: { ...action.trigger!, eventRange: parseInt(e.target.value) || 2 }
                            })}
                            className="w-16 px-2 py-1 bg-stone-600 rounded text-xs"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Auto-targeting */}
              <div className="dungeon-panel p-2 rounded space-y-1">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={action.autoTargetNearestEnemy || false}
                    onChange={(e) => onUpdate({
                      ...action,
                      autoTargetNearestEnemy: e.target.checked,
                      autoTargetNearestCharacter: false,
                      homing: e.target.checked ? action.homing : false
                    })}
                    className="w-3 h-3"
                  />
                  Auto-Target Enemy
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={action.autoTargetNearestCharacter || false}
                    onChange={(e) => onUpdate({
                      ...action,
                      autoTargetNearestCharacter: e.target.checked,
                      autoTargetNearestEnemy: false,
                      homing: e.target.checked ? action.homing : false
                    })}
                    className="w-3 h-3"
                  />
                  Auto-Target Character
                </label>
                {/* Homing option - only available when auto-targeting is enabled */}
                {(action.autoTargetNearestEnemy || action.autoTargetNearestCharacter) && (
                  <>
                    <label className="flex items-center gap-2 text-xs ml-4 text-yellow-300">
                      <input
                        type="checkbox"
                        checked={action.homing || false}
                        onChange={(e) => onUpdate({
                          ...action,
                          homing: e.target.checked
                        })}
                        className="w-3 h-3"
                      />
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
