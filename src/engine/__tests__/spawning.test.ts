/**
 * Tests for src/engine/spawning.ts — mid-game entity spawning (summon
 * groundwork) and the executeTurn idle-on-spawn-turn guards.
 * Uses module mocks from helpers.ts.
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestEnemy as regEnemy,
  createTestPuzzle,
  createTestEnemyDef,
  createTestEnemy,
  createTestGameState,
} from './helpers';
import { Direction, ActionType } from '../../types/game';
import { executeTurn, checkVictoryConditions } from '../simulation';
import { spawnEnemyMidGame } from '../spawning';

beforeEach(() => {
  clearAllRegistries();
  regEnemy(createTestEnemyDef()); // goblin-1, static, health 5
  regEnemy(
    createTestEnemyDef({
      id: 'walker',
      health: 3,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }],
        defaultFacing: Direction.EAST,
      },
    }),
  );
});

describe('spawnEnemyMidGame', () => {
  it('appends a fully-initialized entity without touching existing indices', () => {
    const original = createTestEnemy({ x: 4, y: 4 });
    const gs = createTestGameState({
      puzzle: createTestPuzzle({ enemies: [original] }),
      currentTurn: 3,
    });

    const spawned = spawnEnemyMidGame(gs, {
      enemyId: 'walker',
      x: 1,
      y: 2,
      party: 'enemy',
      excludeFromWinConditions: true,
    });

    expect(spawned).not.toBeNull();
    expect(gs.puzzle.enemies).toHaveLength(2);
    expect(gs.puzzle.enemies[0]).toBe(original); // index 0 untouched
    expect(gs.puzzle.enemies[1]).toBe(spawned); // append-only
    expect(spawned!.currentHealth).toBe(3); // from the asset
    expect(spawned!.facing).toBe(Direction.EAST); // asset defaultFacing
    expect(spawned!.spawnedOnTurn).toBe(3);
    expect(spawned!.excludeFromWinConditions).toBe(true);
    expect(spawned!.actionIndex).toBe(0);
    expect(spawned!.active).toBe(true);
    expect(spawned!.dead).toBe(false);
  });

  it('explicit facing wins over the asset defaultFacing', () => {
    const gs = createTestGameState({ puzzle: createTestPuzzle() });
    const spawned = spawnEnemyMidGame(gs, {
      enemyId: 'walker',
      x: 1,
      y: 1,
      facing: Direction.NORTH,
    });
    expect(spawned!.facing).toBe(Direction.NORTH);
  });

  it('returns null for an unknown enemy asset and appends nothing', () => {
    const gs = createTestGameState({ puzzle: createTestPuzzle() });
    expect(spawnEnemyMidGame(gs, { enemyId: 'nope', x: 0, y: 0 })).toBeNull();
    expect(gs.puzzle.enemies).toHaveLength(0);
  });
});

describe('executeTurn — spawn-turn idle guard', () => {
  it('an entity spawned this turn does not act; it acts from action 0 next turn', () => {
    // executeTurn increments currentTurn on entry, so an entity stamped
    // spawnedOnTurn=1 in a state at currentTurn=0 is exactly "spawned during
    // turn 1" — the state a mid-turn summon cast would produce.
    const gs = createTestGameState({
      puzzle: createTestPuzzle({
        width: 8,
        height: 5,
        winConditions: [{ type: 'survive_turns', params: { turns: 99 } }],
        enemies: [
          createTestEnemy({
            enemyId: 'walker',
            x: 2,
            y: 2,
            currentHealth: 3,
            actionIndex: 0,
            active: true,
            facing: Direction.EAST,
            spawnedOnTurn: 1,
          }),
        ],
      }),
      gameStatus: 'running',
      currentTurn: 0,
      testMode: true, // no heroes on the board — skip end-of-game evaluation
    });

    executeTurn(gs); // turn 1: spawn turn — must stay idle
    expect(gs.puzzle.enemies[0].x).toBe(2);
    expect(gs.puzzle.enemies[0].actionIndex).toBe(0);

    executeTurn(gs); // turn 2: first real turn — moves east
    expect(gs.puzzle.enemies[0].x).toBe(3);
  });

  it('an entity appended mid-game is fully live: a projectile-free win check still sees only real kill targets', () => {
    // Summon (flagged) appended while a real enemy remains → no win.
    // Real enemy dies → win, even though the flagged summon is alive.
    const gs = createTestGameState({
      puzzle: createTestPuzzle({
        enemies: [createTestEnemy({ x: 4, y: 4 })],
      }),
      gameStatus: 'running',
      currentTurn: 1,
    });
    spawnEnemyMidGame(gs, {
      enemyId: 'walker',
      x: 1,
      y: 1,
      excludeFromWinConditions: true,
    });

    expect(checkVictoryConditions(gs)).toBe(false);
    gs.puzzle.enemies[0].dead = true;
    expect(checkVictoryConditions(gs)).toBe(true);
  });
});
