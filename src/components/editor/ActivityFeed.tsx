import React, { useState, useEffect, useCallback } from 'react';
import { fetchRecentActivity, type ActivityRecord } from '../../services/activityLogService';

const ACTION_COLORS: Record<string, string> = {
  create: 'text-moss-400',
  update: 'text-arcane-400',
  delete: 'text-blood-400',
  publish: 'text-copper-400',
  unpublish: 'text-amber-400',
  batch_publish: 'text-copper-400',
  schedule: 'text-sky-400',
  unschedule: 'text-amber-400',
  sync_push: 'text-sky-400',
  sync_pull: 'text-amber-400',
};

const ACTION_ICONS: Record<string, string> = {
  create: '+',
  update: '~',
  delete: '×',
  publish: '▲',
  unpublish: '▼',
  batch_publish: '▲▲',
  schedule: '📅',
  unschedule: '📅',
  sync_push: '↑',
  sync_pull: '↓',
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatAction(record: ActivityRecord): string {
  const verb = record.action === 'create' ? 'created'
    : record.action === 'update' ? 'updated'
    : record.action === 'delete' ? 'deleted'
    : record.action === 'publish' ? 'published'
    : record.action === 'unpublish' ? 'unpublished'
    : record.action === 'batch_publish' ? 'batch published'
    : record.action === 'schedule' ? 'scheduled'
    : record.action === 'unschedule' ? 'unscheduled'
    : record.action === 'sync_push' ? 'pushed to cloud'
    : record.action === 'sync_pull' ? 'pulled from cloud'
    : record.action;

  const type = record.asset_type?.replace(/_/g, ' ') || '';
  const name = record.asset_name ? `"${record.asset_name}"` : '';

  return `${verb} ${type} ${name}`.trim();
}

// Deterministic color from name
function avatarColor(name: string): string {
  const colors = [
    'bg-copper-600', 'bg-arcane-600', 'bg-moss-600', 'bg-blood-600',
    'bg-purple-600', 'bg-amber-600', 'bg-teal-600', 'bg-indigo-600',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export const ActivityFeed: React.FC = () => {
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadActivity = useCallback(async () => {
    const data = await fetchRecentActivity(100);
    setActivity(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadActivity();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadActivity, 30000);
    return () => clearInterval(interval);
  }, [loadActivity]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-stone-400">
        Loading activity...
      </div>
    );
  }

  if (activity.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-stone-500">
        <div className="text-3xl mb-2">📜</div>
        <div>No activity recorded yet.</div>
        <div className="text-xs mt-1">Save, delete, or sync assets to see activity here.</div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-stone-300">Recent Activity</h3>
        <button
          onClick={() => { setLoading(true); loadActivity(); }}
          className="text-xs text-stone-500 hover:text-stone-300 transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-0.5 max-h-[calc(100vh-220px)] overflow-y-auto dungeon-scrollbar">
        {activity.map((record) => {
          const color = ACTION_COLORS[record.action] || 'text-stone-400';
          const icon = ACTION_ICONS[record.action] || '?';
          const name = record.display_name || 'Unknown';
          const initial = name.charAt(0).toUpperCase();
          const bgColor = avatarColor(name);

          return (
            <div
              key={record.id}
              className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-stone-800/50 transition-colors"
            >
              {/* Avatar */}
              <div className={`w-6 h-6 rounded-full ${bgColor} flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5`}>
                {initial}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="text-xs">
                  <span className="text-parchment-200 font-medium">{name}</span>
                  {' '}
                  <span className={color}>
                    <span className="font-mono mr-0.5">{icon}</span>
                    {formatAction(record)}
                  </span>
                </div>
                <div className="text-[10px] text-stone-600">
                  {formatRelativeTime(record.created_at)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
