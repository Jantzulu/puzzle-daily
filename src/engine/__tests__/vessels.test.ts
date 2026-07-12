/**
 * Tests for the Vessel foundation (docs/feature-backlog.md) — enemy-adapter
 * resolution and processVesselTransforms (break-open + timed hatch).
 * Uses module mocks from helpers.ts.
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestCharacter as regChar,
  registerTestEnemy as regEnemy,
  registerTestVessel,
  registerTestSpell,
  registerTestCollectible,
  createTestPuzzle,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestCharacter,
  createTestEnemy,
  createTestGameState,
} from './helpers';
import { Direction, ActionType, SpellTemplate } from '../../types/game';
import { executeTurn, checkVictoryConditions } from '../simulation';

beforeEach(() => {
  clearAllRegistries();
  regEnemy(
    createTestEnemyDef({
      id: 'spider',
      health: 3,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }],
        defaultFacing: Direction.EAST,
      },
    }),
  );
});

const registerBarrel = (overrides?: Record<string, unknown>) =>
  registerTestVessel({
    id: 'barrel',
    name: 'Barrel',
    health: 2,
    transformEnemyId: 'spider',
    ...overrides,
  });

/** A placed vessel is just a puzzle.enemies entry whose id resolves via the adapter. */
const placedBarrel = (overrides?: Record<string, unknown>) =>
  createTestEnemy({ enemyId: 'barrel', x: 4, y: 2, currentHealth: 2, ...overrides });

const vesselState = (enemies: ReturnType<typeof createTestEnemy>[]) =>
  createTestGameState({
    puzzle: createTestPuzzle({
      width: 8, height: 5,
      winConditions: [{ type: 'defeat_all_enemies' }],
      enemies,
    }),
    gameStatus: 'running',
    currentTurn: 0,
    testMode: true,
  });

describe('vessel transform — broke open (death trigger)', () => {
  it('a dead vessel transforms at end of turn: corpse stays as debris, emerged enemy counts toward the win', () => {
    registerBarrel();
    const gs = vesselState([placedBarrel({ dead: true, currentHealth: 0, diedOnTurn: 0 })]);

    executeTurn(gs);

    expect(gs.puzzle.enemies).toHaveLength(2);
    const emerged = gs.puzzle.enemies[1];
    expect(emerged.enemyId).toBe('spider');
    expect(emerged.x).toBe(4);
    expect(emerged.y).toBe(2);
    expect(emerged.excludeFromWinConditions).toBeUndefined(); // authored content — real kill target
    expect(emerged.spawnedOnTurn).toBe(1); // idle until next turn

    // Vessel corpse stays a corpse (debris), NOT despawned
    expect(gs.puzzle.enemies[0].dead).toBe(true);
    expect(gs.puzzle.enemies[0].despawned).toBeUndefined();
    expect(gs.puzzle.enemies[0].transformedOnTurn).toBe(1);

    // Win continuity: the emerged spider now blocks victory
    expect(checkVictoryConditions(gs)).toBe(false);
    gs.puzzle.enemies[1].dead = true;
    expect(checkVictoryConditions(gs)).toBe(true);
  });

  it('transforms only once', () => {
    registerBarrel();
    const gs = vesselState([placedBarrel({ dead: true, currentHealth: 0, diedOnTurn: 0 })]);

    executeTurn(gs);
    executeTurn(gs);
    expect(gs.puzzle.enemies).toHaveLength(2); // no second spider
  });

  it('a vessel without transformEnemyId is a plain breakable — nothing emerges', () => {
    registerTestVessel({ id: 'barrel', name: 'Barrel', health: 2 });
    const gs = vesselState([placedBarrel({ dead: true, currentHealth: 0, diedOnTurn: 0 })]);

    executeTurn(gs);
    expect(gs.puzzle.enemies).toHaveLength(1);
  });

  it('retries while the tile is occupied, then transforms once it frees', () => {
    registerBarrel();
    // Walker standing on the dead barrel's tile, walking east away from it
    const gs = vesselState([
      placedBarrel({ dead: true, currentHealth: 0, diedOnTurn: 0 }),
      createTestEnemy({
        enemyId: 'spider', x: 4, y: 2, currentHealth: 3,
        actionIndex: 0, active: true, facing: Direction.EAST,
      }),
    ]);

    executeTurn(gs); // blocker moves to (5,2) DURING the turn, so the tile is already free at end of turn
    expect(gs.puzzle.enemies[1].x).toBe(5);
    expect(gs.puzzle.enemies).toHaveLength(3); // transform fired once clear
    expect(gs.puzzle.enemies[0].transformedOnTurn).toBe(1);
  });
});

describe('vessel transform — timed hatch', () => {
  it('a living vessel hatches at end of turn N: vessel leaves without dying, enemy emerges with facing override', () => {
    registerBarrel({ id: 'egg', name: 'Egg', transformAfterTurns: 2, transformFacing: Direction.NORTH });
    const gs = vesselState([createTestEnemy({ enemyId: 'egg', x: 4, y: 2, currentHealth: 2 })]);

    executeTurn(gs); // turn 1 — not yet
    expect(gs.puzzle.enemies).toHaveLength(1);
    expect(gs.puzzle.enemies[0].dead).toBe(false);

    executeTurn(gs); // turn 2 — hatches at end of turn
    expect(gs.puzzle.enemies).toHaveLength(2);
    const emerged = gs.puzzle.enemies[1];
    expect(emerged.enemyId).toBe('spider');
    expect(emerged.facing).toBe(Direction.NORTH); // vessel's facing override

    // The egg left WITHOUT dying: despawned, no diedOnTurn (tile freed immediately)
    expect(gs.puzzle.enemies[0].despawned).toBe(true);
    expect(gs.puzzle.enemies[0].diedOnTurn).toBeUndefined();

    // The hatched spider acts from action 0 the following turn — moving
    // FORWARD along its overridden NORTH facing
    executeTurn(gs);
    expect(gs.puzzle.enemies[1].x).toBe(4);
    expect(gs.puzzle.enemies[1].y).toBe(1);
  });

  it('breaking a timed vessel early still transforms via the death trigger', () => {
    registerBarrel({ id: 'egg', name: 'Egg', transformAfterTurns: 5 });
    const gs = vesselState([createTestEnemy({ enemyId: 'egg', x: 4, y: 2, currentHealth: 2 })]);

    executeTurn(gs); // turn 1 — intact
    gs.puzzle.enemies[0].dead = true; // smashed on turn 2
    gs.puzzle.enemies[0].currentHealth = 0;
    gs.puzzle.enemies[0].diedOnTurn = gs.currentTurn;

    executeTurn(gs); // turn 2 — broke open long before the timer
    expect(gs.puzzle.enemies).toHaveLength(2);
    expect(gs.puzzle.enemies[1].enemyId).toBe('spider');
    expect(gs.puzzle.enemies[0].despawned).toBeUndefined(); // died for real — corpse stays
  });
});

describe('death drops on direct damage (melee) — vessels and enemies', () => {
  // Regression for the 2026-07-11 fix: direct-damage kills (melee/cone/AOE/
  // contact) never fired death drops — only projectile and DOT deaths did.
  // Found via vessels, whose primary break mode is a melee smash.
  const setupMeleeHero = () => {
    registerTestCollectible('gold', { id: 'gold', name: 'Gold', effects: [] });
    registerTestSpell('slash', {
      id: 'slash', name: 'Slash', description: '', thumbnailIcon: '',
      templateType: SpellTemplate.MELEE, directionMode: 'current_facing',
      damage: 5, sprites: {},
    });
    regChar(createTestCharacterDef({
      id: 'hero-basher',
      behavior: [{ type: ActionType.SPELL, spellId: 'slash' }],
    }));
  };

  const meleeState = (enemies: ReturnType<typeof createTestEnemy>[]) =>
    createTestGameState({
      puzzle: createTestPuzzle({ width: 6, height: 5, enemies }),
      gameStatus: 'running',
      currentTurn: 0,
      testMode: true,
      placedCharacters: [createTestCharacter({ characterId: 'hero-basher', x: 2, y: 2, facing: Direction.EAST, actionIndex: 0, active: true })],
    });

  it('a melee-killed enemy drops its loot', () => {
    setupMeleeHero();
    regEnemy(createTestEnemyDef({ id: 'goblin-1', health: 2, droppedCollectibleId: 'gold' }));
    const gs = meleeState([createTestEnemy({ enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 2 })]);

    executeTurn(gs);
    expect(gs.puzzle.enemies[0].dead).toBe(true);
    expect(gs.puzzle.collectibles).toHaveLength(1);
    expect(gs.puzzle.collectibles[0].collectibleId).toBe('gold');
  });

  it('a smashed vessel drops its loot AND its held enemy emerges', () => {
    setupMeleeHero();
    registerTestVessel({
      id: 'loot-barrel', name: 'Loot Barrel', health: 1,
      droppedCollectibleId: 'gold',
      transformEnemyId: 'spider',
    });
    const gs = meleeState([createTestEnemy({ enemyId: 'loot-barrel', x: 3, y: 2, currentHealth: 1 })]);

    executeTurn(gs);
    expect(gs.puzzle.enemies[0].dead).toBe(true); // barrel smashed
    expect(gs.puzzle.collectibles).toHaveLength(1); // gold dropped
    expect(gs.puzzle.enemies).toHaveLength(2); // spider emerged
    expect(gs.puzzle.enemies[1].enemyId).toBe('spider');
  });
});

describe('vessel adapter', () => {
  it('a living vessel is a static entity: never acts, blocks victory until dealt with', () => {
    registerBarrel();
    const gs = vesselState([placedBarrel()]);

    executeTurn(gs);
    expect(gs.puzzle.enemies[0].x).toBe(4); // static — no behavior
    expect(gs.puzzle.enemies[0].dead).toBe(false);
    expect(checkVictoryConditions(gs)).toBe(false); // counts as a kill target (designer curates via excludedEnemyIds)
  });
});
