import React, { useState, useEffect, useCallback } from 'react';
import { createVersionSnapshot, fetchVersionHistory, deleteVersion } from '../../services/versionService';
import type { AssetVersion } from '../../services/versionService';
import { toast } from '../shared/Toast';

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetId: string;
  assetType: string;
  assetName: string;
  currentData: object;
  onRestore: (data: object) => void;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  isOpen,
  onClose,
  assetId,
  assetType,
  assetName,
  currentData,
  onRestore,
}) => {
  const [versions, setVersions] = useState<AssetVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    const history = await fetchVersionHistory(assetId);
    setVersions(history);
    setLoading(false);
  }, [assetId]);

  useEffect(() => {
    if (isOpen) {
      loadVersions();
      setConfirmDelete(null);
      setConfirmRestore(null);
    }
  }, [isOpen, loadVersions]);

  if (!isOpen) return null;

  const handleSaveVersion = async () => {
    setSaving(true);
    const result = await createVersionSnapshot(assetId, assetType, assetName, currentData);
    if (result.success) {
      toast.success(`Saved version #${result.versionNumber}`);
      await loadVersions();
    } else {
      toast.error('Failed to save version');
    }
    setSaving(false);
  };

  const handleRestore = (version: AssetVersion) => {
    onRestore(version.data);
    toast.success(`Restored version #${version.version_number}`);
    setConfirmRestore(null);
    onClose();
  };

  const handleDelete = async (versionNumber: number) => {
    const success = await deleteVersion(assetId, versionNumber);
    if (success) {
      toast.success(`Deleted version #${versionNumber}`);
      setConfirmDelete(null);
      await loadVersions();
    } else {
      toast.error('Failed to delete version');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-stone-900 border border-stone-700 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-stone-700">
          <h2 className="text-lg font-bold">Version History</h2>
          <p className="text-sm text-stone-400 mt-1 truncate">
            {assetName} &middot; {versions.length} version{versions.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Save button */}
        <div className="px-4 pt-3">
          <button
            onClick={handleSaveVersion}
            disabled={saving}
            className={`w-full px-3 py-2 rounded text-sm font-medium border ${
              saving
                ? 'bg-stone-700 text-stone-400 border-stone-600 cursor-wait'
                : 'bg-copper-600/20 hover:bg-copper-600/30 text-copper-300 border-copper-500/30'
            }`}
          >
            {saving ? 'Saving...' : '📸 Save Current Version'}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <p className="text-stone-500 text-sm text-center py-8 animate-pulse">Loading versions...</p>
          ) : versions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-stone-500 text-sm">No versions saved yet.</p>
              <p className="text-stone-600 text-xs mt-1">Click "Save Current Version" to create a snapshot.</p>
            </div>
          ) : (
            versions.map(version => (
              <div
                key={version.version_number}
                className="bg-stone-800/60 border border-stone-700/50 rounded px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-copper-400">v{version.version_number}</span>
                  <span className="text-xs text-stone-500">{formatRelativeTime(version.created_at)}</span>
                  <span className="text-xs text-stone-600 truncate ml-auto">{version.name}</span>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-2">
                  {confirmRestore === version.version_number ? (
                    <>
                      <span className="text-xs text-amber-400 self-center">Restore this version?</span>
                      <button
                        onClick={() => handleRestore(version)}
                        className="px-2 py-1 text-xs bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 rounded border border-amber-500/30"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmRestore(null)}
                        className="px-2 py-1 text-xs bg-stone-700 hover:bg-stone-600 text-stone-300 rounded"
                      >
                        No
                      </button>
                    </>
                  ) : confirmDelete === version.version_number ? (
                    <>
                      <span className="text-xs text-red-400 self-center">Delete this version?</span>
                      <button
                        onClick={() => handleDelete(version.version_number)}
                        className="px-2 py-1 text-xs bg-red-600/30 hover:bg-red-600/50 text-red-300 rounded border border-red-500/30"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="px-2 py-1 text-xs bg-stone-700 hover:bg-stone-600 text-stone-300 rounded"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setConfirmRestore(version.version_number)}
                        className="px-2 py-1 text-xs bg-stone-700 hover:bg-stone-600 text-stone-300 rounded"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => setConfirmDelete(version.version_number)}
                        className="px-2 py-1 text-xs bg-stone-700/50 hover:bg-red-900/30 text-stone-500 hover:text-red-400 rounded"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-stone-700 rounded hover:bg-stone-600 text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
