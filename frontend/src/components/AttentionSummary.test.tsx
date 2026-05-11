import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import AttentionSummary from './AttentionSummary';
import { setupTestI18n } from '../test/helpers';
import { buildAttentionSummary } from '../utils/attentionSummary';
import type { PropertyWarningsResponse, RiskCardsResponse } from '../types/api';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
});

function renderSummary(props: {
  summary?: ReturnType<typeof buildAttentionSummary>;
  error?: string | null;
  onRetry?: () => void;
}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <AttentionSummary {...props} />
    </I18nextProvider>,
  );
}

function buildSummary(
  riskCards?: RiskCardsResponse | null,
  propertyWarnings?: PropertyWarningsResponse | null,
) {
  return buildAttentionSummary(riskCards, propertyWarnings);
}

describe('AttentionSummary', () => {
  it('renders nothing when no summary and no error are provided', () => {
    const { container } = renderSummary({});
    expect(container.querySelector('.attention-summary')).not.toBeInTheDocument();
  });

  it('shows no-flags state when all assessed categories are clean', () => {
    renderSummary({
      summary: { flags: [], assessed: 4, total: 5 },
    });

    expect(screen.getByText('No flags raised')).toBeInTheDocument();
    expect(screen.getByText('Based on 4 of 5 risk categories + property analysis.')).toBeInTheDocument();
    expect(screen.getByTestId('attention-missing')).toBeInTheDocument();
  });

  it('renders sunlight and property-level flags from the merged summary', () => {
    const riskCards = {
      address_id: 'vbo-123',
      noise: { level: 'low', source: 'RIVM', sampled_at: '2026-02-05', score: 80 },
      air_quality: {
        level: 'low',
        pm25_level: 'low',
        no2_level: 'low',
        source: 'RIVM',
        sampled_at: '2026-02-05',
        score: 82,
      },
      climate_stress: {
        level: 'low',
        heat_level: 'low',
        water_level: 'low',
        source: 'KEA',
        sampled_at: '2026-02-05',
        score: 78,
      },
      sunlight: {
        score: 24,
        severity: 'poor',
      },
    } as RiskCardsResponse;
    const propertyWarnings = {
      address_id: 'vbo-123',
      attention_summary: {
        flag_count: 1,
        flags: [{ category: 'lead_pipe', severity: 'info', label: 'Lead pipe risk' }],
        risk_categories_assessed: 4,
        risk_categories_total: 4,
      },
      foundation_risk: { level: 'low', messages: [] },
      erfpacht: {
        detected: false,
        scope: 'municipality',
        verified_property_level: false,
        messages: [],
      },
      vve: { is_apartment: false, messages: [] },
      shared_building: { detected: false, messages: [] },
      asbestos: { flagged: false, messages: [] },
      lead_pipe: { flagged: true, messages: [] },
    } as PropertyWarningsResponse;

    renderSummary({
      summary: buildSummary(riskCards, propertyWarnings),
    });

    expect(screen.getByText('2 items need attention')).toBeInTheDocument();
    expect(screen.getByText('Sunlight risk')).toBeInTheDocument();
    expect(screen.getByText('Lead pipe risk')).toBeInTheDocument();
  });

  it('shows an error state with retry action when risk fetch fails', () => {
    const onRetry = vi.fn();
    renderSummary({
      error: 'Risk cards unavailable',
      onRetry,
      summary: { flags: [], assessed: 0, total: 0 },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByTestId('attention-error')).toBeInTheDocument();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders in Dutch with localized flag labels', async () => {
    const nlI18n = await setupTestI18n('nl');
    render(
      <I18nextProvider i18n={nlI18n}>
        <AttentionSummary summary={{ flags: [{ category: 'noise', severity: 'moderate', label: 'Noise risk' }], assessed: 4, total: 4 }} />
      </I18nextProvider>,
    );

    expect(screen.getByText(/punt(en)? verdienen aandacht|1 punt verdient aandacht/i)).toBeInTheDocument();
    expect(screen.getByText('Geluidrisico')).toBeInTheDocument();
  });

  it('localizes shared BAG building flags instead of falling back to backend copy', () => {
    renderSummary({
      summary: {
        flags: [{ category: 'shared_building', severity: 'info', label: 'backend shared building label' }],
        assessed: 4,
        total: 4,
      },
    });

    expect(screen.getByText('Shared BAG building')).toBeInTheDocument();
    expect(screen.queryByText('backend shared building label')).not.toBeInTheDocument();
  });

  it('uses canonical poor and moderate severities for borderline scores', () => {
    const riskCards = {
      address_id: 'vbo-123',
      noise: { level: 'medium', source: 'RIVM', sampled_at: '2026-02-05', score: 28 },
      air_quality: {
        level: 'medium',
        pm25_level: 'medium',
        no2_level: 'medium',
        source: 'RIVM',
        sampled_at: '2026-02-05',
        score: 45,
      },
      climate_stress: {
        level: 'low',
        heat_level: 'low',
        water_level: 'low',
        source: 'KEA',
        sampled_at: '2026-02-05',
        score: 78,
      },
    } as RiskCardsResponse;

    const summary = buildSummary(riskCards, null);

    expect(summary?.flags).toEqual([
      { category: 'noise', severity: 'poor', label: 'noise' },
      { category: 'air_quality', severity: 'moderate', label: 'air_quality' },
    ]);
  });
});
