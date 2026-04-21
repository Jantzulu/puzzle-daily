/**
 * Golden-test corpus — locks in current deterministic engine behavior so
 * refactors (projectile Phase C/D/E) can prove they don't drift logical
 * outcomes. See docs/projectile-refactor-plan.md §4 Phase E.
 *
 * Each case is run through the engine twice and snapshotted against two
 * goldens:
 *   - `*.real.golden.json` — real-game path (resolveProjectiles at turn
 *     boundaries). This is what players actually see.
 *   - `*.headless.golden.json` — headless solver path
 *     (updateProjectilesHeadless). This is what the puzzle validator sees.
 *
 * Why two goldens and not a single parity assertion?
 *   The two paths legitimately diverge on bookkeeping timing. Real mode
 *   defers `enemy.dead=true` via `pendingProjectileDeath` until the visual
 *   projectile sprite reaches the target; headless flips it immediately
 *   because the solver has no visual loop to wait on. This is intentional
 *   design, not a drift bug. The corpus locks down each path's current
 *   behavior independently, which both (a) protects against accidental
 *   regressions in either path, and (b) gives Phase E's shared-collision
 *   refactor a concrete reference for "outcome parity" (same final entity
 *   HPs, positions, victory/defeat result — timing of `dead` flag flips
 *   is allowed to differ).
 *
 * To regenerate goldens after an intentional behavior change, run with
 * UPDATE_GOLDENS=1 (e.g. `UPDATE_GOLDENS=1 npm test -- corpus`).
 */
import './helpers';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runCase, snapshotsToJson } from './corpus/harness';
import type { CorpusCase } from './corpus/types';
import { meleeAttackCase } from './corpus/cases/01-melee-attack';
import { linearProjectileFastCase } from './corpus/cases/02-linear-projectile-fast';
import { linearProjectileSlowCase } from './corpus/cases/03-linear-projectile-slow';
import { linearProjectileWallCase } from './corpus/cases/04-linear-projectile-wall';
import { linearProjectileSlowLandsCase } from './corpus/cases/05-linear-projectile-slow-lands';
import { homingStraightFastCase } from './corpus/cases/06-homing-straight-fast';
import { homingGridFastCase } from './corpus/cases/07-homing-grid-fast';
import { homingPathfindingWallCase } from './corpus/cases/08-homing-pathfinding-wall';
import { homingStraightSlowCase } from './corpus/cases/09-homing-straight-slow';
import { homingSlowMovingTargetCase } from './corpus/cases/10-homing-slow-moving-target';
import { homingFastMovingTargetCase } from './corpus/cases/11-homing-fast-moving-target';
import { reflectVsNonHomingCase } from './corpus/cases/12-reflect-vs-non-homing';
import { reflectVsHomingStraightCase } from './corpus/cases/13-reflect-vs-homing-straight';
import { linearBounceWallsCase } from './corpus/cases/14-linear-bounce-walls';
import { linearPierceMultipleCase } from './corpus/cases/15-linear-pierce-multiple';
import { homingGridMovingTargetCase } from './corpus/cases/16-homing-grid-moving-target';
import { homingPathfindingMovingTargetCase } from './corpus/cases/17-homing-pathfinding-moving-target';
import { linearPierceDistinctIdsCase } from './corpus/cases/18-linear-pierce-distinct-ids';
import { reflectVsHomingGridCase } from './corpus/cases/19-reflect-vs-homing-grid';
import { reflectVsHomingPathfindingCase } from './corpus/cases/20-reflect-vs-homing-pathfinding';
import { twoHeroesSimultaneousCastCase } from './corpus/cases/21-two-heroes-simultaneous-cast';
import { homingStraightRangeShortCase } from './corpus/cases/22-homing-straight-range-short';

const CASES: CorpusCase[] = [
  meleeAttackCase,
  linearProjectileFastCase,
  linearProjectileSlowCase,
  linearProjectileWallCase,
  linearProjectileSlowLandsCase,
  homingStraightFastCase,
  homingGridFastCase,
  homingPathfindingWallCase,
  homingStraightSlowCase,
  homingSlowMovingTargetCase,
  homingFastMovingTargetCase,
  reflectVsNonHomingCase,
  reflectVsHomingStraightCase,
  linearBounceWallsCase,
  linearPierceMultipleCase,
  homingGridMovingTargetCase,
  homingPathfindingMovingTargetCase,
  linearPierceDistinctIdsCase,
  reflectVsHomingGridCase,
  reflectVsHomingPathfindingCase,
  twoHeroesSimultaneousCastCase,
  homingStraightRangeShortCase,
];

const CASES_DIR = path.resolve(__dirname, 'corpus', 'cases');
const UPDATE = process.env.UPDATE_GOLDENS === '1';

function goldenPath(caseId: string, mode: 'real' | 'headless'): string {
  return path.join(CASES_DIR, `${caseId}.${mode}.golden.json`);
}

function compareOrWrite(actual: string, goldenFile: string, caseId: string, mode: string) {
  if (!fs.existsSync(goldenFile) || UPDATE) {
    fs.writeFileSync(goldenFile, actual, 'utf8');
    if (!UPDATE) {
      console.warn(`[corpus] wrote new ${mode} golden for ${caseId} at ${goldenFile} — review and commit`);
    }
    return;
  }
  const expected = fs.readFileSync(goldenFile, 'utf8');
  expect(actual).toBe(expected);
}

describe('corpus golden tests', () => {
  for (const testCase of CASES) {
    describe(testCase.id, () => {
      it(`real-mode snapshot matches golden — ${testCase.description}`, () => {
        const result = runCase(testCase, { headless: false });
        expect(
          result.hitTurnCap,
          `case "${testCase.id}" ran past maxTurns without ending — raise maxTurns or check termination`,
        ).toBe(false);
        compareOrWrite(snapshotsToJson(result.snapshots), goldenPath(testCase.id, 'real'), testCase.id, 'real');
      });

      it(`headless-mode snapshot matches golden`, () => {
        const result = runCase(testCase, { headless: true });
        expect(
          result.hitTurnCap,
          `case "${testCase.id}" (headless) ran past maxTurns without ending`,
        ).toBe(false);
        compareOrWrite(snapshotsToJson(result.snapshots), goldenPath(testCase.id, 'headless'), testCase.id, 'headless');
      });

      // Phase E success criterion: real and headless agree on final logical
      // outcomes (entity HPs, positions, victory/defeat). Byte-identical
      // snapshots are NOT the target — real mode deliberately defers
      // `enemy.dead=true` via pendingProjectileDeath (waits for visual
      // projectile sprite to arrive); headless has no visual loop and flips
      // immediately. This is intentional design, not drift.
      // See docs/projectile-refactor-plan.md §4 Phase E.
      it.todo('Phase E: real and headless agree on final-turn entity state');
    });
  }
});
