import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Puzzle, TileOrNull, PlacedEnemy, PlacedCollectible, WinCondition, GameState, PlacedCharacter, BorderConfig, CharacterAction, SpellAsset } from '../../types/game';
import { TileType, Direction } from '../../types/game';
import { getAllCharacters, getCharacter, type CharacterWithSprite } from '../../data/characters';
import { getAllEnemies, getEnemy, type EnemyWithSprite } from '../../data/enemies';
import { drawSprite } from './SpriteEditor';
import { initializeGameState, executeTurn } from '../../engine/simulation';
import { AnimatedGameBoard } from '../game/AnimatedGameBoard';
import { Controls } from '../game/Controls';
import { CharacterSelector } from '../game/CharacterSelector';
import { savePuzzle, getSavedPuzzles, deletePuzzle, loadPuzzle, type SavedPuzzle } from '../../utils/puzzleStorage';
import { getAllPuzzleSkins, loadPuzzleSkin, getCustomTileTypes, loadTileType, loadSpellAsset } from '../../utils/assetStorage';
import type { PuzzleSkin } from '../../types/game';
import type { CustomTileType } from '../../utils/assetStorage';
import { SpriteThumbnail } from './SpriteThumbnail';

// Helper to get first spell from character/enemy behavior
const getFirstSpell = (behavior: CharacterAction[] | undefined): SpellAsset | null => {
  if (!behavior) return null;
  for (const action of behavior) {
    // Check for SPELL action type with spellId reference
    if (action.type === 'SPELL' && action.spellId) {
      const spell = loadSpellAsset(action.spellId);
      if (spell) return spell;
    }
    // Check for CUSTOM_ATTACK action type (inline attack definition)
    if (action.type === 'CUSTOM_ATTACK' && action.customAttack) {
      // Convert inline customAttack to SpellAsset-like structure for display
      const attack = action.customAttack;
      return {
        id: attack.id,
        name: attack.name,
        description: `${attack.pattern} attack`,
        templateType: attack.pattern === 'projectile' ? 'range_linear' : 'melee',
        damage: attack.damage,
        range: attack.range,
        thumbnailIcon: '', // No thumbnail for inline attacks
      } as SpellAsset;
    }
  }
  return null;
};

// Helper to format action sequence for display
const formatActionSequence = (behavior: CharacterAction[] | undefined): string[] => {
  if (!behavior || behavior.length === 0) return ['No actions defined'];
  return behavior.map((action, i) => {
    const num = i + 1;
    switch (action.type) {
      case 'SPELL':
        if (action.spellId) {
          const spell = loadSpellAsset(action.spellId);
          if (spell) return `${num}. ${spell.name}`;
        }
        return `${num}. Cast Spell`;
      case 'CUSTOM_ATTACK':
        return `${num}. ${action.customAttack?.name || 'Attack'}`;
      case 'ATTACK_RANGE':
        return `${num}. Ranged Attack`;
      case 'MOVE':
      case 'MOVE_FORWARD':
        return `${num}. Move Forward`;
      case 'TURN_LEFT':
        return `${num}. Turn Left`;
      case 'TURN_RIGHT':
        return `${num}. Turn Right`;
      case 'WAIT':
        return `${num}. Wait`;
      case 'REPEAT':
        return `${num}. Repeat`;
      default:
        return `${num}. ${action.type}`;
    }
  });
};

// Tooltip component for spell info
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
    <div className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {children}
      {show && (
        <div
          className="fixed z-[9999] w-48 p-2 bg-gray-900 border border-gray-600 rounded shadow-lg text-xs pointer-events-none"
          style={{ left: position.x, top: position.y + 8, transform: 'translateX(-50%)' }}
        >
          <div className="font-bold text-white mb-1">{spell.name}</div>
          <div className="text-gray-400 mb-1">{spell.description}</div>
          <div className="text-gray-300">
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

// Tooltip component for action sequence
const ActionTooltip: React.FC<{ actions: CharacterAction[] | undefined; children: React.ReactNode }> = ({ actions, children }) => {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sequence = formatActionSequence(actions);

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // Position tooltip below the element, centered horizontally
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
          className="fixed z-[9999] w-44 p-2 bg-gray-900 border border-gray-600 rounded shadow-lg text-xs pointer-events-none"
          style={{ left: position.x, top: position.y + 8, transform: 'translateX(-50%)' }}
        >
          <div className="font-bold text-white mb-1">Action Sequence</div>
          {sequence.map((action, i) => (
            <div key={i} className="text-gray-300">{action}</div>
          ))}
        </div>
      )}
    </div>
  );
};

const TILE_SIZE = 48;
const BORDER_SIZE = 48; // Border thickness for top/bottom
const SIDE_BORDER_SIZE = 24; // Thinner side borders to match pixel art style

type ToolType = 'empty' | 'wall' | 'void' | 'enemy' | 'collectible' | 'custom';
type EditorMode = 'edit' | 'playtest';

interface EditorState {
  gridWidth: number;
  gridHeight: number;
  tiles: TileOrNull[][];
  enemies: PlacedEnemy[];
  collectibles: PlacedCollectible[];

  // Metadata
  puzzleName: string;
  puzzleId: string;
  maxCharacters: number;
  maxTurns?: number;
  availableCharacters: string[];
  winConditions: WinCondition[];
  borderConfig?: BorderConfig; // Legacy - kept for backwards compatibility
  skinId?: string; // Reference to PuzzleSkin

  // Editor state
  selectedTool: ToolType;
  isDrawing: boolean;
  mode: EditorMode;
}

export const MapEditor: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<EditorState>({
    gridWidth: 8,
    gridHeight: 8,
    tiles: createEmptyGrid(8, 8),
    enemies: [],
    collectibles: [],

    puzzleName: 'New Puzzle',
    puzzleId: 'puzzle_' + Date.now(),
    maxCharacters: 3,
    maxTurns: 100,
    availableCharacters: ['knight_01'],
    winConditions: [{ type: 'defeat_all_enemies' }],
    skinId: 'builtin_dungeon', // Default skin

    selectedTool: 'wall',
    isDrawing: false,
    mode: 'edit',
  });

  // Playtest state
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [originalPlaytestPuzzle, setOriginalPlaytestPuzzle] = useState<Puzzle | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Library state
  const [savedPuzzles, setSavedPuzzles] = useState<SavedPuzzle[]>(() => getSavedPuzzles());
  const [showLibrary, setShowLibrary] = useState(false);

  // Puzzle skins state
  const [availableSkins, setAvailableSkins] = useState<PuzzleSkin[]>(() => getAllPuzzleSkins());

  // Custom tile types state
  const [customTileTypes, setCustomTileTypes] = useState<CustomTileType[]>(() => getCustomTileTypes());
  const [selectedCustomTileTypeId, setSelectedCustomTileTypeId] = useState<string | null>(null);

  // Enemy/Character selection
  const [selectedEnemyId, setSelectedEnemyId] = useState<string | null>(null);
  const allEnemies = getAllEnemies();
  const allCharacters = getAllCharacters();

  // Simulation loop (for playtest mode)
  useEffect(() => {
    if (!isSimulating || !gameState || gameState.gameStatus !== 'running') {
      return;
    }

    const interval = setInterval(() => {
      setGameState((prevState) => {
        if (!prevState) return prevState;
        const newState = executeTurn({ ...prevState });

        // Stop simulation if game ended
        if (newState.gameStatus !== 'running') {
          setIsSimulating(false);
        }

        return newState;
      });
    }, 800);

    return () => clearInterval(interval);
  }, [isSimulating, gameState?.gameStatus]);

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

    // Draw enemies
    state.enemies.forEach((enemy) => {
      if (!enemy.dead) {
        drawEnemy(ctx, enemy.x, enemy.y, enemy.enemyId);
      }
    });

    // Draw collectibles
    state.collectibles.forEach((collectible) => {
      if (!collectible.collected) {
        drawCollectible(ctx, collectible.x, collectible.y, collectible.type);
      }
    });

    ctx.restore();
  }, [state.tiles, state.enemies, state.collectibles, state.gridWidth, state.gridHeight, state.mode, state.skinId]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setState(prev => ({ ...prev, isDrawing: true }));
    handleCanvasClick(e);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!state.isDrawing) return;
    handleCanvasClick(e);
  };

  const handleCanvasMouseUp = () => {
    setState(prev => ({ ...prev, isDrawing: false }));
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const hasBorder = state.skinId !== undefined && state.skinId !== '';
    const offsetX = hasBorder ? SIDE_BORDER_SIZE : 0;
    const offsetY = hasBorder ? BORDER_SIZE : 0;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left - offsetX;
    const clickY = e.clientY - rect.top - offsetY;
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
          const newCollectible: PlacedCollectible = {
            type: 'coin',
            x,
            y,
            scoreValue: 10,
            collected: false,
          };
          return { ...prev, collectibles: [...prev.collectibles, newCollectible] };
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

          newTiles[y][x] = {
            x, y,
            type: baseTileType,
            customTileTypeId: selectedCustomTileTypeId,
            teleportGroupId,
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
      availableCharacters: state.availableCharacters,
      winConditions: state.winConditions,
      maxCharacters: state.maxCharacters,
      maxTurns: state.maxTurns,
      borderConfig,
      skinId: state.skinId,
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
    savePuzzle(puzzle);
    setSavedPuzzles(getSavedPuzzles());
    alert(`Saved "${state.puzzleName}"!`);
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

    setState(prev => ({
      ...prev,
      puzzleId: newId,
      puzzleName: newName,
    }));

    savePuzzle(puzzle);
    setSavedPuzzles(getSavedPuzzles());
    alert(`Saved as "${newName}"!`);
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
      puzzleName: puzzle.name,
      puzzleId: puzzle.id,
      maxCharacters: puzzle.maxCharacters,
      maxTurns: puzzle.maxTurns,
      availableCharacters: puzzle.availableCharacters,
      winConditions: puzzle.winConditions,
      skinId: puzzle.skinId || 'builtin_dungeon',
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
      puzzleName: 'New Puzzle',
      puzzleId: 'puzzle_' + Date.now(),
      maxCharacters: 3,
      maxTurns: 100,
      availableCharacters: ['knight_01'],
      winConditions: [{ type: 'defeat_all_enemies' }],
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
        maxTurns: puzzle.maxTurns,
        availableCharacters: puzzle.availableCharacters,
        winConditions: puzzle.winConditions,
        skinId: puzzle.skinId || 'builtin_dungeon',
      }));

      alert('Puzzle loaded successfully!');
    } catch (e) {
      alert('Invalid JSON format: ' + (e as Error).message);
    }
  };

  const handleClear = () => {
    if (!confirm('Clear the entire grid?')) return;

    setState(prev => ({
      ...prev,
      tiles: createEmptyGrid(prev.gridWidth, prev.gridHeight),
      enemies: [],
      collectibles: [],
    }));
  };

  const handleResize = (width: number, height: number) => {
    setState(prev => {
      // Create new grid
      const newTiles = createEmptyGrid(width, height);

      // Keep content in top-left corner (no offset)
      const offsetX = 0;
      const offsetY = 0;

      // Copy existing tiles to new grid (from top-left)
      for (let y = 0; y < Math.min(prev.gridHeight, height); y++) {
        for (let x = 0; x < Math.min(prev.gridWidth, width); x++) {
          newTiles[y][x] = prev.tiles[y][x];
        }
      }

      // Keep enemy positions (only if they fit in new bounds)
      const newEnemies = prev.enemies
        .filter(enemy => enemy.x >= 0 && enemy.x < width && enemy.y >= 0 && enemy.y < height);

      // Keep collectible positions (only if they fit in new bounds)
      const newCollectibles = prev.collectibles
        .filter(collectible => collectible.x >= 0 && collectible.x < width && collectible.y >= 0 && collectible.y < height);

      return {
        ...prev,
        gridWidth: width,
        gridHeight: height,
        tiles: newTiles,
        enemies: newEnemies,
        collectibles: newCollectibles,
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
      availableCharacters: state.availableCharacters,
      winConditions: state.winConditions,
      maxCharacters: state.maxCharacters,
      maxTurns: state.maxTurns,
      borderConfig,
      skinId: state.skinId,
    };

    // Store deep copy of original puzzle for reset
    setOriginalPlaytestPuzzle(JSON.parse(JSON.stringify(puzzle)));

    setState(prev => ({ ...prev, mode: 'playtest' }));
    setGameState(initializeGameState(puzzle));
    setSelectedCharacterId(null);
    setIsSimulating(false);
  };

  const handleBackToEditor = () => {
    setState(prev => ({ ...prev, mode: 'edit' }));
    setGameState(null);
    setOriginalPlaytestPuzzle(null);
    setSelectedCharacterId(null);
    setIsSimulating(false);
  };

  const handleTileClick = (x: number, y: number) => {
    if (!selectedCharacterId || !gameState || gameState.gameStatus !== 'setup') {
      return;
    }

    const tile = gameState.puzzle.tiles[y]?.[x];
    if (!tile) return;

    const tileHasEnemy = gameState.puzzle.enemies.some((e) => e.x === x && e.y === y && !e.dead);
    const tileHasCharacter = gameState.placedCharacters.some((c) => c.x === x && c.y === y);

    if (tileHasEnemy || tileHasCharacter) return;

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
  };

  const handlePlay = () => {
    if (!gameState || gameState.placedCharacters.length === 0) {
      alert('Place at least one character!');
      return;
    }

    setGameState((prev) => prev ? ({ ...prev, gameStatus: 'running' }) : null);
    setIsSimulating(true);
  };

  const handlePause = () => {
    setIsSimulating(false);
  };

  const handleReset = () => {
    if (!gameState || !originalPlaytestPuzzle) return;
    // Reset using the original puzzle, not the mutated one from gameState
    const resetPuzzle = JSON.parse(JSON.stringify(originalPlaytestPuzzle));
    setGameState(initializeGameState(resetPuzzle));
    setIsSimulating(false);
    setSelectedCharacterId(null);
  };

  const handleStep = () => {
    if (!gameState) return;

    if (gameState.gameStatus === 'setup') {
      setGameState((prev) => prev ? ({ ...prev, gameStatus: 'running' }) : null);
    }

    if (gameState.gameStatus === 'running') {
      setGameState((prevState) => prevState ? executeTurn({ ...prevState }) : null);
    }
  };

  // Calculate canvas size with borders
  const hasBorder = state.skinId !== undefined && state.skinId !== '';
  const gridWidth = state.gridWidth * TILE_SIZE;
  const gridHeight = state.gridHeight * TILE_SIZE;
  const canvasWidth = hasBorder ? gridWidth + (SIDE_BORDER_SIZE * 2) : gridWidth;
  const canvasHeight = hasBorder ? gridHeight + (BORDER_SIZE * 2) : gridHeight;

  // Render playtest mode
  if (state.mode === 'playtest' && gameState) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8 flex justify-between items-center">
            <h1 className="text-4xl font-bold">Playtesting: {state.puzzleName}</h1>
            <button
              onClick={handleBackToEditor}
              className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
            >
              ← Back to Editor
            </button>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Game Board */}
            <div className="flex-1">
              <AnimatedGameBoard gameState={gameState} onTileClick={handleTileClick} />

              {/* Game Status */}
              <div className="mt-4 p-4 bg-gray-800 rounded">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-gray-400">Status:</span>
                    <span className="ml-2 font-bold capitalize">{gameState.gameStatus}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Turn:</span>
                    <span className="ml-2 font-bold">{gameState.currentTurn}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Characters:</span>
                    <span className="ml-2 font-bold">
                      {gameState.placedCharacters.length} / {gameState.puzzle.maxCharacters}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Score:</span>
                    <span className="ml-2 font-bold">{gameState.score}</span>
                  </div>
                </div>
              </div>

              {/* Victory/Defeat Message */}
              {gameState.gameStatus === 'victory' && (
                <div className="mt-4 p-4 bg-green-700 rounded text-center">
                  <h2 className="text-2xl font-bold">Victory!</h2>
                  <p className="mt-2">Characters used: {gameState.placedCharacters.length}</p>
                </div>
              )}

              {gameState.gameStatus === 'defeat' && (
                <div className="mt-4 p-4 bg-red-700 rounded text-center">
                  <h2 className="text-2xl font-bold">Defeat</h2>
                  <p className="mt-2">Try again!</p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="w-full lg:w-80 space-y-6">
              {/* Controls */}
              <Controls
                gameStatus={gameState.gameStatus}
                isSimulating={isSimulating}
                onPlay={handlePlay}
                onPause={handlePause}
                onReset={handleReset}
                onWipe={() => {}}
                onStep={handleStep}
              />

              {/* Character Selector */}
              {gameState.gameStatus === 'setup' && (
                <CharacterSelector
                  availableCharacterIds={gameState.puzzle.availableCharacters}
                  selectedCharacterId={selectedCharacterId}
                  onSelectCharacter={setSelectedCharacterId}
                />
              )}

              {/* Puzzle Info */}
              <div className="p-4 bg-gray-800 rounded">
                <h3 className="text-lg font-bold mb-2">Puzzle: {gameState.puzzle.name}</h3>
                <p className="text-sm text-gray-400">
                  {gameState.puzzle.winConditions.map((wc) => wc.type).join(', ')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render edit mode
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-4xl font-bold">Map Editor</h1>
          <div className="flex gap-2">
            <Link to="/assets" className="px-4 py-2 bg-purple-600 rounded hover:bg-purple-700">
              Asset Manager
            </Link>
            <Link to="/" className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700">
              Back to Game
            </Link>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Left Column - Canvas, Grid Size, Playtest */}
          <div className="flex-shrink-0 space-y-4">
            <canvas
              ref={canvasRef}
              width={canvasWidth}
              height={canvasHeight}
              className="border-2 border-gray-600 cursor-crosshair rounded"
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
            />

            {/* Grid Size - Below puzzle, centered */}
            <div className="bg-gray-800 p-4 rounded" style={{ maxWidth: canvasWidth }}>
              <h2 className="text-lg font-bold mb-3">Grid Size</h2>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm mb-1">Width: {state.gridWidth}</label>
                  <input
                    type="range"
                    min="3"
                    max="20"
                    value={state.gridWidth}
                    onChange={(e) => handleResize(Number(e.target.value), state.gridHeight)}
                    className="w-full"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm mb-1">Height: {state.gridHeight}</label>
                  <input
                    type="range"
                    min="3"
                    max="20"
                    value={state.gridHeight}
                    onChange={(e) => handleResize(state.gridWidth, Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Selected Characters - Shows selected available characters with sprites */}
            <div className="bg-gray-800 p-4 rounded" style={{ maxWidth: canvasWidth }}>
              <h2 className="text-lg font-bold mb-3">Selected Characters</h2>
              {state.availableCharacters.length === 0 ? (
                <p className="text-sm text-gray-400">No characters selected</p>
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
                    const spell = char ? getFirstSpell(char.behavior) : null;

                    return (
                      <ActionTooltip key={index} actions={char?.behavior}>
                        <div
                          className={`rounded flex flex-col items-center justify-center p-2 ${
                            char ? 'bg-gray-700' : 'bg-gray-800 border border-dashed border-gray-600'
                          }`}
                          title={char?.name || 'Empty slot'}
                        >
                          {char ? (
                            <>
                              <SpriteThumbnail sprite={char.customSprite} size={48} />
                              <span className="text-sm font-medium text-gray-200 truncate w-full text-center mt-1">
                                {char.name.length > 8 ? char.name.slice(0, 8) + '...' : char.name}
                              </span>
                              {spell && (
                                <SpellTooltip spell={spell}>
                                  <div className="mt-1 w-6 h-6 rounded overflow-hidden cursor-help">
                                    {spell.thumbnailIcon ? (
                                      <img src={spell.thumbnailIcon} alt={spell.name} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full bg-purple-600 flex items-center justify-center text-xs">S</div>
                                    )}
                                  </div>
                                </SpellTooltip>
                              )}
                            </>
                          ) : (
                            <div className="h-16 flex items-center justify-center">
                              <span className="text-gray-600 text-xs">Empty</span>
                            </div>
                          )}
                        </div>
                      </ActionTooltip>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Playtest Button */}
            <button
              onClick={handlePlaytest}
              className="w-full px-4 py-3 bg-purple-600 rounded hover:bg-purple-700 font-bold text-lg"
              style={{ maxWidth: canvasWidth }}
            >
              ▶ Play Test
            </button>
          </div>

          {/* Right Side - Two Columns */}
          <div className="flex-1 grid grid-cols-2 gap-4 content-start">
            {/* Column 1 (Left) - Tools, Tile/Enemy Selectors, Available Characters */}
            <div className="space-y-4">
              {/* Tools - At top of left column */}
              <div className="bg-gray-800 p-4 rounded">
                <h2 className="text-lg font-bold mb-3">Tools</h2>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      setCustomTileTypes(getCustomTileTypes()); // Refresh list
                      setState(prev => ({ ...prev, selectedTool: 'custom' }));
                    }}
                    className={`p-3 rounded text-sm ${
                      state.selectedTool === 'custom' || state.selectedTool === 'void' || state.selectedTool === 'empty' || state.selectedTool === 'wall'
                        ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    Tile
                  </button>
                  <button
                    onClick={() => setState(prev => ({ ...prev, selectedTool: 'enemy' }))}
                    className={`p-3 rounded text-sm ${
                      state.selectedTool === 'enemy' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    Enemy
                  </button>
                  <button
                    onClick={() => setState(prev => ({ ...prev, selectedTool: 'collectible' }))}
                    className={`p-3 rounded text-sm ${
                      state.selectedTool === 'collectible' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    Object
                  </button>
                </div>
              </div>

              {/* Tile Selector - Shows when Tile tool is selected */}
              {(state.selectedTool === 'custom' || state.selectedTool === 'void' || state.selectedTool === 'empty' || state.selectedTool === 'wall') && (
                <div className="bg-gray-800 p-4 rounded">
                  <h2 className="text-lg font-bold mb-3">Tile Type</h2>
                  <div className="space-y-2">
                    {/* Built-in tiles: Void at top */}
                    <button
                      onClick={() => setState(prev => ({ ...prev, selectedTool: 'void' }))}
                      className={`w-full p-2 rounded text-left flex items-center gap-2 ${
                        state.selectedTool === 'void' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      <div className="w-8 h-8 bg-gray-900 rounded flex items-center justify-center">
                        <span className="text-gray-600">✕</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">Void</div>
                        <div className="text-xs text-gray-400">Empty space (no tile)</div>
                      </div>
                    </button>
                    <button
                      onClick={() => setState(prev => ({ ...prev, selectedTool: 'empty' }))}
                      className={`w-full p-2 rounded text-left flex items-center gap-2 ${
                        state.selectedTool === 'empty' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      <div className="w-8 h-8 bg-gray-600 rounded flex items-center justify-center">
                        <span className="text-gray-400">⬜</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">Empty</div>
                        <div className="text-xs text-gray-400">Walkable floor tile</div>
                      </div>
                    </button>
                    <button
                      onClick={() => setState(prev => ({ ...prev, selectedTool: 'wall' }))}
                      className={`w-full p-2 rounded text-left flex items-center gap-2 ${
                        state.selectedTool === 'wall' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      <div className="w-8 h-8 bg-gray-500 rounded flex items-center justify-center">
                        <span className="text-gray-300">▓</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">Wall</div>
                        <div className="text-xs text-gray-400">Impassable barrier</div>
                      </div>
                    </button>

                    {/* Divider if custom tiles exist */}
                    {customTileTypes.length > 0 && (
                      <div className="border-t border-gray-600 my-2 pt-2">
                        <div className="text-xs text-gray-400 mb-2">Custom Tiles</div>
                      </div>
                    )}

                    {/* Custom tiles */}
                    {customTileTypes.map(tileType => {
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
                            isSelected ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                          }`}
                        >
                          <div className="w-8 h-8 bg-gray-600 rounded flex items-center justify-center overflow-hidden">
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
                            <div className="text-xs text-gray-400">
                              {tileType.baseType} • {behaviorIcons}
                            </div>
                          </div>
                        </button>
                      );
                    })}

                    {/* Link to create custom tiles */}
                    {customTileTypes.length === 0 && (
                      <p className="text-xs text-gray-400 mt-2">
                        Create custom tiles in{' '}
                        <a href="/assets" className="text-blue-400 hover:underline">
                          Asset Manager → Tiles
                        </a>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Enemy Type Selector - List style with sprites */}
              {state.selectedTool === 'enemy' && (
                <div className="bg-gray-800 p-4 rounded">
                  <h2 className="text-lg font-bold mb-3">Select Enemy</h2>
                  {allEnemies.length === 0 ? (
                    <p className="text-sm text-gray-400">No enemies available. Create enemies in Asset Manager!</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {allEnemies.map(enemy => {
                        const spell = getFirstSpell(enemy.behavior?.pattern);
                        return (
                          <ActionTooltip key={enemy.id} actions={enemy.behavior?.pattern}>
                            <button
                              onClick={() => setSelectedEnemyId(enemy.id)}
                              className={`w-full p-2 rounded text-left flex items-center gap-2 ${
                                selectedEnemyId === enemy.id ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                              }`}
                            >
                              <SpriteThumbnail sprite={enemy.customSprite} size={32} />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{enemy.name}</div>
                                <div className="text-xs text-gray-400">HP: {enemy.health}</div>
                              </div>
                              {spell && (
                                <SpellTooltip spell={spell}>
                                  <div className="w-6 h-6 rounded overflow-hidden cursor-help flex-shrink-0">
                                    {spell.thumbnailIcon ? (
                                      <img src={spell.thumbnailIcon} alt={spell.name} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full bg-purple-600 flex items-center justify-center text-xs">S</div>
                                    )}
                                  </div>
                                </SpellTooltip>
                              )}
                            </button>
                          </ActionTooltip>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Available Characters - At bottom of left column */}
              <div className="bg-gray-800 p-4 rounded">
                <h2 className="text-lg font-bold mb-3">Available Characters</h2>
                <p className="text-xs text-gray-400 mb-3">Select which characters players can use</p>
                {allCharacters.length === 0 ? (
                  <p className="text-sm text-gray-400">No characters available</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {allCharacters.map(char => {
                      const spell = getFirstSpell(char.behavior);
                      return (
                        <ActionTooltip key={char.id} actions={char.behavior}>
                          <label className="flex items-center gap-2 p-2 bg-gray-700 rounded hover:bg-gray-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={state.availableCharacters.includes(char.id)}
                              onChange={(e) => {
                                setState(prev => ({
                                  ...prev,
                                  availableCharacters: e.target.checked
                                    ? [...prev.availableCharacters, char.id]
                                    : prev.availableCharacters.filter(id => id !== char.id)
                                }));
                              }}
                              className="w-4 h-4"
                            />
                            <SpriteThumbnail sprite={char.customSprite} size={32} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{char.name}</div>
                              <div className="text-xs text-gray-400">HP: {char.health}</div>
                            </div>
                            {spell && (
                              <SpellTooltip spell={spell}>
                                <div className="w-6 h-6 rounded overflow-hidden cursor-help flex-shrink-0">
                                  {spell.thumbnailIcon ? (
                                    <img src={spell.thumbnailIcon} alt={spell.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full bg-purple-600 flex items-center justify-center text-xs">S</div>
                                  )}
                                </div>
                              </SpellTooltip>
                            )}
                          </label>
                        </ActionTooltip>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Column 2 (Right) - Actions, Puzzle Info, Library */}
            <div className="space-y-4">
              {/* Actions - At top of right column */}
              <div className="bg-gray-800 p-4 rounded space-y-2">
                <h2 className="text-lg font-bold mb-2">Actions</h2>
                <button
                  onClick={handleNewPuzzle}
                  className="w-full px-4 py-2 bg-gray-600 rounded hover:bg-gray-700"
                >
                  New
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-green-600 rounded hover:bg-green-700"
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
                  onClick={() => setShowLibrary(!showLibrary)}
                  className="w-full px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
                >
                  Library ({savedPuzzles.length})
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleExport}
                    className="px-4 py-2 bg-gray-600 rounded hover:bg-gray-700 text-sm"
                  >
                    Export
                  </button>
                  <button
                    onClick={handleImport}
                    className="px-4 py-2 bg-gray-600 rounded hover:bg-gray-700 text-sm"
                  >
                    Import
                  </button>
                </div>
                <button
                  onClick={handleClear}
                  className="w-full px-4 py-2 bg-red-600 rounded hover:bg-red-700"
                >
                  Clear Grid
                </button>
              </div>

              {/* Puzzle Info - Below Actions */}
              <div className="bg-gray-800 p-4 rounded">
                <h2 className="text-lg font-bold mb-3">Puzzle Info</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm mb-1">Name</label>
                    <input
                      type="text"
                      value={state.puzzleName}
                      onChange={(e) => setState(prev => ({ ...prev, puzzleName: e.target.value }))}
                      className="w-full px-3 py-2 bg-gray-700 rounded"
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
                      className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                    >
                      {availableSkins.map((skin) => (
                        <option key={skin.id} value={skin.id}>
                          {skin.name} {skin.isBuiltIn ? '(Built-in)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm mb-1">Max Chars</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={state.maxCharacters}
                        onChange={(e) => setState(prev => ({ ...prev, maxCharacters: Number(e.target.value) }))}
                        className="w-full px-3 py-2 bg-gray-700 rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">Max Turns</label>
                      <input
                        type="number"
                        min="10"
                        max="1000"
                        value={state.maxTurns}
                        onChange={(e) => setState(prev => ({ ...prev, maxTurns: Number(e.target.value) }))}
                        className="w-full px-3 py-2 bg-gray-700 rounded"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Library Panel */}
              {showLibrary && (
                <div className="bg-gray-800 p-4 rounded">
                  <h2 className="text-lg font-bold mb-3">Saved Puzzles</h2>
                  {savedPuzzles.length === 0 ? (
                    <p className="text-gray-400 text-sm">No saved puzzles yet</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {savedPuzzles.map((puzzle) => (
                        <div
                          key={puzzle.id}
                          className="bg-gray-700 p-3 rounded flex justify-between items-start"
                        >
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-sm truncate">{puzzle.name}</h3>
                            <p className="text-xs text-gray-400">
                              {puzzle.width}×{puzzle.height} • {puzzle.enemies.length} enemies
                            </p>
                          </div>
                          <div className="flex gap-1 ml-2">
                            <button
                              onClick={() => handleLoadFromLibrary(puzzle.id)}
                              className="px-2 py-1 text-xs bg-blue-600 rounded hover:bg-blue-700"
                            >
                              Load
                            </button>
                            <button
                              onClick={() => handleDeleteFromLibrary(puzzle.id)}
                              className="px-2 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
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

// Image cache for skin sprites
const skinImageCache = new Map<string, HTMLImageElement>();

function loadSkinImage(src: string): HTMLImageElement | null {
  if (!src) return null;
  let img = skinImageCache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    skinImageCache.set(src, img);
  }
  return img;
}

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

  // First: Draw custom tile sprite if available
  if (customTileType?.customSprite?.idleImageData) {
    const customImg = loadSkinImage(customTileType.customSprite.idleImageData);
    if (customImg?.complete) {
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
  const isWall = tile.type === TileType.WALL;
  const spriteKey = isWall ? 'wall' : 'empty';
  const spriteUrl = tileSprites?.[spriteKey];

  if (spriteUrl) {
    const tileImg = loadSkinImage(spriteUrl);
    if (tileImg?.complete) {
      ctx.drawImage(tileImg, px, py, TILE_SIZE, TILE_SIZE);
    } else {
      // Fallback while image loads
      ctx.fillStyle = isWall ? '#4a4a4a' : '#2a2a2a';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }
  } else {
    // Default colors
    ctx.fillStyle = isWall ? '#4a4a4a' : '#2a2a2a';
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

function drawCollectible(ctx: CanvasRenderingContext2D, x: number, y: number, type: 'coin' | 'gem') {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;

  ctx.fillStyle = type === 'coin' ? '#ffd700' : '#9c27b0';
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

