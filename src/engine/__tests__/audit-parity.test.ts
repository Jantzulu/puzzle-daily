/**
 * Engine audit sweep 7 (docs/engine-audit-plan.md): headless/visual parity
 * per feature. The score validator's authority depends on headless
 * executeTurn (updateProjectilesHeadless) reaching the same LOGICAL state
 * as the visual path (resolveProjectiles) — for every feature, not just
 * plain bolts (the corpus covers those).
 *
 * Method: build the same scenario twice, run N turns once with
 * headlessMode and once without, then diff a normalized snapshot.
 * Normalization folds the visual path's deferred death bookkeeping
 * (pendingProjectileDeath) into `dead` — that is the one intended
 * difference between the modes.
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
  createEmptyGrid,
  setTile,
} from './helpers';
import { Direction, ActionType, SpellTemplate, TileType, StatusEffectType } from '../../types/game';
import type { GameState, PlacedEnemy, PlacedCharacter } from '../../types/game';
import { executeTurn } from '../simulation';

// ==========================================
// Harness
// ==========================================

const normalize = (gs: GameState) => ({
  enemies: gs.puzzle.enemies.map(e => ({
    enemyId: e.enemyId,
    x: e.x, y: e.y,
    facing: e.facing,
    health: e.currentHealth,
    dead: !!(e.dead || e.pendingProjectileDeath),
    despawned: !!e.despawned,
    party: e.party,
    excludeFromWinConditions: !!e.excludeFromWinConditions,
  })),
  heroes: gs.placedCharacters.map(c => ({
    characterId: c.characterId,
    x: c.x, y: c.y,
    facing: c.facing,
    health: c.currentHealth,
    dead: !!(c.dead || c.pendingProjectileDeath),
  })),
  collectibles: (gs.puzzle.collectibles ?? []).map(c => ({
    collectibleId: c.collectibleId,
    x: c.x, y: c.y,
    collected: !!c.collected,
  })),
});

/**
 * Run the scenario in both modes and assert the normalized states match.
 * `build` must construct a FRESH GameState each call (registries are
 * already populated by the test).
 */
const expectParity = (build: () => GameState, turns: number) => {
  const visual = build();
  const headless = build();
  headless.headlessMode = true;
  for (let t = 0; t < turns; t++) {
    executeTurn(visual);
    executeTurn(headless);
  }
  expect(normalize(visual)).toEqual(normalize(headless));
  return normalize(visual); // for feature-specific spot checks
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
  registerTestSpell('slash', {
    id: 'slash', name: 'Slash', ...base,
    templateType: SpellTemplate.MELEE, directionMode: 'current_facing',
    damage: 5,
  });
  registerTestSpell('firezone', {
    id: 'firezone', name: 'Fire Zone', ...base,
    templateType: SpellTemplate.AOE, directionMode: 'current_facing',
    radius: 1, aoeCenteredOnCaster: true, damage: 1,
    persistDuration: 3, persistDamagePerTurn: 2,
  });
  registerTestSpell('summon-walker', {
    id: 'summon-walker', name: 'Summon Walker', ...base,
    templateType: SpellTemplate.SUMMON,
    directionMode: 'fixed', defaultDirections: [Direction.NORTH],
    summonEnemyId: 'walker', summonDuration: 3,
  });
  registerTestSpell('raise-dead', {
    id: 'raise-dead', name: 'Raise Dead', ...base,
    templateType: SpellTemplate.NECROMANCY, directionMode: 'current_facing',
    resurrectHealthPercent: 50,
  });
  regEnemy(createTestEnemyDef()); // goblin-1, static, health 5
  regEnemy(createTestEnemyDef({
    id: 'walker', health: 4,
    behavior: {
      type: 'active',
      pattern: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }],
      defaultFacing: Direction.EAST,
    },
  }));
  registerTestCollectible('gold', { id: 'gold', name: 'Gold', effects: [] });
});

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

// ==========================================
// Parity per feature
// ==========================================

describe('headless/visual parity', () => {
  it('projectile combat: a bolt duel resolves to the same healths and deaths', () => {
    regChar(createTestCharacterDef({
      id: 'archer', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'bolt' }, { type: ActionType.REPEAT }] as never,
    }));
    const final = expectParity(() => baseState({
      enemies: [createTestEnemy({ enemyId: 'goblin-1', x: 5, y: 2, currentHealth: 5 })],
      heroes: [createTestCharacter({
        characterId: 'archer', x: 1, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    }), 3);
    expect(final.enemies[0].dead).toBe(true); // 2 bolts ≥ 5 hp — the duel actually concluded
  });

  it('summon: an enemy summoner with a duration-limited summon', () => {
    regEnemy(createTestEnemyDef({
      id: 'summoner', health: 5,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.SPELL, spellId: 'summon-walker' }],
        defaultFacing: Direction.EAST,
      },
    }));
    const final = expectParity(() => baseState({
      enemies: [createTestEnemy({
        enemyId: 'summoner', x: 2, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.EAST,
      })],
    }), 5); // summon appears turn 1, walks, expires end of turn 4
    expect(final.enemies).toHaveLength(2);
    expect(final.enemies[1].despawned).toBe(true); // lived and expired identically
  });

  it('necromancy: a raised corpse fights on the caster side in both modes', () => {
    regChar(createTestCharacterDef({
      id: 'necro-hero', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'raise-dead' }] as never,
    }));
    const final = expectParity(() => baseState({
      enemies: [createTestEnemy({
        enemyId: 'walker', x: 4, y: 2, currentHealth: 0, dead: true,
      })],
      heroes: [createTestCharacter({
        characterId: 'necro-hero', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    }), 3);
    expect(final.enemies).toHaveLength(2);
    expect(final.enemies[1].party).toBe('hero');
    expect(final.enemies[1].x).toBeGreaterThan(4); // the raised walker walked
  });

  it('vessel transform: a projectile-smashed barrel hatches identically', () => {
    registerTestVessel({
      id: 'barrel', name: 'Barrel', health: 2,
      transformEnemyId: 'walker', droppedCollectibleId: 'gold',
    });
    regChar(createTestCharacterDef({
      id: 'archer', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'bolt' }] as never,
    }));
    const final = expectParity(() => baseState({
      enemies: [createTestEnemy({ enemyId: 'barrel', x: 4, y: 2, currentHealth: 2 })],
      heroes: [createTestCharacter({
        characterId: 'archer', x: 1, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    }), 4);
    expect(final.enemies[0].dead).toBe(true); // barrel smashed
    expect(final.enemies).toHaveLength(2);    // walker emerged in both modes
    expect(final.collectibles).toHaveLength(1); // gold dropped in both modes
  });

  it('death drops: melee and projectile kills drop identically', () => {
    regEnemy(createTestEnemyDef({ id: 'loot-goblin', health: 2, droppedCollectibleId: 'gold' }));
    regChar(createTestCharacterDef({
      id: 'archer', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'bolt' }] as never,
    }));
    regChar(createTestCharacterDef({
      id: 'basher', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'slash' }] as never,
    }));
    const final = expectParity(() => baseState({
      enemies: [
        createTestEnemy({ enemyId: 'loot-goblin', x: 4, y: 1, currentHealth: 2 }),
        createTestEnemy({ enemyId: 'loot-goblin', x: 3, y: 3, currentHealth: 2 }),
      ],
      heroes: [
        createTestCharacter({
          characterId: 'archer', x: 1, y: 1, facing: Direction.EAST,
          currentHealth: 10, actionIndex: 0, active: true,
        }),
        createTestCharacter({
          characterId: 'basher', x: 2, y: 3, facing: Direction.EAST,
          currentHealth: 10, actionIndex: 0, active: true,
        }),
      ],
    }), 3);
    expect(final.collectibles).toHaveLength(2); // one drop per kill, no doubles
  });

  it('persistent zones: an enemy-cast zone burns heroes identically', () => {
    regEnemy(createTestEnemyDef({
      id: 'pyro', health: 5,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.SPELL, spellId: 'firezone' }],
        defaultFacing: Direction.WEST,
      },
    }));
    regChar(createTestCharacterDef({
      id: 'victim', health: 10,
      behavior: [{ type: ActionType.WAIT }, { type: ActionType.REPEAT }] as never,
    }));
    const final = expectParity(() => baseState({
      enemies: [createTestEnemy({
        enemyId: 'pyro', x: 3, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.WEST,
      })],
      heroes: [createTestCharacter({
        characterId: 'victim', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    }), 4);
    expect(final.heroes[0].health).toBeLessThan(10); // the zone actually burned
  });

  it('corpse blocking: a walker paths over a projectile-killed corpse on the same turn in both modes', () => {
    // The freshly-dead window rides diedOnTurn. Visual stamps the deferred
    // kill's visual-death turn (N+1); headless used to keep the immediate
    // stamp (N), unblocking the tile a turn early in the validator. Pinned
    // at every step, not just the final state.
    regChar(createTestCharacterDef({
      id: 'archer', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'bolt' }] as never,
    }));
    const build = () => baseState({
      enemies: [
        createTestEnemy({ enemyId: 'goblin-1', x: 4, y: 1, currentHealth: 2 }),
        createTestEnemy({
          enemyId: 'walker', x: 2, y: 1, currentHealth: 4,
          actionIndex: 0, active: true, facing: Direction.EAST,
        }),
      ],
      heroes: [createTestCharacter({
        characterId: 'archer', x: 1, y: 1, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    const visual = build();
    const headless = build();
    headless.headlessMode = true;
    for (let t = 0; t < 4; t++) {
      executeTurn(visual);
      executeTurn(headless);
      expect({ turn: t + 1, x: visual.puzzle.enemies[1].x })
        .toEqual({ turn: t + 1, x: headless.puzzle.enemies[1].x });
    }
    expect(normalize(visual)).toEqual(normalize(headless));
  });

  it('thorns/trample: walk-in collisions resolve identically', () => {
    const contact = {
      id: 'contact-inst', type: 'contact_damage', statusAssetId: 'contact-asset',
      duration: 99, value: 3, currentStacks: 1, appliedOnTurn: 0,
      sourceEntityId: 'test', sourceIsEnemy: false, movementSkipCounter: 0,
    };
    regChar(createTestCharacterDef({
      id: 'hedgehog', health: 10,
      behavior: [{ type: ActionType.WAIT }, { type: ActionType.REPEAT }] as never,
    }));
    const final = expectParity(() => baseState({
      enemies: [createTestEnemy({
        enemyId: 'walker', x: 4, y: 2, currentHealth: 4,
        actionIndex: 0, active: true, facing: Direction.WEST,
      })],
      heroes: [createTestCharacter({
        characterId: 'hedgehog', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
        statusEffects: [contact as never],
      })],
    }), 4);
    expect(final.enemies[0].dead).toBe(true); // ground itself down on the spikes in both modes
  });

  it('homing wall check: a straight-style bolt stops at a wall in BOTH modes', () => {
    // Phase E pin (2026-07-12): before the shared planHomingTick, the wall
    // check existed only in resolveProjectiles — headless homing bolts flew
    // THROUGH walls, so the solver could certify kills the live game never
    // makes. This scenario had no corpus coverage (case 08 is pathfinding,
    // which routes around walls by design). Note homingIgnoreWalls defaults
    // to TRUE — the wall check only applies when the author opts out.
    regChar(createTestCharacterDef({
      id: 'homing-archer', health: 10,
      behavior: [{
        type: ActionType.SPELL, spellId: 'bolt',
        autoTargetNearestEnemy: true, homing: true, homingPathStyle: 'straight',
        homingIgnoreWalls: false,
      }, { type: ActionType.REPEAT }] as never,
    }));
    const final = expectParity(() => {
      const tiles = createEmptyGrid(8, 5);
      setTile(tiles, 3, 2, TileType.WALL);
      return createTestGameState({
        puzzle: createTestPuzzle({
          width: 8, height: 5, tiles,
          enemies: [createTestEnemy({
            enemyId: 'goblin-1', x: 6, y: 2, currentHealth: 5,
            actionIndex: 0, active: true,
          })],
        }),
        placedCharacters: [createTestCharacter({
          characterId: 'homing-archer', x: 0, y: 2, facing: Direction.EAST,
          currentHealth: 10, actionIndex: 0, active: true,
        })],
        gameStatus: 'running',
        currentTurn: 0,
        testMode: true,
      });
    }, 5);
    // The wall between caster and target stops every bolt — the goblin is
    // untouched in both modes. (Pre-fix headless killed it by turn ~3.)
    expect(final.enemies[0].health).toBe(5);
    expect(final.enemies[0].dead).toBe(false);
  });
});

// ==========================================
// Homing hit-along-path parity — residual divergence #1
// (docs/projectile-refactor-plan.md §Phase E). checkHomingPathForHits used
// to run ONLY in resolveProjectiles, so the solver missed every pass-through
// hit a homingHitAlongPath bolt lands in the live game.
// ==========================================

describe('homing hit-along-path parity', () => {
  const spellBase = { description: '', thumbnailIcon: '', sprites: {} };
  // Stealth keeps the bystander OFF the auto-target list while it sits
  // directly on the bolt's path. The along-path scan deliberately ignores
  // stealth (current live behavior, pinned as-is): stealth hides you from
  // targeting, not from a bolt physically crossing your tile.
  const stealth = () => ({
    id: 'stealth-1', type: StatusEffectType.STEALTH, statusAssetId: 'stealth-asset',
    duration: 99, appliedOnTurn: 0,
  });
  const registerPathBolt = () =>
    registerTestSpell('path-bolt', {
      id: 'path-bolt', name: 'Path Bolt', ...spellBase,
      templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
      damage: 2, projectileSpeed: 1, range: 8, cooldown: 10,
    });

  /**
   * Speed-1 hitAlongPath bolt from a mage at (0,2) to the nearest VISIBLE
   * enemy (goblin at (4,2)). The stealthed lurker at (2,2) sits on the path
   * and gets crossed on turn 2 — a MOVE TOWARD turn, so this pins the
   * along-path scan, not the reach leg. Cooldown 10 = exactly one bolt.
   */
  const alongPathScenario = (style: 'grid' | 'pathfinding') => {
    registerPathBolt();
    regChar(createTestCharacterDef({
      id: 'path-mage', health: 10,
      behavior: [{
        type: ActionType.SPELL, spellId: 'path-bolt',
        autoTargetNearestEnemy: true, homing: true, homingPathStyle: style,
        homingHitAlongPath: true,
      }, { type: ActionType.REPEAT }] as never,
    }));
    regEnemy(createTestEnemyDef({ id: 'lurker', health: 4 }));
    return () => baseState({
      enemies: [
        createTestEnemy({
          enemyId: 'goblin-1', x: 4, y: 2, currentHealth: 5,
          actionIndex: 0, active: true,
        }),
        createTestEnemy({
          enemyId: 'lurker', x: 2, y: 2, currentHealth: 4,
          actionIndex: 0, active: true,
          statusEffects: [stealth() as never],
        }),
      ],
      heroes: [createTestCharacter({
        characterId: 'path-mage', x: 0, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
  };

  it('grid style: a bystander on the path is damaged in BOTH modes', () => {
    const final = expectParity(alongPathScenario('grid'), 5);
    expect(final.enemies[1].health).toBe(2); // lurker: 4 - 2 along-path hit
    expect(final.enemies[0].health).toBe(3); // goblin: 5 - 2 on reach
  });

  it('pathfinding style: a bystander on the BFS path is damaged in BOTH modes', () => {
    const final = expectParity(alongPathScenario('pathfinding'), 5);
    expect(final.enemies[1].health).toBe(2);
    expect(final.enemies[0].health).toBe(3);
  });

  it('enemy caster: a stealthed hero on the path is damaged in BOTH modes', () => {
    // The character-side scan is a shape-split duplicate of the enemy-side
    // scan inside checkHomingPathForHits — pin it separately.
    registerPathBolt();
    regEnemy(createTestEnemyDef({
      id: 'warlock', health: 10,
      behavior: {
        type: 'active',
        pattern: [{
          type: ActionType.SPELL, spellId: 'path-bolt',
          autoTargetNearestCharacter: true, homing: true, homingPathStyle: 'grid',
          homingHitAlongPath: true,
        }, { type: ActionType.REPEAT }],
        defaultFacing: Direction.EAST,
      },
    }));
    regChar(createTestCharacterDef({ id: 'knight', health: 10 }));
    regChar(createTestCharacterDef({ id: 'rogue', health: 10 }));
    const final = expectParity(() => baseState({
      enemies: [createTestEnemy({
        enemyId: 'warlock', x: 0, y: 2, currentHealth: 10,
        actionIndex: 0, active: true, facing: Direction.EAST,
      })],
      heroes: [
        createTestCharacter({
          characterId: 'knight', x: 4, y: 2, facing: Direction.WEST,
          currentHealth: 10, actionIndex: 0, active: true,
        }),
        createTestCharacter({
          characterId: 'rogue', x: 2, y: 2, facing: Direction.WEST,
          currentHealth: 10, actionIndex: 0, active: true,
          statusEffects: [stealth() as never],
        }),
      ],
    }), 5);
    expect(final.heroes[1].health).toBe(8); // rogue: crossed on turn 2
    expect(final.heroes[0].health).toBe(8); // knight: reached on turn 4
  });

  /**
   * REACH-turn along-path hits (CLAUDE_HANDOFF.md pending task #6): a bolt
   * fast enough to reach its target on the same turn it passes a bystander
   * used to skip the along-path scan entirely — the scan only ran on MOVE
   * TOWARD turns. Now the reach leg (plan.reachTiles) is scanned in both
   * modes before the target hit lands.
   */
  const reachLegScenario = (style: 'grid' | 'pathfinding') => {
    registerTestSpell('reach-bolt', {
      id: 'reach-bolt', name: 'Reach Bolt', ...spellBase,
      templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
      damage: 2, projectileSpeed: 4, range: 8, cooldown: 10,
    });
    regChar(createTestCharacterDef({
      id: 'reach-mage', health: 10,
      behavior: [{
        type: ActionType.SPELL, spellId: 'reach-bolt',
        autoTargetNearestEnemy: true, homing: true, homingPathStyle: style,
        homingHitAlongPath: true,
      }, { type: ActionType.REPEAT }] as never,
    }));
    regEnemy(createTestEnemyDef({ id: 'lurker', health: 4 }));
    return () => baseState({
      enemies: [
        createTestEnemy({
          enemyId: 'goblin-1', x: 4, y: 2, currentHealth: 5,
          actionIndex: 0, active: true,
        }),
        createTestEnemy({
          enemyId: 'lurker', x: 3, y: 2, currentHealth: 4,
          actionIndex: 0, active: true,
          statusEffects: [stealth() as never],
        }),
      ],
      heroes: [createTestCharacter({
        characterId: 'reach-mage', x: 0, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
  };

  it('reach turn, grid: a bystander on the final leg is hit in BOTH modes', () => {
    const final = expectParity(reachLegScenario('grid'), 2);
    expect(final.enemies[1].health).toBe(2); // lurker: hit on the reach leg
    expect(final.enemies[0].health).toBe(3); // goblin: the target hit itself
  });

  it('reach turn, pathfinding: a bystander on the final BFS leg is hit in BOTH modes', () => {
    const final = expectParity(reachLegScenario('pathfinding'), 2);
    expect(final.enemies[1].health).toBe(2);
    expect(final.enemies[0].health).toBe(3);
  });
});

// ==========================================
// THROW_PLACE landing parity — residual divergence #3
// (docs/projectile-refactor-plan.md §Phase E). Real mode places at the end
// of the wall-truncated tilePath; headless used floor(logicalX/Y), and on a
// wall hit the walker's position update is skipped entirely — so a throw
// stopped by a wall mid-turn placed the item at the bolt's PRE-TURN
// position (the caster's own tile for a first-turn wall), not the tile in
// front of the wall the live game uses.
// ==========================================

describe('THROW_PLACE landing parity', () => {
  const registerThrow = (range: number) =>
    registerTestSpell('throw-gold', {
      id: 'throw-gold', name: 'Throw Gold', description: '', thumbnailIcon: '',
      templateType: SpellTemplate.THROW_PLACE, directionMode: 'current_facing',
      spawnCollectibleId: 'gold', range, projectileSpeed: 4, cooldown: 10,
      sprites: {},
    });
  const registerThrower = () =>
    regChar(createTestCharacterDef({
      id: 'thrower', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'throw-gold' },
                 { type: ActionType.REPEAT }] as never,
    }));

  it('a throw stopped by a wall lands in front of the wall in BOTH modes', () => {
    registerThrow(6);
    registerThrower();
    const final = expectParity(() => {
      const tiles = createEmptyGrid(8, 5);
      setTile(tiles, 3, 2, TileType.WALL);
      return createTestGameState({
        puzzle: createTestPuzzle({ width: 8, height: 5, tiles, enemies: [] }),
        placedCharacters: [createTestCharacter({
          characterId: 'thrower', x: 0, y: 2, facing: Direction.EAST,
          currentHealth: 10, actionIndex: 0, active: true,
        })],
        gameStatus: 'running',
        currentTurn: 0,
        testMode: true,
      });
    }, 1);
    expect(final.collectibles).toHaveLength(1);
    expect(final.collectibles[0]).toMatchObject({ x: 2, y: 2, collected: false });
  });

  it('an open-field throw lands at max range in BOTH modes', () => {
    registerThrow(3);
    registerThrower();
    const final = expectParity(() => baseState({
      heroes: [createTestCharacter({
        characterId: 'thrower', x: 0, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    }), 1);
    expect(final.collectibles).toHaveLength(1);
    expect(final.collectibles[0]).toMatchObject({ x: 3, y: 2, collected: false });
  });
});
