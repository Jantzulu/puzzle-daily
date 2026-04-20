/**
 * Case 15: Piercing LINEAR bolt through multiple enemies (SAME enemyId).
 *
 * Real-world usage: puzzles commonly place multiple instances of the same
 * enemy type on the board. This case uses two enemies that share the
 * `enemyId: 'goblin-weak'` to exercise pierce in the realistic scenario.
 *
 * KNOWN BUG: pierce currently only hits the first enemy when multiple
 * enemies share an enemyId. See case 18 for the distinct-id variant
 * where pierce works correctly. The bug is flagged in a separate task.
 * This golden locks in the current (buggy) behavior so the fix PR shows
 * a clear diff.
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

export const linearPierceMultipleCase: CorpusCase = {
  id: '15-linear-pierce-multiple',
  description: 'Piercing LINEAR bolt hits both enemies in a line',
  setup: () => {
    clearAllRegistries();

    registerTestSpell('pierce-bolt', {
      id: 'pierce-bolt',
      name: 'Pierce Bolt',
      description: 'LINEAR projectile, pierces enemies',
      thumbnailIcon: '',
      templateType: SpellTemplate.LINEAR,
      directionMode: 'current_facing',
      damage: 3,
      range: 6,
      projectileSpeed: 4,
      pierceEnemies: true,
      sprites: {},
    });

    registerTestCharacter(
      createTestCharacterDef({
        id: 'hero-caster',
        health: 10,
        behavior: [
          { type: ActionType.SPELL, spellId: 'pierce-bolt' },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
        ],
      })
    );
    registerTestEnemy(createTestEnemyDef({ id: 'goblin-weak', health: 3 }));

    return createTestGameState({
      puzzle: createTestPuzzle({
        width: 8,
        height: 3,
        // Two enemies in the line of fire, east of the hero.
        enemies: [
          createTestEnemy({ enemyId: 'goblin-weak', x: 2, y: 0, currentHealth: 3 }),
          createTestEnemy({ enemyId: 'goblin-weak', x: 4, y: 0, currentHealth: 3 }),
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
