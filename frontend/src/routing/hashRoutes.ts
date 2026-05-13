export type HashRoute =
  | 'search'
  | 'dossier'
  | 'shortlist'
  | 'compare'
  | 'settings'
  | 'pack'
  | 'shared'
  | 'not_found'
  | 'matchLanding'
  | 'matchSurveyIntro'
  | 'matchSurvey'
  | 'matchReview'
  | 'matchRun'
  | 'matchSuccess'
  | 'matchResults'
  | 'matchNeighborhood'
  | 'matchReport'
  | 'matchComparison'
  | 'matchSimilar'
  | 'matchMap'
  | 'matchListings'
  | 'matchAlerts'
  | 'matchSaved'
  | 'matchAdmin'
  | 'matchSharedReport';

export interface MatchReturnContext {
  target: string;
  sessionId?: string;
  neighborhoodId?: string;
  mapCenter?: [number, number];
  mapZoom?: number;
  listScroll?: number;
  language?: 'en' | 'nl';
  selectedHouseId?: string;
}

export interface ParsedHashRoute {
  route: HashRoute;
  vboId?: string;
  lookupId?: string;
  reportId?: string;
  sessionId?: string;
  questionStep?: number;
  neighborhoodId?: string;
  buyerResume?: string;
  matchReturn?: MatchReturnContext;
  shareToken?: string;
  matchShareToken?: string;
  sharedMode?: 'briefing' | 'pack';
  rawPath?: string;
}

const MATCH_SESSION_STEP_ROUTES: Partial<Record<string, HashRoute>> = {
  intro: 'matchSurveyIntro',
  review: 'matchReview',
  run: 'matchRun',
  success: 'matchSuccess',
  results: 'matchResults',
};

const MATCH_SESSION_ROUTE_STEPS: Partial<Record<HashRoute, string>> = {
  matchSurveyIntro: 'intro',
  matchReview: 'review',
  matchRun: 'run',
  matchSuccess: 'success',
  matchResults: 'results',
};

function readFiniteNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readNonNegativeFiniteNumber(value: unknown): number | undefined {
  const parsed = readFiniteNumber(value);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

function readFiniteMapCenter(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const latitude = readFiniteNumber(value[0]);
  const longitude = readFiniteNumber(value[1]);
  return latitude === undefined || longitude === undefined ? undefined : [latitude, longitude];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function decodeRouteSegment(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function readAllowedMatchReturnTarget(target: string | undefined): Pick<MatchReturnContext, 'sessionId' | 'neighborhoodId'> | null {
  if (!target) return null;
  const withoutHash = target.startsWith('#') ? target.slice(1) : target;
  const [pathPart = ''] = withoutHash.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  if (path === '/match/map') return {};

  const resultsMatch = path.match(/^\/match\/session\/([^/]+)\/results$/);
  if (resultsMatch) {
    const sessionId = decodeRouteSegment(resultsMatch[1]);
    return sessionId ? { sessionId } : null;
  }

  const neighborhoodMatch = path.match(/^\/match\/session\/([^/]+)\/neighborhood\/([^/]+)$/);
  if (neighborhoodMatch) {
    const sessionId = decodeRouteSegment(neighborhoodMatch[1]);
    const neighborhoodId = decodeRouteSegment(neighborhoodMatch[2]);
    return sessionId && neighborhoodId ? { sessionId, neighborhoodId } : null;
  }

  return null;
}

function buildCanonicalMatchReturnContext(
  value: Partial<MatchReturnContext>,
): MatchReturnContext | undefined {
  const targetValue = typeof value.target === 'string' ? value.target : undefined;
  const allowedTarget = readAllowedMatchReturnTarget(targetValue);
  const sessionId = typeof value.sessionId === 'string' && value.sessionId.length > 0
    ? value.sessionId
    : allowedTarget?.sessionId;
  const neighborhoodId = typeof value.neighborhoodId === 'string' && value.neighborhoodId.length > 0
    ? value.neighborhoodId
    : allowedTarget?.neighborhoodId;

  if (!sessionId && !allowedTarget) return undefined;

  const target = sessionId && neighborhoodId
    ? `#/match/session/${encodeURIComponent(sessionId)}/neighborhood/${encodeURIComponent(neighborhoodId)}`
    : sessionId
      ? `#/match/session/${encodeURIComponent(sessionId)}/results`
      : '#/match/map';

  return {
    target,
    sessionId,
    neighborhoodId,
    mapCenter: value.mapCenter,
    mapZoom: value.mapZoom,
    listScroll: value.listScroll,
    language: value.language,
    selectedHouseId: value.selectedHouseId,
  };
}

function parseStructuredMatchReturnContext(encodedContext: string | undefined): {
  context: Partial<MatchReturnContext>;
  malformed: boolean;
} {
  if (!encodedContext) return { context: {}, malformed: false };
  try {
    const parsed = JSON.parse(encodedContext) as unknown;
    if (!isRecord(parsed)) return { context: {}, malformed: true };
    const context: Partial<MatchReturnContext> = {};

    if (hasOwn(parsed, 'mapCenter')) {
      const mapCenter = readFiniteMapCenter(parsed.mapCenter);
      if (!mapCenter) return { context: {}, malformed: true };
      context.mapCenter = mapCenter;
    }

    if (hasOwn(parsed, 'mapZoom')) {
      const mapZoom = readNonNegativeFiniteNumber(parsed.mapZoom);
      if (mapZoom === undefined) return { context: {}, malformed: true };
      context.mapZoom = mapZoom;
    }

    if (hasOwn(parsed, 'listScroll')) {
      const listScroll = readNonNegativeFiniteNumber(parsed.listScroll);
      if (listScroll === undefined) return { context: {}, malformed: true };
      context.listScroll = listScroll;
    }

    if (hasOwn(parsed, 'language')) {
      if (parsed.language !== 'en' && parsed.language !== 'nl') return { context: {}, malformed: true };
      context.language = parsed.language;
    }

    if (hasOwn(parsed, 'selectedHouseId')) {
      if (typeof parsed.selectedHouseId !== 'string') return { context: {}, malformed: true };
      context.selectedHouseId = parsed.selectedHouseId;
    }

    return { context, malformed: false };
  } catch {
    return { context: {}, malformed: true };
  }
}

export function hasMalformedMatchReturnRouteParams(params: URLSearchParams): boolean {
  return parseStructuredMatchReturnContext(params.get('match_context') ?? undefined).malformed;
}

function readCheckoutRouteParams(params: URLSearchParams): Pick<
  ParsedHashRoute,
  'reportId' | 'sessionId' | 'buyerResume'
> {
  return {
    reportId: params.get('report') ?? undefined,
    sessionId: params.get('session_id') ?? undefined,
    buyerResume: params.get('buyer_resume') ?? undefined,
  };
}

export function readMatchReturnRouteParams(params: URLSearchParams): MatchReturnContext | undefined {
  const target = params.get('match_return') ?? undefined;
  const sessionId = params.get('match_session') ?? undefined;
  const neighborhoodId = params.get('match_neighborhood') ?? undefined;
  const encodedContext = params.get('match_context') ?? undefined;
  if (!target && !sessionId && !neighborhoodId && !encodedContext) return undefined;

  const structuredContext = parseStructuredMatchReturnContext(encodedContext);
  if (structuredContext.malformed) return undefined;

  return buildCanonicalMatchReturnContext({
    target,
    sessionId,
    neighborhoodId,
    ...structuredContext.context,
  });
}

export function parseHashRoute(hash: string): ParsedHashRoute {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  const [pathPart = '', queryPart = ''] = value.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  return parseRoute(path, queryPart);
}

export function parseRoute(path: string, queryPart: string): ParsedHashRoute {
  const params = new URLSearchParams(queryPart);
  const normalizedPath = path === '/index.html' ? '/' : path;
  if (hasMalformedMatchReturnRouteParams(params)) {
    return { route: 'not_found', rawPath: normalizedPath };
  }
  const lookupId = params.get('lookup') ?? undefined;
  const checkoutParams = readCheckoutRouteParams(params);
  const matchReturn = readMatchReturnRouteParams(params);

  if (normalizedPath === '/saved') return { route: 'shortlist' };
  if (normalizedPath === '/compare') return { route: 'compare' };
  if (normalizedPath === '/settings') return { route: 'settings' };
  if (normalizedPath === '/match') return { route: 'matchLanding' };
  if (normalizedPath === '/match/intro') return { route: 'matchSurveyIntro' };
  if (normalizedPath === '/match/survey') return { route: 'matchSurvey' };
  if (normalizedPath === '/match/quiz') return { route: 'matchSurvey' };
  if (normalizedPath === '/match/report') return { route: 'matchReport' };
  if (normalizedPath === '/match/compare') return { route: 'matchComparison' };
  if (normalizedPath === '/match/similar') return { route: 'matchSimilar' };
  if (normalizedPath === '/match/map') return { route: 'matchMap' };
  if (normalizedPath === '/match/listings') return { route: 'matchListings' };
  if (normalizedPath === '/match/alerts') return { route: 'matchAlerts' };
  if (normalizedPath === '/match/saved') return { route: 'matchSaved' };
  if (normalizedPath === '/match/admin') return { route: 'matchAdmin' };
  if (normalizedPath === '/search') return { route: 'search' };

  const matchSession = normalizedPath.match(/^\/match\/session\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
  if (matchSession) {
    try {
      const sessionId = decodeURIComponent(matchSession[1]);
      const step = matchSession[2];
      const detail = matchSession[3];
      if (step === 'question' && detail) {
        const questionStep = Number(detail);
        if (!Number.isInteger(questionStep) || questionStep < 1) {
          return { route: 'not_found', rawPath: normalizedPath };
        }
        return { route: 'matchSurvey', sessionId, questionStep };
      }
      if (step === 'neighborhood' && detail) {
        return { route: 'matchNeighborhood', sessionId, neighborhoodId: decodeURIComponent(detail) };
      }
      const route = MATCH_SESSION_STEP_ROUTES[step];
      if (route && !detail) return { route, sessionId };
    } catch {
      return { route: 'not_found', rawPath: normalizedPath };
    }
    return { route: 'not_found', rawPath: normalizedPath };
  }

  const sharedMatchReport = normalizedPath.match(/^\/shared\/match\/report\/([^/]+)$/);
  if (sharedMatchReport) {
    try {
      return {
        route: 'matchSharedReport',
        matchShareToken: decodeURIComponent(sharedMatchReport[1]),
      };
    } catch {
      return { route: 'not_found', rawPath: normalizedPath };
    }
  }

  const packMatch = normalizedPath.match(/^\/pack\/([^/]+)\/([^/]+)$/);
  if (packMatch) {
    try {
      return {
        route: 'pack',
        vboId: decodeURIComponent(packMatch[1]),
        reportId: decodeURIComponent(packMatch[2]),
      };
    } catch {
      return { route: 'not_found', rawPath: normalizedPath };
    }
  }

  const sharedPackMatch = normalizedPath.match(/^\/shared-pack\/([^/]+)$/);
  if (sharedPackMatch) {
    try {
      return {
        route: 'shared',
        sharedMode: 'pack',
        shareToken: decodeURIComponent(sharedPackMatch[1]),
      };
    } catch {
      return { route: 'not_found', rawPath: normalizedPath };
    }
  }

  const sharedMatch = normalizedPath.match(/^\/shared\/([^/]+)$/);
  if (sharedMatch) {
    try {
      return {
        route: 'shared',
        sharedMode: 'briefing',
        shareToken: decodeURIComponent(sharedMatch[1]),
      };
    } catch {
      return { route: 'not_found', rawPath: normalizedPath };
    }
  }

  const dossierMatch = normalizedPath.match(/^\/address\/([^/]+)$/);
  if (dossierMatch) {
    try {
      return {
        route: 'dossier',
        vboId: decodeURIComponent(dossierMatch[1]),
        lookupId,
        matchReturn,
        ...checkoutParams,
      };
    } catch {
      return { route: 'not_found', rawPath: normalizedPath };
    }
  }

  if (normalizedPath === '/briefing') {
    return {
      route: 'dossier',
      lookupId,
      matchReturn,
      ...checkoutParams,
    };
  }

  if (normalizedPath === '/' && checkoutParams.reportId && checkoutParams.sessionId) {
    return {
      route: 'dossier',
      lookupId,
      ...checkoutParams,
    };
  }

  if (normalizedPath === '/') return { route: 'matchLanding' };

  return { route: 'not_found', rawPath: normalizedPath };
}

export function buildHashRoute(parsed: ParsedHashRoute): string {
  if (parsed.route === 'shortlist') return '#/saved';
  if (parsed.route === 'compare') return '#/compare';
  if (parsed.route === 'settings') return '#/settings';
  if (parsed.route === 'matchLanding') return '#/match';
  if (parsed.route === 'matchSurveyIntro') {
    return parsed.sessionId ? `#/match/session/${encodeURIComponent(parsed.sessionId)}/intro` : '#/match/intro';
  }
  if (parsed.route === 'matchSurvey') {
    return parsed.sessionId
      ? `#/match/session/${encodeURIComponent(parsed.sessionId)}/question/${parsed.questionStep ?? 1}`
      : '#/match/survey';
  }
  const sessionStep = MATCH_SESSION_ROUTE_STEPS[parsed.route];
  if (sessionStep && parsed.sessionId) {
    return `#/match/session/${encodeURIComponent(parsed.sessionId)}/${sessionStep}`;
  }
  if (parsed.route === 'matchNeighborhood' && parsed.sessionId && parsed.neighborhoodId) {
    return `#/match/session/${encodeURIComponent(parsed.sessionId)}/neighborhood/${encodeURIComponent(parsed.neighborhoodId)}`;
  }
  if (parsed.route === 'matchReport') return '#/match/report';
  if (parsed.route === 'matchComparison') return '#/match/compare';
  if (parsed.route === 'matchSimilar') return '#/match/similar';
  if (parsed.route === 'matchMap') return '#/match/map';
  if (parsed.route === 'matchListings') return '#/match/listings';
  if (parsed.route === 'matchAlerts') return '#/match/alerts';
  if (parsed.route === 'matchSaved') return '#/match/saved';
  if (parsed.route === 'matchAdmin') return '#/match/admin';
  if (parsed.route === 'matchSharedReport' && parsed.matchShareToken) {
    return `#/shared/match/report/${encodeURIComponent(parsed.matchShareToken)}`;
  }
  if (parsed.route === 'pack' && parsed.vboId && parsed.reportId) {
    return `#/pack/${encodeURIComponent(parsed.vboId)}/${encodeURIComponent(parsed.reportId)}`;
  }
  if (parsed.route === 'shared' && parsed.shareToken) {
    const path = parsed.sharedMode === 'pack' ? 'shared-pack' : 'shared';
    return `#/${path}/${encodeURIComponent(parsed.shareToken)}`;
  }
  if (parsed.route === 'not_found') return parsed.rawPath ? `#${parsed.rawPath}` : '#/not-found';
  if (parsed.route !== 'dossier') return '#/search';

  const params = new URLSearchParams();
  if (parsed.lookupId) params.set('lookup', parsed.lookupId);
  if (parsed.reportId) params.set('report', parsed.reportId);
  if (parsed.sessionId) params.set('session_id', parsed.sessionId);
  if (parsed.buyerResume) params.set('buyer_resume', parsed.buyerResume);
  if (parsed.matchReturn) {
    const matchReturn = buildCanonicalMatchReturnContext(parsed.matchReturn);
    if (!matchReturn) {
      const query = params.toString();
      if (!parsed.vboId) return `#/briefing${query ? `?${query}` : ''}`;
      return `#/address/${encodeURIComponent(parsed.vboId)}${query ? `?${query}` : ''}`;
    }
    params.set('match_return', matchReturn.target);
    if (matchReturn.sessionId) params.set('match_session', matchReturn.sessionId);
    if (matchReturn.neighborhoodId) params.set('match_neighborhood', matchReturn.neighborhoodId);
    const structuredContext = {
      ...(matchReturn.mapCenter ? { mapCenter: matchReturn.mapCenter } : {}),
      ...(typeof matchReturn.mapZoom === 'number' ? { mapZoom: matchReturn.mapZoom } : {}),
      ...(typeof matchReturn.listScroll === 'number' ? { listScroll: matchReturn.listScroll } : {}),
      ...(matchReturn.language ? { language: matchReturn.language } : {}),
      ...(matchReturn.selectedHouseId ? { selectedHouseId: matchReturn.selectedHouseId } : {}),
    };
    if (Object.keys(structuredContext).length > 0) {
      params.set('match_context', JSON.stringify(structuredContext));
    }
  }

  const query = params.toString();
  if (!parsed.vboId) return `#/briefing${query ? `?${query}` : ''}`;
  return `#/address/${encodeURIComponent(parsed.vboId)}${query ? `?${query}` : ''}`;
}
