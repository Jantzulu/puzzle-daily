import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'development',
    // Only send errors, no performance tracing
    tracesSampleRate: 0,
  });
}

/**
 * Capture an error and send it to Sentry (if configured).
 * Safe to call even without a DSN — it's a no-op.
 */
export function captureError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (dsn) {
    Sentry.captureException(error, { extra: context });
  }
}

export { Sentry };
