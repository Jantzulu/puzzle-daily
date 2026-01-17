import React, { useState } from 'react';
import type { CustomCollectible, CustomSprite } from '../../utils/assetStorage';
import type { CollectibleEffectConfig, CollectibleEffectType } from '../../types/game';
import { saveCollectible, getCustomCollectibles, deleteCollectible, getFolders, getStatusEffectAssets, getSoundAssets } from '../../utils/assetStorage';
import { StaticSpriteEditor } from './StaticSpriteEditor';
import { SpriteThumbnail } from './SpriteThumbnail';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';
import { RichTextEditor } from './RichTextEditor';

// Effect type options with icons
const EFFECT_TYPES: { value: CollectibleEffectType; label: string; icon: string }[] = [
  { value: 'score', label: 'Score Points', icon: '🏆' },
  { value: 'status_effect', label: 'Status Effect', icon: '✨' },
  { value: 'win_key', label: 'Win Key', icon: '🔑' },
  { value: 'heal', label: 'Heal', icon: '💚' },
  { value: 'damage', label: 'Damage (Trap)', icon: '💀' },
];

// Get effect icon
const getEffectIcon = (type: CollectibleEffectType): string => {
  const found = EFFECT_TYPES.find(e => e.value === type);
  return found?.icon || '?';
};

export const CollectibleEditor: React.FC = () => {
  const [collectibles, setCollectibles] = useState<CustomCollectible[]>(() => getCustomCollectibles());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomCollectible | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

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
    alert(`Saved "${editing.name}"!`);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this collectible?')) return;
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

  // Get effect summary for display
  const getEffectSummary = (effects: CollectibleEffectConfig[]): string => {
    if (effects.length === 0) return 'No effects';
    return effects.map(e => {
      switch (e.type) {
        case 'score': return `+${e.scoreValue || 0} pts`;
        case 'status_effect': return 'Buff';
        case 'win_key': return 'Key';
        case 'heal': return `+${e.amount || 0} HP`;
        case 'damage': return `-${e.amount || 0} HP`;
        default: return e.type;
      }
    }).join(', ');
  };

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">
          {/* Collectible List */}
          <div className="w-full md:w-72 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">Collectibles</h2>
              <button
                onClick={handleNew}
                className="px-3 py-1 bg-green-600 rounded text-sm hover:bg-green-700"
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
              className="w-full px-3 py-2 bg-gray-700 rounded text-sm"
            />

            {/* Folder Filter */}
            <FolderDropdown
              category="collectibles"
              selectedFolderId={selectedFolderId}
              onFolderSelect={setSelectedFolderId}
            />

            <div className="space-y-2 max-h-[calc(100vh-350px)] overflow-y-auto">
              {filteredCollectibles.length === 0 ? (
                <div className="bg-gray-800 p-4 rounded text-center text-gray-400 text-sm">
                  {searchTerm ? 'No collectibles match your search.' : 'No collectibles yet.'}
                  <br />
                  {!searchTerm && 'Click "+ New" to create one.'}
                </div>
              ) : (
                filteredCollectibles.map(collectible => (
                  <div
                    key={collectible.id}
                    className={`p-3 rounded cursor-pointer transition-colors ${
                      selectedId === collectible.id
                        ? 'bg-blue-600'
                        : 'bg-gray-800 hover:bg-gray-700'
                    }`}
                    onClick={() => handleSelect(collectible.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        {/* Preview thumbnail */}
                        <div className="w-10 h-10 bg-gray-600 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
                          <SpriteThumbnail sprite={collectible.customSprite} size={40} />
                        </div>
                        <div>
                          <h3 className="font-bold">{collectible.name}</h3>
                          <p className="text-xs text-gray-400">
                            {getEffectSummary(collectible.effects)}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => handleDuplicate(collectible, e)}
                          className="px-2 py-1 text-xs bg-gray-600 rounded hover:bg-gray-500"
                          title="Duplicate"
                        >
                          📋
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(collectible.id);
                          }}
                          className="px-2 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    <InlineFolderPicker
                      category="collectibles"
                      currentFolderId={collectible.folderId}
                      onFolderChange={(folderId) => handleFolderChange(collectible.id, folderId)}
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Edit Panel */}
          <div className="flex-1">
            {editing ? (
              <div className="space-y-6">
                {/* Header */}
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">
                    {isCreating ? 'Create Collectible' : 'Edit Collectible'}
                  </h2>
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-green-600 rounded hover:bg-green-700"
                  >
                    💾 Save Collectible
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column */}
                  <div className="space-y-6">
                    {/* Basic Info */}
                    <div className="bg-gray-800 p-4 rounded space-y-3">
                      <h3 className="text-lg font-bold">Basic Info</h3>
                      <div>
                        <label className="block text-sm mb-1">Name</label>
                        <input
                          type="text"
                          value={editing.name}
                          onChange={e => setEditing({ ...editing, name: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-700 rounded"
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
                          className="w-full px-3 py-2 bg-gray-700 rounded"
                        >
                          <option value="">Uncategorized</option>
                          {getFolders('collectibles').map(folder => (
                            <option key={folder.id} value={folder.id}>{folder.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Pickup Behavior */}
                    <div className="bg-gray-800 p-4 rounded space-y-3">
                      <h3 className="text-lg font-bold">Pickup Behavior</h3>
                      <div>
                        <label className="block text-sm mb-1">Pickup Method</label>
                        <select
                          value={editing.pickupMethod}
                          onChange={e => setEditing({ ...editing, pickupMethod: e.target.value as 'step_on' })}
                          className="w-full px-3 py-2 bg-gray-700 rounded"
                        >
                          <option value="step_on">Step On Tile (Automatic)</option>
                        </select>
                        <p className="text-xs text-gray-400 mt-1">Collected when an entity walks onto the tile</p>
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
                    </div>

                    {/* Sound */}
                    <div className="bg-gray-800 p-4 rounded space-y-3">
                      <h3 className="text-lg font-bold">Sound</h3>
                      <div>
                        <label className="block text-sm mb-1">Pickup Sound</label>
                        <select
                          value={editing.pickupSound || ''}
                          onChange={e => setEditing({ ...editing, pickupSound: e.target.value || undefined })}
                          className="w-full px-3 py-2 bg-gray-700 rounded"
                        >
                          <option value="">None</option>
                          {getSoundAssets().map(sound => (
                            <option key={sound.id} value={sound.id}>{sound.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-6">
                    {/* Sprite */}
                    <div className="bg-gray-800 p-4 rounded">
                      <h3 className="text-lg font-bold mb-4">Sprite</h3>
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
                    </div>

                    {/* Effects */}
                    <div className="bg-gray-800 p-4 rounded">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold">Effects</h3>
                        <button
                          onClick={addEffect}
                          className="px-3 py-1 text-sm bg-blue-600 rounded hover:bg-blue-700"
                        >
                          + Add Effect
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mb-3">
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
                          <p className="text-gray-500 text-sm italic">
                            No effects. This collectible will be purely decorative.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-400">
                <div className="text-center">
                  <p className="text-xl mb-2">🏆</p>
                  <p>Select a collectible to edit or create a new one.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
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
    <div className="bg-gray-700 rounded p-3">
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
            className="px-2 py-1 bg-gray-600 rounded text-sm"
          >
            {EFFECT_TYPES.map(et => (
              <option key={et.value} value={et.value}>{et.icon} {et.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={onRemove}
          className="px-2 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
        >
          Remove
        </button>
      </div>

      {/* Type-specific fields */}
      {effect.type === 'score' && (
        <div>
          <label className="block text-xs text-gray-400 mb-1">Score Value</label>
          <input
            type="number"
            min="0"
            value={effect.scoreValue ?? 10}
            onChange={(e) => onChange({ ...effect, scoreValue: Number(e.target.value) })}
            className="w-full px-2 py-1 bg-gray-600 rounded text-sm"
          />
        </div>
      )}

      {effect.type === 'status_effect' && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Status Effect</label>
            <select
              value={effect.statusAssetId ?? ''}
              onChange={(e) => onChange({ ...effect, statusAssetId: e.target.value || undefined })}
              className="w-full px-2 py-1 bg-gray-600 rounded text-sm"
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
              <label className="block text-xs text-gray-400 mb-1">Duration (turns)</label>
              <input
                type="number"
                min="1"
                value={effect.statusDuration ?? ''}
                placeholder="Default"
                onChange={(e) => onChange({ ...effect, statusDuration: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full px-2 py-1 bg-gray-600 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Value</label>
              <input
                type="number"
                value={effect.statusValue ?? ''}
                placeholder="Default"
                onChange={(e) => onChange({ ...effect, statusValue: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full px-2 py-1 bg-gray-600 rounded text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {effect.type === 'win_key' && (
        <div>
          <label className="block text-xs text-gray-400 mb-1">Key ID (optional)</label>
          <input
            type="text"
            value={effect.keyId ?? ''}
            placeholder="Auto-generated"
            onChange={(e) => onChange({ ...effect, keyId: e.target.value || undefined })}
            className="w-full px-2 py-1 bg-gray-600 rounded text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            Leave blank to count all win_key collectibles together for the "collect_keys" win condition.
          </p>
        </div>
      )}

      {(effect.type === 'heal' || effect.type === 'damage') && (
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            {effect.type === 'heal' ? 'Heal Amount' : 'Damage Amount'}
          </label>
          <input
            type="number"
            min="1"
            value={effect.amount ?? 1}
            onChange={(e) => onChange({ ...effect, amount: Number(e.target.value) })}
            className="w-full px-2 py-1 bg-gray-600 rounded text-sm"
          />
          {effect.type === 'damage' && (
            <p className="text-xs text-gray-500 mt-1">
              Creates a trap collectible that harms whoever picks it up.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default CollectibleEditor;
