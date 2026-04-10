import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import LivabilityCard from './LivabilityCard';
import { setupTestI18n } from '../test/helpers';
import type { LivabilityAvailableResponse, LivabilityDimension, LivabilityResponse } from '../types/api';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
});

function makeDimensions(): LivabilityDimension[] {
  return [
    { name: 'physical', raw_score: 5, normalized_score: 50, class_label: 'around average', deviation: 0.0, label_code: 'livability.dimension.physical' },
    { name: 'safety', raw_score: 3, normalized_score: 25, class_label: 'fairly low', deviation: -1.1, label_code: 'livability.dimension.safety' },
    { name: 'social', raw_score: 7, normalized_score: 75, class_label: 'good', deviation: 0.8, label_code: 'livability.dimension.social' },
    { name: 'amenities', raw_score: 9, normalized_score: 100, class_label: 'excellent', deviation: 2.1, label_code: 'livability.dimension.amenities' },
    { name: 'housing', raw_score: 5, normalized_score: 50, class_label: 'around average', deviation: 0.1, label_code: 'livability.dimension.housing' },
  ];
}

function makeLivabilityResponse(overrides: Partial<LivabilityAvailableResponse> = {}): LivabilityAvailableResponse {
  return {
    available: true,
    buurt_code: 'BU0363AB10',
    buurt_name: 'Elandsgrachtbuurt',
    gemeente: 'Amsterdam',
    year: '2024',
    overall_score: 7,
    overall_normalized: 75,
    overall_class: 7,
    overall_class_label: 'good',
    overall_deviation: 0.8,
    dimensions: makeDimensions(),
    trend: [],
    comparison: [],
    source: 'Leefbaarometer 3.0, Ministerie van BZK',
    messages: [],
    ...overrides,
  };
}

function renderCard(data?: LivabilityResponse, loading = false, error: string | null = null) {
  return render(
    <I18nextProvider i18n={i18n}>
      <LivabilityCard data={data} loading={loading} error={error} />
    </I18nextProvider>,
  );
}

describe('LivabilityCard', () => {
  it('renders nothing when no data and not loading', () => {
    const { container } = renderCard();
    expect(container.querySelector('.livability-card')).not.toBeInTheDocument();
  });

  it('shows unavailable when available=false', () => {
    renderCard({ available: false, message: 'LIVABILITY_NO_DATA' });
    expect(screen.getByTestId('livability-card')).toHaveAttribute('data-state', 'unavailable');
    expect(screen.getByText(/couldn't find livability data for this location/i)).toBeInTheDocument();
  });

  it('renders explicit unavailable copy for missing subsections', () => {
    renderCard(makeLivabilityResponse({ dimensions: [], trend: [], comparison: [] }));
    expect(screen.getByText('Dimension scores are unavailable for this location.')).toBeInTheDocument();
    expect(screen.getByText('Trend data is unavailable for this location.')).toBeInTheDocument();
    expect(screen.getByText('Comparison data is unavailable for this location.')).toBeInTheDocument();
  });

  it('renders trend and comparison sections when data is present', () => {
    const trend = [
      { year: '2020', overall_score: 6, overall_normalized: 63, overall_class: 6, dimensions: [] },
      { year: '2022', overall_score: 7, overall_normalized: 75, overall_class: 7, dimensions: [] },
      { year: '2024', overall_score: 8, overall_normalized: 88, overall_class: 8, dimensions: [] },
    ];
    const comparison = [
      { level: 'wijk' as const, name: 'Centrum-West', overall_score: 6, overall_normalized: 63, overall_class: 6, dimensions: [] },
      { level: 'gemeente' as const, name: 'Amsterdam', overall_score: 5, overall_normalized: 50, overall_class: 5, dimensions: [] },
    ];
    renderCard(makeLivabilityResponse({ trend, comparison }));

    expect(screen.getByTestId('livability-trend')).toBeInTheDocument();
    expect(screen.getByTestId('livability-comparison')).toBeInTheDocument();
    expect(screen.getByText('Centrum-West')).toBeInTheDocument();
  });

  it('renders class and deviation copy instead of 50/100 livability dimensions', () => {
    renderCard(makeLivabilityResponse());

    expect(screen.getByText('Class 7')).toBeInTheDocument();
    expect(screen.getByText('Around national average (+0.0)')).toBeInTheDocument();
    expect(screen.queryByText('50/100')).not.toBeInTheDocument();
  });

  it('renders in Dutch', async () => {
    const nlI18n = await setupTestI18n('nl');
    render(
      <I18nextProvider i18n={nlI18n}>
        <LivabilityCard data={makeLivabilityResponse()} />
      </I18nextProvider>,
    );
    expect(screen.getByText(/Fysieke omgeving/i)).toBeInTheDocument();
  });
});
