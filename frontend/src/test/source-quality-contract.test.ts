import { briefing } from '../components/prebid/testFixtures';
import type { PrebidVerificationAction } from '../types/api';

type SourceQualityRow = {
  surface: 'risk-card' | 'prebid-action';
  id: string;
  sourceName: string;
  sourceDate?: string;
  unknownDateLabel?: string;
  confidenceOrStatus: string;
  limitation: string;
  recipient?: string;
  visible: boolean;
};

type SourceQualityMetrics = {
  unknownDateCount: number;
  genericConfidenceCount: number;
  genericLimitationCount: number;
  totalSourceRows: number;
  unknownDateRatio: number;
  genericConfidenceRatio: number;
  genericLimitationRatio: number;
  hardFailures: string[];
};

const RISK_SOURCE_ROWS: SourceQualityRow[] = [
  {
    surface: 'risk-card',
    id: 'noise',
    sourceName: 'RIVM geluidkaart',
    sourceDate: '2025-03',
    confidenceOrStatus: 'risk_indicative',
    limitation: 'Modelled outdoor contours. Verify indoor noise during the viewing.',
    visible: true,
  },
  {
    surface: 'risk-card',
    id: 'air',
    sourceName: 'RIVM luchtkwaliteit',
    sourceDate: '2025-03',
    confidenceOrStatus: 'risk_indicative',
    limitation: 'Modelled annual outdoor concentration. Confirm ventilation and street-level exposure.',
    visible: true,
  },
  {
    surface: 'risk-card',
    id: 'climate',
    sourceName: 'Klimaateffectatlas',
    sourceDate: '2025',
    confidenceOrStatus: 'risk_indicative',
    limitation: 'Area-level climate stress signal. Check drainage, shading, and maintenance records.',
    visible: true,
  },
];

const APPROVED_CONFIDENCE_OR_STATUS = new Set([
  'high',
  'medium',
  'low',
  'needs_review',
  'data_incomplete',
  'risk_indicative',
  'risk_unavailable',
]);

const GENERIC_LIMITATIONS = new Set([
  'Open data.',
  'May be inaccurate.',
  'Check source.',
  'No limitation available.',
]);

function rowsFromPrebidActions(actions: PrebidVerificationAction[]): SourceQualityRow[] {
  return actions.map((action) => {
    const source = action.source_refs[0];
    return {
      surface: 'prebid-action',
      id: action.id,
      sourceName: source.name,
      sourceDate: source.source_date,
      unknownDateLabel: source.source_date ? undefined : source.checked_at ? undefined : 'date unknown',
      confidenceOrStatus: action.confidence,
      limitation: action.limitation,
      recipient: action.who_to_ask[0],
      visible: true,
    };
  });
}

function isGenericLimitation(value: string) {
  return GENERIC_LIMITATIONS.has(value.trim()) || value.trim().split(/\s+/).length < 5;
}

function computeSourceQualityMetrics(rows: SourceQualityRow[]): SourceQualityMetrics {
  const visibleRows = rows.filter((row) => row.visible);
  const hardFailures: string[] = [];

  for (const row of visibleRows) {
    if (!row.sourceName) hardFailures.push(`${row.id}:missing-source`);
    if (!row.sourceDate && !row.unknownDateLabel) hardFailures.push(`${row.id}:missing-date-or-unknown-label`);
    if (!APPROVED_CONFIDENCE_OR_STATUS.has(row.confidenceOrStatus)) hardFailures.push(`${row.id}:unapproved-confidence`);
    if (!row.limitation) hardFailures.push(`${row.id}:missing-limitation`);
    if (row.surface === 'prebid-action' && !row.recipient) hardFailures.push(`${row.id}:missing-recipient`);
  }

  const totalSourceRows = visibleRows.length;
  const unknownDateCount = visibleRows.filter((row) => !row.sourceDate).length;
  const genericConfidenceCount = visibleRows.filter((row) => !APPROVED_CONFIDENCE_OR_STATUS.has(row.confidenceOrStatus)).length;
  const genericLimitationCount = visibleRows.filter((row) => isGenericLimitation(row.limitation)).length;

  return {
    unknownDateCount,
    genericConfidenceCount,
    genericLimitationCount,
    totalSourceRows,
    unknownDateRatio: unknownDateCount / totalSourceRows,
    genericConfidenceRatio: genericConfidenceCount / totalSourceRows,
    genericLimitationRatio: genericLimitationCount / totalSourceRows,
    hardFailures,
  };
}

describe('source-quality contract', () => {
  it('computes the shared risk and prebid denominator with sunlight excluded from free risk rows', () => {
    const rows = [...RISK_SOURCE_ROWS, ...rowsFromPrebidActions(briefing.top_actions)];
    const metrics = computeSourceQualityMetrics(rows);

    expect(RISK_SOURCE_ROWS.map((row) => row.id)).toEqual(['noise', 'air', 'climate']);
    expect(RISK_SOURCE_ROWS.map((row) => row.id)).not.toContain('sunlight');
    expect(metrics.totalSourceRows).toBe(4);
    expect(metrics.hardFailures).toEqual([]);
  });

  it('keeps unknown dates, generic confidence, and generic limitations below score caps', () => {
    const rows = [...RISK_SOURCE_ROWS, ...rowsFromPrebidActions(briefing.top_actions)];
    const metrics = computeSourceQualityMetrics(rows);

    expect(metrics.unknownDateCount).toBe(0);
    expect(metrics.genericConfidenceCount).toBe(0);
    expect(metrics.genericLimitationCount).toBe(0);
    expect(metrics.unknownDateRatio).toBeLessThanOrEqual(0.15);
    expect(metrics.genericConfidenceRatio).toBeLessThanOrEqual(0.10);
    expect(metrics.genericLimitationRatio).toBeLessThanOrEqual(0.10);
  });

  it('treats missing required prebid action fields as hard failures', () => {
    const metrics = computeSourceQualityMetrics([
      {
        surface: 'prebid-action',
        id: 'broken-action',
        sourceName: '',
        confidenceOrStatus: 'maybe',
        limitation: 'Open data.',
        visible: true,
      },
    ]);

    expect(metrics.hardFailures).toEqual([
      'broken-action:missing-source',
      'broken-action:missing-date-or-unknown-label',
      'broken-action:unapproved-confidence',
      'broken-action:missing-recipient',
    ]);
    expect(metrics.genericConfidenceRatio).toBe(1);
    expect(metrics.genericLimitationRatio).toBe(1);
  });
});
