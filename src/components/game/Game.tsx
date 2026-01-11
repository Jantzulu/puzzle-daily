import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { GameState, PlacedCharacter, Puzzle, PlacedEnemy } from '../../types/game';
import { Direction } from '../../types/game';
import { getTodaysPuzzle, getAllPuzzles } from '../../data/puzzles';
import { getCharacter } from '../../data/characters';
import { initializeGameState, executeTurn } from '../../engine/simulation';
import { ResponsiveGameBoard } from './AnimatedGameBoard';
import { Controls } from './Controls';
import { CharacterSelector } from './CharacterSelector';
import { EnemyDisplay } from './EnemyDisplay';
import { getSavedPuzzles, type SavedPuzzle } from '../../utils/puzzleStorage';

// Test mode types
type TestMode = 'none' | 'enemies' | 'characters';

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
  // Store placed characters snapshot when Play is pressed (for Reset)
  const [playStartCharacters, setPlayStartCharacters] = useState<PlacedCharacter[]>([]);

  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Test mode state
  const [testMode, setTestMode] = useState<TestMode>('none');
  const [testTurnsRemaining, setTestTurnsRemaining] = useState(0);
  const testSnapshotRef = useRef<{
    characters: PlacedCharacter[];
    enemies: PlacedEnemy[];
    puzzle: Puzzle;
  } | null>(null);

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
            setCurrentPuzzle(restoredPuzzle);
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
        const newState = executeTurn({ ...prevState });

        // Stop simulation if game ended (only in normal mode)
        if (testMode === 'none' && newState.gameStatus !== 'running') {
          setIsSimulating(false);
        }

        return newState;
      });
    }, 800); // 800ms per turn (slower for better visibility)

    return () => clearInterval(interval);
  }, [isSimulating, gameState.gameStatus, testMode, testTurnsRemaining]);

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

      // Check if this character type is already placed (only one of each allowed)
      const alreadyPlaced = gameState.placedCharacters.some((c) => c.characterId === selectedCharacterId);
      if (alreadyPlaced) {
        return; // Can't place duplicate character types
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

    // Save snapshot of placed characters for Reset
    setPlayStartCharacters(JSON.parse(JSON.stringify(gameState.placedCharacters)));
    setGameState((prev) => ({ ...prev, gameStatus: 'running' }));
    setIsSimulating(true);
  };

  const handlePause = () => {
    setIsSimulating(false);
  };

  const handleReset = () => {
    // Reset everything: restore enemy positions AND character positions
    const resetPuzzle = JSON.parse(JSON.stringify(originalPuzzle));
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
    setCurrentPuzzle(resetPuzzle);
    setIsSimulating(false);
    setSelectedCharacterId(null);
  };

  const handleWipe = () => {
    // Wipe: restore enemy positions but remove all characters (go back to setup)
    const wipedPuzzle = JSON.parse(JSON.stringify(originalPuzzle));
    const wipedState = initializeGameState(wipedPuzzle);
    wipedState.placedCharacters = []; // Remove all characters
    wipedState.gameStatus = 'setup'; // Back to setup mode
    setGameState(wipedState);
    setCurrentPuzzle(wipedPuzzle);
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

  const handleTestEnemies = () => {
    // Save current state snapshot
    testSnapshotRef.current = {
      characters: JSON.parse(JSON.stringify(gameState.placedCharacters)),
      enemies: JSON.parse(JSON.stringify(gameState.puzzle.enemies)),
      puzzle: JSON.parse(JSON.stringify(originalPuzzle)),
    };

    // Create test state with no characters
    const testPuzzle = JSON.parse(JSON.stringify(originalPuzzle));
    const testState = initializeGameState(testPuzzle);
    testState.placedCharacters = []; // Remove all characters
    testState.gameStatus = 'running';

    setGameState(testState);
    setCurrentPuzzle(testPuzzle);
    setTestMode('enemies');
    setTestTurnsRemaining(5);
    setIsSimulating(true);
    setSelectedCharacterId(null);
  };

  const handleTestCharacters = () => {
    if (gameState.placedCharacters.length === 0) {
      alert('Place at least one character to test!');
      return;
    }

    // Save current state snapshot
    testSnapshotRef.current = {
      characters: JSON.parse(JSON.stringify(gameState.placedCharacters)),
      enemies: JSON.parse(JSON.stringify(gameState.puzzle.enemies)),
      puzzle: JSON.parse(JSON.stringify(originalPuzzle)),
    };

    // Create test state with no enemies
    const testPuzzle = JSON.parse(JSON.stringify(originalPuzzle));
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

    setGameState(testState);
    setCurrentPuzzle(testPuzzle);
    setTestMode('characters');
    setTestTurnsRemaining(5);
    setIsSimulating(true);
    setSelectedCharacterId(null);
  };

  // Show editor link in development mode
  const isDev = import.meta.env.DEV;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4 md:mb-8 flex justify-between items-center">
          <h1 className="text-2xl md:text-4xl font-bold">Puzzle Game</h1>
          {isDev && (
            <Link to="/editor" className="px-3 py-1.5 md:px-4 md:py-2 bg-purple-600 rounded hover:bg-purple-700 text-sm md:text-base">
              🛠️ Editor
            </Link>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-4 md:gap-8">
          {/* Game Board */}
          <div className="flex-1 flex flex-col items-center">
            <ResponsiveGameBoard gameState={gameState} onTileClick={handleTileClick} />

            {/* Victory/Defeat Message */}
            {gameState.gameStatus === 'victory' && (
              <div className="mt-4 p-4 bg-green-700 rounded text-center w-full max-w-md">
                <h2 className="text-xl md:text-2xl font-bold">Victory!</h2>
                <p className="mt-2 text-sm md:text-base">Characters used: {gameState.placedCharacters.length}</p>
              </div>
            )}

            {gameState.gameStatus === 'defeat' && (
              <div className="mt-4 p-4 bg-red-700 rounded text-center w-full max-w-md">
                <h2 className="text-xl md:text-2xl font-bold">Defeat</h2>
                <p className="mt-2 text-sm md:text-base">Try again!</p>
              </div>
            )}

            {/* Character Selector - below puzzle */}
            {gameState.gameStatus === 'setup' && (
              <div className="mt-4 w-full max-w-md">
                <CharacterSelector
                  availableCharacterIds={gameState.puzzle.availableCharacters}
                  selectedCharacterId={selectedCharacterId}
                  onSelectCharacter={setSelectedCharacterId}
                  placedCharacterIds={gameState.placedCharacters.map(c => c.characterId)}
                />
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="w-full lg:w-80 space-y-4 md:space-y-6">
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
              onWipe={handleWipe}
              onStep={handleStep}
              onTestEnemies={handleTestEnemies}
              onTestCharacters={handleTestCharacters}
              testMode={testMode}
              testTurnsRemaining={testTurnsRemaining}
            />

            {/* Game Status */}
            <div className="p-4 bg-gray-800 rounded">
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

            {/* Puzzle Info */}
            <div className="p-4 bg-gray-800 rounded">
              <h3 className="text-lg font-bold mb-2">Puzzle: {gameState.puzzle.name}</h3>
              <p className="text-sm text-gray-400">
                {gameState.puzzle.winConditions.map((wc) => wc.type).join(', ')}
              </p>
            </div>

            {/* Enemies Display */}
            <EnemyDisplay enemies={gameState.puzzle.enemies} />
          </div>
        </div>
      </div>
    </div>
  );
};
