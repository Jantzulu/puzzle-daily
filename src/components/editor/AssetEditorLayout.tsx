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
}

export const AssetEditorLayout: React.FC<AssetEditorLayoutProps> = ({
  isEditing,
  onBack,
  listTitle,
  listPanel,
  detailPanel,
  emptyState,
}) => {
  const isMobile = useIsMobile();

  // Scroll to top when switching to detail view on mobile
  useEffect(() => {
    if (isMobile && isEditing) {
      window.scrollTo(0, 0);
    }
  }, [isMobile, isEditing]);

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">
          {/* List panel: always on desktop, hidden on mobile when editing */}
          {(!isMobile || !isEditing) && (
            <div className="w-full md:w-72 space-y-4 overflow-hidden">
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
