import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import MatchMap from './MatchMap';
import { setupTestI18n } from '../../test/helpers';
import type { MatchMapResponse } from '../../types/match';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

const mapResponse: MatchMapResponse = {
  type: 'FeatureCollection',
  bounds: [4.4, 51.9, 5.1, 52.4],
  unsupported_regions: [],
  missing_coordinates: [{ neighborhood_id: 'nh_missing', name: 'Noord Seed', reason_code: 'match.map.missingCoordinates' }],
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [5.0, 52.35] },
      properties: {
        neighborhood_id: 'nh_ijburg',
        name: 'IJburg',
        municipality: 'Amsterdam',
        match_score: 84,
        category: 'top',
        confidence: { score: 78, label: 'medium', reasons: ['mock'] },
        freshness_status: 'mock',
        source_refs: ['src_green'],
        missing_data: [],
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [5.03, 52.1] },
      properties: {
        neighborhood_id: 'nh_leidsche',
        name: 'Leidsche Rijn',
        municipality: 'Utrecht',
        match_score: 76,
        category: 'top',
        confidence: { score: 70, label: 'medium', reasons: ['mock'] },
        freshness_status: 'mock',
        source_refs: ['src_family'],
        missing_data: ['affordability_rent'],
      },
    },
  ],
  empty_state_code: null,
};

function renderMap(props: Partial<React.ComponentProps<typeof MatchMap>> = {}) {
  render(
    <I18nextProvider i18n={i18n}>
      <MatchMap map={mapResponse} {...props} />
    </I18nextProvider>,
  );
}

it('renders recommendation markers and selected neighborhood details', async () => {
  renderMap();

  expect(screen.getByRole('img', { name: 'Recommended neighborhood map' })).toBeInTheDocument();
  const ijburgMarker = screen.getByRole('button', { name: /84IJburg/i });
  expect(ijburgMarker).toBeInTheDocument();
  expect(ijburgMarker).toHaveAttribute('data-lng', '5');
  expect(ijburgMarker).toHaveAttribute('data-lat', '52.35');
  expect(ijburgMarker).toHaveStyle({ left: '85.7%', top: '10%' });
  await userEvent.click(screen.getByRole('button', { name: /76Leidsche Rijn/i }));

  expect(screen.getByRole('complementary', { name: 'Selected neighborhood details' })).toHaveTextContent('Leidsche Rijn');
  expect(screen.getByText('76/100')).toBeInTheDocument();
  expect(screen.getByText('Missing: affordability_rent')).toBeInTheDocument();
  expect(screen.getByText('src_family')).toHaveClass('match-source-badge');
});

it('renders missing coordinate behavior and mobile layout', () => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });

  renderMap();

  expect(screen.getByText('Noord Seed has no usable map coordinates yet.')).toBeInTheDocument();
  expect(screen.getByLabelText('Recommended neighborhood map').closest('section')).toHaveAttribute('data-layout', 'mobile');
});

it('renders empty state with missing coordinates', () => {
  renderMap({ map: { ...mapResponse, features: [], empty_state_code: 'match.map.empty' } });
  expect(screen.getByText('No map recommendations are available yet.')).toBeInTheDocument();
  expect(screen.getByText('Noord Seed has no usable map coordinates yet.')).toBeInTheDocument();
});
