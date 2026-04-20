/**
 * Golden-test corpus types.
 *
 * A CorpusCase is a self-contained puzzle definition: it registers the assets
 * it needs, builds an initial GameState, and specifies a placement plan. The
 * harness runs it turn-by-turn, captures a logical-only snapshot per turn, and
 * compares the resulting sequence against a committed golden JSON file.
 *
 * The goldens lock in current deterministic behavior so refactors (projectile
 * Phase C/D/E) can prove they don't drift logical outcomes.
 */
import type { Direction, GameState } from '../../../types/game';

export interface CorpusPlacement {
  characterId: string;
  x: number;
  y: number;
  facing: Direction;
}

export interface CorpusCase {
  /** File-safe case identifier. Used as golden filename prefix. */
  id: string;
  /** Human-readable one-liner for test output. */
  description: string;
  /**
   * Registers assets (characters, enemies, spells, etc.) into the test
   * registries and returns an initial GameState in `setup` status. The
   * harness will run placements, flip to `running`, and drive executeTurn.
   */
  setup: () => GameState;
  placements: CorpusPlacement[];
  /** Safety cap — harness stops after this many turns even if game is still running. Default 40. */
  maxTurns?: number;
}
