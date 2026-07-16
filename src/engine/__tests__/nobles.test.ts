/**
 * NOBLES — slice 2 engine pins (user design 2026-07-13). isNoble is an
 * ASSET flag (ally assets + hero Characters); a "placed Noble" is any
 * hero-party placement whose asset carries it. Three authorable conditions:
 *   protect_noble        — win requires all Nobles alive
 *   noble_survives_turns — Nobles alive at end of turn X = victory
 *   noble_reaches_goal   — a Noble on a GOAL tile = victory
 * UNIFORM IMPLIED-PROTECT: any noble condition makes a Noble death an
 * immediate defeat (checkDefeatConditions).
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
  createEmptyGrid,
  setTile,
} from './helpers';
import { Direction, ActionType, SpellTemplate, TileType } from '../../types/game';
import type { PlacedEnemy, PlacedCharacter, WinCondition, TileOrNull } from '../../types/game';
import { executeTurn } from '../simulation';

beforeEach(() => {
  clearAllRegistries();
  registerTestSpell('bolt', {
    id: 'bolt', name: 'Bolt', description: '', thumbnailIcon: '', sprites: {},
    templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
    damage: 2, projectileSpeed: 4, range: 6,
  });
  regEnemy(createTestEnemyDef({ id: 'goblin-1', health: 5 }));
  regEnemy(createTestEnemyDef({
    id: 'warlock', health: 10,
    behavior: {
      type: 'active',
      pattern: [{
        type: ActionType.SPELL, spellId: 'bolt',
        autoTargetNearestCharacter: true,
      }, { type: ActionType.REPEAT }],
      defaultFacing: Direction.EAST,
    },
  }));
  // Default idle hero — a game with NO active heroes ends immediately via
  // the endgame fallback (simulation.ts ~2236), so every scenario parks one.
  regChar(createTestCharacterDef({
    id: 'hero-1', health: 10,
    behavior: [{ type: ActionType.WAIT }, { type: ActionType.REPEAT }] as never,
  }));
  // The King: a static Noble ally
  regAlly(createTestEnemyDef({ id: 'king', health: 5, isNoble: true }));
  // A walking Noble ally, for the escort condition
  regAlly(createTestEnemyDef({
    id: 'princess', health: 5, isNoble: true,
    behavior: {
      type: 'active',
      pattern: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }],
      defaultFacing: Direction.EAST,
    },
  }));
});

const placedAlly = (allyId: string, x: number, y: number, extra?: Partial<PlacedEnemy>): PlacedEnemy =>
  createTestEnemy({
    enemyId: allyId, x, y, currentHealth: 5,
    actionIndex: 0, active: true, facing: Direction.EAST,
    party: 'hero',
    ...extra,
  });

const stateWith = (opts: {
  winConditions: WinCondition[];
  enemies?: PlacedEnemy[];
  heroes?: PlacedCharacter[];
  tiles?: TileOrNull[][];
}) =>
  createTestGameState({
    puzzle: createTestPuzzle({
      width: 8, height: 5,
      // Only pass tiles when set — an explicit `tiles: undefined` key rides
      // the factory's `...overrides` spread and clobbers the default grid.
      ...(opts.tiles ? { tiles: opts.tiles } : {}),
      enemies: opts.enemies ?? [],
      winConditions: opts.winConditions,
    }),
    placedCharacters: opts.heroes ?? [],
    gameStatus: 'running',
    currentTurn: 0,
    testMode: false, // win/lose checks must run
  });

describe('noble conditions (slice 2: engine)', () => {
  it('protect_noble: the Noble ally dying is an immediate defeat', () => {
    const gs = stateWith({
      winConditions: [{ type: 'defeat_all_enemies' }, { type: 'protect_noble' }],
      enemies: [
        createTestEnemy({ enemyId: 'warlock', x: 0, y: 2, currentHealth: 10, actionIndex: 0, active: true, facing: Direction.EAST }),
        placedAlly('king', 4, 2, { currentHealth: 2 }),
      ],
      heroes: [createTestCharacter({ x: 7, y: 4, currentHealth: 10, actionIndex: 0, active: true })],
    });
    executeTurn(gs); // warlock bolt kills the king (2 hp, 2 dmg)
    executeTurn(gs);
    expect(gs.gameStatus).toBe('defeat'); // hero is alive — the King's death alone loses
  });

  it('protect_noble composes with defeat_all_enemies: win with the King alive', () => {
    regChar(createTestCharacterDef({
      id: 'archer', health: 10,
      behavior: [{
        type: ActionType.SPELL, spellId: 'bolt', autoTargetNearestEnemy: true,
      }, { type: ActionType.REPEAT }] as never,
    }));
    const gs = stateWith({
      winConditions: [{ type: 'defeat_all_enemies' }, { type: 'protect_noble' }],
      enemies: [
        createTestEnemy({ enemyId: 'goblin-1', x: 4, y: 2, currentHealth: 2, actionIndex: 0, active: true }),
        placedAlly('king', 7, 0),
      ],
      heroes: [createTestCharacter({
        characterId: 'archer', x: 0, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs);
    executeTurn(gs);
    expect(gs.gameStatus).toBe('victory');
  });

  it('noble_survives_turns: victory at the end of turn N with the Noble alive', () => {
    const gs = stateWith({
      winConditions: [{ type: 'noble_survives_turns', params: { turns: 2 } }],
      enemies: [placedAlly('king', 4, 2)],
      heroes: [createTestCharacter({ x: 7, y: 4, currentHealth: 10, actionIndex: 0, active: true })],
    });
    executeTurn(gs);
    expect(gs.gameStatus).toBe('running'); // turn 1 < 2
    executeTurn(gs);
    executeTurn(gs);
    expect(gs.gameStatus).toBe('victory');
  });

  it('noble_survives_turns: the Noble dying before turn N is defeat, not a wait-out', () => {
    const gs = stateWith({
      winConditions: [{ type: 'noble_survives_turns', params: { turns: 8 } }],
      enemies: [
        createTestEnemy({ enemyId: 'warlock', x: 0, y: 2, currentHealth: 10, actionIndex: 0, active: true, facing: Direction.EAST }),
        placedAlly('king', 4, 2, { currentHealth: 2 }),
      ],
      heroes: [createTestCharacter({ x: 7, y: 4, currentHealth: 10, actionIndex: 0, active: true })],
    });
    executeTurn(gs);
    executeTurn(gs);
    expect(gs.gameStatus).toBe('defeat'); // implied-protect fires immediately
  });

  it('noble_reaches_goal: the Princess walking onto the goal tile wins', () => {
    const tiles = createEmptyGrid(8, 5);
    setTile(tiles, 4, 2, TileType.GOAL);
    const gs = stateWith({
      winConditions: [{ type: 'noble_reaches_goal' }],
      tiles,
      enemies: [placedAlly('princess', 2, 2)],
      heroes: [createTestCharacter({ x: 0, y: 4, currentHealth: 10, actionIndex: 0, active: true })],
    });
    executeTurn(gs); // princess -> (3,2)
    expect(gs.gameStatus).toBe('running');
    executeTurn(gs); // princess -> (4,2), the goal
    expect(gs.gameStatus).toBe('victory');
  });

  it('a Noble HERO dying is a defeat even while other heroes live', () => {
    regChar(createTestCharacterDef({ id: 'prince', health: 10, isNoble: true, behavior: [{ type: ActionType.WAIT }] as never }));
    regChar(createTestCharacterDef({ id: 'bodyguard', health: 10, behavior: [{ type: ActionType.WAIT }] as never }));
    const gs = stateWith({
      winConditions: [{ type: 'defeat_all_enemies' }, { type: 'protect_noble' }],
      enemies: [createTestEnemy({ enemyId: 'warlock', x: 0, y: 2, currentHealth: 10, actionIndex: 0, active: true, facing: Direction.EAST })],
      heroes: [
        createTestCharacter({ characterId: 'prince', x: 4, y: 2, currentHealth: 2, actionIndex: 0, active: true }),
        createTestCharacter({ characterId: 'bodyguard', x: 7, y: 4, currentHealth: 10, actionIndex: 0, active: true }),
      ],
    });
    executeTurn(gs); // warlock's nearest opposing target is the prince (dist 4 vs ~7.3)
    executeTurn(gs);
    expect(gs.gameStatus).toBe('defeat');
    expect(gs.placedCharacters[1].currentHealth).toBe(10); // bodyguard untouched
  });

  it('real and headless agree on a noble defeat', () => {
    const build = () => stateWith({
      winConditions: [{ type: 'defeat_all_enemies' }, { type: 'protect_noble' }],
      enemies: [
        createTestEnemy({ enemyId: 'warlock', x: 0, y: 2, currentHealth: 10, actionIndex: 0, active: true, facing: Direction.EAST }),
        placedAlly('king', 4, 2, { currentHealth: 2 }),
      ],
      heroes: [createTestCharacter({ x: 7, y: 4, currentHealth: 10, actionIndex: 0, active: true })],
    });
    const visual = build();
    const headless = build();
    headless.headlessMode = true;
    for (let t = 0; t < 3; t++) {
      executeTurn(visual);
      executeTurn(headless);
    }
    expect(visual.gameStatus).toBe('defeat');
    expect(headless.gameStatus).toBe('defeat');
  });
});
