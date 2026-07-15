// The Actions stack: New/Save/Save As/Library/Export/Import/Clear/Validate/
// Generate, version snapshots, and the publishing & review workflow.
// Extracted verbatim from MapEditor.tsx (Phase 1 decomposition, 2026-07-14).
// All state lives in MapEditor (the panel unmounts during playtest, so
// owning e.g. publishStatus here would reset it) — this component only
// renders and runs the service calls.
import React from 'react';
import { toast } from '../../shared/Toast';
import type { Puzzle } from '../../../types/game';
import { getPuzzleDependencies, type AssetDependency } from '../../../utils/publishDependencies';
import { unpublishPuzzle, getPuzzleDraftStatus, submitPuzzleForReview, approvePuzzle, requestPuzzleChanges } from '../../../services/supabaseService';
import { createVersionSnapshot } from '../../../services/versionService';
import { logActivity } from '../../../services/activityLogService';

export type PublishStatus = 'draft' | 'pending_review' | 'approved' | 'published' | 'checking' | null;

interface ActionsPanelProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  savedPuzzleCount: number;
  isValidating: boolean;
  puzzleId: string;
  puzzleName: string;
  publishStatus: PublishStatus;
  setPublishStatus: (status: PublishStatus) => void;
  reviewNotes: string;
  setReviewNotes: (notes: string) => void;
  showReviewNotes: boolean;
  setShowReviewNotes: (show: boolean) => void;
  getCurrentPuzzle: () => Puzzle;
  setPublishDeps: (deps: AssetDependency[]) => void;
  setShowPublishModal: (show: boolean) => void;
  onNewPuzzle: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onOpenLibrary: () => void;
  onExport: () => void;
  onImport: () => void;
  onClear: () => void;
  onValidate: () => void;
  onOpenGenerator: () => void;
  onOpenVersionHistory: () => void;
}

export const ActionsPanel: React.FC<ActionsPanelProps> = ({
  isOpen,
  onToggleOpen,
  savedPuzzleCount,
  isValidating,
  puzzleId,
  puzzleName,
  publishStatus,
  setPublishStatus,
  reviewNotes,
  setReviewNotes,
  showReviewNotes,
  setShowReviewNotes,
  getCurrentPuzzle,
  setPublishDeps,
  setShowPublishModal,
  onNewPuzzle,
  onSave,
  onSaveAs,
  onOpenLibrary,
  onExport,
  onImport,
  onClear,
  onValidate,
  onOpenGenerator,
  onOpenVersionHistory,
}) => (
  <div className="bg-stone-800 p-4 rounded">
    <button
      onClick={onToggleOpen}
      className="w-full flex items-center justify-between text-lg font-bold"
    >
      <span>Actions</span>
      <span className="text-lg text-stone-400">{isOpen ? '▾' : '▸'}</span>
    </button>
    {isOpen && <div className="space-y-2 mt-2">
    <button
      onClick={onNewPuzzle}
      className="w-full px-4 py-2 bg-stone-600 rounded hover:bg-stone-700"
    >
      New
    </button>
    <div className="grid grid-cols-2 gap-2">
      <button
        onClick={onSave}
        className="px-4 py-2 bg-moss-600 rounded hover:bg-moss-700"
      >
        Save
      </button>
      <button
        onClick={onSaveAs}
        className="px-4 py-2 bg-green-700 rounded hover:bg-green-800"
      >
        Save As
      </button>
    </div>
    <button
      onClick={onOpenLibrary}
      className="w-full px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
    >
      Library ({savedPuzzleCount})
    </button>
    <div className="grid grid-cols-2 gap-2">
      <button
        onClick={onExport}
        className="px-4 py-2 bg-stone-600 rounded hover:bg-stone-700 text-sm"
      >
        Export
      </button>
      <button
        onClick={onImport}
        className="px-4 py-2 bg-stone-600 rounded hover:bg-stone-700 text-sm"
      >
        Import
      </button>
    </div>
    <button
      onClick={onClear}
      className="w-full px-4 py-2 bg-blood-600 rounded hover:bg-blood-700"
    >
      Clear Grid
    </button>
    <button
      onClick={onValidate}
      disabled={isValidating}
      className="w-full px-4 py-2 bg-arcane-600 rounded hover:bg-arcane-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isValidating ? 'Validating...' : 'Validate Puzzle'}
    </button>
    <button
      onClick={onOpenGenerator}
      className="w-full px-4 py-2 bg-amber-600 rounded hover:bg-amber-700"
      title="Generate a new random puzzle"
    >
      Generate Puzzle
    </button>

    {/* Version History */}
    <div className="border-t border-stone-700 pt-3 mt-1">
      <label className="text-sm font-medium block mb-2">Versions</label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={async () => {
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
          className="flex-1 px-3 py-1.5 text-sm bg-copper-600/20 hover:bg-copper-600/30 text-copper-300 rounded border border-copper-500/30 font-medium"
        >
          📸 Save Version
        </button>
        <button
          type="button"
          onClick={onOpenVersionHistory}
          className="px-3 py-1.5 text-sm bg-stone-700 hover:bg-stone-600 rounded"
        >
          History
        </button>
      </div>
    </div>

    {/* Publishing & Review Workflow */}
    <div className="border-t border-stone-700 pt-3 mt-1">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium">Publishing</label>
        {publishStatus === 'published' && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-copper-600/30 text-copper-400 border border-copper-500/30">
            Published
          </span>
        )}
        {publishStatus === 'approved' && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-green-600/30 text-green-400 border border-green-500/30">
            Approved
          </span>
        )}
        {publishStatus === 'pending_review' && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-amber-600/30 text-amber-400 border border-amber-500/30">
            In Review
          </span>
        )}
        {(publishStatus === 'draft' || publishStatus === null) && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-stone-600/30 text-stone-400 border border-stone-500/30">
            Draft
          </span>
        )}
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
        className="text-xs text-stone-500 hover:text-stone-300 mt-1"
      >
        Check status
      </button>
    </div>
    </div>}
  </div>
);
