/**
 * Engine audit sweep 10 (docs/engine-audit-plan.md): collectible pickup
 * permissions × actor. Pickup side is the collector's EFFECTIVE party
 * (audit decision, consistent with the party model): "characters can
 * collect" means the hero SIDE — a hero-party summon collects and scores
 * like a hero, charm flips allegiance, and grace-period placer identity
 * works for enemy placers (whose wrapper carries characterId = enemyId).
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
  createTestCollectible,
  createTestGameState,
} from './helpers';
import { Direction, ActionType, SpellTemplate, StatusEffectType } from '../../types/game';
import type { PlacedEnemy, PlacedCharacter, StatusEffectInstance } from '../../types/game';
import { executeTurn } from '../simulation';

const charm = (): StatusEffectInstance => ({
  id: 'charm-inst', type: StatusEffectType.CHARM, statusAssetId: 'charm-asset',
  duration: 99, currentStacks: 1, appliedOnTurn: 0,
  sourceEntityId: 'test', sourceIsEnemy: false, movementSkipCounter: 0,
} as StatusEffectInstance);

const registerCoin = (permissions: { characters: boolean; enemies: boolean }) =>
  registerTestCollectible('coin', {
    id: 'coin', name: 'Coin',
    effects: [{ type: 'score', scoreValue: 5 }],
    pickupPermissions: permissions,
  });

const coinAt = (x: number, y: number) =>
  createTestCollectible({ x, y, collectibleId: 'coin', collected: false });

const baseState = (opts: {
  enemies?: PlacedEnemy[];
  heroes?: PlacedCharacter[];
  collectibles?: ReturnType<typeof createTestCollectible>[];
}) =>
  createTestGameState({
    puzzle: createTestPuzzle({
      width: 8, height: 5,
      enemies: opts.enemies ?? [],
      collectibles: opts.collectibles ?? [],
    }),
    placedCharacters: opts.heroes ?? [],
    gameStatus: 'running',
    currentTurn: 0,
    testMode: true,
  });

const walkerAt = (x: number, y: number, overrides?: Partial<PlacedEnemy>) =>
  createTestEnemy({
    enemyId: 'walker', x, y, currentHealth: 5,
    actionIndex: 0, active: true, facing: Direction.EAST,
    ...overrides,
  });

const heroWalkerAt = (x: number, y: number, overrides?: Partial<PlacedCharacter>) =>
  createTestCharacter({
    characterId: 'strider', x, y, facing: Direction.EAST,
    currentHealth: 10, actionIndex: 0, active: true,
    ...overrides,
  });

beforeEach(() => {
  clearAllRegistries();
  regEnemy(createTestEnemyDef({
    id: 'walker', health: 5,
    behavior: {
      type: 'active',
      pattern: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }],
      defaultFacing: Direction.EAST,
    },
  }));
  regChar(createTestCharacterDef({
    id: 'strider', health: 10,
    behavior: [{ type: ActionType.MOVE_FORWARD }, { type: ActionType.REPEAT }] as never,
  }));
});

describe('pickup permissions × actor side', () => {
  it('a hero collects a characters-allowed item and scores', () => {
    registerCoin({ characters: true, enemies: false });
    const gs = baseState({ heroes: [heroWalkerAt(2, 2)], collectibles: [coinAt(3, 2)] });
    executeTurn(gs);
    expect(gs.puzzle.collectibles[0].collected).toBe(true);
    expect(gs.score).toBe(5);
  });

  it('a hero cannot collect a characters-denied item', () => {
    registerCoin({ characters: false, enemies: true });
    const gs = baseState({ heroes: [heroWalkerAt(2, 2)], collectibles: [coinAt(3, 2)] });
    executeTurn(gs);
    expect(gs.puzzle.collectibles[0].collected).toBe(false);
  });

  it('an enemy collects an enemies-allowed item WITHOUT scoring', () => {
    registerCoin({ characters: true, enemies: true });
    const gs = baseState({ enemies: [walkerAt(2, 2)], collectibles: [coinAt(3, 2)] });
    executeTurn(gs);
    expect(gs.puzzle.collectibles[0].collected).toBe(true);
    expect(gs.score).toBe(0); // enemy pickups never score
  });

  it('an enemy cannot collect an enemies-denied item', () => {
    registerCoin({ characters: true, enemies: false });
    const gs = baseState({ enemies: [walkerAt(2, 2)], collectibles: [coinAt(3, 2)] });
    executeTurn(gs);
    expect(gs.puzzle.collectibles[0].collected).toBe(false);
  });

  it('a HERO-PARTY SUMMON collects a heroes-only item — and scores for the player', () => {
    registerCoin({ characters: true, enemies: false });
    const gs = baseState({
      enemies: [walkerAt(2, 2, { party: 'hero' })], // the player's summon
      collectibles: [coinAt(3, 2)],
    });
    executeTurn(gs);
    expect(gs.puzzle.collectibles[0].collected).toBe(true);
    expect(gs.score).toBe(5); // fights for the player, scores for the player
  });

  it('a CHARMED enemy collects heroes-only items and loses access to enemies-only ones', () => {
    registerCoin({ characters: true, enemies: false });
    const forHeroes = baseState({
      enemies: [walkerAt(2, 2, { statusEffects: [charm()] })],
      collectibles: [coinAt(3, 2)],
    });
    executeTurn(forHeroes);
    expect(forHeroes.puzzle.collectibles[0].collected).toBe(true);

    registerCoin({ characters: false, enemies: true });
    const forEnemies = baseState({
      enemies: [walkerAt(2, 2, { statusEffects: [charm()] })],
      collectibles: [coinAt(3, 2)],
    });
    executeTurn(forEnemies);
    expect(forEnemies.puzzle.collectibles[0].collected).toBe(false);
  });
});

describe('thrown-item ownership (grace periods)', () => {
  const registerThrow = () =>
    registerTestSpell('drop-coin', {
      id: 'drop-coin', name: 'Drop Coin', description: '', thumbnailIcon: '',
      templateType: SpellTemplate.THROW_PLACE, directionMode: 'current_facing',
      spawnCollectibleId: 'coin', range: 1, throwPlaceGracePeriod: 2,
      sprites: {},
    });

  it('a hero placer cannot scoop its own item back up during the grace period', () => {
    registerCoin({ characters: true, enemies: true });
    registerThrow();
    regChar(createTestCharacterDef({
      id: 'dropper', health: 10,
      behavior: [
        { type: ActionType.SPELL, spellId: 'drop-coin' },
        { type: ActionType.MOVE_FORWARD },
      ] as never,
    }));
    const gs = baseState({
      heroes: [createTestCharacter({
        characterId: 'dropper', x: 2, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs); // places at (3,2), grace until turn 3
    expect(gs.puzzle.collectibles).toHaveLength(1);
    executeTurn(gs); // steps onto its own item during grace
    expect(gs.placedCharacters[0].x).toBe(3);
    expect(gs.puzzle.collectibles[0].collected).toBe(false);
  });

  it('a NON-placer can take the item during the placer grace period', () => {
    registerCoin({ characters: true, enemies: true });
    registerThrow();
    regChar(createTestCharacterDef({
      id: 'dropper', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'drop-coin' }, { type: ActionType.WAIT }] as never,
    }));
    const gs = baseState({
      heroes: [
        createTestCharacter({
          characterId: 'dropper', x: 2, y: 2, facing: Direction.EAST,
          currentHealth: 10, actionIndex: 0, active: true,
        }),
        heroWalkerAt(3, 0, { facing: Direction.SOUTH }), // marching down onto the drop
      ],
    });
    executeTurn(gs); // item placed at (3,2); strider at (3,1)
    executeTurn(gs); // strider reaches (3,2): grace only shields the placer
    expect(gs.puzzle.collectibles[0].collected).toBe(true);
    expect(gs.puzzle.collectibles[0].collectedBy).toBe('strider');
  });

  it('an ENEMY placer is recognized as its own placer (grace holds for enemies too)', () => {
    registerCoin({ characters: true, enemies: true });
    registerThrow();
    regEnemy(createTestEnemyDef({
      id: 'hoarder', health: 5,
      behavior: {
        type: 'active',
        pattern: [
          { type: ActionType.SPELL, spellId: 'drop-coin' },
          { type: ActionType.MOVE_FORWARD },
        ],
        defaultFacing: Direction.EAST,
      },
    }));
    const gs = baseState({
      enemies: [createTestEnemy({
        enemyId: 'hoarder', x: 2, y: 2, currentHealth: 5,
        actionIndex: 0, active: true, facing: Direction.EAST,
      })],
    });
    executeTurn(gs); // places at (3,2), grace until turn 3
    expect(gs.puzzle.collectibles).toHaveLength(1);
    executeTurn(gs); // walks onto its own drop during grace
    expect(gs.puzzle.enemies[0].x).toBe(3);
    expect(gs.puzzle.collectibles[0].collected).toBe(false);
  });
});
