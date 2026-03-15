import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { Puzzle } from '../../types/game';
import type { TrackedRun, BugAssetType } from '../../types/bugReport';
import { submitBugReport } from '../../services/bugReportService';
import { getCharacter } from '../../data/characters';
import { getEnemy } from '../../data/enemies';
import { loadTileType, loadCollectible, loadSpellAsset } from '../../utils/assetStorage';
import { toast } from '../shared/Toast';
import { MiniGridPreview } from './MiniGridPreview';
import { BugReportReplay } from '../editor/BugReportReplay';
import type { StatusEffect } from '../../types/game';

const MAX_DESCRIPTION_LENGTH = 500;

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzle: Puzzle;
  trackedRuns: TrackedRun[];
}

export const BugReportModal: React.FC<BugReportModalProps> = ({ isOpen, onClose, puzzle, trackedRuns }) => {
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [assetType, setAssetType] = useState<BugAssetType | 'other' | ''>('');
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [replayingRunId, setReplayingRunId] = useState<string | null>(null);

  const handleDismiss = useCallback(() => {
    setDismissing(true);
    setTimeout(() => {
      setDismissing(false);
      onClose();
    }, 250);
  }, [onClose]);

  // Keep selectedRunId in sync with trackedRuns — default to most recent
  useEffect(() => {
    if (trackedRuns.length > 0) {
      const lastRun = trackedRuns[trackedRuns.length - 1];
      if (!selectedRunId || !trackedRuns.find(r => r.id === selectedRunId)) {
        setSelectedRunId(lastRun.id);
      }
    }
  }, [trackedRuns, selectedRunId]);

  // Collect all spell IDs used by heroes and enemies in this puzzle
  const puzzleSpells = useMemo(() => {
    const spellIds = new Set<string>();
    // Hero spells
    for (const charId of puzzle.availableCharacters) {
      const char = getCharacter(charId);
      if (char?.behavior) {
        for (const action of char.behavior) {
          if (action.spellId) spellIds.add(action.spellId);
        }
      }
    }
    // Enemy spells
    for (const enemy of puzzle.enemies) {
      const enemyData = getEnemy(enemy.enemyId);
      if (enemyData?.behavior?.pattern) {
        for (const action of enemyData.behavior.pattern) {
          if (action.spellId) spellIds.add(action.spellId);
        }
      }
    }
    // Load all spells and collect status effects
    const effectsInPuzzle: { id: StatusEffect; name: string }[] = [];
    const seenEffects = new Set<string>();
    for (const sid of spellIds) {
      const spell = loadSpellAsset(sid);
      if (spell?.statusEffect && !seenEffects.has(spell.statusEffect)) {
        seenEffects.add(spell.statusEffect);
        // Capitalize the effect name for display
        const name = spell.statusEffect.charAt(0).toUpperCase() + spell.statusEffect.slice(1);
        effectsInPuzzle.push({ id: spell.statusEffect as StatusEffect, name });
      }
    }
    return { spellIds, effectsInPuzzle };
  }, [puzzle]);

  // Determine which asset types are present in this puzzle
  const availableAssetTypes = useMemo(() => {
    const types: { type: BugAssetType | 'other'; label: string }[] = [];
    types.push({ type: 'hero', label: 'Hero' });
    if (puzzle.enemies.length > 0) {
      types.push({ type: 'enemy', label: 'Enemy' });
    }
    const hasCustomTiles = puzzle.tiles.some(row =>
      row.some(tile => tile && tile.customTileTypeId)
    );
    if (hasCustomTiles) {
      types.push({ type: 'tile', label: 'Tile' });
    }
    if (puzzle.collectibles.length > 0) {
      types.push({ type: 'item', label: 'Item' });
    }
    if (puzzleSpells.effectsInPuzzle.length > 0) {
      types.push({ type: 'enchantment', label: 'Enchantment' });
    }
    types.push({ type: 'other', label: 'Other / Not sure' });
    return types;
  }, [puzzle, puzzleSpells]);

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
      case 'enchantment': {
        return puzzleSpells.effectsInPuzzle.map(e => ({
          id: e.id,
          name: e.name,
        }));
      }
      default:
        return [];
    }
  }, [assetType, puzzle]);

  const selectedRun = trackedRuns.find(r => r.id === selectedRunId);
  const replayingRun = replayingRunId ? trackedRuns.find(r => r.id === replayingRunId) : null;

  const toggleAssetId = (id: string) => {
    setAssetIds(prev =>
      prev.includes(id)
        ? prev.filter(a => a !== id)
        : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (!selectedRun || !description.trim()) return;

    setSubmitting(true);

    const selectedNames = assetIds
      .map(id => specificAssets.find(a => a.id === id)?.name)
      .filter(Boolean)
      .join(', ');

    const success = await submitBugReport({
      puzzleId: puzzle.id,
      puzzleName: puzzle.name,
      placements: selectedRun.placements,
      outcome: selectedRun.outcome,
      turnsUsed: selectedRun.turnsUsed,
      assetType: assetType && assetType !== 'other' ? assetType : undefined,
      assetId: assetIds.length > 0 ? assetIds.join(',') : undefined,
      assetName: selectedNames || undefined,
      description: description.trim(),
    });

    setSubmitting(false);

    if (success) {
      toast.success('Bug report submitted — thank you!');
      handleDismiss();
    } else {
      toast.error('Failed to submit bug report. Please try again.');
    }
  };

  if (!isOpen) return null;

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  // Replay mode — replace modal content with replay viewer
  if (replayingRun) {
    const runIndex = trackedRuns.findIndex(r => r.id === replayingRunId);
    return (
      <div className="fixed inset-0 bg-black/85 z-50 flex flex-col items-center justify-center p-4 animate-overlay-fade-in">
        <div className="text-center mb-3">
          <h3 className="font-medieval text-copper-400 text-lg">
            Replaying Run #{runIndex + 1} {replayingRun.outcome === 'victory' ? '\uD83C\uDFC6' : '\uD83D\uDC80'}
          </h3>
          <p className="text-xs text-stone-500">
            {replayingRun.turnsUsed} turn{replayingRun.turnsUsed !== 1 ? 's' : ''} &middot; {formatTimeAgo(replayingRun.timestamp)}
          </p>
        </div>
        <div className="w-full max-w-[900px]">
          <BugReportReplay
            puzzle={puzzle}
            placements={replayingRun.placements}
            onExit={() => setReplayingRunId(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 ${dismissing ? 'animate-overlay-fade-out' : 'animate-overlay-fade-in'}`}>
      <div className={`dungeon-panel p-5 max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-4 ${dismissing ? 'animate-panel-scale-out' : 'animate-panel-scale-in'}`}>
        <div className="flex items-center justify-between">
          <h3 className="font-medieval text-copper-400 text-lg">Report a Bug</h3>
          <button onClick={handleDismiss} disabled={dismissing} className="text-stone-500 hover:text-stone-300 text-xl leading-none">&times;</button>
        </div>

        <p className="text-xs text-stone-400">
          Help us fix issues! Select the run where you saw the bug and tell us what went wrong.
        </p>

        {/* Run selector — visual cards */}
        {trackedRuns.length > 0 && (
          <div className="space-y-1">
            <label className="text-sm font-bold text-copper-400">Which run?</label>
            <div className="flex gap-2 overflow-x-auto pb-1 dungeon-scrollbar">
              {trackedRuns.map((run, i) => (
                <div
                  key={run.id}
                  className={`flex-shrink-0 rounded-pixel border transition-colors ${
                    selectedRunId === run.id
                      ? 'border-copper-500 bg-copper-900/30'
                      : 'border-stone-700/50 bg-stone-800/50 hover:border-stone-600'
                  }`}
                >
                  <button
                    onClick={() => setSelectedRunId(run.id)}
                    className="p-2 w-full"
                  >
                    <MiniGridPreview puzzle={puzzle} placements={run.placements} outcome={run.outcome} size={100} />
                    <div className="mt-1.5 text-center">
                      <div className="text-xs font-bold text-parchment-200">
                        Run #{i + 1} {run.outcome === 'victory' ? '🏆' : '💀'}
                      </div>
                      <div className="text-[11px] text-stone-500">
                        {run.turnsUsed} turn{run.turnsUsed !== 1 ? 's' : ''} · {formatTimeAgo(run.timestamp)}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => setReplayingRunId(run.id)}
                    className="w-full text-xs text-arcane-400 hover:text-arcane-300 py-1.5 border-t border-stone-700/50 transition-colors font-bold"
                  >
                    Replay
                  </button>
                </div>
              ))}
            </div>
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
                onClick={() => { setAssetType(type); setAssetIds([]); }}
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

        {/* Specific asset multi-select chips */}
        {assetType && assetType !== 'other' && specificAssets.length > 0 && (
          <div className="space-y-1">
            <label className="text-sm font-bold text-copper-400">
              Which one{specificAssets.length > 1 ? '(s)' : ''}?
            </label>
            <div className="flex flex-wrap gap-1.5">
              {specificAssets.map(asset => {
                const selected = assetIds.includes(asset.id);
                return (
                  <button
                    key={asset.id}
                    onClick={() => toggleAssetId(asset.id)}
                    className={`px-2.5 py-1 text-xs rounded-pixel border transition-colors ${
                      selected
                        ? 'bg-copper-600/30 border-copper-500 text-copper-300'
                        : 'bg-stone-800/50 border-stone-600/50 text-stone-400 hover:border-stone-500'
                    }`}
                  >
                    {asset.name}
                  </button>
                );
              })}
            </div>
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
          <button onClick={handleDismiss} disabled={dismissing} className="dungeon-btn px-4 py-2 text-sm font-bold">
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
