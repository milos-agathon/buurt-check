const MATCH_FIRST_LANDING_EVENTS = [
  'match_first_landing_shown',
  'match_first_cta_clicked',
  'match_first_search_link_clicked',
] as const;

export type MatchFirstLandingEventName = typeof MATCH_FIRST_LANDING_EVENTS[number];

export interface MatchFirstAnalyticsEvent {
  event_name: MatchFirstLandingEventName;
  locale: 'en' | 'nl';
  context: Record<string, unknown>;
  created_at: string;
}

const STORAGE_KEY = 'buurt-check-match-first-analytics';

function readStoredEvents(): MatchFirstAnalyticsEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as MatchFirstAnalyticsEvent[] : [];
  } catch {
    return [];
  }
}

export function recordMatchFirstEvent(
  eventName: MatchFirstLandingEventName,
  context: Record<string, unknown> = {},
): MatchFirstAnalyticsEvent {
  const locale = context.locale === 'nl' ? 'nl' : 'en';
  const event: MatchFirstAnalyticsEvent = {
    event_name: eventName,
    locale,
    context,
    created_at: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    try {
      const events = readStoredEvents();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...events, event].slice(-50)));
    } catch {
      // Analytics must never block the primary match flow.
    }
  }

  return event;
}
