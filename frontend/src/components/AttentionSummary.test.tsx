import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import AttentionSummary from './AttentionSummary';
import {
  setupTestI18n,
  makeRiskCardsResponse,
} from '../test/helpers';
import type { RiskCardsResponse } from '../types/api';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
});

function makeGoodRiskCards(): RiskCardsResponse {
  return makeRiskCardsResponse({
    noise: { ...makeRiskCardsResponse().noise, score: 75, severity: 'good' },
    air_quality: { ...makeRiskCardsResponse().air_quality, score: 80, severity: 'good' },
    climate_stress: { ...makeRiskCardsResponse().climate_stress, score: 85, severity: 'good' },
  });
}

function makePoorNoiseRiskCards(): RiskCardsResponse {
  return makeRiskCardsResponse({
    noise: { ...makeRiskCardsResponse().noise, score: 38, severity: 'poor' },
    air_quality: { ...makeRiskCardsResponse().air_quality, score: 80, severity: 'good' },
    climate_stress: { ...makeRiskCardsResponse().climate_stress, score: 85, severity: 'good' },
  });
}

function makeCriticalRiskCards(): RiskCardsResponse {
  return makeRiskCardsResponse({
    noise: { ...makeRiskCardsResponse().noise, score: 22, severity: 'poor' },
    air_quality: { ...makeRiskCardsResponse().air_quality, score: 80, severity: 'good' },
    climate_stress: { ...makeRiskCardsResponse().climate_stress, score: 15, severity: 'critical' },
  });
}

function makePartialRiskCards(): RiskCardsResponse {
  return makeRiskCardsResponse({
    noise: { ...makeRiskCardsResponse().noise, score: 75, severity: 'good' },
    air_quality: { ...makeRiskCardsResponse().air_quality, score: 80, severity: 'good' },
    climate_stress: { ...makeRiskCardsResponse().climate_stress, score: undefined, severity: undefined },
  });
}

function renderSummary(props: {
  riskCards?: RiskCardsResponse;
}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <AttentionSummary riskCards={props.riskCards} />
    </I18nextProvider>,
  );
}

describe('AttentionSummary', () => {
  it('renders nothing when no data provided', () => {
    const { container } = renderSummary({});
    expect(container.querySelector('.attention-summary')).not.toBeInTheDocument();
  });

  it('shows green badge when no flags', () => {
    renderSummary({
      riskCards: makeGoodRiskCards(),
    });
    expect(screen.getByText(/no flags raised/i)).toBeInTheDocument();
  });

  it('shows amber badge for single flag', () => {
    renderSummary({
      riskCards: makePoorNoiseRiskCards(),
    });
    expect(screen.getByText(/1 item needs attention/i)).toBeInTheDocument();
  });

  it('shows red badge for multiple flags', () => {
    renderSummary({
      riskCards: makeCriticalRiskCards(),
    });
    const badge = screen.getByText(/items need attention/i);
    expect(badge).toBeInTheDocument();
  });

  it('shows data completeness suffix', () => {
    renderSummary({
      riskCards: makeGoodRiskCards(),
    });
    expect(screen.getByText(/3 of 3/i)).toBeInTheDocument();
  });

  it('shows partial data completeness', () => {
    renderSummary({
      riskCards: makePartialRiskCards(),
    });
    // noise + air scored, climate undefined = 2 of 3
    expect(screen.getByText(/based on 2 of 3/i)).toBeInTheDocument();
  });

  it('renders in Dutch', async () => {
    const nlI18n = await setupTestI18n('nl');
    render(
      <I18nextProvider i18n={nlI18n}>
        <AttentionSummary
          riskCards={makeGoodRiskCards()}
        />
      </I18nextProvider>,
    );
    expect(screen.getByText(/geen/i)).toBeInTheDocument();
  });

  it('uses Dutch risk category labels for flagged items', async () => {
    const nlI18n = await setupTestI18n('nl');
    render(
      <I18nextProvider i18n={nlI18n}>
        <AttentionSummary
          riskCards={makePoorNoiseRiskCards()}
        />
      </I18nextProvider>,
    );
    expect(screen.getByText(/geluidrisico/i)).toBeInTheDocument();
    expect(screen.queryByText(/noise risk/i)).not.toBeInTheDocument();
  });

  it('renders flag bullet list when flags exist', () => {
    renderSummary({
      riskCards: makeCriticalRiskCards(),
    });
    const flagList = screen.getByTestId('attention-flags');
    expect(flagList).toBeInTheDocument();
    const items = flagList.querySelectorAll('li');
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it('renders green-state detail when no flags and data assessed', () => {
    renderSummary({
      riskCards: makeGoodRiskCards(),
    });
    expect(screen.getByTestId('attention-detail')).toBeInTheDocument();
    expect(screen.getByText(/all assessed risk categories/i)).toBeInTheDocument();
  });

  it('does not render flag list when no flags', () => {
    renderSummary({
      riskCards: makeGoodRiskCards(),
    });
    expect(screen.queryByTestId('attention-flags')).not.toBeInTheDocument();
  });

  it('renders missing-category explanation for partial data', () => {
    renderSummary({
      riskCards: makePartialRiskCards(),
    });
    expect(screen.getByTestId('attention-missing')).toBeInTheDocument();
  });

  it('does not render missing-category when all assessed', () => {
    renderSummary({
      riskCards: makeGoodRiskCards(),
    });
    expect(screen.queryByTestId('attention-missing')).not.toBeInTheDocument();
  });
});
