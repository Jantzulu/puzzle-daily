/**
 * Sounds ride with a published puzzle (2026-11-13).
 *
 * The publish walker followed spells, statuses, drops and summons but no
 * sound of any kind, and the global sound settings belong to no puzzle, so
 * nothing audible was ever published and the player site was silent. These
 * pin every route a sound can be referenced by, and that a player device
 * imports what the stamp names.
 */
import './helpers';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearAllRegistries,
  registerTestEnemy as regEnemy,
  registerTestCharacter as regChar,
  registerTestSpell as regSpell,
  registerTestCollectible as regCol,
  registerTestSound as regSound,
  setTestGlobalSoundConfig,
  createTestPuzzle,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestEnemy,
  createTestCollectible,
} from './helpers';
import { ActionType, Direction } from '../../types/game';
import type { DbAsset } from '../../lib/supabase';
import { collectPuzzleAssetIds, stampPublishedAssetIds, GLOBAL_SOUND_CONFIG_ID } from '../../utils/publishDependencies';
import { ensurePuzzleAssets, type FetchAssetRows } from '../../utils/livePull';
import { getGlobalSoundConfig, loadSoundAsset } from '../../utils/assetStorage';

const sound = (id: string, extra: object = {}) => ({ id, name: id, audioUrl: `https://example.test/${id}.mp3`, createdAt: '', ...extra });

beforeEach(() => {
  clearAllRegistries();
});

describe('published closure includes sounds', () => {
  it('follows a spell to its cast and hit sounds', () => {
    regSound(sound('whoosh'));
    regSound(sound('thud'));
    regSpell('firebolt', { id: 'firebolt', name: 'Firebolt', castSound: 'whoosh', hitSound: 'thud' });
    regEnemy(createTestEnemyDef({
      id: 'imp',
      isCustom: true,
      behavior: { type: 'active', pattern: [{ type: ActionType.SPELL, spellId: 'firebolt' }], defaultFacing: Direction.EAST },
    } as never));
    const deps = collectPuzzleAssetIds(createTestPuzzle({ enemies: [createTestEnemy({ enemyId: 'imp', x: 1, y: 1 })] }));
    expect(deps.get('whoosh')?.type).toBe('sound');
    expect(deps.get('thud')?.type).toBe('sound');
  });

  it("follows a hero's and an enemy's own sounds", () => {
    regSound(sound('ouch'));
    regSound(sound('argh'));
    regSound(sound('squeak'));
    regChar(createTestCharacterDef({ id: 'knight', isCustom: true, sounds: { damageTaken: 'ouch', death: 'argh' } } as never));
    regEnemy(createTestEnemyDef({ id: 'rat', isCustom: true, sounds: { death: 'squeak' } } as never));
    const deps = collectPuzzleAssetIds(createTestPuzzle({
      availableCharacters: ['knight'],
      enemies: [createTestEnemy({ enemyId: 'rat', x: 1, y: 1 })],
    }));
    expect([...deps.keys()].filter(id => deps.get(id)?.type === 'sound').sort()).toEqual(['argh', 'ouch', 'squeak']);
  });

  it("follows a collectible's pickup sound and the puzzle's own music", () => {
    regSound(sound('chime'));
    regSound(sound('crypt-theme'));
    regCol('coin', { id: 'coin', name: 'Coin', effects: [], isCustom: true, pickupSound: 'chime' });
    const deps = collectPuzzleAssetIds(createTestPuzzle({
      collectibles: [createTestCollectible({ type: undefined, collectibleId: 'coin', x: 2, y: 2, collected: false })],
      backgroundMusicId: 'crypt-theme',
    }));
    expect(deps.get('chime')?.type).toBe('sound');
    expect(deps.get('crypt-theme')).toEqual({ type: 'sound', name: 'crypt-theme', isMissing: false });
  });

  it('every puzzle carries the global sound settings and the sounds they name', () => {
    regSound(sound('castle-theme'));
    regSound(sound('fanfare'));
    setTestGlobalSoundConfig({ backgroundMusic: 'castle-theme', victory: 'fanfare' });
    const deps = collectPuzzleAssetIds(createTestPuzzle({}));
    expect(deps.get(GLOBAL_SOUND_CONFIG_ID)?.type).toBe('global_sound_config');
    expect(deps.get('castle-theme')?.type).toBe('sound');
    expect(deps.get('fanfare')?.type).toBe('sound');
  });

  it('adds nothing when no global sounds are set', () => {
    expect(collectPuzzleAssetIds(createTestPuzzle({})).has(GLOBAL_SOUND_CONFIG_ID)).toBe(false);
  });

  it('a deleted sound never blocks a publish: it is skipped, like a built-in', () => {
    regSound(sound('stock-click', { isBuiltIn: true }));
    setTestGlobalSoundConfig({ buttonClick: 'stock-click', victory: 'deleted-fanfare' });
    const puzzle = createTestPuzzle({});
    const deps = collectPuzzleAssetIds(puzzle);
    expect(deps.has('deleted-fanfare')).toBe(false);
    expect(deps.has('stock-click')).toBe(false);
    expect(stampPublishedAssetIds(puzzle).publishedAssetIds).toEqual([GLOBAL_SOUND_CONFIG_ID]);
  });
});

describe('a player device receives the sounds a stamp names', () => {
  it('imports the settings row and its sounds, and then stops asking', async () => {
    const rows: DbAsset[] = [
      { id: GLOBAL_SOUND_CONFIG_ID, type: 'global_sound_config', name: 'Global Sound Config', data: { backgroundMusic: 'castle-theme' }, status: 'published', created_at: '', updated_at: '' },
      { id: 'castle-theme', type: 'sound', name: 'castle-theme', data: sound('castle-theme'), status: 'published', created_at: '', updated_at: '' },
    ];
    const asked: string[][] = [];
    const fetchRows: FetchAssetRows = async ids => {
      asked.push([...ids].sort());
      return rows.filter(r => ids.includes(r.id));
    };
    const puzzle = createTestPuzzle({ publishedAssetIds: ['castle-theme', GLOBAL_SOUND_CONFIG_ID] });

    const first = await ensurePuzzleAssets(puzzle, fetchRows);
    expect(first).toEqual({ status: 'ok', imported: 2 });
    expect(getGlobalSoundConfig()).toEqual({ backgroundMusic: 'castle-theme' });
    expect(loadSoundAsset('castle-theme')?.audioUrl).toBe('https://example.test/castle-theme.mp3');

    // Both are local and fetched today: a second boot asks for nothing.
    await ensurePuzzleAssets(puzzle, fetchRows);
    expect(asked).toEqual([['castle-theme', GLOBAL_SOUND_CONFIG_ID].sort()]);
  });
});
