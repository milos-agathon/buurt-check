type SentryModule = typeof import('@sentry/react');

type Breadcrumb = {
  category: string;
  message: string;
  data?: Record<string, unknown>;
  level?: 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';
};

let sentryModulePromise: Promise<SentryModule> | null = null;

function loadSentryModule(): Promise<SentryModule> {
  sentryModulePromise ??= import('@sentry/react');
  return sentryModulePromise;
}

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  void loadSentryModule()
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'dev',
        release: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined,
        tracesSampleRate: 0.1,
      });
    })
    .catch(() => {
      // Monitoring must never block the app shell.
    });
}

export function addTelemetryBreadcrumb(breadcrumb: Breadcrumb): void {
  void loadSentryModule()
    .then((Sentry) => {
      Sentry.addBreadcrumb(breadcrumb);
    })
    .catch(() => {
      // Breadcrumbs are best-effort only.
    });
}
