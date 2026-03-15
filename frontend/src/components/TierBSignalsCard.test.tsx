import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import TierBSignalsCard from './TierBSignalsCard';
import { setupTestI18n } from '../test/helpers';
import type { TierBResponse } from '../types/api';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

function renderCard(props: { data?: TierBResponse; loading?: boolean; error?: string | null }) {
  return render(
    <I18nextProvider i18n={i18n}>
      <TierBSignalsCard {...props} />
    </I18nextProvider>,
  );
}

describe('TierBSignalsCard', () => {
  it('renders loading state', () => {
    renderCard({ loading: true });
    expect(screen.getByText('Loading additional property data...')).toBeInTheDocument();
  });

  it('renders crime values and source', () => {
    renderCard({
      data: {
        address_id: 'vbo-1',
        crime: {
          total_per_1000: 12.5,
          burglary_per_1000: 1.1,
          violent_per_1000: 0.6,
          monthly_total_per_1000: 1.2,
          monthly_period: '2025MM12',
          source: 'CBS OData 47018NED/47022NED',
          source_date: '2025JJ00',
        },
      },
    });

    expect(screen.getByText('Crime (registered)')).toBeInTheDocument();
    expect(screen.getAllByText('12.5').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Source \+ date: CBS OData/)).toBeInTheDocument();
    expect(screen.getByText(/2025\)/)).toBeInTheDocument();
    expect(screen.getByText('Latest month: Dec 2025')).toBeInTheDocument();
  });

  it('renders comparison bars when per-1000 rates are available', () => {
    renderCard({
      data: {
        address_id: 'vbo-1',
        crime: {
          total_per_1000: 25.3,
          national_per_1000: 52.0,
          source: 'CBS',
          score: 72,
          severity: 'good',
        },
      },
    });

    expect(screen.getByText('How it compares (per 1,000 residents)')).toBeInTheDocument();
    expect(screen.getByText('This area')).toBeInTheDocument();
    expect(screen.getByText('National avg.')).toBeInTheDocument();
    expect(screen.getByText('52')).toBeInTheDocument();
    expect(screen.getAllByText('25.3').length).toBeGreaterThanOrEqual(1);
  });

  it('does not render national comparison row when national rate is unavailable', () => {
    renderCard({
      data: {
        address_id: 'vbo-1',
        crime: {
          total_per_1000: 25.3,
          source: 'CBS',
        },
      },
    });

    expect(screen.queryByText('National avg.')).not.toBeInTheDocument();
  });

  it('does not render comparison bars when only raw counts are available', () => {
    renderCard({
      data: {
        address_id: 'vbo-1',
        crime: {
          total_count: 150,
          source: 'CBS',
        },
      },
    });

    expect(screen.queryByText('How it compares (per 1,000 residents)')).not.toBeInTheDocument();
  });

  it('renders fallback values when data is unavailable', () => {
    renderCard({
      data: {
        address_id: 'vbo-1',
        crime: {
          source: 'CBS OData 47018NED/47022NED',
          message: 'CRIME_NO_DATA',
        },
      },
    });

    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
    expect(screen.getByText('CBS returned no crime data for this neighborhood.')).toBeInTheDocument();
    expect(screen.getByText('Crime context is unavailable for this export. No reliable rate or raw-count fallback could be shown.')).toBeInTheDocument();
  });

  it('renders distinct lookup-failure copy instead of raw-count fallback copy', () => {
    renderCard({
      data: {
        address_id: 'vbo-1',
        crime: {
          source: 'CBS OData 47018NED/47022NED',
          message: 'CRIME_LOOKUP_FAILED',
        },
      },
    });

    expect(screen.getByText('Crime context is temporarily unavailable because the CBS crime lookup failed.')).toBeInTheDocument();
    expect(screen.queryByText('Population data unavailable for this neighborhood. Showing raw registered incident counts. Data is indicative.')).not.toBeInTheDocument();
  });

  it('renders error state marker when data request fails', () => {
    const { container } = renderCard({ error: 'Tier B temporarily unavailable' });
    expect(screen.getByText('Tier B temporarily unavailable')).toBeInTheDocument();
    expect(container.querySelector('.tier-b-card')).toHaveAttribute('data-state', 'error');
  });
});
