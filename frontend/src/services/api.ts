import type {
  BuildingFactsResponse,
  Neighborhood3DResponse,
  NeighborhoodStatsResponse,
  ResolvedAddress,
  RiskCardsResponse,
  RiskComparisonsResponse,
  SuggestResponse,
  TierBResponse,
  ViewingQuestionsResponse,
} from '../types/api';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export async function suggestAddresses(
  query: string,
  limit: number = 7,
  signal?: AbortSignal,
): Promise<SuggestResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const resp = await fetch(`${API_BASE}/address/suggest?${params}`, { signal });
  if (!resp.ok) throw new Error(`Suggest failed: ${resp.status}`);
  return resp.json();
}

export async function lookupAddress(id: string): Promise<ResolvedAddress> {
  const params = new URLSearchParams({ id });
  const resp = await fetch(`${API_BASE}/address/lookup?${params}`);
  if (!resp.ok) throw new Error(`Lookup failed: ${resp.status}`);
  return resp.json();
}

export async function getBuildingFacts(
  vboId: string,
): Promise<BuildingFactsResponse> {
  const resp = await fetch(`${API_BASE}/address/${vboId}/building`);
  if (!resp.ok) throw new Error(`Building facts failed: ${resp.status}`);
  return resp.json();
}

export async function getBuilding3D(
  vboId: string,
  pandId: string,
  rdX: number,
  rdY: number,
  lat: number,
  lng: number,
): Promise<Neighborhood3DResponse> {
  const params = new URLSearchParams({
    pand_id: pandId,
    rd_x: String(rdX),
    rd_y: String(rdY),
    lat: String(lat),
    lng: String(lng),
  });
  const resp = await fetch(`${API_BASE}/address/${vboId}/building3d?${params}`);
  if (!resp.ok) throw new Error(`Building 3D failed: ${resp.status}`);
  return resp.json();
}

export async function getNeighborhood3D(
  vboId: string,
  pandId: string,
  rdX: number,
  rdY: number,
  lat: number,
  lng: number,
): Promise<Neighborhood3DResponse> {
  const params = new URLSearchParams({
    pand_id: pandId,
    rd_x: String(rdX),
    rd_y: String(rdY),
    lat: String(lat),
    lng: String(lng),
  });
  const controller = new AbortController();
  // LoD2.2 neighborhood payloads can exceed 30s on dense areas.
  const timeoutId = setTimeout(() => controller.abort(), 45000);
  try {
    const resp = await fetch(
      `${API_BASE}/address/${vboId}/neighborhood3d?${params}`,
      { signal: controller.signal },
    );
    if (!resp.ok) throw new Error(`Neighborhood 3D failed: ${resp.status}`);
    return resp.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getRiskCards(
  vboId: string,
  rdX: number,
  rdY: number,
  lat: number,
  lng: number,
): Promise<RiskCardsResponse> {
  const params = new URLSearchParams({
    rd_x: String(rdX),
    rd_y: String(rdY),
    lat: String(lat),
    lng: String(lng),
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  try {
    const resp = await fetch(`${API_BASE}/address/${vboId}/risks?${params}`, {
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`Risk cards failed: ${resp.status}`);
    return resp.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getNeighborhoodStats(
  vboId: string,
  lat: number,
  lng: number,
  buurtCode?: string,
): Promise<NeighborhoodStatsResponse> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
  });
  if (buurtCode) {
    params.set('buurt_code', buurtCode);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(`${API_BASE}/address/${vboId}/neighborhood?${params}`, {
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`Neighborhood stats failed: ${resp.status}`);
    return resp.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getRiskComparisons(
  vboId: string,
  rdX: number,
  rdY: number,
  lat: number,
  lng: number,
  buurtCode?: string,
): Promise<RiskComparisonsResponse> {
  const params = new URLSearchParams({
    rd_x: String(rdX),
    rd_y: String(rdY),
    lat: String(lat),
    lng: String(lng),
  });
  if (buurtCode) params.set('buurt_code', buurtCode);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  try {
    const resp = await fetch(`${API_BASE}/address/${vboId}/risk-comparisons?${params}`, {
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`Risk comparisons failed: ${resp.status}`);
    return resp.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getViewingQuestions(
  vboId: string,
  rdX: number,
  rdY: number,
  lat: number,
  lng: number,
  context?: { street?: string; city?: string },
): Promise<ViewingQuestionsResponse> {
  const params = new URLSearchParams({
    rd_x: String(rdX),
    rd_y: String(rdY),
    lat: String(lat),
    lng: String(lng),
  });
  if (context?.street) params.set('street', context.street);
  if (context?.city) params.set('city', context.city);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  try {
    const resp = await fetch(`${API_BASE}/address/${vboId}/viewing-questions?${params}`, {
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`Viewing questions failed: ${resp.status}`);
    return resp.json();
  } finally {
    clearTimeout(timeoutId);
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
    if (!resp.ok) throw new Error(`Export failed: ${resp.status}`);
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
  URL.revokeObjectURL(url);
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
): Promise<TierBResponse> {
  const params = new URLSearchParams();
  if (options.buurtCode) params.set('buurt_code', options.buurtCode);
  if (options.postcode) params.set('postcode', options.postcode);
  if (options.houseNumber) params.set('house_number', options.houseNumber);
  if (options.houseLetter) params.set('house_letter', options.houseLetter);
  if (options.addition) params.set('addition', options.addition);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  try {
    const resp = await fetch(`${API_BASE}/address/${vboId}/tier-b?${params}`, {
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`Tier-B failed: ${resp.status}`);
    return resp.json();
  } finally {
    clearTimeout(timeoutId);
  }
}


