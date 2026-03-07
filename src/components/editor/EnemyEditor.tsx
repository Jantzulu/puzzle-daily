import React, { useState, useEffect } from 'react';
import { toast } from '../shared/Toast';
import { findAssetUsages, formatUsageWarning } from '../../utils/assetDependencies';
import { scaledNameClass } from '../../utils/textScale';
import { Direction } from '../../types/game';
import type { CharacterAction, EnemyBehavior, EntitySoundSet } from '../../types/game';
import type { CustomEnemy, CustomSprite } from '../../utils/assetStorage';
import { saveEnemy, getCustomEnemies, deleteEnemy, getFolders, getSoundAssets, getAllCollectibles } from '../../utils/assetStorage';
import { getAllEnemies } from '../../data/enemies';
import { SpriteEditor } from './SpriteEditor';
import { SpriteThumbnail } from './SpriteThumbnail';
import { SpellPicker } from './SpellPicker';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';
import { useBulkSelect, BulkActionBar, bulkDelete, bulkMoveToFolder, bulkExport } from './BulkActions';
import { RichTextEditor } from './RichTextEditor';
import { BehaviorSequenceBuilder } from './BehaviorSequenceBuilder';
import { VersionHistoryModal } from './VersionHistoryModal';
import { createVersionSnapshot } from '../../services/versionService';
import { AssetEditorLayout } from './AssetEditorLayout';
import { CollapsiblePanel } from './CollapsiblePanel';
import { useIsMobile } from '../../hooks/useMediaQuery';

export const EnemyEditor: React.FC<{ initialSelectedId?: string }> = ({ initialSelectedId }) => {
  const isMobile = useIsMobile();
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
  const [activeTab, setActiveTab] = useState<'details' | 'behavior' | 'sprite'>('details');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const bulk = useBulkSelect();

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

  useEffect(() => {
    if (initialSelectedId) handleSelect(initialSelectedId);
  }, [initialSelectedId]);

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
    setActiveTab('details');
  };

  const handleSave = () => {
    if (!editing) return;
    saveEnemy(editing);
    setEnemies(refreshEnemies());
    setSelectedId(editing.id);
    setIsCreating(false);
    toast.success(`Saved "${editing.name}"!`);
  };

  const handleDelete = (id: string) => {
    const usages = findAssetUsages('enemy', id);
    const warning = usages.length > 0 ? `\n\n${formatUsageWarning(usages)}` : '';
    if (!confirm(`Delete this enemy?${warning}`)) return;
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

  const updatePattern = (pattern: CharacterAction[]) => {
    if (!editing?.behavior) return;
    updateBehavior({ ...editing.behavior, pattern });
  };

  const handleBack = () => {
    setSelectedId(null);
    setEditing(null);
    setIsCreating(false);
  };

  return (
    <>
      <AssetEditorLayout
        isEditing={!!editing}
        onBack={handleBack}
        listTitle="Enemies"
        listPanel={
          <>
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

            <BulkActionBar
              count={bulk.count}
              totalCount={filteredEnemies.length}
              onSelectAll={() => bulk.selectAll(filteredEnemies.map(e => e.id))}
              onClear={bulk.clear}
              onDelete={() => {
                const nameMap = new Map(enemies.map(e => [e.id, e.name]));
                const deleted = bulkDelete([...bulk.selectedIds], 'enemy', deleteEnemy, nameMap);
                if (deleted.length) { setEnemies(refreshEnemies()); bulk.clear(); if (selectedId && deleted.includes(selectedId)) { setSelectedId(null); setEditing(null); } }
              }}
              onMoveToFolder={() => {
                bulkMoveToFolder([...bulk.selectedIds], 'enemies', (id: string) => enemies.find(e => e.id === id), saveEnemy);
                setEnemies(refreshEnemies()); bulk.clear();
              }}
              onExport={() => {
                const items = enemies.filter(e => bulk.selectedIds.has(e.id));
                bulkExport(items, 'enemies-export.json');
              }}
            />

            <div className="space-y-2 max-h-[calc(100vh-350px)] overflow-y-auto overflow-x-hidden">
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
                      bulk.isSelected(enemy.id) ? 'bg-blue-900/40 border border-blue-500' :
                      selectedId === enemy.id ? 'bg-arcane-700' : 'dungeon-panel hover:bg-stone-700'
                    }`}
                    onClick={() => handleSelect(enemy.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={bulk.isSelected(enemy.id)}
                          onChange={() => bulk.toggle(enemy.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="accent-blue-500 flex-shrink-0"
                        />
                        <div
                          className="bg-stone-600 rounded flex items-center justify-center overflow-hidden flex-shrink-0 transition-all duration-150"
                          style={{ width: selectedId === enemy.id ? 56 : 40, height: selectedId === enemy.id ? 56 : 40 }}
                        >
                          <SpriteThumbnail sprite={enemy.customSprite} size={selectedId === enemy.id ? 56 : 40} previewType="entity" />
                        </div>
                        <div className="min-w-0">
                          <h3 className={`font-bold ${scaledNameClass(enemy.name)}`}>{enemy.name}</h3>
                          <p className="text-xs text-stone-400">
                            {enemy.isBoss && <span className="text-blood-300 font-medium mr-1">BOSS</span>}
                            HP: {enemy.health} • {enemy.behavior?.type || 'static'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5 flex-shrink-0">
                        <InlineFolderPicker
                          category="enemies"
                          currentFolderId={enemy.folderId}
                          onFolderChange={(folderId) => handleFolderChange(enemy.id, folderId)}
                        />
                        <button
                          onClick={(e) => handleDuplicate(enemy, e)}
                          className="p-1 text-xs leading-none bg-stone-600 rounded hover:bg-stone-500"
                          title="Duplicate"
                        >
                          ⎘
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(enemy.id); }}
                          className="p-1 text-xs leading-none bg-blood-700 rounded hover:bg-blood-600"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        }
        detailPanel={
          editing ? (
            <>
              {/* Persistent Header */}
              <div className="dungeon-panel p-3 md:p-4 rounded">
                <div className="flex justify-between items-center gap-2">
                  <div className="flex items-center gap-2 md:gap-4 min-w-0">
                    <div className="flex w-10 h-10 md:w-16 md:h-16 bg-stone-700 rounded items-center justify-center overflow-hidden flex-shrink-0">
                      <SpriteThumbnail sprite={editing.customSprite} size={isMobile ? 40 : 64} previewType="entity" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg md:text-2xl font-bold font-medieval text-copper-400 truncate">
                          {editing.name || 'Unnamed Enemy'}
                        </h2>
                        {editing.isBoss && (
                          <span className="px-1.5 py-0.5 text-xs bg-blood-800 text-blood-200 rounded font-medium">BOSS</span>
                        )}
                      </div>
                      <p className="text-xs text-stone-400">HP: {editing.health} • {editing.behavior?.type || 'static'}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 md:gap-2 flex-shrink-0">
                    <button
                      onClick={async () => {
                        const result = await createVersionSnapshot(editing.id, 'enemy', editing.name, editing as unknown as object);
                        if (result.success) toast.success(`Saved version #${result.versionNumber}`);
                        else toast.error('Failed to save version');
                      }}
                      className="p-2 md:px-3 md:py-1.5 text-sm bg-copper-600/20 hover:bg-copper-600/30 text-copper-300 rounded border border-copper-500/30"
                      title="Save version snapshot"
                    >
                      📸
                    </button>
                    <button
                      onClick={() => setShowVersionHistory(true)}
                      className="p-2 md:px-3 md:py-1.5 text-sm bg-stone-700 hover:bg-stone-600 rounded"
                      title="Version history"
                    >
                      <span className="md:hidden">📜</span>
                      <span className="hidden md:inline">History</span>
                    </button>
                    <button onClick={handleSave} className="dungeon-btn-success text-sm">
                      <span className="md:hidden">💾</span>
                      <span className="hidden md:inline">Save Enemy</span>
                    </button>
                  </div>
                </div>
              </div>

              {showVersionHistory && editing && (
                <VersionHistoryModal
                  isOpen={showVersionHistory}
                  onClose={() => setShowVersionHistory(false)}
                  assetId={editing.id}
                  assetType="enemy"
                  assetName={editing.name}
                  currentData={editing as unknown as object}
                  onRestore={(data) => setEditing(data as unknown as CustomEnemy)}
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
                  <CollapsiblePanel title="Basic Info" className="space-y-3">
                    <div>
                      <label className="block text-sm mb-1">Name</label>
                      <input type="text" value={editing.name}
                        onChange={(e) => updateEnemy({ name: e.target.value })}
                        className="w-full px-3 py-2 bg-stone-700 rounded" />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">Title <span className="text-stone-400 font-normal">(optional)</span></label>
                      <input type="text" value={editing.title || ''}
                        onChange={(e) => updateEnemy({ title: e.target.value || undefined })}
                        placeholder="e.g., the Terrible"
                        className="w-full px-3 py-2 bg-stone-700 rounded" />
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

                    {/* Tooltip Steps (moved here, under description) */}
                    <div className="border-t border-stone-600 pt-3 mt-3">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-semibold">Tooltip Steps</label>
                        <button
                          onClick={() => {
                            const steps = editing.tooltipSteps || [];
                            updateEnemy({ tooltipSteps: [...steps, ''] });
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

                    <div>
                      <label className="block text-sm mb-1">Folder</label>
                      <select value={editing.folderId || ''}
                        onChange={(e) => updateEnemy({ folderId: e.target.value || undefined })}
                        className="w-full px-3 py-2 bg-stone-700 rounded">
                        <option value="">Uncategorized</option>
                        {getFolders('enemies').map(folder => (
                          <option key={folder.id} value={folder.id}>{folder.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm mb-1">Health</label>
                        <input type="number" min="1" max="99" value={editing.health}
                          onChange={(e) => updateEnemy({ health: parseInt(e.target.value) })}
                          className="w-full px-3 py-2 bg-stone-700 rounded" />
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Contact Damage</label>
                        <input type="number" min="0" max="99" value={editing.contactDamage ?? 0}
                          onChange={(e) => updateEnemy({ contactDamage: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 bg-stone-700 rounded" />
                      </div>
                    </div>
                  </CollapsiblePanel>

                  {/* Properties */}
                  <CollapsiblePanel title="Properties" className="space-y-2">
                    <label className="flex items-center gap-2 p-2 rounded bg-blood-900/30 border border-blood-700/50">
                      <input type="checkbox" checked={editing.isBoss || false}
                        onChange={(e) => updateEnemy({ isBoss: e.target.checked })} className="w-4 h-4" />
                      <span className="text-sm font-medium text-blood-300">Boss Enemy</span>
                    </label>
                    <p className="text-xs text-stone-400 mb-2 ml-1">Boss enemies enable the "Defeat the Boss" win condition.</p>
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
                  </CollapsiblePanel>

                  {/* Sound Effects */}
                  <CollapsiblePanel title="Sound Effects">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm mb-1">Death Sound</label>
                        <select value={editing.sounds?.death || ''}
                          onChange={(e) => updateEnemy({ sounds: { ...editing.sounds, death: e.target.value || undefined } })}
                          className="w-full px-3 py-2 bg-stone-700 rounded text-sm">
                          <option value="">None</option>
                          {getSoundAssets().map((sound) => (
                            <option key={sound.id} value={sound.id}>{sound.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Damage Taken Sound</label>
                        <select value={editing.sounds?.damageTaken || ''}
                          onChange={(e) => updateEnemy({ sounds: { ...editing.sounds, damageTaken: e.target.value || undefined } })}
                          className="w-full px-3 py-2 bg-stone-700 rounded text-sm">
                          <option value="">None</option>
                          {getSoundAssets().map((sound) => (
                            <option key={sound.id} value={sound.id}>{sound.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </CollapsiblePanel>

                  {/* Death Drop */}
                  <CollapsiblePanel title="Death Drop">
                    <p className="text-xs text-stone-400 mb-3">Select a collectible to drop when this enemy dies.</p>
                    <select value={editing.droppedCollectibleId || ''}
                      onChange={(e) => updateEnemy({ droppedCollectibleId: e.target.value || undefined })}
                      className="w-full px-3 py-2 bg-stone-700 rounded">
                      <option value="">None</option>
                      {getAllCollectibles().map((coll) => (
                        <option key={coll.id} value={coll.id}>{coll.name}</option>
                      ))}
                    </select>
                  </CollapsiblePanel>
                </div>
              )}

              {/* Behavior Tab */}
              {activeTab === 'behavior' && (
                <CollapsiblePanel title="Behavior" className="space-y-3">
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
                          <option value={Direction.NORTHEAST}>Northeast ↗</option>
                          <option value={Direction.EAST}>East →</option>
                          <option value={Direction.SOUTHEAST}>Southeast ↘</option>
                          <option value={Direction.SOUTH}>South ↓</option>
                          <option value={Direction.SOUTHWEST}>Southwest ↙</option>
                          <option value={Direction.WEST}>West ←</option>
                          <option value={Direction.NORTHWEST}>Northwest ↖</option>
                        </select>
                      </div>
                      <BehaviorSequenceBuilder
                        actions={editing.behavior?.pattern || []}
                        onChange={updatePattern}
                        onSelectSpell={(index) => setShowSpellPicker(index)}
                        context="enemy"
                      />
                    </>
                  )}
                </CollapsiblePanel>
              )}

              {/* Sprite Tab */}
              {activeTab === 'sprite' && (
                <CollapsiblePanel title="Sprite">
                  <div className="mb-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={editing.allowOversizedSprite || false}
                        onChange={(e) => updateEnemy({ allowOversizedSprite: e.target.checked })}
                        className="w-4 h-4" />
                      <span className="text-sm">Allow sprite to exceed tile size</span>
                    </label>
                    <p className="text-xs text-stone-400 mt-1 ml-6">Enable to allow sprites larger than 100% (for bosses, large creatures, etc.)</p>
                  </div>
                  {editing.customSprite && (
                    <SpriteEditor
                      sprite={editing.customSprite}
                      onChange={updateSprite}
                      allowOversized={editing.allowOversizedSprite}
                    />
                  )}
                </CollapsiblePanel>
              )}
            </>
          ) : null
        }
        emptyState={
          <div className="dungeon-panel p-8 rounded text-center">
            <h2 className="text-2xl font-bold font-medieval text-copper-400 mb-4">Enemy Editor</h2>
            <p className="text-stone-400 mb-6">
              Create and customize enemies with unique sprites and behaviors.
            </p>
            <button onClick={handleNew} className="dungeon-btn-success text-lg">
              + Create New Enemy
            </button>
          </div>
        }
      />

      {/* Spell Picker Modal */}
      {showSpellPicker !== null && editing?.behavior && (
        <SpellPicker
          onSelect={(spell) => {
            const pattern = [...(editing.behavior!.pattern || [])];
            pattern[showSpellPicker] = {
              ...pattern[showSpellPicker],
              spellId: spell.id,
              executionMode: pattern[showSpellPicker].executionMode || 'sequential',
            };
            updatePattern(pattern);
            setShowSpellPicker(null);
          }}
          onCancel={() => setShowSpellPicker(null)}
        />
      )}
    </>
  );
};

