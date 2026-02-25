import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hasSeenTooltip, markTooltipSeen } from './tooltipTracker';

describe('tooltipTracker', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('hasSeenTooltip', () => {
    it('returns false when tooltip has not been seen', () => {
      expect(hasSeenTooltip('bookmark')).toBe(false);
    });

    it('returns true after tooltip has been marked as seen', () => {
      markTooltipSeen('bookmark');
      expect(hasSeenTooltip('bookmark')).toBe(true);
    });

    it('tracks different tooltip keys independently', () => {
      markTooltipSeen('bookmark');
      expect(hasSeenTooltip('bookmark')).toBe(true);
      expect(hasSeenTooltip('compare')).toBe(false);
      expect(hasSeenTooltip('export')).toBe(false);
    });

    it('returns false when localStorage throws (private browsing)', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      expect(hasSeenTooltip('bookmark')).toBe(false);
    });
  });

  describe('markTooltipSeen', () => {
    it('sets the correct localStorage key', () => {
      markTooltipSeen('compare');
      expect(localStorage.getItem('buurt-check-tooltip-compare')).toBe('1');
    });

    it('does not throw when localStorage is unavailable', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      expect(() => markTooltipSeen('export')).not.toThrow();
    });
  });
});
