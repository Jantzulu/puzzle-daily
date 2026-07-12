import React, { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from '../shared/Toast';
import { useSearchParams } from 'react-router-dom';
import type { Puzzle, TileOrNull, PlacedEnemy, PlacedCollectible, PlacedObject, WinCondition, WinConditionType, BorderConfig, CharacterAction, SpellAsset, SideQuest, SideQuestType, GameState } from '../../types/game';
import { TileType, Direction, ActionType } from '../../types/game';
import { getAllCharacters, getCharacter } from '../../data/characters';
import { getAllEnemies, getEnemy } from '../../data/enemies';
import { drawSprite, getSpriteDrawHeight, ART_TILE_PX } from './SpriteEditor';
import { playBackgroundMusic, stopMusic } from '../../utils/gameSounds';
import { savePuzzle, getSavedPuzzles, deletePuzzle, loadPuzzle, type SavedPuzzle } from '../../utils/puzzleStorage';
import { cacheEditorState, getCachedEditorState, clearCachedEditorState } from '../../utils/editorState';
import { writeAutoSave, readAutoSave, clearAutoSave, AUTOSAVE_INTERVAL_MS, type AutoSaveData } from '../../utils/autoSave';
import { getAllPuzzleSkins, loadPuzzleSkin, getCustomTileTypes, loadTileType, loadSpellAsset, getAllObjects, loadObject, getAllCollectibles, loadCollectible, getSoundAssets, resolveImageSource, getCustomVessels, vesselToEnemyAsset, type CustomObject } from '../../utils/assetStorage';
import { collectPuzzleAssetUrls } from '../../utils/spritePreload';
import { preloadImages } from '../../utils/imageLoader';
import type { PuzzleSkin, SoundAsset } from '../../types/game';
import type { CustomTileType } from '../../utils/assetStorage';
import { SpriteThumbnail } from './SpriteThumbnail';
import { TagInput, collectAllTags } from '../shared/TagInput';
import { suggestTags } from '../../utils/puzzleTagSuggestions';
import { getPuzzleDependencies, type AssetDependency } from '../../utils/publishDependencies';
import { publishPuzzle, publishAsset, unpublishPuzzle, getPuzzleDraftStatus, submitPuzzleForReview, approvePuzzle, requestPuzzleChanges } from '../../services/supabaseService';
import { PublishDependencyModal } from './PublishDependencyModal';
import { VersionHistoryModal } from './VersionHistoryModal';
import { createVersionSnapshot } from '../../services/versionService';
import { logActivity } from '../../services/activityLogService';
import { createHistoryManager } from '../../utils/historyManager';
import { loadImage, subscribeToImageLoads } from '../../utils/imageLoader';
import { subscribeToSpriteImageLoads } from './SpriteEditor';
import { FolderDropdown, useFilteredAssets } from './FolderDropdown';
import { PuzzleLibraryModal } from './PuzzleLibraryModal';
import { solvePuzzleAsync, quickValidate, type SolverResult } from '../../engine/puzzleSolver';
import { WarningModal } from '../shared/WarningModal';
import GeneratorDialog from './GeneratorDialog';
import { vibrate } from '../../utils/haptics';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { Game } from '../game/Game';
import { diffTurn, logTypeStyles, type CombatLogEntry } from '../../engine/combatLog';

// Helper to get all spells from character/enemy behavior
const getAllSpells = (behavior: CharacterAction[] | undefined): SpellAsset[] => {
  if (!behavior) return [];
  const spells: SpellAsset[] = [];
  const seenIds = new Set<string>(); // Avoid duplicates if same spell used multiple times

  for (const action of behavior) {
    // Check for SPELL action type with spellId reference (from spell editor)
    // ActionType.SPELL = 'spell' (lowercase)
    if (action.type === ActionType.SPELL && action.spellId) {
      if (!seenIds.has(action.spellId)) {
        const spell = loadSpellAsset(action.spellId);
        if (spell) {
          spells.push(spell);
          seenIds.add(action.spellId);
        }
      }
    }
  }
  return spells;
};

// Helper to format action sequence for display
const formatActionSequence = (behavior: CharacterAction[] | undefined): string[] => {
  if (!behavior || behavior.length === 0) return ['No actions defined'];
  return behavior.map((action, i) => {
    const num = i + 1;
    switch (action.type) {
      case ActionType.SPELL:
        if (action.spellId) {
          const spell = loadSpellAsset(action.spellId);
          if (spell) return `${num}. ${spell.name}`;
        }
        return `${num}. Cast Spell`;
      case ActionType.MOVE_FORWARD:
        return `${num}. Move Forward`;
      case ActionType.MOVE_BACKWARD:
        return `${num}. Move Backward`;
      case ActionType.TURN_LEFT:
        return `${num}. Turn Left`;
      case ActionType.TURN_RIGHT:
        return `${num}. Turn Right`;
      case ActionType.TURN_AROUND:
        return `${num}. Turn Around`;
      case ActionType.WAIT:
        return `${num}. Wait`;
      case ActionType.REPEAT:
        return `${num}. Repeat`;
      default:
        return `${num}. ${action.type}`;
    }
  });
};

// Tooltip component for spell info - marks element with data attribute to prevent action tooltip
const SpellTooltip: React.FC<{ spell: SpellAsset; children: React.ReactNode }> = ({ spell, children }) => {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPosition({ x: rect.left + rect.width / 2, y: rect.bottom });
    timeoutRef.current = setTimeout(() => setShow(true), 300);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShow(false);
  };

  return (
    <div
      className="relative inline-block"
      data-spell-tooltip="true"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {show && (
        <div
          className="fixed z-[9999] w-48 p-2 bg-stone-900 border border-stone-600 rounded shadow-lg text-xs pointer-events-none"
          style={{ left: position.x, top: position.y + 8, transform: 'translateX(-50%)' }}
        >
          <div className="font-bold text-parchment-100 mb-1">{spell.name}</div>
          <div className="text-stone-400 mb-1">{spell.description}</div>
          <div className="text-parchment-300">
            {spell.damage && <div>Damage: {spell.damage}</div>}
            {spell.healing && <div>Healing: {spell.healing}</div>}
            {spell.range && <div>Range: {spell.range}</div>}
            {spell.radius && <div>Radius: {spell.radius}</div>}
            <div>Type: {spell.templateType}</div>
          </div>
        </div>
      )}
    </div>
  );
};

// Tooltip component for action sequence - checks if mouse is over spell tooltip area
const ActionTooltip: React.FC<{ actions: CharacterAction[] | undefined; children: React.ReactNode }> = ({ actions, children }) => {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = formatActionSequence(actions);

  const handleMouseEnter = (e: React.MouseEvent) => {
    // Check if the mouse entered from a spell tooltip area - don't show action tooltip
    const target = e.target as HTMLElement;
    if (target.closest('[data-spell-tooltip="true"]')) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    // Position tooltip below the element, centered horizontally
    setPosition({ x: rect.left + rect.width / 2, y: rect.bottom });
    timeoutRef.current = setTimeout(() => setShow(true), 400);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShow(false);
  };

  // Also handle mouse movement to hide tooltip when entering spell area
  const handleMouseMove = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-spell-tooltip="true"]')) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setShow(false);
    }
  };

  return (
    <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} onMouseMove={handleMouseMove}>
      {children}
      {show && (
        <div
          className="fixed z-[9999] w-44 p-2 bg-stone-900 border border-stone-600 rounded shadow-lg text-xs pointer-events-none"
          style={{ left: position.x, top: position.y + 8, transform: 'translateX(-50%)' }}
        >
          <div className="font-bold text-parchment-100 mb-1">Action Sequence</div>
          {sequence.map((action, i) => (
            <div key={i} className="text-parchment-300">{action}</div>
          ))}
        </div>
      )}
    </div>
  );
};

// Tooltip component for object info
const ObjectTooltip: React.FC<{ object: CustomObject; children: React.ReactNode }> = ({ object, children }) => {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPosition({ x: rect.left + rect.width / 2, y: rect.bottom });
    timeoutRef.current = setTimeout(() => setShow(true), 400);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShow(false);
  };

  return (
    <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {children}
      {show && (
        <div
          className="fixed z-[9999] w-52 p-2 bg-stone-900 border border-stone-600 rounded shadow-lg text-xs pointer-events-none"
          style={{ left: position.x, top: position.y + 8, transform: 'translateX(-50%)' }}
        >
          <div className="font-bold text-parchment-100 mb-1">{object.name}</div>
          {object.description && (
            <div className="text-stone-400 mb-1">{object.description}</div>
          )}
          <div className="text-parchment-300 space-y-0.5">
            <div>Collision: <span className="capitalize">{object.collisionType.replace('_', ' ')}</span></div>
            <div>Anchor: <span className="capitalize">{object.anchorPoint.replace('_', ' ')}</span></div>
            {object.effects.length > 0 && (
              <div className="mt-1 pt-1 border-t border-stone-700">
                <div className="font-semibold mb-0.5">Effects:</div>
                {object.effects.map((effect, i) => (
                  <div key={i} className="text-stone-400">
                    • {effect.type.charAt(0).toUpperCase() + effect.type.slice(1)}
                    {effect.value ? ` (${effect.value})` : ''} - r{effect.radius}
                    {effect.affectsCharacters && effect.affectsEnemies ? ' [All]' :
                     effect.affectsCharacters ? ' [Chars]' : ' [Enemies]'}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const TILE_SIZE = 48;
const BORDER_SIZE = 48; // Border thickness for top/bottom
const SIDE_BORDER_SIZE = 16; // Thinner side borders to match pixel art style
const MAX_DISPLAY_WIDTH_TILES = 15; // Max tiles before scaling down

type ToolType = 'empty' | 'wall' | 'void' | 'enemy' | 'collectible' | 'object' | 'custom' | 'characters';
type EditorMode = 'edit' | 'playtest';

interface EditorState {
  gridWidth: number;
  gridHeight: number;
  tiles: TileOrNull[][];
  enemies: PlacedEnemy[];
  collectibles: PlacedCollectible[];
  placedObjects: PlacedObject[];

  // Metadata
  puzzleName: string;
  puzzleId: string;
  maxCharacters: number;
  maxPlaceableCharacters?: number; // Max heroes player can place (if different from maxCharacters)
  maxTurns?: number;
  lives?: number; // Number of attempts (0 = unlimited, default: 3)
  availableCharacters: string[];
  winConditions: WinCondition[];
  borderConfig?: BorderConfig; // Legacy - kept for backwards compatibility
  skinId?: string; // Reference to PuzzleSkin
  backgroundMusicId?: string; // Reference to sound asset for puzzle-specific background music

  // Scoring
  parCharacters?: number;
  parTurns?: number;
  sideQuests: SideQuest[];

  // Tags & description
  tags: string[];
  description: string;

  // Training arena
  isTraining: boolean;

  // Editor state
  selectedTool: ToolType;
  isDrawing: boolean;
  mode: EditorMode;
}

// Helper to create default editor state
const createDefaultEditorState = (): EditorState => ({
  gridWidth: 8,
  gridHeight: 8,
  tiles: createEmptyGrid(8, 8),
  enemies: [],
  collectibles: [],
  placedObjects: [],

  puzzleName: 'New Puzzle',
  puzzleId: 'puzzle_' + Date.now(),
  maxCharacters: 3,
  maxTurns: 100,
  lives: 3,
  availableCharacters: [],
  winConditions: [{ type: 'defeat_all_enemies' }],
  skinId: 'builtin_dungeon', // Default skin

  // Scoring - undefined means auto-suggest from validator
  parCharacters: undefined,
  parTurns: undefined,
  sideQuests: [],

  // Tags & description
  tags: [],
  description: '',

  // Training arena
  isTraining: false,

  selectedTool: 'wall',
  isDrawing: false,
  mode: 'edit',
});

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
        // 3 — Object tool
        case '3':
          e.preventDefault();
          setState(prev => ({ ...prev, selectedTool: 'object' }));
          break;
        // 4 — Item (collectible) tool
        case '4':
          e.preventDefault();
          setState(prev => ({ ...prev, selectedTool: 'collectible' }));
          break;
        // 5 — Heroes tool
        case '5':
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

  // Enemy/Character/Object/Collectible selection
  const [selectedEnemyId, setSelectedEnemyId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedCollectibleId, setSelectedCollectibleId] = useState<string | null>(null);
  const allEnemies = getAllEnemies();
  // Vessels place exactly like enemies (they live in puzzle.enemies and
  // resolve through the enemy adapter) — shown as their own palette section.
  const allVessels = getCustomVessels().map(vesselToEnemyAsset);
  const placeableEnemyTypes = [...allEnemies, ...allVessels];
  const allCharacters = getAllCharacters();
  const allObjects = getAllObjects();
  const allCollectibles = getAllCollectibles();

  // Folder filtering for asset selectors
  const [enemyFolderId, setEnemyFolderId] = useState<string | null>(null);
  const [objectFolderId, setObjectFolderId] = useState<string | null>(null);
  const [characterFolderId, setCharacterFolderId] = useState<string | null>(null);
  const [tileFolderId, setTileFolderId] = useState<string | null>(null);
  const [collectibleFolderId, setCollectibleFolderId] = useState<string | null>(null);
  const filteredEnemies = useFilteredAssets(allEnemies, enemyFolderId);
  const filteredObjects = useFilteredAssets(allObjects, objectFolderId);
  const filteredCharacters = useFilteredAssets(allCharacters, characterFolderId);
  const filteredTileTypes = useFilteredAssets(customTileTypes, tileFolderId);
  const filteredCollectibles = useFilteredAssets(allCollectibles, collectibleFolderId);

  // Search filtering for tool panels
  const [toolSearchTerm, setToolSearchTerm] = useState('');
  const searchFilteredEnemies = toolSearchTerm ? filteredEnemies.filter(e => e.name.toLowerCase().includes(toolSearchTerm.toLowerCase())) : filteredEnemies;
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
    if (state.selectedTool === 'enemy') {
      if (!selectedEnemyId) {
        toast.warning('Please select an enemy type first!');
        return;
      }

      const enemyType = placeableEnemyTypes.find(e => e.id === selectedEnemyId);
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
              <div className="bg-stone-800 p-4 rounded">
                <button
                  onClick={() => setToolsPanelOpen(!toolsPanelOpen)}
                  className="w-full flex items-center justify-between text-lg font-bold"
                >
                  <span>Tools</span>
                  <span className="text-lg text-stone-400">{toolsPanelOpen ? '▾' : '▸'}</span>
                </button>
                {toolsPanelOpen && <div className="grid grid-cols-4 gap-2 mt-3">
                  <button
                    onClick={() => {
                      setCustomTileTypes(getCustomTileTypes()); // Refresh list
                      setState(prev => ({ ...prev, selectedTool: 'custom' }));
                    }}
                    className={`p-3 rounded text-sm ${
                      state.selectedTool === 'custom' || state.selectedTool === 'void' || state.selectedTool === 'empty' || state.selectedTool === 'wall'
                        ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                    }`}
                  >
                    <span className="text-[10px] opacity-50 mr-0.5">1</span> Tile
                  </button>
                  <button
                    onClick={() => setState(prev => ({ ...prev, selectedTool: 'enemy' }))}
                    className={`p-3 rounded text-sm ${
                      state.selectedTool === 'enemy' ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                    }`}
                  >
                    <span className="text-[10px] opacity-50 mr-0.5">2</span> Enemy
                  </button>
                  <button
                    onClick={() => setState(prev => ({ ...prev, selectedTool: 'object' }))}
                    className={`p-3 rounded text-sm ${
                      state.selectedTool === 'object' ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                    }`}
                  >
                    <span className="text-[10px] opacity-50 mr-0.5">3</span> Object
                  </button>
                  <button
                    onClick={() => setState(prev => ({ ...prev, selectedTool: 'collectible' }))}
                    className={`p-3 rounded text-sm ${
                      state.selectedTool === 'collectible' ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                    }`}
                  >
                    <span className="text-[10px] opacity-50 mr-0.5">4</span> Item
                  </button>
                  <button
                    onClick={() => setState(prev => ({ ...prev, selectedTool: 'characters' }))}
                    className={`p-3 rounded text-sm ${
                      state.selectedTool === 'characters' ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                    }`}
                  >
                    <span className="text-[10px] opacity-50 mr-0.5">5</span> Heroes
                  </button>
                </div>}
              </div>

              {/* Tool-specific panels - hidden when Tools panel is collapsed */}
              {toolsPanelOpen && <>
              {/* Tile Selector - Shows when Tile tool is selected */}
              {(state.selectedTool === 'custom' || state.selectedTool === 'void' || state.selectedTool === 'empty' || state.selectedTool === 'wall') && (() => {
                const currentSkin = state.skinId ? loadPuzzleSkin(state.skinId) : null;
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

                return (
                <div className="bg-stone-800 p-4 rounded">
                  <h2 className="text-lg font-bold mb-3">Tile Type</h2>
                  <div className="space-y-2">
                    {/* Built-in tiles: Void at top */}
                    <button
                      onClick={() => setState(prev => ({ ...prev, selectedTool: 'void' }))}
                      className={`w-full p-2 rounded text-left flex items-center gap-2 ${
                        state.selectedTool === 'void' ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                      }`}
                    >
                      <div className="w-8 h-8 bg-stone-900 rounded flex items-center justify-center overflow-hidden">
                        {skinVoidSprite ? (
                          <img src={skinVoidSprite} alt="" className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} loading="lazy" decoding="async" />
                        ) : (
                          <span className="text-stone-600">✕</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">Void</div>
                        <div className="text-xs text-stone-400">Empty space (no tile)</div>
                      </div>
                    </button>
                    <button
                      onClick={() => setState(prev => ({ ...prev, selectedTool: 'empty' }))}
                      className={`w-full p-2 rounded text-left flex items-center gap-2 ${
                        state.selectedTool === 'empty' ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                      }`}
                    >
                      <div className="w-8 h-8 bg-stone-600 rounded flex items-center justify-center overflow-hidden">
                        {skinEmptySprite ? (
                          <img src={skinEmptySprite} alt="" className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} loading="lazy" decoding="async" />
                        ) : (
                          <span className="text-stone-400">⬜</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">Empty</div>
                        <div className="text-xs text-stone-400">Walkable floor tile</div>
                      </div>
                    </button>
                    <button
                      onClick={() => setState(prev => ({ ...prev, selectedTool: 'wall' }))}
                      className={`w-full p-2 rounded text-left flex items-center gap-2 ${
                        state.selectedTool === 'wall' ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                      }`}
                    >
                      <div className="w-8 h-8 bg-stone-500 rounded flex items-center justify-center overflow-hidden">
                        {skinWallSprite ? (
                          <img src={skinWallSprite} alt="" className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} loading="lazy" decoding="async" />
                        ) : (
                          <span className="text-parchment-300">▓</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">Wall</div>
                        <div className="text-xs text-stone-400">Impassable barrier</div>
                      </div>
                    </button>

                    {/* Divider if custom tiles exist */}
                    {customTileTypes.length > 0 && (
                      <div className="border-t border-stone-600 my-2 pt-2">
                        <div className="text-xs text-stone-400 mb-2">Custom Tiles</div>
                        <FolderDropdown
                          category="tiles"
                          selectedFolderId={tileFolderId}
                          onFolderSelect={setTileFolderId}
                        />
                        <input
                          type="text"
                          placeholder="Search custom tiles..."
                          value={toolSearchTerm}
                          onChange={e => setToolSearchTerm(e.target.value)}
                          className="w-full bg-stone-700 rounded px-2 py-1 text-sm placeholder-stone-500 mt-2"
                        />
                      </div>
                    )}

                    {/* Custom tiles */}
                    {searchFilteredTileTypes.map(tileType => {
                      const isSelected = selectedCustomTileTypeId === tileType.id && state.selectedTool === 'custom';
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
                          onClick={() => {
                            setSelectedCustomTileTypeId(tileType.id);
                            setState(prev => ({ ...prev, selectedTool: 'custom' }));
                          }}
                          className={`w-full p-2 rounded text-left flex items-center gap-2 ${
                            isSelected ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                          }`}
                        >
                          <div className="w-8 h-8 bg-stone-600 rounded flex items-center justify-center overflow-hidden">
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
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{tileType.name}</div>
                            <div className="text-xs text-stone-400">
                              {tileType.baseType} • {behaviorIcons}
                            </div>
                          </div>
                        </button>
                      );
                    })}

                    {/* Message when no tiles in folder or no tiles at all */}
                    {customTileTypes.length === 0 ? (
                      <p className="text-xs text-stone-400 mt-2">
                        Create custom tiles in{' '}
                        <a href="/assets" className="text-blue-400 hover:underline">
                          Asset Manager → Tiles
                        </a>
                      </p>
                    ) : searchFilteredTileTypes.length === 0 && (
                      <p className="text-xs text-stone-400 mt-2">{toolSearchTerm ? 'No tiles match your search.' : 'No tiles in this folder.'}</p>
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
                            onChange={e => setSelectedTriggerGroupId(e.target.value)}
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
                </div>
                );
              })()}

              {/* Enemy Type Selector - List style with sprites */}
              {state.selectedTool === 'enemy' && (
                <div className="bg-stone-800 p-4 rounded">
                  <h2 className="text-lg font-bold mb-3">Select Enemy</h2>
                  <FolderDropdown
                    category="enemies"
                    selectedFolderId={enemyFolderId}
                    onFolderSelect={setEnemyFolderId}
                  />
                  <input
                    type="text"
                    placeholder="Search enemies..."
                    value={toolSearchTerm}
                    onChange={e => setToolSearchTerm(e.target.value)}
                    className="w-full bg-stone-700 rounded px-2 py-1 text-sm placeholder-stone-500 mt-2"
                  />
                  {searchFilteredEnemies.length === 0 ? (
                    <p className="text-sm text-stone-400 mt-2">
                      {allEnemies.length === 0 ? 'No enemies available. Create enemies in Asset Manager!' : toolSearchTerm ? 'No enemies match your search.' : 'No enemies in this folder.'}
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto mt-2">
                      {searchFilteredEnemies.map(enemy => {
                        const spells = getAllSpells(enemy.behavior?.pattern);
                        return (
                          <ActionTooltip key={enemy.id} actions={enemy.behavior?.pattern}>
                            <button
                              onClick={() => setSelectedEnemyId(enemy.id)}
                              className={`w-full p-2 rounded text-left flex items-center gap-2 ${
                                selectedEnemyId === enemy.id ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                              }`}
                            >
                              <SpriteThumbnail sprite={enemy.customSprite} size={32} previewType="entity" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{enemy.name}</div>
                                <div className="text-xs text-stone-400">HP: {enemy.health}</div>
                              </div>
                              {spells.length > 0 && (
                                <div className="flex gap-1 flex-shrink-0">
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
                            </button>
                          </ActionTooltip>
                        );
                      })}
                    </div>
                  )}

                  {/* Vessels — breakable statics, placed exactly like enemies */}
                  {allVessels.length > 0 && (() => {
                    const searchFilteredVessels = allVessels.filter(v =>
                      v.name.toLowerCase().includes(toolSearchTerm.toLowerCase())
                    );
                    if (searchFilteredVessels.length === 0) return null;
                    return (
                      <>
                        <h3 className="text-sm font-bold mt-4 mb-2 text-copper-300">🛢️ Vessels</h3>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {searchFilteredVessels.map(vessel => (
                            <button
                              key={vessel.id}
                              onClick={() => setSelectedEnemyId(vessel.id)}
                              className={`w-full p-2 rounded text-left flex items-center gap-2 ${
                                selectedEnemyId === vessel.id ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                              }`}
                            >
                              <SpriteThumbnail sprite={vessel.customSprite} size={32} previewType="entity" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{vessel.name}</div>
                                <div className="text-xs text-stone-400">HP: {vessel.health}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Object Type Selector - List style with sprites and tooltips */}
              {state.selectedTool === 'object' && (
                <div className="bg-stone-800 p-4 rounded">
                  <h2 className="text-lg font-bold mb-3">Select Object</h2>
                  <FolderDropdown
                    category="objects"
                    selectedFolderId={objectFolderId}
                    onFolderSelect={setObjectFolderId}
                  />
                  <input
                    type="text"
                    placeholder="Search objects..."
                    value={toolSearchTerm}
                    onChange={e => setToolSearchTerm(e.target.value)}
                    className="w-full bg-stone-700 rounded px-2 py-1 text-sm placeholder-stone-500 mt-2"
                  />
                  {searchFilteredObjects.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-sm text-stone-400 mb-2">
                        {allObjects.length === 0 ? 'No objects available.' : toolSearchTerm ? 'No objects match your search.' : 'No objects in this folder.'}
                      </p>
                      {allObjects.length === 0 && (
                        <a href="/assets" className="text-blue-400 hover:underline text-sm">
                          Create objects in Asset Manager
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto mt-2">
                      {searchFilteredObjects.map(obj => (
                        <ObjectTooltip key={obj.id} object={obj}>
                          <button
                            onClick={() => setSelectedObjectId(obj.id)}
                            className={`w-full p-2 rounded text-left flex items-center gap-2 ${
                              selectedObjectId === obj.id ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                            }`}
                          >
                            <SpriteThumbnail sprite={obj.customSprite} size={32} previewType="asset" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{obj.name}</div>
                              <div className="text-xs text-stone-400 capitalize">
                                {obj.collisionType.replace('_', ' ')}
                                {obj.effects.length > 0 && ` • ${obj.effects.length} effect${obj.effects.length > 1 ? 's' : ''}`}
                              </div>
                            </div>
                            {obj.effects.length > 0 && (
                              <div className="flex gap-1 flex-shrink-0">
                                {obj.effects.slice(0, 2).map((effect, i) => (
                                  <span
                                    key={i}
                                    className={`text-xs px-1.5 py-0.5 rounded ${
                                      effect.type === 'damage' ? 'bg-red-900 text-red-300' :
                                      effect.type === 'heal' ? 'bg-green-900 text-green-300' :
                                      'bg-blue-900 text-blue-300'
                                    }`}
                                  >
                                    {effect.type.charAt(0).toUpperCase()}
                                  </span>
                                ))}
                              </div>
                            )}
                          </button>
                        </ObjectTooltip>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Collectible Type Selector - List style with sprites */}
              {state.selectedTool === 'collectible' && (
                <div className="bg-stone-800 p-4 rounded">
                  <h2 className="text-lg font-bold mb-3">Select Collectible</h2>
                  <FolderDropdown
                    category="collectibles"
                    selectedFolderId={collectibleFolderId}
                    onFolderSelect={setCollectibleFolderId}
                  />
                  <input
                    type="text"
                    placeholder="Search collectibles..."
                    value={toolSearchTerm}
                    onChange={e => setToolSearchTerm(e.target.value)}
                    className="w-full bg-stone-700 rounded px-2 py-1 text-sm placeholder-stone-500 mt-2"
                  />
                  {/* Legacy coin option */}
                  <div className="space-y-2 max-h-64 overflow-y-auto mt-2">
                    {!toolSearchTerm && (
                      <button
                        onClick={() => setSelectedCollectibleId(null)}
                        className={`w-full p-2 rounded text-left flex items-center gap-2 ${
                          selectedCollectibleId === null ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                        }`}
                      >
                        <div className="w-8 h-8 rounded flex items-center justify-center bg-stone-600">
                          <span className="text-yellow-400">⭐</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">Default Coin</div>
                          <div className="text-xs text-stone-400">Legacy collectible (10 points)</div>
                        </div>
                      </button>
                    )}
                    {searchFilteredCollectibles.length === 0 && allCollectibles.length > 0 ? (
                      <div className="text-center py-2">
                        <p className="text-sm text-stone-400">No collectibles in this folder.</p>
                      </div>
                    ) : allCollectibles.length === 0 ? (
                      <div className="text-center py-2">
                        <p className="text-sm text-stone-400 mb-2">No custom collectibles available.</p>
                        <a href="/assets" className="text-blue-400 hover:underline text-sm">
                          Create collectibles in Asset Manager
                        </a>
                      </div>
                    ) : (
                      searchFilteredCollectibles.map(coll => (
                        <button
                          key={coll.id}
                          onClick={() => setSelectedCollectibleId(coll.id)}
                          className={`w-full p-2 rounded text-left flex items-center gap-2 ${
                            selectedCollectibleId === coll.id ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                          }`}
                        >
                          <SpriteThumbnail sprite={coll.customSprite} size={32} previewType="asset" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{coll.name}</div>
                            <div className="text-xs text-stone-400">
                              {coll.effects.length > 0
                                ? coll.effects.map(e => e.type).join(', ')
                                : 'No effects'}
                            </div>
                          </div>
                          {coll.effects.length > 0 && (
                            <div className="flex gap-1 flex-shrink-0">
                              {coll.effects.slice(0, 2).map((effect, i) => (
                                <span
                                  key={i}
                                  className={`text-xs px-1.5 py-0.5 rounded ${
                                    effect.type === 'damage' ? 'bg-red-900 text-red-300' :
                                    effect.type === 'heal' ? 'bg-green-900 text-green-300' :
                                    effect.type === 'score' ? 'bg-yellow-900 text-yellow-300' :
                                    effect.type === 'win_key' ? 'bg-purple-900 text-purple-300' :
                                    'bg-blue-900 text-blue-300'
                                  }`}
                                >
                                  {effect.type === 'status_effect' ? 'Buff' : effect.type.charAt(0).toUpperCase()}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Available Heroes - Shows when Heroes tool is selected */}
              {state.selectedTool === 'characters' && (
                <div className="bg-stone-800 p-4 rounded">
                  <h2 className="text-lg font-bold mb-3">Available Heroes</h2>
                  <p className="text-xs text-stone-400 mb-3">Select which heroes players can use</p>
                  <FolderDropdown
                    category="characters"
                    selectedFolderId={characterFolderId}
                    onFolderSelect={setCharacterFolderId}
                  />
                  <input
                    type="text"
                    placeholder="Search heroes..."
                    value={toolSearchTerm}
                    onChange={e => setToolSearchTerm(e.target.value)}
                    className="w-full bg-stone-700 rounded px-2 py-1 text-sm placeholder-stone-500 mt-2"
                  />
                  {searchFilteredCharacters.length === 0 ? (
                    <p className="text-sm text-stone-400 mt-2">
                      {allCharacters.length === 0 ? 'No characters available' : toolSearchTerm ? 'No heroes match your search.' : 'No characters in this folder.'}
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto mt-2">
                      {searchFilteredCharacters.map(char => {
                        const spells = getAllSpells(char.behavior);
                        const isSelected = state.availableCharacters.includes(char.id);
                        const isAtCap = state.availableCharacters.length >= 5 && !isSelected;

                        return (
                          <ActionTooltip key={char.id} actions={char.behavior}>
                            <label className={`flex items-center gap-2 p-2 bg-stone-700 rounded ${isAtCap ? 'opacity-50 cursor-not-allowed' : 'hover:bg-stone-600 cursor-pointer'}`}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isAtCap}
                                onChange={(e) => {
                                  setState(prev => {
                                    const newAvailable = e.target.checked
                                      ? [...prev.availableCharacters, char.id]
                                      : prev.availableCharacters.filter(id => id !== char.id);

                                    // Auto-increase maxCharacters if selecting more heroes (up to cap of 5)
                                    const newMaxCharacters = e.target.checked && newAvailable.length > prev.maxCharacters
                                      ? Math.min(newAvailable.length, 5)
                                      : prev.maxCharacters;

                                    return {
                                      ...prev,
                                      availableCharacters: newAvailable,
                                      maxCharacters: newMaxCharacters,
                                    };
                                  });
                                }}
                                className="w-4 h-4"
                              />
                              <SpriteThumbnail sprite={char.customSprite} size={32} previewType="entity" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{char.name}</div>
                                <div className="text-xs text-stone-400">HP: {char.health}</div>
                              </div>
                              {spells.length > 0 && (
                                <div className="flex gap-1 flex-shrink-0">
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
                            </label>
                          </ActionTooltip>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              </>}
            </div>

            {/* Column 2 (Right) - Actions, Puzzle Info, Library */}
            <div className="space-y-4">
              {/* Actions - At top of right column */}
              <div className="bg-stone-800 p-4 rounded">
                <button
                  onClick={() => setActionsPanelOpen(!actionsPanelOpen)}
                  className="w-full flex items-center justify-between text-lg font-bold"
                >
                  <span>Actions</span>
                  <span className="text-lg text-stone-400">{actionsPanelOpen ? '▾' : '▸'}</span>
                </button>
                {actionsPanelOpen && <div className="space-y-2 mt-2">
                <button
                  onClick={handleNewPuzzle}
                  className="w-full px-4 py-2 bg-stone-600 rounded hover:bg-stone-700"
                >
                  New
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-moss-600 rounded hover:bg-moss-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleSaveAs}
                    className="px-4 py-2 bg-green-700 rounded hover:bg-green-800"
                  >
                    Save As
                  </button>
                </div>
                <button
                  onClick={() => setShowLibrary(true)}
                  className="w-full px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
                >
                  Library ({savedPuzzles.length})
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleExport}
                    className="px-4 py-2 bg-stone-600 rounded hover:bg-stone-700 text-sm"
                  >
                    Export
                  </button>
                  <button
                    onClick={handleImport}
                    className="px-4 py-2 bg-stone-600 rounded hover:bg-stone-700 text-sm"
                  >
                    Import
                  </button>
                </div>
                <button
                  onClick={handleClear}
                  className="w-full px-4 py-2 bg-blood-600 rounded hover:bg-blood-700"
                >
                  Clear Grid
                </button>
                <button
                  onClick={handleValidate}
                  disabled={isValidating}
                  className="w-full px-4 py-2 bg-arcane-600 rounded hover:bg-arcane-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isValidating ? 'Validating...' : 'Validate Puzzle'}
                </button>
                <button
                  onClick={() => setShowGenerator(true)}
                  className="w-full px-4 py-2 bg-amber-600 rounded hover:bg-amber-700"
                  title="Generate a new random puzzle"
                >
                  Generate Puzzle
                </button>

                {/* Version History */}
                <div className="border-t border-stone-700 pt-3 mt-1">
                  <label className="text-sm font-medium block mb-2">Versions</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const puzzle = getCurrentPuzzle();
                        const result = await createVersionSnapshot(
                          state.puzzleId,
                          'puzzle',
                          state.puzzleName || 'Untitled',
                          puzzle as unknown as object
                        );
                        if (result.success) {
                          toast.success(`Saved version #${result.versionNumber}`);
                          logActivity({
                            action: 'update',
                            asset_type: 'puzzle',
                            asset_id: state.puzzleId,
                            asset_name: state.puzzleName,
                            details: { saved_version: result.versionNumber },
                          });
                        } else {
                          toast.error('Failed to save version');
                        }
                      }}
                      className="flex-1 px-3 py-1.5 text-sm bg-copper-600/20 hover:bg-copper-600/30 text-copper-300 rounded border border-copper-500/30 font-medium"
                    >
                      📸 Save Version
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowVersionHistory(true)}
                      className="px-3 py-1.5 text-sm bg-stone-700 hover:bg-stone-600 rounded"
                    >
                      History
                    </button>
                  </div>
                </div>

                {/* Publishing & Review Workflow */}
                <div className="border-t border-stone-700 pt-3 mt-1">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">Publishing</label>
                    {publishStatus === 'published' && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-copper-600/30 text-copper-400 border border-copper-500/30">
                        Published
                      </span>
                    )}
                    {publishStatus === 'approved' && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-green-600/30 text-green-400 border border-green-500/30">
                        Approved
                      </span>
                    )}
                    {publishStatus === 'pending_review' && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-amber-600/30 text-amber-400 border border-amber-500/30">
                        In Review
                      </span>
                    )}
                    {(publishStatus === 'draft' || publishStatus === null) && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-stone-600/30 text-stone-400 border border-stone-500/30">
                        Draft
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {/* Draft state: Submit for Review */}
                    {(publishStatus === 'draft' || publishStatus === null) && (
                      <button
                        type="button"
                        onClick={async () => {
                          const success = await submitPuzzleForReview(state.puzzleId, state.puzzleName);
                          if (success) {
                            setPublishStatus('pending_review');
                            toast.success('Submitted for review');
                          } else {
                            toast.error('Failed to submit for review');
                          }
                        }}
                        className="w-full px-3 py-1.5 text-sm bg-amber-600/80 hover:bg-amber-600 rounded font-medium text-white"
                      >
                        📋 Submit for Review
                      </button>
                    )}

                    {/* Pending Review state: Approve / Request Changes */}
                    {publishStatus === 'pending_review' && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            const success = await approvePuzzle(state.puzzleId, state.puzzleName);
                            if (success) {
                              setPublishStatus('approved');
                              toast.success('Puzzle approved!');
                            } else {
                              toast.error('Failed to approve');
                            }
                          }}
                          className="flex-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 rounded font-medium"
                        >
                          ✓ Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowReviewNotes(true)}
                          className="px-3 py-1.5 text-sm bg-stone-700 hover:bg-stone-600 rounded"
                        >
                          Request Changes
                        </button>
                      </div>
                    )}

                    {/* Approved state: Publish / Request Changes */}
                    {publishStatus === 'approved' && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            setPublishStatus('checking');
                            try {
                              const puzzle = getCurrentPuzzle();
                              const deps = await getPuzzleDependencies(puzzle);
                              setPublishDeps(deps);
                              setShowPublishModal(true);
                            } catch (err) {
                              toast.error('Failed to check dependencies');
                              console.error(err);
                            }
                            setPublishStatus('approved');
                          }}
                          className="flex-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 rounded font-medium"
                        >
                          🚀 Publish
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowReviewNotes(true)}
                          className="px-3 py-1.5 text-sm bg-stone-700 hover:bg-stone-600 rounded"
                        >
                          Request Changes
                        </button>
                      </div>
                    )}

                    {/* Published state: Unpublish */}
                    {publishStatus === 'published' && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm('Unpublish this puzzle? It will be removed from the live site.')) return;
                          const success = await unpublishPuzzle(state.puzzleId);
                          if (success) {
                            setPublishStatus('draft');
                            toast.success('Puzzle unpublished');
                          } else {
                            toast.error('Failed to unpublish');
                          }
                        }}
                        className="w-full px-3 py-1.5 text-sm bg-stone-700 hover:bg-red-600/80 rounded text-stone-400 hover:text-white"
                      >
                        Unpublish
                      </button>
                    )}

                    {/* Review notes input */}
                    {showReviewNotes && (
                      <div className="bg-stone-800/50 rounded p-2 space-y-2 border border-stone-700/50">
                        <textarea
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          placeholder="What needs to change?"
                          rows={2}
                          className="w-full px-2 py-1.5 bg-stone-700 rounded text-sm resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              const success = await requestPuzzleChanges(state.puzzleId, state.puzzleName, reviewNotes || undefined);
                              if (success) {
                                setPublishStatus('draft');
                                setShowReviewNotes(false);
                                setReviewNotes('');
                                toast.success('Sent back for changes');
                              } else {
                                toast.error('Failed to request changes');
                              }
                            }}
                            className="flex-1 px-2 py-1 text-xs bg-red-600/30 hover:bg-red-600/50 text-red-300 rounded border border-red-500/30"
                          >
                            Send Back
                          </button>
                          <button
                            type="button"
                            onClick={() => { setShowReviewNotes(false); setReviewNotes(''); }}
                            className="px-2 py-1 text-xs bg-stone-700 hover:bg-stone-600 rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      const status = await getPuzzleDraftStatus(state.puzzleId);
                      setPublishStatus(status || 'draft');
                    }}
                    className="text-xs text-stone-500 hover:text-stone-300 mt-1"
                  >
                    Check status
                  </button>
                </div>
                </div>}
              </div>

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
                              </select>

                              {/* Params for conditions that need them */}
                              {(condition.type === 'survive_turns' || condition.type === 'win_in_turns') && (
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
      {showValidationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-stone-800 rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              {isValidating ? (
                <>
                  <span className="animate-spin">⏳</span> Validating Puzzle...
                </>
              ) : validationResult?.solvable ? (
                <>
                  <span className="text-green-400">✓</span> Puzzle is Solvable!
                </>
              ) : (
                <>
                  <span className="text-red-400">✗</span> Puzzle Not Solvable
                </>
              )}
            </h2>

            {isValidating ? (
              <div className="text-stone-400 text-center py-4">
                <p>Testing character placement combinations...</p>
                <p className="text-sm mt-2">This may take a few seconds.</p>
              </div>
            ) : validationResult ? (
              <div className="space-y-3">
                {validationResult.error && (
                  <div className="bg-red-900/30 border border-red-700 rounded p-3 text-sm">
                    <span className="font-semibold text-red-400">Issue: </span>
                    {validationResult.error}
                  </div>
                )}

                {validationResult.warnings && validationResult.warnings.length > 0 && (
                  <div className="bg-yellow-900/30 border border-yellow-700 rounded p-3 text-sm">
                    <span className="font-semibold text-yellow-400 block mb-1">Warnings:</span>
                    <ul className="space-y-0.5 text-yellow-200/80">
                      {validationResult.warnings.map((w, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="text-yellow-500 flex-shrink-0">{'•'}</span>
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {validationResult.solvable && validationResult.solutionFound && (
                  <>
                    <div className="bg-green-900/30 border border-green-700 rounded p-3">
                      <div className="font-semibold text-green-400 mb-2">Solution Found!</div>
                      <div className="text-sm space-y-1">
                        <div>
                          <span className="text-stone-400">Minimum characters needed: </span>
                          <span className="text-parchment-100 font-bold">{validationResult.minCharactersNeeded}</span>
                        </div>
                        <div>
                          <span className="text-stone-400">Fastest solution: </span>
                          <span className="text-parchment-100 font-bold">{validationResult.solutionFound.turnsToWin} turns</span>
                        </div>
                        <div>
                          <span className="text-stone-400">Combinations tested: </span>
                          <span className="text-parchment-100">{validationResult.totalCombinationsTested.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-stone-400">Search time: </span>
                          <span className="text-parchment-100">{(validationResult.searchTimeMs / 1000).toFixed(2)}s</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-stone-700/50 rounded p-3">
                      <div className="font-semibold text-parchment-300 mb-2 text-sm">Optimal Placement:</div>

                      {/* Visual Mini-Map */}
                      <div className="flex justify-center mb-3">
                        <div
                          className="inline-grid gap-px bg-stone-600 p-px rounded"
                          style={{
                            gridTemplateColumns: `repeat(${state.gridWidth}, minmax(0, 1fr))`,
                          }}
                        >
                          {Array.from({ length: state.gridHeight }).map((_, y) =>
                            Array.from({ length: state.gridWidth }).map((_, x) => {
                              const tile = state.tiles[y]?.[x];
                              const placement = validationResult.solutionFound?.placements.find(
                                p => p.x === x && p.y === y
                              );
                              const charData = placement ? getCharacter(placement.characterId) : null;
                              const enemy = state.enemies.find(e => e.x === x && e.y === y);

                              // Determine tile background color
                              let bgColor = 'bg-stone-800'; // empty
                              if (!tile) bgColor = 'bg-stone-950'; // void
                              else if (tile.type === 'wall') bgColor = 'bg-stone-600';
                              else if (tile.type === 'goal') bgColor = 'bg-yellow-600/50';
                              else if (tile.customTileTypeId) bgColor = 'bg-purple-900/50';

                              // Calculate cell size based on grid dimensions
                              const maxSize = 280; // max width of mini-map
                              const cellSize = Math.min(24, Math.floor(maxSize / Math.max(state.gridWidth, state.gridHeight)));

                              // Direction arrow mapping
                              const directionArrows: Record<string, string> = {
                                north: '↑', northeast: '↗', east: '→', southeast: '↘',
                                south: '↓', southwest: '↙', west: '←', northwest: '↖',
                              };

                              return (
                                <div
                                  key={`${x}-${y}`}
                                  className={`${bgColor} relative flex items-center justify-center`}
                                  style={{ width: cellSize, height: cellSize }}
                                  title={placement
                                    ? `${charData?.name || placement.characterId} facing ${placement.facing}`
                                    : enemy
                                    ? 'Enemy'
                                    : `(${x}, ${y})`
                                  }
                                >
                                  {placement && (
                                    <div className="absolute inset-0 m-0.5 flex items-center justify-center overflow-hidden rounded">
                                      {charData?.customSprite ? (
                                        <SpriteThumbnail sprite={charData.customSprite} size={cellSize - 2} previewType="entity" />
                                      ) : (
                                        <div className="w-full h-full bg-green-500 rounded-full flex items-center justify-center">
                                          <span className="text-parchment-100 font-bold" style={{ fontSize: Math.max(8, cellSize - 8) }}>
                                            {directionArrows[placement.facing] || '•'}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {enemy && !placement && (
                                    <div className="absolute inset-0 bg-red-500 rounded-sm m-0.5 flex items-center justify-center">
                                      <span className="text-parchment-100" style={{ fontSize: Math.max(6, cellSize - 10) }}>E</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Legend */}
                      <div className="flex flex-wrap gap-3 text-xs text-stone-400 mb-2 justify-center">
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                          <span>Character</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
                          <span>Enemy</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-stone-600"></div>
                          <span>Wall</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-yellow-600/50 border border-yellow-600"></div>
                          <span>Goal</span>
                        </div>
                      </div>

                      {/* Text details */}
                      <div className="space-y-1 text-sm border-t border-stone-600 pt-2">
                        {validationResult.solutionFound.placements.map((p, i) => {
                          const charData = getCharacter(p.characterId);
                          const directionArrows: Record<string, string> = {
                            north: '↑', northeast: '↗', east: '→', southeast: '↘',
                            south: '↓', southwest: '↙', west: '←', northwest: '↖',
                          };
                          return (
                            <div key={i} className="flex items-center gap-2">
                              {charData?.customSprite ? (
                                <div className="w-5 h-5 flex-shrink-0">
                                  <SpriteThumbnail sprite={charData.customSprite} size={20} previewType="entity" />
                                </div>
                              ) : (
                                <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-parchment-100 text-xs font-bold flex-shrink-0">
                                  {directionArrows[p.facing]}
                                </div>
                              )}
                              <span className="text-parchment-100">{charData?.name || p.characterId}</span>
                              <span className="text-stone-500">at ({p.x + 1}, {p.y + 1}) facing {p.facing}</span>
                              {p.spellDirectionOverrides && Object.keys(p.spellDirectionOverrides).length > 0 && (
                                <span className="text-purple-300 text-xs">
                                  {Object.entries(p.spellDirectionOverrides).map(([spellId, dir]) => {
                                    const spell = loadSpellAsset(spellId);
                                    return `[${spell?.name || 'redirect'} → ${dir}]`;
                                  }).join(' ')}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                <div className="text-xs text-stone-500 pt-2 border-t border-stone-700">
                  Tested {validationResult.totalCombinationsTested.toLocaleString()} combinations in{' '}
                  {(validationResult.searchTimeMs / 1000).toFixed(2)}s
                </div>
              </div>
            ) : null}

            <button
              onClick={() => setShowValidationModal(false)}
              className="mt-4 w-full px-4 py-2 bg-stone-600 rounded hover:bg-stone-700"
            >
              Close
            </button>
          </div>
        </div>
      )}

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
                    ['3', 'Object tool'],
                    ['4', 'Item tool'],
                    ['5', 'Heroes tool'],
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

// Helper functions
function createEmptyGrid(width: number, height: number): TileOrNull[][] {
  const grid: TileOrNull[][] = [];
  for (let y = 0; y < height; y++) {
    const row: TileOrNull[] = [];
    for (let x = 0; x < width; x++) {
      row.push({ x, y, type: TileType.EMPTY });
    }
    grid.push(row);
  }
  return grid;
}

// Use centralized image loader with load notifications
// Alias for backward compatibility with existing code
const loadSkinImage = loadImage;

function drawDungeonBorder(ctx: CanvasRenderingContext2D, gridWidth: number, gridHeight: number, skin?: PuzzleSkin | null) {
  const gridPixelWidth = gridWidth * TILE_SIZE;
  const gridPixelHeight = gridHeight * TILE_SIZE;
  const totalWidth = gridPixelWidth + (SIDE_BORDER_SIZE * 2);
  const totalHeight = gridPixelHeight + (BORDER_SIZE * 2);

  ctx.save();

  // Background behind border (dark void)
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // Check if skin has custom border sprites
  const hasCustomBorders = skin && Object.keys(skin.borderSprites).length > 0;

  if (hasCustomBorders && skin) {
    // Draw custom border sprites
    const sprites = skin.borderSprites;
    const wallFrontImg = loadSkinImage(sprites.wallFront || '');
    const wallSideImg = loadSkinImage(sprites.wallSide || '');
    const wallBottomOuterImg = loadSkinImage(sprites.wallBottomOuter || sprites.wallFront || '');
    const cornerTLImg = loadSkinImage(sprites.cornerTopLeft || '');
    const cornerTRImg = loadSkinImage(sprites.cornerTopRight || '');
    const cornerBLImg = loadSkinImage(sprites.cornerBottomLeft || '');
    const cornerBRImg = loadSkinImage(sprites.cornerBottomRight || '');

    // Top wall
    if (wallFrontImg?.complete) {
      for (let x = SIDE_BORDER_SIZE; x < SIDE_BORDER_SIZE + gridPixelWidth; x += TILE_SIZE) {
        ctx.drawImage(wallFrontImg, x, 0, TILE_SIZE, BORDER_SIZE);
      }
    }

    // Bottom wall
    if (wallBottomOuterImg?.complete) {
      for (let x = SIDE_BORDER_SIZE; x < SIDE_BORDER_SIZE + gridPixelWidth; x += TILE_SIZE) {
        ctx.drawImage(wallBottomOuterImg, x, BORDER_SIZE + gridPixelHeight, TILE_SIZE, BORDER_SIZE);
      }
    }

    // Left wall
    if (wallSideImg?.complete) {
      for (let y = BORDER_SIZE; y < BORDER_SIZE + gridPixelHeight; y += TILE_SIZE) {
        ctx.drawImage(wallSideImg, 0, y, SIDE_BORDER_SIZE, TILE_SIZE);
      }
    }

    // Right wall (mirrored)
    if (wallSideImg?.complete) {
      for (let y = BORDER_SIZE; y < BORDER_SIZE + gridPixelHeight; y += TILE_SIZE) {
        ctx.save();
        ctx.translate(SIDE_BORDER_SIZE + gridPixelWidth + SIDE_BORDER_SIZE, y);
        ctx.scale(-1, 1);
        ctx.drawImage(wallSideImg, 0, 0, SIDE_BORDER_SIZE, TILE_SIZE);
        ctx.restore();
      }
    }

    // Corners
    if (cornerTLImg?.complete) ctx.drawImage(cornerTLImg, 0, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
    if (cornerTRImg?.complete) ctx.drawImage(cornerTRImg, SIDE_BORDER_SIZE + gridPixelWidth, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
    if (cornerBLImg?.complete) ctx.drawImage(cornerBLImg, 0, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);
    if (cornerBRImg?.complete) ctx.drawImage(cornerBRImg, SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);
  } else {
    // Default dungeon style rendering
    // Top wall (front-facing with depth)
    ctx.fillStyle = '#3a3a4a'; // Stone color
    ctx.fillRect(0, 0, totalWidth, BORDER_SIZE);

    // Add stone texture/depth to top wall
    ctx.fillStyle = '#2a2a3a'; // Shadow
    for (let x = 0; x < totalWidth; x += TILE_SIZE) {
      ctx.fillRect(x, BORDER_SIZE - 12, TILE_SIZE - 2, 12);
    }

    // Top wall highlight
    ctx.fillStyle = '#4a4a5a';
    for (let x = 0; x < totalWidth; x += TILE_SIZE) {
      ctx.fillRect(x, 0, TILE_SIZE - 2, 8);
    }

    // Bottom wall (simpler, just top edge visible)
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(0, BORDER_SIZE + gridPixelHeight, totalWidth, BORDER_SIZE);

    // Bottom wall top edge
    ctx.fillStyle = '#3a3a4a';
    ctx.fillRect(0, BORDER_SIZE + gridPixelHeight, totalWidth, 8);

    // Left wall (side view - THINNER)
    ctx.fillStyle = '#323242';
    ctx.fillRect(0, BORDER_SIZE, SIDE_BORDER_SIZE, gridPixelHeight);

    // Left wall inner edge
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(SIDE_BORDER_SIZE - 6, BORDER_SIZE, 6, gridPixelHeight);

    // Right wall (side view - THINNER)
    ctx.fillStyle = '#323242';
    ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE, SIDE_BORDER_SIZE, gridPixelHeight);

    // Right wall inner edge
    ctx.fillStyle = '#3a3a4a';
    ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE, 6, gridPixelHeight);

    // Corners (darker, showing depth)
    ctx.fillStyle = '#1a1a2a';
    // Top-left
    ctx.fillRect(0, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
    // Top-right
    ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
    // Bottom-left
    ctx.fillRect(0, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);
    // Bottom-right
    ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);
  }

  ctx.restore();
}

function drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, tile: TileOrNull, skin?: PuzzleSkin | null) {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;

  if (!tile) {
    // Void tile
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = '#151515';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + TILE_SIZE, py + TILE_SIZE);
    ctx.moveTo(px + TILE_SIZE, py);
    ctx.lineTo(px, py + TILE_SIZE);
    ctx.stroke();
    return;
  }

  // Check for custom tile type
  let customTileType: CustomTileType | null = null;
  if (tile.customTileTypeId) {
    customTileType = loadTileType(tile.customTileTypeId);
  }

  // Determine base tile color for transparency support
  const isWall = tile.type === TileType.WALL;
  const baseColor = isWall ? '#4a4a4a' : '#2a2a2a';

  // Priority 1: Check for skin-specific custom tile sprite
  const customTileSprites = skin?.customTileSprites;
  if (tile.customTileTypeId && customTileSprites?.[tile.customTileTypeId]) {
    const skinSpriteEntry = customTileSprites[tile.customTileTypeId];
    let spriteData: string | undefined;
    if (typeof skinSpriteEntry === 'string') {
      spriteData = skinSpriteEntry;
    } else {
      // In editor, default to "on" state sprite
      spriteData = skinSpriteEntry.onSprite || skinSpriteEntry.offSprite;
    }

    if (spriteData) {
      const customImg = loadSkinImage(spriteData);
      if (customImg?.complete) {
        ctx.fillStyle = baseColor;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        ctx.drawImage(customImg, px, py, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
        if (customTileType) {
          drawTileBehaviorIndicators(ctx, px, py, customTileType, tile);
        }
        return;
      }
    }
  }

  // Priority 2: Draw tile type's default custom sprite if available (supports both data URLs and HTTP URLs)
  const tileTypeSpriteSource = resolveImageSource(customTileType?.customSprite?.idleImageData, customTileType?.customSprite?.idleImageUrl);
  if (tileTypeSpriteSource) {
    const customImg = loadSkinImage(tileTypeSpriteSource);
    if (customImg?.complete) {
      // Draw base color first for transparency support
      ctx.fillStyle = baseColor;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.drawImage(customImg, px, py, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      if (customTileType) {
        drawTileBehaviorIndicators(ctx, px, py, customTileType, tile);
      }
      return;
    }
  }

  // Second: Use skin tile sprites if available
  const tileSprites = skin?.tileSprites;
  const spriteKey = isWall ? 'wall' : 'empty';
  const spriteUrl = tileSprites?.[spriteKey];

  if (spriteUrl) {
    const tileImg = loadSkinImage(spriteUrl);
    if (tileImg?.complete) {
      // Draw base color first for transparency support
      ctx.fillStyle = baseColor;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.drawImage(tileImg, px, py, TILE_SIZE, TILE_SIZE);
    } else {
      // Fallback while image loads
      ctx.fillStyle = baseColor;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }
  } else {
    // Default colors
    ctx.fillStyle = baseColor;
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  }

  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

  // Draw behavior indicators if this is a custom tile
  if (customTileType) {
    drawTileBehaviorIndicators(ctx, px, py, customTileType, tile);
  }
}

/**
 * Draw visual indicators for tile behaviors in the map editor
 */
function drawTileBehaviorIndicators(ctx: CanvasRenderingContext2D, px: number, py: number, tileType: CustomTileType, tile: TileOrNull) {
  const centerX = px + TILE_SIZE / 2;
  const centerY = py + TILE_SIZE / 2;

  for (const behavior of tileType.behaviors) {
    switch (behavior.type) {
      case 'damage':
        // Red tint overlay
        ctx.fillStyle = 'rgba(255, 0, 0, 0.25)';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        // Fire icon
        ctx.font = '16px Arial';
        ctx.fillStyle = 'rgba(255, 100, 0, 0.9)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔥', centerX, centerY);
        break;

      case 'teleport': {
        // Purple glow
        ctx.fillStyle = 'rgba(128, 0, 255, 0.25)';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        // Show teleport group letter
        const groupId = tile?.teleportGroupId || behavior.teleportGroupId || 'A';
        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = 'rgba(200, 100, 255, 1)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(groupId, centerX, centerY);
        break;
      }

      case 'direction_change': {
        // Arrow showing forced direction
        ctx.fillStyle = 'rgba(0, 200, 255, 0.25)';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        const arrow = getDirectionArrow(behavior.newFacing);
        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = 'rgba(0, 200, 255, 1)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(arrow, centerX, centerY);
        break;
      }

      case 'ice':
        // Blue tint with diagonal lines
        ctx.fillStyle = 'rgba(100, 200, 255, 0.3)';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        // Draw diagonal lines pattern
        ctx.save();
        ctx.beginPath();
        ctx.rect(px, py, TILE_SIZE, TILE_SIZE);
        ctx.clip();
        ctx.strokeStyle = 'rgba(150, 220, 255, 0.6)';
        ctx.lineWidth = 1;
        for (let i = -TILE_SIZE; i < TILE_SIZE * 2; i += 8) {
          ctx.beginPath();
          ctx.moveTo(px + i, py);
          ctx.lineTo(px + i + TILE_SIZE, py + TILE_SIZE);
          ctx.stroke();
        }
        ctx.restore();
        break;

      case 'pressure_plate':
        // Button-like appearance
        ctx.fillStyle = 'rgba(100, 100, 100, 0.4)';
        ctx.fillRect(px + 8, py + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        ctx.strokeStyle = 'rgba(60, 60, 60, 0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 8, py + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        break;
    }
  }
}

/**
 * Get arrow character for direction
 */
function getDirectionArrow(direction?: string): string {
  switch (direction) {
    case 'north': return '↑';
    case 'northeast': return '↗';
    case 'east': return '→';
    case 'southeast': return '↘';
    case 'south': return '↓';
    case 'southwest': return '↙';
    case 'west': return '←';
    case 'northwest': return '↖';
    default: return '→';
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, x: number, y: number, enemyId?: string) {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;

  // Try to get enemy data and draw custom sprite if available
  if (enemyId) {
    const enemyData = getEnemy(enemyId);
    if (enemyData && 'customSprite' in enemyData && enemyData.customSprite) {
      drawSprite(ctx, enemyData.customSprite, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE);
      return;
    }
  }

  // Fallback to red circle if no custom sprite
  ctx.fillStyle = '#f44336';
  ctx.beginPath();
  ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE / 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawCollectibleInEditor(
  ctx: CanvasRenderingContext2D,
  collectible: { x: number; y: number; collectibleId?: string; type?: 'coin' | 'gem' }
) {
  const { x, y, collectibleId, type } = collectible;
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;

  // Try to load custom collectible data
  const collectibleData = collectibleId ? loadCollectible(collectibleId) : null;

  // If we have custom collectible data with a sprite, draw it
  if (collectibleData?.customSprite) {
    // Calculate center position based on anchor point
    const centerX = px + TILE_SIZE / 2;
    let centerY = py + TILE_SIZE / 2;

    if (collectibleData.anchorPoint === 'bottom_center') {
      const spriteHeight = getSpriteDrawHeight(collectibleData.customSprite, TILE_SIZE);
      centerY = py + TILE_SIZE / 2 - spriteHeight / 2;
    }

    // Draw the sprite (without animation/imageCache for editor simplicity)
    drawSprite(ctx, collectibleData.customSprite, centerX, centerY, TILE_SIZE);
    return;
  }

  // Legacy fallback: draw based on type
  if (type === 'gem') {
    ctx.fillStyle = '#9c27b0';
    ctx.beginPath();
    const cx = px + TILE_SIZE / 2;
    const cy = py + TILE_SIZE / 2;
    const size = TILE_SIZE / 3;
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx + size, cy);
    ctx.lineTo(cx, cy + size);
    ctx.lineTo(cx - size, cy);
    ctx.closePath();
    ctx.fill();
    return;
  }

  // Default: draw a star shape (original behavior for coins and unknown types)
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  const cx = px + TILE_SIZE / 2;
  const cy = py + TILE_SIZE / 2;
  const spikes = 5;
  const outerRadius = TILE_SIZE / 4;
  const innerRadius = TILE_SIZE / 8;

  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const sx = cx + Math.cos(angle) * radius;
    const sy = cy + Math.sin(angle) * radius;

    if (i === 0) {
      ctx.moveTo(sx, sy);
    } else {
      ctx.lineTo(sx, sy);
    }
  }

  ctx.closePath();
  ctx.fill();
}

function drawObject(ctx: CanvasRenderingContext2D, x: number, y: number, objectId: string) {
  const objectData = loadObject(objectId);
  if (!objectData) return;

  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;

  // Offsets are whole art pixels (native-size rule); legacy tile-fraction
  // offsets and the old scale knob are migrated away in assetStorage.
  const zoom = TILE_SIZE / ART_TILE_PX;
  const offsetX = (objectData.offsetX ?? 0) * zoom;
  const offsetY = (objectData.offsetY ?? 0) * zoom;

  // Calculate center position based on anchor point, then apply offsets.
  let centerX = px + TILE_SIZE / 2;
  let centerY = py + TILE_SIZE / 2;

  if (objectData.anchorPoint === 'bottom_center' && objectData.customSprite) {
    // For bottom_center: sprite's bottom edge aligns with tile's center
    // So sprite center is offset upward by half the sprite height
    const spriteHeight = getSpriteDrawHeight(objectData.customSprite, TILE_SIZE);
    centerY = py + TILE_SIZE / 2 - spriteHeight / 2;
  }

  centerX += offsetX;
  centerY += offsetY;

  // Draw custom sprite if available
  if (objectData.customSprite) {
    // Use drawSprite which handles images, spritesheets, and shape fallbacks
    drawSprite(ctx, objectData.customSprite, centerX, centerY, TILE_SIZE);
  } else {
    // Fallback: draw a simple brown square (centered, with offsets applied)
    const fallback = TILE_SIZE / 2;
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(centerX - fallback / 2, centerY - fallback / 2, fallback, fallback);
  }
}

