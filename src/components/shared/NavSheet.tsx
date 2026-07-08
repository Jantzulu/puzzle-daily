import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { lockBodyScroll } from '../../utils/scrollLock';

interface NavSheetProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}

// Matches .animate-overlay-fade-out / .animate-panel-scale-out (0.25s)
const EXIT_MS = 250;

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

  // Linger after close so the exit animation can play. `open` flipping false
  // (any path: backdrop, Escape, or a button inside) switches the classes to
  // the -out pair; unmount follows once they've run. Covers every close path
  // without consumers doing anything.
  const [rendered, setRendered] = useState(open);
  useEffect(() => {
    if (open) {
      setRendered(true);
      return;
    }
    const id = setTimeout(() => setRendered(false), EXIT_MS);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const releaseScroll = lockBodyScroll();
    return () => {
      document.removeEventListener('keydown', onKey);
      releaseScroll();
    };
  }, [open, onClose]);

  if (!rendered) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      // theme-root: the portal lands on <body>, OUTSIDE the app's .theme-root
      // wrapper — without re-applying it here the sheet loses the theme font
      // (falls back to Inter) and theme sizing.
      className={`theme-root fixed inset-0 z-[70] flex items-center justify-center p-4 ${open ? 'animate-overlay-fade-in' : 'animate-overlay-fade-out pointer-events-none'}`}
      // Light dim + soft blur: the page stays present under the sheet
      // (user feedback: the old version read as a jarring cut to black).
      // backgroundImage:none is LOAD-BEARING — .theme-root (needed above
      // for fonts) also paints the app's opaque background color + image,
      // which was the real blackout: it sat behind the scrim and hid the
      // page no matter how light the dim was.
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.32)',
        backgroundImage: 'none',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
      }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`w-full max-w-xs max-h-[85vh] overflow-y-auto dungeon-panel rounded-lg shadow-xl ${open ? 'animate-panel-scale-in' : 'animate-panel-scale-out'}`}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};
