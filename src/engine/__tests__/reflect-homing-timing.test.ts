/**
 * Homing-reflect return-leg TIMING parity — the last pinned real/headless
 * divergence, closed 2026-07-21 (resolveHomingReflectHeadless).
 *
 * The Phase E outcome gate only compared FINAL state, so it stayed green
 * while the return hit landed on different TURNS: real resolved the whole
 * reflected leg the moment the reflect happened, headless re-homed the
 * bolt at the caster over subsequent turns — skewing kill timing,
 * turn-count scoring, and solvability under tight turn limits, and giving
 * the caster phantom turns to act mid-return. These pins compare the
 * PER-TURN health timeline across modes for all three homing path styles,
 * so a regression to lagged resolution fails even when the end state
 * converges.
 */
import './helpers';
import { describe, it, expect } from 'vitest';
import { runCase } from './corpus/harness';
import { reflectVsHomingStraightCase } from './corpus/cases/13-reflect-vs-homing-straight';
import { reflectVsHomingGridCase } from './corpus/cases/19-reflect-vs-homing-grid';
import { reflectVsHomingPathfindingCase } from './corpus/cases/20-reflect-vs-homing-pathfinding';
import type { CorpusCase } from './corpus/types';

interface HealthSnapshot {
  turn: number;
  characters: Array<{ characterId: string; currentHealth: number; dead: boolean }>;
  enemies: Array<{ enemyId: string; currentHealth: number; dead: boolean }>;
}

function healthTimeline(testCase: CorpusCase, headless: boolean) {
  return runCase(testCase, { headless }).snapshots.map(snap => {
    const s = snap as unknown as HealthSnapshot;
    return {
      turn: s.turn,
      characters: s.characters.map(c => ({ id: c.characterId, hp: c.currentHealth, dead: c.dead })),
      enemies: s.enemies.map(e => ({ id: e.enemyId, hp: e.currentHealth, dead: e.dead })),
    };
  });
}

describe('homing-reflect return-leg timing parity', () => {
  const cases: Array<[string, CorpusCase]> = [
    ['straight', reflectVsHomingStraightCase],
    ['grid', reflectVsHomingGridCase],
    ['pathfinding', reflectVsHomingPathfindingCase],
  ];

  for (const [style, testCase] of cases) {
    it(`${style}: real and headless agree on WHICH TURN every health change lands`, () => {
      expect(healthTimeline(testCase, true)).toEqual(healthTimeline(testCase, false));
    });
  }
});
