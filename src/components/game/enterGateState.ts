// Helpers for the tap-to-enter step (EnterGate.tsx).

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

// ---- the dark ------------------------------------------------------------------
// THE DARK ENTRY (user idea 2026-11-15): until the first tap, everything
// under the navbar is in darkness, and the tap wakes it: the torches catch,
// their light spreads, the gate winches home as the light reaches it. While
// the page is dark the torches are out; they listen here for the tap.

/** The timeline after the tap (ms). LOCKSTEP with index.css `.entry-dark--lifting`. */
export const ENTRY_LIFT_MS = 1450;
/**
 * How long after the tap the gate starts its settle (its own 0.35 s pause
 * and 0.35 s stroke follow): it retracts 0.45-0.8 s in, coming out of the
 * dark as it moves, and locks at 0.8 s. First 400 then 450; the user then
 * asked for it to "begin its initial retraction on the click slightly
 * earlier, even if this means its timing compared to before is different".
 */
export const ENTRY_GATE_AFTER_MS = 100;

let dark = false;
const darkListeners = new Set<(dark: boolean) => void>();

export const entryIsDark = (): boolean => dark;

export function setEntryDark(next: boolean): void {
  if (dark === next) return;
  dark = next;
  darkListeners.forEach(listener => listener(next));
}

export function onEntryDark(listener: (dark: boolean) => void): () => void {
  darkListeners.add(listener);
  return () => { darkListeners.delete(listener); };
}

/**
 * Game asks this ONCE, as it first renders: has the page been entered
 * already? If not, the page starts dark, and it is dark before anything
 * under Game renders, so a torch never shows lit for a frame.
 */
export function startsEntered(): boolean {
  const entered = pageAlreadyEntered();
  if (!entered) dark = true;
  return entered;
}

/** "2026-11-15" -> "November 15, 2026" (read as a calendar day, not UTC). */
export function puzzleDateLabel(date: string | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  if (!m) return null;
  const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return day.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
