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
  MatchNeighborhoodAmenitiesResponse,
  MatchNeighborhoodBuildingsResponse,
  MatchNeighborhoodMapLayersResponse,
  MatchNeighborhoodSummaryResponse,
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

function appendLayerContext(
  path: string,
  params: {
    sessionId: string;
    resultSetId: string;
  },
): string {
  const query = new URLSearchParams({
    session_id: params.sessionId,
    result_set_id: params.resultSetId,
  });
  return `${path}?${query.toString()}`;
}

export async function getMatchNeighborhood(
  neighborhoodId: string,
): Promise<MatchNeighborhoodSummaryResponse> {
  const response = await fetch(buildPrimaryApiUrl(`/match/neighborhoods/${encodeURIComponent(neighborhoodId)}`), {
    credentials: 'include',
  });
  return readJson<MatchNeighborhoodSummaryResponse>(response);
}

export async function getMatchNeighborhoodMapLayers(
  neighborhoodId: string,
  params: {
    sessionId: string;
    resultSetId: string;
  },
): Promise<MatchNeighborhoodMapLayersResponse> {
  const path = appendLayerContext(
    `/match/neighborhoods/${encodeURIComponent(neighborhoodId)}/map-layers`,
    params,
  );
  const response = await fetch(buildPrimaryApiUrl(path), {
    credentials: 'include',
  });
  return readJson<MatchNeighborhoodMapLayersResponse>(response);
}

export async function getMatchNeighborhoodBuildings(
  neighborhoodId: string,
  params: {
    sessionId: string;
    resultSetId: string;
    boundsRd: [number, number, number, number] | number[];
    lod?: 'low' | 'medium' | 'high';
    limit?: number;
  },
): Promise<MatchNeighborhoodBuildingsResponse> {
  const query = new URLSearchParams({
    session_id: params.sessionId,
    result_set_id: params.resultSetId,
    bounds_rd: params.boundsRd.join(','),
    lod: params.lod ?? 'low',
    limit: String(params.limit ?? 50),
  });
  const response = await fetch(buildPrimaryApiUrl(
    `/match/neighborhoods/${encodeURIComponent(neighborhoodId)}/buildings?${query.toString()}`,
  ), {
    credentials: 'include',
  });
  return readJson<MatchNeighborhoodBuildingsResponse>(response);
}

export async function getMatchNeighborhoodAmenities(
  neighborhoodId: string,
  params: {
    sessionId: string;
    resultSetId: string;
  },
): Promise<MatchNeighborhoodAmenitiesResponse> {
  const path = appendLayerContext(
    `/match/neighborhoods/${encodeURIComponent(neighborhoodId)}/amenities`,
    params,
  );
  const response = await fetch(buildPrimaryApiUrl(path), {
    credentials: 'include',
  });
  return readJson<MatchNeighborhoodAmenitiesResponse>(response);
}
