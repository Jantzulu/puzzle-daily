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
  submit_review: 'text-amber-400',
  approve: 'text-green-400',
  request_changes: 'text-red-400',
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
  submit_review: '📋',
  approve: '✓',
  request_changes: '↩',
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
    : record.action === 'submit_review' ? 'submitted for review'
    : record.action === 'approve' ? 'approved'
    : record.action === 'request_changes' ? 'requested changes on'
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadActivity();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadActivity, 30000);
    return () => clearInterval(interval);
  }, [loadActivity]);

  if (loading) {
    return (
      <div className="text-center py-12 text-stone-500 text-sm">Loading activity...</div>
    );
  }

  if (activity.length === 0) {
    return (
      <div className="border border-stone-700 rounded p-6 text-center">
        <div className="text-2xl mb-1">📜</div>
        <div className="text-sm text-stone-400">No activity recorded yet.</div>
        <div className="text-xs text-stone-500 mt-1">Save, delete, or sync assets to see activity here.</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {/* A div, not an h3: `.theme-root h1-h4` size headings off the theme
            scale and outrank the utility class. */}
        <div className="text-lg font-medieval text-copper-400">Recent Activity</div>
        <span className="text-xs text-stone-500">{activity.length}</span>
        <button
          onClick={() => { setLoading(true); loadActivity(); }}
          className="ml-auto px-2 py-0.5 rounded border text-xs border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800"
        >
          ↻ Refresh
        </button>
      </div>

      <div className="border border-stone-700 rounded max-h-[calc(100vh-220px)] overflow-y-auto dense-scrollbar">
        {activity.map((record) => {
          const color = ACTION_COLORS[record.action] || 'text-stone-400';
          const icon = ACTION_ICONS[record.action] || '?';
          const name = record.display_name || 'Unknown';
          const initial = name.charAt(0).toUpperCase();
          const bgColor = avatarColor(name);

          return (
            <div
              key={record.id}
              className="flex items-start gap-2 px-2 py-1.5 border-t border-stone-700/60 first:border-t-0 hover:bg-stone-800/50 transition-colors"
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
                {!!(record.details && (record.details as Record<string, unknown>).notes) && (
                  <div className="text-[10px] text-stone-500 italic mt-0.5 truncate">
                    "{String((record.details as Record<string, unknown>).notes)}"
                  </div>
                )}
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
