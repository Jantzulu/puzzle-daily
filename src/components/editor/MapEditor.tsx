import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Puzzle, TileOrNull, PlacedEnemy, PlacedCollectible, WinCondition, GameState, PlacedCharacter } from '../../types/game';
import { TileType, Direction } from '../../types/game';
import { getAllCharacters, getCharacter } from '../../data/characters';
import { getAllEnemies } from '../../data/enemies';
import { initializeGameState, executeTurn } from '../../engine/simulation';
import { AnimatedGameBoard } from '../game/AnimatedGameBoard';
import { Controls } from '../game/Controls';
import { CharacterSelector } from '../game/CharacterSelector';
import { savePuzzle, getSavedPuzzles, deletePuzzle, loadPuzzle, type SavedPuzzle } from '../../utils/puzzleStorage';

const TILE_SIZE = 48;

type ToolType = 'empty' | 'wall' | 'void' | 'enemy' | 'collectible';
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
  maxTurns: number;
  availableCharacters: string[];
  winConditions: WinCondition[];

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

    selectedTool: 'wall',
    isDrawing: false,
    mode: 'edit',
  });

  // Playtest state
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Library state
  const [savedPuzzles, setSavedPuzzles] = useState<SavedPuzzle[]>(() => getSavedPuzzles());
  const [showLibrary, setShowLibrary] = useState(false);

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

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw tiles
    for (let y = 0; y < state.gridHeight; y++) {
      for (let x = 0; x < state.gridWidth; x++) {
        const tile = state.tiles[y][x];
        drawTile(ctx, x, y, tile);
      }
    }

    // Draw enemies
    state.enemies.forEach((enemy) => {
      if (!enemy.dead) {
        drawEnemy(ctx, enemy.x, enemy.y);
      }
    });

    // Draw collectibles
    state.collectibles.forEach((collectible) => {
      if (!collectible.collected) {
        drawCollectible(ctx, collectible.x, collectible.y, collectible.type);
      }
    });
  }, [state.tiles, state.enemies, state.collectibles, state.gridWidth, state.gridHeight, state.mode]);

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

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / TILE_SIZE);
    const y = Math.floor((e.clientY - rect.top) / TILE_SIZE);

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
    };

    setState(prev => ({ ...prev, mode: 'playtest' }));
    setGameState(initializeGameState(puzzle));
    setSelectedCharacterId(null);
    setIsSimulating(false);
  };

  const handleBackToEditor = () => {
    setState(prev => ({ ...prev, mode: 'edit' }));
    setGameState(null);
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
    if (!gameState) return;
    setGameState(initializeGameState(gameState.puzzle));
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

  const canvasWidth = state.gridWidth * TILE_SIZE;
  const canvasHeight = state.gridHeight * TILE_SIZE;

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
              🎨 Asset Manager
            </Link>
            <Link to="/" className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700">
              ← Back to Game
            </Link>
          </div>
        </div>

        <div className="flex gap-8">
          {/* Canvas */}
          <div className="flex-1 space-y-4">
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
            <button
              onClick={handlePlaytest}
              className="w-full px-4 py-3 bg-purple-600 rounded hover:bg-purple-700 font-bold text-lg"
            >
              ▶ Play Test
            </button>
          </div>

          {/* Sidebar */}
          <div className="w-80 space-y-6">
            {/* Tools */}
            <div className="bg-gray-800 p-4 rounded">
              <h2 className="text-xl font-bold mb-4">Tools</h2>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setState(prev => ({ ...prev, selectedTool: 'empty' }))}
                  className={`p-3 rounded ${
                    state.selectedTool === 'empty' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  Empty
                </button>
                <button
                  onClick={() => setState(prev => ({ ...prev, selectedTool: 'wall' }))}
                  className={`p-3 rounded ${
                    state.selectedTool === 'wall' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  Wall
                </button>
                <button
                  onClick={() => setState(prev => ({ ...prev, selectedTool: 'void' }))}
                  className={`p-3 rounded ${
                    state.selectedTool === 'void' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  Void
                </button>
                <button
                  onClick={() => setState(prev => ({ ...prev, selectedTool: 'enemy' }))}
                  className={`p-3 rounded ${
                    state.selectedTool === 'enemy' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  Enemy
                </button>
                <button
                  onClick={() => setState(prev => ({ ...prev, selectedTool: 'collectible' }))}
                  className={`p-3 rounded ${
                    state.selectedTool === 'collectible' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  Collectible
                </button>
              </div>
            </div>

            {/* Enemy Type Selector */}
            {state.selectedTool === 'enemy' && (
              <div className="bg-gray-800 p-4 rounded">
                <h2 className="text-xl font-bold mb-4">Select Enemy Type</h2>
                {allEnemies.length === 0 ? (
                  <p className="text-sm text-gray-400">No enemies available. Create enemies in Asset Manager!</p>
                ) : (
                  <select
                    value={selectedEnemyId || ''}
                    onChange={(e) => setSelectedEnemyId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 rounded text-white mb-2"
                  >
                    <option value="">-- Select Enemy --</option>
                    {allEnemies.map(enemy => (
                      <option key={enemy.id} value={enemy.id}>
                        {enemy.name} (HP: {enemy.health}, ATK: {enemy.attackDamage})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Available Characters */}
            <div className="bg-gray-800 p-4 rounded">
              <h2 className="text-xl font-bold mb-4">Available Characters</h2>
              <p className="text-xs text-gray-400 mb-3">Select which characters players can use in this puzzle</p>
              {allCharacters.length === 0 ? (
                <p className="text-sm text-gray-400">No characters available</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {allCharacters.map(char => (
                    <label key={char.id} className="flex items-center gap-2 p-2 bg-gray-700 rounded hover:bg-gray-600 cursor-pointer">
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
                      <span className="text-sm flex-1">{char.name}</span>
                      <span className="text-xs text-gray-400">HP:{char.health} ATK:{char.attackDamage}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Grid Size */}
            <div className="bg-gray-800 p-4 rounded">
              <h2 className="text-xl font-bold mb-4">Grid Size</h2>
              <div className="space-y-2">
                <div>
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
                <div>
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

            {/* Puzzle Info */}
            <div className="bg-gray-800 p-4 rounded">
              <h2 className="text-xl font-bold mb-4">Puzzle Info</h2>
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
                  <label className="block text-sm mb-1">Max Characters</label>
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

            {/* Actions */}
            <div className="bg-gray-800 p-4 rounded space-y-2">
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
                  💾 Save
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
                📚 Library ({savedPuzzles.length})
              </button>
              <button
                onClick={handleExport}
                className="w-full px-4 py-2 bg-green-700 rounded hover:bg-green-800"
              >
                Export JSON
              </button>
              <button
                onClick={handleImport}
                className="w-full px-4 py-2 bg-blue-700 rounded hover:bg-blue-800"
              >
                Import JSON
              </button>
              <button
                onClick={handleClear}
                className="w-full px-4 py-2 bg-red-600 rounded hover:bg-red-700"
              >
                Clear Grid
              </button>
            </div>

            {/* Library Panel */}
            {showLibrary && (
              <div className="bg-gray-800 p-4 rounded">
                <h2 className="text-xl font-bold mb-4">Saved Puzzles</h2>
                {savedPuzzles.length === 0 ? (
                  <p className="text-gray-400 text-sm">No saved puzzles yet</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {savedPuzzles.map((puzzle) => (
                      <div
                        key={puzzle.id}
                        className="bg-gray-700 p-3 rounded flex justify-between items-start"
                      >
                        <div className="flex-1">
                          <h3 className="font-bold">{puzzle.name}</h3>
                          <p className="text-xs text-gray-400">
                            {puzzle.width}×{puzzle.height} • {puzzle.enemies.length} enemies
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(puzzle.savedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-1">
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

function drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, tile: TileOrNull) {
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
  } else {
    // Normal tile
    ctx.fillStyle = tile.type === TileType.WALL ? '#4a4a4a' : '#2a2a2a';
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;

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
