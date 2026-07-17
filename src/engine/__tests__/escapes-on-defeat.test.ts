/**
 * Escapes-on-defeat (2026-07-17, locked design) — a defeated enemy whose
 * asset carries `escapesOnDefeat` leaves the board instead of leaving a
 * corpse. The death is otherwise UNCHANGED: win credit, drops, and death
 * triggers all fire on the normal path. processEscapes stamps
 * despawned + escapedOnTurn once the death settles (diedOnTurn rule —
 * deterministic in both modes); the walk-out itself is render-only theater.
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
  createTestGameState,
} from './helpers';
import { Direction, ActionType, SpellTemplate } from '../../types/game';
import type { GameState } from '../../types/game';
import { executeTurn, checkVictoryConditions } from '../simulation';

const buildState = (opts: {
  enemies: ReturnType<typeof createTestEnemy>[];
  characters?: ReturnType<typeof createTestCharacter>[];
}) =>
  createTestGameState({
    puzzle: createTestPuzzle({
      width: 8, height: 5,
      enemies: opts.enemies,
      winConditions: [{ type: 'defeat_all_enemies' }],
    }),
    placedCharacters: opts.characters ?? [],
    gameStatus: 'running',
    currentTurn: 0,
    testMode: true,
  });

beforeEach(() => {
  clearAllRegistries();
  registerTestCollectible('coin', { id: 'coin', name: 'Coin' });
  regEnemy(createTestEnemyDef({
    id: 'wisp', health: 2, escapesOnDefeat: true, droppedCollectibleId: 'coin',
  }));
  regEnemy(createTestEnemyDef({ id: 'goblin-1', health: 2 })); // unflagged control
  registerTestSpell('slash', {
    id: 'slash', name: 'Slash', description: '', thumbnailIcon: '', sprites: {},
    templateType: SpellTemplate.MELEE, directionMode: 'current_facing',
    damage: 5, meleeRange: 1, cooldown: 10,
  });
  regChar(createTestCharacterDef({
    id: 'knight', health: 10,
    behavior: [{ type: ActionType.SPELL, spellId: 'slash' }, { type: ActionType.REPEAT }] as never,
  }));
});

describe('escapes-on-defeat — logical half', () => {
  it('a melee kill despawns the remains the same turn: win credited, drop fired, no corpse', () => {
    const gs = buildState({
      enemies: [createTestEnemy({ enemyId: 'wisp', x: 4, y: 2, currentHealth: 2 })],
      characters: [createTestCharacter({
        characterId: 'knight', x: 3, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs);

    const wisp = gs.puzzle.enemies[0];
    expect(wisp.dead).toBe(true);            // full defeat — win credit intact
    expect(wisp.despawned).toBe(true);       // but no corpse remains
    expect(wisp.escapedOnTurn).toBe(1);      // render hook stamped
    expect(checkVictoryConditions(gs)).toBe(true);
    // Drops are logic-unchanged: the coin fired on the normal death path.
    expect((gs.puzzle.collectibles ?? []).some(c => c.collectibleId === 'coin')).toBe(true);
  });

  it('an unflagged enemy still leaves a normal corpse', () => {
    const gs = buildState({
      enemies: [createTestEnemy({ enemyId: 'goblin-1', x: 4, y: 2, currentHealth: 2 })],
      characters: [createTestCharacter({
        characterId: 'knight', x: 3, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    executeTurn(gs);
    expect(gs.puzzle.enemies[0].dead).toBe(true);
    expect(gs.puzzle.enemies[0].despawned).toBeUndefined();
    expect(gs.puzzle.enemies[0].escapedOnTurn).toBeUndefined();
  });

  it('projectile kill: escape settles on the diedOnTurn window — identical in real and headless', () => {
    registerTestSpell('bolt', {
      id: 'bolt', name: 'Bolt', description: '', thumbnailIcon: '', sprites: {},
      templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
      damage: 5, projectileSpeed: 4, range: 4, cooldown: 10,
    });
    regChar(createTestCharacterDef({
      id: 'archer', health: 10,
      behavior: [{ type: ActionType.SPELL, spellId: 'bolt' }, { type: ActionType.REPEAT }] as never,
    }));
    const build = () => buildState({
      enemies: [createTestEnemy({ enemyId: 'wisp', x: 5, y: 2, currentHealth: 2 })],
      characters: [createTestCharacter({
        characterId: 'archer', x: 3, y: 2, facing: Direction.EAST,
        currentHealth: 10, actionIndex: 0, active: true,
      })],
    });
    const probe = (g: GameState) => ({
      despawned: !!g.puzzle.enemies[0].despawned,
      escapedOnTurn: g.puzzle.enemies[0].escapedOnTurn,
    });
    const visual = build();
    const headless = build();
    headless.headlessMode = true;
    for (let t = 0; t < 3; t++) {
      executeTurn(visual);
      executeTurn(headless);
    }
    expect(probe(visual)).toEqual(probe(headless));
    expect(probe(visual).despawned).toBe(true);
    // Deferred projectile death: diedOnTurn is stamped N+1, so the escape
    // settles at the end of turn N+1 — one turn of normal corpse window,
    // deterministic in both modes.
    expect(probe(visual).escapedOnTurn).toBe(2);
  });

  it('an escaped enemy cannot be raised by necromancy (a normal corpse can)', () => {
    registerTestSpell('raise', {
      id: 'raise', name: 'Raise', description: '', thumbnailIcon: '', sprites: {},
      templateType: SpellTemplate.NECROMANCY, directionMode: 'current_facing',
      resurrectHealthPercent: 100, cooldown: 10,
    });
    regChar(createTestCharacterDef({
      id: 'necro', health: 10,
      behavior: [
        { type: ActionType.WAIT },
        { type: ActionType.SPELL, spellId: 'raise' },
        { type: ActionType.REPEAT },
      ] as never,
    }));

    const run = (enemyId: string) => {
      const gs = buildState({
        enemies: [createTestEnemy({ enemyId, x: 4, y: 2, currentHealth: 0, dead: true, diedOnTurn: 0 })],
        characters: [createTestCharacter({
          characterId: 'necro', x: 3, y: 2, facing: Direction.EAST,
          currentHealth: 10, actionIndex: 0, active: true,
        })],
      });
      executeTurn(gs); // turn 1: necro waits; escape pass runs (flagged corpse despawns)
      executeTurn(gs); // turn 2: necro casts raise
      return gs;
    };

    const escaped = run('wisp');
    expect(escaped.puzzle.enemies[0].despawned).toBe(true);
    expect(escaped.puzzle.enemies).toHaveLength(1); // nothing raised

    const control = run('goblin-1');
    // Normal corpse: consumed + a raised combatant appended.
    expect(control.puzzle.enemies.length).toBeGreaterThan(1);
  });
});
