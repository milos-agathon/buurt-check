import { existsSync, readFileSync } from 'node:fs';

const LEDGER_PATH = '../docs/plans/ui-scorecard-9-5-evidence.md';

const SCORECARD_ITEMS = [
  'Design system foundation',
  'Search mobile',
  'Search desktop/tablet',
  'Typography',
  'Color/surfaces',
  'Risk cards',
  'Risk detail',
  'Prebid briefing/source coverage',
  'Dossier narrative',
  '3D viewer',
  'Saved/compare',
  'Export/payment/share',
  'Settings/legal/recovery',
  'Accessibility/interactions',
  'Minimalist-ui fit',
  'Landing',
] as const;

const REQUIRED_FIELDS = [
  'Current score',
  'Current score source',
  'Target score',
  'Owner role',
  'Owner name',
  'Automated evidence',
  'Mechanical evidence',
  'Screenshot evidence',
  'Manual design review',
  'Accessibility evidence',
  'Source-trust evidence',
  'Source-quality metrics',
  'Product-contract evidence',
  'Backend product-contract evidence',
  'Score cap check',
  'Final score',
] as const;

const SCORE_CAP_NAMES = [
  'broken-primary-route',
  'ledger-invalid',
  'route-tests-missing',
  'visual-metadata-invalid',
  'accessibility-failing',
  'source-quality-failing',
  'backend-contract-missing',
  'sunlight-free-surface',
  'landing-parity-drift',
  'screenshots-unapproved',
  'baseline-unverified',
  'manual-missing',
] as const;

function readLedger(): string {
  if (!existsSync(LEDGER_PATH)) {
    throw new Error(`Missing evidence ledger: ${LEDGER_PATH}`);
  }
  return readFileSync(LEDGER_PATH, 'utf-8');
}

function scorecardSection(ledger: string, item: string): string {
  const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = ledger.match(
    new RegExp(`^## Scorecard item: ${escaped}\\r?\\n([\\s\\S]*?)(?=^## Scorecard item: |(?![\\s\\S]))`, 'm'),
  );
  if (!match) {
    throw new Error(`Missing scorecard section: ${item}`);
  }
  return match[1];
}

function tableRows(section: string): Map<string, string> {
  const rows = new Map<string, string>();
  for (const line of section.split(/\r?\n/)) {
    const match = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
    if (!match) continue;
    const [, field, value] = match;
    if (field === 'Field' || field === '---') continue;
    rows.set(field.trim(), value.trim());
  }
  return rows;
}

describe('UI scorecard evidence ledger contract', () => {
  it('contains exactly one section for every scorecard item with all required fields', () => {
    const ledger = readLedger();

    for (const item of SCORECARD_ITEMS) {
      const sectionCount = ledger.match(new RegExp(`^## Scorecard item: ${item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'gm'))?.length ?? 0;
      expect(sectionCount, item).toBe(1);

      const rows = tableRows(scorecardSection(ledger, item));
      for (const field of REQUIRED_FIELDS) {
        expect(rows.has(field), `${item} missing ${field}`).toBe(true);
        expect(rows.get(field), `${item} has empty ${field}`).toMatch(/\S/);
        expect(rows.get(field), `${item} uses forbidden placeholder in ${field}`).not.toMatch(/\b(TBD|PENDING|BLOCKED|TODO|N\/A)\b/);
      }
      expect(rows.get('Target score')).toBe('9.5');
    }
  });

  it('preserves baseline traceability and score-cap names', () => {
    const ledger = readLedger();

    expect(ledger).toContain('## Baseline traceability');
    expect(ledger).toContain('## Source-Quality Metric Schema');
    expect(ledger).toContain('## Score Cap Names');

    for (const item of SCORECARD_ITEMS) {
      expect(ledger).toContain(`| ${item} |`);
      const rows = tableRows(scorecardSection(ledger, item));
      expect(rows.get('Current score source'), item).toContain('reviewer=');
      expect(rows.get('Current score source'), item).toContain('date=2026-05-08');
      expect(rows.get('Current score source'), item).toContain('route_family=');
      expect(rows.get('Current score source'), item).toContain('artifact=');
      expect(rows.get('Current score source'), item).toContain('blocker=');
    }

    for (const capName of SCORE_CAP_NAMES) {
      expect(ledger).toContain(`\`${capName}\``);
    }
  });

  it('keeps final 9.5 scores blocked until required evidence is complete', () => {
    const ledger = readLedger();

    for (const item of SCORECARD_ITEMS) {
      const rows = tableRows(scorecardSection(ledger, item));
      if (rows.get('Final score') !== '9.5') continue;

      for (const field of REQUIRED_FIELDS) {
        if (field === 'Final score') continue;
        const value = rows.get(field) ?? '';
        const allowed = value.startsWith('PASS;') || value.startsWith('NOT_APPLICABLE;');
        expect(allowed, `${item} cannot score 9.5 because ${field} is ${value}`).toBe(true);
      }
      expect(rows.get('Score cap check')).toContain('allowed_score=9.5');
    }
  });
});
