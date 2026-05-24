import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hapticTap } from './haptic';

describe('haptic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls navigator.vibrate for tap', () => {
    Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), writable: true, configurable: true });
    hapticTap();
    expect(navigator.vibrate).toHaveBeenCalledWith(10);
  });

  it('does not throw when vibrate is unavailable', () => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, writable: true, configurable: true });
    expect(() => hapticTap()).not.toThrow();
  });
});
