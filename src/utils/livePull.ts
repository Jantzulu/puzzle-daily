/**
 * Player-app asset distribution — CLOSURE PREFETCH (2026-07-21, second
 * design round with the user; replaces the same-day boot pull-all).
 *
 * User goals this shape serves: no boot-time mirror of the whole library
 * (fast first paint, no localStorage ceiling race), and NOTHING undebuted
 * on a player device (no snooping — only revealed content and the current
 * daily's closure are ever fetched).
 *
 * The engine's loaders are synchronous and are called mid-simulation, so
 * the invariant is: before any board runs, its full transitive asset
 * closure must already be in the local stores. Each player-facing surface
 * gets ONE async choke point:
 *   - daily boot        → ensurePuzzleAssets(dailyPuzzle)
 *   - Slab / Training   → ensureAssetsLocal(revealedIds)  (via usePlayerReveal)
 *   - demo tap / arena  → ensurePuzzleAssets(thatPuzzle)
 * Inside the boundary everything stays synchronous. A player accumulates
 * only what they actually touch; per-id day-freshness re-fetches at most
 * once per local day so live edits still propagate.
 *
 * The editor app never calls any of this — team localStorage is the
 * working copy and must not be overwritten from live tables.
 */
import { supabase } from '../lib/supabase';
import type { DbAsset } from '../lib/supabase';
import { localDateKey } from './localDate';
import type { Puzzle } from '../types/game';
import { collectPuzzleAssetIds } from './publishDependencies';
import {
  saveTileType,
  saveObject,
  saveCharacter,
  saveEnemy,
  saveVessel,
  saveAlly,
  savePuzzleSkin,
  saveSpellAsset,
  saveStatusEffectAsset,
  saveCollectibleType,
  saveCollectible,
  saveSoundAsset,
  saveGlobalSoundConfig,
  saveGlobalHapticConfig,
  saveHelpSection,
  loadTileType,
  loadCollectible,
  loadObject,
  loadSpellAsset,
  loadStatusEffectAsset,
  loadVessel,
  loadAlly,
  getPuzzleSkins,
  getSoundAssets,
  type CustomTileType,
  type CustomObject,
  type CustomCharacter,
  type CustomEnemy,
  type CustomVessel,
  type CustomAlly,
  type CustomCollectibleType,
  type CustomCollectible,
  type HelpContentStorage,
} from './assetStorage';
import { getCharacter } from '../data/characters';
import { getEnemy } from '../data/enemies';
import type {
  PuzzleSkin,
  SpellAsset,
  StatusEffectAsset,
  SoundAsset,
  GlobalSoundConfig,
  GlobalHapticConfig,
} from '../types/game';

/** Fired on window after any ensure call that imported rows. */
export const LIVE_ASSETS_UPDATED_EVENT = 'live-assets-updated';

// Per-type importers, mirroring pullFromCloud's casts. Returns false on
// storage-full (the save fns' contract). Types with no player relevance
// (folder, hidden_assets — editor organization) and theme_settings (its own
// live fetch path in themeAssets.ts) are deliberately absent.
const IMPORTERS: Partial<Record<DbAsset['type'], (row: DbAsset) => boolean>> = {
  tile_type: r => saveTileType(r.data as unknown as CustomTileType),
  enemy: r => saveEnemy(r.data as unknown as CustomEnemy),
  vessel: r => saveVessel(r.data as unknown as CustomVessel),
  ally: r => saveAlly(r.data as unknown as CustomAlly),
  character: r => saveCharacter(r.data as unknown as CustomCharacter),
  object: r => saveObject(r.data as unknown as CustomObject),
  skin: r => {
    const skin = r.data as unknown as PuzzleSkin;
    return skin.isBuiltIn ? true : savePuzzleSkin(skin);
  },
  spell: r => saveSpellAsset(r.data as unknown as SpellAsset),
  status_effect: r => {
    const effect = r.data as unknown as StatusEffectAsset;
    return effect.isBuiltIn ? true : saveStatusEffectAsset(effect);
  },
  collectible_type: r => saveCollectibleType(r.data as unknown as CustomCollectibleType),
  collectible: r => saveCollectible(r.data as unknown as CustomCollectible),
  sound: r => {
    const sound = r.data as unknown as SoundAsset;
    return sound.isBuiltIn ? true : saveSoundAsset(sound);
  },
  global_sound_config: r =>
    r.id === 'global_sound_config' ? saveGlobalSoundConfig(r.data as unknown as GlobalSoundConfig) : true,
  global_haptic_config: r =>
    r.id === 'global_haptic_config' ? saveGlobalHapticConfig(r.data as unknown as GlobalHapticConfig) : true,
  help_content: r => {
    if (r.id !== 'help_content') return true;
    const helpData = r.data as unknown as HelpContentStorage;
    let ok = true;
    for (const section of helpData.sections ?? []) {
      if (!saveHelpSection(section)) ok = false;
    }
    return ok;
  },
};

/**
 * Is this id resolvable through the local stores (or shipped as a
 * builtin)? Same cascade shape as the publish walker's resolver — every
 * type the stamp/reveal vocabulary can produce, plus skins and sounds.
 */
function localAssetExists(id: string): boolean {
  if (loadVessel(id) || loadAlly(id) || getEnemy(id) || getCharacter(id)) return true;
  if (loadSpellAsset(id) || loadStatusEffectAsset(id) || loadTileType(id)) return true;
  if (loadCollectible(id) || loadObject(id)) return true;
  if (getPuzzleSkins().some(s => s.id === id)) return true;
  if (getSoundAssets().some(s => s.id === id)) return true;
  return false;
}

// Per-id freshness ledger: id → localDateKey of the last fetch. An id both
// present locally AND fetched today is skipped; present-but-stale ids are
// re-fetched once per local day so live edits reach players.
const FETCHED_KEY = 'puzzle-daily-live-asset-fetch-days';

function loadFetchLedger(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(FETCHED_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function saveFetchLedger(ledger: Record<string, string>): void {
  try {
    localStorage.setItem(FETCHED_KEY, JSON.stringify(ledger));
  } catch {
    // best-effort — worst case we re-fetch tomorrow
  }
}

/**
 * Which of these ids need a cloud fetch right now (exported for tests):
 *  - not resolvable locally → fetch;
 *  - resolvable AND the ledger says WE fetched it from live on a previous
 *    day → re-fetch (live edits propagate daily);
 *  - resolvable with NO ledger entry → skip. This last rule is a safety
 *    invariant, not an optimization: on the EDITOR app the local stores are
 *    the team's working copy (never ledgered), and ensure calls that reach
 *    it (demo tap, daily effect) must NEVER overwrite local edits with the
 *    live copy.
 */
export function filterAssetIdsNeedingFetch(ids: readonly string[], ledger?: Record<string, string>): string[] {
  const led = ledger ?? loadFetchLedger();
  const today = localDateKey();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (localAssetExists(id) && (led[id] === undefined || led[id] === today)) continue;
    out.push(id);
  }
  return out;
}

/** Batched `.in()` row fetch — injectable for tests. */
export type FetchAssetRows = (ids: string[]) => Promise<DbAsset[] | null>;

const fetchAssetRowsFromLive: FetchAssetRows = async (ids) => {
  const BATCH = 200;
  const rows: DbAsset[] = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const { data, error } = await supabase
      .from('assets_live')
      .select('*')
      .in('id', ids.slice(i, i + BATCH));
    if (error) {
      console.warn("Couldn't fetch live assets:", error.message);
      return null;
    }
    rows.push(...(data ?? []));
  }
  return rows;
};

export interface EnsureResult {
  status: 'ok' | 'error';
  imported: number;
}

/**
 * Make these asset ids resolvable through the local stores, fetching any
 * missing/stale ones from assets_live. Ids absent from assets_live (never
 * published, or builtin) are simply skipped — the ledger still stamps them
 * so they aren't re-queried all day. Returns 'error' only on fetch failure
 * (offline): callers keep working with whatever is already local.
 */
export async function ensureAssetsLocal(
  ids: readonly string[],
  fetchRows: FetchAssetRows = fetchAssetRowsFromLive,
): Promise<EnsureResult> {
  const needed = filterAssetIdsNeedingFetch(ids);
  if (needed.length === 0) return { status: 'ok', imported: 0 };

  const rows = await fetchRows(needed);
  if (rows === null) return { status: 'error', imported: 0 };

  let imported = 0;
  for (const row of rows) {
    const importer = IMPORTERS[row.type];
    if (!importer) continue;
    try {
      if (importer(row)) imported++;
    } catch {
      // storage full / malformed row — best-effort
    }
  }

  const ledger = loadFetchLedger();
  const today = localDateKey();
  for (const id of needed) ledger[id] = today;
  saveFetchLedger(ledger);

  if (imported > 0 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(LIVE_ASSETS_UPDATED_EVENT));
  }
  return { status: 'ok', imported };
}

/**
 * Ensure a puzzle's FULL transitive closure is local before its board runs.
 * Stamped puzzles (publishedAssetIds, written at publish) are one ensure
 * call. Unstamped legacy rows fall back to a client-side FIXPOINT: walk the
 * puzzle with whatever is local (unresolvable refs still surface their
 * ids), fetch those, and re-walk — each round can only discover deeper
 * transitive refs, so it terminates; ROUND_CAP is a safety net.
 */
export async function ensurePuzzleAssets(
  puzzle: Puzzle,
  fetchRows: FetchAssetRows = fetchAssetRowsFromLive,
): Promise<EnsureResult> {
  if (puzzle.publishedAssetIds && puzzle.publishedAssetIds.length > 0) {
    return ensureAssetsLocal(puzzle.publishedAssetIds, fetchRows);
  }

  const ROUND_CAP = 6;
  let importedTotal = 0;
  let known = new Set<string>();
  for (let round = 0; round < ROUND_CAP; round++) {
    const ids = Array.from(collectPuzzleAssetIds(puzzle).keys());
    const fresh = ids.filter(id => !known.has(id));
    known = new Set(ids);
    if (round > 0 && fresh.length === 0) break; // fixpoint reached
    const result = await ensureAssetsLocal(ids, fetchRows);
    if (result.status === 'error') return { status: 'error', imported: importedTotal };
    importedTotal += result.imported;
    if (result.imported === 0 && round > 0) break; // nothing new arrived
  }
  return { status: 'ok', imported: importedTotal };
}
