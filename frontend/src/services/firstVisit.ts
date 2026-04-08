const STORAGE_KEY = 'buurt-check-visited';

/**
 * Returns true if the user has never completed a dossier load.
 * Safe in private browsing mode (returns true if localStorage is unavailable).
 */
export function isFirstVisit(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '1';
  } catch {
    return true;
  }
}

/**
 * Marks the user as having visited (completed at least one dossier load).
 * Silently fails if localStorage is unavailable (private browsing).
 */
export function markVisited(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Private browsing or quota exceeded — silently ignore
  }
}

/**
 * Resets the first-visit marker so the app can show the onboarding search state again.
 */
export function clearVisited(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private browsing or quota exceeded — silently ignore
  }
}
