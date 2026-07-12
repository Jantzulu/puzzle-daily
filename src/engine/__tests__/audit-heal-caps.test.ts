/**
 * Engine audit sweep 5 (docs/engine-audit-plan.md): heal/resurrect caps —
 * every heal delivery must clamp at the target's ASSET max health, for
 * every caster/target shape (hero, enemy, hero-party summon, vessel), and
 * resurrect must honor its health percent for both caster sides.
 *
 * Side-finding recorded in the plan doc: executeHeal in actions.ts has no
 * callers (dead code).
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestCharacter as regChar,
  registerTestEnemy as regEnemy,
  registerTestVessel,
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

const registerSpells = () => {
  const base = { description: '', thumbnailIcon: '', sprites: {} };
  registerTestSpell('circle-of-life', {
    id: 'circle-of-life', name: 'Circle of Life', ...base,
    templateType: SpellTemplate.AOE, directionMode: 'current_facing',
    radius: 1, aoeCenteredOnCaster: true, healing: 9,
  });
  registerTestSpell('heal-bolt', {
    id: 'heal-bolt', name: 'Heal Bolt', ...base,
    templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
    healing: 9, projectileSpeed: 4, range: 6,
  });
  registerTestSpell('mend', {
    id: 'mend', name: 'Mend', ...base,
    templateType: SpellTemplate.AOE, directionMode: 'current_facing',
    radius: 1, aoeCenteredOnCaster: true, healing: 9,
  });
  registerTestSpell('raise-half', {
    id: 'raise-half', name: 'Raise Half', ...base,
    templateType: SpellTemplate.RESURRECT, directionMode: 'current_facing',
    resurrectHealthPercent: 50,
  });
};

beforeEach(() => {
  clearAllRegistries();
  registerSpells();
  regEnemy(createTestEnemyDef()); // goblin-1, static, health 5
});

// ==========================================
// AOE heals cap at asset max health
// ==========================================

describe('AOE heal caps', () => {
  it('hero healer: a damaged hero ally heals to max, never beyond', () => {
    regChar(createTestCharacterDef({
      id: 'cleric', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'circle-of-life' }] as never,
    }));
    regChar(createTestCharacterDef({ id: 'ally', health: 10 }));
    const gs = baseState({
      heroes: [
        createTestCharacter({
          characterId: 'cleric', x: 2, y: 2, facing: Direction.EAST,
          currentHealth: 10, actionIndex: 0, active: true,
        }),
        createTestCharacter({ characterId: 'ally', x: 3, y: 2, currentHealth: 7, active: false }),
      ],
    });
    executeTurn(gs);
    expect(gs.placedCharacters[1].currentHealth).toBe(10); // 7 + 9 capped at 10
  });

  it('enemy healer: a damaged fellow enemy heals to its asset max — and heroes get nothing', () => {
    regEnemy(createTestEnemyDef({
      id: 'shaman', health: 5,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.SPELL, spellId: 'circle-of-life' }],
        defaultFacing: Direction.WEST,
      },
    }));
    regChar(createTestCharacterDef({ id: 'bystander', health: 10 }));
    const gs = baseState({
      enemies: [
        createTestEnemy({
          enemyId: 'shaman', x: 3, y: 2, currentHealth: 5,
          actionIndex: 0, active: true, facing: Direction.WEST,
        }),
        createTestEnemy({ enemyId: 'goblin-1', x: 4, y: 2, currentHealth: 2 }),
      ],
      heroes: [createTestCharacter({
        characterId: 'bystander', x: 2, y: 2,
        currentHealth: 4, active: false,
      })],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[1].currentHealth).toBe(5); // 2 + 9 capped at 5
    expect(gs.placedCharacters[0].currentHealth).toBe(4); // opposing side never healed
  });

  it('a damaged VESSEL is healable by its side, capped at the adapter max', () => {
    registerTestVessel({ id: 'barrel', name: 'Barrel', health: 2 });
    regEnemy(createTestEnemyDef({
      id: 'shaman', health: 5,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.SPELL, spellId: 'circle-of-life' }],
        defaultFacing: Direction.WEST,
      },
    }));
    const gs = baseState({
      enemies: [
        createTestEnemy({
          enemyId: 'shaman', x: 3, y: 2, currentHealth: 5,
          actionIndex: 0, active: true, facing: Direction.WEST,
        }),
        createTestEnemy({ enemyId: 'barrel', x: 4, y: 2, currentHealth: 1 }),
      ],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[1].currentHealth).toBe(2); // 1 + 9 capped at vessel health
  });

  it("a hero-party SUMMON is healed by the hero side, capped via its enemy asset", () => {
    regChar(createTestCharacterDef({
      id: 'cleric', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'circle-of-life' }] as never,
    }));
    const gs = baseState({
      enemies: [
        // The hero's summon, wounded, standing next to the cleric
        createTestEnemy({ enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 2, party: 'hero' }),
        // A REAL enemy of the same asset in radius — must not be healed
        createTestEnemy({ enemyId: 'goblin-1', x: 2, y: 3, currentHealth: 2 }),
      ],
      heroes: [createTestCharacter({
        characterId: 'cleric', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(5); // summon healed, capped
    expect(gs.puzzle.enemies[1].currentHealth).toBe(2); // enemy-side goblin untouched
  });
});

// ==========================================
// Healing projectiles cap
// ==========================================

describe('healing projectile caps', () => {
  it('hero heal bolt: the allied hero in its path heals to max', () => {
    regChar(createTestCharacterDef({
      id: 'medic', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'heal-bolt' }] as never,
    }));
    regChar(createTestCharacterDef({ id: 'ally', health: 10 }));
    const gs = baseState({
      heroes: [
        createTestCharacter({
          characterId: 'medic', x: 1, y: 2, facing: Direction.EAST,
          currentHealth: 10, actionIndex: 0, active: true,
        }),
        createTestCharacter({ characterId: 'ally', x: 3, y: 2, currentHealth: 6, active: false }),
      ],
    });
    executeTurn(gs);
    executeTurn(gs);
    expect(gs.placedCharacters[1].currentHealth).toBe(10); // 6 + 9 capped
  });

  it('enemy heal bolt: the fellow enemy in its path heals to its asset max', () => {
    regEnemy(createTestEnemyDef({
      id: 'medic-enemy', health: 5,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.SPELL, spellId: 'heal-bolt' }],
        defaultFacing: Direction.EAST,
      },
    }));
    const gs = baseState({
      enemies: [
        createTestEnemy({
          enemyId: 'medic-enemy', x: 1, y: 2, currentHealth: 5,
          actionIndex: 0, active: true, facing: Direction.EAST,
        }),
        createTestEnemy({ enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 1 }),
      ],
    });
    executeTurn(gs);
    executeTurn(gs);
    expect(gs.puzzle.enemies[1].currentHealth).toBe(5); // 1 + 9 capped
  });
});

// ==========================================
// Self-heals cap (targetSelfOnly)
// ==========================================

describe('self-heal caps', () => {
  it('hero self-heal caps at the character asset health', () => {
    regChar(createTestCharacterDef({
      id: 'monk', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'mend', targetSelfOnly: true }] as never,
    }));
    const gs = baseState({
      heroes: [createTestCharacter({
        characterId: 'monk', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 4, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs);
    expect(gs.placedCharacters[0].currentHealth).toBe(10); // 4 + 9 capped
  });

  it('ENEMY self-heal caps at the enemy asset health', () => {
    regEnemy(createTestEnemyDef({
      id: 'troll', health: 5,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.SPELL, spellId: 'mend', targetSelfOnly: true }],
        defaultFacing: Direction.WEST,
      },
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'troll', x: 3, y: 2, currentHealth: 2,
        actionIndex: 0, active: true, facing: Direction.WEST,
      })],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(5); // 2 + 9 capped at 5, NOT 11
  });
});

// ==========================================
// Resurrect health percent
// ==========================================

describe('resurrect health percent', () => {
  it('hero resurrect at 50% revives the ally at half its asset health', () => {
    regChar(createTestCharacterDef({
      id: 'cleric', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'raise-half' }] as never,
    }));
    regChar(createTestCharacterDef({ id: 'ally', health: 10 }));
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
      ],
    });
    executeTurn(gs);
    expect(gs.placedCharacters[1].dead).toBe(false);
    expect(gs.placedCharacters[1].currentHealth).toBe(5); // 50% of 10
  });

  it('enemy resurrect at 50% revives the fallen enemy at half (floored, min 1)', () => {
    regEnemy(createTestEnemyDef({
      id: 'necro', health: 5,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.SPELL, spellId: 'raise-half' }],
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
      ],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[1].dead).toBe(false);
    expect(gs.puzzle.enemies[1].currentHealth).toBe(2); // floor(5 * 0.5)
  });
});
