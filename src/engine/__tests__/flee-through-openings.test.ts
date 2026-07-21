/**
 * Flee-through-openings (2026-07-21, locked design) — direction-of-travel
 * exit for entities whose asset opts in via `exitsThroughOpenings`. A
 * movement step that would pass THROUGH a valid hallway/door mouth (standing
 * on the marker tile, stepping out its open side) leaves the board instead
 * of consulting wall behavior — checked before every wall-behavior site AND
 * inside IF_WALL (a mouth ahead is an exit, not a wall), so facing (and the
 * movement arrow drawn from it) never adopts the phantom turn. Walking PAST
 * a mouth never triggers. Departure = DEPART semantics: dead + despawned +
 * departedOnTurn, no drops/triggers/corpse, diedOnTurn unset.
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestEnemy as regEnemy,
  registerTestCollectible,
  createTestPuzzle,
  createTestEnemyDef,
  createTestEnemy,
  createTestGameState,
} from './helpers';
import { Direction, ActionType } from '../../types/game';
import type { GameState } from '../../types/game';
import { executeTurn } from '../simulation';

const HALL_NORTH = { x: 4, y: 0, side: 'top' as const };
const DOOR_NORTH = { x: 4, y: 0, side: 'top' as const, startState: 'closed' as const };

const buildState = (opts: {
  enemies: ReturnType<typeof createTestEnemy>[];
  hallways?: Array<{ x: number; y: number; side: 'top' | 'bottom' | 'left' | 'right' }>;
  doors?: Array<{ x: number; y: number; side: 'top' | 'bottom'; startState: string }>;
}) =>
  createTestGameState({
    puzzle: createTestPuzzle({
      width: 8, height: 5,
      enemies: opts.enemies,
      winConditions: [{ type: 'defeat_all_enemies' }],
      hallways: opts.hallways ?? [],
      doors: opts.doors ?? [],
    } as never),
    placedCharacters: [],
    gameStatus: 'running',
    currentTurn: 0,
    testMode: true,
  });

const expectParity = (build: () => GameState, turns: number, probe: (g: GameState) => unknown) => {
  const visual = build();
  const headless = build();
  headless.headlessMode = true;
  for (let t = 0; t < turns; t++) {
    executeTurn(visual);
    executeTurn(headless);
  }
  expect(probe(visual)).toEqual(probe(headless));
  return visual;
};

const walker = (id: string, overrides: object = {}) =>
  createTestEnemyDef({
    id, health: 5, droppedCollectibleId: 'coin',
    behavior: {
      type: 'active',
      pattern: [{ type: ActionType.MOVE_FORWARD, onWallCollision: 'turn_right' }, { type: ActionType.REPEAT }],
      defaultFacing: Direction.NORTH,
    },
    ...overrides,
  });

beforeEach(() => {
  clearAllRegistries();
  registerTestCollectible('coin', { id: 'coin', name: 'Coin' });
});

describe('flee-through-openings (direction-of-travel exit)', () => {
  it('flagged walker exits through the mouth: DEPART semantics, facing never turns, parity', () => {
    regEnemy(walker('critter', { exitsThroughOpenings: true }));
    const gs = expectParity(() => buildState({
      hallways: [HALL_NORTH],
      enemies: [createTestEnemy({
        enemyId: 'critter', x: 4, y: 1, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.NORTH,
      })],
    }), 2, g => ({
      dead: g.puzzle.enemies[0].dead,
      despawned: !!g.puzzle.enemies[0].despawned,
      departedOnTurn: g.puzzle.enemies[0].departedOnTurn,
      facing: g.puzzle.enemies[0].facing,
      drops: (g.puzzle.collectibles ?? []).length,
    }));

    const critter = gs.puzzle.enemies[0];
    // Turn 1: steps onto the mouth tile. Turn 2: the north step goes out
    // through the mouth — departs instead of turning right.
    expect(critter.dead).toBe(true);
    expect(critter.despawned).toBe(true);
    expect(critter.departedOnTurn).toBe(2);
    expect(critter.diedOnTurn).toBeUndefined();      // not a death
    expect(critter.facing).toBe(Direction.NORTH);    // arrow honesty: no phantom turn
    expect(gs.puzzle.collectibles ?? []).toHaveLength(0); // walks off with its loot
  });

  it('the unflagged twin turns right at the same mouth and stays', () => {
    regEnemy(walker('critter'));
    const gs = buildState({
      hallways: [HALL_NORTH],
      enemies: [createTestEnemy({
        enemyId: 'critter', x: 4, y: 1, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.NORTH,
      })],
    });
    executeTurn(gs); // onto the mouth tile
    executeTurn(gs); // wall ahead → turn_right, no exit
    expect(gs.puzzle.enemies[0].dead).toBeFalsy();
    expect(gs.puzzle.enemies[0].facing).toBe(Direction.EAST);
  });

  it('walking PAST the mouth never triggers — only steps out through the open side exit', () => {
    regEnemy(createTestEnemyDef({
      id: 'critter', health: 5, exitsThroughOpenings: true,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.MOVE_FORWARD, onWallCollision: 'turn_right' }, { type: ActionType.REPEAT }],
        defaultFacing: Direction.EAST,
      },
    }));
    const gs = buildState({
      hallways: [HALL_NORTH],
      enemies: [createTestEnemy({
        enemyId: 'critter', x: 2, y: 0, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.EAST,
      })],
    });
    // Walks east along the top row, crossing the (4,0) mouth tile without
    // exiting; at the east edge (no opening there) wall behavior fires.
    for (let t = 0; t < 6; t++) executeTurn(gs);
    expect(gs.puzzle.enemies[0].dead).toBeFalsy();
    expect(gs.puzzle.enemies[0].x).toBe(7);
    expect(gs.puzzle.enemies[0].facing).toBe(Direction.SOUTH); // turned at the corner
  });

  it("overrides 'stop' wall behavior too — flee beats every wall behavior", () => {
    regEnemy(createTestEnemyDef({
      id: 'critter', health: 5, exitsThroughOpenings: true,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.MOVE_FORWARD, onWallCollision: 'stop' }, { type: ActionType.REPEAT }],
        defaultFacing: Direction.NORTH,
      },
    }));
    const gs = buildState({
      hallways: [HALL_NORTH],
      enemies: [createTestEnemy({
        enemyId: 'critter', x: 4, y: 0, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.NORTH,
      })],
    });
    executeTurn(gs); // starts ON the mouth tile — first step exits
    expect(gs.puzzle.enemies[0].despawned).toBe(true);
    expect(gs.puzzle.enemies[0].departedOnTurn).toBe(1);
  });

  it('IF_WALL does not fire at the mouth for a flagged entity (exit, not wall)', () => {
    regEnemy(createTestEnemyDef({
      id: 'flagged', health: 5, exitsThroughOpenings: true,
      behavior: {
        type: 'active',
        pattern: [
          { type: ActionType.IF_WALL, params: { then: [{ type: ActionType.TURN_AROUND }] } },
          { type: ActionType.MOVE_FORWARD },
          { type: ActionType.REPEAT },
        ],
        defaultFacing: Direction.NORTH,
      },
    }));
    regEnemy(createTestEnemyDef({
      id: 'plain', health: 5,
      behavior: {
        type: 'active',
        pattern: [
          { type: ActionType.IF_WALL, params: { then: [{ type: ActionType.TURN_AROUND }] } },
          { type: ActionType.MOVE_FORWARD },
          { type: ActionType.REPEAT },
        ],
        defaultFacing: Direction.NORTH,
      },
    }));
    const gs = buildState({
      hallways: [HALL_NORTH, { x: 6, y: 0, side: 'top' }],
      enemies: [
        createTestEnemy({ enemyId: 'flagged', x: 4, y: 0, currentHealth: 5, actionIndex: 0, active: true, facing: Direction.NORTH }),
        createTestEnemy({ enemyId: 'plain', x: 6, y: 0, currentHealth: 5, actionIndex: 0, active: true, facing: Direction.NORTH }),
      ],
    });
    executeTurn(gs); // both run IF_WALL on their mouth tiles
    expect(gs.puzzle.enemies[0].facing).toBe(Direction.NORTH); // exit ahead — no turn
    expect(gs.puzzle.enemies[1].facing).toBe(Direction.SOUTH); // wall ahead — turned
    executeTurn(gs); // flagged: MOVE_FORWARD → exits; plain: walks south
    expect(gs.puzzle.enemies[0].despawned).toBe(true);
    expect(gs.puzzle.enemies[1].despawned).toBeFalsy();
    expect(gs.puzzle.enemies[1].y).toBe(1);
  });

  it('a multi-tile mover exits on the mid-move step that hits the mouth (same turn)', () => {
    regEnemy(createTestEnemyDef({
      id: 'dasher', health: 5, exitsThroughOpenings: true,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.MOVE_FORWARD, tilesPerMove: 2, onWallCollision: 'turn_right' }, { type: ActionType.REPEAT }],
        defaultFacing: Direction.NORTH,
      },
    }));
    const gs = buildState({
      hallways: [HALL_NORTH],
      enemies: [createTestEnemy({
        enemyId: 'dasher', x: 4, y: 3, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.NORTH,
      })],
    });
    executeTurn(gs); // (4,3) → (4,1)
    expect(gs.puzzle.enemies[0].y).toBe(1);
    executeTurn(gs); // step 1 → (4,0), step 2 goes through the mouth mid-move
    expect(gs.puzzle.enemies[0].despawned).toBe(true);
    expect(gs.puzzle.enemies[0].departedOnTurn).toBe(2);
  });

  it('doors count as exits (same validity rule as noble escapes)', () => {
    regEnemy(walker('critter', { exitsThroughOpenings: true }));
    const gs = buildState({
      doors: [DOOR_NORTH],
      enemies: [createTestEnemy({
        enemyId: 'critter', x: 4, y: 1, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.NORTH,
      })],
    });
    executeTurn(gs);
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].despawned).toBe(true);
    expect(gs.puzzle.enemies[0].departedOnTurn).toBe(2);
  });

  it('no opening = plain wall behavior, flag or not', () => {
    regEnemy(walker('critter', { exitsThroughOpenings: true }));
    const gs = buildState({
      enemies: [createTestEnemy({
        enemyId: 'critter', x: 4, y: 1, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.NORTH,
      })],
    });
    executeTurn(gs); // → (4,0)
    executeTurn(gs); // bare edge ahead → turn_right
    expect(gs.puzzle.enemies[0].dead).toBeFalsy();
    expect(gs.puzzle.enemies[0].facing).toBe(Direction.EAST);
  });
});
