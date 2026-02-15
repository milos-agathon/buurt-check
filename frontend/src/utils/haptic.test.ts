import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hapticTap, hapticSuccess, hapticWarning } from './haptic';

describe('haptic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls navigator.vibrate for tap', () => {
    Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), writable: true, configurable: true });
    hapticTap();
    expect(navigator.vibrate).toHaveBeenCalledWith(10);
  });

  it('calls navigator.vibrate for success', () => {
    Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), writable: true, configurable: true });
    hapticSuccess();
    expect(navigator.vibrate).toHaveBeenCalledWith([10, 50, 10]);
  });

  it('calls navigator.vibrate for warning', () => {
    Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), writable: true, configurable: true });
    hapticWarning();
    expect(navigator.vibrate).toHaveBeenCalledWith([30, 50, 30]);
  });

  it('does not throw when vibrate is unavailable', () => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, writable: true, configurable: true });
    expect(() => hapticTap()).not.toThrow();
    expect(() => hapticSuccess()).not.toThrow();
    expect(() => hapticWarning()).not.toThrow();
  });
});
