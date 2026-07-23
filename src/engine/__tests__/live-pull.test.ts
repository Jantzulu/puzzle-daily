/**
 * Closure-prefetch pins (2026-07-21 round 2 — replaced the boot pull-all):
 * the ledger safety rule that protects editor working copies, and the
 * client-side fixpoint that fetches an UNSTAMPED puzzle's transitive
 * closure round by round (walk → fetch what surfaced → re-walk).
 */
import './helpers';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearAllRegistries,
  registerTestEnemy as regEnemy,
  createTestPuzzle,
  createTestEnemyDef,
  createTestEnemy,
} from './helpers';
import { ActionType, Direction } from '../../types/game';
import type { DbAsset } from '../../lib/supabase';
import {
  filterAssetIdsNeedingFetch,
  ensurePuzzleAssets,
  type FetchAssetRows,
} from '../../utils/livePull';
import { localDateKey } from '../../utils/localDate';

beforeEach(() => {
  clearAllRegistries();
});

const enemyRow = (id: string, data: object): DbAsset => ({
  id, type: 'enemy', name: id, data,
  status: 'published', created_at: '', updated_at: '',
});
const spellRow = (id: string, data: object): DbAsset => ({
  id, type: 'spell', name: id, data,
  status: 'published', created_at: '', updated_at: '',
});

describe('filterAssetIdsNeedingFetch (ledger safety rule)', () => {
  it('locally-present ids with NO ledger entry are never fetched — editor working copies stay untouched', () => {
    regEnemy(createTestEnemyDef({ id: 'imp', isCustom: true } as never));
    expect(filterAssetIdsNeedingFetch(['imp'], {})).toEqual([]);
  });

  it('missing ids fetch; ledgered-stale ids re-fetch; ledgered-today ids skip', () => {
    regEnemy(createTestEnemyDef({ id: 'imp', isCustom: true } as never));
    const today = localDateKey();
    expect(filterAssetIdsNeedingFetch(['ghost'], {})).toEqual(['ghost']);
    expect(filterAssetIdsNeedingFetch(['imp'], { imp: '2020-01-01' })).toEqual(['imp']);
    expect(filterAssetIdsNeedingFetch(['imp'], { imp: today })).toEqual([]);
    expect(filterAssetIdsNeedingFetch(['imp', 'imp', 'ghost', ''], { imp: today })).toEqual(['ghost']);
  });
});

describe('ensurePuzzleAssets', () => {
  it('unstamped puzzle: fixpoint walks/fetches transitive closure round by round', async () => {
    // Nothing local. Cloud has: imp → casts firebolt → applies burn.
    const cloud: Record<string, DbAsset> = {
      imp: enemyRow('imp', createTestEnemyDef({
        id: 'imp',
        isCustom: true,
        behavior: { type: 'active', pattern: [{ type: ActionType.SPELL, spellId: 'firebolt' }], defaultFacing: Direction.EAST },
      } as never) as unknown as object),
      firebolt: spellRow('firebolt', { id: 'firebolt', name: 'Firebolt', appliesStatusEffect: { statusAssetId: 'burn' } }),
      burn: { id: 'burn', type: 'status_effect', name: 'burn', data: { id: 'burn', name: 'Burn', type: 'damage_over_time', createdAt: '' }, status: 'published', created_at: '', updated_at: '' },
    };
    const calls: string[][] = [];
    const fetchRows: FetchAssetRows = async (ids) => {
      calls.push([...ids].sort());
      return ids.map(id => cloud[id]).filter(Boolean);
    };

    const puzzle = createTestPuzzle({
      availableCharacters: [],
      enemies: [createTestEnemy({ enemyId: 'imp', x: 1, y: 1 })],
    });
    const result = await ensurePuzzleAssets(puzzle, fetchRows);

    expect(result.status).toBe('ok');
    expect(result.imported).toBe(3);
    // Round 1 sees only the direct ref; deeper refs surface as their
    // parents arrive.
    expect(calls[0]).toEqual(['imp']);
    expect(calls.flat()).toContain('firebolt');
    expect(calls.flat()).toContain('burn');
    // Fixpoint terminated on its own, well under the round cap.
    expect(calls.length).toBeLessThanOrEqual(4);
  });

  it('stamped puzzle: one ensure over the stamp, no walking', async () => {
    const cloud: Record<string, DbAsset> = {
      imp: enemyRow('imp', createTestEnemyDef({ id: 'imp', isCustom: true } as never) as unknown as object),
      firebolt: spellRow('firebolt', { id: 'firebolt', name: 'Firebolt' }),
    };
    const calls: string[][] = [];
    const fetchRows: FetchAssetRows = async (ids) => {
      calls.push([...ids].sort());
      return ids.map(id => cloud[id]).filter(Boolean);
    };

    const puzzle = createTestPuzzle({ availableCharacters: [], publishedAssetIds: ['firebolt', 'imp'] });
    const result = await ensurePuzzleAssets(puzzle, fetchRows);

    expect(result.status).toBe('ok');
    expect(calls).toEqual([['firebolt', 'imp']]);
  });

  it('fetch failure reports error without importing', async () => {
    const puzzle = createTestPuzzle({ availableCharacters: [], publishedAssetIds: ['imp'] });
    const result = await ensurePuzzleAssets(puzzle, async () => null);
    expect(result).toEqual({ status: 'error', imported: 0 });
  });
});
