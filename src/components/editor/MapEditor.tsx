import React, { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from '../shared/Toast';
import { useSearchParams } from 'react-router-dom';
import type { Puzzle, TileOrNull, PlacedEnemy, PlacedCollectible, PlacedObject, WinConditionType, BorderConfig, SideQuestType, GameState } from '../../types/game';
import { TileType, Direction } from '../../types/game';
import { getAllCharacters, getCharacter } from '../../data/characters';
import { getAllEnemies, getEnemy } from '../../data/enemies';
import { playBackgroundMusic, stopMusic } from '../../utils/gameSounds';
import { savePuzzle, getSavedPuzzles, deletePuzzle, loadPuzzle, type SavedPuzzle } from '../../utils/puzzleStorage';
import { cacheEditorState, getCachedEditorState, clearCachedEditorState } from '../../utils/editorState';
import { writeAutoSave, readAutoSave, clearAutoSave, AUTOSAVE_INTERVAL_MS, type AutoSaveData } from '../../utils/autoSave';
import { getAllPuzzleSkins, loadPuzzleSkin, getCustomTileTypes, loadTileType, getAllObjects, loadObject, getAllCollectibles, getSoundAssets, getCustomVessels, vesselToEnemyAsset, getCustomAllies, allyToEnemyAsset } from '../../utils/assetStorage';
import { TILE_SIZE, BORDER_SIZE, SIDE_BORDER_SIZE, MAX_DISPLAY_WIDTH_TILES, createEmptyGrid, drawDungeonBorder, drawTile, drawEnemy, drawCollectibleInEditor, drawObject } from './map/canvasDraw';
import { getAllSpells, SpellTooltip, ActionTooltip } from './map/Tooltips';
import { createDefaultEditorState, type EditorState, type ToolType, type EditorMode } from './map/editorState';
import { ValidationModal } from './map/ValidationModal';
import { ActionsPanel } from './map/ActionsPanel';
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
import { TagInput, collectAllTags } from '../shared/TagInput';
import { suggestTags } from '../../utils/puzzleTagSuggestions';
import { getPuzzleDependencies, type AssetDependency } from '../../utils/publishDependencies';
import { publishPuzzle, publishAsset } from '../../services/supabaseService';
import { PublishDependencyModal } from './PublishDependencyModal';
import { VersionHistoryModal } from './VersionHistoryModal';
import { logActivity } from '../../services/activityLogService';
import { createHistoryManager } from '../../utils/historyManager';
import { subscribeToImageLoads } from '../../utils/imageLoader';
import { subscribeToSpriteImageLoads } from './SpriteEditor';
import { useFilteredAssets } from './FolderDropdown';
import { PuzzleLibraryModal } from './PuzzleLibraryModal';
import { solvePuzzleAsync, quickValidate, type SolverResult } from '../../engine/puzzleSolver';
import { WarningModal } from '../shared/WarningModal';
import GeneratorDialog from './GeneratorDialog';
import { vibrate } from '../../utils/haptics';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { Game } from '../game/Game';
import { diffTurn, logTypeStyles, type CombatLogEntry } from '../../engine/combatLog';

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

  // Editor panel toggle state (toolbar collapse/expand).
  const [toolsPanelOpen, setToolsPanelOpen] = useState(true);
  const [actionsPanelOpen, setActionsPanelOpen] = useState(true);
  const [puzzleInfoPanelOpen, setPuzzleInfoPanelOpen] = useState(true);
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


  // Draw grid
  useEffect(() => {
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

    // Draw objects below entities (sorted by y position for proper layering)
    const belowObjects = state.placedObjects.filter(obj => {
      const objData = loadObject(obj.objectId);
      return !objData?.renderLayer || objData.renderLayer === 'below_entities';
    }).sort((a, b) => a.y - b.y);

    belowObjects.forEach((obj) => {
      drawObject(ctx, obj.x, obj.y, obj.objectId);
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
      drawObject(ctx, obj.x, obj.y, obj.objectId);
    });

    ctx.restore();
  }, [state.tiles, state.enemies, state.collectibles, state.placedObjects, state.gridWidth, state.gridHeight, state.mode, state.skinId, redrawCounter]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Save snapshot of state before drawing starts
    saveSnapshotBeforeDraw();
    setState(prev => ({ ...prev, isDrawing: true }));
    handleCanvasClick(e);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!state.isDrawing) return;
    handleCanvasClick(e);
  };

  const handleCanvasMouseUp = () => {
    setState(prev => ({ ...prev, isDrawing: false }));
    // Push the new state to history after drawing completes
    // Use setTimeout to ensure state has updated before comparing
    setTimeout(() => {
      pushToHistoryAfterDraw();
    }, 0);
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
    // Account for scale when converting click coordinates
    const clickX = (e.clientX - rect.left) / currentScale - offsetX;
    const clickY = (e.clientY - rect.top) / currentScale - offsetY;
    const x = Math.floor(clickX / TILE_SIZE);
    const y = Math.floor(clickY / TILE_SIZE);

    if (x < 0 || x >= state.gridWidth || y < 0 || y >= state.gridHeight) return;

    paintTile(x, y);
  };

  const paintTile = (x: number, y: number) => {
    vibrate('tilePaint');
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

        {/* Header - Mobile: centered stack, Desktop: horizontal row */}
        {/* Mobile header */}
        <div className="md:hidden mb-4 flex flex-col items-center gap-2">
          <h1 className="text-xl font-bold font-medieval text-copper-400 truncate max-w-[300px] text-center" title={state.puzzleName || 'Map Editor'}>
            {state.puzzleName || 'Map Editor'}
          </h1>
          <div className="flex items-center gap-2">
            {/* Grid Size */}
            <div className="flex items-center gap-2 bg-stone-800 px-3 py-1.5 rounded">
              <span className="text-xs font-medium text-parchment-300">Grid:</span>
              <div className="flex items-center gap-1">
                <label className="text-xs text-stone-400">W</label>
                <div className="flex items-center">
                  <button
                    onClick={() => handleResize(state.gridWidth - 1, state.gridHeight)}
                    disabled={state.gridWidth <= 3}
                    className="w-6 h-7 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-l text-sm font-bold"
                  >−</button>
                  <input type="text" inputMode="numeric" pattern="[0-9]*" value={widthInput}
                    onChange={(e) => setWidthInput(e.target.value)}
                    onBlur={() => { const val = parseInt(widthInput, 10); if (!isNaN(val) && val >= 3 && val <= 20) handleResize(val, state.gridHeight); else setWidthInput(String(state.gridWidth)); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="w-8 h-7 px-1 bg-stone-700 text-sm text-center border-x border-stone-600"
                  />
                  <button
                    onClick={() => handleResize(state.gridWidth + 1, state.gridHeight)}
                    disabled={state.gridWidth >= 20}
                    className="w-6 h-7 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-r text-sm font-bold"
                  >+</button>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <label className="text-xs text-stone-400">H</label>
                <div className="flex items-center">
                  <button
                    onClick={() => handleResize(state.gridWidth, state.gridHeight - 1)}
                    disabled={state.gridHeight <= 3}
                    className="w-6 h-7 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-l text-sm font-bold"
                  >−</button>
                  <input type="text" inputMode="numeric" pattern="[0-9]*" value={heightInput}
                    onChange={(e) => setHeightInput(e.target.value)}
                    onBlur={() => { const val = parseInt(heightInput, 10); if (!isNaN(val) && val >= 3 && val <= 20) handleResize(state.gridWidth, val); else setHeightInput(String(state.gridHeight)); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="w-8 h-7 px-1 bg-stone-700 text-sm text-center border-x border-stone-600"
                  />
                  <button
                    onClick={() => handleResize(state.gridWidth, state.gridHeight + 1)}
                    disabled={state.gridHeight >= 20}
                    className="w-6 h-7 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-r text-sm font-bold"
                  >+</button>
                </div>
              </div>
            </div>
            {/* Undo/Redo */}
            <div className="flex items-center gap-1 bg-stone-800 px-2 py-1 rounded">
              <button onClick={handleUndo} disabled={!canUndo}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${canUndo ? 'bg-stone-700 hover:bg-stone-600 text-parchment-100' : 'bg-stone-800 text-stone-500 cursor-not-allowed'}`}
                title="Undo">↩</button>
              <button onClick={handleRedo} disabled={!canRedo}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${canRedo ? 'bg-stone-700 hover:bg-stone-600 text-parchment-100' : 'bg-stone-800 text-stone-500 cursor-not-allowed'}`}
                title="Redo">↪</button>
            </div>
          </div>
          <button
            onClick={handlePlaytest}
            className="w-full max-w-xs px-4 py-2.5 bg-arcane-600 rounded hover:bg-arcane-700 font-bold text-sm"
          >
            ▶ Playtest
          </button>
        </div>

        {/* Desktop header (unchanged) */}
        <div className="hidden md:flex mb-6 items-center gap-4">
          <div className="flex items-center justify-start gap-4">
            <h1 className="text-4xl font-bold truncate max-w-[500px]" title={state.puzzleName || 'Map Editor'}>
              {state.puzzleName || 'Map Editor'}
            </h1>
            <button
              onClick={handlePlaytest}
              className="px-4 py-2 bg-arcane-600 rounded hover:bg-arcane-700 font-bold text-base"
            >
              ▶ Play
            </button>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {/* Grid Size */}
            <div className="flex items-center gap-3 bg-stone-800 px-4 py-2 rounded">
              <span className="text-sm font-medium text-parchment-300">Grid:</span>
              <div className="flex items-center gap-1">
                <label className="text-xs text-stone-400">W</label>
                <div className="flex items-center">
                  <button
                    onClick={() => handleResize(state.gridWidth - 1, state.gridHeight)}
                    disabled={state.gridWidth <= 3}
                    className="w-7 h-8 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-l text-sm font-bold"
                  >−</button>
                  <input type="text" inputMode="numeric" pattern="[0-9]*" value={widthInput}
                    onChange={(e) => setWidthInput(e.target.value)}
                    onBlur={() => { const val = parseInt(widthInput, 10); if (!isNaN(val) && val >= 3 && val <= 20) handleResize(val, state.gridHeight); else setWidthInput(String(state.gridWidth)); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="w-10 h-8 px-1 bg-stone-700 text-sm text-center border-x border-stone-600"
                  />
                  <button
                    onClick={() => handleResize(state.gridWidth + 1, state.gridHeight)}
                    disabled={state.gridWidth >= 20}
                    className="w-7 h-8 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-r text-sm font-bold"
                  >+</button>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <label className="text-xs text-stone-400">H</label>
                <div className="flex items-center">
                  <button
                    onClick={() => handleResize(state.gridWidth, state.gridHeight - 1)}
                    disabled={state.gridHeight <= 3}
                    className="w-7 h-8 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-l text-sm font-bold"
                  >−</button>
                  <input type="text" inputMode="numeric" pattern="[0-9]*" value={heightInput}
                    onChange={(e) => setHeightInput(e.target.value)}
                    onBlur={() => { const val = parseInt(heightInput, 10); if (!isNaN(val) && val >= 3 && val <= 20) handleResize(state.gridWidth, val); else setHeightInput(String(state.gridHeight)); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="w-10 h-8 px-1 bg-stone-700 text-sm text-center border-x border-stone-600"
                  />
                  <button
                    onClick={() => handleResize(state.gridWidth, state.gridHeight + 1)}
                    disabled={state.gridHeight >= 20}
                    className="w-7 h-8 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-r text-sm font-bold"
                  >+</button>
                </div>
              </div>
            </div>
            {/* Undo/Redo buttons */}
            <div className="flex items-center gap-1 bg-stone-800 px-2 py-1 rounded">
              <button onClick={handleUndo} disabled={!canUndo}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${canUndo ? 'bg-stone-700 hover:bg-stone-600 text-parchment-100' : 'bg-stone-800 text-stone-500 cursor-not-allowed'}`}
                title="Undo (Ctrl+Z)">↩</button>
              <button onClick={handleRedo} disabled={!canRedo}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${canRedo ? 'bg-stone-700 hover:bg-stone-600 text-parchment-100' : 'bg-stone-800 text-stone-500 cursor-not-allowed'}`}
                title="Redo (Ctrl+Y)">↪</button>
              <button
                onClick={() => setShowShortcuts(true)}
                className="px-3 py-1.5 rounded text-sm font-medium transition-colors bg-stone-700 hover:bg-stone-600 text-stone-400 hover:text-parchment-100 ml-1"
                title="Keyboard Shortcuts (?)"
              >
                {'\u2328'} ?
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 md:gap-6">
          {/* Left Column - Canvas, Selected Characters */}
          <div ref={editorContainerRef} className="flex-shrink-0 space-y-4 w-full lg:w-auto">
            <div
              style={{
                width: scaledCanvasWidth,
                height: scaledCanvasHeight,
                overflow: 'hidden'
              }}
            >
              <canvas
                ref={canvasRef}
                width={canvasWidth}
                height={canvasHeight}
                className="border-2 border-stone-600 cursor-crosshair rounded"
                style={{
                  transform: `scale(${editorScale})`,
                  transformOrigin: 'top left'
                }}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
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
          </div>

          {/* Right Side - Two Columns (stacks on mobile) */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 content-start">
            {/* Column 1 (Left) - Tools, Tile/Enemy Selectors, Available Characters */}
            <div className="space-y-4">
              {/* Tools - At top of left column */}
              <ToolsRow
                selectedTool={state.selectedTool}
                isOpen={toolsPanelOpen}
                onToggleOpen={() => setToolsPanelOpen(!toolsPanelOpen)}
                onSelectTool={handleSelectTool}
              />

              {/* Tool-specific panels - hidden when Tools panel is collapsed */}
              {toolsPanelOpen && <>
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
              </>}
            </div>

            {/* Column 2 (Right) - Actions, Puzzle Info, Library */}
            <div className="space-y-4">
              {/* Actions - At top of right column */}
              <ActionsPanel
                isOpen={actionsPanelOpen}
                onToggleOpen={() => setActionsPanelOpen(!actionsPanelOpen)}
                savedPuzzleCount={savedPuzzles.length}
                isValidating={isValidating}
                puzzleId={state.puzzleId}
                puzzleName={state.puzzleName}
                publishStatus={publishStatus}
                setPublishStatus={setPublishStatus}
                reviewNotes={reviewNotes}
                setReviewNotes={setReviewNotes}
                showReviewNotes={showReviewNotes}
                setShowReviewNotes={setShowReviewNotes}
                getCurrentPuzzle={getCurrentPuzzle}
                setPublishDeps={setPublishDeps}
                setShowPublishModal={setShowPublishModal}
                onNewPuzzle={handleNewPuzzle}
                onSave={handleSave}
                onSaveAs={handleSaveAs}
                onOpenLibrary={() => setShowLibrary(true)}
                onExport={handleExport}
                onImport={handleImport}
                onClear={handleClear}
                onValidate={handleValidate}
                onOpenGenerator={() => setShowGenerator(true)}
                onOpenVersionHistory={() => setShowVersionHistory(true)}
              />

              {/* Puzzle Info - Below Actions */}
              <div className="bg-stone-800 p-4 rounded">
                <button
                  onClick={() => setPuzzleInfoPanelOpen(!puzzleInfoPanelOpen)}
                  className="w-full flex items-center justify-between text-lg font-bold"
                >
                  <span>Puzzle Info</span>
                  <span className="text-lg text-stone-400">{puzzleInfoPanelOpen ? '▾' : '▸'}</span>
                </button>
                {puzzleInfoPanelOpen && <div className="space-y-3 mt-3">
                  <div>
                    <label className="block text-sm mb-1">Name</label>
                    <input
                      type="text"
                      value={state.puzzleName}
                      onChange={(e) => setState(prev => ({ ...prev, puzzleName: e.target.value }))}
                      className="w-full px-3 py-2 bg-stone-700 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Description</label>
                    <textarea
                      value={state.description}
                      onChange={(e) => setState(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Short description for the library..."
                      rows={2}
                      className="w-full px-3 py-2 bg-stone-700 rounded text-sm resize-none"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm">Tags</label>
                      <button
                        type="button"
                        onClick={() => {
                          const puzzle = getCurrentPuzzle();
                          const suggested = suggestTags(puzzle);
                          const newTags = suggested.filter(t => !state.tags.includes(t));
                          if (newTags.length === 0) {
                            toast.info('No new tags to suggest');
                          } else {
                            setState(prev => ({ ...prev, tags: [...prev.tags, ...newTags] }));
                            toast.success(`Added ${newTags.length} suggested tag${newTags.length > 1 ? 's' : ''}`);
                          }
                        }}
                        className="text-xs text-copper-400 hover:text-copper-300"
                      >
                        ✨ Auto-suggest
                      </button>
                    </div>
                    <TagInput
                      tags={state.tags}
                      onChange={(tags) => setState(prev => ({ ...prev, tags }))}
                      knownTags={collectAllTags(savedPuzzles)}
                      placeholder="Add tag..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-1">Visual Skin</label>
                    <select
                      value={state.skinId || 'builtin_dungeon'}
                      onChange={(e) => {
                        setState(prev => ({ ...prev, skinId: e.target.value }));
                        setAvailableSkins(getAllPuzzleSkins()); // Refresh in case new skins were added
                      }}
                      className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
                    >
                      {availableSkins.map((skin) => (
                        <option key={skin.id} value={skin.id}>
                          {skin.name} {skin.isBuiltIn ? '(Built-in)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Background Music</label>
                    <select
                      value={state.backgroundMusicId || ''}
                      onChange={(e) => {
                        setState(prev => ({ ...prev, backgroundMusicId: e.target.value || undefined }));
                        setAvailableSounds(getSoundAssets()); // Refresh in case new sounds were added
                      }}
                      className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
                    >
                      <option value="">Use Global Config</option>
                      {availableSounds.map((sound) => (
                        <option key={sound.id} value={sound.id}>
                          {sound.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm mb-1">Available Heroes</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={state.maxCharacters}
                        onChange={(e) => setState(prev => ({ ...prev, maxCharacters: Number(e.target.value) }))}
                        className="w-full px-3 py-2 bg-stone-700 rounded"
                        title="Max heroes in the pool (solver uses this)"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">Max Placeable</label>
                      <input
                        type="number"
                        min="1"
                        max={state.maxCharacters}
                        value={state.maxPlaceableCharacters ?? state.maxCharacters}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setState(prev => ({
                            ...prev,
                            maxPlaceableCharacters: val === prev.maxCharacters ? undefined : val
                          }));
                        }}
                        className="w-full px-3 py-2 bg-stone-700 rounded"
                        title="Max heroes player can place (can be less than available)"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-stone-400 mt-1">Player can place up to {state.maxPlaceableCharacters ?? state.maxCharacters} of {state.maxCharacters} available heroes</p>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="block text-sm mb-1">Max Turns</label>
                      <input
                        type="number"
                        min="10"
                        max="1000"
                        value={state.maxTurns}
                        onChange={(e) => setState(prev => ({ ...prev, maxTurns: Number(e.target.value) }))}
                        className="w-full px-3 py-2 bg-stone-700 rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">Lives</label>
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={state.lives ?? 3}
                        onChange={(e) => setState(prev => ({ ...prev, lives: Number(e.target.value) }))}
                        className="w-full px-3 py-2 bg-stone-700 rounded"
                        title="Number of attempts (0 = unlimited)"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-stone-400 mt-1">Lives: 0 = unlimited attempts</p>

                  {/* Training Arena toggle */}
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={state.isTraining}
                      onChange={(e) => setState(prev => ({ ...prev, isTraining: e.target.checked }))}
                      className="w-4 h-4 accent-copper-500"
                    />
                    <span className="text-sm">Training Arena</span>
                  </label>
                  <p className="text-xs text-stone-400 mt-0.5">Show in Training Grounds page</p>

                  {/* Win Conditions - moved into Puzzle Info */}
                  <div className="pt-3 border-t border-stone-700">
                    <h3 className="text-sm font-semibold mb-2">Win Conditions</h3>
                    <div className="space-y-2">
                      {state.winConditions.map((condition, index) => (
                        <div key={index} className="bg-stone-700 p-2 rounded">
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <select
                                value={condition.type}
                                onChange={(e) => {
                                  const newType = e.target.value as WinConditionType;
                                  setState(prev => {
                                    const newConditions = [...prev.winConditions];
                                    newConditions[index] = { type: newType, params: {} };
                                    return { ...prev, winConditions: newConditions };
                                  });
                                }}
                                className="w-full px-2 py-1 bg-stone-600 rounded text-sm mb-1"
                              >
                                <option value="defeat_all_enemies">Defeat All Enemies</option>
                                <option value="defeat_boss">Defeat the Boss</option>
                                <option value="collect_all">Collect All Items</option>
                                <option value="collect_keys">Collect All Keys</option>
                                <option value="reach_goal">Reach Goal Tile</option>
                                <option value="survive_turns">Survive X Turns</option>
                                <option value="win_in_turns">Win Within X Turns</option>
                                <option value="max_characters">Use Max X Characters</option>
                                <option value="characters_alive">Keep X Characters Alive</option>
                                <option value="protect_noble">Protect the Noble</option>
                                <option value="noble_survives_turns">Noble Survives X Turns</option>
                                <option value="noble_reaches_goal">Noble Reaches Goal Tile</option>
                              </select>

                              {/* Noble conditions: warn when nothing placed can satisfy them.
                                  Any noble condition also makes a Noble death instant defeat
                                  (engine implied-protect rule). */}
                              {(condition.type === 'protect_noble' || condition.type === 'noble_survives_turns' || condition.type === 'noble_reaches_goal') && (() => {
                                const hasPlacedNoble =
                                  state.enemies.some(e => e.party === 'hero' && getEnemy(e.enemyId)?.isNoble) ||
                                  state.availableCharacters.some(cid => getCharacter(cid)?.isNoble);
                                return (
                                  <>
                                    {!hasPlacedNoble && (
                                      <p className="text-xs text-amber-400 italic">No Noble on this map — place a Noble ally or add a Noble hero</p>
                                    )}
                                    <p className="text-xs text-stone-500">If the Noble dies, the puzzle is lost.</p>
                                  </>
                                );
                              })()}

                              {/* Params for conditions that need them */}
                              {(condition.type === 'survive_turns' || condition.type === 'win_in_turns' || condition.type === 'noble_survives_turns') && (
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-stone-400">Turns:</label>
                                  <input
                                    type="number"
                                    min="1"
                                    max="999"
                                    value={condition.params?.turns ?? 10}
                                    onChange={(e) => {
                                      setState(prev => {
                                        const newConditions = [...prev.winConditions];
                                        newConditions[index] = {
                                          ...newConditions[index],
                                          params: { ...newConditions[index].params, turns: parseInt(e.target.value) || 10 }
                                        };
                                        return { ...prev, winConditions: newConditions };
                                      });
                                    }}
                                    className="w-20 px-2 py-1 bg-stone-600 rounded text-sm"
                                  />
                                </div>
                              )}

                              {/* Per-type kill-requirement curation (user design 2026-07-11):
                                  every enemy type placed on the map gets a checkbox; unchecked
                                  types go into params.excludedEnemyIds — they neither block
                                  victory nor appear in the player's quest text. */}
                              {condition.type === 'defeat_all_enemies' && (() => {
                                const placedTypes = Array.from(new Set(state.enemies.map(e => e.enemyId)));
                                if (placedTypes.length === 0) return (
                                  <p className="text-xs text-stone-500 italic">Place enemies to choose which count</p>
                                );
                                const excluded = condition.params?.excludedEnemyIds ?? [];
                                return (
                                  <div className="space-y-1 mt-1">
                                    <p className="text-xs text-stone-400">Counts toward the quest:</p>
                                    {placedTypes.map(enemyId => {
                                      const counts = !excluded.includes(enemyId);
                                      const name = getEnemy(enemyId)?.name ?? enemyId;
                                      return (
                                        <label key={enemyId} className="flex items-center gap-2 text-xs cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={counts}
                                            onChange={(e) => {
                                              const next = e.target.checked
                                                ? excluded.filter(id => id !== enemyId)
                                                : [...excluded, enemyId];
                                              setState(prev => {
                                                const newConditions = [...prev.winConditions];
                                                newConditions[index] = {
                                                  ...newConditions[index],
                                                  params: {
                                                    ...newConditions[index].params,
                                                    excludedEnemyIds: next.length > 0 ? next : undefined,
                                                  },
                                                };
                                                return { ...prev, winConditions: newConditions };
                                              });
                                            }}
                                            className="w-3.5 h-3.5"
                                          />
                                          <span className={counts ? '' : 'text-stone-500 line-through'}>{name}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                );
                              })()}

                              {(condition.type === 'max_characters' || condition.type === 'characters_alive') && (
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-stone-400">Characters:</label>
                                  <input
                                    type="number"
                                    min="1"
                                    max="10"
                                    value={condition.params?.characterCount ?? 1}
                                    onChange={(e) => {
                                      setState(prev => {
                                        const newConditions = [...prev.winConditions];
                                        newConditions[index] = {
                                          ...newConditions[index],
                                          params: { ...newConditions[index].params, characterCount: parseInt(e.target.value) || 1 }
                                        };
                                        return { ...prev, winConditions: newConditions };
                                      });
                                    }}
                                    className="w-20 px-2 py-1 bg-stone-600 rounded text-sm"
                                  />
                                </div>
                              )}
                            </div>

                            {/* Remove button (only if more than 1 condition) */}
                            {state.winConditions.length > 1 && (
                              <button
                                onClick={() => {
                                  setState(prev => ({
                                    ...prev,
                                    winConditions: prev.winConditions.filter((_, i) => i !== index)
                                  }));
                                }}
                                className="px-2 py-1 bg-blood-600 rounded text-xs hover:bg-blood-700"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                      {/* Add condition button */}
                      <button
                        onClick={() => {
                          setState(prev => ({
                            ...prev,
                            winConditions: [...prev.winConditions, { type: 'defeat_all_enemies' }]
                          }));
                        }}
                        className="w-full px-2 py-1 bg-stone-600 rounded text-xs hover:bg-stone-500"
                      >
                        + Add Condition
                      </button>
                    </div>
                  </div>

                  {/* Par (for Trophy Rating) */}
                  <div className="pt-3 border-t border-stone-700">
                    <h3 className="text-sm font-semibold mb-2">Par (for Trophy Rating)</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-stone-400 mb-1">Character Par</label>
                        <input
                          type="number"
                          min="1"
                          max={state.maxCharacters}
                          value={state.parCharacters ?? ''}
                          placeholder="Auto"
                          onChange={(e) => setState(prev => ({
                            ...prev,
                            parCharacters: e.target.value ? Number(e.target.value) : undefined
                          }))}
                          className="w-full px-2 py-1 bg-stone-700 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-stone-400 mb-1">Turn Par</label>
                        <input
                          type="number"
                          min="1"
                          max={state.maxTurns || 100}
                          value={state.parTurns ?? ''}
                          placeholder="Auto"
                          onChange={(e) => setState(prev => ({
                            ...prev,
                            parTurns: e.target.value ? Number(e.target.value) : undefined
                          }))}
                          className="w-full px-2 py-1 bg-stone-700 rounded text-sm"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-stone-500 mt-1">
                      Run validator to auto-suggest. 🏆 Gold = meet both pars.
                    </p>
                  </div>

                  {/* Side Quests (Bonus Objectives) */}
                  <div className="pt-3 border-t border-stone-700">
                    <h3 className="text-sm font-semibold mb-2">Side Quests (Bonus Objectives)</h3>
                    <div className="space-y-2">
                      {state.sideQuests.map((quest, index) => (
                        <div key={quest.id} className="bg-stone-700 p-2 rounded">
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex-1 min-w-0 space-y-1">
                              {/* Title */}
                              <input
                                type="text"
                                value={quest.title}
                                placeholder="Quest title"
                                onChange={(e) => {
                                  setState(prev => {
                                    const newQuests = [...prev.sideQuests];
                                    newQuests[index] = { ...newQuests[index], title: e.target.value };
                                    return { ...prev, sideQuests: newQuests };
                                  });
                                }}
                                className="w-full px-2 py-1 bg-stone-600 rounded text-sm"
                              />

                              {/* Type dropdown */}
                              <select
                                value={quest.type}
                                onChange={(e) => {
                                  setState(prev => {
                                    const newQuests = [...prev.sideQuests];
                                    newQuests[index] = { ...newQuests[index], type: e.target.value as SideQuestType, params: {} };
                                    return { ...prev, sideQuests: newQuests };
                                  });
                                }}
                                className="w-full px-2 py-1 bg-stone-600 rounded text-sm"
                              >
                                <option value="collect_all_items">Collect All Items</option>
                                <option value="no_damage_taken">No Damage Taken</option>
                                <option value="no_deaths">No Deaths</option>
                                <option value="speed_run">Speed Run (X Turns)</option>
                                <option value="minimalist">Minimalist (X Characters)</option>
                                <option value="use_specific_character">Use Specific Character</option>
                                <option value="avoid_character">Avoid Character</option>
                                <option value="custom">Custom (Manual)</option>
                              </select>

                              {/* Params for speed_run */}
                              {quest.type === 'speed_run' && (
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-stone-400">Max Turns:</label>
                                  <input
                                    type="number"
                                    min="1"
                                    max="999"
                                    value={quest.params?.turns ?? 5}
                                    onChange={(e) => {
                                      setState(prev => {
                                        const newQuests = [...prev.sideQuests];
                                        newQuests[index] = {
                                          ...newQuests[index],
                                          params: { ...newQuests[index].params, turns: parseInt(e.target.value) || 5 }
                                        };
                                        return { ...prev, sideQuests: newQuests };
                                      });
                                    }}
                                    className="w-16 px-2 py-1 bg-stone-600 rounded text-sm"
                                  />
                                </div>
                              )}

                              {/* Params for minimalist */}
                              {quest.type === 'minimalist' && (
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-stone-400">Max Characters:</label>
                                  <input
                                    type="number"
                                    min="1"
                                    max="10"
                                    value={quest.params?.characterCount ?? 1}
                                    onChange={(e) => {
                                      setState(prev => {
                                        const newQuests = [...prev.sideQuests];
                                        newQuests[index] = {
                                          ...newQuests[index],
                                          params: { ...newQuests[index].params, characterCount: parseInt(e.target.value) || 1 }
                                        };
                                        return { ...prev, sideQuests: newQuests };
                                      });
                                    }}
                                    className="w-16 px-2 py-1 bg-stone-600 rounded text-sm"
                                  />
                                </div>
                              )}

                              {/* Params for use_specific_character / avoid_character */}
                              {(quest.type === 'use_specific_character' || quest.type === 'avoid_character') && (
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-stone-400">Character:</label>
                                  <select
                                    value={quest.params?.characterId ?? ''}
                                    onChange={(e) => {
                                      setState(prev => {
                                        const newQuests = [...prev.sideQuests];
                                        newQuests[index] = {
                                          ...newQuests[index],
                                          params: { ...newQuests[index].params, characterId: e.target.value }
                                        };
                                        return { ...prev, sideQuests: newQuests };
                                      });
                                    }}
                                    className="flex-1 px-2 py-1 bg-stone-600 rounded text-sm"
                                  >
                                    <option value="">Select...</option>
                                    {state.availableCharacters.filter(id => getCharacter(id) != null).map(charId => {
                                      const char = getCharacter(charId)!;
                                      return (
                                        <option key={charId} value={charId}>
                                          {char.name}
                                        </option>
                                      );
                                    })}
                                  </select>
                                </div>
                              )}

                              {/* Bonus points */}
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-stone-400">Bonus Pts:</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="9999"
                                  value={quest.bonusPoints}
                                  onChange={(e) => {
                                    setState(prev => {
                                      const newQuests = [...prev.sideQuests];
                                      newQuests[index] = { ...newQuests[index], bonusPoints: parseInt(e.target.value) || 0 };
                                      return { ...prev, sideQuests: newQuests };
                                    });
                                  }}
                                  className="w-20 px-2 py-1 bg-stone-600 rounded text-sm"
                                />
                              </div>
                            </div>

                            {/* Remove button */}
                            <button
                              onClick={() => {
                                setState(prev => ({
                                  ...prev,
                                  sideQuests: prev.sideQuests.filter((_, i) => i !== index)
                                }));
                              }}
                              className="px-2 py-1 bg-blood-600 rounded text-xs hover:bg-blood-700"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Add side quest button */}
                      <button
                        onClick={() => {
                          setState(prev => ({
                            ...prev,
                            sideQuests: [...prev.sideQuests, {
                              id: 'quest_' + Date.now(),
                              type: 'collect_all_items',
                              title: 'New Quest',
                              bonusPoints: 100
                            }]
                          }));
                        }}
                        className="w-full px-2 py-1 bg-stone-600 rounded text-xs hover:bg-stone-500"
                      >
                        + Add Side Quest
                      </button>
                    </div>
                  </div>
                </div>}
              </div>

            </div>
          </div>
        </div>
      </div>

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

