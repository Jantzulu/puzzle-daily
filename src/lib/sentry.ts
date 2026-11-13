// Error reporting facade. The Sentry SDK itself lives in ./sentrySdk and is
// only DOWNLOADED once the player opts into diagnostics (see utils/consent),
// so nobody pays for it before consent, and those who decline never do.
// Nothing here may import '@sentry/react' statically.

type Sdk = typeof import('./sentrySdk');

const dsn = import.meta.env.VITE_SENTRY_DSN;
let sdk: Sdk | null = null;
let loading: Promise<void> | null = null;

// Errors caught between opt-in and the SDK arriving. Small on purpose: this
// only bridges one chunk download.
const MAX_PENDING = 10;
let pending: Array<{ error: unknown; context?: Record<string, unknown> }> = [];

/**
 * Load and initialize Sentry. Called once the player opts into diagnostics.
 * Idempotent and a no-op without a DSN.
 */
export function initSentry(): Promise<void> {
  if (!dsn) return Promise.resolve();
  if (!loading) {
    loading = import('./sentrySdk')
      .then(m => {
        m.init(dsn, import.meta.env.VITE_SENTRY_ENVIRONMENT || 'development');
        sdk = m;
        for (const p of pending) m.capture(p.error, p.context);
        pending = [];
      })
      .catch(() => {
        // Diagnostics are best-effort; allow a later retry.
        loading = null;
        pending = [];
      });
  }
  return loading;
}

/**
 * Capture an error and send it to Sentry — but only once diagnostics have
 * been enabled by consent. A no-op before opt-in (or without a DSN).
 */
export function captureError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (sdk) {
    sdk.capture(error, context);
  } else if (loading && pending.length < MAX_PENDING) {
    pending.push({ error, context });
  }
}
