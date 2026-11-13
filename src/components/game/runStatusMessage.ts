// The run's state in one spoken sentence, for RunAnnouncer's live region.
// Turn-by-turn play is deliberately NOT narrated (a run ticks every 0.8s);
// the board's keyboard cursor describes any tile on demand instead.

import type { GameStatus } from '../../types/game';

export interface RunStatus {
  status: GameStatus;
  placed: number;
  maxPlaceable: number;
  /** Set once the victory score exists. */
  victory?: { rankName: string; points: number } | null;
  /** Set while the defeat result stands. */
  defeat?: { reason: 'damage' | 'turns' | null; livesRemaining: number } | null;
  replay?: { turn: number; totalTurns: number; playing: boolean } | null;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function runStatusMessage(s: RunStatus): string {
  if (s.replay) {
    return s.replay.playing
      ? 'Replay playing.'
      : `Replay, turn ${s.replay.turn} of ${s.replay.totalTurns}.`;
  }
  if (s.victory) {
    return `Victory. ${s.victory.rankName}. ${count(s.victory.points, 'point', 'points')}.`;
  }
  if (s.defeat) {
    const why = s.defeat.reason === 'turns' ? 'Out of turns' : 'Defeated';
    return `${why}. ${count(s.defeat.livesRemaining, 'life', 'lives')} remaining.`;
  }
  if (s.status === 'running') return 'Run started.';
  if (s.status === 'setup') return `${s.placed} of ${count(s.maxPlaceable, 'hero', 'heroes')} placed.`;
  return '';
}
