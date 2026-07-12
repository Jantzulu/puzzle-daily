/**
 * Engine audit sweep 1 (docs/engine-audit-plan.md): death triggers × kill path.
 *
 * An entity's authored on_death trigger must fire exactly once no matter
 * which delivery killed it: melee, cone, AOE, projectile (visual + headless),
 * contact, tile damage, DOT, push, deflect reflection, persistent zone.
 *
 * Observable: the victim's on_death action is a SUMMON spell aimed at a free
 * tile — each firing appends one 'spawnling'. Counting spawnlings counts
 * trigger firings; no engine internals are asserted.
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestCharacter as regChar,
  registerTestEnemy as regEnemy,
  registerTestSpell,
  registerTestStatusEffect,
  registerTestTileType,
  createEmptyGrid,
  createTestPuzzle,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestCharacter,
  createTestEnemy,
  createTestGameState,
  setTile,
} from './helpers';
import { Direction, ActionType, SpellTemplate, StatusEffectType } from '../../types/game';
import type { GameState, PlacedEnemy, PlacedCharacter, StatusEffectInstance } from '../../types/game';
import { executeTurn } from '../simulation';

// ==========================================
// Shared fixtures
// ==========================================

// Editor-authored shape: trigger config only exists on parallel-mode actions
// (BehaviorSequenceBuilder), so the sequential executors skip them and only
// executeDeathTriggers/evaluateTriggers ever fire them.
const onDeathSummon = {
  type: ActionType.SPELL,
  spellId: 'death-summon',
  executionMode: 'parallel' as const,
  trigger: { mode: 'on_event' as const, event: 'on_death' as const },
};

/** The on-death observable: summons an inert 'spawnling' one tile NORTH. */
const registerDeathSummon = () => {
  regEnemy(createTestEnemyDef({ id: 'spawnling', health: 1 })); // static, never acts
  registerTestSpell('death-summon', {
    id: 'death-summon', name: 'Death Summon', description: '', thumbnailIcon: '',
    templateType: SpellTemplate.SUMMON,
    directionMode: 'fixed', defaultDirections: [Direction.NORTH],
    summonEnemyId: 'spawnling',
    sprites: {},
  });
};

const spawnlings = (gs: GameState) =>
  gs.puzzle.enemies.filter(e => e.enemyId === 'spawnling');

/** Static 2hp enemy whose only authored action is the on_death summon. */
const regBomber = () =>
  regEnemy(createTestEnemyDef({
    id: 'bomber', health: 2,
    behavior: {
      type: 'active',
      pattern: [onDeathSummon],
      defaultFacing: Direction.WEST,
    },
  }));

const placedBomber = (overrides?: Partial<PlacedEnemy>) =>
  createTestEnemy({
    enemyId: 'bomber', x: 3, y: 2, currentHealth: 2,
    actionIndex: 0, active: true, facing: Direction.WEST,
    ...overrides,
  });

/** Hero with a single one-shot attack action. */
const regKillerHero = (spellId: string, behaviorOverride?: object[]) =>
  regChar(createTestCharacterDef({
    id: 'killer', health: 10,
    behavior: (behaviorOverride ?? [{ type: ActionType.SPELL, spellId }]) as never,
  }));

const placedKiller = (overrides?: Partial<PlacedCharacter>) =>
  createTestCharacter({
    characterId: 'killer', x: 2, y: 2, facing: Direction.EAST,
    currentHealth: 10, actionIndex: 0, active: true,
    ...overrides,
  });

const baseState = (opts: {
  enemies?: PlacedEnemy[];
  heroes?: PlacedCharacter[];
  tiles?: ReturnType<typeof createEmptyGrid>;
  headless?: boolean;
}) =>
  createTestGameState({
    puzzle: createTestPuzzle({
      width: 8, height: 5,
      ...(opts.tiles ? { tiles: opts.tiles } : {}),
      enemies: opts.enemies ?? [],
    }),
    placedCharacters: opts.heroes ?? [],
    gameStatus: 'running',
    currentTurn: 0,
    testMode: true,
    ...(opts.headless ? { headlessMode: true } : {}),
  });

const statusInst = (
  type: StatusEffectType,
  value: number,
  duration = 5,
): StatusEffectInstance => ({
  id: `${type}-inst`, type, statusAssetId: `${type}-asset`,
  duration, value, currentStacks: 1, appliedOnTurn: 0,
  sourceEntityId: 'test', sourceIsEnemy: false, movementSkipCounter: 0,
} as StatusEffectInstance);

const registerKillerSpells = () => {
  const base = { description: '', thumbnailIcon: '', sprites: {} };
  registerTestSpell('slash', {
    id: 'slash', name: 'Slash', ...base,
    templateType: SpellTemplate.MELEE, directionMode: 'current_facing', damage: 5,
  });
  registerTestSpell('cleave', {
    id: 'cleave', name: 'Cleave', ...base,
    templateType: SpellTemplate.MELEE_CONE, directionMode: 'current_facing',
    coneAngle: 90, damage: 5,
  });
  registerTestSpell('blast', {
    id: 'blast', name: 'Blast', ...base,
    templateType: SpellTemplate.AOE, directionMode: 'current_facing',
    radius: 1, aoeCenteredOnCaster: true, damage: 5,
  });
  registerTestSpell('bolt', {
    id: 'bolt', name: 'Bolt', ...base,
    templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
    damage: 5, projectileSpeed: 4, range: 6,
  });
  registerTestSpell('shove', {
    id: 'shove', name: 'Shove', ...base,
    templateType: SpellTemplate.PUSH, directionMode: 'current_facing',
    damage: 5, pushDistance: 1, range: 1,
  });
  registerTestSpell('firezone', {
    id: 'firezone', name: 'Fire Zone', ...base,
    templateType: SpellTemplate.AOE, directionMode: 'current_facing',
    radius: 1, aoeCenteredOnCaster: true, damage: 1,
    persistDuration: 3, persistDamagePerTurn: 5,
  });
  registerTestSpell('stab', {
    id: 'stab', name: 'Stab', ...base,
    templateType: SpellTemplate.MELEE, directionMode: 'current_facing', damage: 3,
  });
};

beforeEach(() => {
  clearAllRegistries();
  registerDeathSummon();
  registerKillerSpells();
  regBomber();
  registerTestStatusEffect('poison-asset', {
    id: 'poison-asset', name: 'Poison', description: '',
    type: StatusEffectType.POISON, defaultDuration: 3, defaultValue: 3,
    stackingBehavior: 'stack',
  });
});

// ==========================================
// Control
// ==========================================

describe('control', () => {
  it('an unharmed victim never fires its on_death action', () => {
    const gs = baseState({ enemies: [placedBomber()] });
    executeTurn(gs);
    executeTurn(gs);
    expect(spawnlings(gs)).toHaveLength(0);
    expect(gs.puzzle.enemies[0].dead).toBe(false);
  });
});

// ==========================================
// Enemy victim × kill path
// ==========================================

describe('death trigger fires once per kill path (enemy victim)', () => {
  it('melee kill', () => {
    regKillerHero('slash');
    const gs = baseState({ enemies: [placedBomber()], heroes: [placedKiller()] });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].dead).toBe(true);
    expect(spawnlings(gs)).toHaveLength(1);
    expect(spawnlings(gs)[0].party).toBe('enemy'); // dying enemy's summon stays enemy-side
  });

  it('melee cone kill', () => {
    regKillerHero('cleave');
    const gs = baseState({ enemies: [placedBomber()], heroes: [placedKiller()] });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].dead).toBe(true);
    expect(spawnlings(gs)).toHaveLength(1);
  });

  it('AOE kill', () => {
    regKillerHero('blast');
    const gs = baseState({ enemies: [placedBomber()], heroes: [placedKiller()] });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].dead).toBe(true);
    expect(spawnlings(gs)).toHaveLength(1);
  });

  it('push-with-damage kill', () => {
    regKillerHero('shove');
    const gs = baseState({ enemies: [placedBomber()], heroes: [placedKiller()] });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].dead).toBe(true);
    expect(gs.puzzle.enemies[0].x).toBe(4); // pushed away first
    expect(spawnlings(gs)).toHaveLength(1);
  });

  it('projectile kill — visual mode, fires once across the deferred commit', () => {
    regKillerHero('bolt');
    const gs = baseState({ enemies: [placedBomber()], heroes: [placedKiller()] });
    executeTurn(gs);
    expect(spawnlings(gs)).toHaveLength(1); // trigger fires at the logical hit
    executeTurn(gs);
    executeTurn(gs);
    expect(spawnlings(gs)).toHaveLength(1); // the pending→dead commit must not re-fire
  });

  it('projectile kill — headless mode', () => {
    regKillerHero('bolt');
    const gs = baseState({ enemies: [placedBomber()], heroes: [placedKiller()], headless: true });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].dead).toBe(true);
    expect(spawnlings(gs)).toHaveLength(1);
    executeTurn(gs);
    expect(spawnlings(gs)).toHaveLength(1);
  });

  it('contact-damage kill (hero walks into the victim)', () => {
    regKillerHero('', [{ type: ActionType.MOVE_FORWARD }]);
    const gs = baseState({
      enemies: [placedBomber()],
      heroes: [placedKiller({
        statusEffects: [statusInst(StatusEffectType.CONTACT_DAMAGE, 5)],
      })],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].dead).toBe(true);
    expect(spawnlings(gs)).toHaveLength(1);
  });

  it('DOT (poison) kill', () => {
    const gs = baseState({
      enemies: [placedBomber({
        statusEffects: [statusInst(StatusEffectType.POISON, 3, 3)],
      })],
    });
    executeTurn(gs); // end-of-turn tick: 3 dmg vs 2 hp
    expect(gs.puzzle.enemies[0].dead).toBe(true);
    expect(spawnlings(gs)).toHaveLength(1);
    executeTurn(gs); // later ticks on the corpse must not re-fire
    executeTurn(gs);
    expect(spawnlings(gs)).toHaveLength(1);
  });

  it('persistent zone kill — and corpse ticks never re-fire', () => {
    regKillerHero('firezone');
    const gs = baseState({ enemies: [placedBomber()], heroes: [placedKiller()] });
    // Turn 1: AOE hit (1 dmg) + zone created; zone ticks kill within 2 turns
    executeTurn(gs);
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].dead).toBe(true);
    expect(spawnlings(gs)).toHaveLength(1);
    executeTurn(gs); // corpse still inside the living zone
    executeTurn(gs);
    expect(spawnlings(gs)).toHaveLength(1);
  });

  it('deflect reflection kill — enemy melee bounced back by a deflecting hero', () => {
    regKillerHero('', [{ type: ActionType.WAIT }]);
    regEnemy(createTestEnemyDef({
      id: 'stabber', health: 2,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.SPELL, spellId: 'stab' }, onDeathSummon],
        defaultFacing: Direction.WEST,
      },
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'stabber', x: 3, y: 2, currentHealth: 2,
        actionIndex: 0, active: true, facing: Direction.WEST,
      })],
      heroes: [placedKiller({
        statusEffects: [statusInst(StatusEffectType.DEFLECT, 0)],
      })],
    });
    executeTurn(gs); // stabber attacks the hero; 3 dmg reflects into its 2 hp
    expect(gs.placedCharacters[0].currentHealth).toBe(10); // deflected = unharmed
    expect(gs.puzzle.enemies[0].dead).toBe(true); // reflection killed the REAL enemy, not a wrapper copy
    expect(spawnlings(gs)).toHaveLength(1);
  });

  it('deflect reflection kill — enemy projectile bounced back', () => {
    regKillerHero('', [{ type: ActionType.WAIT }]);
    regEnemy(createTestEnemyDef({
      id: 'shooter', health: 2,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.SPELL, spellId: 'bolt' }, onDeathSummon],
        defaultFacing: Direction.WEST,
      },
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'shooter', x: 5, y: 2, currentHealth: 2,
        actionIndex: 0, active: true, facing: Direction.WEST,
      })],
      heroes: [placedKiller({
        statusEffects: [statusInst(StatusEffectType.DEFLECT, 0)],
      })],
    });
    executeTurn(gs);
    executeTurn(gs); // allow a turn of projectile travel either way
    expect(gs.placedCharacters[0].currentHealth).toBe(10);
    expect(gs.puzzle.enemies[0].dead).toBe(true);
    expect(spawnlings(gs)).toHaveLength(1);
  });
});

// ==========================================
// Hero victim × kill path
// ==========================================

describe('death trigger fires for HERO victims', () => {
  const regVictimHero = () =>
    regChar(createTestCharacterDef({
      id: 'victim-hero', health: 2,
      behavior: [{ type: ActionType.WAIT }, onDeathSummon] as never,
    }));

  it('enemy melee kill — summon joins the hero side', () => {
    regVictimHero();
    regEnemy(createTestEnemyDef({
      id: 'stabber', health: 5,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.SPELL, spellId: 'stab' }],
        defaultFacing: Direction.WEST,
      },
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'stabber', x: 3, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.WEST,
      })],
      heroes: [createTestCharacter({
        characterId: 'victim-hero', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 2, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs);
    expect(gs.placedCharacters[0].dead).toBe(true);
    expect(spawnlings(gs)).toHaveLength(1);
    expect(spawnlings(gs)[0].party).toBe('hero');
  });

  it('DOT (poison) kill', () => {
    regVictimHero();
    const gs = baseState({
      heroes: [createTestCharacter({
        characterId: 'victim-hero', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 2, actionIndex: 0, active: true,
        statusEffects: [statusInst(StatusEffectType.POISON, 3, 3)],
      })],
    });
    executeTurn(gs);
    expect(gs.placedCharacters[0].dead).toBe(true);
    expect(spawnlings(gs)).toHaveLength(1);
    expect(spawnlings(gs)[0].party).toBe('hero');
  });

  it('damage tile kill', () => {
    regVictimHero();
    regChar(createTestCharacterDef({
      id: 'victim-walker', health: 2,
      behavior: [{ type: ActionType.MOVE_FORWARD }, onDeathSummon] as never,
    }));
    registerTestTileType('spikes', {
      id: 'spikes', name: 'Spikes', baseType: 'empty',
      behaviors: [{ type: 'damage', damageAmount: 5 }],
    });
    const tiles = createEmptyGrid(8, 5);
    tiles[2][3] = { x: 3, y: 2, type: tiles[2][3]!.type, customTileTypeId: 'spikes' };
    const gs = baseState({
      tiles,
      heroes: [createTestCharacter({
        characterId: 'victim-walker', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 2, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs); // steps east onto the spikes
    expect(gs.placedCharacters[0].dead).toBe(true);
    expect(spawnlings(gs)).toHaveLength(1);
  });
});

// ==========================================
// Multi-hit guards
// ==========================================

describe('a victim killed twice fires its trigger once', () => {
  it('projectile-pending victim hit by melee the NEXT turn', () => {
    regKillerHero('bolt');
    regChar(createTestCharacterDef({
      id: 'finisher', health: 10,
      behavior: [{ type: ActionType.WAIT }, { type: ActionType.SPELL, spellId: 'slash' }] as never,
    }));
    const gs = baseState({
      enemies: [placedBomber()],
      heroes: [
        placedKiller({ x: 1, y: 2 }), // bolt kills on turn 1 → pending visual death
        createTestCharacter({
          characterId: 'finisher', x: 4, y: 2, facing: Direction.WEST,
          currentHealth: 10, actionIndex: 0, active: true,
        }),
      ],
    });
    executeTurn(gs); // bolt hit — trigger fires, victim pending
    executeTurn(gs); // finisher slashes into the pending corpse's tile
    executeTurn(gs);
    expect(spawnlings(gs)).toHaveLength(1);
  });

  it('two lethal hits in the SAME turn (projectile + melee)', () => {
    regKillerHero('bolt');
    regChar(createTestCharacterDef({
      id: 'finisher', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'slash' }] as never,
    }));
    const gs = baseState({
      enemies: [placedBomber()],
      heroes: [
        placedKiller({ x: 1, y: 2 }),
        createTestCharacter({
          characterId: 'finisher', x: 4, y: 2, facing: Direction.WEST,
          currentHealth: 10, actionIndex: 0, active: true,
        }),
      ],
    });
    executeTurn(gs);
    executeTurn(gs);
    expect(spawnlings(gs)).toHaveLength(1);
  });

  it('projectile-pending victim standing in a persistent zone', () => {
    // The zone tick filters dead targets but a pending-death victim has
    // dead=false — its health is already ≤0, so a zone tick would re-enter
    // the death branch and fire the trigger (and drop) a second time.
    regKillerHero('firezone');
    regChar(createTestCharacterDef({
      id: 'sniper', health: 10,
      behavior: [{ type: ActionType.WAIT }, { type: ActionType.SPELL, spellId: 'bolt' }] as never,
    }));
    const gs = baseState({
      enemies: [placedBomber({ currentHealth: 2 })],
      heroes: [
        placedKiller(), // zone up on turn 1 (AOE 1 dmg → bomber at 1 hp)...
        createTestCharacter({
          characterId: 'sniper', x: 1, y: 2, facing: Direction.EAST,
          currentHealth: 10, actionIndex: 0, active: true,
        }),
      ],
    });
    // Give the bomber enough health that only the bolt kills it, while it
    // stands inside the still-burning zone as a pending corpse.
    gs.puzzle.enemies[0].currentHealth = 20;
    executeTurn(gs); // zone created (bomber 20→14 after AOE+tick, still alive)
    executeTurn(gs); // bolt lands: pending death inside the zone
    executeTurn(gs); // zone ticks the pending corpse
    executeTurn(gs);
    expect(spawnlings(gs)).toHaveLength(1);
  });
});

