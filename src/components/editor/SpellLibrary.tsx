import React, { useState, useEffect } from 'react';
import type { SpellAsset } from '../../types/game';
import { getSpellAssets, deleteSpellAsset, saveSpellAsset, getFolders } from '../../utils/assetStorage';
import { SpellAssetBuilder } from './SpellAssetBuilder';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';

export const SpellLibrary: React.FC = () => {
  const [spells, setSpells] = useState<SpellAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingSpell, setEditingSpell] = useState<SpellAsset | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const loadSpells = () => {
    setSpells(getSpellAssets());
  };

  useEffect(() => {
    loadSpells();
  }, []);

  const handleSelect = (spell: SpellAsset) => {
    setSelectedId(spell.id);
    setEditingSpell(spell);
    setIsCreating(false);
  };

  const handleNew = () => {
    setSelectedId(null);
    setEditingSpell(null);
    setIsCreating(true);
  };

  const handleDelete = (spellId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this spell?')) return;
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

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">
          {/* Spell List - Left Sidebar */}
          <div className="w-full md:w-72 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold font-medieval text-copper-400">Spells</h2>
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
              category="spells"
              selectedFolderId={selectedFolderId}
              onFolderSelect={setSelectedFolderId}
            />

            <div className="space-y-2 max-h-[calc(100vh-350px)] overflow-y-auto">
              {filteredSpells.length === 0 ? (
                <div className="dungeon-panel p-4 rounded text-center text-stone-400 text-sm">
                  {searchTerm ? 'No matches' : 'No spells yet.'}
                  <br />
                  {!searchTerm && 'Click "+ New" to create one.'}
                </div>
              ) : (
                filteredSpells.map(spell => (
                  <div
                    key={spell.id}
                    className={`p-3 rounded cursor-pointer transition-colors ${
                      selectedId === spell.id
                        ? 'bg-copper-700/50 border border-copper-500'
                        : 'dungeon-panel hover:bg-stone-700'
                    }`}
                    onClick={() => handleSelect(spell)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        {spell.thumbnailIcon ? (
                          <img
                            src={spell.thumbnailIcon}
                            alt={spell.name}
                            className="w-10 h-10 object-contain bg-stone-900 rounded"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-stone-600 rounded flex items-center justify-center text-stone-400 text-xs">
                            ?
                          </div>
                        )}
                        <div>
                          <h3 className="font-bold">{spell.name || 'Unnamed'}</h3>
                          <p className="text-xs text-stone-400 capitalize">
                            {spell.templateType.replace('_', ' ')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <InlineFolderPicker
                          category="spells"
                          currentFolderId={spell.folderId}
                          onFolderChange={(folderId) => handleFolderChange(spell.id, folderId)}
                        />
                        <button
                          onClick={(e) => handleDuplicate(spell, e)}
                          className="px-1.5 py-1 text-xs bg-stone-600 rounded hover:bg-stone-500"
                          title="Duplicate"
                        >
                          ⎘
                        </button>
                        <button
                          onClick={(e) => handleDelete(spell.id, e)}
                          className="px-1.5 py-1 text-xs bg-blood-700 rounded hover:bg-blood-600"
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    {/* Quick stats */}
                    <div className="flex gap-2 mt-2 text-xs text-stone-400">
                      <span>Dmg: {spell.damage}</span>
                      {spell.range && <span>Range: {spell.range}</span>}
                      {spell.radius && <span>Radius: {spell.radius}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Spell Editor - Right Panel */}
          <div className="flex-1">
            {(isCreating || editingSpell) ? (
              <SpellAssetBuilder
                spell={editingSpell || undefined}
                onSave={handleSave}
                onCancel={handleCancel}
              />
            ) : (
              <div className="dungeon-panel p-8 text-center">
                <h2 className="text-2xl font-bold font-medieval text-copper-400 mb-4">Spell Editor</h2>
                <p className="text-stone-400 mb-6">
                  Create spell assets that can be equipped to heroes and enemies.
                  <br />
                  Select a spell from the list or create a new one.
                </p>
                <button
                  onClick={handleNew}
                  className="dungeon-btn-success text-lg"
                >
                  + Create New Spell
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
