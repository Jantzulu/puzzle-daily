import React, { useState, useEffect } from 'react';
import { toast } from '../shared/Toast';
import { findAssetUsages, formatUsageWarning } from '../../utils/assetDependencies';
import { scaledNameClass } from '../../utils/textScale';
import type { CustomObject, CustomSprite, ObjectEffectConfig, ObjectAnchorPoint } from '../../utils/assetStorage';
import { saveObject, getCustomObjects, deleteObject, getFolders } from '../../utils/assetStorage';
import { StaticSpriteEditor } from './StaticSpriteEditor';
import { SpriteThumbnail } from './SpriteThumbnail';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';
import { useBulkSelect, BulkActionBar, bulkDelete, bulkMoveToFolder, bulkExport } from './BulkActions';
import { RichTextEditor } from './RichTextEditor';
import { VersionHistoryModal } from './VersionHistoryModal';
import { createVersionSnapshot } from '../../services/versionService';
import { AssetEditorLayout } from './AssetEditorLayout';
import { useIsMobile } from '../../hooks/useMediaQuery';

const ANCHOR_POINTS: { value: ObjectAnchorPoint; label: string; description: string }[] = [
  { value: 'center', label: 'Center', description: 'Sprite center aligned to tile center' },
  { value: 'bottom_center', label: 'Bottom Center', description: 'Sprite bottom aligned to tile center (for tall objects)' },
];

const EFFECT_TYPES: { value: ObjectEffectConfig['type']; label: string }[] = [
  { value: 'damage', label: 'Damage' },
  { value: 'heal', label: 'Heal' },
  { value: 'slow', label: 'Slow' },
  { value: 'speed_boost', label: 'Speed Boost' },
  { value: 'teleport', label: 'Teleport' },
];

// Get effect icon
const getEffectIcon = (type: ObjectEffectConfig['type']): string => {
  switch (type) {
    case 'damage': return '🔥';
    case 'heal': return '💚';
    case 'slow': return '🐌';
    case 'speed_boost': return '⚡';
    case 'teleport': return '🌀';
    default: return '?';
  }
};

export const ObjectEditor: React.FC<{ initialSelectedId?: string }> = ({ initialSelectedId }) => {
  const isMobile = useIsMobile();
  const [objects, setObjects] = useState<CustomObject[]>(() => getCustomObjects());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomObject | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const bulk = useBulkSelect();

  // Filter objects based on folder and search term
  const folderFilteredObjects = useFilteredAssets(objects, selectedFolderId);
  const filteredObjects = folderFilteredObjects.filter(obj =>
    obj.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (obj.description && obj.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const refreshObjects = () => {
    setObjects(getCustomObjects());
  };

  const handleSelect = (id: string) => {
    const obj = objects.find(o => o.id === id);
    if (obj) {
      setSelectedId(id);
      setEditing({ ...obj, effects: [...obj.effects] });
      setIsCreating(false);
    }
  };

  useEffect(() => {
    if (initialSelectedId) handleSelect(initialSelectedId);
  }, [initialSelectedId]);

  const handleNew = () => {
    const newObj: CustomObject = {
      id: 'obj_' + Date.now(),
      name: 'New Object',
      description: '',
      customSprite: {
        id: 'sprite_' + Date.now(),
        name: 'Object Sprite',
        type: 'simple',
        shape: 'square',
        primaryColor: '#8b4513',
        secondaryColor: '#d2691e',
        size: 0.8,
        createdAt: new Date().toISOString(),
      },
      anchorPoint: 'center',
      effects: [],
      renderLayer: 'below_entities',
      castsShadow: false,
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
    setEditing(newObj);
    setSelectedId(null);
    setIsCreating(true);
  };

  const handleSave = () => {
    if (!editing) return;
    saveObject(editing);
    refreshObjects();
    setSelectedId(editing.id);
    setIsCreating(false);
    toast.success(`Saved "${editing.name}"!`);
  };

  const handleDelete = (id: string) => {
    const usages = findAssetUsages('object', id);
    const warning = usages.length > 0 ? `\n\n${formatUsageWarning(usages)}` : '';
    if (!confirm(`Delete this object?${warning}`)) return;
    deleteObject(id);
    refreshObjects();
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
    const newEffect: ObjectEffectConfig = {
      type: 'damage',
      value: 1,
      radius: 1,
      affectsCharacters: true,
      affectsEnemies: false,
      triggerOnTurnStart: true,
      triggerOnEnter: false,
    };
    setEditing({
      ...editing,
      effects: [...editing.effects, newEffect],
    });
  };

  const updateEffect = (index: number, effect: ObjectEffectConfig) => {
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

  const handleFolderChange = (objId: string, folderId: string | undefined) => {
    const obj = objects.find(o => o.id === objId);
    if (obj) {
      saveObject({ ...obj, folderId });
      refreshObjects();
      if (editing && editing.id === objId) {
        setEditing({ ...editing, folderId });
      }
    }
  };

  const handleDuplicate = (obj: CustomObject, e: React.MouseEvent) => {
    e.stopPropagation();
    const duplicated: CustomObject = {
      ...obj,
      id: 'obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      name: obj.name + ' (Copy)',
      effects: [...obj.effects],
      customSprite: obj.customSprite ? { ...obj.customSprite, id: 'sprite_' + Date.now() } : undefined,
      createdAt: new Date().toISOString(),
    };
    setEditing(duplicated);
    setSelectedId(null);
    setIsCreating(true);
  };

  const handleBack = () => {
    setSelectedId(null);
    setEditing(null);
    setIsCreating(false);
  };

  return (
    <AssetEditorLayout
      isEditing={!!editing}
      onBack={handleBack}
      listTitle="Objects"
      listPanel={
        <>
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold font-medieval text-copper-400">Objects</h2>
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
            className="dungeon-input w-full"
          />

          {/* Folder Filter */}
          <FolderDropdown
            category="objects"
            selectedFolderId={selectedFolderId}
            onFolderSelect={setSelectedFolderId}
          />

          <BulkActionBar
            count={bulk.count}
            totalCount={filteredObjects.length}
            onSelectAll={() => bulk.selectAll(filteredObjects.map(o => o.id))}
            onClear={bulk.clear}
            onDelete={() => {
              const nameMap = new Map(objects.map(o => [o.id, o.name]));
              const deleted = bulkDelete([...bulk.selectedIds], 'object', deleteObject, nameMap);
              if (deleted.length) { refreshObjects(); bulk.clear(); if (selectedId && deleted.includes(selectedId)) { setSelectedId(null); setEditing(null); } }
            }}
            onMoveToFolder={() => {
              bulkMoveToFolder([...bulk.selectedIds], 'objects', (id: string) => objects.find(o => o.id === id), saveObject);
              refreshObjects(); bulk.clear();
            }}
            onExport={() => {
              const items = objects.filter(o => bulk.selectedIds.has(o.id));
              bulkExport(items, 'objects-export.json');
            }}
          />

          <div className="space-y-2 max-h-[calc(100vh-350px)] overflow-y-auto overflow-x-hidden">
            {filteredObjects.length === 0 ? (
              <div className="dungeon-panel p-4 rounded text-center text-stone-400 text-sm">
                {searchTerm ? 'No objects match your search.' : 'No objects yet.'}
                <br />
                {!searchTerm && 'Click "+ New" to create one.'}
              </div>
            ) : (
              filteredObjects.map(obj => (
                <div
                  key={obj.id}
                  className={`p-3 rounded cursor-pointer transition-colors ${
                    bulk.isSelected(obj.id) ? 'bg-blue-900/40 border border-blue-500' :
                    selectedId === obj.id
                      ? 'bg-arcane-700'
                      : 'dungeon-panel hover:bg-stone-700'
                  }`}
                  onClick={() => handleSelect(obj.id)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={bulk.isSelected(obj.id)}
                        onChange={() => bulk.toggle(obj.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-blue-500 flex-shrink-0"
                      />
                      {/* Preview thumbnail */}
                      <div
                        className="bg-stone-600 rounded flex items-center justify-center overflow-hidden flex-shrink-0 transition-all duration-150"
                        style={{ width: selectedId === obj.id ? 56 : 40, height: selectedId === obj.id ? 56 : 40 }}
                      >
                        <SpriteThumbnail sprite={obj.customSprite} size={selectedId === obj.id ? 56 : 40} />
                      </div>
                      <div className="min-w-0">
                        <h3 className={`font-bold ${scaledNameClass(obj.name)}`}>{obj.name}</h3>
                        <p className="text-xs text-stone-400 capitalize">
                          {obj.effects.length > 0 ? `${obj.effects.length} effect${obj.effects.length !== 1 ? 's' : ''}` : 'Decorative'}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-0.5 flex-shrink-0">
                      <InlineFolderPicker
                        category="objects"
                        currentFolderId={obj.folderId}
                        onFolderChange={(folderId) => handleFolderChange(obj.id, folderId)}
                      />
                      <button
                        onClick={(e) => handleDuplicate(obj, e)}
                        className="p-1 text-xs leading-none bg-stone-600 rounded hover:bg-stone-500"
                        title="Duplicate"
                      >
                        ⎘
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(obj.id);
                        }}
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
      detailPanel={editing ? (
        <>
          {/* Persistent Header */}
          <div className="dungeon-panel p-3 md:p-4 rounded">
            <div className="flex justify-between items-center gap-2">
              <div className="flex items-center gap-2 md:gap-4 min-w-0">
                <div className="flex w-10 h-10 md:w-16 md:h-16 bg-stone-700 rounded-pixel items-center justify-center overflow-hidden flex-shrink-0">
                  <SpriteThumbnail sprite={editing.customSprite} size={isMobile ? 40 : 64} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg md:text-2xl font-bold font-medieval text-copper-400 truncate">
                    {editing.name || 'Unnamed Object'}
                  </h2>
                  <p className="text-xs text-stone-400">{editing.collisionType} • {editing.effects.length} effect{editing.effects.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="flex gap-1.5 md:gap-2 flex-shrink-0">
                {!isCreating && (
                  <>
                    <button
                      onClick={async () => {
                        const result = await createVersionSnapshot(editing.id, 'object', editing.name, editing as unknown as object);
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
                  </>
                )}
                <button onClick={handleSave} className="dungeon-btn-success text-sm">
                  <span className="md:hidden">💾</span>
                  <span className="hidden md:inline">Save Object</span>
                </button>
              </div>
            </div>
          </div>

          {showVersionHistory && editing && (
            <VersionHistoryModal
              isOpen={showVersionHistory}
              onClose={() => setShowVersionHistory(false)}
              assetId={editing.id}
              assetType="object"
              assetName={editing.name}
              currentData={editing as unknown as object}
              onRestore={(data) => setEditing(data as unknown as CustomObject)}
            />
          )}

          {/* Basic Info */}
          <div className="dungeon-panel p-4 rounded space-y-3">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-stone-700 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
                <SpriteThumbnail sprite={editing.customSprite} size={64} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-parchment-200">{editing.name || 'Unnamed Object'}</h3>
                <p className="text-xs text-stone-400">{editing.effects.length > 0 ? `${editing.effects.length} effect${editing.effects.length !== 1 ? 's' : ''}` : 'Decorative'}</p>
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
                {getFolders('objects').map(folder => (
                  <option key={folder.id} value={folder.id}>{folder.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Sprite */}
          <div className="dungeon-panel p-4 rounded">
            <h3 className="text-lg font-bold mb-4">Sprite</h3>
            {editing.customSprite && (
              <StaticSpriteEditor
                sprite={editing.customSprite}
                onChange={updateSprite}
              />
            )}
          </div>

          {/* Positioning */}
          <div className="dungeon-panel p-4 rounded space-y-3">
            <h3 className="text-lg font-bold">Positioning</h3>
            <div>
              <label className="block text-sm mb-1">Anchor Point</label>
              <select
                value={editing.anchorPoint}
                onChange={(e) => setEditing({ ...editing, anchorPoint: e.target.value as ObjectAnchorPoint })}
                className="w-full px-3 py-2 bg-stone-700 rounded"
              >
                {ANCHOR_POINTS.map(ap => (
                  <option key={ap.value} value={ap.value}>{ap.label}</option>
                ))}
              </select>
              <p className="text-xs text-stone-400 mt-1">
                {ANCHOR_POINTS.find(ap => ap.value === editing.anchorPoint)?.description}
              </p>
            </div>
            <div>
              <label className="block text-sm mb-1">Render Layer</label>
              <select
                value={editing.renderLayer || 'below_entities'}
                onChange={(e) => setEditing({ ...editing, renderLayer: e.target.value as 'below_entities' | 'above_entities' })}
                className="w-full px-3 py-2 bg-stone-700 rounded"
              >
                <option value="below_entities">Below Entities</option>
                <option value="above_entities">Above Entities</option>
              </select>
            </div>
          </div>

          {/* Effects */}
          <div className="dungeon-panel p-4 rounded">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Effects</h3>
              <button
                onClick={addEffect}
                className="px-3 py-1 text-sm bg-arcane-700 rounded hover:bg-arcane-600"
              >
                + Add Effect
              </button>
            </div>

            {editing.effects.length === 0 ? (
              <p className="text-stone-400 text-sm">
                No effects added. Add effects to make this object interact with entities.
              </p>
            ) : (
              <div className="space-y-3">
                {editing.effects.map((effect, index) => (
                  <div key={index} className="bg-stone-700 rounded p-3">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <span>{getEffectIcon(effect.type)}</span>
                        <select
                          value={effect.type}
                          onChange={(e) => updateEffect(index, { ...effect, type: e.target.value as ObjectEffectConfig['type'] })}
                          className="px-2 py-1 bg-stone-600 rounded text-sm"
                        >
                          {EFFECT_TYPES.map(et => (
                            <option key={et.value} value={et.value}>{et.label}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={() => removeEffect(index)}
                        className="px-2 py-1 text-xs bg-blood-700 rounded hover:bg-blood-600"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {(effect.type === 'damage' || effect.type === 'heal') && (
                        <div>
                          <label className="block text-xs text-stone-400">Value</label>
                          <input
                            type="number"
                            min="1"
                            value={effect.value || 1}
                            onChange={(e) => updateEffect(index, { ...effect, value: Number(e.target.value) })}
                            className="w-full px-2 py-1 bg-stone-600 rounded"
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-xs text-stone-400">Radius (tiles)</label>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          value={effect.radius}
                          onChange={(e) => updateEffect(index, { ...effect, radius: Number(e.target.value) })}
                          className="w-full px-2 py-1 bg-stone-600 rounded"
                        />
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={effect.affectsCharacters ?? true}
                          onChange={(e) => updateEffect(index, { ...effect, affectsCharacters: e.target.checked })}
                        />
                        Affects Characters
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={effect.affectsEnemies ?? false}
                          onChange={(e) => updateEffect(index, { ...effect, affectsEnemies: e.target.checked })}
                        />
                        Affects Enemies
                      </label>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={effect.triggerOnTurnStart ?? true}
                          onChange={(e) => updateEffect(index, { ...effect, triggerOnTurnStart: e.target.checked })}
                        />
                        On Turn Start
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={effect.triggerOnEnter ?? false}
                          onChange={(e) => updateEffect(index, { ...effect, triggerOnEnter: e.target.checked })}
                        />
                        On Enter Radius
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
      emptyState={
        <div className="dungeon-panel p-8 rounded text-center">
          <h2 className="text-2xl font-bold mb-4">Object Editor</h2>
          <p className="text-stone-400 mb-6">
            Create decorative objects with custom sprites that can be placed on tiles.
            For collision, use tiles with wall behavior instead.
          </p>
          <button
            onClick={handleNew}
            className="px-6 py-3 bg-moss-700 rounded text-lg hover:bg-moss-600"
          >
            + Create New Object
          </button>
        </div>
      }
    />
  );
};
