import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchOverviewStats,
  fetchPuzzleStats,
  clearPuzzleCompletions,
  type PuzzleStats,
  type OverviewStats,
} from '../../services/statsService';
import { fetchPublishedPuzzles } from '../../services/supabaseService';
import { getCharacter } from '../../data/characters';

// ============================================
// HELPERS
// ============================================

function getDateRange(range: '7d' | '30d' | '90d' | 'all'): { start?: string; end?: string } {
  if (range === 'all') return {};
  const now = new Date();
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: now.toISOString() };
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-stone-800 border border-stone-700 rounded px-4 py-2 text-center">
      <div className="text-lg font-bold text-parchment-100">{value}</div>
      <div className="text-xs text-stone-400 whitespace-nowrap">{label}</div>
      {sub && <div className="text-[10px] text-stone-600 whitespace-nowrap">{sub}</div>}
    </div>
  );
}

function HorizontalBar({ label, value, max, color = 'bg-copper-500', suffix = '' }: {
  label: string; value: number; max: number; color?: string; suffix?: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-stone-400 w-24 text-right truncate">{label}</span>
      <div className="flex-1 h-3 bg-stone-800 rounded-pixel overflow-hidden">
        <div className={`h-full rounded-pixel ${color}`} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
      <span className="text-xs text-stone-500 font-mono w-12 text-right">{value}{suffix}</span>
    </div>
  );
}

// ============================================
// OVERVIEW VIEW
// ============================================

const OverviewView: React.FC<{
  stats: OverviewStats;
  puzzleNames: Record<string, string>;
  onSelectPuzzle: (id: string) => void;
  timeRange: '7d' | '30d' | '90d' | 'all';
  onTimeRangeChange: (r: '7d' | '30d' | '90d' | 'all') => void;
}> = ({ stats, puzzleNames, onSelectPuzzle, timeRange, onTimeRangeChange }) => {
  const ranges: ('7d' | '30d' | '90d' | 'all')[] = ['7d', '30d', '90d', 'all'];
  const rangeLabels: Record<string, string> = { '7d': '7 Days', '30d': '30 Days', '90d': '90 Days', 'all': 'All Time' };

  return (
    <>
      {/* Summary + time range filter */}
      <div className="flex flex-wrap items-center gap-2">
        <StatCard label="Total Plays" value={stats.totalPlays.toLocaleString()} />
        <StatCard label="Unique Players" value={stats.uniquePlayers.toLocaleString()} />
        <StatCard
          label="Completion Rate"
          value={`${Math.round(stats.overallCompletionRate * 100)}%`}
          sub={`${stats.puzzlePlays.reduce((s, p) => s + Math.round(p.completionRate * p.plays), 0)} victories`}
        />
        <div className="ml-auto flex items-center gap-2">
          {ranges.map(r => (
            <button
              key={r}
              onClick={() => onTimeRangeChange(r)}
              className={`px-2 py-0.5 rounded text-xs border ${
                r === timeRange
                  ? 'bg-stone-700 text-parchment-100 border-arcane-500'
                  : 'text-stone-400 border-stone-700 hover:text-stone-200'
              }`}
            >
              {rangeLabels[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Per-Puzzle Table */}
      <section>
        <h2 className="text-lg font-medieval text-copper-400 mb-2">Per-Puzzle Breakdown</h2>
        <div className="overflow-x-auto border border-stone-700 rounded">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-800 text-stone-400 text-xs uppercase">
                <th className="text-left px-3 py-2">Puzzle</th>
                <th className="text-left px-2 py-2">Date</th>
                <th className="text-right px-2 py-2">Plays</th>
                <th className="text-right px-2 py-2">Completion</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {stats.puzzlePlays.map(p => (
                <tr key={p.puzzleId} className="border-t border-stone-700/60 hover:bg-stone-800/50">
                  <td className="px-3 py-1.5 text-parchment-100 truncate max-w-[200px]">
                    {puzzleNames[p.puzzleId] || p.puzzleId.slice(0, 8)}
                  </td>
                  <td className="px-2 py-1.5 text-stone-500 text-xs whitespace-nowrap">{p.puzzleDate || '—'}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-stone-300">{p.plays}</td>
                  <td className="px-2 py-1.5 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <div className="w-16 h-2 bg-stone-800 rounded-pixel overflow-hidden">
                        <div
                          className={`h-full rounded-pixel ${
                            p.completionRate >= 0.5 ? 'bg-moss-500' : p.completionRate >= 0.2 ? 'bg-yellow-600' : 'bg-blood-500'
                          }`}
                          style={{ width: `${Math.round(p.completionRate * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-stone-400 w-8">{Math.round(p.completionRate * 100)}%</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      onClick={() => onSelectPuzzle(p.puzzleId)}
                      className="text-xs text-copper-400 hover:text-copper-300 hover:underline"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
              {stats.puzzlePlays.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-stone-500">No play data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};

// ============================================
// PUZZLE DETAIL VIEW
// ============================================

const PuzzleDetailView: React.FC<{
  puzzleId: string;
  puzzleName: string;
  stats: PuzzleStats;
  onBack: () => void;
  onClear: (puzzleId: string) => void;
}> = ({ puzzleId, puzzleName, stats, onBack, onClear }) => {
  const rankColors: Record<string, string> = {
    gold: 'bg-yellow-500',
    silver: 'bg-stone-400',
    bronze: 'bg-amber-700',
  };

  const totalRanks = stats.rankDistribution.gold + stats.rankDistribution.silver + stats.rankDistribution.bronze;
  const maxHeroPicks = stats.heroPickRates.length > 0 ? stats.heroPickRates[0].count : 1;
  const maxDefeatCount = stats.commonDefeatReasons.length > 0 ? stats.commonDefeatReasons[0].count : 1;

  const defeatLabels: Record<string, string> = {
    damage: 'Heroes Fell',
    turns: 'Out of Turns',
    concede: 'Conceded',
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-stone-400 hover:text-copper-400 text-sm transition-colors"
        >
          &larr; Back to Overview
        </button>
        {stats.totalAttempts > 0 && (
          <button
            onClick={() => {
              if (window.confirm(`Clear all ${stats.totalAttempts} analytics record${stats.totalAttempts !== 1 ? 's' : ''} for "${puzzleName}"? This cannot be undone.`)) {
                onClear(puzzleId);
              }
            }}
            className="text-xs px-2 py-1 rounded border bg-red-900/40 text-red-300 border-red-700/50 hover:bg-red-900/60"
          >
            Clear Analytics
          </button>
        )}
      </div>

      <h2 className="text-lg font-medieval text-copper-400">{puzzleName}</h2>

      {stats.totalAttempts === 0 ? (
        <p className="text-stone-500 text-sm">No play data for this puzzle yet.</p>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Performance Overview */}
            <div className="border border-stone-700 rounded overflow-hidden">
              <div className="bg-stone-800 px-2 py-1.5 text-xs uppercase text-stone-400">Performance Overview</div>
              <div className="p-3 space-y-2 text-sm">
                <div className="flex justify-between text-stone-300">
                  <span>Total Attempts</span>
                  <span className="font-mono">{stats.totalAttempts}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-moss-300">Victories</span>
                  <span className="font-mono text-moss-300">
                    {stats.totalVictories} ({Math.round(stats.completionRate * 100)}%)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blood-400">Defeats</span>
                  <span className="font-mono text-blood-400">
                    {stats.totalDefeats} ({Math.round((1 - stats.completionRate) * 100)}%)
                  </span>
                </div>
                <div className="border-t border-stone-700 pt-2 mt-2" />
                <div className="flex justify-between text-stone-300">
                  <span>Avg Score</span>
                  <span className="font-mono text-copper-300">{stats.avgScore.toLocaleString()} pts</span>
                </div>
                <div className="flex justify-between text-stone-300">
                  <span>Avg Turns</span>
                  <span className="font-mono">{stats.avgTurns}</span>
                </div>
                <div className="flex justify-between text-stone-300">
                  <span>Avg Heroes Used</span>
                  <span className="font-mono">{stats.avgCharactersUsed}</span>
                </div>
              </div>
            </div>

            {/* Rank Distribution */}
            <div className="border border-stone-700 rounded overflow-hidden">
              <div className="bg-stone-800 px-2 py-1.5 text-xs uppercase text-stone-400">Rank Distribution</div>
              {totalRanks === 0 ? (
                <p className="text-stone-500 text-sm p-3">No victories yet.</p>
              ) : (
                <div className="space-y-2 p-3">
                  {(['gold', 'silver', 'bronze'] as const).map(rank => {
                    const count = stats.rankDistribution[rank];
                    const pct = totalRanks > 0 ? Math.round((count / totalRanks) * 100) : 0;
                    return (
                      <HorizontalBar
                        key={rank}
                        label={`${rank === 'gold' ? '🏆' : rank === 'silver' ? '🥈' : '🥉'} ${rank.charAt(0).toUpperCase() + rank.slice(1)}`}
                        value={pct}
                        max={100}
                        color={rankColors[rank]}
                        suffix="%"
                      />
                    );
                  })}
                  <div className="text-[10px] text-stone-600 text-right mt-1">{totalRanks} total victories</div>
                </div>
              )}
            </div>
          </div>

          {/* Second Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Hero Usage */}
            <div className="border border-stone-700 rounded overflow-hidden">
              <div className="bg-stone-800 px-2 py-1.5 text-xs uppercase text-stone-400">Most Popular Heroes</div>
              {stats.heroPickRates.length === 0 ? (
                <p className="text-stone-500 text-sm p-3">No hero data.</p>
              ) : (
                <div className="space-y-2 p-3">
                  {stats.heroPickRates.slice(0, 8).map(hero => {
                    const char = getCharacter(hero.characterId);
                    const name = char?.name || hero.characterId.slice(0, 12);
                    return (
                      <HorizontalBar
                        key={hero.characterId}
                        label={name}
                        value={hero.count}
                        max={maxHeroPicks}
                        color="bg-copper-500"
                        suffix={` (${Math.round(hero.percentage * 100)}%)`}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Defeat Analysis */}
            <div className="border border-stone-700 rounded overflow-hidden">
              <div className="bg-stone-800 px-2 py-1.5 text-xs uppercase text-stone-400">Defeat Analysis</div>
              {stats.totalDefeats === 0 ? (
                <p className="text-moss-300 text-sm p-3">No defeats recorded!</p>
              ) : (
                <div className="space-y-3 p-3">
                  <div className="space-y-2">
                    {stats.commonDefeatReasons.map(dr => (
                      <HorizontalBar
                        key={dr.reason}
                        label={defeatLabels[dr.reason] || dr.reason}
                        value={dr.count}
                        max={maxDefeatCount}
                        color="bg-blood-500"
                        suffix={` (${Math.round(dr.percentage * 100)}%)`}
                      />
                    ))}
                  </div>
                  {stats.avgDefeatTurn !== null && (
                    <div className="text-xs text-stone-400 border-t border-stone-700 pt-2">
                      Average defeat turn: <span className="font-mono text-blood-300">{stats.avgDefeatTurn}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
};

// ============================================
// MAIN DASHBOARD
// ============================================

export const StatsDashboard: React.FC = () => {
  const [view, setView] = useState<'overview' | 'puzzle'>('overview');
  const [selectedPuzzleId, setSelectedPuzzleId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [loading, setLoading] = useState(true);

  // Data
  const [overviewStats, setOverviewStats] = useState<OverviewStats | null>(null);
  const [puzzleNames, setPuzzleNames] = useState<Record<string, string>>({});
  const [puzzleStats, setPuzzleStats] = useState<PuzzleStats | null>(null);

  // Load published puzzle names for display
  useEffect(() => {
    fetchPublishedPuzzles().then(puzzles => {
      const names: Record<string, string> = {};
      for (const p of puzzles) names[p.id] = p.name;
      setPuzzleNames(names);
    });
  }, []);

  // Load overview stats
  const loadOverview = useCallback(async () => {
    setLoading(true);
    const { start, end } = getDateRange(timeRange);
    const data = await fetchOverviewStats(start, end);
    setOverviewStats(data);
    setLoading(false);
  }, [timeRange]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (view === 'overview') loadOverview();
  }, [view, loadOverview]);

  // Load puzzle detail stats
  const loadPuzzleDetail = useCallback(async (puzzleId: string) => {
    setLoading(true);
    const data = await fetchPuzzleStats(puzzleId);
    setPuzzleStats(data);
    setLoading(false);
  }, []);

  const handleSelectPuzzle = (puzzleId: string) => {
    setSelectedPuzzleId(puzzleId);
    setView('puzzle');
    loadPuzzleDetail(puzzleId);
  };

  const handleBack = () => {
    setView('overview');
    setSelectedPuzzleId(null);
    setPuzzleStats(null);
  };

  const handleClearAnalytics = async (puzzleId: string) => {
    const deleted = await clearPuzzleCompletions(puzzleId);
    if (deleted >= 0) {
      // Refresh the detail view to show empty state
      loadPuzzleDetail(puzzleId);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-stone-500 animate-pulse">Loading analytics...</div>
        </div>
      ) : view === 'overview' && overviewStats ? (
        <OverviewView
          stats={overviewStats}
          puzzleNames={puzzleNames}
          onSelectPuzzle={handleSelectPuzzle}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
        />
      ) : view === 'puzzle' && selectedPuzzleId && puzzleStats ? (
        <PuzzleDetailView
          puzzleId={selectedPuzzleId}
          puzzleName={puzzleNames[selectedPuzzleId] || selectedPuzzleId.slice(0, 8)}
          stats={puzzleStats}
          onBack={handleBack}
          onClear={handleClearAnalytics}
        />
      ) : (
        <div className="text-stone-500 text-sm">
          No analytics data available yet. Play some puzzles to generate data!
        </div>
      )}
    </div>
  );
};
