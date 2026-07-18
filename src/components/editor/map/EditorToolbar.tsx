// Compact editor toolbar (Phase 2 layout rework, 2026-07-14). One responsive
// row replaces the old mobile+desktop headers AND the tall Actions stack:
// title, primary verbs (Playtest/Save/Validate/Library/Publish), an overflow
// menu for the rest, grid size, and undo/redo. The publish & review workflow
// moved here from ActionsPanel verbatim, presented as a status-chip popover.
// All state stays in MapEditor (this bar survives re-render but popover
// open-state is local ephemeral UI).
import React, { useState } from 'react';
import { toast } from '../../shared/Toast';
import type { Puzzle } from '../../../types/game';
import { getPuzzleDependencies, type AssetDependency } from '../../../utils/publishDependencies';
import { unpublishPuzzle, getPuzzleDraftStatus, submitPuzzleForReview, approvePuzzle, requestPuzzleChanges } from '../../../services/supabaseService';
import { createVersionSnapshot } from '../../../services/versionService';
import { logActivity } from '../../../services/activityLogService';

export type PublishStatus = 'draft' | 'pending_review' | 'approved' | 'published' | 'checking' | null;

const STATUS_LABEL: Record<Exclude<PublishStatus, null>, string> = {
  draft: 'Draft',
  pending_review: 'In Review',
  approved: 'Approved',
  published: 'Published',
  checking: 'Checking…',
};

const STATUS_CHIP_CLASS: Record<Exclude<PublishStatus, null>, string> = {
  draft: 'bg-stone-600/30 text-stone-300 border-stone-500/40',
  pending_review: 'bg-amber-600/30 text-amber-300 border-amber-500/40',
  approved: 'bg-green-600/30 text-green-300 border-green-500/40',
  published: 'bg-copper-600/30 text-copper-300 border-copper-500/40',
  checking: 'bg-stone-600/30 text-stone-300 border-stone-500/40',
};

interface EditorToolbarProps {
  puzzleName: string;
  puzzleId: string;
  savedPuzzleCount: number;
  isValidating: boolean;
  gridWidth: number;
  gridHeight: number;
  widthInput: string;
  heightInput: string;
  setWidthInput: (value: string) => void;
  setHeightInput: (value: string) => void;
  onResize: (width: number, height: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onShowShortcuts: () => void;
  onPlaytest: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onNewPuzzle: () => void;
  onOpenLibrary: () => void;
  onExport: () => void;
  onImport: () => void;
  onClear: () => void;
  onValidate: () => void;
  onOpenGenerator: () => void;
  onOpenVersionHistory: () => void;
  publishStatus: PublishStatus;
  setPublishStatus: (status: PublishStatus) => void;
  reviewNotes: string;
  setReviewNotes: (notes: string) => void;
  showReviewNotes: boolean;
  setShowReviewNotes: (show: boolean) => void;
  getCurrentPuzzle: () => Puzzle;
  setPublishDeps: (deps: AssetDependency[]) => void;
  setShowPublishModal: (show: boolean) => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  puzzleName,
  puzzleId,
  savedPuzzleCount,
  isValidating,
  gridWidth,
  gridHeight,
  widthInput,
  heightInput,
  setWidthInput,
  setHeightInput,
  onResize,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onShowShortcuts,
  onPlaytest,
  onSave,
  onSaveAs,
  onNewPuzzle,
  onOpenLibrary,
  onExport,
  onImport,
  onClear,
  onValidate,
  onOpenGenerator,
  onOpenVersionHistory,
  publishStatus,
  setPublishStatus,
  reviewNotes,
  setReviewNotes,
  showReviewNotes,
  setShowReviewNotes,
  getCurrentPuzzle,
  setPublishDeps,
  setShowPublishModal,
}) => {
  const [showOverflow, setShowOverflow] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const status = publishStatus ?? 'draft';

  const overflowItem = 'w-full text-left px-3 py-2 text-sm rounded hover:bg-stone-700 transition-colors';

  return (
    <div className="mb-4 md:mb-6 flex flex-wrap items-center gap-2">
      {/* Title. Deliberately NOT an h1 (2026-07-18, user): .theme-root h1
          forces the themed heading font-size (~32px+) onto it, which both
          oversized the title and clipped glyph tops inside truncate's
          overflow:hidden. A plain element keeps the compact size it asks
          for; the full name lives in the tooltip. */}
      <div
        className="text-base md:text-lg leading-normal font-bold truncate max-w-[180px] md:max-w-[260px] mr-1"
        title={puzzleName || 'Map Editor'}
      >
        {puzzleName || 'Map Editor'}
      </div>

      {/* Primary verbs */}
      <button
        onClick={onPlaytest}
        className="px-4 py-2 bg-arcane-600 rounded hover:bg-arcane-700 font-bold text-sm"
        title="Playtest (Space)"
      >
        ▶ Playtest
      </button>
      <button
        onClick={onSave}
        className="px-4 py-2 bg-moss-600 rounded hover:bg-moss-700 text-sm font-medium"
        title="Save (Ctrl+S)"
      >
        Save
      </button>
      <button
        onClick={onValidate}
        disabled={isValidating}
        className="px-4 py-2 bg-stone-700 rounded hover:bg-stone-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isValidating ? 'Validating…' : 'Validate'}
      </button>
      <button
        onClick={onOpenLibrary}
        className="px-4 py-2 bg-stone-700 rounded hover:bg-stone-600 text-sm"
      >
        Library ({savedPuzzleCount})
      </button>

      {/* Publish popover */}
      <div className="relative">
        <button
          onClick={() => setShowPublish(!showPublish)}
          className={`px-3 py-2 rounded border text-sm font-medium ${STATUS_CHIP_CLASS[status]} hover:brightness-125 transition-all`}
          title="Publishing & review"
        >
          {STATUS_LABEL[status]} <span className="opacity-60 ml-0.5">▾</span>
        </button>
        {showPublish && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowPublish(false)} />
            <div className="absolute left-0 top-full mt-1 z-50 w-72 bg-stone-800 border border-stone-600 rounded-lg shadow-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Publishing</label>
                <span className={`px-2 py-0.5 text-xs rounded-full border ${STATUS_CHIP_CLASS[status]}`}>
                  {STATUS_LABEL[status]}
                </span>
              </div>

              <div className="space-y-2">
                {/* Draft state: Submit for Review */}
                {(publishStatus === 'draft' || publishStatus === null) && (
                  <button
                    type="button"
                    onClick={async () => {
                      const success = await submitPuzzleForReview(puzzleId, puzzleName);
                      if (success) {
                        setPublishStatus('pending_review');
                        toast.success('Submitted for review');
                      } else {
                        toast.error('Failed to submit for review');
                      }
                    }}
                    className="w-full px-3 py-1.5 text-sm bg-amber-600/80 hover:bg-amber-600 rounded font-medium text-white"
                  >
                    📋 Submit for Review
                  </button>
                )}

                {/* Pending Review state: Approve / Request Changes */}
                {publishStatus === 'pending_review' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const success = await approvePuzzle(puzzleId, puzzleName);
                        if (success) {
                          setPublishStatus('approved');
                          toast.success('Puzzle approved!');
                        } else {
                          toast.error('Failed to approve');
                        }
                      }}
                      className="flex-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 rounded font-medium"
                    >
                      ✓ Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowReviewNotes(true)}
                      className="px-3 py-1.5 text-sm bg-stone-700 hover:bg-stone-600 rounded"
                    >
                      Request Changes
                    </button>
                  </div>
                )}

                {/* Approved state: Publish / Request Changes */}
                {publishStatus === 'approved' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        setPublishStatus('checking');
                        try {
                          const puzzle = getCurrentPuzzle();
                          const deps = await getPuzzleDependencies(puzzle);
                          setPublishDeps(deps);
                          setShowPublishModal(true);
                        } catch (err) {
                          toast.error('Failed to check dependencies');
                          console.error(err);
                        }
                        setPublishStatus('approved');
                      }}
                      className="flex-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 rounded font-medium"
                    >
                      🚀 Publish
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowReviewNotes(true)}
                      className="px-3 py-1.5 text-sm bg-stone-700 hover:bg-stone-600 rounded"
                    >
                      Request Changes
                    </button>
                  </div>
                )}

                {/* Published state: Unpublish */}
                {publishStatus === 'published' && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm('Unpublish this puzzle? It will be removed from the live site.')) return;
                      const success = await unpublishPuzzle(puzzleId);
                      if (success) {
                        setPublishStatus('draft');
                        toast.success('Puzzle unpublished');
                      } else {
                        toast.error('Failed to unpublish');
                      }
                    }}
                    className="w-full px-3 py-1.5 text-sm bg-stone-700 hover:bg-red-600/80 rounded text-stone-400 hover:text-white"
                  >
                    Unpublish
                  </button>
                )}

                {/* Review notes input */}
                {showReviewNotes && (
                  <div className="bg-stone-800/50 rounded p-2 space-y-2 border border-stone-700/50">
                    <textarea
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="What needs to change?"
                      rows={2}
                      className="w-full px-2 py-1.5 bg-stone-700 rounded text-sm resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const success = await requestPuzzleChanges(puzzleId, puzzleName, reviewNotes || undefined);
                          if (success) {
                            setPublishStatus('draft');
                            setShowReviewNotes(false);
                            setReviewNotes('');
                            toast.success('Sent back for changes');
                          } else {
                            toast.error('Failed to request changes');
                          }
                        }}
                        className="flex-1 px-2 py-1 text-xs bg-red-600/30 hover:bg-red-600/50 text-red-300 rounded border border-red-500/30"
                      >
                        Send Back
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowReviewNotes(false); setReviewNotes(''); }}
                        className="px-2 py-1 text-xs bg-stone-700 hover:bg-stone-600 rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={async () => {
                  const status = await getPuzzleDraftStatus(puzzleId);
                  setPublishStatus(status || 'draft');
                }}
                className="text-xs text-stone-500 hover:text-stone-300 mt-2"
              >
                Check status
              </button>
            </div>
          </>
        )}
      </div>

      {/* Overflow menu */}
      <div className="relative">
        <button
          onClick={() => setShowOverflow(!showOverflow)}
          className="px-3 py-2 bg-stone-700 rounded hover:bg-stone-600 text-sm font-bold"
          title="More actions"
        >
          ⋯
        </button>
        {showOverflow && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowOverflow(false)} />
            <div className="absolute left-0 top-full mt-1 z-50 w-56 bg-stone-800 border border-stone-600 rounded-lg shadow-xl p-1.5">
              <button onClick={() => { setShowOverflow(false); onNewPuzzle(); }} className={overflowItem}>
                New Puzzle
              </button>
              <button onClick={() => { setShowOverflow(false); onSaveAs(); }} className={overflowItem}>
                Save As…
              </button>
              <div className="border-t border-stone-700 my-1.5" />
              <button onClick={() => { setShowOverflow(false); onExport(); }} className={overflowItem}>
                Export JSON
              </button>
              <button onClick={() => { setShowOverflow(false); onImport(); }} className={overflowItem}>
                Import JSON
              </button>
              <button onClick={() => { setShowOverflow(false); onOpenGenerator(); }} className={overflowItem}>
                Generate Puzzle…
              </button>
              <div className="border-t border-stone-700 my-1.5" />
              <button
                onClick={async () => {
                  setShowOverflow(false);
                  const puzzle = getCurrentPuzzle();
                  const result = await createVersionSnapshot(
                    puzzleId,
                    'puzzle',
                    puzzleName || 'Untitled',
                    puzzle as unknown as object
                  );
                  if (result.success) {
                    toast.success(`Saved version #${result.versionNumber}`);
                    logActivity({
                      action: 'update',
                      asset_type: 'puzzle',
                      asset_id: puzzleId,
                      asset_name: puzzleName,
                      details: { saved_version: result.versionNumber },
                    });
                  } else {
                    toast.error('Failed to save version');
                  }
                }}
                className={overflowItem}
              >
                📸 Save Version
              </button>
              <button onClick={() => { setShowOverflow(false); onOpenVersionHistory(); }} className={overflowItem}>
                Version History…
              </button>
              <div className="border-t border-stone-700 my-1.5" />
              <button
                onClick={() => { setShowOverflow(false); onClear(); }}
                className={`${overflowItem} text-red-400 hover:bg-blood-600/30`}
              >
                Clear Grid
              </button>
            </div>
          </>
        )}
      </div>

      {/* Grid size + undo/redo + shortcuts — sit WITH the verbs instead of
          pushed to the page's far corner (2026-07-18, user: the controls
          belong near the puzzle, and on one row with the title). */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-3 bg-stone-800 px-3 py-1.5 rounded">
          <span className="text-sm font-medium text-parchment-300 hidden sm:inline">Grid:</span>
          <div className="flex items-center gap-1">
            <label className="text-xs text-stone-400">W</label>
            <div className="flex items-center">
              <button
                onClick={() => onResize(gridWidth - 1, gridHeight)}
                disabled={gridWidth <= 3}
                className="w-6 h-7 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-l text-sm font-bold"
              >−</button>
              <input type="text" inputMode="numeric" pattern="[0-9]*" value={widthInput}
                onChange={(e) => setWidthInput(e.target.value)}
                onBlur={() => { const val = parseInt(widthInput, 10); if (!isNaN(val) && val >= 3 && val <= 20) onResize(val, gridHeight); else setWidthInput(String(gridWidth)); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className="w-8 h-7 px-1 bg-stone-700 text-sm text-center border-x border-stone-600"
              />
              <button
                onClick={() => onResize(gridWidth + 1, gridHeight)}
                disabled={gridWidth >= 20}
                className="w-6 h-7 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-r text-sm font-bold"
              >+</button>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <label className="text-xs text-stone-400">H</label>
            <div className="flex items-center">
              <button
                onClick={() => onResize(gridWidth, gridHeight - 1)}
                disabled={gridHeight <= 3}
                className="w-6 h-7 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-l text-sm font-bold"
              >−</button>
              <input type="text" inputMode="numeric" pattern="[0-9]*" value={heightInput}
                onChange={(e) => setHeightInput(e.target.value)}
                onBlur={() => { const val = parseInt(heightInput, 10); if (!isNaN(val) && val >= 3 && val <= 20) onResize(gridWidth, val); else setHeightInput(String(gridHeight)); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className="w-8 h-7 px-1 bg-stone-700 text-sm text-center border-x border-stone-600"
              />
              <button
                onClick={() => onResize(gridWidth, gridHeight + 1)}
                disabled={gridHeight >= 20}
                className="w-6 h-7 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-r text-sm font-bold"
              >+</button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-stone-800 px-2 py-1 rounded">
          <button onClick={onUndo} disabled={!canUndo}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${canUndo ? 'bg-stone-700 hover:bg-stone-600 text-parchment-100' : 'bg-stone-800 text-stone-500 cursor-not-allowed'}`}
            title="Undo (Ctrl+Z)">↩</button>
          <button onClick={onRedo} disabled={!canRedo}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${canRedo ? 'bg-stone-700 hover:bg-stone-600 text-parchment-100' : 'bg-stone-800 text-stone-500 cursor-not-allowed'}`}
            title="Redo (Ctrl+Y)">↪</button>
          <button
            onClick={onShowShortcuts}
            className="px-3 py-1.5 rounded text-sm font-medium transition-colors bg-stone-700 hover:bg-stone-600 text-stone-400 hover:text-parchment-100 ml-1 hidden md:block"
            title="Keyboard Shortcuts (?)"
          >
            {'⌨'} ?
          </button>
        </div>
      </div>
    </div>
  );
};
