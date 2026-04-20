/**
 * Case 12: Reflect status on enemy vs. non-homing LINEAR bolt.
 *
 * Phase D directly targets the reflect-triad of bridge flags
 * (`reflectAtTileIndex`, `pendingReflectVfx`, `visualPastReflectPoint`).
 * This case locks in current reflect behavior so that consolidation doesn't
 * change observable outcomes.
 *
 * Setup: hero at (0,0) east, enemy at (3,0) with Reflect status active.
 * Hero fires non-homing LINEAR bolt (speed 4). Bolt reaches enemy,
 * reflects, travels back, hits hero.
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

export const reflectVsNonHomingCase: CorpusCase = {
  id: '12-reflect-vs-non-homing',
  description: 'Enemy with Reflect status bounces non-homing bolt back at hero',
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

    registerTestSpell('fast-bolt', {
      id: 'fast-bolt',
      name: 'Fast Bolt',
      description: 'LINEAR projectile',
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
          { type: ActionType.SPELL, spellId: 'fast-bolt' },
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
        height: 3,
        enemies: [
          createTestEnemy({
            enemyId: 'goblin-reflector',
            x: 3,
            y: 0,
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
        maxTurns: 5,
      }),
      gameStatus: 'setup',
    });
  },
  placements: [{ characterId: 'hero-caster', x: 0, y: 0, facing: Direction.EAST }],
  maxTurns: 10,
};
