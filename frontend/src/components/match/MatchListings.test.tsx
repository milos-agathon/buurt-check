import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import MatchListings from './MatchListings';
import { setupTestI18n } from '../../test/helpers';
import type { MatchListingProviderResult } from '../../types/match';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

const result: MatchListingProviderResult = {
  provider: {
    name: 'MockListingProvider',
    mode: 'mock',
    license_status: 'mock',
    health: 'mock_only',
    limitations: ['MOCK DATA: example listings are not live supply.'],
  },
  availability_density: 70,
  listings: [
    {
      listing_id: 'listing_buy',
      provider_name: 'MockListingProvider',
      provider_mode: 'mock',
      license_status: 'mock',
      neighborhood_id: 'nh_amsterdam_ijburg',
      journey_intent: 'buy',
      property_type: 'apartment',
      price_cents: 57500000,
      currency: 'EUR',
      availability_status: 'available',
      days_on_market: 18,
      freshness_status: 'mock',
      confidence: 55,
      limitations: ['MOCK DATA: buy listing is an example.'],
      retrieved_at: '2026-05-11T08:00:00Z',
    },
    {
      listing_id: 'listing_rent',
      provider_name: 'MockListingProvider',
      provider_mode: 'mock',
      license_status: 'mock',
      neighborhood_id: 'nh_amsterdam_ijburg',
      journey_intent: 'rent',
      property_type: 'apartment',
      rent_cents: 215000,
      currency: 'EUR',
      availability_status: 'available',
      days_on_market: 9,
      freshness_status: 'mock',
      confidence: 55,
      limitations: ['MOCK DATA: rent listing is an example.'],
      retrieved_at: '2026-05-11T08:00:00Z',
    },
  ],
};

it('shows buy and rent listings with provider/source status and mock label', () => {
  render(
    <I18nextProvider i18n={i18n}>
      <MatchListings result={result} />
    </I18nextProvider>,
  );

  expect(screen.getByText('MockListingProvider')).toBeInTheDocument();
  expect(screen.getByText('Availability density: 70/100')).toBeInTheDocument();
  expect(screen.getAllByText(/Price range:/)).toHaveLength(2);
  expect(screen.getByText('Buy home')).toBeInTheDocument();
  expect(screen.getByText('Rental home')).toBeInTheDocument();
  expect(screen.getAllByText('Mock data, not live supply')).toHaveLength(2);
  expect(screen.getByText('18')).toBeInTheDocument();
  expect(screen.getByText('9')).toBeInTheDocument();
});
