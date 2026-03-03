import { readFileSync } from 'node:fs';

describe('Epic 2 i18n overflow guards', () => {
  it('allows wrapping for toast message and action text', () => {
    const css = readFileSync('src/components/ui/Toast.css', 'utf-8');

    expect(css).toMatch(/\.toast__text\s*{[\s\S]*?white-space:\s*normal/i);
    expect(css).toMatch(/\.toast__text\s*{[\s\S]*?overflow-wrap:\s*anywhere/i);
    expect(css).toMatch(/\.toast__action\s*{[\s\S]*?white-space:\s*normal/i);
  });

  it('allows wrapping for summary strip labels', () => {
    const css = readFileSync('src/components/SummaryStrip.css', 'utf-8');

    expect(css).toMatch(/\.summary-strip__label\s*{[\s\S]*?white-space:\s*normal/i);
    expect(css).toMatch(/\.summary-strip__label\s*{[\s\S]*?overflow-wrap:\s*anywhere/i);
    expect(css).not.toMatch(/\.summary-strip__label\s*{[\s\S]*?text-overflow:\s*ellipsis/i);
  });

  it('allows wrapping for coverage strip segments', () => {
    const css = readFileSync('src/App.css', 'utf-8');

    expect(css).toMatch(/\.app__coverage-strip\s*>\s*span\s*{[\s\S]*?overflow-wrap:\s*anywhere/i);
  });

  it('protects fixed-width comparison labels with ellipsis', () => {
    const riskCss = readFileSync('src/components/RiskDetailView.css', 'utf-8');
    const livabilityDetailCss = readFileSync('src/components/LivabilityDetailView.css', 'utf-8');
    const tierBCss = readFileSync('src/components/TierBSignalsCard.css', 'utf-8');

    expect(riskCss).toMatch(/\.risk-detail__comparison-label\s*{[\s\S]*?overflow:\s*hidden/i);
    expect(riskCss).toMatch(/\.risk-detail__comparison-label\s*{[\s\S]*?text-overflow:\s*ellipsis/i);

    expect(livabilityDetailCss).toMatch(/\.livability-detail__dim-label\s*{[\s\S]*?overflow:\s*hidden/i);
    expect(livabilityDetailCss).toMatch(/\.livability-detail__dim-label\s*{[\s\S]*?text-overflow:\s*ellipsis/i);

    expect(livabilityDetailCss).toMatch(/\.livability-detail__dim-trend-label\s*{[\s\S]*?overflow:\s*hidden/i);
    expect(livabilityDetailCss).toMatch(/\.livability-detail__dim-trend-label\s*{[\s\S]*?text-overflow:\s*ellipsis/i);

    expect(livabilityDetailCss).toMatch(/\.livability-detail__cmp-label\s*{[\s\S]*?overflow:\s*hidden/i);
    expect(livabilityDetailCss).toMatch(/\.livability-detail__cmp-label\s*{[\s\S]*?text-overflow:\s*ellipsis/i);

    expect(tierBCss).toMatch(/\.tier-b-card__cmp-label\s*{[\s\S]*?overflow:\s*hidden/i);
    expect(tierBCss).toMatch(/\.tier-b-card__cmp-label\s*{[\s\S]*?text-overflow:\s*ellipsis/i);
  });
});
