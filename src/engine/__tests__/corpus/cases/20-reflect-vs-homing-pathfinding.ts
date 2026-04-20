/**
 * Case 20: Reflect vs. homing (pathfinding path style) bolt, with wall.
 *
 * Most complex projectile interaction in the corpus: homing bolt routes
 * around a wall via BFS pathfinding, reaches the reflecting enemy, bounces
 * back, and (currently per bug in case 13) freezes. Locks in the full
 * chain so any phase touching this combination produces a visible diff.
 */
import {
  clearAllRegistries,
  registerTestCharacter,
  registerTestEnemy,
  registerTestSpell,
  registerTestStatusEffect,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestPuzzle,
  createTestEnemy,
  createTestGameState,
  createEmptyGrid,
  setTile,
} from '../../helpers';
import { Direction, ActionType, SpellTemplate, StatusEffectType, TileType } from '../../../../types/game';
import type { CorpusCase } from '../types';

export const reflectVsHomingPathfindingCase: CorpusCase = {
  id: '20-reflect-vs-homing-pathfinding',
  description: 'Homing bolt (pathfinding) routes around wall, hits reflecting enemy, locks in reflected-homing behavior',
  setup: () => {
    clearAllRegistries();

    registerTestStatusEffect('reflect-status', {
      id: 'reflect-status',
      name: 'Reflect',
      type: StatusEffectType.REFLECT,
      defaultDuration: 5,
      stackingBehavior: 'refresh',
      sprites: {},
    });

    registerTestSpell('pf-homing-bolt', {
      id: 'pf-homing-bolt',
      name: 'Pathfinding Homing Bolt',
      description: 'LINEAR homing, pathfinding, respects walls',
      thumbnailIcon: '',
      templateType: SpellTemplate.LINEAR,
      directionMode: 'current_facing',
      damage: 3,
      range: 12,
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
        ],
      })
    );
    registerTestEnemy(createTestEnemyDef({ id: 'goblin-reflector', health: 10 }));

    const tiles = createEmptyGrid(6, 4);
    setTile(tiles, 2, 0, TileType.WALL);

    return createTestGameState({
      puzzle: createTestPuzzle({
        width: 6,
        height: 4,
        tiles,
        enemies: [
          createTestEnemy({
            enemyId: 'goblin-reflector',
            x: 4,
            y: 0,
            currentHealth: 10,
            facing: Direction.WEST,
            statusEffects: [
              {
                id: 'reflect-instance-1',
                type: StatusEffectType.REFLECT,
                statusAssetId: 'reflect-status',
                duration: 5,
                currentStacks: 1,
                appliedOnTurn: 0,
                sourceEntityId: 'initial',
                sourceIsEnemy: false,
                movementSkipCounter: 0,
              },
            ],
          }),
        ],
        availableCharacters: ['hero-caster'],
        winConditions: [{ type: 'defeat_all_enemies' }],
        maxTurns: 8,
      }),
      gameStatus: 'setup',
    });
  },
  placements: [{ characterId: 'hero-caster', x: 0, y: 0, facing: Direction.EAST }],
  maxTurns: 10,
};
