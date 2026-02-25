import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isFirstVisit, markVisited } from './firstVisit';

describe('firstVisit service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns true when no flag is set', () => {
    expect(isFirstVisit()).toBe(true);
  });

  it('returns false after markVisited is called', () => {
    markVisited();
    expect(isFirstVisit()).toBe(false);
  });

  it('persists across calls', () => {
    markVisited();
    // Simulate re-read (as if page reloaded)
    expect(isFirstVisit()).toBe(false);
    expect(localStorage.getItem('buurtcheck_visited')).toBe('1');
  });

  it('handles localStorage.getItem throwing (private browsing)', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Access denied');
    });
    expect(isFirstVisit()).toBe(true);
    spy.mockRestore();
  });

  it('handles localStorage.setItem throwing (private browsing)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded');
    });
    // Should not throw
    expect(() => markVisited()).not.toThrow();
    spy.mockRestore();
  });

  it('does not treat other storage values as visited', () => {
    localStorage.setItem('buurtcheck_visited', 'false');
    expect(isFirstVisit()).toBe(true);
  });

  it('only recognizes exact value "1"', () => {
    localStorage.setItem('buurtcheck_visited', '0');
    expect(isFirstVisit()).toBe(true);
    localStorage.setItem('buurtcheck_visited', 'true');
    expect(isFirstVisit()).toBe(true);
    localStorage.setItem('buurtcheck_visited', '1');
    expect(isFirstVisit()).toBe(false);
  });
});
