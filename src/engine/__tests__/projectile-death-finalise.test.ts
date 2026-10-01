/**
 * Projectile kills: one logical death, whatever the render clock does.
 *
 * Real (visual) mode holds a projectile kill as pendingProjectileDeath
 * (dead=false) between turns until the bolt visibly lands; the board's
 * render commit (updateProjectiles → commitDeferredVisualDamage) races the
 * turn tick, loses at the end of a turn's reach, and never runs in a hidden
 * tab or in these tests. The engine therefore owns the whole death:
 *   - at the hit, both modes do the same thing (dead for the rest of the
 *     turn, on_death fired, drop placed, diedOnTurn = N+1);
 *   - at the dawn of N+1 it closes the pending flag itself.
 * Every pin runs the same scenario under four clocks and expects the
 * headless series:
 *   headless     — validator path;
 *   no-commit    — the render commit never runs (unit tests, hidden tab);
 *   commit-wins  — the bolt lands before every next tick;
 *   commit-late  — every commit lands one tick late.
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestCharacter as regChar,
  registerTestEnemy as regEnemy,
  registerTestSpell,
  registerTestCollectible,
  registerTestStatusEffect,
  registerTestAlly as regAlly,
  createTestPuzzle,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestCharacter,
  createTestEnemy,
  createTestGameState,
} from './helpers';
import { Direction, ActionType, SpellTemplate, StatusEffectType } from '../../types/game';
import type { GameState, PlacedEnemy, PlacedCharacter, StatusEffectInstance } from '../../types/game';
import { executeTurn, updateProjectiles, isDropAwaitingDeathVisual } from '../simulation';

// ==========================================
// Harness
// ==========================================

/**
 * The board's render commit, emulated: every resolved bolt (or only those
 * in `only`) has visibly landed. Backdating the visual clock makes
 * updateProjectiles consume the hitResult exactly as the rAF loop does.
 */
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

/** Runs `turns` turns under one clock; returns `probe` after each turn's tick. */
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
      renderCommit(gs, late); // last tick's bolts land only now
      late = new Set((gs.activeProjectiles ?? []).filter(p => p.active && p.hitResult).map(p => p.id));
    }
  }
  if (clock !== 'headless' && clock !== 'no-commit') renderCommit(gs); // drain
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
const onDeathSummon = {
  type: ActionType.SPELL, spellId: 'death-summon', executionMode: 'parallel' as const,
  trigger: { mode: 'on_event' as const, event: 'on_death' as const },
};
const biteTrigger = {
  type: ActionType.SPELL, spellId: 'bite', executionMode: 'parallel' as const,
  trigger: { mode: 'on_event' as const, event: 'opposing_adjacent' as const },
};

beforeEach(() => {
  clearAllRegistries();
  registerTestSpell('bolt', { id: 'bolt', name: 'Bolt', ...base, templateType: SpellTemplate.LINEAR, directionMode: 'current_facing', damage: 3, projectileSpeed: 4, range: 6 });
  registerTestSpell('fireball', { id: 'fireball', name: 'Fireball', ...base, templateType: SpellTemplate.LINEAR, directionMode: 'current_facing', damage: 2, projectileSpeed: 4, range: 6, projectileBeforeAOE: true, radius: 1 });
  registerTestSpell('heal-bolt', { id: 'heal-bolt', name: 'Heal Bolt', ...base, templateType: SpellTemplate.LINEAR, directionMode: 'current_facing', healing: 3, projectileSpeed: 4, range: 6 });
  registerTestSpell('bite', { id: 'bite', name: 'Bite', ...base, templateType: SpellTemplate.MELEE, directionMode: 'current_facing', damage: 1 });
  registerTestSpell('slash', { id: 'slash', name: 'Slash', ...base, templateType: SpellTemplate.MELEE, directionMode: 'current_facing', damage: 5 });
  registerTestSpell('raise', { id: 'raise', name: 'Raise', ...base, templateType: SpellTemplate.RESURRECT, directionMode: 'current_facing', resurrectHealthPercent: 100 });
  registerTestSpell('death-summon', { id: 'death-summon', name: 'Death Summon', ...base, templateType: SpellTemplate.SUMMON, directionMode: 'fixed', defaultDirections: [Direction.NORTH], summonEnemyId: 'spawnling' });
  // The spawnling walks off NORTH, so a duplicate on_death SUMMON would have room.
  regEnemy(createTestEnemyDef({ id: 'spawnling', health: 1, behavior: { type: 'active', pattern: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }], defaultFacing: Direction.NORTH } }));
  registerTestCollectible('gold', { id: 'gold', name: 'Gold', effects: [] });
  registerTestCollectible('gem', { id: 'gem', name: 'Gem', effects: [] });
});

const stateOf = (enemies: PlacedEnemy[], heroes: PlacedCharacter[]) => createTestGameState({
  puzzle: createTestPuzzle({ width: 8, height: 5, enemies }),
  placedCharacters: heroes, gameStatus: 'running', currentTurn: 0, testMode: true,
});
const hero = (characterId: string, x: number, y: number, facing: Direction, currentHealth = 10) =>
  createTestCharacter({ characterId, x, y, facing, currentHealth, actionIndex: 0, active: true });
/** Logical death — folds the real path's between-turn visual hold into dead, as audit-parity does. */
const logicallyDead = (e: PlacedEnemy | PlacedCharacter) => e.dead || !!e.pendingProjectileDeath;
const spawnlings = (gs: GameState) => gs.puzzle.enemies.filter(e => e.enemyId === 'spawnling').length;
const drops = (gs: GameState) => gs.puzzle.collectibles.filter(c => !c.collected).map(c => `${c.collectibleId}@${c.x},${c.y}`);

/** Static 1-HP biter: bites an adjacent opponent each turn, summons on death, drops gold. */
const regBiter = () => regEnemy(createTestEnemyDef({
  id: 'biter', health: 1, droppedCollectibleId: 'gold',
  behavior: { type: 'static', pattern: [biteTrigger, onDeathSummon] as never, defaultFacing: Direction.WEST },
}));
/** Archer that waits a turn, then shoots east once — the bolt kills on turn 2. */
const regLateArcher = () => regChar(createTestCharacterDef({
  id: 'archer', health: 10, behavior: [{ type: ActionType.WAIT }, { type: ActionType.SPELL, spellId: 'bolt' }, ...W(6)] as never,
}));

// ==========================================
// The trigger-loop race (2026-09-30 review)
// ==========================================

describe('a projectile-killed entity acts no more, and its death happens once', () => {
  it('enemy victim: its own trigger never fires after the killing hit', () => {
    regBiter();
    regLateArcher();
    const ref = expectClockParity(() => stateOf(
      [createTestEnemy({ enemyId: 'biter', x: 3, y: 3, currentHealth: 1, facing: Direction.WEST })],
      [hero('archer', 2, 3, Direction.EAST)],
    ), 4, gs => ({ heroHP: gs.placedCharacters[0].currentHealth, spawnlings: spawnlings(gs), drops: drops(gs).length }));
    expect(ref.series.map(s => s.heroHP)).toEqual([9, 8, 8, 8]); // bit on turns 1-2 only
    expect(ref.final).toMatchObject({ spawnlings: 1, drops: 1 });  // on_death + drop exactly once
  });

  it('hero victim: its own trigger never fires after the killing hit, and it drops once', () => {
    regChar(createTestCharacterDef({
      id: 'thorn', health: 1, droppedCollectibleId: 'gem', behavior: [...W(8), biteTrigger, onDeathSummon] as never,
    }));
    regEnemy(createTestEnemyDef({
      id: 'gunner', health: 10,
      behavior: { type: 'active', pattern: [{ type: ActionType.WAIT }, { type: ActionType.SPELL, spellId: 'bolt' }, ...W(6)] as never, defaultFacing: Direction.WEST },
    }));
    const ref = expectClockParity(() => stateOf(
      [createTestEnemy({ enemyId: 'gunner', x: 3, y: 3, currentHealth: 10, facing: Direction.WEST, actionIndex: 0, active: true })],
      [hero('thorn', 2, 3, Direction.EAST, 1)],
    ), 4, gs => ({ gunnerHP: gs.puzzle.enemies[0].currentHealth, thornDead: logicallyDead(gs.placedCharacters[0]), drops: drops(gs).length }));
    expect(ref.series.map(s => s.gunnerHP)).toEqual([9, 8, 8, 8]);
    expect(ref.final).toMatchObject({ thornDead: true, drops: 1 });
  });

  it('the next turn\'s melee finds no body to strike', () => {
    regEnemy(createTestEnemyDef({
      id: 'loot-goblin', health: 2, droppedCollectibleId: 'gold',
      behavior: { type: 'static', pattern: [onDeathSummon] as never },
    }));
    regChar(createTestCharacterDef({ id: 'archer', health: 10, behavior: [{ type: ActionType.SPELL, spellId: 'bolt' }, ...W(5)] as never }));
    regChar(createTestCharacterDef({ id: 'basher', health: 10, behavior: [{ type: ActionType.WAIT }, { type: ActionType.SPELL, spellId: 'slash' }, ...W(5)] as never }));
    const ref = expectClockParity(() => stateOf(
      [createTestEnemy({ enemyId: 'loot-goblin', x: 4, y: 2, currentHealth: 2 })],
      [hero('archer', 1, 2, Direction.EAST), hero('basher', 4, 3, Direction.NORTH)],
    ), 3, gs => ({ goblinHP: gs.puzzle.enemies[0].currentHealth, drops: drops(gs).length }));
    expect(ref.final).toEqual({ goblinHP: -1, drops: 1 }); // the slash whiffs on turn 2
  });
});

// ==========================================
// The same projectile phase sees a dead body
// ==========================================

describe('later in the same projectile phase, the victim is already dead', () => {
  it('an AOE-on-impact does not strike it again (no second on_death, no second drop)', () => {
    regEnemy(createTestEnemyDef({
      id: 'victim', health: 1, droppedCollectibleId: 'gold',
      behavior: { type: 'static', pattern: [onDeathSummon] as never },
    }));
    regEnemy(createTestEnemyDef({ id: 'shield', health: 10 }));
    regChar(createTestCharacterDef({ id: 'archer', health: 10, behavior: [{ type: ActionType.SPELL, spellId: 'bolt' }, ...W(5)] as never }));
    regChar(createTestCharacterDef({ id: 'mage', health: 10, behavior: [{ type: ActionType.SPELL, spellId: 'fireball' }, ...W(5)] as never }));
    const ref = expectClockParity(() => stateOf(
      [createTestEnemy({ enemyId: 'victim', x: 4, y: 2, currentHealth: 1 }), createTestEnemy({ enemyId: 'shield', x: 4, y: 3, currentHealth: 10 })],
      [hero('archer', 1, 2, Direction.EAST), hero('mage', 1, 3, Direction.EAST)],
    ), 3, gs => ({ victimHP: gs.puzzle.enemies[0].currentHealth, spawnlings: spawnlings(gs), drops: drops(gs).length }));
    expect(ref.final).toEqual({ victimHP: -2, spawnlings: 1, drops: 1 });
  });

  it('a heal bolt passes over it to the ally behind', () => {
    regEnemy(createTestEnemyDef({ id: 'victim', health: 1 }));
    regEnemy(createTestEnemyDef({ id: 'friend', health: 5 }));
    regEnemy(createTestEnemyDef({
      id: 'medic', health: 10,
      behavior: { type: 'active', pattern: [{ type: ActionType.SPELL, spellId: 'heal-bolt' }, ...W(5)] as never, defaultFacing: Direction.WEST },
    }));
    regChar(createTestCharacterDef({ id: 'archer', health: 10, behavior: [{ type: ActionType.SPELL, spellId: 'bolt' }, ...W(5)] as never }));
    const ref = expectClockParity(() => stateOf(
      [
        createTestEnemy({ enemyId: 'victim', x: 4, y: 2, currentHealth: 1 }),
        createTestEnemy({ enemyId: 'friend', x: 3, y: 2, currentHealth: 1 }),
        createTestEnemy({ enemyId: 'medic', x: 6, y: 2, currentHealth: 10, facing: Direction.WEST, actionIndex: 0, active: true }),
      ],
      [hero('archer', 4, 0, Direction.SOUTH)],
    ), 2, gs => ({ victimHP: gs.puzzle.enemies[0].currentHealth, friendHP: gs.puzzle.enemies[1].currentHealth }));
    expect(ref.final).toEqual({ victimHP: -2, friendHP: 4 });
  });

  it('a later on_death resurrect raises it, and it stays raised', () => {
    regEnemy(createTestEnemyDef({ id: 'x', health: 2, droppedCollectibleId: 'gold' }));
    regEnemy(createTestEnemyDef({
      id: 'y', health: 1,
      behavior: { type: 'static', pattern: [{ type: ActionType.SPELL, spellId: 'raise', executionMode: 'parallel', trigger: { mode: 'on_event', event: 'on_death' } }] as never },
    }));
    regChar(createTestCharacterDef({ id: 'a1', health: 10, behavior: [{ type: ActionType.SPELL, spellId: 'bolt' }, ...W(4)] as never }));
    regChar(createTestCharacterDef({ id: 'a2', health: 10, behavior: [{ type: ActionType.SPELL, spellId: 'bolt' }, ...W(4)] as never }));
    const ref = expectClockParity(() => stateOf(
      [createTestEnemy({ enemyId: 'x', x: 4, y: 1, currentHealth: 2 }), createTestEnemy({ enemyId: 'y', x: 4, y: 3, currentHealth: 1 })],
      [hero('a1', 1, 1, Direction.EAST), hero('a2', 1, 3, Direction.EAST)],
    ), 3, gs => ({ xDead: logicallyDead(gs.puzzle.enemies[0]), xHP: gs.puzzle.enemies[0].currentHealth, drops: drops(gs).length }));
    expect(ref.final).toEqual({ xDead: false, xHP: 2, drops: 1 });
  });

  it('a hero shot on the last active turn ends the game that turn', () => {
    regChar(createTestCharacterDef({ id: 'idler', health: 10, behavior: [] as never }));
    regChar(createTestCharacterDef({ id: 'scout', health: 1, behavior: [...W(8)] as never }));
    regEnemy(createTestEnemyDef({
      id: 'gunner', health: 10,
      behavior: { type: 'active', pattern: [{ type: ActionType.SPELL, spellId: 'bolt' }, ...W(8)] as never, defaultFacing: Direction.WEST },
    }));
    const ref = expectClockParity(() => {
      const gs = stateOf(
        [createTestEnemy({ enemyId: 'gunner', x: 5, y: 2, currentHealth: 10, facing: Direction.WEST, actionIndex: 0, active: true })],
        [createTestCharacter({ characterId: 'idler', x: 0, y: 0, facing: Direction.EAST, currentHealth: 10, actionIndex: 0, active: false }),
         hero('scout', 3, 2, Direction.EAST, 1)],
      );
      gs.testMode = false;
      gs.puzzle.winConditions = [{ type: 'defeat_all_enemies' }] as never;
      return gs;
    }, 2, gs => ({ status: gs.gameStatus, turn: gs.currentTurn }));
    expect(ref.series[0]).toEqual({ status: 'defeat', turn: 1 });
  });
});

// ==========================================
// The visual contract the board and replay read
// ==========================================

describe('real mode keeps the deferred-visual contract between turns', () => {
  const build = () => stateOf(
    [createTestEnemy({ enemyId: 'biter', x: 3, y: 3, currentHealth: 1, facing: Direction.WEST })],
    [hero('archer', 2, 3, Direction.EAST)],
  );

  it('after the hit: still standing for the board, drop already placed but hidden', () => {
    regBiter();
    regLateArcher();
    const gs = build();
    executeTurn(gs);
    executeTurn(gs); // the bolt kills on turn 2
    const biter = gs.puzzle.enemies[0];
    expect(biter).toMatchObject({ dead: false, pendingProjectileDeath: true, diedOnTurn: 3 });
    expect(gs.puzzle.collectibles).toHaveLength(1);
    expect(isDropAwaitingDeathVisual(gs.puzzle.collectibles[0], gs)).toBe(true);
    renderCommit(gs); // the bolt lands
    expect(biter).toMatchObject({ dead: true, pendingProjectileDeath: false, diedOnTurn: 3 });
    expect(gs.puzzle.collectibles).toHaveLength(1); // the commit drops nothing
    expect(isDropAwaitingDeathVisual(gs.puzzle.collectibles[0], gs)).toBe(false);
  });

  it('no commit: the next dawn closes the death itself, flags only', () => {
    regBiter();
    regLateArcher();
    const gs = build();
    executeTurn(gs);
    executeTurn(gs);
    executeTurn(gs); // no render commit ran
    const biter = gs.puzzle.enemies[0];
    expect(biter).toMatchObject({ dead: true, pendingProjectileDeath: false, diedOnTurn: 3, currentHealth: -2 });
    expect(isDropAwaitingDeathVisual(gs.puzzle.collectibles[0], gs)).toBe(false);
    renderCommit(gs); // the late commit is a no-op
    expect(gs.puzzle.collectibles).toHaveLength(1);
    expect(spawnlings(gs)).toBe(1);
  });

  it('headless never flags a drop', () => {
    regBiter();
    regLateArcher();
    const gs = build();
    gs.headlessMode = true;
    executeTurn(gs);
    executeTurn(gs);
    expect(gs.puzzle.enemies[0]).toMatchObject({ dead: true, diedOnTurn: 3 });
    expect(gs.puzzle.enemies[0].pendingProjectileDeath).toBeFalsy();
    expect(gs.puzzle.collectibles[0].revealWithDeathOf).toBeUndefined();
  });
});

// ==========================================
// Critic round (2026-09-30): same-turn revive, allies, stale drops
// ==========================================

const onDeathRaise = {
  type: ActionType.SPELL, spellId: 'raise', executionMode: 'parallel' as const,
  trigger: { mode: 'on_event' as const, event: 'on_death' as const },
};

/** x (2 HP, drops gold) and y (1 HP, raises the dead on death); two archers shoot both on turn 1. */
const raiseScene = (opts: { xStatus?: StatusEffectInstance[]; third?: boolean; testMode?: boolean } = {}) => {
  regEnemy(createTestEnemyDef({ id: 'x', health: 2, droppedCollectibleId: 'gold' }));
  regEnemy(createTestEnemyDef({ id: 'y', health: 1, behavior: { type: 'static', pattern: [onDeathRaise] as never } }));
  for (const id of ['a1', 'a2', 'a3']) {
    regChar(createTestCharacterDef({ id, health: 10, behavior: [{ type: ActionType.SPELL, spellId: 'bolt' }, ...W(4)] as never }));
  }
  return () => {
    const gs = createTestGameState({
      puzzle: createTestPuzzle({
        width: 9, height: 6,
        enemies: [
          createTestEnemy({ enemyId: 'x', x: 4, y: 1, currentHealth: 2, statusEffects: opts.xStatus }),
          createTestEnemy({ enemyId: 'y', x: 4, y: 3, currentHealth: 1 }),
        ],
      }),
      placedCharacters: [
        hero('a1', 1, 1, Direction.EAST), hero('a2', 1, 3, Direction.EAST),
        ...(opts.third ? [hero('a3', 7, 1, Direction.WEST)] : []),
      ],
      gameStatus: 'running', currentTurn: 0, testMode: opts.testMode ?? true,
    });
    if (opts.testMode === false) gs.puzzle.winConditions = [{ type: 'defeat_all_enemies' }] as never;
    return gs;
  };
};

describe('a victim revived later the same turn is alive for every later reader', () => {
  it('the win check sees it alive (no false victory)', () => {
    const ref = expectClockParity(raiseScene({ testMode: false }), 2,
      gs => ({ status: gs.gameStatus, xDead: logicallyDead(gs.puzzle.enemies[0]), xHP: gs.puzzle.enemies[0].currentHealth }));
    expect(ref.series.map(s => s.status)).toEqual(['running', 'running']);
    expect(ref.final).toMatchObject({ xDead: false, xHP: 2 });
  });

  it('its end-of-turn poison still ticks', () => {
    registerTestStatusEffect('poison-asset', {
      id: 'poison-asset', name: 'Poison', description: '', type: StatusEffectType.POISON,
      defaultDuration: 99, defaultValue: 1, stackingBehavior: 'stack',
    });
    const poison = {
      id: 'poison-inst', type: StatusEffectType.POISON, statusAssetId: 'poison-asset', value: 1,
      duration: 99, currentStacks: 1, appliedOnTurn: 0, sourceEntityId: 'test', sourceIsEnemy: false, movementSkipCounter: 0,
    } as StatusEffectInstance;
    const ref = expectClockParity(raiseScene({ xStatus: [poison] }), 3,
      gs => ({ xDead: logicallyDead(gs.puzzle.enemies[0]), xHP: gs.puzzle.enemies[0].currentHealth, drops: drops(gs).length }));
    expect(ref.series[0].xHP).toBe(1); // raised back to 2 on turn 1, then that turn's poison tick
  });

  it('a later bolt in the same phase can strike it again', () => {
    const ref = expectClockParity(raiseScene({ third: true }), 2,
      gs => ({ xDead: logicallyDead(gs.puzzle.enemies[0]), xHP: gs.puzzle.enemies[0].currentHealth, drops: drops(gs).length }));
    expect(ref.final).toMatchObject({ xDead: true, drops: 2 });
  });
});

describe('allies', () => {
  it('an ally shot by an enemy bolt drops its loot exactly once, and on_death fires once', () => {
    regChar(createTestCharacterDef({ id: 'idle', health: 10, behavior: [...W(8)] as never }));
    regAlly(createTestEnemyDef({
      id: 'squire', health: 1, droppedCollectibleId: 'gold',
      behavior: { type: 'static', pattern: [onDeathSummon] as never },
    }));
    regEnemy(createTestEnemyDef({
      id: 'gunner', health: 10,
      behavior: { type: 'active', pattern: [{ type: ActionType.SPELL, spellId: 'bolt' }, ...W(8)] as never, defaultFacing: Direction.WEST },
    }));
    const ref = expectClockParity(() => stateOf(
      [
        createTestEnemy({ enemyId: 'gunner', x: 6, y: 2, currentHealth: 10, facing: Direction.WEST, actionIndex: 0, active: true }),
        createTestEnemy({ enemyId: 'squire', x: 3, y: 2, currentHealth: 1, party: 'hero' }),
      ],
      [hero('idle', 0, 4, Direction.EAST)],
    ), 3, gs => ({ squireDead: logicallyDead(gs.puzzle.enemies[1]), spawnlings: spawnlings(gs), drops: drops(gs) }));
    expect(ref.final).toMatchObject({ squireDead: true, spawnlings: 1 });
    expect(ref.final.drops).toHaveLength(1);
  });
});

describe('drop reveal', () => {
  it('an earlier drop stays visible when its owner is raised and shot again', () => {
    regEnemy(createTestEnemyDef({ id: 'x', health: 2, droppedCollectibleId: 'gold' }));
    regEnemy(createTestEnemyDef({ id: 'y', health: 1, behavior: { type: 'static', pattern: [onDeathRaise] as never } }));
    regChar(createTestCharacterDef({ id: 'a1', health: 10, behavior: [{ type: ActionType.SPELL, spellId: 'bolt' }, ...W(6)] as never }));
    regChar(createTestCharacterDef({ id: 'a3', health: 10, behavior: [{ type: ActionType.WAIT }, { type: ActionType.SPELL, spellId: 'bolt' }, ...W(6)] as never }));
    regChar(createTestCharacterDef({ id: 'a2', health: 10, behavior: [{ type: ActionType.WAIT }, { type: ActionType.WAIT }, { type: ActionType.SPELL, spellId: 'bolt' }, ...W(6)] as never }));
    const gs = createTestGameState({
      puzzle: createTestPuzzle({
        width: 9, height: 6,
        enemies: [
          createTestEnemy({ enemyId: 'x', x: 4, y: 2, currentHealth: 2 }),
          createTestEnemy({ enemyId: 'y', x: 6, y: 4, currentHealth: 1 }),
        ],
      }),
      placedCharacters: [hero('a1', 1, 2, Direction.EAST), hero('a3', 6, 1, Direction.SOUTH), hero('a2', 4, 5, Direction.NORTH)],
      gameStatus: 'running', currentTurn: 0, testMode: true,
    });
    executeTurn(gs); // turn 1: a1 kills x (drop 1)
    executeTurn(gs); // turn 2: a3 kills y, whose on_death raises x
    expect(gs.puzzle.enemies[0].dead).toBe(false);
    expect(gs.puzzle.enemies[0].pendingProjectileDeath).toBeFalsy();
    executeTurn(gs); // turn 3: a2 kills x again (drop 2), its death held for the board
    expect(gs.puzzle.enemies[0].pendingProjectileDeath).toBe(true);
    const golds = gs.puzzle.collectibles.filter(c => c.collectibleId === 'gold');
    expect(golds).toHaveLength(2);
    expect(golds.map(c => isDropAwaitingDeathVisual(c, gs))).toEqual([false, true]);
  });
});
