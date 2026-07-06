import React, { useState, useEffect } from 'react';
import { toast } from '../shared/Toast';
import { findAssetUsages, formatUsageWarning } from '../../utils/assetDependencies';
import { scaledNameClass } from '../../utils/textScale';
import { Direction } from '../../types/game';
import type { CharacterAction, EnemyBehavior } from '../../types/game';
import type { CustomEnemy, CustomSprite } from '../../utils/assetStorage';
import { saveEnemy, deleteEnemy, getFolders, getSoundAssets, getAllCollectibles, loadStatusEffectAsset } from '../../utils/assetStorage';
import { getAllEnemies } from '../../data/enemies';
import { SpriteEditor } from './SpriteEditor';
import { SpriteThumbnail } from './SpriteThumbnail';
import { SpellPicker } from './SpellPicker';
import { StatusEffectPicker, TYPE_COLORS, getStatusEffectFlags } from './StatusEffectPicker';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';
import { useBulkSelect, BulkActionBar, bulkDelete, bulkMoveToFolder, bulkExport, bulkImport } from './BulkActions';
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
    createdAt: (e as { createdAt?: string }).createdAt || new Date().toISOString(),
    customSprite: e.customSprite
  } as CustomEnemy));

  const [enemies, setEnemies] = useState<CustomEnemy[]>(refreshEnemies);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomEnemy | null>(null);
  const [_isCreating, setIsCreating] = useState(false);
  const [showSpellPicker, setShowSpellPicker] = useState<number | null>(null);
  const [showStatusEffectPicker, setShowStatusEffectPicker] = useState(false);
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
      setEditing({ ...enemy, behavior: { type: 'static', ...enemy.behavior, pattern: [...(enemy.behavior?.pattern || [])] } });
      setIsCreating(false);
    }
  };

  useEffect(() => {
    if (initialSelectedId) handleSelect(initialSelectedId);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSelect is stable; only run on mount with initialSelectedId
  }, [initialSelectedId]);

  const handleNew = () => {
    const newEnemy: CustomEnemy = {
      id: 'enemy_' + Date.now(),
      name: 'New Enemy',
      spriteId: 'custom_sprite_' + Date.now(),
      health: 1,
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
                bulkExport(items, 'enemies-export.json', 'enemy');
              }}
              onImport={() => bulkImport({
                assetType: 'enemy',
                saveFn: saveEnemy,
                existingIds: new Set(enemies.map(e => e.id)),
                onComplete: () => { setEnemies(refreshEnemies()); bulk.clear(); },
              })}
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
                          <SpriteThumbnail sprite={enemy.customSprite} size={selectedId === enemy.id ? 56 : 40} previewType="entity" fillBox />
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
                      <SpriteThumbnail sprite={editing.customSprite} size={isMobile ? 40 : 64} previewType="entity" fillBox />
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

                    {/* Action Steps */}
                    <div className="border-t border-stone-600 pt-3 mt-3">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-semibold">Action Steps</label>
                        <button
                          onClick={() => {
                            const steps = editing.actionSteps || [];
                            updateEnemy({ actionSteps: [...steps, { text: '' }] });
                          }}
                          className="px-2 py-0.5 text-xs bg-arcane-700 rounded hover:bg-arcane-600"
                        >
                          + Add Step
                        </button>
                      </div>
                      <p className="text-xs text-stone-400 mb-2">
                        Numbered steps describing what this enemy does. Each step can have sub-bullets for additional detail.
                      </p>
                      <div className="space-y-3">
                        {(editing.actionSteps || []).map((step, index) => (
                          <div key={index} className="flex gap-2">
                            {/* Reorder buttons */}
                            <div className="flex flex-col gap-0.5 flex-shrink-0 mt-1">
                              <button
                                onClick={() => {
                                  if (index === 0) return;
                                  const newSteps = [...(editing.actionSteps || [])];
                                  [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]];
                                  updateEnemy({ actionSteps: newSteps });
                                }}
                                disabled={index === 0}
                                className="px-1 py-0.5 text-xs bg-stone-600 rounded hover:bg-stone-500 disabled:opacity-30"
                              >↑</button>
                              <button
                                onClick={() => {
                                  const steps = editing.actionSteps || [];
                                  if (index === steps.length - 1) return;
                                  const newSteps = [...steps];
                                  [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]];
                                  updateEnemy({ actionSteps: newSteps });
                                }}
                                disabled={index === (editing.actionSteps?.length || 0) - 1}
                                className="px-1 py-0.5 text-xs bg-stone-600 rounded hover:bg-stone-500 disabled:opacity-30"
                              >↓</button>
                            </div>
                            {/* Step content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex gap-2 items-center">
                                <span className="text-stone-400 text-xs font-semibold flex-shrink-0">{index + 1}.</span>
                                <div className="flex-1">
                                  <RichTextEditor
                                    value={step.text}
                                    onChange={(value) => {
                                      const newSteps = [...(editing.actionSteps || [])];
                                      newSteps[index] = { ...newSteps[index], text: value };
                                      updateEnemy({ actionSteps: newSteps });
                                    }}
                                    placeholder="Describe this step..."
                                  />
                                </div>
                                <button
                                  onClick={() => {
                                    const newSteps = (editing.actionSteps || []).filter((_, i) => i !== index);
                                    updateEnemy({ actionSteps: newSteps.length > 0 ? newSteps : undefined });
                                  }}
                                  className="px-2 py-1 text-sm bg-blood-700 rounded hover:bg-blood-600 flex-shrink-0"
                                >✕</button>
                              </div>
                              {/* Sub-steps */}
                              {(step.subSteps || []).map((sub, subIndex) => (
                                <div key={subIndex} className="flex gap-2 items-center mt-1 ml-4">
                                  <span className="text-stone-500 text-xs">•</span>
                                  <div className="flex-1">
                                    <RichTextEditor
                                      value={sub}
                                      onChange={(value) => {
                                        const newSteps = [...(editing.actionSteps || [])];
                                        const newSubs = [...(newSteps[index].subSteps || [])];
                                        newSubs[subIndex] = value;
                                        newSteps[index] = { ...newSteps[index], subSteps: newSubs };
                                        updateEnemy({ actionSteps: newSteps });
                                      }}
                                      placeholder="Sub-action..."
                                    />
                                  </div>
                                  <button
                                    onClick={() => {
                                      const newSteps = [...(editing.actionSteps || [])];
                                      const newSubs = (newSteps[index].subSteps || []).filter((_, i) => i !== subIndex);
                                      newSteps[index] = { ...newSteps[index], subSteps: newSubs.length > 0 ? newSubs : undefined };
                                      updateEnemy({ actionSteps: newSteps });
                                    }}
                                    className="px-2 py-1 text-xs bg-blood-800 rounded hover:bg-blood-700 flex-shrink-0"
                                  >✕</button>
                                </div>
                              ))}
                              <button
                                onClick={() => {
                                  const newSteps = [...(editing.actionSteps || [])];
                                  const newSubs = [...(newSteps[index].subSteps || []), ''];
                                  newSteps[index] = { ...newSteps[index], subSteps: newSubs };
                                  updateEnemy({ actionSteps: newSteps });
                                }}
                                className="mt-1 ml-4 px-2 py-0.5 text-xs text-stone-400 hover:text-stone-200 bg-stone-700 rounded hover:bg-stone-600"
                              >
                                + Sub-step
                              </button>
                            </div>
                          </div>
                        ))}
                        {(!editing.actionSteps || editing.actionSteps.length === 0) && (
                          <div className="text-stone-500 text-sm italic">
                            No action steps. Click "+ Add Step" to create one.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Attributes */}
                    <div className="border-t border-stone-600 pt-3 mt-3">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-semibold">Attributes</label>
                        <button
                          onClick={() => {
                            const attrs = editing.attributes || [];
                            updateEnemy({ attributes: [...attrs, ''] });
                          }}
                          className="px-2 py-0.5 text-xs bg-arcane-700 rounded hover:bg-arcane-600"
                        >
                          + Add Attribute
                        </button>
                      </div>
                      <p className="text-xs text-stone-400 mb-2">
                        Passive traits or stats shown alongside action steps. Each entry appears as a bullet point.
                      </p>
                      <div className="space-y-2">
                        {(editing.attributes || []).map((attr, index) => (
                          <div key={index} className="flex gap-2 items-center">
                            <div className="flex flex-col gap-0.5">
                              <button
                                onClick={() => {
                                  if (index === 0) return;
                                  const newAttrs = [...(editing.attributes || [])];
                                  [newAttrs[index - 1], newAttrs[index]] = [newAttrs[index], newAttrs[index - 1]];
                                  updateEnemy({ attributes: newAttrs });
                                }}
                                disabled={index === 0}
                                className="px-1 py-0.5 text-xs bg-stone-600 rounded hover:bg-stone-500 disabled:opacity-30"
                              >↑</button>
                              <button
                                onClick={() => {
                                  const attrs = editing.attributes || [];
                                  if (index === attrs.length - 1) return;
                                  const newAttrs = [...attrs];
                                  [newAttrs[index], newAttrs[index + 1]] = [newAttrs[index + 1], newAttrs[index]];
                                  updateEnemy({ attributes: newAttrs });
                                }}
                                disabled={index === (editing.attributes?.length || 0) - 1}
                                className="px-1 py-0.5 text-xs bg-stone-600 rounded hover:bg-stone-500 disabled:opacity-30"
                              >↓</button>
                            </div>
                            <span className="text-stone-400 text-sm">•</span>
                            <div className="flex-1">
                              <RichTextEditor
                                value={attr}
                                onChange={(value) => {
                                  const newAttrs = [...(editing.attributes || [])];
                                  newAttrs[index] = value;
                                  updateEnemy({ attributes: newAttrs });
                                }}
                                placeholder="Enter attribute..."
                              />
                            </div>
                            <button
                              onClick={() => {
                                const newAttrs = (editing.attributes || []).filter((_, i) => i !== index);
                                updateEnemy({ attributes: newAttrs.length > 0 ? newAttrs : undefined });
                              }}
                              className="px-2 py-1 text-sm bg-blood-700 rounded hover:bg-blood-600"
                            >✕</button>
                          </div>
                        ))}
                        {(!editing.attributes || editing.attributes.length === 0) && (
                          <div className="text-stone-500 text-sm italic">
                            No attributes. Click "+ Add Attribute" to create one.
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
                    </div>
                  </CollapsiblePanel>

                  {/* Properties */}
                  <CollapsiblePanel title="Properties" className="space-y-2">
                    <label className="flex items-center gap-2 p-2 rounded bg-blood-900/30 border border-blood-700/50">
                      <input type="checkbox" checked={editing.isBoss || false}
                        onChange={(e) => updateEnemy({ isBoss: e.target.checked })} className="w-4 h-4" />
                      <span className="text-sm font-medium text-blood-300">Boss Enemy</span>
                    </label>
                    <p className="text-xs text-stone-400 ml-1">Boss enemies enable the "Defeat the Boss" win condition.</p>
                    <p className="text-xs text-stone-500 ml-1 mt-1">Other traits (Ghost, Wall, Halt, Priority, Sturdy, Contact Damage) are assigned via starting status effects.</p>
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

                  {/* Starting Status Effects */}
                  <CollapsiblePanel title="Starting Status Effects">
                    <p className="text-xs text-stone-400 mb-3">Status effects applied when this enemy spawns on the board.</p>
                    {(editing.initialStatusEffects || []).length > 0 && (
                      <div className="space-y-2 mb-3">
                        {editing.initialStatusEffects!.map((ise, index) => {
                          const effectAsset = loadStatusEffectAsset(ise.statusAssetId);
                          if (!effectAsset) return null;
                          const typeColor = TYPE_COLORS[effectAsset.type] || '#9ca3af';
                          return (
                            <div key={index} className="bg-stone-900 rounded-lg p-3 border border-stone-700">
                              {/* Header row */}
                              <div className="flex items-start gap-3 mb-2">
                                <SpriteThumbnail sprite={effectAsset.iconSprite?.type === 'inline' ? effectAsset.iconSprite.spriteData : undefined} size={40} className="rounded border border-stone-600 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold truncate">{effectAsset.name}</span>
                                    <span className="text-xs capitalize px-1.5 py-0.5 rounded" style={{ color: typeColor, backgroundColor: `${typeColor}22` }}>
                                      {effectAsset.type}
                                    </span>
                                  </div>
                                  {effectAsset.description && (
                                    <p className="text-xs text-stone-400 mt-0.5 line-clamp-2">{effectAsset.description}</p>
                                  )}
                                </div>
                                <button
                                  onClick={() => {
                                    const updated = editing.initialStatusEffects!.filter((_, i) => i !== index);
                                    updateEnemy({ initialStatusEffects: updated.length > 0 ? updated : undefined });
                                  }}
                                  className="text-red-400 hover:text-red-300 text-lg px-1 flex-shrink-0"
                                  title="Remove"
                                >
                                  ✕
                                </button>
                              </div>

                              {/* Info grid */}
                              <div className="grid grid-cols-2 gap-1.5 text-xs mb-2">
                                <div className="bg-stone-800 rounded px-2 py-1">
                                  <span className="text-stone-400">Stacking:</span>{' '}
                                  <span className="text-parchment-100 font-semibold capitalize">{effectAsset.stackingBehavior}</span>
                                </div>
                              </div>

                              {/* Special flags */}
                              {(() => { const flags = getStatusEffectFlags(effectAsset); return flags.length > 0 ? (
                                <div className="flex flex-wrap gap-1 mb-2">
                                  {flags.map(flag => (
                                    <span key={flag} className="text-xs px-1.5 py-0.5 rounded bg-stone-800 text-stone-300">{flag}</span>
                                  ))}
                                </div>
                              ) : null; })()}

                              {/* Override controls */}
                              <div className="flex flex-wrap gap-3 pt-2 border-t border-stone-700">
                                <div className="flex items-center gap-1.5">
                                  <label className="text-xs text-stone-400 font-medium">Duration:</label>
                                  <select
                                    value={ise.durationOverride === -1 ? '-1' : (ise.durationOverride || 0).toString()}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value);
                                      const updated = [...editing.initialStatusEffects!];
                                      updated[index] = { ...updated[index], durationOverride: val || undefined };
                                      updateEnemy({ initialStatusEffects: updated });
                                    }}
                                    className="px-2 py-1 bg-stone-700 rounded text-xs"
                                  >
                                    <option value="0">Default ({effectAsset.defaultDuration} turns)</option>
                                    <option value="-1">♾ Permanent</option>
                                    {[1, 2, 3, 4, 5, 10, 15, 20].map(n => (
                                      <option key={n} value={n}>{n} turns</option>
                                    ))}
                                  </select>
                                </div>
                                {effectAsset.defaultValue !== undefined && (
                                  <div className="flex items-center gap-1.5">
                                    <label className="text-xs text-stone-400 font-medium">Value:</label>
                                    <input
                                      type="number"
                                      min="0"
                                      max="999"
                                      value={ise.valueOverride ?? effectAsset.defaultValue ?? 0}
                                      onChange={(e) => {
                                        const val = parseInt(e.target.value) || 0;
                                        const updated = [...editing.initialStatusEffects!];
                                        updated[index] = { ...updated[index], valueOverride: val };
                                        updateEnemy({ initialStatusEffects: updated });
                                      }}
                                      className="px-2 py-1 bg-stone-700 rounded text-xs w-16"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <button
                      onClick={() => setShowStatusEffectPicker(true)}
                      className="w-full px-3 py-2 bg-stone-700 rounded text-sm hover:bg-stone-600 transition-colors border border-dashed border-stone-500"
                    >
                      + Add Status Effect
                    </button>
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
                      <input type="checkbox" checked={editing.isFloating || false}
                        onChange={(e) => updateEnemy({ isFloating: e.target.checked })} className="w-4 h-4" />
                      <span className="text-sm">Floating/Flying (centers in thumbnail)</span>
                    </label>
                  </div>
                  {editing.customSprite && (
                    <SpriteEditor
                      sprite={editing.customSprite}
                      onChange={updateSprite}
                      shadowPreview
                      shadowPreviewFloating={!!editing.isFloating}
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

      {/* Status Effect Picker Modal */}
      {showStatusEffectPicker && editing && (
        <StatusEffectPicker
          onSelect={(effect) => {
            const existing = editing.initialStatusEffects || [];
            updateEnemy({
              initialStatusEffects: [...existing, { statusAssetId: effect.id }],
            });
            setShowStatusEffectPicker(false);
          }}
          onCancel={() => setShowStatusEffectPicker(false)}
        />
      )}
    </>
  );
};

