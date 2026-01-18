import React, { useEffect, useCallback } from 'react';
import { getHelpSection, type HelpSectionId } from '../../utils/assetStorage';

interface HelpOverlayProps {
  sectionId: HelpSectionId;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Mobile-friendly help overlay that displays help content for a section.
 * Shows as a centered modal on desktop and full-screen on mobile.
 */
export const HelpOverlay: React.FC<HelpOverlayProps> = ({ sectionId, isOpen, onClose }) => {
  const helpContent = getHelpSection(sectionId);

  // Close on Escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen || !helpContent) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={onClose}
    >
      {/* Modal container - full screen on mobile, centered box on desktop */}
      <div
        className="relative w-full max-w-lg max-h-[90vh] md:max-h-[80vh] bg-stone-800 rounded-lg shadow-xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-700">
          <h2 className="text-xl font-bold text-parchment-100">{helpContent.title}</h2>
          <button
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-parchment-100 hover:bg-stone-700 rounded-lg transition-colors"
            aria-label="Close help"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto p-4 text-parchment-300 help-content"
          dangerouslySetInnerHTML={{ __html: helpContent.content }}
        />

        {/* Footer with close button for mobile */}
        <div className="p-4 border-t border-stone-700 md:hidden">
          <button
            onClick={onClose}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-parchment-100 font-medium rounded-lg transition-colors"
          >
            Got it
          </button>
        </div>
      </div>

      {/* Styles for rich text content */}
      <style>{`
        .help-content p {
          margin-bottom: 0.75rem;
        }
        .help-content ul, .help-content ol {
          margin-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .help-content li {
          margin-bottom: 0.25rem;
        }
        .help-content ul {
          list-style-type: disc;
        }
        .help-content ol {
          list-style-type: decimal;
        }
        .help-content strong {
          color: white;
        }
        .help-content em {
          font-style: italic;
        }
        .help-content h3 {
          font-size: 1.1rem;
          font-weight: bold;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
          color: white;
        }
      `}</style>
    </div>
  );
};

/**
 * Small help icon button that opens the help overlay
 */
interface HelpButtonProps {
  sectionId: HelpSectionId;
  className?: string;
}

export const HelpButton: React.FC<HelpButtonProps> = ({ sectionId, className = '' }) => {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`p-1 text-stone-400 hover:text-parchment-100 hover:bg-stone-700 rounded transition-colors ${className}`}
        aria-label="Help"
        title="What's this?"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>
      <HelpOverlay sectionId={sectionId} isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};
