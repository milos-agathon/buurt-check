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

function readMatchReturnRouteParams(params: URLSearchParams): MatchReturnContext | undefined {
  const target = params.get('match_return') ?? undefined;
  const sessionId = params.get('match_session') ?? undefined;
  const neighborhoodId = params.get('match_neighborhood') ?? undefined;
  const encodedContext = params.get('match_context') ?? undefined;
  if (!target && !sessionId && !neighborhoodId && !encodedContext) return undefined;
  let structuredContext: Partial<MatchReturnContext> = {};
  if (encodedContext) {
    try {
      const parsed = JSON.parse(encodedContext) as Partial<MatchReturnContext>;
      structuredContext = {
        mapCenter: Array.isArray(parsed.mapCenter) && parsed.mapCenter.length === 2
          ? [Number(parsed.mapCenter[0]), Number(parsed.mapCenter[1])]
          : undefined,
        mapZoom: typeof parsed.mapZoom === 'number' ? parsed.mapZoom : undefined,
        listScroll: typeof parsed.listScroll === 'number' ? parsed.listScroll : undefined,
        language: parsed.language === 'en' || parsed.language === 'nl' ? parsed.language : undefined,
        selectedHouseId: typeof parsed.selectedHouseId === 'string' ? parsed.selectedHouseId : undefined,
      };
    } catch {
      structuredContext = {};
    }
  }

  const canonicalTarget = target && target !== '#/match/map'
    ? target
    : sessionId && neighborhoodId
      ? `#/match/session/${encodeURIComponent(sessionId)}/neighborhood/${encodeURIComponent(neighborhoodId)}`
      : sessionId
        ? `#/match/session/${encodeURIComponent(sessionId)}/results`
        : '#/match/map';

  return {
    target: canonicalTarget,
    sessionId,
    neighborhoodId,
    ...structuredContext,
  };
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
        return { route: 'matchSurvey', sessionId, questionStep: Number(detail) };
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
    params.set('match_return', parsed.matchReturn.target);
    if (parsed.matchReturn.sessionId) params.set('match_session', parsed.matchReturn.sessionId);
    if (parsed.matchReturn.neighborhoodId) params.set('match_neighborhood', parsed.matchReturn.neighborhoodId);
    const structuredContext = {
      ...(parsed.matchReturn.mapCenter ? { mapCenter: parsed.matchReturn.mapCenter } : {}),
      ...(typeof parsed.matchReturn.mapZoom === 'number' ? { mapZoom: parsed.matchReturn.mapZoom } : {}),
      ...(typeof parsed.matchReturn.listScroll === 'number' ? { listScroll: parsed.matchReturn.listScroll } : {}),
      ...(parsed.matchReturn.language ? { language: parsed.matchReturn.language } : {}),
      ...(parsed.matchReturn.selectedHouseId ? { selectedHouseId: parsed.matchReturn.selectedHouseId } : {}),
    };
    if (Object.keys(structuredContext).length > 0) {
      params.set('match_context', JSON.stringify(structuredContext));
    }
  }

  const query = params.toString();
  if (!parsed.vboId) return `#/briefing${query ? `?${query}` : ''}`;
  return `#/address/${encodeURIComponent(parsed.vboId)}${query ? `?${query}` : ''}`;
}
