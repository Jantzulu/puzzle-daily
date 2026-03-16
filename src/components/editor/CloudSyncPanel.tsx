import React, { useState, useEffect } from 'react';
import {
  pushAllToCloud,
  pullFromCloud,
  getLastSyncTime,
  isSyncInProgress,
  subscribeSyncStatus,
  type SyncStatus,
} from '../../utils/cloudSync';

interface CloudSyncPanelProps {
  onSyncComplete?: () => void;
}

export const CloudSyncPanel: React.FC<CloudSyncPanelProps> = ({ onSyncComplete }) => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSync, setLastSync] = useState<Date | null>(getLastSyncTime());
  const [errors, setErrors] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmPull, setConfirmPull] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeSyncStatus((status) => {
      setSyncStatus(status);
      if (status === 'success' || status === 'error') {
        setLastSync(getLastSyncTime());
      }
    });
    return unsubscribe;
  }, []);

  const handlePushToCloud = async () => {
    setErrors([]);
    setShowErrors(false);
    const result = await pushAllToCloud();
    if (!result.success) {
      setErrors(result.errors);
      setShowErrors(true);
    }
    onSyncComplete?.();
  };

  const handlePullFromCloud = async () => {
    if (!confirmPull) {
      setConfirmPull(true);
      return;
    }
    setConfirmPull(false);
    setErrors([]);
    setShowErrors(false);
    const result = await pullFromCloud();
    if (!result.success) {
      setErrors(result.errors);
      setShowErrors(true);
    }
    onSyncComplete?.();
  };

  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    return `${days} day${days === 1 ? '' : 's'} ago`;
  };

  const isLoading = syncStatus === 'syncing';

  return (
    <div className="bg-stone-800 rounded-lg p-4 border border-stone-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-parchment-100 font-semibold flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
          </svg>
          Cloud Sync
        </h3>
        <span className={`text-xs px-2 py-1 rounded ${
          syncStatus === 'syncing' ? 'bg-blue-600 text-blue-100' :
          syncStatus === 'success' ? 'bg-green-600 text-green-100' :
          syncStatus === 'error' ? 'bg-red-600 text-red-100' :
          'bg-stone-600 text-parchment-300'
        }`}>
          {syncStatus === 'syncing' ? 'Syncing...' :
           syncStatus === 'success' ? 'Synced' :
           syncStatus === 'error' ? 'Error' : 'Ready'}
        </span>
      </div>

      <p className="text-stone-400 text-sm mb-3">
        Last sync: {formatLastSync(lastSync)}
      </p>

      <div className="flex gap-2">
        <button
          onClick={handlePushToCloud}
          disabled={isLoading}
          className={`flex-1 px-3 py-2 rounded text-sm font-medium flex items-center justify-center gap-2 ${
            isLoading
              ? 'bg-stone-600 text-stone-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-parchment-100'
          }`}
        >
          {isLoading ? (
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          )}
          Push to Cloud
        </button>

        <button
          onClick={handlePullFromCloud}
          disabled={isLoading}
          className={`flex-1 px-3 py-2 rounded text-sm font-medium flex items-center justify-center gap-2 ${
            isLoading
              ? 'bg-stone-600 text-stone-400 cursor-not-allowed'
              : confirmPull
              ? 'bg-yellow-600 hover:bg-yellow-700 text-parchment-100'
              : 'bg-green-600 hover:bg-green-700 text-parchment-100'
          }`}
        >
          {isLoading ? (
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
          )}
          {confirmPull ? 'Confirm Pull' : 'Pull from Cloud'}
        </button>
      </div>

      {confirmPull && (
        <p className="text-yellow-400 text-xs mt-2">
          Warning: This will overwrite local data with cloud data. Click again to confirm.
          <button
            onClick={() => setConfirmPull(false)}
            className="ml-2 text-stone-400 hover:text-parchment-100 underline"
          >
            Cancel
          </button>
        </p>
      )}

      {showErrors && errors.length > 0 && (
        <div className="mt-3 p-2 bg-red-900/50 rounded border border-red-700">
          <div className="flex items-center justify-between mb-1">
            <span className="text-red-300 text-sm font-medium">Sync Errors:</span>
            <button
              onClick={() => setShowErrors(false)}
              className="text-red-400 hover:text-red-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <ul className="text-red-200 text-xs space-y-1">
            {errors.slice(0, 5).map((error, i) => (
              <li key={i}>• {error}</li>
            ))}
            {errors.length > 5 && (
              <li className="text-red-400">...and {errors.length - 5} more</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
