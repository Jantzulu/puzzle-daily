// ============================================================================
// PRIVACY CONSENT — gate for optional (non-essential) data collection
// ============================================================================
// Two things in this app collect data that isn't strictly necessary to run
// the game, so they wait behind explicit consent:
//   - Play analytics: puzzle completions sent to Supabase, keyed by a
//     persistent pseudonymous player_id (powers community comparison + the
//     creator stats dashboard).
//   - Error diagnostics: Sentry exception reporting.
// Strictly-necessary storage (daily progress, crash recovery, settings, auth
// session) is exempt and always on — the game can't function without it.
//
// Model: OPT-IN. Until the player makes a choice, analytics/diagnostics stay
// OFF (the safe default for an unknown audience geography). The choice is
// remembered; bumping CONSENT_VERSION re-prompts everyone when the policy
// materially changes.

const KEY = 'privacy_consent';
export const CONSENT_VERSION = 1;

interface ConsentRecord {
  analytics: boolean;
  version: number;
  ts: number;
}

// undefined = not yet read from storage; null = read, no choice on record
let cached: ConsentRecord | null | undefined;

function load(): ConsentRecord | null {
  if (cached !== undefined) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return (cached = null);
    const parsed = JSON.parse(raw) as ConsentRecord;
    // A newer policy version invalidates an old choice — re-prompt.
    if (parsed.version !== CONSENT_VERSION) return (cached = null);
    return (cached = parsed);
  } catch {
    return (cached = null);
  }
}

/** Has the player made any choice yet? (false → the banner should show.) */
export function consentDecided(): boolean {
  return load() !== null;
}

/** May we collect optional analytics / send diagnostics right now? */
export function hasAnalyticsConsent(): boolean {
  return load()?.analytics === true;
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeConsent(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Record (or change) the player's choice. Persists and notifies subscribers. */
export function setConsent(analytics: boolean): void {
  cached = { analytics, version: CONSENT_VERSION, ts: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch { /* private mode / quota — the in-memory value still holds this session */ }
  if (analytics) enableErrorReporting();
  listeners.forEach(l => l());
}

/**
 * On startup, honor a previously-granted choice: spin up error reporting if
 * (and only if) the player already opted in. Safe to call every load.
 */
export function applyStartupConsent(): void {
  if (hasAnalyticsConsent()) enableErrorReporting();
}

// Lazy so neither the consent module nor its consumers (e.g. statsService)
// statically pull the Sentry SDK — and nothing initializes it pre-consent.
function enableErrorReporting(): void {
  import('../lib/sentry')
    .then(m => m.initSentry())
    .catch(() => { /* diagnostics are best-effort */ });
}
