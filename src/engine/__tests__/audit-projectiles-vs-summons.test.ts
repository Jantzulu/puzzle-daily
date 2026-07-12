/**
 * Engine audit sweep 8 (docs/engine-audit-plan.md): pierce/bounce/homing
 * re-verification against MID-TURN summons — an entity appended to
 * puzzle.enemies THIS turn must be hittable by a projectile already in
 * flight (spawn-turn hittability is asserted in the summon design; these
 * pin it per projectile style).
 *
 * Turn structure that makes this possible: enemy casts (append) happen in
 * the enemy phase, BEFORE resolveProjectiles moves in-flight bolts at the
 * end of the same executeTurn.
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
} from './helpers';
import { Direction, ActionType, SpellTemplate } from '../../types/game';
import type { GameState, PlacedEnemy, PlacedCharacter } from '../../types/game';
import { executeTurn } from '../simulation';

const baseState = (opts: {
  enemies?: PlacedEnemy[];
  heroes?: PlacedCharacter[];
  headless?: boolean;
}) =>
  createTestGameState({
    puzzle: createTestPuzzle({
      width: 9, height: 5,
      enemies: opts.enemies ?? [],
    }),
    placedCharacters: opts.heroes ?? [],
    gameStatus: 'running',
    currentTurn: 0,
    testMode: true,
    ...(opts.headless ? { headlessMode: true } : {}),
  });

beforeEach(() => {
  clearAllRegistries();
  const base = { description: '', thumbnailIcon: '', sprites: {} };
  registerTestSpell('slow-bolt', {
    id: 'slow-bolt', name: 'Slow Bolt', ...base,
    templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
    damage: 3, projectileSpeed: 2, range: 8,
  });
  registerTestSpell('pierce-bolt', {
    id: 'pierce-bolt', name: 'Pierce Bolt', ...base,
    templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
    damage: 3, projectileSpeed: 2, range: 8, pierceEnemies: true,
  });
  registerTestSpell('summon-blocker', {
    id: 'summon-blocker', name: 'Summon Blocker', ...base,
    templateType: SpellTemplate.SUMMON,
    directionMode: 'fixed', defaultDirections: [Direction.NORTH],
    summonEnemyId: 'blocker',
  });
  regEnemy(createTestEnemyDef({ id: 'blocker', health: 4 })); // static summon
  regEnemy(createTestEnemyDef()); // goblin-1, static, health 5
});

/**
 * Common stage: archer fires a slow bolt EAST along row 2 on turn 1; a
 * summoner one row below drops a 'blocker' into the bolt's path (4,2)
 * during turn 2's enemy phase — while the bolt is mid-flight at (2,2).
 */
const regSummoner = () =>
  regEnemy(createTestEnemyDef({
    id: 'conjurer', health: 5,
    behavior: {
      type: 'active',
      pattern: [{ type: ActionType.WAIT }, { type: ActionType.SPELL, spellId: 'summon-blocker' }],
      defaultFacing: Direction.NORTH,
    },
  }));

const regArcher = (spellId: string) =>
  regChar(createTestCharacterDef({
    id: 'archer', health: 10,
    behavior: [{ type: ActionType.SPELL, spellId }] as never,
  }));

const stage = (spellId: string, opts?: { extraEnemies?: PlacedEnemy[]; headless?: boolean }) => {
  regSummoner();
  regArcher(spellId);
  return baseState({
    enemies: [
      createTestEnemy({
        enemyId: 'conjurer', x: 4, y: 3, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.NORTH,
      }),
      ...(opts?.extraEnemies ?? []),
    ],
    heroes: [createTestCharacter({
      characterId: 'archer', x: 0, y: 2, facing: Direction.EAST,
      currentHealth: 10, actionIndex: 0, active: true,
    })],
    headless: opts?.headless,
  });
};

const blocker = (gs: GameState) => gs.puzzle.enemies.find(e => e.enemyId === 'blocker');

describe('mid-flight projectiles vs a summon appended THIS turn', () => {
  it('a straight bolt hits the fresh summon that appeared in its path', () => {
    const gs = stage('slow-bolt');
    executeTurn(gs); // bolt fired, mid-flight around (2,2)
    expect(blocker(gs)).toBeUndefined();
    executeTurn(gs); // summon appears at (4,2); bolt reaches that tile this turn
    const b = blocker(gs)!;
    expect(b).toBeDefined();
    expect(b.currentHealth).toBe(1); // 4 - 3: hittable on its spawn turn
  });

  it('headless parity for the same interception', () => {
    const run = (headless: boolean) => {
      clearAllRegistries();
      const base = { description: '', thumbnailIcon: '', sprites: {} };
      registerTestSpell('slow-bolt', {
        id: 'slow-bolt', name: 'Slow Bolt', ...base,
        templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
        damage: 3, projectileSpeed: 2, range: 8,
      });
      registerTestSpell('summon-blocker', {
        id: 'summon-blocker', name: 'Summon Blocker', ...base,
        templateType: SpellTemplate.SUMMON,
        directionMode: 'fixed', defaultDirections: [Direction.NORTH],
        summonEnemyId: 'blocker',
      });
      regEnemy(createTestEnemyDef({ id: 'blocker', health: 4 }));
      const gs = stage('slow-bolt', { headless });
      executeTurn(gs);
      executeTurn(gs);
      return blocker(gs)?.currentHealth;
    };
    expect(run(false)).toBe(run(true));
    expect(run(true)).toBe(1);
  });

  it('a pierce bolt goes THROUGH the fresh summon and still reaches what stands behind it', () => {
    const gs = stage('pierce-bolt', {
      extraEnemies: [createTestEnemy({ enemyId: 'goblin-1', x: 6, y: 2, currentHealth: 5 })],
    });
    executeTurn(gs); // mid-flight
    executeTurn(gs); // summon appears at (4,2) — pierced
    executeTurn(gs); // bolt continues to (6,2)
    expect(blocker(gs)!.currentHealth).toBe(1); // pierced through
    const goblin = gs.puzzle.enemies.find(e => e.enemyId === 'goblin-1')!;
    expect(goblin.currentHealth).toBe(2); // 5 - 3: hit behind the summon
  });

  it('a homing bolt (no hit-along-path) ignores the interposed summon and tracks its target', () => {
    regSummoner();
    regChar(createTestCharacterDef({
      id: 'archer', health: 10,
      behavior: [{
        type: ActionType.SPELL, spellId: 'slow-bolt',
        autoTargetNearestEnemy: true, homing: true,
      }] as never,
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'conjurer', x: 5, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.WEST,
      })],
      heroes: [createTestCharacter({
        characterId: 'archer', x: 0, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    // Conjurer summons WEST this time — directly between itself and the bolt
    registerTestSpell('summon-blocker', {
      id: 'summon-blocker', name: 'Summon Blocker', description: '', thumbnailIcon: '',
      templateType: SpellTemplate.SUMMON,
      directionMode: 'fixed', defaultDirections: [Direction.WEST],
      summonEnemyId: 'blocker', sprites: {},
    });
    executeTurn(gs); // homing bolt locked on the conjurer, mid-flight
    executeTurn(gs); // blocker appears at (4,2) in the bolt's line
    executeTurn(gs);
    executeTurn(gs);
    const b = blocker(gs)!;
    const conjurer = gs.puzzle.enemies.find(e => e.enemyId === 'conjurer')!;
    expect(b.currentHealth).toBe(4);       // untouched — homing has ONE target
    expect(conjurer.currentHealth).toBe(2); // 5 - 3: the lock held through the interposition
  });
});
