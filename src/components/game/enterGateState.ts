// Helpers for the tap-to-enter card (EnterGate.tsx).

/** Set once the visitor has entered; lasts until the page is reloaded. */
let enteredThisPage = false;

export function markPageEntered(): void {
  enteredThisPage = true;
}

/** True when no entry step is needed: the page has already been tapped. */
export function pageAlreadyEntered(): boolean {
  // userActivation.hasBeenActive: the browser's own record of "this page
  // has been tapped, clicked or typed in". Missing in older browsers, where
  // the card simply shows once per page load.
  return enteredThisPage || !!navigator.userActivation?.hasBeenActive;
}

/** "2026-11-15" -> "November 15, 2026" (read as a calendar day, not UTC). */
export function puzzleDateLabel(date: string | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  if (!m) return null;
  const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return day.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
