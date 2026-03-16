import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchOverviewStats,
  fetchPuzzleStats,
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
    <div className="dungeon-panel p-4 text-center">
      <div className="text-2xl font-bold text-copper-300 font-medieval">{value}</div>
      <div className="text-xs text-stone-400 mt-1">{label}</div>
      {sub && <div className="text-[10px] text-stone-600 mt-0.5">{sub}</div>}
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
      {/* Time Range Filter */}
      <div className="flex gap-2 mt-4 flex-wrap">
        {ranges.map(r => (
          <button
            key={r}
            onClick={() => onTimeRangeChange(r)}
            className={`px-3 py-1.5 text-xs font-bold rounded-pixel transition-colors ${
              r === timeRange ? 'dungeon-btn-primary' : 'dungeon-btn'
            }`}
          >
            {rangeLabels[r]}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        <StatCard label="Total Plays" value={stats.totalPlays.toLocaleString()} />
        <StatCard label="Unique Players" value={stats.uniquePlayers.toLocaleString()} />
        <StatCard
          label="Completion Rate"
          value={`${Math.round(stats.overallCompletionRate * 100)}%`}
          sub={`${stats.puzzlePlays.reduce((s, p) => s + Math.round(p.completionRate * p.plays), 0)} victories`}
        />
      </div>

      {/* Per-Puzzle Table */}
      <div className="dungeon-panel p-4 mt-6">
        <h2 className="font-medieval text-copper-300 text-lg mb-3">Per-Puzzle Breakdown</h2>

        {stats.puzzlePlays.length === 0 ? (
          <p className="text-stone-500 text-sm">No play data yet.</p>
        ) : (
          <div className="overflow-x-auto dungeon-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-700 text-stone-400 text-xs">
                  <th className="text-left py-2 px-2">Puzzle</th>
                  <th className="text-left py-2 px-2">Date</th>
                  <th className="text-right py-2 px-2">Plays</th>
                  <th className="text-right py-2 px-2">Completion</th>
                  <th className="text-right py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {stats.puzzlePlays.map(p => (
                  <tr key={p.puzzleId} className="border-b border-stone-800 hover:bg-stone-800/50">
                    <td className="py-2 px-2 text-copper-200 truncate max-w-[200px]">
                      {puzzleNames[p.puzzleId] || p.puzzleId.slice(0, 8)}
                    </td>
                    <td className="py-2 px-2 text-stone-500">{p.puzzleDate || '-'}</td>
                    <td className="py-2 px-2 text-right font-mono text-stone-300">{p.plays}</td>
                    <td className="py-2 px-2 text-right">
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
                    <td className="py-2 px-2 text-right">
                      <button
                        onClick={() => onSelectPuzzle(p.puzzleId)}
                        className="text-xs text-copper-400 hover:text-copper-300 underline"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
}> = ({ puzzleName, stats, onBack }) => {
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
      <button
        onClick={onBack}
        className="text-stone-400 hover:text-copper-400 text-sm transition-colors"
      >
        &larr; Back to Overview
      </button>

      <h2 className="font-medieval text-copper-400 text-xl mt-2">{puzzleName}</h2>

      {stats.totalAttempts === 0 ? (
        <p className="text-stone-500 text-sm mt-4">No play data for this puzzle yet.</p>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            {/* Performance Overview */}
            <div className="dungeon-panel p-4">
              <h3 className="font-medieval text-copper-300 text-base mb-3">Performance Overview</h3>
              <div className="space-y-2 text-sm">
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
            <div className="dungeon-panel p-4">
              <h3 className="font-medieval text-copper-300 text-base mb-3">Rank Distribution</h3>
              {totalRanks === 0 ? (
                <p className="text-stone-500 text-sm">No victories yet.</p>
              ) : (
                <div className="space-y-2">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            {/* Hero Usage */}
            <div className="dungeon-panel p-4">
              <h3 className="font-medieval text-copper-300 text-base mb-3">Most Popular Heroes</h3>
              {stats.heroPickRates.length === 0 ? (
                <p className="text-stone-500 text-sm">No hero data.</p>
              ) : (
                <div className="space-y-2">
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
            <div className="dungeon-panel p-4">
              <h3 className="font-medieval text-copper-300 text-base mb-3">Defeat Analysis</h3>
              {stats.totalDefeats === 0 ? (
                <p className="text-moss-300 text-sm">No defeats recorded!</p>
              ) : (
                <div className="space-y-3">
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

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pb-24">
      <h1 className="text-2xl font-medieval text-copper-400 text-shadow-dungeon">
        Puzzle Analytics
      </h1>
      <p className="text-stone-500 text-sm mt-1">
        Track completion rates, player behavior, and puzzle difficulty
      </p>

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
        />
      ) : (
        <div className="text-stone-500 text-sm mt-8">
          No analytics data available yet. Play some puzzles to generate data!
        </div>
      )}
    </div>
  );
};
