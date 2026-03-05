import React, { useState, useEffect } from 'react';
import { fetchCommunityStats, type CommunityComparison } from '../../services/statsService';
import type { PuzzleScore, RankTier } from '../../types/game';
import { getCharacter } from '../../data/characters';

interface CommunityStatsProps {
  puzzleId: string;
  playerScore: PuzzleScore;
  playerOutcome: 'victory' | 'defeat';
}

const rankColors: Record<string, string> = {
  gold: 'bg-yellow-500',
  silver: 'bg-stone-400',
  bronze: 'bg-amber-700',
};

const rankLabels: Record<string, string> = {
  gold: 'Gold',
  silver: 'Silver',
  bronze: 'Bronze',
};

function BarComparison({ label, yours, avg, suffix, higherIsBetter = true }: {
  label: string;
  yours: number;
  avg: number;
  suffix?: string;
  higherIsBetter?: boolean;
}) {
  const max = Math.max(yours, avg, 1);
  const yourPct = (yours / max) * 100;
  const avgPct = (avg / max) * 100;
  const isBetter = higherIsBetter ? yours >= avg : yours <= avg;

  return (
    <div>
      <div className="text-xs text-stone-400 mb-1">{label}</div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-copper-300 w-8 text-right">You</span>
          <div className="flex-1 h-3 bg-stone-800 rounded-pixel overflow-hidden">
            <div className="h-full bg-copper-500 rounded-pixel transition-all" style={{ width: `${yourPct}%` }} />
          </div>
          <span className={`text-xs font-mono w-16 text-right ${isBetter ? 'text-moss-300' : 'text-blood-400'}`}>
            {yours.toLocaleString()}{suffix || ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-stone-500 w-8 text-right">Avg</span>
          <div className="flex-1 h-3 bg-stone-800 rounded-pixel overflow-hidden">
            <div className="h-full bg-stone-600 rounded-pixel transition-all" style={{ width: `${avgPct}%` }} />
          </div>
          <span className="text-xs font-mono text-stone-500 w-16 text-right">
            {avg.toLocaleString()}{suffix || ''}
          </span>
        </div>
      </div>
    </div>
  );
}

export const CommunityStats: React.FC<CommunityStatsProps> = ({
  puzzleId,
  playerScore,
  playerOutcome,
}) => {
  const [stats, setStats] = useState<CommunityComparison | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCommunityStats(puzzleId).then(data => {
      if (data) {
        data.yourScore = playerScore.totalPoints;
        data.yourTurns = playerScore.stats.turnsUsed;
        data.yourRank = playerScore.rank;
      }
      setStats(data);
      setLoading(false);
    });
  }, [puzzleId, playerScore]);

  if (loading) {
    return (
      <div className="text-xs text-stone-500 animate-pulse mt-3">
        Loading community stats...
      </div>
    );
  }

  if (!stats || stats.totalPlayers < 2) {
    return null;
  }

  const totalRanks = stats.rankDistribution.gold + stats.rankDistribution.silver + stats.rankDistribution.bronze;

  return (
    <details className="mt-3 bg-stone-800/50 rounded-pixel p-3 border border-stone-700 text-left">
      <summary className="text-copper-200 font-medieval text-sm cursor-pointer hover:text-copper-300 transition-colors">
        You vs. The Community
      </summary>

      <div className="mt-3 space-y-4">
        {/* Completion Rate */}
        <div>
          <div className="text-xs text-stone-300">
            <span className="text-moss-300 font-bold">{stats.completionRate}%</span> of adventurers conquered this puzzle
          </div>
          <div className="text-[10px] text-stone-600 mt-0.5">
            {stats.totalPlayers} total attempts
          </div>
        </div>

        {/* Score Comparison (victory only) */}
        {playerOutcome === 'victory' && (
          <BarComparison
            label="Score"
            yours={stats.yourScore}
            avg={stats.avgScore}
            suffix=" pts"
            higherIsBetter={true}
          />
        )}

        {/* Turns Comparison */}
        <BarComparison
          label="Turns Used"
          yours={stats.yourTurns}
          avg={stats.avgTurns}
          higherIsBetter={false}
        />

        {/* Rank Distribution (victory only) */}
        {playerOutcome === 'victory' && totalRanks > 0 && (
          <div>
            <div className="text-xs text-stone-400 mb-1.5">Rank Distribution</div>
            <div className="space-y-1">
              {(['gold', 'silver', 'bronze'] as const).map(rank => {
                const count = stats.rankDistribution[rank];
                const pct = totalRanks > 0 ? Math.round((count / totalRanks) * 100) : 0;
                const isYours = stats.yourRank === rank;

                return (
                  <div key={rank} className={`flex items-center gap-2 ${isYours ? 'bg-stone-700/50 -mx-1 px-1 rounded' : ''}`}>
                    <span className="text-[10px] w-12 text-right" style={{
                      color: rank === 'gold' ? '#EAB308' : rank === 'silver' ? '#9CA3AF' : '#B45309'
                    }}>
                      {rankLabels[rank]}{isYours ? ' ★' : ''}
                    </span>
                    <div className="flex-1 h-2.5 bg-stone-800 rounded-pixel overflow-hidden">
                      <div className={`h-full rounded-pixel ${rankColors[rank]}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] text-stone-500 w-8 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Popular Heroes */}
        {stats.heroPickRates.length > 0 && (
          <div>
            <div className="text-xs text-stone-400 mb-1.5">Most Popular Heroes</div>
            <div className="flex flex-wrap gap-2">
              {stats.heroPickRates.map(hero => {
                const char = getCharacter(hero.characterId);
                const name = char?.name || hero.characterId;
                const pct = Math.round(hero.percentage * 100);

                return (
                  <div key={hero.characterId} className="flex items-center gap-1.5 bg-stone-800/80 rounded-pixel px-2 py-1 border border-stone-700/50">
                    <span className="text-xs text-copper-300 truncate max-w-[80px]">{name}</span>
                    <span className="text-[10px] text-stone-500">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </details>
  );
};
