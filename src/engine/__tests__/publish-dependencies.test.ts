/**
 * Transitive publish-dependency walker (hardened 2026-07-21) — pins that
 * collectPuzzleAssetIds follows the FULL reference graph, not just direct
 * placements: spells applied statuses, death drops, vessel contents,
 * summons, and showcase attachments. A published puzzle must carry every
 * asset a player's device needs.
 */
import './helpers';
import {
  clearAllRegistries,
  registerTestCharacter as regChar,
  registerTestEnemy as regEnemy,
  registerTestVessel as regVessel,
  registerTestCollectible as regCol,
  registerTestSpell as regSpell,
  registerTestStatusEffect as regStatus,
  createTestPuzzle,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestEnemy,
  createTestCollectible,
} from './helpers';
import { ActionType, Direction } from '../../types/game';
import { collectPuzzleAssetIds, stampPublishedAssetIds } from '../../utils/publishDependencies';

beforeEach(() => {
  clearAllRegistries();
});

describe('collectPuzzleAssetIds (transitive publish deps)', () => {
  it('follows enemy → spell → applied status, and enemy → death drop', () => {
    regStatus('burn', { id: 'burn', name: 'Burn', type: 'damage_over_time', createdAt: '' });
    regSpell('firebolt', { id: 'firebolt', name: 'Firebolt', appliesStatusEffect: { statusAssetId: 'burn' } });
    regCol('ember', { id: 'ember', name: 'Ember', effects: [], isCustom: true });
    regEnemy(createTestEnemyDef({
      id: 'imp',
      isCustom: true,
      behavior: { type: 'active', pattern: [{ type: ActionType.SPELL, spellId: 'firebolt' }], defaultFacing: Direction.EAST },
      droppedCollectibleId: 'ember',
    } as never));
    const deps = collectPuzzleAssetIds(createTestPuzzle({
      enemies: [createTestEnemy({ enemyId: 'imp', x: 1, y: 1 })],
    }));
    expect(deps.get('imp')?.type).toBe('enemy');
    expect(deps.get('firebolt')?.type).toBe('spell');
    expect(deps.get('burn')?.type).toBe('status_effect');
    expect(deps.get('ember')?.type).toBe('collectible');
  });

  it('follows a placed vessel to its nested transform enemy', () => {
    regEnemy(createTestEnemyDef({ id: 'hatchling', isCustom: true } as never));
    regVessel({ id: 'egg', name: 'Egg', health: 1, transformEnemyId: 'hatchling', isCustom: true, createdAt: '' });
    const deps = collectPuzzleAssetIds(createTestPuzzle({
      enemies: [createTestEnemy({ enemyId: 'egg', x: 1, y: 1 })],
    }));
    expect(deps.get('egg')?.type).toBe('vessel');
    expect(deps.get('hatchling')?.type).toBe('enemy');
  });

  it('follows summon spells to the summoned enemy asset', () => {
    regEnemy(createTestEnemyDef({ id: 'skeleton', isCustom: true } as never));
    regSpell('raise', { id: 'raise', name: 'Raise', summonEnemyId: 'skeleton' });
    regChar(createTestCharacterDef({
      id: 'necromancer',
      isCustom: true,
      behavior: [{ type: ActionType.SPELL, spellId: 'raise' }],
    } as never));
    const deps = collectPuzzleAssetIds(createTestPuzzle({
      availableCharacters: ['necromancer'],
    }));
    expect(deps.get('necromancer')?.type).toBe('character');
    expect(deps.get('raise')?.type).toBe('spell');
    expect(deps.get('skeleton')?.type).toBe('enemy');
  });

  it('includes showcase attach targets and showcase heroes', () => {
    regStatus('haste', { id: 'haste', name: 'Haste', type: 'haste', createdAt: '' });
    regChar(createTestCharacterDef({ id: 'runner', isCustom: true } as never));
    const deps = collectPuzzleAssetIds(createTestPuzzle({
      availableCharacters: ['runner'],
      showcase: { entityIds: ['haste'], heroes: [{ characterId: 'runner', x: 2, y: 2 }] },
    }));
    expect(deps.get('haste')?.type).toBe('status_effect');
    expect(deps.get('runner')?.type).toBe('character');
  });

  it('marks deleted assets missing, skips builtin statuses, includes placed items', () => {
    regStatus('holy', { id: 'holy', name: 'Holy', type: 'shield', createdAt: '', isBuiltIn: true });
    regSpell('bless', { id: 'bless', name: 'Bless', appliesStatusEffect: { statusAssetId: 'holy' } });
    regChar(createTestCharacterDef({
      id: 'cleric',
      isCustom: true,
      behavior: [{ type: ActionType.SPELL, spellId: 'bless' }],
    } as never));
    regCol('coinpile', { id: 'coinpile', name: 'Coin Pile', effects: [], isCustom: true });
    const deps = collectPuzzleAssetIds(createTestPuzzle({
      availableCharacters: ['cleric'],
      collectibles: [
        createTestCollectible({ type: undefined, collectibleId: 'coinpile', x: 3, y: 3, collected: false }),
        createTestCollectible({ type: undefined, collectibleId: 'deleted-item', x: 4, y: 3, collected: false }),
      ],
    }));
    expect(deps.get('holy')).toBeUndefined();          // builtin — ships with the app
    expect(deps.get('bless')?.type).toBe('spell');
    expect(deps.get('coinpile')?.type).toBe('collectible');
    expect(deps.get('deleted-item')?.isMissing).toBe(true);
  });

  it('stampPublishedAssetIds writes the sorted non-missing id list, leaving the input untouched', () => {
    regStatus('burn', { id: 'burn', name: 'Burn', type: 'damage_over_time', createdAt: '' });
    regSpell('firebolt', { id: 'firebolt', name: 'Firebolt', appliesStatusEffect: { statusAssetId: 'burn' } });
    regEnemy(createTestEnemyDef({
      id: 'imp',
      isCustom: true,
      behavior: { type: 'active', pattern: [{ type: ActionType.SPELL, spellId: 'firebolt' }], defaultFacing: Direction.EAST },
    } as never));
    const puzzle = createTestPuzzle({
      enemies: [createTestEnemy({ enemyId: 'imp', x: 1, y: 1 })],
      collectibles: [createTestCollectible({ type: undefined, collectibleId: 'deleted-item', x: 4, y: 3, collected: false })],
    });
    const stamped = stampPublishedAssetIds(puzzle);
    // Sorted, transitive, and the missing ref is excluded — a deleted asset
    // must never count toward a Slab reveal.
    expect(stamped.publishedAssetIds).toEqual(['burn', 'firebolt', 'imp']);
    // Pure: the draft puzzle object is never mutated (stamps live only on
    // the published copy).
    expect(puzzle.publishedAssetIds).toBeUndefined();
  });
});
