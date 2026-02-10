import type { ShortlistItem } from '../types/api';

const STORAGE_KEY = 'buurt-check-shortlist';
const MAX_ITEMS = 3;

function readStorage(): ShortlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ShortlistItem[];
  } catch {
    return [];
  }
}

function writeStorage(items: ShortlistItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
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
