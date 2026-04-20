/**
 * Case 11: fast homing projectile vs. moving target.
 *
 * Contrast to case 10. Same moving enemy, but a fast homing bolt
 * (speed 4) that's expected to hit before the target can move far.
 * Fast homing has historically been stable; this locks in the working
 * baseline so refactor regressions get caught.
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

export const homingFastMovingTargetCase: CorpusCase = {
  id: '11-homing-fast-moving-target',
  description: 'Fast homing bolt (speed 4) hits enemy moving south — stable fast-homing baseline',
  setup: () => {
    clearAllRegistries();

    registerTestSpell('fast-homing-bolt', {
      id: 'fast-homing-bolt',
      name: 'Fast Homing Bolt',
      description: 'LINEAR projectile, speed 4, homing',
      thumbnailIcon: '',
      templateType: SpellTemplate.LINEAR,
      directionMode: 'current_facing',
      damage: 3,
      range: 10,
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
            spellId: 'fast-homing-bolt',
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

    registerTestEnemy(
      createTestEnemyDef({
        id: 'goblin-walker',
        health: 3,
        behavior: {
          type: 'active',
          pattern: [
            { type: ActionType.MOVE_FORWARD },
            { type: ActionType.MOVE_FORWARD },
            { type: ActionType.MOVE_FORWARD },
          ],
          defaultFacing: Direction.SOUTH,
        },
      })
    );

    return createTestGameState({
      puzzle: createTestPuzzle({
        width: 8,
        height: 8,
        enemies: [
          createTestEnemy({
            enemyId: 'goblin-walker',
            x: 4,
            y: 0,
            currentHealth: 3,
            facing: Direction.SOUTH,
            actionIndex: 0,
            active: true,
          }),
        ],
        availableCharacters: ['hero-caster'],
        winConditions: [{ type: 'defeat_all_enemies' }],
      }),
      gameStatus: 'setup',
    });
  },
  placements: [{ characterId: 'hero-caster', x: 0, y: 0, facing: Direction.EAST }],
  maxTurns: 10,
};
