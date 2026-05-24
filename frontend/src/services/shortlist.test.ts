import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getShortlist,
  addToShortlist,
  removeFromShortlist,
  isInShortlist,
  clearShortlist,
} from './shortlist';
import type { ShortlistItem } from '../types/api';

function makeItem(overrides: Partial<ShortlistItem> = {}): ShortlistItem {
  return {
    vboId: 'vbo-001',
    address: 'Keizersgracht 100',
    postcode: '1015AA',
    city: 'Amsterdam',
    buildingYear: 1895,
    riskScores: { noise: 72, air: 65, climate: 80, sunlight: 55 },
    savedAt: Date.now(),
    ...overrides,
  };
}

describe('shortlist service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty array when no items saved', () => {
    expect(getShortlist()).toEqual([]);
  });

  it('adds an item and retrieves it', () => {
    const item = makeItem();
    expect(addToShortlist(item)).toBe(true);
    expect(getShortlist()).toHaveLength(1);
    expect(getShortlist()[0].vboId).toBe('vbo-001');
  });

  it('upserts duplicate vboId entries instead of duplicating them', () => {
    addToShortlist(makeItem());
    expect(addToShortlist(makeItem({ city: 'Rotterdam' }))).toBe(true);
    expect(getShortlist()).toHaveLength(1);
    expect(getShortlist()[0].city).toBe('Rotterdam');
  });

  it('enforces 3-item limit', () => {
    addToShortlist(makeItem({ vboId: 'a' }));
    addToShortlist(makeItem({ vboId: 'b' }));
    addToShortlist(makeItem({ vboId: 'c' }));
    expect(addToShortlist(makeItem({ vboId: 'd' }))).toBe(false);
    expect(getShortlist()).toHaveLength(3);
  });

  it('removes an item by vboId', () => {
    addToShortlist(makeItem({ vboId: 'a' }));
    addToShortlist(makeItem({ vboId: 'b' }));
    removeFromShortlist('a');
    expect(getShortlist()).toHaveLength(1);
    expect(getShortlist()[0].vboId).toBe('b');
  });

  it('isInShortlist returns correct boolean', () => {
    addToShortlist(makeItem({ vboId: 'x' }));
    expect(isInShortlist('x')).toBe(true);
    expect(isInShortlist('y')).toBe(false);
  });

  it('clearShortlist removes all items', () => {
    addToShortlist(makeItem({ vboId: 'a' }));
    addToShortlist(makeItem({ vboId: 'b' }));
    clearShortlist();
    expect(getShortlist()).toEqual([]);
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('buurt-check-shortlist', 'not-json');
    expect(getShortlist()).toEqual([]);
  });

  it('filters malformed shortlist entries', () => {
    localStorage.setItem('buurt-check-shortlist', JSON.stringify([
      makeItem({ vboId: 'valid' }),
      { vboId: 123, address: 'broken', savedAt: Date.now(), riskScores: {} },
    ]));
    const items = getShortlist();
    expect(items).toHaveLength(1);
    expect(items[0].vboId).toBe('valid');
  });

  it('ignores write failures from localStorage.setItem', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded');
    });
    expect(() => addToShortlist(makeItem())).not.toThrow();
    spy.mockRestore();
  });

  it('persists across calls', () => {
    addToShortlist(makeItem({ vboId: 'p' }));
    // Simulate a "new page load" by re-reading
    const list = getShortlist();
    expect(list[0].address).toBe('Keizersgracht 100');
    expect(list[0].riskScores.noise).toBe(72);
  });
});
