/**
 * Mid-flight homing_move events carry the tiles the bolt actually flew that
 * turn, so replay can play them back instead of re-deriving them.
 *
 * Why replay can't re-derive: the live pathfinder searches toward the
 * TARGET and keeps the first `speed` tiles; a fresh search to that turn's
 * end tile can pick a different, equally short route (findPathBFS biases
 * toward whatever it's aiming at). In the layout below the bolt flies
 * (1,0) → (2,0) → (3,1) on its first turn, while BFS (1,0) → (3,1) on its
 * own goes through (2,1).
 */
import './helpers';
import { describe, it, expect, beforeEach } from 'vitest';
import { executeTurn, findPathBFS } from '../simulation';
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
} from './helpers';
import { Direction, ActionType, SpellTemplate, TileType } from '../../types/game';
import type { GameState, ProjectileEvent } from '../../types/game';

function setupScenario(): GameState {
  clearAllRegistries();
  registerTestSpell('homing-bolt-slow-pf', {
    id: 'homing-bolt-slow-pf',
    name: 'Slow Homing Bolt (Pathfinding)',
    description: 'LINEAR projectile, pathfinding homing, 2 tiles/turn',
    thumbnailIcon: '',
    templateType: SpellTemplate.LINEAR,
    directionMode: 'current_facing',
    damage: 1,
    range: 10,
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
          spellId: 'homing-bolt-slow-pf',
          autoTargetNearestEnemy: true,
          homing: true,
          homingPathStyle: 'pathfinding',
          homingIgnoreWalls: false,
        },
      ],
    })
  );
  registerTestEnemy(createTestEnemyDef({ id: 'goblin-tough', health: 20 }));

  const tiles = createEmptyGrid(7, 3);
  setTile(tiles, 3, 0, TileType.WALL);

  const gs = createTestGameState({
    puzzle: createTestPuzzle({
      width: 7,
      height: 3,
      tiles,
      enemies: [createTestEnemy({ enemyId: 'goblin-tough', x: 6, y: 0, currentHealth: 20 })],
      availableCharacters: ['hero-caster'],
      winConditions: [{ type: 'defeat_all_enemies' }],
    }),
    gameStatus: 'setup',
  });
  gs.placedCharacters.push({
    characterId: 'hero-caster', x: 1, y: 0, facing: Direction.EAST,
    currentHealth: 10, actionIndex: 0, active: true, dead: false,
  });
  return gs;
}

function runTimeline(headless: boolean): ProjectileEvent[] {
  const gs = setupScenario();
  if (headless) gs.headlessMode = true;
  gs.projectileTimeline = [];
  gs.gameStatus = 'running';
  for (let turn = 0; turn < 3 && gs.gameStatus === 'running'; turn++) executeTurn(gs);
  return gs.projectileTimeline;
}

describe('homing_move flown tiles', () => {
  beforeEach(() => clearAllRegistries());

  for (const headless of [false, true]) {
    it(`records a continuous, walkable per-turn route (${headless ? 'headless' : 'real'})`, () => {
      const timeline = runTimeline(headless);
      const spawn = timeline.find(e => e.type === 'spawn')!;
      expect(spawn).toBeDefined();
      const moves = timeline.filter(e => e.type === 'homing_move' && e.projId === spawn.projId && e.tilePath);
      expect(moves.length).toBeGreaterThan(0);

      const map = setupScenario();
      let prev = { x: Math.round(spawn.x), y: Math.round(spawn.y) };
      for (const move of moves) {
        const tiles = move.tilePath!;
        expect(tiles[0]).toEqual(prev);
        expect(tiles[tiles.length - 1]).toEqual({ x: Math.round(move.x), y: Math.round(move.y) });
        for (let i = 1; i < tiles.length; i++) {
          expect(Math.max(Math.abs(tiles[i].x - tiles[i - 1].x), Math.abs(tiles[i].y - tiles[i - 1].y))).toBe(1);
          expect(map.puzzle.tiles[tiles[i].y][tiles[i].x]?.type).not.toBe(TileType.WALL);
        }
        prev = tiles[tiles.length - 1];
      }
    });
  }

  it('real and headless record the same routes', () => {
    // Mid-flight moves only: real mode also logs a homing_move on the
    // reaching turn (no tilePath; replay re-runs that same BFS), headless
    // doesn't.
    const routes = (tl: ProjectileEvent[]) =>
      tl.filter(e => e.type === 'homing_move' && e.tilePath).map(e => ({ turn: e.turn, tilePath: e.tilePath }));
    expect(routes(runTimeline(true))).toEqual(routes(runTimeline(false)));
  });

  it('the flown route differs from a fresh BFS to the turn-end tile (why replay needs it)', () => {
    const timeline = runTimeline(false);
    const first = timeline.find(e => e.type === 'homing_move' && e.tilePath)!;
    const flown = first.tilePath!;
    const end = flown[flown.length - 1];
    const fresh = findPathBFS(flown[0].x, flown[0].y, end.x, end.y, setupScenario());
    expect(flown).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 1 }]);
    expect(fresh).not.toEqual(flown);
  });
});
