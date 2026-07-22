/**
 * Player-app live asset pull (showcase-distribution arc, 2026-07-21).
 *
 * A real player's device has no editor and no cloud-sync UI — until this
 * existed, players received ONLY the daily's puzzle JSON, which references
 * assets by id, so custom enemies/spells/items could never resolve. This
 * module mirrors assets_live into the same localStorage-backed stores the
 * whole app already reads (loaders, Slab, Training Grounds, showcase sims),
 * so no consumer needed to change.
 *
 * Deliberate semantics:
 * - Upsert-only mirror: absent-from-live assets are NOT deleted locally.
 *   Unpublished assets linger harmlessly — every player surface is gated by
 *   the reveal predicate, and a deletion pass keyed off "absent from a
 *   fetched page" would mass-delete on any partial fetch.
 * - Once per local day (mirrors dailyPuzzleCache's rollover), force-able.
 * - Editor app NEVER calls this — the editor's localStorage is the team's
 *   working copy; clobbering it from live would lose unpushed edits.
 */
import { supabase } from '../lib/supabase';
import type { DbAsset } from '../lib/supabase';
import { localDateKey } from './localDate';
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
import type {
  PuzzleSkin,
  SpellAsset,
  StatusEffectAsset,
  SoundAsset,
  GlobalSoundConfig,
  GlobalHapticConfig,
} from '../types/game';

const PULLED_KEY = 'puzzle-daily-live-assets-pulled';
/** Fired on window after a successful pull so mounted lists can refresh. */
export const LIVE_ASSETS_UPDATED_EVENT = 'live-assets-updated';

export function hasEverPulledLiveAssets(): boolean {
  try {
    return localStorage.getItem(PULLED_KEY) !== null;
  } catch {
    return false;
  }
}

// Supabase caps a select at 1000 rows — page so a growing asset library
// never silently truncates the mirror.
const PAGE_SIZE = 1000;

async function fetchAllLiveAssetRows(): Promise<DbAsset[] | null> {
  const rows: DbAsset[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('assets_live')
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.warn("Couldn't fetch live assets:", error.message);
      return null;
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

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

export interface LivePullResult {
  status: 'ok' | 'skipped' | 'error';
  imported: number;
  failed: number;
}

export async function pullLiveAssets(opts?: { force?: boolean }): Promise<LivePullResult> {
  try {
    if (!opts?.force && localStorage.getItem(PULLED_KEY) === localDateKey()) {
      return { status: 'skipped', imported: 0, failed: 0 };
    }
  } catch {
    // localStorage unavailable — still try the fetch; imports will no-op.
  }

  const rows = await fetchAllLiveAssetRows();
  if (rows === null) return { status: 'error', imported: 0, failed: 0 };

  let imported = 0;
  let failed = 0;
  for (const row of rows) {
    const importer = IMPORTERS[row.type];
    if (!importer) continue;
    try {
      if (importer(row)) imported++;
      else failed++; // storage full
    } catch {
      failed++;
    }
  }

  try {
    localStorage.setItem(PULLED_KEY, localDateKey());
  } catch {
    // best-effort — worst case we re-pull next boot
  }
  if (failed > 0) console.warn(`Live asset pull: ${failed} asset(s) failed to import (storage full?)`);
  window.dispatchEvent(new Event(LIVE_ASSETS_UPDATED_EVENT));
  return { status: 'ok', imported, failed };
}
