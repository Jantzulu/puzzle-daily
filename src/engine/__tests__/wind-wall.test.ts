/**
 * Wind wall — projectile-destroying persistent zones (2026-07-16).
 *
 * A PersistentAreaEffect with `destroysProjectiles` eats projectiles as
 * they ENTER any tile the zone covers, before an entity standing there can
 * be hit ('hostile' = only bolts fighting against the zone's sourceParty,
 * 'all' = every bolt). Enforcement lives inside the shared walkers
 * (walkNonHomingTick, planHomingTick), so real and headless modes must
 * agree by construction — every scenario here runs the parity harness.
 * THROW_PLACE tosses are exempt (items, not attacks — reflect's carve-out).
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestCharacter as regChar,
  registerTestEnemy as regEnemy,
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
import type { GameState, PersistentAreaEffect, PlacedCharacter, PlacedEnemy } from '../../types/game';
import { executeTurn } from '../simulation';

// ==========================================
// Harness (same parity method as audit-parity.test.ts)
// ==========================================

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
  collectibles: (gs.puzzle.collectibles ?? []).map(c => ({
    collectibleId: c.collectibleId,
    x: c.x, y: c.y,
    collected: !!c.collected,
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

// ==========================================
// Fixtures
// ==========================================

beforeEach(() => {
  clearAllRegistries();
  const base = { description: '', thumbnailIcon: '', sprites: {} };
  registerTestSpell('bolt', {
    id: 'bolt', name: 'Bolt', ...base,
    templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
    damage: 3, projectileSpeed: 4, range: 6,
  });
  registerTestSpell('windwall', {
    id: 'windwall', name: 'Wind Wall', ...base,
    templateType: SpellTemplate.AOE, directionMode: 'current_facing',
    radius: 1, aoeCenteredOnCaster: true, damage: 0, cooldown: 10,
    persistDuration: 5, persistDamagePerTurn: 0,
    persistDestroysProjectiles: 'hostile',
  });
  registerTestSpell('throw-gold', {
    id: 'throw-gold', name: 'Throw Gold', ...base,
    templateType: SpellTemplate.THROW_PLACE, directionMode: 'current_facing',
    spawnCollectibleId: 'gold', range: 3, projectileSpeed: 4, cooldown: 10,
  });
  registerTestCollectible('gold', { id: 'gold', name: 'Gold', effects: [] });
  regEnemy(createTestEnemyDef()); // goblin-1, static, health 5
  regChar(createTestCharacterDef({
    id: 'archer', health: 10,
    behavior: [{ type: ActionType.SPELL, spellId: 'bolt' }, { type: ActionType.REPEAT }] as never,
  }));
});

/** Zone factory — direct-push into gameState for kill-rule isolation. */
const makeZone = (over: Partial<PersistentAreaEffect> = {}): PersistentAreaEffect => ({
  id: 'zone-test',
  x: 4, y: 2,
  radius: 0,
  damagePerTurn: 0,
  turnsRemaining: 10,
  sourceParty: 'enemy',
  destroysProjectiles: 'hostile',
  ...over,
});

const archerVsGoblin = (opts: {
  zones?: PersistentAreaEffect[];
  heroes?: PlacedCharacter[];
  enemies?: PlacedEnemy[];
}) =>
  createTestGameState({
    puzzle: createTestPuzzle({
      width: 8, height: 5,
      enemies: opts.enemies ?? [createTestEnemy({ enemyId: 'goblin-1', x: 6, y: 2, currentHealth: 5 })],
    }),
    placedCharacters: opts.heroes ?? [createTestCharacter({
      characterId: 'archer', x: 1, y: 2, facing: Direction.EAST,
      currentHealth: 10, actionIndex: 0, active: true,
    })],
    persistentAreaEffects: opts.zones ?? [],
    gameStatus: 'running',
    currentTurn: 0,
    testMode: true,
  });

// ==========================================
// Linear (non-homing) bolts
// ==========================================

describe('wind wall vs linear bolts', () => {
  it("a hostile zone eats the bolt — the enemy behind it never takes damage, in BOTH modes", () => {
    const final = expectParity(() => archerVsGoblin({
      zones: [makeZone()], // enemy-side wall at (4,2), on the bolt's path
    }), 3);
    expect(final.enemies[0].health).toBe(5);
    expect(final.enemies[0].dead).toBe(false);
  });

  it('real mode: the bolt deactivates AT the zone tile, not the end of its path', () => {
    const gs = archerVsGoblin({ zones: [makeZone()] });
    executeTurn(gs);
    const proj = gs.activeProjectiles!.find(p => p.hitResult);
    expect(proj).toBeDefined();
    expect(proj!.hitResult!.deactivate).toBe(true);
    // The hitTileIndex must point at the zone tile (4,2) within the visual
    // tilePath — the generic fallback would have aimed at the path's end
    // and flown the sprite through the wall of wind.
    const killTile = proj!.tilePath![proj!.hitResult!.hitTileIndex];
    expect({ x: killTile.x, y: killTile.y }).toEqual({ x: 4, y: 2 });
  });

  it('control: the same zone WITHOUT the flag lets bolts through (enemy dies)', () => {
    const final = expectParity(() => archerVsGoblin({
      zones: [makeZone({ destroysProjectiles: undefined })],
    }), 3);
    expect(final.enemies[0].dead).toBe(true);
  });

  it("a 'hostile' zone passes its OWN side's bolts (hero zone, hero bolt)", () => {
    const final = expectParity(() => archerVsGoblin({
      zones: [makeZone({ sourceParty: 'hero' })],
    }), 3);
    expect(final.enemies[0].dead).toBe(true);
  });

  it("an 'all' zone eats even its own side's bolts", () => {
    const final = expectParity(() => archerVsGoblin({
      zones: [makeZone({ sourceParty: 'hero', destroysProjectiles: 'all' })],
    }), 3);
    expect(final.enemies[0].health).toBe(5);
    expect(final.enemies[0].dead).toBe(false);
  });

  it('an expired zone stops screening — later bolts get through', () => {
    // Zone lives 1 turn: it eats the turn-1 bolt (projectiles resolve
    // before zones tick), then expires; the repeat-firing archer's later
    // bolts land normally.
    const final = expectParity(() => archerVsGoblin({
      zones: [makeZone({ turnsRemaining: 1 })],
    }), 4);
    expect(final.enemies[0].dead).toBe(true);
  });
});

// ==========================================
// Homing bolts
// ==========================================

describe('wind wall vs homing bolts', () => {
  it('straight homing: a zone mid-flight eats the bolt on its advance leg, in BOTH modes', () => {
    regChar(createTestCharacterDef({
      id: 'homing-archer', health: 10,
      behavior: [
        { type: ActionType.SPELL, spellId: 'bolt', autoTargetNearestEnemy: true, homing: true, homingPathStyle: 'straight' },
        { type: ActionType.REPEAT },
      ] as never,
    }));
    const final = expectParity(() => archerVsGoblin({
      zones: [makeZone()], // (4,2) between archer (1,2) and goblin (6,2)
      heroes: [createTestCharacter({
        characterId: 'homing-archer', x: 1, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    }), 4);
    expect(final.enemies[0].health).toBe(5);
    expect(final.enemies[0].dead).toBe(false);
  });

  it("straight homing: a zone ON the target's tile screens the target (reach leg), in BOTH modes", () => {
    regChar(createTestCharacterDef({
      id: 'homing-archer', health: 10,
      behavior: [
        { type: ActionType.SPELL, spellId: 'bolt', autoTargetNearestEnemy: true, homing: true, homingPathStyle: 'straight' },
        { type: ActionType.REPEAT },
      ] as never,
    }));
    const final = expectParity(() => archerVsGoblin({
      enemies: [createTestEnemy({ enemyId: 'goblin-1', x: 4, y: 2, currentHealth: 5 })],
      zones: [makeZone()], // zone sits exactly on the goblin's tile
      heroes: [createTestCharacter({
        characterId: 'homing-archer', x: 1, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    }), 3);
    expect(final.enemies[0].health).toBe(5);
    expect(final.enemies[0].dead).toBe(false);
  });
});

// ==========================================
// Exemptions + the authored cast path
// ==========================================

describe('wind wall exemptions and authoring', () => {
  it("THROW_PLACE tosses sail over zones — even 'all' zones never eat items", () => {
    regChar(createTestCharacterDef({
      id: 'thrower', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'throw-gold' }, { type: ActionType.REPEAT }] as never,
    }));
    const final = expectParity(() => archerVsGoblin({
      enemies: [],
      zones: [makeZone({ x: 2, y: 2, destroysProjectiles: 'all' })],
      heroes: [createTestCharacter({
        characterId: 'thrower', x: 0, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    }), 1);
    expect(final.collectibles).toHaveLength(1);
    expect(final.collectibles[0]).toMatchObject({ x: 3, y: 2, collected: false });
  });

  it('e2e: a cast wind-wall AOE stamps the zone and screens the caster from enemy bolts', () => {
    regChar(createTestCharacterDef({
      id: 'warden', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'windwall' }, { type: ActionType.REPEAT }] as never,
    }));
    regEnemy(createTestEnemyDef({
      id: 'enemy-archer', health: 5,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.SPELL, spellId: 'bolt' }, { type: ActionType.REPEAT }],
        defaultFacing: Direction.WEST,
      },
    }));
    const build = () => archerVsGoblin({
      enemies: [createTestEnemy({ enemyId: 'enemy-archer', x: 6, y: 2, currentHealth: 5, facing: Direction.WEST })],
      heroes: [createTestCharacter({
        characterId: 'warden', x: 1, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });

    // Stamping: after turn 1 the cast created a projectile-destroying zone
    // fighting for the hero side.
    const gs = build();
    executeTurn(gs);
    expect(gs.persistentAreaEffects).toHaveLength(1);
    expect(gs.persistentAreaEffects![0]).toMatchObject({
      destroysProjectiles: 'hostile',
      sourceParty: 'hero',
      radius: 1,
    });

    // Screening: the enemy archer's bolts die at the wall's rim; the warden
    // never takes damage. Identical in both modes.
    const final = expectParity(build, 4);
    expect(final.heroes[0].health).toBe(10);
    expect(final.heroes[0].dead).toBe(false);
  });
});
