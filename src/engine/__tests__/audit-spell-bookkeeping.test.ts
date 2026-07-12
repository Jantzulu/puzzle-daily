/**
 * Engine audit sweep 3 (docs/engine-audit-plan.md): spell bookkeeping for
 * ENEMY casters — cooldowns and maxUsesPerGame through the executeTurn
 * wrappers, linked chains, REPEAT loops, and the trigger phase.
 *
 * Editor note: maxUsesPerGame is only authorable on RESURRECT-family
 * spells (SpellAssetBuilder gates the field), and the engine only
 * increments the counter in the resurrect/necromancy branch — so resurrect
 * is the live template to pin. The engine-side check in executeSpell reads
 * the counter for every template, but nothing else ever writes it.
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
import type { PlacedEnemy, PlacedCharacter } from '../../types/game';
import { executeTurn } from '../simulation';

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

const waitingHero = (overrides?: Partial<PlacedCharacter>) => {
  regChar(createTestCharacterDef({
    id: 'bystander', health: 10,
    behavior: [{ type: ActionType.WAIT }, { type: ActionType.REPEAT }] as never,
  }));
  return createTestCharacter({
    characterId: 'bystander', x: 1, y: 2, facing: Direction.EAST,
    currentHealth: 10, actionIndex: 0, active: true,
    ...overrides,
  });
};

beforeEach(() => {
  clearAllRegistries();
  regEnemy(createTestEnemyDef()); // goblin-1, static, health 5
});

// ==========================================
// Cooldowns for enemy casters
// ==========================================

describe('cooldowns for enemy casters', () => {
  it('a cooldown-2 spell fires on turns 1 and 4 through the REPEAT loop', () => {
    registerTestSpell('zap', {
      id: 'zap', name: 'Zap', description: '', thumbnailIcon: '',
      templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
      damage: 2, projectileSpeed: 4, range: 6, cooldown: 2,
      sprites: {},
    });
    regEnemy(createTestEnemyDef({
      id: 'zapper', health: 5,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.SPELL, spellId: 'zap' }, { type: ActionType.REPEAT }],
        defaultFacing: Direction.WEST,
      },
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'zapper', x: 3, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.WEST,
      })],
      heroes: [waitingHero()],
    });

    const health: number[] = [];
    for (let t = 0; t < 4; t++) {
      executeTurn(gs);
      health.push(gs.placedCharacters[0].currentHealth);
    }
    // Cast turn 1 (10→8), cooldown blocks turns 2–3, cast again turn 4 (8→6)
    expect(health).toEqual([8, 8, 8, 6]);
  });

  it('a linked same-spell double-cast: both land without a cooldown, the second is suppressed with one', () => {
    const registerStab = (cooldown: number) =>
      registerTestSpell('stab', {
        id: 'stab', name: 'Stab', description: '', thumbnailIcon: '',
        templateType: SpellTemplate.MELEE, directionMode: 'current_facing',
        damage: 3, cooldown,
        sprites: {},
      });
    const run = (cooldown: number) => {
      registerStab(cooldown);
      regEnemy(createTestEnemyDef({
        id: 'flurry', health: 5,
        behavior: {
          type: 'active',
          pattern: [
            { type: ActionType.SPELL, spellId: 'stab', linkedToNext: true },
            { type: ActionType.SPELL, spellId: 'stab' },
          ],
          defaultFacing: Direction.WEST,
        },
      }));
      const gs = baseState({
        enemies: [createTestEnemy({
          enemyId: 'flurry', x: 2, y: 2, currentHealth: 5,
          actionIndex: 0, active: true, facing: Direction.WEST,
        })],
        heroes: [waitingHero()],
      });
      executeTurn(gs);
      return gs.placedCharacters[0].currentHealth;
    };
    expect(run(0)).toBe(4);  // both stabs land: 10 - 3 - 3
    expect(run(2)).toBe(7);  // cooldown from the first suppresses the linked second
  });

  it('a trigger-phase spell honors its cooldown across turns', () => {
    registerTestSpell('stab', {
      id: 'stab', name: 'Stab', description: '', thumbnailIcon: '',
      templateType: SpellTemplate.MELEE, directionMode: 'current_facing',
      damage: 2, cooldown: 2,
      sprites: {},
    });
    regEnemy(createTestEnemyDef({
      id: 'ambusher', health: 5,
      behavior: {
        type: 'active',
        pattern: [
          { type: ActionType.WAIT },
          {
            type: ActionType.SPELL, spellId: 'stab',
            executionMode: 'parallel',
            trigger: { mode: 'on_event', event: 'character_in_range', eventRange: 1 },
          },
        ],
        defaultFacing: Direction.WEST,
      },
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'ambusher', x: 2, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.WEST,
      })],
      heroes: [waitingHero()],
    });

    const health: number[] = [];
    for (let t = 0; t < 4; t++) {
      executeTurn(gs);
      health.push(gs.placedCharacters[0].currentHealth);
    }
    expect(health).toEqual([8, 8, 8, 6]); // same cadence as the sequential caster
  });
});

// ==========================================
// maxUsesPerGame (resurrect — the authorable template)
// ==========================================

describe('maxUsesPerGame for resurrect casters', () => {
  const registerRaise = () =>
    registerTestSpell('raise', {
      id: 'raise', name: 'Raise', description: '', thumbnailIcon: '',
      templateType: SpellTemplate.RESURRECT, directionMode: 'current_facing',
      resurrectHealthPercent: 100, maxUsesPerGame: 1,
      sprites: {},
    });

  it('HERO caster: a 1-use resurrect raises exactly one of two dead allies', () => {
    registerRaise();
    regChar(createTestCharacterDef({
      id: 'cleric', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'raise' }, { type: ActionType.REPEAT }] as never,
    }));
    regChar(createTestCharacterDef({ id: 'ally', health: 4 }));
    const gs = baseState({
      heroes: [
        createTestCharacter({
          characterId: 'cleric', x: 2, y: 2, facing: Direction.EAST,
          currentHealth: 10, actionIndex: 0, active: true,
        }),
        createTestCharacter({
          characterId: 'ally', x: 3, y: 2,
          currentHealth: 0, dead: true, active: false,
        }),
        createTestCharacter({
          characterId: 'ally', x: 4, y: 2,
          currentHealth: 0, dead: true, active: false,
        }),
      ],
    });

    executeTurn(gs); // raise #1
    executeTurn(gs); // REPEAT casts again — must be blocked by the use cap
    executeTurn(gs);
    const alive = gs.placedCharacters.filter(c => !c.dead);
    expect(alive).toHaveLength(2); // cleric + exactly one raised ally
  });

  it('ENEMY caster: a 1-use resurrect raises exactly one of two dead enemies', () => {
    registerRaise();
    regEnemy(createTestEnemyDef({
      id: 'necro', health: 5,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.SPELL, spellId: 'raise' }, { type: ActionType.REPEAT }],
        defaultFacing: Direction.WEST,
      },
    }));
    const gs = baseState({
      enemies: [
        createTestEnemy({
          enemyId: 'necro', x: 2, y: 2, currentHealth: 5,
          actionIndex: 0, active: true, facing: Direction.WEST,
        }),
        createTestEnemy({ enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 0, dead: true }),
        createTestEnemy({ enemyId: 'goblin-1', x: 4, y: 2, currentHealth: 0, dead: true }),
      ],
    });

    executeTurn(gs);
    executeTurn(gs);
    executeTurn(gs);
    const alive = gs.puzzle.enemies.filter(e => !e.dead);
    expect(alive).toHaveLength(2); // necro + exactly one raised goblin
  });

  it('ENEMY caster in the TRIGGER PHASE: the use cap holds there too', () => {
    registerTestSpell('raise', {
      id: 'raise', name: 'Raise', description: '', thumbnailIcon: '',
      templateType: SpellTemplate.RESURRECT, directionMode: 'current_facing',
      resurrectHealthPercent: 100, maxUsesPerGame: 1,
      sprites: {},
    });
    regEnemy(createTestEnemyDef({
      id: 'necro-trap', health: 5,
      behavior: {
        type: 'active',
        pattern: [
          { type: ActionType.WAIT },
          {
            type: ActionType.SPELL, spellId: 'raise',
            executionMode: 'parallel',
            trigger: { mode: 'on_event', event: 'character_in_range', eventRange: 3 },
          },
        ],
        defaultFacing: Direction.WEST,
      },
    }));
    const gs = baseState({
      enemies: [
        createTestEnemy({
          enemyId: 'necro-trap', x: 2, y: 2, currentHealth: 5,
          actionIndex: 0, active: true, facing: Direction.WEST,
        }),
        createTestEnemy({ enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 0, dead: true }),
        createTestEnemy({ enemyId: 'goblin-1', x: 4, y: 2, currentHealth: 0, dead: true }),
      ],
      heroes: [waitingHero()], // stands in range, re-triggering every turn
    });

    executeTurn(gs);
    executeTurn(gs);
    executeTurn(gs);
    const alive = gs.puzzle.enemies.filter(e => !e.dead);
    expect(alive).toHaveLength(2);
  });
});
