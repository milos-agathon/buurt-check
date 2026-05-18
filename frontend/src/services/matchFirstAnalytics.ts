import { buildPrimaryApiUrl } from '../config/apiBase';

export const MATCH_FIRST_EVENTS = [
  'match_landing_cta_shown',
  'match_landing_cta_clicked',
  'match_first_search_link_clicked',
  'match_survey_intro_shown',
  'match_survey_started',
  'match_survey_question_shown',
  'match_survey_answer_saved',
  'match_survey_answer_save_failed',
  'match_first_survey_back_clicked',
  'match_survey_question_abandoned',
  'match_survey_completed',
  'match_first_survey_review_shown',
  'match_final_run_cta_clicked',
  'match_job_queued',
  'match_job_running',
  'match_job_slow',
  'match_job_completed',
  'match_job_failed',
  'match_job_completed_with_fallback',
  'match_job_completed_no_strong_matches',
  'match_job_retry_clicked',
  'match_results_unavailable',
  'match_success_checkmark_shown',
  'match_results_map_opened',
  'match_results_confidence_sufficient',
  'match_recommendation_selected',
  'match_map_feature_selected',
  'match_map_layer_failed',
  'match_neighborhood_detail_opened',
  'match_building_layer_failed',
  'match_amenity_layer_failed',
  'match_amenity_interacted',
  'match_missing_3d_fallback_shown',
  'match_house_selected',
  'match_dossier_opened',
  'match_no_reliable_address_shown',
  'match_back_to_map_clicked',
  'match_back_to_map_return_success',
  'match_back_to_map_return_failed',
] as const;

export type MatchFirstEventName = typeof MATCH_FIRST_EVENTS[number];

export interface MatchFirstAnalyticsEvent {
  event_id: string;
  event_name: MatchFirstEventName;
  locale: 'en' | 'nl';
  context: Record<string, unknown>;
  created_at: string;
}

const STORAGE_KEY = 'buurt-check-match-first-analytics';
const ALLOWED_CONTEXT_KEYS = new Set([
  'locale',
  'source',
  'route',
  'session_id',
  'question_id',
  'step',
  'total_steps',
  'answer_type',
  'answer_count',
  'from_step',
  'to_step',
  'reason',
  'stale_results',
  'job_id',
  'status',
  'stage',
  'progress',
  'runtime_ms',
  'poll_after_ms',
  'result_set_id',
  'preference_vector_version',
  'recommendation_id',
  'neighborhood_id',
  'amenity_key',
  'result_rank',
  'selected_result_id',
  'map_zoom',
  'mobile_mode',
  'confidence_level',
  'confidence_score',
  'fallback_reason_code',
  'error_code',
]);
const SAFE_TOKEN_PATTERN = /^[a-z0-9_:#/.-]+$/i;
const PRIVATE_VALUE_PATTERNS = [
  /(?:^|[^\d])\d{16}(?:$|[^\d])/,
  /(?:#)?\/address\//i,
  /lookup=/i,
];
const ANALYTICS_ENDPOINT = '/match/analytics';

function readStoredEvents(): MatchFirstAnalyticsEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as MatchFirstAnalyticsEvent[] : [];
  } catch {
    return [];
  }
}

function isSafeString(value: string): boolean {
  return (
    value.length <= 96
    && SAFE_TOKEN_PATTERN.test(value)
    && !PRIVATE_VALUE_PATTERNS.some((pattern) => pattern.test(value))
  );
}

function sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(context)
      .filter(([key]) => ALLOWED_CONTEXT_KEYS.has(key))
      .filter(([, value]) => {
        if (typeof value === 'string') return isSafeString(value);
        return typeof value === 'number' || typeof value === 'boolean';
      }),
  );
}

function createEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `evt_${crypto.randomUUID()}`;
  }
  const random = Math.random().toString(36).slice(2, 12);
  return `evt_${Date.now().toString(36)}_${random}`;
}

function postAnalyticsEvent(event: MatchFirstAnalyticsEvent): void {
  if (typeof fetch !== 'function') return;

  const sessionId = typeof event.context.session_id === 'string'
    ? event.context.session_id
    : undefined;

  void fetch(buildPrimaryApiUrl(ANALYTICS_ENDPOINT), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      event_id: event.event_id,
      event_name: event.event_name,
      session_id: sessionId,
      locale: event.locale,
      context: event.context,
    }),
  }).catch(() => {
    // Analytics transport must never block or surface in the match journey.
  });
}

export function recordMatchFirstEvent(
  eventName: MatchFirstEventName,
  context: Record<string, unknown> = {},
): MatchFirstAnalyticsEvent {
  const sanitizedContext = sanitizeContext(context);
  const locale = sanitizedContext.locale === 'nl' ? 'nl' : 'en';
  const event: MatchFirstAnalyticsEvent = {
    event_id: createEventId(),
    event_name: eventName,
    locale,
    context: sanitizedContext,
    created_at: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    try {
      const events = readStoredEvents();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...events, event].slice(-100)));
    } catch {
      // Analytics must never block the primary match flow.
    }
  }

  postAnalyticsEvent(event);

  return event;
}
