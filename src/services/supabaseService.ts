import { supabase } from '../lib/supabase';
import type { DbPuzzle, DbAsset } from '../lib/supabase';
import { logActivity } from './activityLogService';
import { localDateKey } from '../utils/localDate';
import { stampPublishedAssetIds, collectPuzzleAssetIds } from '../utils/publishDependencies';
import type { LiveContent } from '../utils/liveContentCache';

async function getCurrentUserId(): Promise<string | undefined> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id;
}
import type { Puzzle, PuzzleSkin, SpellAsset } from '../types/game';
import type { CustomTileType, CustomObject } from '../utils/assetStorage';
import type { EnemyWithSprite } from '../data/enemies';
import type { CharacterWithSprite } from '../data/characters';

// ============================================
// PUZZLE OPERATIONS
// ============================================

export async function fetchAllPuzzles(includeDeleted: boolean = false): Promise<DbPuzzle[]> {
  let query = supabase
    .from('puzzles_draft')
    .select('*')
    .order('updated_at', { ascending: false });

  // For sync purposes, we need all items including deleted
  // For display purposes, we filter out deleted items
  if (!includeDeleted) {
    query = query.is('deleted_at', null);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[Supabase] Error fetching puzzles:', error);
    return [];
  }
  return data || [];
}

export async function fetchPuzzle(id: string): Promise<DbPuzzle | null> {
  const { data, error } = await supabase
    .from('puzzles_draft')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching puzzle:', error);
    return null;
  }
  return data;
}

export async function savePuzzleToCloud(puzzle: Puzzle, name?: string): Promise<boolean> {
  const userId = await getCurrentUserId();
  const dbPuzzle: Partial<DbPuzzle> = {
    id: puzzle.id,
    name: name || puzzle.name || 'Untitled Puzzle',
    data: puzzle as unknown as object,
    status: 'draft',
    updated_at: new Date().toISOString(),
    ...(userId && { created_by: userId }),
  };


  const { error, data: _data } = await supabase
    .from('puzzles_draft')
    .upsert(dbPuzzle, { onConflict: 'id' })
    .select();

  if (error) {
    console.error('[Supabase] Error saving puzzle:', error);
    return false;
  }
  logActivity({ action: 'update', asset_type: 'puzzle', asset_id: puzzle.id, asset_name: dbPuzzle.name });
  return true;
}

export async function deletePuzzleFromCloud(id: string): Promise<boolean> {
  // Soft delete: set deleted_at timestamp instead of removing row
  const { error } = await supabase
    .from('puzzles_draft')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Error deleting puzzle:', error);
    return false;
  }
  logActivity({ action: 'delete', asset_type: 'puzzle', asset_id: id });
  return true;
}

export async function updatePuzzleStatus(id: string, status: DbPuzzle['status']): Promise<boolean> {
  const { error } = await supabase
    .from('puzzles_draft')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Error updating puzzle status:', error);
    return false;
  }
  return true;
}

// ============================================
// REVIEW WORKFLOW
// ============================================

export async function submitPuzzleForReview(id: string, name?: string): Promise<boolean> {
  const success = await updatePuzzleStatus(id, 'pending_review');
  if (success) {
    logActivity({ action: 'submit_review', asset_type: 'puzzle', asset_id: id, asset_name: name });
  }
  return success;
}

export async function approvePuzzle(id: string, name?: string, notes?: string): Promise<boolean> {
  const success = await updatePuzzleStatus(id, 'approved');
  if (success) {
    logActivity({ action: 'approve', asset_type: 'puzzle', asset_id: id, asset_name: name, details: notes ? { notes } : undefined });
  }
  return success;
}

export async function requestPuzzleChanges(id: string, name?: string, notes?: string): Promise<boolean> {
  const success = await updatePuzzleStatus(id, 'draft');
  if (success) {
    logActivity({ action: 'request_changes', asset_type: 'puzzle', asset_id: id, asset_name: name, details: notes ? { notes } : undefined });
  }
  return success;
}

// ============================================
// ASSET OPERATIONS
// ============================================

type AssetType = 'tile_type' | 'enemy' | 'vessel' | 'ally' | 'character' | 'object' | 'skin' | 'spell' | 'status_effect' | 'folder' | 'collectible_type' | 'collectible' | 'hidden_assets' | 'sound' | 'global_sound_config' | 'global_haptic_config' | 'help_content' | 'theme_settings';
type AssetData = CustomTileType | EnemyWithSprite | CharacterWithSprite | CustomObject | PuzzleSkin | SpellAsset | object;

export async function fetchAllAssets(type?: AssetType, includeDeleted: boolean = false): Promise<DbAsset[]> {
  let query = supabase
    .from('assets_draft')
    .select('*')
    .order('updated_at', { ascending: false });

  if (type) {
    query = query.eq('type', type);
  }

  // For sync purposes, we need all items including deleted
  // For display purposes, we filter out deleted items
  if (!includeDeleted) {
    query = query.is('deleted_at', null);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching assets:', error);
    return [];
  }
  return data || [];
}

export async function fetchAsset(id: string): Promise<DbAsset | null> {
  const { data, error } = await supabase
    .from('assets_draft')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching asset:', error);
    return null;
  }
  return data;
}

export async function saveAssetToCloud(
  id: string,
  type: AssetType,
  name: string,
  data: AssetData
): Promise<boolean> {
  const userId = await getCurrentUserId();
  const dbAsset: Partial<DbAsset> = {
    id,
    type,
    name,
    data: data as unknown as object,
    status: 'draft',
    updated_at: new Date().toISOString(),
    ...(userId && { created_by: userId }),
  };

  const { error } = await supabase
    .from('assets_draft')
    .upsert(dbAsset, { onConflict: 'id' });

  if (error) {
    console.error('Error saving asset:', error);
    return false;
  }
  logActivity({ action: 'update', asset_type: type, asset_id: id, asset_name: name });
  return true;
}

export async function deleteAssetFromCloud(id: string): Promise<boolean> {
  // Soft delete: set deleted_at timestamp instead of removing row
  const { error } = await supabase
    .from('assets_draft')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Error deleting asset:', error);
    return false;
  }
  logActivity({ action: 'delete', asset_type: 'asset', asset_id: id });
  return true;
}

// ============================================
// PUBLISH OPERATIONS (Draft -> Live)
// ============================================

export async function publishPuzzle(puzzleId: string, scheduledDate?: string): Promise<boolean> {
  // First, get the puzzle from draft
  const puzzle = await fetchPuzzle(puzzleId);
  if (!puzzle) {
    console.error('Puzzle not found:', puzzleId);
    return false;
  }

  // Publish guard: only approved puzzles can be published
  if (puzzle.status !== 'approved' && puzzle.status !== 'published') {
    console.error('Cannot publish: puzzle must be approved first. Current status:', puzzle.status);
    return false;
  }

  // Insert into live table. The live copy (and only the live copy) carries
  // the publishedAssetIds stamp — computed here on the editor device, where
  // the walker can resolve every local asset (see stampPublishedAssetIds).
  const { error: liveError } = await supabase
    .from('puzzles_live')
    .upsert({
      id: puzzle.id,
      name: puzzle.name,
      data: stampPublishedAssetIds(puzzle.data as unknown as Puzzle),
      published_at: new Date().toISOString(),
      scheduled_date: scheduledDate || null,
      is_daily: !!scheduledDate,
      is_archived: false,
      is_premium: false,
    }, { onConflict: 'id' });

  if (liveError) {
    console.error('Error publishing puzzle to live:', liveError);
    return false;
  }

  // Update draft status
  await updatePuzzleStatus(puzzleId, 'published');
  logActivity({ action: 'publish', asset_type: 'puzzle', asset_id: puzzleId, asset_name: puzzle.name, details: { scheduled_date: scheduledDate } });

  // If scheduled as daily, add to schedule
  if (scheduledDate) {
    const { error: scheduleError } = await supabase
      .from('daily_schedule')
      .upsert({
        puzzle_id: puzzleId,
        scheduled_date: scheduledDate,
      }, { onConflict: 'scheduled_date' });

    if (scheduleError) {
      console.error('Error scheduling puzzle:', scheduleError);
      // Don't return false - puzzle is still published, just not scheduled
    }
  }

  return true;
}

export async function publishAsset(assetId: string): Promise<boolean> {
  // Get the asset from draft
  const asset = await fetchAsset(assetId);
  if (!asset) {
    console.error('Asset not found:', assetId);
    return false;
  }

  // Insert into live table
  const { error: liveError } = await supabase
    .from('assets_live')
    .upsert({
      id: asset.id,
      type: asset.type,
      name: asset.name,
      data: asset.data,
      published_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (liveError) {
    console.error('Error publishing asset to live:', liveError);
    return false;
  }

  // Update draft status
  const { error: updateError } = await supabase
    .from('assets_draft')
    .update({ status: 'published', updated_at: new Date().toISOString() })
    .eq('id', assetId);

  if (updateError) {
    console.error('Error updating asset status:', updateError);
  }

  logActivity({ action: 'publish', asset_type: asset.type, asset_id: assetId, asset_name: asset.name });
  return true;
}

// ============================================
// UNPUBLISH OPERATIONS (Live -> Draft)
// ============================================

export async function unpublishPuzzle(puzzleId: string): Promise<boolean> {
  // Remove from daily_schedule first (FK constraint)
  await supabase
    .from('daily_schedule')
    .delete()
    .eq('puzzle_id', puzzleId);

  // Delete from live table
  const { error: liveError } = await supabase
    .from('puzzles_live')
    .delete()
    .eq('id', puzzleId);

  if (liveError) {
    console.error('Error unpublishing puzzle:', liveError);
    return false;
  }

  // Update draft status back to 'draft'
  await updatePuzzleStatus(puzzleId, 'draft');
  logActivity({ action: 'unpublish', asset_type: 'puzzle', asset_id: puzzleId });
  return true;
}

export async function unpublishAsset(assetId: string): Promise<boolean> {
  const { error } = await supabase
    .from('assets_live')
    .delete()
    .eq('id', assetId);

  if (error) {
    console.error('Error unpublishing asset:', error);
    return false;
  }

  // Update draft status
  await supabase
    .from('assets_draft')
    .update({ status: 'draft', updated_at: new Date().toISOString() })
    .eq('id', assetId);

  logActivity({ action: 'unpublish', asset_type: 'asset', asset_id: assetId });
  return true;
}

/**
 * Check if a puzzle is currently published.
 */
export async function isPuzzlePublished(puzzleId: string): Promise<boolean> {
  const { data } = await supabase
    .from('puzzles_live')
    .select('id')
    .eq('id', puzzleId)
    .maybeSingle();
  return !!data;
}

/**
 * Get the draft status of a puzzle from the cloud.
 */
export async function getPuzzleDraftStatus(puzzleId: string): Promise<DbPuzzle['status'] | null> {
  const { data } = await supabase
    .from('puzzles_draft')
    .select('status')
    .eq('id', puzzleId)
    .maybeSingle();
  return data?.status || null;
}

// ============================================
// SYNC OPERATIONS (Cloud <-> Local)
// ============================================

export async function syncFromCloud(): Promise<{
  puzzles: DbPuzzle[];
  tileTypes: DbAsset[];
  enemies: DbAsset[];
  vessels: DbAsset[];
  allies: DbAsset[];
  characters: DbAsset[];
  objects: DbAsset[];
  skins: DbAsset[];
  spells: DbAsset[];
  statusEffects: DbAsset[];
  folders: DbAsset[];
  collectibleTypes: DbAsset[];
  collectibles: DbAsset[];
  hiddenAssets: DbAsset[];
  sounds: DbAsset[];
  globalSoundConfig: DbAsset[];
  globalHapticConfig: DbAsset[];
  helpContent: DbAsset[];
  themeSettings: DbAsset[];
}> {
  // Include deleted items so pull can process deletions
  const [puzzles, tileTypes, enemies, vessels, allies, characters, objects, skins, spells, statusEffects, folders, collectibleTypes, collectibles, hiddenAssets, sounds, globalSoundConfig, globalHapticConfig, helpContent, themeSettings] = await Promise.all([
    fetchAllPuzzles(true),
    fetchAllAssets('tile_type', true),
    fetchAllAssets('enemy', true),
    fetchAllAssets('vessel', true),
    fetchAllAssets('ally', true),
    fetchAllAssets('character', true),
    fetchAllAssets('object', true),
    fetchAllAssets('skin', true),
    fetchAllAssets('spell', true),
    fetchAllAssets('status_effect', true),
    fetchAllAssets('folder', true),
    fetchAllAssets('collectible_type', true),
    fetchAllAssets('collectible', true),
    fetchAllAssets('hidden_assets', true),
    fetchAllAssets('sound', true),
    fetchAllAssets('global_sound_config', true),
    fetchAllAssets('global_haptic_config', true),
    fetchAllAssets('help_content', true),
    fetchAllAssets('theme_settings', true),
  ]);

  return { puzzles, tileTypes, enemies, vessels, allies, characters, objects, skins, spells, statusEffects, folders, collectibleTypes, collectibles, hiddenAssets, sounds, globalSoundConfig, globalHapticConfig, helpContent, themeSettings };
}

// ============================================
// LIVE/PLAYER OPERATIONS
// ============================================

// Discriminated result so the caller can tell "nothing scheduled" (normal)
// apart from "couldn't reach the cloud" (offline/outage) — the player-facing
// handling differs.
export type DailyPuzzleResult =
  | { status: 'ok'; puzzle: Puzzle; puzzleNumber: number | null }
  | { status: 'none' }
  | { status: 'error' };

export async function fetchTodaysPuzzle(): Promise<DailyPuzzleResult> {
  // Local calendar date — the daily rolls over at the player's local
  // midnight (see utils/localDate.ts), not UTC.
  const today = localDateKey();

  try {
    // Today's entry if there is one, otherwise the most recent past day —
    // a gap in the schedule quietly serves the previous daily rather than
    // surfacing "nothing scheduled" to the player.
    const { data, error } = await supabase
      .from('daily_schedule')
      .select('puzzle_id, puzzle_number, puzzles_live(*)')
      .lte('scheduled_date', today)
      .order('scheduled_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn(`Couldn't fetch today's puzzle: ${error.message}`);
      return { status: 'error' };
    }
    if (!data) return { status: 'none' }; // nothing ever scheduled — normal pre-launch

    const puzzleLive = data.puzzles_live as unknown as DbPuzzle;
    const puzzle = puzzleLive?.data as unknown as Puzzle;
    return puzzle
      ? { status: 'ok', puzzle, puzzleNumber: (data.puzzle_number as number | null) ?? null }
      : { status: 'none' };
  } catch {
    return { status: 'error' }; // network-level failure (offline)
  }
}

// ── Live content for the player app (showcase distribution arc) ────────────
// Players receive only the daily via fetchTodaysPuzzle; everything else the
// Slab and Training Grounds need comes from this one call: published
// showcase puzzles (demo boards), published training puzzles, and the
// revealed-asset-id index. Reveal rule (design locked 2026-07-21): an asset
// is revealed iff some RELEASED, NON-showcase puzzle's transitive asset
// graph contains it — released = a daily whose date has arrived (archived
// dailies stay revealed; the set only grows) or any published training
// level. Showcase publishing primes assets but never reveals them.

export type LiveContentResult =
  | { status: 'ok'; content: LiveContent }
  | { status: 'error' };

export async function fetchLiveContent(): Promise<LiveContentResult> {
  const today = localDateKey();
  try {
    const [showcaseRes, trainingRes, scheduleRes] = await Promise.all([
      supabase.from('puzzles_live').select('id, data').not('data->showcase', 'is', null),
      supabase.from('puzzles_live').select('id, data').eq('data->>isTraining', 'true'),
      // Cheap reveal index: only the stamp sub-field of each released daily,
      // not the whole puzzle JSON (the archive grows by one row per day).
      supabase
        .from('daily_schedule')
        .select('puzzle_id, puzzles_live(id, publishedAssetIds:data->publishedAssetIds, showcase:data->showcase)')
        .lte('scheduled_date', today),
    ]);
    if (showcaseRes.error || trainingRes.error) {
      console.warn("Couldn't fetch live content:", showcaseRes.error?.message ?? trainingRes.error?.message);
      return { status: 'error' };
    }

    const showcasePuzzles = (showcaseRes.data ?? [])
      .map(r => r.data as unknown as Puzzle)
      .filter(p => p?.id);
    // A puzzle flagged both training and showcase is a demo, not a playable
    // training level — the reveal rule already treats it as showcase.
    const trainingPuzzles = (trainingRes.data ?? [])
      .map(r => r.data as unknown as Puzzle)
      .filter(p => p?.id && !p.showcase);

    const revealed = new Set<string>();
    const addIds = (ids: unknown) => {
      if (!Array.isArray(ids)) return;
      for (const id of ids) if (typeof id === 'string') revealed.add(id);
    };
    // Fallback for rows published before the stamp existed: pull their full
    // JSON and walk locally. On team devices the walk is complete; on a
    // player device it still yields every reachable id (unresolvable refs
    // surface with their ids intact).
    const walkFallback = (puzzle: Puzzle) => {
      for (const id of collectPuzzleAssetIds(puzzle).keys()) revealed.add(id);
    };

    for (const p of trainingPuzzles) {
      if (p.publishedAssetIds) addIds(p.publishedAssetIds);
      else walkFallback(p);
    }

    interface RevealRow { id?: string; publishedAssetIds?: unknown; showcase?: unknown }
    const unstampedDailyIds: string[] = [];
    // The JSON-sub-field embedded select is newer PostgREST surface than the
    // rest of this file uses — if it errors, degrade to full-data rows
    // rather than serving players an empty Slab.
    let scheduleRows = (scheduleRes.error ? null : scheduleRes.data) as Array<{ puzzles_live: unknown }> | null;
    if (scheduleRows === null) {
      const retry = await supabase
        .from('daily_schedule')
        .select('puzzle_id, puzzles_live(id, data)')
        .lte('scheduled_date', today);
      if (retry.error) {
        console.warn("Couldn't fetch reveal index:", retry.error.message);
        return { status: 'error' };
      }
      scheduleRows = (retry.data ?? []).map(row => {
        const live = row.puzzles_live as unknown as DbPuzzle | null;
        const p = live?.data as unknown as Puzzle | undefined;
        return { puzzles_live: p ? { id: p.id, publishedAssetIds: p.publishedAssetIds, showcase: p.showcase } : null };
      });
    }
    for (const row of scheduleRows) {
      const live = row.puzzles_live as RevealRow | null;
      if (!live?.id || live.showcase) continue; // showcase never reveals
      if (Array.isArray(live.publishedAssetIds)) addIds(live.publishedAssetIds);
      else unstampedDailyIds.push(live.id);
    }
    if (unstampedDailyIds.length > 0) {
      const { data } = await supabase
        .from('puzzles_live')
        .select('id, data')
        .in('id', unstampedDailyIds);
      for (const r of data ?? []) {
        const p = r.data as unknown as Puzzle;
        if (p?.id) walkFallback(p);
      }
    }

    return {
      status: 'ok',
      content: {
        showcasePuzzles,
        trainingPuzzles,
        revealedAssetIds: Array.from(revealed).sort(),
      },
    };
  } catch {
    return { status: 'error' }; // network-level failure (offline)
  }
}

export async function fetchArchivedPuzzles(): Promise<Puzzle[]> {
  const { data, error } = await supabase
    .from('puzzles_live')
    .select('*')
    .eq('is_archived', true)
    .order('scheduled_date', { ascending: false });

  if (error) {
    console.error('Error fetching archived puzzles:', error);
    return [];
  }

  return (data || []).map(p => p.data as unknown as Puzzle);
}

export async function fetchLiveAssets(type: AssetType): Promise<AssetData[]> {
  const { data, error } = await supabase
    .from('assets_live')
    .select('*')
    .eq('type', type);

  if (error) {
    console.error('Error fetching live assets:', error);
    return [];
  }

  return (data || []).map(a => a.data as unknown as AssetData);
}

// ── Production dashboard id-sets ────────────────────────────────────────────
// Cheap "what's live" membership queries (id column only, paged past the
// 1000-row PostgREST cap). null = fetch failed — the dashboard shows an
// error state instead of pretending nothing is published.

async function fetchIdSet(table: 'assets_live' | 'puzzles_live'): Promise<Set<string> | null> {
  const PAGE = 1000;
  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('id')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.warn(`Couldn't fetch ${table} ids:`, error.message);
      return null;
    }
    for (const row of data ?? []) ids.add(row.id);
    if (!data || data.length < PAGE) return ids;
  }
}

export const fetchLiveAssetIds = (): Promise<Set<string> | null> => fetchIdSet('assets_live');
export const fetchLivePuzzleIds = (): Promise<Set<string> | null> => fetchIdSet('puzzles_live');

// ============================================
// SCHEDULING OPERATIONS
// ============================================

export interface ScheduleEntry {
  date: string;
  puzzleId: string;
  puzzleName: string;
  puzzleNumber?: number; // Sequential puzzle number based on schedule order
}

/**
 * Fetch schedule for a date range.
 */
export async function fetchSchedule(startDate: string, endDate: string): Promise<ScheduleEntry[]> {
  const { data, error } = await supabase
    .from('daily_schedule')
    .select('scheduled_date, puzzle_id, puzzle_number, puzzles_live(name)')
    .gte('scheduled_date', startDate)
    .lte('scheduled_date', endDate)
    .order('scheduled_date', { ascending: true });

  if (error) {
    console.error('Error fetching schedule:', error);
    return [];
  }

  return (data || []).map(row => ({
    date: row.scheduled_date,
    puzzleId: row.puzzle_id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    puzzleName: (row.puzzles_live as any)?.name || 'Unknown',
    puzzleNumber: row.puzzle_number ?? undefined,
  }));
}

/**
 * Fetch the full schedule (all entries) with persistent puzzle numbers.
 * Returns entries ordered by scheduled_date.
 */
export async function fetchFullScheduleWithNumbers(): Promise<ScheduleEntry[]> {
  const { data, error } = await supabase
    .from('daily_schedule')
    .select('scheduled_date, puzzle_id, puzzle_number, puzzles_live(name)')
    .order('scheduled_date', { ascending: true });

  if (error) {
    console.error('Error fetching full schedule:', error);
    return [];
  }

  return (data || []).map(row => ({
    date: row.scheduled_date,
    puzzleId: row.puzzle_id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    puzzleName: (row.puzzles_live as any)?.name || 'Unknown',
    puzzleNumber: row.puzzle_number ?? undefined,
  }));
}

/**
 * Get the next available puzzle number.
 */
async function getNextPuzzleNumber(): Promise<number> {
  const { data } = await supabase
    .from('daily_schedule')
    .select('puzzle_number')
    .order('puzzle_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.puzzle_number ?? 0) + 1;
}

/**
 * Schedule a puzzle for a specific date.
 * Automatically assigns the next puzzle number if one isn't already set for that date.
 */
export async function schedulePuzzle(puzzleId: string, date: string): Promise<{ success: boolean; puzzleNumber?: number }> {
  // Check if this date already has a puzzle_number (re-scheduling same slot)
  const { data: existing } = await supabase
    .from('daily_schedule')
    .select('puzzle_number')
    .eq('scheduled_date', date)
    .maybeSingle();

  const puzzleNumber = existing?.puzzle_number ?? await getNextPuzzleNumber();

  const { error } = await supabase
    .from('daily_schedule')
    .upsert({
      puzzle_id: puzzleId,
      scheduled_date: date,
      puzzle_number: puzzleNumber,
    }, { onConflict: 'scheduled_date' });

  if (error) {
    console.error('Error scheduling puzzle:', error);
    return { success: false };
  }

  logActivity({ action: 'schedule', asset_type: 'puzzle', asset_id: puzzleId, details: { scheduled_date: date, puzzle_number: puzzleNumber } });
  return { success: true, puzzleNumber };
}

/**
 * Unschedule a puzzle from a date.
 */
export async function unschedulePuzzle(date: string): Promise<boolean> {
  const { error } = await supabase
    .from('daily_schedule')
    .delete()
    .eq('scheduled_date', date);

  if (error) {
    console.error('Error unscheduling puzzle:', error);
    return false;
  }

  logActivity({ action: 'unschedule', asset_type: 'puzzle', details: { scheduled_date: date } });
  return true;
}

/**
 * Fetch all published puzzles (for the scheduling sidebar).
 */
export async function fetchPublishedPuzzles(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('puzzles_live')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching published puzzles:', error);
    return [];
  }

  return data || [];
}
