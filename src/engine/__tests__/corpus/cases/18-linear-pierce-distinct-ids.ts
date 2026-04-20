/**
 * Case 18: Piercing LINEAR bolt through two DISTINCT enemy types.
 *
 * Counterpart to case 15. Same setup but two enemies have different
 * `enemyId`s. Pierce currently works correctly in this case and kills
 * both enemies on turn 1. This golden locks in the working pierce
 * code path — so when the same-id bug (case 15) is fixed, we can
 * confirm this path didn't regress.
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

export const linearPierceDistinctIdsCase: CorpusCase = {
  id: '18-linear-pierce-distinct-ids',
  description: 'Piercing bolt hits both enemies when they have distinct enemyIds',
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
    registerTestEnemy(createTestEnemyDef({ id: 'goblin-front', health: 3 }));
    registerTestEnemy(createTestEnemyDef({ id: 'goblin-back', health: 3 }));

    return createTestGameState({
      puzzle: createTestPuzzle({
        width: 8,
        height: 3,
        enemies: [
          createTestEnemy({ enemyId: 'goblin-front', x: 2, y: 0, currentHealth: 3 }),
          createTestEnemy({ enemyId: 'goblin-back', x: 4, y: 0, currentHealth: 3 }),
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
