/**
 * Collectible deliveries (2026-07-21) — a PlacedCollectible with a
 * `delivery` config is tossed onto its tile at the dawn of arriveTurn
 * (processDeliveries, right after scheduled visitors). deadlineTurn is
 * EXCLUSIVE: an uncollected delivery is gone at that dawn — permanently
 * missed for a one-shot, retried on the cadence with repeatEvery.
 * `collected` stays strictly pickup-domain: a missed delivery never
 * satisfies collect_all; instead, a required missed delivery is an
 * immediate defeat (implied-protect philosophy). Blocked arrival tiles
 * (another present collectible) skip that cycle, deterministic, no queue.
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestCharacter as regChar,
  registerTestCollectible as regCol,
  createTestPuzzle,
  createTestCharacterDef,
  createTestCharacter,
  createTestCollectible,
  createTestGameState,
} from './helpers';
import { Direction, ActionType } from '../../types/game';
import type { GameState, PlacedCollectible, WinCondition } from '../../types/game';
import { executeTurn, initializeGameState, checkVictoryConditions } from '../simulation';
import { processCollectiblePickup } from '../actions';
import { isCollectiblePresent } from '../../utils/deliverySchedule';

const delivery = (overrides?: Partial<PlacedCollectible>): PlacedCollectible =>
  createTestCollectible({
    type: 'coin', scoreValue: 1, x: 3, y: 2, collected: false,
    delivery: { arriveTurn: 2, deadlineTurn: 4 },
    ...overrides,
  });

const buildState = (collectibles: PlacedCollectible[], winConditions?: WinCondition[], testMode = true) =>
  createTestGameState({
    puzzle: createTestPuzzle({
      width: 8, height: 5,
      collectibles,
      winConditions: winConditions ?? [{ type: 'defeat_all_enemies' }],
    }),
    // A parked hero keeps the no-active-hero endgame fallback quiet.
    placedCharacters: [createTestCharacter({
      characterId: 'lookout', x: 6, y: 4, facing: Direction.EAST,
      currentHealth: 10, actionIndex: 0, active: true,
    })],
    gameStatus: 'running',
    currentTurn: 0,
    testMode,
  });

beforeEach(() => {
  clearAllRegistries();
  regChar(createTestCharacterDef({
    id: 'lookout', health: 10,
    behavior: [{ type: ActionType.WAIT }, { type: ActionType.REPEAT }],
  }));
});

describe('collectible deliveries', () => {
  it('pending before arriveTurn (not present, not pickup-able), lands at that dawn', () => {
    const gs = buildState([delivery()]);
    const c = gs.puzzle.collectibles[0];

    executeTurn(gs); // turn 1
    expect(isCollectiblePresent(c)).toBe(false);
    // Walking over the ghost does nothing.
    processCollectiblePickup(gs.placedCharacters[0], false, 3, 2, gs);
    expect(c.collected).toBe(false);
    expect(gs.score).toBe(0);

    executeTurn(gs); // turn 2 — arrival dawn
    expect(c.delivered).toBe(true);
    expect(c.deliveredOnTurn).toBe(2);
    expect(isCollectiblePresent(c)).toBe(true);
    processCollectiblePickup(gs.placedCharacters[0], false, 3, 2, gs);
    expect(c.collected).toBe(true);
  });

  it('deadline is exclusive: present through deadlineTurn-1, gone at that dawn; one-shot missed forever, collected stays false', () => {
    const gs = buildState([delivery()]); // window [2, 4)
    const c = gs.puzzle.collectibles[0];
    executeTurn(gs); executeTurn(gs); executeTurn(gs); // turn 3
    expect(isCollectiblePresent(c)).toBe(true);
    executeTurn(gs); // turn 4 — deadline dawn
    expect(isCollectiblePresent(c)).toBe(false);
    expect(c.deliveryMissedOnTurn).toBe(4);
    expect(c.collected).toBe(false); // never satisfies collect_all
    executeTurn(gs); // no resurrection later
    expect(c.delivered).toBe(false);
  });

  it('a required missed delivery is an immediate defeat under collect_all', () => {
    const gs = buildState([delivery()], [{ type: 'collect_all' }], false);
    executeTurn(gs); executeTurn(gs); executeTurn(gs);
    expect(gs.gameStatus).toBe('running');
    executeTurn(gs); // deadline dawn — missed, collect_all unwinnable
    expect(gs.gameStatus).toBe('defeat');
  });

  it('collect_keys defeat only cares about key deliveries', () => {
    regCol('key-item', { id: 'key-item', effects: [{ type: 'win_key' }] });
    regCol('trinket', { id: 'trinket', effects: [{ type: 'score', value: 5 }] });
    const missKey = buildState(
      [delivery({ type: undefined, collectibleId: 'key-item' })],
      [{ type: 'collect_keys' }], false
    );
    const missTrinket = buildState(
      [delivery({ type: undefined, collectibleId: 'trinket' })],
      [{ type: 'collect_keys' }], false
    );
    for (let t = 0; t < 4; t++) { executeTurn(missKey); executeTurn(missTrinket); }
    expect(missKey.gameStatus).toBe('defeat');
    // A non-key miss must NOT defeat; with zero keys collect_keys is
    // vacuously satisfied (existing precedent), so this one is a victory.
    expect(missTrinket.gameStatus).toBe('victory');
  });

  it('collect_all stays unsatisfied while a delivery is pending, satisfied only by pickup', () => {
    const gs = buildState([delivery()], [{ type: 'collect_all' }], false);
    executeTurn(gs); // turn 1 — pending
    expect(checkVictoryConditions(gs)).toBe(false);
    executeTurn(gs); // turn 2 — landed
    const c = gs.puzzle.collectibles[0];
    processCollectiblePickup(gs.placedCharacters[0], false, 3, 2, gs);
    expect(c.collected).toBe(true);
    expect(checkVictoryConditions(gs)).toBe(true);
  });

  it('repeatEvery: a missed window re-arrives on the cadence; a collected delivery never returns', () => {
    const gs = buildState([delivery({ delivery: { arriveTurn: 1, deadlineTurn: 2, repeatEvery: 3 } })]);
    const c = gs.puzzle.collectibles[0];
    executeTurn(gs); // turn 1 — arrives
    expect(c.delivered).toBe(true);
    executeTurn(gs); // turn 2 — deadline, missed but retryable
    expect(c.delivered).toBe(false);
    expect(c.deliveryMissedOnTurn).toBeUndefined();
    executeTurn(gs); executeTurn(gs); // turn 4 — next cycle (1 + 3)
    expect(c.delivered).toBe(true);
    expect(c.deliveredOnTurn).toBe(4);
    // Collect it — the cadence stops for good (collected short-circuits the
    // pass; the stale delivered flag is harmless, presence gates on collected).
    processCollectiblePickup(gs.placedCharacters[0], false, 3, 2, gs);
    for (let t = 0; t < 4; t++) executeTurn(gs); // through turn 8
    expect(c.collected).toBe(true);
    expect(isCollectiblePresent(c)).toBe(false);
    expect(c.deliveredOnTurn).toBe(4); // no new cycle ever landed
  });

  it('blocked arrival tile skips the cycle: one-shot missed forever, repeat retries once the tile frees', () => {
    const squatterA = createTestCollectible({ type: 'coin', scoreValue: 1, x: 3, y: 2, collected: false });
    const oneShot = delivery({ delivery: { arriveTurn: 1 } });
    const gsA = buildState([squatterA, oneShot]);
    executeTurn(gsA);
    expect(gsA.puzzle.collectibles[1].deliveryMissedOnTurn).toBe(1);
    expect(gsA.puzzle.collectibles[1].delivered).toBeFalsy();

    const squatterB = createTestCollectible({ type: 'coin', scoreValue: 1, x: 3, y: 2, collected: false });
    const repeating = delivery({ delivery: { arriveTurn: 1, deadlineTurn: 2, repeatEvery: 2 } });
    const gsB = buildState([squatterB, repeating]);
    executeTurn(gsB); // turn 1 — blocked, retryable
    expect(gsB.puzzle.collectibles[1].delivered).toBeFalsy();
    expect(gsB.puzzle.collectibles[1].deliveryMissedOnTurn).toBeUndefined();
    // Free the tile, next cycle lands.
    processCollectiblePickup(gsB.placedCharacters[0], false, 3, 2, gsB);
    expect(gsB.puzzle.collectibles[0].collected).toBe(true);
    executeTurn(gsB); executeTurn(gsB); // turn 3 — cycle dawn (1 + 2)
    expect(gsB.puzzle.collectibles[1].delivered).toBe(true);
  });

  it('real and headless deliveries agree turn by turn (parity by construction)', () => {
    const build = () => buildState([
      delivery({ delivery: { arriveTurn: 1, deadlineTurn: 3, repeatEvery: 4 } }),
      delivery({ x: 5, delivery: { arriveTurn: 2 } }),
    ]);
    const probe = (g: GameState) =>
      g.puzzle.collectibles.map(c => ({
        delivered: c.delivered ?? false,
        on: c.deliveredOnTurn,
        missed: c.deliveryMissedOnTurn,
        collected: c.collected,
      }));
    const visual = build();
    const headless = build();
    headless.headlessMode = true;
    for (let t = 0; t < 6; t++) {
      executeTurn(visual); executeTurn(headless);
      expect(probe(visual)).toEqual(probe(headless));
    }
  });

  it('init strips runtime state and skips asset-duration for deliveries', () => {
    regCol('rots', { id: 'rots', effects: [], duration: 3 });
    const stale = delivery({
      type: undefined, collectibleId: 'rots',
      delivered: true, deliveredOnTurn: 7, deliveryMissedOnTurn: 9, collected: true,
    });
    const plain = createTestCollectible({ type: undefined, collectibleId: 'rots', x: 5, y: 2, collected: false });
    const init = initializeGameState(createTestPuzzle({
      collectibles: [stale, plain],
      winConditions: [{ type: 'defeat_all_enemies' }],
    }));
    const [d, p] = init.puzzle.collectibles;
    expect(d.collected).toBe(false);
    expect(d.delivered).toBe(false);
    expect(d.deliveredOnTurn).toBeUndefined();
    expect(d.deliveryMissedOnTurn).toBeUndefined();
    expect(d.duration).toBeUndefined();  // deadline is the delivery pressure knob
    expect(p.duration).toBe(3);          // non-deliveries keep asset-duration init
  });
});
