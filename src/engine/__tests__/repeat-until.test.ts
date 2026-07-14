/**
 * REPEAT_UNTIL sequence action (user design 2026-07-14).
 *
 * A control-flow action that repeats its SEGMENT — everything after the
 * previous REPEAT_UNTIL (or the list start) — until its condition fires,
 * then falls through to the actions below it. Stacked blocks stage behavior
 * ("patrol until spotted → chase until adjacent → attack").
 *
 * Semantics pinned here:
 *  - the condition uses the shared trigger vocabulary via
 *    checkTriggerCondition (untilEvent/untilEventRange on the action — NOT
 *    the parallel-trigger plumbing, so evaluateTriggers never fires it);
 *  - the looping turn executes the segment-start action (mirrors REPEAT),
 *    the falling-through turn executes the next action below — no idle
 *    turns either way;
 *  - a later block never loops past an earlier block (segments);
 *  - an empty segment idles in place, re-checking every turn;
 *  - works through the character loop, the enemy loop, and for allies
 *    (enemy-shaped, party: 'hero').
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestCharacter as regChar,
  registerTestEnemy as regEnemy,
  registerTestAlly as regAlly,
  registerTestSpell,
  createTestPuzzle,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestCharacter,
  createTestEnemy,
  createTestGameState,
} from './helpers';
import { Direction, ActionType, SpellTemplate } from '../../types/game';
import type { GameState, PlacedEnemy, PlacedCharacter } from '../../types/game';
import { executeTurn } from '../simulation';

const registerStab = () =>
  registerTestSpell('stab', {
    id: 'stab', name: 'Stab', description: '', thumbnailIcon: '',
    templateType: SpellTemplate.MELEE, directionMode: 'current_facing',
    damage: 2,
    sprites: {},
  });

const registerPing = () => {
  regEnemy(createTestEnemyDef({ id: 'spawnling', health: 1 })); // static, never acts
  registerTestSpell('ping', {
    id: 'ping', name: 'Ping', description: '', thumbnailIcon: '',
    templateType: SpellTemplate.SUMMON,
    directionMode: 'fixed', defaultDirections: [Direction.NORTH],
    summonEnemyId: 'spawnling',
    sprites: {},
  });
};

const spawnlings = (gs: GameState) =>
  gs.puzzle.enemies.filter(e => e.enemyId === 'spawnling');

const waitingHero = (overrides?: Partial<PlacedCharacter>) => {
  regChar(createTestCharacterDef({
    id: 'bystander', health: 10,
    behavior: [{ type: ActionType.WAIT }, { type: ActionType.REPEAT }] as never,
  }));
  return createTestCharacter({
    characterId: 'bystander', x: 1, y: 2, facing: Direction.EAST,
    currentHealth: 10, actionIndex: 0, active: true,
    ...overrides,
  });
};

const baseState = (opts: { enemies?: PlacedEnemy[]; heroes?: PlacedCharacter[] }) =>
  createTestGameState({
    puzzle: createTestPuzzle({
      width: 8, height: 5,
      enemies: opts.enemies ?? [],
    }),
    placedCharacters: opts.heroes ?? [],
    gameStatus: 'running',
    currentTurn: 0,
    testMode: true,
  });

beforeEach(() => {
  clearAllRegistries();
  registerStab();
  registerPing();
});

describe('REPEAT_UNTIL through the enemy loop', () => {
  it('patrols until the opponent is adjacent, then falls through and attacks the SAME turn', () => {
    regEnemy(createTestEnemyDef({
      id: 'stalker', health: 5,
      behavior: {
        type: 'active',
        pattern: [
          { type: ActionType.MOVE_FORWARD },
          { type: ActionType.REPEAT_UNTIL, untilEvent: 'opposing_adjacent' },
          { type: ActionType.SPELL, spellId: 'stab' },
        ],
        defaultFacing: Direction.WEST,
      },
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'stalker', x: 5, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.WEST,
      })],
      heroes: [waitingHero()], // parked at (1,2)
    });

    const timeline: Array<{ x: number; heroHp: number }> = [];
    for (let t = 0; t < 4; t++) {
      executeTurn(gs);
      timeline.push({
        x: gs.puzzle.enemies[0].x,
        heroHp: gs.placedCharacters[0].currentHealth,
      });
    }
    expect(timeline).toEqual([
      { x: 4, heroHp: 10 }, // move
      { x: 3, heroHp: 10 }, // loop: not adjacent → move again
      { x: 2, heroHp: 10 }, // loop: still not adjacent → move again
      { x: 2, heroHp: 8 },  // adjacent → fall through → stab lands this turn
    ]);
  });

  it('a later block never loops past an earlier block (segment boundary)', () => {
    regEnemy(createTestEnemyDef({
      id: 'stager', health: 5,
      behavior: {
        type: 'active',
        pattern: [
          { type: ActionType.SPELL, spellId: 'ping' },
          { type: ActionType.REPEAT_UNTIL, untilEvent: 'opposing_in_range', untilEventRange: 10 },
          { type: ActionType.WAIT },
          { type: ActionType.REPEAT_UNTIL, untilEvent: 'wall_ahead' }, // open corridor — never true
        ],
        defaultFacing: Direction.EAST,
      },
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'stager', x: 2, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.EAST,
      })],
      heroes: [waitingHero()],
    });

    for (let t = 0; t < 6; t++) executeTurn(gs);
    // T1 pings once; block 1 falls through (hero within 10); block 2 loops
    // its own WAIT segment forever — it must never cross block 1 back to
    // the ping.
    expect(spawnlings(gs)).toHaveLength(1);
  });

  it('an empty segment idles in place and re-checks every turn (fires when the world changes)', () => {
    regEnemy(createTestEnemyDef({
      id: 'sentry', health: 5,
      behavior: {
        type: 'active',
        pattern: [
          { type: ActionType.REPEAT_UNTIL, untilEvent: 'opposing_adjacent' },
          { type: ActionType.SPELL, spellId: 'ping' },
        ],
        defaultFacing: Direction.EAST,
      },
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'sentry', x: 4, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.EAST,
      })],
      heroes: [waitingHero()], // parked at (1,2) — not adjacent
    });

    executeTurn(gs);
    executeTurn(gs);
    expect(spawnlings(gs)).toHaveLength(0); // idling on the block

    // The world changes: the hero appears next to the sentry.
    gs.placedCharacters[0].x = 3;
    gs.placedCharacters[0].y = 2;
    executeTurn(gs);
    expect(spawnlings(gs)).toHaveLength(1); // fall-through fired the ping this turn

    executeTurn(gs);
    expect(spawnlings(gs)).toHaveLength(1); // no REPEAT below — ran off the end, no re-fire
  });
});

describe('REPEAT_UNTIL through the character loop', () => {
  it('a hero walks toward the enemy until adjacent, then attacks', () => {
    regChar(createTestCharacterDef({
      id: 'knight', health: 10,
      behavior: [
        { type: ActionType.MOVE_FORWARD },
        { type: ActionType.REPEAT_UNTIL, untilEvent: 'opposing_adjacent' },
        { type: ActionType.SPELL, spellId: 'stab' },
      ] as never,
    }));
    regEnemy(createTestEnemyDef()); // goblin-1, static
    const gs = baseState({
      enemies: [createTestEnemy({ enemyId: 'goblin-1', x: 5, y: 2, currentHealth: 5 })],
      heroes: [createTestCharacter({
        characterId: 'knight', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });

    executeTurn(gs); // move → (3,2)
    executeTurn(gs); // loop: not adjacent → move → (4,2)
    expect(gs.puzzle.enemies[0].currentHealth).toBe(5);
    executeTurn(gs); // adjacent → fall through → stab
    expect(gs.placedCharacters[0].x).toBe(4);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(3);
  });
});

describe('REPEAT_UNTIL on allies', () => {
  it('an ally waits until an OPPONENT is adjacent, then attacks it', () => {
    regAlly(createTestEnemyDef({
      id: 'guardian', health: 6,
      behavior: {
        type: 'active',
        pattern: [
          { type: ActionType.WAIT },
          { type: ActionType.REPEAT_UNTIL, untilEvent: 'opposing_adjacent' },
          { type: ActionType.SPELL, spellId: 'stab' },
        ],
        defaultFacing: Direction.EAST,
      },
    }));
    regEnemy(createTestEnemyDef()); // goblin-1, static
    const gs = baseState({
      enemies: [
        createTestEnemy({
          enemyId: 'guardian', party: 'hero', x: 2, y: 2, currentHealth: 6,
          actionIndex: 0, active: true, facing: Direction.EAST,
        }),
        createTestEnemy({ enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5 }),
      ],
      heroes: [waitingHero({ x: 1, y: 2 })], // adjacent teammate — must NOT satisfy the condition
    });

    executeTurn(gs); // WAIT
    expect(gs.puzzle.enemies[1].currentHealth).toBe(5);
    executeTurn(gs); // goblin adjacent → fall through → stab EAST
    expect(gs.puzzle.enemies[1].currentHealth).toBe(3);
  });
});
