import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import NeighborhoodStatsCard from './NeighborhoodStatsCard';
import {
  makeNeighborhoodStatsResponse,
  setupTestI18n,
} from '../test/helpers';
import type { NeighborhoodStatsResponse } from '../types/api';

let enI18n: Awaited<ReturnType<typeof setupTestI18n>>;
let nlI18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  enI18n = await setupTestI18n('en');
  nlI18n = await setupTestI18n('nl');
});

function renderCard(
  props: {
    stats?: NeighborhoodStatsResponse;
    loading?: boolean;
    error?: string | null;
  },
  lang: 'en' | 'nl' = 'en',
) {
  const i18n = lang === 'en' ? enI18n : nlI18n;
  return render(
    <I18nextProvider i18n={i18n}>
      <NeighborhoodStatsCard {...props} />
    </I18nextProvider>,
  );
}

describe('NeighborhoodStatsCard', () => {
  it('shows loading skeleton', () => {
    renderCard({ loading: true });
    expect(screen.getByTestId('section-skeleton-neighborhood-stats')).toBeInTheDocument();
  });

  it('shows error state when no stats', () => {
    const { container } = renderCard({ error: "We couldn't load neighborhood data. The statistics service may be temporarily slow — try again." });
    expect(screen.getByText("We couldn't load neighborhood data. The statistics service may be temporarily slow — try again.")).toBeInTheDocument();
    expect(container.querySelector('.neighborhood-card')).toHaveAttribute('data-state', 'error');
  });

  it('renders unavailable state when the response has no stats payload', () => {
    const response: NeighborhoodStatsResponse = {
      address_id: 'vbo-123',
      source: 'CBS',
      source_year: 2024,
      message: 'CBS_NO_BUURT_FOUND',
    };
    renderCard({ stats: response });

    expect(screen.getByText('Neighborhood Snapshot')).toBeInTheDocument();
    expect(screen.getByText(/CBS could not match this address/)).toBeInTheDocument();
    expect(screen.getByText('Source + date: CBS (2024)')).toBeInTheDocument();
  });

  it('renders localized indicator values with units', () => {
    renderCard({ stats: makeNeighborhoodStatsResponse() });
    expect(screen.getByText('15,000 per km²')).toBeInTheDocument();
    expect(screen.getByText('1.8')).toBeInTheDocument();
    expect(screen.getByText('55.0 %')).toBeInTheDocument();
    expect(screen.getByText('0.8 km')).toBeInTheDocument();
    expect(screen.getByText('€520,000')).toBeInTheDocument();
  });

  it('renders unavailable age-band rows consistently when values are missing', () => {
    const response = makeNeighborhoodStatsResponse();
    if (response.stats) {
      response.stats.age_profile.age_65_plus = undefined;
    }

    const { container } = renderCard({ stats: response });
    expect(screen.getByText('–')).toBeInTheDocument();
    expect(container.querySelector('.neighborhood-card__age-bar-fill--unavailable')).toBeInTheDocument();
  });

  it('renders viewing tip and source text', () => {
    renderCard({ stats: makeNeighborhoodStatsResponse() });
    expect(screen.getByText(/How do neighbors describe/)).toBeInTheDocument();
    expect(screen.getByText('Source + date: CBS Wijken & Buurten 2024 (2024)')).toBeInTheDocument();
  });

  it('renders mixed-source backfill copy when neighborhood indicators come from multiple years', () => {
    const base = makeNeighborhoodStatsResponse();
    const response = makeNeighborhoodStatsResponse({
      source_years: [2024, 2023],
      mixed_source_years: true,
      stats: {
        ...base.stats!,
        distance_to_train_km: {
          ...base.stats!.distance_to_train_km,
          source_year: 2023,
        },
        avg_property_value: {
          ...base.stats!.avg_property_value,
          source_year: 2023,
        },
      },
    });

    renderCard({ stats: response });

    expect(
      screen.getByText(
        'Source + date: CBS Wijken & Buurten 2024 (2024) · 2023 backfill for property value and train distance',
      ),
    ).toBeInTheDocument();
  });

  it('renders correctly in Dutch', () => {
    renderCard({ stats: makeNeighborhoodStatsResponse() }, 'nl');
    expect(screen.getByText('Buurtprofiel')).toBeInTheDocument();
    expect(screen.getByText('Zeer sterk stedelijk')).toBeInTheDocument();
    expect(screen.getByText('Mensen')).toBeInTheDocument();
    expect(screen.getByText('Wonen')).toBeInTheDocument();
    expect(screen.getByText('Bereikbaarheid')).toBeInTheDocument();
  });
});
