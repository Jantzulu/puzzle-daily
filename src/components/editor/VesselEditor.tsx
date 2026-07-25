import React, { useState, useMemo } from 'react';
import { toast } from '../shared/Toast';
import { findAssetUsages, formatUsageWarning } from '../../utils/assetDependencies';
import { scaledNameClass } from '../../utils/textScale';
import { Direction } from '../../types/game';
import type { HitStampKind } from '../../types/game';
import type { CustomVessel, CustomSprite } from '../../utils/assetStorage';
import { saveVessel, deleteVessel, getCustomVessels, getAllCollectibles, getFolders } from '../../utils/assetStorage';
import { getAllEnemies } from '../../data/enemies';
import { SpriteEditor } from './SpriteEditor';
import { SpriteThumbnail } from './SpriteThumbnail';
import { RichTextEditor } from './RichTextEditor';
import { AssetEditorLayout } from './AssetEditorLayout';
import { AssetBrowseTable, useBrowseSort, type BrowseColumn } from './AssetBrowseTable';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';
import { CollapsiblePanel } from './CollapsiblePanel';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { newAssetId, newSpriteId } from '../../utils/assetIds';

const FACING_OPTIONS: { value: Direction; label: string }[] = [
  { value: Direction.NORTH, label: '↑ North' },
  { value: Direction.NORTHEAST, label: '↗ North-East' },
  { value: Direction.EAST, label: '→ East' },
  { value: Direction.SOUTHEAST, label: '↘ South-East' },
  { value: Direction.SOUTH, label: '↓ South' },
  { value: Direction.SOUTHWEST, label: '↙ South-West' },
  { value: Direction.WEST, label: '← West' },
  { value: Direction.NORTHWEST, label: '↖ North-West' },
];

const HIT_KIND_OPTIONS: { value: HitStampKind; label: string }[] = [
  { value: 'melee', label: 'Melee' },
  { value: 'projectile', label: 'Projectile' },
  { value: 'contact', label: 'Contact' },
  { value: 'any', label: 'Any hit' },
];

/**
 * Vessel Editor — breakable static entities (docs/feature-backlog.md):
 * barrels, urns, mimic chests, hatching eggs. Variable HP, idle + death
 * animations only, optional transform into a nested enemy on break, on a
 * timer, on proximity, or when struck by a chosen hit kind. Vessels resolve
 * through the enemy pipeline in-game, so this editor only authors what a
 * vessel actually uses.
 */
export const VesselEditor: React.FC<{ initialSelectedId?: string }> = ({ initialSelectedId }) => {
  const isMobile = useIsMobile();
  const [vessels, setVessels] = useState<CustomVessel[]>(getCustomVessels);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomVessel | null>(() => {
    if (!initialSelectedId) return null;
    return getCustomVessels().find(v => v.id === initialSelectedId) ?? null;
  });
  const [activeTab, setActiveTab] = useState<'details' | 'sprite'>('details');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const folderFilteredVessels = useFilteredAssets(vessels, selectedFolderId);
  const filteredVessels = folderFilteredVessels.filter(v =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (id: string) => {
    const vessel = vessels.find(v => v.id === id);
    if (vessel) {
      setSelectedId(id);
      setEditing({ ...vessel });
      setActiveTab('details');
    }
  };

  const handleNew = () => {
    const newVessel: CustomVessel = {
      id: newAssetId('vessel'),
      name: 'New Vessel',
      health: 1,
      customSprite: {
        id: newSpriteId(),
        name: 'Custom Sprite',
        type: 'simple',
        shape: 'square',
        primaryColor: '#8d6e63',
        secondaryColor: '#5d4037',
        size: 0.6,
        createdAt: new Date().toISOString(),
      },
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
    setEditing(newVessel);
    setSelectedId(null);
    setActiveTab('details');
  };

  const handleSave = () => {
    if (!editing) return;
    saveVessel(editing);
    setVessels(getCustomVessels());
    setSelectedId(editing.id);
    toast.success(`Saved "${editing.name}"!`);
  };

  const handleDelete = (id: string) => {
    const usages = findAssetUsages('vessel', id);
    const warning = usages.length > 0 ? `\n\n${formatUsageWarning(usages)}` : '';
    if (!confirm(`Delete this vessel?${warning}`)) return;
    deleteVessel(id);
    setVessels(getCustomVessels());
    if (selectedId === id) {
      setSelectedId(null);
      setEditing(null);
    }
  };

  const handleDuplicate = (vessel: CustomVessel, e: React.MouseEvent) => {
    e.stopPropagation();
    const duplicated: CustomVessel = {
      ...vessel,
      id: newAssetId('vessel'),
      name: vessel.name + ' (Copy)',
      customSprite: vessel.customSprite ? { ...vessel.customSprite, id: newSpriteId() } : undefined,
      createdAt: new Date().toISOString(),
    };
    setEditing(duplicated);
    setSelectedId(null);
  };

  const updateVessel = (updates: Partial<CustomVessel>) => {
    if (!editing) return;
    setEditing({ ...editing, ...updates });
  };

  const updateSprite = (sprite: CustomSprite) => {
    if (!editing) return;
    setEditing({ ...editing, customSprite: sprite });
  };

  const handleBack = () => {
    setSelectedId(null);
    setEditing(null);
  };

  // Name lookups are memoized so a table of N vessels doesn't rescan the whole
  // enemy/collectible library once per row.
  const enemyNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of getAllEnemies()) map.set(e.id, e.name);
    return map;
  }, [vessels]); // eslint-disable-line react-hooks/exhaustive-deps -- enemies change alongside asset edits

  const collectibleNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of getAllCollectibles()) map.set(c.id, c.name);
    return map;
  }, [vessels]); // eslint-disable-line react-hooks/exhaustive-deps -- collectibles change alongside asset edits

  const folderNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of getFolders('vessels')) map.set(f.id, f.name);
    return map;
  }, [vessels]); // eslint-disable-line react-hooks/exhaustive-deps -- folders change alongside asset edits

  const handleFolderChange = (vesselId: string, folderId: string | undefined) => {
    const vessel = vessels.find(v => v.id === vesselId);
    if (!vessel) return;
    saveVessel({ ...vessel, folderId });
    setVessels(getCustomVessels());
    if (editing && editing.id === vesselId) {
      setEditing({ ...editing, folderId });
    }
  };

  const transformTargetName = (id?: string) =>
    id ? (enemyNames.get(id) ?? id) : undefined;

  // Computed once per load, not per render and not per sort comparison —
  // findAssetUsages scans every other asset, so calling it inside a
  // comparator would rescan the library O(n log n) times.
  const usagesByVessel = useMemo(() => {
    const map = new Map<string, ReturnType<typeof findAssetUsages>>();
    for (const v of vessels) map.set(v.id, findAssetUsages('vessel', v.id));
    return map;
  }, [vessels]);

  /** Which of the four hatch triggers this vessel actually has configured. */
  const hatchTriggers = (vessel: CustomVessel): string[] => {
    if (!vessel.transformEnemyId) return [];
    const list: string[] = [];
    if (vessel.transformOnBreak !== false) list.push('break');
    if ((vessel.transformAfterTurns ?? 0) > 0) list.push(`${vessel.transformAfterTurns}t timer`);
    if ((vessel.transformProximityRange ?? 0) > 0) {
      list.push(`prox ${vessel.transformProximityRange} (${vessel.transformProximityParty ?? 'hero'})`);
    }
    if (vessel.transformOnHitKinds?.length) list.push(`hit: ${vessel.transformOnHitKinds.join('/')}`);
    return list;
  };

  const vesselThumb = (vessel: CustomVessel) => (
    <div className="w-7 h-7 bg-stone-600 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
      <SpriteThumbnail sprite={vessel.customSprite} size={28} previewType="entity" fillBox />
    </div>
  );

  const rowActionButtons = (vessel: CustomVessel) => (
    <>
      <InlineFolderPicker
        category="vessels"
        currentFolderId={vessel.folderId}
        onFolderChange={(folderId) => handleFolderChange(vessel.id, folderId)}
      />
      <button
        onClick={(e) => handleDuplicate(vessel, e)}
        className="px-1 py-0.5 text-xs leading-none rounded border border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800"
        title="Duplicate"
      >
        ⎘
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); handleDelete(vessel.id); }}
        className="px-1 py-0.5 text-xs leading-none rounded border bg-red-900/40 text-red-300 border-red-700/50 hover:bg-red-900/60"
        title="Delete"
      >
        ✕
      </button>
    </>
  );

  const browseColumns: BrowseColumn<CustomVessel>[] = [
    {
      key: 'sprite',
      label: '',
      sortable: false,
      className: 'w-10',
      render: (v) => vesselThumb(v),
    },
    {
      key: 'name',
      label: 'Name',
      value: (v) => v.name || 'Unnamed',
      render: (v) => <span className="text-parchment-100">{v.name || 'Unnamed'}</span>,
    },
    { key: 'health', label: 'HP', align: 'right', value: (v) => v.health },
    {
      key: 'holds',
      label: 'Holds',
      value: (v) => (v.transformEnemyId ? transformTargetName(v.transformEnemyId) ?? null : null),
      render: (v) => {
        const name = v.transformEnemyId ? transformTargetName(v.transformEnemyId) : undefined;
        return name
          ? <span className="px-1.5 py-0 rounded border text-[10px] whitespace-nowrap bg-red-900/40 text-red-300 border-red-700/50">💀 {name}</span>
          : <span className="text-stone-600">—</span>;
      },
    },
    {
      key: 'hatch',
      label: 'Hatches on',
      value: (v) => hatchTriggers(v).join(', ') || null,
      render: (v) => {
        const triggers = hatchTriggers(v);
        if (triggers.length === 0) return <span className="text-stone-600">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {triggers.map((t, i) => (
              <span
                key={i}
                className="px-1.5 py-0 rounded border text-[10px] whitespace-nowrap bg-stone-800 text-stone-300 border-stone-600"
              >
                {t}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: 'drops',
      label: 'Drops',
      value: (v) => (v.droppedCollectibleId ? collectibleNames.get(v.droppedCollectibleId) ?? v.droppedCollectibleId : null),
      render: (v) => {
        const name = v.droppedCollectibleId
          ? collectibleNames.get(v.droppedCollectibleId) ?? v.droppedCollectibleId
          : undefined;
        return name
          ? <span className="text-xs text-stone-400">{name}</span>
          : <span className="text-stone-600">—</span>;
      },
    },
    {
      key: 'folder',
      label: 'Folder',
      value: (v) => (v.folderId ? folderNames.get(v.folderId) ?? null : null),
      render: (v) => {
        const name = v.folderId ? folderNames.get(v.folderId) : undefined;
        return name
          ? <span className="text-xs text-stone-400">{name}</span>
          : <span className="text-stone-600">—</span>;
      },
    },
    {
      key: 'usedBy',
      label: 'Used by',
      value: (v) => usagesByVessel.get(v.id)?.length || null,
      render: (v) => {
        const usages = usagesByVessel.get(v.id) ?? [];
        if (usages.length === 0) return <span className="text-stone-600">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {usages.map((u, i) => (
              <span
                key={i}
                className="text-[10px] px-1.5 py-0 rounded border whitespace-nowrap bg-arcane-900/40 text-arcane-300 border-arcane-700/50"
              >
                {u.name}
              </span>
            ))}
          </div>
        );
      },
    },
  ];

  // One ordering feeds the table, the sidebar list, and prev/next.
  const sort = useBrowseSort(filteredVessels, browseColumns, 'name');

  const searchInput = (
    <input
      type="text"
      placeholder="Search..."
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      className="flex-1 min-w-0 bg-stone-800 border border-stone-700 rounded px-2 py-1 text-xs text-parchment-100 placeholder-stone-500 focus:outline-none focus:border-arcane-500"
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

  const folderFilter = (
    <FolderDropdown
      category="vessels"
      selectedFolderId={selectedFolderId}
      onFolderSelect={setSelectedFolderId}
    />
  );

  const countLabel = (
    <span className="ml-1.5 text-xs font-sans text-stone-500">
      {filteredVessels.length}{filteredVessels.length !== vessels.length && ` / ${vessels.length}`}
    </span>
  );

  return (
    <AssetEditorLayout
      isEditing={!!editing}
      onBack={handleBack}
      listTitle="Vessels"
      listPanel={
        <>
          <div className="flex justify-between items-center gap-2">
            <h2 className="text-lg font-medieval text-copper-400">
              Vessels
              {countLabel}
            </h2>
            {newButton}
          </div>

          <div className="flex items-center gap-1.5">
            {searchInput}
            <div className="w-32 flex-shrink-0">{folderFilter}</div>
          </div>

          <div className="border border-stone-700 rounded max-h-[calc(100vh-250px)] overflow-y-auto overflow-x-hidden dense-scrollbar">
            {filteredVessels.length === 0 ? (
              <div className="px-2 py-4 text-center text-stone-500 text-sm">
                {searchTerm ? 'No vessels match your search.' : 'No vessels yet — click "+ New" to create one.'}
              </div>
            ) : (
              sort.sorted.map(vessel => {
                const isSelected = selectedId === vessel.id;
                const triggers = hatchTriggers(vessel);
                return (
                  <div
                    key={vessel.id}
                    className={`group px-2 py-1.5 cursor-pointer transition-colors border-t border-stone-700/60 first:border-t-0 ${
                      isSelected ? 'bg-copper-900/50' : 'hover:bg-stone-800/50'
                    }`}
                    onClick={() => handleSelect(vessel.id)}
                  >
                    <div className="flex items-center gap-2">
                      {vesselThumb(vessel)}
                      {/* Deliberately a div, not an h3: `.theme-root h3` sizes
                          every heading at 1.25x the theme heading size in the
                          theme face, and an element selector outranks
                          Tailwind's text-* utility — an h3 here renders ~25px
                          and truncates after a few characters. */}
                      <div className={`flex-1 min-w-0 truncate text-parchment-100 ${scaledNameClass(vessel.name)}`}>
                        {vessel.name}
                      </div>
                      <div className={`flex items-center gap-1 flex-shrink-0 transition-opacity ${
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                      }`}>
                        <button
                          onClick={(e) => handleDuplicate(vessel, e)}
                          className="px-1 py-0.5 text-xs leading-none rounded border border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800"
                          title="Duplicate"
                        >
                          ⎘
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(vessel.id); }}
                          className="px-1 py-0.5 text-xs leading-none rounded border bg-red-900/40 text-red-300 border-red-700/50 hover:bg-red-900/60"
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Meta line: the numbers and links that differ between
                        vessels. Indented to sit under the name. */}
                    <div className="flex flex-wrap items-center gap-1 mt-1 pl-[2.25rem]">
                      <span className="text-[10px] text-stone-500 whitespace-nowrap">
                        HP {vessel.health}
                      </span>
                      {vessel.transformEnemyId && (
                        <span className="px-1.5 py-0 rounded border text-[10px] whitespace-nowrap bg-red-900/40 text-red-300 border-red-700/50">
                          💀 {transformTargetName(vessel.transformEnemyId)}
                        </span>
                      )}
                      {triggers.map((t, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0 rounded border text-[10px] whitespace-nowrap bg-stone-800 text-stone-300 border-stone-600"
                        >
                          {t}
                        </span>
                      ))}
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
            Vessels
            {countLabel}
          </h2>
          <div className="w-48">{searchInput}</div>
          <div className="w-40">{folderFilter}</div>
          {newButton}
        </div>
      }
      browsePanel={
        <AssetBrowseTable
          items={sort.sorted}
          columns={browseColumns}
          sortKey={sort.sortKey}
          sortDir={sort.sortDir}
          onToggleSort={sort.toggleSort}
          onOpen={(v) => handleSelect(v.id)}
          rowActions={rowActionButtons}
          emptyMessage={searchTerm ? 'No vessels match your search.' : 'No vessels yet — click "+ New" to create one.'}
        />
      }
      navigation={{
        items: sort.sorted.map(v => ({ id: v.id, name: v.name || 'Unnamed' })),
        currentId: selectedId,
        onSelect: handleSelect,
      }}
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
                    <h2 className="text-lg md:text-2xl font-bold font-medieval text-copper-400 truncate">
                      {editing.name || 'Unnamed Vessel'}
                    </h2>
                    <p className="text-xs text-stone-400">
                      HP: {editing.health}
                      {editing.transformEnemyId
                        ? ` • holds ${transformTargetName(editing.transformEnemyId)}`
                        : ' • plain breakable'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1.5 md:gap-2 flex-shrink-0">
                  <button onClick={handleSave} className="dungeon-btn-success text-sm">
                    <span className="md:hidden">💾</span>
                    <span className="hidden md:inline">Save Vessel</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Tab Bar */}
            <div className="flex gap-1">
              {(['details', 'sprite'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`dungeon-tab ${activeTab === tab ? 'dungeon-tab-active' : ''}`}
                >
                  {tab === 'details' ? '📋 Details' : '🎨 Sprite'}
                </button>
              ))}
            </div>

            {activeTab === 'details' && (
              <div className="space-y-6">
                <CollapsiblePanel title="Basic Info" className="space-y-3">
                  <div>
                    <label className="block text-sm mb-1">Name</label>
                    <input type="text" value={editing.name}
                      onChange={(e) => updateVessel({ name: e.target.value })}
                      className="w-full px-3 py-2 bg-stone-700 rounded" />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Plural Name <span className="text-stone-400 font-normal">(optional)</span></label>
                    <input type="text" value={editing.pluralName || ''}
                      onChange={(e) => updateVessel({ pluralName: e.target.value || undefined })}
                      placeholder={`e.g., ${editing.name}s`}
                      className="w-full px-3 py-2 bg-stone-700 rounded" />
                    <p className="text-xs text-stone-400 mt-1">Used in quest text when several are on the board</p>
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Description</label>
                    <RichTextEditor
                      value={editing.description || ''}
                      onChange={(value) => updateVessel({ description: value || undefined })}
                      placeholder="Enter vessel description..."
                      multiline
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Health</label>
                    <input type="number" min="1" max="99" value={editing.health}
                      onChange={(e) => updateVessel({ health: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 bg-stone-700 rounded" />
                    <p className="text-xs text-stone-400 mt-1">How much damage it takes to break — some vessels are sturdier than others</p>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editing.hideFromCompendium || false}
                        onChange={(e) => updateVessel({ hideFromCompendium: e.target.checked || undefined })}
                        className="rounded"
                      />
                      <span className="text-sm">Hide from the Slab</span>
                    </label>
                    <p className="text-xs text-stone-400 mt-1 ml-6">No compendium page even when published — for showcase-only variants and the like.</p>
                  </div>
                </CollapsiblePanel>

                <CollapsiblePanel title="Transformation" className="space-y-3">
                  <div>
                    <label className="block text-sm mb-1">Holds Enemy <span className="text-stone-400 font-normal">(optional)</span></label>
                    <select
                      value={editing.transformEnemyId || ''}
                      onChange={(e) => updateVessel({ transformEnemyId: e.target.value || undefined })}
                      className="w-full px-3 py-2 bg-stone-700 rounded"
                    >
                      <option value="">None — plain breakable</option>
                      {getAllEnemies().map((enemy) => (
                        <option key={enemy.id} value={enemy.id}>{enemy.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-stone-400 mt-1">
                      The enemy that emerges when this vessel breaks. It joins the board as a real
                      combatant (idle until the turn after it appears) — the map editor's win-condition
                      checkboxes control whether it must be defeated.
                    </p>
                  </div>

                  {editing.transformEnemyId && (
                    <>
                      <div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editing.transformOnBreak !== false}
                            onChange={(e) => updateVessel({ transformOnBreak: e.target.checked ? undefined : false })}
                            className="rounded"
                          />
                          <span className="text-sm">Transforms when broken</span>
                        </label>
                        <p className="text-xs text-stone-400 mt-1 ml-6">
                          Off = breaking it just destroys it (loot still drops, nothing emerges) —
                          for eggs that only hatch by timer, proximity, or a specific strike.
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Hatch Timer (turns) <span className="text-stone-400 font-normal">(optional)</span></label>
                        <input type="number" min="0" max="99" value={editing.transformAfterTurns ?? 0}
                          onChange={(e) => {
                            const v = parseInt(e.target.value) || 0;
                            updateVessel({ transformAfterTurns: v > 0 ? v : undefined });
                          }}
                          className="w-full px-3 py-2 bg-stone-700 rounded" />
                        <p className="text-xs text-stone-400 mt-1">
                          Transforms at the end of this many turns even if unbroken (hatching egg,
                          timed ambush). 0 = off.
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Proximity Hatch (range) <span className="text-stone-400 font-normal">(optional)</span></label>
                        <div className="flex gap-2">
                          <input type="number" min="0" max="99" value={editing.transformProximityRange ?? 0}
                            onChange={(e) => {
                              const v = parseInt(e.target.value) || 0;
                              updateVessel({ transformProximityRange: v > 0 ? v : undefined });
                            }}
                            className="w-24 px-3 py-2 bg-stone-700 rounded" />
                          {(editing.transformProximityRange ?? 0) > 0 && (
                            <select
                              value={editing.transformProximityParty ?? 'hero'}
                              onChange={(e) => updateVessel({ transformProximityParty: e.target.value as 'hero' | 'enemy' | 'any' })}
                              className="flex-1 px-3 py-2 bg-stone-700 rounded"
                            >
                              <option value="hero">Senses Heroes</option>
                              <option value="enemy">Senses Enemies</option>
                              <option value="any">Senses Anyone</option>
                            </select>
                          )}
                        </div>
                        <p className="text-xs text-stone-400 mt-1">
                          Hatches when a living matching unit stands within this range at the end
                          of a turn (same distance rule as "in range" triggers — range 1 doesn't
                          include diagonals). 0 = off. Stealthed opponents don't trigger it.
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Hatches When Struck By <span className="text-stone-400 font-normal">(optional)</span></label>
                        <div className="flex flex-wrap gap-3">
                          {HIT_KIND_OPTIONS.map((opt) => (
                            <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer text-sm">
                              <input
                                type="checkbox"
                                checked={editing.transformOnHitKinds?.includes(opt.value) ?? false}
                                onChange={(e) => {
                                  const current = editing.transformOnHitKinds ?? [];
                                  const next = e.target.checked
                                    ? [...current, opt.value]
                                    : current.filter(k => k !== opt.value);
                                  updateVessel({ transformOnHitKinds: next.length > 0 ? next : undefined });
                                }}
                                className="rounded"
                              />
                              {opt.label}
                            </label>
                          ))}
                        </div>
                        <p className="text-xs text-stone-400 mt-1">
                          A landed hit of a checked kind hatches it — no need to break it (struck
                          gong wakes the golem). Hits count even if deflected or absorbed. "Any"
                          also covers area, damage-over-time, tile, and push hits.
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Emerged Facing <span className="text-stone-400 font-normal">(optional)</span></label>
                        <select
                          value={editing.transformFacing || ''}
                          onChange={(e) => updateVessel({ transformFacing: (e.target.value || undefined) as Direction | undefined })}
                          className="w-full px-3 py-2 bg-stone-700 rounded"
                        >
                          <option value="">Enemy's default facing</option>
                          {FACING_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </CollapsiblePanel>

                <CollapsiblePanel title="Loot" className="space-y-3">
                  <div>
                    <label className="block text-sm mb-1">Drops on Break <span className="text-stone-400 font-normal">(optional)</span></label>
                    <select
                      value={editing.droppedCollectibleId || ''}
                      onChange={(e) => updateVessel({ droppedCollectibleId: e.target.value || undefined })}
                      className="w-full px-3 py-2 bg-stone-700 rounded"
                    >
                      <option value="">None</option>
                      {getAllCollectibles().map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-stone-400 mt-1">
                      Collectible spawned when the vessel is broken. A vessel that transforms usually
                      shouldn't also drop loot — the emerging enemy would stand on it.
                    </p>
                  </div>
                </CollapsiblePanel>
              </div>
            )}

            {activeTab === 'sprite' && editing.customSprite && (
              <div className="space-y-3">
                <div className="bg-blue-900 border border-blue-600 rounded p-2">
                  <p className="text-xs text-blue-200">
                    <strong>Vessels only use the Idle and Death sections</strong> — they never move,
                    cast, or play entrance animations, and the Default/Static direction is enough
                    (no movement arrow in-game). The death animation is the break: splinters,
                    shattering pottery, a chest snapping open.
                  </p>
                </div>
                <SpriteEditor
                  sprite={editing.customSprite}
                  onChange={updateSprite}
                  shadowPreview
                />
              </div>
            )}
          </>
        ) : null
      }
      emptyState={
        <div className="border border-stone-700 rounded p-6 text-center">
          <h2 className="text-lg font-medieval text-copper-400 mb-2">Vessel Editor</h2>
          <p className="text-sm text-stone-400 mb-4">
            Breakable things with something inside — barrels, urns, mimic chests, hatching eggs.
            Variable toughness, optional transformation into an enemy on break or on a timer.
          </p>
          <button onClick={handleNew} className="dungeon-btn-success text-sm px-3 py-1.5">
            + Create New Vessel
          </button>
        </div>
      }
    />
  );
};
