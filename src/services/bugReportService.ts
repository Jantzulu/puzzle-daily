import { supabase } from '../lib/supabase';
import { getPlayerId } from '../utils/playerId';
import type { BugReportSubmission, BugReport } from '../types/bugReport';

// ============================================
// SUBMISSION (Fire-and-forget, player-side)
// ============================================

const LOCAL_BUG_REPORTS_KEY = 'local_bug_reports';

/**
 * Save a bug report to localStorage as fallback.
 */
function saveLocalBugReport(report: BugReportSubmission): void {
  try {
    const existing = JSON.parse(localStorage.getItem(LOCAL_BUG_REPORTS_KEY) || '[]');
    existing.push({
      ...report,
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      player_id: getPlayerId(),
      status: 'new',
      created_at: new Date().toISOString(),
    });
    // Cap at 50 local reports
    if (existing.length > 50) existing.splice(0, existing.length - 50);
    localStorage.setItem(LOCAL_BUG_REPORTS_KEY, JSON.stringify(existing));
  } catch {
    // Storage full or unavailable
  }
}

/**
 * Submit a bug report from a player.
 * Tries Supabase first, falls back to localStorage. Always returns true.
 */
export async function submitBugReport(report: BugReportSubmission): Promise<boolean> {
  try {
    const playerId = getPlayerId();

    const row = {
      player_id: playerId,
      puzzle_id: report.puzzleId,
      puzzle_name: report.puzzleName,
      placements: report.placements,
      outcome: report.outcome,
      turns_used: report.turnsUsed,
      asset_type: report.assetType || null,
      asset_id: report.assetId || null,
      asset_name: report.assetName || null,
      description: report.description,
    };

    const { error } = await supabase.from('bug_reports').insert(row);

    if (error) {
      console.warn('[BugReport] Cloud submit failed, saving locally:', error);
      saveLocalBugReport(report);
    }

    return true;
  } catch (e) {
    console.warn('[BugReport] Cloud submit failed, saving locally:', e);
    saveLocalBugReport(report);
    return true;
  }
}

// ============================================
// DEV-SIDE CRUD
// ============================================

/**
 * Fetch bug reports for the dev viewer.
 * Excludes soft-deleted reports.
 */
/**
 * Get locally stored bug reports.
 */
function getLocalBugReports(): BugReport[] {
  try {
    const raw = localStorage.getItem(LOCAL_BUG_REPORTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw).map((r: Record<string, unknown>) => ({
      id: r.id || `local_${Date.now()}`,
      player_id: r.player_id || '',
      puzzle_id: r.puzzleId || r.puzzle_id || '',
      puzzle_name: r.puzzleName || r.puzzle_name || null,
      placements: r.placements || [],
      outcome: r.outcome || 'defeat',
      turns_used: r.turnsUsed ?? r.turns_used ?? 0,
      asset_type: r.assetType || r.asset_type || null,
      asset_id: r.assetId || r.asset_id || null,
      asset_name: r.assetName || r.asset_name || null,
      description: r.description || '',
      status: (r.status as string) || 'new',
      dev_notes: (r.dev_notes as string) || null,
      created_at: (r.created_at as string) || new Date().toISOString(),
      updated_at: (r.created_at as string) || new Date().toISOString(),
      deleted_at: null,
    }));
  } catch {
    return [];
  }
}

export async function fetchBugReports(
  filters?: { status?: string; puzzleId?: string }
): Promise<BugReport[]> {
  let cloudReports: BugReport[] = [];

  try {
    let query = supabase
      .from('bug_reports')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.puzzleId) {
      query = query.eq('puzzle_id', filters.puzzleId);
    }

    const { data, error } = await query;

    if (!error && data) {
      cloudReports = data as BugReport[];
    } else if (error) {
      console.warn('[BugReport] Failed to fetch from cloud:', error);
    }
  } catch (e) {
    console.warn('[BugReport] Failed to fetch from cloud:', e);
  }

  // Merge with local reports
  let localReports = getLocalBugReports();
  if (filters?.status) {
    localReports = localReports.filter(r => r.status === filters.status);
  }
  if (filters?.puzzleId) {
    localReports = localReports.filter(r => r.puzzle_id === filters.puzzleId);
  }

  const merged = [...cloudReports, ...localReports];
  merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return merged;
}

/**
 * Remove a local bug report by ID.
 */
function removeLocalBugReport(id: string): boolean {
  try {
    const existing = JSON.parse(localStorage.getItem(LOCAL_BUG_REPORTS_KEY) || '[]');
    const filtered = existing.filter((r: Record<string, unknown>) => r.id !== id);
    if (filtered.length === existing.length) return false; // not found
    localStorage.setItem(LOCAL_BUG_REPORTS_KEY, JSON.stringify(filtered));
    return true;
  } catch {
    return false;
  }
}

/**
 * Update a local bug report's status.
 */
function updateLocalBugReport(id: string, updates: Record<string, unknown>): boolean {
  try {
    const existing = JSON.parse(localStorage.getItem(LOCAL_BUG_REPORTS_KEY) || '[]');
    const idx = existing.findIndex((r: Record<string, unknown>) => r.id === id);
    if (idx < 0) return false;
    existing[idx] = { ...existing[idx], ...updates };
    localStorage.setItem(LOCAL_BUG_REPORTS_KEY, JSON.stringify(existing));
    return true;
  } catch {
    return false;
  }
}

/**
 * Update a bug report's status and optional dev notes.
 */
export async function updateBugReportStatus(
  id: string,
  status: 'new' | 'reviewed' | 'resolved',
  devNotes?: string
): Promise<boolean> {
  // Handle local reports
  if (id.startsWith('local_')) {
    return updateLocalBugReport(id, {
      status,
      dev_notes: devNotes,
      updated_at: new Date().toISOString(),
    });
  }

  try {
    const update: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (devNotes !== undefined) {
      update.dev_notes = devNotes;
    }

    const { error } = await supabase
      .from('bug_reports')
      .update(update)
      .eq('id', id);

    if (error) {
      console.warn('[BugReport] Failed to update status:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[BugReport] Failed to update status:', e);
    return false;
  }
}

/**
 * Soft-delete a bug report (or remove local report entirely).
 */
export async function deleteBugReport(id: string): Promise<boolean> {
  // Handle local reports — just remove from localStorage
  if (id.startsWith('local_')) {
    return removeLocalBugReport(id);
  }

  try {
    const { error } = await supabase
      .from('bug_reports')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.warn('[BugReport] Failed to delete:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[BugReport] Failed to delete:', e);
    return false;
  }
}
