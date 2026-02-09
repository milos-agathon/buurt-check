import type {
  BuildingFactsResponse,
  Neighborhood3DResponse,
  NeighborhoodStatsResponse,
  ResolvedAddress,
  RiskCardsResponse,
  SuggestResponse,
  ViewingQuestionsResponse,
} from '../types/api';

export type OverlayTileType = 'noise' | 'air_quality' | 'climate';

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
  // 3DBAG can be bursty; allow enough headroom so phase-2 doesn't abort mid-load.
  const timeoutId = setTimeout(() => controller.abort(), 220000);
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

export async function getViewingQuestions(
  vboId: string,
  rdX: number,
  rdY: number,
  lat: number,
  lng: number,
): Promise<ViewingQuestionsResponse> {
  const params = new URLSearchParams({
    rd_x: String(rdX),
    rd_y: String(rdY),
    lat: String(lat),
    lng: String(lng),
  });
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
  language?: string;
  shadowImageB64?: string;
}

export async function exportBriefing(options: ExportOptions): Promise<void> {
  const params = new URLSearchParams({
    rd_x: String(options.rdX),
    rd_y: String(options.rdY),
    lat: String(options.lat),
    lng: String(options.lng),
    address: options.address,
    template: 'quick_brief',
    language: options.language || 'en',
  });
  if (options.shadowImageB64) {
    params.set('shadow_image', options.shadowImageB64);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(
      `${API_BASE}/address/${options.vboId}/export?${params}`,
      { signal: controller.signal },
    );
    if (!resp.ok) throw new Error(`Export failed: ${resp.status}`);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buurt-check-${options.vboId}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getWmsTile(
  type: OverlayTileType,
  rdX: number,
  rdY: number,
): Promise<Blob> {
  const params = new URLSearchParams({
    type,
    rd_x: String(rdX),
    rd_y: String(rdY),
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(`${API_BASE}/address/wms-tile?${params}`, {
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`WMS tile failed: ${resp.status}`);
    return resp.blob();
  } finally {
    clearTimeout(timeoutId);
  }
}
