/**
 * Player-chosen starting facing (2026-07-28) — `facingAcceptsUserInput` on a
 * Character asset puts a Facing Direction compass on the hero card: the
 * player picks the starting facing during setup (required before placement,
 * same gate as direction-input spells) and the choice is stamped into the
 * PlacedCharacter's `facing`. The engine already treats placed `facing` as
 * authoritative — these tests pin that contract and the solver's side of it:
 * the validator must permute all 8 facings for flagged heroes (and keep
 * using the authored defaultFacing for everyone else), or it would diverge
 * from what a live player can actually do.
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
import type { GameState } from '../../types/game';
import { executeTurn } from '../simulation';
import { solvePuzzle } from '../puzzleSolver';
import { getMissingDirectionInputs } from '../../utils/directionInput';

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

const registerBolt = () => {
  registerTestSpell('face-bolt', {
    id: 'face-bolt', name: 'Face Bolt',
    description: '', thumbnailIcon: '', sprites: {},
    templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
    damage: 6, projectileSpeed: 4, range: 4, cooldown: 10,
  });
};

const registerWatchman = (facingAcceptsUserInput?: boolean, allowedFacingDirections?: Direction[]) => {
  regChar(createTestCharacterDef({
    id: 'watchman', health: 10,
    defaultFacing: Direction.EAST,
    ...(facingAcceptsUserInput ? { facingAcceptsUserInput: true } : {}),
    ...(allowedFacingDirections ? { allowedFacingDirections } : {}),
    behavior: [{ type: ActionType.SPELL, spellId: 'face-bolt' }, { type: ActionType.REPEAT }] as never,
  }));
};

beforeEach(() => {
  clearAllRegistries();
  regEnemy(createTestEnemyDef()); // goblin-1, static, health 5
  registerBolt();
});

describe('facingAcceptsUserInput — player-chosen starting facing', () => {
  // Grid (7×5): watchman at (3,2), asset defaultFacing EAST. Goblin EAST at
  // (5,2), goblin NORTH at (3,0) — which one dies tells us which facing the
  // current_facing cast used.
  it('placed facing (the player choice) drives current_facing casts, not the asset default', () => {
    registerWatchman(true);
    const result = expectParity(() => createTestGameState({
      puzzle: createTestPuzzle({
        width: 7, height: 5,
        tiles: createEmptyGrid(7, 5),
        enemies: [
          createTestEnemy({ enemyId: 'goblin-1', x: 5, y: 2, currentHealth: 5 }),
          createTestEnemy({ enemyId: 'goblin-1', x: 3, y: 0, currentHealth: 5 }),
        ],
        availableCharacters: ['watchman'],
      }),
      placedCharacters: [createTestCharacter({
        characterId: 'watchman', x: 3, y: 2, facing: Direction.NORTH, // player chose north
        currentHealth: 10, actionIndex: 0, active: true,
      })],
      gameStatus: 'running',
      currentTurn: 0,
      testMode: true,
    }), 2);
    const [eastGoblin, northGoblin] = result.enemies;
    expect(northGoblin.dead).toBe(true);
    expect(eastGoblin.dead).toBe(false);
  });

  // Solver corridor (1×5): goblin at the top, hero placeable only below it.
  // The authored defaultFacing (EAST) fires straight into the wall, so the
  // puzzle is solvable ONLY by facing north — i.e. only if the solver
  // permutes facings for the flagged hero.
  const corridorPuzzle = () => createTestPuzzle({
    id: 'corridor',
    width: 1, height: 5,
    tiles: createEmptyGrid(1, 5),
    enemies: [createTestEnemy({ enemyId: 'goblin-1', x: 0, y: 0, currentHealth: 5 })],
    availableCharacters: ['watchman'],
    maxCharacters: 1,
  });

  it('solver permutes all 8 facings for a flagged hero and finds the facing-dependent solution', () => {
    registerWatchman(true);
    const result = solvePuzzle(corridorPuzzle(), { maxSimulationTurns: 10, maxCombinations: 10000 });
    expect(result.solvable).toBe(true);
    expect(result.solutionFound?.placements[0].facing).toBe(Direction.NORTH);
  });

  it('solver keeps the authored defaultFacing for unflagged heroes (unsolvable corridor)', () => {
    registerWatchman(false);
    const result = solvePuzzle(corridorPuzzle(), { maxSimulationTurns: 10, maxCombinations: 10000 });
    expect(result.solvable).toBe(false);
  });

  it('solver permutes only the creator-allowed facing subset', () => {
    registerWatchman(true, [Direction.EAST, Direction.WEST]); // north not allowed → corridor unsolvable
    expect(solvePuzzle(corridorPuzzle(), { maxSimulationTurns: 10, maxCombinations: 10000 }).solvable).toBe(false);

    registerWatchman(true, [Direction.NORTH, Direction.SOUTH]);
    const result = solvePuzzle(corridorPuzzle(), { maxSimulationTurns: 10, maxCombinations: 10000 });
    expect(result.solvable).toBe(true);
    expect(result.solutionFound?.placements[0].facing).toBe(Direction.NORTH);
  });
});

describe('allowedInputDirections — creator-restricted spell compass', () => {
  const registerAimedBolt = (allowedInputDirections?: Direction[]) => {
    registerTestSpell('aim-bolt', {
      id: 'aim-bolt', name: 'Aim Bolt',
      description: '', thumbnailIcon: '', sprites: {},
      templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
      damage: 6, projectileSpeed: 4, range: 4, cooldown: 10,
      directionAcceptsUserInput: true,
      ...(allowedInputDirections ? { allowedInputDirections } : {}),
    });
  };
  const registerAimer = () => regChar(createTestCharacterDef({
    id: 'aimer', health: 10,
    defaultFacing: Direction.EAST,
    behavior: [{ type: ActionType.SPELL, spellId: 'aim-bolt' }, { type: ActionType.REPEAT }] as never,
  }));
  const aimCorridor = () => createTestPuzzle({
    id: 'aim-corridor',
    width: 1, height: 5,
    tiles: createEmptyGrid(1, 5),
    enemies: [createTestEnemy({ enemyId: 'goblin-1', x: 0, y: 0, currentHealth: 5 })],
    availableCharacters: ['aimer'],
    maxCharacters: 1,
  });

  it('solver permutes only the allowed aim subset', () => {
    registerAimer();
    registerAimedBolt([Direction.EAST, Direction.WEST]); // north not allowed → unsolvable
    expect(solvePuzzle(aimCorridor(), { maxSimulationTurns: 10, maxCombinations: 10000 }).solvable).toBe(false);

    registerAimedBolt([Direction.NORTH]);
    const result = solvePuzzle(aimCorridor(), { maxSimulationTurns: 10, maxCombinations: 10000 });
    expect(result.solvable).toBe(true);
    expect(result.solutionFound?.placements[0].spellDirectionOverrides?.['aim-bolt']).toBe(Direction.NORTH);
  });

  it('placement gate treats a choice outside the allowed subset as not chosen', () => {
    registerAimer();
    registerAimedBolt([Direction.NORTH, Direction.SOUTH]);
    registerWatchman(true, [Direction.NORTH]);
    const watchman = createTestCharacterDef({
      id: 'watchman', health: 10,
      defaultFacing: Direction.EAST,
      facingAcceptsUserInput: true,
      allowedFacingDirections: [Direction.NORTH],
      behavior: [{ type: ActionType.SPELL, spellId: 'aim-bolt' }, { type: ActionType.REPEAT }] as never,
    });
    // No choices at all → both inputs missing. Captions use the spell's
    // display name — "spell" is internal-only vocabulary.
    expect(getMissingDirectionInputs(watchman, undefined, undefined))
      .toEqual(['Facing Direction', 'Aim Bolt Direction']);
    // Allowed choices → free to place
    expect(getMissingDirectionInputs(watchman, Direction.NORTH, { 'aim-bolt': Direction.SOUTH }))
      .toEqual([]);
    // Stale choices outside the (narrowed) subsets → still gated
    expect(getMissingDirectionInputs(watchman, Direction.EAST, { 'aim-bolt': Direction.WEST }))
      .toEqual(['Facing Direction', 'Aim Bolt Direction']);
  });
});
