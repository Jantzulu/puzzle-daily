/**
 * Hit-stamp conditions, slice 1 (2026-07-14): the stamp foundation on the
 * sacred damage path + the MELEE delivery kind + freshness windows +
 * cycleStartTurn bookkeeping.
 *
 * Mechanism pinned here: when damage lands (past invulnerability and
 * deflect; shield absorption still counts), applyDamageToEntity stamps the
 * victim's hitStamps and the attacker's dealtStamps with the turn number
 * under the delivery kind plus 'any'. Stamps are new-object writes; they
 * ride the enemy→character wrapper copy-backs both directions, and the
 * actor-loop write-backs merge feedback stamps from the original (per-key
 * latest). Windows: 'previous_action' (>= currentTurn - 1), 'this_cycle'
 * (>= cycleStartTurn, refreshed on REPEAT / REPEAT_UNTIL loop-backs),
 * 'ever' (sticky). Zero-damage bookkeeping calls never stamp;
 * initializeGameState strips stamps so nothing leaks across runs.
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestCharacter as regChar,
  registerTestEnemy as regEnemy,
  registerTestSpell,
  createTestPuzzle,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestCharacter,
  createTestEnemy,
  createTestGameState,
} from './helpers';
import { Direction, ActionType, SpellTemplate, StatusEffectType } from '../../types/game';
import type {
  PlacedCharacter,
  PlacedEnemy,
  StatusEffectInstance,
  TriggerEvent,
  HitStampWindow,
} from '../../types/game';
import { executeTurn, initializeGameState } from '../simulation';
import { applyDamageToEntity, checkTriggerCondition } from '../actions';

const baseState = (opts: {
  enemies?: PlacedEnemy[];
  heroes?: PlacedCharacter[];
  currentTurn?: number;
}) =>
  createTestGameState({
    puzzle: createTestPuzzle({
      width: 8, height: 5,
      enemies: opts.enemies ?? [],
    }),
    placedCharacters: opts.heroes ?? [],
    gameStatus: 'running',
    currentTurn: opts.currentTurn ?? 0,
    testMode: true,
  });

const statusInst = (type: StatusEffectType, value = 0): StatusEffectInstance => ({
  id: `${type}-inst`, type, statusAssetId: `${type}-asset`,
  duration: 99, value, currentStacks: 1, appliedOnTurn: 0,
  sourceEntityId: 'test', sourceIsEnemy: false, movementSkipCounter: 0,
} as StatusEffectInstance);

const spellBase = { description: '', thumbnailIcon: '', sprites: {} };

beforeEach(() => {
  clearAllRegistries();
  registerTestSpell('shiv', {
    id: 'shiv', name: 'Shiv', ...spellBase,
    templateType: SpellTemplate.MELEE, directionMode: 'current_facing',
    damage: 2,
  });
  regEnemy(createTestEnemyDef()); // goblin-1, static, health 5
});

describe('melee stamps through executeTurn', () => {
  const meleeScene = () => {
    regChar(createTestCharacterDef({
      id: 'rogue', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'shiv' }, { type: ActionType.REPEAT }] as never,
    }));
    return baseState({
      enemies: [createTestEnemy({ enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5 })],
      heroes: [createTestCharacter({
        characterId: 'rogue', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
  };

  it('stamps the victim (melee + any) and the hero attacker (dealtStamps) with the turn', () => {
    const gs = meleeScene();
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].hitStamps).toEqual({ melee: 1, any: 1 });
    expect(gs.placedCharacters[0].dealtStamps).toEqual({ melee: 1, any: 1 });
    // Victim never landed anything; attacker was never hit.
    expect(gs.puzzle.enemies[0].dealtStamps).toBeUndefined();
    expect(gs.placedCharacters[0].hitStamps).toBeUndefined();
  });

  it('ENEMY attacker dealt-stamps survive the wrapper copy-back', () => {
    regChar(createTestCharacterDef({
      id: 'victim', health: 10,
      behavior: [{ type: ActionType.WAIT }, { type: ActionType.REPEAT }] as never,
    }));
    regEnemy(createTestEnemyDef({
      id: 'assassin', health: 5,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.SPELL, spellId: 'shiv' }],
        defaultFacing: Direction.WEST,
      },
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'assassin', x: 3, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.WEST,
      })],
      heroes: [createTestCharacter({
        characterId: 'victim', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs);
    expect(gs.placedCharacters[0].hitStamps).toEqual({ melee: 1, any: 1 });
    expect(gs.puzzle.enemies[0].dealtStamps).toEqual({ melee: 1, any: 1 });
  });

  it('later hits overwrite the stamp turn; new-object writes keep old snapshots intact', () => {
    const gs = meleeScene();
    executeTurn(gs);
    const turn1Stamps = gs.puzzle.enemies[0].hitStamps!;
    executeTurn(gs); // REPEAT loops the shiv — hits again on turn 2
    expect(gs.puzzle.enemies[0].hitStamps).toEqual({ melee: 2, any: 2 });
    // The turn-1 record was not mutated in place (replay snapshots share it).
    expect(turn1Stamps).toEqual({ melee: 1, any: 1 });
  });
});

describe('stamp gates on the damage path', () => {
  it('zero-damage bookkeeping calls do not stamp', () => {
    const gob = createTestEnemy({ enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5 });
    const gs = baseState({ enemies: [gob], currentTurn: 3 });
    applyDamageToEntity(gob, 0, gs);
    expect(gob.hitStamps).toBeUndefined();
  });

  it('a fully shield-absorbed blow still stamps (the hit connected)', () => {
    const gob = createTestEnemy({
      enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
      statusEffects: [statusInst(StatusEffectType.SHIELD, 10)],
    });
    const gs = baseState({ enemies: [gob], currentTurn: 3 });
    applyDamageToEntity(gob, 2, gs, undefined, 'melee');
    expect(gob.currentHealth).toBe(5);
    expect(gob.hitStamps).toEqual({ melee: 3, any: 3 });
  });

  it('an invulnerable target is never stamped', () => {
    const gob = createTestEnemy({
      enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
      statusEffects: [statusInst(StatusEffectType.INVULNERABLE)],
    });
    const gs = baseState({ enemies: [gob], currentTurn: 3 });
    applyDamageToEntity(gob, 2, gs, undefined, 'melee');
    expect(gob.hitStamps).toBeUndefined();
  });

  it('a deflected attacker gets no dealt credit; the bounced damage stamps the attacker as victim', () => {
    const attacker = createTestCharacter({ characterId: 'hero-1', x: 2, y: 2, currentHealth: 10 });
    const deflector = createTestEnemy({
      enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
      statusEffects: [statusInst(StatusEffectType.DEFLECT)],
    });
    const gs = baseState({ enemies: [deflector], heroes: [attacker], currentTurn: 3 });
    applyDamageToEntity(deflector, 2, gs, attacker, 'melee');
    expect(deflector.hitStamps).toBeUndefined();   // took no damage
    expect(attacker.dealtStamps).toBeUndefined();  // landed nothing
    expect(attacker.hitStamps).toEqual({ melee: 3, any: 3 }); // own blade came back
  });
});

describe('freshness windows', () => {
  const holderWith = (opts: Partial<PlacedCharacter>) => {
    regChar(createTestCharacterDef({ id: 'hero-1', health: 10 }));
    return createTestCharacter({ characterId: 'hero-1', x: 1, y: 1, currentHealth: 10, ...opts });
  };
  const check = (holder: PlacedCharacter, event: TriggerEvent, gs: ReturnType<typeof baseState>, window?: HitStampWindow) =>
    checkTriggerCondition(holder, event, undefined, gs, undefined, window);

  it("'previous_action' (the default) spans this turn and the one before", () => {
    const holder = holderWith({ hitStamps: { melee: 4, any: 4 } });
    expect(check(holder, 'hit_by_melee', baseState({ currentTurn: 4 }))).toBe(true);
    expect(check(holder, 'hit_by_melee', baseState({ currentTurn: 5 }), 'previous_action')).toBe(true);
    expect(check(holder, 'hit_by_melee', baseState({ currentTurn: 6 }))).toBe(false);
  });

  it("'ever' is sticky; a missing stamp is false in every window", () => {
    const holder = holderWith({ hitStamps: { melee: 1, any: 1 } });
    expect(check(holder, 'hit_by_melee', baseState({ currentTurn: 50 }), 'ever')).toBe(true);
    expect(check(holder, 'hit_by_projectile', baseState({ currentTurn: 50 }), 'ever')).toBe(false);
    const clean = holderWith({});
    expect(check(clean, 'hit_by_any', baseState({ currentTurn: 1 }), 'ever')).toBe(false);
  });

  it("'this_cycle' measures from cycleStartTurn (unset = since the game started)", () => {
    const inCycle = holderWith({ hitStamps: { any: 6 }, cycleStartTurn: 5 });
    expect(check(inCycle, 'hit_by_any', baseState({ currentTurn: 9 }), 'this_cycle')).toBe(true);
    const beforeCycle = holderWith({ hitStamps: { any: 4 }, cycleStartTurn: 5 });
    expect(check(beforeCycle, 'hit_by_any', baseState({ currentTurn: 9 }), 'this_cycle')).toBe(false);
    const neverWrapped = holderWith({ hitStamps: { any: 1 } });
    expect(check(neverWrapped, 'hit_by_any', baseState({ currentTurn: 9 }), 'this_cycle')).toBe(true);
  });

  it('landed_* mirrors read dealtStamps', () => {
    const holder = holderWith({ dealtStamps: { melee: 2, any: 2 } });
    expect(check(holder, 'landed_melee_hit', baseState({ currentTurn: 2 }))).toBe(true);
    expect(check(holder, 'landed_any_hit', baseState({ currentTurn: 9 }), 'ever')).toBe(true);
    expect(check(holder, 'landed_projectile_hit', baseState({ currentTurn: 2 }))).toBe(false);
  });
});

describe('cycleStartTurn bookkeeping', () => {
  it('REPEAT loop-back stamps the cycle start each wrap (hero loop)', () => {
    regChar(createTestCharacterDef({
      id: 'walker', health: 10,
      behavior: [{ type: ActionType.WAIT }, { type: ActionType.REPEAT }] as never,
    }));
    const gs = baseState({
      heroes: [createTestCharacter({ characterId: 'walker', x: 1, y: 1, currentHealth: 10 })],
    });
    executeTurn(gs); // turn 1: WAIT — no wrap yet
    expect(gs.placedCharacters[0].cycleStartTurn).toBeUndefined();
    executeTurn(gs); // turn 2: REPEAT wraps
    expect(gs.placedCharacters[0].cycleStartTurn).toBe(2);
    executeTurn(gs); // turn 3: wraps again
    expect(gs.placedCharacters[0].cycleStartTurn).toBe(3);
  });

  it('REPEAT_UNTIL loop-back stamps the cycle start (enemy loop)', () => {
    regChar(createTestCharacterDef({ id: 'hero-1', health: 10, behavior: [{ type: ActionType.WAIT }, { type: ActionType.REPEAT }] as never }));
    regEnemy(createTestEnemyDef({
      id: 'patroller', health: 5,
      behavior: {
        type: 'active',
        // Loops WAIT forever — turn_reached 99 never fires in this test.
        pattern: [
          { type: ActionType.WAIT },
          { type: ActionType.REPEAT_UNTIL, untilEvent: 'turn_reached', untilValue: 99 },
        ],
        defaultFacing: Direction.WEST,
      },
    }));
    const gs = baseState({
      enemies: [createTestEnemy({ enemyId: 'patroller', x: 5, y: 2, currentHealth: 5, actionIndex: 0, active: true })],
      heroes: [createTestCharacter({ characterId: 'hero-1', x: 1, y: 1, currentHealth: 10 })],
    });
    executeTurn(gs); // turn 1: WAIT
    expect(gs.puzzle.enemies[0].cycleStartTurn).toBeUndefined();
    executeTurn(gs); // turn 2: REPEAT_UNTIL loops back
    expect(gs.puzzle.enemies[0].cycleStartTurn).toBe(2);
  });
});

describe('end-to-end: retaliation trigger with the previous_action window', () => {
  it('fires on the hit turn and the next, then goes quiet', () => {
    // Goblin retaliates with a shiv when hit by melee. Hero shivs ONCE,
    // then WAITs long enough that REPEAT never re-swings within the test.
    // Trigger phase runs after hero actions: stamp lands turn 1 →
    // retaliation fires turns 1 and 2, silent from 3.
    regChar(createTestCharacterDef({
      id: 'rogue', health: 10,
      behavior: [
        { type: ActionType.SPELL, spellId: 'shiv' },
        { type: ActionType.WAIT }, { type: ActionType.WAIT },
        { type: ActionType.WAIT }, { type: ActionType.WAIT },
        { type: ActionType.REPEAT },
      ] as never,
    }));
    regEnemy(createTestEnemyDef({
      id: 'spiker', health: 20,
      behavior: {
        type: 'active',
        pattern: [{
          type: ActionType.SPELL, spellId: 'shiv',
          executionMode: 'parallel',
          trigger: { mode: 'on_event', event: 'hit_by_melee' },
        }],
        defaultFacing: Direction.WEST,
      },
    }));
    const gs = baseState({
      enemies: [createTestEnemy({ enemyId: 'spiker', x: 3, y: 2, currentHealth: 20, facing: Direction.WEST, actionIndex: 0, active: true })],
      heroes: [createTestCharacter({ characterId: 'rogue', x: 2, y: 2, facing: Direction.EAST, currentHealth: 10 })],
    });
    executeTurn(gs); // hero shivs (goblin 20→18); retaliation fires (hero 10→8)
    expect(gs.placedCharacters[0].currentHealth).toBe(8);
    executeTurn(gs); // stamp (1) >= currentTurn-1 (1): fires again (8→6)
    expect(gs.placedCharacters[0].currentHealth).toBe(6);
    executeTurn(gs); // stamp (1) < currentTurn-1 (2): quiet
    expect(gs.placedCharacters[0].currentHealth).toBe(6);
  });
});

describe('fresh runs', () => {
  it('initializeGameState strips stamps and cycle bookkeeping from placements', () => {
    const stale = createTestEnemy({
      enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 2,
      hitStamps: { melee: 7, any: 7 }, dealtStamps: { any: 4 }, cycleStartTurn: 6,
    });
    const gs = initializeGameState(createTestPuzzle({ enemies: [stale] }));
    expect(gs.puzzle.enemies[0].hitStamps).toBeUndefined();
    expect(gs.puzzle.enemies[0].dealtStamps).toBeUndefined();
    expect(gs.puzzle.enemies[0].cycleStartTurn).toBeUndefined();
  });
});
