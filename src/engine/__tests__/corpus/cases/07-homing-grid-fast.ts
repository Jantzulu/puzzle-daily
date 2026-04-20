/**
 * Case 07: homing projectile, grid visual path, fast speed.
 *
 * Same setup as case 06 but with `homingPathStyle: 'grid'` — the bolt
 * follows a tile-by-tile grid path rather than a straight diagonal
 * interpolation. Exercises `updateGridHomingVisual` / tile-based homing
 * code path (separate from straight-line in Phase B's extraction).
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

export const homingGridFastCase: CorpusCase = {
  id: '07-homing-grid-fast',
  description: 'Fast homing bolt (grid path style) tile-tracks diagonal enemy and hits',
  setup: () => {
    clearAllRegistries();

    registerTestSpell('homing-bolt-grid', {
      id: 'homing-bolt-grid',
      name: 'Homing Bolt (Grid)',
      description: 'LINEAR projectile, grid-path homing',
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
          {
            type: ActionType.SPELL,
            spellId: 'homing-bolt-grid',
            autoTargetNearestEnemy: true,
            homing: true,
            homingPathStyle: 'grid',
          },
        ],
      })
    );
    registerTestEnemy(createTestEnemyDef({ id: 'goblin-weak', health: 3 }));

    return createTestGameState({
      puzzle: createTestPuzzle({
        width: 8,
        height: 5,
        enemies: [createTestEnemy({ enemyId: 'goblin-weak', x: 3, y: 1, currentHealth: 3 })],
        availableCharacters: ['hero-caster'],
        winConditions: [{ type: 'defeat_all_enemies' }],
      }),
      gameStatus: 'setup',
    });
  },
  placements: [{ characterId: 'hero-caster', x: 0, y: 0, facing: Direction.EAST }],
  maxTurns: 10,
};
