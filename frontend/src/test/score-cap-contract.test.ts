type ScoreCapFlags = {
  brokenPrimaryRoute?: boolean;
  ledgerInvalid?: boolean;
  routeTestsMissing?: boolean;
  visualMetadataInvalid?: boolean;
  accessibilityFailing?: boolean;
  sourceQualityFailing?: boolean;
  backendContractMissing?: boolean;
  sunlightFreeSurface?: boolean;
  landingParityDrift?: boolean;
  screenshotsUnapproved?: boolean;
  baselineUnverified?: boolean;
  manualMissing?: boolean;
};

const SCORE_CAPS: Array<{
  name: string;
  flag: keyof ScoreCapFlags;
  allowedScore: number;
}> = [
  { name: 'broken-primary-route', flag: 'brokenPrimaryRoute', allowedScore: 8.4 },
  { name: 'ledger-invalid', flag: 'ledgerInvalid', allowedScore: 8.6 },
  { name: 'route-tests-missing', flag: 'routeTestsMissing', allowedScore: 8.8 },
  { name: 'visual-metadata-invalid', flag: 'visualMetadataInvalid', allowedScore: 8.8 },
  { name: 'accessibility-failing', flag: 'accessibilityFailing', allowedScore: 8.9 },
  { name: 'source-quality-failing', flag: 'sourceQualityFailing', allowedScore: 9.0 },
  { name: 'backend-contract-missing', flag: 'backendContractMissing', allowedScore: 9.0 },
  { name: 'sunlight-free-surface', flag: 'sunlightFreeSurface', allowedScore: 9.0 },
  { name: 'landing-parity-drift', flag: 'landingParityDrift', allowedScore: 9.0 },
  { name: 'screenshots-unapproved', flag: 'screenshotsUnapproved', allowedScore: 9.2 },
  { name: 'baseline-unverified', flag: 'baselineUnverified', allowedScore: 9.2 },
  { name: 'manual-missing', flag: 'manualMissing', allowedScore: 9.4 },
];

export function computeAllowedScore(flags: ScoreCapFlags): number {
  return SCORE_CAPS.reduce((allowedScore, cap) => {
    return flags[cap.flag] ? Math.min(allowedScore, cap.allowedScore) : allowedScore;
  }, 9.5);
}

describe('UI scorecard score caps', () => {
  it.each([
    ['all-pass', {}, 9.5],
    ['broken-primary-route', { brokenPrimaryRoute: true }, 8.4],
    ['ledger-invalid', { ledgerInvalid: true }, 8.6],
    ['route-tests-missing', { routeTestsMissing: true }, 8.8],
    ['visual-metadata-invalid', { visualMetadataInvalid: true }, 8.8],
    ['accessibility-failing', { accessibilityFailing: true }, 8.9],
    ['source-quality-failing', { sourceQualityFailing: true }, 9.0],
    ['backend-contract-missing', { backendContractMissing: true }, 9.0],
    ['sunlight-free-surface', { sunlightFreeSurface: true }, 9.0],
    ['landing-parity-drift', { landingParityDrift: true }, 9.0],
    ['screenshots-unapproved', { screenshotsUnapproved: true }, 9.2],
    ['baseline-unverified', { baselineUnverified: true }, 9.2],
    ['manual-missing', { manualMissing: true }, 9.4],
    [
      'multiple-failures-lowest-wins',
      { backendContractMissing: true, brokenPrimaryRoute: true, manualMissing: true },
      8.4,
    ],
  ] satisfies Array<[string, ScoreCapFlags, number]>)(
    'applies the lowest cap for %s',
    (_caseName, flags, expectedAllowedScore) => {
      expect(computeAllowedScore(flags)).toBe(expectedAllowedScore);
    },
  );
});
