const STORAGE_KEY = 'buurt-check-theme';

export type ThemePreference = 'light' | 'dark' | 'system';

export function getTheme(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

export function setTheme(pref: ThemePreference): void {
  localStorage.setItem(STORAGE_KEY, pref);
  applyTheme(pref);
}

export function getEffectiveTheme(pref?: ThemePreference): 'light' | 'dark' {
  const p = pref ?? getTheme();
  if (p === 'light' || p === 'dark') return p;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(pref?: ThemePreference): void {
  const effective = getEffectiveTheme(pref);
  document.documentElement.setAttribute('data-theme', effective);
}

export function listenForSystemChanges(callback: () => void): () => void {
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (getTheme() === 'system') {
        applyTheme();
        callback();
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  } catch {
    return () => {};
  }
}
