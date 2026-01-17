import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { GameState, PlacedCharacter, Puzzle, PlacedEnemy } from '../../types/game';
import { Direction } from '../../types/game';
import { getTodaysPuzzle, getAllPuzzles } from '../../data/puzzles';
import { getCharacter } from '../../data/characters';
import { initializeGameState, executeTurn } from '../../engine/simulation';
import { ResponsiveGameBoard } from './AnimatedGameBoard';
import { CharacterSelector } from './CharacterSelector';
import { EnemyDisplay } from './EnemyDisplay';
import { StatusEffectsDisplay } from './StatusEffectsDisplay';
import { SpecialTilesDisplay } from './SpecialTilesDisplay';
import { getSavedPuzzles, type SavedPuzzle } from '../../utils/puzzleStorage';
import { loadTileType } from '../../utils/assetStorage';
import { playGameSound, playVictoryMusic, playDefeatMusic, stopMusic } from '../../utils/gameSounds';

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

  // Lives system
  const [livesRemaining, setLivesRemaining] = useState<number>(() => currentPuzzle.lives ?? 3);
  const [showGameOver, setShowGameOver] = useState(false);

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
        // Deep copy all mutable state to ensure React StrictMode double-invoke works correctly.
        // StrictMode calls the updater function twice with the same prevState to detect impure renders.
        // We need a complete deep copy so both runs are truly independent.
        const stateCopy = JSON.parse(JSON.stringify(prevState));
        // Restore tileStates Map with deep copied Sets (JSON.stringify loses Map/Set)
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
          if (newState.gameStatus === 'victory') {
            playGameSound('victory');
            playVictoryMusic();
          }

          // Handle defeat - deduct a life and auto-reset (or show game over)
          if (newState.gameStatus === 'defeat') {
            const puzzleLives = currentPuzzle.lives ?? 3;
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
                // Life lost - play sound
                playGameSound('life_lost');
                // Auto-reset after a short delay to show defeat message
                setTimeout(() => {
                  handleAutoReset();
                }, 1500);
              }
            }
          }
        }

        return newState;
      });
    }, 800); // 800ms per turn (slower for better visibility)

    return () => clearInterval(interval);
  }, [isSimulating, gameState.gameStatus, testMode, testTurnsRemaining, livesRemaining, currentPuzzle.lives]);

  const handleTileClick = useCallback(
    (x: number, y: number) => {
      if (gameState.gameStatus !== 'setup') {
        return;
      }

      // Check if clicking on an already placed character to remove them
      const clickedCharacter = gameState.placedCharacters.find((c) => c.x === x && c.y === y);
      if (clickedCharacter) {
        // Remove the clicked character
        setGameState((prev) => ({
          ...prev,
          placedCharacters: prev.placedCharacters.filter((c) => c.x !== x || c.y !== y),
        }));
        playGameSound('character_removed');
        return;
      }

      // Need a selected character to place
      if (!selectedCharacterId) {
        return;
      }

      // Check if tile exists and is empty
      const tile = gameState.puzzle.tiles[y]?.[x];
      if (!tile) {
        return; // Can't place on null/void tiles
      }

      // Check if custom tile prevents placement
      if (tile.customTileTypeId) {
        const customTileType = loadTileType(tile.customTileTypeId);
        if (customTileType?.preventPlacement) {
          return; // Can't place on tiles that prevent placement
        }
      }

      const tileHasEnemy = gameState.puzzle.enemies.some((e) => e.x === x && e.y === y && !e.dead);

      if (tileHasEnemy) {
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
      playGameSound('character_placed');
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
    playGameSound('simulation_start');
  };

  const handlePause = () => {
    setIsSimulating(false);
    playGameSound('simulation_stop');
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

  // Auto-reset after defeat (keeps characters, returns to setup/placement phase)
  const handleAutoReset = useCallback(() => {
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
    // Return to setup phase so player can adjust character placement
    resetState.gameStatus = 'setup';
    setGameState(resetState);
    setCurrentPuzzle(resetPuzzle);
    setIsSimulating(false);
    setSelectedCharacterId(null);
  }, [originalPuzzle, playStartCharacters]);

  // Restart puzzle from game over (reset lives and go to setup)
  const handleRestartPuzzle = () => {
    const resetPuzzle = JSON.parse(JSON.stringify(originalPuzzle));
    const resetState = initializeGameState(resetPuzzle);
    setGameState(resetState);
    setCurrentPuzzle(resetPuzzle);
    setLivesRemaining(currentPuzzle.lives ?? 3);
    setShowGameOver(false);
    setIsSimulating(false);
    setSelectedCharacterId(null);
    setPlayStartCharacters([]);
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
      // Reset lives for new puzzle
      setLivesRemaining(puzzle.lives ?? 3);
      setShowGameOver(false);
      setPlayStartCharacters([]);
    }
  };

  const handleStep = () => {
    if (gameState.gameStatus === 'setup') {
      setGameState((prev) => ({ ...prev, gameStatus: 'running' }));
    }

    if (gameState.gameStatus === 'running') {
      setGameState((prevState) => {
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
    testState.testMode = true; // Skip win/lose condition checks

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
    testState.testMode = true; // Skip win/lose condition checks

    setGameState(testState);
    setCurrentPuzzle(testPuzzle);
    setTestMode('characters');
    setTestTurnsRemaining(5);
    setIsSimulating(true);
    setSelectedCharacterId(null);
  };

  // Render heart icons for lives
  const renderLivesHearts = () => {
    const puzzleLives = currentPuzzle.lives ?? 3;
    const isUnlimitedLives = puzzleLives === 0;

    if (isUnlimitedLives) {
      return <span className="text-2xl" title="Unlimited lives">&#x221E;</span>;
    }

    const hearts = [];
    for (let i = 0; i < puzzleLives; i++) {
      const isFilled = i < livesRemaining;
      hearts.push(
        <span
          key={i}
          className={`text-xl ${isFilled ? 'text-red-500' : 'text-gray-600'}`}
          title={isFilled ? 'Life remaining' : 'Life lost'}
        >
          &#x2665;
        </span>
      );
    }
    return hearts;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col lg:flex-row gap-4 md:gap-8">
          {/* Game Board */}
          <div className="flex-1 flex flex-col items-center">
            {/* Play controls bar - above puzzle */}
            {gameState.gameStatus === 'setup' && testMode === 'none' && (
              <div className="mb-4">
                {/* Lives display - centered above the button row */}
                <div className="flex items-center justify-center gap-1 mb-2">
                  {renderLivesHearts()}
                </div>
                {/* Grid layout: 3 columns with Play button centered, test buttons vertically centered */}
                <div className="grid grid-cols-3 gap-2 md:gap-3 items-center">
                  {/* Left column - Test Characters */}
                  <div className="flex justify-end">
                    <button
                      onClick={handleTestCharacters}
                      className="px-2 py-1 md:px-3 md:py-2 bg-indigo-600 hover:bg-indigo-700 rounded font-medium transition text-xs md:text-sm"
                      title="Test your characters without enemies for 5 turns"
                    >
                      Test Characters
                    </button>
                  </div>

                  {/* Center column - Play button */}
                  <div className="flex justify-center">
                    <button
                      onClick={handlePlay}
                      className="px-8 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-bold transition text-lg md:text-xl shadow-lg"
                    >
                      Play
                    </button>
                  </div>

                  {/* Right column - Test Enemies */}
                  <div className="flex justify-start">
                    <button
                      onClick={handleTestEnemies}
                      className="px-2 py-1 md:px-3 md:py-2 bg-purple-600 hover:bg-purple-700 rounded font-medium transition text-xs md:text-sm"
                      title="Watch enemies move without characters for 5 turns"
                    >
                      Test Enemies
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Fancy turn counter and lives display - shows during gameplay (not setup, not test mode) */}
            {gameState.gameStatus !== 'setup' && testMode === 'none' && (
              <div className="mb-4 flex flex-col items-center">
                {/* Lives display */}
                <div className="flex items-center justify-center gap-1 mb-2">
                  {renderLivesHearts()}
                </div>
                {/* Turn counter */}
                <div className="flex items-center gap-3 px-4 py-2 bg-gray-800 rounded-lg border border-gray-600">
                  <span className="text-gray-400 text-sm font-medium">Turn</span>
                  <span className="text-2xl font-bold text-yellow-400 min-w-[2ch] text-center">
                    {gameState.currentTurn}
                  </span>
                </div>
              </div>
            )}

            {/* Test mode indicator - above puzzle */}
            {testMode !== 'none' && (
              <div className="mb-4 flex flex-col items-center">
                {/* Lives display during test mode */}
                <div className="flex items-center justify-center gap-1 mb-2">
                  {renderLivesHearts()}
                </div>
                {/* Test mode turn counter */}
                <div className="flex items-center gap-3 px-4 py-2 bg-purple-900 rounded-lg border border-purple-600">
                  <span className="text-purple-300 text-sm font-medium">
                    Testing {testMode === 'enemies' ? 'Enemies' : 'Characters'}
                  </span>
                  <span className="text-2xl font-bold text-purple-300 min-w-[2ch] text-center">
                    {testTurnsRemaining}
                  </span>
                  <span className="text-purple-400 text-sm">left</span>
                </div>
              </div>
            )}

            <ResponsiveGameBoard gameState={gameState} onTileClick={handleTileClick} />

            {/* Victory/Defeat Message */}
            {gameState.gameStatus === 'victory' && (
              <div className="mt-4 p-4 bg-green-700 rounded text-center w-full max-w-md">
                <h2 className="text-xl md:text-2xl font-bold">Victory!</h2>
                <p className="mt-2 text-sm md:text-base">Characters used: {gameState.placedCharacters.length}</p>
              </div>
            )}

            {gameState.gameStatus === 'defeat' && !showGameOver && (
              <div className="mt-4 p-4 bg-red-700 rounded text-center w-full max-w-md">
                <h2 className="text-xl md:text-2xl font-bold">Defeat</h2>
                {(currentPuzzle.lives ?? 3) > 0 && (
                  <p className="mt-2 text-sm md:text-base">
                    Lives remaining: {livesRemaining - 1} - Returning to setup...
                  </p>
                )}
                {(currentPuzzle.lives ?? 3) === 0 && (
                  <p className="mt-2 text-sm md:text-base">Try again!</p>
                )}
              </div>
            )}

            {/* Game Over Overlay */}
            {showGameOver && (
              <div className="mt-4 p-6 bg-red-900 rounded text-center w-full max-w-md border-2 border-red-500">
                <h2 className="text-2xl md:text-3xl font-bold text-red-300">Game Over</h2>
                <p className="mt-2 text-lg">No lives remaining!</p>
                <button
                  onClick={handleRestartPuzzle}
                  className="mt-4 px-6 py-3 bg-red-600 hover:bg-red-500 rounded font-bold text-lg"
                >
                  Try Again
                </button>
              </div>
            )}

            {/* Win Condition Display - below puzzle, above characters */}
            {gameState.gameStatus === 'setup' && (
              <div className="mt-4 w-full max-w-md px-4 py-2 bg-gray-800/50 rounded-lg border border-gray-700">
                <div className="flex items-center justify-center gap-2 text-sm">
                  <span className="text-gray-400">Goal:</span>
                  <span className="text-yellow-300 font-medium">
                    {gameState.puzzle.winConditions.map((wc) => {
                      switch (wc.type) {
                        case 'defeat_all_enemies':
                          return 'Defeat all enemies';
                        case 'collect_all':
                          return 'Collect all items';
                        case 'reach_goal':
                          return 'Reach the goal';
                        case 'survive_turns':
                          return `Survive ${wc.params?.turns ?? 10} turns`;
                        case 'win_in_turns':
                          return `Win within ${wc.params?.turns ?? 10} turns`;
                        case 'max_characters':
                          return `Use at most ${wc.params?.characterCount ?? 1} character${(wc.params?.characterCount ?? 1) > 1 ? 's' : ''}`;
                        case 'characters_alive':
                          return `Keep ${wc.params?.characterCount ?? 1} character${(wc.params?.characterCount ?? 1) > 1 ? 's' : ''} alive`;
                        default:
                          return wc.type;
                      }
                    }).join(' & ')}
                  </span>
                </div>
              </div>
            )}

            {/* Character Selector - below puzzle */}
            {gameState.gameStatus === 'setup' && (
              <div className="mt-3 w-full max-w-md">
                <CharacterSelector
                  availableCharacterIds={gameState.puzzle.availableCharacters}
                  selectedCharacterId={selectedCharacterId}
                  onSelectCharacter={setSelectedCharacterId}
                  placedCharacterIds={gameState.placedCharacters.map(c => c.characterId)}
                  onClearAll={handleWipe}
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


            {/* Enemies Display */}
            <EnemyDisplay enemies={gameState.puzzle.enemies} />

            {/* Status Effects Display - only shown if puzzle has status effects */}
            <StatusEffectsDisplay puzzle={gameState.puzzle} />

            {/* Special Tiles Display - only shown if puzzle has tiles with behaviors */}
            <SpecialTilesDisplay puzzle={gameState.puzzle} />
          </div>
        </div>
      </div>
    </div>
  );
};
