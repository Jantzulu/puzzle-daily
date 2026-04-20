/**
 * Case 02: simple LINEAR projectile, fast speed.
 *
 * Hero casts a LINEAR-template spell at an enemy 3 tiles east. Projectile
 * speed 4 (tiles/turn) means it traverses its 3-tile range and resolves on
 * the cast turn. Purpose: prove the harness handles the projectile spawn +
 * resolve path and produces stable snapshots of logical projectile state.
 *
 * This is the simplest case that actually exercises a `Projectile` object
 * — the whole motivation for the corpus is to protect the projectile system
 * during Phase C/D/E refactoring.
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

export const linearProjectileFastCase: CorpusCase = {
  id: '02-linear-projectile-fast',
  description: 'Hero casts fast LINEAR bolt, hits enemy 3 tiles east same turn',
  setup: () => {
    clearAllRegistries();

    registerTestSpell('fast-bolt', {
      id: 'fast-bolt',
      name: 'Fast Bolt',
      description: 'Basic LINEAR projectile',
      thumbnailIcon: '',
      templateType: SpellTemplate.LINEAR,
      directionMode: 'current_facing',
      damage: 3,
      range: 3,
      projectileSpeed: 4,
      sprites: {},
    });

    registerTestCharacter(
      createTestCharacterDef({
        id: 'hero-caster',
        health: 10,
        behavior: [{ type: ActionType.SPELL, spellId: 'fast-bolt' }],
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
