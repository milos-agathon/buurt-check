import * as Sentry from '@sentry/react';

type AnalyticsProperty = string | number | boolean;
export type AnalyticsConsentState = 'unknown' | 'granted' | 'denied';

type GoogleTagCommand = [string, ...unknown[]];

const GA_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/i;
const CONSENT_STORAGE_KEY = 'buurtcheck_analytics_consent';
const LINKER_DOMAINS = ['buurt-check.nl', 'app.buurt-check.nl'];
const BLOCKED_ANALYTICS_KEY_PATTERNS = [
  /(^|_)(lookup|report|session|transaction|purchase)_?id$/i,
  /(^|_)(vbo|pand|bag)_?id$/i,
  /(^|_)(address|display_name|street|postcode|city|municipality)$/i,
  /(^|_)(house|house_number|house_letter|houseletter|addition)$/i,
  /(^|_)(lat|lng|latitude|longitude|rd_x|rd_y)$/i,
];

let initializedMeasurementId: string | null = null;
let lastPageViewSignature: string | null = null;
let lastPageViewLocation: string | null = null;

declare global {
  interface Window {
    dataLayer?: GoogleTagCommand[];
    gtag?: (...args: unknown[]) => void;
    __buurtCheckGaMeasurementId?: string;
  }
}

function isBrowserRuntime(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function isHostedWebRuntime(): boolean {
  if (!isBrowserRuntime()) return false;
  return window.location.protocol === 'http:' || window.location.protocol === 'https:';
}

function normalizeMeasurementId(value?: string | null): string | null {
  const normalized = value?.trim().toUpperCase() ?? '';
  return GA_MEASUREMENT_ID_PATTERN.test(normalized) ? normalized : null;
}

function readCookie(name: string): string | null {
  if (!isBrowserRuntime()) return null;
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(';')
    .map((segment) => segment.trim())
    .find((segment) => segment.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function resolveConsentCookieDomain(): string | null {
  if (!isBrowserRuntime()) return null;
  const hostname = window.location.hostname.toLowerCase();
  if (hostname === 'buurt-check.nl' || hostname.endsWith('.buurt-check.nl')) {
    return '.buurt-check.nl';
  }
  return null;
}

function writeConsentCookie(value: Exclude<AnalyticsConsentState, 'unknown'>): void {
  if (!isBrowserRuntime()) return;

  const parts = [
    `${CONSENT_STORAGE_KEY}=${encodeURIComponent(value)}`,
    'Path=/',
    'Max-Age=31536000',
    'SameSite=Lax',
  ];

  const domain = resolveConsentCookieDomain();
  if (domain) {
    parts.push(`Domain=${domain}`);
  }
  if (window.location.protocol === 'https:') {
    parts.push('Secure');
  }

  document.cookie = parts.join('; ');
}

function readStoredConsent(): Exclude<AnalyticsConsentState, 'unknown'> | null {
  const cookieConsent = readCookie(CONSENT_STORAGE_KEY);
  if (cookieConsent === 'granted' || cookieConsent === 'denied') {
    return cookieConsent;
  }

  if (!isBrowserRuntime()) return null;

  try {
    const storedConsent = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (storedConsent === 'granted' || storedConsent === 'denied') {
      return storedConsent;
    }
  } catch {
    // Ignore storage failures and fall back to default-denied consent mode.
  }

  return null;
}

function buildConsentPayload(state: AnalyticsConsentState, mode: 'default' | 'update') {
  const payload: Record<string, string | number> = {
    analytics_storage: state === 'granted' ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
  };

  if (mode === 'default' && state === 'unknown') {
    payload.wait_for_update = 500;
  }

  return payload;
}

function ensureGoogleTagShell(): void {
  if (!isBrowserRuntime()) return;

  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag === 'function') {
    return;
  }

  window.gtag = (...args: unknown[]) => {
    window.dataLayer?.push(args as GoogleTagCommand);
  };
}

function ensureGoogleTagScript(measurementId: string): void {
  if (!isBrowserRuntime()) return;

  const existingScript = document.querySelector<HTMLScriptElement>(
    'script[data-analytics-provider="google-analytics"]',
  );
  if (existingScript?.dataset.measurementId === measurementId) {
    return;
  }

  const gaScript = document.createElement('script');
  gaScript.async = true;
  gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  gaScript.dataset.analyticsProvider = 'google-analytics';
  gaScript.dataset.measurementId = measurementId;
  document.head.appendChild(gaScript);
}

function sanitizeUrlValue(value: string): string {
  if (!isBrowserRuntime()) return value;

  try {
    const url = new URL(value, window.location.origin);
    const sanitizedHash = url.hash ? url.hash.split('?')[0] : '';
    return `${url.origin}${url.pathname}${sanitizedHash}`;
  } catch {
    return value;
  }
}

function sanitizeAnalyticsProperties(
  properties?: Record<string, AnalyticsProperty>,
): Record<string, AnalyticsProperty> | undefined {
  if (!properties) {
    return undefined;
  }

  const sanitizedEntries = Object.entries(properties)
    .filter(([key]) => !BLOCKED_ANALYTICS_KEY_PATTERNS.some((pattern) => pattern.test(key)))
    .map(([key, value]) => {
      if (typeof value === 'string' && /(url|href)$/i.test(key)) {
        return [key, sanitizeUrlValue(value)] as const;
      }
      return [key, value] as const;
    });

  if (sanitizedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(sanitizedEntries);
}

export function getConfiguredMeasurementId(): string | null {
  return normalizeMeasurementId(import.meta.env.VITE_GA_MEASUREMENT_ID);
}

export function isAnalyticsEnabled(): boolean {
  return isHostedWebRuntime() && !!getConfiguredMeasurementId();
}

export function getAnalyticsConsent(): AnalyticsConsentState {
  return readStoredConsent() ?? 'unknown';
}

export function initAnalytics(): void {
  const measurementId = getConfiguredMeasurementId();
  if (!measurementId || !isAnalyticsEnabled()) {
    return;
  }

  ensureGoogleTagShell();

  if (initializedMeasurementId === measurementId) {
    return;
  }

  const consentState = getAnalyticsConsent();
  window.__buurtCheckGaMeasurementId = measurementId;
  window.gtag?.('consent', 'default', buildConsentPayload(consentState, 'default'));
  window.gtag?.('js', new Date());
  window.gtag?.('config', measurementId, {
    anonymize_ip: true,
    send_page_view: false,
    linker: {
      domains: LINKER_DOMAINS,
    },
  });

  ensureGoogleTagScript(measurementId);
  initializedMeasurementId = measurementId;
}

export function setAnalyticsConsent(
  state: Exclude<AnalyticsConsentState, 'unknown'>,
): void {
  if (!isBrowserRuntime()) return;

  writeConsentCookie(state);

  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, state);
  } catch {
    // Ignore storage failures and keep the cookie as the cross-domain source of truth.
  }

  window.gtag?.('consent', 'update', buildConsentPayload(state, 'update'));
}

export function trackPageView({
  pageLocation,
  pageTitle,
  signature,
  language,
}: {
  pageLocation: string;
  pageTitle: string;
  signature?: string;
  language?: string;
}): void {
  if (!isBrowserRuntime() || typeof window.gtag !== 'function') return;

  const resolvedLocation = sanitizeUrlValue(pageLocation);
  const pageSignature = signature ?? resolvedLocation;
  if (pageSignature === lastPageViewSignature) {
    return;
  }

  const payload: Record<string, AnalyticsProperty> = {
    page_location: resolvedLocation,
    page_title: pageTitle,
  };

  if (lastPageViewLocation) {
    payload.page_referrer = lastPageViewLocation;
  }
  if (language) {
    payload.language = language;
  }

  window.gtag('event', 'page_view', payload);
  lastPageViewSignature = pageSignature;
  lastPageViewLocation = resolvedLocation;
}

export function trackEvent(
  name: string,
  properties?: Record<string, AnalyticsProperty>,
): void {
  if (import.meta.env.DEV) {
    console.debug('[analytics]', name, properties);
  }

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

  if (typeof window === 'undefined' || typeof window.gtag !== 'function') {
    return;
  }

  const sanitizedProperties = sanitizeAnalyticsProperties(properties);
  window.gtag('event', name, sanitizedProperties ?? {});
}
