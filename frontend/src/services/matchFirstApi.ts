import { buildPrimaryApiUrl } from '../config/apiBase';
import type {
  MatchFirstLocale,
  MatchSessionCreateResponse,
  MatchSessionResponse,
  SurveyAnswerPatchResponse,
  MatchFirstSurveyAnswers,
  MatchRunResponse,
  MatchJobStatusResponse,
  MatchResultsResponse,
} from '../types/matchFirst';

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail: string | null = null;
    try {
      const body = await response.json() as unknown;
      if (body && typeof body === 'object' && typeof (body as { detail?: unknown }).detail === 'string') {
        detail = (body as { detail: string }).detail;
      }
    } catch {
      detail = null;
    }
    throw new Error(detail ?? `match_first_api_${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function createMatchSession(payload: {
  locale: MatchFirstLocale;
  source: 'landing' | 'intro' | 'resume';
}): Promise<MatchSessionCreateResponse> {
  const response = await fetch(buildPrimaryApiUrl('/match/sessions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return readJson<MatchSessionCreateResponse>(response);
}

export async function getMatchSession(sessionId: string): Promise<MatchSessionResponse> {
  const response = await fetch(buildPrimaryApiUrl(`/match/sessions/${encodeURIComponent(sessionId)}`), {
    credentials: 'include',
  });
  return readJson<MatchSessionResponse>(response);
}

export async function patchMatchSessionAnswers(
  sessionId: string,
  payload: {
    locale: MatchFirstLocale;
    current_step: number;
    answers: MatchFirstSurveyAnswers;
  },
): Promise<SurveyAnswerPatchResponse> {
  const response = await fetch(buildPrimaryApiUrl(`/match/sessions/${encodeURIComponent(sessionId)}/answers`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return readJson<SurveyAnswerPatchResponse>(response);
}

export async function runMatchSession(
  sessionId: string,
  payload: {
    preference_vector_version: string;
    source: 'review_final_cta';
  },
): Promise<MatchRunResponse> {
  const response = await fetch(buildPrimaryApiUrl(`/match/sessions/${encodeURIComponent(sessionId)}/run`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return readJson<MatchRunResponse>(response);
}

export async function getMatchStatus(sessionId: string): Promise<MatchJobStatusResponse> {
  const response = await fetch(buildPrimaryApiUrl(`/match/sessions/${encodeURIComponent(sessionId)}/status`), {
    credentials: 'include',
  });
  return readJson<MatchJobStatusResponse>(response);
}

export async function getMatchResults(sessionId: string): Promise<MatchResultsResponse> {
  const response = await fetch(buildPrimaryApiUrl(`/match/sessions/${encodeURIComponent(sessionId)}/results`), {
    credentials: 'include',
  });
  return readJson<MatchResultsResponse>(response);
}
