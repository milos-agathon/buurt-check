import { buildPrimaryApiUrl } from '../config/apiBase';
import type {
  MatchLocale,
  MatchAlertCreatePayload,
  MatchAlertCreateResponse,
  MatchAlertListResponse,
  MatchAdminHealthResponse,
  MatchComparePayload,
  MatchCompareResponse,
  MatchFeedbackPayload,
  MatchFeedbackResponse,
  MatchListingCriteria,
  MatchListingProviderResult,
  MatchMapResponse,
  MatchRecommendationsPayload,
  MatchRecommendationsResponse,
  MatchQuizPayload,
  MatchQuizResponse,
  ReportExportPayload,
  ReportExportResponse,
  ReportPdfExportResponse,
  ReportSaveResponse,
  ReportSharePayload,
  ReportShareResponse,
  MatchReportCreatePayload,
  MatchReportResponse,
  MatchSimilarPayload,
  MatchSimilarResponse,
  SavedNeighborhood,
  SavedNeighborhoodCreatePayload,
  SavedNeighborhoodListResponse,
  AlertStatus,
} from '../types/match';
import { recordMatchEvent } from './matchAnalytics';

export class MatchApiError extends Error {
  readonly status: number;
  readonly warningCode?: string;

  constructor(status: number, warningCode?: string) {
    super(warningCode ?? `match_api_error_${status}`);
    this.name = 'MatchApiError';
    this.status = status;
    this.warningCode = warningCode;
  }
}

export async function submitMatchQuiz(payload: MatchQuizPayload): Promise<MatchQuizResponse> {
  const response = await fetch(buildPrimaryApiUrl('/match/quiz'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new MatchApiError(response.status, 'match.warning.quiz_submit_failed');
  }

  const body = await response.json() as MatchQuizResponse;
  recordMatchEvent('match_quiz_completed', {
    locale: body.preference_vector.locale,
    journey_intent: body.preference_vector.journey_intent,
  });
  return body;
}

export async function createMatchReport(
  payload: MatchReportCreatePayload,
): Promise<MatchReportResponse> {
  const response = await fetch(buildPrimaryApiUrl('/match/reports'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new MatchApiError(response.status, 'match.warning.report_create_failed');
  }

  return await response.json() as MatchReportResponse;
}

export async function fetchMatchRecommendations(
  payload: MatchRecommendationsPayload,
): Promise<MatchRecommendationsResponse> {
  const response = await fetch(buildPrimaryApiUrl('/match/recommendations'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new MatchApiError(response.status, 'match.warning.recommendations_failed');
  }

  return await response.json() as MatchRecommendationsResponse;
}

export async function fetchMatchReport(
  reportId: string,
  locale?: MatchLocale,
): Promise<MatchReportResponse> {
  const query = locale ? `?locale=${encodeURIComponent(locale)}` : '';
  const response = await fetch(buildPrimaryApiUrl(`/match/reports/${encodeURIComponent(reportId)}${query}`), {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new MatchApiError(response.status, 'match.warning.report_fetch_failed');
  }

  const body = await response.json() as MatchReportResponse;
  recordMatchEvent('match_report_viewed', {
    locale: body.locale,
    report_id: body.report_id,
  });
  return body;
}

export async function fetchSharedMatchReport(
  shareToken: string,
): Promise<MatchReportResponse> {
  const response = await fetch(buildPrimaryApiUrl(`/match/shared/${encodeURIComponent(shareToken)}`), {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new MatchApiError(response.status, 'match.warning.report_fetch_failed');
  }

  const body = await response.json() as MatchReportResponse;
  recordMatchEvent('match_report_viewed', {
    locale: body.locale,
    report_id: body.report_id,
    share: true,
  });
  return body;
}

export async function compareMatchNeighborhoods(
  payload: MatchComparePayload,
): Promise<MatchCompareResponse> {
  const response = await fetch(buildPrimaryApiUrl('/match/compare'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new MatchApiError(response.status, 'match.warning.compare_failed');
  }

  return await response.json() as MatchCompareResponse;
}

export async function findSimilarMatchNeighborhoods(
  payload: MatchSimilarPayload,
): Promise<MatchSimilarResponse> {
  const response = await fetch(buildPrimaryApiUrl('/match/similar'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new MatchApiError(response.status, 'match.warning.similar_failed');
  }

  return await response.json() as MatchSimilarResponse;
}

export async function fetchMatchMap(params: {
  category?: string;
  min_score?: number;
} = {}): Promise<MatchMapResponse> {
  const query = new URLSearchParams();
  if (params.category) query.set('category', params.category);
  if (params.min_score != null) query.set('min_score', String(params.min_score));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const response = await fetch(buildPrimaryApiUrl(`/match/map${suffix}`), {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new MatchApiError(response.status, 'match.warning.map_failed');
  }

  return await response.json() as MatchMapResponse;
}

export async function fetchMatchListings(
  criteria: MatchListingCriteria,
): Promise<MatchListingProviderResult> {
  const query = new URLSearchParams({
    neighborhood_id: criteria.neighborhood_id,
    journey_intent: criteria.journey_intent,
  });
  if (criteria.budget_max_cents != null) query.set('budget_max_cents', String(criteria.budget_max_cents));
  if (criteria.rent_max_cents != null) query.set('rent_max_cents', String(criteria.rent_max_cents));
  if (criteria.property_type) query.set('property_type', criteria.property_type);

  const response = await fetch(buildPrimaryApiUrl(`/match/listings?${query.toString()}`), {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new MatchApiError(response.status, 'match.warning.listings_failed');
  }

  const body = await response.json() as MatchListingProviderResult;
  if (body.listings.length > 0) {
    recordMatchEvent('match_listing_clicked', {
      locale: 'en',
      provider_mode: body.provider.mode,
      neighborhood_id: criteria.neighborhood_id,
    });
  }
  return body;
}

export async function createMatchAlert(
  payload: MatchAlertCreatePayload,
): Promise<MatchAlertCreateResponse> {
  const response = await fetch(buildPrimaryApiUrl('/match/alerts'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new MatchApiError(response.status, 'match.warning.alert_create_failed');
  }

  const body = await response.json() as MatchAlertCreateResponse;
  recordMatchEvent('match_alert_created', {
    locale: 'en',
    journey_intent: body.alert.journey_intent,
    source_context: body.alert.source_context,
  });
  return body;
}

export async function fetchMatchAlerts(sessionId?: string): Promise<MatchAlertListResponse> {
  const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
  const response = await fetch(buildPrimaryApiUrl(`/match/alerts${query}`), {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new MatchApiError(response.status, 'match.warning.alert_fetch_failed');
  }

  return await response.json() as MatchAlertListResponse;
}

export async function updateMatchAlertStatus(
  alertId: string,
  status: AlertStatus,
): Promise<MatchAlertCreateResponse['alert']> {
  const response = await fetch(buildPrimaryApiUrl(`/match/alerts/${encodeURIComponent(alertId)}`), {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    throw new MatchApiError(response.status, 'match.warning.alert_update_failed');
  }

  return await response.json() as MatchAlertCreateResponse['alert'];
}

export async function deleteMatchAlert(alertId: string): Promise<MatchAlertCreateResponse['alert']> {
  const response = await fetch(buildPrimaryApiUrl(`/match/alerts/${encodeURIComponent(alertId)}`), {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new MatchApiError(response.status, 'match.warning.alert_delete_failed');
  }

  return await response.json() as MatchAlertCreateResponse['alert'];
}

export async function saveMatchReport(
  reportId: string,
  sessionId?: string | null,
): Promise<ReportSaveResponse> {
  const response = await fetch(buildPrimaryApiUrl(`/match/reports/${encodeURIComponent(reportId)}/save`), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId ?? null }),
  });

  if (!response.ok) {
    throw new MatchApiError(response.status, 'match.warning.report_save_failed');
  }

  return await response.json() as ReportSaveResponse;
}

export async function shareMatchReport(
  reportId: string,
  payload: ReportSharePayload,
): Promise<ReportShareResponse> {
  const response = await fetch(buildPrimaryApiUrl(`/match/reports/${encodeURIComponent(reportId)}/share`), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new MatchApiError(response.status, 'match.warning.report_share_failed');
  }

  return await response.json() as ReportShareResponse;
}

export async function exportMatchReport(
  reportId: string,
  payload: ReportExportPayload,
): Promise<ReportExportResponse | ReportPdfExportResponse> {
  const response = await fetch(buildPrimaryApiUrl(`/match/reports/${encodeURIComponent(reportId)}/export`), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new MatchApiError(response.status, 'match.warning.report_export_failed');
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/pdf')) {
    return {
      export_id: response.headers.get('x-match-export-id'),
      blob: await response.blob(),
    };
  }

  return await response.json() as ReportExportResponse;
}

export async function saveMatchNeighborhood(
  payload: SavedNeighborhoodCreatePayload,
): Promise<SavedNeighborhood> {
  const response = await fetch(buildPrimaryApiUrl('/match/saved-neighborhoods'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new MatchApiError(response.status, 'match.warning.saved_neighborhood_failed');
  }

  const body = await response.json() as SavedNeighborhood;
  recordMatchEvent('match_neighborhood_saved', {
    locale: 'en',
    neighborhood_id: body.neighborhood_id,
    saved_from: body.saved_from,
  });
  return body;
}

export async function fetchSavedMatchNeighborhoods(
  sessionId?: string,
): Promise<SavedNeighborhoodListResponse> {
  const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
  const response = await fetch(buildPrimaryApiUrl(`/match/saved-neighborhoods${query}`), {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new MatchApiError(response.status, 'match.warning.saved_neighborhood_fetch_failed');
  }

  return await response.json() as SavedNeighborhoodListResponse;
}

export async function deleteSavedMatchNeighborhood(savedNeighborhoodId: string): Promise<{ deleted: boolean }> {
  const response = await fetch(
    buildPrimaryApiUrl(`/match/saved-neighborhoods/${encodeURIComponent(savedNeighborhoodId)}`),
    {
      method: 'DELETE',
      credentials: 'include',
    },
  );

  if (!response.ok) {
    throw new MatchApiError(response.status, 'match.warning.saved_neighborhood_delete_failed');
  }

  return await response.json() as { deleted: boolean };
}

export async function submitMatchFeedback(
  payload: MatchFeedbackPayload,
): Promise<MatchFeedbackResponse> {
  const response = await fetch(buildPrimaryApiUrl('/match/feedback'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new MatchApiError(response.status, 'match.warning.feedback_failed');
  }

  const body = await response.json() as MatchFeedbackResponse;
  recordMatchEvent('match_feedback_submitted', {
    locale: 'en',
    feedback_type: body.feedback_event.feedback_type,
    neighborhood_id: body.feedback_event.neighborhood_id,
  });
  return body;
}

export async function fetchMatchAdminHealth(): Promise<MatchAdminHealthResponse> {
  const response = await fetch(buildPrimaryApiUrl('/admin/match/health'), {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new MatchApiError(response.status, 'match.warning.admin_health_failed');
  }

  return await response.json() as MatchAdminHealthResponse;
}
