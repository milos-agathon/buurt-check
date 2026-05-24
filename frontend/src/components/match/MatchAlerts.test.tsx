import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import MatchAlerts from './MatchAlerts';
import { setupTestI18n } from '../../test/helpers';
import type { MatchAlertRule } from '../../types/match';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

const alert: MatchAlertRule = {
  alert_id: 'alert_ui',
  neighborhood_ids: ['nh_amsterdam_ijburg'],
  journey_intent: 'buy',
  budget_max_cents: 65000000,
  property_types: ['apartment'],
  notification_type: 'mock',
  status: 'active',
  source_context: 'report',
  created_at: '2026-05-11T08:00:00Z',
  updated_at: '2026-05-11T08:00:00Z',
};

it('creates alerts from suggested context and manages saved alerts', async () => {
  const onCreate = vi.fn();
  const onUpdateStatus = vi.fn();
  const onDelete = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <MatchAlerts
        alerts={[alert]}
        suggestedAlerts={[{
          neighborhood_id: 'nh_amsterdam_ijburg',
          neighborhood_name: 'IJburg',
          journey_intent: 'buy',
          budget_max_cents: 65000000,
          property_type: 'apartment',
          source_context: 'report',
        }]}
        onCreate={onCreate}
        onUpdateStatus={onUpdateStatus}
        onDelete={onDelete}
      />
    </I18nextProvider>,
  );

  await userEvent.click(screen.getByRole('button', { name: /IJburg/i }));
  await userEvent.click(screen.getByRole('button', { name: 'Create alert' }));
  await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

  expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
    neighborhood_ids: ['nh_amsterdam_ijburg'],
    journey_intent: 'buy',
    property_types: ['apartment'],
  }));
  expect(onUpdateStatus).toHaveBeenCalledWith('alert_ui', 'paused');
  expect(onDelete).toHaveBeenCalledWith('alert_ui');
  expect(screen.getByText('Mock notification recorded')).toBeInTheDocument();
});

it('uses localized property type labels while submitting stable property keys', async () => {
  const onCreate = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <MatchAlerts
        alerts={[alert]}
        suggestedAlerts={[{
          neighborhood_id: 'nh_amsterdam_ijburg',
          neighborhood_name: 'IJburg',
          journey_intent: 'buy',
          budget_max_cents: 65000000,
          property_type: 'apartment',
          source_context: 'report',
        }]}
        onCreate={onCreate}
        onUpdateStatus={vi.fn()}
        onDelete={vi.fn()}
      />
    </I18nextProvider>,
  );

  expect(screen.getByText('Buy · Apartment')).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Apartment' })).toBeInTheDocument();
  expect(screen.queryByText('Buy · apartment')).not.toBeInTheDocument();
  expect(screen.queryByDisplayValue('apartment')).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /IJburg/i }));
  await userEvent.click(screen.getByRole('button', { name: 'Create alert' }));

  expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
    property_types: ['apartment'],
  }));
});
