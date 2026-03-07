import React, { useState, useMemo, useRef, useEffect } from 'react';
import { toast } from '../shared/Toast';
import { findAssetUsages, formatUsageWarning } from '../../utils/assetDependencies';
import { scaledNameClass } from '../../utils/textScale';
import type { PuzzleSkin, CustomBorderSprites, TileSprites, GameState, Puzzle, BorderConfig, Tile, TileOrNull } from '../../types/game';
import { TileType } from '../../types/game';
import { AnimatedGameBoard } from '../game/AnimatedGameBoard';
import { getAllPuzzleSkins, savePuzzleSkin, deletePuzzleSkin, DEFAULT_DUNGEON_SKIN, getFolders, getCustomTileTypes } from '../../utils/assetStorage';
import type { CustomTileType } from '../../utils/assetStorage';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';
import { useBulkSelect, BulkActionBar, bulkDelete, bulkMoveToFolder, bulkExport } from './BulkActions';
import { RichTextEditor } from './RichTextEditor';
import { MediaBrowseButton } from './MediaBrowseButton';
import { VersionHistoryModal } from './VersionHistoryModal';
import { createVersionSnapshot } from '../../services/versionService';
import { AssetEditorLayout } from './AssetEditorLayout';
import { useIsMobile } from '../../hooks/useMediaQuery';

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

/** Build a minimal GameState for the live skin preview */
function buildPreviewGameState(skin: PuzzleSkin, customTileTypes: CustomTileType[]): GameState {
  const width = 4;
  const height = 4;

  const hasBorderSprites = Object.keys(skin.borderSprites).length > 0;
  const borderConfig: BorderConfig | undefined = {
    style: hasBorderSprites ? 'custom' : 'dungeon',
    customBorderSprites: hasBorderSprites ? skin.borderSprites : undefined,
  };

  const tiles: TileOrNull[][] = [];
  for (let y = 0; y < height; y++) {
    const row: TileOrNull[] = [];
    for (let x = 0; x < width; x++) {
      const isEdge = x === 0 || x === width - 1 || y === 0 || y === height - 1;
      const isGoal = x === 2 && y === 2;
      const tile: Tile = { x, y, type: isEdge ? TileType.WALL : isGoal ? TileType.GOAL : TileType.EMPTY, content: undefined };
      // Show first custom tile type in one interior cell
      if (!isEdge && !isGoal && customTileTypes.length > 0 && x === 1 && y === 1) {
        tile.customTileTypeId = customTileTypes[0].id;
      }
      row.push(tile);
    }
    tiles.push(row);
  }

  const puzzle: Puzzle = {
    id: '__skin_preview__',
    date: '',
    name: 'Skin Preview',
    width,
    height,
    tiles,
    enemies: [],
    collectibles: [],
    availableCharacters: [],
    winConditions: [],
    maxCharacters: 0,
    borderConfig,
    skinId: skin.id,
  };

  return {
    puzzle,
    placedCharacters: [],
    currentTurn: 0,
    simulationRunning: false,
    gameStatus: 'setup',
    score: 0,
  };
}

export const SkinEditor: React.FC<{ initialSelectedId?: string }> = ({ initialSelectedId }) => {
  const isMobile = useIsMobile();
  const [skins, setSkins] = useState<PuzzleSkin[]>(() => getAllPuzzleSkins());
  const [selectedSkinId, setSelectedSkinId] = useState<string | null>(null);
  const [editingSkin, setEditingSkin] = useState<PuzzleSkin | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [customTileTypes, setCustomTileTypes] = useState<CustomTileType[]>(() => getCustomTileTypes());
  const [showPreview, setShowPreview] = useState(true);
  const [previewZoom, setPreviewZoom] = useState(1);
  const bulk = useBulkSelect();

  // Live preview game state — rebuilds when editing skin or custom tile types change
  const previewGameState = useMemo(
    () => editingSkin ? buildPreviewGameState(editingSkin, customTileTypes) : null,
    [editingSkin, customTileTypes]
  );

  // URL input states - track which slot is showing URL input and the current input value
  const [showUrlInput, setShowUrlInput] = useState<string | null>(null);
  const [urlInputValue, setUrlInputValue] = useState('');

  // Refresh custom tile types when component mounts or skin changes
  useEffect(() => {
    setCustomTileTypes(getCustomTileTypes());
  }, [editingSkin?.id]);

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

  useEffect(() => {
    if (initialSelectedId) handleSelectSkin(initialSelectedId);
  }, [initialSelectedId]);

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
    toast.success('Skin saved!');
  };

  const handleDeleteSkin = (skinId: string) => {
    if (skinId.startsWith('builtin_')) {
      toast.warning('Cannot delete built-in skins');
      return;
    }
    const usages = findAssetUsages('skin', skinId);
    const warning = usages.length > 0 ? `\n\n${formatUsageWarning(usages)}` : '';
    if (!confirm(`Delete this skin?${warning}`)) return;

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

  // URL setter for border sprites (URLs work directly in img src)
  const setBorderSpriteUrl = (key: keyof CustomBorderSprites, url: string) => {
    if (!editingSkin) return;
    setEditingSkin({
      ...editingSkin,
      borderSprites: {
        ...editingSkin.borderSprites,
        [key]: url,
      },
    });
    setShowUrlInput(null);
    setUrlInputValue('');
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

  // URL setter for tile sprites
  const setTileSpriteUrl = (key: keyof TileSprites, url: string) => {
    if (!editingSkin) return;
    setEditingSkin({
      ...editingSkin,
      tileSprites: {
        ...editingSkin.tileSprites,
        [key]: url,
      },
    });
    setShowUrlInput(null);
    setUrlInputValue('');
  };

  const handleCustomTileSpriteUpload = async (tileTypeId: string, file: File, spriteType: 'on' | 'off' = 'on') => {
    if (!editingSkin) return;
    const base64 = await fileToBase64(file);

    // Check if this tile type has cadence enabled
    const tileType = customTileTypes.find(t => t.id === tileTypeId);
    const hasCadence = tileType?.cadence?.enabled;

    if (hasCadence) {
      // Use object format for cadenced tiles
      const existing = editingSkin.customTileSprites?.[tileTypeId];
      const existingObj = typeof existing === 'string'
        ? { onSprite: existing }
        : (existing || {});

      setEditingSkin({
        ...editingSkin,
        customTileSprites: {
          ...editingSkin.customTileSprites,
          [tileTypeId]: {
            ...existingObj,
            [spriteType === 'on' ? 'onSprite' : 'offSprite']: base64,
          },
        },
      });
    } else {
      // Use simple string format for non-cadenced tiles
      setEditingSkin({
        ...editingSkin,
        customTileSprites: {
          ...editingSkin.customTileSprites,
          [tileTypeId]: base64,
        },
      });
    }
  };

  const handleCustomTileSpriteRemove = (tileTypeId: string, spriteType: 'on' | 'off' = 'on') => {
    if (!editingSkin) return;

    const existing = editingSkin.customTileSprites?.[tileTypeId];

    if (typeof existing === 'object' && existing !== null) {
      // Object format - remove specific sprite
      const newObj = { ...existing };
      delete newObj[spriteType === 'on' ? 'onSprite' : 'offSprite'];

      // If both sprites are gone, remove the entire entry
      if (!newObj.onSprite && !newObj.offSprite) {
        const newCustomTileSprites = { ...editingSkin.customTileSprites };
        delete newCustomTileSprites[tileTypeId];
        setEditingSkin({
          ...editingSkin,
          customTileSprites: newCustomTileSprites,
        });
      } else {
        setEditingSkin({
          ...editingSkin,
          customTileSprites: {
            ...editingSkin.customTileSprites,
            [tileTypeId]: newObj,
          },
        });
      }
    } else {
      // Simple string format - remove entire entry
      const newCustomTileSprites = { ...editingSkin.customTileSprites };
      delete newCustomTileSprites[tileTypeId];
      setEditingSkin({
        ...editingSkin,
        customTileSprites: newCustomTileSprites,
      });
    }
  };

  // URL setter for custom tile sprites
  const setCustomTileSpriteUrl = (tileTypeId: string, url: string, spriteType: 'on' | 'off' = 'on') => {
    if (!editingSkin) return;

    // Check if this tile type has cadence enabled
    const tileType = customTileTypes.find(t => t.id === tileTypeId);
    const hasCadence = tileType?.cadence?.enabled;

    if (hasCadence) {
      // Use object format for cadenced tiles
      const existing = editingSkin.customTileSprites?.[tileTypeId];
      const existingObj = typeof existing === 'string'
        ? { onSprite: existing }
        : (existing || {});

      setEditingSkin({
        ...editingSkin,
        customTileSprites: {
          ...editingSkin.customTileSprites,
          [tileTypeId]: {
            ...existingObj,
            [spriteType === 'on' ? 'onSprite' : 'offSprite']: url,
          },
        },
      });
    } else {
      // Use simple string format for non-cadenced tiles
      setEditingSkin({
        ...editingSkin,
        customTileSprites: {
          ...editingSkin.customTileSprites,
          [tileTypeId]: url,
        },
      });
    }
    setShowUrlInput(null);
    setUrlInputValue('');
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

  const handleDuplicate = (skin: PuzzleSkin, e: React.MouseEvent) => {
    e.stopPropagation();
    const duplicated: PuzzleSkin = {
      ...skin,
      id: 'skin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      name: skin.name + ' (Copy)',
      borderSprites: { ...skin.borderSprites },
      tileSprites: { ...skin.tileSprites },
      customTileSprites: skin.customTileSprites ? { ...skin.customTileSprites } : undefined,
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
    };
    setEditingSkin(duplicated);
    setSelectedSkinId(null);
    setIsCreating(true);
  };

  const isBuiltIn = editingSkin?.isBuiltIn || false;

  const handleBack = () => {
    setSelectedSkinId(null);
    setEditingSkin(null);
    setIsCreating(false);
  };

  return (
    <AssetEditorLayout
      isEditing={!!editingSkin}
      onBack={handleBack}
      listTitle="Skins"
      listPanel={
        <>
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold font-medieval text-copper-400">Puzzle Skins</h2>
              <button
                onClick={handleNewSkin}
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
              category="skins"
              selectedFolderId={selectedFolderId}
              onFolderSelect={setSelectedFolderId}
            />

            <BulkActionBar
              count={bulk.count}
              totalCount={filteredSkins.length}
              onSelectAll={() => bulk.selectAll(filteredSkins.map(s => s.id))}
              onClear={bulk.clear}
              onDelete={() => {
                const nameMap = new Map(skins.map(s => [s.id, s.name]));
                const deleted = bulkDelete([...bulk.selectedIds], 'skin', deletePuzzleSkin, nameMap);
                if (deleted.length) { refreshSkins(); bulk.clear(); if (selectedSkinId && deleted.includes(selectedSkinId)) { setSelectedSkinId(null); setEditingSkin(null); } }
              }}
              onMoveToFolder={() => {
                bulkMoveToFolder([...bulk.selectedIds], 'skins', (id: string) => skins.find(s => s.id === id), savePuzzleSkin);
                refreshSkins(); bulk.clear();
              }}
              onExport={() => {
                const items = skins.filter(s => bulk.selectedIds.has(s.id));
                bulkExport(items, 'skins-export.json');
              }}
            />

            <div className="space-y-2 max-h-[calc(100vh-350px)] overflow-y-auto overflow-x-hidden">
              {filteredSkins.length === 0 ? (
                <div className="dungeon-panel p-4 rounded text-center text-stone-400 text-sm">
                  {searchTerm ? 'No skins match your search.' : 'No puzzle skins yet.'}
                  <br />
                  {!searchTerm && 'Click "+ New" to create one.'}
                </div>
              ) : (
              filteredSkins.map((skin) => (
                <div
                  key={skin.id}
                  className={`p-3 rounded cursor-pointer transition-colors ${
                    bulk.isSelected(skin.id) ? 'bg-blue-900/40 border border-blue-500' :
                    selectedSkinId === skin.id
                      ? 'bg-arcane-700'
                      : 'dungeon-panel hover:bg-stone-700'
                  }`}
                  onClick={() => handleSelectSkin(skin.id)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={bulk.isSelected(skin.id)}
                        onChange={() => bulk.toggle(skin.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-blue-500 flex-shrink-0"
                      />
                      <div className="w-10 h-10 bg-stone-700 rounded overflow-hidden flex-shrink-0 grid grid-cols-2 grid-rows-2">
                        {(() => {
                          const sprites = [
                            skin.borderSprites?.wallFront,
                            skin.borderSprites?.wallBottomOuter,
                            skin.tileSprites?.wall,
                            skin.tileSprites?.empty,
                          ];
                          if (!sprites.some(Boolean)) {
                            return <div className="col-span-2 row-span-2 flex items-center justify-center text-lg">🎨</div>;
                          }
                          return sprites.map((src, i) =>
                            src ? <img key={i} src={src} alt="" className="w-5 h-5 object-cover" style={{ imageRendering: 'pixelated' as const }} />
                                 : <div key={i} className="w-5 h-5 bg-stone-600" />
                          );
                        })()}
                      </div>
                      <div className="min-w-0">
                        <h3 className={`font-bold ${scaledNameClass(skin.name)}`}>{skin.name}</h3>
                        <p className="text-xs text-stone-400">
                          {skin.isBuiltIn && <span className="text-stone-500 mr-1">Built-in</span>}
                          {skin.description || ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-0.5 flex-shrink-0">
                      {!skin.isBuiltIn && (
                        <InlineFolderPicker
                          category="skins"
                          currentFolderId={skin.folderId}
                          onFolderChange={(folderId) => handleFolderChange(skin.id, folderId)}
                        />
                      )}
                      <button
                        onClick={(e) => handleDuplicate(skin, e)}
                        className="p-1 text-xs leading-none bg-stone-600 rounded hover:bg-stone-500"
                        title="Duplicate"
                      >
                        ⎘
                      </button>
                      {!skin.isBuiltIn && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSkin(skin.id);
                          }}
                          className="p-1 text-xs leading-none bg-blood-700 rounded hover:bg-blood-600"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
              )}
            </div>
        </>
      }
      detailPanel={
        editingSkin ? (
          <>
                {/* Persistent Header */}
                <div className="dungeon-panel p-3 md:p-4 rounded">
                  <div className="flex justify-between items-center gap-2">
                    <div className="flex items-center gap-2 md:gap-4 min-w-0">
                      <div className="flex w-10 h-10 md:w-16 md:h-16 bg-stone-700 rounded-pixel items-center justify-center overflow-hidden flex-shrink-0">
                        {editingSkin.thumbnailPreview ? (
                          <img src={editingSkin.thumbnailPreview} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <span className="text-stone-400 text-lg">🎨</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-lg md:text-2xl font-bold font-medieval text-copper-400 truncate">
                          {editingSkin.name || 'Unnamed Skin'}
                        </h2>
                        <p className="text-xs text-stone-400">{isBuiltIn ? 'built-in' : 'custom'}</p>
                      </div>
                    </div>
                    {!isBuiltIn && (
                      <div className="flex gap-1.5 md:gap-2 flex-shrink-0">
                        {!isCreating && (
                          <>
                            <button
                              onClick={async () => {
                                const result = await createVersionSnapshot(editingSkin.id, 'skin', editingSkin.name, editingSkin as unknown as object);
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
                        <button onClick={handleSaveSkin} className="dungeon-btn-success text-sm">
                          <span className="md:hidden">💾</span>
                          <span className="hidden md:inline">Save Skin</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {showVersionHistory && editingSkin && !isBuiltIn && (
                  <VersionHistoryModal
                    isOpen={showVersionHistory}
                    onClose={() => setShowVersionHistory(false)}
                    assetId={editingSkin.id}
                    assetType="skin"
                    assetName={editingSkin.name}
                    currentData={editingSkin as unknown as object}
                    onRestore={(data) => setEditingSkin(data as unknown as PuzzleSkin)}
                  />
                )}

                {isBuiltIn && (
                  <div className="bg-yellow-900/50 p-3 rounded text-yellow-200 text-sm">
                    This is a built-in skin and cannot be modified. Create a new skin to customize.
                  </div>
                )}

                {/* Live Preview + Basic Info — side by side on desktop */}
                <div className="flex flex-col lg:flex-row gap-4">
                  {/* Live Skin Preview */}
                  {previewGameState && (
                    <div className="dungeon-panel p-4 rounded lg:flex-shrink-0">
                      <button
                        onClick={() => setShowPreview(!showPreview)}
                        className="w-full flex items-center justify-between text-lg font-bold"
                      >
                        <span>Live Preview</span>
                        <span className="text-lg text-stone-400">{showPreview ? '▾' : '▸'}</span>
                      </button>
                      {showPreview && (
                        <>
                          <div className="mt-2 flex items-center justify-center gap-2">
                            <button
                              onClick={() => setPreviewZoom(z => Math.max(0.5, z - 0.25))}
                              className="dungeon-button px-2 py-0.5 text-sm"
                              disabled={previewZoom <= 0.5}
                            >−</button>
                            <span className="text-sm text-stone-400 w-12 text-center">{Math.round(previewZoom * 100)}%</span>
                            <button
                              onClick={() => setPreviewZoom(z => Math.min(3, z + 0.25))}
                              className="dungeon-button px-2 py-0.5 text-sm"
                              disabled={previewZoom >= 3}
                            >+</button>
                            {previewZoom !== 1 && (
                              <button
                                onClick={() => setPreviewZoom(1)}
                                className="dungeon-button px-2 py-0.5 text-sm"
                              >Reset</button>
                            )}
                          </div>
                          <div className="mt-2 overflow-auto bg-stone-900 rounded p-2" style={{ maxHeight: 400 }}>
                            <div className="flex justify-center" style={{ minWidth: previewZoom > 1 ? 280 * previewZoom : undefined }}>
                              <AnimatedGameBoard
                                gameState={previewGameState}
                                skinOverride={editingSkin!}
                                maxWidth={Math.round(280 * previewZoom)}
                                maxHeight={Math.round(280 * previewZoom)}
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Basic Info */}
                  <div className="dungeon-panel p-4 rounded space-y-3 flex-1 min-w-0">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-stone-700 rounded overflow-hidden flex-shrink-0 grid grid-cols-2 grid-rows-2">
                        {(() => {
                          const sprites = [
                            editingSkin.borderSprites?.wallFront,
                            editingSkin.borderSprites?.wallBottomOuter,
                            editingSkin.tileSprites?.wall,
                            editingSkin.tileSprites?.empty,
                          ];
                          if (!sprites.some(Boolean)) {
                            return <div className="col-span-2 row-span-2 flex items-center justify-center text-2xl">🎨</div>;
                          }
                          return sprites.map((src, i) =>
                            src ? <img key={i} src={src} alt="" className="w-8 h-8 object-cover" style={{ imageRendering: 'pixelated' as const }} />
                                 : <div key={i} className="w-8 h-8 bg-stone-600" />
                          );
                        })()}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-parchment-200">{editingSkin.name || 'Unnamed Skin'}</h3>
                        <p className="text-xs text-stone-400">{editingSkin.isBuiltIn ? 'Built-in' : 'Custom'}</p>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm mb-1">Name</label>
                      <input
                        type="text"
                        value={editingSkin.name}
                        onChange={(e) => setEditingSkin({ ...editingSkin, name: e.target.value })}
                        disabled={isBuiltIn}
                        className="w-full px-3 py-2 bg-stone-700 rounded disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">Description</label>
                      {isBuiltIn ? (
                        <div className="w-full px-3 py-2 bg-stone-700 rounded opacity-50 text-stone-400">
                          {editingSkin.description || 'No description'}
                        </div>
                      ) : (
                        <RichTextEditor
                          value={editingSkin.description || ''}
                          onChange={(value) => setEditingSkin({ ...editingSkin, description: value })}
                          placeholder="Optional description..."
                          multiline
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-sm mb-1">Folder</label>
                      <select
                        value={editingSkin.folderId || ''}
                        onChange={(e) => setEditingSkin({ ...editingSkin, folderId: e.target.value || undefined })}
                        disabled={isBuiltIn}
                        className="w-full px-3 py-2 bg-stone-700 rounded disabled:opacity-50"
                      >
                        <option value="">Uncategorized</option>
                        {getFolders('skins').map(folder => (
                          <option key={folder.id} value={folder.id}>{folder.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Border Sprites */}
                <div className="dungeon-panel p-4 rounded">
                  <h3 className="text-lg font-bold mb-4">Border Sprites</h3>
                  <p className="text-sm text-stone-400 mb-4">
                    Upload sprites for the walls around the puzzle. Leave empty to use default rendering.
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {BORDER_SPRITE_SLOTS.map(({ key, label, description, size }) => (
                      <div key={key} className="bg-stone-700 p-2 rounded">
                        <div className="text-xs font-bold mb-1">{label}</div>
                        <div className="text-xs text-stone-400 mb-1">{description}</div>
                        <div className="text-xs text-stone-500 mb-2">{size}</div>

                        {editingSkin.borderSprites[key] ? (
                          <div className="space-y-1">
                            <div className="relative">
                              <img
                                src={editingSkin.borderSprites[key]}
                                alt={label}
                                className="w-full h-12 object-contain bg-stone-600 rounded"
                              />
                              {!isBuiltIn && (
                                <button
                                  onClick={() => handleBorderSpriteRemove(key)}
                                  className="absolute top-0 right-0 px-1 bg-blood-700 rounded text-xs hover:bg-blood-600"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                            {editingSkin.borderSprites[key]?.startsWith('http') && (
                              <p className="text-[10px] text-stone-400">✓ URL</p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <label className={`block ${isBuiltIn ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                              <div className={`w-full h-12 border-2 border-dashed rounded flex items-center justify-center text-xs ${
                                isBuiltIn
                                  ? 'border-stone-600 text-stone-600'
                                  : 'border-stone-500 text-stone-400 hover:border-stone-400'
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
                            {!isBuiltIn && (
                              <>
                                <div className="flex items-center gap-1">
                                  <MediaBrowseButton

                                    onSelect={(url) => setBorderSpriteUrl(key, url)}
                                    label="☁️ Browse Media"
                                    className="px-1 py-0.5 text-[10px]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowUrlInput(showUrlInput === `border_${key}` ? null : `border_${key}`);
                                      setUrlInputValue('');
                                    }}
                                    className="text-[10px] text-arcane-400 hover:text-arcane-300"
                                  >
                                    {showUrlInput === `border_${key}` ? '▼ Hide' : '▶ URL'}
                                  </button>
                                </div>
                                {showUrlInput === `border_${key}` && (
                                  <div className="flex gap-1">
                                    <input
                                      type="url"
                                      value={urlInputValue}
                                      onChange={(e) => setUrlInputValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && urlInputValue.trim()) {
                                          setBorderSpriteUrl(key, urlInputValue.trim());
                                        }
                                      }}
                                      placeholder="https://..."
                                      className="flex-1 px-1 py-0.5 bg-stone-600 rounded text-[10px] text-parchment-100 placeholder:text-stone-500"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (urlInputValue.trim()) {
                                          setBorderSpriteUrl(key, urlInputValue.trim());
                                        }
                                      }}
                                      className="px-1 py-0.5 bg-arcane-700 hover:bg-arcane-600 rounded text-[10px]"
                                    >
                                      Set
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tile Sprites */}
                <div className="dungeon-panel p-4 rounded">
                  <h3 className="text-lg font-bold mb-4">Tile Sprites</h3>
                  <p className="text-sm text-stone-400 mb-4">
                    Upload sprites for the floor and wall tiles inside the puzzle. Leave empty to use default colors.
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {TILE_SPRITE_SLOTS.map(({ key, label, description }) => (
                      <div key={key} className="bg-stone-700 p-2 rounded">
                        <div className="text-xs font-bold mb-1">{label}</div>
                        <div className="text-xs text-stone-400 mb-2">{description}</div>

                        {editingSkin.tileSprites?.[key] ? (
                          <div className="space-y-1">
                            <div className="relative">
                              <img
                                src={editingSkin.tileSprites[key]}
                                alt={label}
                                className="w-full h-12 object-contain bg-stone-600 rounded"
                              />
                              {!isBuiltIn && (
                                <button
                                  onClick={() => handleTileSpriteRemove(key)}
                                  className="absolute top-0 right-0 px-1 bg-blood-700 rounded text-xs hover:bg-blood-600"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                            {editingSkin.tileSprites[key]?.startsWith('http') && (
                              <p className="text-[10px] text-stone-400">✓ URL</p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <label className={`block ${isBuiltIn ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                              <div className={`w-full h-12 border-2 border-dashed rounded flex items-center justify-center text-xs ${
                                isBuiltIn
                                  ? 'border-stone-600 text-stone-600'
                                  : 'border-stone-500 text-stone-400 hover:border-stone-400'
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
                            {!isBuiltIn && (
                              <>
                                <div className="flex items-center gap-1">
                                  <MediaBrowseButton

                                    onSelect={(url) => setTileSpriteUrl(key, url)}
                                    label="☁️ Browse Media"
                                    className="px-1 py-0.5 text-[10px]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowUrlInput(showUrlInput === `tile_${key}` ? null : `tile_${key}`);
                                      setUrlInputValue('');
                                    }}
                                    className="text-[10px] text-arcane-400 hover:text-arcane-300"
                                  >
                                    {showUrlInput === `tile_${key}` ? '▼ Hide' : '▶ URL'}
                                  </button>
                                </div>
                                {showUrlInput === `tile_${key}` && (
                                  <div className="flex gap-1">
                                    <input
                                      type="url"
                                      value={urlInputValue}
                                      onChange={(e) => setUrlInputValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && urlInputValue.trim()) {
                                          setTileSpriteUrl(key, urlInputValue.trim());
                                        }
                                      }}
                                      placeholder="https://..."
                                      className="flex-1 px-1 py-0.5 bg-stone-600 rounded text-[10px] text-parchment-100 placeholder:text-stone-500"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (urlInputValue.trim()) {
                                          setTileSpriteUrl(key, urlInputValue.trim());
                                        }
                                      }}
                                      className="px-1 py-0.5 bg-arcane-700 hover:bg-arcane-600 rounded text-[10px]"
                                    >
                                      Set
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Custom Tile Types */}
                <div className="dungeon-panel p-4 rounded">
                  <h3 className="text-lg font-bold mb-4">Custom Tile Types</h3>
                  <p className="text-sm text-stone-400 mb-4">
                    Upload custom sprites for your custom tile types within this skin.
                    If no sprite is set, the tile type's default sprite will be used.
                    Tile types with cadence enabled show separate slots for on/off states.
                  </p>
                  {customTileTypes.length === 0 ? (
                    <div className="text-sm text-stone-500 text-center py-4">
                      No custom tile types created yet. Create custom tile types in the Tiles tab.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {customTileTypes.map((tileType) => {
                        const hasCadence = tileType.cadence?.enabled;
                        const skinSprite = editingSkin.customTileSprites?.[tileType.id];
                        const spriteObj = typeof skinSprite === 'object' ? skinSprite : null;
                        const spriteStr = typeof skinSprite === 'string' ? skinSprite : null;

                        // Helper to render a sprite slot
                        const renderSpriteSlot = (
                          label: string,
                          spriteType: 'on' | 'off',
                          currentSprite: string | undefined,
                          defaultSprite: string | undefined
                        ) => {
                          const urlKey = `customtile_${tileType.id}_${spriteType}`;
                          return (
                          <div className="flex-1">
                            <div className="text-xs text-stone-400 mb-1">{label}</div>
                            {currentSprite ? (
                              <div className="relative">
                                <img
                                  src={currentSprite}
                                  alt={`${tileType.name} ${label}`}
                                  className="w-full h-10 object-contain bg-stone-600 rounded"
                                />
                                {!isBuiltIn && (
                                  <button
                                    onClick={() => handleCustomTileSpriteRemove(tileType.id, spriteType)}
                                    className="absolute top-0 right-0 px-1 bg-blood-700 rounded text-xs hover:bg-blood-600"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="relative">
                                {defaultSprite && (
                                  <img
                                    src={defaultSprite}
                                    alt={`${tileType.name} ${label} default`}
                                    className="w-full h-10 object-contain bg-stone-600 rounded opacity-50"
                                    title={`Default ${label.toLowerCase()} sprite`}
                                  />
                                )}
                                <label className={`block ${isBuiltIn ? 'cursor-not-allowed' : 'cursor-pointer'} ${defaultSprite ? 'absolute inset-0' : ''}`}>
                                  <div className={`w-full h-10 border-2 border-dashed rounded flex items-center justify-center text-xs ${
                                    isBuiltIn
                                      ? 'border-stone-600 text-stone-600'
                                      : 'border-stone-500 text-stone-400 hover:border-stone-400'
                                  } ${defaultSprite ? 'bg-black/50' : ''}`}>
                                    {isBuiltIn ? 'Default' : (defaultSprite ? 'Override' : '+ Upload')}
                                  </div>
                                  {!isBuiltIn && (
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleCustomTileSpriteUpload(tileType.id, file, spriteType);
                                      }}
                                    />
                                  )}
                                </label>
                              </div>
                            )}
                            {!isBuiltIn && (
                              <div className="mt-1">
                                <div className="flex items-center gap-1">
                                  <MediaBrowseButton

                                    onSelect={(url) => setCustomTileSpriteUrl(tileType.id, url, spriteType)}
                                    label="☁️ Browse Media"
                                    className="px-1 py-0.5 text-[10px]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowUrlInput(showUrlInput === urlKey ? null : urlKey);
                                      setUrlInputValue('');
                                    }}
                                    className="text-[10px] text-arcane-400 hover:text-arcane-300"
                                  >
                                    {showUrlInput === urlKey ? '▼ Hide' : '▶ URL'}
                                  </button>
                                </div>
                                {showUrlInput === urlKey && (
                                  <div className="flex gap-1 mt-0.5">
                                    <input
                                      type="url"
                                      value={urlInputValue}
                                      onChange={(e) => setUrlInputValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && urlInputValue.trim()) {
                                          setCustomTileSpriteUrl(tileType.id, urlInputValue.trim(), spriteType);
                                        }
                                      }}
                                      placeholder="https://..."
                                      className="flex-1 px-1 py-0.5 bg-stone-600 rounded text-[10px] text-parchment-100 placeholder:text-stone-500"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (urlInputValue.trim()) {
                                          setCustomTileSpriteUrl(tileType.id, urlInputValue.trim(), spriteType);
                                        }
                                      }}
                                      className="px-1 py-0.5 bg-arcane-700 hover:bg-arcane-600 rounded text-[10px]"
                                    >
                                      Set
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          );
                        };

                        return (
                          <div key={tileType.id} className="bg-stone-700 p-2 rounded">
                            <div className="text-xs font-bold mb-1 flex items-center gap-1">
                              {tileType.name}
                              {hasCadence && (
                                <span className="text-yellow-400 text-[10px]" title="Has on/off cadence">⟳</span>
                              )}
                            </div>
                            <div className="text-xs text-stone-400 mb-2 truncate" title={tileType.description}>
                              {tileType.description || `${tileType.baseType} tile`}
                            </div>

                            {hasCadence ? (
                              // Cadenced tile - show two slots
                              <div className="flex gap-2">
                                {renderSpriteSlot(
                                  'On State',
                                  'on',
                                  spriteObj?.onSprite || spriteStr || undefined,
                                  tileType.customSprite?.idleImageData
                                )}
                                {renderSpriteSlot(
                                  'Off State',
                                  'off',
                                  spriteObj?.offSprite,
                                  tileType.offStateSprite?.idleImageData
                                )}
                              </div>
                            ) : (
                              // Non-cadenced tile - single slot
                              <div>
                                {spriteStr || spriteObj?.onSprite ? (
                                  <div className="relative">
                                    <img
                                      src={spriteStr || spriteObj?.onSprite}
                                      alt={tileType.name}
                                      className="w-full h-12 object-contain bg-stone-600 rounded"
                                    />
                                    {!isBuiltIn && (
                                      <button
                                        onClick={() => handleCustomTileSpriteRemove(tileType.id, 'on')}
                                        className="absolute top-0 right-0 px-1 bg-blood-700 rounded text-xs hover:bg-blood-600"
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <div className="relative">
                                    {tileType.customSprite?.idleImageData && (
                                      <img
                                        src={tileType.customSprite.idleImageData}
                                        alt={`${tileType.name} default`}
                                        className="w-full h-12 object-contain bg-stone-600 rounded opacity-50"
                                        title="Default sprite (from tile type)"
                                      />
                                    )}
                                    <label className={`block ${isBuiltIn ? 'cursor-not-allowed' : 'cursor-pointer'} ${tileType.customSprite?.idleImageData ? 'absolute inset-0' : ''}`}>
                                      <div className={`w-full h-12 border-2 border-dashed rounded flex items-center justify-center text-xs ${
                                        isBuiltIn
                                          ? 'border-stone-600 text-stone-600'
                                          : 'border-stone-500 text-stone-400 hover:border-stone-400'
                                      } ${tileType.customSprite?.idleImageData ? 'bg-black/50' : ''}`}>
                                        {isBuiltIn ? 'Default' : (tileType.customSprite?.idleImageData ? 'Override' : '+ Upload')}
                                      </div>
                                      {!isBuiltIn && (
                                        <input
                                          type="file"
                                          accept="image/*"
                                          className="hidden"
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleCustomTileSpriteUpload(tileType.id, file, 'on');
                                          }}
                                        />
                                      )}
                                    </label>
                                  </div>
                                )}
                                {!isBuiltIn && (
                                  <div className="mt-1">
                                    <div className="flex items-center gap-1">
                                      <MediaBrowseButton
    
                                        onSelect={(url) => setCustomTileSpriteUrl(tileType.id, url, 'on')}
                                        label="☁️ Browse Media"
                                        className="px-1 py-0.5 text-[10px]"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setShowUrlInput(showUrlInput === `customtile_${tileType.id}` ? null : `customtile_${tileType.id}`);
                                          setUrlInputValue('');
                                        }}
                                        className="text-[10px] text-arcane-400 hover:text-arcane-300"
                                      >
                                        {showUrlInput === `customtile_${tileType.id}` ? '▼ Hide' : '▶ URL'}
                                      </button>
                                    </div>
                                    {showUrlInput === `customtile_${tileType.id}` && (
                                      <div className="flex gap-1 mt-0.5">
                                        <input
                                          type="url"
                                          value={urlInputValue}
                                          onChange={(e) => setUrlInputValue(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' && urlInputValue.trim()) {
                                              setCustomTileSpriteUrl(tileType.id, urlInputValue.trim(), 'on');
                                            }
                                          }}
                                          placeholder="https://..."
                                          className="flex-1 px-1 py-0.5 bg-stone-600 rounded text-[10px] text-parchment-100 placeholder:text-stone-500"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (urlInputValue.trim()) {
                                              setCustomTileSpriteUrl(tileType.id, urlInputValue.trim(), 'on');
                                            }
                                          }}
                                          className="px-1 py-0.5 bg-arcane-700 hover:bg-arcane-600 rounded text-[10px]"
                                        >
                                          Set
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
          </>
        ) : null
      }
      emptyState={
        <div className="dungeon-panel p-8 rounded text-center">
          <h2 className="text-2xl font-bold mb-4">Puzzle Skin Editor</h2>
          <p className="text-stone-400 mb-6">
            Create custom visual themes for your puzzles. Skins include border decorations
            and tile appearances that can be applied to any puzzle.
          </p>
          <button
            onClick={handleNewSkin}
            className="px-6 py-3 bg-moss-700 rounded text-lg hover:bg-moss-600"
          >
            + Create New Skin
          </button>
        </div>
      }
    />
  );
};
