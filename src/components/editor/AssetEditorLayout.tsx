import React, { useEffect } from 'react';
import { useIsMobile } from '../../hooks/useMediaQuery';

interface AssetEditorLayoutProps {
  /** Whether an asset is currently being edited */
  isEditing: boolean;
  /** Called when the user taps "Back" on mobile to return to the list */
  onBack: () => void;
  /** Title shown in the mobile back button, e.g. "Heroes" */
  listTitle: string;
  /** The asset list sidebar content */
  listPanel: React.ReactNode;
  /** The editor detail panel content (shown when isEditing is true) */
  detailPanel: React.ReactNode;
  /** Empty-state shown in the detail area when nothing is selected (desktop only) */
  emptyState: React.ReactNode;
  /**
   * OPTIONAL browse mode (2026-07-25). Supply this and, on desktop, the
   * sidebar is replaced by a full-width browse table when nothing is
   * selected and by the full-width editor when something is. Editors that
   * do not pass it keep the original two-pane layout unchanged, so this can
   * be adopted one editor at a time. Mobile always keeps the list/detail
   * swap — a data table does not fit a phone.
   */
  browsePanel?: React.ReactNode;
  /** Controls (search / filter / new / bulk bar) shown above the browse table. */
  browseControls?: React.ReactNode;
  /** Sibling navigation shown while editing, so hiding the list costs nothing. */
  navigation?: {
    items: { id: string; name: string }[];
    currentId: string | null;
    onSelect: (id: string) => void;
  };
}

export const AssetEditorLayout: React.FC<AssetEditorLayoutProps> = ({
  isEditing,
  onBack,
  listTitle,
  listPanel,
  detailPanel,
  emptyState,
  browsePanel,
  browseControls,
  navigation,
}) => {
  const isMobile = useIsMobile();

  // Scroll to top when switching to detail view on mobile
  useEffect(() => {
    if (isMobile && isEditing) {
      window.scrollTo(0, 0);
    }
  }, [isMobile, isEditing]);

  // ── Browse mode: full width, no sidebar competing for space ──────────────
  if (browsePanel && !isMobile) {
    const index = navigation?.currentId
      ? navigation.items.findIndex(i => i.id === navigation.currentId)
      : -1;
    const prev = index > 0 ? navigation!.items[index - 1] : null;
    const next = index >= 0 && index < (navigation?.items.length ?? 0) - 1
      ? navigation!.items[index + 1]
      : null;

    return (
      <div className="p-4">
        <div className="max-w-7xl mx-auto space-y-2">
          {isEditing ? (
            <>
              {/* Navigation bar replaces the sidebar: leave, step between
                  siblings in the current sort/filter order, or jump. */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={onBack}
                  className="px-2 py-0.5 rounded border text-xs border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800"
                >
                  ← All {listTitle}
                </button>
                {navigation && navigation.items.length > 1 && (
                  <>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => prev && navigation.onSelect(prev.id)}
                        disabled={!prev}
                        title={prev ? prev.name : 'First'}
                        className="px-2 py-0.5 rounded border text-xs border-stone-700 text-stone-400 enabled:hover:text-stone-200 enabled:hover:bg-stone-800 disabled:opacity-30"
                      >
                        ‹
                      </button>
                      <button
                        onClick={() => next && navigation.onSelect(next.id)}
                        disabled={!next}
                        title={next ? next.name : 'Last'}
                        className="px-2 py-0.5 rounded border text-xs border-stone-700 text-stone-400 enabled:hover:text-stone-200 enabled:hover:bg-stone-800 disabled:opacity-30"
                      >
                        ›
                      </button>
                    </div>
                    <select
                      value={navigation.currentId ?? ''}
                      onChange={e => e.target.value && navigation.onSelect(e.target.value)}
                      className="bg-stone-800 border border-stone-700 rounded px-2 py-0.5 text-xs text-parchment-100 max-w-[16rem]"
                    >
                      {navigation.currentId === null && <option value="">Unsaved…</option>}
                      {navigation.items.map(i => (
                        <option key={i.id} value={i.id}>{i.name || 'Unnamed'}</option>
                      ))}
                    </select>
                    {index >= 0 && (
                      <span className="text-xs text-stone-500">
                        {index + 1} of {navigation.items.length}
                      </span>
                    )}
                  </>
                )}
              </div>
              {detailPanel}
            </>
          ) : (
            <>
              {browseControls}
              {browsePanel}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4">
          {/* List panel: always on desktop, hidden on mobile when editing */}
          {(!isMobile || !isEditing) && (
            <div className="w-full md:w-80 space-y-2 overflow-hidden">
              {listPanel}
            </div>
          )}

          {/* Detail panel: always on desktop, shown on mobile only when editing */}
          {(!isMobile || isEditing) && (
            <div className="flex-1">
              {isEditing ? (
                <div className="space-y-4">
                  {/* Mobile back button */}
                  {isMobile && (
                    <button
                      onClick={onBack}
                      className="flex items-center gap-2 px-4 py-3 w-full text-left bg-stone-800 border border-stone-700 rounded-pixel text-copper-400 hover:bg-stone-700 transition-colors"
                      style={{ minHeight: '44px' }}
                    >
                      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      <span className="font-medium">Back to {listTitle}</span>
                    </button>
                  )}
                  {detailPanel}
                </div>
              ) : (
                emptyState
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
