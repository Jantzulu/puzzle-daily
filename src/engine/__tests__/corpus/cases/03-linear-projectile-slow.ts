/**
 * Case 03: slow LINEAR projectile, multi-turn traversal.
 *
 * Hero casts a LINEAR-template spell with projectileSpeed=1 at an enemy 3
 * tiles east. Bolt advances one tile per turn (via resolveProjectiles at
 * turn boundaries), reaching the enemy on turn 3. Purpose: exercise
 * `logicalTileIndex` advancing across multiple turn boundaries — the
 * projectile code path most affected by the upcoming refactor phases.
 *
 * Hero deactivates on turn 2 (only one behavior action, no repeat), which
 * exercises the "projectile outlives its caster's active state" scenario.
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

export const linearProjectileSlowCase: CorpusCase = {
  id: '03-linear-projectile-slow',
  description: 'Slow LINEAR bolt (speed 1) traverses 3 tiles across 3 turns, hits enemy',
  setup: () => {
    clearAllRegistries();

    registerTestSpell('slow-bolt', {
      id: 'slow-bolt',
      name: 'Slow Bolt',
      description: 'LINEAR projectile, speed 1',
      thumbnailIcon: '',
      templateType: SpellTemplate.LINEAR,
      directionMode: 'current_facing',
      damage: 3,
      range: 3,
      projectileSpeed: 1,
      sprites: {},
    });

    registerTestCharacter(
      createTestCharacterDef({
        id: 'hero-caster',
        health: 10,
        behavior: [{ type: ActionType.SPELL, spellId: 'slow-bolt' }],
      })
    );
    registerTestEnemy(createTestEnemyDef({ id: 'goblin-weak', health: 3 }));

    return createTestGameState({
      puzzle: createTestPuzzle({
        width: 8,
        height: 5,
        enemies: [createTestEnemy({ enemyId: 'goblin-weak', x: 3, y: 0, currentHealth: 3 })],
        availableCharacters: ['hero-caster'],
        winConditions: [{ type: 'defeat_all_enemies' }],
      }),
      gameStatus: 'setup',
    });
  },
  placements: [{ characterId: 'hero-caster', x: 0, y: 0, facing: Direction.EAST }],
  maxTurns: 10,
};
