const STORAGE_KEY = 'buurt-check-theme';
const THEME_TRANSITION_CLASS = 'theme-transitioning';
const THEME_TRANSITION_TIMEOUT_MS = 250;

let themeTransitionTimeout: number | null = null;

export type ThemePreference = 'light' | 'dark' | 'system';

interface ApplyThemeOptions {
  withTransition?: boolean;
}

export function getTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Safari private browsing can throw on localStorage access.
  }
  return 'system';
}

export function setTheme(pref: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Ignore persistence failures (private mode, quota exceeded).
  }
  applyTheme(pref, { withTransition: true });
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

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function clearThemeTransitionTimeout(): void {
  if (themeTransitionTimeout != null) {
    window.clearTimeout(themeTransitionTimeout);
    themeTransitionTimeout = null;
  }
}

function beginThemeTransition(): void {
  const root = document.documentElement;
  clearThemeTransitionTimeout();
  root.classList.add(THEME_TRANSITION_CLASS);
  themeTransitionTimeout = window.setTimeout(() => {
    root.classList.remove(THEME_TRANSITION_CLASS);
    themeTransitionTimeout = null;
  }, THEME_TRANSITION_TIMEOUT_MS);
}

function cancelThemeTransition(): void {
  clearThemeTransitionTimeout();
  document.documentElement.classList.remove(THEME_TRANSITION_CLASS);
}

export function applyTheme(pref?: ThemePreference, options: ApplyThemeOptions = {}): void {
  const effective = getEffectiveTheme(pref);
  if (options.withTransition) {
    if (prefersReducedMotion()) {
      cancelThemeTransition();
    } else {
      beginThemeTransition();
    }
  }
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
