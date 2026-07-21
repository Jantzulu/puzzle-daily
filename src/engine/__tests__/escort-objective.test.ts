/**
 * Escort-through-opening win condition (entity_escapes, 2026-07-21) —
 * noble_escapes generalized to arbitrary designated entities (asset ids).
 * Escapes use the alive-despawned success state (despawned, dead FALSE,
 * departedOnTurn). Detection: 'standing' (default, end-of-turn census on
 * the opening tile) or 'walk_through' (must step out through the mouth).
 * Victory: every designated asset has >=1 placed entity and ALL its placed
 * entities escaped. Implied-protect: a designated entity DYING = defeat.
 * Escaped designated enemies are excused from defeat_all (isEntityFunctional
 * excludes despawned).
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
import type { GameState, WinCondition } from '../../types/game';
import { executeTurn, checkVictoryConditions } from '../simulation';

const HALL_NORTH = { x: 4, y: 0, side: 'top' as const };
const HALL_EAST = { x: 7, y: 2, side: 'right' as const };

const buildState = (opts: {
  winConditions: WinCondition[];
  enemies?: ReturnType<typeof createTestEnemy>[];
  characters?: ReturnType<typeof createTestCharacter>[];
  hallways?: Array<{ x: number; y: number; side: 'top' | 'bottom' | 'left' | 'right' }>;
  testMode?: boolean;
}) =>
  createTestGameState({
    puzzle: createTestPuzzle({
      width: 8, height: 5,
      enemies: opts.enemies ?? [],
      winConditions: opts.winConditions,
      hallways: opts.hallways ?? [HALL_NORTH],
    } as never),
    placedCharacters: opts.characters ?? [],
    gameStatus: 'running',
    currentTurn: 0,
    testMode: opts.testMode ?? true,
  });

const northWalker = (id: string) =>
  createTestEnemyDef({
    id, health: 5,
    behavior: {
      type: 'active',
      pattern: [{ type: ActionType.MOVE_FORWARD, onWallCollision: 'turn_right' }, { type: ActionType.REPEAT }],
      defaultFacing: Direction.NORTH,
    },
  });

const parkedHero = () => {
  regChar(createTestCharacterDef({
    id: 'sentry', health: 10,
    behavior: [{ type: ActionType.WAIT }, { type: ActionType.REPEAT }],
  }));
  return createTestCharacter({
    characterId: 'sentry', x: 0, y: 4, facing: Direction.SOUTH,
    currentHealth: 10, actionIndex: 0, active: true,
  });
};

const escortCond = (ids: string[], extra: object = {}): WinCondition =>
  ({ type: 'entity_escapes', params: { escortEntityIds: ids, ...extra } });

beforeEach(() => clearAllRegistries());

describe('entity_escapes (escort through an opening)', () => {
  it('standing census: designated enemy on the opening tile escapes alive-despawned; victory; parity', () => {
    regEnemy(northWalker('rat'));
    const build = () => buildState({
      winConditions: [escortCond(['rat'])],
      enemies: [createTestEnemy({
        enemyId: 'rat', x: 4, y: 1, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.NORTH,
      })],
    });
    const visual = build();
    const headless = build();
    headless.headlessMode = true;
    executeTurn(visual);
    executeTurn(headless);
    const probe = (g: GameState) => ({
      despawned: !!g.puzzle.enemies[0].despawned,
      dead: g.puzzle.enemies[0].dead,
      departedOnTurn: g.puzzle.enemies[0].departedOnTurn,
    });
    expect(probe(visual)).toEqual(probe(headless));

    const rat = visual.puzzle.enemies[0];
    // Turn 1: steps onto (4,0); end-of-turn census exits it same turn.
    expect(rat.despawned).toBe(true);
    expect(rat.dead).toBeFalsy();          // alive-despawned success state
    expect(rat.departedOnTurn).toBe(1);
    expect(checkVictoryConditions(visual)).toBe(true);
  });

  it('a designated HERO escapes via the census too', () => {
    regChar(createTestCharacterDef({
      id: 'scout', health: 10,
      behavior: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }],
    }));
    const gs = buildState({
      winConditions: [escortCond(['scout'])],
      characters: [createTestCharacter({
        characterId: 'scout', x: 4, y: 2, facing: Direction.NORTH,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs); // → (4,1)
    executeTurn(gs); // → (4,0), census exits
    const scout = gs.placedCharacters[0];
    expect(scout.despawned).toBe(true);
    expect(scout.dead).toBeFalsy();
    expect(checkVictoryConditions(gs)).toBe(true);
  });

  it('an UNDESIGNATED entity standing on the mouth goes nowhere', () => {
    regEnemy(northWalker('rat'));
    regEnemy(northWalker('bat'));
    const gs = buildState({
      winConditions: [escortCond(['bat'])],
      enemies: [createTestEnemy({
        enemyId: 'rat', x: 4, y: 1, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.NORTH,
      })],
    });
    executeTurn(gs); // rat reaches (4,0) — not designated, no exit
    expect(gs.puzzle.enemies[0].despawned).toBeFalsy();
    expect(checkVictoryConditions(gs)).toBe(false);
  });

  it('a designated opening: standing on a different opening does not exit', () => {
    regEnemy(northWalker('rat'));
    const gs = buildState({
      winConditions: [escortCond(['rat'], { escapeOpening: HALL_EAST })],
      hallways: [HALL_NORTH, HALL_EAST],
      enemies: [createTestEnemy({
        enemyId: 'rat', x: 4, y: 1, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.NORTH,
      })],
    });
    executeTurn(gs); // stands on HALL_NORTH's tile — wrong opening
    expect(gs.puzzle.enemies[0].despawned).toBeFalsy();
  });

  it('escaped designated enemy is excused from defeat_all (win = kill the rest, shoo the rat)', () => {
    regEnemy(northWalker('rat'));
    regEnemy(createTestEnemyDef({
      id: 'brute', health: 5,
      behavior: { type: 'active', pattern: [{ type: ActionType.WAIT }, { type: ActionType.REPEAT }], defaultFacing: Direction.SOUTH },
    }));
    const gs = buildState({
      winConditions: [{ type: 'defeat_all_enemies' }, escortCond(['rat'])],
      enemies: [
        createTestEnemy({ enemyId: 'rat', x: 4, y: 1, currentHealth: 5, actionIndex: 0, active: true, facing: Direction.NORTH }),
        createTestEnemy({ enemyId: 'brute', x: 1, y: 3, currentHealth: 5, actionIndex: 0, active: true, facing: Direction.SOUTH }),
      ],
    });
    executeTurn(gs); // rat escapes via census
    expect(gs.puzzle.enemies[0].despawned).toBe(true);
    expect(checkVictoryConditions(gs)).toBe(false); // brute still up
    gs.puzzle.enemies[1].dead = true;               // brute falls
    expect(checkVictoryConditions(gs)).toBe(true);  // escapee doesn't block
  });

  it('implied-protect: a designated entity dying is instant defeat', () => {
    regEnemy(northWalker('rat'));
    const gs = buildState({
      winConditions: [escortCond(['rat'])],
      enemies: [createTestEnemy({
        enemyId: 'rat', x: 4, y: 3, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.NORTH,
      })],
      characters: [parkedHero()],
      testMode: false,
    });
    gs.puzzle.enemies[0].dead = true;
    gs.puzzle.enemies[0].diedOnTurn = 1;
    executeTurn(gs);
    expect(gs.gameStatus).toBe('defeat');
  });

  it("walk_through rule: standing on the tile is NOT enough — stepping out through the mouth is", () => {
    regEnemy(northWalker('rat'));
    const gs = buildState({
      winConditions: [escortCond(['rat'], { escapeRule: 'walk_through' })],
      enemies: [createTestEnemy({
        enemyId: 'rat', x: 4, y: 1, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.NORTH,
      })],
    });
    executeTurn(gs); // onto (4,0) — census skipped for walk_through
    expect(gs.puzzle.enemies[0].despawned).toBeFalsy();
    expect(gs.puzzle.enemies[0].facing).toBe(Direction.NORTH); // no anticipatory turn at the mouth
    executeTurn(gs); // the north step goes out through the mouth
    const rat = gs.puzzle.enemies[0];
    expect(rat.despawned).toBe(true);
    expect(rat.dead).toBeFalsy();          // escort escape, NOT a flee-DEPART
    expect(rat.departedOnTurn).toBe(2);
    expect(checkVictoryConditions(gs)).toBe(true);
  });

  it('victory needs every designated asset placed and escaped', () => {
    regEnemy(northWalker('rat'));
    const gs = buildState({
      winConditions: [escortCond(['rat', 'ghost-of-nobody'])],
      enemies: [createTestEnemy({
        enemyId: 'rat', x: 4, y: 1, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.NORTH,
      })],
    });
    executeTurn(gs); // rat escapes
    expect(gs.puzzle.enemies[0].despawned).toBe(true);
    // 'ghost-of-nobody' has no placements — the quest stays open.
    expect(checkVictoryConditions(gs)).toBe(false);
  });
});
