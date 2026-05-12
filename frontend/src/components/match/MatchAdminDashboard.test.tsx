import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import MatchAdminDashboard from './MatchAdminDashboard';
import { setupTestI18n } from '../../test/helpers';
import type { MatchAdminHealthResponse } from '../../types/match';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

const health: MatchAdminHealthResponse = {
  overall_status: 'degraded',
  regions: [{ region_config_id: 'mvp-randstad-eindhoven-seed', status: 'mock_only' }],
  source_health: [{
    source_health_id: 'health_seed',
    provider_name: 'SeedMockImporter',
    region_config_id: 'mvp-randstad-eindhoven-seed',
    health_status: 'mock_only',
    stale_metric_count: 2,
    missing_metric_count: 1,
    mock_metric_count: 12,
    failed_run_count: 1,
    details: { limitation: 'seed fixture' },
    created_at: '2026-05-11T08:00:00Z',
  }],
  data_freshness: [{ label: 'Seed metrics', status: 'stale', count: 2 }],
  missing_data: [{ metric_key: 'mobility', count: 1, severity: 'warning' }],
  stale_data: [{ metric_key: 'green_access', count: 2, severity: 'warning' }],
  source_failures: [{ provider_name: 'CBS', status: 'failed', error_code: 'source_timeout' }],
  scoring_anomalies: [{ anomaly_type: 'score_outlier', severity: 'warning', count: 1 }],
  listing_provider_status: [{
    name: 'MockListingProvider',
    mode: 'mock',
    license_status: 'mock',
    health: 'mock_only',
    limitations: ['Mock listing supply'],
  }],
  alert_dispatcher_status: {
    provider_name: 'MockNotificationProvider',
    health: 'degraded',
    failures: [{ alert_id: 'alert_failed', error_code: 'mock_dispatch_failed' }],
  },
  report_generation_failures: [{ report_id: 'report_failed', error_code: 'pdf_failed' }],
  mock_data_indicators: [{ label: 'Seed fixture', status: 'mock', count: 12 }],
  live_data_indicators: [],
  success_metrics: [
    { event_name: 'match_quiz_started', count: 10 },
    { event_name: 'match_feedback_submitted', count: 3 },
  ],
  prd_traceability: [
    { fr_id: 'FR1', label: 'Preference quiz', status: 'implemented' },
    { fr_id: 'FR14', label: 'Admin data dashboard', status: 'implemented' },
  ],
};

it('renders key data quality, provider, failure, mock/live and metric statuses', () => {
  render(
    <I18nextProvider i18n={i18n}>
      <MatchAdminDashboard health={health} />
    </I18nextProvider>,
  );

  expect(screen.getByText('Admin data dashboard')).toBeInTheDocument();
  expect(screen.getByText('Data freshness')).toBeInTheDocument();
  expect(screen.getByText('Missing data')).toBeInTheDocument();
  expect(screen.getByText('Source failures')).toBeInTheDocument();
  expect(screen.getByText('Scoring anomalies')).toBeInTheDocument();
  expect(screen.getByText('Listing provider status')).toBeInTheDocument();
  expect(screen.getByText('Alert dispatcher status')).toBeInTheDocument();
  expect(screen.getByText('Report generation failures')).toBeInTheDocument();
  expect(screen.getByText('Mock vs live data')).toBeInTheDocument();
  expect(screen.getByText('Product metrics')).toBeInTheDocument();
  expect(screen.getByText('PRD FR1-FR14 traceability')).toBeInTheDocument();
  expect(screen.getByText(/source_timeout/)).toBeInTheDocument();
  expect(screen.getByText(/FR1: Preference quiz/)).toBeInTheDocument();
  expect(screen.getByText(/pdf_failed/)).toBeInTheDocument();
  expect(screen.getByText(/match_feedback_submitted/)).toBeInTheDocument();
});
