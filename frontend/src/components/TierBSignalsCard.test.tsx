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

  it('renders data values and sources', () => {
    renderCard({
      data: {
        address_id: 'vbo-1',
        energy_label: {
          source: 'EP-Online',
          source_date: '2025-01-01',
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

    expect(screen.getByText('Crime (registered)')).toBeInTheDocument();
    expect(screen.getAllByText('12.5').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Source \+ date: CBS OData/)).toBeInTheDocument();
    expect(screen.getByText('Latest month: December 2025')).toBeInTheDocument();
  });

  it('renders comparison bars when per-1000 rates are available', () => {
    renderCard({
      data: {
        address_id: 'vbo-1',
        energy_label: { source: 'EP-Online' },
        crime: {
          total_per_1000: 25.3,
          source: 'CBS',
          score: 72,
          severity: 'good',
        },
      },
    });

    expect(screen.getByText('How it compares (per 1,000 residents)')).toBeInTheDocument();
    expect(screen.getByText('This area')).toBeInTheDocument();
    expect(screen.getByText('National avg.')).toBeInTheDocument();
    expect(screen.getByText('52.0')).toBeInTheDocument();
    expect(screen.getAllByText('25.3').length).toBeGreaterThanOrEqual(1);
  });

  it('does not render comparison bars when only raw counts are available', () => {
    renderCard({
      data: {
        address_id: 'vbo-1',
        energy_label: { source: 'EP-Online' },
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
        energy_label: {
          source: 'EP-Online',
          message: 'ENERGY_LABEL_NO_DATA',
        },
        crime: {
          source: 'CBS OData 47018NED/47022NED',
          message: 'CRIME_NO_DATA',
        },
      },
    });

    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
    expect(screen.getByText('Per-capita rates unavailable — showing total registered incidents.')).toBeInTheDocument();
    expect(screen.getByText('Population data unavailable for this neighborhood. Showing raw registered incident counts. Data is indicative.')).toBeInTheDocument();
  });

  it('renders error state marker when data request fails', () => {
    const { container } = renderCard({ error: 'Tier B temporarily unavailable' });
    expect(screen.getByText('Tier B temporarily unavailable')).toBeInTheDocument();
    expect(container.querySelector('.tier-b-card')).toHaveAttribute('data-state', 'error');
  });

  describe('energy label panel', () => {
    it('renders energy label badge when label is available', () => {
      renderCard({
        data: {
          address_id: 'vbo-1',
          energy_label: { label: 'A', source: 'EP-Online', source_date: '2024-03-15' },
          crime: { source: 'CBS' },
        },
      });

      const badge = screen.getByRole('img', { name: /Energy label: A/ });
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('tier-b-card__energy-badge--a');
      expect(screen.getByText('Verify the label document and insulation details at viewing.')).toBeInTheDocument();
      expect(screen.getByText(/Source \+ date: EP-Online/)).toBeInTheDocument();
    });

    it('renders A++ label with correct --a class', () => {
      renderCard({
        data: {
          address_id: 'vbo-1',
          energy_label: { label: 'A++', source: 'EP-Online' },
          crime: { source: 'CBS' },
        },
      });

      const badge = screen.getByRole('img', { name: /Energy label: A\+\+/ });
      expect(badge).toHaveTextContent('A++');
      expect(badge).toHaveClass('tier-b-card__energy-badge--a');
    });

    it('renders G label with correct --g class', () => {
      renderCard({
        data: {
          address_id: 'vbo-1',
          energy_label: { label: 'G', source: 'EP-Online' },
          crime: { source: 'CBS' },
        },
      });

      const badge = screen.getByRole('img', { name: /Energy label: G/ });
      expect(badge).toHaveClass('tier-b-card__energy-badge--g');
    });

    it('renders translated message when label is missing but message exists', () => {
      renderCard({
        data: {
          address_id: 'vbo-1',
          energy_label: { source: 'EP-Online', message: 'ENERGY_NOT_FOUND' },
          crime: { source: 'CBS' },
        },
      });

      expect(screen.getByText('No energy label found for this address.')).toBeInTheDocument();
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('renders default message when both label and message are missing', () => {
      renderCard({
        data: {
          address_id: 'vbo-1',
          energy_label: { source: 'EP-Online' },
          crime: { source: 'CBS' },
        },
      });

      expect(screen.getByText('Energy label unavailable')).toBeInTheDocument();
    });

    it('renders energy panel above crime panel', () => {
      renderCard({
        data: {
          address_id: 'vbo-1',
          energy_label: { label: 'B', source: 'EP-Online' },
          crime: { source: 'CBS', total_per_1000: 10 },
        },
      });

      const panels = screen.getAllByRole('article');
      expect(panels[0]).toHaveAttribute('data-testid', 'energy-label-panel');
    });

    it('renders source line with date unknown fallback', () => {
      renderCard({
        data: {
          address_id: 'vbo-1',
          energy_label: { source: 'EP-Online' },
          crime: { source: 'CBS' },
        },
      });

      expect(screen.getByText(/Source \+ date: EP-Online \(date unknown\)/)).toBeInTheDocument();
    });
  });
});
