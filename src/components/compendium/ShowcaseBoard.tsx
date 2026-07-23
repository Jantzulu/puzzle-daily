// Slab showcase (2026-07-21): "see it in action" — entity pages embed the
// looping demo boards of puzzles whose showcase.entityIds list this asset.
// Static MiniGridPreview until tapped; ONE live board mounted at a time
// (mobile canvas-count rule). The live board is the TrainingGrounds sim
// pattern in miniature: testMode (no victory/defeat), author-placed
// heroes, runs loopTurns turns, holds a beat, resets, loops. The viewer
// can only watch / stop — never place. Deterministic sim = the video.
import React, { useEffect, useState } from 'react';
import type { GameState, PlacedCharacter, Puzzle } from '../../types/game';
import { TURN_INTERVAL_MS } from '../../types/game';
import { initializeGameState, executeTurn } from '../../engine/simulation';
import { getCharacter } from '../../data/characters';
import { getAllPuzzles } from '../../data/puzzles';
import { getSavedPuzzles } from '../../utils/puzzleStorage';
import { loadStatusEffectAsset } from '../../utils/assetStorage';
import { getLiveShowcaseIndex } from '../../utils/reveal';
import { ensurePuzzleAssets } from '../../utils/livePull';
import { fetchLivePuzzlesByIds } from '../../services/supabaseService';
import { ResponsiveGameBoard } from '../game/AnimatedGameBoard';
import { MiniGridPreview } from '../game/MiniGridPreview';
import { LoadingRune } from '../shared/LoadingRune';

const SHOWCASE_DEFAULT_LOOP_TURNS = 10;
const LOOP_PAUSE_MS = 900;

/** The demo's hero cast, built from the author's placements (stale ids
 *  self-skip). Mirrors Game's placement construction incl. initial
 *  status effects, so the demo shows the entity as it really plays. */
function buildShowcaseHeroes(puzzle: Puzzle): PlacedCharacter[] {
  return (puzzle.showcase?.heroes ?? []).flatMap(h => {
    const charData = getCharacter(h.characterId);
    if (!charData) return [];
    const pc: PlacedCharacter = {
      characterId: h.characterId,
      x: h.x,
      y: h.y,
      facing: charData.defaultFacing,
      currentHealth: charData.health,
      maxHealth: charData.health,
      actionIndex: 0,
      active: true,
      dead: false,
    };
    if (charData.initialStatusEffects && charData.initialStatusEffects.length > 0) {
      pc.statusEffects = charData.initialStatusEffects.map(ise => {
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
    return [pc];
  });
}

function buildShowcaseState(puzzle: Puzzle): GameState {
  const gs = initializeGameState(JSON.parse(JSON.stringify(puzzle)));
  gs.testMode = true; // no victory/defeat — the demo is a sandbox
  gs.placedCharacters = buildShowcaseHeroes(puzzle);
  gs.gameStatus = 'running';
  return gs;
}

const ShowcaseBoard: React.FC<{ puzzle: Puzzle; onClose: () => void }> = ({ puzzle, onClose }) => {
  const [gameState, setGameState] = useState<GameState>(() => buildShowcaseState(puzzle));
  const loopTurns = puzzle.showcase?.loopTurns ?? SHOWCASE_DEFAULT_LOOP_TURNS;
  // Loop boundary is DERIVED — demo length reached, or the sandbox ended
  // early (e.g. every hero finished acting). No paused-state flag needed:
  // the interval effect gates on it, the reset timer restarts from it.
  const loopDone = gameState.currentTurn >= loopTurns || gameState.gameStatus !== 'running';

  // Turn cadence — the TrainingGrounds sim loop (deep copy + tileStates
  // Map rebuild; JSON.stringify drops Maps/Sets).
  useEffect(() => {
    if (loopDone) return;
    const interval = setInterval(() => {
      setGameState(prev => {
        const copy = JSON.parse(JSON.stringify(prev));
        copy.tileStates = new Map();
        if (prev.tileStates) {
          prev.tileStates.forEach((value, key) => {
            copy.tileStates.set(key, { ...value, damagedEntities: value.damagedEntities ? new Set(value.damagedEntities) : undefined });
          });
        }
        return executeTurn(copy);
      });
    }, TURN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loopDone, gameState.gameStatus]);

  // Loop: hold a beat at the boundary, rebuild, go again.
  useEffect(() => {
    if (!loopDone) return;
    const timer = setTimeout(() => setGameState(buildShowcaseState(puzzle)), LOOP_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [loopDone, puzzle]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {puzzle.name || 'Demo'} — turn {Math.min(gameState.currentTurn, loopTurns)}/{loopTurns}
        </span>
        <button
          onClick={onClose}
          className="px-2 py-0.5 text-xs rounded border border-stone-600 hover:bg-stone-700/40"
          style={{ color: 'var(--text-muted)' }}
        >
          ✕ Close
        </button>
      </div>
      <ResponsiveGameBoard gameState={gameState} />
    </div>
  );
};

/** Device-local showcase puzzles attached to this asset id (bundled +
 *  saved: team devices via cloud pull), deduped. Cloud-published demos are
 *  handled separately by ShowcaseSection: the live-content cache holds only
 *  an id→attachments INDEX (snoop-hole fix — full demo JSON for un-debuted
 *  assets must never sit on the device), and full rows are fetched lazily
 *  per revealed asset page. */
function localShowcasePuzzlesFor(assetId: string): Puzzle[] {
  const seen = new Set<string>();
  return [...getAllPuzzles(), ...getSavedPuzzles()].filter(p => {
    if (!p.showcase?.entityIds?.includes(assetId)) return false;
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

export const ShowcaseSection: React.FC<{ assetId: string }> = ({ assetId }) => {
  // No memo on the local scan — it's a few small arrays and the cloud list
  // can land after mount.
  const localPuzzles = localShowcasePuzzlesFor(assetId);
  const [cloudPuzzles, setCloudPuzzles] = useState<Puzzle[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Puzzle currently having its asset closure ensured (tap → brief beat on
  // a player's first view; instant on the dev app / later views).
  const [ensuringId, setEnsuringId] = useState<string | null>(null);

  // Fetch full JSON for cloud demos attached to THIS asset only. This
  // section renders on (revealed) detail pages, so only debuted content is
  // ever requested — a player device never receives demos for assets whose
  // pages they can't see.
  useEffect(() => {
    const localIds = new Set(localShowcasePuzzlesFor(assetId).map(p => p.id));
    const wanted = getLiveShowcaseIndex()
      .filter(e => e.entityIds.includes(assetId) && !localIds.has(e.id))
      .map(e => e.id);
    if (wanted.length === 0) return;
    let cancelled = false;
    fetchLivePuzzlesByIds(wanted).then(ps => {
      if (!cancelled) setCloudPuzzles(ps);
    });
    return () => { cancelled = true; };
  }, [assetId]);

  const seen = new Set(localPuzzles.map(p => p.id));
  const puzzles = [...localPuzzles, ...cloudPuzzles.filter(p => !seen.has(p.id))];

  const openDemo = async (puzzle: Puzzle) => {
    setEnsuringId(puzzle.id);
    // The sim resolves assets synchronously — the demo's closure must be
    // local before the board mounts (no-op when already ensured/local).
    await ensurePuzzleAssets(puzzle);
    setEnsuringId(null);
    setActiveId(puzzle.id);
  };

  if (puzzles.length === 0) return null;
  return (
    <div className="compendium-detail-section">
      <h3>See It In Action</h3>
      <div className="space-y-3">
        {puzzles.map(p => activeId === p.id ? (
          <ShowcaseBoard key={p.id} puzzle={p} onClose={() => setActiveId(null)} />
        ) : (
          <button
            key={p.id}
            onClick={() => openDemo(p)}
            disabled={ensuringId !== null}
            className="block w-full group"
            title="Tap to watch"
          >
            <div className="relative">
              <MiniGridPreview puzzle={p} placements={buildShowcaseHeroes(p)} size={160} />
              <span className="absolute inset-0 flex items-center justify-center text-4xl opacity-70 group-hover:opacity-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                {ensuringId === p.id ? (
                  <LoadingRune
                    label="Summoning…"
                    size={32}
                    textClassName="text-sm font-medieval animate-pulse"
                    className="text-[color:var(--text-muted)]"
                  />
                ) : (
                  '▶'
                )}
              </span>
            </div>
            {p.name && (
              <span className="block text-center text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {p.name}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
