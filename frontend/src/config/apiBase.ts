const DEFAULT_PRIMARY_API_BASE = '/api';
const LOCAL_WEB_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

let warnedAboutForcedFirstPartyBase = false;
let testRuntimeLocationOverride: RuntimeLocation | null | undefined;

export interface RuntimeLocation {
  protocol: string;
  hostname: string;
  origin: string;
}

export interface PrimaryApiBaseResolution {
  apiBase: string;
  forcedToFirstParty: boolean;
}

export function normalizeApiBase(base: string): string {
  const trimmed = base.trim();
  if (!trimmed) return DEFAULT_PRIMARY_API_BASE;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, '');
  }
  if (trimmed.startsWith('/')) {
    return trimmed.replace(/\/+$/, '') || DEFAULT_PRIMARY_API_BASE;
  }
  return `/${trimmed.replace(/^\/+/, '').replace(/\/+$/, '')}`;
}

function isAbsoluteHttpUrl(base: string): boolean {
  try {
    const parsed = new URL(base);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isHostedWebRuntime(runtime: RuntimeLocation | null): runtime is RuntimeLocation {
  if (!runtime) return false;
  const isHttpRuntime = runtime.protocol === 'http:' || runtime.protocol === 'https:';
  return isHttpRuntime && !LOCAL_WEB_HOSTNAMES.has(runtime.hostname);
}

function readRuntimeLocation(): RuntimeLocation | null {
  if (testRuntimeLocationOverride !== undefined) {
    return testRuntimeLocationOverride;
  }
  if (typeof window === 'undefined') return null;
  return {
    protocol: window.location.protocol,
    hostname: window.location.hostname,
    origin: window.location.origin,
  };
}

export function resolvePrimaryApiBase(
  configuredBase: string | undefined,
  runtime: RuntimeLocation | null = readRuntimeLocation(),
): PrimaryApiBaseResolution {
  const normalizedConfiguredBase = normalizeApiBase(configuredBase || DEFAULT_PRIMARY_API_BASE);
  if (!isAbsoluteHttpUrl(normalizedConfiguredBase)) {
    return {
      apiBase: normalizedConfiguredBase,
      forcedToFirstParty: false,
    };
  }
  if (!isHostedWebRuntime(runtime)) {
    return {
      apiBase: normalizedConfiguredBase,
      forcedToFirstParty: false,
    };
  }

  const parsed = new URL(normalizedConfiguredBase);
  if (parsed.origin === runtime.origin) {
    return {
      apiBase: normalizedConfiguredBase,
      forcedToFirstParty: false,
    };
  }

  return {
    apiBase: DEFAULT_PRIMARY_API_BASE,
    forcedToFirstParty: true,
  };
}

function warnForcedFirstPartyBase(configuredBase: string): void {
  if (warnedAboutForcedFirstPartyBase) return;
  warnedAboutForcedFirstPartyBase = true;
  console.warn('[api-base] Hosted web forced same-origin /api.', configuredBase);
}

export function getPrimaryApiBase(): string {
  const configuredBase = normalizeApiBase(import.meta.env.VITE_API_BASE || DEFAULT_PRIMARY_API_BASE);
  const resolution = resolvePrimaryApiBase(configuredBase);
  if (resolution.forcedToFirstParty) {
    warnForcedFirstPartyBase(configuredBase);
  }
  return resolution.apiBase;
}

export function buildPrimaryApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getPrimaryApiBase()}${normalizedPath}`;
}

export function setPrimaryApiBaseTestRuntime(runtime: RuntimeLocation | null | undefined): void {
  testRuntimeLocationOverride = runtime;
}

export function resetPrimaryApiBaseTestState(): void {
  warnedAboutForcedFirstPartyBase = false;
  testRuntimeLocationOverride = undefined;
}
