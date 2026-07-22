/**
 * The Slab reveal predicate (design locked 2026-07-21): one shared rule for
 * every player-facing asset surface. revealSet null = dev app, no gating at
 * all; empty set = player app with nothing released; builtins (explicit
 * flags only) always pass; everything else needs membership. A missing
 * isCustom/isBuiltIn flag must read as "custom" — statuses only carry
 * isBuiltIn, so a lenient default would leak unreleased assets.
 */
import { isAssetRevealed } from '../../utils/reveal';

describe('isAssetRevealed (shared Slab/Training reveal predicate)', () => {
  const released = new Set(['goblin', 'firebolt']);

  it('dev app (null set) gates nothing, not even hideFromCompendium', () => {
    expect(isAssetRevealed({ id: 'wip-boss' }, null)).toBe(true);
    expect(isAssetRevealed({ id: 'variant', hideFromCompendium: true }, null)).toBe(true);
  });

  it('player app: membership decides customs, hideFromCompendium overrides', () => {
    expect(isAssetRevealed({ id: 'goblin', isCustom: true }, released)).toBe(true);
    expect(isAssetRevealed({ id: 'wip-boss', isCustom: true }, released)).toBe(false);
    expect(isAssetRevealed({ id: 'goblin', isCustom: true, hideFromCompendium: true }, released)).toBe(false);
  });

  it('missing flags read as custom (statuses carry only isBuiltIn)', () => {
    expect(isAssetRevealed({ id: 'unreleased-status' }, released)).toBe(false);
    expect(isAssetRevealed({ id: 'firebolt' }, released)).toBe(true);
  });

  it('explicit builtins always pass, even against an empty set', () => {
    const nothing = new Set<string>();
    expect(isAssetRevealed({ id: 'stun', isBuiltIn: true }, nothing)).toBe(true);
    expect(isAssetRevealed({ id: 'knight', isCustom: false }, nothing)).toBe(true);
    expect(isAssetRevealed({ id: 'goblin', isCustom: true }, nothing)).toBe(false);
  });
});
