import React, { useState, useRef, useEffect } from 'react';
import type { PuzzleSkin, CustomBorderSprites, TileSprites } from '../../types/game';
import { getAllPuzzleSkins, savePuzzleSkin, deletePuzzleSkin, DEFAULT_DUNGEON_SKIN, getFolders } from '../../utils/assetStorage';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';

// Helper to convert file to base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Border sprite slot configuration
// All sprites use fixed sizes (stretched to fit the border dimensions)
const BORDER_SPRITE_SLOTS: { key: keyof CustomBorderSprites; label: string; description: string; size: string }[] = [
  // Walls
  { key: 'wallFront', label: 'Front Wall', description: 'Top edge wall (tiled)', size: '48x48' },
  { key: 'wallTop', label: 'Wall Top', description: 'Interior bottom edge (tiled)', size: '48x24' },
  { key: 'wallSide', label: 'Side Wall', description: 'Left/Right edges (tiled)', size: '24x48' },
  { key: 'wallBottomOuter', label: 'Outer Bottom', description: 'Outer perimeter bottom (tiled)', size: '48x48' },
  // Outer corners - Full size (puzzle perimeter)
  { key: 'cornerTopLeft', label: 'Corner TL', description: 'Top-left outer corner (full)', size: '24x48' },
  { key: 'cornerTopRight', label: 'Corner TR', description: 'Top-right outer corner (full)', size: '24x48' },
  { key: 'cornerBottomLeft', label: 'Corner BL', description: 'Bottom-left outer corner (full)', size: '24x48' },
  { key: 'cornerBottomRight', label: 'Corner BR', description: 'Bottom-right outer corner (full)', size: '24x48' },
  // Outer corners - Thin size (interior voids)
  { key: 'cornerBottomLeftThin', label: 'Corner BL Thin', description: 'Bottom-left outer corner (thin)', size: '24x24' },
  { key: 'cornerBottomRightThin', label: 'Corner BR Thin', description: 'Bottom-right outer corner (thin)', size: '24x24' },
  // Inner corners - Full size
  { key: 'innerCornerTopLeft', label: 'Inner TL', description: 'Inner top-left corner (full)', size: '24x48' },
  { key: 'innerCornerTopRight', label: 'Inner TR', description: 'Inner top-right corner (full)', size: '24x48' },
  { key: 'innerCornerBottomLeft', label: 'Inner BL', description: 'Inner bottom-left corner (full)', size: '24x48' },
  { key: 'innerCornerBottomRight', label: 'Inner BR', description: 'Inner bottom-right corner (full)', size: '24x48' },
  // Inner corners - Thin size (interior voids)
  { key: 'innerCornerBottomLeftThin', label: 'Inner BL Thin', description: 'Inner bottom-left corner (thin)', size: '24x24' },
  { key: 'innerCornerBottomRightThin', label: 'Inner BR Thin', description: 'Inner bottom-right corner (thin)', size: '24x24' },
];

// Tile sprite slot configuration
const TILE_SPRITE_SLOTS: { key: keyof TileSprites; label: string; description: string }[] = [
  { key: 'empty', label: 'Floor Tile', description: 'Empty/walkable floor (48x48, tileable)' },
  { key: 'wall', label: 'Wall Tile', description: 'Wall/blocked tile (48x48, tileable)' },
  { key: 'goal', label: 'Goal Tile', description: 'Goal/exit tile (48x48)' },
];

export const SkinEditor: React.FC = () => {
  const [skins, setSkins] = useState<PuzzleSkin[]>(() => getAllPuzzleSkins());
  const [selectedSkinId, setSelectedSkinId] = useState<string | null>(null);
  const [editingSkin, setEditingSkin] = useState<PuzzleSkin | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Filter skins based on folder and search term
  const folderFilteredSkins = useFilteredAssets(skins, selectedFolderId);
  const filteredSkins = folderFilteredSkins.filter(skin =>
    skin.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (skin.description && skin.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const refreshSkins = () => {
    setSkins(getAllPuzzleSkins());
  };

  const handleSelectSkin = (skinId: string) => {
    const skin = skins.find(s => s.id === skinId);
    if (skin) {
      setSelectedSkinId(skinId);
      setEditingSkin({ ...skin, borderSprites: { ...skin.borderSprites }, tileSprites: { ...skin.tileSprites } });
      setIsCreating(false);
    }
  };

  const handleNewSkin = () => {
    const newSkin: PuzzleSkin = {
      id: 'skin_' + Date.now(),
      name: 'New Skin',
      description: '',
      borderSprites: {},
      tileSprites: {},
      createdAt: new Date().toISOString(),
    };
    setEditingSkin(newSkin);
    setSelectedSkinId(null);
    setIsCreating(true);
  };

  const handleSaveSkin = () => {
    if (!editingSkin) return;

    savePuzzleSkin(editingSkin);
    refreshSkins();
    setSelectedSkinId(editingSkin.id);
    setIsCreating(false);
    alert('Skin saved!');
  };

  const handleDeleteSkin = (skinId: string) => {
    if (skinId.startsWith('builtin_')) {
      alert('Cannot delete built-in skins');
      return;
    }
    if (!confirm('Delete this skin?')) return;

    deletePuzzleSkin(skinId);
    refreshSkins();

    if (selectedSkinId === skinId) {
      setSelectedSkinId(null);
      setEditingSkin(null);
    }
  };

  const handleBorderSpriteUpload = async (key: keyof CustomBorderSprites, file: File) => {
    if (!editingSkin) return;
    const base64 = await fileToBase64(file);
    setEditingSkin({
      ...editingSkin,
      borderSprites: {
        ...editingSkin.borderSprites,
        [key]: base64,
      },
    });
  };

  const handleBorderSpriteRemove = (key: keyof CustomBorderSprites) => {
    if (!editingSkin) return;
    const newBorderSprites = { ...editingSkin.borderSprites };
    delete newBorderSprites[key];
    setEditingSkin({
      ...editingSkin,
      borderSprites: newBorderSprites,
    });
  };

  const handleTileSpriteUpload = async (key: keyof TileSprites, file: File) => {
    if (!editingSkin) return;
    const base64 = await fileToBase64(file);
    setEditingSkin({
      ...editingSkin,
      tileSprites: {
        ...editingSkin.tileSprites,
        [key]: base64,
      },
    });
  };

  const handleTileSpriteRemove = (key: keyof TileSprites) => {
    if (!editingSkin) return;
    const newTileSprites = { ...editingSkin.tileSprites };
    delete newTileSprites[key];
    setEditingSkin({
      ...editingSkin,
      tileSprites: newTileSprites,
    });
  };

  const handleFolderChange = (skinId: string, folderId: string | undefined) => {
    const skin = skins.find(s => s.id === skinId);
    if (skin && !skin.isBuiltIn) {
      savePuzzleSkin({ ...skin, folderId });
      refreshSkins();
      if (editingSkin && editingSkin.id === skinId) {
        setEditingSkin({ ...editingSkin, folderId });
      }
    }
  };

  const isBuiltIn = editingSkin?.isBuiltIn || false;

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex gap-8">
          {/* Skin List */}
          <div className="w-72 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">Puzzle Skins</h2>
              <button
                onClick={handleNewSkin}
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
              category="skins"
              selectedFolderId={selectedFolderId}
              onFolderSelect={setSelectedFolderId}
            />

            <div className="space-y-2 max-h-[calc(100vh-350px)] overflow-y-auto">
              {filteredSkins.length === 0 ? (
                <div className="bg-gray-800 p-4 rounded text-center text-gray-400 text-sm">
                  {searchTerm ? 'No skins match your search.' : 'No puzzle skins yet.'}
                  <br />
                  {!searchTerm && 'Click "+ New" to create one.'}
                </div>
              ) : (
              filteredSkins.map((skin) => (
                <div
                  key={skin.id}
                  className={`p-3 rounded cursor-pointer transition-colors ${
                    selectedSkinId === skin.id
                      ? 'bg-blue-600'
                      : 'bg-gray-800 hover:bg-gray-700'
                  }`}
                  onClick={() => handleSelectSkin(skin.id)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold">
                        {skin.name}
                        {skin.isBuiltIn && (
                          <span className="ml-2 text-xs text-gray-400">(Built-in)</span>
                        )}
                      </h3>
                      {skin.description && (
                        <p className="text-xs text-gray-400 mt-1">{skin.description}</p>
                      )}
                    </div>
                    {!skin.isBuiltIn && (
                      <div className="flex items-center gap-1">
                        <InlineFolderPicker
                          category="skins"
                          currentFolderId={skin.folderId}
                          onFolderChange={(folderId) => handleFolderChange(skin.id, folderId)}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSkin(skin.id);
                          }}
                          className="px-2 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
              )}
            </div>
          </div>

          {/* Skin Editor */}
          <div className="flex-1">
            {editingSkin ? (
              <div className="space-y-6">
                {/* Header */}
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">
                    {isCreating ? 'Create New Skin' : `Edit: ${editingSkin.name}`}
                  </h2>
                  {!isBuiltIn && (
                    <button
                      onClick={handleSaveSkin}
                      className="px-4 py-2 bg-green-600 rounded hover:bg-green-700"
                    >
                      💾 Save Skin
                    </button>
                  )}
                </div>

                {isBuiltIn && (
                  <div className="bg-yellow-900/50 p-3 rounded text-yellow-200 text-sm">
                    This is a built-in skin and cannot be modified. Create a new skin to customize.
                  </div>
                )}

                {/* Basic Info */}
                <div className="bg-gray-800 p-4 rounded space-y-3">
                  <h3 className="text-lg font-bold">Basic Info</h3>
                  <div>
                    <label className="block text-sm mb-1">Name</label>
                    <input
                      type="text"
                      value={editingSkin.name}
                      onChange={(e) => setEditingSkin({ ...editingSkin, name: e.target.value })}
                      disabled={isBuiltIn}
                      className="w-full px-3 py-2 bg-gray-700 rounded disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Description</label>
                    <textarea
                      value={editingSkin.description || ''}
                      onChange={(e) => setEditingSkin({ ...editingSkin, description: e.target.value })}
                      disabled={isBuiltIn}
                      className="w-full px-3 py-2 bg-gray-700 rounded disabled:opacity-50"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Folder</label>
                    <select
                      value={editingSkin.folderId || ''}
                      onChange={(e) => setEditingSkin({ ...editingSkin, folderId: e.target.value || undefined })}
                      disabled={isBuiltIn}
                      className="w-full px-3 py-2 bg-gray-700 rounded disabled:opacity-50"
                    >
                      <option value="">Uncategorized</option>
                      {getFolders('skins').map(folder => (
                        <option key={folder.id} value={folder.id}>{folder.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Border Sprites */}
                <div className="bg-gray-800 p-4 rounded">
                  <h3 className="text-lg font-bold mb-4">Border Sprites</h3>
                  <p className="text-sm text-gray-400 mb-4">
                    Upload sprites for the walls around the puzzle. Leave empty to use default rendering.
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {BORDER_SPRITE_SLOTS.map(({ key, label, description, size }) => (
                      <div key={key} className="bg-gray-700 p-2 rounded">
                        <div className="text-xs font-bold mb-1">{label}</div>
                        <div className="text-xs text-gray-400 mb-1">{description}</div>
                        <div className="text-xs text-gray-500 mb-2">{size}</div>

                        {editingSkin.borderSprites[key] ? (
                          <div className="relative">
                            <img
                              src={editingSkin.borderSprites[key]}
                              alt={label}
                              className="w-full h-12 object-contain bg-gray-600 rounded"
                            />
                            {!isBuiltIn && (
                              <button
                                onClick={() => handleBorderSpriteRemove(key)}
                                className="absolute top-0 right-0 px-1 bg-red-600 rounded text-xs hover:bg-red-700"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ) : (
                          <label className={`block ${isBuiltIn ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                            <div className={`w-full h-12 border-2 border-dashed rounded flex items-center justify-center text-xs ${
                              isBuiltIn
                                ? 'border-gray-600 text-gray-600'
                                : 'border-gray-500 text-gray-400 hover:border-gray-400'
                            }`}>
                              {isBuiltIn ? 'N/A' : '+ Upload'}
                            </div>
                            {!isBuiltIn && (
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleBorderSpriteUpload(key, file);
                                }}
                              />
                            )}
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tile Sprites */}
                <div className="bg-gray-800 p-4 rounded">
                  <h3 className="text-lg font-bold mb-4">Tile Sprites</h3>
                  <p className="text-sm text-gray-400 mb-4">
                    Upload sprites for the floor and wall tiles inside the puzzle. Leave empty to use default colors.
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {TILE_SPRITE_SLOTS.map(({ key, label, description }) => (
                      <div key={key} className="bg-gray-700 p-2 rounded">
                        <div className="text-xs font-bold mb-1">{label}</div>
                        <div className="text-xs text-gray-400 mb-2">{description}</div>

                        {editingSkin.tileSprites?.[key] ? (
                          <div className="relative">
                            <img
                              src={editingSkin.tileSprites[key]}
                              alt={label}
                              className="w-full h-12 object-contain bg-gray-600 rounded"
                            />
                            {!isBuiltIn && (
                              <button
                                onClick={() => handleTileSpriteRemove(key)}
                                className="absolute top-0 right-0 px-1 bg-red-600 rounded text-xs hover:bg-red-700"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ) : (
                          <label className={`block ${isBuiltIn ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                            <div className={`w-full h-12 border-2 border-dashed rounded flex items-center justify-center text-xs ${
                              isBuiltIn
                                ? 'border-gray-600 text-gray-600'
                                : 'border-gray-500 text-gray-400 hover:border-gray-400'
                            }`}>
                              {isBuiltIn ? 'Default' : '+ Upload'}
                            </div>
                            {!isBuiltIn && (
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleTileSpriteUpload(key, file);
                                }}
                              />
                            )}
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-800 p-8 rounded text-center">
                <h2 className="text-2xl font-bold mb-4">Puzzle Skin Editor</h2>
                <p className="text-gray-400 mb-6">
                  Create custom visual themes for your puzzles. Skins include border decorations
                  and tile appearances that can be applied to any puzzle.
                </p>
                <button
                  onClick={handleNewSkin}
                  className="px-6 py-3 bg-green-600 rounded text-lg hover:bg-green-700"
                >
                  + Create New Skin
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
