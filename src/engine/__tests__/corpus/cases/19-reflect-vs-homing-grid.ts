/**
 * Case 19: Reflect vs. homing (grid path style) bolt.
 *
 * Companion to case 13 (straight path) and case 20 (pathfinding path).
 * Fills in the Reflect × homing-path-style coverage matrix.
 *
 * Known bug from case 13: reflected homing bolts freeze after
 * reflection and don't damage the caster. This case locks in whatever
 * grid-path-style reflect does today — different visual paths may hit
 * the same or different logical outcome.
 */
import {
  clearAllRegistries,
  registerTestCharacter,
  registerTestEnemy,
  registerTestSpell,
  registerTestStatusEffect,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestPuzzle,
  createTestEnemy,
  createTestGameState,
} from '../../helpers';
import { Direction, ActionType, SpellTemplate, StatusEffectType } from '../../../../types/game';
import type { CorpusCase } from '../types';

export const reflectVsHomingGridCase: CorpusCase = {
  id: '19-reflect-vs-homing-grid',
  description: 'Enemy with Reflect bounces homing bolt (grid path) — locks in current behavior',
  setup: () => {
    clearAllRegistries();

    registerTestStatusEffect('reflect-status', {
      id: 'reflect-status',
      name: 'Reflect',
      type: StatusEffectType.REFLECT,
      defaultDuration: 5,
      stackingBehavior: 'refresh',
      sprites: {},
    });

    registerTestSpell('grid-homing-bolt', {
      id: 'grid-homing-bolt',
      name: 'Grid Homing Bolt',
      description: 'LINEAR homing projectile, grid path',
      thumbnailIcon: '',
      templateType: SpellTemplate.LINEAR,
      directionMode: 'current_facing',
      damage: 3,
      range: 8,
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
            spellId: 'grid-homing-bolt',
            autoTargetNearestEnemy: true,
            homing: true,
            homingPathStyle: 'grid',
          },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
        ],
      })
    );
    registerTestEnemy(createTestEnemyDef({ id: 'goblin-reflector', health: 10 }));

    return createTestGameState({
      puzzle: createTestPuzzle({
        width: 8,
        height: 5,
        enemies: [
          createTestEnemy({
            enemyId: 'goblin-reflector',
            x: 3,
            y: 1,
            currentHealth: 10,
            facing: Direction.WEST,
            statusEffects: [
              {
                id: 'reflect-instance-1',
                type: StatusEffectType.REFLECT,
                statusAssetId: 'reflect-status',
                duration: 5,
                currentStacks: 1,
                appliedOnTurn: 0,
                sourceEntityId: 'initial',
                sourceIsEnemy: false,
                movementSkipCounter: 0,
              },
            ],
          }),
        ],
        availableCharacters: ['hero-caster'],
        winConditions: [{ type: 'defeat_all_enemies' }],
        maxTurns: 6,
      }),
      gameStatus: 'setup',
    });
  },
  placements: [{ characterId: 'hero-caster', x: 0, y: 0, facing: Direction.EAST }],
  maxTurns: 10,
};
