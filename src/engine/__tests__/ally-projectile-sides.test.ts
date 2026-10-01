/**
 * Projectiles against ALLIES — side by PARTY, bookkeeping by SHAPE.
 *
 * An ally is an enemy-SHAPED entity (a PlacedEnemy in puzzle.enemies)
 * fighting for the hero PARTY. Two questions a projectile path asks about
 * its target must therefore be answered separately:
 *   - which side is it on?   → entityParty (engine/party.ts)
 *   - how do I look it up?   → its shape ('enemyId' in target)
 * Answering both from one shape flag (proj.targetIsEnemy, or a hardcoded
 * targetIsEnemy=false on the hero side) is the bug class pinned here
 * (adversarial review 2026-09-30):
 *   - a homing arrival classified friendly/hostile by the target's SHAPE:
 *     an enemy's damage bolt healed the ally it struck (nothing happened),
 *     and a hero's heal bolt "struck" the ally it was mending;
 *   - a heal capped via a character lookup on an enemy-shaped target
 *     (getCharacter(undefined) → max = current → +0);
 *   - pierce dedup recording an ally by characterId (undefined), so a
 *     bounced piercing bolt struck it twice.
 * Every pin runs under the four clocks of projectile-death-finalise.test.ts
 * (headless, and real mode with the render commit never / on time / late)
 * and expects one series — real and headless resolve these identically.
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
  createEmptyGrid,
  setTile,
} from './helpers';
import { Direction, ActionType, SpellTemplate, TileType } from '../../types/game';
import type { GameState, PlacedEnemy, PlacedCharacter } from '../../types/game';
import { executeTurn, updateProjectiles } from '../simulation';

// ==========================================
// Harness (the four clocks — see projectile-death-finalise.test.ts)
// ==========================================

/** The board's render commit, emulated: every resolved bolt (or only those in `only`) has visibly landed. */
const renderCommit = (gs: GameState, only?: Set<string>): void => {
  const all = gs.activeProjectiles ?? [];
  const landed = all.filter(p => p.active && p.hitResult && (!only || only.has(p.id)));
  if (landed.length === 0) return;
  for (const p of landed) { p.tileEntryTime = 0; p.startTime = 0; }
  gs.activeProjectiles = landed;
  updateProjectiles(gs, new Map());
  const kept = new Set(gs.activeProjectiles ?? []);
  gs.activeProjectiles = all.filter(p => !landed.includes(p) || kept.has(p));
};

type Clock = 'headless' | 'no-commit' | 'commit-wins' | 'commit-late';
const CLOCKS: Clock[] = ['headless', 'no-commit', 'commit-wins', 'commit-late'];

const runClock = <T>(build: () => GameState, clock: Clock, turns: number, probe: (gs: GameState) => T) => {
  const gs = build();
  if (clock === 'headless') gs.headlessMode = true;
  const series: T[] = [];
  let late = new Set<string>();
  for (let t = 0; t < turns; t++) {
    executeTurn(gs);
    series.push(probe(gs));
    if (clock === 'commit-wins') renderCommit(gs);
    if (clock === 'commit-late') {
      renderCommit(gs, late);
      late = new Set((gs.activeProjectiles ?? []).filter(p => p.active && p.hitResult).map(p => p.id));
    }
  }
  if (clock !== 'headless' && clock !== 'no-commit') renderCommit(gs);
  return { gs, series, final: probe(gs) };
};

/** Every clock must produce the headless series (and the same end state). */
const expectClockParity = <T>(build: () => GameState, turns: number, probe: (gs: GameState) => T) => {
  const ref = runClock(build, 'headless', turns, probe);
  for (const clock of CLOCKS.slice(1)) {
    const got = runClock(build, clock, turns, probe);
    expect({ clock, series: got.series, final: got.final }).toEqual({ clock, series: ref.series, final: ref.final });
  }
  return ref;
};

// ==========================================
// Fixtures
// ==========================================

const base = { description: '', thumbnailIcon: '', sprites: {} };
const W = (n: number) => Array.from({ length: n }, () => ({ type: ActionType.WAIT }));

beforeEach(() => {
  clearAllRegistries();
  registerTestSpell('homing-bolt', { id: 'homing-bolt', name: 'Homing Bolt', ...base, templateType: SpellTemplate.LINEAR, directionMode: 'current_facing', damage: 3, projectileSpeed: 4, range: 6 });
  registerTestSpell('homing-heal', { id: 'homing-heal', name: 'Homing Heal', ...base, templateType: SpellTemplate.LINEAR, directionMode: 'current_facing', healing: 3, projectileSpeed: 4, range: 6 });
  registerTestSpell('heal-bolt', { id: 'heal-bolt', name: 'Heal Bolt', ...base, templateType: SpellTemplate.LINEAR, directionMode: 'current_facing', healing: 3, projectileSpeed: 4, range: 6 });
  regChar(createTestCharacterDef({ id: 'idle', health: 10, behavior: [...W(8)] as never }));
});

const stateOf = (enemies: PlacedEnemy[], heroes: PlacedCharacter[], tiles?: ReturnType<typeof createEmptyGrid>) => createTestGameState({
  puzzle: createTestPuzzle({ width: 8, height: 5, enemies, ...(tiles ? { tiles } : {}) }),
  placedCharacters: heroes, gameStatus: 'running', currentTurn: 0, testMode: true,
});
const hero = (characterId: string, x: number, y: number, facing: Direction, currentHealth = 10) =>
  createTestCharacter({ characterId, x, y, facing, currentHealth, actionIndex: 0, active: true });
/** A placed ally: lives in puzzle.enemies, stamped party: 'hero'. */
const ally = (enemyId: string, x: number, y: number, currentHealth: number) =>
  createTestEnemy({ enemyId, x, y, currentHealth, party: 'hero' });
const logicallyDead = (e: PlacedEnemy | PlacedCharacter) => e.dead || !!e.pendingProjectileDeath;
/** A one-shot homing cast, then idle. */
const homingCast = (spellId: string, opposing: 'character' | 'enemy') => [
  { type: ActionType.SPELL, spellId, homing: true, homingPathStyle: 'grid',
    ...(opposing === 'character' ? { autoTargetNearestCharacter: true } : { autoTargetNearestEnemy: true }) },
  ...W(8),
] as never;

// ==========================================
// Homing arrivals: hostile or friendly by the target's PARTY
// ==========================================

describe('a homing bolt reaching an ally treats it as the hero party it fights for', () => {
  it("an enemy's homing damage bolt strikes the ally (it used to be classified friendly and do nothing)", () => {
    regAlly(createTestEnemyDef({ id: 'squire', health: 1 }));
    // Enemy authoring: autoTargetNearestCharacter = "Opposing Team" = the hero party, ally included.
    regEnemy(createTestEnemyDef({
      id: 'gunner', health: 10,
      behavior: { type: 'active', pattern: homingCast('homing-bolt', 'character'), defaultFacing: Direction.WEST } as never,
    }));
    const ref = expectClockParity(() => stateOf(
      [
        createTestEnemy({ enemyId: 'gunner', x: 6, y: 2, currentHealth: 10, facing: Direction.WEST, actionIndex: 0, active: true }),
        ally('squire', 3, 2, 1),
      ],
      [hero('idle', 0, 4, Direction.EAST)], // farther than the squire — the bolt picks the ally
    ), 3, gs => ({
      squireHp: gs.puzzle.enemies[1].currentHealth,
      squireDead: logicallyDead(gs.puzzle.enemies[1]),
      heroHp: gs.placedCharacters[0].currentHealth,
    }));
    expect(ref.final).toMatchObject({ squireDead: true, heroHp: 10 });
  });

  it("a hero's homing heal bolt mends the ally, capped at the ally's asset max (it used to be classified hostile)", () => {
    regAlly(createTestEnemyDef({ id: 'squire', health: 4 }));
    // Hero authoring: autoTargetNearestCharacter = "Same Team" — the ally is the only teammate.
    regChar(createTestCharacterDef({ id: 'cleric', health: 10, behavior: homingCast('homing-heal', 'character') }));
    const ref = expectClockParity(() => stateOf(
      [ally('squire', 3, 2, 2)],
      [hero('cleric', 0, 2, Direction.EAST)],
    ), 3, gs => ({ squireHp: gs.puzzle.enemies[0].currentHealth }));
    expect(ref.final).toEqual({ squireHp: 4 }); // 2 + 3, capped at the squire's 4 — not +0
  });

  // Controls: the same-shape heals every pre-ally puzzle relies on — unchanged.
  it('control: a hero homing-heals a hero, capped at the character asset max', () => {
    regChar(createTestCharacterDef({ id: 'cleric', health: 10, behavior: homingCast('homing-heal', 'character') }));
    regChar(createTestCharacterDef({ id: 'knight', health: 4, behavior: [...W(8)] as never }));
    const ref = expectClockParity(() => stateOf(
      [],
      [hero('cleric', 0, 2, Direction.EAST), hero('knight', 3, 2, Direction.WEST, 2)],
    ), 3, gs => ({ knightHp: gs.placedCharacters[1].currentHealth }));
    expect(ref.final).toEqual({ knightHp: 4 });
  });

  it('control: an enemy homing-heals an enemy, capped at the enemy asset max', () => {
    regEnemy(createTestEnemyDef({ id: 'goblin-1', health: 4 }));
    // Enemy authoring: autoTargetNearestEnemy = "Same Team".
    regEnemy(createTestEnemyDef({
      id: 'priest', health: 10,
      behavior: { type: 'active', pattern: homingCast('homing-heal', 'enemy'), defaultFacing: Direction.WEST } as never,
    }));
    const ref = expectClockParity(() => stateOf(
      [
        createTestEnemy({ enemyId: 'priest', x: 6, y: 2, currentHealth: 10, facing: Direction.WEST, actionIndex: 0, active: true }),
        createTestEnemy({ enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 2 }),
      ],
      [hero('idle', 0, 4, Direction.EAST)],
    ), 3, gs => ({ goblinHp: gs.puzzle.enemies[1].currentHealth }));
    expect(ref.final).toEqual({ goblinHp: 4 });
  });
});

// ==========================================
// Non-homing walker (walkNonHomingTick): an ally is recorded and healed by its shape
// ==========================================

describe('a non-homing bolt crossing an ally', () => {
  it("a hero's heal bolt mends the ally in its path, capped at the ally's asset max", () => {
    regAlly(createTestEnemyDef({ id: 'squire', health: 4 }));
    regChar(createTestCharacterDef({ id: 'medic', health: 10, behavior: [{ type: ActionType.SPELL, spellId: 'heal-bolt' }, ...W(8)] as never }));
    const ref = expectClockParity(() => stateOf(
      [ally('squire', 3, 2, 2)],
      [hero('medic', 1, 2, Direction.EAST)],
    ), 3, gs => ({ squireHp: gs.puzzle.enemies[0].currentHealth }));
    expect(ref.final).toEqual({ squireHp: 4 });
  });

  /**
   * Pierce + one turn-around bounce: the bolt flies east over (3,2), turns
   * at the wall on (6,2), and flies back over (3,2) the same turn. Pierce
   * dedup must stop the second strike — for an ally exactly as for a hero.
   */
  const bounceScenario = (target: 'ally' | 'hero') => () => {
    const tiles = createEmptyGrid(8, 5);
    setTile(tiles, 6, 2, TileType.WALL);
    return stateOf(
      [
        createTestEnemy({ enemyId: 'gunner', x: 0, y: 2, currentHealth: 10, facing: Direction.EAST, actionIndex: 0, active: true }),
        ...(target === 'ally' ? [ally('squire', 3, 2, 5)] : []),
      ],
      target === 'hero' ? [hero('knight', 3, 2, Direction.WEST, 5)] : [hero('idle', 0, 4, Direction.EAST)],
      tiles,
    );
  };
  const registerBounce = () => {
    registerTestSpell('bounce-bolt', {
      id: 'bounce-bolt', name: 'Bounce Bolt', ...base,
      templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
      damage: 1, projectileSpeed: 8, range: 10,
      pierceEnemies: true, bounceOffWalls: true, bounceBehavior: 'turn_around', maxBounces: 1,
    });
    regEnemy(createTestEnemyDef({
      id: 'gunner', health: 10,
      behavior: { type: 'active', pattern: [{ type: ActionType.SPELL, spellId: 'bounce-bolt' }, ...W(8)], defaultFacing: Direction.EAST } as never,
    }));
    regAlly(createTestEnemyDef({ id: 'squire', health: 5 }));
    regChar(createTestCharacterDef({ id: 'knight', health: 5, behavior: [...W(8)] as never }));
  };

  it('a piercing bolt that bounces back over an ally strikes it once', () => {
    registerBounce();
    const ref = expectClockParity(bounceScenario('ally'), 3, gs => ({ squireHp: gs.puzzle.enemies[1].currentHealth }));
    expect(ref.final).toEqual({ squireHp: 4 });
  });

  it('control: the same bolt over a hero strikes it once', () => {
    registerBounce();
    const ref = expectClockParity(bounceScenario('hero'), 3, gs => ({ knightHp: gs.placedCharacters[0].currentHealth }));
    expect(ref.final).toEqual({ knightHp: 4 });
  });

  it("a hero's piercing heal bolt that bounces back over an ally mends it once", () => {
    registerTestSpell('bounce-heal', {
      id: 'bounce-heal', name: 'Bounce Heal', ...base,
      templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
      healing: 3, projectileSpeed: 8, range: 10,
      pierceEnemies: true, bounceOffWalls: true, bounceBehavior: 'turn_around', maxBounces: 1,
    });
    regChar(createTestCharacterDef({ id: 'medic', health: 10, behavior: [{ type: ActionType.SPELL, spellId: 'bounce-heal' }, ...W(8)] as never }));
    regAlly(createTestEnemyDef({ id: 'squire', health: 10 }));
    const ref = expectClockParity(() => {
      const tiles = createEmptyGrid(8, 5);
      setTile(tiles, 6, 2, TileType.WALL);
      return stateOf([ally('squire', 3, 2, 1)], [hero('medic', 0, 2, Direction.EAST)], tiles);
    }, 3, gs => ({ squireHp: gs.puzzle.enemies[0].currentHealth }));
    expect(ref.final).toEqual({ squireHp: 4 }); // 1 + 3 — not 7
  });
});
