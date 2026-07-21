import React, { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from '../shared/Toast';
import { useSearchParams } from 'react-router-dom';
import type { Puzzle, TileOrNull, PlacedEnemy, PlacedCollectible, PlacedObject, BorderConfig, GameState } from '../../types/game';
import { TileType, Direction } from '../../types/game';
import { getAllCharacters, getCharacter } from '../../data/characters';
import { getAllEnemies } from '../../data/enemies';
import { playBackgroundMusic, stopMusic } from '../../utils/gameSounds';
import { savePuzzle, getSavedPuzzles, deletePuzzle, loadPuzzle, type SavedPuzzle } from '../../utils/puzzleStorage';
import { cacheEditorState, getCachedEditorState, clearCachedEditorState } from '../../utils/editorState';
import { writeAutoSave, readAutoSave, clearAutoSave, AUTOSAVE_INTERVAL_MS, type AutoSaveData } from '../../utils/autoSave';
import { getAllPuzzleSkins, loadPuzzleSkin, getCustomTileTypes, loadTileType, getAllObjects, loadObject, getAllCollectibles, getSoundAssets, getCustomVessels, vesselToEnemyAsset, getCustomAllies, allyToEnemyAsset } from '../../utils/assetStorage';
import { TILE_SIZE, BORDER_SIZE, SIDE_BORDER_SIZE, SIDE_HALLWAY_DEPTH, VERT_HALLWAY_PROTRUSION, MAX_DISPLAY_WIDTH_TILES, createEmptyGrid, drawDungeonBorder, drawTile, drawEnemy, drawCollectibleInEditor, drawObject } from './map/canvasDraw';
import { isValidHallway, drawHallwayOpening, collectCorridorCells, type HallwayDrawConfig } from '../../utils/hallwayDraw';
import { loadImage } from '../../utils/imageLoader';
import type { HallwaySide, DoorStartState } from '../../types/game';
import { isValidDoor, drawDoor } from '../../utils/doorDraw';
import { getAllSpells, SpellTooltip, ActionTooltip } from './map/Tooltips';
import { createDefaultEditorState, type EditorState, type ToolType, type EditorMode } from './map/editorState';
import { ValidationModal } from './map/ValidationModal';
import { EditorToolbar } from './map/EditorToolbar';
import { RulesPanel } from './map/RulesPanel';
import { DetailsPanel } from './map/DetailsPanel';
import { PlacedRoster, type RosterKind } from './map/PlacedRoster';
import { InspectPopover } from './map/InspectPopover';
import { ObjectInspectPopover } from './map/ObjectInspectPopover';
import { ToolsRow } from './map/ToolsRow';
import { TilePalette } from './map/TilePalette';
import { EnemyPalette } from './map/EnemyPalette';
import { AllyPalette } from './map/AllyPalette';
import { VesselPalette } from './map/VesselPalette';
import { ObjectPalette } from './map/ObjectPalette';
import { CollectiblePalette } from './map/CollectiblePalette';
import { HeroesPalette } from './map/HeroesPalette';
import { collectPuzzleAssetUrls } from '../../utils/spritePreload';
import { preloadImages } from '../../utils/imageLoader';
import type { PuzzleSkin, SoundAsset } from '../../types/game';
import type { CustomTileType } from '../../utils/assetStorage';
import { SpriteThumbnail } from './SpriteThumbnail';
import { collectAllTags } from '../shared/TagInput';
import { getPuzzleDependencies, type AssetDependency } from '../../utils/publishDependencies';
import { publishPuzzle, publishAsset } from '../../services/supabaseService';
import { PublishDependencyModal } from './PublishDependencyModal';
import { VersionHistoryModal } from './VersionHistoryModal';
import { logActivity } from '../../services/activityLogService';
import { createHistoryManager } from '../../utils/historyManager';
import { subscribeToImageLoads } from '../../utils/imageLoader';
import { subscribeToSpriteImageLoads, ART_TILE_PX } from './SpriteEditor';
import { useFilteredAssets } from './FolderDropdown';
import { PuzzleLibraryModal } from './PuzzleLibraryModal';
import { solvePuzzleAsync, quickValidate, type SolverResult } from '../../engine/puzzleSolver';
import { WarningModal } from '../shared/WarningModal';
import GeneratorDialog from './GeneratorDialog';
import { vibrate } from '../../utils/haptics';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { Game } from '../game/Game';
import { diffTurn, logTypeStyles, type CombatLogEntry } from '../../engine/combatLog';

const SIDEBAR_TABS = [
  ['build', 'Build'],
  ['rules', 'Rules'],
  ['details', 'Details'],
] as const;

export const MapEditor: React.FC = () => {
  const _isMobile = useIsMobile();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [editorMaxWidth, setEditorMaxWidth] = useState<number | undefined>(undefined);
  const [state, setState] = useState<EditorState>(() => {
    // Check for cached state from previous tab visit
    const cached = getCachedEditorState();
    if (cached) {
      return {
        ...cached,
        selectedTool: cached.selectedTool as ToolType || 'wall',
        isDrawing: false,
        mode: 'edit' as EditorMode,
        // Ensure sideQuests is always an array (for backwards compatibility with old cached state)
        sideQuests: cached.sideQuests || [],
        // Hallways/doors joined the state 2026-07-16 — default for older caches
        hallways: cached.hallways || [],
        doors: cached.doors || [],
        // Ensure tags/description are always initialized
        tags: cached.tags || [],
        description: cached.description || '',
        // Default isTraining for older cached state
        isTraining: cached.isTraining ?? false,
        // Filter out references to deleted characters
        availableCharacters: (cached.availableCharacters || []).filter(id => getCharacter(id) != null),
      };
    }
    return createDefaultEditorState();
  });

  // Playtest state — only the pieces MapEditor itself reaches for. <Game/>
  // owns the actual playtest gameState / lives / score / character placement;
  // MapEditor only needs `originalPlaytestPuzzle` to pass into <Game/> as the
  // `puzzle` prop and to gate the playtest render branch.
  const [originalPlaytestPuzzle, setOriginalPlaytestPuzzle] = useState<Puzzle | null>(null);

  // Combat log — editor-only dev tool. Populated via Game.tsx's onTurnExecuted
  // callback during playtest; surfaced via a floating "📜" button that
  // overlays the playtest viewport (no sidebar — log is opt-in to view).
  const [combatLog, setCombatLog] = useState<CombatLogEntry[]>([]);
  const [showCombatLog, setShowCombatLog] = useState(false);
  const handleTurnExecuted = useCallback((prev: GameState, next: GameState) => {
    const entries = diffTurn(prev, next);
    if (entries.length > 0) {
      setCombatLog(log => [...log, ...entries]);
    }
  }, []);

  // Library state
  const [savedPuzzles, setSavedPuzzles] = useState<SavedPuzzle[]>(() => getSavedPuzzles());
  const [showLibrary, setShowLibrary] = useState(false);

  // Publishing state
  const [publishStatus, setPublishStatus] = useState<'draft' | 'pending_review' | 'approved' | 'published' | 'checking' | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [showReviewNotes, setShowReviewNotes] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishDeps, setPublishDeps] = useState<AssetDependency[]>([]);

  // Version history state
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // History manager for undo/redo
  const historyRef = useRef(createHistoryManager({
    tiles: state.tiles,
    enemies: state.enemies,
    collectibles: state.collectibles,
    placedObjects: state.placedObjects,
  }));
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [redrawCounter, setRedrawCounter] = useState(0);

  // Validation state
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<SolverResult | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);

  // Warning modal state
  const [warningModal, setWarningModal] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: '',
  });

  // Generator dialog state
  const [showGenerator, setShowGenerator] = useState(false);

  // Auto-save recovery state
  const [recoveryData, setRecoveryData] = useState<AutoSaveData | null>(null);

  // Keyboard shortcuts reference overlay
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Sidebar tab (Phase 2): Build = tools + palette workbench; Rules and
  // Details hold once-per-puzzle configuration.
  const [sidebarTab, setSidebarTab] = useState<'build' | 'rules' | 'details'>('build');
  // Roster hover highlight + status-bar cursor tile (Phase 2).
  const [highlightTile, setHighlightTile] = useState<{ x: number; y: number } | null>(null);
  const [cursorTile, setCursorTile] = useState<{ x: number; y: number } | null>(null);
  // Drag-to-move (Phase 3): set on mousedown over a placement; `moved` flips
  // once the cursor leaves the source tile, turning the press into a move.
  const [dragState, setDragState] = useState<{
    kind: RosterKind;
    index: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    moved: boolean;
    // Pixel-fine object drag (Object tool active on an object): the sprite
    // follows the cursor in whole ART pixels instead of tile snaps.
    // grabDX/DY preserve the grab point (grid px from the object's anchor);
    // artOffsetX/Y is the live per-placement offset committed on release.
    pixelMode?: boolean;
    grabDX?: number;
    grabDY?: number;
    artOffsetX?: number;
    artOffsetY?: number;
  } | null>(null);
  // Entity inspect popover (Phase 3): opened by a plain click on a placed
  // entity while an entity tool is active.
  const [inspect, setInspect] = useState<{ index: number; screenX: number; screenY: number } | null>(null);
  // Object inspect popover (2026-07-17): plain click on a placed object with
  // the Object tool — offset sliders for precise alignment. One undo entry
  // per popover session (the ref arms on open, fires on the first change).
  const [objectInspect, setObjectInspect] = useState<{ index: number; screenX: number; screenY: number } | null>(null);
  const objectInspectHistoryPushedRef = useRef(false);
  // Combat log state + helpers will be re-introduced in Phase 5 (data plumbing
  // via <Game/> onTurnExecuted callback + a sidebar layout). Removed here so
  // the file stays clean while that's in flight; bring back as a small focused
  // commit alongside the sidebar render.

  // Local input state for grid size (allows typing without immediate validation)
  const [widthInput, setWidthInput] = useState(String(state.gridWidth));
  const [heightInput, setHeightInput] = useState(String(state.gridHeight));

  // Snapshot taken before drawing starts
  const snapshotBeforeDrawRef = useRef<{
    tiles: TileOrNull[][];
    enemies: PlacedEnemy[];
    collectibles: PlacedCollectible[];
    placedObjects: PlacedObject[];
  } | null>(null);

  // Save snapshot before drawing starts (call on mouseDown)
  const saveSnapshotBeforeDraw = useCallback(() => {
    snapshotBeforeDrawRef.current = {
      tiles: JSON.parse(JSON.stringify(state.tiles)),
      enemies: JSON.parse(JSON.stringify(state.enemies)),
      collectibles: JSON.parse(JSON.stringify(state.collectibles)),
      placedObjects: JSON.parse(JSON.stringify(state.placedObjects)),
    };
  }, [state.tiles, state.enemies, state.collectibles, state.placedObjects]);

  // Push state to history after drawing completes (call on mouseUp if changes were made)
  const pushToHistoryAfterDraw = useCallback(() => {
    // Only push if we have a snapshot and state actually changed
    if (!snapshotBeforeDrawRef.current) return;

    const before = snapshotBeforeDrawRef.current;
    const after = {
      tiles: state.tiles,
      enemies: state.enemies,
      collectibles: state.collectibles,
      placedObjects: state.placedObjects,
    };

    // Check if anything actually changed
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    if (!changed) {
      snapshotBeforeDrawRef.current = null;
      return;
    }

    // Update history: set present to snapshot (before), then push new state (after)
    // This ensures undo restores the "before" state and redo restores the "after" state
    historyRef.current.state.present = before;
    historyRef.current.push(after);

    setCanUndo(historyRef.current.canUndo);
    setCanRedo(historyRef.current.canRedo);
    snapshotBeforeDrawRef.current = null;
  }, [state.tiles, state.enemies, state.collectibles, state.placedObjects]);

  // Sync the canUndo/canRedo state with the history manager
  const syncHistoryState = useCallback(() => {
    setCanUndo(historyRef.current.canUndo);
    setCanRedo(historyRef.current.canRedo);
  }, []);

  // Push current state to history (for immediate state changes like resize/clear)
  const pushToHistory = useCallback(() => {
    const currentState = {
      tiles: state.tiles,
      enemies: state.enemies,
      collectibles: state.collectibles,
      placedObjects: state.placedObjects,
    };
    historyRef.current.push(currentState);
    syncHistoryState();
  }, [state.tiles, state.enemies, state.collectibles, state.placedObjects, syncHistoryState]);

  // Undo handler
  const handleUndo = useCallback(() => {
    const previous = historyRef.current.undo();
    if (previous) {
      setState(prev => ({
        ...prev,
        tiles: previous.tiles,
        enemies: previous.enemies,
        collectibles: previous.collectibles,
        placedObjects: previous.placedObjects,
      }));
      setRedrawCounter(c => c + 1);
      syncHistoryState();
    }
  }, [syncHistoryState]);

  // Redo handler
  const handleRedo = useCallback(() => {
    const next = historyRef.current.redo();
    if (next) {
      setState(prev => ({
        ...prev,
        tiles: next.tiles,
        enemies: next.enemies,
        collectibles: next.collectibles,
        placedObjects: next.placedObjects,
      }));
      setRedrawCounter(c => c + 1);
      syncHistoryState();
    }
  }, [syncHistoryState]);

  // Stable refs for callbacks used in keyboard handler
  const handleSaveRef = useRef<() => void>(() => {});
  const handlePlaytestRef = useRef<() => void>(() => {});

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Skip if any modal is open
      if (showLibrary || showGenerator || showShortcuts) {
        // Allow Escape to close shortcuts overlay
        if (e.key === 'Escape' && showShortcuts) {
          e.preventDefault();
          setShowShortcuts(false);
        }
        return;
      }

      // Only handle in edit mode
      if (state.mode !== 'edit') return;

      const mod = e.ctrlKey || e.metaKey;

      // Ctrl+S — Save
      if (mod && e.key === 's') {
        e.preventDefault();
        handleSaveRef.current();
        return;
      }

      // Ctrl+Z — Undo
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Ctrl+Y or Ctrl+Shift+Z — Redo
      if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Non-modifier shortcuts below — skip if any modifier held
      if (mod || e.altKey) return;

      switch (e.key) {
        // 1 — Tile tool
        case '1':
          e.preventDefault();
          setState(prev => ({ ...prev, selectedTool: 'custom' }));
          break;
        // 2 — Enemy tool
        case '2':
          e.preventDefault();
          setState(prev => ({ ...prev, selectedTool: 'enemy' }));
          break;
        // 3 — Ally tool
        case '3':
          e.preventDefault();
          setState(prev => ({ ...prev, selectedTool: 'ally' }));
          break;
        // 4 — Vessel tool
        case '4':
          e.preventDefault();
          setState(prev => ({ ...prev, selectedTool: 'vessel' }));
          break;
        // 5 — Object tool
        case '5':
          e.preventDefault();
          setState(prev => ({ ...prev, selectedTool: 'object' }));
          break;
        // 6 — Item (collectible) tool
        case '6':
          e.preventDefault();
          setState(prev => ({ ...prev, selectedTool: 'collectible' }));
          break;
        // 7 — Heroes tool
        case '7':
          e.preventDefault();
          setState(prev => ({ ...prev, selectedTool: 'characters' }));
          break;
        // 8 — Hallway tool
        case '8':
          e.preventDefault();
          setState(prev => ({ ...prev, selectedTool: 'hallway' }));
          break;
        // Space — Playtest
        case ' ':
          e.preventDefault();
          handlePlaytestRef.current();
          break;
        // ? — Show keyboard shortcuts reference
        case '?':
          e.preventDefault();
          setShowShortcuts(true);
          break;
        // Escape — close shortcuts overlay (handled above for modals)
        case 'Escape':
          setShowShortcuts(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.mode, handleUndo, handleRedo, showLibrary, showGenerator, showShortcuts]);

  // Subscribe to image load events to trigger canvas redraws when images finish loading
  useEffect(() => {
    const handleImageLoaded = () => {
      setRedrawCounter(c => c + 1);
    };
    const unsubscribe1 = subscribeToImageLoads(handleImageLoaded);
    const unsubscribe2 = subscribeToSpriteImageLoads(handleImageLoaded);
    return () => {
      unsubscribe1();
      unsubscribe2();
    };
  }, []);

  // Responsive canvas sizing for mobile
  useEffect(() => {
    const updateEditorSize = () => {
      // Only apply responsive sizing on screens smaller than lg breakpoint (1024px)
      if (window.innerWidth < 1024 && editorContainerRef.current) {
        const containerWidth = editorContainerRef.current.offsetWidth;
        setEditorMaxWidth(containerWidth > 0 ? containerWidth : undefined);
      } else {
        setEditorMaxWidth(undefined);
      }
    };

    updateEditorSize();
    window.addEventListener('resize', updateEditorSize);

    const resizeObserver = new ResizeObserver(updateEditorSize);
    if (editorContainerRef.current) {
      resizeObserver.observe(editorContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateEditorSize);
      resizeObserver.disconnect();
    };
  }, []);

  // Sync input state when grid size changes from external sources (loading puzzle, undo/redo)
  useEffect(() => {
    setWidthInput(String(state.gridWidth));
    setHeightInput(String(state.gridHeight));
  }, [state.gridWidth, state.gridHeight]);

  // Puzzle skins state
  const [availableSkins, setAvailableSkins] = useState<PuzzleSkin[]>(() => getAllPuzzleSkins());

  // Sound assets state (for background music selection)
  const [availableSounds, setAvailableSounds] = useState<SoundAsset[]>(() => getSoundAssets());

  // Custom tile types state
  const [customTileTypes, setCustomTileTypes] = useState<CustomTileType[]>(() => getCustomTileTypes());
  const [selectedCustomTileTypeId, setSelectedCustomTileTypeId] = useState<string | null>(null);
  const [selectedTriggerGroupId, setSelectedTriggerGroupId] = useState<string>(''); // For pressure plate trigger groups

  // Hallway tool sub-mode (phase 2 doors): what a wall-edge click places.
  const [openingMode, setOpeningMode] = useState<'hallway' | 'door' | 'both'>('hallway');
  const [doorStartState, setDoorStartState] = useState<DoorStartState>('closed');
  // Applies to hallways placed next: open ledge = pushes can throw entities
  // out through this mouth (shove-out ejection). Default barred.
  const [hallwayOpenLedge, setHallwayOpenLedge] = useState(false);

  // Enemy/Ally/Vessel/Object/Collectible selection — each placement tool
  // keeps its own selected id so switching tools never places the wrong
  // kind from a stale selection.
  const [selectedEnemyId, setSelectedEnemyId] = useState<string | null>(null);
  const [selectedAllyId, setSelectedAllyId] = useState<string | null>(null);
  const [selectedVesselId, setSelectedVesselId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedCollectibleId, setSelectedCollectibleId] = useState<string | null>(null);
  const allEnemies = getAllEnemies();
  // Vessels place exactly like enemies (they live in puzzle.enemies and
  // resolve through the enemy adapter) — first-class tool since 2026-07-14.
  const allVessels = getCustomVessels().map(vesselToEnemyAsset);
  // Allies ride the same pipeline; placement stamps party: 'hero' (that
  // stamp is what makes a placed ally an ally — engine/party.ts).
  const allAllies = getCustomAllies().map(allyToEnemyAsset);
  const allyIds = new Set(allAllies.map(a => a.id));
  const vesselIds = new Set(allVessels.map(v => v.id));
  const placeableEnemyTypes = [...allEnemies, ...allVessels, ...allAllies];
  const allCharacters = getAllCharacters();
  const allObjects = getAllObjects();
  const allCollectibles = getAllCollectibles();

  // Folder filtering for asset selectors
  const [enemyFolderId, setEnemyFolderId] = useState<string | null>(null);
  const [allyFolderId, setAllyFolderId] = useState<string | null>(null);
  const [objectFolderId, setObjectFolderId] = useState<string | null>(null);
  const [characterFolderId, setCharacterFolderId] = useState<string | null>(null);
  const [tileFolderId, setTileFolderId] = useState<string | null>(null);
  const [collectibleFolderId, setCollectibleFolderId] = useState<string | null>(null);
  const filteredEnemies = useFilteredAssets(allEnemies, enemyFolderId);
  const filteredAllies = useFilteredAssets(allAllies, allyFolderId);
  const filteredObjects = useFilteredAssets(allObjects, objectFolderId);
  const filteredCharacters = useFilteredAssets(allCharacters, characterFolderId);
  const filteredTileTypes = useFilteredAssets(customTileTypes, tileFolderId);
  const filteredCollectibles = useFilteredAssets(allCollectibles, collectibleFolderId);

  // Search filtering for tool panels
  const [toolSearchTerm, setToolSearchTerm] = useState('');
  const searchFilteredEnemies = toolSearchTerm ? filteredEnemies.filter(e => e.name.toLowerCase().includes(toolSearchTerm.toLowerCase())) : filteredEnemies;
  const searchFilteredAllies = toolSearchTerm ? filteredAllies.filter(a => a.name.toLowerCase().includes(toolSearchTerm.toLowerCase())) : filteredAllies;
  // Vessels have no folder category (assetStorage AssetCategory) — search only.
  const searchFilteredVessels = toolSearchTerm ? allVessels.filter(v => v.name.toLowerCase().includes(toolSearchTerm.toLowerCase())) : allVessels;
  const searchFilteredObjects = toolSearchTerm ? filteredObjects.filter(o => o.name.toLowerCase().includes(toolSearchTerm.toLowerCase())) : filteredObjects;
  const searchFilteredCharacters = toolSearchTerm ? filteredCharacters.filter(c => c.name.toLowerCase().includes(toolSearchTerm.toLowerCase())) : filteredCharacters;
  const searchFilteredTileTypes = toolSearchTerm ? filteredTileTypes.filter(t => t.name.toLowerCase().includes(toolSearchTerm.toLowerCase())) : filteredTileTypes;
  const searchFilteredCollectibles = toolSearchTerm ? filteredCollectibles.filter(c => c.name.toLowerCase().includes(toolSearchTerm.toLowerCase())) : filteredCollectibles;

  // Clear search when switching tools
  useEffect(() => {
    setToolSearchTerm('');
  }, [state.selectedTool]);

  // Cache editor state when it changes (for persistence across tab switches)
  useEffect(() => {
    // Only cache when in edit mode (not during playtest)
    if (state.mode === 'edit') {
      cacheEditorState({
        gridWidth: state.gridWidth,
        gridHeight: state.gridHeight,
        tiles: state.tiles,
        enemies: state.enemies,
        collectibles: state.collectibles,
        placedObjects: state.placedObjects,
        puzzleName: state.puzzleName,
        puzzleId: state.puzzleId,
        maxCharacters: state.maxCharacters,
        maxPlaceableCharacters: state.maxPlaceableCharacters,
        maxTurns: state.maxTurns,
        lives: state.lives,
        availableCharacters: state.availableCharacters,
        winConditions: state.winConditions,
        borderConfig: state.borderConfig,
        skinId: state.skinId,
        backgroundMusicId: state.backgroundMusicId,
        parCharacters: state.parCharacters,
        parTurns: state.parTurns,
        sideQuests: state.sideQuests,
        hallways: state.hallways,
        doors: state.doors,
        tags: state.tags,
        description: state.description,
        isTraining: state.isTraining,
        selectedTool: state.selectedTool,
      });
    }
  }, [state]);

  // Auto-save: check for recoverable data on mount
  useEffect(() => {
    const autoSave = readAutoSave();
    if (autoSave) {
      // Check if this auto-save is newer than the corresponding manual save
      const savedPuzzle = getSavedPuzzles().find(p => p.id === autoSave.puzzleId);
      const manualSavedAt = savedPuzzle?.savedAt;
      if (!manualSavedAt || new Date(autoSave.savedAt).getTime() > new Date(manualSavedAt).getTime()) {
        setRecoveryData(autoSave);
      } else {
        // Auto-save is stale, clear it
        clearAutoSave();
      }
    }
  }, []);

  // Auto-save: periodic timer (every 30s while in edit mode)
  // Also flushes auto-save on unmount (covers HMR re-mounts during dev)
  useEffect(() => {
    if (state.mode !== 'edit') return;

    const timer = setInterval(() => {
      const puzzle = getCurrentPuzzleRef.current();
      writeAutoSave(puzzle);
    }, AUTOSAVE_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      // Flush auto-save on unmount so HMR doesn't lose recent edits
      writeAutoSave(getCurrentPuzzleRef.current());
    };
  }, [state.mode]);

  // Warn before leaving and flush auto-save on tab close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (state.mode === 'edit') {
        // Flush auto-save immediately so recovery works on next load
        writeAutoSave(getCurrentPuzzleRef.current());
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [state.mode]);

  // Preload sprite assets when entering playtest mode. The mounted <Game/>
  // also runs an eager preload; this kick-starts the lazy queue early so
  // anything not in the eager set still warms up while playtest sets up.
  useEffect(() => {
    if (state.mode !== 'playtest' || !originalPlaytestPuzzle) return;

    const urlsToPreload = collectPuzzleAssetUrls(originalPlaytestPuzzle);
    if (urlsToPreload.length > 0) {
      preloadImages(urlsToPreload);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omits originalPlaytestPuzzle to only re-run on mode change
  }, [state.mode, originalPlaytestPuzzle?.id]);


  // Extra drawable canvas beyond the band when valid hallways exist —
  // mirrors the game board's overhang rule: added to the canvas, EXCLUDED
  // from the scale math, so the board renders the same size either way.
  // `x` applies to both sides; `top`/`bottom` are per-edge.
  function currentHallwayOverhang(hasBorderArg: boolean): { x: number; top: number; bottom: number } {
    const overhang = { x: 0, top: 0, bottom: 0 };
    if (!hasBorderArg) return overhang;
    for (const m of state.hallways) {
      if (!isValidHallway(m, state.tiles, state.gridWidth, state.gridHeight)) continue;
      if (m.side === 'left' || m.side === 'right') overhang.x = SIDE_HALLWAY_DEPTH - SIDE_BORDER_SIZE;
      else if (m.side === 'top') overhang.top = VERT_HALLWAY_PROTRUSION;
      else overhang.bottom = VERT_HALLWAY_PROTRUSION;
    }
    return overhang;
  }

  // Draw grid — a callable (not an effect body) so both the state-change
  // effect and the live-preview ticker below can repaint it. Recreated each
  // render so it closes over current state; the ref always holds the
  // latest version for the ticker.
  const drawBoard = () => {
    if (state.mode !== 'edit') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get current skin
    const currentSkin = state.skinId ? loadPuzzleSkin(state.skinId) : null;
    const hasBorder = currentSkin !== null;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Corridor overhang: shift the whole scene right/down so corridors get
    // drawable pixels beyond the band (mirrors the game board).
    const drawOverhang = currentHallwayOverhang(hasBorder);
    ctx.save();
    ctx.translate(drawOverhang.x, drawOverhang.top);

    // Draw border if skin is selected
    if (hasBorder && currentSkin) {
      drawDungeonBorder(ctx, state.gridWidth, state.gridHeight, currentSkin);
    }

    // Translate for grid rendering if border is enabled
    const offsetX = hasBorder ? SIDE_BORDER_SIZE : 0;
    const offsetY = hasBorder ? BORDER_SIZE : 0;

    ctx.save();
    ctx.translate(offsetX, offsetY);

    // Draw tiles
    for (let y = 0; y < state.gridHeight; y++) {
      for (let x = 0; x < state.gridWidth; x++) {
        const tile = state.tiles[y][x];
        drawTile(ctx, x, y, tile, currentSkin);
      }
    }

    // Hallway openings — same shared renderer the game board uses, so the
    // editor preview matches the live dungeon. With the hallway tool
    // active, each opening also gets a copper outline so markers are easy
    // to find and remove.
    if (hasBorder && state.hallways.length > 0) {
      const hallwayCfg: HallwayDrawConfig = {
        tileSize: TILE_SIZE,
        borderSize: BORDER_SIZE,
        sideBorderSize: SIDE_BORDER_SIZE,
        verticalDepth: BORDER_SIZE + VERT_HALLWAY_PROTRUSION,
        horizontalDepth: SIDE_HALLWAY_DEPTH,
        tiles: state.tiles,
        gridWidth: state.gridWidth,
        gridHeight: state.gridHeight,
        corridorCells: collectCorridorCells(state.hallways, state.tiles, state.gridWidth, state.gridHeight),
        getImage: (slot) => {
          const src = currentSkin?.borderSprites?.[slot];
          if (!src) return null;
          const img = loadImage(src);
          return img && img.complete ? img : null;
        },
        drawFloorTile: (c, gx, gy) => {
          drawTile(c, gx, gy, { x: gx, y: gy, type: TileType.EMPTY }, currentSkin);
        },
      };
      state.hallways.forEach(marker => {
        if (!isValidHallway(marker, state.tiles, state.gridWidth, state.gridHeight)) return;
        drawHallwayOpening(ctx, marker, hallwayCfg);
        if (state.selectedTool === 'hallway') {
          const d = marker.side === 'top' || marker.side === 'bottom' ? BORDER_SIZE + VERT_HALLWAY_PROTRUSION : SIDE_HALLWAY_DEPTH;
          const rx = marker.side === 'left' ? marker.x * TILE_SIZE - d : marker.side === 'right' ? (marker.x + 1) * TILE_SIZE : marker.x * TILE_SIZE;
          const ry = marker.side === 'top' ? marker.y * TILE_SIZE - d : marker.side === 'bottom' ? (marker.y + 1) * TILE_SIZE : marker.y * TILE_SIZE;
          const rw = marker.side === 'top' || marker.side === 'bottom' ? TILE_SIZE : d;
          const rh = marker.side === 'top' || marker.side === 'bottom' ? d : TILE_SIZE;
          ctx.strokeStyle = '#d4a574';
          ctx.lineWidth = 2;
          ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
        }
      });
    }

    // Doors (phase 2) — resting look of each door's start state, using the
    // skin's door pieces (procedural plank door as fallback). Drawn after
    // hallways so a combined edge shows the door over the corridor. With
    // the hallway tool active, doors get a copper outline + start-state
    // letter (C/O/▶/◀) so they're distinguishable from bare hallways.
    if (hasBorder && state.doors.length > 0) {
      const doorImages = {
        closed: currentSkin?.borderSprites?.doorClosed ? loadImage(currentSkin.borderSprites.doorClosed) : null,
        open: currentSkin?.borderSprites?.doorOpen ? loadImage(currentSkin.borderSprites.doorOpen) : null,
        openingSheet: currentSkin?.borderSprites?.doorOpening ? loadImage(currentSkin.borderSprites.doorOpening) : null,
      };
      state.doors.forEach(marker => {
        if (!isValidDoor(marker, state.tiles, state.gridWidth, state.gridHeight)) return;
        drawDoor(ctx, marker, null, doorImages, TILE_SIZE, BORDER_SIZE);
        if (state.selectedTool === 'hallway') {
          const rx = marker.x * TILE_SIZE;
          const ry = marker.side === 'top' ? marker.y * TILE_SIZE - BORDER_SIZE : (marker.y + 1) * TILE_SIZE;
          ctx.strokeStyle = '#d4a574';
          ctx.lineWidth = 2;
          ctx.strokeRect(rx + 3, ry + 3, TILE_SIZE - 6, BORDER_SIZE - 6);
          const letter = marker.startState === 'closed' ? 'C' : marker.startState === 'open' ? 'O' : marker.startState === 'opening' ? '▶' : '◀';
          ctx.fillStyle = '#d4a574';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(letter, rx + TILE_SIZE / 2, ry + BORDER_SIZE / 2 + 4);
          ctx.textAlign = 'left';
        }
      });
    }

    // Draw objects below entities (sorted by y position for proper layering)
    const belowObjects = state.placedObjects.filter(obj => {
      const objData = loadObject(obj.objectId);
      return !objData?.renderLayer || objData.renderLayer === 'below_entities';
    }).sort((a, b) => a.y - b.y);

    belowObjects.forEach((obj) => {
      drawObject(ctx, obj.x, obj.y, obj.objectId, obj.offsetX ?? 0, obj.offsetY ?? 0);
    });

    // Draw enemies
    state.enemies.forEach((enemy) => {
      if (!enemy.dead) {
        drawEnemy(ctx, enemy.x, enemy.y, enemy.enemyId);
      }
    });

    // Draw collectibles
    state.collectibles.forEach((collectible) => {
      if (!collectible.collected) {
        drawCollectibleInEditor(ctx, collectible);
      }
    });

    // Draw objects above entities (sorted by y position for proper layering)
    const aboveObjects = state.placedObjects.filter(obj => {
      const objData = loadObject(obj.objectId);
      return objData?.renderLayer === 'above_entities';
    }).sort((a, b) => a.y - b.y);

    aboveObjects.forEach((obj) => {
      drawObject(ctx, obj.x, obj.y, obj.objectId, obj.offsetX ?? 0, obj.offsetY ?? 0);
    });

    // Roster hover highlight (Phase 2): copper wash + outline on the hovered
    // row's tile so it's easy to spot on the board.
    if (highlightTile) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
      ctx.fillRect(highlightTile.x * TILE_SIZE, highlightTile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.strokeRect(highlightTile.x * TILE_SIZE + 1.5, highlightTile.y * TILE_SIZE + 1.5, TILE_SIZE - 3, TILE_SIZE - 3);
    }

    // Drag-to-move ghost (Phase 3): the grabbed placement previews at the
    // target tile while the original stays put until release.
    if (dragState?.moved) {
      const { kind, index, toX, toY } = dragState;
      ctx.globalAlpha = 0.55;
      if (kind === 'enemy') {
        const en = state.enemies[index];
        if (en) drawEnemy(ctx, toX, toY, en.enemyId);
      } else if (kind === 'object') {
        const ob = state.placedObjects[index];
        if (ob) drawObject(ctx, toX, toY, ob.objectId,
          dragState.pixelMode ? (dragState.artOffsetX ?? 0) : (ob.offsetX ?? 0),
          dragState.pixelMode ? (dragState.artOffsetY ?? 0) : (ob.offsetY ?? 0));
      } else {
        const co = state.collectibles[index];
        if (co) drawCollectibleInEditor(ctx, { ...co, x: toX, y: toY });
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.strokeRect(toX * TILE_SIZE + 1, toY * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    }

    ctx.restore();
    ctx.restore(); // side-corridor overhang translate
  };
  const drawBoardRef = useRef(drawBoard);
  drawBoardRef.current = drawBoard;

  // Repaint immediately on any state edit (same dep list the old draw
  // effect used) — keeps editing feedback instant between ticker beats.
  useEffect(() => {
    drawBoardRef.current();
  }, [state.tiles, state.enemies, state.collectibles, state.placedObjects, state.hallways, state.doors, state.selectedTool, state.gridWidth, state.gridHeight, state.mode, state.skinId, redrawCounter, highlightTile, dragState]);

  // Live board preview (2026-07-17): a modest repaint clock so sprite
  // animations play while editing. drawSprite's sheet stepper advances only
  // when drawn, gated by each sheet's own frameRate — so a ~12fps cadence
  // animates the 4–12fps sprites correctly without running the canvas at
  // 60Hz (the editor board is a workspace, not a game loop; rAF also stops
  // entirely while the tab is hidden).
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 85) return;
      last = t;
      drawBoardRef.current();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Touch long-press = delete (mirrors right-click). Android fires
  // contextmenu on long-press natively; iOS Safari doesn't, so a manual
  // timer covers it. Whichever fires first sets the flag, which turns the
  // eventual release into a no-op — the guard also prevents the two paths
  // from double-deleting stacked placements.
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    longPressFiredRef.current = false;
    if (e.button !== 0) return; // right-click is delete (context menu)
    // Grab-first (Phase 3): pressing on a placement defers the action —
    // dragging moves it, releasing in place runs the normal click.
    const tile = tileFromMouseEvent(e);
    const grabbed = tile ? findPlacementAt(tile.x, tile.y) : null;
    if (grabbed && tile) {
      if (e.pointerType === 'touch') {
        // Arm the iOS-side long-press delete; any tile change cancels it.
        longPressTimerRef.current = setTimeout(() => {
          longPressTimerRef.current = null;
          longPressFiredRef.current = true;
          setDragState(null);
          vibrate('tilePaint');
          handleRemovePlacement(grabbed.kind, grabbed.index);
        }, 650);
      }
      // Pixel-fine mode: dragging an OBJECT with the Object tool active
      // moves it in whole art pixels — the grab point on the sprite is
      // preserved so nothing jumps. Other kinds/tools keep tile snapping.
      if (grabbed.kind === 'object' && state.selectedTool === 'object') {
        const obj = state.placedObjects[grabbed.index];
        const p = gridPointFromMouseEvent(e);
        if (obj && p) {
          const zoom = TILE_SIZE / ART_TILE_PX;
          const anchorX = obj.x * TILE_SIZE + TILE_SIZE / 2 + (obj.offsetX ?? 0) * zoom;
          const anchorY = obj.y * TILE_SIZE + TILE_SIZE / 2 + (obj.offsetY ?? 0) * zoom;
          setDragState({
            ...grabbed, fromX: tile.x, fromY: tile.y, toX: obj.x, toY: obj.y, moved: false,
            pixelMode: true,
            grabDX: p.px - anchorX,
            grabDY: p.py - anchorY,
            artOffsetX: obj.offsetX ?? 0,
            artOffsetY: obj.offsetY ?? 0,
          });
          return;
        }
      }
      setDragState({ ...grabbed, fromX: tile.x, fromY: tile.y, toX: tile.x, toY: tile.y, moved: false });
      return;
    }
    // Save snapshot of state before drawing starts
    saveSnapshotBeforeDraw();
    setState(prev => ({ ...prev, isDrawing: true }));
    handleCanvasClick(e);
  };

  // Pointer position in GRID-space pixels (unfloored) — the shared
  // coordinate math (scale + border offsets + hallway overhang) behind both
  // the tile lookup and the pixel-fine object drag.
  const gridPointFromMouseEvent = (e: React.MouseEvent<HTMLCanvasElement>): { px: number; py: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const hasBorderLocal = state.skinId !== undefined && state.skinId !== '';
    const offsetX = hasBorderLocal ? SIDE_BORDER_SIZE : 0;
    const offsetY = hasBorderLocal ? BORDER_SIZE : 0;
    const gridWidthPx = state.gridWidth * TILE_SIZE;
    const canvasWidthPx = hasBorderLocal ? gridWidthPx + (SIDE_BORDER_SIZE * 2) : gridWidthPx;
    const maxDisplayGridWidth = MAX_DISPLAY_WIDTH_TILES * TILE_SIZE;
    const maxDisplayCanvasWidth = hasBorderLocal ? maxDisplayGridWidth + (SIDE_BORDER_SIZE * 2) : maxDisplayGridWidth;
    let currentScale = 1;
    if (state.gridWidth > MAX_DISPLAY_WIDTH_TILES) {
      currentScale = maxDisplayCanvasWidth / canvasWidthPx;
    } else if (editorMaxWidth && editorMaxWidth < canvasWidthPx) {
      currentScale = editorMaxWidth / canvasWidthPx;
    }
    const rect = canvas.getBoundingClientRect();
    const pointerOverhang = currentHallwayOverhang(hasBorderLocal);
    return {
      px: (e.clientX - rect.left) / currentScale - offsetX - pointerOverhang.x,
      py: (e.clientY - rect.top) / currentScale - offsetY - pointerOverhang.top,
    };
  };

  // Tile under the mouse, or null when outside the grid. Mirrors the
  // coordinate math in handleCanvasClick (scale + border offsets).
  const tileFromMouseEvent = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const p = gridPointFromMouseEvent(e);
    if (!p) return null;
    const x = Math.floor(p.px / TILE_SIZE);
    const y = Math.floor(p.py / TILE_SIZE);
    if (x < 0 || y < 0 || x >= state.gridWidth || y >= state.gridHeight) return null;
    return { x, y };
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const tile = tileFromMouseEvent(e);
    setCursorTile(prev => (prev?.x === tile?.x && prev?.y === tile?.y ? prev : tile));
    if (dragState) {
      // Pixel-fine object drag: the anchor point follows the cursor (grab
      // point preserved); tile = whichever tile the anchor lands in, offset
      // = the art-pixel remainder from that tile's center. A gentle snap
      // zeroes tiny offsets so re-centering on a tile stays easy.
      if (dragState.pixelMode) {
        const p = gridPointFromMouseEvent(e);
        if (p) {
          const zoom = TILE_SIZE / ART_TILE_PX;
          const ax = p.px - (dragState.grabDX ?? 0);
          const ay = p.py - (dragState.grabDY ?? 0);
          const tx = Math.min(state.gridWidth - 1, Math.max(0, Math.floor(ax / TILE_SIZE)));
          const ty = Math.min(state.gridHeight - 1, Math.max(0, Math.floor(ay / TILE_SIZE)));
          let ox = Math.round((ax - (tx * TILE_SIZE + TILE_SIZE / 2)) / zoom);
          let oy = Math.round((ay - (ty * TILE_SIZE + TILE_SIZE / 2)) / zoom);
          if (Math.abs(ox) <= 2 && Math.abs(oy) <= 2) { ox = 0; oy = 0; }
          const orig = state.placedObjects[dragState.index];
          const movedNow = dragState.moved || !orig ||
            tx !== orig.x || ty !== orig.y ||
            ox !== (orig.offsetX ?? 0) || oy !== (orig.offsetY ?? 0);
          if (movedNow && longPressTimerRef.current) clearLongPressTimer();
          setDragState(prev => {
            if (!prev) return prev;
            if (prev.toX === tx && prev.toY === ty && prev.artOffsetX === ox && prev.artOffsetY === oy && prev.moved === movedNow) return prev;
            return { ...prev, toX: tx, toY: ty, artOffsetX: ox, artOffsetY: oy, moved: movedNow };
          });
        }
        return;
      }
      if (longPressTimerRef.current && tile && (tile.x !== dragState.fromX || tile.y !== dragState.fromY)) {
        clearLongPressTimer(); // it's a drag now, not a long-press
      }
      if (tile) {
        setDragState(prev => {
          if (!prev) return prev;
          const moved = prev.moved || tile.x !== prev.fromX || tile.y !== prev.fromY;
          if (prev.toX === tile.x && prev.toY === tile.y && prev.moved === moved) return prev;
          return { ...prev, toX: tile.x, toY: tile.y, moved };
        });
      }
      return;
    }
    if (!state.isDrawing) return;
    // Hallway toggles aren't idempotent — drag-painting would flip the
    // marker on every pointermove. Single-click tool: the pointer-down
    // click did the work.
    if (state.selectedTool === 'hallway') return;
    handleCanvasClick(e);
  };

  const handleCanvasPointerUp = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    clearLongPressTimer();
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      setDragState(null);
      return;
    }
    if (dragState) {
      const ds = dragState;
      setDragState(null);
      if (ds.moved) {
        // Pixel drags commit even on the same tile — the offset changed.
        if (ds.pixelMode || ds.toX !== ds.fromX || ds.toY !== ds.fromY) commitMove(ds);
      } else if (e) {
        const entityToolActive = state.selectedTool === 'enemy' || state.selectedTool === 'ally' || state.selectedTool === 'vessel';
        if (ds.kind === 'enemy' && entityToolActive) {
          // Plain click on an entity with an entity tool: inspect instead of
          // toggle-remove (removal lives on right-click and in the popover).
          setInspect({ index: ds.index, screenX: e.clientX, screenY: e.clientY });
        } else if (ds.kind === 'object' && state.selectedTool === 'object') {
          // Plain click on an object with the Object tool: offset popover
          // (sliders for precise alignment). Same pattern as entities —
          // removal moves to right-click / long-press / roster / popover.
          objectInspectHistoryPushedRef.current = false;
          setObjectInspect({ index: ds.index, screenX: e.clientX, screenY: e.clientY });
        } else {
          // Released in place — run the normal click for this tile.
          saveSnapshotBeforeDraw();
          paintTile(ds.fromX, ds.fromY);
          setTimeout(() => { pushToHistoryAfterDraw(); }, 0);
        }
      }
      return;
    }
    setState(prev => ({ ...prev, isDrawing: false }));
    // Push the new state to history after drawing completes
    // Use setTimeout to ensure state has updated before comparing
    setTimeout(() => {
      pushToHistoryAfterDraw();
    }, 0);
  };

  // Commit a drag-move (Phase 3): blocked only when the target tile already
  // holds a same-kind placement — mirrors the one-per-tile toggle rule.
  // Pixel-mode object drags also commit the per-placement art-px offset.
  const commitMove = (ds: { kind: RosterKind; index: number; toX: number; toY: number; pixelMode?: boolean; artOffsetX?: number; artOffsetY?: number }) => {
    const { kind, index, toX, toY } = ds;
    const occupied = kind === 'enemy'
      ? state.enemies.some((p, i) => i !== index && p.x === toX && p.y === toY)
      : kind === 'object'
        ? state.placedObjects.some((p, i) => i !== index && p.x === toX && p.y === toY)
        : state.collectibles.some((p, i) => i !== index && p.x === toX && p.y === toY);
    if (occupied) {
      toast.warning('That tile already has one of those.');
      return;
    }
    pushToHistory();
    vibrate('tilePaint');
    setState(prev => {
      if (kind === 'enemy') {
        const next = [...prev.enemies];
        next[index] = { ...next[index], x: toX, y: toY };
        return { ...prev, enemies: next };
      }
      if (kind === 'object') {
        const next = [...prev.placedObjects];
        next[index] = ds.pixelMode
          ? {
              ...next[index], x: toX, y: toY,
              // 0 stores as undefined so a re-centered object is byte-
              // identical to a never-nudged one.
              offsetX: ds.artOffsetX || undefined,
              offsetY: ds.artOffsetY || undefined,
            }
          : { ...next[index], x: toX, y: toY };
        return { ...prev, placedObjects: next };
      }
      const next = [...prev.collectibles];
      next[index] = { ...next[index], x: toX, y: toY };
      return { ...prev, collectibles: next };
    });
  };

  const handleCanvasPointerLeave = () => {
    clearLongPressTimer();
    setCursorTile(null);
    if (dragState) {
      // Leaving the canvas cancels an in-flight drag.
      setDragState(null);
      return;
    }
    handleCanvasPointerUp();
  };

  // Pointer cancel (e.g. the OS claims the touch): abandon everything.
  const handleCanvasPointerCancel = () => {
    clearLongPressTimer();
    setDragState(null);
    setState(prev => (prev.isDrawing ? { ...prev, isDrawing: false } : prev));
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const hasBorder = state.skinId !== undefined && state.skinId !== '';
    const offsetX = hasBorder ? SIDE_BORDER_SIZE : 0;
    const offsetY = hasBorder ? BORDER_SIZE : 0;

    // Calculate current scale factor for responsive canvas
    const gridWidthPx = state.gridWidth * TILE_SIZE;
    const canvasWidthPx = hasBorder ? gridWidthPx + (SIDE_BORDER_SIZE * 2) : gridWidthPx;
    const maxDisplayGridWidth = MAX_DISPLAY_WIDTH_TILES * TILE_SIZE;
    const maxDisplayCanvasWidth = hasBorder ? maxDisplayGridWidth + (SIDE_BORDER_SIZE * 2) : maxDisplayGridWidth;

    let currentScale = 1;
    if (state.gridWidth > MAX_DISPLAY_WIDTH_TILES) {
      // Scale down to fit within max display width
      currentScale = maxDisplayCanvasWidth / canvasWidthPx;
    } else if (editorMaxWidth && editorMaxWidth < canvasWidthPx) {
      currentScale = editorMaxWidth / canvasWidthPx;
    }

    const rect = canvas.getBoundingClientRect();
    const clickOverhang = currentHallwayOverhang(hasBorder);
    // Account for scale when converting click coordinates
    const clickX = (e.clientX - rect.left) / currentScale - offsetX - clickOverhang.x;
    const clickY = (e.clientY - rect.top) / currentScale - offsetY - clickOverhang.top;
    const x = Math.floor(clickX / TILE_SIZE);
    const y = Math.floor(clickY / TILE_SIZE);

    if (x < 0 || x >= state.gridWidth || y < 0 || y >= state.gridHeight) return;

    // Fractional position within the tile — the hallway tool picks WHICH
    // wall of the tile from where inside it you clicked.
    paintTile(x, y, clickX / TILE_SIZE - x, clickY / TILE_SIZE - y);
  };

  const paintTile = (x: number, y: number, fx?: number, fy?: number) => {
    vibrate('tilePaint');

    if (state.selectedTool === 'hallway') {
      // Needs a direct canvas click (fractions unavailable on the
      // release-in-place path after grabbing a placement — rare; move the
      // placement aside or click an empty edge tile).
      if (fx === undefined || fy === undefined) return;
      const dx = fx - 0.5;
      const dy = fy - 0.5;
      const side: HallwaySide = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'bottom' : 'top');
      const wantsHallway = openingMode === 'hallway' || openingMode === 'both';
      const wantsDoor = openingMode === 'door' || openingMode === 'both';
      if (wantsDoor && side !== 'top' && side !== 'bottom') {
        toast.warning('Doors fit top and bottom walls only.');
        return;
      }
      if (!isValidHallway({ x, y, side }, state.tiles, state.gridWidth, state.gridHeight)) {
        toast.warning('Wall openings need the edge of a floor tile that borders the void or the outside.');
        return;
      }
      setState(prev => {
        const hallwayIdx = prev.hallways.findIndex(h => h.x === x && h.y === y && h.side === side);
        const doorIdx = prev.doors.findIndex(d => d.x === x && d.y === y && d.side === side);
        let hallways = prev.hallways;
        let doors = prev.doors;
        if (openingMode === 'both') {
          // Pair semantics: if anything exists on this edge, clear it all;
          // otherwise place hallway + door together.
          if (hallwayIdx >= 0 || doorIdx >= 0) {
            if (hallwayIdx >= 0) { hallways = [...hallways]; hallways.splice(hallwayIdx, 1); }
            if (doorIdx >= 0) { doors = [...doors]; doors.splice(doorIdx, 1); }
          } else {
            hallways = [...hallways, { x, y, side, ...(hallwayOpenLedge ? { openLedge: true } : {}) }];
            doors = [...doors, { x, y, side: side as 'top' | 'bottom', startState: doorStartState }];
          }
        } else if (wantsHallway) {
          if (hallwayIdx >= 0) { hallways = [...hallways]; hallways.splice(hallwayIdx, 1); }
          else hallways = [...hallways, { x, y, side, ...(hallwayOpenLedge ? { openLedge: true } : {}) }];
        } else if (wantsDoor) {
          if (doorIdx >= 0) { doors = [...doors]; doors.splice(doorIdx, 1); }
          else doors = [...doors, { x, y, side: side as 'top' | 'bottom', startState: doorStartState }];
        }
        return { ...prev, hallways, doors };
      });
      return;
    }
    if (state.selectedTool === 'enemy' || state.selectedTool === 'ally' || state.selectedTool === 'vessel') {
      // All three place into puzzle.enemies through the same pipeline; the
      // party stamp below (keyed on the ASSET id, not the tool) is what
      // makes a placed ally an ally.
      const selectedId = state.selectedTool === 'enemy' ? selectedEnemyId
        : state.selectedTool === 'ally' ? selectedAllyId
        : selectedVesselId;
      if (!selectedId) {
        toast.warning(`Please select ${state.selectedTool === 'enemy' ? 'an enemy' : state.selectedTool === 'ally' ? 'an ally' : 'a vessel'} type first!`);
        return;
      }

      const enemyType = placeableEnemyTypes.find(e => e.id === selectedId);
      if (!enemyType) return;

      setState(prev => {
        // Check if enemy already exists at this position
        const existingEnemyIndex = prev.enemies.findIndex(e => e.x === x && e.y === y);

        if (existingEnemyIndex >= 0) {
          // Remove existing enemy
          const newEnemies = [...prev.enemies];
          newEnemies.splice(existingEnemyIndex, 1);
          return { ...prev, enemies: newEnemies };
        } else {
          // Add new enemy
          const newEnemy: PlacedEnemy = {
            enemyId: enemyType.id,
            x,
            y,
            currentHealth: enemyType.health,
            dead: false,
            facing: enemyType.behavior?.defaultFacing || Direction.EAST,
            actionIndex: 0,
            active: enemyType.behavior?.type === 'active',
            // The party stamp is what makes a placed ally an ally: the
            // engine's party model reads it everywhere (targeting, win
            // conditions, pickups). Enemies/vessels leave it absent.
            ...(allyIds.has(enemyType.id) ? { party: 'hero' as const } : {}),
          };
          return { ...prev, enemies: [...prev.enemies, newEnemy] };
        }
      });
      return;
    }

    if (state.selectedTool === 'collectible') {
      // Place collectible
      setState(prev => {
        // Check if collectible already exists at this position
        const existingCollIndex = prev.collectibles.findIndex(c => c.x === x && c.y === y);

        if (existingCollIndex >= 0) {
          // Remove existing collectible
          const newCollectibles = [...prev.collectibles];
          newCollectibles.splice(existingCollIndex, 1);
          return { ...prev, collectibles: newCollectibles };
        } else {
          // Add new collectible
          const newCollectible: PlacedCollectible = selectedCollectibleId
            ? {
                collectibleId: selectedCollectibleId,
                x,
                y,
                collected: false,
                instanceId: `coll_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              }
            : {
                type: 'coin',
                x,
                y,
                scoreValue: 10,
                collected: false,
                instanceId: `coll_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              };
          return { ...prev, collectibles: [...prev.collectibles, newCollectible] };
        }
      });
      return;
    }

    // Handle object placement
    if (state.selectedTool === 'object') {
      if (!selectedObjectId) {
        toast.warning('Please select an object type first!');
        return;
      }

      setState(prev => {
        // Check if object already exists at this position
        const existingObjIndex = prev.placedObjects.findIndex(o => o.x === x && o.y === y);

        if (existingObjIndex >= 0) {
          // Remove existing object
          const newObjects = [...prev.placedObjects];
          newObjects.splice(existingObjIndex, 1);
          return { ...prev, placedObjects: newObjects };
        } else {
          // Add new object
          const newObject: PlacedObject = {
            objectId: selectedObjectId,
            x,
            y,
          };
          return { ...prev, placedObjects: [...prev.placedObjects, newObject] };
        }
      });
      return;
    }

    // Handle custom tile placement
    if (state.selectedTool === 'custom') {
      if (!selectedCustomTileTypeId) {
        toast.warning('Please select a custom tile type first!');
        return;
      }

      const tileType = loadTileType(selectedCustomTileTypeId);
      if (!tileType) return;

      setState(prev => {
        const newTiles = prev.tiles.map(row => [...row]);

        // Get existing tile or create new one
        const existingTile = newTiles[y][x];

        if (existingTile?.customTileTypeId === selectedCustomTileTypeId) {
          // Clicking on same custom tile removes the custom type
          newTiles[y][x] = {
            x, y,
            type: tileType.baseType === 'wall' ? TileType.WALL : TileType.EMPTY,
          };
        } else {
          // Place custom tile
          const baseTileType = tileType.baseType === 'wall' ? TileType.WALL : TileType.EMPTY;

          // For teleport tiles, assign a group ID
          let teleportGroupId: string | undefined;
          const teleportBehavior = tileType.behaviors.find(b => b.type === 'teleport');
          if (teleportBehavior) {
            teleportGroupId = teleportBehavior.teleportGroupId || 'A';
          }

          // Assign trigger group if selected (available for all custom tiles)
          let triggerGroupId: string | undefined;
          if (selectedTriggerGroupId) {
            triggerGroupId = selectedTriggerGroupId;
          }

          newTiles[y][x] = {
            x, y,
            type: baseTileType,
            customTileTypeId: selectedCustomTileTypeId,
            teleportGroupId,
            triggerGroupId,
          };
        }

        return { ...prev, tiles: newTiles };
      });
      return;
    }

    // Paint tile type
    setState(prev => {
      const newTiles = prev.tiles.map(row => [...row]);

      switch (prev.selectedTool) {
        case 'empty':
          newTiles[y][x] = { x, y, type: TileType.EMPTY };
          break;
        case 'wall':
          newTiles[y][x] = { x, y, type: TileType.WALL };
          break;
        case 'void':
          newTiles[y][x] = null;
          break;
      }

      return { ...prev, tiles: newTiles };
    });
  };

  const getCurrentPuzzle = (): Puzzle => {
    // Build borderConfig from skin for compatibility with AnimatedGameBoard
    const skin = state.skinId ? loadPuzzleSkin(state.skinId) : null;
    const borderConfig: BorderConfig | undefined = skin ? {
      style: Object.keys(skin.borderSprites).length > 0 ? 'custom' : 'dungeon',
      customBorderSprites: Object.keys(skin.borderSprites).length > 0 ? skin.borderSprites : undefined,
    } : undefined;

    return {
      id: state.puzzleId,
      date: new Date().toISOString().split('T')[0],
      name: state.puzzleName,
      width: state.gridWidth,
      height: state.gridHeight,
      tiles: state.tiles,
      enemies: state.enemies,
      collectibles: state.collectibles,
      placedObjects: state.placedObjects,
      availableCharacters: state.availableCharacters,
      winConditions: state.winConditions,
      maxCharacters: state.maxCharacters,
      maxPlaceableCharacters: state.maxPlaceableCharacters,
      maxTurns: state.maxTurns,
      lives: state.lives,
      borderConfig,
      skinId: state.skinId,
      backgroundMusicId: state.backgroundMusicId,
      parCharacters: state.parCharacters,
      parTurns: state.parTurns,
      sideQuests: state.sideQuests.length > 0 ? state.sideQuests : undefined,
      hallways: state.hallways.length > 0 ? state.hallways : undefined,
      doors: state.doors.length > 0 ? state.doors : undefined,
      tags: state.tags.length > 0 ? state.tags : undefined,
      description: state.description || undefined,
      isTraining: state.isTraining || undefined,
    };
  };

  // Keep a ref to getCurrentPuzzle so the auto-save timer always has the latest state
  const getCurrentPuzzleRef = useRef(getCurrentPuzzle);
  getCurrentPuzzleRef.current = getCurrentPuzzle;

  const handleSave = () => {
    // Check if puzzle already exists in library
    const existingPuzzle = savedPuzzles.find(p => p.id === state.puzzleId);

    if (existingPuzzle) {
      if (!confirm(`Overwrite existing puzzle "${state.puzzleName}"?`)) {
        return;
      }
    }

    const puzzle = getCurrentPuzzle();
    const success = savePuzzle(puzzle);
    if (success) {
      clearAutoSave();
      setSavedPuzzles(getSavedPuzzles());
      toast.success(`Saved "${state.puzzleName}"!`);
    }
    // If save failed, safeLocalStorageSet already showed an error alert
  };
  handleSaveRef.current = handleSave;

  const handleSaveAs = () => {
    const newName = prompt('Enter new puzzle name:', state.puzzleName + ' (Copy)');
    if (!newName) return;

    const newId = 'puzzle_' + Date.now();
    const puzzle = {
      ...getCurrentPuzzle(),
      id: newId,
      name: newName,
    };

    const success = savePuzzle(puzzle);
    if (success) {
      clearAutoSave();
      setState(prev => ({
        ...prev,
        puzzleId: newId,
        puzzleName: newName,
      }));
      setSavedPuzzles(getSavedPuzzles());
      toast.success(`Saved as "${newName}"!`);
    }
    // If save failed, safeLocalStorageSet already showed an error alert
  };

  const handleExport = () => {
    const puzzle = getCurrentPuzzle();
    const json = JSON.stringify(puzzle, null, 2);

    // Copy to clipboard
    navigator.clipboard.writeText(json).then(() => {
      toast.success('Puzzle JSON copied to clipboard!');
    });
  };

  const handleLoadFromLibrary = (puzzleId: string) => {
    const puzzle = loadPuzzle(puzzleId);
    if (!puzzle) return;
    clearAutoSave();

    setState(prev => ({
      ...prev,
      gridWidth: puzzle.width,
      gridHeight: puzzle.height,
      tiles: puzzle.tiles,
      enemies: puzzle.enemies,
      collectibles: puzzle.collectibles,
      placedObjects: puzzle.placedObjects || [],
      puzzleName: puzzle.name,
      puzzleId: puzzle.id,
      maxCharacters: puzzle.maxCharacters,
      maxPlaceableCharacters: puzzle.maxPlaceableCharacters,
      maxTurns: puzzle.maxTurns,
      lives: puzzle.lives ?? 3,
      availableCharacters: puzzle.availableCharacters.filter(id => getCharacter(id) != null),
      winConditions: puzzle.winConditions,
      skinId: puzzle.skinId || 'builtin_dungeon',
      backgroundMusicId: puzzle.backgroundMusicId,
      parCharacters: puzzle.parCharacters,
      parTurns: puzzle.parTurns,
      sideQuests: puzzle.sideQuests || [],
      hallways: puzzle.hallways || [],
      doors: puzzle.doors || [],
      tags: puzzle.tags || [],
      description: puzzle.description || '',
      isTraining: puzzle.isTraining ?? false,
    }));

    setShowLibrary(false);
  };

  // Auto-load puzzle from URL search params (global search navigation)
  const [editorSearchParams] = useSearchParams();
  useEffect(() => {
    const puzzleId = editorSearchParams.get('id');
    if (puzzleId) {
      handleLoadFromLibrary(puzzleId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally runs once on mount to load puzzle from URL
  }, []);

  const handleDeleteFromLibrary = (puzzleId: string) => {
    if (!confirm('Delete this puzzle from library?')) return;
    deletePuzzle(puzzleId);
    setSavedPuzzles(getSavedPuzzles());
  };

  const handleRecoverAutoSave = () => {
    if (!recoveryData) return;
    const puzzle = recoveryData.puzzle;
    setState(prev => ({
      ...prev,
      gridWidth: puzzle.width,
      gridHeight: puzzle.height,
      tiles: puzzle.tiles,
      enemies: puzzle.enemies,
      collectibles: puzzle.collectibles,
      placedObjects: puzzle.placedObjects || [],
      puzzleName: puzzle.name,
      puzzleId: puzzle.id,
      maxCharacters: puzzle.maxCharacters,
      maxPlaceableCharacters: puzzle.maxPlaceableCharacters,
      maxTurns: puzzle.maxTurns,
      lives: puzzle.lives ?? 3,
      availableCharacters: puzzle.availableCharacters.filter(id => getCharacter(id) != null),
      winConditions: puzzle.winConditions,
      skinId: puzzle.skinId || 'builtin_dungeon',
      backgroundMusicId: puzzle.backgroundMusicId,
      parCharacters: puzzle.parCharacters,
      parTurns: puzzle.parTurns,
      sideQuests: puzzle.sideQuests || [],
      hallways: puzzle.hallways || [],
      doors: puzzle.doors || [],
      tags: puzzle.tags || [],
      description: puzzle.description || '',
      isTraining: puzzle.isTraining ?? false,
    }));
    clearAutoSave();
    setRecoveryData(null);
    toast.success(`Recovered "${puzzle.name}"`);
  };

  const handleDismissRecovery = () => {
    clearAutoSave();
    setRecoveryData(null);
  };

  const handleNewPuzzle = () => {
    if (!confirm('Create new puzzle? Unsaved changes will be lost.')) return;
    clearAutoSave();

    setState({
      gridWidth: 8,
      gridHeight: 8,
      tiles: createEmptyGrid(8, 8),
      enemies: [],
      collectibles: [],
      placedObjects: [],
      puzzleName: 'New Puzzle',
      puzzleId: 'puzzle_' + Date.now(),
      maxCharacters: 3,
      maxPlaceableCharacters: undefined,
      maxTurns: 100,
      lives: 3,
      availableCharacters: [],
      winConditions: [{ type: 'defeat_all_enemies' }],
      skinId: 'builtin_dungeon',
      backgroundMusicId: undefined,
      parCharacters: undefined,
      parTurns: undefined,
      sideQuests: [],
      hallways: [],
      doors: [],
      tags: [],
      description: '',
      isTraining: false,
      selectedTool: 'wall',
      isDrawing: false,
      mode: 'edit',
    });
  };

  const handleImport = () => {
    const jsonString = prompt('Paste puzzle JSON:');
    if (!jsonString) return;

    try {
      const puzzle: Puzzle = JSON.parse(jsonString);

      setState(prev => ({
        ...prev,
        gridWidth: puzzle.width,
        gridHeight: puzzle.height,
        tiles: puzzle.tiles,
        enemies: puzzle.enemies,
        collectibles: puzzle.collectibles,
        puzzleName: puzzle.name,
        puzzleId: puzzle.id,
        maxCharacters: puzzle.maxCharacters,
        maxPlaceableCharacters: puzzle.maxPlaceableCharacters,
        maxTurns: puzzle.maxTurns,
        lives: puzzle.lives ?? 3,
        availableCharacters: puzzle.availableCharacters,
        winConditions: puzzle.winConditions,
        skinId: puzzle.skinId || 'builtin_dungeon',
        backgroundMusicId: puzzle.backgroundMusicId,
        parCharacters: puzzle.parCharacters,
        parTurns: puzzle.parTurns,
        sideQuests: puzzle.sideQuests || [],
        hallways: puzzle.hallways || [],
        doors: puzzle.doors || [],
        tags: puzzle.tags || [],
        description: puzzle.description || '',
        isTraining: puzzle.isTraining ?? false,
      }));

      toast.success('Puzzle loaded successfully!');
    } catch (e) {
      toast.error('Invalid JSON format: ' + (e as Error).message);
    }
  };

  const handleClear = () => {
    if (!confirm('Clear the entire grid?')) return;

    // Push to history before clearing (so we can undo)
    pushToHistory();

    // Clear the cached state as well
    clearCachedEditorState();

    setState(prev => ({
      ...prev,
      tiles: createEmptyGrid(prev.gridWidth, prev.gridHeight),
      enemies: [],
      collectibles: [],
      placedObjects: [],
    }));
  };

  // Handle loading a generated puzzle into the editor
  const handleGeneratedPuzzle = (puzzle: Puzzle) => {
    // Push current state to history before loading
    pushToHistory();

    // Clear any cached state
    clearCachedEditorState();

    // Load the generated puzzle into editor state
    setState(prev => ({
      ...prev,
      gridWidth: puzzle.width,
      gridHeight: puzzle.height,
      tiles: puzzle.tiles,
      enemies: puzzle.enemies,
      collectibles: puzzle.collectibles,
      placedObjects: puzzle.placedObjects || [],
      availableCharacters: puzzle.availableCharacters,
      winConditions: puzzle.winConditions,
      maxCharacters: puzzle.maxCharacters,
      maxTurns: puzzle.maxTurns,
      lives: puzzle.lives,
      parCharacters: puzzle.parCharacters,
      parTurns: puzzle.parTurns,
      puzzleName: puzzle.name,
      puzzleId: puzzle.id,
      skinId: puzzle.skinId,
    }));

    // Update input fields for grid size
    setWidthInput(String(puzzle.width));
    setHeightInput(String(puzzle.height));
  };

  const handleValidate = async () => {
    setIsValidating(true);
    setValidationResult(null);
    setShowValidationModal(true);

    // Build a temporary puzzle object for validation
    const puzzleForValidation: Puzzle = {
      id: state.puzzleId,
      date: new Date().toISOString().split('T')[0],
      name: state.puzzleName,
      width: state.gridWidth,
      height: state.gridHeight,
      tiles: state.tiles,
      enemies: state.enemies.map(e => ({ ...e, dead: false })),
      collectibles: state.collectibles.map(c => ({ ...c, collected: false })),
      placedObjects: state.placedObjects,
      availableCharacters: state.availableCharacters,
      winConditions: state.winConditions,
      maxCharacters: state.maxCharacters,
      maxPlaceableCharacters: state.maxPlaceableCharacters,
      maxTurns: state.maxTurns,
      lives: state.lives,
      skinId: state.skinId,
    };

    // Run quick validation first
    const quickResult = quickValidate(puzzleForValidation);
    if (!quickResult.valid) {
      setValidationResult({
        solvable: false,
        minCharactersNeeded: null,
        solutionFound: null,
        totalCombinationsTested: 0,
        searchTimeMs: 0,
        error: quickResult.issues.join('; '),
        warnings: quickResult.warnings,
      });
      setIsValidating(false);
      return;
    }

    // Capture warnings to pass to solver result
    const quickWarnings = quickResult.warnings;

    // Run full solver asynchronously to avoid blocking UI
    const runValidation = async () => {
      try {
        // Use async solver that yields to browser periodically
        const result = await solvePuzzleAsync(puzzleForValidation, {
          maxSimulationTurns: state.maxTurns || 200,
          maxCombinations: 50000,
          yieldEvery: 50, // Yield every 50 combinations to keep UI responsive
        });
        // Merge quick warnings + difficulty hints into result
        const resultWarnings = [...quickWarnings];
        if (result.solvable && result.solutionFound) {
          const combos = result.totalCombinationsTested;
          if (combos < 10) resultWarnings.push('Difficulty: Trivial (very few placement options)');
          else if (combos < 100) resultWarnings.push('Difficulty: Easy');
          else if (combos < 1000) resultWarnings.push('Difficulty: Medium');
          else if (combos < 10000) resultWarnings.push('Difficulty: Hard');
          else resultWarnings.push('Difficulty: Very Hard (many possible placements)');

          // Par feasibility
          if (state.parTurns && result.solutionFound.turnsToWin > state.parTurns) {
            resultWarnings.push(`Par turns (${state.parTurns}) is less than solver's best (${result.solutionFound.turnsToWin}) — par may be impossible`);
          }
          if (state.parCharacters && result.minCharactersNeeded && result.minCharactersNeeded > state.parCharacters) {
            resultWarnings.push(`Par characters (${state.parCharacters}) is less than minimum needed (${result.minCharactersNeeded}) — par may be impossible`);
          }
        }
        setValidationResult({ ...result, warnings: resultWarnings });

        // Auto-suggest par values if not already set and solution found
        if (result.solvable && result.solutionFound) {
          setState(prev => ({
            ...prev,
            parCharacters: prev.parCharacters ?? result.minCharactersNeeded ?? undefined,
            parTurns: prev.parTurns ?? result.solutionFound?.turnsToWin ?? undefined,
          }));
        }
      } catch (err) {
        setValidationResult({
          solvable: false,
          minCharactersNeeded: null,
          solutionFound: null,
          totalCombinationsTested: 0,
          searchTimeMs: 0,
          error: err instanceof Error ? err.message : 'Unknown error during validation',
        });
      }
      setIsValidating(false);
    };

    // Start async validation
    runValidation();
  };

  const handleResize = (width: number, height: number) => {
    // Validate input - must be valid numbers within bounds
    const validWidth = Math.max(3, Math.min(20, isNaN(width) ? 3 : Math.floor(width)));
    const validHeight = Math.max(3, Math.min(20, isNaN(height) ? 3 : Math.floor(height)));

    // Push to history before resizing
    pushToHistory();

    setState(prev => {
      // Create new grid
      const newTiles = createEmptyGrid(validWidth, validHeight);

      // Keep content in top-left corner (no offset)
      const _offsetX = 0;
      const _offsetY = 0;

      // Copy existing tiles to new grid (from top-left)
      for (let y = 0; y < Math.min(prev.gridHeight, validHeight); y++) {
        for (let x = 0; x < Math.min(prev.gridWidth, validWidth); x++) {
          newTiles[y][x] = prev.tiles[y][x];
        }
      }

      // Keep enemy positions (only if they fit in new bounds)
      const newEnemies = prev.enemies
        .filter(enemy => enemy.x >= 0 && enemy.x < validWidth && enemy.y >= 0 && enemy.y < validHeight);

      // Keep collectible positions (only if they fit in new bounds)
      const newCollectibles = prev.collectibles
        .filter(collectible => collectible.x >= 0 && collectible.x < validWidth && collectible.y >= 0 && collectible.y < validHeight);

      // Keep object positions (only if they fit in new bounds)
      const newPlacedObjects = prev.placedObjects
        .filter(obj => obj.x >= 0 && obj.x < validWidth && obj.y >= 0 && obj.y < validHeight);

      return {
        ...prev,
        gridWidth: validWidth,
        gridHeight: validHeight,
        tiles: newTiles,
        enemies: newEnemies,
        collectibles: newCollectibles,
        placedObjects: newPlacedObjects,
      };
    });
  };

  // Playtest handlers
  const handlePlaytest = () => {
    // Build borderConfig from skin for compatibility with AnimatedGameBoard
    const skin = state.skinId ? loadPuzzleSkin(state.skinId) : null;
    const borderConfig: BorderConfig | undefined = skin ? {
      style: Object.keys(skin.borderSprites).length > 0 ? 'custom' : 'dungeon',
      customBorderSprites: Object.keys(skin.borderSprites).length > 0 ? skin.borderSprites : undefined,
    } : undefined;

    const puzzle: Puzzle = {
      id: state.puzzleId,
      date: new Date().toISOString().split('T')[0],
      name: state.puzzleName,
      width: state.gridWidth,
      height: state.gridHeight,
      tiles: state.tiles,
      enemies: state.enemies.map(e => ({ ...e })), // Deep copy
      collectibles: state.collectibles.map(c => ({ ...c })), // Deep copy
      placedObjects: state.placedObjects.map(o => ({ ...o })), // Deep copy
      availableCharacters: state.availableCharacters,
      winConditions: state.winConditions,
      maxCharacters: state.maxCharacters,
      maxPlaceableCharacters: state.maxPlaceableCharacters,
      maxTurns: state.maxTurns,
      lives: state.lives,
      borderConfig,
      skinId: state.skinId,
      backgroundMusicId: state.backgroundMusicId,
      sideQuests: state.sideQuests,
      hallways: state.hallways.length > 0 ? state.hallways : undefined,
      doors: state.doors.length > 0 ? state.doors : undefined,
      parCharacters: state.parCharacters,
      parTurns: state.parTurns,
    };

    // Store deep copy of original puzzle for reset; <Game/> renders against this.
    setOriginalPlaytestPuzzle(JSON.parse(JSON.stringify(puzzle)));
    setState(prev => ({ ...prev, mode: 'playtest' }));

    // Combat log scoped to a single playtest session.
    setCombatLog([]);
    setShowCombatLog(false);

    // Start background music for playtest (puzzle-specific or global fallback)
    playBackgroundMusic(state.backgroundMusicId);

    // Scroll to top when entering playtest
    window.scrollTo({ top: 0 });
  };
  handlePlaytestRef.current = handlePlaytest;

  const handleBackToEditor = () => {
    setState(prev => ({ ...prev, mode: 'edit' }));
    setOriginalPlaytestPuzzle(null);
    setShowCombatLog(false);
    stopMusic(); // Stop music when exiting playtest
  };

  // Phase 3 strip removed: handleTileClick, handlePlay, handlePause,
  // handleReset, handleWipe, handleShowSolution, handleAutoResetPlaytest,
  // handleRestartPlaytest, handleConcedePlaytest, handleProjectileKill,
  // handleStep, handleTestEnemies, handleTestCharacters, renderLivesHearts.
  // All belonged to the embedded playtest UI; <Game/> handles their
  // responsibilities now. Test-mode (enemies-only / heroes-only) is
  // intentionally not yet ported — see feature-backlog if missed.

  // Topmost placement on a tile, in draw order: entities over objects over
  // items. Shared by right-click delete and drag-to-move (Phase 3).
  const findPlacementAt = (x: number, y: number): { kind: RosterKind; index: number } | null => {
    const enemyIndex = state.enemies.findIndex(p => p.x === x && p.y === y);
    if (enemyIndex >= 0) return { kind: 'enemy', index: enemyIndex };
    const objectIndex = state.placedObjects.findIndex(p => p.x === x && p.y === y);
    if (objectIndex >= 0) return { kind: 'object', index: objectIndex };
    const collIndex = state.collectibles.findIndex(p => p.x === x && p.y === y);
    if (collIndex >= 0) return { kind: 'collectible', index: collIndex };
    return null;
  };

  // Right-click removes the placement under the cursor (Phase 3) — same
  // undoable path as the roster's ✕.
  const handleCanvasContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    clearLongPressTimer();
    longPressFiredRef.current = true; // the release must not paint/inspect
    setDragState(null);
    const tile = tileFromMouseEvent(e);
    if (!tile) return;
    const hit = findPlacementAt(tile.x, tile.y);
    if (!hit) return;
    vibrate('tilePaint');
    handleRemovePlacement(hit.kind, hit.index);
  };

  // Roster removal (Phase 2): snapshot first so the removal is undoable,
  // mirroring handleResize/handleClear.
  const handleRemovePlacement = (kind: RosterKind, index: number) => {
    setInspect(null); // indices shift on removal — never leave a stale popover
    pushToHistory();
    setState(prev => {
      if (kind === 'enemy') return { ...prev, enemies: prev.enemies.filter((_, i) => i !== index) };
      if (kind === 'object') return { ...prev, placedObjects: prev.placedObjects.filter((_, i) => i !== index) };
      return { ...prev, collectibles: prev.collectibles.filter((_, i) => i !== index) };
    });
  };

  // Palette handlers (Phase 1 decomposition — behavior unchanged)
  const handleSelectTool = (tool: ToolType) => {
    if (tool === 'custom') {
      setCustomTileTypes(getCustomTileTypes()); // Refresh list
    }
    setState(prev => ({ ...prev, selectedTool: tool }));
  };

  const handleSelectCustomTile = (tileTypeId: string) => {
    setSelectedCustomTileTypeId(tileTypeId);
    setState(prev => ({ ...prev, selectedTool: 'custom' }));
  };

  const handleToggleAvailableCharacter = (characterId: string, checked: boolean) => {
    setState(prev => {
      const newAvailable = checked
        ? [...prev.availableCharacters, characterId]
        : prev.availableCharacters.filter(id => id !== characterId);

      // Auto-increase maxCharacters if selecting more heroes (up to cap of 5)
      const newMaxCharacters = checked && newAvailable.length > prev.maxCharacters
        ? Math.min(newAvailable.length, 5)
        : prev.maxCharacters;

      return {
        ...prev,
        availableCharacters: newAvailable,
        maxCharacters: newMaxCharacters,
      };
    });
  };

  // Canvas size + scale calc for the editor's edit-mode canvas. Was inline
  // with the stripped renderLivesHearts block before — kept here because
  // the edit-mode canvas still needs these.
  const hasBorder = state.skinId !== undefined && state.skinId !== '';
  const gridWidth = state.gridWidth * TILE_SIZE;
  const gridHeight = state.gridHeight * TILE_SIZE;
  const canvasWidth = hasBorder ? gridWidth + (SIDE_BORDER_SIZE * 2) : gridWidth;
  const canvasHeight = hasBorder ? gridHeight + (BORDER_SIZE * 2) : gridHeight;

  // Constrain by MAX_DISPLAY_WIDTH_TILES, then by mobile container width
  const maxDisplayGridWidth = MAX_DISPLAY_WIDTH_TILES * TILE_SIZE;
  const maxDisplayCanvasWidth = hasBorder ? maxDisplayGridWidth + (SIDE_BORDER_SIZE * 2) : maxDisplayGridWidth;

  let targetWidth = canvasWidth;
  if (state.gridWidth > MAX_DISPLAY_WIDTH_TILES && targetWidth > maxDisplayCanvasWidth) {
    targetWidth = maxDisplayCanvasWidth;
  }
  if (editorMaxWidth && editorMaxWidth < targetWidth) {
    targetWidth = editorMaxWidth;
  }
  const editorScale = targetWidth / canvasWidth;
  const scaledCanvasWidth = targetWidth;
  const scaledCanvasHeight = canvasHeight * editorScale;
  // Corridor overhang joins the canvas + wrapper AFTER the scale math
  // above ignored it — the board renders the same size either way.
  const canvasOverhang = currentHallwayOverhang(hasBorder);
  const canvasElementWidth = canvasWidth + canvasOverhang.x * 2;
  const canvasElementHeight = canvasHeight + canvasOverhang.top + canvasOverhang.bottom;

  // Status-bar text: active tool + selected asset (Phase 2).
  const activeToolLabel = (() => {
    switch (state.selectedTool) {
      case 'void': return 'Tile — Void';
      case 'empty': return 'Tile — Empty';
      case 'wall': return 'Tile — Wall';
      case 'custom': {
        const t = selectedCustomTileTypeId ? customTileTypes.find(tt => tt.id === selectedCustomTileTypeId) : null;
        return t ? `Tile — ${t.name}` : 'Tile — pick a tile type';
      }
      case 'enemy': {
        const a = selectedEnemyId ? allEnemies.find(x => x.id === selectedEnemyId) : null;
        return a ? `Enemy — ${a.name}` : 'Enemy — pick one to place';
      }
      case 'ally': {
        const a = selectedAllyId ? allAllies.find(x => x.id === selectedAllyId) : null;
        return a ? `Ally — ${a.name}` : 'Ally — pick one to place';
      }
      case 'vessel': {
        const a = selectedVesselId ? allVessels.find(x => x.id === selectedVesselId) : null;
        return a ? `Vessel — ${a.name}` : 'Vessel — pick one to place';
      }
      case 'object': {
        const a = selectedObjectId ? allObjects.find(x => x.id === selectedObjectId) : null;
        return a ? `Object — ${a.name}` : 'Object — pick one to place';
      }
      case 'collectible': {
        const a = selectedCollectibleId ? allCollectibles.find(x => x.id === selectedCollectibleId) : null;
        return a ? `Item — ${a.name}` : 'Item — Default Coin';
      }
      case 'characters': return 'Heroes — choose the player roster';
      case 'hallway': return openingMode === 'hallway'
        ? 'Hallway — click a floor edge bordering the void'
        : openingMode === 'door'
        ? `Door (${doorStartState}) — click a top/bottom floor edge`
        : `Door + Hallway (${doorStartState}) — click a top/bottom floor edge`;
    }
  })();

  // Render playtest mode
  if (state.mode === 'playtest') {
    // Playtest mounts the player-facing <Game/> component with the in-progress
    // puzzle. Game owns the entire playtest UI; we just overlay editor-only
    // chrome (combat-log button + modal) on top. PlayerApp doesn't pass these
    // hooks so players never see them.
    if (!originalPlaytestPuzzle) return null;
    return (
      <>
        <Game
          // remount on puzzle id change so initial state re-seeds cleanly
          key={originalPlaytestPuzzle.id}
          puzzle={originalPlaytestPuzzle}
          onExitToEditor={handleBackToEditor}
          onTurnExecuted={handleTurnExecuted}
          onShowCombatLog={() => setShowCombatLog(true)}
        />

        {/* Combat-log modal. Click outside (the backdrop) or the X button to
            dismiss. The modal is full-screen overlay so it reads cleanly on
            both desktop and mobile. */}
        {showCombatLog && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
            onClick={() => setShowCombatLog(false)}
          >
            <div
              className="bg-stone-900 border-2 border-stone-600 rounded-pixel-lg max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-stone-700 flex-shrink-0">
                <h2 className="text-lg font-bold font-medieval text-copper-300 flex items-center gap-2">
                  <span>📜</span>
                  <span>Combat Log</span>
                  <span className="text-xs text-stone-400 font-normal">
                    ({combatLog.length} {combatLog.length === 1 ? 'entry' : 'entries'})
                  </span>
                </h2>
                <button
                  onClick={() => setShowCombatLog(false)}
                  className="p-1 text-stone-400 hover:text-parchment-100 hover:bg-stone-700 rounded transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 text-sm">
                {combatLog.length === 0 ? (
                  <div className="text-stone-500 italic text-center py-8">
                    No combat events yet — start playing to see turn-by-turn details.
                  </div>
                ) : (
                  combatLog.map((entry, i) => {
                    const prevEntry = i > 0 ? combatLog[i - 1] : null;
                    const showTurnHeader = !prevEntry || prevEntry.turn !== entry.turn;
                    const colorClass = logTypeStyles[entry.type] ?? 'text-stone-300';
                    return (
                      <React.Fragment key={i}>
                        {showTurnHeader && (
                          <div className="text-xs font-bold text-copper-400 uppercase tracking-wider mt-2 mb-1 pb-0.5 border-b border-stone-700">
                            Turn {entry.turn}
                          </div>
                        )}
                        <div className="flex items-start gap-2 px-2 py-0.5 rounded">
                          <span className="flex-shrink-0">{entry.icon}</span>
                          <span className={`${colorClass} flex-1 break-words`}>
                            {entry.text}
                          </span>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
              </div>

              <div className="px-4 py-2 border-t border-stone-700 flex-shrink-0 flex justify-between items-center text-xs text-stone-500">
                <span>Combat log is editor-only (not visible to players).</span>
                <button
                  onClick={() => setCombatLog([])}
                  disabled={combatLog.length === 0}
                  className="text-stone-400 hover:text-parchment-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Render edit mode
  return (
    <div className="min-h-screen theme-root text-parchment-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Auto-save recovery banner */}
        {recoveryData && (
          <div className="mb-4 bg-amber-900/90 border border-amber-500 rounded-lg px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-amber-100 font-medium text-sm">
                Unsaved work found: &quot;{recoveryData.puzzleName}&quot;
              </p>
              <p className="text-amber-300/80 text-xs mt-0.5">
                Auto-saved {new Date(recoveryData.savedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={handleRecoverAutoSave}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded font-medium"
              >
                Restore
              </button>
              <button
                onClick={handleDismissRecovery}
                className="px-3 py-1.5 bg-stone-700 hover:bg-stone-600 text-stone-300 text-sm rounded"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Toolbar — title, primary verbs, overflow, grid size, undo/redo */}
        <EditorToolbar
          puzzleName={state.puzzleName}
          puzzleId={state.puzzleId}
          savedPuzzleCount={savedPuzzles.length}
          isValidating={isValidating}
          gridWidth={state.gridWidth}
          gridHeight={state.gridHeight}
          widthInput={widthInput}
          heightInput={heightInput}
          setWidthInput={setWidthInput}
          setHeightInput={setHeightInput}
          onResize={handleResize}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onShowShortcuts={() => setShowShortcuts(true)}
          onPlaytest={handlePlaytest}
          onSave={handleSave}
          onSaveAs={handleSaveAs}
          onNewPuzzle={handleNewPuzzle}
          onOpenLibrary={() => setShowLibrary(true)}
          onExport={handleExport}
          onImport={handleImport}
          onClear={handleClear}
          onValidate={handleValidate}
          onOpenGenerator={() => setShowGenerator(true)}
          onOpenVersionHistory={() => setShowVersionHistory(true)}
          publishStatus={publishStatus}
          setPublishStatus={setPublishStatus}
          reviewNotes={reviewNotes}
          setReviewNotes={setReviewNotes}
          showReviewNotes={showReviewNotes}
          setShowReviewNotes={setShowReviewNotes}
          getCurrentPuzzle={getCurrentPuzzle}
          setPublishDeps={setPublishDeps}
          setShowPublishModal={setShowPublishModal}
        />

        <div className="flex flex-col lg:flex-row gap-4 md:gap-6">
          {/* Left Column - Canvas, Selected Characters */}
          <div ref={editorContainerRef} className="flex-shrink-0 space-y-4 w-full lg:w-auto">
            <div
              style={{
                // The editor, unlike the game board, RESERVES layout space
                // for the corridor overhang (2026-07-18): the game's
                // negative-margin bleed "sells the illusion" on the play
                // page, but in the workspace it ran corridors under the
                // sidebar and the heroes strip. The scale math still
                // ignores the overhang, so the puzzle renders the same
                // size with or without hallways — the page just makes room.
                width: scaledCanvasWidth + canvasOverhang.x * 2 * editorScale,
                height: scaledCanvasHeight + (canvasOverhang.top + canvasOverhang.bottom) * editorScale,
              }}
            >
              <canvas
                ref={canvasRef}
                width={canvasElementWidth}
                height={canvasElementHeight}
                className="border-2 border-stone-600 cursor-crosshair rounded"
                style={{
                  transform: `scale(${editorScale})`,
                  transformOrigin: 'top left',
                  cursor: dragState?.moved ? 'grabbing' : undefined,
                  touchAction: 'none'
                }}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerLeave={handleCanvasPointerLeave}
                onPointerCancel={handleCanvasPointerCancel}
                onContextMenu={handleCanvasContextMenu}
              />
            </div>

            {/* Selected Heroes - Shows selected available heroes with sprites */}
            <div className="bg-stone-800 p-4 rounded" style={{ maxWidth: scaledCanvasWidth }}>
              <h2 className="text-lg font-bold mb-3">Selected Heroes</h2>
              {state.availableCharacters.length === 0 ? (
                <p className="text-sm text-stone-400">No characters selected</p>
              ) : (
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(state.maxCharacters, 5)}, 1fr)`
                  }}
                >
                  {Array.from({ length: state.maxCharacters }).map((_, index) => {
                    const charId = state.availableCharacters.filter(id => getCharacter(id) != null)[index];
                    const char = charId ? getCharacter(charId) : null;
                    const spells = char ? getAllSpells(char.behavior) : [];

                    return (
                      <ActionTooltip key={index} actions={char?.behavior}>
                        <div
                          className={`rounded flex flex-col items-center justify-center p-2 ${
                            char ? 'bg-stone-700' : 'bg-stone-800 border border-dashed border-stone-600'
                          }`}
                          title={char?.name || 'Empty slot'}
                        >
                          {char ? (
                            <>
                              <SpriteThumbnail sprite={char.customSprite} size={48} previewType="entity" />
                              <span className="text-sm font-medium text-parchment-200 truncate w-full text-center mt-1">
                                {char.name.length > 8 ? char.name.slice(0, 8) + '...' : char.name}
                              </span>
                              {spells.length > 0 && (
                                <div className="mt-1 flex gap-1 justify-center">
                                  {spells.map(spell => (
                                    <SpellTooltip key={spell.id} spell={spell}>
                                      <div className="w-6 h-6 rounded overflow-hidden cursor-help">
                                        {spell.thumbnailIcon ? (
                                          <img src={spell.thumbnailIcon} alt={spell.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                                        ) : (
                                          <div className="w-full h-full bg-arcane-600 flex items-center justify-center text-xs">S</div>
                                        )}
                                      </div>
                                    </SpellTooltip>
                                  ))}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="h-16 flex items-center justify-center">
                              <span className="text-stone-600 text-xs">Empty</span>
                            </div>
                          )}
                        </div>
                      </ActionTooltip>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Placed-entity roster — lives with the board it describes */}
            <div style={{ maxWidth: scaledCanvasWidth }}>
              <PlacedRoster
                enemies={state.enemies}
                placedObjects={state.placedObjects}
                collectibles={state.collectibles}
                allyIds={allyIds}
                vesselIds={vesselIds}
                onHoverTile={setHighlightTile}
                onRemove={handleRemovePlacement}
              />
            </div>
          </div>

          {/* Right Side — single tabbed sidebar (Phase 2). Build = the
              always-on workbench; Rules and Details hold the once-per-puzzle
              configuration that used to crowd the page. */}
          <div className="flex-1 min-w-0">
            {/* Tab strip */}
            <div className="flex gap-1 bg-stone-800 p-1 rounded mb-3">
              {SIDEBAR_TABS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSidebarTab(key)}
                  className={`flex-1 py-2 text-sm rounded font-medium transition-colors ${
                    sidebarTab === key
                      ? 'bg-stone-600 text-parchment-100'
                      : 'text-stone-400 hover:text-parchment-200 hover:bg-stone-700/50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {sidebarTab === 'build' && <div className="space-y-3">
              <ToolsRow selectedTool={state.selectedTool} onSelectTool={handleSelectTool} />

              {/* Status bar: active tool + cursor tile */}
              <div className="flex items-center justify-between bg-stone-800 rounded px-3 py-1.5 text-xs text-stone-400">
                <span className="truncate">{activeToolLabel}</span>
                <span className="flex-shrink-0 tabular-nums">
                  {dragState?.pixelMode && dragState.moved
                    ? `(${dragState.toX + 1}, ${dragState.toY + 1}) ${(dragState.artOffsetX ?? 0) >= 0 ? '+' : ''}${dragState.artOffsetX ?? 0}, ${(dragState.artOffsetY ?? 0) >= 0 ? '+' : ''}${dragState.artOffsetY ?? 0}px`
                    : cursorTile ? `(${cursorTile.x + 1}, ${cursorTile.y + 1})` : '—'}
                </span>
              </div>
              {/* Tile Selector - Shows when Tile tool is selected */}
              {(state.selectedTool === 'custom' || state.selectedTool === 'void' || state.selectedTool === 'empty' || state.selectedTool === 'wall') && (
                <TilePalette
                  selectedTool={state.selectedTool}
                  skinId={state.skinId}
                  customTileTypes={customTileTypes}
                  filteredTileTypes={searchFilteredTileTypes}
                  tileFolderId={tileFolderId}
                  onTileFolderSelect={setTileFolderId}
                  searchTerm={toolSearchTerm}
                  onSearchChange={setToolSearchTerm}
                  selectedCustomTileTypeId={selectedCustomTileTypeId}
                  selectedTriggerGroupId={selectedTriggerGroupId}
                  onSelectTool={handleSelectTool}
                  onSelectCustomTile={handleSelectCustomTile}
                  onTriggerGroupChange={setSelectedTriggerGroupId}
                />
              )}

              {/* Enemy Type Selector - List style with sprites */}
              {state.selectedTool === 'enemy' && (
                <EnemyPalette
                  enemies={searchFilteredEnemies}
                  totalEnemyCount={allEnemies.length}
                  enemyFolderId={enemyFolderId}
                  onFolderSelect={setEnemyFolderId}
                  searchTerm={toolSearchTerm}
                  onSearchChange={setToolSearchTerm}
                  selectedEnemyId={selectedEnemyId}
                  onSelect={setSelectedEnemyId}
                />
              )}

              {/* Ally Selector — first-class tool (2026-07-14) */}
              {state.selectedTool === 'ally' && (
                <AllyPalette
                  allies={searchFilteredAllies}
                  totalAllyCount={allAllies.length}
                  allyFolderId={allyFolderId}
                  onFolderSelect={setAllyFolderId}
                  searchTerm={toolSearchTerm}
                  onSearchChange={setToolSearchTerm}
                  selectedAllyId={selectedAllyId}
                  onSelect={setSelectedAllyId}
                />
              )}

              {/* Vessel Selector — first-class tool (2026-07-14) */}
              {state.selectedTool === 'vessel' && (
                <VesselPalette
                  vessels={searchFilteredVessels}
                  totalVesselCount={allVessels.length}
                  searchTerm={toolSearchTerm}
                  onSearchChange={setToolSearchTerm}
                  selectedVesselId={selectedVesselId}
                  onSelect={setSelectedVesselId}
                />
              )}

              {/* Object Type Selector - List style with sprites and tooltips */}
              {state.selectedTool === 'object' && (
                <ObjectPalette
                  objects={searchFilteredObjects}
                  totalObjectCount={allObjects.length}
                  objectFolderId={objectFolderId}
                  onFolderSelect={setObjectFolderId}
                  searchTerm={toolSearchTerm}
                  onSearchChange={setToolSearchTerm}
                  selectedObjectId={selectedObjectId}
                  onSelect={setSelectedObjectId}
                />
              )}

              {/* Collectible Type Selector - List style with sprites */}
              {state.selectedTool === 'collectible' && (
                <CollectiblePalette
                  collectibles={searchFilteredCollectibles}
                  totalCollectibleCount={allCollectibles.length}
                  collectibleFolderId={collectibleFolderId}
                  onFolderSelect={setCollectibleFolderId}
                  searchTerm={toolSearchTerm}
                  onSearchChange={setToolSearchTerm}
                  selectedCollectibleId={selectedCollectibleId}
                  onSelect={setSelectedCollectibleId}
                />
              )}

              {/* Available Heroes - Shows when Heroes tool is selected */}
              {state.selectedTool === 'characters' && (
                <HeroesPalette
                  characters={searchFilteredCharacters}
                  totalCharacterCount={allCharacters.length}
                  characterFolderId={characterFolderId}
                  onFolderSelect={setCharacterFolderId}
                  searchTerm={toolSearchTerm}
                  onSearchChange={setToolSearchTerm}
                  availableCharacters={state.availableCharacters}
                  onToggleCharacter={handleToggleAvailableCharacter}
                />
              )}

              {/* Hallway/door tool — mode picker instead of an asset list */}
              {state.selectedTool === 'hallway' && (
                <div className="bg-stone-800 p-3 rounded text-xs text-stone-400 space-y-2">
                  <div className="text-sm font-medium text-parchment-200">Wall Openings</div>
                  <div className="flex gap-1">
                    {(['hallway', 'door', 'both'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setOpeningMode(mode)}
                        className={`flex-1 px-2 py-1.5 rounded capitalize ${
                          openingMode === mode ? 'bg-blue-600 text-white' : 'bg-stone-700 hover:bg-stone-600'
                        }`}
                      >
                        {mode === 'both' ? 'Door + Hallway' : mode}
                      </button>
                    ))}
                  </div>
                  {openingMode !== 'hallway' && (
                    <div>
                      <label className="block text-stone-300 mb-1">Door starts the puzzle…</label>
                      <select
                        value={doorStartState}
                        onChange={(e) => setDoorStartState(e.target.value as DoorStartState)}
                        className="w-full px-2 py-1.5 bg-stone-700 rounded text-parchment-100"
                      >
                        <option value="closed">Closed (stays closed)</option>
                        <option value="open">Open (stays open)</option>
                        <option value="opening">Closed, then opens</option>
                        <option value="closing">Open, then closes</option>
                      </select>
                      <p className="text-stone-500 mt-1">
                        Applies to doors you place next. Open/close plays once when the puzzle
                        appears. Doors fit top/bottom walls only.
                      </p>
                    </div>
                  )}
                  {openingMode !== 'door' && (
                    <label className="flex items-center gap-2 cursor-pointer text-stone-300">
                      <input
                        type="checkbox"
                        checked={hallwayOpenLedge}
                        onChange={(e) => setHallwayOpenLedge(e.target.checked)}
                        className="rounded"
                      />
                      <span>Open ledge — pushes can throw entities out here</span>
                    </label>
                  )}
                  <p>
                    Click near the <span className="text-copper-400">edge</span> of a floor tile
                    that borders the void or the outside. Click the same edge again to remove.
                    Openings also serve walk-in entrances, Noble escapes, departures — and,
                    when marked an open ledge, shove-out ejections.
                  </p>
                  <p className="text-stone-500">
                    Door sprites come from the puzzle's skin (Door Closed / Opening / Open
                    slots in the skin editor); a plank-door placeholder shows until then.
                  </p>
                </div>
              )}
            </div>}

            {sidebarTab === 'rules' && (
              <div className="max-w-xl">
                <RulesPanel state={state} setState={setState} />
              </div>
            )}

            {sidebarTab === 'details' && (
              <div className="max-w-xl">
              <DetailsPanel
                state={state}
                setState={setState}
                availableSkins={availableSkins}
                availableSounds={availableSounds}
                onRefreshSkins={() => setAvailableSkins(getAllPuzzleSkins())}
                onRefreshSounds={() => setAvailableSounds(getSoundAssets())}
                knownTags={collectAllTags(savedPuzzles)}
                getCurrentPuzzle={getCurrentPuzzle}
              />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Entity inspect popover (Phase 3) */}
      {inspect && state.enemies[inspect.index] && (
        <InspectPopover
          enemy={state.enemies[inspect.index]}
          kindLabel={
            allyIds.has(state.enemies[inspect.index].enemyId) ? 'Ally'
            : vesselIds.has(state.enemies[inspect.index].enemyId) ? 'Vessel'
            : 'Enemy'
          }
          position={{ x: inspect.screenX, y: inspect.screenY }}
          entranceOptions={[
            ...state.doors
              .filter(d => isValidDoor(d, state.tiles, state.gridWidth, state.gridHeight))
              .map(d => ({ kind: 'door' as const, x: d.x, y: d.y, side: d.side })),
            ...state.hallways
              .filter(h => isValidHallway(h, state.tiles, state.gridWidth, state.gridHeight))
              .map(h => ({ kind: 'hallway' as const, x: h.x, y: h.y, side: h.side })),
          ]}
          onSetEntrance={(ref) => {
            const index = inspect.index;
            pushToHistory();
            setState(prev => {
              const next = [...prev.enemies];
              next[index] = { ...next[index], entersFrom: ref };
              return { ...prev, enemies: next };
            });
          }}
          onSetRecurrence={(rec) => {
            const index = inspect.index;
            pushToHistory();
            setState(prev => {
              const next = [...prev.enemies];
              next[index] = { ...next[index], recurrence: rec };
              return { ...prev, enemies: next };
            });
          }}
          onRemove={() => handleRemovePlacement('enemy', inspect.index)}
          onClose={() => setInspect(null)}
        />
      )}

      {/* Object inspect popover (2026-07-17): offset sliders */}
      {objectInspect && state.placedObjects[objectInspect.index] && (
        <ObjectInspectPopover
          obj={state.placedObjects[objectInspect.index]}
          position={{ x: objectInspect.screenX, y: objectInspect.screenY }}
          onSetOffsets={(offsetX, offsetY) => {
            const index = objectInspect.index;
            // One undo entry per popover session: slider drags fire onChange
            // per notch, but only the first change snapshots history.
            if (!objectInspectHistoryPushedRef.current) {
              objectInspectHistoryPushedRef.current = true;
              pushToHistory();
            }
            setState(prev => {
              const next = [...prev.placedObjects];
              next[index] = {
                ...next[index],
                // 0 stores as undefined — matches the drag's convention.
                offsetX: offsetX || undefined,
                offsetY: offsetY || undefined,
              };
              return { ...prev, placedObjects: next };
            });
          }}
          onSetSchedule={(schedule) => {
            const index = objectInspect.index;
            // Same one-undo-per-popover-session rule as the offsets.
            if (!objectInspectHistoryPushedRef.current) {
              objectInspectHistoryPushedRef.current = true;
              pushToHistory();
            }
            setState(prev => {
              const next = [...prev.placedObjects];
              next[index] = {
                ...next[index],
                spawnTurn: schedule.spawnTurn,
                despawnTurn: schedule.despawnTurn,
                repeatEvery: schedule.repeatEvery,
              };
              return { ...prev, placedObjects: next };
            });
          }}
          onRemove={() => {
            handleRemovePlacement('object', objectInspect.index);
            setObjectInspect(null);
          }}
          onClose={() => setObjectInspect(null)}
        />
      )}

      {/* Puzzle Library Modal */}
      <PuzzleLibraryModal
        isOpen={showLibrary}
        onClose={() => setShowLibrary(false)}
        puzzles={savedPuzzles}
        onLoad={handleLoadFromLibrary}
        onDelete={handleDeleteFromLibrary}
        onPuzzlesChanged={() => setSavedPuzzles(getSavedPuzzles())}
        currentPuzzleId={state.puzzleId}
      />

      {/* Publish Dependency Modal */}
      <PublishDependencyModal
        isOpen={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        puzzleName={state.puzzleName}
        dependencies={publishDeps}
        onPublish={async () => {
          const puzzle = getCurrentPuzzle();
          // Publish all unpublished dependencies first
          const unpublished = publishDeps.filter(d => !d.isPublished && !d.isMissing);
          for (const dep of unpublished) {
            await publishAsset(dep.assetId);
          }
          // Publish the puzzle itself
          const success = await publishPuzzle(puzzle.id);
          if (success) {
            setPublishStatus('published');
            toast.success(`Published "${state.puzzleName}" with ${unpublished.length} asset${unpublished.length !== 1 ? 's' : ''}`);
          } else {
            toast.error('Failed to publish puzzle');
          }
          setShowPublishModal(false);
        }}
        onRemoveMissing={async (missingDeps) => {
          const missingIds = new Set(missingDeps.map(d => d.assetId));
          const missingByType = new Map<string, Set<string>>();
          for (const dep of missingDeps) {
            if (!missingByType.has(dep.type)) missingByType.set(dep.type, new Set());
            missingByType.get(dep.type)!.add(dep.assetId);
          }

          setState(prev => {
            const next = { ...prev };
            // Remove missing enemies
            if (missingByType.has('enemy')) {
              const badIds = missingByType.get('enemy')!;
              next.enemies = prev.enemies.filter(e => !badIds.has(e.enemyId));
            }
            // Remove missing characters
            if (missingByType.has('character')) {
              const badIds = missingByType.get('character')!;
              next.availableCharacters = prev.availableCharacters.filter(id => !badIds.has(id));
            }
            // Remove missing collectibles
            if (missingByType.has('collectible')) {
              const badIds = missingByType.get('collectible')!;
              next.collectibles = prev.collectibles.filter(c => !c.collectibleId || !badIds.has(c.collectibleId));
            }
            // Remove missing objects
            if (missingByType.has('object')) {
              const badIds = missingByType.get('object')!;
              next.placedObjects = prev.placedObjects.filter(o => !badIds.has(o.objectId));
            }
            // Clear missing skin
            if (missingByType.has('skin') && prev.skinId && missingIds.has(prev.skinId)) {
              next.skinId = '';
            }
            // Clear missing background music
            if (missingByType.has('sound') && prev.backgroundMusicId && missingIds.has(prev.backgroundMusicId)) {
              next.backgroundMusicId = '';
            }
            // Clear missing custom tile types from grid
            if (missingByType.has('tile_type')) {
              const badIds = missingByType.get('tile_type')!;
              next.tiles = prev.tiles.map(row =>
                row.map(tile => {
                  if (!tile || typeof tile !== 'object') return tile;
                  const tileTypeId = tile.customType || tile.customTileTypeId;
                  if (tileTypeId && badIds.has(tileTypeId)) {
                    return { ...tile, customType: undefined, customTileTypeId: undefined };
                  }
                  return tile;
                })
              );
            }
            return next;
          });

          toast.success(`Removed ${missingDeps.length} missing reference${missingDeps.length !== 1 ? 's' : ''} from puzzle`);

          // Re-check dependencies after removal
          setTimeout(async () => {
            try {
              const puzzle = getCurrentPuzzle();
              const deps = await getPuzzleDependencies(puzzle);
              setPublishDeps(deps);
            } catch (err) {
              console.error('Failed to re-check deps:', err);
            }
          }, 100);
        }}
      />

      {/* Version History Modal */}
      <VersionHistoryModal
        isOpen={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
        assetId={state.puzzleId}
        assetType="puzzle"
        assetName={state.puzzleName || 'Untitled'}
        currentData={getCurrentPuzzle() as unknown as object}
        onRestore={(data) => {
          const puzzle = data as unknown as Puzzle;
          setState(prev => ({
            ...prev,
            gridWidth: puzzle.width,
            gridHeight: puzzle.height,
            tiles: puzzle.tiles,
            enemies: puzzle.enemies,
            collectibles: puzzle.collectibles,
            placedObjects: puzzle.placedObjects || [],
            puzzleName: puzzle.name,
            maxCharacters: puzzle.maxCharacters,
            maxPlaceableCharacters: puzzle.maxPlaceableCharacters,
            maxTurns: puzzle.maxTurns,
            lives: puzzle.lives ?? 3,
            availableCharacters: puzzle.availableCharacters.filter(id => getCharacter(id) != null),
            winConditions: puzzle.winConditions,
            skinId: puzzle.skinId || 'builtin_dungeon',
            backgroundMusicId: puzzle.backgroundMusicId,
            parCharacters: puzzle.parCharacters,
            parTurns: puzzle.parTurns,
            sideQuests: puzzle.sideQuests || [],
            hallways: puzzle.hallways || [],
            doors: puzzle.doors || [],
            tags: puzzle.tags || [],
            description: puzzle.description || '',
            isTraining: puzzle.isTraining ?? false,
          }));
          logActivity({
            action: 'update',
            asset_type: 'puzzle',
            asset_id: state.puzzleId,
            asset_name: state.puzzleName,
            details: { restored_from_version: true },
          });
        }}
      />

      {/* Validation Results Modal */}
      <ValidationModal
        isOpen={showValidationModal}
        isValidating={isValidating}
        validationResult={validationResult}
        gridWidth={state.gridWidth}
        gridHeight={state.gridHeight}
        tiles={state.tiles}
        enemies={state.enemies}
        onClose={() => setShowValidationModal(false)}
      />

      {/* Warning Modal */}
      <WarningModal
        isOpen={warningModal.isOpen}
        onClose={() => setWarningModal({ isOpen: false, message: '' })}
        title="Hold On!"
        message={warningModal.message}
      />

      {/* Generator Dialog */}
      <GeneratorDialog
        isOpen={showGenerator}
        onClose={() => setShowGenerator(false)}
        onGenerate={handleGeneratedPuzzle}
        availableCharacters={allCharacters}
        availableEnemies={allEnemies}
        customTileTypes={customTileTypes}
        availableCollectibles={allCollectibles}
      />

      {/* Bug Report Modal: mounted by <Game/> during playtest now (Phase 3
          unified the playtest mount). MapEditor itself no longer renders it. */}

      {/* Keyboard Shortcuts Reference */}
      {showShortcuts && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="bg-stone-800 border border-stone-600 rounded-lg shadow-xl max-w-md w-full p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-parchment-100">Keyboard Shortcuts</h2>
              <button
                onClick={() => setShowShortcuts(false)}
                className="text-stone-400 hover:text-white text-xl leading-none w-8 h-8 flex items-center justify-center"
              >
                {'\u00D7'}
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <h3 className="text-stone-400 font-medium mb-1.5 text-xs uppercase tracking-wider">Tools</h3>
                <div className="space-y-1">
                  {[
                    ['1', 'Tile tool'],
                    ['2', 'Enemy tool'],
                    ['3', 'Ally tool'],
                    ['4', 'Vessel tool'],
                    ['5', 'Object tool'],
                    ['6', 'Item tool'],
                    ['7', 'Heroes tool'],
                  ].map(([key, label]) => (
                    <div key={key} className="flex items-center gap-3">
                      <kbd className="bg-stone-700 border border-stone-600 rounded px-2 py-0.5 text-xs font-mono min-w-[28px] text-center">{key}</kbd>
                      <span className="text-parchment-200">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-stone-400 font-medium mb-1.5 text-xs uppercase tracking-wider">Actions</h3>
                <div className="space-y-1">
                  {[
                    ['Ctrl+S', 'Save puzzle'],
                    ['Ctrl+Z', 'Undo'],
                    ['Ctrl+Y', 'Redo'],
                    ['Space', 'Playtest'],
                  ].map(([key, label]) => (
                    <div key={key} className="flex items-center gap-3">
                      <kbd className="bg-stone-700 border border-stone-600 rounded px-2 py-0.5 text-xs font-mono min-w-[28px] text-center">{key}</kbd>
                      <span className="text-parchment-200">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-stone-400 font-medium mb-1.5 text-xs uppercase tracking-wider">Other</h3>
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <kbd className="bg-stone-700 border border-stone-600 rounded px-2 py-0.5 text-xs font-mono min-w-[28px] text-center">?</kbd>
                    <span className="text-parchment-200">Show this reference</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <kbd className="bg-stone-700 border border-stone-600 rounded px-2 py-0.5 text-xs font-mono min-w-[28px] text-center">Esc</kbd>
                    <span className="text-parchment-200">Close dialogs</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

