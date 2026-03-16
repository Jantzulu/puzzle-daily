/**
 * Tests for src/engine/combatLog.ts — diffTurn state comparison.
 * Uses module mocks from helpers.ts.
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestCharacter as regChar,
  registerTestEnemy as regEnemy,
  registerTestCollectible as regCollectible,
  createTestPuzzle,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestCharacter,
  createTestEnemy,
  createTestCollectible,
  createTestGameState,
} from './helpers';
import { Direction } from '../../types/game';
import { diffTurn } from '../combatLog';
import type { GameState } from '../../types/game';

beforeEach(() => {
  clearAllRegistries();
  regChar(createTestCharacterDef());
  regEnemy(createTestEnemyDef());
});

/** Deep-clone a GameState for before/after comparison */
function cloneState(gs: GameState): GameState {
  return JSON.parse(JSON.stringify(gs));
}

describe('diffTurn', () => {
  it('detects character movement', () => {
    const before = createTestGameState({
      currentTurn: 0,
      placedCharacters: [createTestCharacter({ x: 0, y: 0 })],
    });
    const after = createTestGameState({
      currentTurn: 1,
      placedCharacters: [createTestCharacter({ x: 1, y: 0 })],
    });

    const entries = diffTurn(before, after);
    expect(entries.some(e => e.type === 'move')).toBe(true);
  });

  it('detects character damage', () => {
    const before = createTestGameState({
      currentTurn: 0,
      placedCharacters: [createTestCharacter({ currentHealth: 10 })],
    });
    const after = createTestGameState({
      currentTurn: 1,
      placedCharacters: [createTestCharacter({ currentHealth: 7 })],
    });

    const entries = diffTurn(before, after);
    const dmgEntry = entries.find(e => e.type === 'damage');
    expect(dmgEntry).toBeDefined();
    expect(dmgEntry!.text).toContain('3 damage');
  });

  it('detects character healing', () => {
    const before = createTestGameState({
      currentTurn: 0,
      placedCharacters: [createTestCharacter({ currentHealth: 5 })],
    });
    const after = createTestGameState({
      currentTurn: 1,
      placedCharacters: [createTestCharacter({ currentHealth: 8 })],
    });

    const entries = diffTurn(before, after);
    const healEntry = entries.find(e => e.type === 'status');
    expect(healEntry).toBeDefined();
    expect(healEntry!.text).toContain('healed 3 HP');
  });

  it('detects character death', () => {
    const before = createTestGameState({
      currentTurn: 0,
      placedCharacters: [createTestCharacter({ dead: false })],
    });
    const after = createTestGameState({
      currentTurn: 1,
      placedCharacters: [createTestCharacter({ dead: true })],
    });

    const entries = diffTurn(before, after);
    expect(entries.some(e => e.type === 'death')).toBe(true);
  });

  it('detects enemy death', () => {
    const before = createTestGameState({
      currentTurn: 0,
      puzzle: createTestPuzzle({
        enemies: [createTestEnemy({ dead: false })],
      }),
    });
    const after = createTestGameState({
      currentTurn: 1,
      puzzle: createTestPuzzle({
        enemies: [createTestEnemy({ dead: true })],
      }),
    });

    const entries = diffTurn(before, after);
    expect(entries.some(e => e.type === 'death')).toBe(true);
  });

  it('detects collectible pickup', () => {
    regCollectible('gem-1', { name: 'Ruby' });

    const before = createTestGameState({
      currentTurn: 0,
      puzzle: createTestPuzzle({
        collectibles: [createTestCollectible({ collectibleId: 'gem-1', collected: false })],
      }),
    });
    const after = createTestGameState({
      currentTurn: 1,
      puzzle: createTestPuzzle({
        collectibles: [createTestCollectible({ collectibleId: 'gem-1', collected: true })],
      }),
    });

    const entries = diffTurn(before, after);
    expect(entries.some(e => e.type === 'collect')).toBe(true);
  });

  it('detects new projectiles', () => {
    const before = createTestGameState({
      currentTurn: 0,
      activeProjectiles: [],
    });
    const after = createTestGameState({
      currentTurn: 1,
      activeProjectiles: [{ id: 'proj-1', active: true } as any],
    });

    const entries = diffTurn(before, after);
    expect(entries.some(e => e.type === 'spell')).toBe(true);
  });

  it('detects victory', () => {
    const before = createTestGameState({ currentTurn: 0, gameStatus: 'running' });
    const after = createTestGameState({ currentTurn: 1, gameStatus: 'victory' });

    const entries = diffTurn(before, after);
    const gameEntry = entries.find(e => e.type === 'game');
    expect(gameEntry).toBeDefined();
    expect(gameEntry!.text).toContain('Victory');
  });

  it('detects defeat', () => {
    const before = createTestGameState({ currentTurn: 0, gameStatus: 'running' });
    const after = createTestGameState({ currentTurn: 1, gameStatus: 'defeat' });

    const entries = diffTurn(before, after);
    const gameEntry = entries.find(e => e.type === 'game');
    expect(gameEntry).toBeDefined();
    expect(gameEntry!.text).toContain('Defeat');
  });

  it('produces quiet turn entry when nothing happens', () => {
    const state = createTestGameState({ currentTurn: 0 });
    const before = cloneState(state);
    const after = { ...state, currentTurn: 1 };

    const entries = diffTurn(before, after);
    expect(entries.length).toBe(1);
    expect(entries[0].text).toContain('No notable events');
  });
});
