import React, { useState, useEffect } from 'react';
import type { StatusEffectAsset } from '../../types/game';
import { StatusEffectType } from '../../types/game';
import { getStatusEffectAssets, deleteStatusEffectAsset, saveStatusEffectAsset, getFolders, type CustomSprite } from '../../utils/assetStorage';
import { StatusEffectEditor } from './StatusEffectEditor';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';
import { SpriteThumbnail } from './SpriteThumbnail';

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
    default: return 'bg-stone-600';
  }
}

export const StatusEffectLibrary: React.FC = () => {
  const [effects, setEffects] = useState<StatusEffectAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingEffect, setEditingEffect] = useState<StatusEffectAsset | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const loadEffects = () => {
    setEffects(getStatusEffectAssets());
  };

  useEffect(() => {
    loadEffects();
  }, []);

  const handleSelect = (effect: StatusEffectAsset) => {
    setSelectedId(effect.id);
    setEditingEffect(effect);
    setIsCreating(false);
  };

  const handleNew = () => {
    setSelectedId(null);
    setEditingEffect(null);
    setIsCreating(true);
  };

  const handleDelete = (effectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const effect = effects.find(ef => ef.id === effectId);
    if (effect?.isBuiltIn) {
      alert('Cannot delete built-in status effects.');
      return;
    }
    if (!confirm('Delete this status effect?')) return;
    deleteStatusEffectAsset(effectId);
    loadEffects();
    if (selectedId === effectId) {
      setSelectedId(null);
      setEditingEffect(null);
    }
  };

  const handleFolderChange = (effectId: string, folderId: string | undefined) => {
    const effect = effects.find(ef => ef.id === effectId);
    if (effect && !effect.isBuiltIn) {
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
      id: 'status_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      name: effect.name + ' (Copy)',
      createdAt: new Date().toISOString(),
      isBuiltIn: false,
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

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">
          {/* Effect List - Left Sidebar */}
          <div className="w-full md:w-72 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold font-medieval text-copper-400">Enchantments</h2>
              <button
                onClick={handleNew}
                className="dungeon-btn-success"
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
              className="dungeon-input w-full"
            />

            {/* Folder Filter */}
            <FolderDropdown
              category="status_effects"
              selectedFolderId={selectedFolderId}
              onFolderSelect={setSelectedFolderId}
            />

            <div className="space-y-2 max-h-[calc(100vh-350px)] overflow-y-auto">
              {filteredEffects.length === 0 ? (
                <div className="dungeon-panel p-4 rounded text-center text-stone-400 text-sm">
                  {searchTerm ? 'No matches' : 'No status effects yet.'}
                  <br />
                  {!searchTerm && 'Click "+ New" to create one.'}
                </div>
              ) : (
                filteredEffects.map(effect => (
                  <div
                    key={effect.id}
                    className={`p-3 rounded cursor-pointer transition-colors ${
                      selectedId === effect.id
                        ? 'bg-arcane-700'
                        : 'dungeon-panel hover:bg-stone-700'
                    }`}
                    onClick={() => handleSelect(effect)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        {/* Icon - use SpriteThumbnail if iconSprite has sprite data */}
                        {effect.iconSprite?.type === 'inline' && effect.iconSprite.spriteData ? (
                          <SpriteThumbnail sprite={effect.iconSprite.spriteData as CustomSprite} size={32} />
                        ) : (
                          <div className={`w-8 h-8 ${getEffectTypeColor(effect.type)} rounded flex items-center justify-center`}>
                            <span className="text-white text-xs font-bold">
                              {effect.type.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div>
                          <h3 className="font-bold flex items-center gap-1">
                            {effect.name || 'Unnamed'}
                            {effect.isBuiltIn && (
                              <span className="text-xs bg-stone-600 px-1 rounded">Built-in</span>
                            )}
                          </h3>
                          <p className="text-xs text-stone-400 capitalize">
                            {effect.type.replace('_', ' ')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!effect.isBuiltIn && (
                          <InlineFolderPicker
                            category="status_effects"
                            currentFolderId={effect.folderId}
                            onFolderChange={(folderId) => handleFolderChange(effect.id, folderId)}
                          />
                        )}
                        <button
                          onClick={(e) => handleDuplicate(effect, e)}
                          className="px-1.5 py-1 text-xs bg-stone-600 rounded hover:bg-stone-500"
                          title="Duplicate"
                        >
                          ⎘
                        </button>
                        {!effect.isBuiltIn && (
                          <button
                            onClick={(e) => handleDelete(effect.id, e)}
                            className="px-1.5 py-1 text-xs bg-blood-700 rounded hover:bg-blood-600"
                            title="Delete"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Quick stats */}
                    <div className="flex gap-2 mt-2 text-xs text-stone-400">
                      <span>Duration: {effect.defaultDuration}</span>
                      {effect.defaultValue && <span>Value: {effect.defaultValue}</span>}
                      <span className="capitalize">{effect.stackingBehavior}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Effect Editor - Right Panel */}
          <div className="flex-1">
            {(isCreating || editingEffect) ? (
              <StatusEffectEditor
                effect={editingEffect || undefined}
                onSave={handleSave}
                onCancel={handleCancel}
              />
            ) : (
              <div className="dungeon-panel p-8 rounded text-center">
                <h2 className="text-2xl font-bold mb-4">Status Effect Editor</h2>
                <p className="text-stone-400 mb-6">
                  Create status effects that can be applied by spells.
                  <br />
                  Effects like poison, stun, sleep, and more can be configured here.
                  <br />
                  Select an effect from the list or create a new one.
                </p>
                <button
                  onClick={handleNew}
                  className="px-6 py-3 bg-moss-700 rounded text-lg hover:bg-moss-600"
                >
                  + Create New Status Effect
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
