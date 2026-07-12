/**
 * Engine audit sweep 4 (docs/engine-audit-plan.md): contact damage matrix.
 *
 * RULE (user decision 2026-07-12): CONTACT_DAMAGE is purely REACTIVE and
 * universal — a stationary holder's spikes bite any HOSTILE entity that
 * tries to walk onto its tile, every attempt, all shapes and parties.
 * The walker's own contact damage never fires (offensive contact is a
 * future behavior action — docs/feature-backlog.md), so walk-ins can
 * never kill the defender: a living defender always blocks the tile.
 * Hostility is judged from the defender's side attacker-style (defender
 * EFFECTIVE vs mover BASE), so charm moves the spikes' allegiance with
 * their owner while charmed movers can still be bitten by their original
 * foes. PRIORITY no longer plays a role in contact (there is no exchange
 * to order).
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestCharacter as regChar,
  registerTestEnemy as regEnemy,
  registerTestVessel,
  registerTestStatusEffect,
  createTestPuzzle,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestCharacter,
  createTestEnemy,
  createTestGameState,
} from './helpers';
import { Direction, ActionType, StatusEffectType } from '../../types/game';
import type { PlacedEnemy, PlacedCharacter, StatusEffectInstance } from '../../types/game';
import { executeTurn } from '../simulation';

const contact = (value: number): StatusEffectInstance => ({
  id: 'contact-inst', type: StatusEffectType.CONTACT_DAMAGE, statusAssetId: 'contact-asset',
  duration: 99, value, currentStacks: 1, appliedOnTurn: 0,
  sourceEntityId: 'test', sourceIsEnemy: false, movementSkipCounter: 0,
} as StatusEffectInstance);

const charm = (): StatusEffectInstance => ({
  id: 'charm-inst', type: StatusEffectType.CHARM, statusAssetId: 'charm-asset',
  duration: 99, currentStacks: 1, appliedOnTurn: 0,
  sourceEntityId: 'test', sourceIsEnemy: false, movementSkipCounter: 0,
} as StatusEffectInstance);

const priority = (): StatusEffectInstance => ({
  id: 'priority-inst', type: StatusEffectType.PRIORITY, statusAssetId: 'priority-asset',
  duration: 99, currentStacks: 1, appliedOnTurn: 0,
  sourceEntityId: 'test', sourceIsEnemy: false, movementSkipCounter: 0,
} as StatusEffectInstance);

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

/** Hero that walks EAST every turn. */
const regWalkerHero = (health = 10) =>
  regChar(createTestCharacterDef({
    id: 'brawler', health,
    behavior: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }] as never,
  }));

/** Hero that stands still. */
const regWaitingHero = () =>
  regChar(createTestCharacterDef({
    id: 'brawler', health: 10,
    behavior: [{ type: ActionType.WAIT }, { type: ActionType.REPEAT }] as never,
  }));

const placedBrawler = (overrides?: Partial<PlacedCharacter>) =>
  createTestCharacter({
    characterId: 'brawler', x: 2, y: 2, facing: Direction.EAST,
    currentHealth: 10, actionIndex: 0, active: true,
    ...overrides,
  });

beforeEach(() => {
  clearAllRegistries();
  regEnemy(createTestEnemyDef()); // goblin-1, static, health 5
  regEnemy(createTestEnemyDef({
    id: 'walker', health: 5,
    behavior: {
      type: 'active',
      pattern: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }],
      defaultFacing: Direction.EAST,
    },
  }));
});

// ==========================================
// Hero walks into an enemy-shaped defender
// ==========================================

describe('hero walker vs spiky defender', () => {
  it("the defender's spikes bite the walker; the walker's own contact deals nothing", () => {
    regWalkerHero();
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
        statusEffects: [contact(3)],
      })],
      heroes: [placedBrawler({ statusEffects: [contact(2)] })],
    });
    executeTurn(gs);
    expect(gs.placedCharacters[0].currentHealth).toBe(7); // bitten
    expect(gs.puzzle.enemies[0].currentHealth).toBe(5);   // defender untouched
    expect(gs.placedCharacters[0].x).toBe(2);             // blocked
  });

  it('a walker cannot smash a defender by walking — a living defender always blocks', () => {
    regWalkerHero();
    const gs = baseState({
      enemies: [createTestEnemy({ enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5 })],
      heroes: [placedBrawler({ statusEffects: [contact(99)] })],
    });
    executeTurn(gs);
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(5); // never hurt
    expect(gs.puzzle.enemies[0].dead).toBe(false);
    expect(gs.placedCharacters[0].x).toBe(2);
    expect(gs.placedCharacters[0].currentHealth).toBe(10); // unspiky defender bites nothing either
  });

  it('spikes bite EVERY attempt — lethal to a dumb walker (by design)', () => {
    regWalkerHero(7);
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
        statusEffects: [contact(3)],
      })],
      heroes: [placedBrawler({ currentHealth: 7 })],
    });
    executeTurn(gs); // 7 → 4
    executeTurn(gs); // 4 → 1
    expect(gs.placedCharacters[0].currentHealth).toBe(1);
    executeTurn(gs); // 1 → dead
    expect(gs.placedCharacters[0].dead).toBe(true);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(5); // hedgehog never scratched
  });

  it('a vessel cannot be smashed by walking into it — breaking needs a real attack', () => {
    regWalkerHero();
    registerTestVessel({ id: 'barrel', name: 'Barrel', health: 2 });
    const gs = baseState({
      enemies: [createTestEnemy({ enemyId: 'barrel', x: 3, y: 2, currentHealth: 2 })],
      heroes: [placedBrawler({ statusEffects: [contact(5)] })],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].dead).toBe(false); // intact
    expect(gs.placedCharacters[0].x).toBe(2);      // blocked
  });
});

// ==========================================
// Reactive contact is universal (all shapes and parties)
// ==========================================

describe('reactive contact across the actor matrix', () => {
  it('an ENEMY walking into a spiky hero gets bitten — and dies to it eventually', () => {
    regWaitingHero();
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'walker', x: 3, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.WEST,
      })],
      heroes: [placedBrawler({ statusEffects: [contact(3)] })],
    });
    executeTurn(gs); // 5 → 2
    expect(gs.puzzle.enemies[0].currentHealth).toBe(2);
    expect(gs.puzzle.enemies[0].x).toBe(3); // blocked
    expect(gs.placedCharacters[0].currentHealth).toBe(10);
    executeTurn(gs); // 2 → dead
    expect(gs.puzzle.enemies[0].dead).toBe(true);
  });

  it('a hostile hero-party summon walking into a spiky enemy gets bitten', () => {
    const gs = baseState({
      enemies: [
        createTestEnemy({
          enemyId: 'walker', x: 2, y: 2, currentHealth: 5,
          actionIndex: 0, active: true, facing: Direction.EAST,
          party: 'hero', // a summon fighting for the heroes
        }),
        createTestEnemy({
          enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
          statusEffects: [contact(3)],
        }),
      ],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(2); // summon bitten
    expect(gs.puzzle.enemies[0].x).toBe(2);             // blocked
    expect(gs.puzzle.enemies[1].currentHealth).toBe(5); // defender untouched
  });

  it('an enemy walking into a spiky hero-party SUMMON gets bitten (party decides, not shape)', () => {
    const gs = baseState({
      enemies: [
        createTestEnemy({
          enemyId: 'walker', x: 3, y: 2, currentHealth: 5,
          actionIndex: 0, active: true, facing: Direction.WEST,
        }),
        createTestEnemy({
          enemyId: 'goblin-1', x: 2, y: 2, currentHealth: 5,
          party: 'hero', // spiky summon holding the line
          statusEffects: [contact(3)],
        }),
      ],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(2); // walker bitten
    expect(gs.puzzle.enemies[1].currentHealth).toBe(5);
  });

  it('same-side bumps never bite: a hero walking into its own spiky summon is only blocked', () => {
    regWalkerHero();
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
        party: 'hero',
        statusEffects: [contact(3)],
      })],
      heroes: [placedBrawler({ statusEffects: [contact(2)] })],
    });
    executeTurn(gs);
    expect(gs.placedCharacters[0].currentHealth).toBe(10); // ally spikes don't bite
    expect(gs.puzzle.enemies[0].currentHealth).toBe(5);
    expect(gs.placedCharacters[0].x).toBe(2); // still blocked like any body
  });
});

// ==========================================
// TRAMPLE — offensive walk-in (user design 2026-07-12)
// ==========================================

const trample = (value: number): StatusEffectInstance => ({
  id: 'trample-inst', type: StatusEffectType.TRAMPLE, statusAssetId: 'trample-asset',
  duration: 99, value, currentStacks: 1, appliedOnTurn: 0,
  sourceEntityId: 'test', sourceIsEnemy: false, movementSkipCounter: 0,
} as StatusEffectInstance);

describe('trample', () => {
  const regTramplerHero = (tilesPerMove = 1, health = 10) =>
    regChar(createTestCharacterDef({
      id: 'juggernaut', health,
      behavior: [{ type: ActionType.MOVE_FORWARD, tilesPerMove }, { type: ActionType.REPEAT }] as never,
    }));

  const placedJuggernaut = (overrides?: Partial<PlacedCharacter>) =>
    createTestCharacter({
      characterId: 'juggernaut', x: 2, y: 2, facing: Direction.EAST,
      currentHealth: 10, actionIndex: 0, active: true,
      statusEffects: [trample(5)],
      ...overrides,
    });

  it('kills the defender and plows through — the rest of the move continues', () => {
    regTramplerHero(2);
    const gs = baseState({
      enemies: [createTestEnemy({ enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5 })],
      heroes: [placedJuggernaut()],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].dead).toBe(true);
    expect(gs.placedCharacters[0].x).toBe(4); // through the corpse and onward
    expect(gs.placedCharacters[0].currentHealth).toBe(10);
  });

  it('a surviving defender still blocks (gored but standing)', () => {
    regTramplerHero();
    const gs = baseState({
      enemies: [createTestEnemy({ enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 9 })],
      heroes: [placedJuggernaut()],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(4);
    expect(gs.placedCharacters[0].x).toBe(2);
  });

  it('trample vs thorns: the HERO side strikes first — the dead defender never bites', () => {
    regTramplerHero();
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
        statusEffects: [contact(3)],
      })],
      heroes: [placedJuggernaut()],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].dead).toBe(true);
    expect(gs.placedCharacters[0].currentHealth).toBe(10); // never bitten
    expect(gs.placedCharacters[0].x).toBe(3);
  });

  it('PRIORITY on the enemy side flips the trade: thorns bite first, trample lands second', () => {
    regTramplerHero();
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
        statusEffects: [contact(3), priority()],
      })],
      heroes: [placedJuggernaut()],
    });
    executeTurn(gs);
    expect(gs.placedCharacters[0].currentHealth).toBe(7); // bitten first
    expect(gs.puzzle.enemies[0].dead).toBe(true);         // then gored
    expect(gs.placedCharacters[0].x).toBe(3);             // and plowed through
  });

  it("PRIORITY + lethal thorns: the faster enemy stops the trampler cold", () => {
    regTramplerHero(1, 3);
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
        statusEffects: [contact(3), priority()],
      })],
      heroes: [placedJuggernaut({ currentHealth: 3 })],
    });
    executeTurn(gs);
    expect(gs.placedCharacters[0].dead).toBe(true);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(5); // a dead trampler gores nothing
    expect(gs.puzzle.enemies[0].dead).toBe(false);
  });

  it('an ENEMY trampler grinds down the hero it keeps bumping', () => {
    regChar(createTestCharacterDef({
      id: 'brawler', health: 10,
      behavior: [{ type: ActionType.WAIT }, { type: ActionType.REPEAT }] as never,
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'walker', x: 3, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.WEST,
        statusEffects: [trample(3)],
      })],
      heroes: [placedBrawler()],
    });
    executeTurn(gs);
    expect(gs.placedCharacters[0].currentHealth).toBe(7);
    expect(gs.puzzle.enemies[0].x).toBe(3); // blocked while the hero stands
    executeTurn(gs);
    expect(gs.placedCharacters[0].currentHealth).toBe(4); // gored every attempt
  });

  it("halt-on-contact (resume): the goring beast stays to gore, then takes the tile next turn", () => {
    registerTestStatusEffect('trample-asset', {
      id: 'trample-asset', name: 'Trample', description: '',
      type: StatusEffectType.TRAMPLE, defaultDuration: 99999, defaultValue: 1,
      stackingBehavior: 'refresh',
      haltMovementOnContact: true, haltMovementMode: 'resume',
    });
    regTramplerHero();
    const gs = baseState({
      enemies: [createTestEnemy({ enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5 })],
      heroes: [placedJuggernaut()],
    });
    executeTurn(gs); // kill, but halt in place
    expect(gs.puzzle.enemies[0].dead).toBe(true);
    expect(gs.placedCharacters[0].x).toBe(2);
    executeTurn(gs); // resume: walk onto the (no longer fresh) corpse tile
    expect(gs.placedCharacters[0].x).toBe(3);
  });

  it('halt-on-contact (forever): a thorns holder that bites once never moves again', () => {
    registerTestStatusEffect('contact-asset', {
      id: 'contact-asset', name: 'Thorns', description: '',
      type: StatusEffectType.CONTACT_DAMAGE, defaultDuration: 99999, defaultValue: 1,
      stackingBehavior: 'refresh',
      haltMovementOnContact: true, haltMovementMode: 'forever',
    });
    regWalkerHero();
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'walker', x: 3, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.EAST, // walking AWAY each turn
        statusEffects: [contact(3)],
      })],
      heroes: [placedBrawler()], // walks east into it during the hero phase
    });
    executeTurn(gs); // hero bumps it before it moves: bite fires, halt stamps
    expect(gs.placedCharacters[0].currentHealth).toBe(7);
    expect(gs.puzzle.enemies[0].x).toBe(3); // rooted this turn
    executeTurn(gs);
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].x).toBe(3); // rooted forever
  });
});

// ==========================================
// Charm asymmetry on spikes
// ==========================================

describe('charm and reactive contact', () => {
  it("a CHARMED spiky enemy stops biting heroes — its spikes fight for them now", () => {
    regWalkerHero();
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
        statusEffects: [contact(3), charm()],
      })],
      heroes: [placedBrawler()],
    });
    executeTurn(gs);
    expect(gs.placedCharacters[0].currentHealth).toBe(10); // no bite from an ally-of-the-moment
    expect(gs.placedCharacters[0].x).toBe(2);
  });

  it('a CHARMED hero is still bitten by enemy spikes (charm ignored on the mover side)', () => {
    regWalkerHero();
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
        statusEffects: [contact(3)],
      })],
      heroes: [placedBrawler({ statusEffects: [charm()] })],
    });
    executeTurn(gs);
    expect(gs.placedCharacters[0].currentHealth).toBe(7); // base party is what the spikes see
    expect(gs.puzzle.enemies[0].currentHealth).toBe(5);
  });
});
