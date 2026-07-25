import React, { useState, useEffect } from 'react';
import { findAssetUsages, formatUsageWarning } from '../../utils/assetDependencies';
import { scaledNameClass } from '../../utils/textScale';
import type { SpellAsset } from '../../types/game';
import { getSpellAssets, deleteSpellAsset, saveSpellAsset } from '../../utils/assetStorage';
import { SpellAssetBuilder } from './SpellAssetBuilder';
import { AssetEditorLayout } from './AssetEditorLayout';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';
import { useBulkSelect, BulkActionBar, bulkDelete, bulkMoveToFolder, bulkExport, bulkImport } from './BulkActions';

export const SpellLibrary: React.FC<{ initialSelectedId?: string }> = ({ initialSelectedId }) => {
  const [spells, setSpells] = useState<SpellAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingSpell, setEditingSpell] = useState<SpellAsset | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const bulk = useBulkSelect();

  const loadSpells = () => {
    setSpells(getSpellAssets());
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSpells();
  }, []);

  const handleSelect = (spell: SpellAsset) => {
    setSelectedId(spell.id);
    setEditingSpell(spell);
    setIsCreating(false);
  };

  useEffect(() => {
    if (initialSelectedId) {
      const spell = spells.find(s => s.id === initialSelectedId);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (spell) handleSelect(spell);
    }
  }, [initialSelectedId, spells]);

  const handleNew = () => {
    setSelectedId(null);
    setEditingSpell(null);
    setIsCreating(true);
  };

  const handleDelete = (spellId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const usages = findAssetUsages('spell', spellId);
    const warning = usages.length > 0 ? `\n\n${formatUsageWarning(usages)}` : '';
    if (!confirm(`Delete this spell?${warning}`)) return;
    deleteSpellAsset(spellId);
    loadSpells();
    if (selectedId === spellId) {
      setSelectedId(null);
      setEditingSpell(null);
    }
  };

  const handleFolderChange = (spellId: string, folderId: string | undefined) => {
    const spell = spells.find(s => s.id === spellId);
    if (spell) {
      saveSpellAsset({ ...spell, folderId });
      loadSpells();
      if (editingSpell && editingSpell.id === spellId) {
        setEditingSpell({ ...editingSpell, folderId });
      }
    }
  };

  const handleDuplicate = (spell: SpellAsset, e: React.MouseEvent) => {
    e.stopPropagation();
    const duplicated: SpellAsset = {
      ...spell,
      id: 'spell_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      name: spell.name + ' (Copy)',
      createdAt: new Date().toISOString(),
    };
    setEditingSpell(duplicated);
    setSelectedId(null);
    setIsCreating(true);
  };

  const handleSave = () => {
    loadSpells();
    if (editingSpell) {
      setSelectedId(editingSpell.id);
    }
    setIsCreating(false);
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingSpell(null);
    setSelectedId(null);
  };

  // Filter spells based on folder and search term
  const folderFilteredSpells = useFilteredAssets(spells, selectedFolderId);
  const filteredSpells = folderFilteredSpells.filter(spell =>
    spell.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    spell.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleBack = () => handleCancel();

  return (
    <AssetEditorLayout
      isEditing={isCreating || !!editingSpell}
      onBack={handleBack}
      listTitle="Spells"
      listPanel={
        <>
          <div className="flex justify-between items-center gap-2">
            <h2 className="text-lg font-medieval text-copper-400">
              Spells
              <span className="ml-1.5 text-xs font-sans text-stone-500">
                {filteredSpells.length}{filteredSpells.length !== spells.length && ` / ${spells.length}`}
              </span>
            </h2>
            <button
              onClick={handleNew}
              className="px-2 py-0.5 rounded border text-xs bg-green-900/40 text-green-300 border-green-700/50 hover:bg-green-900/60"
            >
              + New
            </button>
          </div>

          {/* Search + folder filter share one row so the list starts higher */}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 min-w-0 bg-stone-800 border border-stone-700 rounded px-2 py-1 text-xs text-parchment-100 placeholder-stone-500 focus:outline-none focus:border-arcane-500"
            />
            <div className="w-32 flex-shrink-0">
              <FolderDropdown
                category="spells"
                selectedFolderId={selectedFolderId}
                onFolderSelect={setSelectedFolderId}
              />
            </div>
          </div>

          <BulkActionBar
            count={bulk.count}
            totalCount={filteredSpells.length}
            onSelectAll={() => bulk.selectAll(filteredSpells.map(s => s.id))}
            onClear={bulk.clear}
            onDelete={() => {
              const nameMap = new Map(spells.map(s => [s.id, s.name]));
              const deleted = bulkDelete([...bulk.selectedIds], 'spell', deleteSpellAsset, nameMap);
              if (deleted.length) { loadSpells(); bulk.clear(); if (selectedId && deleted.includes(selectedId)) { setSelectedId(null); setEditingSpell(null); } }
            }}
            onMoveToFolder={() => {
              bulkMoveToFolder([...bulk.selectedIds], 'spells', (id: string) => spells.find(s => s.id === id), saveSpellAsset);
              loadSpells(); bulk.clear();
            }}
            onExport={() => {
              const items = spells.filter(s => bulk.selectedIds.has(s.id));
              bulkExport(items, 'spells-export.json', 'spell');
            }}
            onImport={() => bulkImport({
              assetType: 'spell',
              saveFn: saveSpellAsset,
              existingIds: new Set(spells.map(s => s.id)),
              onComplete: () => { loadSpells(); bulk.clear(); },
            })}
          />

          <div className="border border-stone-700 rounded max-h-[calc(100vh-250px)] overflow-y-auto overflow-x-hidden dense-scrollbar">
            {filteredSpells.length === 0 ? (
              <div className="px-2 py-4 text-center text-stone-500 text-sm">
                {searchTerm ? 'No matches' : 'No spells yet — click "+ New" to create one.'}
              </div>
            ) : (
              filteredSpells.map(spell => {
                const isSelected = selectedId === spell.id;
                const usages = findAssetUsages('spell', spell.id);
                return (
                  <div
                    key={spell.id}
                    className={`group px-2 py-1.5 cursor-pointer transition-colors border-t border-stone-700/60 first:border-t-0 ${
                      bulk.isSelected(spell.id) ? 'bg-sky-900/40' :
                      isSelected
                        ? 'bg-copper-900/50'
                        : 'hover:bg-stone-800/50'
                    }`}
                    onClick={() => handleSelect(spell)}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={bulk.isSelected(spell.id)}
                        onChange={() => bulk.toggle(spell.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-sky-500 flex-shrink-0"
                      />
                      {spell.thumbnailIcon ? (
                        <img
                          src={spell.thumbnailIcon}
                          alt={spell.name}
                          className="w-7 h-7 object-contain bg-stone-900 rounded flex-shrink-0"
                          loading="lazy" decoding="async"
                        />
                      ) : (
                        <div className="w-7 h-7 bg-stone-800 border border-stone-700 rounded flex items-center justify-center text-stone-500 text-xs flex-shrink-0">
                          ?
                        </div>
                      )}
                      {/* Name owns the full remaining width; actions only take
                          space once the row is hovered, focused, or selected. */}
                      <h3 className={`flex-1 min-w-0 truncate text-parchment-100 ${scaledNameClass(spell.name || 'Unnamed')}`}>
                        {spell.name || 'Unnamed'}
                      </h3>
                      <div className={`flex items-center gap-1 flex-shrink-0 transition-opacity ${
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                      }`}>
                        <InlineFolderPicker
                          category="spells"
                          currentFolderId={spell.folderId}
                          onFolderChange={(folderId) => handleFolderChange(spell.id, folderId)}
                        />
                        <button
                          onClick={(e) => handleDuplicate(spell, e)}
                          className="px-1 py-0.5 text-xs leading-none rounded border border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800"
                          title="Duplicate"
                        >
                          ⎘
                        </button>
                        <button
                          onClick={(e) => handleDelete(spell.id, e)}
                          className="px-1 py-0.5 text-xs leading-none rounded border bg-red-900/40 text-red-300 border-red-700/50 hover:bg-red-900/60"
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Meta line: type as a chip, then the numbers that differ
                        between spells. Indented to sit under the name. */}
                    <div className="flex flex-wrap items-center gap-1 mt-1 pl-[3.25rem]">
                      <span className="px-1.5 py-0 rounded border text-[10px] whitespace-nowrap bg-stone-800 text-stone-300 border-stone-600 capitalize">
                        {spell.templateType.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-stone-500 whitespace-nowrap">
                        Dmg {spell.damage}
                        {spell.range ? <><span className="text-stone-600"> · </span>Rng {spell.range}</> : null}
                        {spell.radius ? <><span className="text-stone-600"> · </span>Rad {spell.radius}</> : null}
                      </span>
                      {usages.map((u, i) => (
                        <span
                          key={i}
                          className={`text-[10px] px-1.5 py-0 rounded border whitespace-nowrap ${
                            u.type === 'character'
                              ? 'bg-arcane-900/40 text-arcane-300 border-arcane-700/50'
                              : 'bg-red-900/40 text-red-300 border-red-700/50'
                          }`}
                        >
                          {u.type === 'character' ? '🛡' : '💀'} {u.name}
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
      detailPanel={
        <SpellAssetBuilder
          key={editingSpell?.id || 'new'}
          spell={editingSpell || undefined}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      }
      emptyState={
        <div className="border border-stone-700 rounded p-6 text-center">
          <h2 className="text-lg font-medieval text-copper-400 mb-2">Spell Editor</h2>
          <p className="text-sm text-stone-400 mb-4">
            Create spell assets that can be equipped to heroes and enemies.
            <br />
            Select a spell from the list or create a new one.
          </p>
          <button
            onClick={handleNew}
            className="dungeon-btn-success text-sm px-3 py-1.5"
          >
            + Create New Spell
          </button>
        </div>
      }
    />
  );
};
