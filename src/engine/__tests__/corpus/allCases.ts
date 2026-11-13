/**
 * Every corpus case, in order. Shared by the golden tests (corpus.test.ts)
 * and the replay parity tests (replay-parity.test.ts): add a new case here
 * and both pick it up.
 */
import type { CorpusCase } from './types';
import { meleeAttackCase } from './cases/01-melee-attack';
import { linearProjectileFastCase } from './cases/02-linear-projectile-fast';
import { linearProjectileSlowCase } from './cases/03-linear-projectile-slow';
import { linearProjectileWallCase } from './cases/04-linear-projectile-wall';
import { linearProjectileSlowLandsCase } from './cases/05-linear-projectile-slow-lands';
import { homingStraightFastCase } from './cases/06-homing-straight-fast';
import { homingGridFastCase } from './cases/07-homing-grid-fast';
import { homingPathfindingWallCase } from './cases/08-homing-pathfinding-wall';
import { homingStraightSlowCase } from './cases/09-homing-straight-slow';
import { homingSlowMovingTargetCase } from './cases/10-homing-slow-moving-target';
import { homingFastMovingTargetCase } from './cases/11-homing-fast-moving-target';
import { reflectVsNonHomingCase } from './cases/12-reflect-vs-non-homing';
import { reflectVsHomingStraightCase } from './cases/13-reflect-vs-homing-straight';
import { linearBounceWallsCase } from './cases/14-linear-bounce-walls';
import { linearPierceMultipleCase } from './cases/15-linear-pierce-multiple';
import { homingGridMovingTargetCase } from './cases/16-homing-grid-moving-target';
import { homingPathfindingMovingTargetCase } from './cases/17-homing-pathfinding-moving-target';
import { linearPierceDistinctIdsCase } from './cases/18-linear-pierce-distinct-ids';
import { reflectVsHomingGridCase } from './cases/19-reflect-vs-homing-grid';
import { reflectVsHomingPathfindingCase } from './cases/20-reflect-vs-homing-pathfinding';
import { twoHeroesSimultaneousCastCase } from './cases/21-two-heroes-simultaneous-cast';
import { homingStraightRangeShortCase } from './cases/22-homing-straight-range-short';

export const ALL_CASES: CorpusCase[] = [
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
