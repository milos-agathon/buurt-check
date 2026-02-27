import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/react';

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
}));

describe('initSentry', () => {
  beforeEach(() => {
    vi.mocked(Sentry.init).mockReset();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('does not call Sentry.init when DSN is empty', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    const { initSentry } = await import('./sentry');
    initSentry();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('does not call Sentry.init when DSN is undefined', async () => {
    // VITE_SENTRY_DSN not set at all
    const { initSentry } = await import('./sentry');
    initSentry();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('calls Sentry.init when DSN is set', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://example@sentry.io/1');
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'test');
    const { initSentry } = await import('./sentry');
    initSentry();
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://example@sentry.io/1',
        environment: 'test',
        tracesSampleRate: 0.1,
      }),
    );
  });

  it('defaults environment to dev when VITE_SENTRY_ENVIRONMENT is not set', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://example@sentry.io/1');
    const { initSentry } = await import('./sentry');
    initSentry();
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'dev',
      }),
    );
  });
});
