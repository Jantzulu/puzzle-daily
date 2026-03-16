import React, { useState, useEffect, useCallback } from 'react';
import type { Puzzle } from '../../types/game';
import type { BugReport } from '../../types/bugReport';
import { fetchBugReports, updateBugReportStatus, deleteBugReport } from '../../services/bugReportService';
import { getAllPuzzles } from '../../data/puzzles';
import { getSavedPuzzles } from '../../utils/puzzleStorage';
import { supabase } from '../../lib/supabase';
import { toast } from '../shared/Toast';
import { BugReportReplay } from './BugReportReplay';

type StatusFilter = 'all' | 'new' | 'reviewed' | 'resolved';

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-red-900/50 text-red-300 border-red-700/50',
  reviewed: 'bg-yellow-900/50 text-yellow-300 border-yellow-700/50',
  resolved: 'bg-green-900/50 text-green-300 border-green-700/50',
};

export const BugReportViewer: React.FC = () => {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);
  const [replayPuzzle, setReplayPuzzle] = useState<Puzzle | null>(null);
  const [loadingReplay, setLoadingReplay] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    const filters: { status?: string } = {};
    if (statusFilter !== 'all') filters.status = statusFilter;
    const data = await fetchBugReports(filters);
    setReports(data);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleStatusChange = async (report: BugReport, newStatus: 'new' | 'reviewed' | 'resolved') => {
    const success = await updateBugReportStatus(report.id, newStatus);
    if (success) {
      toast.success(`Report marked as ${newStatus}`);
      loadReports();
    } else {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async (report: BugReport) => {
    const success = await deleteBugReport(report.id);
    if (success) {
      toast.success('Report deleted');
      if (selectedReport?.id === report.id) {
        setSelectedReport(null);
        setReplayPuzzle(null);
      }
      loadReports();
    } else {
      toast.error('Failed to delete report');
    }
  };

  const handleReplay = async (report: BugReport) => {
    setSelectedReport(report);
    setLoadingReplay(true);
    setReplayPuzzle(null);

    // Try local puzzles first
    const allLocal = [...getAllPuzzles(), ...getSavedPuzzles()];
    const localPuzzle = allLocal.find(p => p.id === report.puzzle_id);

    if (localPuzzle) {
      setReplayPuzzle(JSON.parse(JSON.stringify(localPuzzle)));
      setLoadingReplay(false);
      return;
    }

    // Try Supabase — published puzzles
    try {
      const { data } = await supabase
        .from('puzzles_live')
        .select('data')
        .eq('id', report.puzzle_id)
        .single();

      if (data?.data) {
        setReplayPuzzle(data.data as Puzzle);
        setLoadingReplay(false);
        return;
      }
    } catch { /* ignore */ }

    // Try draft puzzles
    try {
      const { data } = await supabase
        .from('puzzles_draft')
        .select('data')
        .eq('id', report.puzzle_id)
        .single();

      if (data?.data) {
        setReplayPuzzle(data.data as Puzzle);
        setLoadingReplay(false);
        return;
      }
    } catch { /* ignore */ }

    setLoadingReplay(false);
    toast.error('Puzzle not found — it may have been deleted');
  };

  const handleExitReplay = () => {
    setSelectedReport(null);
    setReplayPuzzle(null);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const newCount = reports.filter(r => r.status === 'new').length;

  // ── REPLAY VIEW ──
  if (selectedReport && replayPuzzle) {
    return (
      <div className="min-h-screen text-parchment-200 px-4 pb-4 md:px-8 md:pb-8">
        <div className="max-w-5xl mx-auto space-y-4 pt-4">
          <button onClick={handleExitReplay} className="dungeon-btn px-3 py-1.5 text-sm font-bold flex items-center gap-1">
            <span>&larr;</span> Back to Reports
          </button>

          <div className="grid md:grid-cols-[1fr_300px] gap-4">
            {/* Replay board */}
            <div>
              <BugReportReplay
                puzzle={replayPuzzle}
                placements={selectedReport.placements}
                onExit={handleExitReplay}
              />
            </div>

            {/* Report details */}
            <div className="dungeon-panel p-4 space-y-3 h-fit">
              <h3 className="font-medieval text-copper-400">Report Details</h3>

              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-stone-500">Puzzle:</span>{' '}
                  <span className="text-parchment-200">{selectedReport.puzzle_name || selectedReport.puzzle_id}</span>
                </div>
                <div>
                  <span className="text-stone-500">Outcome:</span>{' '}
                  <span className={selectedReport.outcome === 'victory' ? 'text-green-400' : 'text-red-400'}>
                    {selectedReport.outcome}
                  </span>
                  {selectedReport.turns_used != null && (
                    <span className="text-stone-500"> ({selectedReport.turns_used} turns)</span>
                  )}
                </div>
                {selectedReport.asset_type && (
                  <div>
                    <span className="text-stone-500">Bugged {selectedReport.asset_type}:</span>{' '}
                    <span className="text-parchment-200">{selectedReport.asset_name || selectedReport.asset_id || '—'}</span>
                  </div>
                )}
                <div>
                  <span className="text-stone-500">Submitted:</span>{' '}
                  <span className="text-parchment-200">{formatDate(selectedReport.created_at)}</span>
                </div>
                <div>
                  <span className="text-stone-500">Player ID:</span>{' '}
                  <span className="text-stone-400 text-xs font-mono">{selectedReport.player_id.slice(0, 8)}...</span>
                </div>
              </div>

              <div className="border-t border-stone-700/50 pt-2">
                <div className="text-stone-500 text-xs mb-1">Description:</div>
                <p className="text-sm text-parchment-200 bg-stone-900/50 rounded p-2">{selectedReport.description}</p>
              </div>

              {selectedReport.dev_notes && (
                <div className="border-t border-stone-700/50 pt-2">
                  <div className="text-stone-500 text-xs mb-1">Dev Notes:</div>
                  <p className="text-sm text-copper-300 bg-stone-900/50 rounded p-2">{selectedReport.dev_notes}</p>
                </div>
              )}

              <div className="border-t border-stone-700/50 pt-2 flex gap-2">
                <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_COLORS[selectedReport.status]}`}>
                  {selectedReport.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── LOADING REPLAY ──
  if (selectedReport && loadingReplay) {
    return (
      <div className="min-h-screen text-parchment-200 flex items-center justify-center">
        <div className="text-stone-400">Loading puzzle for replay...</div>
      </div>
    );
  }

  // ── LIST VIEW ──
  return (
    <div className="min-h-screen text-parchment-200 px-4 pb-4 md:px-8 md:pb-8">
      <div className="max-w-5xl mx-auto space-y-4 pt-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-medieval text-copper-400 text-xl md:text-2xl">Bug Reports</h1>
            {newCount > 0 && (
              <p className="text-sm text-red-400 mt-0.5">{newCount} new report{newCount !== 1 ? 's' : ''}</p>
            )}
          </div>
          <button onClick={loadReports} className="dungeon-btn px-3 py-1.5 text-sm font-bold">
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {(['all', 'new', 'reviewed', 'resolved'] as StatusFilter[]).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-xs font-bold rounded-pixel border ${
                statusFilter === status
                  ? 'bg-copper-600/30 border-copper-500 text-copper-300'
                  : 'bg-stone-800/50 border-stone-600/50 text-stone-400 hover:border-stone-500'
              }`}
            >
              {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {/* Reports list */}
        {loading ? (
          <div className="text-center text-stone-500 py-8">Loading...</div>
        ) : reports.length === 0 ? (
          <div className="dungeon-panel p-8 text-center">
            <p className="text-stone-400">No bug reports found.</p>
            <p className="text-xs text-stone-600 mt-1">
              {statusFilter !== 'all' ? 'Try changing the filter.' : 'Players can submit reports from the game screen.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map(report => (
              <div key={report.id} className="dungeon-panel p-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-parchment-200 text-sm truncate">
                      {report.puzzle_name || report.puzzle_id}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_COLORS[report.status]}`}>
                      {report.status}
                    </span>
                    {report.asset_type && (
                      <span className="text-xs text-stone-500">
                        {report.asset_type}: {report.asset_name || report.asset_id}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-400 mt-0.5 line-clamp-1">{report.description}</p>
                  <p className="text-[10px] text-stone-600 mt-0.5">{formatDate(report.created_at)}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleReplay(report)}
                    className="dungeon-btn px-3 py-1 text-xs font-bold"
                  >
                    Replay
                  </button>
                  {report.status === 'new' && (
                    <button
                      onClick={() => handleStatusChange(report, 'reviewed')}
                      className="px-3 py-1 text-xs font-bold rounded-pixel border border-yellow-700/50 bg-yellow-900/30 text-yellow-300 hover:bg-yellow-900/50"
                    >
                      Reviewed
                    </button>
                  )}
                  {(report.status === 'new' || report.status === 'reviewed') && (
                    <button
                      onClick={() => handleStatusChange(report, 'resolved')}
                      className="px-3 py-1 text-xs font-bold rounded-pixel border border-green-700/50 bg-green-900/30 text-green-300 hover:bg-green-900/50"
                    >
                      Resolve
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(report)}
                    className="px-3 py-1 text-xs font-bold rounded-pixel border border-red-700/50 bg-red-900/30 text-red-300 hover:bg-red-900/50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
