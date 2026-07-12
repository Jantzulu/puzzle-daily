/**
 * Engine audit sweep 4 (docs/engine-audit-plan.md): contact damage matrix —
 * walker-into-target across party pairs, PRIORITY ordering, both-sides
 * contact, and the move-in-on-kill rule.
 *
 * The engine's ONLY contact-damage site is moveCharacter's hero-shaped-
 * mover-into-enemy-shaped-target branch (actions.ts). Two asymmetries are
 * PINNED here as current design (surfaced to the user, not changed):
 *   1. An ENEMY walking into a hero never deals contact damage — it waits.
 *      Contact combat is strictly initiated by the hero-side mover; a
 *      stationary spiky enemy is "reactive" only (hurts heroes who walk in).
 *   2. An enemy-shaped mover never fights ANY enemy-shaped target, even a
 *      hostile one (hero-party summon vs enemy) — shape blocks first.
 * And one party bug is FIXED and pinned: a hero walking into its own
 * hero-party summon used to fight it (the combat gate was shape-based).
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestCharacter as regChar,
  registerTestEnemy as regEnemy,
  registerTestVessel,
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

const priority = (): StatusEffectInstance => ({
  id: 'priority-inst', type: StatusEffectType.PRIORITY, statusAssetId: 'priority-asset',
  duration: 99, currentStacks: 1, appliedOnTurn: 0,
  sourceEntityId: 'test', sourceIsEnemy: false, movementSkipCounter: 0,
} as StatusEffectInstance);

const charm = (): StatusEffectInstance => ({
  id: 'charm-inst', type: StatusEffectType.CHARM, statusAssetId: 'charm-asset',
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
  regWalkerHero();
});

// ==========================================
// Hero-initiated contact (the live combat branch)
// ==========================================

describe('hero walks into an enemy', () => {
  it('both sides exchange contact damage; the survivor blocks the tile', () => {
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
        statusEffects: [contact(3)],
      })],
      heroes: [placedBrawler({ statusEffects: [contact(2)] })],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(3);   // took the hero's 2
    expect(gs.placedCharacters[0].currentHealth).toBe(7); // took the enemy's 3
    expect(gs.placedCharacters[0].x).toBe(2);             // enemy survived — no move-in
  });

  it('a kill lets the hero move into the vacated tile unhurt (enemy corpse deals no counter)', () => {
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
        statusEffects: [contact(3)],
      })],
      heroes: [placedBrawler({ statusEffects: [contact(5)] })],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].dead).toBe(true);
    expect(gs.placedCharacters[0].x).toBe(3);              // moved in
    expect(gs.placedCharacters[0].currentHealth).toBe(10); // corpse never countered
  });

  it('PRIORITY: the enemy strikes first, and a dead hero cannot counter', () => {
    regWalkerHero(3); // dies to the priority hit
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
        statusEffects: [contact(3), priority()],
      })],
      heroes: [placedBrawler({ currentHealth: 3, statusEffects: [contact(5)] })],
    });
    executeTurn(gs);
    expect(gs.placedCharacters[0].dead).toBe(true);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(5); // no counter from the corpse
  });

  it('a CHARMED enemy is still a valid contact target (charm is ignored on the target side)', () => {
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
        statusEffects: [charm()],
      })],
      heroes: [placedBrawler({ statusEffects: [contact(2)] })],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(3);
  });

  it('a vessel (adapter-resolved) is smashed by walk-in contact and the hero moves in', () => {
    registerTestVessel({ id: 'barrel', name: 'Barrel', health: 2 });
    const gs = baseState({
      enemies: [createTestEnemy({ enemyId: 'barrel', x: 3, y: 2, currentHealth: 2 })],
      heroes: [placedBrawler({ statusEffects: [contact(5)] })],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].dead).toBe(true);
    expect(gs.placedCharacters[0].x).toBe(3);
    expect(gs.placedCharacters[0].currentHealth).toBe(10);
  });
});

// ==========================================
// Pinned asymmetries (current design — surfaced, not changed)
// ==========================================

describe('pinned: contact combat is hero-mover-initiated only', () => {
  it('an ENEMY walking into a hero deals NO contact damage — it waits', () => {
    // Asymmetry pinned as current design: a spiky enemy is reactive only.
    // If enemy-initiated contact is ever wanted, this is the pin to flip.
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'walker', x: 3, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.WEST,
        statusEffects: [contact(3)],
      })],
      heroes: [placedBrawler({
        x: 2, y: 2,
        // Waiting hero: swap the walk for a wait so only the enemy moves
      })],
    });
    regChar(createTestCharacterDef({
      id: 'brawler', health: 10,
      behavior: [{ type: ActionType.WAIT }, { type: ActionType.REPEAT }] as never,
    }));
    executeTurn(gs);
    executeTurn(gs);
    expect(gs.placedCharacters[0].currentHealth).toBe(10); // never bitten
    expect(gs.puzzle.enemies[0].x).toBe(3);                // blocked, waiting
  });

  it('a hostile hero-party summon walking into an enemy waits — shape blocks before party', () => {
    // Enemy-shaped movers never fight enemy-shaped targets, hostile or not.
    const gs = baseState({
      enemies: [
        createTestEnemy({
          enemyId: 'walker', x: 2, y: 2, currentHealth: 5,
          actionIndex: 0, active: true, facing: Direction.EAST,
          party: 'hero', // a summon fighting for the heroes
          statusEffects: [contact(3)],
        }),
        createTestEnemy({ enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5 }),
      ],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[1].currentHealth).toBe(5); // untouched
    expect(gs.puzzle.enemies[0].x).toBe(2);             // blocked
  });
});

// ==========================================
// Party-aware combat gate (fixed by this sweep)
// ==========================================

describe('non-hostile walk-ins are a block, not a fight', () => {
  it('a hero walking into its OWN hero-party summon does not fight it', () => {
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
        party: 'hero', // the hero's own summon
        statusEffects: [contact(3)],
      })],
      heroes: [placedBrawler({ statusEffects: [contact(2)] })],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(5);    // ally unhurt
    expect(gs.placedCharacters[0].currentHealth).toBe(10); // hero unhurt
    expect(gs.placedCharacters[0].x).toBe(2);              // blocked like an ally should
  });

  it('a CHARMED hero (fighting for the enemy) does not brawl the enemies it walks into', () => {
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5,
        statusEffects: [contact(3)],
      })],
      heroes: [placedBrawler({ statusEffects: [contact(2), charm()] })],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(5);    // same side now — no fight
    expect(gs.placedCharacters[0].currentHealth).toBe(10);
    expect(gs.placedCharacters[0].x).toBe(2);
  });
});
