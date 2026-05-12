import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import MatchSimilarSearch from './MatchSimilarSearch';
import { setupTestI18n } from '../../test/helpers';
import type { MatchSimilarResponse } from '../../types/match';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

const response: MatchSimilarResponse = {
  source_neighborhood_id: 'nh_ijburg',
  unsupported_regions: [],
  empty_state_code: null,
  results: [
    {
      neighborhood_id: 'nh_lower',
      name: 'Lower score',
      municipality: 'Haarlem',
      similarity_score: 72,
      shared_drivers: [],
      meaningful_differences: [{ feature: 'affordability_buy', impact: 18, score: 70, source_refs: ['src'] }],
      constraints: [],
      confidence: { score: 68, label: 'medium', reasons: ['mock'] },
      source_refs: ['src'],
    },
    {
      neighborhood_id: 'nh_higher',
      name: 'Higher score',
      municipality: 'Utrecht',
      similarity_score: 91,
      shared_drivers: [],
      meaningful_differences: [],
      constraints: [],
      confidence: { score: 74, label: 'medium', reasons: ['mock'] },
      source_refs: ['src'],
    },
  ],
};

function renderSimilar(props: Partial<React.ComponentProps<typeof MatchSimilarSearch>> = {}) {
  render(
    <I18nextProvider i18n={i18n}>
      <MatchSimilarSearch
        knownNeighborhoods={[{ id: 'nh_ijburg', name: 'IJburg' }]}
        response={response}
        {...props}
      />
    </I18nextProvider>,
  );
}

it('starts from a known neighborhood and ranks similar alternatives', () => {
  renderSimilar();

  expect(screen.getByLabelText('Known neighborhood')).toHaveValue('nh_ijburg');
  const cards = screen.getAllByRole('listitem');
  expect(cards[0]).toHaveTextContent('Higher score');
  expect(cards[1]).toHaveTextContent('Lower score');
  expect(cards[1]).toHaveTextContent('Different: affordability_buy');
});

it('submits cheaper greener calmer filters', async () => {
  const onSearch = vi.fn();
  renderSimilar({ onSearch });

  await userEvent.click(screen.getByLabelText('Similar but greener'));
  await userEvent.click(screen.getByRole('button', { name: 'Find alternatives' }));

  expect(onSearch).toHaveBeenCalledWith('nh_ijburg', {
    cheaper: true,
    greener: true,
    calmer: false,
  });
});
