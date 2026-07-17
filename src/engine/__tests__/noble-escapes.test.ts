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
