/**
 * Projectile linger (2026-07-16) — an unspent non-homing bolt with
 * `lingerDuration` drops a single-trigger hazard on the tile its flight
 * ended on (range end or wall stop). The first OPPOSING entity to step on
 * it takes the bolt's hit exactly as if struck in flight; own-side walkers
 * pass safely; the hazard expires after N full turns. Creation and
 * consumption live in shared engine code, so every scenario runs the
 * real/headless parity harness.
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
  createEmptyGrid,
  setTile,
} from './helpers';
import { Direction, ActionType, SpellTemplate, TileType } from '../../types/game';
import type { GameState, PersistentAreaEffect, PlacedEnemy } from '../../types/game';
import { executeTurn } from '../simulation';

const normalize = (gs: GameState) => ({
  enemies: gs.puzzle.enemies.map(e => ({
    enemyId: e.enemyId,
    x: e.x, y: e.y,
    health: e.currentHealth,
    dead: !!(e.dead || e.pendingProjectileDeath),
  })),
  heroes: gs.placedCharacters.map(c => ({
    characterId: c.characterId,
    x: c.x, y: c.y,
    health: c.currentHealth,
    dead: !!(c.dead || c.pendingProjectileDeath),
  })),
  hazards: (gs.lingeringHazards ?? []).map(h => ({
    x: h.x, y: h.y,
    turnsRemaining: h.turnsRemaining,
    consumed: !!h.consumed,
  })),
});

const expectParity = (build: () => GameState, turns: number) => {
  const visual = build();
  const headless = build();
  headless.headlessMode = true;
  for (let t = 0; t < turns; t++) {
    executeTurn(visual);
    executeTurn(headless);
  }
  expect(normalize(visual)).toEqual(normalize(headless));
  return normalize(visual);
};

beforeEach(() => {
  clearAllRegistries();
  const base = { description: '', thumbnailIcon: '', sprites: {} };
  registerTestSpell('linger-bolt', {
    id: 'linger-bolt', name: 'Linger Bolt', ...base,
    templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
    damage: 3, projectileSpeed: 4, range: 3, cooldown: 10,
    lingerDuration: 5,
  });
  regEnemy(createTestEnemyDef()); // goblin-1, static, health 5
  regEnemy(createTestEnemyDef({
    id: 'walker', health: 4,
    behavior: {
      type: 'active',
      pattern: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }],
      defaultFacing: Direction.WEST,
    },
  }));
  regChar(createTestCharacterDef({
    id: 'archer', health: 10,
    behavior: [{ type: ActionType.SPELL, spellId: 'linger-bolt' }, { type: ActionType.REPEAT }] as never,
  }));
});

const buildState = (opts: {
  enemies?: PlacedEnemy[];
  zones?: PersistentAreaEffect[];
  tiles?: ReturnType<typeof createEmptyGrid>;
  lingerOverride?: Record<string, unknown>;
}) =>
  createTestGameState({
    puzzle: createTestPuzzle({
      width: 8, height: 5,
      tiles: opts.tiles ?? createEmptyGrid(8, 5),
      enemies: opts.enemies ?? [],
    }),
    placedCharacters: [createTestCharacter({
      characterId: 'archer', x: 1, y: 2, facing: Direction.EAST,
      currentHealth: 10, actionIndex: 0, active: true,
    })],
    persistentAreaEffects: opts.zones ?? [],
    gameStatus: 'running',
    currentTurn: 0,
    testMode: true,
  });

describe('projectile linger', () => {
  it('an unspent bolt drops its hazard at range end, in BOTH modes', () => {
    const final = expectParity(() => buildState({}), 1);
    // Range 3 from (1,2) heading east → flight ends at (4,2).
    expect(final.hazards).toHaveLength(1);
    expect(final.hazards[0]).toMatchObject({ x: 4, y: 2, consumed: false });
  });

  it('a wall-stopped bolt lingers on the tile in front of the wall', () => {
    registerTestSpell('linger-bolt', {
      id: 'linger-bolt', name: 'Linger Bolt', description: '', thumbnailIcon: '', sprites: {},
      templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
      damage: 3, projectileSpeed: 4, range: 6, cooldown: 10,
      lingerDuration: 5,
    });
    const tiles = createEmptyGrid(8, 5);
    setTile(tiles, 4, 2, TileType.WALL);
    const final = expectParity(() => buildState({ tiles }), 1);
    expect(final.hazards).toHaveLength(1);
    expect(final.hazards[0]).toMatchObject({ x: 3, y: 2 });
  });

  it("a bolt that HITS someone doesn't linger", () => {
    const final = expectParity(() => buildState({
      enemies: [createTestEnemy({ enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5 })],
    }), 1);
    expect(final.hazards).toHaveLength(0);
    expect(final.enemies[0].health).toBe(2);
  });

  it('a wind-wall kill leaves no hazard behind', () => {
    const final = expectParity(() => buildState({
      zones: [{
        id: 'zone-test', x: 3, y: 2, radius: 0, damagePerTurn: 0,
        turnsRemaining: 10, sourceParty: 'enemy', destroysProjectiles: 'hostile',
      }],
    }), 1);
    expect(final.hazards).toHaveLength(0);
  });

  it('the first opposing walker takes the hit; the one behind passes the spent hazard', () => {
    const final = expectParity(() => buildState({
      enemies: [
        createTestEnemy({ enemyId: 'walker', x: 6, y: 2, currentHealth: 4, facing: Direction.WEST }),
        createTestEnemy({ enemyId: 'walker', x: 7, y: 2, currentHealth: 4, facing: Direction.WEST }),
      ],
    }), 3);
    // Hazard lands at (4,2) on turn 1. Lead walker arrives turn 3
    // (6→5→4): takes the bolt's 3 damage. The trailing walker never pays.
    const lead = final.enemies[0];
    const trail = final.enemies[1];
    expect(lead.health).toBe(1);
    expect(trail.health).toBe(4);
    // Consumed hazard was swept at end of the trigger turn.
    expect(final.hazards).toHaveLength(0);
  });

  it("own-side entities walk over their bolt's hazard safely", () => {
    regChar(createTestCharacterDef({
      id: 'runner', health: 10,
      behavior: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }],
    }));
    const build = () => {
      const gs = buildState({});
      gs.placedCharacters.push(createTestCharacter({
        characterId: 'runner', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      }));
      return gs;
    };
    const final = expectParity(build, 3);
    // Runner walks 2→3→4→5, crossing the hero bolt's hazard at (4,2) unharmed.
    const runner = final.heroes.find(h => h.characterId === 'runner')!;
    expect(runner.health).toBe(10);
    expect(final.hazards).toHaveLength(1); // still armed
    expect(final.hazards[0].consumed).toBe(false);
  });

  it('an expired hazard is harmless — late walkers pass free', () => {
    registerTestSpell('linger-bolt', {
      id: 'linger-bolt', name: 'Linger Bolt', description: '', thumbnailIcon: '', sprites: {},
      templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
      damage: 3, projectileSpeed: 4, range: 3, cooldown: 10,
      lingerDuration: 1, // lives through exactly one post-landing turn
    });
    const final = expectParity(() => buildState({
      enemies: [createTestEnemy({ enemyId: 'walker', x: 7, y: 2, currentHealth: 4, facing: Direction.WEST })],
    }), 5);
    // Hazard lands (4,2) turn 1, survives turn 2, swept end of turn 2.
    // Walker arrives (4,2) on turn 4 — long gone.
    expect(final.hazards).toHaveLength(0);
    expect(final.enemies[0].health).toBe(4);
  });
});
