import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
    { name: 'physical', raw_score: 5, normalized_score: 50, label_code: 'livability.dimension.physical' },
    { name: 'safety', raw_score: 3, normalized_score: 25, label_code: 'livability.dimension.safety' },
    { name: 'social', raw_score: 7, normalized_score: 75, label_code: 'livability.dimension.social' },
    { name: 'amenities', raw_score: 9, normalized_score: 100, label_code: 'livability.dimension.amenities' },
    { name: 'housing', raw_score: 5, normalized_score: 50, label_code: 'livability.dimension.housing' },
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

  it('shows loading state', () => {
    renderCard(undefined, true);
    expect(screen.getByTestId('livability-card')).toBeInTheDocument();
    expect(screen.getByText(/loading livability/i)).toBeInTheDocument();
  });

  it('shows error state', () => {
    renderCard(undefined, false, 'Test error message');
    expect(screen.getByTestId('livability-card')).toHaveAttribute('data-state', 'error');
    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('shows unavailable when available=false', () => {
    renderCard({ available: false, message: 'LIVABILITY_NO_DATA' });
    expect(screen.getByTestId('livability-card')).toHaveAttribute('data-state', 'unavailable');
    expect(screen.getByText(/leefbaarometer coverage/i)).toBeInTheDocument();
  });

  it('renders overall score badge', async () => {
    renderCard(makeLivabilityResponse());
    await waitFor(() => {
      const badge = screen.getByTestId('livability-card').querySelector('.livability-card__score-value');
      expect(badge).toHaveTextContent('75');
    });
  });

  it('renders buurt name and gemeente', () => {
    renderCard(makeLivabilityResponse());
    expect(screen.getByText('Elandsgrachtbuurt')).toBeInTheDocument();
    expect(screen.getByText(/Amsterdam/)).toBeInTheDocument();
  });

  it('renders 5 dimension bars', () => {
    renderCard(makeLivabilityResponse());
    const dimSection = screen.getByTestId('livability-dimensions');
    expect(dimSection).toBeInTheDocument();
    expect(screen.getByText(/physical environment/i)).toBeInTheDocument();
    expect(screen.getByText(/safety/i)).toBeInTheDocument();
  });

  it('renders sparkline trend when trend data present', () => {
    const trend = [
      { year: '2020', overall_score: 6, overall_normalized: 63, dimensions: [] },
      { year: '2022', overall_score: 7, overall_normalized: 75, dimensions: [] },
      { year: '2024', overall_score: 8, overall_normalized: 88, dimensions: [] },
    ];
    renderCard(makeLivabilityResponse({ trend }));
    expect(screen.getByTestId('livability-trend')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument(); // year '2020' -> '20'
    expect(screen.getByText('24')).toBeInTheDocument(); // year '2024' -> '24'
  });

  it('renders comparison bars when comparison data present', () => {
    const comparison = [
      { level: 'wijk' as const, name: 'Centrum-West', overall_score: 6, overall_normalized: 63, dimensions: [] },
      { level: 'gemeente' as const, name: 'Amsterdam', overall_score: 5, overall_normalized: 50, dimensions: [] },
    ];
    renderCard(makeLivabilityResponse({ comparison }));
    expect(screen.getByTestId('livability-comparison')).toBeInTheDocument();
    expect(screen.getByText('Centrum-West')).toBeInTheDocument();
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
