/**
 * Replay, frame by frame: does a replay draw what the live run drew?
 *
 * The rule (user, 2026-10-18): replay shows EXACTLY what happened.
 *
 * This simulates the live game the way Game.tsx and the board run it: each
 * turn is `executeTurn` on a copy of the state, a snapshot is saved, and
 * then the board's per-frame function (`updateProjectiles`) animates that
 * state for one turn interval, with the visual side-table carried across
 * turns. It then replays the saved history through `buildPlaybackState`
 * and requires:
 *
 *  - ANIMATED replay (auto-play, step forward): every frame of every turn
 *    matches live. Same bolts on screen, at the same positions, facing the
 *    same way, with every enemy and hero in the same state (alive / hit
 *    pending / dead, health, health-bar lag).
 *  - SETTLED replay (step back, seek): each turn's frozen view equals the
 *    live state at the end of that turn, and the last turn's equals the
 *    finished run after its final bolts have landed.
 *
 * Time is pinned with fake timers: both `updateProjectiles` and
 * `buildPlaybackState` read the wall clock.
 *
 * (replay-parity.test.ts is the older FIELD-level check of the timeline
 * rebuild path, which is now only the fallback for regenerated histories.)
 */
import {
  clearAllRegistries,
  registerTestCharacter,
  registerTestEnemy,
  registerTestSpell,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestPuzzle,
  createTestEnemy,
  createTestGameState,
  createEmptyGrid,
  setTile,
} from './helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeTurn, updateProjectiles } from '../simulation';
import { getCharacter } from '../../data/characters';
import { ActionType, Direction, SpellTemplate, TileType, TURN_INTERVAL_MS } from '../../types/game';
import type { GameState, PlacedCharacter, ProjectileVisualState } from '../../types/game';
import { buildPlaybackState, buildProjectileLifetimes } from '../../components/game/replayProjectiles';
import { ALL_CASES } from './corpus/allCases';
import type { CorpusCase } from './corpus/types';

/**
 * Scenarios the corpus doesn't have, each one a shape the old timeline
 * rebuild got wrong (docs/replay-audit-2026-11.md). One hero at `hero`
 * facing east casts a linear bolt once, then waits.
 */
function scenario(o: {
  id: string;
  spell?: Record<string, unknown>;
  width: number;
  height: number;
  hero: [number, number];
  walls?: Array<[number, number]>;
  enemies: Array<{ id: string; x: number; y: number; hp: number }>;
}): CorpusCase {
  return {
    id: o.id,
    description: o.id,
    setup: () => {
      clearAllRegistries();
      registerTestSpell('scenario-bolt', {
        id: 'scenario-bolt', name: 'Bolt', description: '', thumbnailIcon: '',
        templateType: SpellTemplate.LINEAR, directionMode: 'current_facing',
        damage: 3, range: 6, projectileSpeed: 4, sprites: {},
        ...o.spell,
      });
      registerTestCharacter(createTestCharacterDef({
        id: 'hero-caster',
        health: 10,
        behavior: [
          { type: ActionType.SPELL, spellId: 'scenario-bolt' },
          ...Array.from({ length: 12 }, () => ({ type: ActionType.WAIT })),
        ],
      }));
      for (const id of new Set(o.enemies.map(e => e.id))) {
        registerTestEnemy(createTestEnemyDef({ id, health: o.enemies.find(e => e.id === id)!.hp }));
      }
      const tiles = createEmptyGrid(o.width, o.height);
      for (const [x, y] of o.walls ?? []) setTile(tiles, x, y, TileType.WALL);
      return createTestGameState({
        puzzle: createTestPuzzle({
          width: o.width,
          height: o.height,
          tiles,
          enemies: o.enemies.map(e => createTestEnemy({ enemyId: e.id, x: e.x, y: e.y, currentHealth: e.hp, facing: Direction.WEST })),
          availableCharacters: ['hero-caster'],
          winConditions: [{ type: 'defeat_all_enemies' }],
          maxTurns: 6,
        }),
        gameStatus: 'setup',
      });
    },
    placements: [{ characterId: 'hero-caster', x: o.hero[0], y: o.hero[1], facing: Direction.EAST }],
    maxTurns: 12,
  };
}

/** Out of the bolt's way, so the run goes on after the interesting part. */
const BYSTANDER = { id: 'bystander', x: 0, y: 4, hp: 50 };

const EXTRA_CASES: CorpusCase[] = [
  // The kill lands at exactly +800ms (tile 4 at speed 4) and the run goes on.
  scenario({ id: 'x-kill-on-turn-boundary-midrun', width: 8, height: 5, hero: [0, 0], enemies: [{ id: 'g1', x: 4, y: 0, hp: 3 }, BYSTANDER] }),
  scenario({ id: 'x-hit-on-turn-boundary-survives', width: 8, height: 5, hero: [0, 0], enemies: [{ id: 'tank', x: 4, y: 0, hp: 10 }] }),
  scenario({ id: 'x-bounce-turn-left', spell: { bounceOffWalls: true, maxBounces: 2, bounceBehavior: 'turn_left', bounceTurnDegrees: 90, range: 10 }, width: 7, height: 5, hero: [0, 2], walls: [[3, 2]], enemies: [BYSTANDER] }),
  scenario({ id: 'x-bounce-on-a-later-turn', spell: { bounceOffWalls: true, maxBounces: 2, bounceBehavior: 'reflect', range: 12 }, width: 8, height: 5, hero: [0, 0], walls: [[6, 0]], enemies: [BYSTANDER] }),
  scenario({ id: 'x-pierce-midrun', spell: { projectileSpeed: 2, range: 10, pierceEnemies: true }, width: 8, height: 5, hero: [0, 0], enemies: [{ id: 'g1', x: 2, y: 0, hp: 3 }, { id: 'g2', x: 4, y: 0, hp: 3 }, BYSTANDER] }),
  scenario({ id: 'x-wall-right-next-to-the-caster', width: 8, height: 5, hero: [0, 0], walls: [[1, 0]], enemies: [BYSTANDER] }),
];

const CASES: CorpusCase[] = [...ALL_CASES, ...EXTRA_CASES];

const FRAME_MS = 16;
const FRAMES_PER_TURN = TURN_INTERVAL_MS / FRAME_MS; // 50
/** After the run ends the board keeps animating; give the last bolts 4s. */
const FINAL_FRAMES = FRAMES_PER_TURN * 5;
const T0 = 1_700_000_000_000;

function clone(state: GameState): GameState {
  const copy = JSON.parse(JSON.stringify(state)) as GameState;
  copy.tileStates = new Map();
  state.tileStates?.forEach((v, k) => copy.tileStates!.set(k, { ...v, damagedEntities: v.damagedEntities ? new Set(v.damagedEntities) : undefined }));
  if (state.tilesBeingVacated) copy.tilesBeingVacated = new Set(state.tilesBeingVacated);
  return copy;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** What a frame shows of the bolts: where each one is, and which way it faces. */
function boltsShown(state: GameState, visual: Map<string, ProjectileVisualState>): string {
  return (state.activeProjectiles ?? [])
    .filter(p => p.active)
    .map(p => {
      const vs = visual.get(p.id);
      const x = vs ? vs.x : p.logicalX;
      const y = vs ? vs.y : p.logicalY;
      return `${p.id}@${r3(x)},${r3(y)} ${p.direction}${p.despawning ? ' despawning' : ''}`;
    })
    .sort()
    .join(' | ');
}

/** What a frame shows of the fighters: state, health, and health-bar lag. */
function fightersShown(state: GameState): string {
  const one = (e: { dead: boolean; currentHealth: number; pendingProjectileDeath?: boolean; pendingVisualDamage?: number }) =>
    `${e.dead ? 'dead' : e.pendingProjectileDeath ? 'dying' : 'alive'}:${e.currentHealth}:${e.pendingVisualDamage ?? 0}`;
  return [
    ...state.puzzle.enemies.map(e => `E ${one(e)}`),
    ...state.placedCharacters.map(c => `H ${one(c)}`),
  ].join(' | ');
}

interface LiveRun {
  history: GameState[];
  resolvedAt: number[];
  /** frames[i] = the frames shown while history[i] was the current turn. */
  frames: Array<Array<{ bolts: string; fighters: string }>>;
  /** Final bolt positions per turn, read where a frozen board reads them. */
  timeline: NonNullable<GameState['projectileTimeline']>;
  clock: number;
}

/** `firstFrameMs`: when each turn's first frame falls (frames follow every 16ms). */
function runLive(testCase: CorpusCase, firstFrameMs: number = FRAME_MS): LiveRun {
  let clock = T0;
  vi.setSystemTime(clock);

  let gs: GameState = testCase.setup();
  for (const p of testCase.placements) {
    const def = getCharacter(p.characterId)!;
    const placed: PlacedCharacter = {
      characterId: p.characterId, x: p.x, y: p.y, facing: p.facing,
      currentHealth: def.health, actionIndex: 0, active: true, dead: false,
    };
    gs.placedCharacters.push(placed);
  }
  gs.gameStatus = 'running';
  gs.projectileTimeline = [];

  const history: GameState[] = [clone(gs)];
  const resolvedAt: number[] = [clock];
  const frames: LiveRun['frames'] = [[]];
  const visual = new Map<string, ProjectileVisualState>();

  let turns = 0;
  while (gs.gameStatus === 'running' && turns < (testCase.maxTurns ?? 40)) {
    gs = executeTurn(clone(gs));
    turns++;
    history.push(clone(gs));
    resolvedAt.push(clock);

    const turnStart = clock;
    const count = gs.gameStatus === 'running' ? FRAMES_PER_TURN : FINAL_FRAMES;
    const shown: LiveRun['frames'][number] = [];
    for (let f = 1; f <= count; f++) {
      clock = turnStart + firstFrameMs + (f - 1) * FRAME_MS;
      vi.setSystemTime(clock);
      updateProjectiles(gs, visual);
      shown.push({ bolts: boltsShown(gs, visual), fighters: fightersShown(gs) });
    }
    // The next turn is resolved a full interval after this one, wherever
    // the frames fell.
    if (gs.gameStatus === 'running') clock = turnStart + TURN_INTERVAL_MS;
    frames.push(shown);
  }
  return { history, resolvedAt, frames, timeline: gs.projectileTimeline ?? [], clock };
}

describe('replay shows what the live run showed', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  for (const testCase of CASES) {
    describe(testCase.id, () => {
      it('animated replay matches live on every frame', () => {
        const live = runLive(testCase);
        const lifetimes = buildProjectileLifetimes(live.timeline);
        const visual = new Map<string, ProjectileVisualState>();
        let clock = live.clock + 60_000; // the replay starts a minute later
        const differences: string[] = [];

        for (let index = 1; index < live.history.length; index++) {
          vi.setSystemTime(clock);
          const turnStart = clock;
          const shown = buildPlaybackState({ history: live.history, index, lifetimes, resolvedAt: live.resolvedAt, mode: 'animate' });
          const expected = live.frames[index];
          for (let f = 1; f <= expected.length; f++) {
            clock = turnStart + f * FRAME_MS;
            vi.setSystemTime(clock);
            updateProjectiles(shown, visual);
            const want = expected[f - 1];
            const gotBolts = boltsShown(shown, visual);
            const gotFighters = fightersShown(shown);
            if (gotBolts !== want.bolts) differences.push(`T${index} +${f * FRAME_MS}ms bolts: live [${want.bolts}] replay [${gotBolts}]`);
            if (gotFighters !== want.fighters) differences.push(`T${index} +${f * FRAME_MS}ms fighters: live [${want.fighters}] replay [${gotFighters}]`);
            if (differences.length > 5) break;
          }
          if (differences.length > 5) break;
        }
        expect(differences).toEqual([]);
      });

      it('a settled (frozen) view of each turn equals the live end of that turn', () => {
        const live = runLive(testCase);
        const lifetimes = buildProjectileLifetimes(live.timeline);
        vi.setSystemTime(live.clock + 60_000);
        const differences: string[] = [];

        for (let index = 1; index < live.history.length; index++) {
          const shown = buildPlaybackState({ history: live.history, index, lifetimes, resolvedAt: live.resolvedAt, mode: 'settle' });
          const frames = live.frames[index];
          const want = frames[frames.length - 1];
          // A frozen board draws bolts at their logical position (no side-table).
          const gotBolts = boltsShown(shown, new Map());
          const gotFighters = fightersShown(shown);
          if (gotBolts !== want.bolts) differences.push(`T${index} bolts: live end [${want.bolts}] settled [${gotBolts}]`);
          if (gotFighters !== want.fighters) differences.push(`T${index} fighters: live end [${want.fighters}] settled [${gotFighters}]`);
        }
        expect(differences).toEqual([]);
      });
    });
  }

  // Real frames never line up with turn boundaries. Here the LIVE frames
  // fell 8ms early (a turn's last frame at +792ms), so a hit landing at
  // +800ms was still un-applied when the next snapshot was saved, while the
  // REPLAY's frames reach +800ms and apply it. The next snapshot must not
  // then show that fighter alive again, and the run must end the same.
  it('off-phase frames: nobody comes back to life, and the run ends the same', () => {
    for (const testCase of CASES) {
      const live = runLive(testCase, 8);
      const lifetimes = buildProjectileLifetimes(live.timeline);
      const visual = new Map<string, ProjectileVisualState>();
      let clock = live.clock + 60_000;
      const everDead = new Set<number>();
      const revived: string[] = [];
      let lastFighters = '';

      for (let index = 1; index < live.history.length; index++) {
        vi.setSystemTime(clock);
        const turnStart = clock;
        const shown = buildPlaybackState({ history: live.history, index, lifetimes, resolvedAt: live.resolvedAt, mode: 'animate' });
        const count = live.frames[index].length;
        for (let f = 0; f <= count; f++) {
          // f = 0 is the state as loaded, before any frame.
          if (f > 0) {
            clock = turnStart + f * FRAME_MS;
            vi.setSystemTime(clock);
            updateProjectiles(shown, visual);
          }
          const fighters = [...shown.puzzle.enemies, ...shown.placedCharacters];
          fighters.forEach((e, i) => {
            if (e.dead) everDead.add(i);
            else if (everDead.has(i)) revived.push(`T${index} frame ${f}: fighter ${i} alive again`);
          });
          lastFighters = fightersShown(shown);
        }
        clock = turnStart + TURN_INTERVAL_MS;
      }
      const liveFinal = live.frames[live.frames.length - 1];
      expect(revived, testCase.id).toEqual([]);
      expect(lastFighters, testCase.id).toBe(liveFinal[liveFinal.length - 1].fighters);
    }
  });

  it('without resolve times it falls back to rebuilding from the timeline', () => {
    const testCase = ALL_CASES.find(c => c.id === '02-linear-projectile-fast')!;
    const live = runLive(testCase);
    const lifetimes = buildProjectileLifetimes(live.timeline);
    const shown = buildPlaybackState({ history: live.history, index: 1, lifetimes, resolvedAt: [], mode: 'animate' });
    // The rebuilt bolt carries the rebuild path's marker field.
    expect(shown.activeProjectiles?.length).toBe(1);
    expect((shown.activeProjectiles![0] as { _turnStartTileIndex?: number })._turnStartTileIndex).toBeDefined();
  });
});
