import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;
let initialized = false;

/**
 * Initialize Sentry. Deferred until the player opts into diagnostics
 * (see utils/consent) — importing this module no longer sends anything.
 * Idempotent and a no-op without a DSN.
 */
export function initSentry(): void {
  if (initialized || !dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'development',
    // Only send errors, no performance tracing
    tracesSampleRate: 0,
  });
  initialized = true;
}

/**
 * Capture an error and send it to Sentry — but only once diagnostics have
 * been enabled by consent. A no-op before init (or without a DSN).
 */
export function captureError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (initialized) {
    Sentry.captureException(error, { extra: context });
  }
}

export { Sentry };
