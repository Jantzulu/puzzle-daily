import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchPlayerStats } from '../../services/statsService';
import type { PlayerStats } from '../../services/statsService';
import { getPlayerId } from '../../utils/playerId';
import { getCharacter } from '../../data/characters';

const AVATAR_COLORS = [
  'bg-copper-600', 'bg-arcane-600', 'bg-moss-600', 'bg-blood-600',
  'bg-purple-600', 'bg-amber-600', 'bg-teal-600', 'bg-indigo-600',
];

function parseAvatar(profile: { display_name: string; avatar_url?: string | null }) {
  if (profile.avatar_url?.includes(':')) {
    const [icon, colorIdx] = profile.avatar_url.split(':');
    return { icon, color: AVATAR_COLORS[parseInt(colorIdx) || 0] || AVATAR_COLORS[0] };
  }
  let hash = 0;
  for (let i = 0; i < profile.display_name.length; i++) hash = profile.display_name.charCodeAt(i) + ((hash << 5) - hash);
  return { icon: profile.display_name.charAt(0).toUpperCase(), color: AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] };
}

export const ProfilePage: React.FC = () => {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const playerId = getPlayerId();
    fetchPlayerStats(user.id, playerId).then(data => {
      setStats(data);
      setLoading(false);
    });
  }, [user]);

  if (!profile) {
    return (
      <div className="min-h-screen theme-root flex items-center justify-center">
        <div className="text-stone-400 font-medieval text-lg animate-pulse">Loading...</div>
      </div>
    );
  }

  const avatar = parseAvatar(profile);

  return (
    <div className="min-h-screen theme-root px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="dungeon-panel p-6 flex items-center gap-4">
          <div className={`w-16 h-16 rounded-pixel ${avatar.color} flex items-center justify-center text-2xl shrink-0`}>
            {avatar.icon}
          </div>
          <div>
            <h1 className="font-medieval text-copper-400 text-2xl">{profile.display_name}</h1>
            <p className="text-xs text-stone-500">
              Member since {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="dungeon-panel p-8 text-center">
            <div className="text-stone-400 font-medieval animate-pulse">Loading stats...</div>
          </div>
        ) : !stats || stats.totalPuzzles === 0 ? (
          <div className="dungeon-panel p-8 text-center">
            <p className="text-stone-400 font-medieval text-lg mb-2">No puzzles played yet</p>
            <p className="text-stone-500 text-sm">Play the daily puzzle to start building your stats!</p>
          </div>
        ) : (
          <>
            {/* Overview Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Puzzles Played" value={stats.totalPuzzles} />
              <StatCard label="Victories" value={stats.victories} accent="text-green-400" />
              <StatCard label="Win Rate" value={`${stats.winRate}%`} />
              <StatCard label="Avg Score" value={stats.avgScore} accent="text-amber-400" />
            </div>

            {/* Ranks & Streaks */}
            <div className="dungeon-panel p-5 space-y-4">
              <h2 className="font-medieval text-copper-400 text-lg">Ranks Earned</h2>
              <div className="flex gap-6">
                <RankBadge emoji="🥇" label="Gold" count={stats.goldCount} />
                <RankBadge emoji="🥈" label="Silver" count={stats.silverCount} />
                <RankBadge emoji="🥉" label="Bronze" count={stats.bronzeCount} />
              </div>

              <div className="border-t border-stone-700 pt-4 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-stone-500 uppercase tracking-wider">Current Streak</div>
                  <div className="text-2xl font-bold text-parchment-200">
                    {stats.currentStreak} <span className="text-sm text-stone-400">day{stats.currentStreak !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-stone-500 uppercase tracking-wider">Best Streak</div>
                  <div className="text-2xl font-bold text-amber-400">
                    {stats.bestStreak} <span className="text-sm text-stone-400">day{stats.bestStreak !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance */}
            <div className="dungeon-panel p-5 space-y-3">
              <h2 className="font-medieval text-copper-400 text-lg">Performance</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-stone-500">Avg Turns:</span>{' '}
                  <span className="text-parchment-200 font-bold">{stats.avgTurns}</span>
                </div>
                <div>
                  <span className="text-stone-500">Defeats:</span>{' '}
                  <span className="text-red-400 font-bold">{stats.defeats}</span>
                </div>
              </div>
            </div>

            {/* Favorite Heroes */}
            {stats.favoriteHeroes.length > 0 && (
              <div className="dungeon-panel p-5 space-y-3">
                <h2 className="font-medieval text-copper-400 text-lg">Favorite Heroes</h2>
                <div className="space-y-2">
                  {stats.favoriteHeroes.map(hero => {
                    const char = getCharacter(hero.id);
                    const name = char?.name || hero.id;
                    const maxCount = stats.favoriteHeroes[0].count;
                    const pct = maxCount > 0 ? (hero.count / maxCount) * 100 : 0;
                    return (
                      <div key={hero.id} className="flex items-center gap-3">
                        <span className="text-sm text-parchment-200 w-24 truncate">{name}</span>
                        <div className="flex-1 h-3 bg-stone-800 rounded-pixel overflow-hidden">
                          <div
                            className="h-full bg-copper-500/60 rounded-pixel transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-stone-400 w-8 text-right">{hero.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="dungeon-panel p-4 text-center">
      <div className={`text-2xl font-bold ${accent || 'text-parchment-200'}`}>{value}</div>
      <div className="text-xs text-stone-500 mt-1">{label}</div>
    </div>
  );
}

function RankBadge({ emoji, label, count }: { emoji: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xl">{emoji}</span>
      <div>
        <div className="text-lg font-bold text-parchment-200">{count}</div>
        <div className="text-xs text-stone-500">{label}</div>
      </div>
    </div>
  );
}
