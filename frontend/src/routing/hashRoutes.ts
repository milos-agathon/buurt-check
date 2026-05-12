export type HashRoute = 'search' | 'dossier' | 'shortlist' | 'compare' | 'settings' | 'pack' | 'shared' | 'not_found' | 'matchLanding' | 'matchSurveyIntro' | 'matchSurvey' | 'matchQuiz' | 'matchReport' | 'matchComparison' | 'matchSimilar' | 'matchMap' | 'matchListings' | 'matchAlerts' | 'matchSaved' | 'matchAdmin' | 'matchSharedReport';

export interface MatchReturnContext {
  target: string;
  sessionId?: string;
  neighborhoodId?: string;
}

export interface ParsedHashRoute {
  route: HashRoute;
  vboId?: string;
  lookupId?: string;
  reportId?: string;
  sessionId?: string;
  buyerResume?: string;
  matchReturn?: MatchReturnContext;
  shareToken?: string;
  matchShareToken?: string;
  sharedMode?: 'briefing' | 'pack';
  rawPath?: string;
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

function readMatchReturnRouteParams(params: URLSearchParams): MatchReturnContext | undefined {
  const target = params.get('match_return') ?? undefined;
  const sessionId = params.get('match_session') ?? undefined;
  const neighborhoodId = params.get('match_neighborhood') ?? undefined;
  if (!target && !sessionId && !neighborhoodId) return undefined;
  return {
    target: target || '#/match/map',
    sessionId,
    neighborhoodId,
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
  if (normalizedPath === '/match/quiz') return { route: 'matchQuiz' };
  if (normalizedPath === '/match/report') return { route: 'matchReport' };
  if (normalizedPath === '/match/compare') return { route: 'matchComparison' };
  if (normalizedPath === '/match/similar') return { route: 'matchSimilar' };
  if (normalizedPath === '/match/map') return { route: 'matchMap' };
  if (normalizedPath === '/match/listings') return { route: 'matchListings' };
  if (normalizedPath === '/match/alerts') return { route: 'matchAlerts' };
  if (normalizedPath === '/match/saved') return { route: 'matchSaved' };
  if (normalizedPath === '/match/admin') return { route: 'matchAdmin' };
  if (normalizedPath === '/search') return { route: 'search' };

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
  if (parsed.route === 'matchSurveyIntro') return '#/match/intro';
  if (parsed.route === 'matchSurvey') return '#/match/survey';
  if (parsed.route === 'matchQuiz') return '#/match/quiz';
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
  }

  const query = params.toString();
  if (!parsed.vboId) return `#/briefing${query ? `?${query}` : ''}`;
  return `#/address/${encodeURIComponent(parsed.vboId)}${query ? `?${query}` : ''}`;
}
