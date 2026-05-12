import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import MatchSaved from './MatchSaved';
import { setupTestI18n } from '../../test/helpers';
import type { SavedNeighborhood } from '../../types/match';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

const saved: SavedNeighborhood = {
  saved_neighborhood_id: 'saved_ui',
  neighborhood_id: 'nh_amsterdam_ijburg',
  saved_from: 'recommendation',
  note: {},
  created_at: '2026-05-11T08:00:00Z',
  analytics_event: 'match_neighborhood_saved',
};

it('renders saved neighborhoods and share/export report actions', async () => {
  const onDeleteNeighborhood = vi.fn();
  const onSaveReport = vi.fn();
  const onShareReport = vi.fn();
  const onExportReport = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <MatchSaved
        neighborhoods={[saved]}
        reportId="report_ui"
        locale="en"
        share={{ share_url: '/shared/match/report/token' }}
        exportReady
        onDeleteNeighborhood={onDeleteNeighborhood}
        onSaveReport={onSaveReport}
        onShareReport={onShareReport}
        onExportReport={onExportReport}
      />
    </I18nextProvider>,
  );

  await userEvent.click(screen.getByRole('button', { name: 'Unsave' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save report' }));
  await userEvent.click(screen.getByLabelText('I agree to create a scoped share link'));
  await userEvent.click(screen.getByRole('button', { name: 'Share with partner or family' }));
  await userEvent.click(screen.getByRole('button', { name: 'Export PDF' }));

  expect(onDeleteNeighborhood).toHaveBeenCalledWith('saved_ui');
  expect(onSaveReport).toHaveBeenCalled();
  expect(onShareReport).toHaveBeenCalledWith(true);
  expect(onExportReport).toHaveBeenCalledWith('pdf');
  expect(screen.getByText('Share link ready: /shared/match/report/token')).toBeInTheDocument();
  expect(screen.getByText('Export is ready.')).toBeInTheDocument();
});

