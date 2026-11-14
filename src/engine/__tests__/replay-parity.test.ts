/**
 * Replay parity (FALLBACK PATH) — does the timeline REBUILD reproduce the
 * bolts the live game actually flew?
 *
 * Since 2026-11-13 replay normally shows each snapshot's own projectiles
 * (checked frame by frame in replay-frames.test.ts). The rebuild tested
 * here only runs for a history regenerated headless (no live capture).
 *
 * Replay doesn't re-simulate: components/game/replayProjectiles.ts rebuilds
 * each turn's projectiles from the engine's recorded ProjectileEvent
 * timeline. This runs every corpus case in real mode, keeps the engine's own
 * projectiles after each turn, and compares them with what replay rebuilds
 * for the same turn:
 *   - tilePath       the tiles the bolt is drawn along this turn
 *   - logicalX/Y     where it rests at the end of the turn
 *   - hitTileIndex   the tile at which it lands and stops
 *
 * (currentTileIndex and the clock fields are visual-only: live leaves them
 * for the frame loop, replay seeds them. Not compared.)
 *
 * This is a FIELD-level ruler, and a rough one: the frame-level audit in
 * docs/replay-audit-2026-11.md found 4 of the 9 gaps below are not visible on
 * screen (09, 10, 11, 16), and that case 13 passes here while looking wrong.
 * It still earns its keep as a tripwire for the cases that do match.
 *
 * KNOWN_GAPS lists cases where replay currently differs, each with what
 * differs. A listed case must STILL differ: when a fix lands, the test fails
 * until the case is taken off the list, so the list can't go stale.
 */
import './helpers';
import { describe, it, expect } from 'vitest';
import { executeTurn } from '../simulation';
import { getCharacter } from '../../data/characters';
import type { GameState, PlacedCharacter, Projectile } from '../../types/game';
import {
  buildProjectileLifetimes,
  buildReplayProjectiles,
} from '../../components/game/replayProjectiles';
import { ALL_CASES } from './corpus/allCases';
import type { CorpusCase } from './corpus/types';

const KNOWN_GAPS: Record<string, string> = {
  '04-linear-projectile-wall': 'resting position: live rests on the wall tile, replay one tile short',
  '09-homing-straight-slow': 'NOT VISIBLE: final-turn tilePath differs but is not used to draw straight homing',
  '10-homing-slow-moving-target': 'NOT VISIBLE: final-turn tilePath (straight homing)',
  '11-homing-fast-moving-target': 'NOT VISIBLE: final-turn tilePath (straight homing)',
  '12-reflect-vs-non-homing': 'resting position after a reflect',
  '14-linear-bounce-walls': 'tilePath: replay is missing the bounced return leg',
  '15-linear-pierce-multiple': 'hitTileIndex: replay stops a pierce bolt the live game left flying',
  '16-homing-grid-moving-target': 'NOT VISIBLE: live never draws its fractional resting position',
  '18-linear-pierce-distinct-ids': 'hitTileIndex (pierce)',
};

const pathStr = (p?: Array<{ x: number; y: number }>) =>
  p ? p.map(t => `${t.x},${t.y}`).join(' ') : 'none';

/** Run a case in real mode and diff replay's rebuild against the live bolts. */
function replayDiffs(testCase: CorpusCase): { checked: number; diffs: string[] } {
  const gs: GameState = testCase.setup();
  for (const p of testCase.placements) {
    const def = getCharacter(p.characterId)!;
    const placed: PlacedCharacter = {
      characterId: p.characterId, x: p.x, y: p.y, facing: p.facing,
      currentHealth: def.health, actionIndex: 0, active: true, dead: false,
    };
    gs.placedCharacters.push(placed);
  }
  gs.gameStatus = 'running';
  gs.projectileTimeline = [];

  const live: Array<{ turn: number; projs: Projectile[] }> = [];
  let turns = 0;
  while (gs.gameStatus === 'running' && turns < (testCase.maxTurns ?? 40)) {
    executeTurn(gs);
    turns++;
    live.push({ turn: gs.currentTurn, projs: JSON.parse(JSON.stringify(gs.activeProjectiles ?? [])) });
  }

  const lifetimes = buildProjectileLifetimes(gs.projectileTimeline);
  const diffs: string[] = [];
  let checked = 0;
  for (const { turn, projs } of live) {
    const replay = buildReplayProjectiles(turn, gs, lifetimes, 0);
    for (const r of replay) {
      checked++;
      const l = projs.find(p => p.id === r.id);
      if (!l) { diffs.push(`T${turn}: replay shows a bolt the live game no longer has`); continue; }
      if (pathStr(l.tilePath) !== pathStr(r.tilePath)) {
        diffs.push(`T${turn}: tilePath live[${pathStr(l.tilePath)}] replay[${pathStr(r.tilePath)}]`);
      }
      if (Math.abs(l.logicalX - r.logicalX) > 1e-6 || Math.abs(l.logicalY - r.logicalY) > 1e-6) {
        diffs.push(`T${turn}: rests at live(${l.logicalX},${l.logicalY}) replay(${r.logicalX},${r.logicalY})`);
      }
      if (l.hitResult?.hitTileIndex !== r.hitResult?.hitTileIndex) {
        diffs.push(`T${turn}: hitTileIndex live=${l.hitResult?.hitTileIndex} replay=${r.hitResult?.hitTileIndex}`);
      }
    }
    for (const l of projs) {
      if (l.active && !l.hitResult && !replay.find(r => r.id === l.id)) {
        diffs.push(`T${turn}: a bolt still flying live is missing from replay`);
      }
    }
  }
  return { checked, diffs };
}

describe('replay parity with the live game', () => {
  for (const testCase of ALL_CASES) {
    const gap = KNOWN_GAPS[testCase.id];
    if (gap) {
      it(`${testCase.id} — KNOWN GAP still present (${gap})`, () => {
        expect(replayDiffs(testCase).diffs.length).toBeGreaterThan(0);
      });
    } else {
      it(`${testCase.id} — replay rebuilds what the live game flew`, () => {
        expect(replayDiffs(testCase).diffs).toEqual([]);
      });
    }
  }

  it('every known gap names a real case', () => {
    const ids = new Set(ALL_CASES.map(c => c.id));
    expect(Object.keys(KNOWN_GAPS).filter(id => !ids.has(id))).toEqual([]);
  });
});
