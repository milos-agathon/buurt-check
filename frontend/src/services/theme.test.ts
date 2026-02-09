import { describe, it, expect, beforeEach } from 'vitest';
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
  });

  it('returns system as default theme', () => {
    expect(getTheme()).toBe('system');
  });

  it('stores theme preference in localStorage', () => {
    setTheme('dark');
    expect(getTheme()).toBe('dark');
    expect(localStorage.getItem('buurt-check-theme')).toBe('dark');
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
});
