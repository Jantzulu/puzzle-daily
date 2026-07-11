/**
 * Tests for src/engine/spawning.ts — mid-game entity spawning (summon
 * groundwork) and the executeTurn idle-on-spawn-turn guards.
 * Uses module mocks from helpers.ts.
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestCharacter as regChar,
  registerTestEnemy as regEnemy,
  registerTestSpell,
  registerTestStatusEffect,
  createEmptyGrid,
  createTestPuzzle,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestCharacter,
  createTestEnemy,
  createTestGameState,
  setTile,
} from './helpers';
import { Direction, TileType, ActionType, SpellTemplate, StatusEffectType } from '../../types/game';
import { executeTurn, checkVictoryConditions } from '../simulation';
import { spawnEnemyMidGame } from '../spawning';

beforeEach(() => {
  clearAllRegistries();
  regEnemy(createTestEnemyDef()); // goblin-1, static, health 5
  regEnemy(
    createTestEnemyDef({
      id: 'walker',
      health: 3,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }],
        defaultFacing: Direction.EAST,
      },
    }),
  );
});

describe('spawnEnemyMidGame', () => {
  it('appends a fully-initialized entity without touching existing indices', () => {
    const original = createTestEnemy({ x: 4, y: 4 });
    const gs = createTestGameState({
      puzzle: createTestPuzzle({ enemies: [original] }),
      currentTurn: 3,
    });

    const spawned = spawnEnemyMidGame(gs, {
      enemyId: 'walker',
      x: 1,
      y: 2,
      party: 'enemy',
      excludeFromWinConditions: true,
    });

    expect(spawned).not.toBeNull();
    expect(gs.puzzle.enemies).toHaveLength(2);
    expect(gs.puzzle.enemies[0]).toBe(original); // index 0 untouched
    expect(gs.puzzle.enemies[1]).toBe(spawned); // append-only
    expect(spawned!.currentHealth).toBe(3); // from the asset
    expect(spawned!.facing).toBe(Direction.EAST); // asset defaultFacing
    expect(spawned!.spawnedOnTurn).toBe(3);
    expect(spawned!.excludeFromWinConditions).toBe(true);
    expect(spawned!.actionIndex).toBe(0);
    expect(spawned!.active).toBe(true);
    expect(spawned!.dead).toBe(false);
  });

  it('explicit facing wins over the asset defaultFacing', () => {
    const gs = createTestGameState({ puzzle: createTestPuzzle() });
    const spawned = spawnEnemyMidGame(gs, {
      enemyId: 'walker',
      x: 1,
      y: 1,
      facing: Direction.NORTH,
    });
    expect(spawned!.facing).toBe(Direction.NORTH);
  });

  it('returns null for an unknown enemy asset and appends nothing', () => {
    const gs = createTestGameState({ puzzle: createTestPuzzle() });
    expect(spawnEnemyMidGame(gs, { enemyId: 'nope', x: 0, y: 0 })).toBeNull();
    expect(gs.puzzle.enemies).toHaveLength(0);
  });
});

describe('executeTurn — spawn-turn idle guard', () => {
  it('an entity spawned this turn does not act; it acts from action 0 next turn', () => {
    // executeTurn increments currentTurn on entry, so an entity stamped
    // spawnedOnTurn=1 in a state at currentTurn=0 is exactly "spawned during
    // turn 1" — the state a mid-turn summon cast would produce.
    const gs = createTestGameState({
      puzzle: createTestPuzzle({
        width: 8,
        height: 5,
        winConditions: [{ type: 'survive_turns', params: { turns: 99 } }],
        enemies: [
          createTestEnemy({
            enemyId: 'walker',
            x: 2,
            y: 2,
            currentHealth: 3,
            actionIndex: 0,
            active: true,
            facing: Direction.EAST,
            spawnedOnTurn: 1,
          }),
        ],
      }),
      gameStatus: 'running',
      currentTurn: 0,
      testMode: true, // no heroes on the board — skip end-of-game evaluation
    });

    executeTurn(gs); // turn 1: spawn turn — must stay idle
    expect(gs.puzzle.enemies[0].x).toBe(2);
    expect(gs.puzzle.enemies[0].actionIndex).toBe(0);

    executeTurn(gs); // turn 2: first real turn — moves east
    expect(gs.puzzle.enemies[0].x).toBe(3);
  });

  it('an entity appended mid-game is fully live: a projectile-free win check still sees only real kill targets', () => {
    // Summon (flagged) appended while a real enemy remains → no win.
    // Real enemy dies → win, even though the flagged summon is alive.
    const gs = createTestGameState({
      puzzle: createTestPuzzle({
        enemies: [createTestEnemy({ x: 4, y: 4 })],
      }),
      gameStatus: 'running',
      currentTurn: 1,
    });
    spawnEnemyMidGame(gs, {
      enemyId: 'walker',
      x: 1,
      y: 1,
      excludeFromWinConditions: true,
    });

    expect(checkVictoryConditions(gs)).toBe(false);
    gs.puzzle.enemies[0].dead = true;
    expect(checkVictoryConditions(gs)).toBe(true);
  });
});

// ==========================================
// SUMMON spell template
// ==========================================
describe('SUMMON spell template', () => {
  const registerSummonSpell = (overrides?: Record<string, unknown>) =>
    registerTestSpell('summon-walker', {
      id: 'summon-walker', name: 'Summon Walker', description: '', thumbnailIcon: '',
      templateType: SpellTemplate.SUMMON,
      directionMode: 'fixed', defaultDirections: [Direction.EAST],
      summonEnemyId: 'walker',
      sprites: {},
      ...overrides,
    });

  const registerSummonerEnemy = () =>
    regEnemy(createTestEnemyDef({
      id: 'summoner',
      health: 5,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.SPELL, spellId: 'summon-walker' }],
        defaultFacing: Direction.EAST,
      },
    }));

  const charm = () => ({
    id: 'charm-1', type: StatusEffectType.CHARM, statusAssetId: 'charm-asset',
    duration: 5, currentStacks: 1, appliedOnTurn: 0,
    sourceEntityId: 'test', sourceIsEnemy: false, movementSkipCounter: 0,
  });

  const summonerState = (opts?: {
    tiles?: ReturnType<typeof createEmptyGrid>;
    extraEnemies?: ReturnType<typeof createTestEnemy>[];
    casterStatusEffects?: ReturnType<typeof charm>[];
  }) =>
    createTestGameState({
      puzzle: createTestPuzzle({
        width: 8, height: 5,
        ...(opts?.tiles ? { tiles: opts.tiles } : {}),
        enemies: [
          createTestEnemy({
            enemyId: 'summoner', x: 2, y: 2, currentHealth: 5,
            actionIndex: 0, active: true, facing: Direction.EAST,
            statusEffects: opts?.casterStatusEffects,
          }),
          ...(opts?.extraEnemies ?? []),
        ],
      }),
      gameStatus: 'running',
      currentTurn: 0,
      testMode: true,
    });

  beforeEach(() => {
    registerSummonSpell();
    registerSummonerEnemy();
  });

  it('enemy cast spawns on the adjacent tile: enemy party, win-exempt, idle this turn, acts next turn', () => {
    const gs = summonerState();

    executeTurn(gs); // summoner casts east
    expect(gs.puzzle.enemies).toHaveLength(2);
    const summon = gs.puzzle.enemies[1];
    expect(summon.enemyId).toBe('walker');
    expect(summon.x).toBe(3);
    expect(summon.y).toBe(2);
    expect(summon.party).toBe('enemy');
    expect(summon.excludeFromWinConditions).toBe(true);
    expect(summon.spawnedOnTurn).toBe(1);
    expect(summon.actionIndex).toBe(0); // idle on spawn turn

    executeTurn(gs); // summon's first real turn — walker moves east
    expect(gs.puzzle.enemies[1].x).toBe(4);
  });

  it('hero cast spawns a hero-party summon', () => {
    regChar(createTestCharacterDef({
      id: 'hero-summoner',
      behavior: [{ type: ActionType.SPELL, spellId: 'summon-walker' }],
    }));
    const gs = createTestGameState({
      puzzle: createTestPuzzle({ width: 8, height: 5, availableCharacters: ['hero-summoner'] }),
      gameStatus: 'running',
      currentTurn: 0,
      testMode: true,
      placedCharacters: [createTestCharacter({ characterId: 'hero-summoner', x: 2, y: 2, facing: Direction.EAST, actionIndex: 0, active: true })],
    });

    executeTurn(gs);
    expect(gs.puzzle.enemies).toHaveLength(1);
    expect(gs.puzzle.enemies[0].party).toBe('hero');
    expect(gs.puzzle.enemies[0].excludeFromWinConditions).toBe(true);
  });

  it("a CHARMED enemy's summon joins the charmer's team permanently (effective party at cast time)", () => {
    const gs = summonerState({ casterStatusEffects: [charm()] });

    executeTurn(gs);
    expect(gs.puzzle.enemies).toHaveLength(2);
    expect(gs.puzzle.enemies[1].party).toBe('hero'); // stamped once — outlives the charm
  });

  it('fails silently into a wall tile', () => {
    const tiles = createEmptyGrid(8, 5);
    setTile(tiles, 3, 2, TileType.WALL);
    const gs = summonerState({ tiles });

    executeTurn(gs);
    expect(gs.puzzle.enemies).toHaveLength(1); // no spawn
  });

  it('fails silently onto an occupied tile', () => {
    const gs = summonerState({
      extraEnemies: [createTestEnemy({ enemyId: 'goblin-1', x: 3, y: 2 })],
    });

    executeTurn(gs);
    expect(gs.puzzle.enemies).toHaveLength(2); // summoner + blocker only
  });

  it('multi-direction config = one spawn attempt per direction, invalid tiles skip', () => {
    registerSummonSpell({
      defaultDirections: [Direction.EAST, Direction.WEST, Direction.NORTH],
    });
    const tiles = createEmptyGrid(8, 5);
    setTile(tiles, 2, 1, TileType.WALL); // north blocked
    const gs = summonerState({ tiles });

    executeTurn(gs);
    expect(gs.puzzle.enemies).toHaveLength(3); // summoner + east + west
    const positions = gs.puzzle.enemies.slice(1).map(e => `${e.x},${e.y}`).sort();
    expect(positions).toEqual(['1,2', '3,2']);
  });

  it('a duration-limited summon acts its allotted turns, then despawns without dying', () => {
    registerSummonSpell({ summonDuration: 2 });
    const gs = summonerState();

    executeTurn(gs); // turn 1: cast — summon appears at (3,2), idle. despawnOnTurn = 3
    const summon = gs.puzzle.enemies[1];
    expect(summon.despawnOnTurn).toBe(3);
    expect(summon.sourceSpellId).toBe('summon-walker');

    executeTurn(gs); // turn 2: acts (moves east)
    expect(gs.puzzle.enemies[1].x).toBe(4);
    expect(gs.puzzle.enemies[1].despawned).toBeUndefined();

    executeTurn(gs); // turn 3: acts, then expires at end of turn
    expect(gs.puzzle.enemies[1].x).toBe(5);
    expect(gs.puzzle.enemies[1].despawned).toBe(true);
    expect(gs.puzzle.enemies[1].dead).toBe(true);
    // NOT a death: no diedOnTurn stamp, so the tile frees immediately
    expect(gs.puzzle.enemies[1].diedOnTurn).toBeUndefined();
    // Append-only invariant: the entity stays in the array
    expect(gs.puzzle.enemies).toHaveLength(2);
  });

  it('a permanent summon (no duration) never despawns', () => {
    const gs = summonerState();
    executeTurn(gs);
    expect(gs.puzzle.enemies[1].despawnOnTurn).toBeUndefined();
    for (let i = 0; i < 5; i++) executeTurn(gs);
    expect(gs.puzzle.enemies[1].despawned).toBeUndefined();
    expect(gs.puzzle.enemies[1].dead).toBe(false);
  });

  it('a summon killed before expiry dies fully — never marked despawned', () => {
    registerSummonSpell({ summonDuration: 5 });
    const gs = summonerState();
    executeTurn(gs); // summon appears, despawnOnTurn = 6

    // Killed on turn 2 (simulated via the normal death fields)
    gs.puzzle.enemies[1].currentHealth = 0;
    gs.puzzle.enemies[1].dead = true;
    gs.puzzle.enemies[1].diedOnTurn = gs.currentTurn;

    for (let i = 0; i < 6; i++) executeTurn(gs); // run past despawnOnTurn
    expect(gs.puzzle.enemies[1].despawned).toBeUndefined(); // real death, not an expiry
    expect(gs.puzzle.enemies[1].dead).toBe(true);
  });

  it('facing overrides: away/toward/match/fixed resolve against the summoner at cast time', () => {
    // Summoner at (2,2) facing EAST casts east — spawn axis is EAST.
    const cases: Array<[Record<string, unknown>, Direction]> = [
      [{ summonFacing: 'away_from_summoner' }, Direction.EAST],
      [{ summonFacing: 'toward_summoner' }, Direction.WEST],
      [{ summonFacing: 'match_summoner' }, Direction.EAST],
      [{ summonFacing: 'fixed', summonFacingFixed: Direction.NORTH }, Direction.NORTH],
    ];
    for (const [overrides, expected] of cases) {
      clearAllRegistries();
      registerSummonSpell(overrides);
      registerSummonerEnemy();
      regEnemy(createTestEnemyDef({
        id: 'walker', health: 3,
        behavior: { type: 'active', pattern: [{ type: ActionType.MOVE_FORWARD }], defaultFacing: Direction.SOUTH },
      }));
      const gs = summonerState();
      executeTurn(gs);
      expect(gs.puzzle.enemies[1].facing).toBe(expected);
    }
  });

  it('per-spell starting status is applied on top of the asset initials', () => {
    registerTestStatusEffect('contact-spikes', {
      id: 'contact-spikes', name: 'Spikes', description: '',
      type: StatusEffectType.CONTACT_DAMAGE,
      defaultDuration: 3, defaultValue: 1,
      stackingBehavior: 'refresh',
    });
    registerSummonSpell({
      summonStartingStatus: { statusAssetId: 'contact-spikes', durationOverride: -1, valueOverride: 4 },
    });
    const gs = summonerState();

    executeTurn(gs);
    const summon = gs.puzzle.enemies[1];
    const status = summon.statusEffects?.find(e => e.type === StatusEffectType.CONTACT_DAMAGE);
    expect(status).toBeDefined();
    expect(status!.value).toBe(4);      // value override = contact damage amount
    expect(status!.duration).toBe(99998); // -1 = permanent (99999, minus the cast turn's end-of-turn tick)
  });

  it('a SILENCED caster cannot summon', () => {
    const gs = summonerState({
      casterStatusEffects: [{
        id: 'silence-1', type: StatusEffectType.SILENCED, statusAssetId: 'silence-asset',
        duration: 5, currentStacks: 1, appliedOnTurn: 0,
        sourceEntityId: 'test', sourceIsEnemy: false, movementSkipCounter: 0,
      }],
    });

    executeTurn(gs);
    expect(gs.puzzle.enemies).toHaveLength(1); // no spawn
  });
});

// ==========================================
// NECROMANCY spell template
// ==========================================
describe('NECROMANCY spell template', () => {
  const registerNecromancySpell = (overrides?: Record<string, unknown>) =>
    registerTestSpell('raise-dead', {
      id: 'raise-dead', name: 'Raise Dead', description: '', thumbnailIcon: '',
      templateType: SpellTemplate.NECROMANCY,
      directionMode: 'current_facing',
      sprites: {},
      ...overrides,
    });

  const registerNecromancerHero = () =>
    regChar(createTestCharacterDef({
      id: 'hero-necro',
      behavior: [{ type: ActionType.SPELL, spellId: 'raise-dead' }, { type: ActionType.REPEAT }],
    }));

  const necroState = (extraEnemies: ReturnType<typeof createTestEnemy>[]) =>
    createTestGameState({
      puzzle: createTestPuzzle({
        width: 8, height: 5,
        winConditions: [{ type: 'defeat_all_enemies' }],
        enemies: extraEnemies,
        availableCharacters: ['hero-necro'],
      }),
      gameStatus: 'running',
      currentTurn: 0,
      testMode: true,
      placedCharacters: [createTestCharacter({ characterId: 'hero-necro', x: 2, y: 2, facing: Direction.EAST, actionIndex: 0, active: true })],
    });

  beforeEach(() => {
    registerNecromancySpell();
    registerNecromancerHero();
    regEnemy(createTestEnemyDef({
      id: 'walker', health: 4,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }],
        defaultFacing: Direction.EAST,
      },
    }));
  });

  it('raises a dead enemy as a NEW hero-party combatant; the corpse is consumed and its death still counts', () => {
    registerNecromancySpell({ resurrectHealthPercent: 50 });
    const corpse = createTestEnemy({ enemyId: 'walker', x: 4, y: 2, dead: true, currentHealth: 0 });
    const gs = necroState([corpse]);

    executeTurn(gs);

    expect(gs.puzzle.enemies).toHaveLength(2);
    const raised = gs.puzzle.enemies[1];
    expect(raised.enemyId).toBe('walker'); // rises as itself
    expect(raised.x).toBe(4);
    expect(raised.y).toBe(2);
    expect(raised.party).toBe('hero'); // joins the caster's side
    expect(raised.excludeFromWinConditions).toBe(true);
    expect(raised.currentHealth).toBe(2); // 50% of 4
    expect(raised.spawnedOnTurn).toBe(1); // idle until next turn, like a summon

    // Corpse consumed: stays dead (death already counted), draws nothing
    expect(gs.puzzle.enemies[0].dead).toBe(true);
    expect(gs.puzzle.enemies[0].despawned).toBe(true);

    // Original kill still satisfies defeat_all_enemies despite the raised
    // unit standing on the board
    expect(checkVictoryConditions(gs)).toBe(true);
  });

  it('a consumed corpse cannot be raised twice', () => {
    const gs = necroState([createTestEnemy({ enemyId: 'walker', x: 4, y: 2, dead: true, currentHealth: 0 })]);

    executeTurn(gs); // raises
    expect(gs.puzzle.enemies).toHaveLength(2);
    executeTurn(gs); // REPEAT casts again — no corpse left
    expect(gs.puzzle.enemies).toHaveLength(2);
  });

  it('skips a corpse whose tile is occupied by a living entity', () => {
    const gs = necroState([
      createTestEnemy({ enemyId: 'walker', x: 4, y: 2, dead: true, currentHealth: 0 }),
      createTestEnemy({ enemyId: 'goblin-1', x: 4, y: 2 }), // standing on the corpse
    ]);

    executeTurn(gs);
    expect(gs.puzzle.enemies).toHaveLength(2); // nothing raised
    expect(gs.puzzle.enemies[0].despawned).toBeUndefined(); // corpse not consumed
  });

  it('v1: an enemy necromancer cannot raise dead heroes (character-shaped corpses)', () => {
    registerTestSpell('raise-dead', {
      id: 'raise-dead', name: 'Raise Dead', description: '', thumbnailIcon: '',
      templateType: SpellTemplate.NECROMANCY, directionMode: 'current_facing', sprites: {},
    });
    regEnemy(createTestEnemyDef({
      id: 'necro-enemy', health: 5,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.SPELL, spellId: 'raise-dead' }],
        defaultFacing: Direction.WEST,
      },
    }));
    const gs = createTestGameState({
      puzzle: createTestPuzzle({
        width: 8, height: 5,
        enemies: [createTestEnemy({ enemyId: 'necro-enemy', x: 5, y: 2, currentHealth: 5, actionIndex: 0, active: true })],
      }),
      gameStatus: 'running',
      currentTurn: 0,
      testMode: true,
      placedCharacters: [createTestCharacter({ x: 2, y: 2, dead: true, currentHealth: 0, active: false })],
    });

    executeTurn(gs);
    expect(gs.puzzle.enemies).toHaveLength(1); // nothing raised
    expect(gs.placedCharacters[0].dead).toBe(true); // hero corpse untouched
  });
});
