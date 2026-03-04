import { supabase } from '../lib/supabase';

export interface ActivityEntry {
  user_id?: string;
  action: 'create' | 'update' | 'delete' | 'publish' | 'unpublish' | 'batch_publish' | 'schedule' | 'unschedule' | 'sync_push' | 'sync_pull';
  asset_type?: string;
  asset_id?: string;
  asset_name?: string;
  details?: Record<string, unknown>;
}

export interface ActivityRecord extends ActivityEntry {
  id: string;
  created_at: string;
  display_name?: string;
}

/**
 * Log an activity entry (fire-and-forget, never throws)
 */
export async function logActivity(entry: Omit<ActivityEntry, 'user_id'>): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    await supabase.from('activity_log').insert({
      ...entry,
      user_id: userId || null,
    });
  } catch (e) {
    console.warn('[ActivityLog] Failed to log activity:', e);
  }
}

/**
 * Fetch recent activity, joined with profiles for display names
 */
export async function fetchRecentActivity(limit: number = 50): Promise<ActivityRecord[]> {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*, profiles(display_name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[ActivityLog] Error fetching activity:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    user_id: row.user_id,
    action: row.action,
    asset_type: row.asset_type,
    asset_id: row.asset_id,
    asset_name: row.asset_name,
    details: row.details,
    created_at: row.created_at,
    display_name: row.profiles?.display_name || 'Unknown',
  }));
}

/**
 * Fetch activity for a specific asset
 */
export async function fetchAssetActivity(assetId: string, limit: number = 20): Promise<ActivityRecord[]> {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*, profiles(display_name)')
    .eq('asset_id', assetId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[ActivityLog] Error fetching asset activity:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    user_id: row.user_id,
    action: row.action,
    asset_type: row.asset_type,
    asset_id: row.asset_id,
    asset_name: row.asset_name,
    details: row.details,
    created_at: row.created_at,
    display_name: row.profiles?.display_name || 'Unknown',
  }));
}
