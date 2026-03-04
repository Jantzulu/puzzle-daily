import React, { useState, useEffect } from 'react';
import { toast } from '../shared/Toast';
import { findAssetUsages, formatUsageWarning } from '../../utils/assetDependencies';
import { Direction, ActionType } from '../../types/game';
import type { CharacterAction, CustomAttack, EntitySoundSet } from '../../types/game';
import type { CustomCharacter, CustomSprite } from '../../utils/assetStorage';
import { saveCharacter, getCustomCharacters, deleteCharacter, getFolders, getSoundAssets, getAllCollectibles } from '../../utils/assetStorage';
import { getAllCharacters } from '../../data/characters';
import { SpriteEditor } from './SpriteEditor';
import { SpriteThumbnail } from './SpriteThumbnail';
import { AttackEditor } from './AttackEditor';
import { SpellPicker } from './SpellPicker';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';
import { useBulkSelect, BulkActionBar, bulkDelete, bulkMoveToFolder, bulkExport } from './BulkActions';
import { RichTextEditor } from './RichTextEditor';
import { BehaviorSequenceBuilder } from './BehaviorSequenceBuilder';
import { VersionHistoryModal } from './VersionHistoryModal';
import { createVersionSnapshot } from '../../services/versionService';

export const CharacterEditor: React.FC<{ initialSelectedId?: string }> = ({ initialSelectedId }) => {
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
  const [activeTab, setActiveTab] = useState<'details' | 'behavior' | 'sprite'>('details');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const bulk = useBulkSelect();

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

  useEffect(() => {
    if (initialSelectedId) handleSelect(initialSelectedId);
  }, [initialSelectedId]);

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
    setActiveTab('details');
  };

  const handleSave = () => {
    if (!editing) return;
    saveCharacter(editing);
    refreshCharacters();
    setSelectedId(editing.id);
    setIsCreating(false);
    toast.success(`Saved "${editing.name}"!`);
  };

  const handleDelete = (id: string) => {
    const usages = findAssetUsages('character', id);
    const warning = usages.length > 0 ? `\n\n${formatUsageWarning(usages)}` : '';
    if (!confirm(`Delete this character?${warning}`)) return;
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

  const updateBehaviorActions = (behavior: CharacterAction[]) => {
    if (!editing) return;
    setEditing({ ...editing, behavior });
  };

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">
          {/* Character List - Left Sidebar */}
          <div className="w-full md:w-72 space-y-4 overflow-hidden">
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

            <BulkActionBar
              count={bulk.count}
              totalCount={filteredCharacters.length}
              onSelectAll={() => bulk.selectAll(filteredCharacters.map(c => c.id))}
              onClear={bulk.clear}
              onDelete={() => {
                const nameMap = new Map(characters.map(c => [c.id, c.name]));
                const deleted = bulkDelete([...bulk.selectedIds], 'character', deleteCharacter, nameMap);
                if (deleted.length) { refreshCharacters(); bulk.clear(); if (selectedId && deleted.includes(selectedId)) { setSelectedId(null); setEditing(null); } }
              }}
              onMoveToFolder={() => {
                bulkMoveToFolder([...bulk.selectedIds], 'characters', (id: string) => characters.find(c => c.id === id), saveCharacter);
                refreshCharacters(); bulk.clear();
              }}
              onExport={() => {
                const items = characters.filter(c => bulk.selectedIds.has(c.id));
                bulkExport(items, 'characters-export.json');
              }}
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
                      bulk.isSelected(char.id) ? 'bg-blue-900/40 border border-blue-500' :
                      selectedId === char.id
                        ? 'bg-copper-700/50 border border-copper-500'
                        : 'dungeon-panel hover:bg-stone-700'
                    }`}
                    onClick={() => handleSelect(char.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={bulk.isSelected(char.id)}
                          onChange={() => bulk.toggle(char.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="accent-blue-500 flex-shrink-0"
                        />
                        <div
                          className="bg-stone-700 rounded-pixel flex items-center justify-center overflow-hidden flex-shrink-0 transition-all duration-150"
                          style={{ width: selectedId === char.id ? 56 : 40, height: selectedId === char.id ? 56 : 40 }}
                        >
                          <SpriteThumbnail sprite={char.customSprite} size={selectedId === char.id ? 56 : 40} previewType="entity" />
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
              <div className="space-y-4">
                {/* Persistent Header */}
                <div className="dungeon-panel p-4 rounded">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-stone-700 rounded-pixel flex items-center justify-center overflow-hidden flex-shrink-0">
                        <SpriteThumbnail sprite={editing.customSprite} size={64} previewType="entity" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold font-medieval text-copper-400">
                          {editing.name || 'Unnamed Hero'}
                        </h2>
                        <p className="text-xs text-stone-400">HP: {editing.health} • {editing.behavior.length} actions</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          const result = await createVersionSnapshot(editing.id, 'character', editing.name, editing as unknown as object);
                          if (result.success) toast.success(`Saved version #${result.versionNumber}`);
                          else toast.error('Failed to save version');
                        }}
                        className="px-3 py-1.5 text-sm bg-copper-600/20 hover:bg-copper-600/30 text-copper-300 rounded border border-copper-500/30"
                        title="Save version snapshot"
                      >
                        📸
                      </button>
                      <button
                        onClick={() => setShowVersionHistory(true)}
                        className="px-3 py-1.5 text-sm bg-stone-700 hover:bg-stone-600 rounded"
                        title="Version history"
                      >
                        History
                      </button>
                      <button onClick={handleSave} className="dungeon-btn-success">
                        Save Hero
                      </button>
                    </div>
                  </div>
                </div>

                {showVersionHistory && editing && (
                  <VersionHistoryModal
                    isOpen={showVersionHistory}
                    onClose={() => setShowVersionHistory(false)}
                    assetId={editing.id}
                    assetType="character"
                    assetName={editing.name}
                    currentData={editing as unknown as object}
                    onRestore={(data) => setEditing(data as unknown as CustomCharacter)}
                  />
                )}

                {/* Tab Bar */}
                <div className="flex gap-1">
                  {(['details', 'behavior', 'sprite'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`dungeon-tab ${activeTab === tab ? 'dungeon-tab-active' : ''}`}
                    >
                      {tab === 'details' ? '📋 Details' : tab === 'behavior' ? '⚔️ Behavior' : '🎨 Sprite'}
                    </button>
                  ))}
                </div>

                {/* Details Tab */}
                {activeTab === 'details' && (
                  <div className="space-y-6">
                    {/* Basic Info */}
                    <div className="dungeon-panel p-4 rounded space-y-3">
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

                      {/* Tooltip Steps (moved here, under description) */}
                      <div className="border-t border-stone-600 pt-3 mt-3">
                        <div className="flex justify-between items-center mb-2">
                          <label className="text-sm font-semibold">Tooltip Steps</label>
                          <button
                            onClick={() => {
                              const steps = editing.tooltipSteps || [];
                              updateCharacter({ tooltipSteps: [...steps, ''] });
                            }}
                            className="px-2 py-0.5 text-xs bg-arcane-700 rounded hover:bg-arcane-600"
                          >
                            + Add Step
                          </button>
                        </div>
                        <p className="text-xs text-stone-400 mb-2">
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
                        <input type="checkbox" checked={editing.canOverlapEntities || false}
                          onChange={(e) => updateCharacter({ canOverlapEntities: e.target.checked })} className="w-4 h-4" />
                        <span className="text-sm">Can Overlap Entities (Ghost)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={editing.behavesLikeWall || false}
                          onChange={(e) => updateCharacter({ behavesLikeWall: e.target.checked })} className="w-4 h-4" />
                        <span className="text-sm">Behaves Like Wall (Alive)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={editing.behavesLikeWallDead || false}
                          onChange={(e) => updateCharacter({ behavesLikeWallDead: e.target.checked })} className="w-4 h-4" />
                        <span className="text-sm">Behaves Like Wall (Dead)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={editing.blocksMovement || false}
                          onChange={(e) => updateCharacter({ blocksMovement: e.target.checked })} className="w-4 h-4" />
                        <span className="text-sm">Blocks Movement (Alive)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={editing.blocksMovementDead || false}
                          onChange={(e) => updateCharacter({ blocksMovementDead: e.target.checked })} className="w-4 h-4" />
                        <span className="text-sm">Blocks Movement (Dead)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={editing.immuneToPush || false}
                          onChange={(e) => updateCharacter({ immuneToPush: e.target.checked })} className="w-4 h-4" />
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
                            onChange={(e) => updateCharacter({ sounds: { ...editing.sounds, death: e.target.value || undefined } })}
                            className="w-full px-3 py-2 bg-stone-700 rounded text-sm"
                          >
                            <option value="">None</option>
                            {getSoundAssets().map((sound) => (
                              <option key={sound.id} value={sound.id}>{sound.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm mb-1">Damage Taken Sound</label>
                          <select
                            value={editing.sounds?.damageTaken || ''}
                            onChange={(e) => updateCharacter({ sounds: { ...editing.sounds, damageTaken: e.target.value || undefined } })}
                            className="w-full px-3 py-2 bg-stone-700 rounded text-sm"
                          >
                            <option value="">None</option>
                            {getSoundAssets().map((sound) => (
                              <option key={sound.id} value={sound.id}>{sound.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Death Drop */}
                    <div className="dungeon-panel p-4 rounded">
                      <h3 className="text-lg font-bold mb-3">Death Drop</h3>
                      <p className="text-xs text-stone-400 mb-3">Select a collectible to drop when this character dies.</p>
                      <select
                        value={editing.droppedCollectibleId || ''}
                        onChange={(e) => updateCharacter({ droppedCollectibleId: e.target.value || undefined })}
                        className="w-full px-3 py-2 bg-stone-700 rounded"
                      >
                        <option value="">None</option>
                        {getAllCollectibles().map((coll) => (
                          <option key={coll.id} value={coll.id}>{coll.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Behavior Tab */}
                {activeTab === 'behavior' && (
                  <div className="dungeon-panel p-4 rounded">
                    <BehaviorSequenceBuilder
                      actions={editing.behavior}
                      onChange={updateBehaviorActions}
                      onSelectSpell={(index) => setShowSpellPicker(index)}
                      context="character"
                    />
                  </div>
                )}

                {/* Sprite Tab */}
                {activeTab === 'sprite' && (
                  <div className="dungeon-panel p-4 rounded">
                    <h3 className="text-lg font-bold mb-4">Sprite</h3>
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
                      <p className="text-xs text-stone-400 mt-1 ml-6">Enable to allow sprites larger than 100%</p>
                    </div>
                    {editing.customSprite && (
                      <SpriteEditor
                        sprite={editing.customSprite}
                        onChange={updateSprite}
                        allowOversized={editing.allowOversizedSprite}
                      />
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="dungeon-panel p-8 rounded text-center">
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
            const newBehavior = [...editing.behavior];
            newBehavior[showSpellPicker] = {
              ...newBehavior[showSpellPicker],
              spellId: spell.id,
              executionMode: newBehavior[showSpellPicker].executionMode || 'sequential',
            };
            updateBehaviorActions(newBehavior);
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
            const newBehavior = [...editing.behavior];
            newBehavior[editingAttack.actionIndex] = {
              ...newBehavior[editingAttack.actionIndex],
              customAttack: updatedAttack
            };
            updateBehaviorActions(newBehavior);
            setEditingAttack(null);
          }}
          onCancel={() => setEditingAttack(null)}
        />
      )}
    </div>
  );
};

