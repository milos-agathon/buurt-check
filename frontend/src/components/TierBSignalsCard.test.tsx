import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import TierBSignalsCard from './TierBSignalsCard';
import { setupTestI18n } from '../test/helpers';
import type { TierBResponse } from '../types/api';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

function renderCard(props: { data?: TierBResponse; loading?: boolean; error?: boolean }) {
  return render(
    <I18nextProvider i18n={i18n}>
      <TierBSignalsCard {...props} />
    </I18nextProvider>,
  );
}

describe('TierBSignalsCard', () => {
  it('renders loading state', () => {
    renderCard({ loading: true });
    expect(screen.getByText('Energy + Crime Signals')).toBeInTheDocument();
    expect(screen.getByText('Loading Tier-B signals...')).toBeInTheDocument();
  });

  it('renders data values and sources', () => {
    renderCard({
      data: {
        address_id: 'vbo-1',
        energy_label: {
          label: 'A',
          source: 'EP-Online',
          source_date: '2025-05-01',
        },
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

    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('12.5')).toBeInTheDocument();
    expect(screen.getByText(/Source \+ date: EP-Online/)).toBeInTheDocument();
    expect(screen.getByText(/Source \+ date: CBS OData/)).toBeInTheDocument();
  });

  it('renders fallback values when data is unavailable', () => {
    renderCard({
      data: {
        address_id: 'vbo-1',
        energy_label: {
          source: 'EP-Online',
          message: 'ENERGY_AUTH_REQUIRED',
        },
        crime: {
          source: 'CBS OData 47018NED/47022NED',
          message: 'CRIME_NO_DATA',
        },
      },
    });

    expect(screen.getByText('Energy label service requires API authorization.')).toBeInTheDocument();
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
  });
});
