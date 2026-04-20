/**
 * Case 04: LINEAR projectile blocked by wall.
 *
 * Hero casts a fast LINEAR bolt eastward. A wall tile at (2,0) blocks
 * line-of-fire before the bolt can reach an enemy at (4,0). Purpose:
 * exercise the wall-collision/early-termination branch in both
 * resolveProjectiles (real) and updateProjectilesHeadless (solver).
 *
 * The enemy is unreachable so the game ends in defeat when the puzzle's
 * maxTurns cap (set to 3 for a compact golden) is exceeded.
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

export const linearProjectileWallCase: CorpusCase = {
  id: '04-linear-projectile-wall',
  description: 'Fast LINEAR bolt hits wall before reaching enemy, puzzle ends in defeat',
  setup: () => {
    clearAllRegistries();

    registerTestSpell('fast-bolt', {
      id: 'fast-bolt',
      name: 'Fast Bolt',
      description: 'LINEAR projectile, speed 4',
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
        id: 'hero-caster',
        health: 10,
        behavior: [{ type: ActionType.SPELL, spellId: 'fast-bolt' }],
      })
    );
    registerTestEnemy(createTestEnemyDef({ id: 'goblin-weak', health: 3 }));

    const tiles = createEmptyGrid(6, 3);
    setTile(tiles, 2, 0, TileType.WALL);

    return createTestGameState({
      puzzle: createTestPuzzle({
        width: 6,
        height: 3,
        tiles,
        enemies: [createTestEnemy({ enemyId: 'goblin-weak', x: 4, y: 0, currentHealth: 3 })],
        availableCharacters: ['hero-caster'],
        winConditions: [{ type: 'defeat_all_enemies' }],
        maxTurns: 3,
      }),
      gameStatus: 'setup',
    });
  },
  placements: [{ characterId: 'hero-caster', x: 0, y: 0, facing: Direction.EAST }],
  maxTurns: 10,
};
