// The only module that imports the Sentry SDK. Loaded on demand by
// ./sentry after the player opts into diagnostics. Named imports (not
// `import *`) so the bundler drops what we never use: session replay,
// the feedback widget, tracing.
import { init as sentryInit, captureException } from '@sentry/react';

export function init(dsn: string, environment: string): void {
  sentryInit({
    dsn,
    environment,
    // Only send errors, no performance tracing
    tracesSampleRate: 0,
  });
}

export function capture(error: unknown, context?: Record<string, unknown>): void {
  captureException(error, { extra: context });
}
