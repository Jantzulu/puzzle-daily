/**
 * Body scroll lock with scrollbar-width compensation and refcounting.
 *
 * Setting overflow:hidden removes the desktop scrollbar, which reflows the
 * whole page ~15px wider — every modal open visibly shifted the layout.
 * Compensating padding-right keeps the content column exactly where it was.
 * Refcounting means stacked lockers (an overlay under a modal) don't unlock
 * the body when the inner one closes.
 *
 * Returns a release function; safe to call more than once.
 */

let locks = 0;

export function lockBodyScroll(): () => void {
  locks++;
  if (locks === 1) {
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (gutter > 0) document.body.style.paddingRight = `${gutter}px`;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks--;
    if (locks === 0) {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
  };
}
