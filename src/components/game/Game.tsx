/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { GameState, PlacedCharacter, Puzzle, PlacedEnemy, PuzzleScore, ProjectileEvent, Projectile, CustomAttack } from '../../types/game';
import { Direction, TURN_INTERVAL_MS } from '../../types/game';
import { getTodaysPuzzle, getAllPuzzles } from '../../data/puzzles';
import { getCharacter } from '../../data/characters';
import { initializeGameState, executeTurn, checkVictoryConditions, setHomingDebugSilenced, findPathBFS, getTilesAlongLine, isHomingDebug, isPierceDebug, maybeMarkLingerDespawn } from '../../engine/simulation';
import { calculateScore, getRankEmoji, getRankName, checkSideQuests } from '../../engine/scoring';
import { isTileBlockingMovement } from '../../engine/actions';
import { ResponsiveGameBoard } from './AnimatedGameBoard';
import { CharacterSelector } from './CharacterSelector';
import { EnemyDisplay } from './EnemyDisplay';
import { StatusEffectsDisplay } from './StatusEffectsDisplay';
import { SpecialTilesDisplay } from './SpecialTilesDisplay';
import { ItemsDisplay } from './ItemsDisplay';
import { ReplayControls } from './ReplayControls';
import { getSavedPuzzles, type SavedPuzzle } from '../../utils/puzzleStorage';
import { loadTileType, loadCollectible, loadEnemy, loadStatusEffectAsset } from '../../utils/assetStorage';
import { collectPuzzleAssetUrls } from '../../utils/spritePreload';
import { HelpButton } from './HelpOverlay';
import { playGameSound, playVictoryMusic, playDefeatMusic, playBackgroundMusic, stopMusic } from '../../utils/gameSounds';
import { loadThemeAssets, subscribeToThemeAssets, type ThemeAssets } from '../../utils/themeAssets';
import { WarningModal } from '../shared/WarningModal';
import { preloadImagesEager } from '../../utils/imageLoader';
import { vibrate } from '../../utils/haptics';
import { getDailyState, lockDailyOutcome, updateDailyLives, type DailyStatus } from '../../utils/dailyState';
import { diffTurn } from '../../engine/combatLog';
import { fetchTodaysPuzzle as fetchCloudTodaysPuzzle, fetchTodaysPuzzleNumber } from '../../services/supabaseService';
import { submitCompletion } from '../../services/statsService';
import { CommunityStats } from './CommunityStats';
import { BugReportModal } from './BugReportModal';
import type { TrackedRun } from '../../types/bugReport';

// Test mode types
type TestMode = 'none' | 'enemies' | 'characters';

// Deep copy GameState while preserving Map/Set structures that JSON.stringify destroys.
// Used for replay history snapshots (both live capture and headless re-sim fallback).
function deepCopyGameState(state: GameState): GameState {
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

export interface GameProps {
  /**
   * When true AND the puzzle has a `.date` set (i.e. it's a daily puzzle),
   * this Game instance enforces Wordle-style daily-lock behavior:
   *   - Lives persist across page reloads within the same day
   *   - On victory or final defeat, the puzzle is locked until day rollover
   *   - Reload while locked shows a "come back tomorrow" banner instead of
   *     a playable setup
   * The dev app intentionally omits this prop so editor playtest and "Play"
   * route remain free to replay any number of times for testing.
   */
  enableDailyLock?: boolean;

  /**
   * Optional puzzle to load. When provided, this puzzle seeds the initial
   * game state (and the reset-to-original baseline) instead of fetching
   * `getTodaysPuzzle()`. Used by the editor to mount a Game instance with
   * the in-progress level being playtested. The reference is captured at
   * mount; pass a fresh `key` (e.g. the puzzle id) on the parent if you
   * need to swap puzzles.
   */
  puzzle?: Puzzle;

  /**
   * Optional callback rendered as a "Back to Editor" button. When defined,
   * Game shows the button in the top quest panel; clicking it invokes the
   * callback. Player builds (PlayerApp) intentionally don't pass this, so
   * the button never renders for players. The callback's presence is the
   * feature gate — there's no separate "playtest mode" flag to misroute.
   */
  onExitToEditor?: () => void;

  /**
   * Optional turn-by-turn observer. Fires once after each turn the
   * simulation loop completes, with the pre-turn and post-turn game states.
   * Used by the editor to derive a combat-log sidebar (via `diffTurn`)
   * without needing its own copy of the game loop. Player builds don't
   * pass this — the callback never fires, no log code activates, no
   * editor-only behavior reaches the player.
   */
  onTurnExecuted?: (prev: GameState, next: GameState) => void;

  /**
   * Optional callback rendered as a "📜 Log" button in the quest panel,
   * sitting next to the "Back to Editor" button when both are provided.
   * The editor uses this to open its combat-log modal — the button lives
   * in Game's chrome so it's positioned with the rest of the playtest
   * controls instead of floating in a corner. PlayerApp doesn't pass
   * this, so the button never renders for players.
   */
  onShowCombatLog?: () => void;
}

export const Game: React.FC<GameProps> = ({
  enableDailyLock = false,
  puzzle: puzzleProp,
  onExitToEditor,
  onTurnExecuted,
  onShowCombatLog,
}) => {
  const officialPuzzles = getAllPuzzles();
  const [savedPuzzles, setSavedPuzzles] = useState<SavedPuzzle[]>(() => getSavedPuzzles());

  // Combine official and saved puzzles
  const allPuzzles = [...officialPuzzles, ...savedPuzzles];

  // Initial puzzle source: caller-provided `puzzle` prop wins (editor playtest
  // mounts with a specific in-progress puzzle); otherwise fall back to
  // `getTodaysPuzzle()` (player + dev `/` route default behavior, unchanged).
  // Captured once at mount — to swap puzzles, remount the component via key.
  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle>(() => puzzleProp ?? getTodaysPuzzle());
  // Store original puzzle for reset (deep copy to prevent mutation)
  const [originalPuzzle, setOriginalPuzzle] = useState<Puzzle>(() => JSON.parse(JSON.stringify(puzzleProp ?? getTodaysPuzzle())));
  const [gameState, setGameState] = useState<GameState>(() => {
    return initializeGameState(currentPuzzle);
  });
  // Store placed characters snapshot when Play is pressed (for Reset)
  const [playStartCharacters, setPlayStartCharacters] = useState<PlacedCharacter[]>([]);

  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  // Pre-placement direction overrides: charId -> spellId -> direction
  const [pendingSpellDirectionOverrides, setPendingSpellDirectionOverrides] = useState<Record<string, Record<string, Direction>>>({});

  // Daily lock — only relevant when enableDailyLock and the puzzle has a date.
  // We compute this once per puzzle and re-derive when the puzzle changes.
  const initialDailyState = enableDailyLock && currentPuzzle.date
    ? getDailyState(currentPuzzle.date)
    : null;

  // Lives system. Hydrate from persisted daily state if locked-mode is active
  // and we have a stored value for today's puzzle; otherwise fall back to the
  // puzzle's configured lives (or default 3).
  const [livesRemaining, setLivesRemaining] = useState<number>(() => {
    if (initialDailyState) return initialDailyState.livesRemaining;
    return currentPuzzle.lives ?? 3;
  });
  // Daily-lock final outcome. null = not locked / in progress; 'won' or 'lost'
  // = puzzle has been completed today, no further attempts allowed until day
  // rollover. Always null in dev / non-daily contexts.
  const [dailyLockStatus, setDailyLockStatus] = useState<DailyStatus | null>(() => {
    if (initialDailyState && (initialDailyState.status === 'won' || initialDailyState.status === 'lost')) {
      return initialDailyState.status;
    }
    return null;
  });
  // showGameOver is for in-session display of the gameover modal only. On a
  // fresh reload into a 'lost' daily-lock, we DON'T show the modal — the
  // top-banner alone communicates the locked state. Otherwise the modal and
  // the banner would render simultaneously (the original Phase-1 bug the
  // user flagged). The modal flow is purely "this session, just lost lives,
  // here's the result" — and gets a dismiss-to-pill flow below, mirroring
  // victory.
  const [showGameOver, setShowGameOver] = useState(false);
  const [spritesReady, setSpritesReady] = useState(false);
  // Phase-transition overlays (see index.css BOARD PHASE TRANSITIONS):
  // keyed by nonce so each trigger replays the animation. 0 = never fired.
  const [battleFxNonce, setBattleFxNonce] = useState(0);
  const [resetFxNonce, setResetFxNonce] = useState(0);


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

  // Ref for scrolling to game board on mobile
  const gameBoardRef = useRef<HTMLDivElement>(null);

  // Theme assets for custom icons
  const [themeAssets, setThemeAssets] = useState<ThemeAssets>(() => loadThemeAssets());

  // Concede confirmation state
  const [showConcedeConfirm, setShowConcedeConfirm] = useState(false);
  const [dismissingConcede, setDismissingConcede] = useState(false);

  // Analytics: attempt timing and duplicate guard
  const attemptStartRef = useRef<number>(0);
  const submittedRef = useRef(false);
  const runTrackedRef = useRef(false); // Prevent duplicate run tracking per attempt

  // Track defeat reason
  const [defeatReason, setDefeatReason] = useState<'damage' | 'turns' | null>(null);

  // Victory dismiss state — when true, shows collapsed banner instead of full overlay
  const [victoryDismissed, setVictoryDismissed] = useState(false);

  // Defeat (gameover) dismiss state — parallel to victoryDismissed. The
  // gameover overlay can be dismissed in-session, after which a collapsed
  // pill stays at the top (matching victory). On reload into a locked
  // 'lost' state, the daily-lock banner takes over the same role and the
  // modal never renders.
  const [defeatDismissed, setDefeatDismissed] = useState(false);

  // Overlay dismiss animation state
  const [dismissingOverlay, setDismissingOverlay] = useState(false);
  const dismissActionRef = useRef<(() => void) | null>(null);

  const dismissOverlay = useCallback((action: () => void) => {
    setDismissingOverlay(true);
    dismissActionRef.current = action;
    setTimeout(() => {
      setDismissingOverlay(false);
      dismissActionRef.current = null;
      action();
    }, 250); // Match animation duration
  }, []);

  // Replay dismiss animation state
  const [dismissingReplay, setDismissingReplay] = useState(false);
  const [justExitedReplay, setJustExitedReplay] = useState(false);

  // Warning modal state
  const [warningModal, setWarningModal] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: '',
  });

  // Cloud puzzle number (from daily_schedule)
  const [puzzleNumber, setPuzzleNumber] = useState<number | null>(null);

  // Replay system state
  const [replayMode, setReplayMode] = useState(false);
  const [replayTurnIndex, setReplayTurnIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [replayStepAnimating, setReplayStepAnimating] = useState(false);
  const replayStepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnHistoryRef = useRef<GameState[]>([]);
  const replayEventsRef = useRef<Map<number, Set<import('../../engine/combatLog').LogEventType>>>(new Map());
  const projectileTimelineRef = useRef<ProjectileEvent[]>([]);
  const projectileLifetimesRef = useRef<Map<string, { spawn: ProjectileEvent; reflect?: ProjectileEvent; end?: ProjectileEvent; pierceHits: ProjectileEvent[]; homingMoves: ProjectileEvent[]; spawnTurn: number; endTurn: number }>>(new Map());

  // Bug report system
  const [trackedRuns, setTrackedRuns] = useState<TrackedRun[]>([]);
  const [showBugReport, setShowBugReport] = useState(false);

  // Shimmer animation key for Quest text - triggers on puzzle change
  const [shimmerKey, setShimmerKey] = useState(0);
  const prevPuzzleIdForShimmerRef = useRef<string | null>(null);

  // Trigger shimmer animation when puzzle changes
  useEffect(() => {
    const currentPuzzleId = currentPuzzle.id;
    if (prevPuzzleIdForShimmerRef.current !== null && prevPuzzleIdForShimmerRef.current !== currentPuzzleId) {
      setShimmerKey(k => k + 1);
    }
    prevPuzzleIdForShimmerRef.current = currentPuzzleId;
  }, [currentPuzzle.id]);

  // Try to load today's puzzle from cloud (daily_schedule)
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchCloudTodaysPuzzle(),
      fetchTodaysPuzzleNumber(),
    ]).then(([cloudPuzzle, num]) => {
      if (cancelled) return;
      if (num) setPuzzleNumber(num);
      if (!cloudPuzzle) return;
      // Only switch if we're still on the default puzzle (haven't manually selected one)
      setCurrentPuzzle(prev => {
        // If user has already switched puzzles, don't override
        if (prev.id !== getTodaysPuzzle().id) return prev;
        setOriginalPuzzle(JSON.parse(JSON.stringify(cloudPuzzle)));
        setGameState(initializeGameState(cloudPuzzle));
        return cloudPuzzle;
      });
    }).catch(() => {
      // Silently fall back to local puzzle if cloud is unreachable
    });
    return () => { cancelled = true; };
  }, []);

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

  // Silence HOMING_DEBUG console logs once the game is no longer running so
  // the post-outcome console stays copyable while lingering bolts animate.
  // Re-enable on status return to 'running' (new game / retry).
  useEffect(() => {
    setHomingDebugSilenced(gameState.gameStatus !== 'running' && gameState.gameStatus !== 'setup');
  }, [gameState.gameStatus]);

  // Preload sprite assets in the background when puzzle changes so directional
  // sprites, animation frames, skin tiles, etc. are cached before gameplay needs them.
  useEffect(() => {
    const urlsToPreload = collectPuzzleAssetUrls(currentPuzzle);
    setSpritesReady(false);
    if (urlsToPreload.length === 0) {
      setSpritesReady(true);
      return;
    }
    let cancelled = false;
    const reveal = () => { if (!cancelled) setSpritesReady(true); };
    // A hung or failed image must never gate the board forever — reveal after
    // a grace timeout regardless; anything still loading pops in afterwards
    // via the image-load subscription re-renders. The cancelled flag also
    // stops a stale preload (from a puzzle switched away from) firing late.
    const timeoutId = setTimeout(reveal, 8000);
    preloadImagesEager(urlsToPreload).then(reveal, reveal);
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [currentPuzzle.id]);

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

      vibrate('turnAdvance');

      // Track outcome outside the state updater so side effects (haptics, sounds)
      // aren't suppressed by React StrictMode's double-invoke of updater functions.
      // Cast at declaration so TS doesn't narrow to the literal 'running' — the
      // setGameState callback below mutates this and TS doesn't propagate that
      // mutation back through the closure boundary.
      let outcome = 'running' as 'running' | 'victory' | 'defeat';
      let outcomeTurns = 0;
      // Capture pre + post turn states for replay history and the
      // `onTurnExecuted` observer. StrictMode calls the updater twice; both
      // invocations receive the same prevState and produce the same newState
      // for our purposes, so capturing inside the updater is safe.
      let capturedPreTurnState: GameState | null = null;
      let capturedPostTurnState: GameState | null = null;

      setGameState((prevState) => {
        // Capture pre-turn state for the onTurnExecuted observer. Reference
        // capture is fine: subscribers (e.g. the editor's combat-log derivation
        // via diffTurn) only read, they don't mutate.
        capturedPreTurnState = prevState;
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
        capturedPostTurnState = newState;

        // Stop simulation if game ended (only in normal mode)
        // If there are pending projectile deaths, defer the game-over state
        // so the visual can show the projectile hitting before the overlay appears
        const hasPendingDeaths = newState.activeProjectiles?.some(
          (p: any) => p.active && p.hitResult?.deferredDeathEntityId
        );
        if (hasPendingDeaths && newState.gameStatus !== 'running') {
          // Revert to running — the next tick will finalize deaths and re-check
          newState.gameStatus = 'running';
        }
        if (testMode === 'none' && newState.gameStatus !== 'running') {
          setIsSimulating(false);
          outcome = newState.gameStatus as 'victory' | 'defeat';
          outcomeTurns = newState.currentTurn;

          if (newState.gameStatus === 'victory') {
            const score = calculateScore(newState, livesRemaining, currentPuzzle.lives ?? 3);
            setPuzzleScore(score);

            // Persist daily-lock outcome before any analytics so a subsequent
            // reload immediately shows the locked state regardless of network.
            if (enableDailyLock && currentPuzzle.date) {
              lockDailyOutcome(currentPuzzle.date, 'won', livesRemaining);
              setDailyLockStatus('won');
            }

            // Submit analytics (fire-and-forget, only for scheduled/daily puzzles)
            if (currentPuzzle.date && !submittedRef.current) {
              submittedRef.current = true;
              submitCompletion({
                puzzleId: currentPuzzle.id,
                puzzleDate: currentPuzzle.date,
                outcome: 'victory',
                score,
                charactersUsed: score.stats.charactersUsed,
                characterIds: newState.placedCharacters.map(c => c.characterId),
                turnsUsed: score.stats.turnsUsed,
                livesRemaining: livesRemaining,
                attemptDurationMs: Date.now() - attemptStartRef.current,
              });
            }
          }

          if (newState.gameStatus === 'defeat') {
            const maxTurns = currentPuzzle.maxTurns || 1000;
            const ranOutOfTurns = newState.currentTurn >= maxTurns;
            const reason = ranOutOfTurns ? 'turns' : 'damage';
            setDefeatReason(reason);

            // Submit analytics (fire-and-forget, only for scheduled/daily puzzles)
            if (currentPuzzle.date && !submittedRef.current) {
              submittedRef.current = true;
              submitCompletion({
                puzzleId: currentPuzzle.id,
                puzzleDate: currentPuzzle.date,
                outcome: 'defeat',
                charactersUsed: newState.placedCharacters.length,
                characterIds: newState.placedCharacters.map(c => c.characterId),
                turnsUsed: newState.currentTurn,
                livesRemaining: livesRemaining - 1,
                defeatReason: reason,
                defeatTurn: newState.currentTurn,
                attemptDurationMs: Date.now() - attemptStartRef.current,
              });
            }

            const puzzleLives = currentPuzzle.lives ?? 3;
            const isUnlimitedLives = puzzleLives === 0;

            if (!isUnlimitedLives) {
              const newLives = livesRemaining - 1;
              setLivesRemaining(newLives);

              // Persist daily-lock state alongside lives changes. Final defeat
              // (lives hit 0) locks as 'lost'; partial defeats just persist
              // the decremented lives so a refresh can't restore them.
              if (enableDailyLock && currentPuzzle.date) {
                if (newLives <= 0) {
                  lockDailyOutcome(currentPuzzle.date, 'lost', 0);
                  setDailyLockStatus('lost');
                } else {
                  updateDailyLives(currentPuzzle.date, newLives);
                }
              }

              if (newLives <= 0) {
                setShowGameOver(true);
              }
            }
          }
        }

        return newState;
      });

      // Capture the surviving post-turn state for replay (only in normal play — test modes
      // don't drive the replay UI). Deep-copy so subsequent turns' mutations don't leak in.
      if (capturedPostTurnState && testMode === 'none') {
        const post = capturedPostTurnState as GameState;
        turnHistoryRef.current.push(deepCopyGameState(post));
        // Mirror the accumulated timeline; executeTurn copies the array forward each turn,
        // so the latest state always holds the full event stream.
        projectileTimelineRef.current = post.projectileTimeline ? [...post.projectileTimeline] : [];
      }

      // Notify external observers (editor's combat log, etc.). Fires once
      // per real turn — StrictMode double-invocation of the setGameState
      // updater doesn't fan out here because we fire after the updater
      // returns. PlayerApp doesn't pass this callback, so no editor-only
      // code path activates in player builds.
      if (onTurnExecuted && capturedPreTurnState && capturedPostTurnState && testMode === 'none') {
        onTurnExecuted(capturedPreTurnState as GameState, capturedPostTurnState as GameState);
      }

      // Fire side effects (haptics, sounds) outside the state updater
      if (outcome === 'victory') {
        vibrate('victory');
        playGameSound('victory');
        playVictoryMusic();
      } else if (outcome === 'defeat') {
        vibrate('defeat');
        playGameSound('defeat');

        const puzzleLives = currentPuzzle.lives ?? 3;
        const isUnlimitedLives = puzzleLives === 0;

        if (!isUnlimitedLives) {
          const newLives = livesRemaining - 1;
          if (newLives <= 0) {
            playDefeatMusic();
          } else {
            playGameSound('life_lost');
            vibrate('lifeLost');
            // Defeat panel stays visible with "Watch Replay" / "Try Again" buttons
          }
        }
      }

      // Track run for bug reporting (guard against duplicate tracking)
      if (outcome !== 'running' && !runTrackedRef.current) {
        runTrackedRef.current = true;
        const finalOutcome = outcome as 'victory' | 'defeat';
        setTrackedRuns(prev => [...prev, {
          id: crypto.randomUUID(),
          placements: JSON.parse(JSON.stringify(playStartCharacters)),
          outcome: finalOutcome,
          turnsUsed: outcomeTurns,
          timestamp: Date.now(),
        }]);
      }
    }, TURN_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isSimulating, gameState.gameStatus, testMode, testTurnsRemaining, livesRemaining, currentPuzzle.lives]);

  // Replay playback timer
  useEffect(() => {
    if (!replayMode || !replayPlaying) return;

    const history = turnHistoryRef.current;
    if (history.length === 0) return;

    const intervalMs = TURN_INTERVAL_MS / replaySpeed;

    const interval = setInterval(() => {
      setReplayTurnIndex(prev => {
        const next = prev + 1;
        if (next >= history.length) {
          setReplayPlaying(false);
          return prev;
        }
        const copy = copySnapshotForPlayback(history[next], history, next);
        resetReplayProjectilesToTurnStart(copy);
        setGameState(copy);
        return next;
      });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [replayMode, replayPlaying, replaySpeed]);

  // Cancel replay on puzzle change
  useEffect(() => {
    if (replayMode) {
      setReplayMode(false);
      setReplayPlaying(false);
      turnHistoryRef.current = [];
      replayEventsRef.current = new Map();
      projectileTimelineRef.current = [];
      projectileLifetimesRef.current = new Map();
    }
  }, [currentPuzzle?.id]);

  const handleTileClick = useCallback(
    (x: number, y: number) => {
      if (gameState.gameStatus !== 'setup' || !spritesReady) {
        return;
      }
      // Daily-lock guard: when today's puzzle is already won or lost the
      // setup phase is read-only — clicking the board shouldn't place,
      // remove, or otherwise mutate placement state. Hero cards remain
      // clickable for re-reading info (handled by CharacterSelector). The
      // Play button is also blocked at handlePlay; this is the parallel
      // guard for board-click-driven placement.
      if (dailyLockStatus) {
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
        vibrate('heroRemove');
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

      // Check if tile is impassable (default walls, custom wall-base tiles, and
      // currently-active dynamic blockers). Heroes can't stand where they can't
      // move, so reuse the canonical movement validator as the single source of
      // truth — this also covers custom wall-type tiles, not just default walls.
      if (isTileBlockingMovement(tile, gameState)) {
        playGameSound('error');
        return; // Can't place on impassable tiles
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

      // Check if another character is already on this tile
      const tileHasCharacter = gameState.placedCharacters.some((c) => c.x === x && c.y === y && !c.dead);
      if (tileHasCharacter) {
        playGameSound('error');
        return; // Can't place on tile occupied by another character
      }

      // Check if this character type is already placed (only one of each allowed)
      const alreadyPlaced = gameState.placedCharacters.some((c) => c.characterId === selectedCharacterId);
      if (alreadyPlaced) {
        playGameSound('error');
        return; // Can't place duplicate character types
      }

      // Check if at max placeable characters
      const maxPlaceable = gameState.puzzle.maxPlaceableCharacters ?? gameState.puzzle.maxCharacters;
      if (gameState.placedCharacters.length >= maxPlaceable) {
        playGameSound('error');
        return; // Can't place more than max allowed
      }

      const charData = getCharacter(selectedCharacterId);
      if (!charData) return;

      // Place character with default facing direction, merging any pending direction overrides
      const pendingOverrides = pendingSpellDirectionOverrides[selectedCharacterId];
      const newCharacter: PlacedCharacter = {
        characterId: selectedCharacterId,
        x,
        y,
        facing: charData.defaultFacing,
        currentHealth: charData.health,
        maxHealth: charData.health,
        actionIndex: 0,
        active: true,
        dead: false,
        ...(pendingOverrides && { spellDirectionOverrides: pendingOverrides }),
      };

      // Apply initial status effects
      if (charData.initialStatusEffects && charData.initialStatusEffects.length > 0) {
        newCharacter.statusEffects = charData.initialStatusEffects.map(ise => {
          const effectAsset = loadStatusEffectAsset(ise.statusAssetId);
          if (!effectAsset) return null;
          return {
            id: `initial_${ise.statusAssetId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: effectAsset.type,
            statusAssetId: ise.statusAssetId,
            duration: ise.durationOverride === -1 ? 99999 : (ise.durationOverride ?? effectAsset.defaultDuration),
            value: ise.valueOverride ?? effectAsset.defaultValue,
            currentStacks: 1,
            appliedOnTurn: 0,
            sourceEntityId: 'initial',
            sourceIsEnemy: false,
            movementSkipCounter: 0,
          };
        }).filter(Boolean) as PlacedCharacter['statusEffects'];
      }

      setGameState((prev) => ({
        ...prev,
        placedCharacters: [...prev.placedCharacters, newCharacter],
      }));
      playGameSound('character_placed');
      vibrate('characterPlace');
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
      vibrate('victory');
      playGameSound('victory');
      playVictoryMusic();
      // Calculate and store score
      const score = calculateScore(gameState, livesRemaining, currentPuzzle.lives ?? 3);
      setPuzzleScore(score);

      // Submit analytics (fire-and-forget)
      if (currentPuzzle.date && !submittedRef.current) {
        submittedRef.current = true;
        submitCompletion({
          puzzleId: currentPuzzle.id,
          puzzleDate: currentPuzzle.date,
          outcome: 'victory',
          score,
          charactersUsed: score.stats.charactersUsed,
          characterIds: gameState.placedCharacters.map(c => c.characterId),
          turnsUsed: score.stats.turnsUsed,
          livesRemaining: livesRemaining,
          attemptDurationMs: Date.now() - attemptStartRef.current,
        });
      }

      // Track run for bug reporting (guard against duplicates)
      if (!runTrackedRef.current) {
        runTrackedRef.current = true;
        setTrackedRuns(prev => [...prev, {
          id: crypto.randomUUID(),
          placements: JSON.parse(JSON.stringify(playStartCharacters)),
          outcome: 'victory',
          turnsUsed: gameState.currentTurn,
          timestamp: Date.now(),
        }]);
      }
    }
  }, [gameState, livesRemaining, currentPuzzle.lives]);

  const handlePlay = () => {
    // Daily-lock guard: if today's puzzle is already won or lost, block any
    // further Play attempts. Defense-in-depth — the button is also visually
    // suppressed via the daily-lock banner overlay.
    if (dailyLockStatus) {
      return;
    }
    if (gameState.placedCharacters.length === 0) {
      setWarningModal({ isOpen: true, message: 'Place at least one hero on the board before starting!' });
      return;
    }

    // Save snapshot of placed characters for Reset
    setPlayStartCharacters(JSON.parse(JSON.stringify(gameState.placedCharacters)));
    // Seed live-capture refs so the real-play events and state snapshots drive the replay
    // (instead of a separate headless re-simulation that diverges from what the player saw).
    setGameState((prev) => {
      const seeded: GameState = { ...prev, gameStatus: 'running', projectileTimeline: [] };
      turnHistoryRef.current = [deepCopyGameState(seeded)];
      projectileTimelineRef.current = [];
      return seeded;
    });
    setIsSimulating(true);
    attemptStartRef.current = Date.now();
    submittedRef.current = false;
    runTrackedRef.current = false;
    // Battle-start beat: brief dark pulse over the board + quest shimmer
    setBattleFxNonce(n => n + 1);
    setShimmerKey(k => k + 1);
    playGameSound('simulation_start');
    vibrate('playButton');
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
        maxHealth: charData ? charData.health : char.maxHealth,
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
    setResetFxNonce(n => n + 1);
    runTrackedRef.current = false;
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
    vibrate('heroTrash');
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
        maxHealth: charData ? charData.health : char.maxHealth,
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
    setResetFxNonce(n => n + 1);
  }, [originalPuzzle, playStartCharacters]);

  // Restart puzzle from game over (reset lives and go to setup).
  // Blocked when the daily lock is engaged — a 'lost' lock means the player
  // has used up their attempts for the day; restart would defeat the point
  // of the lock.
  const handleRestartPuzzle = () => {
    if (dailyLockStatus) return;
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
    setVictoryDismissed(false);
    setDefeatDismissed(false);
    setResetFxNonce(n => n + 1);
  };

  // Concede current attempt - lose a life and show defeat panel with buttons
  const handleConcede = () => {
    setShowConcedeConfirm(false);
    setIsSimulating(false);
    setDefeatReason('damage'); // Conceding counts as damage death

    // Submit analytics (fire-and-forget)
    if (currentPuzzle.date && !submittedRef.current) {
      submittedRef.current = true;
      submitCompletion({
        puzzleId: currentPuzzle.id,
        puzzleDate: currentPuzzle.date,
        outcome: 'defeat',
        charactersUsed: gameState.placedCharacters.length,
        characterIds: gameState.placedCharacters.map(c => c.characterId),
        turnsUsed: gameState.currentTurn,
        livesRemaining: livesRemaining - 1,
        defeatReason: 'concede',
        defeatTurn: gameState.currentTurn,
        attemptDurationMs: Date.now() - attemptStartRef.current,
      });
    }

    // Track run for bug reporting (guard against duplicates)
    if (!runTrackedRef.current) {
      runTrackedRef.current = true;
      setTrackedRuns(prev => [...prev, {
        id: crypto.randomUUID(),
        placements: JSON.parse(JSON.stringify(playStartCharacters)),
        outcome: 'defeat',
        turnsUsed: gameState.currentTurn,
        timestamp: Date.now(),
      }]);
    }

    const puzzleLives = currentPuzzle.lives ?? 3;
    const isUnlimitedLives = puzzleLives === 0;

    playGameSound('defeat');

    // Set game state to defeat so the defeat overlay appears with buttons
    setGameState(prev => ({ ...prev, gameStatus: 'defeat' as const }));

    if (!isUnlimitedLives) {
      const newLives = livesRemaining - 1;
      setLivesRemaining(newLives);

      // Persist daily-lock state alongside lives changes (concede path).
      if (enableDailyLock && currentPuzzle.date) {
        if (newLives <= 0) {
          lockDailyOutcome(currentPuzzle.date, 'lost', 0);
          setDailyLockStatus('lost');
        } else {
          updateDailyLives(currentPuzzle.date, newLives);
        }
      }

      if (newLives <= 0) {
        // No lives left - show game over
        setShowGameOver(true);
        playDefeatMusic();
      } else {
        // Life lost - play sound and haptic (defeat panel buttons handle reset)
        playGameSound('life_lost');
        vibrate('lifeLost');
      }
    }
    // For unlimited lives: defeat panel appears with buttons, no special handling needed
  };

  // Generate turn history by re-simulating from saved placements (deterministic)
  const generateTurnHistory = useCallback((): { history: GameState[]; timeline: ProjectileEvent[] } => {
    const puzzleCopy: Puzzle = JSON.parse(JSON.stringify(originalPuzzle));
    const initialState = initializeGameState(puzzleCopy);

    // Place characters from the saved placements
    initialState.placedCharacters = JSON.parse(JSON.stringify(playStartCharacters)).map((char: PlacedCharacter) => {
      const charData = getCharacter(char.characterId);
      return {
        ...char,
        actionIndex: 0,
        currentHealth: charData ? charData.health : char.currentHealth,
        maxHealth: charData ? charData.health : char.maxHealth,
        dead: false,
        active: true,
      };
    });
    initialState.gameStatus = 'running';
    // Headless mode resolves projectiles instantly so each snapshot is complete
    // Use headless mode for reliable replay generation
    // Projectiles are resolved instantly — no visual animation in replay,
    // but behavior (who dies, when, where) is correct
    initialState.headlessMode = true;
    // Initialize projectile timeline for recording events during replay generation.
    // (Kept as a fallback — the live capture path in handlePlay/runTurn is preferred
    // and produces a replay that matches what the player actually saw.)
    initialState.projectileTimeline = [];

    const history: GameState[] = [deepCopyGameState(initialState)];
    let current = initialState;

    const maxIterations = (puzzleCopy.maxTurns || 200) + 10;
    for (let i = 0; i < maxIterations; i++) {
      if (current.gameStatus !== 'running') break;

      const stateCopy = deepCopyGameState(current);
      current = executeTurn(stateCopy);

      // Finalize pending projectile deaths — updateProjectiles doesn't run during
      // replay generation, so we manually resolve deferred deaths for defeat/victory detection
      if (current.activeProjectiles) {
        for (const proj of current.activeProjectiles) {
          if (proj.hitResult?.deferredDeathEntityId) {
            const id = proj.hitResult.deferredDeathEntityId;
            if (proj.hitResult.deferredDeathIsEnemy) {
              const enemy = proj.hitResult.deferredDeathIndex !== undefined
                ? current.puzzle.enemies[proj.hitResult.deferredDeathIndex]
                : current.puzzle.enemies.find((e: any) => e.enemyId === id);
              if (enemy && !enemy.dead) {
                enemy.dead = true;
                enemy.pendingProjectileDeath = false;
              }
            } else {
              const char = current.placedCharacters.find((c: any) => c.characterId === id);
              if (char && !char.dead) {
                char.dead = true;
                char.pendingProjectileDeath = false;
              }
            }
          }
        }
      }

      history.push(deepCopyGameState(current));
    }

    // Extract the projectile timeline from the final state
    const timeline = current.projectileTimeline || [];

    return { history, timeline };
  }, [originalPuzzle, playStartCharacters]);

  // Enter replay mode
  const handleWatchReplay = useCallback(() => {
    // Prefer live-captured history + timeline (matches exactly what the player saw).
    // Fall back to re-simulating headless only if live capture is empty (e.g. the run
    // started before this code path existed, or a code path we didn't hook).
    let history: GameState[];
    let timeline: ProjectileEvent[];
    if (turnHistoryRef.current.length > 0) {
      history = turnHistoryRef.current;
      timeline = projectileTimelineRef.current;
      console.log(`[REPLAY] Using live capture: ${history.length} snapshots, ${timeline.length} events`);
    } else {
      console.log('[REPLAY] No live capture — falling back to headless re-simulation');
      const regen = generateTurnHistory();
      history = regen.history;
      timeline = regen.timeline;
      turnHistoryRef.current = history;
      projectileTimelineRef.current = timeline;
    }

    // Build per-turn active projectile lifetimes from timeline.
    // pierceHits collects `hit` events that get shadowed by a later end
    // event for the same projId — those are the pass-through hits of a
    // pierce bolt (the bolt didn't stop there). The current `life.end` is
    // always the bolt's true final landing (last end event).
    const lifetimes = new Map<string, { spawn: ProjectileEvent; reflect?: ProjectileEvent; end?: ProjectileEvent; pierceHits: ProjectileEvent[]; homingMoves: ProjectileEvent[]; spawnTurn: number; endTurn: number }>();
    for (const event of timeline) {
      if (event.type === 'spawn') {
        lifetimes.set(event.projId, { spawn: event, pierceHits: [], homingMoves: [], spawnTurn: event.turn, endTurn: 9999 });
      } else if (event.type === 'reflect') {
        const life = lifetimes.get(event.projId);
        if (life) life.reflect = event;
      } else if (event.type === 'hit' || event.type === 'wall_hit' || event.type === 'deactivate') {
        const life = lifetimes.get(event.projId);
        if (life) {
          // If a previous `hit` is being displaced, it was a pierce-through.
          // (wall_hit / deactivate displacing a hit also pushes it — pierce
          // bolts can pass through enemies and end at a wall or range cap.)
          if (life.end && life.end.type === 'hit') {
            life.pierceHits.push(life.end);
            if (isPierceDebug()) {
              console.log(
                `[PIERCE-DISPLACE ${event.projId.slice(-6)}] turn=${event.turn} ` +
                `displaced=hit@(${life.end.x},${life.end.y}) hitTileIdx=${life.end.hitTileIndex} ` +
                `target=${life.end.targetEntityId?.slice(-6)} damage=${life.end.damage} ` +
                `→pierceHits.length=${life.pierceHits.length}; new end=${event.type}@(${event.x},${event.y})`
              );
            }
          }
          life.end = event;
          life.endTurn = event.turn;
        }
      } else if (event.type === 'homing_move') {
        const life = lifetimes.get(event.projId);
        if (life) life.homingMoves.push(event);
      }
    }
    projectileLifetimesRef.current = lifetimes;

    if (isHomingDebug()) {
      console.log(`[REPLAY] Timeline: ${timeline.length} events, ${lifetimes.size} projectile lifetimes`);
      if (timeline.length > 0) {
        console.log(`[REPLAY] Events:`, timeline.map(e => `T${e.turn}:${e.type}(${e.projId?.slice(-6)})`).join(', '));
        // Detail on spawns
        timeline.filter(e => e.type === 'spawn').forEach(e => {
          console.log(`[REPLAY SPAWN] ${e.projId?.slice(-6)} tilePath=${e.tilePath?.length || 0} tiles, pos=(${e.x},${e.y}), homing=${e.isHoming}`);
        });
        timeline.filter(e => e.type === 'hit').forEach(e => {
          console.log(`[REPLAY HIT] ${e.projId?.slice(-6)} hitTileIdx=${e.hitTileIndex} target=${e.targetEntityId?.slice(-6)} pos=(${e.x},${e.y})`);
        });
      }
    }

    // Compute notable events per turn for timeline markers
    const events = new Map<number, Set<import('../../engine/combatLog').LogEventType>>();
    for (let i = 1; i < history.length; i++) {
      const entries = diffTurn(history[i - 1], history[i]);
      const notable = entries.filter(e => e.type !== 'move' && !(e.type === 'game' && e.text === 'No notable events'));
      if (notable.length > 0) {
        events.set(i, new Set(notable.map(e => e.type)));
      }
    }
    replayEventsRef.current = events;

    setReplayMode(true);
    setReplayTurnIndex(0);
    setReplayPlaying(false);
    setReplaySpeed(1);

    if (history.length > 0) {
      setGameState(copySnapshotForPlayback(history[0], history, 0));
    }
  }, [generateTurnHistory]);

  // Exit replay mode - animate out then return to appropriate screen
  const handleExitReplay = useCallback(() => {
    if (dismissingReplay) return;
    setDismissingReplay(true);
    setReplayPlaying(false);

    setTimeout(() => {
      setDismissingReplay(false);
      setReplayMode(false);
      setJustExitedReplay(true);
      turnHistoryRef.current = [];
      replayEventsRef.current = new Map();
      projectileTimelineRef.current = [];
      projectileLifetimesRef.current = new Map();

      if (livesRemaining <= 0) {
        // Return to game over screen
        const puzzleCopy: Puzzle = JSON.parse(JSON.stringify(originalPuzzle));
        const resetState = initializeGameState(puzzleCopy);
        resetState.gameStatus = 'defeat';
        setGameState(resetState);
        setShowGameOver(true);
      } else if (puzzleScore) {
        // Return to victory screen - re-derive the final state
        const { history } = generateTurnHistory();
        if (history.length > 0) {
          setGameState(history[history.length - 1]);
        }
      } else {
        // Lives remaining, not victory - return to placement
        handleAutoReset();
      }

      // Clear the slide-up animation flag after it plays
      setTimeout(() => setJustExitedReplay(false), 350);
    }, 250);
  }, [dismissingReplay, livesRemaining, puzzleScore, originalPuzzle, generateTurnHistory, handleAutoReset]);

  // Replay playback controls
  const handleReplayPlayPause = useCallback(() => {
    setReplayPlaying(prev => !prev);
  }, []);

  // Helper: reset projectile animation timing for replay snapshots
  const resetProjectileTiming = (snapshot: GameState) => {
    const now = Date.now();
    if (snapshot.activeProjectiles) {
      for (const proj of snapshot.activeProjectiles) {
        if (proj.tilePath && proj.tilePath.length > 0) {
          proj.tileEntryTime = now;
          proj.currentTileIndex = 0;
        }
      }
    }
  };

  // Helper: compute tiles along a line (Bresenham-style) for replay path generation
  const computeReplayPath = (x0: number, y0: number, x1: number, y1: number): Array<{x: number, y: number}> => {
    const tiles: Array<{x: number, y: number}> = [];
    const sx = Math.floor(x0), sy = Math.floor(y0);
    const ex = Math.floor(x1), ey = Math.floor(y1);
    tiles.push({ x: sx, y: sy });
    if (sx === ex && sy === ey) return tiles;
    const dx = ex - sx, dy = ey - sy;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      tiles.push({ x: sx + Math.round(dx * t), y: sy + Math.round(dy * t) });
    }
    return tiles;
  };

  // Helper: build replay projectiles from timeline for a given turn index
  const buildReplayProjectiles = (turnIndex: number): Projectile[] => {
    const lifetimes = projectileLifetimesRef.current;
    if (lifetimes.size === 0) return [];

    const now = Date.now();
    const replayProjectiles: Projectile[] = [];

    for (const [, life] of lifetimes) {
      // A projectile is alive from its spawn turn through its end turn
      if (turnIndex < life.spawnTurn || turnIndex > life.endTurn) continue;

      const spawn = life.spawn;
      const speed = spawn.speed || 4;
      const isHomingBolt = !!spawn.isHoming;

      let tilePath: Array<{ x: number; y: number }> | undefined;
      let turnTileIndex: number;
      let turnStartTileIndex: number;
      let posAtTurn: { x: number; y: number };
      // Hoisted out of the homing branch so the post-branch projectile
      // construction can reference them (for straight-line visual anchors).
      // Non-homing path leaves these at the spawn position.
      let prevPos: { x: number; y: number } = { x: spawn.x, y: spawn.y };
      let thisPos: { x: number; y: number } = { x: spawn.x, y: spawn.y };

      if (isHomingBolt) {
        // Homing replay: build a per-turn segment tilePath using the recorded
        // homing_move events (one per turn). Live gameplay rebuilds tilePath
        // each turn; replay mirrors that so speed, pathfinding-vs-grid-vs-
        // straight, and per-turn step animation all match the real flight.
        const turnsSinceSpawn = turnIndex - life.spawnTurn; // 0 = spawn turn

        // Position at end of (turnIndex - 1): previous turn's homing_move, or
        // spawn pos if this IS the spawn turn.
        prevPos = turnsSinceSpawn === 0
          ? { x: spawn.x, y: spawn.y }
          : (life.homingMoves[turnsSinceSpawn - 1]
              ? { x: life.homingMoves[turnsSinceSpawn - 1].x, y: life.homingMoves[turnsSinceSpawn - 1].y }
              : { x: spawn.x, y: spawn.y });

        // Position at end of turnIndex: on endTurn use end event's position
        // (so tilePath ends exactly at hit/deactivate location); otherwise use
        // this turn's homing_move.
        thisPos = turnIndex === life.endTurn && life.end
          ? { x: life.end.x, y: life.end.y }
          : (life.homingMoves[turnsSinceSpawn]
              ? { x: life.homingMoves[turnsSinceSpawn].x, y: life.homingMoves[turnsSinceSpawn].y }
              : prevPos);

        // Build segment tilePath using the style the engine used.
        const style = spawn.homingPathStyle || 'straight';
        // If prev ≈ this, the bolt didn't move this turn (e.g. OUT OF RANGE
        // froze it). Use a single-tile path at the frozen position — avoids
        // `getTilesAlongLine`'s floor/round asymmetry (start=floor, end=round)
        // producing a 2-tile path spanning different integer tiles for the
        // SAME fractional position, which would teleport the bolt to one of
        // those tiles (often the enemy's cell → spurious "hit" in replay).
        const noMove = Math.abs(prevPos.x - thisPos.x) < 0.01 && Math.abs(prevPos.y - thisPos.y) < 0.01;
        if (noMove) {
          tilePath = [{ x: Math.round(thisPos.x), y: Math.round(thisPos.y) }];
        } else if (style === 'pathfinding') {
          tilePath = findPathBFS(Math.round(prevPos.x), Math.round(prevPos.y),
                                 Math.round(thisPos.x), Math.round(thisPos.y), gameState);
        } else {
          // 'grid' and 'straight' both use tile-along-line for replay; the
          // difference in live gameplay is in visual interpolation, not path.
          // Round inputs to match resolveProjectiles, which rebuilds tilePath
          // each turn from Math.round(logical) (simulation.ts:3451, 3560).
          // Passing fractional coords would use getTilesAlongLine's
          // floor(start)/round(end) asymmetry → extra leading tile vs. real
          // play (e.g. real (5,6)→(5,7) becomes replay (4,5)→(5,6)→(5,7))
          // which also skews tileTransit pacing via 0.8/(len-1).
          tilePath = getTilesAlongLine(
            Math.round(prevPos.x), Math.round(prevPos.y),
            Math.round(thisPos.x), Math.round(thisPos.y)
          );
        }
        if (!tilePath || tilePath.length === 0) {
          tilePath = [{ x: Math.round(prevPos.x), y: Math.round(prevPos.y) }];
        }

        turnStartTileIndex = 0;
        turnTileIndex = tilePath.length - 1;
        posAtTurn = tilePath[turnTileIndex];

        // REPLAY-DIFF log — mirrors the [RDIFF REAL] one-liners from
        // simulation.ts so real vs replay can be diffed directly. If a bolt's
        // reconstructed segment diverges from what the engine emitted, the
        // pos/tilePath/style values here won't match the REAL event stream.
        // Gated on the same HOMING_DEBUG flag as the RDIFF REAL emitter.
        if (isHomingDebug()) {
          const pathStr = tilePath.map(t => `(${t.x},${t.y})`).join('→');
          console.log(
            `[RDIFF REPLAY] turn=${turnIndex} proj=${spawn.projId.slice(-6)} ` +
            `style=${spawn.homingPathStyle} speed=${speed} ` +
            `prev=(${prevPos.x.toFixed(2)},${prevPos.y.toFixed(2)}) ` +
            `this=(${thisPos.x.toFixed(2)},${thisPos.y.toFixed(2)}) ` +
            `tilePath=${pathStr} logical=(${posAtTurn.x},${posAtTurn.y})`
          );
        }
      } else {
        // Non-homing: existing stitched-path behavior (full flight in spawn's tilePath).
        tilePath = spawn.tilePath ? [...spawn.tilePath] : undefined;
        if (!tilePath || tilePath.length === 0) {
          const endEvent = life.end;
          if (endEvent) {
            tilePath = computeReplayPath(spawn.x, spawn.y, endEvent.x, endEvent.y);
          }
        }

        const turnsOfTravel = turnIndex - life.spawnTurn + 1;
        const tilesAtEndOfTurn = turnsOfTravel * speed;
        const tilesAtStartOfTurn = (turnsOfTravel - 1) * speed;
        const maxTileIdx = tilePath ? tilePath.length - 1 : 0;
        turnTileIndex = Math.min(tilesAtEndOfTurn, maxTileIdx);
        turnStartTileIndex = Math.min(tilesAtStartOfTurn, maxTileIdx);

        if (life.end && turnIndex === life.endTurn) {
          if (life.end.type === 'hit' && life.end.hitTileIndex !== undefined) {
            turnTileIndex = Math.min(life.end.hitTileIndex, maxTileIdx);
          } else {
            turnTileIndex = maxTileIdx;
          }
        }

        posAtTurn = tilePath?.[turnTileIndex] ?? { x: spawn.x, y: spawn.y };
      }

      // For straight-line homing, live gameplay interpolates the bolt in
      // fractional (Euclidean) space between prevPos and thisPos via
      // `homingVisualStartX/Y` + `updateStraightLineHomingVisual`. The
      // tilePath reconstructed above is only accurate at tile granularity —
      // a move like (2.55, 1.11) → (1.74, 0.53) collapses to a single-tile
      // path at (2, 1) and the replay bolt sits frozen on that tile for the
      // whole turn instead of flowing diagonally.
      //
      // Setting the straight-line visual anchors on the replay projectile
      // switches updateProjectiles to the same Euclidean path the live game
      // uses, so replay motion matches what the player saw. tilePath still
      // drives hit-consume timing via currentTileIndex >= hitTileIndex.
      const isStraightHoming = isHomingBolt && (spawn.homingPathStyle === 'straight' || !spawn.homingPathStyle);

      // Pick this turn's engine-recorded target (from homing_move / hit /
      // deactivate). Using the recorded target preserves the fractional
      // aim point the live game interpolated toward — e.g., turn 1 live has
      // target=(5,5) (the enemy, 2 tiles away) while totalTime=1.6s; if we
      // used tilePath endpoint (4,5) with totalTime=0.8s the bolt reaches
      // its "target" mid-flight and re-anchors abruptly on turn 2.
      // Matching the engine's target + distance makes replay speed/feel
      // identical to the real run.
      const turnsSinceSpawnForEvent = turnIndex - life.spawnTurn;
      const endEventForTurn = turnIndex === life.endTurn ? life.end : undefined;
      const homingMoveForTurn = life.homingMoves[turnsSinceSpawnForEvent];
      const engineTargetX = endEventForTurn?.targetX ?? homingMoveForTurn?.targetX;
      const engineTargetY = endEventForTurn?.targetY ?? homingMoveForTurn?.targetY;

      // Straight-line homing: logical position should be the fractional
      // turn-end position (what updateStraightLineHomingVisual interpolates
      // to), not the tile-rounded posAtTurn. Without this, once the visual
      // reaches target it falls back to logical = tile center and snaps
      // (e.g., real freezes at (5.88, 6.97) but logical was rounded to (6, 7)).
      const logicalX = isStraightHoming ? thisPos.x : posAtTurn.x;
      const logicalY = isStraightHoming ? thisPos.y : posAtTurn.y;

      // Reconstruct cumulative `pathTraveled` up to this turn by summing
      // segment Euclidean distances from the homing_move events. Needed
      // so the drawProjectile predictive shrink (`range - pathTraveled <
      // threshold` for OUT OF RANGE) can fire in replay — without it,
      // pathTraveled stays undefined on the replay projectile and the
      // predictive branch is skipped.
      //
      // Count = moves EMITTED through end of turn K's resolveProjectiles
      // (inclusive of turn K's own MOVE TOWARD, since real-play engine
      // runs that before animation begins). For spawnTurn = S, turnIndex
      // = K: that's (K - S + 1) moves. Clamp to homingMoves.length for
      // the fizzle turn (which has no MOVE TOWARD event of its own).
      let pathTraveled: number | undefined;
      if (isHomingBolt) {
        pathTraveled = 0;
        let prevSeg = { x: spawn.x, y: spawn.y };
        const movesSoFar = turnIndex - life.spawnTurn + 1;
        const segCount = Math.min(movesSoFar, life.homingMoves.length);
        for (let i = 0; i < segCount; i++) {
          const move = life.homingMoves[i];
          const dx = move.x - prevSeg.x;
          const dy = move.y - prevSeg.y;
          pathTraveled += Math.sqrt(dx * dx + dy * dy);
          prevSeg = { x: move.x, y: move.y };
        }
      }

      const proj: Projectile = {
        id: spawn.projId,
        active: true,
        logicalX,
        logicalY,
        startX: spawn.x,
        startY: spawn.y,
        targetX: isStraightHoming
          ? (engineTargetX ?? (turnIndex === life.endTurn && life.end ? life.end.x : thisPos.x))
          : (tilePath?.[tilePath.length - 1]?.x ?? spawn.x),
        targetY: isStraightHoming
          ? (engineTargetY ?? (turnIndex === life.endTurn && life.end ? life.end.y : thisPos.y))
          : (tilePath?.[tilePath.length - 1]?.y ?? spawn.y),
        direction: spawn.direction || Direction.SOUTH,
        speed,
        tilePath,
        currentTileIndex: turnTileIndex,
        // Offset tileEntryTime so visual picks up at the correct tile, not restart from 0
        tileEntryTime: now - (turnTileIndex * (800 / speed)),
        startTime: now - (turnTileIndex * (800 / speed)),
        // Store start-of-turn tile index for step animation (so it starts from previous turn's end)
        _turnStartTileIndex: turnStartTileIndex,
        attackData: spawn.attackData || ({ id: 'replay-stub', name: 'replay-stub', damage: 0, pattern: 'projectile' as any } as CustomAttack),
        sourceCharacterId: spawn.sourceIsEnemy ? undefined : spawn.sourceEntityId,
        sourceEnemyId: spawn.sourceIsEnemy ? spawn.sourceEntityId : undefined,
        isHoming: spawn.isHoming,
        homingPathStyle: spawn.homingPathStyle,
        spellAssetId: spawn.spellAssetId,
        bounceOffWalls: false,
        teamSwapped: false,
        pathTraveled,
        // Straight-line homing: route through Euclidean visual interp.
        // Anchor at prevPos (fractional, turn-start) — target is the
        // engine-recorded target (set above). updateStraightLineHomingVisual
        // will animate from anchor → target over (dist/speed) seconds, at
        // the same rate the live game used.
        homingVisualStartX: isStraightHoming ? prevPos.x : undefined,
        homingVisualStartY: isStraightHoming ? prevPos.y : undefined,
        homingVisualStartTime: isStraightHoming ? now : undefined,
      };

      // Apply reflect visuals if the reflect happened on or before this turn
      if (life.reflect && turnIndex >= life.reflect.turn) {
        proj.reflected = true;
        proj.reflectTintColor = life.reflect.reflectTintColor;
        proj.reflectOverrideSprite = life.reflect.reflectOverrideSprite;
        proj.reflectAtTileIndex = life.reflect.reflectAtTileIndex;
        if (life.reflect.combinedPath) {
          proj.tilePath = [...life.reflect.combinedPath];
        }
      }

      // If this is the end turn, set hitResult so the visual system knows when to stop
      if (life.end && turnIndex === life.endTurn) {
        // hitTileIndex: use recorded value, or compute from tilePath (last tile before or at hit position)
        let hitIdx = life.end.hitTileIndex;
        if (hitIdx === undefined && proj.tilePath && proj.tilePath.length > 0) {
          const hitX = Math.floor(life.end.x);
          const hitY = Math.floor(life.end.y);
          hitIdx = proj.tilePath.findIndex(t => t.x === hitX && t.y === hitY);
          if (hitIdx === -1) hitIdx = proj.tilePath.length - 1;
        }
        const resolvedHitIdx = hitIdx ?? (proj.tilePath ? proj.tilePath.length - 1 : 0);
        if (life.end.type === 'hit') {
          // Forward deferredDeath* and damage from the event so replay's
          // visual consume path decrements pendingVisualDamage and commits
          // pendingDeath → dead, matching real play. Without these, the
          // final turn's kill leaves the enemy pendingDeath forever in
          // replay with a full healthbar.
          proj.hitResult = {
            hitTileIndex: resolvedHitIdx,
            deactivate: true,
            vfxSprite: life.end.hitVfxSprite,
            vfxX: life.end.x,
            vfxY: life.end.y,
            deferredDeathEntityId: life.end.deferredDeathEntityId,
            deferredDeathIsEnemy: life.end.deferredDeathIsEnemy,
            deferredDeathIndex: life.end.deferredDeathIndex,
            damage: life.end.damage,
          };
        } else {
          // wall_hit or deactivate (no VFX / no deferred death — just
          // deactivate at end of tilePath). Unified with the hit path above
          // so the visual loop only has one "logic done" signal to consume.
          proj.hitResult = {
            hitTileIndex: resolvedHitIdx,
            deactivate: true,
          };
          // Mirror the real-play path: if the approach-shrink would have
          // had no travel window (target-lost mid-flight), switch on the
          // lingering despawn so replay shows the 125ms shrink. For cases
          // predictive already covered (OOR, non-homing endpoint), the
          // helper internally skips the linger to avoid a scale-1 pop.
          maybeMarkLingerDespawn(proj, resolvedHitIdx, Date.now());
        }
      }

      // (Previously an overwrite here pinned logicalX/Y to
      // `tilePath[currentTileIndex]` so the frozen fallback in drawProjectile
      // would show a tile-aligned position. That clobbered the fractional
      // logicalX/Y we just set for straight-line homing — causing step-back
      // to snap bolts to tile centers even when the live game had them at
      // (4.93, 6.68) etc. The logical position we set above is already the
      // correct turn-end location for every style: fractional for straight
      // homing (thisPos from the engine event), tile-aligned for grid /
      // pathfinding / non-homing (posAtTurn from the tile path).)

      // Pierce pass-through decrements — populate from ALL pierceHits in this
      // bolt's lifetime, not just this turn's. The replay projectile is
      // REBUILT each turn (vs live where it persists), so prior turns'
      // unconsumed decrements would otherwise be lost. Including all
      // decrements is safe: commitDeferredVisualDamage decrements with
      // Math.max(0, prior - damage), so re-firing on an entity whose
      // pendingVisualDamage is already 0 (because live decremented it
      // during the prior turn's animation) is a harmless no-op. For
      // entities still elevated in the snapshot (live animation lagged or
      // this is the most recent turn's hit), the decrement fires correctly
      // when the visual crosses its tile.
      //
      // hitTileIndex on the event was recorded against the live engine's
      // tilePath; replay's tilePath matches (same construction for non-
      // homing; per-turn for homing — see filter below).
      if (life.pierceHits.length > 0) {
        const allHits = life.pierceHits.filter(e =>
          e.deferredDeathEntityId !== undefined &&
          (e.damage ?? 0) > 0 &&
          e.hitTileIndex !== undefined
        );
        // For HOMING bolts, tilePath is replaced each turn (per-turn segment),
        // so hitTileIndex from prior turns no longer maps to current tilePath.
        // Restrict to this turn's hits for homing. Non-homing tilePath is
        // stable across the bolt's life (set at spawn), so all-turn inclusion
        // works.
        const turnHits = isHomingBolt
          ? allHits.filter(e => e.turn === turnIndex)
          : allHits;
        if (turnHits.length > 0) {
          proj.pendingVisualDecrements = turnHits.map(e => ({
            targetEntityId: e.deferredDeathEntityId!,
            targetIsEnemy: e.deferredDeathIsEnemy ?? false,
            targetIndex: e.deferredDeathIndex,
            damage: e.damage!,
            hitTileIndex: e.hitTileIndex!,
          }));
          if (isPierceDebug()) {
            console.log(
              `[PIERCE-POPULATE ${proj.id.slice(-6)}] turnIndex=${turnIndex} ` +
              `entries=${proj.pendingVisualDecrements.length} ` +
              `(homing=${isHomingBolt} ${isHomingBolt ? 'this-turn-only' : 'all-turns'}) ` +
              `tilePathLen=${proj.tilePath?.length ?? 'none'} ` +
              `currentTileIndex=${proj.currentTileIndex} ` +
              `tileEntryTime=${proj.tileEntryTime} now=${now} ` +
              `decrements=${proj.pendingVisualDecrements.map(d => `${d.targetEntityId.slice(-6)}@hitTileIdx=${d.hitTileIndex}/dmg=${d.damage}`).join(', ')}`
            );
          }
        }
      }

      replayProjectiles.push(proj);
    }

    return replayProjectiles;
  };

  // Helper: deep copy a replay snapshot for safe playback
  const copySnapshotForPlayback = (snapshot: GameState, history: GameState[], index: number) => {
    const copy = JSON.parse(JSON.stringify(snapshot));
    copy.tileStates = new Map();
    if (snapshot.tileStates) {
      snapshot.tileStates.forEach((value: any, key: string) => {
        copy.tileStates.set(key, {
          ...value,
          damagedEntities: value.damagedEntities ? new Set(value.damagedEntities) : undefined
        });
      });
    }
    // Clear stale particles from headless generation (they have wrong startTimes)
    copy.activeParticles = [];

    // Replace snapshot projectiles with replay-generated ones (correct positions and timing)
    const replayProjectiles = buildReplayProjectiles(index);
    copy.activeProjectiles = replayProjectiles; // Replace entirely — snapshot projectiles are stale

    // Apply past deferred-death commits to the snapshot. Snapshots are
    // captured at end-of-executeTurn in real play, BEFORE the animation loop
    // fires deferred-death visual commits for that turn's hits. So a
    // snapshot for turn N has entities that were killed on turn M < N still
    // as pendingDeath (because the real-play commit happened during turn M's
    // animation window, after the snapshot for turn M+1 was already locked).
    //
    // Without this, advancing replay to turn N "revives" entities: replay
    // committed them to dead during turn M's visual playback, then turn N's
    // snapshot loads them as pendingDeath → alive sprite — then the bolt's
    // visual commit re-fires in the new frame → dead sprite again. That's
    // the dead → alive → dead stutter the user saw.
    //
    // Rule: for any `hit` event with deferredDeath* on a turn STRICTLY
    // BEFORE this snapshot's turn, the commit has visually fired by now.
    // Force the target dead in the copy. Turn-of-hit events are left alone
    // so the current turn's visual commit still runs and fires the death
    // animation at the right moment.
    //
    // Applies to BOTH the bolt's final landing (life.end) and any pierce
    // pass-through hits (life.pierceHits) — pierce-through can kill the
    // enemy too, and that death's commit needs the same past-turn fix-up.
    //
    // CRITICAL: only force dead if the snapshot has `pendingProjectileDeath`
    // set. `deferredDeathEntityId` on the event is misleadingly named — it's
    // set on every damaging hit, not just kills. A 1-damage hit on a 50-HP
    // enemy would trigger this path with deferredDeathEntityId populated,
    // but pendingProjectileDeath would be false (entity didn't die). The
    // pendingProjectileDeath check filters genuine deferred kills from
    // pass-through damage.
    const applyPastDeathCommit = (event: ProjectileEvent) => {
      if (event.type !== 'hit') return;
      if (event.turn >= index) return;
      if (!event.deferredDeathEntityId) return;
      if (event.deferredDeathIsEnemy) {
        const idx = event.deferredDeathIndex;
        if (idx === undefined) return;
        const e = copy.puzzle?.enemies?.[idx];
        if (e && e.enemyId === event.deferredDeathEntityId && !e.dead && e.pendingProjectileDeath) {
          e.dead = true;
          e.pendingProjectileDeath = false;
          e.pendingVisualDamage = 0;
          e.currentHealth = 0;
        }
      } else {
        const c = copy.placedCharacters?.find(
          (pc: any) => pc.characterId === event.deferredDeathEntityId
        );
        if (c && !c.dead && c.pendingProjectileDeath) {
          c.dead = true;
          c.pendingProjectileDeath = false;
          c.pendingVisualDamage = 0;
          c.currentHealth = 0;
        }
      }
    };

    const lifetimes = projectileLifetimesRef.current;
    for (const [, life] of lifetimes) {
      if (life.end) applyPastDeathCommit(life.end);
      for (const ph of life.pierceHits) applyPastDeathCommit(ph);
    }

    return copy;
  };

  // Reset each projectile's VISUAL anchors to its start-of-turn position so
  // the per-frame animation plays forward through the turn. Without this,
  // buildReplayProjectiles seeds currentTileIndex at end-of-turn, and
  // updateProjectiles' hit-consumption (currentTileIdx >= hitResult.hitTileIndex)
  // fires on the very first frame for any projectile whose endTurn == this
  // turn — deactivating it before it renders.
  //
  // logicalX/Y is intentionally NOT reset. buildReplayProjectiles already sets
  // it to the turn-END position, which is what the frozen state (after the
  // animation window closes) needs to render. Overwriting to turn-start would
  // cause a visible snap-back once replayFrozen flips on.
  const resetReplayProjectilesToTurnStart = (copy: GameState) => {
    if (!copy.activeProjectiles) return;
    const nowMs = Date.now();
    for (const proj of copy.activeProjectiles) {
      if (proj.tilePath && proj.tilePath.length > 0 && (proj as any)._turnStartTileIndex !== undefined) {
        const startIdx = Math.min((proj as any)._turnStartTileIndex, proj.tilePath.length - 1);
        proj.currentTileIndex = startIdx;
        const tileTransitMs = 800 / (proj.speed || 4);
        proj.tileEntryTime = nowMs - (startIdx * tileTransitMs);
        proj.startTime = nowMs - (startIdx * tileTransitMs);
      }
    }
  };

  const handleReplayStepForward = useCallback(() => {
    setReplayPlaying(false);
    const history = turnHistoryRef.current;
    // Clear any existing step timer
    if (replayStepTimerRef.current) clearTimeout(replayStepTimerRef.current);

    setReplayTurnIndex(prev => {
      const next = Math.min(prev + 1, history.length - 1);
      const copy = copySnapshotForPlayback(history[next], history, next);
      resetReplayProjectilesToTurnStart(copy);
      setGameState(copy);
      return next;
    });

    // Animate for exactly one turn interval (matches auto-play cadence) then
    // freeze. A longer window would let updateTileBasedVisual advance
    // visualTileIndex past this turn's end position, making slow projectiles
    // appear to land on the wrong turn.
    setReplayStepAnimating(true);
    replayStepTimerRef.current = setTimeout(() => {
      setReplayStepAnimating(false);
    }, TURN_INTERVAL_MS);
  }, []);

  // Step-back and seek skip the per-turn-start reset: they jump straight to
  // each turn's end-of-turn state (what buildReplayProjectiles already
  // computes) instead of re-animating that turn's motion. Matches typical
  // media-scrubber UX and keeps the visual arrival turn consistent with
  // auto-play for all projectile speeds.
  const handleReplayStepBack = useCallback(() => {
    setReplayPlaying(false);
    const history = turnHistoryRef.current;
    if (replayStepTimerRef.current) clearTimeout(replayStepTimerRef.current);

    setReplayTurnIndex(prev => {
      const next = Math.max(prev - 1, 0);
      const copy = copySnapshotForPlayback(history[next], history, next);
      setGameState(copy);
      return next;
    });

    setReplayStepAnimating(false);
  }, []);

  const handleReplaySeek = useCallback((turn: number) => {
    setReplayPlaying(false);
    if (replayStepTimerRef.current) clearTimeout(replayStepTimerRef.current);
    const history = turnHistoryRef.current;
    const clamped = Math.max(0, Math.min(turn, history.length - 1));
    const copy = copySnapshotForPlayback(history[clamped], history, clamped);
    setGameState(copy);
    setReplayTurnIndex(clamped);
    setReplayStepAnimating(false);
  }, []);

  const handleReplaySpeedChange = useCallback((speed: number) => {
    setReplaySpeed(speed);
  }, []);

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
      // Re-hydrate from daily state if this puzzle is locked-eligible AND has
      // an existing record for its date. Otherwise reset lives to puzzle
      // defaults (training arenas get unlimited).
      const persistedDaily = enableDailyLock && puzzle.date ? getDailyState(puzzle.date) : null;
      if (persistedDaily) {
        setLivesRemaining(persistedDaily.livesRemaining);
        setDailyLockStatus(
          persistedDaily.status === 'won' || persistedDaily.status === 'lost'
            ? persistedDaily.status
            : null
        );
        // Don't open the gameover modal on hydration — banner alone (see
        // Game-Over Overlay render block) handles the locked-on-reload UI.
        setShowGameOver(false);
      } else {
        setLivesRemaining(puzzle.isTraining ? 0 : (puzzle.lives ?? 3));
        setDailyLockStatus(null);
        setShowGameOver(false);
      }
      setPlayStartCharacters([]);
      setPuzzleScore(null);
      setTrackedRuns([]);
      setVictoryDismissed(false);
      setDefeatDismissed(false);
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
    vibrate('testButton');
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
        maxHealth: charData ? charData.health : char.maxHealth,
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
    vibrate('testButton');
  };

  // Scroll-aware test handlers (scrolls to game board on both mobile and desktop)
  const handleTestCharactersWithScroll = () => {
    // Don't scroll if no heroes placed (will show error modal instead)
    if (gameState.placedCharacters.length === 0) {
      handleTestCharacters(); // This will show the warning modal
      return;
    }
    // Start the test first, then scroll after state updates and DOM settles
    handleTestCharacters();
    setTimeout(() => {
      if (gameBoardRef.current) {
        gameBoardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  };

  const handleTestEnemiesWithScroll = () => {
    // Start the test first, then scroll after state updates and DOM settles
    handleTestEnemies();
    // Use setTimeout to scroll after React re-renders from the state change
    setTimeout(() => {
      if (gameBoardRef.current) {
        gameBoardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
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

  // Determine if panels should be dimmed (during play or test mode)
  const isPanelsDimmed = gameState.gameStatus === 'running' || testMode !== 'none';
  const dimmedPanelClass = isPanelsDimmed ? 'opacity-50 pointer-events-none' : '';

  return (
    <div className="min-h-screen theme-root text-parchment-200 px-4 pb-4 md:px-8 md:pb-8 relative">
      {/* Underground cave background effect - positioned below nav bar */}
      <div className="absolute inset-0 pointer-events-none -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-stone-950 via-stone-900/50 to-stone-950" />
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: `radial-gradient(ellipse at 50% 0%, rgba(212, 165, 116, 0.08) 0%, transparent 50%)`
        }} />
      </div>

      <div className="max-w-6xl mx-auto relative">
        <div className="flex flex-col gap-2">
          {/* Game Board - The Dungeon */}
          <div ref={gameBoardRef} className="flex-1 flex flex-col items-center w-full overflow-visible">
            {/* Quest & Control Panel - combined HUD at top, overlaps navbar border */}
            {(gameState.gameStatus === 'setup' || gameState.gameStatus === 'running' || gameState.gameStatus === 'defeat' || testMode !== 'none') && (
              <div className="w-full flex justify-center animate-slide-down-from-nav-wrapper sticky top-0 z-20 quest-panel-sticky">
              <div className="mb-2 w-full max-w-2xl px-3 md:px-4 py-1.5 dungeon-panel-dark -mt-[2px] relative z-10 overflow-visible animate-slide-down-from-nav" style={{ borderBottomLeftRadius: '40px', borderBottomRightRadius: '40px' }}>
                {/* Ornate corner decorations - L-brackets with filled triangle at corner */}
                {/* Bottom-left: L-bracket with triangle */}
                <svg className="absolute -bottom-[1px] -left-[1px] w-10 h-10" viewBox="0 0 40 40" overflow="visible">
                  {/* Horizontal line at bottom edge */}
                  <path d="M0 40 L40 40" stroke="#c4915c" strokeWidth="2" fill="none" />
                  {/* Vertical line - extends upward to navbar border */}
                  <path d="M0 4 L0 40" stroke="#c4915c" strokeWidth="2" fill="none" className="hidden md:block" />
                  <path d="M0 8 L0 40" stroke="#c4915c" strokeWidth="2" fill="none" className="md:hidden" />
                  {/* Triangle at corner */}
                  <path d="M0 40 L0 24 Q4 36 16 40 Z" fill="#a97545" stroke="#c4915c" strokeWidth="1" />
                </svg>
                {/* Bottom-right: L-bracket with triangle */}
                <svg className="absolute -bottom-[1px] -right-[1px] w-10 h-10" viewBox="0 0 40 40" overflow="visible">
                  {/* Horizontal line at bottom edge */}
                  <path d="M0 40 L40 40" stroke="#c4915c" strokeWidth="2" fill="none" />
                  {/* Vertical line - extends upward to navbar border */}
                  <path d="M40 4 L40 40" stroke="#c4915c" strokeWidth="2" fill="none" className="hidden md:block" />
                  <path d="M40 8 L40 40" stroke="#c4915c" strokeWidth="2" fill="none" className="md:hidden" />
                  {/* Triangle at corner */}
                  <path d="M40 40 L40 24 Q36 36 24 40 Z" fill="#a97545" stroke="#c4915c" strokeWidth="1" />
                </svg>
                {/* Puzzle Number & Quest Row */}
                {puzzleNumber && (
                  <div className="text-center mb-0.5">
                    <span className="text-[10px] md:text-xs font-bold tracking-widest uppercase text-copper-400/70">
                      Puzzle #{puzzleNumber}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-center gap-2 flex-wrap">
                    {/* Back to Editor — only when caller (e.g. MapEditor playtest) provides
                        the callback. Player builds never pass this, so the button doesn't render. */}
                    {onExitToEditor && (
                      <button
                        onClick={onExitToEditor}
                        className="dungeon-btn px-2.5 py-1 text-xs flex items-center gap-1 flex-shrink-0"
                        title="Back to Editor"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                        <span className="hidden md:inline">Editor</span>
                      </button>
                    )}
                    {/* Combat Log — editor-only, opens MapEditor's combat-log modal.
                        Same feature-gate pattern as Back to Editor — caller-provided
                        callback is the trigger; player builds don't pass it. */}
                    {onShowCombatLog && (
                      <button
                        onClick={onShowCombatLog}
                        className="dungeon-btn px-2.5 py-1 text-xs flex items-center gap-1 flex-shrink-0"
                        title="View combat log"
                      >
                        <span className="text-sm leading-none">📜</span>
                        <span className="hidden md:inline">Log</span>
                      </button>
                    )}
                    <HelpButton sectionId="game_general" />
                    <span key={shimmerKey} className="shimmer-container">
                      <span className="text-base md:text-lg lg:text-xl font-semibold text-stone-400">Quest:</span>
                      <span className="text-sm md:text-base lg:text-lg text-copper-300 font-medium">
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
                              if (!c.collectibleId) return false;
                              const collectible = loadCollectible(c.collectibleId);
                              return collectible?.effects?.some(e => e.type === 'win_key') && !c.collected;
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
              </div>
            )}

            {/* Game board with overlay container for loss/victory panels */}
            <div className={`relative w-full max-w-[900px] overflow-hidden ${gameState.gameStatus === 'defeat' ? 'animate-screen-shake' : ''}`}>
              <div
                className={`transition-[opacity,transform] duration-700 ease-out ${spritesReady ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                style={{ transform: spritesReady ? 'scale(1)' : 'scale(0.85)', transformOrigin: '50% 50%', willChange: 'transform, opacity' }}
              >
                <ResponsiveGameBoard gameState={gameState} onTileClick={handleTileClick} onProjectileKill={handleProjectileKill} replayFrozen={replayMode && !replayPlaying && !replayStepAnimating} />
              </div>
              {!spritesReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-stone-900/80">
                  <div className="text-stone-400 text-sm animate-pulse">Loading sprites...</div>
                </div>
              )}

              {/* Phase-transition beats — keyed so each trigger replays; they
                  end at opacity 0 and are pointer-events-none, so stale ones
                  are inert. Rendered under the victory/defeat panels. */}
              {battleFxNonce > 0 && (
                <div key={`battle-fx-${battleFxNonce}`} className="absolute inset-0 z-10 bg-black board-battle-pulse" />
              )}
              {resetFxNonce > 0 && (
                <div key={`reset-fx-${resetFxNonce}`} className="absolute inset-0 z-10 bg-stone-950 board-reset-reveal" />
              )}

              {/* Game Over Overlay — dismissible (matches Victory pattern) */}
              {showGameOver && !defeatDismissed && !replayMode && (
                <div
                  className={`absolute inset-0 flex items-center justify-center z-10 ${dismissingOverlay ? 'animate-overlay-fade-out' : 'animate-overlay-fade-in'}`}
                  style={{
                    backgroundColor: themeAssets.gameOverPanelOverlayBg || 'rgba(0, 0, 0, 0.8)',
                  }}
                  onClick={() => dismissOverlay(() => setDefeatDismissed(true))}
                >
                  <div
                    className={`p-6 rounded-pixel-lg text-center max-w-[90%] relative ${dismissingOverlay ? 'animate-panel-scale-out' : 'animate-panel-scale-in'} ${
                      themeAssets.gameOverPanelBg ? '' : 'defeat-panel'
                    }`}
                    style={{
                      ...(themeAssets.gameOverPanelBg && { backgroundColor: themeAssets.gameOverPanelBg }),
                      ...(themeAssets.gameOverPanelBorder && { borderColor: themeAssets.gameOverPanelBorder, borderWidth: '2px', borderStyle: 'solid' }),
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    {/* Close (X) — mirror Victory's dismiss affordance */}
                    <button
                      onClick={() => dismissOverlay(() => setDefeatDismissed(true))}
                      disabled={dismissingOverlay}
                      className="absolute top-2 right-2 p-1 text-blood-400 hover:text-parchment-100 hover:bg-blood-700 rounded transition-colors"
                      aria-label="Dismiss"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>

                    <div className="text-4xl mb-1 animate-icon-drop">{'\u2620\uFE0F'}</div>
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
                    <div className="mt-4 flex flex-col items-center gap-2">
                      <div className="flex gap-3">
                        {playStartCharacters.length > 0 && (
                          <button
                            onClick={() => dismissOverlay(handleWatchReplay)}
                            disabled={dismissingOverlay}
                            className="dungeon-btn px-4 py-3 font-bold text-sm"
                          >
                            Watch Replay
                          </button>
                        )}
                        {!dailyLockStatus && (
                        <button
                          onClick={() => dismissOverlay(handleRestartPuzzle)}
                          disabled={dismissingOverlay}
                          className={`px-6 py-3 font-bold text-lg ${
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
                        )}
                      </div>
                      {trackedRuns.length > 0 && (
                        <button
                          onClick={() => dismissOverlay(() => setShowBugReport(true))}
                          disabled={dismissingOverlay}
                          className="dungeon-btn px-1.5 py-1 text-xs flex items-center justify-center"
                          title="Report Bug"
                        >
                          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 2l1.88 1.88M14.12 3.88L16 2M9 7.13v-1a3.003 3.003 0 116 0v1" />
                            <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 014-4h4a4 4 0 014 4v3c0 3.3-2.7 6-6 6z" />
                            <path d="M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M6 17l-4 1M17.47 9c1.93-.2 3.53-1.9 3.53-4M18 13h4M18 17l4 1" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Community Stats - only on game over, not per-attempt defeats */}
                    {currentPuzzle.date && (
                      <CommunityStats
                        puzzleId={currentPuzzle.id}
                        playerScore={puzzleScore ?? {
                          rank: 'bronze' as const,
                          totalPoints: 0,
                          breakdown: { basePoints: 0, characterBonus: 0, turnBonus: 0, livesBonus: 0, sideQuestPoints: 0 },
                          completedSideQuests: [],
                          parMet: { characters: false, turns: false },
                          stats: {
                            charactersUsed: gameState.placedCharacters.length,
                            turnsUsed: gameState.currentTurn,
                            livesRemaining: 0,
                          },
                        }}
                        playerOutcome="defeat"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Victory Overlay */}
              {/* Victory Full Overlay — dismissible */}
              {gameState.gameStatus === 'victory' && puzzleScore && !replayMode && !victoryDismissed && (
                <div
                  className={`fixed inset-0 flex items-center justify-center z-50 overflow-y-auto py-4 ${dismissingOverlay ? 'animate-overlay-fade-out' : 'animate-overlay-fade-in'}`}
                  style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
                  onClick={() => dismissOverlay(() => setVictoryDismissed(true))}
                >
                  <div
                    className={`victory-panel p-6 rounded-pixel-lg text-center w-[min(90%,24rem)] my-auto relative ${dismissingOverlay ? 'animate-panel-scale-out' : 'animate-panel-scale-in'}`}
                    onClick={e => e.stopPropagation()}
                  >
                    {/* Close button */}
                    <button
                      onClick={() => dismissOverlay(() => setVictoryDismissed(true))}
                      disabled={dismissingOverlay}
                      className="absolute top-2 right-2 p-1 text-moss-400 hover:text-parchment-100 hover:bg-moss-700 rounded transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>

                    {/* Trophy and Rank */}
                    <div className="text-4xl mb-1 animate-icon-bounce animate-victory-glow">{getRankEmoji(puzzleScore.rank)}</div>
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

                    {/* Watch Replay + Report Bug */}
                    {playStartCharacters.length > 0 && (
                      <div className="mt-3 flex flex-col items-center gap-2">
                        <button
                          onClick={() => dismissOverlay(() => { setVictoryDismissed(true); handleWatchReplay(); })}
                          disabled={dismissingOverlay}
                          className="dungeon-btn px-4 py-2 text-sm font-bold"
                        >
                          Watch Replay
                        </button>
                        {trackedRuns.length > 0 && (
                          <button
                            onClick={() => dismissOverlay(() => { setVictoryDismissed(true); setShowBugReport(true); })}
                            disabled={dismissingOverlay}
                            className="dungeon-btn px-1.5 py-1 text-xs flex items-center justify-center"
                            title="Report Bug"
                          >
                            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M8 2l1.88 1.88M14.12 3.88L16 2M9 7.13v-1a3.003 3.003 0 116 0v1" />
                              <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 014-4h4a4 4 0 014 4v3c0 3.3-2.7 6-6 6z" />
                              <path d="M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M6 17l-4 1M17.47 9c1.93-.2 3.53-1.9 3.53-4M18 13h4M18 17l4 1" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Community Stats */}
                    {currentPuzzle.date && (
                      <CommunityStats
                        puzzleId={currentPuzzle.id}
                        playerScore={puzzleScore}
                        playerOutcome="victory"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Victory Collapsed Banner — persists after dismissing the full overlay */}
              {gameState.gameStatus === 'victory' && puzzleScore && !replayMode && victoryDismissed && (
                <div className="absolute inset-x-0 top-2 flex justify-center z-10 pointer-events-none">
                  <button
                    onClick={() => setVictoryDismissed(false)}
                    className="pointer-events-auto victory-panel px-4 py-2 rounded-pixel-lg flex items-center gap-2 text-sm cursor-pointer hover:brightness-110 transition-all shadow-lg"
                  >
                    <span className="text-lg">{getRankEmoji(puzzleScore.rank)}</span>
                    <span className="font-medieval font-bold text-moss-200">{getRankName(puzzleScore.rank)}</span>
                    <span className="text-copper-300 font-bold">{puzzleScore.totalPoints.toLocaleString()} pts</span>
                  </button>
                </div>
              )}

              {/* Defeat collapsed pill — parallel to the victory pill above.
                  Shows after the player dismisses the gameover modal in-session
                  so the result stays visible at the top of the page until they
                  navigate away. Click to reopen the full modal. */}
              {showGameOver && defeatDismissed && !replayMode && (
                <div className="absolute inset-x-0 top-2 flex justify-center z-10 pointer-events-none">
                  <button
                    onClick={() => setDefeatDismissed(false)}
                    className="pointer-events-auto defeat-panel px-4 py-2 rounded-pixel-lg flex items-center gap-2 text-sm cursor-pointer hover:brightness-110 transition-all shadow-lg"
                  >
                    <span className="text-lg">{'☠️'}</span>
                    <span className="font-medieval font-bold text-blood-200">Defeated</span>
                  </button>
                </div>
              )}

              {/* Daily-lock banner — only renders on a fresh page load into a
                  locked state (gameStatus still 'setup', no in-session play).
                  In-session, the victory/defeat overlays + their collapsed
                  pills above own the visible result UI; this banner would
                  otherwise overlap. The lock state is also enforced
                  programmatically in handlePlay / handleRestartPuzzle. */}
              {dailyLockStatus && gameState.gameStatus === 'setup' && !replayMode && (
                <div className="absolute inset-x-0 top-2 flex justify-center z-10 pointer-events-none">
                  <div className={`pointer-events-auto px-5 py-3 rounded-pixel-lg flex flex-col items-center gap-1 text-sm shadow-lg ${
                    dailyLockStatus === 'won' ? 'victory-panel' : 'defeat-panel'
                  }`}>
                    <span className="text-2xl">
                      {dailyLockStatus === 'won' ? '🏆' : '💀'}
                    </span>
                    <span className={`font-medieval font-bold ${
                      dailyLockStatus === 'won' ? 'text-moss-200' : 'text-blood-200'
                    }`}>
                      {dailyLockStatus === 'won' ? "Today's Puzzle Complete" : "Today's Puzzle Failed"}
                    </span>
                    <span className="text-xs text-parchment-300/80">
                      Come back tomorrow for a new challenge
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Life Lost Overlay — outside shaking container so transform doesn't break fixed positioning */}
            {gameState.gameStatus === 'defeat' && !showGameOver && !replayMode && (
              <div
                className={`fixed inset-0 flex items-center justify-center z-50 ${dismissingOverlay ? 'animate-overlay-fade-out' : 'animate-overlay-fade-in'}`}
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)' }}
              >
                <div className={`p-6 rounded-pixel-lg text-center max-w-[90%] defeat-panel ${dismissingOverlay ? 'animate-panel-scale-out' : 'animate-panel-scale-in'}`}>
                  <div className="text-4xl mb-1 animate-icon-drop">
                    {defeatReason === 'turns' ? '\u23F3' : '\uD83D\uDC80'}
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold font-medieval text-blood-200 text-shadow-glow-blood">
                    {defeatReason === 'turns' ? 'Out of Turns!' : 'Defeated!'}
                  </h2>
                  <p className="mt-2 text-sm text-blood-300">
                    {livesRemaining > 0
                      ? `${livesRemaining} ${livesRemaining === 1 ? 'life' : 'lives'} remaining`
                      : 'Unlimited lives'}
                  </p>
                  <div className="mt-4 flex flex-col items-center gap-2">
                    <div className="flex gap-3">
                      {playStartCharacters.length > 0 && (
                        <button
                          onClick={() => dismissOverlay(handleWatchReplay)}
                          disabled={dismissingOverlay}
                          className="dungeon-btn px-4 py-3 font-bold text-sm"
                        >
                          Watch Replay
                        </button>
                      )}
                      <button
                        onClick={() => dismissOverlay(handleAutoReset)}
                        disabled={dismissingOverlay}
                        className="dungeon-btn-danger px-6 py-3 font-bold text-lg"
                      >
                        Try Again
                      </button>
                    </div>
                    {trackedRuns.length > 0 && (
                      <button
                        onClick={() => dismissOverlay(() => setShowBugReport(true))}
                        disabled={dismissingOverlay}
                        className="dungeon-btn px-1.5 py-1 text-xs flex items-center justify-center"
                        title="Report Bug"
                      >
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 2l1.88 1.88M14.12 3.88L16 2M9 7.13v-1a3.003 3.003 0 116 0v1" />
                          <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 014-4h4a4 4 0 014 4v3c0 3.3-2.7 6-6 6z" />
                          <path d="M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M6 17l-4 1M17.47 9c1.93-.2 3.53-1.9 3.53-4M18 13h4M18 17l4 1" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Concede Confirmation Popup */}
            {showConcedeConfirm && (
              <div
                className={`fixed inset-0 flex items-center justify-center z-50 ${dismissingConcede ? 'animate-overlay-fade-out' : 'animate-overlay-fade-in'}`}
                style={{
                  backgroundColor: themeAssets.concedeModalOverlayBg || 'rgba(0, 0, 0, 0.7)',
                }}
              >
                <div
                  className={`p-6 rounded-pixel-lg text-center max-w-sm mx-4 ${dismissingConcede ? 'animate-panel-scale-out' : 'animate-panel-scale-in'} ${
                    themeAssets.concedeModalPanelBg ? '' : 'bg-gradient-to-b from-blood-800 to-blood-900 border-2 border-blood-500'
                  }`}
                  style={{
                    ...(themeAssets.concedeModalPanelBg && { backgroundColor: themeAssets.concedeModalPanelBg }),
                    ...(themeAssets.concedeModalPanelBorder && { borderColor: themeAssets.concedeModalPanelBorder, borderWidth: '2px', borderStyle: 'solid' }),
                  }}
                >
                  <h3
                    className={`text-xl font-bold font-medieval ${
                      themeAssets.concedeModalTitleText ? '' : 'text-blood-200'
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
                      onClick={() => { setDismissingConcede(true); setTimeout(() => { setDismissingConcede(false); setShowConcedeConfirm(false); }, 250); }}
                      disabled={dismissingConcede}
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
                      onClick={() => { setDismissingConcede(true); setTimeout(() => { setDismissingConcede(false); handleConcede(); }, 250); }}
                      disabled={dismissingConcede}
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

          </div>

          {/* Unified Info Panel - combines all info displays */}
          {/* TEMP-HIDE: removed dungeon-panel class, border, background for layout testing */}
          <div className="w-full max-w-2xl mx-auto p-1 lg:p-1.5 relative overflow-visible">
            {/* TEMP-HIDE: ornate corner decorations hidden for layout testing
            <svg className="absolute -top-[1px] -left-[1px] w-10 h-10" viewBox="0 0 40 40" overflow="visible">
              <path d="M0 0 L40 0" stroke="#c4915c" strokeWidth="2" fill="none" />
              <path d="M0 0 L0 40" stroke="#c4915c" strokeWidth="2" fill="none" />
              <path d="M0 0 L0 16 Q4 4 16 0 Z" fill="#a97545" stroke="#c4915c" strokeWidth="1" />
            </svg>
            <svg className="absolute -top-[1px] -right-[1px] w-10 h-10" viewBox="0 0 40 40" overflow="visible">
              <path d="M0 0 L40 0" stroke="#c4915c" strokeWidth="2" fill="none" />
              <path d="M40 0 L40 40" stroke="#c4915c" strokeWidth="2" fill="none" />
              <path d="M40 0 L40 16 Q36 4 24 0 Z" fill="#a97545" stroke="#c4915c" strokeWidth="1" />
            </svg>
            */}
            {/* Control Panel Row - Lives / Play Button / Max Turns (NOT dimmed during play) */}
            {!replayMode && (gameState.gameStatus === 'setup' || gameState.gameStatus === 'running' || gameState.gameStatus === 'defeat' || testMode !== 'none') && (
              <>
                <div className={`grid grid-cols-3 items-center mb-1${justExitedReplay ? ' animate-scale-pop' : ''}`}>
                  {/* Left: Lives - centered in left third */}
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-stone-400 text-xs">Lives:</span>
                    <div className="flex items-center gap-0.5">
                      {(() => {
                        const puzzleLives = currentPuzzle.lives ?? 3;
                        const isUnlimitedLives = puzzleLives === 0;

                        if (isUnlimitedLives) {
                          return <span className="text-base lg:text-lg text-copper-400" title="Unlimited lives">&#x221E;</span>;
                        }

                        const hearts = [];
                        for (let i = 0; i < puzzleLives; i++) {
                          const isFilled = i < livesRemaining;
                          const customIcon = isFilled ? themeAssets.iconHeart : themeAssets.iconHeartEmpty;

                          if (customIcon) {
                            // Use integer pixel sizes for crisp pixel art (14px width)
                            hearts.push(
                              <img
                                key={i}
                                src={customIcon}
                                alt={isFilled ? 'Life remaining' : 'Life lost'}
                                title={isFilled ? 'Life remaining' : 'Life lost'}
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
                                className={`text-sm lg:text-base ${isFilled ? 'heart-filled' : 'heart-empty'}`}
                                title={isFilled ? 'Life remaining' : 'Life lost'}
                              >
                                &#x2665;
                              </span>
                            );
                          }
                        }
                        return hearts;
                      })()}
                    </div>
                  </div>

                  {/* Center: Play button OR Turn counter OR Test mode indicator - centered in middle third */}
                  <div className="flex justify-center">
                    {testMode !== 'none' ? (
                      // Test mode indicator
                      <div className={`flex items-center gap-2 px-3 py-1 rounded-pixel border ${
                        testMode === 'enemies'
                          ? 'bg-blood-900/80 border-blood-600'
                          : 'bg-arcane-900/80 border-arcane-600'
                      }`}>
                        <span className={`text-xs font-medium ${
                          testMode === 'enemies' ? 'text-blood-300' : 'text-arcane-300'
                        }`}>
                          Testing {testMode === 'enemies' ? 'Enemies' : 'Heroes'}
                        </span>
                        <span className={`text-lg font-bold ${
                          testMode === 'enemies' ? 'text-blood-300' : 'text-arcane-300'
                        }`}>
                          {testTurnsRemaining}
                        </span>
                      </div>
                    ) : gameState.gameStatus === 'setup' ? (
                      themeAssets.actionButtonPlayImage ? (
                        <button
                          onClick={handlePlay}
                          className={`relative transition-all ${gameState.placedCharacters.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`}
                        >
                          <img
                            src={themeAssets.actionButtonPlayImage}
                            alt="Play"
                            className="h-6 lg:h-8 w-auto"
                            style={{ imageRendering: 'pixelated' }}
                          />
                        </button>
                      ) : (
                        <button
                          onClick={handlePlay}
                          className={`min-w-[80px] lg:min-w-[100px] h-6 lg:h-7 font-bold text-xs lg:text-sm transition-all flex items-center justify-center !py-0 ${
                            gameState.placedCharacters.length === 0
                              ? 'opacity-50 cursor-not-allowed dungeon-btn'
                              : `${themeAssets.actionButtonPlayBg ? '' : 'dungeon-btn-success torch-glow'}`
                          } ${
                            themeAssets.actionButtonPlayShape === 'rounded' ? 'rounded-lg' :
                            themeAssets.actionButtonPlayShape === 'pill' ? 'rounded-full' : ''
                          }`}
                          style={{
                            minHeight: 'unset',
                            ...(themeAssets.actionButtonPlayBg && { backgroundColor: themeAssets.actionButtonPlayBg }),
                            ...(themeAssets.actionButtonPlayBorder && { borderColor: themeAssets.actionButtonPlayBorder, borderWidth: '2px', borderStyle: 'solid' }),
                            ...(themeAssets.actionButtonPlayText && { color: themeAssets.actionButtonPlayText }),
                          }}
                        >
                          Play
                        </button>
                      )
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-stone-400 text-xs lg:text-sm font-medium">Turn</span>
                        {(() => {
                          const maxTurns = currentPuzzle.maxTurns;
                          const turnsRemaining = maxTurns ? maxTurns - gameState.currentTurn : null;
                          const isNearLimit = turnsRemaining !== null && turnsRemaining <= 3;
                          const isVeryNearLimit = turnsRemaining !== null && turnsRemaining <= 1;

                          return (
                            <>
                              <span className={`text-xl lg:text-2xl font-bold min-w-[2ch] text-center ${
                                isVeryNearLimit
                                  ? 'text-blood-400 text-shadow-glow-blood animate-pulse'
                                  : isNearLimit
                                  ? 'text-rust-400'
                                  : 'text-copper-400 text-shadow-glow-copper'
                              }`}>
                                {gameState.currentTurn}
                              </span>
                              {maxTurns && (
                                <span className={`text-xs lg:text-sm ${
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

                  {/* Right: Max Turns OR Concede button - centered in right third */}
                  <div className="flex items-center justify-center">
                    {gameState.gameStatus === 'setup' || testMode !== 'none' ? (
                      gameState.puzzle.maxTurns && (
                        <div className="flex items-center gap-1">
                          <span className="text-stone-400 text-xs">Max Turns:</span>
                          <span className="text-xs lg:text-sm text-parchment-300 font-medium">{gameState.puzzle.maxTurns}</span>
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

                {/* Divider between control panel and heroes - solid line */}
                <div className="mb-1 border-t border-copper-700/50" />
              </>
            )}

            {/* Replay Controls - replace hero placement area during replay */}
            {replayMode ? (
              <div className={dismissingReplay ? 'animate-panel-scale-out' : 'animate-panel-scale-in'}>
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
                  onReportBug={() => setShowBugReport(true)}
                />
              </div>
            ) : (
              /* Heroes and Dungeon Details - dimmed during play/test */
              <div className={`transition-opacity ${dimmedPanelClass} ${justExitedReplay ? 'animate-slide-up' : ''}`}>
                {/* Character Selector - visible during setup, running, defeat, and test mode */}
                {(gameState.gameStatus === 'setup' || gameState.gameStatus === 'running' || gameState.gameStatus === 'defeat' || testMode !== 'none') && (
                  <CharacterSelector
                    availableCharacterIds={gameState.puzzle.availableCharacters}
                    selectedCharacterId={testMode === 'none' && gameState.gameStatus === 'setup' ? selectedCharacterId : null}
                    onSelectCharacter={testMode === 'none' && gameState.gameStatus === 'setup' ? (id: string | null) => { setSelectedCharacterId(id); if (id) vibrate('heroSelect'); } : () => {}}
                    placedCharacterIds={gameState.placedCharacters.map(c => c.characterId)}
                    maxPlaceable={gameState.puzzle.maxPlaceableCharacters ?? gameState.puzzle.maxCharacters}
                    onClearAll={testMode === 'none' && gameState.gameStatus === 'setup' ? handleWipe : undefined}
                    onTest={testMode === 'none' && gameState.gameStatus === 'setup' ? handleTestCharactersWithScroll : undefined}
                    themeAssets={themeAssets}
                    disabled={gameState.gameStatus === 'running' || gameState.gameStatus === 'defeat' || testMode !== 'none'}
                    noPanel
                    placedCharacters={gameState.placedCharacters}
                    pendingSpellDirectionOverrides={pendingSpellDirectionOverrides}
                    onSpellDirectionOverride={testMode === 'none' && gameState.gameStatus === 'setup' ? (characterId: string, spellId: string, direction: Direction) => {
                      const isPlaced = gameState.placedCharacters.some(pc => pc.characterId === characterId);
                      if (isPlaced) {
                        setGameState(prev => ({
                          ...prev,
                          placedCharacters: prev.placedCharacters.map(pc =>
                            pc.characterId === characterId
                              ? { ...pc, spellDirectionOverrides: { ...pc.spellDirectionOverrides, [spellId]: direction } }
                              : pc
                          ),
                        }));
                      } else {
                        setPendingSpellDirectionOverrides(prev => ({
                          ...prev,
                          [characterId]: { ...prev[characterId], [spellId]: direction },
                        }));
                      }
                    } : undefined}
                  />
                )}

                {/* Enemies Display */}
                <EnemyDisplay
                  enemies={gameState.puzzle.enemies}
                  onTest={handleTestEnemiesWithScroll}
                  showTestButton={gameState.gameStatus === 'setup' && testMode === 'none'}
                  themeAssets={themeAssets}
                  noPanel
                />

                {/* Items Display - only shown if puzzle has items */}
                <ItemsDisplay puzzle={gameState.puzzle} noPanel />

                {/* Status Effects Display - only shown if puzzle has status effects */}
                <StatusEffectsDisplay puzzle={gameState.puzzle} noPanel />

                {/* Special Tiles Display - only shown if puzzle has tiles with behaviors */}
                <SpecialTilesDisplay puzzle={gameState.puzzle} noPanel />
              </div>
            )}
          </div>

          {/* Puzzle Selector - at bottom for dev use */}
          <div className="w-full max-w-2xl mx-auto">
            {allPuzzles.length > 0 && (
              <div className={`dungeon-panel p-2 lg:p-3 transition-opacity ${dimmedPanelClass}`}>
                <label className="block text-sm lg:text-base font-bold mb-2 text-copper-400">
                  Select Dungeon {savedPuzzles.length > 0 && <span className="text-stone-400 font-normal">({savedPuzzles.length} saved)</span>}
                </label>
                <select
                  value={currentPuzzle.id}
                  onChange={(e) => handlePuzzleChange(e.target.value)}
                  className="dungeon-select w-full lg:text-base lg:py-2"
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

      <BugReportModal
        isOpen={showBugReport}
        onClose={() => setShowBugReport(false)}
        puzzle={currentPuzzle}
        trackedRuns={trackedRuns}
      />
    </div>
  );
};
