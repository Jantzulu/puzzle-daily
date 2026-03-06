import { supabase } from '../lib/supabase';
import { getPlayerId } from '../utils/playerId';
import type { BugReportSubmission, BugReport } from '../types/bugReport';

// ============================================
// SUBMISSION (Fire-and-forget, player-side)
// ============================================

/**
 * Submit a bug report from a player.
 * Fire-and-forget style: returns true/false for toast feedback.
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
      console.warn('[BugReport] Failed to submit:', error);
      return false;
    }

    return true;
  } catch (e) {
    console.warn('[BugReport] Failed to submit:', e);
    return false;
  }
}

// ============================================
// DEV-SIDE CRUD
// ============================================

/**
 * Fetch bug reports for the dev viewer.
 * Excludes soft-deleted reports.
 */
export async function fetchBugReports(
  filters?: { status?: string; puzzleId?: string }
): Promise<BugReport[]> {
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

    if (error) {
      console.warn('[BugReport] Failed to fetch:', error);
      return [];
    }

    return (data || []) as BugReport[];
  } catch (e) {
    console.warn('[BugReport] Failed to fetch:', e);
    return [];
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
 * Soft-delete a bug report.
 */
export async function deleteBugReport(id: string): Promise<boolean> {
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
