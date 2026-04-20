/**
 * Case 14: LINEAR bolt bounces off walls.
 *
 * `bounceOffWalls: true` with `bounceBehavior: 'reflect'` on the spell
 * asset. Bolt fires east, hits wall, bounces west toward the enemy.
 * Exercises bounce path through resolveProjectiles / updateProjectilesHeadless.
 *
 * Layout: hero (0,0) east, wall (4,0), enemy (1,1)? no — to test bounce
 * we want the bolt to bounce off the east wall and hit something on its
 * way back. Simpler: bolt fires east, hits east wall at (5,0), bounces
 * back west, hits nothing (no enemy for the bounced bolt) — but the
 * logical bookkeeping (bounceCount, direction change) is what the golden
 * captures. Enemy placed at (2,0) so the bolt hits it on the outbound
 * leg, but pierceEnemies is false so enemy dies on the way out and
 * the bolt continues to the wall? Actually non-piercing bolts stop at
 * first hit. Revised: bolt bounces before hitting enemy.
 *
 * Final layout: hero (0,0) east, wall (3,0), enemy (1,0) BEHIND the hero
 * — bolt goes east, hits wall, bounces back west, kills enemy at... wait,
 * bolt starts at hero (0,0), enemy at (1,0) is immediately east. Need to
 * put enemy west of hero? But then hero's facing east wouldn't hit it on
 * the outbound leg either. Actually just test: hero at (2,0) east, wall
 * at (5,0), enemy at (0,0) (behind hero). Bolt east → wall at x=5, bounce
 * west → travels back past hero to x=0, hits enemy.
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
  createEmptyGrid,
  setTile,
} from '../../helpers';
import { Direction, ActionType, SpellTemplate, TileType } from '../../../../types/game';
import type { CorpusCase } from '../types';

export const linearBounceWallsCase: CorpusCase = {
  id: '14-linear-bounce-walls',
  description: 'LINEAR bolt bounces off wall (reflect behavior), travels back, hits enemy',
  setup: () => {
    clearAllRegistries();

    registerTestSpell('bouncy-bolt', {
      id: 'bouncy-bolt',
      name: 'Bouncy Bolt',
      description: 'LINEAR projectile with wall bounce',
      thumbnailIcon: '',
      templateType: SpellTemplate.LINEAR,
      directionMode: 'current_facing',
      damage: 3,
      range: 10,
      projectileSpeed: 4,
      bounceOffWalls: true,
      maxBounces: 2,
      bounceBehavior: 'reflect',
      sprites: {},
    });

    registerTestCharacter(
      createTestCharacterDef({
        id: 'hero-caster',
        health: 10,
        behavior: [
          { type: ActionType.SPELL, spellId: 'bouncy-bolt' },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
        ],
      })
    );
    registerTestEnemy(createTestEnemyDef({ id: 'goblin-weak', health: 3 }));

    const tiles = createEmptyGrid(7, 3);
    setTile(tiles, 5, 0, TileType.WALL);

    return createTestGameState({
      puzzle: createTestPuzzle({
        width: 7,
        height: 3,
        tiles,
        enemies: [createTestEnemy({ enemyId: 'goblin-weak', x: 0, y: 0, currentHealth: 3 })],
        availableCharacters: ['hero-caster'],
        winConditions: [{ type: 'defeat_all_enemies' }],
        maxTurns: 8,
      }),
      gameStatus: 'setup',
    });
  },
  placements: [{ characterId: 'hero-caster', x: 2, y: 0, facing: Direction.EAST }],
  maxTurns: 10,
};
