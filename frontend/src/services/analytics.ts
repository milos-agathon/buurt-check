import * as Sentry from '@sentry/react';

export function trackEvent(
  name: string,
  properties?: Record<string, string | number | boolean>,
): void {
  if (import.meta.env.DEV) {
    console.debug('[analytics]', name, properties);
  }

  // Sentry breadcrumb (fire-and-forget, no hard dependency)
  try {
    Sentry.addBreadcrumb({
      category: 'analytics',
      message: name,
      data: properties,
      level: 'info',
    });
  } catch {
    // Sentry not initialized or not available — that's fine.
  }
}
