import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTheme, setTheme, getEffectiveTheme, applyTheme } from './theme';

// Mock matchMedia for jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: query === '(prefers-color-scheme: dark)' ? false : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

describe('theme service', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('theme-transitioning');
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns system as default theme', () => {
    expect(getTheme()).toBe('system');
  });

  it('stores theme preference in localStorage', () => {
    setTheme('dark');
    expect(getTheme()).toBe('dark');
    expect(localStorage.getItem('buurt-check-theme')).toBe('dark');
  });

  it('adds and removes theme-transitioning class around explicit theme changes', () => {
    vi.useFakeTimers();
    setTheme('dark');
    expect(document.documentElement.classList.contains('theme-transitioning')).toBe(true);
    vi.advanceTimersByTime(250);
    expect(document.documentElement.classList.contains('theme-transitioning')).toBe(false);
  });

  it('returns stored light preference', () => {
    setTheme('light');
    expect(getTheme()).toBe('light');
  });

  it('getEffectiveTheme returns light or dark for explicit preferences', () => {
    expect(getEffectiveTheme('light')).toBe('light');
    expect(getEffectiveTheme('dark')).toBe('dark');
  });

  it('getEffectiveTheme uses system preference for system mode', () => {
    // jsdom defaults to light (no match for prefers-color-scheme: dark)
    expect(getEffectiveTheme('system')).toBe('light');
  });

  it('applyTheme sets data-theme attribute on document element', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('applyTheme reads stored preference when no arg given', () => {
    setTheme('dark');
    document.documentElement.removeAttribute('data-theme');
    applyTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('ignores invalid localStorage values', () => {
    localStorage.setItem('buurt-check-theme', 'purple');
    expect(getTheme()).toBe('system');
  });

  it('returns system when localStorage.getItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.');
    });
    expect(getTheme()).toBe('system');
    spy.mockRestore();
  });

  it('still applies theme when localStorage.setItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.');
    });
    expect(() => setTheme('dark')).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    spy.mockRestore();
  });

  it('skips theme-transitioning when prefers-reduced-motion is enabled', () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });

    setTheme('dark');
    expect(document.documentElement.classList.contains('theme-transitioning')).toBe(false);

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: originalMatchMedia,
    });
  });
});
