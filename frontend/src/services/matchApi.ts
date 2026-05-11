import { buildPrimaryApiUrl } from '../config/apiBase';
import type {
  MatchLocale,
  MatchComparePayload,
  MatchCompareResponse,
  MatchMapResponse,
  MatchQuizPayload,
  MatchQuizResponse,
  MatchReportCreatePayload,
  MatchReportResponse,
  MatchSimilarPayload,
  MatchSimilarResponse,
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

  return await response.json() as MatchReportResponse;
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
