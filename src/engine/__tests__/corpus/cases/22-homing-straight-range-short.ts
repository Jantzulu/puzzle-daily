/**
 * Case 22: homing bolt with SPELL RANGE SHORTER than target distance.
 *
 * Regression test for the "homing trigger range bypasses spell range" bug.
 * Two distinct fixes live under this one case:
 *
 * 1. `resolveProjectiles`' homing range check used to measure
 *    `totalDistanceTraveled` from `homingVisualStartX/Y` — which
 *    re-anchors each turn for slow-projectile visual interpolation — so
 *    the measured distance was always ~0 and the range gate never fired.
 *    Fixed by measuring from the stable `proj.startX/Y` anchor.
 *
 * 2. Once the range gate worked logically, the VISUAL for out-of-range
 *    bolts showed "projectiles appearing at random locations" because the
 *    straight-line homing visual interpolates to the target over
 *    `dist/speed` seconds — for a 7-tile target at speed 4 that's 1.4s
 *    vs the 0.8s turn. Visual reached ~57% of target in 800ms while
 *    logical was capped by range at ~43%; the turn-boundary anchor reset
 *    then snapped the sprite backward to the logical position. Fixed by
 *    downgrading out-of-range homing bolts to non-homing at spawn —
 *    targetX/Y gets capped to the spell's max-range point in the target's
 *    direction, and the bolt flies a plain straight line there.
 *
 * Hero at (0,0), enemy at (7,0). Spell range = 3. The bolt cannot reach
 * the enemy. Expected: bolt spawns as a non-homing straight shot toward
 * a max-range point, flies 3 tiles east, deactivates. Enemy HP stays 3.
 */
import {
  clearAllRegistries,
  registerTestCharacter,
  registerTestEnemy,
  registerTestSpell,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestPuzzle,
  createTestEnemy,
  createTestGameState,
} from '../../helpers';
import { Direction, ActionType, SpellTemplate } from '../../../../types/game';
import type { CorpusCase } from '../types';

export const homingStraightRangeShortCase: CorpusCase = {
  id: '22-homing-straight-range-short',
  description: 'Homing bolt with spell range 3 cannot reach enemy at distance 7; deactivates without hitting',
  setup: () => {
    clearAllRegistries();

    registerTestSpell('short-range-homing', {
      id: 'short-range-homing',
      name: 'Short Range Homing Bolt',
      description: 'LINEAR homing, range 3, speed 4',
      thumbnailIcon: '',
      templateType: SpellTemplate.LINEAR,
      directionMode: 'current_facing',
      damage: 3,
      range: 3,
      projectileSpeed: 4,
      sprites: {},
    });

    registerTestCharacter(
      createTestCharacterDef({
        id: 'hero-caster',
        health: 10,
        behavior: [
          {
            type: ActionType.SPELL,
            spellId: 'short-range-homing',
            autoTargetNearestEnemy: true,
            homing: true,
            homingPathStyle: 'straight',
          },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
        ],
      })
    );
    registerTestEnemy(createTestEnemyDef({ id: 'goblin-weak', health: 3 }));

    return createTestGameState({
      puzzle: createTestPuzzle({
        width: 10,
        height: 3,
        enemies: [createTestEnemy({ enemyId: 'goblin-weak', x: 7, y: 0, currentHealth: 3 })],
        availableCharacters: ['hero-caster'],
        winConditions: [{ type: 'defeat_all_enemies' }],
      }),
      gameStatus: 'setup',
    });
  },
  placements: [{ characterId: 'hero-caster', x: 0, y: 0, facing: Direction.EAST }],
  maxTurns: 8,
};
