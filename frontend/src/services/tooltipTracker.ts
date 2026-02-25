const KEY_PREFIX = 'buurt-check-tooltip-';

/**
 * Returns true if the user has already seen the tooltip with the given key.
 * Safe in private browsing mode (returns false if localStorage is unavailable,
 * meaning the tooltip will show but won't persist).
 */
export function hasSeenTooltip(key: string): boolean {
  try {
    return localStorage.getItem(`${KEY_PREFIX}${key}`) === '1';
  } catch {
    return false;
  }
}

/**
 * Marks a tooltip as seen so it will not be shown again.
 * Silently fails if localStorage is unavailable (private browsing).
 */
export function markTooltipSeen(key: string): void {
  try {
    localStorage.setItem(`${KEY_PREFIX}${key}`, '1');
  } catch {
    // Private browsing or quota exceeded — silently ignore
  }
}
