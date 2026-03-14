import { supabase } from '../lib/supabase';

export interface ActivityEntry {
  user_id?: string;
  action: 'create' | 'update' | 'delete' | 'publish' | 'unpublish' | 'batch_publish' | 'schedule' | 'unschedule' | 'sync_push' | 'sync_pull' | 'submit_review' | 'approve' | 'request_changes';
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

// ==========================================
// LOCAL ACTIVITY LOG (localStorage fallback)
// ==========================================

const LOCAL_ACTIVITY_KEY = 'activity_log_local';
const MAX_LOCAL_ENTRIES = 200;

function getLocalActivity(): ActivityRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_ACTIVITY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalActivity(entries: ActivityRecord[]): void {
  try {
    localStorage.setItem(LOCAL_ACTIVITY_KEY, JSON.stringify(entries));
  } catch {
    // Storage full — trim and retry
    try {
      localStorage.setItem(LOCAL_ACTIVITY_KEY, JSON.stringify(entries.slice(0, 100)));
    } catch { /* give up */ }
  }
}

function logActivityLocally(entry: Omit<ActivityEntry, 'user_id'>): void {
  const record: ActivityRecord = {
    id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...entry,
    created_at: new Date().toISOString(),
    display_name: 'You',
  };
  const entries = getLocalActivity();
  entries.unshift(record);
  // Cap at MAX_LOCAL_ENTRIES
  if (entries.length > MAX_LOCAL_ENTRIES) entries.length = MAX_LOCAL_ENTRIES;
  saveLocalActivity(entries);
}

function pruneLocalActivity(): void {
  const entries = getLocalActivity();
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const pruned = entries.filter(e => new Date(e.created_at).getTime() > cutoff);
  if (pruned.length < entries.length) {
    saveLocalActivity(pruned);
  }
}

// ==========================================
// CLOUD ACTIVITY LOG (Supabase)
// ==========================================

/**
 * Log an activity entry — always saved locally, also pushed to cloud if authenticated.
 */
export async function logActivity(entry: Omit<ActivityEntry, 'user_id'>): Promise<void> {
  // Always log locally so Activity tab works without auth
  logActivityLocally(entry);

  // Also try cloud
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    await supabase.from('activity_log').insert({
      ...entry,
      user_id: userId || null,
    });
  } catch (e) {
    // Cloud logging is optional — local log is the fallback
  }
}

// Auto-cleanup: prune entries older than 30 days (runs once per session)
let cleanupDone = false;
async function pruneOldActivity(): Promise<void> {
  if (cleanupDone) return;
  cleanupDone = true;

  // Prune local entries
  pruneLocalActivity();

  // Prune cloud entries
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('activity_log').delete().lt('created_at', cutoff);
  } catch (e) {
    // Cloud cleanup is optional
  }
}

/**
 * Fetch recent activity — merges local + cloud, deduped by timestamp proximity
 */
export async function fetchRecentActivity(limit: number = 50): Promise<ActivityRecord[]> {
  // Prune old entries lazily (once per session)
  pruneOldActivity();

  // Always get local entries
  const localEntries = getLocalActivity();

  // Try cloud entries
  let cloudEntries: ActivityRecord[] = [];
  try {
    const { data, error } = await supabase
      .from('activity_log')
      .select('*, profiles(display_name)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && data) {
      cloudEntries = data.map((row: any) => ({
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
  } catch {
    // Cloud unavailable — local only
  }

  // Merge: if we have cloud entries, deduplicate against local
  let merged: ActivityRecord[];
  if (cloudEntries.length > 0) {
    // Build a set of cloud entries by (action + asset_id + timestamp within 2s)
    const cloudKeys = new Set(cloudEntries.map(e =>
      `${e.action}|${e.asset_id || ''}|${Math.floor(new Date(e.created_at).getTime() / 2000)}`
    ));
    // Only include local entries that don't have a cloud match
    const uniqueLocal = localEntries.filter(e => {
      const key = `${e.action}|${e.asset_id || ''}|${Math.floor(new Date(e.created_at).getTime() / 2000)}`;
      return !cloudKeys.has(key);
    });
    merged = [...cloudEntries, ...uniqueLocal];
  } else {
    merged = localEntries;
  }

  // Sort by created_at descending and limit
  merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return merged.slice(0, limit);
}

/**
 * Fetch activity for a specific asset — merges local + cloud
 */
export async function fetchAssetActivity(assetId: string, limit: number = 20): Promise<ActivityRecord[]> {
  // Local entries for this asset
  const localEntries = getLocalActivity().filter(e => e.asset_id === assetId);

  // Try cloud
  let cloudEntries: ActivityRecord[] = [];
  try {
    const { data, error } = await supabase
      .from('activity_log')
      .select('*, profiles(display_name)')
      .eq('asset_id', assetId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && data) {
      cloudEntries = data.map((row: any) => ({
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
  } catch {
    // Cloud unavailable
  }

  let merged: ActivityRecord[];
  if (cloudEntries.length > 0) {
    const cloudKeys = new Set(cloudEntries.map(e =>
      `${e.action}|${e.asset_id || ''}|${Math.floor(new Date(e.created_at).getTime() / 2000)}`
    ));
    const uniqueLocal = localEntries.filter(e => {
      const key = `${e.action}|${e.asset_id || ''}|${Math.floor(new Date(e.created_at).getTime() / 2000)}`;
      return !cloudKeys.has(key);
    });
    merged = [...cloudEntries, ...uniqueLocal];
  } else {
    merged = localEntries;
  }

  merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return merged.slice(0, limit);
}
