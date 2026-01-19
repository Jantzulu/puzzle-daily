import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { GameState, PlacedCharacter, Puzzle, PlacedEnemy, PuzzleScore } from '../../types/game';
import { Direction } from '../../types/game';
import { getTodaysPuzzle, getAllPuzzles } from '../../data/puzzles';
import { getCharacter } from '../../data/characters';
import { initializeGameState, executeTurn, checkVictoryConditions } from '../../engine/simulation';
import { calculateScore, getRankEmoji, getRankName, checkSideQuests } from '../../engine/scoring';
import { ResponsiveGameBoard } from './AnimatedGameBoard';
import { CharacterSelector } from './CharacterSelector';
import { EnemyDisplay } from './EnemyDisplay';
import { StatusEffectsDisplay } from './StatusEffectsDisplay';
import { SpecialTilesDisplay } from './SpecialTilesDisplay';
import { ItemsDisplay } from './ItemsDisplay';
import { getSavedPuzzles, type SavedPuzzle } from '../../utils/puzzleStorage';
import { loadTileType, loadCollectible, loadEnemy } from '../../utils/assetStorage';
import { HelpButton } from './HelpOverlay';
import { playGameSound, playVictoryMusic, playDefeatMusic, playBackgroundMusic, stopMusic } from '../../utils/gameSounds';
import { loadThemeAssets, subscribeToThemeAssets, type ThemeAssets } from '../../utils/themeAssets';
import { WarningModal } from '../shared/WarningModal';

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

  // Scoring system
  const [puzzleScore, setPuzzleScore] = useState<PuzzleScore | null>(null);

  // Test mode state
  const [testMode, setTestMode] = useState<TestMode>('none');
  const [testTurnsRemaining, setTestTurnsRemaining] = useState(0);
  const testSnapshotRef = useRef<{
    characters: PlacedCharacter[];
    enemies: PlacedEnemy[];
    puzzle: Puzzle;
  } | null>(null);

  // Theme assets for custom icons
  const [themeAssets, setThemeAssets] = useState<ThemeAssets>(() => loadThemeAssets());

  // Concede confirmation state
  const [showConcedeConfirm, setShowConcedeConfirm] = useState(false);

  // Track defeat reason
  const [defeatReason, setDefeatReason] = useState<'damage' | 'turns' | null>(null);

  // Warning modal state
  const [warningModal, setWarningModal] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: '',
  });

  // Reload saved puzzles when component mounts or when returning from editor
  useEffect(() => {
    const handleFocus = () => {
      setSavedPuzzles(getSavedPuzzles());
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Subscribe to theme asset changes
  useEffect(() => {
    const unsubscribe = subscribeToThemeAssets((assets) => {
      setThemeAssets(assets);
    });
    return unsubscribe;
  }, []);

  // Play background music when puzzle changes (puzzle-specific or global fallback)
  useEffect(() => {
    playBackgroundMusic(currentPuzzle.backgroundMusicId);
  }, [currentPuzzle.id, currentPuzzle.backgroundMusicId]);

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
            // Calculate and store score
            const score = calculateScore(newState, livesRemaining, currentPuzzle.lives ?? 3);
            setPuzzleScore(score);
          }

          // Handle defeat - deduct a life and auto-reset (or show game over)
          if (newState.gameStatus === 'defeat') {
            const puzzleLives = currentPuzzle.lives ?? 3;
            const isUnlimitedLives = puzzleLives === 0;

            // Determine defeat reason
            const maxTurns = currentPuzzle.maxTurns || 1000;
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
        playGameSound('error');
        return; // Can't place on null/void tiles
      }

      // Check if custom tile prevents placement
      if (tile.customTileTypeId) {
        const customTileType = loadTileType(tile.customTileTypeId);
        if (customTileType?.preventPlacement) {
          playGameSound('error');
          return; // Can't place on tiles that prevent placement
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
            return; // Can't place on tiles with collectibles that prevent placement
          }
        }
      }

      const tileHasEnemy = gameState.puzzle.enemies.some((e) => e.x === x && e.y === y && !e.dead);

      if (tileHasEnemy) {
        playGameSound('error');
        return; // Can't place on occupied tile
      }

      // Check if this character type is already placed (only one of each allowed)
      const alreadyPlaced = gameState.placedCharacters.some((c) => c.characterId === selectedCharacterId);
      if (alreadyPlaced) {
        playGameSound('error');
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

  // Called from AnimatedGameBoard when a projectile kills an enemy
  // This allows victory detection during the animation loop, not just at turn boundaries
  const handleProjectileKill = useCallback(() => {
    if (gameState.gameStatus !== 'running') return;

    // Check if victory conditions are now met
    if (checkVictoryConditions(gameState)) {
      // Victory! Stop simulation and trigger victory handling
      setIsSimulating(false);
      setGameState(prev => ({ ...prev, gameStatus: 'victory' }));
      playGameSound('victory');
      playVictoryMusic();
      // Calculate and store score
      const score = calculateScore(gameState, livesRemaining, currentPuzzle.lives ?? 3);
      setPuzzleScore(score);
    }
  }, [gameState, livesRemaining, currentPuzzle.lives]);

  const handlePlay = () => {
    if (gameState.placedCharacters.length === 0) {
      setWarningModal({ isOpen: true, message: 'Place at least one hero on the board before starting!' });
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
    setPuzzleScore(null);
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
    setPuzzleScore(null);
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
    setPuzzleScore(null);
    setDefeatReason(null);
  };

  // Concede current attempt - lose a life and return to setup
  const handleConcede = () => {
    setShowConcedeConfirm(false);
    setIsSimulating(false);
    setDefeatReason('damage'); // Conceding counts as damage death

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
        // Life lost - play sound and reset
        playGameSound('life_lost');
        handleAutoReset();
      }
    } else {
      // Unlimited lives - just reset
      handleAutoReset();
    }
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
      setPuzzleScore(null);
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
      setWarningModal({ isOpen: true, message: 'Place at least one hero to test!' });
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

  // Render heart icons for lives (uses custom theme icons if available)
  const renderLivesHearts = () => {
    const puzzleLives = currentPuzzle.lives ?? 3;
    const isUnlimitedLives = puzzleLives === 0;

    if (isUnlimitedLives) {
      return <span className="text-2xl text-copper-400" title="Unlimited lives">&#x221E;</span>;
    }

    const hearts = [];
    for (let i = 0; i < puzzleLives; i++) {
      const isFilled = i < livesRemaining;
      const customIcon = isFilled ? themeAssets.iconHeart : themeAssets.iconHeartEmpty;

      if (customIcon) {
        // Use custom heart icon from theme with pixel-perfect 2x scaling
        // 14x16 source -> 28x32 display for crisp pixel art
        hearts.push(
          <img
            key={i}
            src={customIcon}
            alt={isFilled ? 'Life remaining' : 'Life lost'}
            title={isFilled ? 'Life remaining' : 'Life lost'}
            className="object-contain pixelated"
            style={{
              width: '28px',
              height: '32px',
              opacity: isFilled ? 1 : 0.4
            }}
          />
        );
      } else {
        // Use default Unicode heart
        hearts.push(
          <span
            key={i}
            className={`text-xl ${isFilled ? 'heart-filled' : 'heart-empty'}`}
            title={isFilled ? 'Life remaining' : 'Life lost'}
          >
            &#x2665;
          </span>
        );
      }
    }
    return hearts;
  };

  return (
    <div className="min-h-screen theme-root text-parchment-200 p-4 md:p-8 relative">
      {/* Underground cave background effect - positioned below nav bar */}
      <div className="absolute inset-0 pointer-events-none -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-stone-950 via-stone-900/50 to-stone-950" />
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: `radial-gradient(ellipse at 50% 0%, rgba(212, 165, 116, 0.08) 0%, transparent 50%)`
        }} />
      </div>

      <div className="max-w-6xl mx-auto relative">
        <div className="flex flex-col lg:flex-row gap-4 md:gap-8">
          {/* Game Board - The Dungeon */}
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
                      className="dungeon-btn-arcane text-xs md:text-sm px-2 py-1 md:px-3 md:py-2"
                      title="Test your characters without enemies for 5 turns"
                    >
                      Test Heroes
                    </button>
                  </div>

                  {/* Center column - Play button */}
                  <div className="flex justify-center">
                    <button
                      onClick={handlePlay}
                      className="dungeon-btn-success px-6 md:px-8 py-3 font-bold text-lg md:text-xl torch-glow"
                    >
                      {themeAssets.iconNavPlay || '\u2694'} Play
                    </button>
                  </div>

                  {/* Right column - Test Enemies */}
                  <div className="flex justify-start">
                    <button
                      onClick={handleTestEnemies}
                      className="dungeon-btn-danger text-xs md:text-sm px-2 py-1 md:px-3 md:py-2"
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
                {/* Turn counter with concede button */}
                <div className="flex items-center gap-3">
                  <div className="dungeon-panel flex items-center gap-3 px-4 py-2">
                    <span className="text-stone-400 text-sm font-medium">Turn</span>
                    {(() => {
                      const maxTurns = currentPuzzle.maxTurns;
                      const turnsRemaining = maxTurns ? maxTurns - gameState.currentTurn : null;
                      const isNearLimit = turnsRemaining !== null && turnsRemaining <= 3;
                      const isVeryNearLimit = turnsRemaining !== null && turnsRemaining <= 1;

                      return (
                        <>
                          <span className={`text-2xl font-bold min-w-[2ch] text-center ${
                            isVeryNearLimit
                              ? 'text-blood-400 text-shadow-glow-blood animate-pulse'
                              : isNearLimit
                              ? 'text-rust-400'
                              : 'text-copper-400 text-shadow-glow-copper'
                          }`}>
                            {gameState.currentTurn}
                          </span>
                          {maxTurns && (
                            <span className={`text-sm ${
                              isNearLimit ? 'text-blood-400' : 'text-stone-500'
                            }`}>
                              / {maxTurns}
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  {/* Concede button - only during running state */}
                  {gameState.gameStatus === 'running' && (
                    <button
                      onClick={() => setShowConcedeConfirm(true)}
                      className="dungeon-btn-danger text-xs px-2 py-1"
                      title="Give up this attempt and lose a life"
                    >
                      Concede
                    </button>
                  )}
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
                {/* Test mode turn counter - arcane for characters, blood for enemies */}
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

            <ResponsiveGameBoard gameState={gameState} onTileClick={handleTileClick} onProjectileKill={handleProjectileKill} />

            {/* Victory/Defeat Message */}
            {gameState.gameStatus === 'victory' && puzzleScore && (
              <div className="victory-panel mt-4 p-4 rounded-pixel-lg text-center w-full max-w-md">
                {/* Trophy and Rank */}
                <div className="text-4xl mb-1">{getRankEmoji(puzzleScore.rank)}</div>
                <h2 className="text-xl md:text-2xl font-bold font-medieval text-moss-200 text-shadow-dungeon">
                  {getRankName(puzzleScore.rank)}
                </h2>

                {/* Stats for Gold trophy */}
                {puzzleScore.rank === 'gold' && (
                  <p className="text-sm text-moss-300 mt-1">
                    ({puzzleScore.stats.charactersUsed} hero{puzzleScore.stats.charactersUsed !== 1 ? 'es' : ''}, {puzzleScore.stats.turnsUsed} turn{puzzleScore.stats.turnsUsed !== 1 ? 's' : ''})
                  </p>
                )}

                {/* Total Score */}
                <div className="mt-3 text-2xl font-bold text-copper-300 text-shadow-glow-copper">
                  {puzzleScore.totalPoints.toLocaleString()} pts
                </div>

                {/* Par Status */}
                <div className="mt-2 flex justify-center gap-4 text-xs">
                  <span className={puzzleScore.parMet.characters ? 'text-moss-300' : 'text-stone-500'}>
                    {puzzleScore.parMet.characters ? '✓' : '✗'} Hero Par ({currentPuzzle.parCharacters ?? '-'})
                  </span>
                  <span className={puzzleScore.parMet.turns ? 'text-moss-300' : 'text-stone-500'}>
                    {puzzleScore.parMet.turns ? '✓' : '✗'} Turn Par ({currentPuzzle.parTurns ?? '-'})
                  </span>
                </div>

                {/* Point Breakdown - Collapsible */}
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

                {/* Completed Side Quests */}
                {puzzleScore.completedSideQuests.length > 0 && (
                  <div className="mt-2 text-xs text-arcane-300">
                    Side Quests: {puzzleScore.completedSideQuests.map(qid => {
                      const quest = currentPuzzle.sideQuests?.find(q => q.id === qid);
                      return quest?.title || qid;
                    }).join(', ')}
                  </div>
                )}
              </div>
            )}

            {gameState.gameStatus === 'defeat' && !showGameOver && (
              <div className="defeat-panel mt-4 p-4 rounded-pixel-lg text-center w-full max-w-md">
                <h2 className="text-xl md:text-2xl font-bold font-medieval text-blood-200 text-shadow-glow-blood">
                  {defeatReason === 'turns' ? 'Out of Time!' : 'Defeat'}
                </h2>
                <p className="mt-1 text-sm text-blood-400">
                  {defeatReason === 'turns'
                    ? 'You ran out of turns before completing the objective.'
                    : 'Your heroes have fallen in battle.'}
                </p>
                {(currentPuzzle.lives ?? 3) > 0 && (
                  <p className="mt-2 text-sm md:text-base text-blood-300">
                    Lives remaining: {livesRemaining - 1} - Returning to setup...
                  </p>
                )}
                {(currentPuzzle.lives ?? 3) === 0 && (
                  <p className="mt-2 text-sm md:text-base text-blood-300">Try again!</p>
                )}
              </div>
            )}

            {/* Game Over Overlay */}
            {showGameOver && (
              <div className="defeat-panel mt-4 p-6 rounded-pixel-lg text-center w-full max-w-md">
                <h2 className="text-2xl md:text-3xl font-bold font-medieval text-blood-200 text-shadow-glow-blood">Game Over</h2>
                <p className="mt-2 text-lg text-blood-300">No lives remaining!</p>
                <button
                  onClick={handleRestartPuzzle}
                  className="dungeon-btn-danger mt-4 px-6 py-3 font-bold text-lg"
                >
                  Try Again
                </button>
              </div>
            )}

            {/* Concede Confirmation Popup */}
            {showConcedeConfirm && (
              <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                <div className="defeat-panel p-6 rounded-pixel-lg text-center max-w-sm mx-4">
                  <h3 className="text-xl font-bold font-medieval text-blood-200 text-shadow-glow-blood">
                    Concede?
                  </h3>
                  <p className="mt-2 text-blood-300">
                    You will lose a life and return to setup.
                  </p>
                  <div className="mt-4 flex gap-3 justify-center">
                    <button
                      onClick={() => setShowConcedeConfirm(false)}
                      className="dungeon-btn px-4 py-2"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConcede}
                      className="dungeon-btn-danger px-4 py-2"
                    >
                      Concede
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Win Condition Display - below puzzle, visible during setup and gameplay */}
            {(gameState.gameStatus === 'setup' || gameState.gameStatus === 'running') && (
              <div className="mt-4 w-full max-w-md px-4 py-2 dungeon-panel-dark">
                <div className="flex items-center justify-center gap-2 text-sm flex-wrap">
                  <HelpButton sectionId="game_general" />
                  <span className="text-stone-400">Quest:</span>
                  <span className="text-copper-300 font-medium">
                    {gameState.puzzle.winConditions.map((wc) => {
                      switch (wc.type) {
                        case 'defeat_all_enemies': {
                          // Count all enemies that are still alive
                          const enemyCount = gameState.puzzle.enemies.filter(e => !e.dead).length;
                          return `Defeat all Enemies (${enemyCount})`;
                        }
                        case 'defeat_boss': {
                          // Get boss names from placed enemies
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
                          // Count collectibles that haven't been collected
                          const collectibleCount = gameState.puzzle.collectibles.filter(c => !c.collected).length;
                          return `Collect all Items (${collectibleCount})`;
                        }
                        case 'collect_keys': {
                          // Count key collectibles that haven't been collected
                          const keyCount = gameState.puzzle.collectibles.filter(c => {
                            const collectible = loadCollectible(c.collectibleId);
                            return collectible?.effect === 'win_key' && !c.collected;
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
                  {gameState.puzzle.maxTurns && (
                    <>
                      <span className="text-stone-600">|</span>
                      <span className="text-stone-400">Max Turns:</span>
                      <span className="text-parchment-300 font-medium">{gameState.puzzle.maxTurns}</span>
                    </>
                  )}
                </div>

                {/* Side Quests Display - with dynamic completion status during gameplay */}
                {gameState.puzzle.sideQuests && gameState.puzzle.sideQuests.length > 0 && (() => {
                  // Check current completion status during gameplay
                  const completedQuestIds = gameState.gameStatus === 'running'
                    ? checkSideQuests(gameState)
                    : [];

                  return (
                    <div className="flex items-center justify-center gap-2 text-sm mt-2 pt-2 border-t border-stone-700 flex-wrap">
                      <HelpButton sectionId="side_quests" />
                      <span className="text-arcane-400">Side Quests:</span>
                      <span className="text-arcane-300">
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
              <div className="dungeon-panel p-4">
                <label className="block text-sm font-bold mb-2 text-copper-400">
                  Select Dungeon {savedPuzzles.length > 0 && <span className="text-stone-400 font-normal">({savedPuzzles.length} saved)</span>}
                </label>
                <select
                  value={currentPuzzle.id}
                  onChange={(e) => handlePuzzleChange(e.target.value)}
                  className="dungeon-select w-full"
                >
                  {officialPuzzles.length > 0 && (
                    <optgroup label="Official Dungeons">
                      {officialPuzzles.map((puzzle) => (
                        <option key={puzzle.id} value={puzzle.id}>
                          {puzzle.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {savedPuzzles.length > 0 && (
                    <optgroup label="Your Saved Dungeons">
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

            {/* Items Display - only shown if puzzle has items */}
            <ItemsDisplay puzzle={gameState.puzzle} />

            {/* Status Effects Display - only shown if puzzle has status effects */}
            <StatusEffectsDisplay puzzle={gameState.puzzle} />

            {/* Special Tiles Display - only shown if puzzle has tiles with behaviors */}
            <SpecialTilesDisplay puzzle={gameState.puzzle} />
          </div>
        </div>
      </div>

      {/* Warning Modal */}
      <WarningModal
        isOpen={warningModal.isOpen}
        onClose={() => setWarningModal({ isOpen: false, message: '' })}
        title="Hold On!"
        message={warningModal.message}
      />
    </div>
  );
};
