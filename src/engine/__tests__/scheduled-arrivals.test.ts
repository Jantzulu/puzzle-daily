/**
 * Scheduled visitors (passerby v2, 2026-07-17) — a placement with
 * `recurrence: {firstTurn, repeatEvery}` is an inert template (despawned +
 * win-exempt at init, never acts); processScheduledArrivals spawns a fresh
 * WIN-EXEMPT copy at its tile on the cadence, at the dawn of the turn.
 * Copies idle their arrival turn (spawnedOnTurn guard), then run the
 * asset's behavior — the passerby loop closes with a route ending in
 * DEPART. Occupied arrival tiles skip that visit (no queueing).
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestCharacter as regChar,
  registerTestEnemy as regEnemy,
  createTestPuzzle,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestCharacter,
  createTestEnemy,
  createTestGameState,
} from './helpers';
import { Direction, ActionType } from '../../types/game';
import type { GameState } from '../../types/game';
import { executeTurn, initializeGameState, checkVictoryConditions } from '../simulation';

const visitors = (gs: GameState) =>
  gs.puzzle.enemies.filter(e => e.spawnedOnTurn !== undefined);

const buildState = (opts: {
  enemies: ReturnType<typeof createTestEnemy>[];
  characters?: ReturnType<typeof createTestCharacter>[];
}) =>
  createTestGameState({
    puzzle: createTestPuzzle({
      width: 8, height: 5,
      enemies: opts.enemies,
      winConditions: [{ type: 'defeat_all_enemies' }],
    }),
    placedCharacters: opts.characters ?? [],
    gameStatus: 'running',
    currentTurn: 0,
    testMode: true,
  });

beforeEach(() => {
  clearAllRegistries();
  regEnemy(createTestEnemyDef({
    id: 'traveler', health: 5,
    behavior: {
      type: 'active',
      pattern: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.DEPART }],
      defaultFacing: Direction.EAST,
    },
  }));
  regChar(createTestCharacterDef({
    id: 'guard', health: 10,
    behavior: [{ type: ActionType.WAIT }, { type: ActionType.REPEAT }],
  }));
});

const template = (overrides?: Record<string, unknown>) =>
  createTestEnemy({
    enemyId: 'traveler', x: 2, y: 2, currentHealth: 5,
    recurrence: { firstTurn: 2, repeatEvery: 3 },
    ...overrides,
  } as never);

describe('scheduled arrivals', () => {
  it('the template is inert from init: despawned, win-exempt, never acts', () => {
    const init = initializeGameState(createTestPuzzle({
      enemies: [template()],
      winConditions: [{ type: 'defeat_all_enemies' }],
    }));
    const t = init.puzzle.enemies[0];
    expect(t.despawned).toBe(true);
    expect(t.excludeFromWinConditions).toBe(true);
    // Win-exempt + despawned: an empty-feeling board is already "won".
    expect(checkVictoryConditions(init)).toBe(true);
  });

  it('a copy arrives at firstTurn, idles that turn, acts the next — parity', () => {
    const build = () => buildState({
      enemies: [template()],
      characters: [createTestCharacter({
        characterId: 'guard', x: 6, y: 4, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    const probe = (g: GameState) => ({
      count: g.puzzle.enemies.length,
      visitors: visitors(g).map(v => ({ x: v.x, spawnedOnTurn: v.spawnedOnTurn, dead: v.dead, exempt: v.excludeFromWinConditions })),
    });
    const visual = build();
    const headless = build();
    headless.headlessMode = true;
    for (let t = 0; t < 3; t++) { executeTurn(visual); executeTurn(headless); }
    expect(probe(visual)).toEqual(probe(headless));

    // Turn 1: nothing. Turn 2: arrival at (2,2), idle. Turn 3: moves east.
    expect(visitors(visual)).toHaveLength(1);
    const v = visitors(visual)[0];
    expect(v.spawnedOnTurn).toBe(2);
    expect(v.excludeFromWinConditions).toBe(true);
    expect(v.x).toBe(3); // moved on turn 3, not on its arrival turn
  });

  it('the cadence repeats: a second visitor arrives firstTurn + repeatEvery', () => {
    const gs = buildState({
      enemies: [template()],
      characters: [createTestCharacter({
        characterId: 'guard', x: 6, y: 4, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    for (let t = 0; t < 5; t++) executeTurn(gs); // arrivals at turns 2 and 5
    const vs = visitors(gs);
    expect(vs.map(v => v.spawnedOnTurn)).toEqual([2, 5]);
    // The first visitor already crossed and departed (move turn 3, DEPART turn 4).
    expect(vs[0].despawned).toBe(true);
    expect(vs[0].departedOnTurn).toBe(4);
  });

  it('repeatEvery unset = one visit only', () => {
    const gs = buildState({
      enemies: [template({ recurrence: { firstTurn: 1 } })],
      characters: [createTestCharacter({
        characterId: 'guard', x: 6, y: 4, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    for (let t = 0; t < 5; t++) executeTurn(gs);
    expect(visitors(gs)).toHaveLength(1);
  });

  it('an occupied arrival tile skips that visit; the next cadence beat still fires', () => {
    const gs = buildState({
      enemies: [template({ recurrence: { firstTurn: 1, repeatEvery: 2 } })],
      characters: [
        // Guard parked ON the arrival tile — blocks the turn-1 visit.
        createTestCharacter({
          characterId: 'guard', x: 2, y: 2, facing: Direction.EAST,
          currentHealth: 10, actionIndex: 0, active: true,
        }),
      ],
    });
    executeTurn(gs); // turn 1: blocked, no visitor
    expect(visitors(gs)).toHaveLength(0);
    // Free the tile, next beat lands.
    gs.placedCharacters[0].x = 5;
    executeTurn(gs); // turn 2: off-cadence
    executeTurn(gs); // turn 3: cadence beat (1 + 2) — visitor arrives
    expect(visitors(gs)).toHaveLength(1);
    expect(visitors(gs)[0].spawnedOnTurn).toBe(3);
  });

  it('visitors never block victory: defeat_all_enemies completes with a visitor on the board', () => {
    regEnemy(createTestEnemyDef({ id: 'goblin-1', health: 2 }));
    const gs = buildState({
      enemies: [
        template({ recurrence: { firstTurn: 1, repeatEvery: 2 } }),
        createTestEnemy({ enemyId: 'goblin-1', x: 6, y: 2, currentHealth: 2, dead: true, diedOnTurn: 0 }),
      ],
      characters: [createTestCharacter({
        characterId: 'guard', x: 6, y: 4, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs); // visitor arrives; the only real enemy is already dead
    expect(visitors(gs)).toHaveLength(1);
    expect(visitors(gs)[0].dead).toBe(false);
    expect(checkVictoryConditions(gs)).toBe(true);
  });
});
