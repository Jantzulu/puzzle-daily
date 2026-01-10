import React, { useState, useEffect, useRef } from 'react';
import {
  pushAllToCloud,
  pullFromCloud,
  getLastSyncTime,
  subscribeSyncStatus,
  type SyncStatus,
} from '../../utils/cloudSync';

interface CloudSyncButtonProps {
  onSyncComplete?: () => void;
}

export const CloudSyncButton: React.FC<CloudSyncButtonProps> = ({ onSyncComplete }) => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSync, setLastSync] = useState<Date | null>(getLastSyncTime());
  const [showDropdown, setShowDropdown] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmPull, setConfirmPull] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = subscribeSyncStatus((status) => {
      setSyncStatus(status);
      if (status === 'success' || status === 'error') {
        setLastSync(getLastSyncTime());
      }
    });
    return unsubscribe;
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setConfirmPull(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePush = async () => {
    setErrors([]);
    const result = await pushAllToCloud();
    if (!result.success) {
      setErrors(result.errors);
    } else {
      setShowDropdown(false);
    }
    onSyncComplete?.();
  };

  const handlePull = async () => {
    if (!confirmPull) {
      setConfirmPull(true);
      return;
    }
    setConfirmPull(false);
    setErrors([]);
    const result = await pullFromCloud();
    if (!result.success) {
      setErrors(result.errors);
    } else {
      setShowDropdown(false);
    }
    onSyncComplete?.();
  };

  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Never synced';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const isLoading = syncStatus === 'syncing';

  const statusColor = syncStatus === 'syncing' ? 'text-blue-400' :
                      syncStatus === 'success' ? 'text-green-400' :
                      syncStatus === 'error' ? 'text-red-400' : 'text-gray-400';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`flex items-center gap-2 px-3 py-2 rounded transition-colors bg-gray-700 hover:bg-gray-600 ${statusColor}`}
        title={`Cloud Sync - ${formatLastSync(lastSync)}`}
      >
        {isLoading ? (
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
          </svg>
        )}
        <span className="text-sm text-gray-300">Cloud</span>
        <svg className={`w-3 h-3 text-gray-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showDropdown && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
          <div className="p-3 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-white font-medium">Cloud Sync</span>
              <span className={`text-xs px-2 py-0.5 rounded ${
                syncStatus === 'syncing' ? 'bg-blue-600/30 text-blue-300' :
                syncStatus === 'success' ? 'bg-green-600/30 text-green-300' :
                syncStatus === 'error' ? 'bg-red-600/30 text-red-300' :
                'bg-gray-600/30 text-gray-400'
              }`}>
                {syncStatus === 'syncing' ? 'Syncing...' :
                 syncStatus === 'success' ? 'Synced' :
                 syncStatus === 'error' ? 'Error' : 'Ready'}
              </span>
            </div>
            <p className="text-gray-400 text-xs mt-1">
              Last sync: {formatLastSync(lastSync)}
            </p>
          </div>

          <div className="p-2 space-y-1">
            <button
              onClick={handlePush}
              disabled={isLoading}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-left ${
                isLoading
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}
            >
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Push to Cloud
            </button>

            <button
              onClick={handlePull}
              disabled={isLoading}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-left ${
                isLoading
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : confirmPull
                  ? 'bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-300'
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}
            >
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
              {confirmPull ? 'Click to Confirm Pull' : 'Pull from Cloud'}
            </button>
          </div>

          {confirmPull && (
            <div className="px-3 pb-2">
              <p className="text-yellow-400 text-xs">
                This will overwrite local data with cloud data.
              </p>
            </div>
          )}

          {errors.length > 0 && (
            <div className="p-2 border-t border-gray-700">
              <p className="text-red-400 text-xs font-medium mb-1">Errors:</p>
              <ul className="text-red-300 text-xs space-y-0.5 max-h-20 overflow-auto">
                {errors.slice(0, 3).map((err, i) => (
                  <li key={i} className="truncate">• {err}</li>
                ))}
                {errors.length > 3 && (
                  <li className="text-red-400">+{errors.length - 3} more</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
