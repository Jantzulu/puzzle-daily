/**
 * Shove-out ejection (2026-07-17) — a push that drives an entity THROUGH an
 * open-ledge hallway mouth (HallwayMarker.openLedge) throws it off the
 * board. Summon-expiry death semantics: dead + despawned, no drops, no
 * death triggers, no corpse; counts as defeated; ejectedOnTurn drives the
 * render's fast tumble-out. Barred (default) mouths behave exactly as
 * before — pushes stop at the edge. Diagonal pushes never eject.
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestCharacter as regChar,
  registerTestEnemy as regEnemy,
  registerTestSpell,
  registerTestCollectible,
  registerTestVessel,
  createTestPuzzle,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestCharacter,
  createTestEnemy,
  createTestGameState,
} from './helpers';
import { Direction, ActionType, SpellTemplate } from '../../types/game';
import type { GameState } from '../../types/game';
import { executeTurn, checkVictoryConditions } from '../simulation';

// 8×5 grid; the east edge of row 2 is the ledge tile (7,2).
const OPEN_LEDGE = { x: 7, y: 2, side: 'right' as const, openLedge: true };
const BARRED = { x: 7, y: 2, side: 'right' as const };

const registerShover = (pushOverrides?: Record<string, unknown>) => {
  registerTestSpell('gust', {
    id: 'gust', name: 'Gust', description: '', thumbnailIcon: '', sprites: {},
    templateType: SpellTemplate.PUSH, directionMode: 'current_facing',
    range: 2, pushDistance: 2, pushDirection: 'spell_direction', cooldown: 10,
    ...pushOverrides,
  });
  regChar(createTestCharacterDef({
    id: 'monk', health: 10,
    behavior: [{ type: ActionType.SPELL, spellId: 'gust' }, { type: ActionType.REPEAT }] as never,
  }));
};

const buildState = (opts: {
  enemies?: ReturnType<typeof createTestEnemy>[];
  characters?: ReturnType<typeof createTestCharacter>[];
  hallways?: Array<Record<string, unknown>>;
}) =>
  createTestGameState({
    puzzle: createTestPuzzle({
      width: 8, height: 5,
      enemies: opts.enemies ?? [],
      winConditions: [{ type: 'defeat_all_enemies' }],
      hallways: opts.hallways ?? [OPEN_LEDGE],
    } as never),
    placedCharacters: opts.characters ?? [],
    gameStatus: 'running',
    currentTurn: 0,
    testMode: true,
  });

beforeEach(() => {
  clearAllRegistries();
  registerTestCollectible('coin', { id: 'coin', name: 'Coin' });
  regEnemy(createTestEnemyDef({ id: 'goblin-1', health: 5, droppedCollectibleId: 'coin' }));
});

describe('shove-out ejection', () => {
  it('a push through an open ledge ejects: dead+despawned, no drop, counts as defeated — parity', () => {
    registerShover();
    // Monk at (5,2) facing east; goblin at (6,2). Push distance 2 drives it
    // (6,2) → (7,2) → through the mouth.
    const build = () => buildState({
      enemies: [createTestEnemy({ enemyId: 'goblin-1', x: 6, y: 2, currentHealth: 5 })],
      characters: [createTestCharacter({
        characterId: 'monk', x: 5, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    const probe = (g: GameState) => ({
      dead: g.puzzle.enemies[0].dead,
      despawned: !!g.puzzle.enemies[0].despawned,
      ejectedOnTurn: g.puzzle.enemies[0].ejectedOnTurn,
      x: g.puzzle.enemies[0].x,
      drops: (g.puzzle.collectibles ?? []).length,
    });
    const visual = build();
    const headless = build();
    headless.headlessMode = true;
    executeTurn(visual);
    executeTurn(headless);
    expect(probe(visual)).toEqual(probe(headless));

    const goblin = visual.puzzle.enemies[0];
    expect(goblin.dead).toBe(true);
    expect(goblin.despawned).toBe(true);
    expect(goblin.ejectedOnTurn).toBe(1);
    expect(goblin.x).toBe(7);                       // rests at the mouth for the tumble
    expect(goblin.diedOnTurn).toBeUndefined();      // not a damage death — tile frees now
    expect(visual.puzzle.collectibles ?? []).toHaveLength(0); // fell off with its loot
    expect(checkVictoryConditions(visual)).toBe(true);        // counts as defeated
  });

  it('a barred mouth (default) stops the push at the edge — no ejection', () => {
    registerShover();
    const gs = buildState({
      hallways: [BARRED],
      enemies: [createTestEnemy({ enemyId: 'goblin-1', x: 6, y: 2, currentHealth: 5 })],
      characters: [createTestCharacter({
        characterId: 'monk', x: 5, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs);
    const goblin = gs.puzzle.enemies[0];
    expect(goblin.x).toBe(7);          // pushed to the edge tile and stopped
    expect(goblin.dead).toBeFalsy();
    expect(goblin.ejectedOnTurn).toBeUndefined();
  });

  it('an entity already standing on the mouth is ejected by a 0-tile push through it', () => {
    registerShover({ range: 1, pushDistance: 1 });
    const gs = buildState({
      enemies: [createTestEnemy({ enemyId: 'goblin-1', x: 7, y: 2, currentHealth: 5 })],
      characters: [createTestCharacter({
        characterId: 'monk', x: 6, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].dead).toBe(true);
    expect(gs.puzzle.enemies[0].ejectedOnTurn).toBe(1);
  });

  it('a shoved vessel never hatches — despawn skips its transform', () => {
    regEnemy(createTestEnemyDef({ id: 'spider', health: 3 }));
    registerTestVessel({ id: 'egg', name: 'Egg', health: 2, transformEnemyId: 'spider' });
    registerShover({ range: 1, pushDistance: 1 });
    const gs = buildState({
      enemies: [createTestEnemy({ enemyId: 'egg', x: 7, y: 2, currentHealth: 2 })],
      characters: [createTestCharacter({
        characterId: 'monk', x: 6, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs);
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].despawned).toBe(true);
    expect(gs.puzzle.enemies).toHaveLength(1); // no spider emerged
  });
});
