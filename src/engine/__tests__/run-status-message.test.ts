/**
 * The run's spoken status for screen readers
 * (components/game/runStatusMessage.ts).
 */
import { describe, it, expect } from 'vitest';
import { runStatusMessage } from '../../components/game/runStatusMessage';

const base = { status: 'setup' as const, placed: 0, maxPlaceable: 3 };

describe('run status message', () => {
  it('counts placed heroes during setup', () => {
    expect(runStatusMessage(base)).toBe('0 of 3 heroes placed.');
    expect(runStatusMessage({ ...base, placed: 1, maxPlaceable: 1 })).toBe('1 of 1 hero placed.');
  });

  it('announces the run starting, not every turn', () => {
    expect(runStatusMessage({ ...base, status: 'running', placed: 2 })).toBe('Run started.');
  });

  it('announces victory with rank and points', () => {
    expect(runStatusMessage({ ...base, status: 'victory', victory: { rankName: 'Gold Trophy', points: 1200 } }))
      .toBe('Victory. Gold Trophy. 1200 points.');
  });

  it('announces defeat with the reason and lives left', () => {
    expect(runStatusMessage({ ...base, status: 'defeat', defeat: { reason: 'turns', livesRemaining: 2 } }))
      .toBe('Out of turns. 2 lives remaining.');
    expect(runStatusMessage({ ...base, status: 'defeat', defeat: { reason: 'damage', livesRemaining: 1 } }))
      .toBe('Defeated. 1 life remaining.');
  });

  it('replay wins over the run result and reports its position', () => {
    const replay = { turn: 4, totalTurns: 12, playing: false };
    expect(runStatusMessage({ ...base, status: 'victory', victory: { rankName: 'Gold Trophy', points: 5 }, replay }))
      .toBe('Replay, turn 4 of 12.');
    expect(runStatusMessage({ ...base, replay: { ...replay, playing: true } })).toBe('Replay playing.');
  });
});
