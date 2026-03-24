import process from 'node:process';

const APP_TOKENS = ['buurt-check-app'];
const LANDING_TOKENS = ['buurt-check'];

function normalizeCandidates() {
  return [
    process.env.BUURTCHECK_VERCEL_TARGET,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
  ]
    .filter(Boolean)
    .map((value) => value.trim().toLowerCase());
}

function hasToken(candidates, tokens) {
  return candidates.some((candidate) => tokens.some((token) => candidate.includes(token)));
}

export function resolveVercelTarget() {
  const explicitTarget = (process.env.BUURTCHECK_VERCEL_TARGET || '').trim().toLowerCase();
  if (explicitTarget === 'app' || explicitTarget === 'landing') {
    return explicitTarget;
  }

  const candidates = normalizeCandidates();
  if (hasToken(candidates, APP_TOKENS)) {
    return 'app';
  }
  if (hasToken(candidates, LANDING_TOKENS)) {
    return 'landing';
  }

  // Default to the app build for local validation outside Vercel.
  return 'app';
}
