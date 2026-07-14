/**
 * Team-relative trigger events (2026-07-14).
 *
 * Trigger EVENTS used to be hard-wired to ABSOLUTE parties (character_*
 * sensed the hero party, enemy_* the enemy party) while auto-target FLAGS
 * had gone team-relative in the July party work. Consequence: an ALLY
 * (enemy-shaped authoring, party: 'hero') with a triggered action sensed its
 * own teammates — and, with no self-exclusion, sensed ITSELF at distance 0,
 * so its character_adjacent trigger was always true.
 *
 * The redesign: events are team-relative (opposing_* / same_team_*),
 * resolved against the holder's BASE party (charm-blind, like the finders).
 * Legacy absolute events are mapped at read time by AUTHORING SIDE
 * (resolveTriggerEvent) — no asset migration. Deliberate behavior changes
 * pinned here (user-approved 2026-07-14):
 *  - same-team events EXCLUDE the holder itself;
 *  - same-team events SEE stealthed teammates (opposing events still don't),
 *    matching the findNearestTeamMembers stealth baseline;
 *  - health_below_50 now works for enemy-shaped holders (was silently dead:
 *    character-only asset lookup).
 *
 * Observable: a triggered SUMMON spell ("ping") that spawns an inert
 * 'spawnling' one tile north — counting spawnlings counts trigger firings,
 * with no dependence on the action having a damage target.
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
} from './helpers';
import { Direction, ActionType, SpellTemplate, StatusEffectType } from '../../types/game';
import type {
  GameState,
  PlacedEnemy,
  PlacedCharacter,
  StatusEffectInstance,
  TriggerEvent,
  CharacterAction,
} from '../../types/game';
import { executeTurn } from '../simulation';
import { resolveTriggerEvent } from '../actions';

// ==========================================
// Shared fixtures
// ==========================================

/** The firing observable: summons an inert 'spawnling' one tile NORTH. */
const registerPing = () => {
  regEnemy(createTestEnemyDef({ id: 'spawnling', health: 1 })); // static, never acts
  registerTestSpell('ping', {
    id: 'ping', name: 'Ping', description: '', thumbnailIcon: '',
    templateType: SpellTemplate.SUMMON,
    directionMode: 'fixed', defaultDirections: [Direction.NORTH],
    summonEnemyId: 'spawnling',
    sprites: {},
  });
};

const spawnlings = (gs: GameState) =>
  gs.puzzle.enemies.filter(e => e.enemyId === 'spawnling');

/** Editor-authored shape: trigger config only exists on parallel actions. */
const triggeredPing = (event: TriggerEvent, eventRange?: number): CharacterAction => ({
  type: ActionType.SPELL,
  spellId: 'ping',
  executionMode: 'parallel',
  trigger: { mode: 'on_event', event, ...(eventRange !== undefined ? { eventRange } : {}) },
} as CharacterAction);

/** Parked hero so zero-active-hero endgame fallback never fires. */
const waitingHero = (overrides?: Partial<PlacedCharacter>) => {
  regChar(createTestCharacterDef({
    id: 'bystander', health: 10,
    behavior: [{ type: ActionType.WAIT }, { type: ActionType.REPEAT }] as never,
  }));
  return createTestCharacter({
    characterId: 'bystander', x: 7, y: 4, facing: Direction.EAST,
    currentHealth: 10, actionIndex: 0, active: true,
    ...overrides,
  });
};

const baseState = (opts: { enemies?: PlacedEnemy[]; heroes?: PlacedCharacter[] }) =>
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

const statusInst = (type: StatusEffectType, duration = 5): StatusEffectInstance => ({
  id: `${type}-inst`, type, statusAssetId: `${type}-asset`,
  duration, value: 0, currentStacks: 1, appliedOnTurn: 0,
  sourceEntityId: 'test', sourceIsEnemy: false, movementSkipCounter: 0,
} as StatusEffectInstance);

/** Enemy-shaped sentinel (enemy or ally) whose only action is the ping. */
const sentinelBehavior = (event: TriggerEvent, eventRange?: number) => ({
  type: 'active' as const,
  pattern: [{ type: ActionType.WAIT }, triggeredPing(event, eventRange)],
  defaultFacing: Direction.EAST,
});

beforeEach(() => {
  clearAllRegistries();
  registerPing();
  regEnemy(createTestEnemyDef()); // goblin-1, static, health 5
});

// ==========================================
// resolveTriggerEvent — the read-time mapping table
// ==========================================

describe('resolveTriggerEvent (legacy absolute → team-relative, by authoring side)', () => {
  it('maps enemy-authored events (character_* meant opponents)', () => {
    expect(resolveTriggerEvent('character_adjacent', true)).toBe('opposing_adjacent');
    expect(resolveTriggerEvent('character_in_range', true)).toBe('opposing_in_range');
    expect(resolveTriggerEvent('contact_with_character', true)).toBe('contact_with_opposing');
    expect(resolveTriggerEvent('enemy_adjacent', true)).toBe('same_team_adjacent');
    expect(resolveTriggerEvent('enemy_in_range', true)).toBe('same_team_in_range');
    expect(resolveTriggerEvent('contact_with_enemy', true)).toBe('contact_with_same_team');
  });

  it('maps character-authored events (enemy_* meant opponents)', () => {
    expect(resolveTriggerEvent('enemy_adjacent', false)).toBe('opposing_adjacent');
    expect(resolveTriggerEvent('enemy_in_range', false)).toBe('opposing_in_range');
    expect(resolveTriggerEvent('contact_with_enemy', false)).toBe('contact_with_opposing');
    expect(resolveTriggerEvent('character_adjacent', false)).toBe('same_team_adjacent');
    expect(resolveTriggerEvent('character_in_range', false)).toBe('same_team_in_range');
    expect(resolveTriggerEvent('contact_with_character', false)).toBe('contact_with_same_team');
  });

  it('passes non-proximity and already-relative events through', () => {
    expect(resolveTriggerEvent('wall_ahead', true)).toBe('wall_ahead');
    expect(resolveTriggerEvent('health_below_50', false)).toBe('health_below_50');
    expect(resolveTriggerEvent('on_death', true)).toBe('on_death');
    expect(resolveTriggerEvent('opposing_adjacent', true)).toBe('opposing_adjacent');
    expect(resolveTriggerEvent('same_team_in_range', false)).toBe('same_team_in_range');
  });
});

// ==========================================
// THE motivating bug: ally triggers
// ==========================================

describe('ally triggered actions (the bug that motivated the redesign)', () => {
  const regGuardian = (event: TriggerEvent, eventRange?: number) =>
    regAlly(createTestEnemyDef({
      id: 'guardian', health: 6,
      behavior: sentinelBehavior(event, eventRange),
    }));

  const placedGuardian = (overrides?: Partial<PlacedEnemy>) =>
    createTestEnemy({
      enemyId: 'guardian', party: 'hero', x: 2, y: 2, currentHealth: 6,
      actionIndex: 0, active: true, facing: Direction.EAST,
      ...overrides,
    });

  it('legacy character_adjacent on an ally now senses OPPONENTS (fires on an adjacent enemy)', () => {
    regGuardian('character_adjacent');
    const gs = baseState({
      enemies: [
        placedGuardian(),
        createTestEnemy({ enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5 }),
      ],
      heroes: [waitingHero()],
    });
    executeTurn(gs);
    expect(spawnlings(gs)).toHaveLength(1);
  });

  it('legacy character_adjacent on an ally does NOT fire on itself or a hero teammate (was always true)', () => {
    regGuardian('character_adjacent');
    const gs = baseState({
      enemies: [placedGuardian()],
      heroes: [waitingHero({ x: 1, y: 2 })], // teammate adjacent — must not count
    });
    executeTurn(gs);
    expect(spawnlings(gs)).toHaveLength(0);
  });

  it('new relative events work directly on allies (opposing + same-team)', () => {
    regGuardian('opposing_adjacent');
    const fired = baseState({
      enemies: [
        placedGuardian(),
        createTestEnemy({ enemyId: 'goblin-1', x: 2, y: 3, currentHealth: 5 }),
      ],
      heroes: [waitingHero()],
    });
    executeTurn(fired);
    expect(spawnlings(fired)).toHaveLength(1);

    regGuardian('same_team_adjacent');
    const teammate = baseState({
      enemies: [placedGuardian()],
      heroes: [waitingHero({ x: 1, y: 2 })],
    });
    executeTurn(teammate);
    expect(spawnlings(teammate)).toHaveLength(1);

    regGuardian('same_team_adjacent');
    const alone = baseState({
      enemies: [placedGuardian()],
      heroes: [waitingHero()], // parked far away at (7,4)
    });
    executeTurn(alone);
    expect(spawnlings(alone)).toHaveLength(0); // never senses itself
  });
});

// ==========================================
// Legacy meaning preserved for existing content
// ==========================================

describe('legacy events keep their meaning on existing assets', () => {
  it('enemy with character_in_range still senses heroes at range (and not beyond)', () => {
    const regWatcher = () =>
      regEnemy(createTestEnemyDef({
        id: 'watcher', health: 5,
        behavior: sentinelBehavior('character_in_range', 2),
      }));

    regWatcher();
    const inRange = baseState({
      enemies: [createTestEnemy({
        enemyId: 'watcher', x: 2, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.EAST,
      })],
      heroes: [waitingHero({ x: 4, y: 2 })], // distance 2
    });
    executeTurn(inRange);
    expect(spawnlings(inRange)).toHaveLength(1);

    regWatcher();
    const outOfRange = baseState({
      enemies: [createTestEnemy({
        enemyId: 'watcher', x: 2, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.EAST,
      })],
      heroes: [waitingHero({ x: 6, y: 2 })], // distance 4
    });
    executeTurn(outOfRange);
    expect(spawnlings(outOfRange)).toHaveLength(0);
  });

  it('hero with enemy_adjacent still senses enemies', () => {
    regChar(createTestCharacterDef({
      id: 'scout', health: 10,
      behavior: [
        { type: ActionType.WAIT },
        { type: ActionType.REPEAT },
        triggeredPing('enemy_adjacent'),
      ] as never,
    }));
    const gs = baseState({
      enemies: [createTestEnemy({ enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5 })],
      heroes: [createTestCharacter({
        characterId: 'scout', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs);
    expect(spawnlings(gs)).toHaveLength(1);
  });

  it('hero with character_adjacent maps to same-team: fires on an adjacent hero, not alone', () => {
    const regScout = () =>
      regChar(createTestCharacterDef({
        id: 'scout', health: 10,
        behavior: [
          { type: ActionType.WAIT },
          { type: ActionType.REPEAT },
          triggeredPing('character_adjacent'),
        ] as never,
      }));

    const placedScout = () => createTestCharacter({
      characterId: 'scout', x: 2, y: 2, facing: Direction.EAST,
      currentHealth: 10, actionIndex: 0, active: true,
    });

    regScout();
    const paired = baseState({
      heroes: [placedScout(), waitingHero({ x: 1, y: 2 })],
    });
    executeTurn(paired);
    expect(spawnlings(paired)).toHaveLength(1);

    regScout();
    const alone = baseState({ heroes: [placedScout(), waitingHero()] });
    executeTurn(alone);
    expect(spawnlings(alone)).toHaveLength(0); // self never counts
  });
});

// ==========================================
// Self-exclusion — the deliberate behavior change
// ==========================================

describe('same-team self-exclusion (deliberate change, user-approved 2026-07-14)', () => {
  const regLurker = () =>
    regEnemy(createTestEnemyDef({
      id: 'lurker', health: 5,
      behavior: sentinelBehavior('enemy_adjacent'), // enemy-authored → same_team_adjacent
    }));

  it('an enemy alone no longer senses itself at distance 0 (was always true)', () => {
    regLurker();
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'lurker', x: 2, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.EAST,
      })],
      heroes: [waitingHero()],
    });
    executeTurn(gs);
    expect(spawnlings(gs)).toHaveLength(0);
  });

  it('duplicate same-asset teammates ARE still sensed (instanceKey discriminates, not enemyId)', () => {
    regLurker();
    const gs = baseState({
      enemies: [
        createTestEnemy({
          enemyId: 'lurker', x: 2, y: 2, currentHealth: 5,
          actionIndex: 0, active: true, facing: Direction.EAST,
        }),
        createTestEnemy({
          enemyId: 'lurker', x: 3, y: 2, currentHealth: 5,
          actionIndex: 0, active: true, facing: Direction.WEST,
        }),
      ],
      heroes: [waitingHero()],
    });
    executeTurn(gs);
    // Both duplicates sense each other — two independent firings.
    expect(spawnlings(gs)).toHaveLength(2);
  });
});

// ==========================================
// Stealth + charm interactions
// ==========================================

describe('stealth and charm through relative sensing', () => {
  it('opposing sensing never sees a stealthed entity', () => {
    regEnemy(createTestEnemyDef({
      id: 'watcher', health: 5,
      behavior: sentinelBehavior('character_adjacent'), // → opposing_adjacent
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'watcher', x: 2, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.EAST,
      })],
      heroes: [waitingHero({ x: 1, y: 2, statusEffects: [statusInst(StatusEffectType.STEALTH)] })],
    });
    executeTurn(gs);
    expect(spawnlings(gs)).toHaveLength(0);
  });

  it('same-team sensing SEES stealthed teammates (finder baseline; changed from all-blind)', () => {
    regEnemy(createTestEnemyDef({
      id: 'lurker', health: 5,
      behavior: sentinelBehavior('enemy_adjacent'), // → same_team_adjacent
    }));
    const gs = baseState({
      enemies: [
        createTestEnemy({
          enemyId: 'lurker', x: 2, y: 2, currentHealth: 5,
          actionIndex: 0, active: true, facing: Direction.EAST,
        }),
        createTestEnemy({
          enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
          statusEffects: [statusInst(StatusEffectType.STEALTH)],
        }),
      ],
      heroes: [waitingHero()],
    });
    executeTurn(gs);
    expect(spawnlings(gs)).toHaveLength(1);
  });

  it('sensing is BASE-party (charm-blind): a hero still senses a charmed enemy as opposing', () => {
    regChar(createTestCharacterDef({
      id: 'scout', health: 10,
      behavior: [
        { type: ActionType.WAIT },
        { type: ActionType.REPEAT },
        triggeredPing('enemy_adjacent'), // → opposing_adjacent
      ] as never,
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
        statusEffects: [statusInst(StatusEffectType.CHARM)],
      })],
      heroes: [createTestCharacter({
        characterId: 'scout', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs);
    expect(spawnlings(gs)).toHaveLength(1);
  });
});

// ==========================================
// health_below_50 ridealong fix
// ==========================================

describe('health_below_50 for enemy-shaped holders (was silently dead: char-only lookup)', () => {
  const regWounded = () =>
    regEnemy(createTestEnemyDef({
      id: 'wounded', health: 5,
      behavior: sentinelBehavior('health_below_50'),
    }));

  it('fires for an enemy below half health', () => {
    regWounded();
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'wounded', x: 2, y: 2, currentHealth: 2, // 2 < 2.5
        actionIndex: 0, active: true, facing: Direction.EAST,
      })],
      heroes: [waitingHero()],
    });
    executeTurn(gs);
    expect(spawnlings(gs)).toHaveLength(1);
  });

  it('stays quiet at or above half health', () => {
    regWounded();
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'wounded', x: 2, y: 2, currentHealth: 4,
        actionIndex: 0, active: true, facing: Direction.EAST,
      })],
      heroes: [waitingHero()],
    });
    executeTurn(gs);
    expect(spawnlings(gs)).toHaveLength(0);
  });
});
