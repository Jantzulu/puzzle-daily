/**
 * Page scroll lock for modals, refcounted, that never moves the page.
 *
 * The lock goes on <html>, NOT <body>. html carries `overflow-x: clip` (the
 * horizontal-scroll ban, index.css), and a root whose overflow is not
 * `visible` keeps the viewport's scrolling for itself — body's overflow no
 * longer reaches the viewport. A body lock therefore stopped nothing (the
 * page still scrolled behind the modal), kept the desktop scrollbar, and
 * its scrollbar-width padding shifted the page left; worse, the hidden
 * body became a scroll container of its own and sticky children (the
 * navbar, the desktop rail) let go of the viewport and jumped.
 *
 * With a desktop scrollbar showing, `scrollbar-gutter: stable` keeps its
 * width reserved while overflow:hidden removes it, so nothing reflows —
 * in-flow, sticky and fixed content alike. Only when a scrollbar is
 * showing: on a page too short to scroll it would reserve an empty strip
 * and shift the page the same way. Where scrollbar-gutter is unsupported
 * (Safari before 18.2 with always-on scrollbars) body padding stands in.
 *
 * Refcounting means stacked lockers (an overlay under a modal) don't unlock
 * the page when the inner one closes. Returns a release function; safe to
 * call more than once.
 */

let locks = 0;
let restore: (() => void) | null = null;

export function lockBodyScroll(): () => void {
  locks++;
  if (locks === 1) {
    const root = document.documentElement;
    const body = document.body;
    const gutter = window.innerWidth - root.clientWidth;
    const prev = {
      overflow: root.style.overflow,
      scrollbarGutter: root.style.scrollbarGutter,
      paddingRight: body.style.paddingRight,
    };
    root.style.overflow = 'hidden';
    if (gutter > 0) {
      if (CSS.supports('scrollbar-gutter', 'stable')) root.style.scrollbarGutter = 'stable';
      else body.style.paddingRight = `${gutter}px`;
    }
    restore = () => {
      root.style.overflow = prev.overflow;
      root.style.scrollbarGutter = prev.scrollbarGutter;
      body.style.paddingRight = prev.paddingRight;
    };
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks--;
    if (locks === 0) {
      restore?.();
      restore = null;
    }
  };
}
