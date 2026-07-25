import React, { useState, useEffect, useMemo } from 'react';
import { findAssetUsages, formatUsageWarning } from '../../utils/assetDependencies';
import { scaledNameClass } from '../../utils/textScale';
import type { StatusEffectAsset } from '../../types/game';
import { StatusEffectType } from '../../types/game';
import { getStatusEffectAssets, deleteStatusEffectAsset, saveStatusEffectAsset, getFolders, type CustomSprite } from '../../utils/assetStorage';
import { StatusEffectEditor } from './StatusEffectEditor';
import { AssetEditorLayout } from './AssetEditorLayout';
import { AssetBrowseTable, useBrowseSort, type BrowseColumn } from './AssetBrowseTable';
import { UsageChips, usageSortValue } from './UsageChips';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';
import { SpriteThumbnail } from './SpriteThumbnail';
import { useBulkSelect, BulkActionBar, bulkDelete, bulkMoveToFolder, bulkExport, bulkImport } from './BulkActions';
import { newAssetId } from '../../utils/assetIds';

// Get display color for status effect type
function getEffectTypeColor(type: StatusEffectType): string {
  switch (type) {
    case StatusEffectType.POISON: return 'bg-moss-700';
    case StatusEffectType.BURN: return 'bg-orange-600';
    case StatusEffectType.BLEED: return 'bg-blood-700';
    case StatusEffectType.REGEN: return 'bg-emerald-600';
    case StatusEffectType.STUN: return 'bg-yellow-600';
    case StatusEffectType.SLEEP: return 'bg-indigo-600';
    case StatusEffectType.SLOW: return 'bg-arcane-700';
    case StatusEffectType.SILENCED: return 'bg-purple-600';
    case StatusEffectType.DISARMED: return 'bg-stone-600';
    case StatusEffectType.POLYMORPH: return 'bg-pink-600';
    case StatusEffectType.STEALTH: return 'bg-gray-600';
    default: return 'bg-stone-600';
  }
}

export const StatusEffectLibrary: React.FC<{ initialSelectedId?: string }> = ({ initialSelectedId }) => {
  const [effects, setEffects] = useState<StatusEffectAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingEffect, setEditingEffect] = useState<StatusEffectAsset | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const bulk = useBulkSelect();

  const loadEffects = () => {
    setEffects(getStatusEffectAssets());
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadEffects();
  }, []);

  const handleSelect = (effect: StatusEffectAsset) => {
    setSelectedId(effect.id);
    setEditingEffect(effect);
    setIsCreating(false);
  };

  useEffect(() => {
    if (initialSelectedId) {
      const effect = effects.find(e => e.id === initialSelectedId);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (effect) handleSelect(effect);
    }
  }, [initialSelectedId, effects]);

  const handleNew = () => {
    setSelectedId(null);
    setEditingEffect(null);
    setIsCreating(true);
  };

  const handleDelete = (effectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const usages = findAssetUsages('status_effect', effectId);
    const warning = usages.length > 0 ? `\n\n${formatUsageWarning(usages)}` : '';
    if (!confirm(`Delete this status effect?${warning}`)) return;
    deleteStatusEffectAsset(effectId);
    loadEffects();
    if (selectedId === effectId) {
      setSelectedId(null);
      setEditingEffect(null);
    }
  };

  const handleFolderChange = (effectId: string, folderId: string | undefined) => {
    const effect = effects.find(ef => ef.id === effectId);
    if (effect) {
      saveStatusEffectAsset({ ...effect, folderId });
      loadEffects();
      if (editingEffect && editingEffect.id === effectId) {
        setEditingEffect({ ...editingEffect, folderId });
      }
    }
  };

  const handleDuplicate = (effect: StatusEffectAsset, e: React.MouseEvent) => {
    e.stopPropagation();
    const duplicated: StatusEffectAsset = {
      ...effect,
      id: newAssetId('status'),
      name: effect.name + ' (Copy)',
      createdAt: new Date().toISOString(),
    };
    setEditingEffect(duplicated);
    setSelectedId(null);
    setIsCreating(true);
  };

  const handleSave = () => {
    loadEffects();
    if (editingEffect) {
      setSelectedId(editingEffect.id);
    }
    setIsCreating(false);
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingEffect(null);
    setSelectedId(null);
  };

  // Filter effects based on folder and search term
  const folderFilteredEffects = useFilteredAssets(effects, selectedFolderId);
  const filteredEffects = folderFilteredEffects.filter(effect =>
    effect.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    effect.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleBack = () => handleCancel();

  const folderNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of getFolders('status_effects')) map.set(f.id, f.name);
    return map;
  }, [effects]); // eslint-disable-line react-hooks/exhaustive-deps -- folders change alongside asset edits

  // Computed once per load, not per render and not per sort comparison —
  // findAssetUsages scans every other asset, so calling it inside a
  // comparator would rescan the library O(n log n) times.
  const usagesByEffect = useMemo(() => {
    const map = new Map<string, ReturnType<typeof findAssetUsages>>();
    for (const e of effects) map.set(e.id, findAssetUsages('status_effect', e.id));
    return map;
  }, [effects]);

  /** Fixed 28px icon: the effect's own sprite, or a type-coloured initial. */
  const effectIcon = (effect: StatusEffectAsset) =>
    effect.iconSprite?.type === 'inline' && effect.iconSprite.spriteData ? (
      <div className="w-7 h-7 flex-shrink-0">
        <SpriteThumbnail sprite={effect.iconSprite.spriteData as CustomSprite} size={28} />
      </div>
    ) : (
      <div
        className={`${getEffectTypeColor(effect.type)} w-7 h-7 rounded flex items-center justify-center flex-shrink-0 text-xs`}
      >
        <span className="text-white font-bold">
          {effect.type.charAt(0).toUpperCase()}
        </span>
      </div>
    );

  const stackingLabel = (effect: StatusEffectAsset) =>
    effect.stackingBehavior === 'stack' && effect.maxStacks
      ? `${effect.stackingBehavior} ×${effect.maxStacks}`
      : effect.stackingBehavior;

  const rowActionButtons = (effect: StatusEffectAsset) => (
    <>
      <InlineFolderPicker
        category="status_effects"
        currentFolderId={effect.folderId}
        onFolderChange={(folderId) => handleFolderChange(effect.id, folderId)}
      />
      <button
        onClick={(e) => handleDuplicate(effect, e)}
        className="px-1 py-0.5 text-xs leading-none rounded border border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800"
        title="Duplicate"
      >
        ⎘
      </button>
      <button
        onClick={(e) => handleDelete(effect.id, e)}
        className="px-1 py-0.5 text-xs leading-none rounded border bg-red-900/40 text-red-300 border-red-700/50 hover:bg-red-900/60"
        title="Delete"
      >
        ✕
      </button>
    </>
  );

  const browseColumns: BrowseColumn<StatusEffectAsset>[] = [
    {
      key: 'icon',
      label: '',
      sortable: false,
      className: 'w-10',
      render: (e) => effectIcon(e),
    },
    {
      key: 'name',
      label: 'Name',
      value: (e) => e.name || 'Unnamed',
      render: (e) => <span className="text-parchment-100">{e.name || 'Unnamed'}</span>,
    },
    {
      key: 'type',
      label: 'Type',
      value: (e) => e.type,
      render: (e) => (
        <span className={`${getEffectTypeColor(e.type)} px-1.5 py-0 rounded text-[10px] whitespace-nowrap text-white capitalize`}>
          {e.type.replace('_', ' ')}
        </span>
      ),
    },
    { key: 'duration', label: 'Dur', align: 'right', value: (e) => e.defaultDuration ?? null },
    { key: 'value', label: 'Val', align: 'right', value: (e) => e.defaultValue ?? null },
    {
      key: 'stacking',
      label: 'Stacking',
      value: (e) => e.stackingBehavior,
      render: (e) => (
        <span className="px-1.5 py-0 rounded border text-[10px] whitespace-nowrap bg-stone-800 text-stone-300 border-stone-600 capitalize">
          {stackingLabel(e)}
        </span>
      ),
    },
    {
      key: 'folder',
      label: 'Folder',
      value: (e) => (e.folderId ? folderNames.get(e.folderId) ?? null : null),
      render: (e) => {
        const name = e.folderId ? folderNames.get(e.folderId) : undefined;
        return name
          ? <span className="text-xs text-stone-400">{name}</span>
          : <span className="text-stone-600">—</span>;
      },
    },
    {
      key: 'usedBy',
      label: 'Used by',
      value: (e) => usageSortValue(usagesByEffect.get(e.id)),
      render: (e) => <UsageChips usages={usagesByEffect.get(e.id) ?? []} />,
    },
  ];

  // One ordering feeds the table, the sidebar list, and prev/next.
  const sort = useBrowseSort(filteredEffects, browseColumns, 'name');

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
      category="status_effects"
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
    assetType: 'status_effect',
    saveFn: saveStatusEffectAsset,
    existingIds: new Set(effects.map(e => e.id)),
    onComplete: () => { loadEffects(); bulk.clear(); },
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
      {filteredEffects.length}{filteredEffects.length !== effects.length && ` / ${effects.length}`}
    </span>
  );

  const bulkBar = (
    <BulkActionBar
      count={bulk.count}
      totalCount={filteredEffects.length}
      onSelectAll={() => bulk.selectAll(filteredEffects.map(e => e.id))}
      onClear={bulk.clear}
      onDelete={() => {
        const nameMap = new Map(effects.map(e => [e.id, e.name]));
        const deleted = bulkDelete([...bulk.selectedIds], 'status_effect', deleteStatusEffectAsset, nameMap);
        if (deleted.length) { loadEffects(); bulk.clear(); if (selectedId && deleted.includes(selectedId)) { setSelectedId(null); setEditingEffect(null); } }
      }}
      onMoveToFolder={() => {
        bulkMoveToFolder([...bulk.selectedIds], 'status_effects', (id: string) => effects.find(e => e.id === id), saveStatusEffectAsset);
        loadEffects(); bulk.clear();
      }}
      onExport={() => {
        const items = effects.filter(e => bulk.selectedIds.has(e.id));
        bulkExport(items, 'status-effects-export.json', 'status_effect');
      }}
      onImport={handleImport}
    />
  );

  return (
    <AssetEditorLayout
      isEditing={isCreating || !!editingEffect}
      onBack={handleBack}
      listTitle="Status Effects"
      listPanel={
        <>
          <div className="flex justify-between items-center gap-2">
            <h2 className="text-lg font-medieval text-copper-400">
              Status Effects
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
            {filteredEffects.length === 0 ? (
              <div className="px-2 py-4 text-center text-stone-500 text-sm">
                {searchTerm ? 'No matches' : 'No status effects yet — click "+ New" to create one.'}
              </div>
            ) : (
              sort.sorted.map(effect => {
                const isSelected = selectedId === effect.id;
                const usages = usagesByEffect.get(effect.id) ?? [];
                return (
                  <div
                    key={effect.id}
                    className={`group px-2 py-1.5 cursor-pointer transition-colors border-t border-stone-700/60 first:border-t-0 ${
                      bulk.isSelected(effect.id) ? 'bg-sky-900/40' :
                      isSelected
                        ? 'bg-copper-900/50'
                        : 'hover:bg-stone-800/50'
                    }`}
                    onClick={() => handleSelect(effect)}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={bulk.isSelected(effect.id)}
                        onChange={() => bulk.toggle(effect.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-sky-500 flex-shrink-0"
                      />
                      {effectIcon(effect)}
                      {/* Name owns the full remaining width; actions only take
                          space once the row is hovered, focused, or selected. */}
                      {/* Deliberately a div, not an h3: `.theme-root h3` sizes
                          every heading at 1.25x the theme heading size in the
                          theme face, and an element selector outranks
                          Tailwind's text-* utility — an h3 here renders ~25px
                          and truncates after a few characters. */}
                      <div className={`flex-1 min-w-0 truncate text-parchment-100 ${scaledNameClass(effect.name || 'Unnamed')}`}>
                        {effect.name || 'Unnamed'}
                      </div>
                      <div className={`flex items-center gap-1 flex-shrink-0 transition-opacity ${
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                      }`}>
                        <InlineFolderPicker
                          category="status_effects"
                          currentFolderId={effect.folderId}
                          onFolderChange={(folderId) => handleFolderChange(effect.id, folderId)}
                        />
                        <button
                          onClick={(e) => handleDuplicate(effect, e)}
                          className="px-1 py-0.5 text-xs leading-none rounded border border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800"
                          title="Duplicate"
                        >
                          ⎘
                        </button>
                        <button
                          onClick={(e) => handleDelete(effect.id, e)}
                          className="px-1 py-0.5 text-xs leading-none rounded border bg-red-900/40 text-red-300 border-red-700/50 hover:bg-red-900/60"
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Meta line: type as a chip, then the numbers that differ
                        between effects. Indented to sit under the name. */}
                    <div className="flex flex-wrap items-center gap-1 mt-1 pl-[3.25rem]">
                      <span className={`${getEffectTypeColor(effect.type)} px-1.5 py-0 rounded text-[10px] whitespace-nowrap text-white capitalize`}>
                        {effect.type.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-stone-500 whitespace-nowrap">
                        Dur {effect.defaultDuration}
                        {effect.defaultValue ? <><span className="text-stone-600"> · </span>Val {effect.defaultValue}</> : null}
                        <span className="text-stone-600"> · </span>
                        <span className="capitalize">{stackingLabel(effect)}</span>
                      </span>
                      <UsageChips usages={usages} hideWhenEmpty />
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
            Status Effects
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
          onOpen={handleSelect}
          selection={{ isSelected: bulk.isSelected, toggle: bulk.toggle }}
          rowActions={rowActionButtons}
          emptyMessage={searchTerm ? 'No matches' : 'No status effects yet — click "+ New" to create one.'}
        />
      }
      navigation={{
        items: sort.sorted.map(e => ({ id: e.id, name: e.name || 'Unnamed' })),
        currentId: selectedId,
        onSelect: (id) => {
          const effect = effects.find(e => e.id === id);
          if (effect) handleSelect(effect);
        },
      }}
      detailPanel={
        <>
          <StatusEffectEditor
            key={editingEffect?.id || 'new'}
            effect={editingEffect || undefined}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </>
      }
      emptyState={
        <div className="border border-stone-700 rounded p-6 text-center">
          <h2 className="text-lg font-medieval text-copper-400 mb-2">Status Effect Editor</h2>
          <p className="text-sm text-stone-400 mb-4">
            Create status effects that can be applied by spells.
            <br />
            Effects like poison, stun, sleep, and more can be configured here.
            <br />
            Select an effect from the list or create a new one.
          </p>
          <button
            onClick={handleNew}
            className="px-3 py-1.5 bg-moss-700 rounded text-sm hover:bg-moss-600"
          >
            + Create New Status Effect
          </button>
        </div>
      }
    />
  );
};
