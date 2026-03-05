import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { GameState, PlacedCharacter, Puzzle } from '../../types/game';
import { TURN_INTERVAL_MS } from '../../types/game';
import { getAllPuzzles } from '../../data/puzzles';
import { getAllCharacters, getCharacter } from '../../data/characters';
import { initializeGameState, executeTurn } from '../../engine/simulation';
import { ResponsiveGameBoard } from '../game/AnimatedGameBoard';
import { CharacterSelector } from '../game/CharacterSelector';
import { ReplayControls } from '../game/ReplayControls';
import { getSavedPuzzles } from '../../utils/puzzleStorage';
import { loadTileType, loadCollectible } from '../../utils/assetStorage';
import { diffTurn } from '../../engine/combatLog';
import type { LogEventType } from '../../engine/combatLog';
import { playGameSound } from '../../utils/gameSounds';
import { vibrate } from '../../utils/haptics';

/** Deep copy GameState preserving Map/Set structures */
function deepCopyState(state: GameState): GameState {
  const copy = JSON.parse(JSON.stringify(state));
  copy.tileStates = new Map();
  if (state.tileStates) {
    state.tileStates.forEach((value: any, key: string) => {
      copy.tileStates.set(key, {
        ...value,
        damagedEntities: value.damagedEntities ? new Set(value.damagedEntities) : undefined,
      });
    });
  }
  if (state.tilesBeingVacated) {
    copy.tilesBeingVacated = new Set(state.tilesBeingVacated);
  }
  return copy;
}

type TrainingView = 'landing' | 'sandbox';

// ============================================================
// MAIN COMPONENT
// ============================================================

export const TrainingGrounds: React.FC = () => {
  const [view, setView] = useState<TrainingView>('landing');

  // -- Training puzzle list --
  const trainingPuzzles = useMemo(() => {
    const official = getAllPuzzles();
    const saved = getSavedPuzzles();
    const all: Puzzle[] = [...official, ...saved];
    const seen = new Set<string>();
    const deduped: Puzzle[] = [];
    for (const p of all) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        deduped.push(p);
      }
    }
    return deduped.filter(p => p.isTraining);
  }, []);

  // All published hero IDs
  const allCharacterIds = useMemo(() => getAllCharacters().map(c => c.id), []);

  // -- Active arena state --
  const [selectedPuzzle, setSelectedPuzzle] = useState<Puzzle | null>(null);
  const [originalPuzzle, setOriginalPuzzle] = useState<Puzzle | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [playStartCharacters, setPlayStartCharacters] = useState<PlacedCharacter[]>([]);

  // -- Replay state --
  const [replayMode, setReplayMode] = useState(false);
  const [replayTurnIndex, setReplayTurnIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const turnHistoryRef = useRef<GameState[]>([]);
  const replayEventsRef = useRef<Map<number, Set<LogEventType>>>(new Map());

  // ============================================================
  // ARENA SELECTION
  // ============================================================

  const handleSelectArena = useCallback((puzzle: Puzzle) => {
    const puzzleCopy: Puzzle = JSON.parse(JSON.stringify(puzzle));
    setOriginalPuzzle(puzzleCopy);
    setSelectedPuzzle(puzzle);
    const state = initializeGameState(JSON.parse(JSON.stringify(puzzle)));
    state.testMode = true; // Skip win/loss condition checks — training is a sandbox
    setGameState(state);
    setIsSimulating(false);
    setSelectedCharacterId(null);
    setPlayStartCharacters([]);
    setReplayMode(false);
    turnHistoryRef.current = [];
    replayEventsRef.current = new Map();
  }, []);

  const handleEnterSandbox = useCallback(() => {
    setView('sandbox');
    if (trainingPuzzles.length > 0) {
      handleSelectArena(trainingPuzzles[0]);
    }
  }, [trainingPuzzles, handleSelectArena]);

  const handleBackToLanding = () => {
    setView('landing');
    setSelectedPuzzle(null);
    setOriginalPuzzle(null);
    setGameState(null);
    setIsSimulating(false);
    setSelectedCharacterId(null);
    setPlayStartCharacters([]);
    setReplayMode(false);
    setReplayPlaying(false);
    turnHistoryRef.current = [];
    replayEventsRef.current = new Map();
  };

  const handlePuzzleChange = useCallback((puzzleId: string) => {
    const puzzle = trainingPuzzles.find(p => p.id === puzzleId);
    if (puzzle) handleSelectArena(puzzle);
  }, [trainingPuzzles, handleSelectArena]);

  // ============================================================
  // TILE CLICK (placement / removal)
  // ============================================================

  const handleTileClick = useCallback(
    (x: number, y: number) => {
      if (!gameState || gameState.gameStatus !== 'setup') return;

      // Click existing character to remove
      const clicked = gameState.placedCharacters.find(c => c.x === x && c.y === y);
      if (clicked) {
        setGameState(prev => prev && ({
          ...prev,
          placedCharacters: prev.placedCharacters.filter(c => c.x !== x || c.y !== y),
        }));
        playGameSound('character_removed');
        vibrate('heroRemove');
        return;
      }

      if (!selectedCharacterId) return;

      // Validate tile
      const tile = gameState.puzzle.tiles[y]?.[x];
      if (!tile) { playGameSound('error'); return; }
      if (tile.customTileTypeId) {
        const ct = loadTileType(tile.customTileTypeId);
        if (ct?.preventPlacement) { playGameSound('error'); return; }
      }
      const collsAt = gameState.puzzle.collectibles.filter(c => c.x === x && c.y === y && !c.collected);
      for (const placed of collsAt) {
        if (placed.collectibleId) {
          const coll = loadCollectible(placed.collectibleId);
          if (coll?.preventPlacement) { playGameSound('error'); return; }
        }
      }
      if (gameState.puzzle.enemies.some(e => e.x === x && e.y === y && !e.dead)) { playGameSound('error'); return; }
      if (gameState.placedCharacters.some(c => c.x === x && c.y === y && !c.dead)) { playGameSound('error'); return; }
      if (gameState.placedCharacters.some(c => c.characterId === selectedCharacterId)) { playGameSound('error'); return; }
      const maxP = gameState.puzzle.maxPlaceableCharacters ?? gameState.puzzle.maxCharacters;
      if (gameState.placedCharacters.length >= maxP) { playGameSound('error'); return; }

      const charData = getCharacter(selectedCharacterId);
      if (!charData) return;

      const newChar: PlacedCharacter = {
        characterId: selectedCharacterId,
        x, y,
        facing: charData.defaultFacing,
        currentHealth: charData.health,
        actionIndex: 0,
        active: true,
        dead: false,
      };

      setGameState(prev => prev && ({
        ...prev,
        placedCharacters: [...prev.placedCharacters, newChar],
      }));
      playGameSound('character_placed');
      vibrate('characterPlace');
    },
    [selectedCharacterId, gameState],
  );

  // ============================================================
  // PLAY / PAUSE / RESET / WIPE
  // ============================================================

  const handlePlay = () => {
    if (!gameState || gameState.placedCharacters.length === 0) return;
    setPlayStartCharacters(JSON.parse(JSON.stringify(gameState.placedCharacters)));
    setGameState(prev => prev && ({ ...prev, gameStatus: 'running' }));
    setIsSimulating(true);
    playGameSound('simulation_start');
    vibrate('playButton');
  };

  const handlePause = () => {
    setIsSimulating(false);
    playGameSound('simulation_stop');
  };

  const handleReset = () => {
    if (!originalPuzzle) return;
    const resetPuzzle: Puzzle = JSON.parse(JSON.stringify(originalPuzzle));
    const resetState = initializeGameState(resetPuzzle);
    resetState.testMode = true;
    resetState.placedCharacters = JSON.parse(JSON.stringify(playStartCharacters)).map((char: PlacedCharacter) => {
      const cd = getCharacter(char.characterId);
      return { ...char, actionIndex: 0, currentHealth: cd ? cd.health : char.currentHealth, dead: false, active: true };
    });
    resetState.gameStatus = 'setup';
    setGameState(resetState);
    setIsSimulating(false);
    setSelectedCharacterId(null);
  };

  const handleWipe = () => {
    if (!originalPuzzle) return;
    const wipedPuzzle: Puzzle = JSON.parse(JSON.stringify(originalPuzzle));
    const wipedState = initializeGameState(wipedPuzzle);
    wipedState.testMode = true;
    wipedState.placedCharacters = [];
    wipedState.gameStatus = 'setup';
    setGameState(wipedState);
    setIsSimulating(false);
    setSelectedCharacterId(null);
    vibrate('heroTrash');
  };

  const handleStep = () => {
    if (!gameState) return;
    if (gameState.gameStatus === 'setup') {
      if (gameState.placedCharacters.length === 0) return;
      setPlayStartCharacters(JSON.parse(JSON.stringify(gameState.placedCharacters)));
      setGameState(prev => prev && ({ ...prev, gameStatus: 'running' }));
    }
    if (gameState.gameStatus === 'running' || gameState.gameStatus === 'setup') {
      setGameState(prev => {
        if (!prev) return prev;
        const copy = JSON.parse(JSON.stringify(prev));
        copy.tileStates = new Map();
        if (prev.tileStates) {
          prev.tileStates.forEach((value, key) => {
            copy.tileStates.set(key, { ...value, damagedEntities: value.damagedEntities ? new Set(value.damagedEntities) : undefined });
          });
        }
        copy.gameStatus = 'running';
        const next = executeTurn(copy);
        if (next.gameStatus !== 'running' || next.currentTurn >= 100) setIsSimulating(false);
        return next;
      });
    }
  };

  // ============================================================
  // SIMULATION LOOP
  // ============================================================

  useEffect(() => {
    if (!isSimulating || !gameState || gameState.gameStatus !== 'running') return;

    const interval = setInterval(() => {
      vibrate('turnAdvance');

      setGameState(prev => {
        if (!prev) return prev;
        const copy = JSON.parse(JSON.stringify(prev));
        copy.tileStates = new Map();
        if (prev.tileStates) {
          prev.tileStates.forEach((value, key) => {
            copy.tileStates.set(key, { ...value, damagedEntities: value.damagedEntities ? new Set(value.damagedEntities) : undefined });
          });
        }
        const next = executeTurn(copy);
        if (next.gameStatus !== 'running' || next.currentTurn >= 100) setIsSimulating(false);
        return next;
      });
    }, TURN_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isSimulating, gameState?.gameStatus]);

  // ============================================================
  // REPLAY
  // ============================================================

  const generateTurnHistory = useCallback((): GameState[] => {
    if (!originalPuzzle) return [];
    const puzzleCopy: Puzzle = JSON.parse(JSON.stringify(originalPuzzle));
    const initial = initializeGameState(puzzleCopy);
    initial.placedCharacters = JSON.parse(JSON.stringify(playStartCharacters)).map((char: PlacedCharacter) => {
      const cd = getCharacter(char.characterId);
      return { ...char, actionIndex: 0, currentHealth: cd ? cd.health : char.currentHealth, dead: false, active: true };
    });
    initial.gameStatus = 'running';
    initial.headlessMode = true;

    const history: GameState[] = [deepCopyState(initial)];
    let current = initial;
    const maxIter = (puzzleCopy.maxTurns || 200) + 10;
    for (let i = 0; i < maxIter; i++) {
      if (current.gameStatus !== 'running') break;
      current = executeTurn(deepCopyState(current));
      history.push(deepCopyState(current));
    }
    return history;
  }, [originalPuzzle, playStartCharacters]);

  const handleWatchReplay = useCallback(() => {
    const history = generateTurnHistory();
    turnHistoryRef.current = history;

    const events = new Map<number, Set<LogEventType>>();
    for (let i = 1; i < history.length; i++) {
      const entries = diffTurn(history[i - 1], history[i]);
      const notable = entries.filter(e => e.type !== 'move' && !(e.type === 'game' && e.text === 'No notable events'));
      if (notable.length > 0) events.set(i, new Set(notable.map(e => e.type)));
    }
    replayEventsRef.current = events;

    setReplayMode(true);
    setReplayTurnIndex(0);
    setReplayPlaying(false);
    setReplaySpeed(1);
    if (history.length > 0) setGameState(history[0]);
  }, [generateTurnHistory]);

  const handleExitReplay = useCallback(() => {
    setReplayMode(false);
    setReplayPlaying(false);
    turnHistoryRef.current = [];
    replayEventsRef.current = new Map();
    handleReset();
  }, [originalPuzzle, playStartCharacters]);

  const handleReplayPlayPause = useCallback(() => setReplayPlaying(p => !p), []);

  const handleReplayStepForward = useCallback(() => {
    setReplayPlaying(false);
    const h = turnHistoryRef.current;
    setReplayTurnIndex(prev => { const n = Math.min(prev + 1, h.length - 1); setGameState(h[n]); return n; });
  }, []);

  const handleReplayStepBack = useCallback(() => {
    setReplayPlaying(false);
    const h = turnHistoryRef.current;
    setReplayTurnIndex(prev => { const n = Math.max(prev - 1, 0); setGameState(h[n]); return n; });
  }, []);

  const handleReplaySeek = useCallback((turn: number) => {
    setReplayPlaying(false);
    const h = turnHistoryRef.current;
    const c = Math.max(0, Math.min(turn, h.length - 1));
    setGameState(h[c]);
    setReplayTurnIndex(c);
  }, []);

  const handleReplaySpeedChange = useCallback((speed: number) => setReplaySpeed(speed), []);

  // Replay playback timer
  useEffect(() => {
    if (!replayMode || !replayPlaying) return;
    const history = turnHistoryRef.current;
    if (history.length === 0) return;
    const intervalMs = TURN_INTERVAL_MS / replaySpeed;
    const interval = setInterval(() => {
      setReplayTurnIndex(prev => {
        const next = prev + 1;
        if (next >= history.length) { setReplayPlaying(false); return prev; }
        setGameState(history[next]);
        return next;
      });
    }, intervalMs);
    return () => clearInterval(interval);
  }, [replayMode, replayPlaying, replaySpeed]);

  // ============================================================
  // RENDER — LANDING PAGE
  // ============================================================

  if (view === 'landing') {
    return (
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-medieval text-copper-400">Training Grounds</h1>
            <p className="text-stone-400 mt-2">Sharpen your skills and master the dungeon</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
            {/* Tutorial Levels — Coming Soon */}
            <div className="dungeon-panel p-6 opacity-60 cursor-not-allowed relative">
              <div className="absolute top-3 right-3">
                <span className="text-[0.65rem] font-bold uppercase tracking-wider bg-stone-700/80 text-stone-300 px-2 py-0.5 rounded">
                  Coming Soon
                </span>
              </div>
              <div className="text-center space-y-3">
                <div className="text-4xl">📜</div>
                <h2 className="font-medieval text-copper-400 text-xl">Tutorial Levels</h2>
                <p className="text-stone-400 text-sm">
                  Learn the basics step by step with guided lessons on movement, combat, and strategy.
                </p>
              </div>
            </div>

            {/* Training Sandbox */}
            <div
              onClick={handleEnterSandbox}
              className="dungeon-panel p-6 cursor-pointer hover:border-copper-500/50 transition-colors"
            >
              <div className="text-center space-y-3">
                <div className="text-4xl">⚔️</div>
                <h2 className="font-medieval text-copper-400 text-xl">Training Sandbox</h2>
                <p className="text-stone-400 text-sm">
                  Practice freely with training puzzles. Experiment with heroes, test strategies, and replay your runs.
                </p>
                {trainingPuzzles.length > 0 ? (
                  <p className="text-xs text-stone-500">{trainingPuzzles.length} arena{trainingPuzzles.length !== 1 ? 's' : ''} available</p>
                ) : (
                  <p className="text-xs text-stone-500">No arenas yet — create one in the Editor</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER — SANDBOX (no puzzle loaded yet)
  // ============================================================

  if (!selectedPuzzle || !gameState) {
    return (
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={handleBackToLanding} className="dungeon-btn px-3 py-1.5 text-sm font-bold flex items-center gap-1">
              <span>&larr;</span> Back
            </button>
            <h1 className="text-2xl font-medieval text-copper-400">Training Sandbox</h1>
          </div>
          <div className="dungeon-panel p-8 text-center">
            <p className="text-stone-400 text-lg mb-2">No training arenas available</p>
            <p className="text-stone-500 text-sm">
              Create a puzzle in the Editor and check "Training Arena" to add it here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER — SANDBOX GAME
  // ============================================================

  const status = gameState.gameStatus;
  const isSetup = status === 'setup';
  const isRunning = status === 'running';
  const isEnded = status === 'victory' || status === 'defeat';

  return (
    <div className="min-h-screen text-parchment-200 px-4 pb-4 md:px-8 md:pb-8">
      <div className="max-w-5xl mx-auto space-y-3 pt-2">
        {/* Back button + centered title */}
        <div className="relative flex items-center">
          <button onClick={handleBackToLanding} className="dungeon-btn px-3 py-1.5 text-sm font-bold flex items-center gap-1 absolute left-0">
            <span>&larr;</span> Back
          </button>
          <h2 className="font-medieval text-copper-400 text-lg md:text-xl text-center flex-1">Training Sandbox</h2>
        </div>

        {/* Centered puzzle selector */}
        <div className="text-center">
          <select
            value={selectedPuzzle.id}
            onChange={(e) => handlePuzzleChange(e.target.value)}
            className="dungeon-select mx-auto"
          >
            {trainingPuzzles.map((puzzle) => (
              <option key={puzzle.id} value={puzzle.id}>
                {puzzle.name}
              </option>
            ))}
          </select>
        </div>

        {selectedPuzzle.description && (
          <p className="text-sm text-stone-400 text-center">{selectedPuzzle.description}</p>
        )}

        {/* Game board */}
        <div className="relative" ref={undefined}>
          <ResponsiveGameBoard
            gameState={gameState}
            onTileClick={isSetup && !replayMode ? handleTileClick : undefined}
          />

          {/* Victory / Defeat overlay */}
          {isEnded && !replayMode && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg z-10">
              <div className="dungeon-panel p-6 max-w-xs text-center space-y-3">
                <h3 className="font-medieval text-xl text-copper-400">
                  {status === 'victory' ? 'Victory!' : 'Defeat'}
                </h3>
                <p className="text-sm text-stone-400">
                  {status === 'victory'
                    ? 'All objectives completed.'
                    : 'Your heroes have fallen. Try a different approach!'}
                </p>
                <div className="flex flex-col gap-2">
                  {playStartCharacters.length > 0 && (
                    <button onClick={handleWatchReplay} className="dungeon-btn px-4 py-2 text-sm font-bold w-full">
                      Watch Replay
                    </button>
                  )}
                  <button onClick={handleReset} className="dungeon-btn-primary px-4 py-2 text-sm font-bold w-full">
                    Try Again
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Replay controls */}
        {replayMode && (
          <ReplayControls
            currentTurn={replayTurnIndex}
            totalTurns={turnHistoryRef.current.length - 1}
            isPlaying={replayPlaying}
            speed={replaySpeed}
            events={replayEventsRef.current}
            onPlayPause={handleReplayPlayPause}
            onStepForward={handleReplayStepForward}
            onStepBack={handleReplayStepBack}
            onSeek={handleReplaySeek}
            onSpeedChange={handleReplaySpeedChange}
            onExit={handleExitReplay}
          />
        )}

        {/* Transport controls (when not replaying) */}
        {!replayMode && (
          <div className="flex items-center justify-center gap-2">
            {isRunning && (
              <span className="text-xs text-stone-400 font-mono mr-1">Turn {gameState.currentTurn}/100</span>
            )}
            {isSetup && (
              <button onClick={handlePlay} className="dungeon-btn-primary px-5 py-2 text-sm font-bold" disabled={gameState.placedCharacters.length === 0}>
                Play
              </button>
            )}
            {isRunning && !isSimulating && (
              <button onClick={() => { setIsSimulating(true); }} className="dungeon-btn-primary px-5 py-2 text-sm font-bold">
                Resume
              </button>
            )}
            {isRunning && isSimulating && (
              <button onClick={handlePause} className="dungeon-btn px-5 py-2 text-sm font-bold">
                Pause
              </button>
            )}
            {(isRunning || isSetup) && (
              <button onClick={handleStep} className="dungeon-btn px-4 py-2 text-sm font-bold" disabled={isSetup && gameState.placedCharacters.length === 0}>
                Step
              </button>
            )}
            {(isRunning || isEnded) && (
              <button onClick={handleReset} className="dungeon-btn px-4 py-2 text-sm font-bold">
                Reset
              </button>
            )}
          </div>
        )}

        {/* Character selector — all heroes */}
        {!replayMode && (
          <div className="dungeon-panel p-3">
            <CharacterSelector
              availableCharacterIds={allCharacterIds}
              selectedCharacterId={isSetup ? selectedCharacterId : null}
              onSelectCharacter={isSetup ? (id) => { setSelectedCharacterId(id); vibrate('heroSelect'); } : () => {}}
              placedCharacterIds={gameState.placedCharacters.map(c => c.characterId)}
              maxPlaceable={gameState.puzzle.maxPlaceableCharacters ?? gameState.puzzle.maxCharacters}
              onClearAll={isSetup ? handleWipe : undefined}
              disabled={!isSetup}
              noPanel
            />
          </div>
        )}
      </div>
    </div>
  );
};
