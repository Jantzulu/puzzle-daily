import { supabase } from '../lib/supabase';
import type { DbPuzzle, DbAsset } from '../lib/supabase';
import type { Puzzle } from '../types/game';
import type { CustomTileType, CustomObject, PuzzleSkin, SpellAsset } from '../utils/assetStorage';
import type { EnemyWithSprite } from '../data/enemies';
import type { CharacterWithSprite } from '../data/characters';

// ============================================
// PUZZLE OPERATIONS
// ============================================

export async function fetchAllPuzzles(): Promise<DbPuzzle[]> {
  console.log('[Supabase] Fetching all puzzles...');
  const { data, error } = await supabase
    .from('puzzles_draft')
    .select('*')
    .order('updated_at', { ascending: false });

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
  const dbPuzzle: Partial<DbPuzzle> = {
    id: puzzle.id,
    name: name || puzzle.name || 'Untitled Puzzle',
    data: puzzle as unknown as object,
    status: 'draft',
    updated_at: new Date().toISOString(),
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
  return true;
}

export async function deletePuzzleFromCloud(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('puzzles_draft')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting puzzle:', error);
    return false;
  }
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
// ASSET OPERATIONS
// ============================================

type AssetType = 'tile_type' | 'enemy' | 'character' | 'object' | 'skin' | 'spell';
type AssetData = CustomTileType | EnemyWithSprite | CharacterWithSprite | CustomObject | PuzzleSkin | SpellAsset;

export async function fetchAllAssets(type?: AssetType): Promise<DbAsset[]> {
  let query = supabase
    .from('assets_draft')
    .select('*')
    .order('updated_at', { ascending: false });

  if (type) {
    query = query.eq('type', type);
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
  const dbAsset: Partial<DbAsset> = {
    id,
    type,
    name,
    data: data as unknown as object,
    status: 'draft',
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('assets_draft')
    .upsert(dbAsset, { onConflict: 'id' });

  if (error) {
    console.error('Error saving asset:', error);
    return false;
  }
  return true;
}

export async function deleteAssetFromCloud(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('assets_draft')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting asset:', error);
    return false;
  }
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

  return true;
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
}> {
  const [puzzles, tileTypes, enemies, characters, objects, skins, spells] = await Promise.all([
    fetchAllPuzzles(),
    fetchAllAssets('tile_type'),
    fetchAllAssets('enemy'),
    fetchAllAssets('character'),
    fetchAllAssets('object'),
    fetchAllAssets('skin'),
    fetchAllAssets('spell'),
  ]);

  return { puzzles, tileTypes, enemies, characters, objects, skins, spells };
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
