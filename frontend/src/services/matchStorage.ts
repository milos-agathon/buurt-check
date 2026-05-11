import type { SavedNeighborhood, SavedNeighborhoodCreatePayload } from '../types/match';

const REPORT_STORAGE_KEY = 'buurt-check-match-saved-reports';
const NEIGHBORHOOD_STORAGE_KEY = 'buurt-check-match-saved-neighborhoods';

export interface LocalSavedReport {
  report_id: string;
  session_id?: string | null;
  linked_user_id?: string | null;
  buyer_key?: string | null;
  saved_at: string;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function saveReportLocal(report: Omit<LocalSavedReport, 'saved_at'>): LocalSavedReport {
  const saved: LocalSavedReport = {
    ...report,
    saved_at: new Date().toISOString(),
  };
  const existing = readJson<LocalSavedReport[]>(REPORT_STORAGE_KEY, []);
  const next = [saved, ...existing.filter((item) => item.report_id !== report.report_id)];
  writeJson(REPORT_STORAGE_KEY, next);
  return saved;
}

export function getSavedReportsLocal(): LocalSavedReport[] {
  return readJson<LocalSavedReport[]>(REPORT_STORAGE_KEY, []);
}

export function saveNeighborhoodLocal(payload: SavedNeighborhoodCreatePayload): SavedNeighborhood {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Date.now().toString(36);
  const saved: SavedNeighborhood = {
    saved_neighborhood_id: `local_saved_${suffix}`,
    session_id: payload.session_id ?? null,
    preference_vector_id: payload.preference_vector_id ?? null,
    report_id: payload.report_id ?? null,
    neighborhood_id: payload.neighborhood_id,
    saved_from: payload.saved_from,
    note: payload.note ?? {},
    created_at: new Date().toISOString(),
    deleted_at: null,
    analytics_event: 'match_neighborhood_saved',
  };
  const existing = readJson<SavedNeighborhood[]>(NEIGHBORHOOD_STORAGE_KEY, []);
  const next = [
    saved,
    ...existing.filter((item) => item.neighborhood_id !== payload.neighborhood_id),
  ].slice(0, 50);
  writeJson(NEIGHBORHOOD_STORAGE_KEY, next);
  return saved;
}

export function getSavedNeighborhoodsLocal(): SavedNeighborhood[] {
  return readJson<SavedNeighborhood[]>(NEIGHBORHOOD_STORAGE_KEY, []).filter(
    (item) => item.deleted_at == null,
  );
}

export function deleteSavedNeighborhoodLocal(savedNeighborhoodId: string): boolean {
  const existing = readJson<SavedNeighborhood[]>(NEIGHBORHOOD_STORAGE_KEY, []);
  let deleted = false;
  const next = existing.map((item) => {
    if (item.saved_neighborhood_id !== savedNeighborhoodId) return item;
    deleted = true;
    return { ...item, deleted_at: new Date().toISOString() };
  });
  writeJson(NEIGHBORHOOD_STORAGE_KEY, next);
  return deleted;
}
