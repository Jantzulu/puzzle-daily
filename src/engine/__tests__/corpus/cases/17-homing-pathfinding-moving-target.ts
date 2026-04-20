/**
 * Case 17: Homing pathfinding-path-style vs. moving target around a wall.
 *
 * Completes the coverage matrix: [straight / grid / pathfinding] ×
 * [stationary / moving]. Pathfinding + moving target is the gnarliest
 * combination — the BFS may need to replan when the target moves.
 *
 * Layout: hero (0,0) east, wall at (2,0), enemy walking south from (4,0).
 * Bolt must route around wall AND re-target as enemy moves.
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

export const homingPathfindingMovingTargetCase: CorpusCase = {
  id: '17-homing-pathfinding-moving-target',
  description: 'Pathfinding homing bolt routes around wall while tracking moving enemy',
  setup: () => {
    clearAllRegistries();

    registerTestSpell('pf-homing-bolt', {
      id: 'pf-homing-bolt',
      name: 'Pathfinding Homing Bolt',
      description: 'LINEAR projectile, pathfinding homing',
      thumbnailIcon: '',
      templateType: SpellTemplate.LINEAR,
      directionMode: 'current_facing',
      damage: 3,
      range: 15,
      projectileSpeed: 2,
      sprites: {},
    });

    registerTestCharacter(
      createTestCharacterDef({
        id: 'hero-caster',
        health: 10,
        behavior: [
          {
            type: ActionType.SPELL,
            spellId: 'pf-homing-bolt',
            autoTargetNearestEnemy: true,
            homing: true,
            homingPathStyle: 'pathfinding',
            homingIgnoreWalls: false,
          },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
        ],
      })
    );
    registerTestEnemy(
      createTestEnemyDef({
        id: 'goblin-walker',
        health: 3,
        behavior: {
          type: 'active',
          pattern: [
            { type: ActionType.MOVE_FORWARD },
            { type: ActionType.MOVE_FORWARD },
            { type: ActionType.MOVE_FORWARD },
            { type: ActionType.MOVE_FORWARD },
          ],
          defaultFacing: Direction.SOUTH,
        },
      })
    );

    const tiles = createEmptyGrid(6, 6);
    setTile(tiles, 2, 0, TileType.WALL);

    return createTestGameState({
      puzzle: createTestPuzzle({
        width: 6,
        height: 6,
        tiles,
        enemies: [
          createTestEnemy({
            enemyId: 'goblin-walker',
            x: 4,
            y: 0,
            currentHealth: 3,
            facing: Direction.SOUTH,
            actionIndex: 0,
            active: true,
          }),
        ],
        availableCharacters: ['hero-caster'],
        winConditions: [{ type: 'defeat_all_enemies' }],
      }),
      gameStatus: 'setup',
    });
  },
  placements: [{ characterId: 'hero-caster', x: 0, y: 0, facing: Direction.EAST }],
  maxTurns: 15,
};
