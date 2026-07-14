/**
 * Rich trigger-condition vocabulary (2026-07-14) — the state predicates
 * added for REPEAT_UNTIL and parallel event triggers, all pure deterministic
 * functions of game state:
 *
 *   health_below_pct / same_team_health_below_pct (eventValue = %)
 *   noble_in_danger (eventRange = tiles)
 *   turn_reached (eventValue = turn)
 *   opposing_count_at_most / same_team_count_at_most (eventValue = count)
 *   standing_on_goal
 *   repeated_times (REPEAT_UNTIL only — pass counter on the entity)
 *
 * Semantics pinned: same-team predicates exclude self; counts are a census
 * (stealth does NOT hide from them — "0 = all defeated" must be truthful);
 * noble threats ARE stealth-filtered like all opposing sensing; nobles are
 * same-team only (enemy holders never fire noble_in_danger);
 * repeated_times means "the segment has run N times" and its counter resets
 * on fall-through so an outer REPEAT restarts the count.
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
import { Direction, ActionType, SpellTemplate, StatusEffectType, TileType } from '../../types/game';
import type {
  GameState,
  PlacedEnemy,
  PlacedCharacter,
  StatusEffectInstance,
  TriggerEvent,
} from '../../types/game';
import { executeTurn } from '../simulation';
import { checkTriggerCondition } from '../actions';

const baseState = (opts: {
  enemies?: PlacedEnemy[];
  heroes?: PlacedCharacter[];
  tiles?: ReturnType<typeof createEmptyGrid>;
  currentTurn?: number;
}) =>
  createTestGameState({
    puzzle: createTestPuzzle({
      width: 8, height: 5,
      ...(opts.tiles ? { tiles: opts.tiles } : {}),
      enemies: opts.enemies ?? [],
    }),
    placedCharacters: opts.heroes ?? [],
    gameStatus: 'running',
    currentTurn: opts.currentTurn ?? 0,
    testMode: true,
  });

const statusInst = (type: StatusEffectType, duration = 5): StatusEffectInstance => ({
  id: `${type}-inst`, type, statusAssetId: `${type}-asset`,
  duration, value: 0, currentStacks: 1, appliedOnTurn: 0,
  sourceEntityId: 'test', sourceIsEnemy: false, movementSkipCounter: 0,
} as StatusEffectInstance);

const check = (
  holder: PlacedCharacter | PlacedEnemy,
  event: TriggerEvent,
  gs: GameState,
  opts?: { range?: number; value?: number },
) =>
  checkTriggerCondition(holder as PlacedCharacter, event, opts?.range, gs, opts?.value);

beforeEach(() => {
  clearAllRegistries();
  regChar(createTestCharacterDef({ id: 'hero-1', health: 10 }));
  regEnemy(createTestEnemyDef({ id: 'goblin-1', health: 10 }));
});

describe('health thresholds', () => {
  it('health_below_pct is parameterized and works for enemy-shaped holders', () => {
    const gob = createTestEnemy({ enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 3 });
    const gs = baseState({ enemies: [gob] });
    expect(check(gob, 'health_below_pct', gs, { value: 40 })).toBe(true);  // 3 < 4
    expect(check(gob, 'health_below_pct', gs, { value: 25 })).toBe(false); // 3 >= 2.5
  });

  it('same_team_health_below_pct sees wounded teammates but never the holder itself', () => {
    const holder = createTestCharacter({ characterId: 'hero-1', x: 1, y: 1, currentHealth: 10 });
    const wounded = createTestCharacter({ characterId: 'hero-1', x: 2, y: 1, currentHealth: 4 });
    const gs = baseState({ heroes: [holder, wounded] });
    expect(check(holder, 'same_team_health_below_pct', gs, { value: 50 })).toBe(true); // teammate 4/10

    // Only the holder is hurt — the condition ignores self.
    const soloHurt = createTestCharacter({ characterId: 'hero-1', x: 1, y: 1, currentHealth: 2 });
    const healthy = createTestCharacter({ characterId: 'hero-1', x: 2, y: 1, currentHealth: 10 });
    const gs2 = baseState({ heroes: [soloHurt, healthy] });
    expect(check(soloHurt, 'same_team_health_below_pct', gs2, { value: 50 })).toBe(false);
  });
});

describe('noble_in_danger', () => {
  const placeNobleScene = (goblinX: number, goblinStealthed = false) => {
    regAlly(createTestEnemyDef({ id: 'king', health: 8, isNoble: true }));
    const holder = createTestCharacter({ characterId: 'hero-1', x: 1, y: 1, currentHealth: 10 });
    const king = createTestEnemy({ enemyId: 'king', party: 'hero', x: 4, y: 2, currentHealth: 8 });
    const goblin = createTestEnemy({
      enemyId: 'goblin-1', x: goblinX, y: 2, currentHealth: 10,
      ...(goblinStealthed ? { statusEffects: [statusInst(StatusEffectType.STEALTH)] } : {}),
    });
    return { holder, gs: baseState({ heroes: [holder], enemies: [king, goblin] }) };
  };

  it('fires when an opposing entity is within range of a same-team Noble', () => {
    const { holder, gs } = placeNobleScene(5);
    expect(check(holder, 'noble_in_danger', gs, { range: 2 })).toBe(true);
  });

  it('stays quiet when the threat is out of range or stealthed', () => {
    const far = placeNobleScene(7); // distance 3 > 2
    expect(check(far.holder, 'noble_in_danger', far.gs, { range: 2 })).toBe(false);

    const sneaky = placeNobleScene(5, true); // adjacent but stealthed
    expect(check(sneaky.holder, 'noble_in_danger', sneaky.gs, { range: 2 })).toBe(false);
  });

  it('never fires for enemy-side holders (nobles are a same-team concept)', () => {
    const { gs } = placeNobleScene(5);
    const enemyHolder = gs.puzzle.enemies[1]; // the goblin threatening the King
    expect(check(enemyHolder, 'noble_in_danger', gs, { range: 2 })).toBe(false);
  });
});

describe('turn_reached and counts', () => {
  it('turn_reached compares against the current turn number', () => {
    const holder = createTestCharacter({ characterId: 'hero-1', x: 1, y: 1, currentHealth: 10 });
    const gs = baseState({ heroes: [holder], currentTurn: 5 });
    expect(check(holder, 'turn_reached', gs, { value: 5 })).toBe(true);
    expect(check(holder, 'turn_reached', gs, { value: 6 })).toBe(false);
  });

  it('opposing_count_at_most is a census: dead drop out, stealthed still count', () => {
    const holder = createTestCharacter({ characterId: 'hero-1', x: 1, y: 1, currentHealth: 10 });
    const gob1 = createTestEnemy({ enemyId: 'goblin-1', x: 4, y: 2, currentHealth: 10 });
    const gob2 = createTestEnemy({
      enemyId: 'goblin-1', x: 5, y: 2, currentHealth: 10,
      statusEffects: [statusInst(StatusEffectType.STEALTH)],
    });
    const gs = baseState({ heroes: [holder], enemies: [gob1, gob2] });
    expect(check(holder, 'opposing_count_at_most', gs, { value: 2 })).toBe(true);
    expect(check(holder, 'opposing_count_at_most', gs, { value: 1 })).toBe(false); // stealth doesn't hide

    gob1.dead = true;
    expect(check(holder, 'opposing_count_at_most', gs, { value: 1 })).toBe(true);
    expect(check(holder, 'opposing_count_at_most', gs, { value: 0 })).toBe(false);
  });

  it('same_team_count_at_most excludes the holder', () => {
    const holder = createTestCharacter({ characterId: 'hero-1', x: 1, y: 1, currentHealth: 10 });
    const alone = baseState({ heroes: [holder] });
    expect(check(holder, 'same_team_count_at_most', alone, { value: 0 })).toBe(true); // no teammates

    const buddy = createTestCharacter({ characterId: 'hero-1', x: 2, y: 1, currentHealth: 10 });
    const paired = baseState({ heroes: [holder, buddy] });
    expect(check(holder, 'same_team_count_at_most', paired, { value: 0 })).toBe(false);
    expect(check(holder, 'same_team_count_at_most', paired, { value: 1 })).toBe(true);
  });
});

describe('standing_on_goal', () => {
  it('reads the tile under the holder', () => {
    const tiles = createEmptyGrid(8, 5);
    setTile(tiles, 3, 2, TileType.GOAL);
    const onGoal = createTestCharacter({ characterId: 'hero-1', x: 3, y: 2, currentHealth: 10 });
    const offGoal = createTestCharacter({ characterId: 'hero-1', x: 4, y: 2, currentHealth: 10 });
    const gs = baseState({ heroes: [onGoal, offGoal], tiles });
    expect(check(onGoal, 'standing_on_goal', gs)).toBe(true);
    expect(check(offGoal, 'standing_on_goal', gs)).toBe(false);
  });
});

describe('repeated_times through REPEAT_UNTIL', () => {
  const registerStab = () =>
    registerTestSpell('stab', {
      id: 'stab', name: 'Stab', description: '', thumbnailIcon: '',
      templateType: SpellTemplate.MELEE, directionMode: 'current_facing',
      damage: 2,
      sprites: {},
    });

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

  it('"repeated 3 times" runs the segment exactly three times, then falls through the SAME turn', () => {
    registerStab();
    regEnemy(createTestEnemyDef({
      id: 'pacer', health: 5,
      behavior: {
        type: 'active',
        pattern: [
          { type: ActionType.MOVE_FORWARD },
          { type: ActionType.REPEAT_UNTIL, untilEvent: 'repeated_times', untilValue: 3 },
          { type: ActionType.SPELL, spellId: 'stab' },
        ],
        defaultFacing: Direction.WEST,
      },
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'pacer', x: 5, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.WEST,
      })],
      heroes: [waitingHero()], // at (1,2), adjacent once the pacer reaches (2,2)
    });

    const timeline: Array<{ x: number; heroHp: number }> = [];
    for (let t = 0; t < 4; t++) {
      executeTurn(gs);
      timeline.push({ x: gs.puzzle.enemies[0].x, heroHp: gs.placedCharacters[0].currentHealth });
    }
    expect(timeline).toEqual([
      { x: 4, heroHp: 10 }, // segment run 1
      { x: 3, heroHp: 10 }, // 1 pass done < 3 → loop: run 2
      { x: 2, heroHp: 10 }, // 2 passes < 3 → loop: run 3
      { x: 2, heroHp: 8 },  // 3 passes → fall through → stab this turn
    ]);
  });

  it('the pass counter resets on fall-through, so an outer REPEAT restarts the count', () => {
    regEnemy(createTestEnemyDef({
      id: 'pinger', health: 5,
      behavior: {
        type: 'active',
        pattern: [
          { type: ActionType.MOVE_FORWARD },
          { type: ActionType.REPEAT_UNTIL, untilEvent: 'repeated_times', untilValue: 2 },
          { type: ActionType.TURN_AROUND },
          { type: ActionType.REPEAT },
        ],
        defaultFacing: Direction.WEST,
      },
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'pinger', x: 5, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.WEST,
      })],
      heroes: [waitingHero({ x: 7, y: 4 })], // parked out of the corridor
    });

    const xs: number[] = [];
    for (let t = 0; t < 7; t++) {
      executeTurn(gs);
      xs.push(gs.puzzle.enemies[0].x);
    }
    // 2 steps west, turn, 2 steps east, turn, 2 steps west… Without the
    // reset, the second block arrival would fall through immediately after
    // one step and the walk would degenerate.
    expect(xs).toEqual([4, 3, 3, 4, 5, 5, 4]);
  });
});
