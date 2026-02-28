const STORAGE_KEY = 'buurt-check-recent-searches';
const MAX_RECENT = 10;

export interface RecentSearch {
  id: string;
  display_name: string;
  postcode?: string;
  city?: string;
  timestamp: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRecentSearch(value: unknown): value is RecentSearch {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string'
    && typeof value.display_name === 'string'
    && typeof value.timestamp === 'number'
    && (value.postcode == null || typeof value.postcode === 'string')
    && (value.city == null || typeof value.city === 'string')
  );
}

function writeRecent(items: RecentSearch[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore localStorage write failures (private mode, quota exceeded).
  }
}

export function getRecent(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentSearch);
  } catch {
    return [];
  }
}

export function addRecent(search: Omit<RecentSearch, 'timestamp'>): void {
  const items = getRecent().filter(s => s.id !== search.id);
  items.unshift({ ...search, timestamp: Date.now() });
  if (items.length > MAX_RECENT) items.length = MAX_RECENT;
  writeRecent(items);
}

export function removeRecent(id: string): void {
  const items = getRecent().filter(s => s.id !== id);
  writeRecent(items);
}

export function clearRecent(): void {
  localStorage.removeItem(STORAGE_KEY);
}
