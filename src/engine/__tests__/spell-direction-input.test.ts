/**
 * Player-aimed spell direction (2026-07-17) — `directionAcceptsUserInput`
 * generalizes the redirect compass: the player picks the FIRED direction of
 * a spell during setup, stored in the same `spellDirectionOverrides` slot
 * redirect input uses. The chosen direction replaces every authored
 * direction source (including auto-target); casters without a stored choice
 * (enemies/AI, or a hero the player never aimed) fall back to the authored
 * direction config.
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
  createEmptyGrid,
} from './helpers';
import { Direction, ActionType, SpellTemplate } from '../../types/game';
import type { GameState, PlacedCharacter, PlacedEnemy } from '../../types/game';
import { executeTurn } from '../simulation';

const normalize = (gs: GameState) => ({
  enemies: gs.puzzle.enemies.map(e => ({
    enemyId: e.enemyId,
    x: e.x, y: e.y,
    health: e.currentHealth,
    dead: !!(e.dead || e.pendingProjectileDeath),
  })),
  heroFacing: gs.placedCharacters.map(c => c.facing),
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

// Grid layout (7×5): archer at (3,2) facing EAST (authored default). One
// static goblin EAST at (5,2), one static goblin NORTH at (3,0) — which one
// takes the 3-damage bolt tells us which direction the cast resolved to.
const eastGoblin = (): PlacedEnemy => createTestEnemy({ enemyId: 'goblin-1', x: 5, y: 2, currentHealth: 5 });
const northGoblin = (): PlacedEnemy => createTestEnemy({ enemyId: 'goblin-1', x: 3, y: 0, currentHealth: 5 });

const buildState = (hero: Partial<PlacedCharacter>) =>
  createTestGameState({
    puzzle: createTestPuzzle({
      width: 7, height: 5,
      tiles: createEmptyGrid(7, 5),
      enemies: [eastGoblin(), northGoblin()],
      availableCharacters: ['archer'],
    }),
    placedCharacters: [createTestCharacter({
      characterId: 'archer', x: 3, y: 2, facing: Direction.EAST,
      currentHealth: 10, actionIndex: 0, active: true,
      ...hero,
    })],
    gameStatus: 'running',
    currentTurn: 0,
    testMode: true,
  });

const registerBolt = (overrides?: Record<string, unknown>) => {
  registerTestSpell('aim-bolt', {
    id: 'aim-bolt', name: 'Aim Bolt',
    description: '', thumbnailIcon: '', sprites: {},
    templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
    damage: 3, projectileSpeed: 4, range: 4, cooldown: 10,
    directionAcceptsUserInput: true,
    ...overrides,
  });
};

beforeEach(() => {
  clearAllRegistries();
  regEnemy(createTestEnemyDef()); // goblin-1, static, health 5
  regChar(createTestCharacterDef({
    id: 'archer', health: 10,
    behavior: [{ type: ActionType.SPELL, spellId: 'aim-bolt' }, { type: ActionType.REPEAT }] as never,
  }));
});

describe('directionAcceptsUserInput — player-aimed cast direction', () => {
  it('fires in the chosen direction instead of the authored one', () => {
    registerBolt();
    const result = expectParity(() => buildState({
      spellDirectionOverrides: { 'aim-bolt': Direction.NORTH },
    }), 2);
    // Bolt went north: north goblin hit, east goblin (the authored
    // current_facing target) untouched.
    expect(result.enemies.find(e => e.y === 0)!.health).toBe(2);
    expect(result.enemies.find(e => e.x === 5)!.health).toBe(5);
  });

  it('falls back to the authored direction when no choice is stored (enemy/AI path)', () => {
    registerBolt();
    const result = expectParity(() => buildState({}), 2);
    expect(result.enemies.find(e => e.x === 5)!.health).toBe(2);
    expect(result.enemies.find(e => e.y === 0)!.health).toBe(5);
  });

  it('ignores a stored direction when the flag is off', () => {
    registerBolt({ directionAcceptsUserInput: false });
    const result = expectParity(() => buildState({
      spellDirectionOverrides: { 'aim-bolt': Direction.NORTH },
    }), 2);
    expect(result.enemies.find(e => e.x === 5)!.health).toBe(2);
    expect(result.enemies.find(e => e.y === 0)!.health).toBe(5);
  });

  it('beats auto-target: the aim wins over autoTargetNearestEnemy', () => {
    registerBolt();
    regChar(createTestCharacterDef({
      id: 'archer', health: 10,
      behavior: [
        { type: ActionType.SPELL, spellId: 'aim-bolt', autoTargetNearestEnemy: true, autoTargetRange: 6 },
        { type: ActionType.REPEAT },
      ] as never,
    }));
    // Nearest enemy is the east goblin (distance 2 vs the north goblin's 2 —
    // make it unambiguous: pull the east goblin adjacent).
    const result = expectParity(() => createTestGameState({
      puzzle: createTestPuzzle({
        width: 7, height: 5,
        tiles: createEmptyGrid(7, 5),
        enemies: [createTestEnemy({ enemyId: 'goblin-1', x: 4, y: 2, currentHealth: 5 }), northGoblin()],
        availableCharacters: ['archer'],
      }),
      placedCharacters: [createTestCharacter({
        characterId: 'archer', x: 3, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
        spellDirectionOverrides: { 'aim-bolt': Direction.NORTH },
      })],
      gameStatus: 'running',
      currentTurn: 0,
      testMode: true,
    }), 2);
    expect(result.enemies.find(e => e.y === 0)!.health).toBe(2);
    expect(result.enemies.find(e => e.x === 4)!.health).toBe(5);
  });

  it('honors faceTargetOnCast toward the aimed direction', () => {
    registerBolt();
    regChar(createTestCharacterDef({
      id: 'archer', health: 10,
      behavior: [
        { type: ActionType.SPELL, spellId: 'aim-bolt', faceTargetOnCast: true },
        { type: ActionType.REPEAT },
      ] as never,
    }));
    const result = expectParity(() => buildState({
      spellDirectionOverrides: { 'aim-bolt': Direction.NORTH },
    }), 1);
    expect(result.heroFacing[0]).toBe(Direction.NORTH);
  });

  it('leaves facing alone without faceTargetOnCast', () => {
    registerBolt();
    const result = expectParity(() => buildState({
      spellDirectionOverrides: { 'aim-bolt': Direction.NORTH },
    }), 1);
    expect(result.heroFacing[0]).toBe(Direction.EAST);
  });
});
