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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      <div className="p-4 space-y-4 max-w-5xl mx-auto text-parchment-200">
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
          <div className="border border-stone-700 rounded overflow-hidden h-fit">
            <div className="bg-stone-800 px-2 py-1.5 text-xs uppercase text-stone-400">Report Details</div>
            <div className="p-3 space-y-3">
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
      <div className="text-center py-16 text-stone-500 text-sm">Loading puzzle for replay...</div>
    );
  }

  // ── LIST VIEW ──
  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      {/* Filters + refresh */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'new', 'reviewed', 'resolved'] as StatusFilter[]).map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-2 py-0.5 rounded text-xs border ${
              statusFilter === status
                ? 'bg-stone-700 text-parchment-100 border-arcane-500'
                : 'text-stone-400 border-stone-700 hover:text-stone-200'
            }`}
          >
            {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {newCount > 0 && (
            <span className="text-xs text-red-400">⚠ {newCount} new report{newCount !== 1 ? 's' : ''}</span>
          )}
          <button onClick={loadReports} className="dungeon-btn text-xs px-3 py-1.5">
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Reports table */}
      <div className="overflow-x-auto border border-stone-700 rounded">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-stone-800 text-stone-400 text-xs uppercase">
              <th className="text-left px-3 py-2">Puzzle</th>
              <th className="text-left px-2 py-2">Status</th>
              <th className="text-left px-2 py-2">Asset</th>
              <th className="text-left px-2 py-2">Description</th>
              <th className="text-left px-2 py-2">Date</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-stone-500">Loading...</td></tr>
            ) : reports.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-stone-500">
                  No bug reports found. {statusFilter !== 'all' ? 'Try changing the filter.' : 'Players can submit reports from the game screen.'}
                </td>
              </tr>
            ) : reports.map(report => (
              <tr key={report.id} className="border-t border-stone-700/60 hover:bg-stone-800/50">
                <td className="px-3 py-1.5 text-parchment-100 max-w-[200px] truncate">
                  {report.puzzle_name || report.puzzle_id}
                </td>
                <td className="px-2 py-1.5">
                  <span className={`inline-block text-xs px-2 py-0.5 rounded border whitespace-nowrap ${STATUS_COLORS[report.status]}`}>
                    {report.status}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-xs text-stone-400 whitespace-nowrap">
                  {report.asset_type ? `${report.asset_type}: ${report.asset_name || report.asset_id}` : <span className="text-stone-600">—</span>}
                </td>
                <td className="px-2 py-1.5 text-xs text-stone-400 max-w-[280px] truncate" title={report.description}>
                  {report.description}
                </td>
                <td className="px-2 py-1.5 text-xs text-stone-500 whitespace-nowrap">{formatDate(report.created_at)}</td>
                <td className="px-2 py-1.5">
                  <div className="flex gap-1.5 justify-end whitespace-nowrap">
                    <button
                      onClick={() => handleReplay(report)}
                      className="dungeon-btn px-2 py-0.5 text-xs"
                    >
                      Replay
                    </button>
                    {report.status === 'new' && (
                      <button
                        onClick={() => handleStatusChange(report, 'reviewed')}
                        className="px-2 py-0.5 text-xs rounded border border-yellow-700/50 bg-yellow-900/30 text-yellow-300 hover:bg-yellow-900/50"
                      >
                        Reviewed
                      </button>
                    )}
                    {(report.status === 'new' || report.status === 'reviewed') && (
                      <button
                        onClick={() => handleStatusChange(report, 'resolved')}
                        className="px-2 py-0.5 text-xs rounded border border-green-700/50 bg-green-900/30 text-green-300 hover:bg-green-900/50"
                      >
                        Resolve
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(report)}
                      className="px-2 py-0.5 text-xs rounded border border-red-700/50 bg-red-900/30 text-red-300 hover:bg-red-900/50"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
