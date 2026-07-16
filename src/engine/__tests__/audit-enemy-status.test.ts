/**
 * Engine audit sweep 2 (docs/engine-audit-plan.md): status effects on
 * ENEMY actors, per effect, end-to-end through executeTurn.
 *
 * `8ddaacb` fixed the wrapper dropping statusEffects entirely; these tests
 * pin each effect's actual behavior for enemies — especially the ones whose
 * state MUTATES across turns through the wrapper's shared statusEffects
 * reference (slow/haste counters, shield depletion, sleep wake).
 *
 * Unit-level coverage of the shared damage functions lives in
 * actions.test.ts; corpus cases 12/13/19/20 cover enemy REFLECT vs hero
 * projectiles. Everything here is the enemy-actor axis those don't touch.
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
import type { PlacedEnemy, PlacedCharacter, StatusEffectInstance } from '../../types/game';
import { executeTurn } from '../simulation';

// ==========================================
// Shared fixtures
// ==========================================

const statusInst = (
  type: StatusEffectType,
  opts?: Partial<StatusEffectInstance>,
): StatusEffectInstance => ({
  id: `${type}-inst`, type, statusAssetId: `${type}-asset`,
  duration: 99, currentStacks: 1, appliedOnTurn: 0,
  sourceEntityId: 'test', sourceIsEnemy: false, movementSkipCounter: 0,
  ...opts,
} as StatusEffectInstance);

const registerSpells = () => {
  const base = { description: '', thumbnailIcon: '', sprites: {} };
  registerTestSpell('stab', {
    id: 'stab', name: 'Stab', ...base,
    templateType: SpellTemplate.MELEE, directionMode: 'current_facing', damage: 3,
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
  registerTestSpell('spin', {
    id: 'spin', name: 'Spin', ...base,
    templateType: SpellTemplate.REDIRECT, directionMode: 'current_facing',
    redirectMode: 'fixed', redirectFixedDirection: Direction.NORTH,
    projectileSpeed: 4, range: 6,
  });
};

const registerEnemies = () => {
  regEnemy(createTestEnemyDef()); // goblin-1, static, health 5
  regEnemy(createTestEnemyDef({
    id: 'walker', health: 5,
    behavior: {
      type: 'active',
      pattern: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }],
      defaultFacing: Direction.EAST,
    },
  }));
  regEnemy(createTestEnemyDef({
    id: 'stabber', health: 5,
    behavior: {
      type: 'active',
      pattern: [{ type: ActionType.SPELL, spellId: 'stab' }, { type: ActionType.REPEAT }],
      defaultFacing: Direction.WEST,
    },
  }));
  regEnemy(createTestEnemyDef({
    id: 'shooter', health: 5,
    behavior: {
      type: 'active',
      pattern: [{ type: ActionType.SPELL, spellId: 'bolt' }],
      defaultFacing: Direction.WEST,
    },
  }));
};

const baseState = (opts: {
  enemies?: PlacedEnemy[];
  heroes?: PlacedCharacter[];
}) =>
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

beforeEach(() => {
  clearAllRegistries();
  registerSpells();
  registerEnemies();
});

// ==========================================
// Action gating (wrapper must carry statusEffects)
// ==========================================

describe('action gating on enemy actors', () => {
  it('SLEEP: enemy does not act, and damage wakes it', () => {
    regChar(createTestCharacterDef({
      id: 'poker', health: 10,
      behavior: [
        { type: ActionType.WAIT },
        { type: ActionType.WAIT },
        { type: ActionType.SPELL, spellId: 'stab' },
      ] as never,
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'walker', x: 3, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.EAST,
        statusEffects: [statusInst(StatusEffectType.SLEEP)],
      })],
      heroes: [createTestCharacter({
        characterId: 'poker', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });

    executeTurn(gs); // asleep — no move
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].x).toBe(3);

    executeTurn(gs); // hero stabs (3 dmg): wake
    expect(gs.puzzle.enemies[0].currentHealth).toBe(2);
    expect(gs.puzzle.enemies[0].statusEffects?.some(e => e.type === StatusEffectType.SLEEP)).toBeFalsy();

    executeTurn(gs); // awake — moves
    expect(gs.puzzle.enemies[0].x).toBeGreaterThan(3);
  });

  it('SILENCED: enemy cannot fire a projectile...', () => {
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'shooter', x: 3, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.WEST,
        statusEffects: [statusInst(StatusEffectType.SILENCED)],
      })],
      heroes: [waitingHero()],
    });
    executeTurn(gs);
    executeTurn(gs);
    expect(gs.placedCharacters[0].currentHealth).toBe(10); // no bolt ever landed
  });

  it('...but a SILENCED enemy can still melee', () => {
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'stabber', x: 2, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.WEST,
        statusEffects: [statusInst(StatusEffectType.SILENCED)],
      })],
      heroes: [waitingHero()],
    });
    executeTurn(gs);
    expect(gs.placedCharacters[0].currentHealth).toBe(7); // stab went through
  });

  it('DISARMED: enemy cannot melee...', () => {
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'stabber', x: 2, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.WEST,
        statusEffects: [statusInst(StatusEffectType.DISARMED)],
      })],
      heroes: [waitingHero()],
    });
    executeTurn(gs);
    expect(gs.placedCharacters[0].currentHealth).toBe(10);
  });

  it('...but a DISARMED enemy can still fire a projectile', () => {
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'shooter', x: 3, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.WEST,
        statusEffects: [statusInst(StatusEffectType.DISARMED)],
      })],
      heroes: [waitingHero()],
    });
    executeTurn(gs);
    executeTurn(gs);
    expect(gs.placedCharacters[0].currentHealth).toBe(5); // bolt landed
  });
});

// ==========================================
// Movement cadence (counters mutate through the shared reference)
// ==========================================

describe('movement cadence on enemy actors', () => {
  it('SLOW: enemy moves on a 1-on/1-off cadence across turns', () => {
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'walker', x: 1, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.EAST,
        statusEffects: [statusInst(StatusEffectType.SLOW)],
      })],
    });
    const positions: number[] = [];
    for (let t = 0; t < 4; t++) {
      executeTurn(gs);
      positions.push(gs.puzzle.enemies[0].x);
    }
    // counter 0 → moves, 1 → skips, 2 → moves, 3 → skips
    expect(positions).toEqual([2, 2, 3, 3]);
  });

  it('HASTE: enemy gets a bonus tile every other movement', () => {
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'walker', x: 1, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.EAST,
        statusEffects: [statusInst(StatusEffectType.HASTE)],
      })],
    });
    const positions: number[] = [];
    for (let t = 0; t < 3; t++) {
      executeTurn(gs);
      positions.push(gs.puzzle.enemies[0].x);
    }
    // counter 0 → double move, 1 → single, 2 → double
    expect(positions).toEqual([3, 4, 6]);
  });
});

// ==========================================
// Defensive effects on enemies, hit end-to-end
// ==========================================

describe('defensive effects on enemy targets', () => {
  const registerSlasher = () =>
    regChar(createTestCharacterDef({
      id: 'slasher', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'stab' }] as never,
    }));
  const placedSlasher = () =>
    createTestCharacter({
      characterId: 'slasher', x: 2, y: 2, facing: Direction.EAST,
      currentHealth: 10, actionIndex: 0, active: true,
    });

  it('SHIELD: absorbs part of a hero melee hit, then depletes', () => {
    registerSlasher();
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
        statusEffects: [statusInst(StatusEffectType.SHIELD, { value: 2 })],
      })],
      heroes: [placedSlasher()],
    });
    executeTurn(gs); // stab 3: shield eats 2, 1 goes through
    expect(gs.puzzle.enemies[0].currentHealth).toBe(4);
    expect(gs.puzzle.enemies[0].statusEffects?.some(e => e.type === StatusEffectType.SHIELD)).toBeFalsy();
  });

  it('INVULNERABLE: enemy takes nothing from a hero melee hit', () => {
    registerSlasher();
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
        statusEffects: [statusInst(StatusEffectType.INVULNERABLE)],
      })],
      heroes: [placedSlasher()],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(5);
  });

  it('DEFLECT: enemy bounces a hero melee back into the attacker', () => {
    registerSlasher();
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
        statusEffects: [statusInst(StatusEffectType.DEFLECT)],
      })],
      heroes: [placedSlasher()],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(5); // unharmed
    expect(gs.placedCharacters[0].currentHealth).toBe(7); // took its own 3
  });

  it('DEFLECT: enemy bounces a hero PROJECTILE back into the shooter', () => {
    // Projectile deflect resolves the source by id (applyProjectileDamage-
    // WithDeflect) — a different path from the melee deflect above.
    regChar(createTestCharacterDef({
      id: 'sniper', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'bolt' }] as never,
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 5, y: 2, currentHealth: 5,
        statusEffects: [statusInst(StatusEffectType.DEFLECT)],
      })],
      heroes: [createTestCharacter({
        characterId: 'sniper', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs);
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(5);   // unharmed
    expect(gs.placedCharacters[0].currentHealth).toBe(5); // ate its own 5
  });

  it('REFLECT on a HERO returns an enemy projectile to its shooter', () => {
    // Corpus pins the enemy-reflects-hero direction; this is the inverse.
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'shooter', x: 5, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.WEST,
      })],
      heroes: [waitingHero({
        x: 2, y: 2,
        statusEffects: [statusInst(StatusEffectType.REFLECT)],
      })],
    });
    executeTurn(gs);
    executeTurn(gs);
    executeTurn(gs); // give the reflected bolt time to travel home
    expect(gs.placedCharacters[0].currentHealth).toBe(10); // hero never hurt
    expect(gs.puzzle.enemies[0].currentHealth).toBeLessThanOrEqual(0); // bolt came home (5 dmg vs 5 hp)
  });

  it('STURDY: enemy cannot be pushed (and the push deals no damage)', () => {
    regChar(createTestCharacterDef({
      id: 'pusher', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'shove' }] as never,
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
        statusEffects: [statusInst(StatusEffectType.STURDY)],
      })],
      heroes: [createTestCharacter({
        characterId: 'pusher', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].x).toBe(3); // unmoved
    // Pinned current behavior: push immunity swallows the spell entirely,
    // including its damage rider.
    expect(gs.puzzle.enemies[0].currentHealth).toBe(5);
  });

  it('STEADFAST: enemy ignores a redirect projectile; a normal enemy turns', () => {
    regChar(createTestCharacterDef({
      id: 'spinner', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'spin' }] as never,
    }));
    const run = (withSteadfast: boolean) => {
      const gs = baseState({
        enemies: [createTestEnemy({
          enemyId: 'goblin-1', x: 4, y: 2, currentHealth: 5,
          facing: Direction.WEST,
          statusEffects: withSteadfast ? [statusInst(StatusEffectType.STEADFAST)] : [],
        })],
        heroes: [createTestCharacter({
          characterId: 'spinner', x: 2, y: 2, facing: Direction.EAST,
          currentHealth: 10, actionIndex: 0, active: true,
        })],
      });
      executeTurn(gs);
      executeTurn(gs);
      return gs.puzzle.enemies[0].facing;
    };
    expect(run(false)).toBe(Direction.NORTH); // control: redirect landed
    expect(run(true)).toBe(Direction.WEST);   // steadfast: unchanged
  });
});

// ==========================================
// Ticking effects on enemies
// ==========================================

describe('ticking effects on enemy actors', () => {
  it('REGEN: enemy heals per turn, capped at the asset max health', () => {
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 2, // asset max 5
        statusEffects: [statusInst(StatusEffectType.REGEN, { value: 2 })],
      })],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(4);
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(5); // capped, not 6
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(5);
  });

  it('POISON stacks multiply the tick on an enemy', () => {
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
        statusEffects: [statusInst(StatusEffectType.POISON, { value: 2, currentStacks: 2, duration: 3 })],
      })],
    });
    executeTurn(gs); // 2 dmg × 2 stacks
    expect(gs.puzzle.enemies[0].currentHealth).toBe(1);
  });
});

// ==========================================
// Charm: a charmed enemy fights its own base side, end-to-end
// ==========================================

describe('charm on enemy actors (end-to-end)', () => {
  it('a charmed stabber melees the fellow enemy it faces', () => {
    const gs = baseState({
      enemies: [
        createTestEnemy({
          enemyId: 'stabber', x: 3, y: 2, currentHealth: 5,
          actionIndex: 0, active: true, facing: Direction.EAST,
          statusEffects: [statusInst(StatusEffectType.CHARM, { duration: 5 })],
        }),
        createTestEnemy({ enemyId: 'goblin-1', x: 4, y: 2, currentHealth: 5 }),
      ],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[1].currentHealth).toBe(2); // 5 - 3 stab from its "ally"
  });

  it('an uncharmed stabber facing a fellow enemy does NOT hurt it', () => {
    const gs = baseState({
      enemies: [
        createTestEnemy({
          enemyId: 'stabber', x: 3, y: 2, currentHealth: 5,
          actionIndex: 0, active: true, facing: Direction.EAST,
        }),
        createTestEnemy({ enemyId: 'goblin-1', x: 4, y: 2, currentHealth: 5 }),
      ],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[1].currentHealth).toBe(5);
  });
});
