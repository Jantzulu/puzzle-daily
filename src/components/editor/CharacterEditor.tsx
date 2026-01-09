import React, { useState } from 'react';
import { Direction, ActionType } from '../../types/game';
import type { CharacterAction, CustomAttack, SpellAsset, ExecutionMode, TriggerConfig, RelativeDirection } from '../../types/game';
import type { CustomCharacter, CustomSprite } from '../../utils/assetStorage';
import { saveCharacter, getCustomCharacters, deleteCharacter, loadSpellAsset, getFolders } from '../../utils/assetStorage';
import { getAllCharacters } from '../../data/characters';
import { SpriteEditor } from './SpriteEditor';
import { SpriteThumbnail } from './SpriteThumbnail';
import { AttackEditor } from './AttackEditor';
import { SpellPicker } from './SpellPicker';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';

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
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex gap-8">
          {/* Character List - Left Sidebar */}
          <div className="w-72 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">Characters</h2>
              <button
                onClick={handleNew}
                className="px-3 py-1 bg-green-600 rounded text-sm hover:bg-green-700"
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
              className="w-full px-3 py-2 bg-gray-700 rounded text-sm"
            />

            {/* Folder Filter */}
            <FolderDropdown
              category="characters"
              selectedFolderId={selectedFolderId}
              onFolderSelect={setSelectedFolderId}
            />

            <div className="space-y-2 max-h-[calc(100vh-350px)] overflow-y-auto">
              {filteredCharacters.length === 0 ? (
                <div className="bg-gray-800 p-4 rounded text-center text-gray-400 text-sm">
                  {searchTerm ? 'No characters match your search.' : 'No characters yet.'}
                  <br />
                  {!searchTerm && 'Click "+ New" to create one.'}
                </div>
              ) : (
                filteredCharacters.map(char => (
                  <div
                    key={char.id}
                    className={`p-3 rounded cursor-pointer transition-colors ${
                      selectedId === char.id
                        ? 'bg-blue-600'
                        : 'bg-gray-800 hover:bg-gray-700'
                    }`}
                    onClick={() => handleSelect(char.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-gray-600 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
                          <SpriteThumbnail sprite={char.customSprite} size={40} />
                        </div>
                        <div>
                          <h3 className="font-bold">{char.name}</h3>
                          <p className="text-xs text-gray-400">
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
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(char.id);
                          }}
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

          {/* Character Editor - Right Panel */}
          <div className="flex-1">
            {editing ? (
              <div className="space-y-6">
                {/* Header */}
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">
                    {isCreating ? 'Create New Character' : `Edit: ${editing.name}`}
                  </h2>
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-green-600 rounded hover:bg-green-700"
                  >
                    Save Character
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column - Stats */}
                  <div className="space-y-6">
                    {/* Basic Info */}
                    <div className="bg-gray-800 p-4 rounded space-y-3">
                      <h3 className="text-lg font-bold">Basic Info</h3>
                      <div>
                        <label className="block text-sm mb-1">Name</label>
                        <input
                          type="text"
                          value={editing.name}
                          onChange={(e) => updateCharacter({ name: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Description</label>
                        <textarea
                          value={editing.description}
                          onChange={(e) => updateCharacter({ description: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-700 rounded"
                          rows={2}
                        />
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Folder</label>
                        <select
                          value={editing.folderId || ''}
                          onChange={(e) => updateCharacter({ folderId: e.target.value || undefined })}
                          className="w-full px-3 py-2 bg-gray-700 rounded"
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
                            max="10"
                            value={editing.health}
                            onChange={(e) => updateCharacter({ health: parseInt(e.target.value) })}
                            className="w-full px-3 py-2 bg-gray-700 rounded"
                          />
                        </div>
                        <div>
                          <label className="block text-sm mb-1">Default Facing</label>
                          <select
                            value={editing.defaultFacing}
                            onChange={(e) => updateCharacter({ defaultFacing: e.target.value as Direction })}
                            className="w-full px-3 py-2 bg-gray-700 rounded"
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
                    <div className="bg-gray-800 p-4 rounded space-y-2">
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

                    {/* Behavior */}
                    <div className="bg-gray-800 p-4 rounded">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-lg font-bold">Behavior Sequence</h3>
                        <button
                          onClick={addBehaviorAction}
                          className="px-3 py-1 text-sm bg-blue-600 rounded hover:bg-blue-700"
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
                      <p className="text-xs text-gray-400 mt-2">
                        Tip: Add REPEAT at the end to loop the behavior
                      </p>
                    </div>
                  </div>

                  {/* Right Column - Sprite */}
                  <div className="bg-gray-800 p-4 rounded">
                    <h3 className="text-lg font-bold mb-4">Sprite</h3>
                    {editing.customSprite && (
                      <SpriteEditor
                        sprite={editing.customSprite}
                        onChange={updateSprite}
                      />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-800 p-8 rounded text-center">
                <h2 className="text-2xl font-bold mb-4">Character Editor</h2>
                <p className="text-gray-400 mb-6">
                  Create and customize characters with unique sprites and behaviors.
                  <br />
                  Select a character from the list or create a new one.
                </p>
                <button
                  onClick={handleNew}
                  className="px-6 py-3 bg-green-600 rounded text-lg hover:bg-green-700"
                >
                  + Create New Character
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
    <div className="bg-gray-700 p-3 rounded">
      <div className="flex gap-2 items-center mb-2">
        <div className="flex flex-col gap-1">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="px-1 py-0.5 text-xs bg-gray-600 rounded hover:bg-gray-500 disabled:opacity-30"
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === totalActions - 1}
            className="px-1 py-0.5 text-xs bg-gray-600 rounded hover:bg-gray-500 disabled:opacity-30"
          >
            ↓
          </button>
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
        <button
          onClick={onRemove}
          className="px-2 py-1 text-sm bg-red-600 rounded hover:bg-red-700"
        >
          ✕
        </button>
      </div>

      {/* Movement options */}
      {action.type.startsWith('move_') && (
        <div className="ml-8 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">Tiles:</label>
            <input
              type="number"
              min="1"
              max="5"
              value={action.tilesPerMove || 1}
              onChange={(e) => onUpdate({ ...action, tilesPerMove: parseInt(e.target.value) || 1 })}
              className="w-16 px-2 py-1 bg-gray-600 rounded text-sm"
            />
            <label className="text-xs text-gray-400">Wall:</label>
            <select
              value={action.onWallCollision || 'stop'}
              onChange={(e) => onUpdate({ ...action, onWallCollision: e.target.value as any })}
              className="flex-1 px-2 py-1 bg-gray-600 rounded text-xs"
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
              <label className="text-xs text-gray-400">Turn degrees:</label>
              <select
                value={action.turnDegrees || 90}
                onChange={(e) => onUpdate({ ...action, turnDegrees: parseInt(e.target.value) as 45 | 90 | 135 })}
                className="flex-1 px-2 py-1 bg-gray-600 rounded text-xs"
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
            <label className="text-xs text-gray-400">Turn degrees:</label>
            <select
              value={action.turnDegrees || 90}
              onChange={(e) => onUpdate({ ...action, turnDegrees: parseInt(e.target.value) as 45 | 90 | 135 })}
              className="flex-1 px-2 py-1 bg-gray-600 rounded text-xs"
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
            <div className="flex items-center gap-2 bg-gray-800 p-2 rounded">
              {spell.thumbnailIcon && (
                <img src={spell.thumbnailIcon} alt={spell.name} className="w-8 h-8 object-contain" />
              )}
              <div className="flex-1">
                <div className="text-sm font-semibold">{spell.name}</div>
                <div className="text-xs text-gray-400 capitalize">{spell.templateType.replace('_', ' ')}</div>
              </div>
              <button
                onClick={onSelectSpell}
                className="px-2 py-1 text-xs bg-blue-600 rounded hover:bg-blue-700"
              >
                Change
              </button>
            </div>
          ) : (
            <button
              onClick={onSelectSpell}
              className="px-3 py-1 bg-green-600 rounded text-xs hover:bg-green-700"
            >
              Select Spell
            </button>
          )}

          {spell && (
            <>
              <div>
                <label className="text-xs text-gray-400">Execution:</label>
                <select
                  value={action.executionMode || 'sequential'}
                  onChange={(e) => onUpdate({ ...action, executionMode: e.target.value as ExecutionMode })}
                  className="w-full px-2 py-1 bg-gray-600 rounded text-xs mt-1"
                >
                  <option value="sequential">Sequential</option>
                  <option value="parallel">Parallel</option>
                  <option value="parallel_with_previous">Parallel with Previous</option>
                </select>
              </div>

              {action.executionMode === 'parallel' && (
                <div className="bg-gray-800 p-2 rounded space-y-2">
                  <div className="text-xs font-semibold text-gray-300">Trigger:</div>
                  <select
                    value={action.trigger?.mode || 'interval'}
                    onChange={(e) => {
                      const newTrigger: TriggerConfig = {
                        mode: e.target.value as any,
                        ...(e.target.value === 'interval' ? { intervalMs: 600 } : { event: 'enemy_adjacent' })
                      };
                      onUpdate({ ...action, trigger: newTrigger });
                    }}
                    className="w-full px-2 py-1 bg-gray-600 rounded text-xs"
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
                      className="w-full px-2 py-1 bg-gray-600 rounded text-xs"
                      placeholder="Interval (ms)"
                    />
                  )}
                  {action.trigger?.mode === 'on_event' && (
                    <select
                      value={action.trigger.event || 'enemy_adjacent'}
                      onChange={(e) => onUpdate({
                        ...action,
                        trigger: { ...action.trigger!, event: e.target.value as any }
                      })}
                      className="w-full px-2 py-1 bg-gray-600 rounded text-xs"
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
                  )}
                </div>
              )}

              {/* Auto-targeting */}
              <div className="bg-gray-800 p-2 rounded space-y-1">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={action.autoTargetNearestEnemy || false}
                    onChange={(e) => onUpdate({
                      ...action,
                      autoTargetNearestEnemy: e.target.checked,
                      autoTargetNearestCharacter: false
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
                      autoTargetNearestEnemy: false
                    })}
                    className="w-3 h-3"
                  />
                  Auto-Target Character
                </label>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
