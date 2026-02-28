const STORAGE_KEY = 'buurt-check-recent-searches';
const MAX_RECENT = 10;

export interface RecentSearch {
  id: string;
  display_name: string;
  postcode?: string;
  city?: string;
  timestamp: number;
}

function isRecentSearch(value: unknown): value is RecentSearch {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RecentSearch>;
  if (typeof candidate.id !== 'string') return false;
  if (typeof candidate.display_name !== 'string') return false;
  if (typeof candidate.timestamp !== 'number' || !Number.isFinite(candidate.timestamp)) return false;
  if (candidate.postcode != null && typeof candidate.postcode !== 'string') return false;
  if (candidate.city != null && typeof candidate.city !== 'string') return false;
  return true;
}

export function getRecent(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentSearch).slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function addRecent(search: Omit<RecentSearch, 'timestamp'>): void {
  const items = getRecent().filter(s => s.id !== search.id);
  items.unshift({ ...search, timestamp: Date.now() });
  if (items.length > MAX_RECENT) items.length = MAX_RECENT;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Safari private browsing or quota exceeded — silently fail
  }
}

export function removeRecent(id: string): void {
  const items = getRecent().filter(s => s.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Safari private browsing or quota exceeded — silently fail
  }
}

export function clearRecent(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Safari private browsing — silently fail
  }
}
