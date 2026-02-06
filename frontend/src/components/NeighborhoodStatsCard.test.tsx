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
    error?: boolean;
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
  it('shows loading state', () => {
    renderCard({ loading: true });
    expect(screen.getByText('Neighborhood Snapshot')).toBeInTheDocument();
    expect(screen.getByText('Loading neighborhood data...')).toBeInTheDocument();
  });

  it('shows error state when no stats', () => {
    renderCard({ error: true });
    expect(screen.getByText('Neighborhood data could not be loaded.')).toBeInTheDocument();
  });

  it('renders null when stats is undefined and not loading/error', () => {
    const { container } = renderCard({});
    expect(container.innerHTML).toBe('');
  });

  it('renders null when stats.stats is null', () => {
    const response: NeighborhoodStatsResponse = {
      address_id: 'vbo-123',
      source: 'CBS',
      source_year: 2024,
      message: 'CBS_NO_BUURT_FOUND',
    };
    const { container } = renderCard({ stats: response });
    expect(container.innerHTML).toBe('');
  });

  it('renders buurt name and gemeente in subtitle', () => {
    renderCard({ stats: makeNeighborhoodStatsResponse() });
    expect(screen.getByText('Centrum-Oost, Amsterdam')).toBeInTheDocument();
  });

  it('renders urbanization badge', () => {
    renderCard({ stats: makeNeighborhoodStatsResponse() });
    const badge = screen.getByTestId('urbanization-badge');
    expect(badge).toHaveTextContent('Very urban');
  });

  it('renders all three groups', () => {
    renderCard({ stats: makeNeighborhoodStatsResponse() });
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('Housing')).toBeInTheDocument();
    expect(screen.getByText('Accessibility')).toBeInTheDocument();
  });

  it('renders indicator values with units', () => {
    renderCard({ stats: makeNeighborhoodStatsResponse() });
    expect(screen.getByText('15000 per km²')).toBeInTheDocument();
    expect(screen.getByText('55 %')).toBeInTheDocument();
    expect(screen.getByText('0.8 km')).toBeInTheDocument();
    expect(screen.getByText('0.3 km')).toBeInTheDocument();
  });

  it('formats property value in euros', () => {
    renderCard({ stats: makeNeighborhoodStatsResponse() });
    // toLocaleString('nl-NL') uses dot as thousands separator
    expect(screen.getByText('€520.000')).toBeInTheDocument();
  });

  it('renders age distribution bars', () => {
    renderCard({ stats: makeNeighborhoodStatsResponse() });
    const bars = screen.getByTestId('age-bars');
    expect(bars).toBeInTheDocument();
    expect(screen.getByText('0–24')).toBeInTheDocument();
    expect(screen.getByText('25–64')).toBeInTheDocument();
    expect(screen.getByText('65+')).toBeInTheDocument();
    expect(screen.getByText('18%')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
  });

  it('shows unavailable indicators correctly', () => {
    const response = makeNeighborhoodStatsResponse();
    if (response.stats) {
      response.stats.owner_occupied_pct = { available: false };
      response.stats.avg_property_value = { available: false };
    }
    renderCard({ stats: response });
    const unavailables = screen.getAllByText('Data not available');
    expect(unavailables.length).toBeGreaterThanOrEqual(2);
  });

  it('renders viewing tip', () => {
    renderCard({ stats: makeNeighborhoodStatsResponse() });
    expect(screen.getByText(/How do neighbors describe/)).toBeInTheDocument();
  });

  it('renders source with year', () => {
    renderCard({ stats: makeNeighborhoodStatsResponse() });
    expect(
      screen.getByText('Source + date: CBS Wijken & Buurten 2024 (2024)'),
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

  it('hides urbanization badge when unknown', () => {
    const response = makeNeighborhoodStatsResponse();
    if (response.stats) {
      response.stats.urbanization = 'unknown';
    }
    renderCard({ stats: response });
    expect(screen.queryByTestId('urbanization-badge')).not.toBeInTheDocument();
  });
});
