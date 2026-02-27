import type { TFunction } from 'i18next';
import type {
  BuildingFactsResponse,
  LivabilityResponse,
  Neighborhood3DResponse,
  NeighborhoodStatsResponse,
  PropertyWarningsResponse,
  ResolvedAddress,
  RiskCardsResponse,
  RiskComparisonsResponse,
  SunlightResult,
  SuggestResponse,
  TierBResponse,
  ViewingQuestionsResponse,
} from '../types/api';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

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
): Promise<Neighborhood3DResponse> {
  const params = new URLSearchParams({
    pand_id: pandId,
    rd_x: String(rdX),
    rd_y: String(rdY),
    lat: String(lat),
    lng: String(lng),
  });
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
): Promise<Neighborhood3DResponse> {
  const params = new URLSearchParams({
    pand_id: pandId,
    rd_x: String(rdX),
    rd_y: String(rdY),
    lat: String(lat),
    lng: String(lng),
  });
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
): Promise<RiskComparisonsResponse> {
  const params = new URLSearchParams({
    rd_x: String(rdX),
    rd_y: String(rdY),
    lat: String(lat),
    lng: String(lng),
  });
  if (buurtCode) params.set('buurt_code', buurtCode);
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
  context?: { street?: string; city?: string },
  signal?: AbortSignal,
): Promise<ViewingQuestionsResponse> {
  const params = new URLSearchParams({
    rd_x: String(rdX),
    rd_y: String(rdY),
    lat: String(lat),
    lng: String(lng),
  });
  if (context?.street) params.set('street', context.street);
  if (context?.city) params.set('city', context.city);
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

export interface ExportOptions {
  vboId: string;
  rdX: number;
  rdY: number;
  lat: number;
  lng: number;
  address: string;
  template?: 'quick_brief' | 'full_dossier';
  street?: string;
  city?: string;
  language?: string;
  shadowImageB64?: string;
  buurtCode?: string;
  postcode?: string;
  houseNumber?: string;
  houseLetter?: string;
  addition?: string;
}

export async function exportBriefing(options: ExportOptions): Promise<Blob> {
  const body: Record<string, unknown> = {
    rd_x: options.rdX,
    rd_y: options.rdY,
    lat: options.lat,
    lng: options.lng,
    address: options.address,
    template: options.template || 'quick_brief',
    language: options.language || 'en',
  };
  if (options.shadowImageB64) body.shadow_image_b64 = options.shadowImageB64;
  if (options.street) body.street = options.street;
  if (options.city) body.city = options.city;
  if (options.buurtCode) body.buurt_code = options.buurtCode;
  if (options.postcode) body.postcode = options.postcode;
  if (options.houseNumber) body.house_number = options.houseNumber;
  if (options.houseLetter) body.house_letter = options.houseLetter;
  if (options.addition) body.addition = options.addition;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(
      `${API_BASE}/address/${options.vboId}/export`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    if (!resp.ok) throwHttpError(resp.status);
    return resp.blob();
  } finally {
    clearTimeout(timeoutId);
  }
}

export function downloadPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Delay revocation — Safari iOS starts downloads asynchronously after click
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function getTierBData(
  vboId: string,
  options: {
    buurtCode?: string;
    postcode?: string;
    houseNumber?: string;
    houseLetter?: string;
    addition?: string;
  },
  signal?: AbortSignal,
): Promise<TierBResponse> {
  const params = new URLSearchParams();
  if (options.buurtCode) params.set('buurt_code', options.buurtCode);
  if (options.postcode) params.set('postcode', options.postcode);
  if (options.houseNumber) params.set('house_number', options.houseNumber);
  if (options.houseLetter) params.set('house_letter', options.houseLetter);
  if (options.addition) params.set('addition', options.addition);

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
): Promise<LivabilityResponse | null> {
  const params = new URLSearchParams({
    rd_x: String(rdX),
    rd_y: String(rdY),
  });
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

export interface SunlightSubmissionPayload {
  winter_hours: number;
  summer_hours: number;
  equinox_hours: number;
  analysis_year: number;
  svf?: number;
}

export async function submitSunlightAnalysis(
  vboId: string,
  data: SunlightSubmissionPayload | SunlightResult,
): Promise<void> {
  const payload: SunlightSubmissionPayload = 'winter_hours' in data
    ? data
    : {
      winter_hours: data.winter,
      summer_hours: data.summer,
      equinox_hours: data.equinox,
      analysis_year: data.analysisYear ?? new Date().getFullYear(),
      svf: data.svf,
    };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(`${API_BASE}/address/${vboId}/sunlight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!resp.ok) throwHttpError(resp.status);
  } finally {
    clearTimeout(timeoutId);
  }
}
