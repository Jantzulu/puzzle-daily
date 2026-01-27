import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { Puzzle, TileOrNull, PlacedEnemy, PlacedCollectible, PlacedObject, WinCondition, WinConditionType, WinConditionParams, GameState, PlacedCharacter, BorderConfig, CharacterAction, SpellAsset, SideQuest, SideQuestType, PuzzleScore } from '../../types/game';
import { TileType, Direction, ActionType } from '../../types/game';
import { getAllCharacters, getCharacter, type CharacterWithSprite } from '../../data/characters';
import { getAllEnemies, getEnemy, type EnemyWithSprite } from '../../data/enemies';
import { drawSprite } from './SpriteEditor';
import { initializeGameState, executeTurn } from '../../engine/simulation';
import { AnimatedGameBoard, ResponsiveGameBoard } from '../game/AnimatedGameBoard';
import { Controls } from '../game/Controls';
import { CharacterSelector } from '../game/CharacterSelector';
import { EnemyDisplay } from '../game/EnemyDisplay';
import { StatusEffectsDisplay } from '../game/StatusEffectsDisplay';
import { SpecialTilesDisplay } from '../game/SpecialTilesDisplay';
import { ItemsDisplay } from '../game/ItemsDisplay';
import { HelpButton } from '../game/HelpOverlay';
import { playGameSound, playVictoryMusic, playDefeatMusic, playBackgroundMusic, stopMusic } from '../../utils/gameSounds';
import { calculateScore, getRankEmoji, getRankName } from '../../engine/scoring';
import { savePuzzle, getSavedPuzzles, deletePuzzle, loadPuzzle, type SavedPuzzle } from '../../utils/puzzleStorage';
import { cacheEditorState, getCachedEditorState, clearCachedEditorState } from '../../utils/editorState';
import { getAllPuzzleSkins, loadPuzzleSkin, getCustomTileTypes, loadTileType, loadSpellAsset, getAllObjects, loadObject, getAllCollectibles, loadCollectible, loadEnemy, getSoundAssets, extractSpriteImageUrls, extractSpriteReferenceUrls, type CustomObject, type CustomCollectible, type SoundAsset } from '../../utils/assetStorage';
import { loadThemeAssets, subscribeToThemeAssets, type ThemeAssets } from '../../utils/themeAssets';
import { preloadImages } from '../../utils/imageLoader';
import { checkVictoryConditions } from '../../engine/simulation';
import { checkSideQuests } from '../../engine/scoring';
import type { PuzzleSkin } from '../../types/game';
import type { CustomTileType } from '../../utils/assetStorage';
import { SpriteThumbnail } from './SpriteThumbnail';
import { createHistoryManager } from '../../utils/historyManager';
import { loadImage, subscribeToImageLoads } from '../../utils/imageLoader';
import { subscribeToSpriteImageLoads } from './SpriteEditor';
import { FolderDropdown, useFilteredAssets } from './FolderDropdown';
import { PuzzleLibraryModal } from './PuzzleLibraryModal';
import { solvePuzzleAsync, quickValidate, type SolverResult } from '../../engine/puzzleSolver';
import { WarningModal } from '../shared/WarningModal';
import GeneratorDialog from './GeneratorDialog';

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
    // Check for CUSTOM_ATTACK action type (inline attack definition - legacy)
    if (action.type === ActionType.CUSTOM_ATTACK && action.customAttack) {
      const attack = action.customAttack;
      if (!seenIds.has(attack.id)) {
        spells.push({
          id: attack.id,
          name: attack.name,
          description: `${attack.pattern} attack`,
          templateType: attack.pattern === 'projectile' ? 'range_linear' : 'melee',
          damage: attack.damage,
          range: attack.range,
          thumbnailIcon: '', // No thumbnail for inline attacks
        } as SpellAsset);
        seenIds.add(attack.id);
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
      case ActionType.CUSTOM_ATTACK:
        return `${num}. ${action.customAttack?.name || 'Attack'}`;
      case ActionType.ATTACK_RANGE:
        return `${num}. Ranged Attack`;
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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  selectedTool: 'wall',
  isDrawing: false,
  mode: 'edit',
});

export const MapEditor: React.FC = () => {
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
      };
    }
    return createDefaultEditorState();
  });

  // Playtest state
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [originalPlaytestPuzzle, setOriginalPlaytestPuzzle] = useState<Puzzle | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [livesRemaining, setLivesRemaining] = useState<number>(3);
  const [puzzleScore, setPuzzleScore] = useState<PuzzleScore | null>(null);
  const [playStartCharacters, setPlayStartCharacters] = useState<PlacedCharacter[]>([]);
  const [showGameOver, setShowGameOver] = useState(false);
  const [defeatReason, setDefeatReason] = useState<'damage' | 'turns' | null>(null);
  const [showConcedeConfirm, setShowConcedeConfirm] = useState(false);
  const [themeAssets, setThemeAssets] = useState<ThemeAssets>(() => loadThemeAssets());

  // Test mode state
  type TestMode = 'none' | 'enemies' | 'characters';
  const [testMode, setTestMode] = useState<TestMode>('none');
  const [testTurnsRemaining, setTestTurnsRemaining] = useState(0);
  const testSnapshotRef = useRef<{
    characters: PlacedCharacter[];
    enemies: PlacedEnemy[];
    puzzle: Puzzle;
  } | null>(null);

  // Library state
  const [savedPuzzles, setSavedPuzzles] = useState<SavedPuzzle[]>(() => getSavedPuzzles());
  const [showLibrary, setShowLibrary] = useState(false);

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

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle in edit mode
      if (state.mode !== 'edit') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.mode, handleUndo, handleRedo]);

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
        selectedTool: state.selectedTool,
      });
    }
  }, [state]);

  // Subscribe to theme asset changes
  useEffect(() => {
    const unsubscribe = subscribeToThemeAssets((assets) => {
      setThemeAssets(assets);
    });
    return unsubscribe;
  }, []);

  // Preload sprite assets when entering playtest mode
  useEffect(() => {
    if (state.mode !== 'playtest' || !originalPlaytestPuzzle) return;

    const urlsToPreload: string[] = [];

    // Helper to preload spell sprites
    const preloadSpellSprites = (spellId: string) => {
      const spell = loadSpellAsset(spellId);
      if (spell) {
        urlsToPreload.push(...extractSpriteReferenceUrls(spell.projectileSprite));
        urlsToPreload.push(...extractSpriteReferenceUrls(spell.aoeEffectSprite));
        urlsToPreload.push(...extractSpriteReferenceUrls(spell.hitEffectSprite));
        urlsToPreload.push(...extractSpriteReferenceUrls(spell.healingEffectSprite));
        urlsToPreload.push(...extractSpriteReferenceUrls(spell.persistVisualSprite));
      }
    };

    // Preload character sprites
    for (const charId of originalPlaytestPuzzle.availableCharacters) {
      const charData = getCharacter(charId);
      if (charData?.customSprite) {
        urlsToPreload.push(...extractSpriteImageUrls(charData.customSprite));
      }
      if (charData?.behavior) {
        for (const action of charData.behavior) {
          if (action.spellId) preloadSpellSprites(action.spellId);
        }
      }
    }

    // Preload enemy sprites
    for (const enemy of originalPlaytestPuzzle.enemies) {
      const enemyData = getEnemy(enemy.enemyId);
      if (enemyData?.customSprite) {
        urlsToPreload.push(...extractSpriteImageUrls(enemyData.customSprite));
      }
      const pattern = enemyData?.behavior?.pattern;
      if (pattern) {
        for (const action of pattern) {
          if (action.spellId) preloadSpellSprites(action.spellId);
        }
      }
    }

    // Preload custom tile sprites
    for (const row of originalPlaytestPuzzle.tiles) {
      for (const tile of row) {
        if (tile?.customType) {
          const tileData = loadTileType(tile.customType);
          if (tileData?.customSprite) {
            urlsToPreload.push(...extractSpriteImageUrls(tileData.customSprite));
          }
          if (tileData?.offStateSprite) {
            urlsToPreload.push(...extractSpriteImageUrls(tileData.offStateSprite));
          }
        }
      }
    }

    // Preload collectible sprites
    for (const collectible of originalPlaytestPuzzle.collectibles) {
      if (collectible.collectibleId) {
        const collectibleData = loadCollectible(collectible.collectibleId);
        if (collectibleData?.customSprite) {
          urlsToPreload.push(...extractSpriteImageUrls(collectibleData.customSprite));
        }
      }
    }

    // Preload object sprites
    if (originalPlaytestPuzzle.objects) {
      for (const obj of originalPlaytestPuzzle.objects) {
        if (obj.objectId) {
          const objectData = loadObject(obj.objectId);
          if (objectData?.customSprite) {
            urlsToPreload.push(...extractSpriteImageUrls(objectData.customSprite));
          }
        }
      }
    }

    // Preload skin sprites
    if (originalPlaytestPuzzle.skinId) {
      const skin = loadPuzzleSkin(originalPlaytestPuzzle.skinId);
      if (skin) {
        if (skin.borderSprites) {
          const borderKeys = ['topLeft', 'top', 'topRight', 'left', 'right', 'bottomLeft', 'bottom', 'bottomRight'] as const;
          for (const key of borderKeys) {
            if (skin.borderSprites[key]) urlsToPreload.push(skin.borderSprites[key]);
          }
        }
        if (skin.tileSprites) {
          const { floor, wall, void: voidSprite } = skin.tileSprites;
          if (floor) urlsToPreload.push(floor);
          if (wall) urlsToPreload.push(wall);
          if (voidSprite) urlsToPreload.push(voidSprite);
        }
      }
    }

    if (urlsToPreload.length > 0) {
      preloadImages(urlsToPreload);
    }
  }, [state.mode, originalPlaytestPuzzle?.id]);

  // Simulation loop (for playtest mode)
  useEffect(() => {
    if (!isSimulating || !gameState || gameState.gameStatus !== 'running') {
      return;
    }

    const interval = setInterval(() => {
      // Check if we're in test mode and count turns
      if (testMode !== 'none') {
        if (testTurnsRemaining <= 1) {
          // Test mode finished - restore snapshot
          if (testSnapshotRef.current) {
            const snapshot = testSnapshotRef.current;
            const restoredPuzzle = JSON.parse(JSON.stringify(snapshot.puzzle));
            const restoredState = initializeGameState(restoredPuzzle);
            restoredState.placedCharacters = JSON.parse(JSON.stringify(snapshot.characters)).map((char: PlacedCharacter) => {
              const charData = getCharacter(char.characterId);
              return {
                ...char,
                actionIndex: 0,
                currentHealth: charData ? charData.health : char.currentHealth,
                dead: false,
                active: true,
              };
            });
            restoredState.gameStatus = 'setup';
            setGameState(restoredState);
          }
          setIsSimulating(false);
          setTestMode('none');
          setTestTurnsRemaining(0);
          testSnapshotRef.current = null;
          return;
        }
        setTestTurnsRemaining(prev => prev - 1);
      }

      setGameState((prevState) => {
        if (!prevState) return prevState;
        // Deep copy to handle React StrictMode double-invoke
        const stateCopy = JSON.parse(JSON.stringify(prevState));
        // Restore tileStates Map with deep copied Sets
        stateCopy.tileStates = new Map();
        if (prevState.tileStates) {
          prevState.tileStates.forEach((value, key) => {
            stateCopy.tileStates.set(key, {
              ...value,
              damagedEntities: value.damagedEntities ? new Set(value.damagedEntities) : undefined
            });
          });
        }
        const newState = executeTurn(stateCopy);

        // Stop simulation if game ended (only in normal mode)
        if (testMode === 'none' && newState.gameStatus !== 'running') {
          setIsSimulating(false);

          // Handle victory
          if (newState.gameStatus === 'victory' && originalPlaytestPuzzle) {
            playGameSound('victory');
            playVictoryMusic();
            // Calculate and store score
            const score = calculateScore(newState, livesRemaining, originalPlaytestPuzzle.lives ?? 3);
            setPuzzleScore(score);
          }

          // Handle defeat - deduct a life and auto-reset (or show game over)
          if (newState.gameStatus === 'defeat' && originalPlaytestPuzzle) {
            const puzzleLives = originalPlaytestPuzzle.lives ?? 3;
            const isUnlimitedLives = puzzleLives === 0;

            // Determine defeat reason
            const maxTurns = originalPlaytestPuzzle.maxTurns || 1000;
            const ranOutOfTurns = newState.currentTurn >= maxTurns;
            setDefeatReason(ranOutOfTurns ? 'turns' : 'damage');

            playGameSound('defeat');

            if (!isUnlimitedLives) {
              const newLives = livesRemaining - 1;
              setLivesRemaining(newLives);

              if (newLives <= 0) {
                // No lives left - show game over
                setShowGameOver(true);
                playDefeatMusic();
              } else {
                // Life lost - play sound and auto-reset after delay (3 seconds)
                playGameSound('life_lost');
                setTimeout(() => {
                  handleAutoResetPlaytest();
                }, 3000);
              }
            }
          }
        }

        return newState;
      });
    }, 800);

    return () => clearInterval(interval);
  }, [isSimulating, gameState?.gameStatus, testMode, testTurnsRemaining, livesRemaining, originalPlaytestPuzzle]);

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
    if (state.selectedTool === 'enemy') {
      if (!selectedEnemyId) {
        alert('Please select an enemy type first!');
        return;
      }

      const enemyType = allEnemies.find(e => e.id === selectedEnemyId);
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
        alert('Please select an object type first!');
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
        alert('Please select a custom tile type first!');
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

          // For tiles with on/off states, assign trigger group if selected
          let triggerGroupId: string | undefined;
          const hasOnOffStates = tileType.cadence?.enabled || tileType.canBeTriggered || tileType.offStateSprite;
          if (hasOnOffStates && selectedTriggerGroupId) {
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
    };
  };

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
      setSavedPuzzles(getSavedPuzzles());
      alert(`Saved "${state.puzzleName}"!`);
    }
    // If save failed, safeLocalStorageSet already showed an error alert
  };

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
      setState(prev => ({
        ...prev,
        puzzleId: newId,
        puzzleName: newName,
      }));
      setSavedPuzzles(getSavedPuzzles());
      alert(`Saved as "${newName}"!`);
    }
    // If save failed, safeLocalStorageSet already showed an error alert
  };

  const handleExport = () => {
    const puzzle = getCurrentPuzzle();
    const json = JSON.stringify(puzzle, null, 2);

    // Copy to clipboard
    navigator.clipboard.writeText(json).then(() => {
      alert('Puzzle JSON copied to clipboard!');
    });
  };

  const handleLoadFromLibrary = (puzzleId: string) => {
    const puzzle = loadPuzzle(puzzleId);
    if (!puzzle) return;

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
      availableCharacters: puzzle.availableCharacters,
      winConditions: puzzle.winConditions,
      skinId: puzzle.skinId || 'builtin_dungeon',
      backgroundMusicId: puzzle.backgroundMusicId,
      parCharacters: puzzle.parCharacters,
      parTurns: puzzle.parTurns,
      sideQuests: puzzle.sideQuests || [],
    }));

    setShowLibrary(false);
  };

  const handleDeleteFromLibrary = (puzzleId: string) => {
    if (!confirm('Delete this puzzle from library?')) return;
    deletePuzzle(puzzleId);
    setSavedPuzzles(getSavedPuzzles());
  };

  const handleNewPuzzle = () => {
    if (!confirm('Create new puzzle? Unsaved changes will be lost.')) return;

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
      maxTurns: 100,
      lives: 3,
      availableCharacters: [],
      winConditions: [{ type: 'defeat_all_enemies' }],
      skinId: 'builtin_dungeon',
      parCharacters: undefined,
      parTurns: undefined,
      sideQuests: [],
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
      }));

      alert('Puzzle loaded successfully!');
    } catch (e) {
      alert('Invalid JSON format: ' + (e as Error).message);
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
      });
      setIsValidating(false);
      return;
    }

    // Run full solver asynchronously to avoid blocking UI
    const runValidation = async () => {
      try {
        // Use async solver that yields to browser periodically
        const result = await solvePuzzleAsync(puzzleForValidation, {
          maxSimulationTurns: state.maxTurns || 200,
          maxCombinations: 50000,
          yieldEvery: 50, // Yield every 50 combinations to keep UI responsive
        });
        setValidationResult(result);

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
      const offsetX = 0;
      const offsetY = 0;

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

    // Store deep copy of original puzzle for reset
    setOriginalPlaytestPuzzle(JSON.parse(JSON.stringify(puzzle)));

    setState(prev => ({ ...prev, mode: 'playtest' }));
    setGameState(initializeGameState(puzzle));
    setSelectedCharacterId(null);
    setIsSimulating(false);
    setLivesRemaining(puzzle.lives ?? 3);
    setShowGameOver(false);
    setDefeatReason(null);
    setPuzzleScore(null);
    setPlayStartCharacters([]);

    // Start background music for playtest (puzzle-specific or global fallback)
    playBackgroundMusic(state.backgroundMusicId);
  };

  const handleBackToEditor = () => {
    setState(prev => ({ ...prev, mode: 'edit' }));
    setGameState(null);
    setOriginalPlaytestPuzzle(null);
    setSelectedCharacterId(null);
    stopMusic(); // Stop music when exiting playtest
    setIsSimulating(false);
    setShowGameOver(false);
    setDefeatReason(null);
    setShowConcedeConfirm(false);
    setPuzzleScore(null);
    setPlayStartCharacters([]);
    setLivesRemaining(3);
  };

  const handleTileClick = (x: number, y: number) => {
    if (!gameState || gameState.gameStatus !== 'setup') {
      return;
    }

    // Check if clicking on an already placed character to remove them
    const clickedCharacter = gameState.placedCharacters.find((c) => c.x === x && c.y === y);
    if (clickedCharacter) {
      // Remove the clicked character
      setGameState((prev) => prev ? ({
        ...prev,
        placedCharacters: prev.placedCharacters.filter((c) => c.x !== x || c.y !== y),
      }) : null);
      playGameSound('character_removed');
      return;
    }

    // Need a selected character to place
    if (!selectedCharacterId) {
      return;
    }

    const tile = gameState.puzzle.tiles[y]?.[x];
    if (!tile) {
      playGameSound('error');
      return;
    }

    // Check if custom tile prevents placement
    if (tile.customTileTypeId) {
      const customTileType = loadTileType(tile.customTileTypeId);
      if (customTileType?.preventPlacement) {
        playGameSound('error');
        return;
      }
    }

    // Check if any collectible on this tile prevents placement
    const collectiblesAtPosition = gameState.puzzle.collectibles.filter(
      c => c.x === x && c.y === y && !c.collected
    );
    for (const placed of collectiblesAtPosition) {
      if (placed.collectibleId) {
        const collectible = loadCollectible(placed.collectibleId);
        if (collectible?.preventPlacement) {
          playGameSound('error');
          return;
        }
      }
    }

    const tileHasEnemy = gameState.puzzle.enemies.some((e) => e.x === x && e.y === y && !e.dead);
    if (tileHasEnemy) {
      playGameSound('error');
      return;
    }

    // Check if this character type is already placed (only one of each allowed)
    const alreadyPlaced = gameState.placedCharacters.some((c) => c.characterId === selectedCharacterId);
    if (alreadyPlaced) {
      playGameSound('error');
      return;
    }

    // Check if at max placeable characters
    const maxPlaceable = gameState.puzzle.maxPlaceableCharacters ?? gameState.puzzle.maxCharacters;
    if (gameState.placedCharacters.length >= maxPlaceable) {
      playGameSound('error');
      return;
    }

    const charData = getCharacter(selectedCharacterId);
    if (!charData) return;

    const newCharacter: PlacedCharacter = {
      characterId: selectedCharacterId,
      x,
      y,
      facing: charData.defaultFacing,
      currentHealth: charData.health,
      actionIndex: 0,
      active: true,
      dead: false,
    };

    setGameState((prev) => prev ? ({
      ...prev,
      placedCharacters: [...prev.placedCharacters, newCharacter],
    }) : null);
    playGameSound('character_placed');
  };

  const handlePlay = () => {
    if (!gameState || gameState.placedCharacters.length === 0) {
      setWarningModal({ isOpen: true, message: 'Place at least one hero on the board before starting!' });
      return;
    }

    // Save snapshot of placed characters for Reset
    setPlayStartCharacters(JSON.parse(JSON.stringify(gameState.placedCharacters)));
    setGameState((prev) => prev ? ({ ...prev, gameStatus: 'running' }) : null);
    setIsSimulating(true);
    playGameSound('simulation_start');
  };

  const handlePause = () => {
    setIsSimulating(false);
    playGameSound('simulation_stop');
  };

  const handleReset = () => {
    if (!gameState || !originalPlaytestPuzzle) return;
    // Reset using the original puzzle, not the mutated one from gameState
    const resetPuzzle = JSON.parse(JSON.stringify(originalPlaytestPuzzle));
    const resetState = initializeGameState(resetPuzzle);
    // Restore the placed characters from when Play was pressed, resetting their state
    resetState.placedCharacters = JSON.parse(JSON.stringify(playStartCharacters)).map((char: PlacedCharacter) => {
      const charData = getCharacter(char.characterId);
      return {
        ...char,
        actionIndex: 0,
        currentHealth: charData ? charData.health : char.currentHealth,
        dead: false,
        active: true,
      };
    });
    resetState.gameStatus = playStartCharacters.length > 0 ? 'running' : 'setup';
    setGameState(resetState);
    setIsSimulating(false);
    setSelectedCharacterId(null);
    setPuzzleScore(null);
  };

  const handleWipe = () => {
    if (!originalPlaytestPuzzle) return;
    // Wipe: restore enemy positions but remove all characters (go back to setup)
    const wipedPuzzle = JSON.parse(JSON.stringify(originalPlaytestPuzzle));
    const wipedState = initializeGameState(wipedPuzzle);
    wipedState.placedCharacters = []; // Remove all characters
    wipedState.gameStatus = 'setup'; // Back to setup mode
    setGameState(wipedState);
    setIsSimulating(false);
    setSelectedCharacterId(null);
    setPuzzleScore(null);
  };

  // Show solution from validation - auto-places characters according to solver's solution
  const handleShowSolution = () => {
    if (!gameState || !validationResult?.solutionFound || gameState.gameStatus !== 'setup') return;

    const newPlacedCharacters: PlacedCharacter[] = [];
    for (const placement of validationResult.solutionFound.placements) {
      const charData = getCharacter(placement.characterId);
      if (!charData) continue;

      newPlacedCharacters.push({
        characterId: placement.characterId,
        x: placement.x,
        y: placement.y,
        facing: placement.facing,
        currentHealth: charData.health,
        actionIndex: 0,
        active: true,
        dead: false,
      });
    }

    setGameState((prev) => prev ? ({
      ...prev,
      placedCharacters: newPlacedCharacters,
    }) : null);
    playGameSound('character_placed');
  };

  // Auto-reset after defeat (keeps characters, returns to setup/placement phase)
  const handleAutoResetPlaytest = useCallback(() => {
    if (!originalPlaytestPuzzle) return;
    const resetPuzzle = JSON.parse(JSON.stringify(originalPlaytestPuzzle));
    const resetState = initializeGameState(resetPuzzle);
    // Restore the placed characters from when Play was pressed, resetting their state
    resetState.placedCharacters = JSON.parse(JSON.stringify(playStartCharacters)).map((char: PlacedCharacter) => {
      const charData = getCharacter(char.characterId);
      return {
        ...char,
        actionIndex: 0,
        currentHealth: charData ? charData.health : char.currentHealth,
        dead: false,
        active: true,
      };
    });
    // Return to setup phase so player can adjust character placement
    resetState.gameStatus = 'setup';
    setGameState(resetState);
    setIsSimulating(false);
    setSelectedCharacterId(null);
  }, [originalPlaytestPuzzle, playStartCharacters]);

  // Restart puzzle from game over (reset lives and go to setup)
  const handleRestartPlaytest = () => {
    if (!originalPlaytestPuzzle) return;
    const resetPuzzle = JSON.parse(JSON.stringify(originalPlaytestPuzzle));
    const resetState = initializeGameState(resetPuzzle);
    setGameState(resetState);
    setLivesRemaining(originalPlaytestPuzzle.lives ?? 3);
    setShowGameOver(false);
    setIsSimulating(false);
    setSelectedCharacterId(null);
    setPlayStartCharacters([]);
    setPuzzleScore(null);
    setDefeatReason(null);
  };

  // Concede current attempt - lose a life and return to setup
  const handleConcedePlaytest = () => {
    if (!originalPlaytestPuzzle) return;
    setShowConcedeConfirm(false);
    setIsSimulating(false);
    setDefeatReason('damage'); // Conceding counts as damage death

    const puzzleLives = originalPlaytestPuzzle.lives ?? 3;
    const isUnlimitedLives = puzzleLives === 0;

    playGameSound('defeat');

    if (!isUnlimitedLives) {
      const newLives = livesRemaining - 1;
      setLivesRemaining(newLives);

      if (newLives <= 0) {
        // No lives left - show game over
        setShowGameOver(true);
        playDefeatMusic();
      } else {
        // Life lost - play sound and reset
        playGameSound('life_lost');
        handleAutoResetPlaytest();
      }
    } else {
      // Unlimited lives - just reset
      handleAutoResetPlaytest();
    }
  };

  // Called from AnimatedGameBoard when a projectile kills an enemy
  const handleProjectileKill = useCallback(() => {
    if (!gameState || gameState.gameStatus !== 'running' || !originalPlaytestPuzzle) return;

    // Check if victory conditions are now met
    if (checkVictoryConditions(gameState)) {
      // Victory! Stop simulation and trigger victory handling
      setIsSimulating(false);
      setGameState(prev => prev ? { ...prev, gameStatus: 'victory' } : null);
      playGameSound('victory');
      playVictoryMusic();
      // Calculate and store score
      const score = calculateScore(gameState, livesRemaining, originalPlaytestPuzzle.lives ?? 3);
      setPuzzleScore(score);
    }
  }, [gameState, livesRemaining, originalPlaytestPuzzle]);

  const handleStep = () => {
    if (!gameState) return;

    if (gameState.gameStatus === 'setup') {
      setGameState((prev) => prev ? ({ ...prev, gameStatus: 'running' }) : null);
    }

    if (gameState.gameStatus === 'running') {
      setGameState((prevState) => {
        if (!prevState) return null;
        const stateCopy = JSON.parse(JSON.stringify(prevState));
        stateCopy.tileStates = new Map();
        if (prevState.tileStates) {
          prevState.tileStates.forEach((value, key) => {
            stateCopy.tileStates.set(key, {
              ...value,
              damagedEntities: value.damagedEntities ? new Set(value.damagedEntities) : undefined
            });
          });
        }
        return executeTurn(stateCopy);
      });
    }
  };

  const handleTestEnemies = () => {
    if (!gameState || !originalPlaytestPuzzle) return;

    // Save current state snapshot
    testSnapshotRef.current = {
      characters: JSON.parse(JSON.stringify(gameState.placedCharacters)),
      enemies: JSON.parse(JSON.stringify(originalPlaytestPuzzle.enemies)),
      puzzle: JSON.parse(JSON.stringify(originalPlaytestPuzzle)),
    };

    // Create test state with no characters
    const testPuzzle = JSON.parse(JSON.stringify(originalPlaytestPuzzle));
    const testState = initializeGameState(testPuzzle);
    testState.placedCharacters = []; // Remove all characters
    testState.gameStatus = 'running';
    testState.testMode = true; // Skip win/lose condition checks

    setGameState(testState);
    setTestMode('enemies');
    setTestTurnsRemaining(5);
    setIsSimulating(true);
    setSelectedCharacterId(null);
  };

  const handleTestCharacters = () => {
    if (!gameState || !originalPlaytestPuzzle) return;

    if (gameState.placedCharacters.length === 0) {
      setWarningModal({ isOpen: true, message: 'Place at least one hero to test!' });
      return;
    }

    // Save current state snapshot
    testSnapshotRef.current = {
      characters: JSON.parse(JSON.stringify(gameState.placedCharacters)),
      enemies: JSON.parse(JSON.stringify(originalPlaytestPuzzle.enemies)),
      puzzle: JSON.parse(JSON.stringify(originalPlaytestPuzzle)),
    };

    // Create test state with no enemies
    const testPuzzle = JSON.parse(JSON.stringify(originalPlaytestPuzzle));
    testPuzzle.enemies = []; // Remove all enemies from puzzle
    const testState = initializeGameState(testPuzzle);
    // Restore placed characters
    testState.placedCharacters = JSON.parse(JSON.stringify(gameState.placedCharacters)).map((char: PlacedCharacter) => {
      const charData = getCharacter(char.characterId);
      return {
        ...char,
        actionIndex: 0,
        currentHealth: charData ? charData.health : char.currentHealth,
        dead: false,
        active: true,
      };
    });
    testState.gameStatus = 'running';
    testState.testMode = true; // Skip win/lose condition checks

    setGameState(testState);
    setTestMode('characters');
    setTestTurnsRemaining(5);
    setIsSimulating(true);
    setSelectedCharacterId(null);
  };

  // Calculate canvas size with borders
  const hasBorder = state.skinId !== undefined && state.skinId !== '';
  const gridWidth = state.gridWidth * TILE_SIZE;
  const gridHeight = state.gridHeight * TILE_SIZE;
  const canvasWidth = hasBorder ? gridWidth + (SIDE_BORDER_SIZE * 2) : gridWidth;
  const canvasHeight = hasBorder ? gridHeight + (BORDER_SIZE * 2) : gridHeight;

  // Calculate scale factor for editor canvas
  // For puzzles wider than MAX_DISPLAY_WIDTH_TILES, scale down to fit within that width
  let editorScale = 1;
  const maxDisplayGridWidth = MAX_DISPLAY_WIDTH_TILES * TILE_SIZE;
  const maxDisplayCanvasWidth = hasBorder ? maxDisplayGridWidth + (SIDE_BORDER_SIZE * 2) : maxDisplayGridWidth;

  if (state.gridWidth > MAX_DISPLAY_WIDTH_TILES) {
    // Scale down to fit within max display width
    editorScale = maxDisplayCanvasWidth / canvasWidth;
  } else if (editorMaxWidth && editorMaxWidth < canvasWidth) {
    // For smaller puzzles, still respect container constraints
    editorScale = editorMaxWidth / canvasWidth;
  }

  // For puzzles > 15 tiles, use the max display width; otherwise use actual scaled width
  const scaledCanvasWidth = state.gridWidth > MAX_DISPLAY_WIDTH_TILES
    ? maxDisplayCanvasWidth
    : canvasWidth * editorScale;
  const scaledCanvasHeight = canvasHeight * editorScale;

  // Helper to render lives hearts (for playtest mode)
  const renderLivesHearts = () => {
    if (!originalPlaytestPuzzle) return null;
    const puzzleLives = originalPlaytestPuzzle.lives ?? 3;
    const isUnlimitedLives = puzzleLives === 0;

    if (isUnlimitedLives) {
      return <span className="text-lg text-copper-400" title="Unlimited lives">&#x221E;</span>;
    }

    const hearts = [];
    for (let i = 0; i < puzzleLives; i++) {
      const isFilled = i < livesRemaining;
      const customIcon = isFilled ? themeAssets.iconHeart : themeAssets.iconHeartEmpty;

      if (customIcon) {
        hearts.push(
          <img
            key={i}
            src={customIcon}
            alt={isFilled ? 'Life remaining' : 'Life lost'}
            title={isFilled ? 'Life remaining' : 'Life lost'}
            className="object-contain"
            style={{
              width: '14px',
              height: '16px',
              opacity: isFilled ? 1 : 0.4,
              imageRendering: 'pixelated'
            }}
          />
        );
      } else {
        hearts.push(
          <span
            key={i}
            className={`text-sm ${isFilled ? 'heart-filled' : 'heart-empty'}`}
            title={isFilled ? 'Life remaining' : 'Life lost'}
          >
            &#x2665;
          </span>
        );
      }
    }
    return hearts;
  };

  // Render playtest mode
  if (state.mode === 'playtest' && gameState) {
    return (
      <div className="min-h-screen theme-root text-parchment-200 p-4 md:p-8 relative">
        {/* Underground cave background effect */}
        <div className="absolute inset-0 pointer-events-none -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-stone-950 via-stone-900/50 to-stone-950" />
          <div className="absolute inset-0 opacity-30" style={{
            backgroundImage: `radial-gradient(ellipse at 50% 0%, rgba(212, 165, 116, 0.08) 0%, transparent 50%)`
          }} />
        </div>

        <div className="max-w-6xl mx-auto relative">
          <div className="flex flex-col lg:flex-row gap-4 md:gap-8">
            {/* Game Board */}
            <div className="flex-1 flex flex-col items-center">
              {/* Quest Display - above puzzle */}
              {(gameState.gameStatus === 'setup' || gameState.gameStatus === 'running' || gameState.gameStatus === 'defeat') && testMode === 'none' && (
                <div className="mb-4 w-full max-w-md px-3 md:px-4 py-2 md:py-3 dungeon-panel-dark">
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <HelpButton sectionId="game_general" />
                    <span className="text-base md:text-lg font-semibold text-stone-400">Quest:</span>
                    <span className="text-sm md:text-base text-copper-300 font-medium">
                      {gameState.puzzle.winConditions.map((wc) => {
                        switch (wc.type) {
                          case 'defeat_all_enemies': {
                            const enemyCount = gameState.puzzle.enemies.filter(e => !e.dead).length;
                            return `Defeat all Enemies (${enemyCount})`;
                          }
                          case 'defeat_boss': {
                            const bossEnemies = gameState.puzzle.enemies
                              .filter(e => {
                                const enemy = loadEnemy(e.enemyId);
                                return enemy?.isBoss && !e.dead;
                              })
                              .map(e => loadEnemy(e.enemyId)!);
                            const bossCount = bossEnemies.length;
                            const bossNames = bossEnemies.map(enemy => enemy.name);
                            if (bossNames.length === 0) return 'Defeat the Boss';
                            if (bossNames.length === 1) return `Defeat ${bossNames[0]}`;
                            return `Defeat ${bossNames.slice(0, -1).join(', ')} & ${bossNames[bossNames.length - 1]} (${bossCount})`;
                          }
                          case 'collect_all': {
                            const collectibleCount = gameState.puzzle.collectibles.filter(c => !c.collected).length;
                            return `Collect all Items (${collectibleCount})`;
                          }
                          case 'collect_keys': {
                            const keyCount = gameState.puzzle.collectibles.filter(c => {
                              const collectible = loadCollectible(c.collectibleId);
                              return collectible?.effects?.some(e => e.type === 'score') && !c.collected;
                            }).length;
                            return `Collect all Keys (${keyCount})`;
                          }
                          case 'reach_goal':
                            return 'Reach the Exit';
                          case 'survive_turns':
                            return `Survive ${wc.params?.turns ?? 10} Turns`;
                          case 'win_in_turns':
                            return `Win within ${wc.params?.turns ?? 10} Turns`;
                          case 'max_characters':
                            return `Use at most ${wc.params?.characterCount ?? 1} Hero${(wc.params?.characterCount ?? 1) > 1 ? 'es' : ''}`;
                          case 'characters_alive':
                            return `Keep ${wc.params?.characterCount ?? 1} Hero${(wc.params?.characterCount ?? 1) > 1 ? 'es' : ''} alive`;
                          default:
                            return wc.type;
                        }
                      }).join(' & ')}
                    </span>
                  </div>

                  {/* Side Quests Display */}
                  {gameState.puzzle.sideQuests && gameState.puzzle.sideQuests.length > 0 && (() => {
                    const completedQuestIds = gameState.gameStatus === 'running'
                      ? checkSideQuests(gameState)
                      : [];

                    return (
                      <div className="flex items-center justify-center gap-1 md:gap-2 mt-2 pt-2 border-t border-stone-700 flex-wrap">
                        <HelpButton sectionId="side_quests" />
                        <span className="text-sm md:text-base font-semibold text-arcane-400">Side Quests:</span>
                        <span className="text-xs md:text-sm text-arcane-300">
                          {gameState.puzzle.sideQuests.map((q, i) => {
                            const isCompleted = completedQuestIds.includes(q.id);
                            return (
                              <span
                                key={q.id}
                                className={isCompleted ? 'text-moss-400' : ''}
                              >
                                {i > 0 && ', '}
                                {isCompleted && '✓ '}
                                {q.title} <span className={isCompleted ? 'text-moss-500' : 'text-arcane-500'}>(+{q.bonusPoints})</span>
                              </span>
                            );
                          })}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Test mode indicator - above puzzle */}
              {testMode !== 'none' && (
                <div className="mb-4 flex flex-col items-center">
                  <div className={`flex items-center gap-3 px-4 py-2 rounded-pixel-lg border-2 ${
                    testMode === 'enemies'
                      ? 'bg-blood-900/80 border-blood-600'
                      : 'bg-arcane-900/80 border-arcane-600'
                  }`}>
                    <span className={`text-sm font-medium ${
                      testMode === 'enemies' ? 'text-blood-300' : 'text-arcane-300'
                    }`}>
                      Testing {testMode === 'enemies' ? 'Enemies' : 'Heroes'}
                    </span>
                    <span className={`text-2xl font-bold min-w-[2ch] text-center ${
                      testMode === 'enemies' ? 'text-blood-300' : 'text-arcane-300'
                    }`}>
                      {testTurnsRemaining}
                    </span>
                    <span className={`text-sm ${
                      testMode === 'enemies' ? 'text-blood-400' : 'text-arcane-400'
                    }`}>Turns Left</span>
                  </div>
                </div>
              )}

              {/* Game board with overlay container for loss panels */}
              <div className="relative">
                <ResponsiveGameBoard gameState={gameState} onTileClick={handleTileClick} onProjectileKill={handleProjectileKill} isEditor={true} />

                {/* Defeat Overlay - appears on top of the game board */}
                {gameState.gameStatus === 'defeat' && !showGameOver && (
                  <div
                    className="absolute inset-0 flex items-center justify-center z-10"
                    style={{
                      backgroundColor: themeAssets.defeatPanelOverlayBg || 'rgba(0, 0, 0, 0.75)',
                    }}
                  >
                    <div
                      className={`p-4 rounded-pixel-lg text-center max-w-[90%] ${
                        themeAssets.defeatPanelBg ? '' : 'defeat-panel'
                      }`}
                      style={{
                        ...(themeAssets.defeatPanelBg && { backgroundColor: themeAssets.defeatPanelBg }),
                        ...(themeAssets.defeatPanelBorder && { borderColor: themeAssets.defeatPanelBorder, borderWidth: '2px', borderStyle: 'solid' }),
                      }}
                    >
                      <h2
                        className={`text-xl md:text-2xl font-bold font-medieval ${
                          themeAssets.defeatPanelTitleText ? '' : 'text-blood-200 text-shadow-glow-blood'
                        }`}
                        style={{
                          ...(themeAssets.defeatPanelTitleText && { color: themeAssets.defeatPanelTitleText }),
                        }}
                      >
                        {defeatReason === 'turns' ? 'Out of Time!' : 'Defeat'}
                      </h2>
                      <p
                        className={`mt-1 text-sm ${themeAssets.defeatPanelMessageText ? '' : 'text-blood-400'}`}
                        style={{
                          ...(themeAssets.defeatPanelMessageText && { color: themeAssets.defeatPanelMessageText }),
                        }}
                      >
                        {defeatReason === 'turns'
                          ? 'You ran out of turns before completing the objective.'
                          : 'Your heroes have fallen in battle.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Game Over Overlay */}
                {showGameOver && (
                  <div
                    className="absolute inset-0 flex items-center justify-center z-10"
                    style={{
                      backgroundColor: themeAssets.gameOverPanelOverlayBg || 'rgba(0, 0, 0, 0.8)',
                    }}
                  >
                    <div
                      className={`p-6 rounded-pixel-lg text-center max-w-[90%] ${
                        themeAssets.gameOverPanelBg ? '' : 'defeat-panel'
                      }`}
                      style={{
                        ...(themeAssets.gameOverPanelBg && { backgroundColor: themeAssets.gameOverPanelBg }),
                        ...(themeAssets.gameOverPanelBorder && { borderColor: themeAssets.gameOverPanelBorder, borderWidth: '2px', borderStyle: 'solid' }),
                      }}
                    >
                      <h2
                        className={`text-2xl md:text-3xl font-bold font-medieval ${
                          themeAssets.gameOverPanelTitleText ? '' : 'text-blood-200 text-shadow-glow-blood'
                        }`}
                        style={{
                          ...(themeAssets.gameOverPanelTitleText && { color: themeAssets.gameOverPanelTitleText }),
                        }}
                      >
                        Game Over
                      </h2>
                      <p
                        className={`mt-2 text-lg ${themeAssets.gameOverPanelMessageText ? '' : 'text-blood-300'}`}
                        style={{
                          ...(themeAssets.gameOverPanelMessageText && { color: themeAssets.gameOverPanelMessageText }),
                        }}
                      >
                        No lives remaining!
                      </p>
                      <button
                        onClick={handleRestartPlaytest}
                        className={`mt-4 px-6 py-3 font-bold text-lg ${
                          themeAssets.gameOverPanelButtonBg ? 'rounded-pixel' : 'dungeon-btn-danger'
                        }`}
                        style={{
                          ...(themeAssets.gameOverPanelButtonBg && { backgroundColor: themeAssets.gameOverPanelButtonBg }),
                          ...(themeAssets.gameOverPanelButtonBorder && { borderColor: themeAssets.gameOverPanelButtonBorder, borderWidth: '2px', borderStyle: 'solid' }),
                          ...(themeAssets.gameOverPanelButtonText && { color: themeAssets.gameOverPanelButtonText }),
                        }}
                      >
                        Try Again
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Victory Message with Score - still below the game board */}
              {gameState.gameStatus === 'victory' && puzzleScore && (
                <div className="victory-panel mt-4 p-4 rounded-pixel-lg text-center w-full max-w-md">
                  <div className="text-4xl mb-1">{getRankEmoji(puzzleScore.rank)}</div>
                  <h2 className="text-xl md:text-2xl font-bold font-medieval text-moss-200 text-shadow-dungeon">
                    {getRankName(puzzleScore.rank)}
                  </h2>

                  {puzzleScore.rank === 'gold' && (
                    <p className="text-sm text-moss-300 mt-1">
                      ({puzzleScore.stats.charactersUsed} hero{puzzleScore.stats.charactersUsed !== 1 ? 'es' : ''}, {puzzleScore.stats.turnsUsed} turn{puzzleScore.stats.turnsUsed !== 1 ? 's' : ''})
                    </p>
                  )}

                  <div className="mt-3 text-2xl font-bold text-copper-300 text-shadow-glow-copper">
                    {puzzleScore.totalPoints.toLocaleString()} pts
                  </div>

                  {originalPlaytestPuzzle && (
                    <div className="mt-2 flex justify-center gap-4 text-xs">
                      <span className={puzzleScore.parMet.characters ? 'text-moss-300' : 'text-stone-500'}>
                        {puzzleScore.parMet.characters ? '✓' : '✗'} Hero Par ({originalPlaytestPuzzle.parCharacters ?? '-'})
                      </span>
                      <span className={puzzleScore.parMet.turns ? 'text-moss-300' : 'text-stone-500'}>
                        {puzzleScore.parMet.turns ? '✓' : '✗'} Turn Par ({originalPlaytestPuzzle.parTurns ?? '-'})
                      </span>
                    </div>
                  )}

                  <details className="mt-3 text-left text-xs bg-moss-900/50 rounded-pixel p-2 border border-moss-700">
                    <summary className="cursor-pointer text-moss-200 font-medium">Point Breakdown</summary>
                    <div className="mt-2 space-y-1 text-moss-100">
                      <div className="flex justify-between">
                        <span>Base:</span>
                        <span>+{puzzleScore.breakdown.basePoints}</span>
                      </div>
                      {puzzleScore.breakdown.characterBonus > 0 && (
                        <div className="flex justify-between">
                          <span>Hero Bonus:</span>
                          <span>+{puzzleScore.breakdown.characterBonus}</span>
                        </div>
                      )}
                      {puzzleScore.breakdown.turnBonus > 0 && (
                        <div className="flex justify-between">
                          <span>Turn Bonus:</span>
                          <span>+{puzzleScore.breakdown.turnBonus}</span>
                        </div>
                      )}
                      {puzzleScore.breakdown.livesBonus > 0 && (
                        <div className="flex justify-between">
                          <span>Lives Bonus:</span>
                          <span>+{puzzleScore.breakdown.livesBonus}</span>
                        </div>
                      )}
                      {puzzleScore.breakdown.sideQuestPoints > 0 && (
                        <div className="flex justify-between">
                          <span>Side Quest Bonus:</span>
                          <span>+{puzzleScore.breakdown.sideQuestPoints}</span>
                        </div>
                      )}
                    </div>
                  </details>

                  {puzzleScore.completedSideQuests.length > 0 && originalPlaytestPuzzle && (
                    <div className="mt-2 text-xs text-arcane-300">
                      Side Quests: {puzzleScore.completedSideQuests.map(qid => {
                        const quest = originalPlaytestPuzzle.sideQuests?.find(q => q.id === qid);
                        return quest?.title || qid;
                      }).join(', ')}
                    </div>
                  )}
                </div>
              )}

              {/* Concede Confirmation Popup */}
              {showConcedeConfirm && (
                <div
                  className="fixed inset-0 flex items-center justify-center z-50"
                  style={{
                    backgroundColor: themeAssets.concedeModalOverlayBg || 'rgba(0, 0, 0, 0.7)',
                  }}
                >
                  <div
                    className={`p-6 rounded-pixel-lg text-center max-w-sm mx-4 ${
                      themeAssets.concedeModalPanelBg ? '' : 'defeat-panel'
                    }`}
                    style={{
                      ...(themeAssets.concedeModalPanelBg && { backgroundColor: themeAssets.concedeModalPanelBg }),
                      ...(themeAssets.concedeModalPanelBorder && { borderColor: themeAssets.concedeModalPanelBorder, borderWidth: '2px', borderStyle: 'solid' }),
                    }}
                  >
                    <h3
                      className={`text-xl font-bold font-medieval ${
                        themeAssets.concedeModalTitleText ? '' : 'text-blood-200 text-shadow-glow-blood'
                      }`}
                      style={{
                        ...(themeAssets.concedeModalTitleText && { color: themeAssets.concedeModalTitleText }),
                      }}
                    >
                      Concede?
                    </h3>
                    <p
                      className={`mt-2 ${themeAssets.concedeModalMessageText ? '' : 'text-blood-300'}`}
                      style={{
                        ...(themeAssets.concedeModalMessageText && { color: themeAssets.concedeModalMessageText }),
                      }}
                    >
                      You will lose a life and return to setup.
                    </p>
                    <div className="mt-4 flex gap-3 justify-center">
                      <button
                        onClick={() => setShowConcedeConfirm(false)}
                        className={`px-4 py-2 ${themeAssets.concedeModalCancelBg ? 'rounded-pixel' : 'dungeon-btn'}`}
                        style={{
                          ...(themeAssets.concedeModalCancelBg && { backgroundColor: themeAssets.concedeModalCancelBg }),
                          ...(themeAssets.concedeModalCancelBorder && { borderColor: themeAssets.concedeModalCancelBorder, borderWidth: '2px', borderStyle: 'solid' }),
                          ...(themeAssets.concedeModalCancelText && { color: themeAssets.concedeModalCancelText }),
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleConcedePlaytest}
                        className={`px-4 py-2 ${themeAssets.concedeModalConfirmBg ? 'rounded-pixel' : 'dungeon-btn-danger'}`}
                        style={{
                          ...(themeAssets.concedeModalConfirmBg && { backgroundColor: themeAssets.concedeModalConfirmBg }),
                          ...(themeAssets.concedeModalConfirmBorder && { borderColor: themeAssets.concedeModalConfirmBorder, borderWidth: '2px', borderStyle: 'solid' }),
                          ...(themeAssets.concedeModalConfirmText && { color: themeAssets.concedeModalConfirmText }),
                        }}
                      >
                        Concede
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Control Panel - below puzzle */}
              {(gameState.gameStatus === 'setup' || gameState.gameStatus === 'running' || gameState.gameStatus === 'defeat' || testMode !== 'none') && (
                <div className="mt-3 w-full max-w-md px-3 md:px-4 py-2 md:py-3 dungeon-panel-dark">
                  <div className="relative flex items-center justify-between">
                    {/* Left: Lives */}
                    <div className="flex items-center gap-1">
                      <span className="text-stone-400 text-xs">Lives:</span>
                      <div className="flex items-center gap-0.5">
                        {renderLivesHearts()}
                      </div>
                    </div>

                    {/* Center: Play button OR Turn counter */}
                    <div className="absolute left-1/2 -translate-x-1/2">
                      {gameState.gameStatus === 'setup' || testMode !== 'none' ? (
                        <button
                          onClick={testMode === 'none' ? handlePlay : undefined}
                          disabled={testMode !== 'none'}
                          className={`px-5 md:px-6 py-1 font-bold text-sm transition-all ${
                            testMode !== 'none'
                              ? 'bg-stone-700 text-stone-500 cursor-not-allowed'
                              : themeAssets.actionButtonPlayBg ? '' : 'dungeon-btn-success torch-glow'
                          } ${
                            themeAssets.actionButtonPlayShape === 'rounded' ? 'rounded-lg' :
                            themeAssets.actionButtonPlayShape === 'pill' ? 'rounded-full' : ''
                          }`}
                          style={{
                            ...(testMode === 'none' && themeAssets.actionButtonPlayBg && { backgroundColor: themeAssets.actionButtonPlayBg }),
                            ...(testMode === 'none' && themeAssets.actionButtonPlayBorder && { borderColor: themeAssets.actionButtonPlayBorder, borderWidth: '2px', borderStyle: 'solid' }),
                            ...(testMode === 'none' && themeAssets.actionButtonPlayText && { color: themeAssets.actionButtonPlayText }),
                          }}
                        >
                          ⚔ Play
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-stone-400 text-xs font-medium">Turn</span>
                          {(() => {
                            const maxTurns = originalPlaytestPuzzle?.maxTurns;
                            const turnsRemaining = maxTurns ? maxTurns - gameState.currentTurn : null;
                            const isNearLimit = turnsRemaining !== null && turnsRemaining <= 3;
                            const isVeryNearLimit = turnsRemaining !== null && turnsRemaining <= 1;

                            return (
                              <>
                                <span className={`text-xl font-bold min-w-[2ch] text-center ${
                                  isVeryNearLimit
                                    ? 'text-blood-400 text-shadow-glow-blood animate-pulse'
                                    : isNearLimit
                                    ? 'text-rust-400'
                                    : 'text-copper-400 text-shadow-glow-copper'
                                }`}>
                                  {gameState.currentTurn}
                                </span>
                                {maxTurns && (
                                  <span className={`text-xs ${
                                    isNearLimit ? 'text-blood-400' : 'text-stone-500'
                                  }`}>
                                    / {maxTurns}
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Right: Max Turns OR Concede button */}
                    <div className="flex items-center justify-end min-w-[70px]">
                      {gameState.gameStatus === 'setup' || testMode !== 'none' ? (
                        gameState.puzzle.maxTurns && (
                          <div className="flex items-center gap-1">
                            <span className="text-stone-400 text-xs">Max:</span>
                            <span className="text-sm text-parchment-300 font-medium">{gameState.puzzle.maxTurns}</span>
                          </div>
                        )
                      ) : (
                        <button
                          onClick={() => setShowConcedeConfirm(true)}
                          className={`text-xs px-2 py-1 ${
                            themeAssets.actionButtonConcedeBg ? '' : 'dungeon-btn-danger'
                          } ${
                            themeAssets.actionButtonConcedeShape === 'rounded' ? 'rounded-lg' :
                            themeAssets.actionButtonConcedeShape === 'pill' ? 'rounded-full' : ''
                          }`}
                          style={{
                            ...(themeAssets.actionButtonConcedeBg && { backgroundColor: themeAssets.actionButtonConcedeBg }),
                            ...(themeAssets.actionButtonConcedeBorder && { borderColor: themeAssets.actionButtonConcedeBorder, borderWidth: '1px', borderStyle: 'solid' }),
                            ...(themeAssets.actionButtonConcedeText && { color: themeAssets.actionButtonConcedeText }),
                          }}
                          title="Give up this attempt and lose a life"
                        >
                          Concede
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Character Selector - below control panel (visible during setup, running, defeat, and test mode) */}
              {(gameState.gameStatus === 'setup' || gameState.gameStatus === 'running' || gameState.gameStatus === 'defeat' || testMode !== 'none') && (
                <div className="mt-3 w-full max-w-md">
                  <CharacterSelector
                    availableCharacterIds={gameState.puzzle.availableCharacters}
                    selectedCharacterId={testMode === 'none' && gameState.gameStatus === 'setup' ? selectedCharacterId : null}
                    onSelectCharacter={testMode === 'none' && gameState.gameStatus === 'setup' ? setSelectedCharacterId : () => {}}
                    placedCharacterIds={gameState.placedCharacters.map(c => c.characterId)}
                    maxPlaceable={gameState.puzzle.maxPlaceableCharacters ?? gameState.puzzle.maxCharacters}
                    onClearAll={testMode === 'none' && gameState.gameStatus === 'setup' ? handleWipe : undefined}
                    onTest={testMode === 'none' && gameState.gameStatus === 'setup' ? handleTestCharacters : undefined}
                    themeAssets={themeAssets}
                    disabled={gameState.gameStatus === 'running' || gameState.gameStatus === 'defeat' || testMode !== 'none'}
                  />
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="w-full lg:w-80 space-y-4 md:space-y-6">
              {/* Playtest Controls Panel - exclusive to playtest */}
              <div className="dungeon-panel p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-copper-400">Dev Controls</h3>
                  <button
                    onClick={handleBackToEditor}
                    className="dungeon-btn px-3 py-1 text-sm"
                  >
                    ← Editor
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {/* Resume button - shows when game is running but paused */}
                  {testMode === 'none' && gameState.gameStatus === 'running' && !isSimulating && (
                    <button
                      onClick={handlePlay}
                      className="col-span-2 dungeon-btn-success px-4 py-2 font-semibold"
                    >
                      Resume
                    </button>
                  )}

                  {isSimulating && gameState.gameStatus === 'running' && testMode === 'none' && (
                    <button
                      onClick={handlePause}
                      className="col-span-2 dungeon-btn px-4 py-2 font-semibold"
                      style={{ backgroundColor: 'var(--theme-accent-danger, #c4915c)', borderColor: 'var(--theme-border-accent, #c4915c)' }}
                    >
                      Pause
                    </button>
                  )}

                  <button
                    onClick={handleStep}
                    className="dungeon-btn px-4 py-2 font-semibold"
                    title="Execute one turn at a time"
                  >
                    Step
                  </button>

                  <button
                    onClick={handleReset}
                    className="dungeon-btn-danger px-4 py-2 font-semibold"
                    title="Reset to when Play was pressed"
                  >
                    Reset
                  </button>

                  <button
                    onClick={handleWipe}
                    className="dungeon-btn px-4 py-2 font-semibold"
                    style={{ backgroundColor: '#c2410c', borderColor: '#ea580c' }}
                    title="Remove all placed characters"
                  >
                    Wipe
                  </button>

                  {/* Show Solution - displays placements if validation found a solution */}
                  {validationResult?.solutionFound && (
                    <div className="col-span-2 mt-2 p-2 bg-stone-900/50 rounded border border-moss-700/50">
                      <div className="text-xs text-moss-400 font-semibold mb-1">
                        Solution ({validationResult.solutionFound.turnsToWin} turns):
                      </div>
                      <div className="text-xs text-stone-300 space-y-0.5">
                        {validationResult.solutionFound.placements.map((p, i) => {
                          const charData = getCharacter(p.characterId);
                          return (
                            <div key={i}>
                              {charData?.name || p.characterId} @ ({p.x}, {p.y}) facing {p.facing}
                            </div>
                          );
                        })}
                      </div>
                      {gameState.gameStatus === 'setup' && (
                        <button
                          onClick={handleShowSolution}
                          className="mt-2 w-full dungeon-btn px-2 py-1 text-xs"
                          style={{ backgroundColor: '#166534', borderColor: '#22c55e' }}
                        >
                          Auto-place
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Enemies Display */}
              <EnemyDisplay
                enemies={gameState.puzzle.enemies}
                onTest={handleTestEnemies}
                showTestButton={gameState.gameStatus === 'setup' && testMode === 'none'}
                themeAssets={themeAssets}
              />

              {/* Items Display */}
              <ItemsDisplay puzzle={gameState.puzzle} />

              {/* Status Effects Display */}
              <StatusEffectsDisplay puzzle={gameState.puzzle} />

              {/* Special Tiles Display */}
              <SpecialTilesDisplay puzzle={gameState.puzzle} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render edit mode
  return (
    <div className="min-h-screen theme-root text-parchment-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header - stacks on mobile */}
        <div className="mb-4 md:mb-6 space-y-3 md:space-y-0 md:flex md:items-center md:gap-4">
          <div className="flex items-center justify-between md:justify-start gap-4">
            <h1 className="text-2xl md:text-4xl font-bold">Map Editor</h1>
            <button
              onClick={handlePlaytest}
              className="px-3 py-1.5 md:px-4 md:py-2 bg-arcane-600 rounded hover:bg-arcane-700 font-bold text-sm md:text-base"
            >
              ▶ Play
            </button>
          </div>

          {/* Grid Size and Undo/Redo - row on mobile */}
          <div className="flex items-center gap-2 md:gap-4 flex-wrap">
            {/* Grid Size */}
            <div className="flex items-center gap-2 md:gap-3 bg-stone-800 px-3 py-1.5 md:px-4 md:py-2 rounded">
              <span className="text-xs md:text-sm font-medium text-parchment-300">Grid:</span>
              <div className="flex items-center gap-1">
                <label className="text-xs text-stone-400">W</label>
                <div className="flex items-center">
                  <button
                    onClick={() => handleResize(state.gridWidth - 1, state.gridHeight)}
                    disabled={state.gridWidth <= 3}
                    className="w-6 h-7 md:w-7 md:h-8 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-l text-sm font-bold"
                  >
                    −
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={widthInput}
                    onChange={(e) => setWidthInput(e.target.value)}
                    onBlur={() => {
                      const val = parseInt(widthInput, 10);
                      if (!isNaN(val) && val >= 3 && val <= 20) {
                        handleResize(val, state.gridHeight);
                      } else {
                        setWidthInput(String(state.gridWidth));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-8 md:w-10 h-7 md:h-8 px-1 bg-stone-700 text-sm text-center border-x border-stone-600"
                  />
                  <button
                    onClick={() => handleResize(state.gridWidth + 1, state.gridHeight)}
                    disabled={state.gridWidth >= 20}
                    className="w-6 h-7 md:w-7 md:h-8 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-r text-sm font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <label className="text-xs text-stone-400">H</label>
                <div className="flex items-center">
                  <button
                    onClick={() => handleResize(state.gridWidth, state.gridHeight - 1)}
                    disabled={state.gridHeight <= 3}
                    className="w-6 h-7 md:w-7 md:h-8 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-l text-sm font-bold"
                  >
                    −
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={heightInput}
                    onChange={(e) => setHeightInput(e.target.value)}
                    onBlur={() => {
                      const val = parseInt(heightInput, 10);
                      if (!isNaN(val) && val >= 3 && val <= 20) {
                        handleResize(state.gridWidth, val);
                      } else {
                        setHeightInput(String(state.gridHeight));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-8 md:w-10 h-7 md:h-8 px-1 bg-stone-700 text-sm text-center border-x border-stone-600"
                  />
                  <button
                    onClick={() => handleResize(state.gridWidth, state.gridHeight + 1)}
                    disabled={state.gridHeight >= 20}
                    className="w-6 h-7 md:w-7 md:h-8 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-r text-sm font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            {/* Undo/Redo buttons */}
            <div className="flex items-center gap-1 bg-stone-800 px-2 py-1 rounded">
              <button
                onClick={handleUndo}
                disabled={!canUndo}
                className={`px-2 md:px-3 py-1.5 rounded text-xs md:text-sm font-medium transition-colors ${
                  canUndo
                    ? 'bg-stone-700 hover:bg-stone-600 text-parchment-100'
                    : 'bg-stone-800 text-stone-500 cursor-not-allowed'
                }`}
                title="Undo (Ctrl+Z)"
              >
                ↩
              </button>
              <button
                onClick={handleRedo}
                disabled={!canRedo}
                className={`px-2 md:px-3 py-1.5 rounded text-xs md:text-sm font-medium transition-colors ${
                  canRedo
                    ? 'bg-stone-700 hover:bg-stone-600 text-parchment-100'
                    : 'bg-stone-800 text-stone-500 cursor-not-allowed'
                }`}
                title="Redo (Ctrl+Y)"
              >
                ↪
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
                    const charId = state.availableCharacters[index];
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
                                          <img src={spell.thumbnailIcon} alt={spell.name} className="w-full h-full object-cover" />
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
                <h2 className="text-lg font-bold mb-3">Tools</h2>
                <div className="grid grid-cols-4 gap-2">
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
                    Tile
                  </button>
                  <button
                    onClick={() => setState(prev => ({ ...prev, selectedTool: 'enemy' }))}
                    className={`p-3 rounded text-sm ${
                      state.selectedTool === 'enemy' ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                    }`}
                  >
                    Enemy
                  </button>
                  <button
                    onClick={() => setState(prev => ({ ...prev, selectedTool: 'object' }))}
                    className={`p-3 rounded text-sm ${
                      state.selectedTool === 'object' ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                    }`}
                  >
                    Object
                  </button>
                  <button
                    onClick={() => setState(prev => ({ ...prev, selectedTool: 'collectible' }))}
                    className={`p-3 rounded text-sm ${
                      state.selectedTool === 'collectible' ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                    }`}
                  >
                    Item
                  </button>
                  <button
                    onClick={() => setState(prev => ({ ...prev, selectedTool: 'characters' }))}
                    className={`p-3 rounded text-sm ${
                      state.selectedTool === 'characters' ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                    }`}
                  >
                    Heroes
                  </button>
                </div>
              </div>

              {/* Tile Selector - Shows when Tile tool is selected */}
              {(state.selectedTool === 'custom' || state.selectedTool === 'void' || state.selectedTool === 'empty' || state.selectedTool === 'wall') && (
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
                      <div className="w-8 h-8 bg-stone-900 rounded flex items-center justify-center">
                        <span className="text-stone-600">✕</span>
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
                      <div className="w-8 h-8 bg-stone-600 rounded flex items-center justify-center">
                        <span className="text-stone-400">⬜</span>
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
                      <div className="w-8 h-8 bg-stone-500 rounded flex items-center justify-center">
                        <span className="text-parchment-300">▓</span>
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
                      </div>
                    )}

                    {/* Custom tiles */}
                    {filteredTileTypes.map(tileType => {
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
                            {tileType.customSprite?.idleImageData ? (
                              <img
                                src={tileType.customSprite.idleImageData}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-sm">{behaviorIcons || '⬜'}</span>
                            )}
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
                    ) : filteredTileTypes.length === 0 && (
                      <p className="text-xs text-stone-400 mt-2">No tiles in this folder.</p>
                    )}

                    {/* Trigger Group Selector - Shows when a tile with on/off states is selected */}
                    {selectedCustomTileTypeId && (() => {
                      const tileType = loadTileType(selectedCustomTileTypeId);
                      // Show trigger group selector if tile has on/off states (cadence, canBeTriggered, or offStateSprite)
                      const hasOnOffStates = tileType?.cadence?.enabled || tileType?.canBeTriggered || tileType?.offStateSprite;
                      if (!hasOnOffStates) return null;
                      return (
                        <div className="mt-3 p-2 bg-stone-700 rounded">
                          <label className="text-sm text-stone-300 block mb-1">Trigger Group (optional)</label>
                          <p className="text-xs text-stone-400 mb-2">
                            Assign to a group to control this tile's on/off state with pressure plates
                          </p>
                          <select
                            value={selectedTriggerGroupId}
                            onChange={e => setSelectedTriggerGroupId(e.target.value)}
                            className="w-full bg-stone-600 rounded px-2 py-1 text-sm"
                          >
                            <option value="">None (uses cadence)</option>
                            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(group => (
                              <option key={group} value={group}>Group {group}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Enemy Type Selector - List style with sprites */}
              {state.selectedTool === 'enemy' && (
                <div className="bg-stone-800 p-4 rounded">
                  <h2 className="text-lg font-bold mb-3">Select Enemy</h2>
                  <FolderDropdown
                    category="enemies"
                    selectedFolderId={enemyFolderId}
                    onFolderSelect={setEnemyFolderId}
                  />
                  {filteredEnemies.length === 0 ? (
                    <p className="text-sm text-stone-400 mt-2">
                      {allEnemies.length === 0 ? 'No enemies available. Create enemies in Asset Manager!' : 'No enemies in this folder.'}
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto mt-2">
                      {filteredEnemies.map(enemy => {
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
                                          <img src={spell.thumbnailIcon} alt={spell.name} className="w-full h-full object-cover" />
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
                  {filteredObjects.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-sm text-stone-400 mb-2">
                        {allObjects.length === 0 ? 'No objects available.' : 'No objects in this folder.'}
                      </p>
                      {allObjects.length === 0 && (
                        <a href="/assets" className="text-blue-400 hover:underline text-sm">
                          Create objects in Asset Manager
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto mt-2">
                      {filteredObjects.map(obj => (
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
                  {/* Legacy coin option */}
                  <div className="space-y-2 max-h-64 overflow-y-auto mt-2">
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
                    {filteredCollectibles.length === 0 && allCollectibles.length > 0 ? (
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
                      filteredCollectibles.map(coll => (
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
                  {filteredCharacters.length === 0 ? (
                    <p className="text-sm text-stone-400 mt-2">
                      {allCharacters.length === 0 ? 'No characters available' : 'No characters in this folder.'}
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto mt-2">
                      {filteredCharacters.map(char => {
                        const spells = getAllSpells(char.behavior);
                        return (
                          <ActionTooltip key={char.id} actions={char.behavior}>
                            <label className="flex items-center gap-2 p-2 bg-stone-700 rounded hover:bg-stone-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={state.availableCharacters.includes(char.id)}
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
                                          <img src={spell.thumbnailIcon} alt={spell.name} className="w-full h-full object-cover" />
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
            </div>

            {/* Column 2 (Right) - Actions, Puzzle Info, Library */}
            <div className="space-y-4">
              {/* Actions - At top of right column */}
              <div className="bg-stone-800 p-4 rounded space-y-2">
                <h2 className="text-lg font-bold mb-2">Actions</h2>
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
              </div>

              {/* Puzzle Info - Below Actions */}
              <div className="bg-stone-800 p-4 rounded">
                <h2 className="text-lg font-bold mb-3">Puzzle Info</h2>
                <div className="space-y-3">
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
                                    {state.availableCharacters.map(charId => {
                                      const char = getCharacter(charId);
                                      return (
                                        <option key={charId} value={charId}>
                                          {char?.name || charId}
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
                </div>
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

  // First: Draw custom tile sprite if available
  if (customTileType?.customSprite?.idleImageData) {
    const customImg = loadSkinImage(customTileType.customSprite.idleImageData);
    if (customImg?.complete) {
      // Draw base color first for transparency support
      ctx.fillStyle = baseColor;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.drawImage(customImg, px, py, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      drawTileBehaviorIndicators(ctx, px, py, customTileType, tile);
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

      case 'teleport':
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

      case 'direction_change':
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
    const spriteSize = (collectibleData.customSprite.size || 0.8) * TILE_SIZE;

    // Calculate center position based on anchor point
    let centerX = px + TILE_SIZE / 2;
    let centerY = py + TILE_SIZE / 2;

    if (collectibleData.anchorPoint === 'bottom_center') {
      centerY = py + TILE_SIZE / 2 - spriteSize / 2;
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

  // Get sprite size (default to 0.8 if not set)
  const spriteSize = (objectData.customSprite?.size || 0.8) * TILE_SIZE;

  // Calculate center position based on anchor point
  let centerX = px + TILE_SIZE / 2;
  let centerY = py + TILE_SIZE / 2;

  if (objectData.anchorPoint === 'bottom_center') {
    // For bottom_center: sprite's bottom edge aligns with tile's center
    // So sprite center is offset upward by half the sprite height
    centerY = py + TILE_SIZE / 2 - spriteSize / 2;
  }

  // Draw custom sprite if available
  if (objectData.customSprite) {
    // Use drawSprite which handles images, spritesheets, and shape fallbacks
    drawSprite(ctx, objectData.customSprite, centerX, centerY, TILE_SIZE);
  } else {
    // Fallback: draw a simple brown square
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(px + TILE_SIZE / 4, py + TILE_SIZE / 4, TILE_SIZE / 2, TILE_SIZE / 2);
  }
}

