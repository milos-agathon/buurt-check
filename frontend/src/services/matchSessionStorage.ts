import type { MatchSessionSnapshot } from '../types/matchFirst';

const SNAPSHOT_KEY_PREFIX = 'buurt-check-match-first-session:';
const ACTIVE_SNAPSHOT_KEY = 'buurt-check-match-first-active-session';

function snapshotKey(sessionId: string): string {
  return `${SNAPSHOT_KEY_PREFIX}${sessionId}`;
}

function isSnapshot(value: unknown): value is MatchSessionSnapshot {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<MatchSessionSnapshot>;
  return typeof record.sessionId === 'string'
    && (record.locale === 'en' || record.locale === 'nl')
    && typeof record.step === 'number'
    && typeof record.answerVersion === 'number'
    && typeof record.staleResults === 'boolean'
    && typeof record.answers === 'object'
    && record.answers !== null;
}

export function readMatchSessionSnapshot(sessionId: string | null | undefined): MatchSessionSnapshot | null {
  if (typeof window === 'undefined' || !sessionId) return null;
  try {
    const raw = window.sessionStorage.getItem(snapshotKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readActiveMatchSessionSnapshot(): MatchSessionSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    return readMatchSessionSnapshot(window.sessionStorage.getItem(ACTIVE_SNAPSHOT_KEY));
  } catch {
    return null;
  }
}

export function saveMatchSessionSnapshot(sessionId: string, snapshot: MatchSessionSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(snapshotKey(sessionId), JSON.stringify(snapshot));
    window.sessionStorage.setItem(ACTIVE_SNAPSHOT_KEY, sessionId);
  } catch {
    // React state remains the active in-tab source when sessionStorage is unavailable.
  }
}

export function clearMatchSessionSnapshot(sessionId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(snapshotKey(sessionId));
    if (window.sessionStorage.getItem(ACTIVE_SNAPSHOT_KEY) === sessionId) {
      window.sessionStorage.removeItem(ACTIVE_SNAPSHOT_KEY);
    }
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}

export function getMatchSessionSnapshotStorageKey(sessionId: string): string {
  return snapshotKey(sessionId);
}
