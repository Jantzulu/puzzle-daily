import React, { useState, useEffect, useMemo } from 'react';
import { toast } from '../shared/Toast';
import { findAssetUsages, formatUsageWarning } from '../../utils/assetDependencies';
import { scaledNameClass } from '../../utils/textScale';
import { attributeText, attributeSubItems, withAttributeText, withAttributeSubItems } from '../../utils/attributeShape';
import { Direction, ActionType } from '../../types/game';
import type { CharacterAction } from '../../types/game';
import type { CustomCharacter, CustomSprite } from '../../utils/assetStorage';
import { saveCharacter, deleteCharacter, getFolders, getSoundAssets, getAllCollectibles, loadStatusEffectAsset, loadSpellAsset } from '../../utils/assetStorage';
import { getAllCharacters } from '../../data/characters';
import { SpriteEditor } from './SpriteEditor';
import { SpriteThumbnail } from './SpriteThumbnail';
import { SpellPicker } from './SpellPicker';
import { StatusEffectPicker, TYPE_COLORS, getStatusEffectFlags } from './StatusEffectPicker';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';
import { useBulkSelect, BulkActionBar, bulkDelete, bulkMoveToFolder, bulkExport, bulkImport } from './BulkActions';
import { RichTextEditor } from './RichTextEditor';
import { BehaviorSequenceBuilder } from './BehaviorSequenceBuilder';
import { DirectionCompass } from './DirectionCompass';
import { ALL_COMPASS_DIRECTIONS } from '../../utils/directionInput';
import { VersionHistoryModal } from './VersionHistoryModal';
import { createVersionSnapshot } from '../../services/versionService';
import { AssetEditorLayout } from './AssetEditorLayout';
import { AssetBrowseTable, useBrowseSort, type BrowseColumn } from './AssetBrowseTable';
import { UsageChips, usageSortValue } from './UsageChips';
import { CollapsiblePanel } from './CollapsiblePanel';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { newAssetId, newSpriteId } from '../../utils/assetIds';

/**
 * Distinct spells referenced anywhere in a behavior list, branches included.
 * Display only — used for the "Spells" browse column.
 */
const countBehaviorSpells = (actions?: CharacterAction[]): number => {
  const ids = new Set<string>();
  const walk = (list?: CharacterAction[]) => {
    for (const action of list || []) {
      if (action.spellId) ids.add(action.spellId);
      walk(action.params?.thenActions);
      walk(action.params?.elseActions);
    }
  };
  walk(actions);
  return ids.size;
};

/** Compass arrow for the browse table's Facing column. */
const FACING_ARROW: Record<string, string> = {
  [Direction.NORTH]: 'N ↑', [Direction.NORTHEAST]: 'NE ↗',
  [Direction.EAST]: 'E →', [Direction.SOUTHEAST]: 'SE ↘',
  [Direction.SOUTH]: 'S ↓', [Direction.SOUTHWEST]: 'SW ↙',
  [Direction.WEST]: 'W ←', [Direction.NORTHWEST]: 'NW ↖',
};

export const CharacterEditor: React.FC<{ initialSelectedId?: string }> = ({ initialSelectedId }) => {
  const isMobile = useIsMobile();
  // Helper to ensure all characters have a default customSprite
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ensureCustomSprite = (char: any): CustomCharacter => {
    return {
      ...char,
      isCustom: true,
      createdAt: char.createdAt || new Date().toISOString(),
      customSprite: char.customSprite || {
        id: newSpriteId(),
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
  const [_isCreating, setIsCreating] = useState(false);
  const [showSpellPicker, setShowSpellPicker] = useState<number | null>(null);
  const [showStatusEffectPicker, setShowStatusEffectPicker] = useState(false);
  const [showContactVisualPicker, setShowContactVisualPicker] = useState(false);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSelect is stable; only run on mount with initialSelectedId
  }, [initialSelectedId]);

  const handleNew = () => {
    const newChar: CustomCharacter = {
      id: newAssetId('char'),
      name: 'New Character',
      spriteId: newAssetId('custom_sprite'),
      description: 'Custom character',
      health: 1,
      defaultFacing: Direction.EAST,
      behavior: [
        { type: ActionType.MOVE_FORWARD },
        { type: ActionType.REPEAT }
      ],
      customSprite: {
        id: newSpriteId(),
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
      id: newAssetId('char'),
      name: char.name + ' (Copy)',
      behavior: [...char.behavior],
      customSprite: char.customSprite ? { ...char.customSprite, id: newSpriteId() } : undefined,
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

  const handleBack = () => {
    setSelectedId(null);
    setEditing(null);
    setIsCreating(false);
  };

  const folderNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of getFolders('characters')) map.set(f.id, f.name);
    return map;
  }, [characters]); // eslint-disable-line react-hooks/exhaustive-deps -- folders change alongside asset edits

  // Computed once per load, not per render and not per sort comparison —
  // findAssetUsages scans every puzzle, so calling it inside a comparator
  // would rescan the library O(n log n) times.
  const usagesByCharacter = useMemo(() => {
    const map = new Map<string, ReturnType<typeof findAssetUsages>>();
    for (const c of characters) map.set(c.id, findAssetUsages('character', c.id));
    return map;
  }, [characters]);

  const nobleChip = (char: CustomCharacter) => (char.isNoble ? (
    <span className="px-1.5 py-0 rounded border text-[10px] whitespace-nowrap bg-copper-900/40 text-copper-300 border-copper-700/50">
      NOBLE
    </span>
  ) : null);

  const rowActionButtons = (char: CustomCharacter) => (
    <>
      <InlineFolderPicker
        category="characters"
        currentFolderId={char.folderId}
        onFolderChange={(folderId) => handleFolderChange(char.id, folderId)}
      />
      <button
        onClick={(e) => handleDuplicate(char, e)}
        className="px-1 py-0.5 text-xs leading-none rounded border border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800"
        title="Duplicate"
      >
        ⎘
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); handleDelete(char.id); }}
        className="px-1 py-0.5 text-xs leading-none rounded border bg-red-900/40 text-red-300 border-red-700/50 hover:bg-red-900/60"
        title="Delete"
      >
        ✕
      </button>
    </>
  );

  const browseColumns: BrowseColumn<CustomCharacter>[] = [
    {
      key: 'sprite',
      label: '',
      sortable: false,
      className: 'w-10',
      render: (c) => (
        <div className="w-7 h-7 bg-stone-700 rounded flex items-center justify-center overflow-hidden">
          <SpriteThumbnail sprite={c.customSprite} size={28} previewType="entity" fillBox />
        </div>
      ),
    },
    {
      key: 'name',
      label: 'Name',
      value: (c) => c.name || 'Unnamed',
      render: (c) => (
        <div className="flex items-center gap-1.5">
          <span className="text-parchment-100">{c.name || 'Unnamed'}</span>
          {nobleChip(c)}
        </div>
      ),
    },
    { key: 'health', label: 'HP', align: 'right', value: (c) => c.health ?? null },
    { key: 'actions', label: 'Actions', align: 'right', value: (c) => c.behavior?.length || null },
    { key: 'spells', label: 'Spells', align: 'right', value: (c) => countBehaviorSpells(c.behavior) || null },
    { key: 'effects', label: 'Effects', align: 'right', value: (c) => c.initialStatusEffects?.length || null },
    {
      key: 'facing',
      label: 'Facing',
      value: (c) => c.defaultFacing ?? null,
      render: (c) => (
        <span className="text-xs text-stone-400 whitespace-nowrap">
          {FACING_ARROW[c.defaultFacing] ?? c.defaultFacing ?? '—'}
        </span>
      ),
    },
    {
      key: 'folder',
      label: 'Folder',
      value: (c) => (c.folderId ? folderNames.get(c.folderId) ?? null : null),
      render: (c) => {
        const name = c.folderId ? folderNames.get(c.folderId) : undefined;
        return name
          ? <span className="text-xs text-stone-400">{name}</span>
          : <span className="text-stone-600">—</span>;
      },
    },
    {
      key: 'usedBy',
      label: 'Used by',
      value: (c) => usageSortValue(usagesByCharacter.get(c.id)),
      render: (c) => <UsageChips usages={usagesByCharacter.get(c.id) ?? []} />,
    },
  ];

  // One ordering feeds the table, the sidebar list, and prev/next.
  const sort = useBrowseSort(filteredCharacters, browseColumns, 'name');

  const searchInput = (
    <input
      type="text"
      placeholder="Search..."
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      className="flex-1 min-w-0 bg-stone-800 border border-stone-700 rounded px-2 py-1 text-xs text-parchment-100 placeholder-stone-500 focus:outline-none focus:border-arcane-500"
    />
  );

  const folderFilter = (
    <FolderDropdown
      category="characters"
      selectedFolderId={selectedFolderId}
      onFolderSelect={setSelectedFolderId}
    />
  );

  const newButton = (
    <button
      onClick={handleNew}
      className="px-2 py-0.5 rounded border text-xs bg-green-900/40 text-green-300 border-green-700/50 hover:bg-green-900/60 flex-shrink-0"
    >
      + New
    </button>
  );

  const handleImport = () => bulkImport({
    assetType: 'character',
    saveFn: saveCharacter,
    existingIds: new Set(characters.map(c => c.id)),
    onComplete: () => { refreshCharacters(); bulk.clear(); },
  });

  const importButton = (
    <button
      onClick={handleImport}
      className="px-2 py-0.5 rounded border text-xs border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800 flex-shrink-0"
    >
      Import
    </button>
  );

  const countLabel = (
    <span className="ml-1.5 text-xs font-sans text-stone-500">
      {filteredCharacters.length}{filteredCharacters.length !== characters.length && ` / ${characters.length}`}
    </span>
  );

  const bulkBar = (
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
        bulkExport(items, 'characters-export.json', 'character');
      }}
      onImport={handleImport}
    />
  );

  return (
    <>
      <AssetEditorLayout
        isEditing={!!editing}
        onBack={handleBack}
        listTitle="Heroes"
        listPanel={
          <>
            <div className="flex justify-between items-center gap-2">
              <h2 className="text-lg font-medieval text-copper-400">
                Heroes
                {countLabel}
              </h2>
              <div className="flex items-center gap-1.5 flex-shrink-0">{importButton}{newButton}</div>
            </div>

            {/* Search + folder filter share one row so the list starts higher */}
            <div className="flex items-center gap-1.5">
              {searchInput}
              <div className="w-32 flex-shrink-0">{folderFilter}</div>
            </div>

            {bulkBar}

            <div className="border border-stone-700 rounded max-h-[calc(100vh-250px)] overflow-y-auto overflow-x-hidden dense-scrollbar">
              {filteredCharacters.length === 0 ? (
                <div className="px-2 py-4 text-center text-stone-500 text-sm">
                  {searchTerm ? 'No matches' : 'No heroes yet — click "+ New" to create one.'}
                </div>
              ) : (
                sort.sorted.map(char => {
                  const isSelected = selectedId === char.id;
                  return (
                    <div
                      key={char.id}
                      className={`group px-2 py-1.5 cursor-pointer transition-colors border-t border-stone-700/60 first:border-t-0 ${
                        bulk.isSelected(char.id) ? 'bg-sky-900/40' :
                        isSelected
                          ? 'bg-copper-900/50'
                          : 'hover:bg-stone-800/50'
                      }`}
                      onClick={() => handleSelect(char.id)}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={bulk.isSelected(char.id)}
                          onChange={() => bulk.toggle(char.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="accent-sky-500 flex-shrink-0"
                        />
                        <div className="w-7 h-7 bg-stone-700 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
                          <SpriteThumbnail sprite={char.customSprite} size={28} previewType="entity" fillBox />
                        </div>
                        {/* Deliberately a div, not an h3: `.theme-root h3` sizes
                            every heading at 1.25x the theme heading size in the
                            theme face, and an element selector outranks
                            Tailwind's text-* utility — an h3 here renders ~25px
                            and truncates after a few characters. */}
                        <div className={`flex-1 min-w-0 truncate text-parchment-100 ${scaledNameClass(char.name)}`}>
                          {char.name}
                        </div>
                        <div className={`flex items-center gap-1 flex-shrink-0 transition-opacity ${
                          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                        }`}>
                          <InlineFolderPicker
                            category="characters"
                            currentFolderId={char.folderId}
                            onFolderChange={(folderId) => handleFolderChange(char.id, folderId)}
                          />
                          <button
                            onClick={(e) => handleDuplicate(char, e)}
                            className="px-1 py-0.5 text-xs leading-none rounded border border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800"
                            title="Duplicate"
                          >
                            ⎘
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(char.id);
                            }}
                            className="px-1 py-0.5 text-xs leading-none rounded border bg-red-900/40 text-red-300 border-red-700/50 hover:bg-red-900/60"
                            title="Delete"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Meta line: the numbers that differ between heroes.
                          Indented to sit under the name. */}
                      <div className="flex flex-wrap items-center gap-1 mt-1 pl-[3.25rem]">
                        {nobleChip(char)}
                        <span className="text-[10px] text-stone-500 whitespace-nowrap">
                          HP {char.health}
                          <span className="text-stone-600"> · </span>{char.behavior.length} actions
                          {char.initialStatusEffects?.length
                            ? <><span className="text-stone-600"> · </span>{char.initialStatusEffects.length} effects</>
                            : null}
                        </span>
                        <UsageChips usages={usagesByCharacter.get(char.id) ?? []} hideWhenEmpty />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        }
        browseControls={
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-medieval text-copper-400 mr-1">
              Heroes
              {countLabel}
            </h2>
            <div className="w-48">{searchInput}</div>
            <div className="w-40">{folderFilter}</div>
            {importButton}
            {newButton}
            <div className="ml-auto">{bulkBar}</div>
          </div>
        }
        browsePanel={
          <AssetBrowseTable
            items={sort.sorted}
            columns={browseColumns}
            sortKey={sort.sortKey}
            sortDir={sort.sortDir}
            onToggleSort={sort.toggleSort}
            onOpen={(char) => handleSelect(char.id)}
            selection={{ isSelected: bulk.isSelected, toggle: bulk.toggle }}
            rowActions={rowActionButtons}
            emptyMessage={searchTerm ? 'No matches' : 'No heroes yet — click "+ New" to create one.'}
          />
        }
        navigation={{
          items: sort.sorted.map(c => ({ id: c.id, name: c.name || 'Unnamed' })),
          currentId: selectedId,
          onSelect: (id) => handleSelect(id),
        }}
        detailPanel={
          editing ? (
            <>
              {/* Persistent Header */}
              <div className="dungeon-panel p-3 md:p-4 rounded">
                <div className="flex justify-between items-center gap-2">
                  <div className="flex items-center gap-2 md:gap-4 min-w-0">
                    <div className="flex w-10 h-10 md:w-16 md:h-16 bg-stone-700 rounded-pixel items-center justify-center overflow-hidden flex-shrink-0">
                      <SpriteThumbnail sprite={editing.customSprite} size={isMobile ? 40 : 64} previewType="entity" fillBox />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg md:text-2xl font-bold font-medieval text-copper-400 truncate">
                        {editing.name || 'Unnamed Hero'}
                      </h2>
                      <p className="text-xs text-stone-400">HP: {editing.health} • {editing.behavior.length} actions</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 md:gap-2 flex-shrink-0">
                    <button
                      onClick={async () => {
                        const result = await createVersionSnapshot(editing.id, 'character', editing.name, editing as unknown as object);
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
                      <span className="hidden md:inline">Save Hero</span>
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
                    <CollapsiblePanel title="Basic Info" className="space-y-3">
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

                      {/* Action Steps */}
                      <div className="border-t border-stone-600 pt-3 mt-3">
                        <div className="flex justify-between items-center mb-2">
                          <label className="text-sm font-semibold">Action Steps</label>
                          <button
                            onClick={() => {
                              const steps = editing.actionSteps || [];
                              updateCharacter({ actionSteps: [...steps, { text: '' }] });
                            }}
                            className="px-2 py-0.5 text-xs bg-arcane-700 rounded hover:bg-arcane-600"
                          >
                            + Add Step
                          </button>
                        </div>
                        <p className="text-xs text-stone-400 mb-2">
                          Numbered steps describing what this hero does. Each step can have sub-bullets for multiple actions on the same turn.
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
                                    updateCharacter({ actionSteps: newSteps });
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
                                    updateCharacter({ actionSteps: newSteps });
                                  }}
                                  disabled={index === (editing.actionSteps?.length || 0) - 1}
                                  className="px-1 py-0.5 text-xs bg-stone-600 rounded hover:bg-stone-500 disabled:opacity-30"
                                >↓</button>
                              </div>

                              {/* Step content */}
                              <div className="flex-1 min-w-0">
                                {/* Ordinal label + main text + delete */}
                                <div className="flex gap-2 items-center">
                                  <span className="text-stone-400 text-xs font-semibold flex-shrink-0">{index + 1}.</span>
                                  <div className="flex-1">
                                    <RichTextEditor
                                      value={step.text}
                                      onChange={(value) => {
                                        const newSteps = [...(editing.actionSteps || [])];
                                        newSteps[index] = { ...newSteps[index], text: value };
                                        updateCharacter({ actionSteps: newSteps });
                                      }}
                                      placeholder="Describe this turn's action..."
                                    />
                                  </div>
                                  <button
                                    onClick={() => {
                                      const newSteps = (editing.actionSteps || []).filter((_, i) => i !== index);
                                      updateCharacter({ actionSteps: newSteps.length > 0 ? newSteps : undefined });
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
                                          updateCharacter({ actionSteps: newSteps });
                                        }}
                                        placeholder="Sub-action..."
                                      />
                                    </div>
                                    <button
                                      onClick={() => {
                                        const newSteps = [...(editing.actionSteps || [])];
                                        const newSubs = (newSteps[index].subSteps || []).filter((_, i) => i !== subIndex);
                                        newSteps[index] = { ...newSteps[index], subSteps: newSubs.length > 0 ? newSubs : undefined };
                                        updateCharacter({ actionSteps: newSteps });
                                      }}
                                      className="px-2 py-1 text-xs bg-blood-800 rounded hover:bg-blood-700 flex-shrink-0"
                                    >✕</button>
                                  </div>
                                ))}

                                {/* Add sub-step button */}
                                <button
                                  onClick={() => {
                                    const newSteps = [...(editing.actionSteps || [])];
                                    const newSubs = [...(newSteps[index].subSteps || []), ''];
                                    newSteps[index] = { ...newSteps[index], subSteps: newSubs };
                                    updateCharacter({ actionSteps: newSteps });
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
                              updateCharacter({ attributes: [...attrs, ''] });
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
                            <div key={index}>
                              <div className="flex gap-2 items-center">
                                <div className="flex flex-col gap-0.5">
                                  <button
                                    onClick={() => {
                                      if (index === 0) return;
                                      const newAttrs = [...(editing.attributes || [])];
                                      [newAttrs[index - 1], newAttrs[index]] = [newAttrs[index], newAttrs[index - 1]];
                                      updateCharacter({ attributes: newAttrs });
                                    }}
                                    disabled={index === 0}
                                    className="px-1 py-0.5 text-xs bg-stone-600 rounded hover:bg-stone-500 disabled:opacity-30"
                                  >
                                    ↑
                                  </button>
                                  <button
                                    onClick={() => {
                                      const attrs = editing.attributes || [];
                                      if (index === attrs.length - 1) return;
                                      const newAttrs = [...attrs];
                                      [newAttrs[index], newAttrs[index + 1]] = [newAttrs[index + 1], newAttrs[index]];
                                      updateCharacter({ attributes: newAttrs });
                                    }}
                                    disabled={index === (editing.attributes?.length || 0) - 1}
                                    className="px-1 py-0.5 text-xs bg-stone-600 rounded hover:bg-stone-500 disabled:opacity-30"
                                  >
                                    ↓
                                  </button>
                                </div>
                                <span className="text-stone-400 text-sm">•</span>
                                <div className="flex-1">
                                  <RichTextEditor
                                    value={attributeText(attr)}
                                    onChange={(value) => {
                                      const newAttrs = [...(editing.attributes || [])];
                                      newAttrs[index] = withAttributeText(newAttrs[index], value);
                                      updateCharacter({ attributes: newAttrs });
                                    }}
                                    placeholder="Enter attribute..."
                                  />
                                </div>
                                <button
                                  onClick={() => {
                                    const newAttrs = (editing.attributes || []).filter((_, i) => i !== index);
                                    updateCharacter({ attributes: newAttrs.length > 0 ? newAttrs : undefined });
                                  }}
                                  className="px-2 py-1 text-sm bg-blood-700 rounded hover:bg-blood-600"
                                >
                                  ✕
                                </button>
                              </div>

                              {/* Sub-items (nesting parity with action sub-steps) */}
                              {(attributeSubItems(attr) || []).map((sub, subIndex) => (
                                <div key={subIndex} className="flex gap-2 items-center mt-1 ml-10">
                                  <span className="text-stone-500 text-xs">◦</span>
                                  <div className="flex-1">
                                    <RichTextEditor
                                      value={sub}
                                      onChange={(value) => {
                                        const newAttrs = [...(editing.attributes || [])];
                                        const newSubs = [...(attributeSubItems(newAttrs[index]) || [])];
                                        newSubs[subIndex] = value;
                                        newAttrs[index] = withAttributeSubItems(newAttrs[index], newSubs);
                                        updateCharacter({ attributes: newAttrs });
                                      }}
                                      placeholder="Sub-detail..."
                                    />
                                  </div>
                                  <button
                                    onClick={() => {
                                      const newAttrs = [...(editing.attributes || [])];
                                      const newSubs = (attributeSubItems(newAttrs[index]) || []).filter((_, i) => i !== subIndex);
                                      newAttrs[index] = withAttributeSubItems(newAttrs[index], newSubs);
                                      updateCharacter({ attributes: newAttrs });
                                    }}
                                    className="px-2 py-1 text-xs bg-blood-800 rounded hover:bg-blood-700 flex-shrink-0"
                                  >✕</button>
                                </div>
                              ))}

                              {/* Add sub-item button */}
                              <button
                                onClick={() => {
                                  const newAttrs = [...(editing.attributes || [])];
                                  newAttrs[index] = withAttributeSubItems(newAttrs[index], [...(attributeSubItems(newAttrs[index]) || []), '']);
                                  updateCharacter({ attributes: newAttrs });
                                }}
                                className="mt-1 ml-10 px-2 py-0.5 text-xs text-stone-400 hover:text-stone-200 bg-stone-700 rounded hover:bg-stone-600"
                              >
                                + Sub-item
                              </button>
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
                      <label className="flex items-center gap-2 p-2 mt-3 rounded bg-stone-700/40 border border-stone-600/50">
                        <input type="checkbox" checked={editing.facingAcceptsUserInput || false}
                          onChange={(e) => updateCharacter({ facingAcceptsUserInput: e.target.checked || undefined })} className="w-4 h-4" />
                        <span className="text-sm font-medium">Player picks starting facing</span>
                      </label>
                      <p className="text-xs text-stone-400 ml-1 mt-1">A compass on the hero card lets the player choose this hero's starting facing during setup (required before placing). Default Facing above stays the fallback for showcase demos and AI-side uses.</p>
                      {editing.facingAcceptsUserInput && (
                        <div className="mt-2 p-2 rounded bg-stone-800/60 border border-stone-700/60">
                          <p className="text-xs text-stone-400 mb-2">Allowed directions — the player can only pick from these (all lit = no restriction):</p>
                          <DirectionCompass
                            mode="absolute"
                            selectedDirections={editing.allowedFacingDirections?.length ? editing.allowedFacingDirections : ALL_COMPASS_DIRECTIONS}
                            onChange={(dirs) => updateCharacter({ allowedFacingDirections: dirs.length >= 8 ? undefined : (dirs as Direction[]) })}
                          />
                        </div>
                      )}
                    </CollapsiblePanel>

                    {/* Properties */}
                    <CollapsiblePanel title="Properties" className="space-y-2">
                      <label className="flex items-center gap-2 p-2 rounded bg-copper-900/30 border border-copper-700/50">
                        <input type="checkbox" checked={editing.isNoble || false}
                          onChange={(e) => updateCharacter({ isNoble: e.target.checked })} className="w-4 h-4" />
                        <span className="text-sm font-medium text-copper-300">Noble</span>
                      </label>
                      <p className="text-xs text-stone-400 ml-1">Nobles power the noble win conditions — Protect the Noble, Keep the Noble alive for N turns, Guide the Noble to the Exit. If any noble condition is set, this hero dying means defeat.</p>
                      <label className="flex items-center gap-2 p-2 rounded bg-stone-700/40 border border-stone-600/50">
                        <input type="checkbox" checked={editing.hideFromCompendium || false}
                          onChange={(e) => updateCharacter({ hideFromCompendium: e.target.checked || undefined })} className="w-4 h-4" />
                        <span className="text-sm font-medium">Hide from the Slab</span>
                      </label>
                      <p className="text-xs text-stone-400 ml-1">No compendium page even when published — for showcase-only variants and the like.</p>
                      <p className="text-xs text-stone-500 ml-1 mt-1">Traits (Ghost, Wall, Halt, Sturdy, Thorns, Trample) are assigned via starting status effects.</p>
                    </CollapsiblePanel>

                    {/* Sound Effects */}
                    <CollapsiblePanel title="Sound Effects">
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
                    </CollapsiblePanel>

                    {/* Death Drop */}
                    <CollapsiblePanel title="Death Drop">
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
                    </CollapsiblePanel>

                    {/* Starting Status Effects */}
                    <CollapsiblePanel title="Starting Status Effects">
                      <p className="text-xs text-stone-400 mb-3">Status effects applied when this character is placed on the board.</p>
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
                                      updateCharacter({ initialStatusEffects: updated.length > 0 ? updated : undefined });
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
                                        updateCharacter({ initialStatusEffects: updated });
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
                                          updateCharacter({ initialStatusEffects: updated });
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

                      {/* Contact hit visual — THIS hero's strike presentation */}
                      <div className="mt-3 pt-3 border-t border-stone-700">
                        <div className="text-sm text-stone-300 mb-1">Contact hit visual</div>
                        <p className="text-xs text-stone-400 mb-2">
                          When this hero&apos;s contact damage fires — from a starting effect above
                          or one gained mid-game — show the chosen spell&apos;s landed-hit visuals
                          (projectile hop, melee sprite, damage effect). Overrides the status
                          effect&apos;s own default visual. Visuals only; no damage inherited.
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowContactVisualPicker(true)}
                            className="px-2 py-1 bg-arcane-700 rounded text-xs hover:bg-arcane-600"
                          >
                            {editing.contactHitSpellVisualId
                              ? `Spell: ${loadSpellAsset(editing.contactHitSpellVisualId)?.name ?? 'missing spell'}`
                              : 'Choose spell…'}
                          </button>
                          {editing.contactHitSpellVisualId && (
                            <button
                              onClick={() => updateCharacter({ contactHitSpellVisualId: undefined })}
                              className="px-2 py-1 bg-red-600 rounded text-xs hover:bg-red-700"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                    </CollapsiblePanel>
                  </div>
                )}

                {/* Behavior Tab */}
                {activeTab === 'behavior' && (
                  <CollapsiblePanel title="Behavior">
                    <BehaviorSequenceBuilder
                      actions={editing.behavior}
                      onChange={updateBehaviorActions}
                      onSelectSpell={(index) => setShowSpellPicker(index)}
                      context="character"
                    />
                  </CollapsiblePanel>
                )}

                {/* Sprite Tab */}
                {activeTab === 'sprite' && (
                  <CollapsiblePanel title="Sprite">
                    <div className="mb-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={editing.isFloating || false}
                          onChange={(e) => updateCharacter({ isFloating: e.target.checked })} className="w-4 h-4" />
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
          <div className="border border-stone-700 rounded p-6 text-center">
            <h2 className="text-lg font-medieval text-copper-400 mb-2">Hero Editor</h2>
            <p className="text-sm text-stone-400 mb-4">
              Create and customize heroes with unique sprites and behaviors.
              <br />
              Select a hero from the list or create a new one.
            </p>
            <button
              onClick={handleNew}
              className="dungeon-btn-success text-sm px-3 py-1.5"
            >
              + Create New Hero
            </button>
          </div>
        }
      />

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

      {/* Status Effect Picker Modal */}
      {showStatusEffectPicker && editing && (
        <StatusEffectPicker
          onSelect={(effect) => {
            const existing = editing.initialStatusEffects || [];
            updateCharacter({
              initialStatusEffects: [...existing, { statusAssetId: effect.id }],
            });
            setShowStatusEffectPicker(false);
          }}
          onCancel={() => setShowStatusEffectPicker(false)}
        />
      )}

      {/* Contact Hit Visual Picker Modal */}
      {showContactVisualPicker && editing && (
        <SpellPicker
          onSelect={(spell) => {
            updateCharacter({ contactHitSpellVisualId: spell.id });
            setShowContactVisualPicker(false);
          }}
          onCancel={() => setShowContactVisualPicker(false)}
        />
      )}

      {/* AttackEditor mount removed: legacy custom-attack flow is gone — see
          ActionType.CUSTOM_ATTACK removal commit. SpellAssetBuilder is the
          replacement entry point for authoring attack-shaped behavior. */}
    </>
  );
};

