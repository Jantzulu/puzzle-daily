/**
 * Case 05: slow LINEAR bolt, multi-turn happy path.
 *
 * Companion to case 03. Case 03 reproduces the "engine defeats before slow
 * bolt lands" bug (hero has only a SPELL action, goes inactive on turn 2,
 * engine calls defeat mid-flight). This case adds WAIT actions so the hero
 * stays active long enough for the bolt to finish its arc — exercising the
 * multi-turn traversal happy path that the projectile refactor phases need
 * to protect.
 *
 * When the case-03 defeat bug is fixed, case 03 will start ending in
 * victory too — at which point case 05 can be dropped if redundant.
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

export const linearProjectileSlowLandsCase: CorpusCase = {
  id: '05-linear-projectile-slow-lands',
  description: 'Slow LINEAR bolt (speed 1) lands on turn 3 while hero WAITs; enemy dies, victory',
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
        behavior: [
          { type: ActionType.SPELL, spellId: 'slow-bolt' },
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
