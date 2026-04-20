/**
 * Case 13: Reflect vs. homing (straight-path-style) bolt.
 *
 * Companion to case 12 but with homing enabled. Phase C retro flagged
 * that `reflectProjectile` clears the straight-line visual anchors on
 * reflection so the reflected bolt uses tile-by-tile animation. This
 * case locks in the logical outcome of that sequence: bolt homes to
 * enemy, reflects, tracks back to caster (who is now the target).
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

export const reflectVsHomingStraightCase: CorpusCase = {
  id: '13-reflect-vs-homing-straight',
  description: 'Enemy with Reflect status bounces homing bolt (straight path) back at hero',
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

    registerTestSpell('homing-bolt', {
      id: 'homing-bolt',
      name: 'Homing Bolt',
      description: 'LINEAR homing projectile',
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
            spellId: 'homing-bolt',
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
