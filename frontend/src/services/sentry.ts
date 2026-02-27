import * as Sentry from '@sentry/react';

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'dev',
    release: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined,
    tracesSampleRate: 0.1,
  });
}
