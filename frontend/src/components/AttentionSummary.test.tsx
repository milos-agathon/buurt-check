import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import AttentionSummary from './AttentionSummary';
import {
  setupTestI18n,
  makeRiskCardsResponse,
  makePropertyWarningsResponse,
} from '../test/helpers';
import type { LivabilityResponse, RiskCardsResponse, PropertyWarningsResponse } from '../types/api';

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

function makeCleanWarnings(): PropertyWarningsResponse {
  return makePropertyWarningsResponse();
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

function makeFoundationHighWarnings(): PropertyWarningsResponse {
  return makePropertyWarningsResponse({
    foundation_risk: {
      level: 'high',
      construction_year: 1952,
      soil_type: 'klei',
      messages: [],
    },
  });
}

function makePartialRiskCards(): RiskCardsResponse {
  return makeRiskCardsResponse({
    noise: { ...makeRiskCardsResponse().noise, score: 75, severity: 'good' },
    air_quality: { ...makeRiskCardsResponse().air_quality, score: 80, severity: 'good' },
    climate_stress: { ...makeRiskCardsResponse().climate_stress, score: undefined, severity: undefined },
  });
}

function makeApartmentWarnings(): PropertyWarningsResponse {
  return makePropertyWarningsResponse({
    vve: { is_apartment: true, num_units: 12, messages: [] },
  });
}

function makePre1980Warnings(): PropertyWarningsResponse {
  return makePropertyWarningsResponse({
    foundation_risk: { level: 'low', construction_year: 1965, soil_type: 'zand', messages: [] },
    asbestos: { flagged: true, construction_year: 1965, messages: [] },
  });
}

function renderSummary(props: {
  riskCards?: RiskCardsResponse;
  warnings?: PropertyWarningsResponse;
  sunlightScore?: number;
  livability?: LivabilityResponse;
}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <AttentionSummary {...props} />
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
      warnings: makeCleanWarnings(),
      sunlightScore: 80,
    });
    expect(screen.getByText(/no flags raised/i)).toBeInTheDocument();
  });

  it('shows amber badge for single flag', () => {
    renderSummary({
      riskCards: makePoorNoiseRiskCards(),
      warnings: makeCleanWarnings(),
      sunlightScore: 80,
    });
    expect(screen.getByText(/1 item needs attention/i)).toBeInTheDocument();
  });

  it('shows red badge for multiple flags', () => {
    renderSummary({
      riskCards: makeCriticalRiskCards(),
      warnings: makeFoundationHighWarnings(),
      sunlightScore: 80,
    });
    const badge = screen.getByText(/items need attention/i);
    expect(badge).toBeInTheDocument();
  });

  it('shows data completeness suffix', () => {
    renderSummary({
      riskCards: makeGoodRiskCards(),
      warnings: makeCleanWarnings(),
      sunlightScore: 80,
    });
    expect(screen.getByText(/4 of 4/i)).toBeInTheDocument();
  });

  it('shows partial data completeness', () => {
    renderSummary({
      riskCards: makePartialRiskCards(),
      warnings: makeCleanWarnings(),
    });
    // noise + air scored, climate undefined, no sunlight = 2 of 4
    expect(screen.getByText(/2 of 4/i)).toBeInTheDocument();
  });

  it('includes VvE in flag count for apartments', () => {
    renderSummary({
      riskCards: makeGoodRiskCards(),
      warnings: makeApartmentWarnings(),
      sunlightScore: 80,
    });
    expect(screen.getByText(/1 item needs attention/i)).toBeInTheDocument();
  });

  it('includes asbestos in flag count for pre-1980', () => {
    renderSummary({
      riskCards: makeGoodRiskCards(),
      warnings: makePre1980Warnings(),
      sunlightScore: 80,
    });
    expect(screen.getByText(/1 item needs attention/i)).toBeInTheDocument();
  });

  it('renders in Dutch', async () => {
    const nlI18n = await setupTestI18n('nl');
    render(
      <I18nextProvider i18n={nlI18n}>
        <AttentionSummary
          riskCards={makeGoodRiskCards()}
          warnings={makeCleanWarnings()}
          sunlightScore={80}
        />
      </I18nextProvider>,
    );
    expect(screen.getByText(/geen/i)).toBeInTheDocument();
  });

  it('includes lead pipe flag when flagged', () => {
    const warnings = makePropertyWarningsResponse({
      lead_pipe: { flagged: true, construction_year: 1955, messages: ['LEAD_PIPE_PRE_1960'] },
    });
    renderSummary({
      riskCards: makeGoodRiskCards(),
      warnings,
      sunlightScore: 80,
    });
    expect(screen.getByText(/1 item needs attention/i)).toBeInTheDocument();
  });

  it('does not include lead pipe flag when not flagged', () => {
    const warnings = makePropertyWarningsResponse({
      lead_pipe: { flagged: false, messages: [] },
    });
    renderSummary({
      riskCards: makeGoodRiskCards(),
      warnings,
      sunlightScore: 80,
    });
    expect(screen.getByText(/no flags raised/i)).toBeInTheDocument();
  });

  it('includes livability flag when normalized < 40', () => {
    const livability: LivabilityResponse = {
      available: true, buurt_code: 'BU', buurt_name: 'T', gemeente: 'A',
      year: '2024', overall_score: 3, overall_normalized: 25,
      dimensions: [], trend: [], comparison: [], source: 'x', messages: [],
    };
    renderSummary({
      riskCards: makeGoodRiskCards(),
      warnings: makeCleanWarnings(),
      sunlightScore: 80,
    });
    // Re-render with livability prop — need to pass via props
    const { unmount } = render(
      <I18nextProvider i18n={i18n}>
        <AttentionSummary
          riskCards={makeGoodRiskCards()}
          warnings={makeCleanWarnings()}
          sunlightScore={80}
          livability={livability}
        />
      </I18nextProvider>,
    );
    expect(screen.getByText(/1 item needs attention/i)).toBeInTheDocument();
    unmount();
  });

  it('does not flag livability when normalized >= 40', () => {
    const livability: LivabilityResponse = {
      available: true, buurt_code: 'BU', buurt_name: 'T', gemeente: 'A',
      year: '2024', overall_score: 7, overall_normalized: 75,
      dimensions: [], trend: [], comparison: [], source: 'x', messages: [],
    };
    render(
      <I18nextProvider i18n={i18n}>
        <AttentionSummary
          riskCards={makeGoodRiskCards()}
          warnings={makeCleanWarnings()}
          sunlightScore={80}
          livability={livability}
        />
      </I18nextProvider>,
    );
    expect(screen.getByText(/no flags raised/i)).toBeInTheDocument();
  });

  it('combines lead pipe + low livability flags', () => {
    const warnings = makePropertyWarningsResponse({
      lead_pipe: { flagged: true, construction_year: 1955, messages: ['LEAD_PIPE_PRE_1960'] },
    });
    const livability: LivabilityResponse = {
      available: true, buurt_code: 'BU', buurt_name: 'T', gemeente: 'A',
      year: '2024', overall_score: 2, overall_normalized: 13,
      dimensions: [], trend: [], comparison: [], source: 'x', messages: [],
    };
    render(
      <I18nextProvider i18n={i18n}>
        <AttentionSummary
          riskCards={makeGoodRiskCards()}
          warnings={warnings}
          sunlightScore={80}
          livability={livability}
        />
      </I18nextProvider>,
    );
    expect(screen.getByText(/2 items need attention/i)).toBeInTheDocument();
  });
});
