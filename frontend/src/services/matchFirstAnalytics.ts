export const MATCH_FIRST_EVENTS = [
  'match_first_landing_shown',
  'match_first_cta_clicked',
  'match_first_search_link_clicked',
  'match_first_survey_intro_shown',
  'match_first_survey_started',
  'match_first_survey_question_shown',
  'match_first_survey_answer_saved',
  'match_first_survey_abandoned',
  'match_first_survey_completed',
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
  'result_rank',
  'selected_result_id',
  'selected_house_id',
  'building_id',
  'map_zoom',
  'mobile_mode',
  'confidence_level',
  'confidence_score',
  'fallback_reason_code',
  'error_code',
]);
const SAFE_TOKEN_PATTERN = /^[a-z0-9_:#/.-]+$/i;

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
  return value.length <= 96 && SAFE_TOKEN_PATTERN.test(value);
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

export function recordMatchFirstEvent(
  eventName: MatchFirstEventName,
  context: Record<string, unknown> = {},
): MatchFirstAnalyticsEvent {
  const sanitizedContext = sanitizeContext(context);
  const locale = sanitizedContext.locale === 'nl' ? 'nl' : 'en';
  const event: MatchFirstAnalyticsEvent = {
    event_name: eventName,
    locale,
    context: sanitizedContext,
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
