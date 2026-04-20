/**
 * Case 21: Two heroes cast simultaneously, two projectiles coexist.
 *
 * Real-world scenario: multi-hero puzzles where more than one projectile
 * is live at the same time. Locks in the engine's handling of multiple
 * entries in `activeProjectiles[]` — projectile array management, ID
 * uniqueness, and independent collision resolution.
 *
 * Setup: hero A at (0,0) east, hero B at (0,2) east, each fires a fast
 * LINEAR bolt. Enemy A at (3,0), enemy B at (3,2). Both projectiles
 * spawn and resolve on turn 1.
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

export const twoHeroesSimultaneousCastCase: CorpusCase = {
  id: '21-two-heroes-simultaneous-cast',
  description: 'Two heroes fire LINEAR bolts on the same turn; both projectiles coexist and resolve',
  setup: () => {
    clearAllRegistries();

    registerTestSpell('fast-bolt', {
      id: 'fast-bolt',
      name: 'Fast Bolt',
      description: 'LINEAR projectile',
      thumbnailIcon: '',
      templateType: SpellTemplate.LINEAR,
      directionMode: 'current_facing',
      damage: 3,
      range: 5,
      projectileSpeed: 4,
      sprites: {},
    });

    registerTestCharacter(
      createTestCharacterDef({
        id: 'hero-a',
        health: 10,
        behavior: [{ type: ActionType.SPELL, spellId: 'fast-bolt' }],
      })
    );
    registerTestCharacter(
      createTestCharacterDef({
        id: 'hero-b',
        health: 10,
        behavior: [{ type: ActionType.SPELL, spellId: 'fast-bolt' }],
      })
    );
    registerTestEnemy(createTestEnemyDef({ id: 'goblin-weak', health: 3 }));

    return createTestGameState({
      puzzle: createTestPuzzle({
        width: 6,
        height: 3,
        enemies: [
          createTestEnemy({ enemyId: 'goblin-weak', x: 3, y: 0, currentHealth: 3 }),
          createTestEnemy({ enemyId: 'goblin-weak', x: 3, y: 2, currentHealth: 3 }),
        ],
        availableCharacters: ['hero-a', 'hero-b'],
        maxCharacters: 2,
        winConditions: [{ type: 'defeat_all_enemies' }],
      }),
      gameStatus: 'setup',
    });
  },
  placements: [
    { characterId: 'hero-a', x: 0, y: 0, facing: Direction.EAST },
    { characterId: 'hero-b', x: 0, y: 2, facing: Direction.EAST },
  ],
  maxTurns: 10,
};
