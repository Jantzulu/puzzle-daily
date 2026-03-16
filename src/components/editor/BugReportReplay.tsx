import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { GameState, Puzzle, PlacedCharacter } from '../../types/game';
import { TURN_INTERVAL_MS } from '../../types/game';
import { initializeGameState, executeTurn } from '../../engine/simulation';
import { getCharacter } from '../../data/characters';
import { diffTurn, type LogEventType } from '../../engine/combatLog';
import { ResponsiveGameBoard } from '../game/AnimatedGameBoard';
import { ReplayControls } from '../game/ReplayControls';

interface BugReportReplayProps {
  puzzle: Puzzle;
  placements: PlacedCharacter[];
  onExit: () => void;
}

/**
 * Standalone replay component for dev bug report triage.
 * Generates turn history deterministically from puzzle + placements,
 * then renders the game board with replay controls.
 */
export const BugReportReplay: React.FC<BugReportReplayProps> = ({ puzzle, placements, onExit }) => {
  const [turnIndex, setTurnIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const turnHistoryRef = useRef<GameState[]>([]);
  const eventsRef = useRef<Map<number, Set<LogEventType>>>(new Map());

  // Generate turn history on mount
  const history = useMemo(() => {
    const puzzleCopy: Puzzle = JSON.parse(JSON.stringify(puzzle));
    const initialState = initializeGameState(puzzleCopy);

    // Place characters from the bug report
    initialState.placedCharacters = JSON.parse(JSON.stringify(placements)).map((char: PlacedCharacter) => {
      const charData = getCharacter(char.characterId);
      return {
        ...char,
        actionIndex: 0,
        currentHealth: charData ? charData.health : char.currentHealth,
        dead: false,
        active: true,
      };
    });
    initialState.gameStatus = 'running';
    initialState.headlessMode = true;

    // Deep copy preserving Map/Set
    const deepCopy = (state: GameState): GameState => {
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
    };

    const hist: GameState[] = [deepCopy(initialState)];
    let current = initialState;
    const maxIterations = (puzzleCopy.maxTurns || 200) + 10;

    for (let i = 0; i < maxIterations; i++) {
      if (current.gameStatus !== 'running') break;
      const stateCopy = deepCopy(current);
      current = executeTurn(stateCopy);
      hist.push(deepCopy(current));
    }

    // Compute notable events per turn
    const events = new Map<number, Set<LogEventType>>();
    for (let i = 1; i < hist.length; i++) {
      const changes = diffTurn(hist[i - 1], hist[i]);
      const notable = changes.filter(e => e.type !== 'movement' && e.type !== 'no_events');
      if (notable.length > 0) {
        events.set(i, new Set(notable.map(e => e.type)));
      }
    }

    turnHistoryRef.current = hist;
    eventsRef.current = events;
    return hist;
  }, [puzzle, placements]);

  // Current game state for display
  const gameState = history[turnIndex] || history[0];

  // Playback timer
  useEffect(() => {
    if (!isPlaying) return;
    const intervalMs = TURN_INTERVAL_MS / speed;
    const interval = setInterval(() => {
      setTurnIndex(prev => {
        if (prev >= history.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => clearInterval(interval);
  }, [isPlaying, speed, history.length]);

  const handlePlayPause = useCallback(() => {
    if (turnIndex >= history.length - 1) {
      setTurnIndex(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(prev => !prev);
    }
  }, [turnIndex, history.length]);

  const handleStepForward = useCallback(() => {
    setIsPlaying(false);
    setTurnIndex(prev => Math.min(prev + 1, history.length - 1));
  }, [history.length]);

  const handleStepBack = useCallback(() => {
    setIsPlaying(false);
    setTurnIndex(prev => Math.max(prev - 1, 0));
  }, []);

  const handleSeek = useCallback((turn: number) => {
    setIsPlaying(false);
    setTurnIndex(turn);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <ResponsiveGameBoard gameState={gameState} />
      </div>

      <ReplayControls
        currentTurn={turnIndex}
        totalTurns={history.length - 1}
        isPlaying={isPlaying}
        speed={speed}
        events={eventsRef.current}
        onPlayPause={handlePlayPause}
        onStepForward={handleStepForward}
        onStepBack={handleStepBack}
        onSeek={handleSeek}
        onSpeedChange={setSpeed}
        onExit={onExit}
      />
    </div>
  );
};
