/**
 * DEPART action (passerby v1, 2026-07-17) — an authored behavior step that
 * makes the entity leave the board on its own terms. NOT a death
 * (summon-expiry semantics): no drops, no death triggers, no corpse —
 * but dead+despawned so win checks settle and the tile frees immediately
 * (diedOnTurn stays unset). departedOnTurn is the render hook for the
 * full-opacity walk-out. The route is normal authored movement; DEPART is
 * just the final step.
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestCharacter as regChar,
  registerTestEnemy as regEnemy,
  registerTestCollectible,
  createTestPuzzle,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestCharacter,
  createTestEnemy,
  createTestGameState,
} from './helpers';
import { Direction, ActionType } from '../../types/game';
import type { GameState } from '../../types/game';
import { executeTurn, checkVictoryConditions } from '../simulation';

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

beforeEach(() => {
  clearAllRegistries();
  registerTestCollectible('coin', { id: 'coin', name: 'Coin' });
});

describe('DEPART action', () => {
  it('walks its route then leaves: dead+despawned+departedOnTurn, no drop, tile freed, parity', () => {
    regEnemy(createTestEnemyDef({
      id: 'traveler', health: 5, droppedCollectibleId: 'coin',
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.DEPART }],
        defaultFacing: Direction.EAST,
      },
    }));
    const gs = expectParity(() => buildState({
      enemies: [createTestEnemy({
        enemyId: 'traveler', x: 2, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.EAST,
      })],
    }), 2, g => ({
      dead: g.puzzle.enemies[0].dead,
      despawned: !!g.puzzle.enemies[0].despawned,
      departedOnTurn: g.puzzle.enemies[0].departedOnTurn,
      x: g.puzzle.enemies[0].x,
      drops: (g.puzzle.collectibles ?? []).length,
    }));

    const traveler = gs.puzzle.enemies[0];
    expect(traveler.x).toBe(3);                 // turn 1: moved
    expect(traveler.dead).toBe(true);           // turn 2: departed
    expect(traveler.despawned).toBe(true);
    expect(traveler.departedOnTurn).toBe(2);
    expect(traveler.diedOnTurn).toBeUndefined(); // not a death — tile frees immediately
    // No drop: departure is not a death, it walks off with its loot.
    expect(gs.puzzle.collectibles ?? []).toHaveLength(0);
    // Win checks settle: a departed enemy no longer blocks victory.
    expect(checkVictoryConditions(gs)).toBe(true);
  });

  it('a triggered DEPART (parallel trigger action) rides the trigger-phase wrapper back', () => {
    // Skittish critter: flees the board the moment a hero comes adjacent.
    regEnemy(createTestEnemyDef({
      id: 'skittish', health: 5,
      behavior: {
        type: 'active',
        pattern: [
          {
            type: ActionType.DEPART,
            executionMode: 'parallel',
            trigger: { mode: 'on_event', event: 'character_adjacent' },
          },
          { type: ActionType.WAIT },
          { type: ActionType.REPEAT },
        ],
        defaultFacing: Direction.WEST,
      },
    }));
    regChar(createTestCharacterDef({
      id: 'walker', health: 10,
      behavior: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }],
    }));

    const gs = buildState({
      enemies: [createTestEnemy({
        enemyId: 'skittish', x: 5, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.WEST,
      })],
      characters: [createTestCharacter({
        characterId: 'walker', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs); // hero → (3,2): not adjacent, no flight
    expect(gs.puzzle.enemies[0].despawned).toBeFalsy();
    executeTurn(gs); // hero → (4,2): adjacent — skittish departs via its trigger
    expect(gs.puzzle.enemies[0].dead).toBe(true);
    expect(gs.puzzle.enemies[0].despawned).toBe(true);
    expect(gs.puzzle.enemies[0].departedOnTurn).toBe(2);
  });

  it('a stunned entity cannot depart (canEntityAct gates the action)', () => {
    regEnemy(createTestEnemyDef({
      id: 'traveler', health: 5,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.DEPART }],
        defaultFacing: Direction.EAST,
      },
    }));
    const gs = buildState({
      enemies: [createTestEnemy({
        enemyId: 'traveler', x: 2, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.EAST,
        statusEffects: [{ id: 'stun-fx', type: 'stun', remainingTurns: 5, value: 0 }],
      } as never)],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].despawned).toBeFalsy();
    expect(gs.puzzle.enemies[0].dead).toBeFalsy();
  });

  it('a departed enemy no longer blocks walkers on its former tile', () => {
    regEnemy(createTestEnemyDef({
      id: 'traveler', health: 5,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.DEPART }],
        defaultFacing: Direction.EAST,
      },
    }));
    regChar(createTestCharacterDef({
      id: 'walker', health: 10,
      behavior: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }],
    }));
    const gs = buildState({
      enemies: [createTestEnemy({
        enemyId: 'traveler', x: 4, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.EAST,
      })],
      characters: [createTestCharacter({
        characterId: 'walker', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs); // traveler departs; walker → (3,2)
    expect(gs.puzzle.enemies[0].despawned).toBe(true);
    executeTurn(gs); // walker crosses the vacated tile → (4,2)
    expect(gs.placedCharacters[0].x).toBe(4);
  });
});
