import React, { useState, useMemo } from 'react';
import type { Puzzle } from '../../types/game';
import type { TrackedRun, BugAssetType } from '../../types/bugReport';
import { submitBugReport } from '../../services/bugReportService';
import { getCharacter } from '../../data/characters';
import { getEnemy } from '../../data/enemies';
import { loadTileType, loadCollectible } from '../../utils/assetStorage';
import { toast } from '../shared/Toast';

const MAX_DESCRIPTION_LENGTH = 500;

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzle: Puzzle;
  trackedRuns: TrackedRun[];
}

export const BugReportModal: React.FC<BugReportModalProps> = ({ isOpen, onClose, puzzle, trackedRuns }) => {
  const [selectedRunId, setSelectedRunId] = useState<string>(() => {
    // Default to most recent run
    return trackedRuns.length > 0 ? trackedRuns[trackedRuns.length - 1].id : '';
  });
  const [assetType, setAssetType] = useState<BugAssetType | 'other' | ''>('');
  const [assetId, setAssetId] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Determine which asset types are present in this puzzle
  const availableAssetTypes = useMemo(() => {
    const types: { type: BugAssetType | 'other'; label: string }[] = [];
    types.push({ type: 'hero', label: 'Hero' });
    if (puzzle.enemies.length > 0) {
      types.push({ type: 'enemy', label: 'Enemy' });
    }
    // Check for custom tiles
    const hasCustomTiles = puzzle.tiles.some(row =>
      row.some(tile => tile && tile.customTileTypeId)
    );
    if (hasCustomTiles) {
      types.push({ type: 'tile', label: 'Tile' });
    }
    if (puzzle.collectibles.length > 0) {
      types.push({ type: 'item', label: 'Item' });
    }
    types.push({ type: 'other', label: 'Other / Not sure' });
    return types;
  }, [puzzle]);

  // Get specific assets for the selected type
  const specificAssets = useMemo(() => {
    if (!assetType || assetType === 'other') return [];

    switch (assetType) {
      case 'hero': {
        return puzzle.availableCharacters.map(id => {
          const char = getCharacter(id);
          return { id, name: char?.name || id };
        });
      }
      case 'enemy': {
        const seen = new Set<string>();
        return puzzle.enemies
          .filter(e => {
            if (seen.has(e.enemyId)) return false;
            seen.add(e.enemyId);
            return true;
          })
          .map(e => {
            const enemy = getEnemy(e.enemyId);
            return { id: e.enemyId, name: enemy?.name || e.enemyId };
          });
      }
      case 'tile': {
        const seen = new Set<string>();
        const tiles: { id: string; name: string }[] = [];
        for (const row of puzzle.tiles) {
          for (const tile of row) {
            if (tile?.customTileTypeId && !seen.has(tile.customTileTypeId)) {
              seen.add(tile.customTileTypeId);
              const tt = loadTileType(tile.customTileTypeId);
              tiles.push({ id: tile.customTileTypeId, name: tt?.name || tile.customTileTypeId });
            }
          }
        }
        return tiles;
      }
      case 'item': {
        const seen = new Set<string>();
        return puzzle.collectibles
          .filter(c => {
            if (seen.has(c.collectibleId)) return false;
            seen.add(c.collectibleId);
            return true;
          })
          .map(c => {
            const item = loadCollectible(c.collectibleId);
            return { id: c.collectibleId, name: item?.name || c.collectibleId };
          });
      }
      default:
        return [];
    }
  }, [assetType, puzzle]);

  const selectedRun = trackedRuns.find(r => r.id === selectedRunId);

  const handleSubmit = async () => {
    if (!selectedRun || !description.trim()) return;

    setSubmitting(true);

    const assetName = assetType && assetType !== 'other'
      ? specificAssets.find(a => a.id === assetId)?.name
      : undefined;

    const success = await submitBugReport({
      puzzleId: puzzle.id,
      puzzleName: puzzle.name,
      placements: selectedRun.placements,
      outcome: selectedRun.outcome,
      turnsUsed: selectedRun.turnsUsed,
      assetType: assetType && assetType !== 'other' ? assetType : undefined,
      assetId: assetId || undefined,
      assetName: assetName || undefined,
      description: description.trim(),
    });

    setSubmitting(false);

    if (success) {
      toast.success('Bug report submitted — thank you!');
      onClose();
    } else {
      toast.error('Failed to submit bug report. Please try again.');
    }
  };

  if (!isOpen) return null;

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="dungeon-panel p-5 max-w-md w-full max-h-[90vh] overflow-y-auto space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medieval text-copper-400 text-lg">Report a Bug</h3>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300 text-xl leading-none">&times;</button>
        </div>

        <p className="text-xs text-stone-400">
          Help us fix issues! Select the run where you saw the bug and tell us what went wrong.
        </p>

        {/* Run selector */}
        {trackedRuns.length > 0 && (
          <div className="space-y-1">
            <label className="text-sm font-bold text-copper-400">Which run?</label>
            <select
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="dungeon-select w-full"
            >
              {trackedRuns.map((run, i) => (
                <option key={run.id} value={run.id}>
                  Run #{i + 1} — {run.outcome} — {run.turnsUsed} turns — {formatTimeAgo(run.timestamp)}
                </option>
              ))}
            </select>
          </div>
        )}

        {trackedRuns.length === 0 && (
          <p className="text-sm text-yellow-400/80 bg-yellow-900/20 border border-yellow-800/30 rounded p-2">
            Play the puzzle first to track a run for the bug report.
          </p>
        )}

        {/* Asset type */}
        <div className="space-y-1">
          <label className="text-sm font-bold text-copper-400">What seems bugged?</label>
          <div className="flex flex-wrap gap-2">
            {availableAssetTypes.map(({ type, label }) => (
              <button
                key={type}
                onClick={() => { setAssetType(type); setAssetId(''); }}
                className={`px-3 py-1.5 text-xs font-bold rounded-pixel border ${
                  assetType === type
                    ? 'bg-copper-600/30 border-copper-500 text-copper-300'
                    : 'bg-stone-800/50 border-stone-600/50 text-stone-400 hover:border-stone-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Specific asset selector */}
        {assetType && assetType !== 'other' && specificAssets.length > 0 && (
          <div className="space-y-1">
            <label className="text-sm font-bold text-copper-400">Which one?</label>
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className="dungeon-select w-full"
            >
              <option value="">— Select —</option>
              {specificAssets.map(asset => (
                <option key={asset.id} value={asset.id}>{asset.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Description */}
        <div className="space-y-1">
          <label className="text-sm font-bold text-copper-400">Describe the bug</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
            placeholder="What seemed wrong? What did you expect to happen?"
            className="w-full bg-stone-900/70 border border-stone-600/50 rounded px-3 py-2 text-sm text-parchment-200 placeholder-stone-500 resize-none focus:outline-none focus:border-copper-500/50"
            rows={4}
          />
          <div className="text-right text-xs text-stone-500">
            {description.length}/{MAX_DESCRIPTION_LENGTH}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-1">
          <button onClick={onClose} className="dungeon-btn px-4 py-2 text-sm font-bold">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !selectedRun || !description.trim()}
            className="dungeon-btn-primary px-4 py-2 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  );
};
