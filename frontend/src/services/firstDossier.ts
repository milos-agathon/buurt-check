const FIRST_DOSSIER_KEY = 'buurt-check:first-dossier-used';

export function isFirstDossierAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(FIRST_DOSSIER_KEY) === null;
  } catch {
    return false;
  }
}

export function markFirstDossierUsed(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FIRST_DOSSIER_KEY, '1');
  } catch {
    // Ignore storage errors (private mode / quota).
  }
}

