import React from 'react';
import type { SyncConflict } from '../../utils/syncTracker';

interface ConflictResolutionModalProps {
  conflicts: SyncConflict[];
  onResolve: (id: string, resolution: 'keep_local' | 'accept_cloud') => void;
  onResolveAll: (resolution: 'keep_local' | 'accept_cloud') => void;
  onClose: () => void;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  conflicts,
  onResolve,
  onResolveAll,
  onClose,
}) => {
  if (conflicts.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="dungeon-panel max-w-lg w-full p-5 max-h-[80vh] flex flex-col">
        <h2 className="text-lg font-medieval text-copper-400 mb-1">Sync Conflicts</h2>
        <p className="text-stone-400 text-xs mb-3">
          These assets were modified both locally and in the cloud. Choose which version to keep.
        </p>

        {/* Bulk actions */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => onResolveAll('keep_local')}
            className="flex-1 px-3 py-1.5 bg-arcane-700 hover:bg-arcane-600 rounded text-xs text-parchment-100 transition-colors"
          >
            Keep All Local
          </button>
          <button
            onClick={() => onResolveAll('accept_cloud')}
            className="flex-1 px-3 py-1.5 bg-moss-700 hover:bg-moss-600 rounded text-xs text-parchment-100 transition-colors"
          >
            Accept All Cloud
          </button>
        </div>

        {/* Conflict list */}
        <div className="flex-1 overflow-y-auto dungeon-scrollbar space-y-2">
          {conflicts.map((conflict) => (
            <div key={conflict.id} className="bg-stone-800/60 rounded p-3 border border-stone-700">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-sm text-parchment-100 font-medium">{conflict.name}</span>
                  <span className="text-xs text-stone-500 ml-2">{conflict.type.replace(/_/g, ' ')}</span>
                </div>
              </div>
              <div className="flex gap-4 text-xs text-stone-400 mb-2">
                <div>
                  <span className="text-arcane-400">Local:</span>{' '}
                  {formatTime(conflict.localModifiedAt)}
                </div>
                <div>
                  <span className="text-moss-400">Cloud:</span>{' '}
                  {formatTime(conflict.cloudUpdatedAt)}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onResolve(conflict.id, 'keep_local')}
                  className="px-2 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-xs transition-colors"
                >
                  Keep Mine
                </button>
                <button
                  onClick={() => onResolve(conflict.id, 'accept_cloud')}
                  className="px-2 py-1 bg-moss-700 hover:bg-moss-600 rounded text-xs transition-colors"
                >
                  Pull Theirs
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex justify-end">
          <button
            onClick={onClose}
            className="dungeon-btn px-4 py-1.5 text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
