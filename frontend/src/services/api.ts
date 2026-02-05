import type {
  BuildingFactsResponse,
  Neighborhood3DResponse,
  ResolvedAddress,
  RiskCardsResponse,
  SuggestResponse,
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
  const timeoutId = setTimeout(() => controller.abort(), 25000);
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
