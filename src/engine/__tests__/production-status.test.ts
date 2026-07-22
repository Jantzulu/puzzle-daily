/**
 * Production dashboard derivations — pins for the row-building rules:
 * slabState precedence (hidden > revealed > awaiting_debut > unpublished),
 * showcase attached-vs-primed, puzzle kind precedence (showcase > training >
 * daily > unassigned), and missing-dep counting via the walker.
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestEnemy as regEnemy,
  createTestPuzzle,
  createTestEnemyDef,
  createTestEnemy,
} from './helpers';
import {
  deriveAssetRow,
  derivePuzzleRow,
  buildShowcasesByAsset,
  type ProductionContext,
} from '../../utils/productionStatus';

beforeEach(() => {
  clearAllRegistries();
});

const emptyCtx = (over: Partial<ProductionContext> = {}): ProductionContext => ({
  liveAssetIds: new Set(),
  livePuzzleIds: new Set(),
  revealedAssetIds: new Set(),
  showcasesByAsset: new Map(),
  ...over,
});

describe('deriveAssetRow', () => {
  const goblin = { id: 'goblin', name: 'Goblin', type: 'enemy' as const, description: 'Bites.', attributes: ['Sneaky'] };

  it('slabState walks unpublished → awaiting_debut → revealed as the pipeline advances', () => {
    expect(deriveAssetRow(goblin, emptyCtx()).slabState).toBe('unpublished');
    expect(deriveAssetRow(goblin, emptyCtx({ liveAssetIds: new Set(['goblin']) })).slabState).toBe('awaiting_debut');
    expect(deriveAssetRow(goblin, emptyCtx({
      liveAssetIds: new Set(['goblin']),
      revealedAssetIds: new Set(['goblin']),
    })).slabState).toBe('revealed');
  });

  it('hideFromCompendium wins over everything — the asset never needs a page', () => {
    const hidden = { ...goblin, hideFromCompendium: true };
    expect(deriveAssetRow(hidden, emptyCtx({
      liveAssetIds: new Set(['goblin']),
      revealedAssetIds: new Set(['goblin']),
    })).slabState).toBe('hidden');
  });

  it('showcase is primed only once an attaching puzzle is published', () => {
    const ctx = emptyCtx({ showcasesByAsset: new Map([['goblin', ['demo-1']]]) });
    expect(deriveAssetRow(goblin, ctx).showcase).toBe('attached');
    const primed = emptyCtx({
      showcasesByAsset: new Map([['goblin', ['demo-1']]]),
      livePuzzleIds: new Set(['demo-1']),
    });
    expect(deriveAssetRow(goblin, primed).showcase).toBe('primed');
  });

  it('attributes column is null for types that cannot carry them', () => {
    expect(deriveAssetRow(goblin, emptyCtx()).hasAttributes).toBe(true);
    expect(deriveAssetRow({ id: 's', name: 'S', type: 'status_effect' }, emptyCtx()).hasAttributes).toBe(null);
    expect(deriveAssetRow({ id: 'v', name: 'V', type: 'vessel' }, emptyCtx()).hasAttributes).toBe(null);
  });
});

describe('derivePuzzleRow', () => {
  it('kind precedence: showcase > training > scheduled daily > unassigned', () => {
    const base = createTestPuzzle({});
    const schedule = new Map([['p1', { date: '2026-07-20', puzzleNumber: 4 }]]);
    const showcasey = createTestPuzzle({ isTraining: true, showcase: { entityIds: [], heroes: [] } });
    expect(derivePuzzleRow('p1', 'P', 'approved', showcasey, emptyCtx(), schedule).kind).toBe('showcase');
    expect(derivePuzzleRow('p1', 'P', 'approved', createTestPuzzle({ isTraining: true }), emptyCtx(), schedule).kind).toBe('training');
    expect(derivePuzzleRow('p1', 'P', 'approved', base, emptyCtx(), schedule).kind).toBe('daily');
    expect(derivePuzzleRow('p2', 'P', 'approved', base, emptyCtx(), schedule).kind).toBe('unassigned');
    const daily = derivePuzzleRow('p1', 'P', 'approved', base, emptyCtx(), schedule);
    expect(daily.scheduledDate).toBe('2026-07-20');
    expect(daily.puzzleNumber).toBe(4);
  });

  it('counts missing deps via the walker', () => {
    regEnemy(createTestEnemyDef({ id: 'imp', isCustom: true } as never));
    const puzzle = createTestPuzzle({
      availableCharacters: [],
      enemies: [
        createTestEnemy({ enemyId: 'imp', x: 1, y: 1 }),
        createTestEnemy({ enemyId: 'deleted-guy', x: 2, y: 1 }),
      ],
    });
    expect(derivePuzzleRow('p', 'P', 'draft', puzzle, emptyCtx(), new Map()).missingDeps).toBe(1);
  });
});

describe('buildShowcasesByAsset', () => {
  it('maps attachments and dedupes repeated puzzle ids', () => {
    const demo = createTestPuzzle({ showcase: { entityIds: ['goblin', 'burn'], heroes: [] } });
    demo.id = 'demo-1';
    const map = buildShowcasesByAsset([demo, demo, createTestPuzzle({})]);
    expect(map.get('goblin')).toEqual(['demo-1']);
    expect(map.get('burn')).toEqual(['demo-1']);
    expect(map.size).toBe(2);
  });
});
