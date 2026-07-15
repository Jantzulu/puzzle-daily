// Tile palette — dense card grid: Void/Empty/Wall built-ins first, then
// custom tiles (skin-aware thumbnails), plus the pressure-plate
// trigger-group selector for the selected custom tile.
import React from 'react';
import { loadPuzzleSkin, loadTileType, resolveImageSource } from '../../../utils/assetStorage';
import type { CustomTileType } from '../../../utils/assetStorage';
import { FolderDropdown } from '../FolderDropdown';
import type { ToolType } from './editorState';

interface TilePaletteProps {
  selectedTool: ToolType;
  skinId?: string;
  customTileTypes: CustomTileType[];
  filteredTileTypes: CustomTileType[];
  tileFolderId: string | null;
  onTileFolderSelect: (folderId: string | null) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  selectedCustomTileTypeId: string | null;
  selectedTriggerGroupId: string;
  onSelectTool: (tool: ToolType) => void;
  onSelectCustomTile: (tileTypeId: string) => void;
  onTriggerGroupChange: (groupId: string) => void;
}

export const TilePalette: React.FC<TilePaletteProps> = ({
  selectedTool,
  skinId,
  customTileTypes,
  filteredTileTypes,
  tileFolderId,
  onTileFolderSelect,
  searchTerm,
  onSearchChange,
  selectedCustomTileTypeId,
  selectedTriggerGroupId,
  onSelectTool,
  onSelectCustomTile,
  onTriggerGroupChange,
}) => {
  const currentSkin = skinId ? loadPuzzleSkin(skinId) : null;
  const skinEmptySprite = currentSkin?.tileSprites?.empty;
  const skinWallSprite = currentSkin?.tileSprites?.wall;
  const skinVoidSprite = currentSkin?.tileSprites?.void;

  // Helper to get the best sprite for a custom tile (skin override > tile default > null)
  const getCustomTileThumbnail = (tileTypeId: string, tileType: { customSprite?: { idleImageData?: string; idleImageUrl?: string } }) => {
    // Priority 1: Skin-specific custom tile sprite
    const skinEntry = currentSkin?.customTileSprites?.[tileTypeId];
    if (skinEntry) {
      if (typeof skinEntry === 'string') return skinEntry;
      if (skinEntry.onSprite) return skinEntry.onSprite;
    }
    // Priority 2: Tile type's own sprite (data URL or HTTP URL)
    return resolveImageSource(tileType.customSprite?.idleImageData, tileType.customSprite?.idleImageUrl);
  };

  const builtinCard = (
    tool: ToolType,
    label: string,
    subtext: string,
    fullText: string,
    thumbBg: string,
    sprite: string | undefined,
    fallbackGlyph: React.ReactNode,
  ) => (
    <button
      onClick={() => onSelectTool(tool)}
      className={`w-full h-full rounded p-1.5 flex flex-col items-center ${
        selectedTool === tool ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
      }`}
      title={fullText}
    >
      <div className={`w-10 h-10 ${thumbBg} rounded flex items-center justify-center overflow-hidden`}>
        {sprite ? (
          <img src={sprite} alt="" className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} loading="lazy" decoding="async" />
        ) : (
          fallbackGlyph
        )}
      </div>
      <span className="text-[11px] leading-tight mt-1">{label}</span>
      <span className="text-[10px] text-stone-400">{subtext}</span>
    </button>
  );

  return (
    <div className="bg-stone-800 p-4 rounded">
      <h2 className="text-lg font-bold mb-3">Tile Type</h2>
      {customTileTypes.length > 0 && (
        <div className="mb-2">
          <FolderDropdown
            category="tiles"
            selectedFolderId={tileFolderId}
            onFolderSelect={onTileFolderSelect}
          />
          <input
            type="text"
            placeholder="Search custom tiles..."
            value={searchTerm}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full bg-stone-700 rounded px-2 py-1 text-sm placeholder-stone-500 mt-2"
          />
        </div>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1.5 max-h-80 overflow-y-auto">
        {builtinCard('void', 'Void', 'No tile', 'Empty space (no tile)', 'bg-stone-900', skinVoidSprite, <span className="text-stone-600">✕</span>)}
        {builtinCard('empty', 'Empty', 'Walkable', 'Walkable floor tile', 'bg-stone-600', skinEmptySprite, <span className="text-stone-400">⬜</span>)}
        {builtinCard('wall', 'Wall', 'Blocks', 'Impassable barrier', 'bg-stone-500', skinWallSprite, <span className="text-parchment-300">▓</span>)}

        {/* Custom tiles */}
        {filteredTileTypes.map(tileType => {
          const isSelected = selectedCustomTileTypeId === tileType.id && selectedTool === 'custom';
          const behaviorIcons = tileType.behaviors.map(b => {
            switch (b.type) {
              case 'damage': return '🔥';
              case 'teleport': return '🌀';
              case 'direction_change': return '➡️';
              case 'ice': return '❄️';
              case 'pressure_plate': return '⬇️';
              default: return '?';
            }
          }).join(' ');

          return (
            <button
              key={tileType.id}
              onClick={() => onSelectCustomTile(tileType.id)}
              className={`w-full h-full rounded p-1.5 flex flex-col items-center ${
                isSelected ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
              }`}
              title={`${tileType.name} — ${tileType.baseType}${behaviorIcons ? ` ${behaviorIcons}` : ''}`}
            >
              <div className="w-10 h-10 bg-stone-600 rounded flex items-center justify-center overflow-hidden">
                {(() => {
                  const thumbSrc = getCustomTileThumbnail(tileType.id, tileType);
                  return thumbSrc ? (
                    <img
                      src={thumbSrc}
                      alt=""
                      className="w-full h-full object-cover"
                      style={{ imageRendering: 'pixelated' }}
                      loading="lazy" decoding="async"
                    />
                  ) : (
                    <span className="text-sm">{behaviorIcons || '⬜'}</span>
                  );
                })()}
              </div>
              <span className="text-[11px] leading-tight truncate w-full text-center mt-1">{tileType.name}</span>
              <span className="text-[10px] text-stone-400 truncate w-full text-center">
                {behaviorIcons || tileType.baseType}
              </span>
            </button>
          );
        })}
      </div>

      {/* Message when no tiles in folder or no tiles at all */}
      {customTileTypes.length === 0 ? (
        <p className="text-xs text-stone-400 mt-2">
          Create custom tiles in{' '}
          <a href="/assets" className="text-blue-400 hover:underline">
            Asset Manager → Tiles
          </a>
        </p>
      ) : filteredTileTypes.length === 0 && (
        <p className="text-xs text-stone-400 mt-2">{searchTerm ? 'No tiles match your search.' : 'No tiles in this folder.'}</p>
      )}

      {/* Trigger Group Selector - Shows for any selected custom tile */}
      {selectedCustomTileTypeId && (() => {
        const tileType = loadTileType(selectedCustomTileTypeId);
        if (!tileType) return null;
        const hasOnOffStates = tileType.cadence?.enabled || tileType.canBeTriggered || tileType.offStateSprite;
        const hasPressurePlate = tileType.behaviors?.some(b => b.type === 'pressure_plate');
        return (
          <div className="mt-3 p-2 bg-stone-700 rounded">
            <label className="text-sm text-stone-300 block mb-1">Trigger Group</label>
            <p className="text-xs text-stone-400 mb-2">
              {hasPressurePlate
                ? 'Tiles in the same group will be toggled when this pressure plate is activated'
                : hasOnOffStates
                  ? 'Assign to a group to control this tile with pressure plates'
                  : 'Assign to a group to link this tile with pressure plates'}
            </p>
            <select
              value={selectedTriggerGroupId}
              onChange={e => onTriggerGroupChange(e.target.value)}
              className="w-full bg-stone-600 rounded px-2 py-1 text-sm"
            >
              <option value="">None{hasOnOffStates ? ' (uses cadence)' : ''}</option>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(group => (
                <option key={group} value={group}>Group {group}</option>
              ))}
            </select>
          </div>
        );
      })()}
    </div>
  );
};
