import type { MatchProductEventName } from '../types/match';

export type MatchEventName = MatchProductEventName;

export interface MatchAnalyticsEvent {
  event_name: MatchEventName;
  locale: 'en' | 'nl';
  context: Record<string, unknown>;
  created_at: string;
}

const STORAGE_KEY = 'buurt-check-match-analytics';

function readStoredEvents(): MatchAnalyticsEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as MatchAnalyticsEvent[] : [];
  } catch {
    return [];
  }
}

export function recordMatchEvent(
  eventName: MatchEventName,
  context: Record<string, unknown> = {},
): MatchAnalyticsEvent {
  const locale = context.locale === 'nl' ? 'nl' : 'en';
  const event: MatchAnalyticsEvent = {
    event_name: eventName,
    locale,
    context,
    created_at: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    const events = readStoredEvents();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...events, event].slice(-50)));
  }

  return event;
}
