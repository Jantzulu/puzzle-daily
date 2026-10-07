import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchPlayerStats } from '../../services/statsService';
import type { PlayerStats } from '../../services/statsService';
import { getPlayerId } from '../../utils/playerId';
import { getCharacter } from '../../data/characters';
import { toast } from '../shared/Toast';
import { PRIVACY_CONTACT_EMAIL } from '../../utils/privacyContact';

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

        <DeleteAccountPanel isTeam={profile.role !== 'player'} />
      </div>
    </div>
  );
};

/**
 * Self-service account deletion (pre-launch privacy work, 2026-10-07): a
 * player can permanently delete their account and the results saved to it
 * (RPC delete_own_account, migration 014). Two steps — the button only opens
 * a confirmation. Team accounts are refused by the RPC too; here they get a
 * note instead of the button.
 */
function DeleteAccountPanel({ isTeam }: { isTeam: boolean }) {
  const { deleteAccount, signOut } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleDelete = async () => {
    setBusy(true);
    setFailed(false);
    const { error } = await deleteAccount();
    if (error) {
      setBusy(false);
      setFailed(true);
      return;
    }
    // Leave this protected page BEFORE dropping the session — ProtectedRoute
    // would otherwise bounce to /login. The server session went with the
    // account, so the sign-out is local only.
    navigate('/', { replace: true });
    await signOut('local');
    toast.success('Your account has been deleted.');
  };

  return (
    <div className="dungeon-panel p-5 space-y-3">
      <h2 className="font-medieval text-copper-400 text-lg">Delete account</h2>
      {isTeam ? (
        <p className="text-sm text-stone-400">
          Team accounts can't be deleted here. Ask an admin to remove this one.
        </p>
      ) : !confirming ? (
        <>
          <p className="text-sm text-stone-400">
            Permanently delete your account and the puzzle results saved to it.
          </p>
          <button type="button" onClick={() => setConfirming(true)} className="dungeon-btn-danger px-4 py-2 text-sm">
            Delete account
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-parchment-200">
            This removes your account, your profile and every result saved to it,
            and can't be undone. Progress stored on this device stays until you
            clear your browser's site data.
          </p>
          {failed && (
            <p role="alert" className="text-sm text-blood-300">
              We couldn't delete your account just now. Try again, or email{' '}
              <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="text-copper-400 underline">{PRIVACY_CONTACT_EMAIL}</a>
              {' '}and we'll do it for you.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={handleDelete} disabled={busy} className="dungeon-btn-danger px-4 py-2 text-sm disabled:opacity-60">
              {busy ? 'Deleting…' : 'Yes, delete my account'}
            </button>
            <button type="button" onClick={() => { setConfirming(false); setFailed(false); }} disabled={busy} className="dungeon-btn px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

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
