/**
 * Case 06: homing projectile, straight-line visual, fast speed.
 *
 * Hero casts a LINEAR spell with auto-target-nearest-enemy + homing
 * enabled. Enemy is placed diagonally (3 east, 1 south) so the bolt has
 * to track to a non-inline target — if homing were misconfigured and
 * fell back to `current_facing`, the bolt would fly past and miss.
 *
 * `homingPathStyle: 'straight'` exercises the straight-line interpolation
 * code path — the one the Phase C retrospective flagged as fragile for
 * slow projectiles (case 09 covers the slow variant).
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

export const homingStraightFastCase: CorpusCase = {
  id: '06-homing-straight-fast',
  description: 'Fast homing bolt (straight path style) tracks diagonal enemy and hits',
  setup: () => {
    clearAllRegistries();

    registerTestSpell('homing-bolt', {
      id: 'homing-bolt',
      name: 'Homing Bolt',
      description: 'LINEAR projectile with homing',
      thumbnailIcon: '',
      templateType: SpellTemplate.LINEAR,
      directionMode: 'current_facing',
      damage: 3,
      range: 6,
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
            spellId: 'homing-bolt',
            autoTargetNearestEnemy: true,
            homing: true,
            homingPathStyle: 'straight',
          },
        ],
      })
    );
    registerTestEnemy(createTestEnemyDef({ id: 'goblin-weak', health: 3 }));

    return createTestGameState({
      puzzle: createTestPuzzle({
        width: 8,
        height: 5,
        enemies: [createTestEnemy({ enemyId: 'goblin-weak', x: 3, y: 1, currentHealth: 3 })],
        availableCharacters: ['hero-caster'],
        winConditions: [{ type: 'defeat_all_enemies' }],
      }),
      gameStatus: 'setup',
    });
  },
  placements: [{ characterId: 'hero-caster', x: 0, y: 0, facing: Direction.EAST }],
  maxTurns: 10,
};
