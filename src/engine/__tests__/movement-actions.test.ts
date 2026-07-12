/**
 * Strafe + diagonal movement actions (fixed 2026-07-12). MOVE_LEFT/RIGHT
 * and the four MOVE_DIAGONAL_* types were offered in the behavior editor
 * but had no executeAction case — authoring them produced an entity that
 * silently skipped those beats (audit side-finding).
 *
 * Semantics pinned here: strafes move perpendicular to FACING without
 * turning; diagonals move on the ABSOLUTE compass diagonal, facing
 * unchanged; all six respect walls, the slow/haste cadence, and work for
 * both hero and (wrapped) enemy actors.
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestCharacter as regChar,
  registerTestEnemy as regEnemy,
  createEmptyGrid,
  createTestPuzzle,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestCharacter,
  createTestEnemy,
  createTestGameState,
  setTile,
} from './helpers';
import { Direction, TileType, ActionType } from '../../types/game';
import type { PlacedEnemy, PlacedCharacter, TileOrNull, StatusEffectInstance } from '../../types/game';
import { StatusEffectType } from '../../types/game';
import { executeTurn } from '../simulation';

const baseState = (opts: {
  enemies?: PlacedEnemy[];
  heroes?: PlacedCharacter[];
  tiles?: TileOrNull[][];
}) =>
  createTestGameState({
    puzzle: createTestPuzzle({
      width: 7, height: 7,
      ...(opts.tiles ? { tiles: opts.tiles } : {}),
      enemies: opts.enemies ?? [],
    }),
    placedCharacters: opts.heroes ?? [],
    gameStatus: 'running',
    currentTurn: 0,
    testMode: true,
  });

const regMoverHero = (moveType: ActionType) =>
  regChar(createTestCharacterDef({
    id: 'mover', health: 10,
    behavior: [{ type: moveType }, { type: ActionType.REPEAT }] as never,
  }));

const placedMover = (overrides?: Partial<PlacedCharacter>) =>
  createTestCharacter({
    characterId: 'mover', x: 3, y: 3, facing: Direction.EAST,
    currentHealth: 10, actionIndex: 0, active: true,
    ...overrides,
  });

beforeEach(clearAllRegistries);

describe('hero strafes', () => {
  it('MOVE_LEFT strafes north of an east-facing hero, facing unchanged', () => {
    regMoverHero(ActionType.MOVE_LEFT);
    const gs = baseState({ heroes: [placedMover()] });
    executeTurn(gs);
    expect(gs.placedCharacters[0].x).toBe(3);
    expect(gs.placedCharacters[0].y).toBe(2); // left of EAST = NORTH
    expect(gs.placedCharacters[0].facing).toBe(Direction.EAST);
  });

  it('MOVE_RIGHT strafes south of an east-facing hero, facing unchanged', () => {
    regMoverHero(ActionType.MOVE_RIGHT);
    const gs = baseState({ heroes: [placedMover()] });
    executeTurn(gs);
    expect(gs.placedCharacters[0].y).toBe(4);
    expect(gs.placedCharacters[0].facing).toBe(Direction.EAST);
  });

  it('a strafe into a wall is blocked', () => {
    regMoverHero(ActionType.MOVE_LEFT);
    const tiles = createEmptyGrid(7, 7);
    setTile(tiles, 3, 2, TileType.WALL);
    const gs = baseState({ tiles, heroes: [placedMover()] });
    executeTurn(gs);
    expect(gs.placedCharacters[0].x).toBe(3);
    expect(gs.placedCharacters[0].y).toBe(3);
  });
});

describe('hero diagonals (absolute compass, facing unchanged)', () => {
  const cases: Array<[ActionType, number, number]> = [
    [ActionType.MOVE_DIAGONAL_NE, 4, 2],
    [ActionType.MOVE_DIAGONAL_NW, 2, 2],
    [ActionType.MOVE_DIAGONAL_SE, 4, 4],
    [ActionType.MOVE_DIAGONAL_SW, 2, 4],
  ];
  for (const [moveType, x, y] of cases) {
    it(`${moveType} moves (3,3) → (${x},${y})`, () => {
      regMoverHero(moveType);
      const gs = baseState({ heroes: [placedMover()] });
      executeTurn(gs);
      expect(gs.placedCharacters[0].x).toBe(x);
      expect(gs.placedCharacters[0].y).toBe(y);
      expect(gs.placedCharacters[0].facing).toBe(Direction.EAST);
    });
  }
});

describe('enemy actors through the wrapper', () => {
  it('a strafing enemy sidesteps every turn without turning', () => {
    regEnemy(createTestEnemyDef({
      id: 'crab', health: 5,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.MOVE_LEFT }, { type: ActionType.REPEAT }],
        defaultFacing: Direction.EAST,
      },
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'crab', x: 3, y: 4, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.EAST,
      })],
    });
    executeTurn(gs);
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].x).toBe(3);
    expect(gs.puzzle.enemies[0].y).toBe(2); // two sidesteps north
    expect(gs.puzzle.enemies[0].facing).toBe(Direction.EAST);
  });

  it('a diagonal enemy cuts across the board', () => {
    regEnemy(createTestEnemyDef({
      id: 'bishop', health: 5,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.MOVE_DIAGONAL_SE }, { type: ActionType.REPEAT }],
        defaultFacing: Direction.SOUTH,
      },
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'bishop', x: 1, y: 1, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.SOUTH,
      })],
    });
    executeTurn(gs);
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].x).toBe(3);
    expect(gs.puzzle.enemies[0].y).toBe(3);
  });
});

describe('status cadence applies to the new movement actions', () => {
  it('SLOW skips every other strafe', () => {
    const slow: StatusEffectInstance = {
      id: 'slow-inst', type: StatusEffectType.SLOW, statusAssetId: 'slow-asset',
      duration: 99, currentStacks: 1, appliedOnTurn: 0,
      sourceEntityId: 'test', sourceIsEnemy: false, movementSkipCounter: 0,
    } as StatusEffectInstance;
    regMoverHero(ActionType.MOVE_RIGHT);
    const gs = baseState({ heroes: [placedMover({ y: 1, statusEffects: [slow] })] });
    const ys: number[] = [];
    for (let t = 0; t < 4; t++) {
      executeTurn(gs);
      ys.push(gs.placedCharacters[0].y);
    }
    expect(ys).toEqual([2, 2, 3, 3]); // move, skip, move, skip
  });

  it('HASTE doubles every other diagonal', () => {
    const haste: StatusEffectInstance = {
      id: 'haste-inst', type: StatusEffectType.HASTE, statusAssetId: 'haste-asset',
      duration: 99, currentStacks: 1, appliedOnTurn: 0,
      sourceEntityId: 'test', sourceIsEnemy: false, movementSkipCounter: 0,
    } as StatusEffectInstance;
    regMoverHero(ActionType.MOVE_DIAGONAL_SE);
    const gs = baseState({ heroes: [placedMover({ x: 0, y: 0, statusEffects: [haste] })] });
    executeTurn(gs); // doubled: (0,0) → (2,2)
    expect(gs.placedCharacters[0].x).toBe(2);
    expect(gs.placedCharacters[0].y).toBe(2);
    executeTurn(gs); // single: → (3,3)
    expect(gs.placedCharacters[0].x).toBe(3);
  });
});
