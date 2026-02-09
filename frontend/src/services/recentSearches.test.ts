import { describe, it, expect, beforeEach } from 'vitest';
import { getRecent, addRecent, removeRecent, clearRecent } from './recentSearches';

describe('recentSearches', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty array when no recent searches', () => {
    expect(getRecent()).toEqual([]);
  });

  it('adds a recent search', () => {
    addRecent({ id: '1', display_name: 'Damrak 1, Amsterdam' });
    const recent = getRecent();
    expect(recent).toHaveLength(1);
    expect(recent[0].id).toBe('1');
    expect(recent[0].display_name).toBe('Damrak 1, Amsterdam');
    expect(recent[0].timestamp).toBeGreaterThan(0);
  });

  it('adds in LIFO order (newest first)', () => {
    addRecent({ id: '1', display_name: 'First' });
    addRecent({ id: '2', display_name: 'Second' });
    const recent = getRecent();
    expect(recent[0].id).toBe('2');
    expect(recent[1].id).toBe('1');
  });

  it('deduplicates by id (moves to top)', () => {
    addRecent({ id: '1', display_name: 'First' });
    addRecent({ id: '2', display_name: 'Second' });
    addRecent({ id: '1', display_name: 'First updated' });
    const recent = getRecent();
    expect(recent).toHaveLength(2);
    expect(recent[0].id).toBe('1');
    expect(recent[0].display_name).toBe('First updated');
  });

  it('limits to 10 items', () => {
    for (let i = 0; i < 15; i++) {
      addRecent({ id: String(i), display_name: `Address ${i}` });
    }
    expect(getRecent()).toHaveLength(10);
    expect(getRecent()[0].id).toBe('14');
  });

  it('removes a specific item', () => {
    addRecent({ id: '1', display_name: 'First' });
    addRecent({ id: '2', display_name: 'Second' });
    removeRecent('1');
    const recent = getRecent();
    expect(recent).toHaveLength(1);
    expect(recent[0].id).toBe('2');
  });

  it('clears all recent searches', () => {
    addRecent({ id: '1', display_name: 'First' });
    addRecent({ id: '2', display_name: 'Second' });
    clearRecent();
    expect(getRecent()).toEqual([]);
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('buurt-check-recent-searches', 'not json');
    expect(getRecent()).toEqual([]);
  });

  it('stores postcode and city when provided', () => {
    addRecent({ id: '1', display_name: 'Damrak 1', postcode: '1012LG', city: 'Amsterdam' });
    const recent = getRecent();
    expect(recent[0].postcode).toBe('1012LG');
    expect(recent[0].city).toBe('Amsterdam');
  });

  it('removeRecent is a no-op for non-existent id', () => {
    addRecent({ id: '1', display_name: 'First' });
    removeRecent('99');
    expect(getRecent()).toHaveLength(1);
  });
});
