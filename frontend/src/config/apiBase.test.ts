import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPrimaryApiBase,
  resetPrimaryApiBaseTestState,
  resolvePrimaryApiBase,
  setPrimaryApiBaseTestRuntime,
  type RuntimeLocation,
} from './apiBase';

const HOSTED_WEB_RUNTIME: RuntimeLocation = {
  protocol: 'https:',
  hostname: 'app.buurt-check.nl',
  origin: 'https://app.buurt-check.nl',
};

describe('primary API base resolution', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetPrimaryApiBaseTestState();
  });

  it('forces hosted web cross-origin API bases back to first-party /api', () => {
    expect(resolvePrimaryApiBase('https://buurt-check.onrender.com/api', HOSTED_WEB_RUNTIME)).toEqual({
      apiBase: '/api',
      forcedToFirstParty: true,
    });
  });

  it('keeps an explicit absolute API base on localhost web runtimes', () => {
    expect(resolvePrimaryApiBase(
      'https://buurt-check.onrender.com/api/',
      {
        protocol: 'http:',
        hostname: 'localhost',
        origin: 'http://localhost:4173',
      },
    )).toEqual({
      apiBase: 'https://buurt-check.onrender.com/api',
      forcedToFirstParty: false,
    });
  });

  it('keeps an explicit absolute API base on native-style runtimes', () => {
    expect(resolvePrimaryApiBase(
      'https://buurt-check.onrender.com/api',
      {
        protocol: 'capacitor:',
        hostname: 'localhost',
        origin: 'capacitor://localhost',
      },
    )).toEqual({
      apiBase: 'https://buurt-check.onrender.com/api',
      forcedToFirstParty: false,
    });
  });

  it('warns once when hosted web ignores a cross-origin VITE_API_BASE override', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('VITE_API_BASE', 'https://buurt-check.onrender.com/api');
    setPrimaryApiBaseTestRuntime(HOSTED_WEB_RUNTIME);

    expect(getPrimaryApiBase()).toBe('/api');
    expect(getPrimaryApiBase()).toBe('/api');

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      '[api-base] Hosted web forced same-origin /api.',
      'https://buurt-check.onrender.com/api',
    );
  });
});
