import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { toast } from '../shared/Toast';
import { findAssetUsages, formatUsageWarning } from '../../utils/assetDependencies';
import { scaledNameClass } from '../../utils/textScale';
import type { PuzzleSkin, CustomBorderSprites, TileSprites, GameState, Puzzle, BorderConfig, Tile, TileOrNull } from '../../types/game';
import { TileType } from '../../types/game';
import { AnimatedGameBoard } from '../game/AnimatedGameBoard';
import { getAllPuzzleSkins, savePuzzleSkin, deletePuzzleSkin, getFolders, getCustomTileTypes } from '../../utils/assetStorage';
import type { CustomTileType } from '../../utils/assetStorage';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';
import { useBulkSelect, BulkActionBar, bulkDelete, bulkMoveToFolder, bulkExport, bulkImport } from './BulkActions';
import { RichTextEditor } from './RichTextEditor';
import { MediaBrowseButton } from './MediaBrowseButton';
import { VersionHistoryModal } from './VersionHistoryModal';
import { createVersionSnapshot } from '../../services/versionService';
import { AssetEditorLayout } from './AssetEditorLayout';
import { AssetBrowseTable, useBrowseSort, type BrowseColumn } from './AssetBrowseTable';
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
  // Hallway openings (2026-07-16) — corridor interior where a hallway
  // marker opens the wall; the game fades the far half to black on top,
  // so draw these fully lit.
  { key: 'hallwayTop', label: 'Hallway Top', description: 'Corridor through the top wall (darkness added in-game)', size: '48x48' },
  { key: 'hallwayBottom', label: 'Hallway Bottom', description: 'Corridor through the bottom wall (darkness added in-game)', size: '48x48' },
  { key: 'hallwayLeft', label: 'Hallway Left', description: 'Corridor through the left wall (darkness added in-game)', size: '48x48' },
  { key: 'hallwayRight', label: 'Hallway Right', description: 'Corridor through the right wall (darkness added in-game)', size: '48x48' },
  // Doors (2026-07-16 phase 2) — replace a top/bottom wall segment; the
  // opening sheet is a horizontal strip of square frames (closed → open),
  // closing plays it reversed. Leave the doorway transparent in Door Open
  // so a hallway behind it shows through.
  { key: 'doorClosed', label: 'Door Closed', description: 'Closed door on a top/bottom wall', size: '48x48' },
  { key: 'doorOpening', label: 'Door Opening', description: 'Horizontal strip of square frames, closed → open', size: '48xN strip' },
  { key: 'doorOpen', label: 'Door Open', description: 'Open door — transparent doorway shows a hallway behind', size: '48x48' },
];

// Tile sprite slot configuration
const TILE_SPRITE_SLOTS: { key: keyof TileSprites; label: string; description: string }[] = [
  { key: 'empty', label: 'Floor Tile', description: 'Empty/walkable floor (48x48, tileable)' },
  { key: 'wall', label: 'Wall Tile', description: 'Wall/blocked tile (48x48, tileable)' },
  { key: 'goal', label: 'Goal Tile', description: 'Goal/exit tile (48x48)' },
];

/**
 * Section wrapper for the detail pane. Same collapse behaviour as
 * CollapsiblePanel, but wearing the Production-dashboard skin: one thin
 * border, an uppercase header strip, and a tight p-3 body instead of the
 * dungeon-panel bevel + p-4. Defined at module scope so collapse state
 * survives SkinEditor re-renders.
 */
const Section: React.FC<{
  title: string;
  className?: string;
  defaultCollapsed?: boolean;
  /** Extra controls rendered on the right of the header strip. */
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, className = '', defaultCollapsed = false, headerRight, children }) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div className={`border border-stone-700 rounded overflow-hidden ${className}`}>
      <div className="bg-stone-800 flex items-center gap-2 px-2 py-1.5">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex-1 min-w-0 flex items-center justify-between text-xs uppercase text-stone-400 hover:text-stone-200"
        >
          <span className="truncate">{title}</span>
          <span>{collapsed ? '▸' : '▾'}</span>
        </button>
        {headerRight}
      </div>
      {!collapsed && <div className="p-3">{children}</div>}
    </div>
  );
};

/** 2x2 sprite mosaic used as a skin's thumbnail in the list and browse table. */
const SkinThumb: React.FC<{ skin: PuzzleSkin }> = ({ skin }) => {
  const sprites = [
    skin.borderSprites?.wallFront,
    skin.borderSprites?.wallBottomOuter,
    skin.tileSprites?.wall,
    skin.tileSprites?.empty,
  ];
  if (!sprites.some(Boolean)) {
    return (
      <div className="w-7 h-7 flex-shrink-0 bg-stone-800 border border-stone-700 rounded flex items-center justify-center text-xs">
        🎨
      </div>
    );
  }
  return (
    <div className="w-7 h-7 flex-shrink-0 bg-stone-800 border border-stone-700 rounded overflow-hidden grid grid-cols-2 grid-rows-2">
      {sprites.map((src, i) =>
        src ? (
          <img
            key={i}
            src={src}
            alt=""
            className="w-full h-full object-cover"
            style={{ imageRendering: 'pixelated' as const }}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div key={i} className="w-full h-full bg-stone-700" />
        )
      )}
    </div>
  );
};

/** How many of the fixed sprite slots a skin actually fills. */
const borderSpriteCount = (skin: PuzzleSkin) =>
  BORDER_SPRITE_SLOTS.filter(({ key }) => !!skin.borderSprites?.[key]).length;
const tileSpriteCount = (skin: PuzzleSkin) =>
  TILE_SPRITE_SLOTS.filter(({ key }) => !!skin.tileSprites?.[key]).length;
const customTileSpriteCount = (skin: PuzzleSkin) =>
  Object.values(skin.customTileSprites ?? {}).filter(v =>
    typeof v === 'string' ? !!v : !!(v?.onSprite || v?.offSprite)
  ).length;

// Highlight region mapping: each border/tile slot key → { x, y, w, h } in
// LAYOUT-BOX pixels. The board's layout box is the un-overhung canvas
// (320×384 for the 6x6 preview: grid=288×288, border top/bottom=48,
// sides=16) — corridor overhang bleeds OUT of the box via negative canvas
// margins, so hallway regions use negative / out-of-range coords and the
// overlay divs simply extend past the box like the corridors do.
// Grid origin: x=16 (SIDE_BORDER_SIZE), y=48 (BORDER_SIZE)
// Each tile: 48×48. Tile (col,row) → pixel (16+col*48, 48+row*48)
// Highlight regions computed from AnimatedGameBoard's actual drawing logic.
// Layout voids: (5,2), (0,3), (1,3), (5,3), (0,4), (1,4)
// Corner positions derived from computeSmartBorder + drawImage offsets.
const SLOT_HIGHLIGHT_REGIONS: Record<string, { x: number; y: number; w: number; h: number }[]> = {
  // Outer border slots
  wallFront:       [{ x: 16, y: 0, w: 288, h: 48 }],
  wallBottomOuter: [{ x: 16, y: 336, w: 288, h: 48 }],
  wallSide:        [{ x: 0, y: 48, w: 16, h: 288 }, { x: 304, y: 48, w: 16, h: 288 }],
  // wallTop: inner horizontal wall above voids (top edge of tiles below voids)
  // tile(4,2) top edge → above void(5,2); tiles(0,2)&(1,2) bottom → above voids(0,3)&(1,3)
  wallTop: [
    { x: 256, y: 144, w: 48, h: 24 },   // above void column on right
    { x: 16,  y: 192, w: 96, h: 24 },   // above void block on left
  ],
  // Outer corners (full-size, on perimeter)
  cornerTopLeft:     [{ x: 0,   y: 0,   w: 16, h: 48 }],   // convex-tl at tile(0,0)
  cornerTopRight:    [{ x: 304, y: 0,   w: 16, h: 48 }],   // convex-tr at tile(5,0)
  cornerBottomLeft:  [{ x: 0,   y: 336, w: 16, h: 48 }],   // convex-bl at tile(0,5) isOB
  cornerBottomRight: [{ x: 304, y: 336, w: 16, h: 48 }],   // convex-br at tile(5,5) isOB
  // Thin outer corners (convex, non-outer-bottom, at void edges)
  cornerBottomLeftThin:  [{ x: 0,   y: 192, w: 16, h: 16 }],  // convex-bl at tile(0,2)
  cornerBottomRightThin: [{ x: 304, y: 144, w: 16, h: 16 }],  // convex-br at tile(5,1)
  // Inner corners (concave — where floor meets void diagonally)
  innerCornerTopLeft:     [{ x: 96,  y: 240, w: 16, h: 48 }],  // concave-tl at tile(2,5)
  innerCornerTopRight:    [{ x: 256, y: 192, w: 16, h: 48 }],  // concave-tr at tile(4,4) — note: 48h because !isOB maps to BORDER_SIZE in concave-tr
  innerCornerBottomLeft:  [{ x: 96,  y: 192, w: 16, h: 16 }],  // concave-bl at tile(2,2) !isOB → thin
  innerCornerBottomRight: [{ x: 256, y: 144, w: 16, h: 16 }],  // concave-br at tile(4,1) !isOB → thin
  // Thin inner corners (same position, used when !isOuterBottom)
  innerCornerBottomLeftThin:  [{ x: 96,  y: 192, w: 16, h: 16 }],  // concave-bl thin at tile(2,2)
  innerCornerBottomRightThin: [{ x: 256, y: 144, w: 16, h: 16 }],  // concave-br thin at tile(4,1)
  // Hallway openings — preview markers: top at tile(2,0), bottom at
  // tile(3,5), left at tile(0,1), right at tile(5,0). Side corridors are
  // 48 deep, top/bottom 72 deep — they extend past the layout box.
  hallwayTop:    [{ x: 112, y: -24, w: 48, h: 72 }],
  hallwayBottom: [{ x: 160, y: 336, w: 48, h: 72 }],
  hallwayLeft:   [{ x: -32, y: 96,  w: 48, h: 48 }],
  hallwayRight:  [{ x: 304, y: 48,  w: 48, h: 48 }],
  // Doors — preview markers: closed at tile(0,0) top, opening at tile(4,0) top
  doorClosed:  [{ x: 16,  y: 0, w: 48, h: 48 }],
  doorOpening: [{ x: 208, y: 0, w: 48, h: 48 }],
  doorOpen:    [{ x: 208, y: 0, w: 48, h: 48 }],
  // Tile slots — highlight a representative tile
  empty: [{ x: 16,  y: 48,  w: 48, h: 48 }],   // tile(0,0) floor
  wall:  [{ x: 64,  y: 96,  w: 48, h: 48 }],    // tile(1,1) wall
  goal:  [{ x: 160, y: 96,  w: 48, h: 48 }],     // tile(3,1) wall (goal)
};

/** Build a minimal GameState for the live skin preview */
function buildPreviewGameState(skin: PuzzleSkin, customTileTypes: CustomTileType[], tileOverrides?: Record<string, string>): GameState {
  const width = 6;
  const height = 6;

  const hasBorderSprites = Object.keys(skin.borderSprites).length > 0;
  const borderConfig: BorderConfig | undefined = {
    style: hasBorderSprites ? 'custom' : 'dungeon',
    customBorderSprites: hasBorderSprites ? skin.borderSprites : undefined,
  };

  // Layout with void spaces to showcase all border segment types:
  // inner corners, wallTop edges, thin corners, etc.
  // W=wall, G=goal, .=floor, null=void, C=custom tile
  // Row 0: .  .  .  .  .  .
  // Row 1: .  W  .  W  .  .
  // Row 2: .  .  .  .  .  null
  // Row 3: null null .  .  .  null
  // Row 4: null null .  .  .  .
  // Row 5: .  .  .  .  .  .
  const layout: (string | null)[][] = [
    ['.', '.', '.', '.', '.', '.'],
    ['.', 'W', '.', 'W', '.', '.'],
    ['.', '.', '.', '.', '.', null],
    [null, null, '.', '.', '.', null],
    [null, null, '.', '.', '.', '.'],
    ['.', '.', '.', '.', '.', '.'],
  ];

  const tiles: TileOrNull[][] = [];
  for (let y = 0; y < height; y++) {
    const row: TileOrNull[] = [];
    for (let x = 0; x < width; x++) {
      const cell = layout[y][x];
      if (cell === null) {
        row.push(null); // void tile
      } else {
        const type = cell === 'W' ? TileType.WALL : cell === 'G' ? TileType.GOAL : TileType.EMPTY;
        const tile: Tile = { x, y, type, content: undefined };
        // Apply custom tile overrides from paint mode
        const overrideId = tileOverrides?.[`${x},${y}`];
        if (overrideId) {
          tile.customTileTypeId = overrideId;
        } else if (cell === 'C' && customTileTypes.length > 0) {
          tile.customTileTypeId = customTileTypes[0].id;
        }
        row.push(tile);
      }
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
    // One hallway per side so the hallway slot pieces (and the procedural
    // fallback) show live in the preview — positions match
    // SLOT_HIGHLIGHT_REGIONS' hallway entries.
    hallways: [
      { x: 2, y: 0, side: 'top' },
      { x: 3, y: 5, side: 'bottom' },
      { x: 0, y: 1, side: 'left' },
      { x: 5, y: 0, side: 'right' },
    ],
    // Two preview doors: a resting closed one, and one that plays the
    // opening sheet on mount then holds open — covers all three slots.
    doors: [
      { x: 0, y: 0, side: 'top', startState: 'closed' },
      { x: 4, y: 0, side: 'top', startState: 'opening' },
    ],
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
  const [highlightedSlot, setHighlightedSlot] = useState<string | null>(null);
  // Desktop magnifier state
  const [magnifierOn, setMagnifierOn] = useState(false);
  const [magnifierZoom, setMagnifierZoom] = useState(3);
  const [magnifierOrigin, setMagnifierOrigin] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Mobile pinch-to-zoom state
  const [touchZoom, setTouchZoom] = useState(1);
  const [touchPan, setTouchPan] = useState({ x: 0, y: 0 });
  const touchStateRef = useRef<{
    initialDistance: number;
    initialZoom: number;
    initialPan: { x: number; y: number };
    initialMidpoint: { x: number; y: number };
    lastMidpoint: { x: number; y: number };
    isPinching: boolean;
  } | null>(null);

  const handlePreviewMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!magnifierOn || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    setMagnifierOrigin(`${xPct}% ${yPct}%`);
  }, [magnifierOn]);

  const handlePreviewMouseLeave = useCallback(() => {
    setMagnifierOrigin(null);
  }, []);

  // Scroll wheel adjusts magnifier zoom when hovering over the preview
  useEffect(() => {
    const el = previewRef.current;
    if (!el || !magnifierOn) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setMagnifierZoom(z => {
        const delta = e.deltaY > 0 ? -0.5 : 0.5;
        return Math.round(Math.min(8, Math.max(1.5, z + delta)) * 10) / 10;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [magnifierOn]);

  // Mobile pinch-to-zoom + pan via touch events
  useEffect(() => {
    const el = previewRef.current;
    if (!el || !isMobile) return;

    const getDistance = (t1: Touch, t2: Touch) =>
      Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    const getMidpoint = (t1: Touch, t2: Touch) => ({
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    });

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const d = getDistance(e.touches[0], e.touches[1]);
        const mid = getMidpoint(e.touches[0], e.touches[1]);
        touchStateRef.current = {
          initialDistance: d,
          initialZoom: touchZoom,
          initialPan: { ...touchPan },
          initialMidpoint: mid,
          lastMidpoint: mid,
          isPinching: true,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchStateRef.current?.isPinching) {
        e.preventDefault();
        const d = getDistance(e.touches[0], e.touches[1]);
        const mid = getMidpoint(e.touches[0], e.touches[1]);
        const state = touchStateRef.current;
        const scale = d / state.initialDistance;
        const newZoom = Math.min(8, Math.max(1, state.initialZoom * scale));
        const dx = mid.x - state.initialMidpoint.x;
        const dy = mid.y - state.initialMidpoint.y;
        setTouchZoom(Math.round(newZoom * 10) / 10);
        setTouchPan({
          x: state.initialPan.x + dx,
          y: state.initialPan.y + dy,
        });
        state.lastMidpoint = mid;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && touchStateRef.current?.isPinching) {
        touchStateRef.current.isPinching = false;
        touchStateRef.current = null;
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [isMobile, touchZoom, touchPan]);
  const bulk = useBulkSelect();

  // Custom tile painting on preview
  const [previewTileOverrides, setPreviewTileOverrides] = useState<Record<string, string>>({});
  const [paintTileTypeId, setPaintTileTypeId] = useState<string | null>(null);

  // Live preview game state — rebuilds when editing skin or custom tile types change
  const previewGameState = useMemo(
    () => editingSkin ? buildPreviewGameState(editingSkin, customTileTypes, previewTileOverrides) : null,
    [editingSkin, customTileTypes, previewTileOverrides]
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSelectSkin is stable; only run on mount with initialSelectedId
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

  const folderNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of getFolders('skins')) map.set(f.id, f.name);
    return map;
  }, [skins]); // eslint-disable-line react-hooks/exhaustive-deps -- folders change alongside asset edits

  // Computed once per load, not per render and not per sort comparison —
  // findAssetUsages scans every other asset, so calling it inside a
  // comparator would rescan the library O(n log n) times.
  const usagesBySkin = useMemo(() => {
    const map = new Map<string, ReturnType<typeof findAssetUsages>>();
    for (const s of skins) map.set(s.id, findAssetUsages('skin', s.id));
    return map;
  }, [skins]);

  const rowActionButtons = (skin: PuzzleSkin) => (
    <>
      {!skin.isBuiltIn && (
        <InlineFolderPicker
          category="skins"
          currentFolderId={skin.folderId}
          onFolderChange={(folderId) => handleFolderChange(skin.id, folderId)}
        />
      )}
      <button
        onClick={(e) => handleDuplicate(skin, e)}
        className="px-1 py-0.5 text-xs leading-none rounded border border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800"
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
          className="px-1 py-0.5 text-xs leading-none rounded border bg-red-900/40 text-red-300 border-red-700/50 hover:bg-red-900/60"
          title="Delete"
        >
          ✕
        </button>
      )}
    </>
  );

  const browseColumns: BrowseColumn<PuzzleSkin>[] = [
    {
      key: 'sprite',
      label: '',
      sortable: false,
      className: 'w-10',
      render: (s) => <SkinThumb skin={s} />,
    },
    {
      key: 'name',
      label: 'Name',
      value: (s) => s.name || 'Unnamed',
      render: (s) => <span className="text-parchment-100">{s.name || 'Unnamed'}</span>,
    },
    {
      key: 'origin',
      label: 'Origin',
      value: (s) => (s.isBuiltIn ? 'Built-in' : 'Custom'),
      render: (s) => (
        <span className={`px-1.5 py-0 rounded border text-[10px] whitespace-nowrap ${
          s.isBuiltIn
            ? 'bg-stone-800 text-stone-400 border-stone-600'
            : 'bg-arcane-900/40 text-arcane-300 border-arcane-700/50'
        }`}>
          {s.isBuiltIn ? 'Built-in' : 'Custom'}
        </span>
      ),
    },
    {
      key: 'border',
      label: 'Border',
      align: 'right',
      value: (s) => borderSpriteCount(s),
      render: (s) => {
        const n = borderSpriteCount(s);
        return (
          <span className={n === 0 ? 'text-stone-600' : 'text-stone-300'}>
            {n}<span className="text-stone-600">/{BORDER_SPRITE_SLOTS.length}</span>
          </span>
        );
      },
    },
    {
      key: 'tiles',
      label: 'Tiles',
      align: 'right',
      value: (s) => tileSpriteCount(s),
      render: (s) => {
        const n = tileSpriteCount(s);
        return (
          <span className={n === 0 ? 'text-stone-600' : 'text-stone-300'}>
            {n}<span className="text-stone-600">/{TILE_SPRITE_SLOTS.length}</span>
          </span>
        );
      },
    },
    {
      key: 'customTiles',
      label: 'Custom',
      align: 'right',
      value: (s) => customTileSpriteCount(s) || null,
      render: (s) => {
        const n = customTileSpriteCount(s);
        return n === 0
          ? <span className="text-stone-600">—</span>
          : <span className="text-stone-300">{n}<span className="text-stone-600">/{customTileTypes.length}</span></span>;
      },
    },
    {
      key: 'folder',
      label: 'Folder',
      value: (s) => (s.folderId ? folderNames.get(s.folderId) ?? null : null),
      render: (s) => {
        const name = s.folderId ? folderNames.get(s.folderId) : undefined;
        return name
          ? <span className="text-xs text-stone-400">{name}</span>
          : <span className="text-stone-600">—</span>;
      },
    },
    {
      key: 'usedBy',
      label: 'Used by',
      value: (s) => usagesBySkin.get(s.id)?.length || null,
      render: (s) => {
        const usages = usagesBySkin.get(s.id) ?? [];
        if (usages.length === 0) return <span className="text-stone-600">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {usages.map((u, i) => (
              <span
                key={i}
                className="text-[10px] px-1.5 py-0 rounded border whitespace-nowrap bg-arcane-900/40 text-arcane-300 border-arcane-700/50"
              >
                🧩 {u.name}
              </span>
            ))}
          </div>
        );
      },
    },
  ];

  // One ordering feeds the table, the sidebar list, and prev/next.
  const sort = useBrowseSort(filteredSkins, browseColumns, 'name');

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
      category="skins"
      selectedFolderId={selectedFolderId}
      onFolderSelect={setSelectedFolderId}
    />
  );

  const newButton = (
    <button
      onClick={handleNewSkin}
      className="px-2 py-0.5 rounded border text-xs bg-green-900/40 text-green-300 border-green-700/50 hover:bg-green-900/60 flex-shrink-0"
    >
      + New
    </button>
  );

  const countLabel = (
    <span className="ml-1.5 text-xs font-sans text-stone-500">
      {filteredSkins.length}{filteredSkins.length !== skins.length && ` / ${skins.length}`}
    </span>
  );

  const bulkBar = (
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
        bulkExport(items, 'skins-export.json', 'skin');
      }}
      onImport={() => bulkImport({
        assetType: 'skin',
        saveFn: savePuzzleSkin,
        existingIds: new Set(skins.map(s => s.id)),
        onComplete: () => { refreshSkins(); bulk.clear(); },
      })}
    />
  );

  return (
    <AssetEditorLayout
      isEditing={!!editingSkin}
      onBack={handleBack}
      listTitle="Skins"
      listPanel={
        <>
          <div className="flex justify-between items-center gap-2">
            <h2 className="text-lg font-medieval text-copper-400">
              Puzzle Skins
              {countLabel}
            </h2>
            {newButton}
          </div>

          {/* Search + folder filter share one row so the list starts higher */}
          <div className="flex items-center gap-1.5">
            {searchInput}
            <div className="w-32 flex-shrink-0">{folderFilter}</div>
          </div>

          {bulkBar}

          <div className="border border-stone-700 rounded max-h-[calc(100vh-250px)] overflow-y-auto overflow-x-hidden dense-scrollbar">
            {filteredSkins.length === 0 ? (
              <div className="px-2 py-4 text-center text-stone-500 text-sm">
                {searchTerm ? 'No matches' : 'No puzzle skins yet — click "+ New" to create one.'}
              </div>
            ) : (
              sort.sorted.map((skin) => {
                const isSelected = selectedSkinId === skin.id;
                const usages = usagesBySkin.get(skin.id) ?? [];
                const borderN = borderSpriteCount(skin);
                const tileN = tileSpriteCount(skin);
                const customN = customTileSpriteCount(skin);
                return (
                  <div
                    key={skin.id}
                    className={`group px-2 py-1.5 cursor-pointer transition-colors border-t border-stone-700/60 first:border-t-0 ${
                      bulk.isSelected(skin.id) ? 'bg-sky-900/40' :
                      isSelected
                        ? 'bg-copper-900/50'
                        : 'hover:bg-stone-800/50'
                    }`}
                    onClick={() => handleSelectSkin(skin.id)}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={bulk.isSelected(skin.id)}
                        onChange={() => bulk.toggle(skin.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-sky-500 flex-shrink-0"
                      />
                      <SkinThumb skin={skin} />
                      {/* Deliberately a div, not an h3: `.theme-root h3` sizes
                          every heading at 1.25x the theme heading size in the
                          theme face, and an element selector outranks
                          Tailwind's text-* utility — an h3 here renders ~25px
                          and truncates after a few characters. */}
                      <div className={`flex-1 min-w-0 truncate text-parchment-100 ${scaledNameClass(skin.name)}`}>
                        {skin.name || 'Unnamed'}
                      </div>
                      <div className={`flex items-center gap-1 flex-shrink-0 transition-opacity ${
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                      }`}>
                        {rowActionButtons(skin)}
                      </div>
                    </div>

                    {/* Meta line: origin chip, then how much of the skin is
                        actually painted in. Indented to sit under the name. */}
                    <div className="flex flex-wrap items-center gap-1 mt-1 pl-[3.25rem]">
                      {skin.isBuiltIn && (
                        <span className="px-1.5 py-0 rounded border text-[10px] whitespace-nowrap bg-stone-800 text-stone-400 border-stone-600">
                          Built-in
                        </span>
                      )}
                      <span className="text-[10px] text-stone-500 whitespace-nowrap">
                        Border {borderN}/{BORDER_SPRITE_SLOTS.length}
                        <span className="text-stone-600"> · </span>Tiles {tileN}/{TILE_SPRITE_SLOTS.length}
                        {customN > 0 ? <><span className="text-stone-600"> · </span>Custom {customN}</> : null}
                      </span>
                      {usages.map((u, i) => (
                        <span
                          key={i}
                          className="text-[10px] px-1.5 py-0 rounded border whitespace-nowrap bg-arcane-900/40 text-arcane-300 border-arcane-700/50"
                        >
                          🧩 {u.name}
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
            Puzzle Skins
            {countLabel}
          </h2>
          <div className="w-48">{searchInput}</div>
          <div className="w-40">{folderFilter}</div>
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
          onOpen={(skin) => handleSelectSkin(skin.id)}
          selection={{ isSelected: bulk.isSelected, toggle: bulk.toggle }}
          rowActions={rowActionButtons}
          emptyMessage={searchTerm ? 'No matches' : 'No puzzle skins yet — click "+ New" to create one.'}
        />
      }
      navigation={{
        items: sort.sorted.map(s => ({ id: s.id, name: s.name || 'Unnamed' })),
        currentId: selectedSkinId,
        onSelect: handleSelectSkin,
      }}
      detailPanel={
        editingSkin ? (
          <>
                {/* Persistent Header */}
                <div className="border border-stone-700 rounded p-2">
                  <div className="flex justify-between items-center gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex w-10 h-10 bg-stone-800 border border-stone-700 rounded items-center justify-center overflow-hidden flex-shrink-0">
                        {editingSkin.thumbnailPreview ? (
                          <img src={editingSkin.thumbnailPreview} alt="" className="w-full h-full object-contain" loading="lazy" decoding="async" />
                        ) : (
                          <span className="text-stone-400 text-lg">🎨</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-base md:text-lg font-medieval text-copper-400 truncate">
                          {editingSkin.name || 'Unnamed Skin'}
                        </h2>
                        <p className="text-[10px] uppercase text-stone-500">{isBuiltIn ? 'built-in' : 'custom'}</p>
                      </div>
                    </div>
                    {!isBuiltIn && (
                      <div className="flex gap-1 flex-shrink-0">
                        {!isCreating && (
                          <>
                            <button
                              onClick={async () => {
                                const result = await createVersionSnapshot(editingSkin.id, 'skin', editingSkin.name, editingSkin as unknown as object);
                                if (result.success) toast.success(`Saved version #${result.versionNumber}`);
                                else toast.error('Failed to save version');
                              }}
                              className="px-2 py-0.5 rounded border text-xs bg-copper-900/40 text-copper-300 border-copper-700/50 hover:bg-copper-900/60"
                              title="Save version snapshot"
                            >
                              📸
                            </button>
                            <button
                              onClick={() => setShowVersionHistory(true)}
                              className="px-2 py-0.5 rounded border text-xs border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800"
                              title="Version history"
                            >
                              <span className="md:hidden">📜</span>
                              <span className="hidden md:inline">History</span>
                            </button>
                          </>
                        )}
                        <button
                          onClick={handleSaveSkin}
                          className="px-2 py-0.5 rounded border text-xs bg-green-900/40 text-green-300 border-green-700/50 hover:bg-green-900/60"
                        >
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
                  <div className="border border-yellow-700/50 bg-yellow-900/20 px-2 py-1.5 rounded text-yellow-200 text-xs">
                    This is a built-in skin and cannot be modified. Create a new skin to customize.
                  </div>
                )}

                {/* Live Preview + Basic Info — side by side on desktop */}
                <div className="flex flex-col lg:flex-row gap-2">
                  {/* Live Skin Preview */}
                  {previewGameState && (
                    <div className="border border-stone-700 rounded overflow-hidden lg:flex-shrink-0">
                      <button
                        onClick={() => setShowPreview(!showPreview)}
                        className="w-full flex items-center justify-between bg-stone-800 px-2 py-1.5 text-xs uppercase text-stone-400 hover:text-stone-200"
                      >
                        <span>Live Preview</span>
                        <span>{showPreview ? '▾' : '▸'}</span>
                      </button>
                      {showPreview && (
                        <div className="p-2 space-y-2">
                          {/* Desktop: magnifier toggle + slider */}
                          {!isMobile && (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => setMagnifierOn(m => !m)}
                                className={`px-2 py-0.5 text-xs rounded border ${
                                  magnifierOn
                                    ? 'bg-arcane-900/60 text-arcane-200 border-arcane-600'
                                    : 'border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800'
                                }`}
                                title={magnifierOn ? 'Disable magnifier' : 'Enable magnifier — hover to zoom into tiles'}
                              >🔍</button>
                              {magnifierOn && (
                                <>
                                  <input
                                    type="range"
                                    min="1.5"
                                    max="8"
                                    step="0.5"
                                    value={magnifierZoom}
                                    onChange={(e) => setMagnifierZoom(parseFloat(e.target.value))}
                                    className="w-24 accent-arcane-500"
                                    title="Magnifier zoom level"
                                  />
                                  <span className="text-xs text-stone-400 w-8">{magnifierZoom}×</span>
                                </>
                              )}
                            </div>
                          )}

                          {/* Mobile: pinch hint + reset button */}
                          {isMobile && (
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-xs text-stone-400">Pinch to zoom</span>
                              {touchZoom > 1 && (
                                <button
                                  onClick={() => { setTouchZoom(1); setTouchPan({ x: 0, y: 0 }); }}
                                  className="px-2 py-0.5 text-xs rounded border border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800"
                                >Reset {touchZoom.toFixed(1)}×</button>
                              )}
                            </div>
                          )}

                          <div
                            ref={previewRef}
                            className="bg-stone-900 rounded p-2 flex justify-center overflow-hidden"
                            style={{
                              cursor: magnifierOn && !isMobile ? 'crosshair' : undefined,
                              touchAction: isMobile ? 'none' : undefined,
                            }}
                            onMouseMove={!isMobile ? handlePreviewMouseMove : undefined}
                            onMouseLeave={!isMobile ? handlePreviewMouseLeave : undefined}
                          >
                            <div
                              style={isMobile ? {
                                transition: touchStateRef.current?.isPinching ? 'none' : 'transform 0.2s ease-out',
                                transform: `scale(${touchZoom}) translate(${touchPan.x / touchZoom}px, ${touchPan.y / touchZoom}px)`,
                                transformOrigin: 'center center',
                              } : {
                                transition: magnifierOrigin ? 'none' : 'transform 0.2s ease-out',
                                transform: magnifierOn && magnifierOrigin ? `scale(${magnifierZoom})` : 'scale(1)',
                                transformOrigin: magnifierOrigin || 'center center',
                              }}
                            >
                              <div className="relative inline-block" style={{ cursor: paintTileTypeId ? 'crosshair' : undefined }}>
                                <AnimatedGameBoard
                                  gameState={previewGameState}
                                  skinOverride={editingSkin!}
                                  maxWidth={280}
                                  maxHeight={280}
                                  onTileClick={paintTileTypeId ? (x, y) => {
                                    // Only paint on floor tiles (not walls, voids)
                                    const tile = previewGameState.puzzle.tiles[y]?.[x];
                                    if (tile === null) return; // void
                                    const key = `${x},${y}`;
                                    setPreviewTileOverrides(prev => {
                                      // Toggle: if already this tile type, remove it
                                      if (prev[key] === paintTileTypeId) {
                                        const next = { ...prev };
                                        delete next[key];
                                        return next;
                                      }
                                      return { ...prev, [key]: paintTileTypeId };
                                    });
                                  } : undefined}
                                />
                                {/* Highlight overlay for selected border/tile slot */}
                                {highlightedSlot && SLOT_HIGHLIGHT_REGIONS[highlightedSlot] && (() => {
                                  const canvasW = 320, canvasH = 384; // 6x6 preview LAYOUT box (overhang bleeds outside it)
                                  const regions = SLOT_HIGHLIGHT_REGIONS[highlightedSlot];
                                  return regions.map((region, i) => (
                                    <div
                                      key={i}
                                      className="absolute pointer-events-none animate-pulse"
                                      style={{
                                        left: `${(region.x / canvasW) * 100}%`,
                                        top: `${(region.y / canvasH) * 100}%`,
                                        width: `${(region.w / canvasW) * 100}%`,
                                        height: `${(region.h / canvasH) * 100}%`,
                                        border: '2px solid #f59e0b',
                                        backgroundColor: 'rgba(245, 158, 11, 0.25)',
                                        borderRadius: 2,
                                      }}
                                    />
                                  ));
                                })()}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Basic Info */}
                  <Section title="Basic Info" className="flex-1 min-w-0">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-stone-800 border border-stone-700 rounded overflow-hidden flex-shrink-0 grid grid-cols-2 grid-rows-2">
                          {(() => {
                            const sprites = [
                              editingSkin.borderSprites?.wallFront,
                              editingSkin.borderSprites?.wallBottomOuter,
                              editingSkin.tileSprites?.wall,
                              editingSkin.tileSprites?.empty,
                            ];
                            if (!sprites.some(Boolean)) {
                              return <div className="col-span-2 row-span-2 flex items-center justify-center text-xl">🎨</div>;
                            }
                            return sprites.map((src, i) =>
                              src ? <img key={i} src={src} alt="" className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' as const }} loading="lazy" decoding="async" />
                                   : <div key={i} className="w-full h-full bg-stone-700" />
                            );
                          })()}
                        </div>
                        <div className="min-w-0">
                          {/* div, not h3 — `.theme-root h3` would blow this up to ~25px */}
                          <div className="text-sm text-parchment-200 truncate">{editingSkin.name || 'Unnamed Skin'}</div>
                          <p className="text-[10px] uppercase text-stone-500">{editingSkin.isBuiltIn ? 'Built-in' : 'Custom'}</p>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-stone-400 mb-0.5">Name</label>
                        <input
                          type="text"
                          value={editingSkin.name}
                          onChange={(e) => setEditingSkin({ ...editingSkin, name: e.target.value })}
                          disabled={isBuiltIn}
                          className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm text-parchment-100 focus:outline-none focus:border-arcane-500 disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-stone-400 mb-0.5">Description</label>
                        {isBuiltIn ? (
                          <div className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm opacity-50 text-stone-400">
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
                        <label className="block text-xs text-stone-400 mb-0.5">Folder</label>
                        <select
                          value={editingSkin.folderId || ''}
                          onChange={(e) => setEditingSkin({ ...editingSkin, folderId: e.target.value || undefined })}
                          disabled={isBuiltIn}
                          className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm text-parchment-100 focus:outline-none focus:border-arcane-500 disabled:opacity-50"
                        >
                          <option value="">Uncategorized</option>
                          {getFolders('skins').map(folder => (
                            <option key={folder.id} value={folder.id}>{folder.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </Section>
                </div>

                {/* Border Sprites */}
                <Section title="Border Sprites">
                  <p className="text-xs text-stone-400 mb-2">
                    Upload sprites for the walls around the puzzle. Leave empty to use default rendering.
                  </p>
                  <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                    {BORDER_SPRITE_SLOTS.map(({ key, label, description, size }) => (
                      <div
                        key={key}
                        className={`border rounded p-1.5 cursor-pointer transition-colors ${highlightedSlot === key ? 'border-amber-500 bg-stone-800' : 'border-stone-700 hover:bg-stone-800/50'}`}
                        onClick={() => setHighlightedSlot(highlightedSlot === key ? null : key)}
                      >
                        <div className="flex items-baseline gap-1 mb-0.5">
                          <span className="text-[11px] font-bold text-parchment-200 truncate">{label}</span>
                          <span className="text-[10px] text-stone-500 ml-auto flex-shrink-0">{size}</span>
                        </div>
                        <div className="text-[10px] text-stone-400 mb-1 truncate" title={description}>{description}</div>

                        {editingSkin.borderSprites[key] ? (
                          <div className="space-y-1">
                            <div className="relative">
                              <img
                                src={editingSkin.borderSprites[key]}
                                alt={label}
                                className="w-full h-12 object-contain bg-stone-900 rounded"
                                loading="lazy" decoding="async"
                              />
                              {!isBuiltIn && (
                                <button
                                  onClick={() => handleBorderSpriteRemove(key)}
                                  className="absolute top-0 right-0 px-1 rounded border text-[10px] leading-none bg-red-900/70 text-red-200 border-red-700/50 hover:bg-red-900"
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
                              <div className={`w-full h-12 border border-dashed rounded flex items-center justify-center text-[10px] ${
                                isBuiltIn
                                  ? 'border-stone-700 text-stone-600'
                                  : 'border-stone-600 text-stone-400 hover:border-stone-400'
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
                                      className="flex-1 min-w-0 px-1 py-0.5 bg-stone-800 border border-stone-700 rounded text-[10px] text-parchment-100 placeholder:text-stone-500 focus:outline-none focus:border-arcane-500"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (urlInputValue.trim()) {
                                          setBorderSpriteUrl(key, urlInputValue.trim());
                                        }
                                      }}
                                      className="px-1 py-0.5 rounded border text-[10px] bg-arcane-900/40 text-arcane-300 border-arcane-700/50 hover:bg-arcane-900/60 flex-shrink-0"
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
                </Section>

                {/* Tile Sprites */}
                <Section title="Tile Sprites">
                  <p className="text-xs text-stone-400 mb-2">
                    Upload sprites for the floor and wall tiles inside the puzzle. Leave empty to use default colors.
                  </p>
                  <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                    {TILE_SPRITE_SLOTS.map(({ key, label, description }) => (
                      <div
                        key={key}
                        className={`border rounded p-1.5 cursor-pointer transition-colors ${highlightedSlot === key ? 'border-amber-500 bg-stone-800' : 'border-stone-700 hover:bg-stone-800/50'}`}
                        onClick={() => setHighlightedSlot(highlightedSlot === key ? null : key)}
                      >
                        <div className="text-[11px] font-bold text-parchment-200 mb-0.5 truncate">{label}</div>
                        <div className="text-[10px] text-stone-400 mb-1 truncate" title={description}>{description}</div>

                        {editingSkin.tileSprites?.[key] ? (
                          <div className="space-y-1">
                            <div className="relative">
                              <img
                                src={editingSkin.tileSprites[key]}
                                alt={label}
                                className="w-full h-12 object-contain bg-stone-900 rounded"
                                loading="lazy" decoding="async"
                              />
                              {!isBuiltIn && (
                                <button
                                  onClick={() => handleTileSpriteRemove(key)}
                                  className="absolute top-0 right-0 px-1 rounded border text-[10px] leading-none bg-red-900/70 text-red-200 border-red-700/50 hover:bg-red-900"
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
                              <div className={`w-full h-12 border border-dashed rounded flex items-center justify-center text-[10px] ${
                                isBuiltIn
                                  ? 'border-stone-700 text-stone-600'
                                  : 'border-stone-600 text-stone-400 hover:border-stone-400'
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
                                      className="flex-1 min-w-0 px-1 py-0.5 bg-stone-800 border border-stone-700 rounded text-[10px] text-parchment-100 placeholder:text-stone-500 focus:outline-none focus:border-arcane-500"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (urlInputValue.trim()) {
                                          setTileSpriteUrl(key, urlInputValue.trim());
                                        }
                                      }}
                                      className="px-1 py-0.5 rounded border text-[10px] bg-arcane-900/40 text-arcane-300 border-arcane-700/50 hover:bg-arcane-900/60 flex-shrink-0"
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
                </Section>

                {/* Custom Tile Types */}
                <Section title="Custom Tile Types">
                  <p className="text-xs text-stone-400 mb-2">
                    Upload custom sprites for your custom tile types within this skin.
                    If no sprite is set, the tile type's default sprite will be used.
                    Tile types with cadence enabled show separate slots for on/off states.
                  </p>
                  {/* Paint mode indicator + reset */}
                  {(paintTileTypeId || Object.keys(previewTileOverrides).length > 0) && (
                    <div className="flex items-center gap-2 mb-2 text-xs">
                      {paintTileTypeId && (
                        <span className="text-amber-400">
                          Painting: {customTileTypes.find(t => t.id === paintTileTypeId)?.name} — click tiles on preview
                        </span>
                      )}
                      <div className="flex-1" />
                      {Object.keys(previewTileOverrides).length > 0 && (
                        <button
                          onClick={() => { setPreviewTileOverrides({}); setPaintTileTypeId(null); }}
                          className="px-2 py-0.5 rounded border text-xs border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800"
                        >
                          Reset Preview
                        </button>
                      )}
                      {paintTileTypeId && (
                        <button
                          onClick={() => setPaintTileTypeId(null)}
                          className="px-2 py-0.5 rounded border text-xs border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800"
                        >
                          Stop Painting
                        </button>
                      )}
                    </div>
                  )}
                  {customTileTypes.length === 0 ? (
                    <div className="text-xs text-stone-500 text-center py-3">
                      No custom tile types created yet. Create custom tile types in the Tiles tab.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
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
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] text-stone-400 mb-0.5">{label}</div>
                            {currentSprite ? (
                              <div className="relative">
                                <img
                                  src={currentSprite}
                                  alt={`${tileType.name} ${label}`}
                                  className="w-full h-10 object-contain bg-stone-900 rounded"
                                  loading="lazy" decoding="async"
                                />
                                {!isBuiltIn && (
                                  <button
                                    onClick={() => handleCustomTileSpriteRemove(tileType.id, spriteType)}
                                    className="absolute top-0 right-0 px-1 rounded border text-[10px] leading-none bg-red-900/70 text-red-200 border-red-700/50 hover:bg-red-900"
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
                                    className="w-full h-10 object-contain bg-stone-900 rounded opacity-50"
                                    title={`Default ${label.toLowerCase()} sprite`}
                                    loading="lazy" decoding="async"
                                  />
                                )}
                                <label className={`block ${isBuiltIn ? 'cursor-not-allowed' : 'cursor-pointer'} ${defaultSprite ? 'absolute inset-0' : ''}`}>
                                  <div className={`w-full h-10 border border-dashed rounded flex items-center justify-center text-[10px] ${
                                    isBuiltIn
                                      ? 'border-stone-700 text-stone-600'
                                      : 'border-stone-600 text-stone-400 hover:border-stone-400'
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
                                      className="flex-1 min-w-0 px-1 py-0.5 bg-stone-800 border border-stone-700 rounded text-[10px] text-parchment-100 placeholder:text-stone-500 focus:outline-none focus:border-arcane-500"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (urlInputValue.trim()) {
                                          setCustomTileSpriteUrl(tileType.id, urlInputValue.trim(), spriteType);
                                        }
                                      }}
                                      className="px-1 py-0.5 rounded border text-[10px] bg-arcane-900/40 text-arcane-300 border-arcane-700/50 hover:bg-arcane-900/60 flex-shrink-0"
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
                          <div key={tileType.id} className={`border rounded p-1.5 ${paintTileTypeId === tileType.id ? 'border-amber-500 bg-stone-800' : 'border-stone-700'}`}>
                            <div className="text-[11px] font-bold text-parchment-200 mb-0.5 flex items-center gap-1">
                              <span className="truncate">{tileType.name}</span>
                              {hasCadence && (
                                <span className="text-yellow-400 text-[10px] flex-shrink-0" title="Has on/off cadence">⟳</span>
                              )}
                              <div className="flex-1" />
                              <button
                                onClick={() => setPaintTileTypeId(paintTileTypeId === tileType.id ? null : tileType.id)}
                                className={`px-1.5 py-0 rounded border text-[10px] flex-shrink-0 ${
                                  paintTileTypeId === tileType.id
                                    ? 'bg-amber-900/60 text-amber-200 border-amber-600'
                                    : 'border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800'
                                }`}
                                title="Click then click tiles on the preview to paint this tile type"
                              >
                                {paintTileTypeId === tileType.id ? 'Painting...' : 'Paint'}
                              </button>
                            </div>
                            <div className="text-[10px] text-stone-400 mb-1 truncate" title={tileType.description}>
                              {tileType.description || `${tileType.baseType} tile`}
                            </div>

                            {hasCadence ? (
                              // Cadenced tile - show two slots
                              <div className="flex gap-1.5">
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
                                      className="w-full h-12 object-contain bg-stone-900 rounded"
                                      loading="lazy" decoding="async"
                                    />
                                    {!isBuiltIn && (
                                      <button
                                        onClick={() => handleCustomTileSpriteRemove(tileType.id, 'on')}
                                        className="absolute top-0 right-0 px-1 rounded border text-[10px] leading-none bg-red-900/70 text-red-200 border-red-700/50 hover:bg-red-900"
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
                                        className="w-full h-12 object-contain bg-stone-900 rounded opacity-50"
                                        title="Default sprite (from tile type)"
                                        loading="lazy" decoding="async"
                                      />
                                    )}
                                    <label className={`block ${isBuiltIn ? 'cursor-not-allowed' : 'cursor-pointer'} ${tileType.customSprite?.idleImageData ? 'absolute inset-0' : ''}`}>
                                      <div className={`w-full h-12 border border-dashed rounded flex items-center justify-center text-[10px] ${
                                        isBuiltIn
                                          ? 'border-stone-700 text-stone-600'
                                          : 'border-stone-600 text-stone-400 hover:border-stone-400'
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
                                          className="flex-1 min-w-0 px-1 py-0.5 bg-stone-800 border border-stone-700 rounded text-[10px] text-parchment-100 placeholder:text-stone-500 focus:outline-none focus:border-arcane-500"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (urlInputValue.trim()) {
                                              setCustomTileSpriteUrl(tileType.id, urlInputValue.trim(), 'on');
                                            }
                                          }}
                                          className="px-1 py-0.5 rounded border text-[10px] bg-arcane-900/40 text-arcane-300 border-arcane-700/50 hover:bg-arcane-900/60 flex-shrink-0"
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
                </Section>
          </>
        ) : null
      }
      emptyState={
        <div className="border border-stone-700 rounded p-6 text-center">
          <h2 className="text-lg font-medieval text-copper-400 mb-2">Puzzle Skin Editor</h2>
          <p className="text-sm text-stone-400 mb-4">
            Create custom visual themes for your puzzles. Skins include border decorations
            and tile appearances that can be applied to any puzzle.
          </p>
          <button
            onClick={handleNewSkin}
            className="px-2 py-0.5 rounded border text-xs bg-green-900/40 text-green-300 border-green-700/50 hover:bg-green-900/60"
          >
            + Create New Skin
          </button>
        </div>
      }
    />
  );
};
