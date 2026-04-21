/**
 * Case 22: homing bolt with SPELL RANGE SHORTER than target distance.
 *
 * Regression test for the "homing trigger range bypasses spell range" bug
 * (CLAUDE_HANDOFF.md → "Fix: homing trigger range bypasses spell range +
 * projectile visuals disappear"). Root cause: straight-line homing re-anchors
 * `homingVisualStartX/Y` to the current logical position each turn as a
 * visual-interpolation tweak for slow projectiles, but `resolveProjectiles`'
 * homing range check was measuring `totalDistanceTraveled` from that same
 * anchor — so after turn 1, the measured distance is always 0 and the range
 * gate never fires.
 *
 * Hero at (0,0), enemy at (7,0). Spell range is 3 (max). The bolt cannot
 * possibly reach the enemy. Expected: bolt deactivates after exhausting
 * its range (takes 1 turn at speed=4 to hit range), enemy's HP stays full.
 *
 * Before the fix: the bolt flies indefinitely and hits the enemy on turn 2.
 * After the fix: the bolt deactivates, enemy HP = 3 at game end.
 *
 * The hero uses auto-targeting with no explicit autoTargetRange (0 =
 * unlimited) to mirror the real-world scenario — trigger fires on an enemy
 * outside the spell's range, spell acquires it as a homing target, then
 * relies on `resolveProjectiles` to terminate the flight.
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
