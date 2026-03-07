/**
 * Tests for src/engine/actions.ts — movement, turning, attacks, tile blocking, damage.
 * Uses module mocks from helpers.ts.
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestCharacter as regChar,
  registerTestEnemy as regEnemy,
  registerTestTileType,
  createEmptyGrid,
  createTestPuzzle,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestCharacter,
  createTestEnemy,
  createTestGameState,
  setTile,
  setNull,
} from './helpers';
import { Direction, TileType, ActionType, StatusEffectType } from '../../types/game';
import type { CharacterAction, CadenceConfig } from '../../types/game';
import { executeAction, isTileBlockingMovement, isTileActiveOnTurn, applyDamageToEntity } from '../actions';

beforeEach(() => {
  clearAllRegistries();
  // Register default character/enemy defs that the engine will look up
  regChar(createTestCharacterDef());
  regEnemy(createTestEnemyDef());
});

// ==========================================
// MOVEMENT — MOVE_FORWARD
// ==========================================
describe('executeAction — MOVE_FORWARD', () => {
  const moveForward: CharacterAction = { type: ActionType.MOVE_FORWARD };

  it('moves east one tile on an empty grid', () => {
    const gs = createTestGameState({
      puzzle: createTestPuzzle({ width: 5, height: 5 }),
      placedCharacters: [createTestCharacter({ x: 1, y: 2, facing: Direction.EAST })],
      gameStatus: 'running',
    });
    const result = executeAction(gs.placedCharacters[0], moveForward, gs);
    expect(result.x).toBe(2);
    expect(result.y).toBe(2);
  });

  it('moves north (y decreases)', () => {
    const gs = createTestGameState({
      puzzle: createTestPuzzle(),
      placedCharacters: [createTestCharacter({ x: 2, y: 2, facing: Direction.NORTH })],
      gameStatus: 'running',
    });
    const result = executeAction(gs.placedCharacters[0], moveForward, gs);
    expect(result.y).toBe(1);
    expect(result.x).toBe(2);
  });

  it('stops when hitting a WALL tile (default collision = stop)', () => {
    const grid = createEmptyGrid(5, 5);
    setTile(grid, 2, 2, TileType.WALL);
    const gs = createTestGameState({
      puzzle: createTestPuzzle({ tiles: grid }),
      placedCharacters: [createTestCharacter({ x: 1, y: 2, facing: Direction.EAST })],
      gameStatus: 'running',
    });
    const result = executeAction(gs.placedCharacters[0], moveForward, gs);
    expect(result.x).toBe(1); // didn't move
    expect(result.y).toBe(2);
  });

  it('stops when hitting a null (void) tile', () => {
    const grid = createEmptyGrid(5, 5);
    setNull(grid, 2, 2);
    const gs = createTestGameState({
      puzzle: createTestPuzzle({ tiles: grid }),
      placedCharacters: [createTestCharacter({ x: 1, y: 2, facing: Direction.EAST })],
      gameStatus: 'running',
    });
    const result = executeAction(gs.placedCharacters[0], moveForward, gs);
    expect(result.x).toBe(1);
  });

  it('stops at grid boundary', () => {
    const gs = createTestGameState({
      puzzle: createTestPuzzle({ width: 5, height: 5 }),
      placedCharacters: [createTestCharacter({ x: 4, y: 0, facing: Direction.EAST })],
      gameStatus: 'running',
    });
    const result = executeAction(gs.placedCharacters[0], moveForward, gs);
    expect(result.x).toBe(4); // stays at edge
  });

  it('wall collision: turn_right rotates instead of stopping', () => {
    const grid = createEmptyGrid(5, 5);
    setTile(grid, 2, 2, TileType.WALL);
    const gs = createTestGameState({
      puzzle: createTestPuzzle({ tiles: grid }),
      placedCharacters: [createTestCharacter({ x: 1, y: 2, facing: Direction.EAST })],
      gameStatus: 'running',
    });
    const action: CharacterAction = { type: ActionType.MOVE_FORWARD, onWallCollision: 'turn_right' };
    const result = executeAction(gs.placedCharacters[0], action, gs);
    expect(result.x).toBe(1); // didn't move
    expect(result.facing).toBe(Direction.SOUTH); // turned right
  });

  it('wall collision: turn_around reverses and moves, then pre-turns for next wall', () => {
    // Character at (2,2) facing EAST, wall at (3,2) — turns around to WEST, moves to (1,2)
    // Post-move lookahead: (0,2) is open, so facing stays WEST
    const grid = createEmptyGrid(5, 5);
    setTile(grid, 3, 2, TileType.WALL);
    const gs = createTestGameState({
      puzzle: createTestPuzzle({ tiles: grid }),
      placedCharacters: [createTestCharacter({ x: 2, y: 2, facing: Direction.EAST })],
      gameStatus: 'running',
    });
    const action: CharacterAction = { type: ActionType.MOVE_FORWARD, onWallCollision: 'turn_around' };
    const result = executeAction(gs.placedCharacters[0], action, gs);
    expect(result.x).toBe(1);
    expect(result.facing).toBe(Direction.WEST);
  });
});

// ==========================================
// MOVEMENT — MOVE_BACKWARD
// ==========================================
describe('executeAction — MOVE_BACKWARD', () => {
  it('moves opposite to facing direction', () => {
    const gs = createTestGameState({
      puzzle: createTestPuzzle(),
      placedCharacters: [createTestCharacter({ x: 2, y: 2, facing: Direction.EAST })],
      gameStatus: 'running',
    });
    const action: CharacterAction = { type: ActionType.MOVE_BACKWARD };
    const result = executeAction(gs.placedCharacters[0], action, gs);
    expect(result.x).toBe(1); // moved west (backward from east)
    expect(result.facing).toBe(Direction.EAST); // facing unchanged
  });
});

// ==========================================
// TURNING
// ==========================================
describe('executeAction — turning', () => {
  it('TURN_LEFT 90° default', () => {
    const gs = createTestGameState({
      placedCharacters: [createTestCharacter({ facing: Direction.NORTH })],
      gameStatus: 'running',
    });
    const result = executeAction(gs.placedCharacters[0], { type: ActionType.TURN_LEFT }, gs);
    expect(result.facing).toBe(Direction.WEST);
  });

  it('TURN_RIGHT 90° default', () => {
    const gs = createTestGameState({
      placedCharacters: [createTestCharacter({ facing: Direction.NORTH })],
      gameStatus: 'running',
    });
    const result = executeAction(gs.placedCharacters[0], { type: ActionType.TURN_RIGHT }, gs);
    expect(result.facing).toBe(Direction.EAST);
  });

  it('TURN_AROUND 180°', () => {
    const gs = createTestGameState({
      placedCharacters: [createTestCharacter({ facing: Direction.NORTH })],
      gameStatus: 'running',
    });
    const result = executeAction(gs.placedCharacters[0], { type: ActionType.TURN_AROUND }, gs);
    expect(result.facing).toBe(Direction.SOUTH);
  });

  it('TURN_LEFT with 45° degrees param', () => {
    const gs = createTestGameState({
      placedCharacters: [createTestCharacter({ facing: Direction.NORTH })],
      gameStatus: 'running',
    });
    const result = executeAction(gs.placedCharacters[0], { type: ActionType.TURN_LEFT, turnDegrees: 45 }, gs);
    expect(result.facing).toBe(Direction.NORTHWEST);
  });

  it('TURN_RIGHT with 135° degrees param', () => {
    const gs = createTestGameState({
      placedCharacters: [createTestCharacter({ facing: Direction.NORTH })],
      gameStatus: 'running',
    });
    const result = executeAction(gs.placedCharacters[0], { type: ActionType.TURN_RIGHT, turnDegrees: 135 }, gs);
    expect(result.facing).toBe(Direction.SOUTHEAST);
  });
});

// ==========================================
// ATTACK_FORWARD
// ==========================================
describe('executeAction — ATTACK_FORWARD', () => {
  it('damages adjacent enemy in facing direction', () => {
    const charDef = createTestCharacterDef({ attackDamage: 3 });
    regChar(charDef);

    const enemy = createTestEnemy({ x: 2, y: 0, currentHealth: 5 });
    const gs = createTestGameState({
      puzzle: createTestPuzzle({ enemies: [enemy] }),
      placedCharacters: [createTestCharacter({ x: 1, y: 0, facing: Direction.EAST })],
      gameStatus: 'running',
    });

    executeAction(gs.placedCharacters[0], { type: ActionType.ATTACK_FORWARD }, gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(2); // 5 - 3
  });

  it('misses when no enemy is adjacent', () => {
    const enemy = createTestEnemy({ x: 4, y: 4, currentHealth: 5 });
    const gs = createTestGameState({
      puzzle: createTestPuzzle({ enemies: [enemy] }),
      placedCharacters: [createTestCharacter({ x: 0, y: 0, facing: Direction.EAST })],
      gameStatus: 'running',
    });

    executeAction(gs.placedCharacters[0], { type: ActionType.ATTACK_FORWARD }, gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(5); // unchanged
  });

  it('kills enemy when damage exceeds health', () => {
    const charDef = createTestCharacterDef({ attackDamage: 10 });
    regChar(charDef);

    const enemy = createTestEnemy({ x: 2, y: 0, currentHealth: 3 });
    const gs = createTestGameState({
      puzzle: createTestPuzzle({ enemies: [enemy] }),
      placedCharacters: [createTestCharacter({ x: 1, y: 0, facing: Direction.EAST })],
      gameStatus: 'running',
    });

    executeAction(gs.placedCharacters[0], { type: ActionType.ATTACK_FORWARD }, gs);
    expect(gs.puzzle.enemies[0].dead).toBe(true);
  });
});

// ==========================================
// ATTACK_RANGE
// ==========================================
describe('executeAction — ATTACK_RANGE', () => {
  it('hits enemy within range', () => {
    const charDef = createTestCharacterDef({ attackDamage: 4 });
    regChar(charDef);

    const enemy = createTestEnemy({ x: 3, y: 0, currentHealth: 5 });
    const gs = createTestGameState({
      puzzle: createTestPuzzle(),
      placedCharacters: [createTestCharacter({ x: 0, y: 0, facing: Direction.EAST })],
      gameStatus: 'running',
    });
    gs.puzzle.enemies = [enemy];

    executeAction(gs.placedCharacters[0], { type: ActionType.ATTACK_RANGE, params: { range: 4 } }, gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(1); // 5 - 4
  });

  it('wall blocks ranged attack', () => {
    const charDef = createTestCharacterDef({ attackDamage: 4 });
    regChar(charDef);

    const grid = createEmptyGrid(5, 5);
    setTile(grid, 2, 0, TileType.WALL);
    const enemy = createTestEnemy({ x: 3, y: 0, currentHealth: 5 });
    const gs = createTestGameState({
      puzzle: createTestPuzzle({ tiles: grid, enemies: [enemy] }),
      placedCharacters: [createTestCharacter({ x: 0, y: 0, facing: Direction.EAST })],
      gameStatus: 'running',
    });

    executeAction(gs.placedCharacters[0], { type: ActionType.ATTACK_RANGE, params: { range: 4 } }, gs);
    expect(gs.puzzle.enemies[0].currentHealth).toBe(5); // wall blocked
  });
});

// ==========================================
// WAIT
// ==========================================
describe('executeAction — WAIT', () => {
  it('does nothing', () => {
    const gs = createTestGameState({
      placedCharacters: [createTestCharacter({ x: 2, y: 2, facing: Direction.EAST })],
      gameStatus: 'running',
    });
    const result = executeAction(gs.placedCharacters[0], { type: ActionType.WAIT }, gs);
    expect(result.x).toBe(2);
    expect(result.y).toBe(2);
    expect(result.facing).toBe(Direction.EAST);
  });
});

// ==========================================
// STATUS EFFECTS ON ACTION
// ==========================================
describe('executeAction — status effects', () => {
  it('stunned character skips action', () => {
    const gs = createTestGameState({
      placedCharacters: [createTestCharacter({
        x: 1, y: 0, facing: Direction.EAST,
        statusEffects: [{
          id: 'stun-1',
          type: StatusEffectType.STUN,
          statusAssetId: 'stun-asset',
          duration: 2,
          appliedOnTurn: 0,
        }],
      })],
      gameStatus: 'running',
    });

    const result = executeAction(gs.placedCharacters[0], { type: ActionType.MOVE_FORWARD }, gs);
    expect(result.x).toBe(1); // didn't move
  });

  it('sleeping character skips action', () => {
    const gs = createTestGameState({
      placedCharacters: [createTestCharacter({
        x: 1, y: 0, facing: Direction.EAST,
        statusEffects: [{
          id: 'sleep-1',
          type: StatusEffectType.SLEEP,
          statusAssetId: 'sleep-asset',
          duration: 3,
          appliedOnTurn: 0,
        }],
      })],
      gameStatus: 'running',
    });

    const result = executeAction(gs.placedCharacters[0], { type: ActionType.MOVE_FORWARD }, gs);
    expect(result.x).toBe(1);
  });
});

// ==========================================
// isTileBlockingMovement
// ==========================================
describe('isTileBlockingMovement', () => {
  it('null tile blocks movement', () => {
    const gs = createTestGameState();
    expect(isTileBlockingMovement(null, gs)).toBe(true);
  });

  it('undefined tile blocks movement', () => {
    const gs = createTestGameState();
    expect(isTileBlockingMovement(undefined, gs)).toBe(true);
  });

  it('WALL tile blocks movement', () => {
    const gs = createTestGameState();
    expect(isTileBlockingMovement({ x: 0, y: 0, type: TileType.WALL }, gs)).toBe(true);
  });

  it('EMPTY tile does not block movement', () => {
    const gs = createTestGameState();
    expect(isTileBlockingMovement({ x: 0, y: 0, type: TileType.EMPTY }, gs)).toBe(false);
  });

  it('GOAL tile does not block movement', () => {
    const gs = createTestGameState();
    expect(isTileBlockingMovement({ x: 0, y: 0, type: TileType.GOAL }, gs)).toBe(false);
  });

  it('custom wall tile blocks movement', () => {
    registerTestTileType('custom-wall', { baseType: 'wall' });
    const gs = createTestGameState();
    expect(isTileBlockingMovement({ x: 0, y: 0, type: TileType.EMPTY, customTileTypeId: 'custom-wall' }, gs)).toBe(true);
  });

  it('custom tile with onStateBlocksMovement blocks when active', () => {
    registerTestTileType('blocker', { baseType: 'empty', onStateBlocksMovement: true });
    const gs = createTestGameState();
    expect(isTileBlockingMovement({ x: 0, y: 0, type: TileType.EMPTY, customTileTypeId: 'blocker' }, gs)).toBe(true);
  });
});

// ==========================================
// isTileActiveOnTurn — cadence patterns
// ==========================================
describe('isTileActiveOnTurn', () => {
  it('returns true when cadence is disabled', () => {
    const cadence: CadenceConfig = { enabled: false, pattern: 'alternating', startState: 'on' };
    expect(isTileActiveOnTurn(cadence, 1)).toBe(true);
    expect(isTileActiveOnTurn(cadence, 2)).toBe(true);
  });

  describe('alternating pattern', () => {
    it('startState=on: ON on turn 1, OFF on turn 2', () => {
      const cadence: CadenceConfig = { enabled: true, pattern: 'alternating', startState: 'on' };
      expect(isTileActiveOnTurn(cadence, 1)).toBe(true);
      expect(isTileActiveOnTurn(cadence, 2)).toBe(false);
      expect(isTileActiveOnTurn(cadence, 3)).toBe(true);
      expect(isTileActiveOnTurn(cadence, 4)).toBe(false);
    });

    it('startState=off: OFF on turn 1, ON on turn 2', () => {
      const cadence: CadenceConfig = { enabled: true, pattern: 'alternating', startState: 'off' };
      expect(isTileActiveOnTurn(cadence, 1)).toBe(false);
      expect(isTileActiveOnTurn(cadence, 2)).toBe(true);
      expect(isTileActiveOnTurn(cadence, 3)).toBe(false);
    });
  });

  describe('interval pattern', () => {
    it('on=2, off=1: ON for 2 turns then OFF for 1', () => {
      const cadence: CadenceConfig = { enabled: true, pattern: 'interval', startState: 'on', onTurns: 2, offTurns: 1 };
      expect(isTileActiveOnTurn(cadence, 1)).toBe(true);
      expect(isTileActiveOnTurn(cadence, 2)).toBe(true);
      expect(isTileActiveOnTurn(cadence, 3)).toBe(false);
      expect(isTileActiveOnTurn(cadence, 4)).toBe(true); // cycle repeats
    });

    it('on=1, off=3: ON for 1 turn then OFF for 3', () => {
      const cadence: CadenceConfig = { enabled: true, pattern: 'interval', startState: 'on', onTurns: 1, offTurns: 3 };
      expect(isTileActiveOnTurn(cadence, 1)).toBe(true);
      expect(isTileActiveOnTurn(cadence, 2)).toBe(false);
      expect(isTileActiveOnTurn(cadence, 3)).toBe(false);
      expect(isTileActiveOnTurn(cadence, 4)).toBe(false);
      expect(isTileActiveOnTurn(cadence, 5)).toBe(true); // cycle repeats
    });
  });

  describe('custom pattern', () => {
    it('follows custom boolean pattern', () => {
      const cadence: CadenceConfig = {
        enabled: true,
        pattern: 'custom',
        startState: 'on',
        customPattern: [true, true, false],
      };
      expect(isTileActiveOnTurn(cadence, 1)).toBe(true);
      expect(isTileActiveOnTurn(cadence, 2)).toBe(true);
      expect(isTileActiveOnTurn(cadence, 3)).toBe(false);
      expect(isTileActiveOnTurn(cadence, 4)).toBe(true); // wraps
    });

    it('returns true when custom pattern is empty', () => {
      const cadence: CadenceConfig = { enabled: true, pattern: 'custom', startState: 'on', customPattern: [] };
      expect(isTileActiveOnTurn(cadence, 1)).toBe(true);
    });
  });
});

// ==========================================
// applyDamageToEntity
// ==========================================
describe('applyDamageToEntity', () => {
  it('deals basic damage', () => {
    const char = createTestCharacter({ currentHealth: 10 });
    const gs = createTestGameState({ placedCharacters: [char] });
    applyDamageToEntity(char, 3, gs);
    expect(char.currentHealth).toBe(7);
  });

  it('kills entity when damage exceeds health', () => {
    const char = createTestCharacter({ currentHealth: 3 });
    const gs = createTestGameState({ placedCharacters: [char] });
    applyDamageToEntity(char, 5, gs);
    expect(char.dead).toBe(true);
    expect(char.currentHealth).toBeLessThanOrEqual(0);
  });

  it('shield absorbs damage', () => {
    const char = createTestCharacter({
      currentHealth: 10,
      statusEffects: [{
        id: 'shield-1',
        type: StatusEffectType.SHIELD,
        statusAssetId: 'shield-asset',
        duration: 5,
        value: 4,
        appliedOnTurn: 0,
      }],
    });
    const gs = createTestGameState({ placedCharacters: [char] });
    applyDamageToEntity(char, 3, gs);
    expect(char.currentHealth).toBe(10); // shield absorbed all
    expect(char.statusEffects![0].value).toBe(1); // 4 - 3 remaining
  });

  it('shield depletes and remaining damage goes through', () => {
    const char = createTestCharacter({
      currentHealth: 10,
      statusEffects: [{
        id: 'shield-1',
        type: StatusEffectType.SHIELD,
        statusAssetId: 'shield-asset',
        duration: 5,
        value: 2,
        appliedOnTurn: 0,
      }],
    });
    const gs = createTestGameState({ placedCharacters: [char] });
    applyDamageToEntity(char, 5, gs);
    expect(char.currentHealth).toBe(7); // 10 - (5 - 2 shield)
  });

  it('invulnerable entity takes no damage', () => {
    const char = createTestCharacter({
      currentHealth: 10,
      statusEffects: [{
        id: 'invuln-1',
        type: StatusEffectType.INVULNERABLE,
        statusAssetId: 'invuln-asset',
        duration: 3,
        appliedOnTurn: 0,
      }],
    });
    const gs = createTestGameState({ placedCharacters: [char] });
    applyDamageToEntity(char, 99, gs);
    expect(char.currentHealth).toBe(10);
  });

  it('deflect reflects damage to source', () => {
    const target = createTestCharacter({
      characterId: 'defender',
      currentHealth: 10,
      statusEffects: [{
        id: 'deflect-1',
        type: StatusEffectType.DEFLECT,
        statusAssetId: 'deflect-asset',
        duration: 3,
        appliedOnTurn: 0,
      }],
    });
    const source = createTestCharacter({ characterId: 'attacker', currentHealth: 10 });
    const gs = createTestGameState({ placedCharacters: [target, source] });

    applyDamageToEntity(target, 4, gs, source);
    expect(target.currentHealth).toBe(10); // target takes 0
    expect(source.currentHealth).toBe(6);  // source takes reflected 4
  });
});
