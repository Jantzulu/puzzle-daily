/**
 * Case 10: slow homing projectile vs. moving target.
 *
 * The specific scenario CLAUDE_HANDOFF.md flags as "slow homing
 * projectiles do not smoothly track moving targets." Visual tracking
 * fragility aside, the logical outcome should still be a guaranteed
 * hit (homing definition: "If true with auto-targeting, projectile
 * tracks target and guarantees hit").
 *
 * Setup: enemy moves south one tile per turn. Slow homing bolt (speed 1)
 * chases. Hero has WAITs to stay active long enough for the chase to
 * resolve.
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

export const homingSlowMovingTargetCase: CorpusCase = {
  id: '10-homing-slow-moving-target',
  description: 'Slow homing bolt (speed 1) chases enemy moving south each turn',
  setup: () => {
    clearAllRegistries();

    registerTestSpell('slow-homing-bolt', {
      id: 'slow-homing-bolt',
      name: 'Slow Homing Bolt',
      description: 'LINEAR projectile, speed 1, homing',
      thumbnailIcon: '',
      templateType: SpellTemplate.LINEAR,
      directionMode: 'current_facing',
      damage: 3,
      range: 10,
      projectileSpeed: 1,
      sprites: {},
    });

    registerTestCharacter(
      createTestCharacterDef({
        id: 'hero-caster',
        health: 10,
        behavior: [
          {
            type: ActionType.SPELL,
            spellId: 'slow-homing-bolt',
            autoTargetNearestEnemy: true,
            homing: true,
            homingPathStyle: 'straight',
          },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
        ],
      })
    );

    // Enemy walks south every turn (moves away from hero's east-facing
    // shot trajectory, forcing homing to re-target continuously).
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
  maxTurns: 15,
};
