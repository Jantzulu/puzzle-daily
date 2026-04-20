/**
 * Case 08: homing projectile, pathfinding path style, routes around wall.
 *
 * Hero fires a homing bolt with `homingPathStyle: 'pathfinding'` and
 * `homingIgnoreWalls: false`, so the BFS pathfinder has to navigate
 * around a wall between caster and target. This is the code path fixed
 * in commit 6f3144c (see CLAUDE_HANDOFF.md) — worth locking in.
 *
 * Layout: hero at (0,0), wall at (2,0), enemy at (4,0). Direct line-of-
 * sight is blocked. Pathfinder routes the bolt through y=1 row to reach
 * the target.
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

export const homingPathfindingWallCase: CorpusCase = {
  id: '08-homing-pathfinding-wall',
  description: 'Homing bolt (pathfinding) routes around wall to hit enemy',
  setup: () => {
    clearAllRegistries();

    registerTestSpell('homing-bolt-pf', {
      id: 'homing-bolt-pf',
      name: 'Homing Bolt (Pathfinding)',
      description: 'LINEAR projectile, pathfinding homing, respects walls',
      thumbnailIcon: '',
      templateType: SpellTemplate.LINEAR,
      directionMode: 'current_facing',
      damage: 3,
      range: 10,
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
            spellId: 'homing-bolt-pf',
            autoTargetNearestEnemy: true,
            homing: true,
            homingPathStyle: 'pathfinding',
            homingIgnoreWalls: false,
          },
        ],
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
      }),
      gameStatus: 'setup',
    });
  },
  placements: [{ characterId: 'hero-caster', x: 0, y: 0, facing: Direction.EAST }],
  maxTurns: 10,
};
