import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps keyboard focus inside a modal panel while `active` is true.
 *
 * - Moves focus to the first focusable element on open (falls back to the
 *   container itself — give it tabIndex={-1}). `focusContainer` focuses the
 *   container instead, for panels whose first control is a close/cancel that
 *   an Enter pressed right after opening must not hit.
 * - Tab / Shift+Tab cycle within the panel instead of escaping to the page.
 * - Restores focus to the previously focused element on close.
 *
 * Attach the returned ref to the dialog panel element. The panel must be in
 * the DOM on the render where `active` turns true — the effect only re-runs
 * when `active` changes, so a panel that mounts a render later never gets
 * trapped. Fold the mount state into `active` for panels that do.
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  { focusContainer = false }: { focusContainer?: boolean } = {},
) {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const initial = focusContainer ? container : container.querySelector<HTMLElement>(FOCUSABLE);
    (initial ?? container).focus({ preventScroll: true });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
        // offsetParent is null for display:none subtrees — skip hidden controls
        .filter(el => el.offsetParent !== null);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        // The container itself counts as "before the first": it holds focus
        // after a focusContainer open or a click on the panel's background,
        // and the browser's Shift+Tab from there leaves the panel.
        if (activeEl === firstEl || activeEl === container || !container.contains(activeEl)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else if (activeEl === lastEl || !container.contains(activeEl)) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [active, focusContainer]);

  return containerRef;
}
