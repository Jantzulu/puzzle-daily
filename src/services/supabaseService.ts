import { supabase } from '../lib/supabase';
import type { DbPuzzle, DbAsset } from '../lib/supabase';
import { logActivity } from './activityLogService';

async function getCurrentUserId(): Promise<string | undefined> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id;
}
import type { Puzzle } from '../types/game';
import type { CustomTileType, CustomObject, PuzzleSkin, SpellAsset } from '../utils/assetStorage';
import type { EnemyWithSprite } from '../data/enemies';
import type { CharacterWithSprite } from '../data/characters';

// ============================================
// PUZZLE OPERATIONS
// ============================================

export async function fetchAllPuzzles(includeDeleted: boolean = false): Promise<DbPuzzle[]> {
  console.log('[Supabase] Fetching all puzzles...');
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
  console.log('[Supabase] Fetched puzzles:', data?.length || 0);
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

  console.log('[Supabase] Saving puzzle:', dbPuzzle.id, dbPuzzle.name);

  const { error, data } = await supabase
    .from('puzzles_draft')
    .upsert(dbPuzzle, { onConflict: 'id' })
    .select();

  if (error) {
    console.error('[Supabase] Error saving puzzle:', error);
    return false;
  }
  console.log('[Supabase] Puzzle saved successfully:', data);
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

type AssetType = 'tile_type' | 'enemy' | 'character' | 'object' | 'skin' | 'spell' | 'status_effect' | 'folder' | 'collectible_type' | 'collectible' | 'hidden_assets' | 'sound' | 'global_sound_config' | 'global_haptic_config' | 'help_content' | 'theme_settings';
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

  // Insert into live table
  const { error: liveError } = await supabase
    .from('puzzles_live')
    .upsert({
      id: puzzle.id,
      name: puzzle.name,
      data: puzzle.data,
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
  const [puzzles, tileTypes, enemies, characters, objects, skins, spells, statusEffects, folders, collectibleTypes, collectibles, hiddenAssets, sounds, globalSoundConfig, globalHapticConfig, helpContent, themeSettings] = await Promise.all([
    fetchAllPuzzles(true),
    fetchAllAssets('tile_type', true),
    fetchAllAssets('enemy', true),
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

  return { puzzles, tileTypes, enemies, characters, objects, skins, spells, statusEffects, folders, collectibleTypes, collectibles, hiddenAssets, sounds, globalSoundConfig, globalHapticConfig, helpContent, themeSettings };
}

// ============================================
// LIVE/PLAYER OPERATIONS
// ============================================

export async function fetchTodaysPuzzle(): Promise<Puzzle | null> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('daily_schedule')
    .select('puzzle_id, puzzles_live(*)')
    .eq('scheduled_date', today)
    .single();

  if (error || !data) {
    console.error('Error fetching today\'s puzzle:', error);
    return null;
  }

  const puzzleLive = data.puzzles_live as unknown as DbPuzzle;
  return puzzleLive?.data as unknown as Puzzle;
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
 * Fetch today's puzzle number (for player display).
 */
export async function fetchTodaysPuzzleNumber(): Promise<number | null> {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('daily_schedule')
    .select('puzzle_number')
    .eq('scheduled_date', today)
    .maybeSingle();

  return data?.puzzle_number ?? null;
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
