/**
 * Vessel trigger batch (2026-07-17) — proximity hatch, struck (hit-kind)
 * trigger, and the break-open toggle. All evaluated end-of-turn in
 * processVesselTransforms (shared engine code — real/headless parity by
 * construction, pinned anyway for the proximity + struck paths).
 *
 * Locked design: proximity senses BASE parties (default 'hero'),
 * Euclidean distance like the "in range" trigger events, end-of-turn
 * census (no fly-bys), stealth hidden from an OPPOSING vessel; hit
 * stamps record CONNECTION (deflected/absorbed strikes count); break-open
 * defaults ON, and a kill by a listed hit kind emerges even with the
 * toggle off.
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestCharacter as regChar,
  registerTestEnemy as regEnemy,
  registerTestVessel,
  registerTestSpell,
  registerTestStatusEffect,
  createTestPuzzle,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestCharacter,
  createTestEnemy,
  createTestGameState,
} from './helpers';
import { Direction, ActionType, SpellTemplate, StatusEffectType } from '../../types/game';
import type { GameState } from '../../types/game';
import { executeTurn } from '../simulation';

const spiderEmerged = (gs: GameState) =>
  gs.puzzle.enemies.filter(e => e.enemyId === 'spider' && e.spawnedOnTurn !== undefined);

const vessel = (gs: GameState) => gs.puzzle.enemies[0];

const expectParity = (build: () => GameState, turns: number, probe: (gs: GameState) => unknown) => {
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
  regEnemy(createTestEnemyDef({ id: 'spider', health: 3 }));
  regChar(createTestCharacterDef({
    id: 'walker', health: 10,
    behavior: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }],
  }));
  regChar(createTestCharacterDef({
    id: 'idler', health: 10,
    behavior: [{ type: ActionType.WAIT }, { type: ActionType.REPEAT }],
  }));
});

const registerEgg = (overrides?: Record<string, unknown>) =>
  registerTestVessel({
    id: 'egg', name: 'Egg', health: 2,
    transformEnemyId: 'spider',
    ...overrides,
  });

const placedEgg = (overrides?: Record<string, unknown>) =>
  createTestEnemy({ enemyId: 'egg', x: 6, y: 2, currentHealth: 2, ...overrides });

const baseState = (opts: {
  characters?: ReturnType<typeof createTestCharacter>[];
  enemies?: ReturnType<typeof createTestEnemy>[];
}) =>
  createTestGameState({
    puzzle: createTestPuzzle({
      width: 8, height: 5,
      enemies: opts.enemies ?? [placedEgg()],
      availableCharacters: ['walker', 'idler'],
    }),
    placedCharacters: opts.characters ?? [],
    gameStatus: 'running',
    currentTurn: 0,
    testMode: true,
  });

describe('proximity hatch', () => {
  it('hatches when a hero walks into range — vessel leaves without dying (no corpse debris)', () => {
    registerEgg({ transformProximityRange: 2 });
    // Walker starts at (2,2) facing east: turn 1 → (3,2) (dist 3), turn 2 → (4,2) (dist 2 → in range).
    const gs = expectParity(() => baseState({
      characters: [createTestCharacter({
        characterId: 'walker', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    }), 2, g => ({
      emerged: spiderEmerged(g).length,
      vesselGone: !!(vessel(g).dead && vessel(g).despawned),
      transformedOn: vessel(g).transformedOnTurn,
    }));
    expect(spiderEmerged(gs)).toHaveLength(1);
    expect(spiderEmerged(gs)[0].x).toBe(6);
    // Live hatch: despawned, not a corpse — and only on turn 2, not turn 1.
    expect(vessel(gs).despawned).toBe(true);
    expect(vessel(gs).transformedOnTurn).toBe(2);
  });

  it('out of range = no hatch (end-of-turn census)', () => {
    registerEgg({ transformProximityRange: 2 });
    const gs = baseState({
      characters: [createTestCharacter({
        characterId: 'idler', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs);
    executeTurn(gs);
    expect(spiderEmerged(gs)).toHaveLength(0);
    expect(vessel(gs).dead).toBeFalsy();
  });

  it("party select 'enemy': an enemy in range hatches it, an adjacent hero doesn't", () => {
    registerEgg({ transformProximityRange: 1, transformProximityParty: 'enemy' });
    regEnemy(createTestEnemyDef({ id: 'prowler', health: 3 })); // static

    // Hero orthogonally adjacent: wrong party, no hatch.
    const heroOnly = baseState({
      characters: [createTestCharacter({
        characterId: 'idler', x: 5, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(heroOnly);
    expect(spiderEmerged(heroOnly)).toHaveLength(0);

    // Enemy DIAGONAL to the egg: √2 > 1 — outside Euclidean range 1, same
    // rule as the 'in range' trigger events. No hatch.
    const diagonal = baseState({
      enemies: [placedEgg(), createTestEnemy({ enemyId: 'prowler', x: 5, y: 3, currentHealth: 3 })],
    });
    executeTurn(diagonal);
    expect(spiderEmerged(diagonal)).toHaveLength(0);

    // Enemy orthogonally adjacent: distance 1 ⇒ hatch.
    const orthogonal = baseState({
      enemies: [placedEgg(), createTestEnemy({ enemyId: 'prowler', x: 5, y: 2, currentHealth: 3 })],
    });
    executeTurn(orthogonal);
    expect(spiderEmerged(orthogonal)).toHaveLength(1);
  });

  it('a stealthed hero does not hatch an enemy-party vessel', () => {
    registerTestStatusEffect('stealth-fx', {
      id: 'stealth-fx', name: 'Stealth', type: StatusEffectType.STEALTH, duration: 99,
    });
    regChar(createTestCharacterDef({
      id: 'sneak', health: 10,
      behavior: [{ type: ActionType.WAIT }, { type: ActionType.REPEAT }],
      initialStatusEffects: [{ statusAssetId: 'stealth-fx' }],
    }));
    registerEgg({ transformProximityRange: 3 });
    const gs = baseState({
      characters: [createTestCharacter({
        characterId: 'sneak', x: 5, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
        statusEffects: [{ id: 'stealth-fx', type: StatusEffectType.STEALTH, remainingTurns: 99, value: 0 }],
      })],
    });
    executeTurn(gs);
    executeTurn(gs);
    expect(spiderEmerged(gs)).toHaveLength(0);
  });
});

describe('struck trigger (hit kinds)', () => {
  const registerBoltCaster = () => {
    registerTestSpell('bolt', {
      id: 'bolt', name: 'Bolt', description: '', thumbnailIcon: '', sprites: {},
      templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
      damage: 1, projectileSpeed: 4, range: 4, cooldown: 10,
    });
    regChar(createTestCharacterDef({
      id: 'archer', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'bolt' }, { type: ActionType.REPEAT }] as never,
    }));
  };

  it('a non-lethal projectile hit hatches a projectile-listed vessel (live hatch)', () => {
    registerBoltCaster();
    registerEgg({ transformOnHitKinds: ['projectile'], health: 5 });
    const gs = expectParity(() => baseState({
      enemies: [placedEgg({ currentHealth: 5 })],
      characters: [createTestCharacter({
        characterId: 'archer', x: 3, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    }), 2, g => ({
      emerged: spiderEmerged(g).length,
      vesselGone: !!(vessel(g).dead && vessel(g).despawned),
    }));
    expect(spiderEmerged(gs)).toHaveLength(1);
    expect(vessel(gs).despawned).toBe(true); // alive when struck — leaves, no corpse
  });

  it('a hit of an unlisted kind does nothing', () => {
    registerBoltCaster();
    registerEgg({ transformOnHitKinds: ['melee'], health: 5 });
    const gs = baseState({
      enemies: [placedEgg({ currentHealth: 5 })],
      characters: [createTestCharacter({
        characterId: 'archer', x: 3, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs);
    executeTurn(gs);
    expect(spiderEmerged(gs)).toHaveLength(0);
    expect(vessel(gs).currentHealth).toBe(4); // bolt landed, no transform
  });
});

describe('break-open toggle', () => {
  it('transformOnBreak false: death is a plain break — nothing emerges', () => {
    registerEgg({ transformOnBreak: false });
    const gs = baseState({
      enemies: [placedEgg({ dead: true, currentHealth: 0, diedOnTurn: 0 })],
    });
    executeTurn(gs);
    executeTurn(gs);
    expect(spiderEmerged(gs)).toHaveLength(0);
    expect(vessel(gs).transformedOnTurn).toBeUndefined();
  });

  it('transformOnBreak false + killed by a LISTED kind: still emerges via the break path', () => {
    registerBoltKill();
    const gs = baseState({
      enemies: [placedEgg({ currentHealth: 1 })],
      characters: [createTestCharacter({
        characterId: 'archer', x: 3, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    // Turn 1: bolt kills the egg (diedOnTurn stamps N+1); transform settles a turn later.
    executeTurn(gs);
    executeTurn(gs);
    executeTurn(gs);
    expect(spiderEmerged(gs)).toHaveLength(1);
    expect(vessel(gs).dead).toBe(true);
    expect(vessel(gs).despawned).toBeUndefined(); // break path: corpse debris stays
  });

  it('default (field unset) keeps the pre-existing break-open behavior', () => {
    registerEgg();
    const gs = baseState({
      enemies: [placedEgg({ dead: true, currentHealth: 0, diedOnTurn: 0 })],
    });
    executeTurn(gs);
    expect(spiderEmerged(gs)).toHaveLength(1);
  });

  function registerBoltKill() {
    registerTestSpell('bolt', {
      id: 'bolt', name: 'Bolt', description: '', thumbnailIcon: '', sprites: {},
      templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
      damage: 1, projectileSpeed: 4, range: 4, cooldown: 10,
    });
    regChar(createTestCharacterDef({
      id: 'archer', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'bolt' }, { type: ActionType.REPEAT }] as never,
    }));
    registerEgg({ transformOnBreak: false, transformOnHitKinds: ['projectile'] });
  }
});
