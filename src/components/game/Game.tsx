import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { GameState, PlacedCharacter, Puzzle } from '../../types/game';
import { Direction } from '../../types/game';
import { getTodaysPuzzle, getAllPuzzles } from '../../data/puzzles';
import { getCharacter } from '../../data/characters';
import { initializeGameState, executeTurn } from '../../engine/simulation';
import { AnimatedGameBoard } from './AnimatedGameBoard';
import { Controls } from './Controls';
import { CharacterSelector } from './CharacterSelector';
import { getSavedPuzzles, type SavedPuzzle } from '../../utils/puzzleStorage';

export const Game: React.FC = () => {
  const officialPuzzles = getAllPuzzles();
  const [savedPuzzles, setSavedPuzzles] = useState<SavedPuzzle[]>(() => getSavedPuzzles());

  // Combine official and saved puzzles
  const allPuzzles = [...officialPuzzles, ...savedPuzzles];

  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle>(() => getTodaysPuzzle());
  // Store original puzzle for reset (deep copy to prevent mutation)
  const [originalPuzzle, setOriginalPuzzle] = useState<Puzzle>(() => JSON.parse(JSON.stringify(getTodaysPuzzle())));
  const [gameState, setGameState] = useState<GameState>(() => {
    return initializeGameState(currentPuzzle);
  });

  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Reload saved puzzles when component mounts or when returning from editor
  useEffect(() => {
    const handleFocus = () => {
      setSavedPuzzles(getSavedPuzzles());
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Simulation loop
  useEffect(() => {
    if (!isSimulating || gameState.gameStatus !== 'running') {
      return;
    }

    const interval = setInterval(() => {
      setGameState((prevState) => {
        const newState = executeTurn({ ...prevState });

        // Stop simulation if game ended
        if (newState.gameStatus !== 'running') {
          setIsSimulating(false);
        }

        return newState;
      });
    }, 800); // 800ms per turn (slower for better visibility)

    return () => clearInterval(interval);
  }, [isSimulating, gameState.gameStatus]);

  const handleTileClick = useCallback(
    (x: number, y: number) => {
      if (!selectedCharacterId || gameState.gameStatus !== 'setup') {
        return;
      }

      // Check if tile exists and is empty
      const tile = gameState.puzzle.tiles[y]?.[x];
      if (!tile) {
        return; // Can't place on null/void tiles
      }

      const tileHasEnemy = gameState.puzzle.enemies.some((e) => e.x === x && e.y === y && !e.dead);
      const tileHasCharacter = gameState.placedCharacters.some((c) => c.x === x && c.y === y);

      if (tileHasEnemy || tileHasCharacter) {
        return; // Can't place on occupied tile
      }

      const charData = getCharacter(selectedCharacterId);
      if (!charData) return;

      // Place character with default facing direction
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

      setGameState((prev) => ({
        ...prev,
        placedCharacters: [...prev.placedCharacters, newCharacter],
      }));
    },
    [selectedCharacterId, gameState]
  );

  const handlePlay = () => {
    if (gameState.placedCharacters.length === 0) {
      alert('Place at least one character!');
      return;
    }

    setGameState((prev) => ({ ...prev, gameStatus: 'running' }));
    setIsSimulating(true);
  };

  const handlePause = () => {
    setIsSimulating(false);
  };

  const handleReset = () => {
    // Reset from original puzzle to restore enemy positions
    setGameState(initializeGameState(originalPuzzle));
    // Also reset currentPuzzle to original state
    setCurrentPuzzle(JSON.parse(JSON.stringify(originalPuzzle)));
    setIsSimulating(false);
    setSelectedCharacterId(null);
  };

  const handlePuzzleChange = (puzzleId: string) => {
    const puzzle = allPuzzles.find(p => p.id === puzzleId);
    if (puzzle) {
      // Store deep copy as original for reset
      const puzzleCopy = JSON.parse(JSON.stringify(puzzle));
      setOriginalPuzzle(puzzleCopy);
      setCurrentPuzzle(puzzle);
      setGameState(initializeGameState(puzzle));
      setIsSimulating(false);
      setSelectedCharacterId(null);
    }
  };

  const handleStep = () => {
    if (gameState.gameStatus === 'setup') {
      setGameState((prev) => ({ ...prev, gameStatus: 'running' }));
    }

    if (gameState.gameStatus === 'running') {
      setGameState((prevState) => executeTurn({ ...prevState }));
    }
  };

  // Show editor link in development mode
  const isDev = import.meta.env.DEV;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex justify-between items-center">
          <h1 className="text-4xl font-bold">Puzzle Game</h1>
          {isDev && (
            <Link to="/editor" className="px-4 py-2 bg-purple-600 rounded hover:bg-purple-700">
              🛠️ Map Editor →
            </Link>
          )}
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
            {/* Puzzle Selector */}
            {allPuzzles.length > 0 && (
              <div className="p-4 bg-gray-800 rounded">
                <label className="block text-sm font-bold mb-2">
                  Select Puzzle {savedPuzzles.length > 0 && `(${savedPuzzles.length} saved)`}
                </label>
                <select
                  value={currentPuzzle.id}
                  onChange={(e) => handlePuzzleChange(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                >
                  {officialPuzzles.length > 0 && (
                    <optgroup label="Official Puzzles">
                      {officialPuzzles.map((puzzle) => (
                        <option key={puzzle.id} value={puzzle.id}>
                          {puzzle.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {savedPuzzles.length > 0 && (
                    <optgroup label="📚 Your Saved Puzzles">
                      {savedPuzzles.map((puzzle) => (
                        <option key={puzzle.id} value={puzzle.id}>
                          {puzzle.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            )}

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
};
