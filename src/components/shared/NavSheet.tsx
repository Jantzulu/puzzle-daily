import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface NavSheetProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}

/**
 * Centered sheet for nav utility panels (sound settings, user menu).
 *
 * Rendered through a portal to <body> because the gate menu is a clipped,
 * transformed container: anything absolutely positioned inside it gets cut
 * off at the clip edge, and `fixed` elements get re-anchored to the gate box
 * (a transformed ancestor becomes their containing block). The backdrop also
 * swallows outside clicks so they can't land on the full-width gate links.
 */
export const NavSheet: React.FC<NavSheetProps> = ({ open, onClose, label, children }) => {
  const panelRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      // theme-root: the portal lands on <body>, OUTSIDE the app's .theme-root
      // wrapper — without re-applying it here the sheet loses the theme font
      // (falls back to Inter) and theme sizing.
      className="theme-root fixed inset-0 z-[70] flex items-center justify-center p-4 animate-overlay-fade-in"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-xs max-h-[85vh] overflow-y-auto dungeon-panel rounded-lg shadow-xl animate-panel-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};
