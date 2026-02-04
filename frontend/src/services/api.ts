import type { SuggestResponse, ResolvedAddress, BuildingFactsResponse } from '../types/api';

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
