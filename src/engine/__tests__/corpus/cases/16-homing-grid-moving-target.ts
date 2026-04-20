/**
 * Case 16: Homing grid-path-style vs. moving target.
 *
 * Companion to case 10 (straight) and case 17 (pathfinding). Locks in
 * the grid homing path code — fills in the coverage matrix of
 * [straight / grid / pathfinding] × [stationary / moving target].
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

export const homingGridMovingTargetCase: CorpusCase = {
  id: '16-homing-grid-moving-target',
  description: 'Homing bolt (grid path) chases enemy moving south',
  setup: () => {
    clearAllRegistries();

    registerTestSpell('grid-homing-bolt', {
      id: 'grid-homing-bolt',
      name: 'Grid Homing Bolt',
      description: 'LINEAR projectile, grid path homing',
      thumbnailIcon: '',
      templateType: SpellTemplate.LINEAR,
      directionMode: 'current_facing',
      damage: 3,
      range: 10,
      projectileSpeed: 2,
      sprites: {},
    });

    registerTestCharacter(
      createTestCharacterDef({
        id: 'hero-caster',
        health: 10,
        behavior: [
          {
            type: ActionType.SPELL,
            spellId: 'grid-homing-bolt',
            autoTargetNearestEnemy: true,
            homing: true,
            homingPathStyle: 'grid',
          },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
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
            { type: ActionType.MOVE_FORWARD },
          ],
          defaultFacing: Direction.SOUTH,
        },
      })
    );

    return createTestGameState({
      puzzle: createTestPuzzle({
        width: 8,
        height: 7,
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
  maxTurns: 15,
};
