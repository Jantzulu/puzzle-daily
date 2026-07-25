import React, { useState, useEffect, useMemo } from 'react';
import { toast } from '../shared/Toast';
import { findAssetUsages, formatUsageWarning } from '../../utils/assetDependencies';
import { scaledNameClass } from '../../utils/textScale';
import type { CustomCollectible, CustomSprite } from '../../utils/assetStorage';
import type { CollectibleEffectConfig, CollectibleEffectType } from '../../types/game';
import { Direction } from '../../types/game';
import { saveCollectible, getCustomCollectibles, deleteCollectible, getFolders, getStatusEffectAssets, getSoundAssets } from '../../utils/assetStorage';
import { StaticSpriteEditor } from './StaticSpriteEditor';
import { SpriteThumbnail } from './SpriteThumbnail';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';
import { useBulkSelect, BulkActionBar, bulkDelete, bulkMoveToFolder, bulkExport, bulkImport } from './BulkActions';
import { RichTextEditor } from './RichTextEditor';
import { AssetEditorLayout } from './AssetEditorLayout';
import { AssetBrowseTable, useBrowseSort, type BrowseColumn } from './AssetBrowseTable';
import { CollapsiblePanel } from './CollapsiblePanel';
import { useIsMobile } from '../../hooks/useMediaQuery';

// Effect type options with icons
const EFFECT_TYPES: { value: CollectibleEffectType; label: string; icon: string }[] = [
  { value: 'score', label: 'Score Points', icon: '🏆' },
  { value: 'status_effect', label: 'Status Effect', icon: '✨' },
  { value: 'win_key', label: 'Win Key', icon: '🔑' },
  { value: 'heal', label: 'Heal', icon: '💚' },
  { value: 'damage', label: 'Damage (Trap)', icon: '💀' },
  { value: 'redirect', label: 'Redirect', icon: '🔄' },
];

// Get effect icon
const getEffectIcon = (type: CollectibleEffectType): string => {
  const found = EFFECT_TYPES.find(e => e.value === type);
  return found?.icon || '?';
};

export const CollectibleEditor: React.FC<{ initialSelectedId?: string }> = ({ initialSelectedId }) => {
  const isMobile = useIsMobile();
  const [collectibles, setCollectibles] = useState<CustomCollectible[]>(() => getCustomCollectibles());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomCollectible | null>(null);
  const [_isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const bulk = useBulkSelect();

  // Filter collectibles based on folder and search term
  const folderFilteredCollectibles = useFilteredAssets(collectibles, selectedFolderId);
  const filteredCollectibles = folderFilteredCollectibles.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.description && c.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const refreshCollectibles = () => {
    setCollectibles(getCustomCollectibles());
  };

  const handleSelect = (id: string) => {
    const collectible = collectibles.find(c => c.id === id);
    if (collectible) {
      setSelectedId(id);
      setEditing({ ...collectible, effects: [...collectible.effects] });
      setIsCreating(false);
    }
  };

  useEffect(() => {
    if (initialSelectedId) handleSelect(initialSelectedId);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSelect is stable; only run on mount with initialSelectedId
  }, [initialSelectedId]);

  const handleNew = () => {
    const newCollectible: CustomCollectible = {
      id: 'collectible_' + Date.now(),
      name: 'New Collectible',
      description: '',
      customSprite: {
        id: 'sprite_' + Date.now(),
        name: 'Collectible Sprite',
        type: 'simple',
        shape: 'star',
        primaryColor: '#ffd700',
        secondaryColor: '#ffaa00',
        size: 0.6,
        createdAt: new Date().toISOString(),
      },
      anchorPoint: 'center',
      effects: [{ type: 'score', scoreValue: 10 }],
      pickupMethod: 'step_on',
      pickupPermissions: { characters: true, enemies: false },
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
    setEditing(newCollectible);
    setSelectedId(null);
    setIsCreating(true);
  };

  const handleSave = () => {
    if (!editing) return;
    saveCollectible(editing);
    refreshCollectibles();
    setSelectedId(editing.id);
    setIsCreating(false);
    toast.success(`Saved "${editing.name}"!`);
  };

  const handleDelete = (id: string) => {
    const usages = findAssetUsages('collectible', id);
    const warning = usages.length > 0 ? `\n\n${formatUsageWarning(usages)}` : '';
    if (!confirm(`Delete this collectible?${warning}`)) return;
    deleteCollectible(id);
    refreshCollectibles();
    if (selectedId === id) {
      setSelectedId(null);
      setEditing(null);
    }
  };

  const updateSprite = (sprite: CustomSprite) => {
    if (!editing) return;
    setEditing({ ...editing, customSprite: sprite });
  };

  const addEffect = () => {
    if (!editing) return;
    const newEffect: CollectibleEffectConfig = {
      type: 'score',
      scoreValue: 10,
    };
    setEditing({
      ...editing,
      effects: [...editing.effects, newEffect],
    });
  };

  const updateEffect = (index: number, effect: CollectibleEffectConfig) => {
    if (!editing) return;
    const newEffects = [...editing.effects];
    newEffects[index] = effect;
    setEditing({ ...editing, effects: newEffects });
  };

  const removeEffect = (index: number) => {
    if (!editing) return;
    const newEffects = editing.effects.filter((_, i) => i !== index);
    setEditing({ ...editing, effects: newEffects });
  };

  const handleFolderChange = (collectibleId: string, folderId: string | undefined) => {
    const collectible = collectibles.find(c => c.id === collectibleId);
    if (collectible) {
      saveCollectible({ ...collectible, folderId });
      refreshCollectibles();
      if (editing && editing.id === collectibleId) {
        setEditing({ ...editing, folderId });
      }
    }
  };

  const handleDuplicate = (collectible: CustomCollectible, e: React.MouseEvent) => {
    e.stopPropagation();
    const duplicated: CustomCollectible = {
      ...collectible,
      id: 'collectible_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      name: collectible.name + ' (Copy)',
      effects: [...collectible.effects],
      customSprite: collectible.customSprite ? { ...collectible.customSprite, id: 'sprite_' + Date.now() } : undefined,
      createdAt: new Date().toISOString(),
    };
    setEditing(duplicated);
    setSelectedId(null);
    setIsCreating(true);
  };

  // Short label for a single effect, e.g. "+10 pts"
  const effectLabel = (e: CollectibleEffectConfig): string => {
    switch (e.type) {
      case 'score': return `+${e.scoreValue || 0} pts`;
      case 'status_effect': return 'Buff';
      case 'win_key': return 'Key';
      case 'heal': return `+${e.amount || 0} HP`;
      case 'damage': return `-${e.amount || 0} HP`;
      default: return e.type;
    }
  };

  // Get effect summary for display
  const getEffectSummary = (effects: CollectibleEffectConfig[]): string => {
    if (effects.length === 0) return 'No effects';
    return effects.map(effectLabel).join(', ');
  };

  const handleBack = () => {
    setSelectedId(null);
    setEditing(null);
    setIsCreating(false);
  };

  const folderNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of getFolders('collectibles')) map.set(f.id, f.name);
    return map;
  }, [collectibles]); // eslint-disable-line react-hooks/exhaustive-deps -- folders change alongside asset edits

  // Computed once per load, not per render and not per sort comparison —
  // findAssetUsages scans every puzzle and entity, so calling it inside a
  // comparator would rescan the library O(n log n) times.
  const usagesByCollectible = useMemo(() => {
    const map = new Map<string, ReturnType<typeof findAssetUsages>>();
    for (const c of collectibles) map.set(c.id, findAssetUsages('collectible', c.id));
    return map;
  }, [collectibles]);

  const pickupLabel = (c: CustomCollectible): string => {
    const heroes = c.pickupPermissions?.characters;
    const enemies = c.pickupPermissions?.enemies;
    if (heroes && enemies) return 'Anyone';
    if (heroes) return 'Heroes';
    if (enemies) return 'Enemies';
    return 'Nobody';
  };

  const effectChips = (effects: CollectibleEffectConfig[]) => effects.map((e, i) => (
    <span
      key={i}
      className="px-1.5 py-0 rounded border text-[10px] whitespace-nowrap bg-stone-800 text-stone-300 border-stone-600"
    >
      {getEffectIcon(e.type)} {effectLabel(e)}
    </span>
  ));

  const usageChips = (usages: ReturnType<typeof findAssetUsages>) => usages.map((u, i) => (
    <span
      key={i}
      className={`text-[10px] px-1.5 py-0 rounded border whitespace-nowrap ${
        u.type === 'puzzle'
          ? 'bg-copper-900/40 text-copper-300 border-copper-700/50'
          : u.type === 'character'
            ? 'bg-arcane-900/40 text-arcane-300 border-arcane-700/50'
            : 'bg-red-900/40 text-red-300 border-red-700/50'
      }`}
    >
      {u.type === 'puzzle' ? '🧩' : u.type === 'character' ? '🛡' : u.type === 'vessel' ? '🏺' : '💀'} {u.name}
    </span>
  ));

  const rowActionButtons = (collectible: CustomCollectible) => (
    <>
      <InlineFolderPicker
        category="collectibles"
        currentFolderId={collectible.folderId}
        onFolderChange={(folderId) => handleFolderChange(collectible.id, folderId)}
      />
      <button
        onClick={(e) => handleDuplicate(collectible, e)}
        className="px-1 py-0.5 text-xs leading-none rounded border border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800"
        title="Duplicate"
      >
        ⎘
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleDelete(collectible.id);
        }}
        className="px-1 py-0.5 text-xs leading-none rounded border bg-red-900/40 text-red-300 border-red-700/50 hover:bg-red-900/60"
        title="Delete"
      >
        ✕
      </button>
    </>
  );

  const browseColumns: BrowseColumn<CustomCollectible>[] = [
    {
      key: 'sprite',
      label: '',
      sortable: false,
      className: 'w-10',
      render: (c) => (
        <div className="w-7 h-7 bg-stone-800 border border-stone-700 rounded flex items-center justify-center overflow-hidden">
          <SpriteThumbnail sprite={c.customSprite} size={28} />
        </div>
      ),
    },
    {
      key: 'name',
      label: 'Name',
      value: (c) => c.name || 'Unnamed',
      render: (c) => <span className="text-parchment-100">{c.name || 'Unnamed'}</span>,
    },
    {
      key: 'effects',
      label: 'Effects',
      value: (c) => getEffectSummary(c.effects),
      render: (c) => (
        c.effects.length === 0
          ? <span className="text-stone-600">None</span>
          : <div className="flex flex-wrap gap-1">{effectChips(c.effects)}</div>
      ),
    },
    {
      key: 'lifetime',
      label: 'Lifetime',
      align: 'right',
      value: (c) => c.duration || null,
      render: (c) => (
        c.duration
          ? <span className="text-xs text-stone-300">{c.duration} turns</span>
          : <span className="text-stone-500" title="Permanent">∞</span>
      ),
    },
    {
      key: 'pickup',
      label: 'Pickup',
      value: (c) => pickupLabel(c),
      render: (c) => (
        <span className="px-1.5 py-0 rounded border text-[10px] whitespace-nowrap bg-stone-800 text-stone-300 border-stone-600">
          {pickupLabel(c)}
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
      value: (c) => usagesByCollectible.get(c.id)?.length || null,
      render: (c) => {
        const usages = usagesByCollectible.get(c.id) ?? [];
        if (usages.length === 0) return <span className="text-stone-600">—</span>;
        return <div className="flex flex-wrap gap-1">{usageChips(usages)}</div>;
      },
    },
  ];

  // One ordering feeds the table, the sidebar list, and prev/next.
  const sort = useBrowseSort(filteredCollectibles, browseColumns, 'name');

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
      category="collectibles"
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

  const countLabel = (
    <span className="ml-1.5 text-xs font-sans text-stone-500">
      {filteredCollectibles.length}{filteredCollectibles.length !== collectibles.length && ` / ${collectibles.length}`}
    </span>
  );

  const bulkBar = (
    <BulkActionBar
      count={bulk.count}
      totalCount={filteredCollectibles.length}
      onSelectAll={() => bulk.selectAll(filteredCollectibles.map(c => c.id))}
      onClear={bulk.clear}
      onDelete={() => {
        const nameMap = new Map(collectibles.map(c => [c.id, c.name]));
        const deleted = bulkDelete([...bulk.selectedIds], 'collectible', deleteCollectible, nameMap);
        if (deleted.length) { refreshCollectibles(); bulk.clear(); if (selectedId && deleted.includes(selectedId)) { setSelectedId(null); setEditing(null); } }
      }}
      onMoveToFolder={() => {
        bulkMoveToFolder([...bulk.selectedIds], 'collectibles', (id: string) => collectibles.find(c => c.id === id), saveCollectible);
        refreshCollectibles(); bulk.clear();
      }}
      onExport={() => {
        const items = collectibles.filter(c => bulk.selectedIds.has(c.id));
        bulkExport(items, 'collectibles-export.json', 'collectible');
      }}
      onImport={() => bulkImport({
        assetType: 'collectible',
        saveFn: saveCollectible,
        existingIds: new Set(collectibles.map(c => c.id)),
        onComplete: () => { refreshCollectibles(); bulk.clear(); },
      })}
    />
  );

  return (
    <AssetEditorLayout
      isEditing={!!editing}
      onBack={handleBack}
      listTitle="Items"
      listPanel={
        <>
          <div className="flex justify-between items-center gap-2">
            <h2 className="text-lg font-medieval text-copper-400">
              Items
              {countLabel}
            </h2>
            {newButton}
          </div>

          {/* Search + folder filter share one row so the list starts higher */}
          <div className="flex items-center gap-1.5">
            {searchInput}
            <div className="w-32 flex-shrink-0">{folderFilter}</div>
          </div>

          {bulkBar}

          <div className="border border-stone-700 rounded max-h-[calc(100vh-250px)] overflow-y-auto overflow-x-hidden dense-scrollbar">
            {filteredCollectibles.length === 0 ? (
              <div className="px-2 py-4 text-center text-stone-500 text-sm">
                {searchTerm ? 'No matches' : 'No items yet — click "+ New" to create one.'}
              </div>
            ) : (
              sort.sorted.map(collectible => {
                const isSelected = selectedId === collectible.id;
                const usages = usagesByCollectible.get(collectible.id) ?? [];
                return (
                  <div
                    key={collectible.id}
                    className={`group px-2 py-1.5 cursor-pointer transition-colors border-t border-stone-700/60 first:border-t-0 ${
                      bulk.isSelected(collectible.id) ? 'bg-sky-900/40' :
                      isSelected
                        ? 'bg-copper-900/50'
                        : 'hover:bg-stone-800/50'
                    }`}
                    onClick={() => handleSelect(collectible.id)}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={bulk.isSelected(collectible.id)}
                        onChange={() => bulk.toggle(collectible.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-sky-500 flex-shrink-0"
                      />
                      <div className="w-7 h-7 bg-stone-800 border border-stone-700 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
                        <SpriteThumbnail sprite={collectible.customSprite} size={28} />
                      </div>
                      {/* Deliberately a div, not an h3: `.theme-root h3` sizes
                          every heading at 1.25x the theme heading size, and an
                          element selector outranks Tailwind's text-* utility —
                          an h3 here renders ~25px and truncates early. */}
                      <div className={`flex-1 min-w-0 truncate text-parchment-100 ${scaledNameClass(collectible.name || 'Unnamed')}`}>
                        {collectible.name || 'Unnamed'}
                      </div>
                      <div className={`flex items-center gap-1 flex-shrink-0 transition-opacity ${
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                      }`}>
                        <InlineFolderPicker
                          category="collectibles"
                          currentFolderId={collectible.folderId}
                          onFolderChange={(folderId) => handleFolderChange(collectible.id, folderId)}
                        />
                        <button
                          onClick={(e) => handleDuplicate(collectible, e)}
                          className="px-1 py-0.5 text-xs leading-none rounded border border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800"
                          title="Duplicate"
                        >
                          ⎘
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(collectible.id);
                          }}
                          className="px-1 py-0.5 text-xs leading-none rounded border bg-red-900/40 text-red-300 border-red-700/50 hover:bg-red-900/60"
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Meta line: what the item grants, how long it lasts and
                        who may take it. Indented to sit under the name. */}
                    <div className="flex flex-wrap items-center gap-1 mt-1 pl-[3.25rem]">
                      {collectible.effects.length === 0 ? (
                        <span className="text-[10px] text-stone-500 whitespace-nowrap">No effects</span>
                      ) : effectChips(collectible.effects)}
                      <span className="text-[10px] text-stone-500 whitespace-nowrap">
                        {collectible.duration ? `${collectible.duration} turns` : 'Permanent'}
                        <span className="text-stone-600"> · </span>
                        {pickupLabel(collectible)}
                      </span>
                      {usageChips(usages)}
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
            Items
            {countLabel}
          </h2>
          <div className="w-48">{searchInput}</div>
          <div className="w-40">{folderFilter}</div>
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
          onOpen={(c) => handleSelect(c.id)}
          selection={{ isSelected: bulk.isSelected, toggle: bulk.toggle }}
          rowActions={rowActionButtons}
          emptyMessage={searchTerm ? 'No matches' : 'No items yet — click "+ New" to create one.'}
        />
      }
      navigation={{
        items: sort.sorted.map(c => ({ id: c.id, name: c.name || 'Unnamed' })),
        currentId: selectedId,
        onSelect: (id) => handleSelect(id),
      }}
      detailPanel={editing ? (
        <>
          {/* Persistent Header */}
          <div className="border border-stone-700 rounded overflow-hidden">
            <div className="bg-stone-800 px-2 py-1.5 text-xs uppercase text-stone-400">Item</div>
            <div className="p-3 flex justify-between items-center gap-2">
              <div className="flex items-center gap-2 md:gap-4 min-w-0">
                <div className="flex w-10 h-10 md:w-16 md:h-16 bg-stone-700 rounded-pixel items-center justify-center overflow-hidden flex-shrink-0">
                  <SpriteThumbnail sprite={editing.customSprite} size={isMobile ? 40 : 64} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg md:text-2xl font-bold font-medieval text-copper-400 truncate">
                    {editing.name || 'Unnamed Item'}
                  </h2>
                  <p className="text-xs text-stone-400">{editing.effects?.length || 0} effect{(editing.effects?.length || 0) !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="flex gap-1.5 md:gap-2 flex-shrink-0">
                <button onClick={handleSave} className="dungeon-btn-success text-sm">
                  <span className="md:hidden">💾</span>
                  <span className="hidden md:inline">Save Item</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Basic Info */}
              <CollapsiblePanel title="Basic Info" className="space-y-3">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-stone-700 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
                    <SpriteThumbnail sprite={editing.customSprite} size={64} />
                  </div>
                  <div>
                    {/* div, not h3 — `.theme-root h3` would size this at 1.25x
                        the theme heading size and beat the text-lg utility. */}
                    <div className="text-lg font-bold text-parchment-200">{editing.name || 'Unnamed Item'}</div>
                    <p className="text-xs text-stone-400">{editing.effects.length > 0 ? `${editing.effects.length} effect${editing.effects.length !== 1 ? 's' : ''}` : 'No effects'}</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm mb-1">Name</label>
                  <input
                    type="text"
                    value={editing.name}
                    onChange={e => setEditing({ ...editing, name: e.target.value })}
                    className="w-full px-3 py-2 bg-stone-700 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Description</label>
                  <RichTextEditor
                    value={editing.description || ''}
                    onChange={(value) => setEditing({ ...editing, description: value })}
                    placeholder="Optional description..."
                    multiline
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Folder</label>
                  <select
                    value={editing.folderId || ''}
                    onChange={e => setEditing({ ...editing, folderId: e.target.value || undefined })}
                    className="w-full px-3 py-2 bg-stone-700 rounded"
                  >
                    <option value="">Uncategorized</option>
                    {getFolders('collectibles').map(folder => (
                      <option key={folder.id} value={folder.id}>{folder.name}</option>
                    ))}
                  </select>
                </div>
              </CollapsiblePanel>

              {/* Effects */}
              <CollapsiblePanel title="Effects">
                <div className="flex justify-end mb-4">
                  <button
                    onClick={addEffect}
                    className="px-3 py-1 text-sm bg-arcane-700 rounded hover:bg-arcane-600"
                  >
                    + Add Effect
                  </button>
                </div>
                <p className="text-xs text-stone-400 mb-3">
                  Effects are applied when the collectible is picked up. You can add multiple effects.
                </p>
                <div className="space-y-3">
                  {editing.effects.map((effect, index) => (
                    <CollectibleEffectEditor
                      key={index}
                      effect={effect}
                      onChange={(e) => updateEffect(index, e)}
                      onRemove={() => removeEffect(index)}
                    />
                  ))}
                  {editing.effects.length === 0 && (
                    <p className="text-stone-500 text-sm italic">
                      No effects. This collectible will be purely decorative.
                    </p>
                  )}
                </div>
              </CollapsiblePanel>

              {/* Duration */}
              <CollapsiblePanel title="Duration" className="space-y-3">
                <div>
                  <label className="block text-sm mb-1">Default Lifetime (turns)</label>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={editing.duration ?? 0}
                    onChange={e => setEditing({ ...editing, duration: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-stone-700 rounded"
                  />
                  <p className="text-xs text-stone-400 mt-1">
                    Turns before item despawns (0 = permanent). Can be overridden by Throw/Place spells.
                  </p>
                </div>
              </CollapsiblePanel>

              {/* Pickup Behavior */}
              <CollapsiblePanel title="Pickup Behavior" className="space-y-3">
                <div>
                  <label className="block text-sm mb-1">Pickup Method</label>
                  <select
                    value={editing.pickupMethod}
                    onChange={e => setEditing({ ...editing, pickupMethod: e.target.value as 'step_on' })}
                    className="w-full px-3 py-2 bg-stone-700 rounded"
                  >
                    <option value="step_on">Step On Tile (Automatic)</option>
                  </select>
                  <p className="text-xs text-stone-400 mt-1">Collected when an entity walks onto the tile</p>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm">Who Can Collect</label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editing.pickupPermissions.characters}
                      onChange={e => setEditing({
                        ...editing,
                        pickupPermissions: { ...editing.pickupPermissions, characters: e.target.checked }
                      })}
                      className="rounded"
                    />
                    <span>Characters (Players)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editing.pickupPermissions.enemies}
                      onChange={e => setEditing({
                        ...editing,
                        pickupPermissions: { ...editing.pickupPermissions, enemies: e.target.checked }
                      })}
                      className="rounded"
                    />
                    <span>Enemies</span>
                  </label>
                </div>
                <div className="pt-2 border-t border-stone-700">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editing.preventPlacement || false}
                      onChange={e => setEditing({ ...editing, preventPlacement: e.target.checked })}
                      className="rounded"
                    />
                    <span>Prevent Character Placement</span>
                  </label>
                  <p className="text-xs text-stone-400 mt-1 ml-6">
                    If enabled, characters cannot be placed on tiles with this collectible during setup (they can still walk over it)
                  </p>
                </div>
                <div className="pt-2 border-t border-stone-700">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editing.hideFromCompendium || false}
                      onChange={e => setEditing({ ...editing, hideFromCompendium: e.target.checked || undefined })}
                      className="rounded"
                    />
                    <span>Hide from the Slab</span>
                  </label>
                  <p className="text-xs text-stone-400 mt-1 ml-6">
                    No compendium page even when published — for showcase-only variants and the like.
                  </p>
                </div>
              </CollapsiblePanel>

              {/* Sound */}
              <CollapsiblePanel title="Sound" className="space-y-3">
                <div>
                  <label className="block text-sm mb-1">Pickup Sound</label>
                  <select
                    value={editing.pickupSound || ''}
                    onChange={e => setEditing({ ...editing, pickupSound: e.target.value || undefined })}
                    className="w-full px-3 py-2 bg-stone-700 rounded"
                  >
                    <option value="">None</option>
                    {getSoundAssets().map(sound => (
                      <option key={sound.id} value={sound.id}>{sound.name}</option>
                    ))}
                  </select>
                </div>
              </CollapsiblePanel>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Sprite */}
              <CollapsiblePanel title="Sprite">
                <StaticSpriteEditor
                  sprite={editing.customSprite || {
                    id: 'sprite_' + Date.now(),
                    name: 'Collectible Sprite',
                    type: 'simple',
                    shape: 'star',
                    primaryColor: '#ffd700',
                    size: 0.6,
                    createdAt: new Date().toISOString(),
                  }}
                  onChange={updateSprite}
                />
              </CollapsiblePanel>

            </div>
          </div>
        </>
      ) : null}
      emptyState={
        <div className="border border-stone-700 rounded p-6 text-center">
          <h2 className="text-lg font-medieval text-copper-400 mb-2">Item Editor</h2>
          <p className="text-sm text-stone-400 mb-4">
            Create collectible items with custom sprites and effects.
            <br />
            Select an item from the list or create a new one.
          </p>
          <button
            onClick={handleNew}
            className="dungeon-btn-success text-sm px-3 py-1.5"
          >
            + Create New Item
          </button>
        </div>
      }
    />
  );
};

// Sub-component for editing individual effects
const CollectibleEffectEditor: React.FC<{
  effect: CollectibleEffectConfig;
  onChange: (effect: CollectibleEffectConfig) => void;
  onRemove: () => void;
}> = ({ effect, onChange, onRemove }) => {
  const statusEffects = getStatusEffectAssets();

  return (
    <div className="bg-stone-700 rounded p-3">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{getEffectIcon(effect.type)}</span>
          <select
            value={effect.type}
            onChange={(e) => {
              const newType = e.target.value as CollectibleEffectType;
              // Reset type-specific fields when changing type
              const newEffect: CollectibleEffectConfig = { type: newType };
              if (newType === 'score') newEffect.scoreValue = 10;
              if (newType === 'heal' || newType === 'damage') newEffect.amount = 1;
              onChange(newEffect);
            }}
            className="px-2 py-1 bg-stone-600 rounded text-sm"
          >
            {EFFECT_TYPES.map(et => (
              <option key={et.value} value={et.value}>{et.icon} {et.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={onRemove}
          className="px-2 py-1 text-xs bg-blood-700 rounded hover:bg-blood-600"
        >
          Remove
        </button>
      </div>

      {/* Type-specific fields */}
      {effect.type === 'score' && (
        <div>
          <label className="block text-xs text-stone-400 mb-1">Score Value</label>
          <input
            type="number"
            min="0"
            value={effect.scoreValue ?? 10}
            onChange={(e) => onChange({ ...effect, scoreValue: Number(e.target.value) })}
            className="w-full px-2 py-1 bg-stone-600 rounded text-sm"
          />
        </div>
      )}

      {effect.type === 'status_effect' && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-stone-400 mb-1">Status Effect</label>
            <select
              value={effect.statusAssetId ?? ''}
              onChange={(e) => onChange({ ...effect, statusAssetId: e.target.value || undefined })}
              className="w-full px-2 py-1 bg-stone-600 rounded text-sm"
            >
              <option value="">Select effect...</option>
              {statusEffects.map(se => (
                <option key={se.id} value={se.id}>{se.name}</option>
              ))}
            </select>
            {statusEffects.length === 0 && (
              <p className="text-xs text-yellow-400 mt-1">
                No status effects found. Create some in the Status Effects editor first.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-stone-400 mb-1">Duration (turns)</label>
              <input
                type="number"
                min="1"
                value={effect.statusDuration ?? ''}
                placeholder="Default"
                onChange={(e) => onChange({ ...effect, statusDuration: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full px-2 py-1 bg-stone-600 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">Value</label>
              <input
                type="number"
                value={effect.statusValue ?? ''}
                placeholder="Default"
                onChange={(e) => onChange({ ...effect, statusValue: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full px-2 py-1 bg-stone-600 rounded text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {effect.type === 'win_key' && (
        <div>
          <label className="block text-xs text-stone-400 mb-1">Key ID (optional)</label>
          <input
            type="text"
            value={effect.keyId ?? ''}
            placeholder="Auto-generated"
            onChange={(e) => onChange({ ...effect, keyId: e.target.value || undefined })}
            className="w-full px-2 py-1 bg-stone-600 rounded text-sm"
          />
          <p className="text-xs text-stone-500 mt-1">
            Leave blank to count all win_key collectibles together for the "collect_keys" win condition.
          </p>
        </div>
      )}

      {(effect.type === 'heal' || effect.type === 'damage') && (
        <div>
          <label className="block text-xs text-stone-400 mb-1">
            {effect.type === 'heal' ? 'Heal Amount' : 'Damage Amount'}
          </label>
          <input
            type="number"
            min="1"
            value={effect.amount ?? 1}
            onChange={(e) => onChange({ ...effect, amount: Number(e.target.value) })}
            className="w-full px-2 py-1 bg-stone-600 rounded text-sm"
          />
          {effect.type === 'damage' && (
            <p className="text-xs text-stone-500 mt-1">
              Creates a trap collectible that harms whoever picks it up.
            </p>
          )}
        </div>
      )}

      {effect.type === 'redirect' && (
        <>
          <div>
            <label className="block text-xs text-stone-400 mb-1">Redirect Mode</label>
            <select
              value={effect.redirectMode ?? 'clockwise'}
              onChange={(e) => {
                const mode = e.target.value as 'clockwise' | 'counter_clockwise' | 'fixed';
                const updates: CollectibleEffectConfig = { ...effect, redirectMode: mode };
                if (mode === 'fixed' && !effect.redirectFixedDirection) {
                  updates.redirectFixedDirection = Direction.NORTH;
                }
                onChange(updates);
              }}
              className="w-full px-2 py-1 bg-stone-600 rounded text-sm"
            >
              <option value="clockwise">Rotate Clockwise (Relative to Facing)</option>
              <option value="counter_clockwise">Rotate Counter-Clockwise (Relative to Facing)</option>
              <option value="fixed">Set to Fixed Direction</option>
            </select>
          </div>

          {(effect.redirectMode === 'clockwise' || effect.redirectMode === 'counter_clockwise' || !effect.redirectMode) && (
            <div>
              <label className="block text-xs text-stone-400 mb-1">Rotation Angle</label>
              <select
                value={effect.redirectAngle ?? 90}
                onChange={(e) => onChange({ ...effect, redirectAngle: parseInt(e.target.value) as 45 | 90 | 135 | 180 })}
                className="w-full px-2 py-1 bg-stone-600 rounded text-sm"
              >
                <option value={45}>45° (one step)</option>
                <option value={90}>90° (quarter turn)</option>
                <option value={135}>135° (three steps)</option>
                <option value={180}>180° (reverse)</option>
              </select>
            </div>
          )}

          {effect.redirectMode === 'fixed' && (
            <div>
              <label className="block text-xs text-stone-400 mb-1">Fixed Direction</label>
              <select
                value={(effect.redirectFixedDirection as string) ?? 'north'}
                onChange={(e) => onChange({ ...effect, redirectFixedDirection: e.target.value as Direction })}
                className="w-full px-2 py-1 bg-stone-600 rounded text-sm"
              >
                <option value="north">North</option>
                <option value="northeast">Northeast</option>
                <option value="east">East</option>
                <option value="southeast">Southeast</option>
                <option value="south">South</option>
                <option value="southwest">Southwest</option>
                <option value="west">West</option>
                <option value="northwest">Northwest</option>
              </select>
            </div>
          )}

          <p className="text-xs text-stone-500 mt-1">
            Changes the picking entity's facing direction on pickup.
          </p>
        </>
      )}
    </div>
  );
};

export default CollectibleEditor;
