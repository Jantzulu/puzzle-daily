/**
 * Golden-test corpus harness.
 *
 * Takes a CorpusCase, applies placements, drives the game to completion, and
 * returns the per-turn logical snapshot sequence. Supports both real-game
 * (`resolveProjectiles`) and headless-solver (`updateProjectilesHeadless`)
 * modes via the `headlessMode` flag on GameState — same flag `executeTurn`
 * already branches on at simulation.ts:1729.
 */
import { executeTurn } from '../../simulation';
import type { PlacedCharacter } from '../../../types/game';
import type { CorpusCase } from './types';
import { IdNormalizer, serializeTurn, type TurnSnapshot } from './snapshot';
import { getCharacter } from '../../../data/characters';

export interface RunResult {
  snapshots: TurnSnapshot[];
  finalStatus: string;
  turnsExecuted: number;
  hitTurnCap: boolean;
  /** Phase E parity view — see finalParityView(). */
  finalParity: FinalParityView;
}

/**
 * The Phase E success criterion (docs/projectile-refactor-plan.md §4):
 * real and headless mode must agree on final LOGICAL outcomes. Deferred
 * bookkeeping is folded away — real mode's pendingProjectileDeath counts
 * as dead, matching how the audit's parity sweep normalizes the one
 * intended difference between the modes.
 */
export interface FinalParityView {
  finalStatus: string;
  turnsExecuted: number;
  score: number;
  characters: Array<{
    characterId: string; x: number; y: number; facing: string;
    health: number; dead: boolean;
  }>;
  enemies: Array<{
    enemyId: string; x: number; y: number; facing?: string;
    health: number; dead: boolean;
  }>;
  collectibles: Array<{ collectibleId?: string; x: number; y: number; collected: boolean }>;
}

export interface RunOptions {
  headless?: boolean;
}

export function runCase(testCase: CorpusCase, opts: RunOptions = {}): RunResult {
  const maxTurns = testCase.maxTurns ?? 40;
  const gs = testCase.setup();

  // Apply placements (mirrors Game.tsx placement: look up character def, spawn
  // at given tile with full health). We intentionally do NOT replicate the
  // Date.now/Math.random initial-status-effect id generation from Game.tsx —
  // cases that need initial status effects should pre-populate them on the
  // PlacedCharacter directly with stable ids.
  for (const p of testCase.placements) {
    const def = getCharacter(p.characterId);
    if (!def) throw new Error(`CorpusCase "${testCase.id}": unknown characterId ${p.characterId}`);
    const placed: PlacedCharacter = {
      characterId: p.characterId,
      x: p.x,
      y: p.y,
      facing: p.facing,
      currentHealth: def.health,
      actionIndex: 0,
      active: true,
      dead: false,
    };
    gs.placedCharacters.push(placed);
  }

  if (opts.headless) gs.headlessMode = true;
  gs.gameStatus = 'running';

  const ids = new IdNormalizer();
  const snapshots: TurnSnapshot[] = [];

  // Initial snapshot (turn 0, before any executeTurn call).
  snapshots.push(serializeTurn(gs, ids));

  let turns = 0;
  while (gs.gameStatus === 'running' && turns < maxTurns) {
    executeTurn(gs);
    turns++;
    snapshots.push(serializeTurn(gs, ids));
  }

  return {
    snapshots,
    finalStatus: gs.gameStatus,
    turnsExecuted: turns,
    hitTurnCap: turns >= maxTurns && gs.gameStatus === 'running',
    finalParity: finalParityView(gs, turns),
  };
}

function finalParityView(gs: Parameters<typeof executeTurn>[0], turns: number): FinalParityView {
  return {
    finalStatus: gs.gameStatus,
    turnsExecuted: turns,
    score: gs.score,
    characters: gs.placedCharacters.map(c => ({
      characterId: c.characterId,
      x: c.x, y: c.y, facing: c.facing,
      health: c.currentHealth,
      dead: !!(c.dead || c.pendingProjectileDeath), // fold the deferred commit
    })),
    enemies: gs.puzzle.enemies.map(e => ({
      enemyId: e.enemyId,
      x: e.x, y: e.y, facing: e.facing,
      health: e.currentHealth,
      dead: !!(e.dead || e.pendingProjectileDeath),
    })),
    collectibles: gs.puzzle.collectibles.map(col => ({
      collectibleId: col.collectibleId,
      x: col.x, y: col.y,
      collected: !!col.collected,
    })),
  };
}

/** Convert a snapshot sequence to the canonical golden-file JSON form. */
export function snapshotsToJson(snapshots: TurnSnapshot[]): string {
  return JSON.stringify(snapshots, null, 2) + '\n';
}
