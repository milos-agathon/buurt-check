import type { ShortlistItem } from '../types/api';

const STORAGE_KEY = 'buurt-check-shortlist';
const MAX_ITEMS = 3;

function isValidItem(item: unknown): item is ShortlistItem {
  if (!item || typeof item !== 'object') return false;
  const obj = item as Record<string, unknown>;
  const verificationWork = obj.verificationWork as Record<string, unknown> | undefined;
  const hasValidVerificationWork = verificationWork == null || (
    typeof verificationWork === 'object'
    && typeof verificationWork.openActions === 'number'
    && typeof verificationWork.incompleteSources === 'number'
    && typeof verificationWork.needsReview === 'number'
  );
  return (
    typeof obj.vboId === 'string' &&
    typeof obj.address === 'string' &&
    typeof obj.savedAt === 'number' &&
    obj.riskScores != null &&
    typeof obj.riskScores === 'object' &&
    hasValidVerificationWork
  );
}

function readStorage(): ShortlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidItem);
  } catch {
    return [];
  }
}

function writeStorage(items: ShortlistItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Safari private browsing or quota exceeded — silently fail
  }
}

export function getShortlist(): ShortlistItem[] {
  return readStorage();
}

export function upsertShortlistItem(item: ShortlistItem): boolean {
  const items = readStorage();
  const existingIndex = items.findIndex((entry) => entry.vboId === item.vboId);
  if (existingIndex >= 0) {
    items[existingIndex] = item;
    writeStorage(items);
    return true;
  }
  if (items.length >= MAX_ITEMS) return false;
  items.push(item);
  writeStorage(items);
  return true;
}

export function addToShortlist(item: ShortlistItem): boolean {
  return upsertShortlistItem(item);
}

export function removeFromShortlist(vboId: string): void {
  const items = readStorage().filter(i => i.vboId !== vboId);
  writeStorage(items);
}

export function isInShortlist(vboId: string): boolean {
  return readStorage().some(i => i.vboId === vboId);
}

export function clearShortlist(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Safari private browsing — silently fail
  }
}
