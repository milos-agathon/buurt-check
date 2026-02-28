import type { ShortlistItem } from '../types/api';

const STORAGE_KEY = 'buurt-check-shortlist';
const MAX_ITEMS = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRiskScores(value: unknown): value is ShortlistItem['riskScores'] {
  if (!isRecord(value)) return false;
  const maybeNumber = (candidate: unknown) => candidate == null || typeof candidate === 'number';
  return (
    maybeNumber(value.noise)
    && maybeNumber(value.air)
    && maybeNumber(value.climate)
    && maybeNumber(value.sunlight)
  );
}

function isShortlistItem(value: unknown): value is ShortlistItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.vboId === 'string'
    && typeof value.address === 'string'
    && typeof value.savedAt === 'number'
    && isRiskScores(value.riskScores)
    && (value.lookupId == null || typeof value.lookupId === 'string')
    && (value.postcode == null || typeof value.postcode === 'string')
    && (value.city == null || typeof value.city === 'string')
    && (value.buildingYear == null || typeof value.buildingYear === 'number')
  );
}

function readStorage(): ShortlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isShortlistItem);
  } catch {
    return [];
  }
}

function writeStorage(items: ShortlistItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore localStorage write failures (private mode, quota exceeded).
  }
}

export function getShortlist(): ShortlistItem[] {
  return readStorage();
}

export function addToShortlist(item: ShortlistItem): boolean {
  const items = readStorage();
  if (items.length >= MAX_ITEMS) return false;
  if (items.some(i => i.vboId === item.vboId)) return false;
  items.push(item);
  writeStorage(items);
  return true;
}

export function removeFromShortlist(vboId: string): void {
  const items = readStorage().filter(i => i.vboId !== vboId);
  writeStorage(items);
}

export function isInShortlist(vboId: string): boolean {
  return readStorage().some(i => i.vboId === vboId);
}

export function getShortlistCount(): number {
  return readStorage().length;
}

export function clearShortlist(): void {
  localStorage.removeItem(STORAGE_KEY);
}
