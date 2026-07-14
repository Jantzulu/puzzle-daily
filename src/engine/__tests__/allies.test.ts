/**
 * ALLIES — slice 1 engine pins (docs/feature-backlog.md, user design
 * 2026-07-13). An Ally is a full enemy-shaped asset in its own storage
 * namespace whose PLACEMENT lives in puzzle.enemies stamped party: 'hero'.
 * Everything else — behavior loop, team-relative targeting, win conditions,
 * hero auto-target — must already resolve through the shipped party model
 * with no ally-specific engine code. These pins prove that.
 *
 * Authoring note pinned here: ally behaviors use the ENEMY-shaped builder,
 * so the "Opposing Team" auto-target flag is autoTargetNearestCharacter
 * (resolved against the caster's effective party at runtime — for an ally
 * that's 'hero', so opposing = the enemy party). Same mapping hero-party
 * summons already rely on.
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
import { Direction, ActionType, SpellTemplate } from '../../types/game';
import type { GameState, PlacedEnemy, PlacedCharacter } from '../../types/game';
import { executeTurn } from '../simulation';

// ==========================================
// Fixtures
// ==========================================

beforeEach(() => {
  clearAllRegistries();
  registerTestSpell('bolt', {
    id: 'bolt', name: 'Bolt', description: '', thumbnailIcon: '', sprites: {},
    templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
    damage: 2, projectileSpeed: 4, range: 6,
  });
  // Static enemy target
  regEnemy(createTestEnemyDef({ id: 'goblin-1', health: 5 }));
  // Enemy caster
  regEnemy(createTestEnemyDef({
    id: 'warlock', health: 10,
    behavior: {
      type: 'active',
      pattern: [{
        type: ActionType.SPELL, spellId: 'bolt',
        autoTargetNearestCharacter: true, // "Opposing Team" from enemy authoring
      }, { type: ActionType.REPEAT }],
      defaultFacing: Direction.EAST,
    },
  }));
  // Fighting ally: casts at the opposing team every turn
  regAlly(createTestEnemyDef({
    id: 'guard', health: 8,
    behavior: {
      type: 'active',
      pattern: [{
        type: ActionType.SPELL, spellId: 'bolt',
        autoTargetNearestCharacter: true, // "Opposing Team" — resolves to enemies for a hero-party caster
      }, { type: ActionType.REPEAT }],
      defaultFacing: Direction.EAST,
    },
  }));
  // Static ally: the King/Princess archetype — just stands there
  regAlly(createTestEnemyDef({ id: 'squire', health: 8 }));
});

/** A placed ally: lives in puzzle.enemies, stamped party: 'hero'. */
const placedAlly = (allyId: string, x: number, y: number, extra?: Partial<PlacedEnemy>): PlacedEnemy =>
  createTestEnemy({
    enemyId: allyId, x, y,
    currentHealth: allyId === 'guard' || allyId === 'squire' ? 8 : 5,
    actionIndex: 0, active: true, facing: Direction.EAST,
    party: 'hero',
    ...extra,
  });

const baseState = (opts: { enemies?: PlacedEnemy[]; heroes?: PlacedCharacter[]; checkConditions?: boolean }) =>
  createTestGameState({
    puzzle: createTestPuzzle({ width: 8, height: 5, enemies: opts.enemies ?? [] }),
    placedCharacters: opts.heroes ?? [],
    gameStatus: 'running',
    currentTurn: 0,
    // testMode SKIPS win/lose checks entirely (simulation.ts checkGameConditions
    // gate) — the two gameStatus pins need them live.
    testMode: !opts.checkConditions,
  });

// ==========================================
// Pins
// ==========================================

describe('allies (slice 1: engine foundation)', () => {
  it('an ally with an attack behavior fights the ENEMY party', () => {
    const gs = baseState({
      enemies: [
        placedAlly('guard', 2, 2),
        createTestEnemy({ enemyId: 'goblin-1', x: 5, y: 2, currentHealth: 5, actionIndex: 0, active: true }),
      ],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[1].currentHealth).toBe(3); // goblin took the bolt
    expect(gs.puzzle.enemies[0].currentHealth).toBe(8); // guard untouched
  });

  it('enemy auto-targeting finds and hits a hero-party ally', () => {
    const gs = baseState({
      enemies: [
        createTestEnemy({ enemyId: 'warlock', x: 0, y: 2, currentHealth: 10, actionIndex: 0, active: true, facing: Direction.EAST }),
        placedAlly('squire', 4, 2),
      ],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[1].currentHealth).toBe(6); // squire took the bolt
    expect(gs.gameStatus).toBe('running');
  });

  it('hero auto-targeting does NOT see an ally as an enemy', () => {
    regChar(createTestCharacterDef({
      id: 'archer', health: 10,
      behavior: [{
        type: ActionType.SPELL, spellId: 'bolt', autoTargetNearestEnemy: true,
      }, { type: ActionType.REPEAT }] as never,
    }));
    const gs = baseState({
      enemies: [placedAlly('squire', 3, 2)],
      heroes: [createTestCharacter({
        characterId: 'archer', x: 0, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(8); // no visible target -> no cast
    expect(gs.activeProjectiles ?? []).toHaveLength(0);
  });

  it('defeat_all_enemies ignores living allies — killing the real enemies wins', () => {
    regChar(createTestCharacterDef({
      id: 'archer', health: 10,
      behavior: [{
        type: ActionType.SPELL, spellId: 'bolt', autoTargetNearestEnemy: true,
      }, { type: ActionType.REPEAT }] as never,
    }));
    const gs = baseState({
      checkConditions: true,
      enemies: [
        createTestEnemy({ enemyId: 'goblin-1', x: 4, y: 2, currentHealth: 2, actionIndex: 0, active: true }),
        placedAlly('squire', 2, 4),
      ],
      heroes: [createTestCharacter({
        characterId: 'archer', x: 0, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs); // bolt kills the goblin (2 hp, 2 dmg)
    executeTurn(gs); // deferred death settles; victory check passes
    expect(gs.gameStatus).toBe('victory'); // squire alive, and that's fine
  });

  it('an ally dying is NOT a hero defeat', () => {
    regChar(createTestCharacterDef({ id: 'bystander', health: 10, behavior: [{ type: ActionType.WAIT }] as never }));
    const gs = baseState({
      checkConditions: true,
      enemies: [
        createTestEnemy({ enemyId: 'warlock', x: 0, y: 2, currentHealth: 10, actionIndex: 0, active: true, facing: Direction.EAST }),
        placedAlly('squire', 4, 2, { currentHealth: 2 }),
      ],
      heroes: [createTestCharacter({
        // Far corner: warlock's nearest opposing target must be the squire
        // (dist 4), not this hero (dist ~7.3)
        characterId: 'bystander', x: 7, y: 4, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs);
    executeTurn(gs);
    const squire = gs.puzzle.enemies[1];
    expect(!!(squire.dead || squire.pendingProjectileDeath)).toBe(true);
    expect(gs.gameStatus).toBe('running'); // hero alive, warlock alive — game goes on
  });

  it('real and headless modes agree on an ally battle', () => {
    const build = () => baseState({
      enemies: [
        placedAlly('guard', 2, 2),
        createTestEnemy({ enemyId: 'warlock', x: 6, y: 2, currentHealth: 10, actionIndex: 0, active: true, facing: Direction.WEST }),
      ],
    });
    const normalize = (gs: GameState) =>
      gs.puzzle.enemies.map(e => ({
        enemyId: e.enemyId,
        health: e.currentHealth,
        dead: !!(e.dead || e.pendingProjectileDeath),
        party: e.party,
      }));
    const visual = build();
    const headless = build();
    headless.headlessMode = true;
    for (let t = 0; t < 4; t++) {
      executeTurn(visual);
      executeTurn(headless);
    }
    expect(normalize(visual)).toEqual(normalize(headless));
    // And the duel actually happened: both sides traded bolts
    expect(normalize(visual)[0].health).toBeLessThan(8);
    expect(normalize(visual)[1].health).toBeLessThan(10);
  });
});
