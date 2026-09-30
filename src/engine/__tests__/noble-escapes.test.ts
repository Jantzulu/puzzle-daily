/**
 * noble_escapes win condition (escape objectives, 2026-07-17) — guide every
 * Noble onto a qualifying opening's floor tile; at END of turn it exits the
 * board (processNobleExits): despawned + departedOnTurn + active=false with
 * dead staying FALSE — the game's one alive-despawned state. Implied-protect
 * excuses escapees (leaving safely is a success); a Noble that DIES before
 * escaping is still an instant defeat. isEntityFunctional gained the
 * !despawned "third condition", so escaped entities can't act, be targeted,
 * or block.
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
import { checkSideQuests } from '../scoring';

const HALL_EAST = { x: 7, y: 2, side: 'right' as const };
const HALL_NORTH = { x: 4, y: 0, side: 'top' as const };

const buildState = (opts: {
  winConditions: WinCondition[];
  characters?: ReturnType<typeof createTestCharacter>[];
  enemies?: ReturnType<typeof createTestEnemy>[];
  hallways?: Array<{ x: number; y: number; side: 'top' | 'bottom' | 'left' | 'right' }>;
  testMode?: boolean;
}) =>
  createTestGameState({
    puzzle: createTestPuzzle({
      width: 8, height: 5,
      enemies: opts.enemies ?? [],
      winConditions: opts.winConditions,
      hallways: opts.hallways ?? [HALL_EAST],
    } as never),
    placedCharacters: opts.characters ?? [],
    gameStatus: 'running',
    currentTurn: 0,
    testMode: opts.testMode ?? true,
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
  regChar(createTestCharacterDef({
    id: 'king', health: 10, isNoble: true,
    behavior: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }],
  }));
  regChar(createTestCharacterDef({
    id: 'guard', health: 10,
    behavior: [{ type: ActionType.WAIT }, { type: ActionType.REPEAT }],
  }));
});

describe('noble_escapes', () => {
  it('a hero Noble walking onto the opening exits at end of turn — alive-despawned, victory, parity', () => {
    const gs = expectParity(() => buildState({
      winConditions: [{ type: 'noble_escapes' }],
      characters: [createTestCharacter({
        characterId: 'king', x: 5, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    }), 2, g => ({
      despawned: !!g.placedCharacters[0].despawned,
      dead: g.placedCharacters[0].dead,
      departedOnTurn: g.placedCharacters[0].departedOnTurn,
      won: checkVictoryConditions(g),
    }));

    const king = gs.placedCharacters[0];
    expect(king.x).toBe(7);               // reached the opening tile on turn 2
    expect(king.despawned).toBe(true);    // exited at end of that turn
    expect(king.dead).toBe(false);        // an escape is a SUCCESS, not a death
    expect(king.active).toBe(false);
    expect(king.departedOnTurn).toBe(2);
    expect(checkVictoryConditions(gs)).toBe(true);
  });

  it('a hero-party ally Noble exits the same way and stops acting', () => {
    regEnemy(createTestEnemyDef({
      id: 'princess', health: 8, isNoble: true,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }],
        defaultFacing: Direction.EAST,
      },
    }));
    const gs = buildState({
      winConditions: [{ type: 'noble_escapes' }],
      enemies: [createTestEnemy({
        enemyId: 'princess', x: 6, y: 2, currentHealth: 8,
        actionIndex: 0, active: true, facing: Direction.EAST, party: 'hero',
      } as never)],
      characters: [createTestCharacter({
        characterId: 'guard', x: 1, y: 1, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs); // princess → (7,2), exits at end of turn
    const princess = gs.puzzle.enemies[0];
    expect(princess.despawned).toBe(true);
    expect(princess.dead).toBeFalsy();
    expect(princess.departedOnTurn).toBe(1);
    expect(checkVictoryConditions(gs)).toBe(true);
    executeTurn(gs); // escaped = off the board: never acts again
    expect(gs.puzzle.enemies[0].x).toBe(7);
  });

  it('a designated opening: standing on a different opening does not exit', () => {
    const gs = buildState({
      winConditions: [{ type: 'noble_escapes', params: { escapeOpening: HALL_NORTH } }],
      hallways: [HALL_EAST, HALL_NORTH],
      characters: [createTestCharacter({
        characterId: 'king', x: 6, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs); // king reaches (7,2) — the EAST hall, not the designated NORTH one
    expect(gs.placedCharacters[0].x).toBe(7);
    expect(gs.placedCharacters[0].despawned).toBeFalsy();
    expect(checkVictoryConditions(gs)).toBe(false);
  });

  it('a non-Noble hero standing on the opening does not exit', () => {
    regChar(createTestCharacterDef({
      id: 'walker', health: 10,
      behavior: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }],
    }));
    const gs = buildState({
      winConditions: [{ type: 'noble_escapes' }],
      characters: [createTestCharacter({
        characterId: 'walker', x: 6, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs);
    expect(gs.placedCharacters[0].x).toBe(7);
    expect(gs.placedCharacters[0].despawned).toBeFalsy();
  });

  it('implied-protect: a Noble dying before escaping is defeat; an escaped Noble is excused', () => {
    // Dead-before-escape → defeat (testMode false so the real check runs;
    // a WAIT guard keeps the zero-active-hero fallback out of the way).
    const lost = buildState({
      winConditions: [{ type: 'noble_escapes' }],
      characters: [
        createTestCharacter({
          characterId: 'king', x: 3, y: 2, facing: Direction.EAST,
          currentHealth: 0, actionIndex: 0, active: false, dead: true, diedOnTurn: 0,
        }),
        createTestCharacter({
          characterId: 'guard', x: 1, y: 1, facing: Direction.EAST,
          currentHealth: 10, actionIndex: 0, active: true,
        }),
      ],
      testMode: false,
    });
    executeTurn(lost);
    expect(lost.gameStatus).toBe('defeat');

    // Escaped → victory, not defeat.
    const won = buildState({
      winConditions: [{ type: 'noble_escapes' }, { type: 'protect_noble' }],
      characters: [
        createTestCharacter({
          characterId: 'king', x: 6, y: 2, facing: Direction.EAST,
          currentHealth: 10, actionIndex: 0, active: true,
        }),
      ],
      testMode: false,
    });
    executeTurn(won); // king reaches (7,2) and exits; both conditions satisfied
    expect(won.placedCharacters[0].despawned).toBe(true);
    expect(won.gameStatus).toBe('victory');
  });
});

// Found by the 2026-09-30 off-board sweep (the scheduled-visitor bug's
// neighbours): an escaped hero is alive-despawned, and two places treated
// that as lost.
describe('an escaped hero is not a lost hero', () => {
  it('characters_alive counts the escaped Noble — the escape wins, it does not defeat', () => {
    const gs = expectParity(() => buildState({
      winConditions: [{ type: 'noble_escapes' }, { type: 'characters_alive', params: { characterCount: 2 } } as WinCondition],
      characters: [
        createTestCharacter({ characterId: 'king', x: 6, y: 2, facing: Direction.EAST, currentHealth: 10, actionIndex: 0, active: true }),
        createTestCharacter({ characterId: 'guard', x: 1, y: 1, facing: Direction.EAST, currentHealth: 10, actionIndex: 0, active: true }),
      ],
      testMode: false,
    }), 1, g => ({ status: g.gameStatus, escaped: !!g.placedCharacters[0].despawned }));
    expect(gs.placedCharacters[0].despawned).toBe(true);
    expect(gs.gameStatus).toBe('victory');
  });

  it('the no_deaths side quest is kept when a hero escapes', () => {
    const gs = buildState({
      winConditions: [{ type: 'noble_escapes' }],
      characters: [createTestCharacter({ characterId: 'king', x: 6, y: 2, facing: Direction.EAST, currentHealth: 10, actionIndex: 0, active: true })],
    });
    gs.puzzle.sideQuests = [{ id: 'nd', type: 'no_deaths', title: 'No deaths', description: '', bonusPoints: 10 }] as never;
    executeTurn(gs);
    expect(gs.placedCharacters[0].despawned).toBe(true);
    expect(checkSideQuests(gs)).toEqual(['nd']);
  });

  // walk_through escorts leave DURING the move, so a linked action after it
  // used to run from the opening tile (a hero's and an enemy's chain alike).
  const walkThrough = (ids: string[]): WinCondition =>
    ({ type: 'entity_escapes', params: { escortEntityIds: ids, escapeRule: 'walk_through' } } as WinCondition);
  const exitThenTurn = [
    { type: ActionType.MOVE_FORWARD, linkedToNext: true },
    { type: ActionType.FACE_DIRECTION, faceDirection: Direction.SOUTH },
    { type: ActionType.REPEAT },
  ];

  it('a hero that steps out through the mouth does not run its linked action', () => {
    regChar(createTestCharacterDef({ id: 'runner', health: 10, behavior: exitThenTurn as never }));
    const gs = buildState({
      winConditions: [walkThrough(['runner'])],
      hallways: [HALL_NORTH],
      characters: [createTestCharacter({ characterId: 'runner', x: 4, y: 0, facing: Direction.NORTH, currentHealth: 10, actionIndex: 0, active: true })],
    });
    executeTurn(gs);
    const runner = gs.placedCharacters[0];
    expect(runner.despawned).toBe(true);
    expect(runner.facing).toBe(Direction.NORTH); // the linked turn-south never ran
  });

  it('an enemy-side escort that steps out does not run its linked action', () => {
    regEnemy(createTestEnemyDef({
      id: 'rat', health: 5,
      behavior: { type: 'active', pattern: exitThenTurn as never, defaultFacing: Direction.NORTH },
    }));
    const gs = buildState({
      winConditions: [walkThrough(['rat'])],
      hallways: [HALL_NORTH],
      enemies: [createTestEnemy({ enemyId: 'rat', x: 4, y: 0, currentHealth: 5, actionIndex: 0, active: true, facing: Direction.NORTH })],
    });
    executeTurn(gs);
    const rat = gs.puzzle.enemies[0];
    expect(rat.despawned).toBe(true);
    expect(rat.facing).toBe(Direction.NORTH);
  });
});
