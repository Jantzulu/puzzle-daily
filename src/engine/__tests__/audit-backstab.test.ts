/**
 * Engine audit sweep 6 (docs/engine-audit-plan.md): backstab/crit from
 * ENEMY attackers — does the 2× multiplier fire for enemy casters through
 * the executeTurn wrapper, on both melee and projectile deliveries?
 *
 * Backstab = attack direction matches the target's facing
 * (isAttackFromBehind). Only melee and projectiles support it; cones have
 * no crit site (noted in the plan doc as current design).
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

beforeEach(() => {
  clearAllRegistries();
  const base = { description: '', thumbnailIcon: '', sprites: {} };
  registerTestSpell('shiv', {
    id: 'shiv', name: 'Shiv', ...base,
    templateType: SpellTemplate.MELEE, directionMode: 'current_facing',
    damage: 2, backstabEnabled: true,
  });
  registerTestSpell('sneak-bolt', {
    id: 'sneak-bolt', name: 'Sneak Bolt', ...base,
    templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
    damage: 2, backstabEnabled: true, projectileSpeed: 4, range: 6,
  });
  regEnemy(createTestEnemyDef()); // goblin-1, static, health 5
});

describe('hero backstab (control)', () => {
  const setup = (goblinFacing: Direction) => {
    regChar(createTestCharacterDef({
      id: 'rogue', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'shiv' }] as never,
    }));
    return baseState({
      enemies: [createTestEnemy({
        enemyId: 'goblin-1', x: 3, y: 2, currentHealth: 5, facing: goblinFacing,
      })],
      heroes: [createTestCharacter({
        characterId: 'rogue', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
  };

  it('melee from behind doubles the damage', () => {
    const gs = setup(Direction.EAST); // back turned to the rogue
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(1); // 5 - 2×2
  });

  it('melee from the front does not', () => {
    const gs = setup(Direction.WEST); // facing the rogue
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(3); // 5 - 2
  });
});

describe('ENEMY backstab through the wrapper', () => {
  const meleeSetup = (heroFacing: Direction) => {
    regChar(createTestCharacterDef({
      id: 'victim', health: 10,
      behavior: [{ type: ActionType.WAIT }, { type: ActionType.REPEAT }] as never,
    }));
    return baseState({
      enemies: [createTestEnemy({
        enemyId: 'assassin', x: 3, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.WEST,
      })],
      heroes: [createTestCharacter({
        characterId: 'victim', x: 2, y: 2, facing: heroFacing,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
  };

  beforeEach(() => {
    regEnemy(createTestEnemyDef({
      id: 'assassin', health: 5,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.SPELL, spellId: 'shiv' }],
        defaultFacing: Direction.WEST,
      },
    }));
  });

  it('enemy melee from behind doubles the damage', () => {
    const gs = meleeSetup(Direction.WEST); // hero's back to the assassin
    executeTurn(gs);
    expect(gs.placedCharacters[0].currentHealth).toBe(6); // 10 - 2×2
  });

  it('enemy melee from the front does not', () => {
    const gs = meleeSetup(Direction.EAST); // hero facing the assassin
    executeTurn(gs);
    expect(gs.placedCharacters[0].currentHealth).toBe(8); // 10 - 2
  });

  it('enemy projectile from behind doubles the damage', () => {
    regEnemy(createTestEnemyDef({
      id: 'sniper', health: 5,
      behavior: {
        type: 'active',
        pattern: [{ type: ActionType.SPELL, spellId: 'sneak-bolt' }],
        defaultFacing: Direction.WEST,
      },
    }));
    const run = (heroFacing: Direction) => {
      regChar(createTestCharacterDef({
        id: 'victim', health: 10,
        behavior: [{ type: ActionType.WAIT }, { type: ActionType.REPEAT }] as never,
      }));
      const gs = baseState({
        enemies: [createTestEnemy({
          enemyId: 'sniper', x: 5, y: 2, currentHealth: 5,
          actionIndex: 0, active: true, facing: Direction.WEST,
        })],
        heroes: [createTestCharacter({
          characterId: 'victim', x: 2, y: 2, facing: heroFacing,
          currentHealth: 10, actionIndex: 0, active: true,
        })],
      });
      executeTurn(gs);
      executeTurn(gs);
      return gs.placedCharacters[0].currentHealth;
    };
    expect(run(Direction.WEST)).toBe(6); // back to the bolt: 10 - 2×2
    expect(run(Direction.EAST)).toBe(8); // facing it: 10 - 2
  });
});
