import type { TFunction } from 'i18next';
import type {
  BuildingFactsResponse,
  CheckoutSessionResponse,
  EntitlementResponse,
  LivabilityResponse,
  Neighborhood3DResponse,
  NeighborhoodStatsResponse,
  PropertyWarningsResponse,
  ResolvedAddress,
  RiskCardsResponse,
  RiskComparisonsResponse,
  ShortReportResponse,
  SunlightResult,
  SuggestResponse,
  TierBResponse,
  ViewingQuestionsResponse,
} from '../types/api';
import type { HourlyWeatherRecord } from '../utils/irradianceComputation';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const EXPORT_TIMEOUT_QUICK_MS = Math.max(
  30_000,
  Number(import.meta.env.VITE_EXPORT_TIMEOUT_QUICK_MS) || 90_000,
);
const EXPORT_TIMEOUT_FULL_MS = Math.max(
  30_000,
  Number(import.meta.env.VITE_EXPORT_TIMEOUT_FULL_MS) || 180_000,
);

interface TimeoutSignal {
  signal: AbortSignal;
  cleanup: () => void;
}

function withTimeoutSignal(timeoutMs: number, externalSignal?: AbortSignal): TimeoutSignal {
  const controller = new AbortController();

  const abortFromExternal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', abortFromExternal, { once: true });
    }
  }

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', abortFromExternal);
      }
    },
  };
}

/**
 * Typed API error that carries a human-friendly i18n key.
 * Components can call mapApiError() to get a translated string,
 * or catch ApiError directly to inspect the errorKey.
 */
export class ApiError extends Error {
  readonly errorKey: string;
  readonly httpStatus: number | undefined;

  constructor(errorKey: string, httpStatus?: number) {
    super(errorKey);
    this.name = 'ApiError';
    this.errorKey = errorKey;
    this.httpStatus = httpStatus;
  }
}

/**
 * Maps any caught error to a human-friendly translated string.
 * Guarantees that no technical error text (status codes, hostnames,
 * exception messages) ever reaches component render output.
 *
 * @param err    The caught error (unknown type)
 * @param t      i18next TFunction for translation
 * @returns      A human-friendly, translated error message
 */
export function mapApiError(err: unknown, t: TFunction): string {
  // Already-mapped typed errors: use their key directly
  if (err instanceof ApiError) {
    return t(err.errorKey);
  }

  // AbortError: request was cancelled by an AbortController (timeout)
  if (err instanceof DOMException && err.name === 'AbortError') {
    return t('error.timeout');
  }

  // TypeError: network failure, DNS error, CORS, offline
  if (err instanceof TypeError) {
    return t('error.network');
  }

  // Fallback for any other error
  return t('error.generic');
}

/**
 * Throw a typed ApiError based on an HTTP response status.
 * Never re-exposes statusText or response body to callers.
 */
function throwHttpError(status: number): never {
  if (status >= 400 && status < 500) {
    throw new ApiError('error.data_source', status);
  }
  if (status >= 500) {
    throw new ApiError('error.server', status);
  }
  throw new ApiError('error.generic', status);
}

export async function suggestAddresses(
  query: string,
  limit: number = 7,
  signal?: AbortSignal,
): Promise<SuggestResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const resp = await fetch(`${API_BASE}/address/suggest?${params}`, { signal });
  if (!resp.ok) throwHttpError(resp.status);
  return resp.json();
}

export async function lookupAddress(id: string, signal?: AbortSignal): Promise<ResolvedAddress> {
  const params = new URLSearchParams({ id });
  const resp = await fetch(`${API_BASE}/address/lookup?${params}`, { signal });
  if (!resp.ok) throwHttpError(resp.status);
  return resp.json();
}

export async function createShortReport(
  vboId: string,
  addressKey: string,
  firstFree: boolean = false,
): Promise<ShortReportResponse> {
  const resp = await fetch(`${API_BASE}/reports/short`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vbo_id: vboId,
      address_key: addressKey,
      first_free: firstFree,
    }),
  });
  if (!resp.ok) throwHttpError(resp.status);
  return resp.json();
}

export async function checkEntitlement(reportId: string): Promise<EntitlementResponse> {
  const resp = await fetch(`${API_BASE}/reports/${reportId}/entitlement`);
  if (!resp.ok) throwHttpError(resp.status);
  return resp.json();
}

export async function createCheckoutSession(reportId: string): Promise<CheckoutSessionResponse> {
  const resp = await fetch(`${API_BASE}/billing/checkout-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report_id: reportId }),
  });
  if (!resp.ok) throwHttpError(resp.status);
  return resp.json();
}

export async function getBuildingFacts(
  vboId: string,
  signal?: AbortSignal,
): Promise<BuildingFactsResponse> {
  const resp = await fetch(`${API_BASE}/address/${vboId}/building`, { signal });
  if (!resp.ok) throwHttpError(resp.status);
  return resp.json();
}

export async function getBuilding3D(
  vboId: string,
  pandId: string,
  rdX: number,
  rdY: number,
  lat: number,
  lng: number,
  signal?: AbortSignal,
  reportId?: string,
): Promise<Neighborhood3DResponse> {
  const params = new URLSearchParams({
    pand_id: pandId,
    rd_x: String(rdX),
    rd_y: String(rdY),
    lat: String(lat),
    lng: String(lng),
  });
  if (reportId) params.set('report_id', reportId);
  const resp = await fetch(`${API_BASE}/address/${vboId}/building3d?${params}`, { signal });
  if (!resp.ok) throwHttpError(resp.status);
  return resp.json();
}

export async function getNeighborhood3D(
  vboId: string,
  pandId: string,
  rdX: number,
  rdY: number,
  lat: number,
  lng: number,
  signal?: AbortSignal,
  reportId?: string,
): Promise<Neighborhood3DResponse> {
  const params = new URLSearchParams({
    pand_id: pandId,
    rd_x: String(rdX),
    rd_y: String(rdY),
    lat: String(lat),
    lng: String(lng),
  });
  if (reportId) params.set('report_id', reportId);
  // Some 3DBAG areas need additional retries + slower server-side processing.
  const timeout = withTimeoutSignal(90000, signal);
  try {
    const resp = await fetch(
      `${API_BASE}/address/${vboId}/neighborhood3d?${params}`,
      { signal: timeout.signal },
    );
    if (!resp.ok) throwHttpError(resp.status);
    return resp.json();
  } finally {
    timeout.cleanup();
  }
}

export async function getRiskCards(
  vboId: string,
  rdX: number,
  rdY: number,
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<RiskCardsResponse> {
  const params = new URLSearchParams({
    rd_x: String(rdX),
    rd_y: String(rdY),
    lat: String(lat),
    lng: String(lng),
  });
  const timeout = withTimeoutSignal(20000, signal);
  try {
    const resp = await fetch(`${API_BASE}/address/${vboId}/risks?${params}`, {
      signal: timeout.signal,
    });
    if (!resp.ok) throwHttpError(resp.status);
    return resp.json();
  } finally {
    timeout.cleanup();
  }
}

export async function getNeighborhoodStats(
  vboId: string,
  lat: number,
  lng: number,
  buurtCode?: string,
  signal?: AbortSignal,
): Promise<NeighborhoodStatsResponse> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
  });
  if (buurtCode) {
    params.set('buurt_code', buurtCode);
  }
  const timeout = withTimeoutSignal(15000, signal);
  try {
    const resp = await fetch(`${API_BASE}/address/${vboId}/neighborhood?${params}`, {
      signal: timeout.signal,
    });
    if (!resp.ok) throwHttpError(resp.status);
    return resp.json();
  } finally {
    timeout.cleanup();
  }
}

export async function getRiskComparisons(
  vboId: string,
  rdX: number,
  rdY: number,
  lat: number,
  lng: number,
  buurtCode?: string,
  signal?: AbortSignal,
  reportId?: string,
): Promise<RiskComparisonsResponse> {
  const params = new URLSearchParams({
    rd_x: String(rdX),
    rd_y: String(rdY),
    lat: String(lat),
    lng: String(lng),
  });
  if (buurtCode) params.set('buurt_code', buurtCode);
  if (reportId) params.set('report_id', reportId);
  const timeout = withTimeoutSignal(20000, signal);
  try {
    const resp = await fetch(`${API_BASE}/address/${vboId}/risk-comparisons?${params}`, {
      signal: timeout.signal,
    });
    if (!resp.ok) throwHttpError(resp.status);
    return resp.json();
  } finally {
    timeout.cleanup();
  }
}

export async function getViewingQuestions(
  vboId: string,
  rdX: number,
  rdY: number,
  lat: number,
  lng: number,
  context?: { street?: string; city?: string; buurtCode?: string },
  signal?: AbortSignal,
  reportId?: string,
): Promise<ViewingQuestionsResponse> {
  const params = new URLSearchParams({
    rd_x: String(rdX),
    rd_y: String(rdY),
    lat: String(lat),
    lng: String(lng),
  });
  if (context?.street) params.set('street', context.street);
  if (context?.city) params.set('city', context.city);
  if (context?.buurtCode) params.set('buurt_code', context.buurtCode);
  if (reportId) params.set('report_id', reportId);
  const timeout = withTimeoutSignal(20000, signal);
  try {
    const resp = await fetch(`${API_BASE}/address/${vboId}/viewing-questions?${params}`, {
      signal: timeout.signal,
    });
    if (!resp.ok) throwHttpError(resp.status);
    return resp.json();
  } finally {
    timeout.cleanup();
  }
}

export interface ShadowImagePayload {
  hour: number;
  label: string;
  image_b64: string;
  viewpoint?: string;
  sun_azimuth?: number;
  sun_altitude?: number;
}

export interface ExportOptions {
  vboId: string;
  rdX: number;
  rdY: number;
  lat: number;
  lng: number;
  address: string;
  template?: 'quick_brief' | 'full_dossier';
  reportId?: string;
  street?: string;
  city?: string;
  municipality?: string;
  language?: string;
  shadowImageB64?: string;
  shadowEquinoxB64?: string;
  shadowSummerB64?: string;
  shadowImages?: ShadowImagePayload[];
  buurtCode?: string;
  postcode?: string;
  houseNumber?: string;
  houseLetter?: string;
  addition?: string;
  sunlightPayload?: SunlightSubmissionPayload;
}

export async function exportBriefing(options: ExportOptions): Promise<Blob> {
  const template = options.template || 'quick_brief';
  const body: Record<string, unknown> = {
    rd_x: options.rdX,
    rd_y: options.rdY,
    lat: options.lat,
    lng: options.lng,
    address: options.address,
    template,
    language: options.language || 'en',
  };
  if (options.shadowImageB64) body.shadow_image_b64 = options.shadowImageB64;
  if (options.shadowEquinoxB64) body.shadow_equinox_b64 = options.shadowEquinoxB64;
  if (options.shadowSummerB64) body.shadow_summer_b64 = options.shadowSummerB64;
  if (template === 'full_dossier' && options.shadowImages && options.shadowImages.length > 0) {
    body.shadow_images = options.shadowImages;
  }
  if (options.reportId) body.report_id = options.reportId;
  if (options.street) body.street = options.street;
  if (options.city) body.city = options.city;
  if (options.municipality) body.municipality = options.municipality;
  if (options.buurtCode) body.buurt_code = options.buurtCode;
  if (options.postcode) body.postcode = options.postcode;
  if (options.houseNumber) body.house_number = options.houseNumber;
  if (options.houseLetter) body.house_letter = options.houseLetter;
  if (options.addition) body.addition = options.addition;
  if (options.sunlightPayload) body.sunlight_submission = options.sunlightPayload;

  const timeout = withTimeoutSignal(
    template === 'full_dossier' ? EXPORT_TIMEOUT_FULL_MS : EXPORT_TIMEOUT_QUICK_MS,
  );
  try {
    const resp = await fetch(
      `${API_BASE}/address/${options.vboId}/export`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: timeout.signal,
      },
    );
    if (!resp.ok) throwHttpError(resp.status);
    return resp.blob();
  } finally {
    timeout.cleanup();
  }
}

export function downloadPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const openPdfFallback = () => {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      window.location.assign(url);
    }
  };
  // iOS WebKit frequently ignores `download` for blob URLs. Opening the PDF
  // in a new tab gives the user a visible save/share path instead of no-op.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) {
    openPdfFallback();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const supportsDownloadAttr = typeof HTMLAnchorElement !== 'undefined'
    && 'download' in HTMLAnchorElement.prototype;
  if (!supportsDownloadAttr) {
    openPdfFallback();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    openPdfFallback();
  }
  // Delay revocation — Safari iOS starts downloads asynchronously after click
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function getTierBData(
  vboId: string,
  options: {
    buurtCode?: string;
  },
  signal?: AbortSignal,
  reportId?: string,
): Promise<TierBResponse> {
  const params = new URLSearchParams();
  if (options.buurtCode) params.set('buurt_code', options.buurtCode);
  if (reportId) params.set('report_id', reportId);

  const timeout = withTimeoutSignal(20000, signal);
  try {
    const resp = await fetch(`${API_BASE}/address/${vboId}/tier-b?${params}`, {
      signal: timeout.signal,
    });
    if (!resp.ok) throwHttpError(resp.status);
    return resp.json();
  } finally {
    timeout.cleanup();
  }
}

export async function getLivability(
  vboId: string,
  rdX: number,
  rdY: number,
  signal?: AbortSignal,
  reportId?: string,
): Promise<LivabilityResponse | null> {
  const params = new URLSearchParams({
    rd_x: String(rdX),
    rd_y: String(rdY),
  });
  if (reportId) params.set('report_id', reportId);
  const timeout = withTimeoutSignal(15000, signal);
  try {
    const resp = await fetch(`${API_BASE}/address/${vboId}/livability?${params}`, {
      signal: timeout.signal,
    });
    if (!resp.ok) throwHttpError(resp.status);
    const data = await resp.json();
    // Contract: backend always returns 200. available:false means no data for location.
    // Return the full response so LivabilityCard can render the unavailable state.
    return data;
  } finally {
    timeout.cleanup();
  }
}

export async function getPropertyWarnings(
  vboId: string,
  rdX: number,
  rdY: number,
  options?: {
    constructionYear?: number;
    numUnits?: number;
    municipality?: string;
  },
  signal?: AbortSignal,
  reportId?: string,
): Promise<PropertyWarningsResponse> {
  const params = new URLSearchParams({
    rd_x: String(rdX),
    rd_y: String(rdY),
  });
  if (options?.constructionYear != null)
    params.set('construction_year', String(options.constructionYear));
  if (options?.numUnits != null)
    params.set('num_units', String(options.numUnits));
  if (options?.municipality) params.set('municipality', options.municipality);
  if (reportId) params.set('report_id', reportId);

  const timeout = withTimeoutSignal(15000, signal);
  try {
    const resp = await fetch(
      `${API_BASE}/address/${vboId}/property-warnings?${params}`,
      { signal: timeout.signal },
    );
    if (!resp.ok) throwHttpError(resp.status);
    return resp.json();
  } finally {
    timeout.cleanup();
  }
}

interface WeatherTmyApiRecord {
  date?: string;
  minute_of_day?: number;
  dni_w_m2?: number;
  dhi_w_m2?: number;
  ghi_w_m2?: number;
}

interface WeatherTmyApiResponse {
  data?: WeatherTmyApiRecord[];
}

function parseMinuteOfDayFromDate(dateRaw: string): number | null {
  const parsed = new Date(dateRaw);
  if (!Number.isNaN(parsed.getTime())) {
    return (parsed.getUTCHours() * 60) + parsed.getUTCMinutes();
  }
  const compact = dateRaw.match(/^(\d{4})(\d{2})(\d{2}):(\d{2})(\d{2})$/);
  if (!compact) return null;
  const [, , , , hh, mm] = compact;
  return (Number(hh) * 60) + Number(mm);
}

function parseWeatherRecord(entry: WeatherTmyApiRecord): HourlyWeatherRecord | null {
  if (!entry.date) return null;
  const minuteOfDay = Number.isFinite(entry.minute_of_day)
    ? Number(entry.minute_of_day)
    : parseMinuteOfDayFromDate(entry.date);
  if (minuteOfDay == null) return null;

  return {
    date: entry.date,
    minuteOfDay,
    ghi_w_m2: Number(entry.ghi_w_m2 ?? 0),
    dni_w_m2: Number(entry.dni_w_m2 ?? 0),
    dhi_w_m2: Number(entry.dhi_w_m2 ?? 0),
  };
}

export async function fetchWeatherTmy(
  vboId: string,
  lat: number,
  lng: number,
  signal?: AbortSignal,
  reportId?: string,
): Promise<HourlyWeatherRecord[] | null> {
  const timeout = withTimeoutSignal(25000, signal);
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
    });
    if (reportId) params.set('report_id', reportId);
    const resp = await fetch(
      `${API_BASE}/address/${vboId}/weather-tmy?${params}`,
      { signal: timeout.signal },
    );
    if (!resp.ok) return null;

    const json = await resp.json() as WeatherTmyApiResponse;
    const raw = Array.isArray(json.data) ? json.data : [];
    const parsed = raw
      .map(parseWeatherRecord)
      .filter((entry): entry is HourlyWeatherRecord => entry != null);

    return parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  } finally {
    timeout.cleanup();
  }
}

export interface FacadeSubmissionPayload {
  orientation: string;
  height_label: string;
  winter_hours: number;
  summer_hours: number;
  annual_average: number;
}

export interface SunlightSubmissionPayload {
  winter_hours: number;
  summer_hours: number;
  equinox_hours: number;
  analysis_year: number;
  svf?: number;
  facade_results?: FacadeSubmissionPayload[];
  annual_average?: number;
  ground_annual_average?: number;
  svf_anisotropic?: number;
  irradiance_kwh_m2?: number;
}

export interface SunlightSubmissionResponse {
  status: string;
  score: number | null;
  severity: string | null;
  cached: boolean;
}

export function toSunlightSubmissionPayload(
  data: SunlightSubmissionPayload | SunlightResult,
): SunlightSubmissionPayload {
  if ('winter_hours' in data) {
    return data;
  }

  return {
    winter_hours: data.winter,
    summer_hours: data.summer,
    equinox_hours: data.equinox,
    analysis_year: data.analysisYear ?? new Date().getFullYear(),
    svf: data.svf,
    facade_results: data.facadeResults?.map((f) => ({
      orientation: f.orientation,
      height_label: f.heightLabel,
      winter_hours: f.winterHours,
      summer_hours: f.summerHours,
      annual_average: f.annualAverage,
    })),
    annual_average: data.annualAverage,
    ground_annual_average: data.groundAnnualAverage,
    svf_anisotropic: data.svfAnisotropic,
    irradiance_kwh_m2: data.irradianceKwhM2,
  };
}

export async function submitSunlightAnalysis(
  vboId: string,
  data: SunlightSubmissionPayload | SunlightResult,
  reportId?: string,
): Promise<SunlightSubmissionResponse> {
  const payload = toSunlightSubmissionPayload(data);
  const params = new URLSearchParams();
  if (reportId) params.set('report_id', reportId);
  const query = params.toString();
  const endpoint = `${API_BASE}/address/${vboId}/sunlight${query ? `?${query}` : ''}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  const startedAt = performance.now();
  if (import.meta.env.DEV) {
    console.info('[sunlight] POST submit start', {
      vboId,
      hasReportId: Boolean(reportId),
      winterHours: payload.winter_hours,
      equinoxHours: payload.equinox_hours,
      summerHours: payload.summer_hours,
    });
  }
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!resp.ok) throwHttpError(resp.status);
    const result = await resp.json() as Partial<SunlightSubmissionResponse>;
    const submissionResult: SunlightSubmissionResponse = {
      status: typeof result.status === 'string' ? result.status : 'ok',
      score: typeof result.score === 'number' ? result.score : null,
      severity: typeof result.severity === 'string' ? result.severity : null,
      cached: result.cached !== false,
    };
    if (!submissionResult.cached) {
      console.warn('[sunlight] POST succeeded but backend cache write FAILED', { vboId });
    }
    if (import.meta.env.DEV) {
      console.info('[sunlight] POST submit success', {
        vboId,
        status: resp.status,
        cached: submissionResult.cached,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
    }
    return submissionResult;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[sunlight] POST submit failed', {
        vboId,
        elapsedMs: Math.round(performance.now() - startedAt),
        error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
