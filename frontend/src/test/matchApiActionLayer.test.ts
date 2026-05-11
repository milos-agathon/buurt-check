import {
  createMatchAlert,
  deleteMatchAlert,
  exportMatchReport,
  fetchMatchListings,
  saveMatchNeighborhood,
  saveMatchReport,
  shareMatchReport,
  updateMatchAlertStatus,
} from '../services/matchApi';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  window.localStorage.clear();
});

it('fetches listings and creates alerts through typed helpers', async () => {
  fetchMock
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        provider: {
          name: 'MockListingProvider',
          mode: 'mock',
          license_status: 'mock',
          health: 'mock_only',
          limitations: ['MOCK DATA'],
        },
        listings: [],
        availability_density: 0,
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        alert: {
          alert_id: 'alert_api',
          neighborhood_ids: ['nh_amsterdam_ijburg'],
          journey_intent: 'buy',
          budget_max_cents: 65000000,
          property_types: ['apartment'],
          notification_type: 'mock',
          status: 'active',
          source_context: 'manual',
          created_at: '2026-05-11T08:00:00Z',
          updated_at: '2026-05-11T08:00:00Z',
        },
        created: true,
        dispatch: {
          dispatch_id: 'dispatch_api',
          alert_id: 'alert_api',
          provider_name: 'MockNotificationProvider',
          provider_mode: 'mock',
          result_status: 'recorded',
          listing_ids: [],
          created_at: '2026-05-11T08:00:00Z',
        },
        matched_listing_ids: [],
        analytics_event: 'match_alert_created',
      }),
    });

  await expect(fetchMatchListings({
    neighborhood_id: 'nh_amsterdam_ijburg',
    journey_intent: 'both',
  })).resolves.toMatchObject({ provider: { mode: 'mock' } });
  await expect(createMatchAlert({
    neighborhood_ids: ['nh_amsterdam_ijburg'],
    journey_intent: 'buy',
    budget_max_cents: 65000000,
    property_types: ['apartment'],
    notification_type: 'mock',
  })).resolves.toMatchObject({ created: true });

  expect(fetchMock).toHaveBeenNthCalledWith(1, expect.stringContaining('/match/listings?'), expect.any(Object));
  expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining('/match/alerts'), expect.objectContaining({
    method: 'POST',
  }));
});

it('supports alert update/delete and save/share/export paths', async () => {
  const alert = {
    alert_id: 'alert_api',
    neighborhood_ids: ['nh_amsterdam_ijburg'],
    journey_intent: 'buy',
    budget_max_cents: 65000000,
    property_types: ['apartment'],
    notification_type: 'mock',
    status: 'paused',
    source_context: 'manual',
    created_at: '2026-05-11T08:00:00Z',
    updated_at: '2026-05-11T08:00:00Z',
  };
  fetchMock
    .mockResolvedValueOnce({ ok: true, json: async () => alert })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ...alert, status: 'deleted' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ report_id: 'report_api', saved: true, status: 'saved' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ share_url: '/shared/match/report/token' }) })
    .mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        export_id: 'export_api',
        report_id: 'report_api',
        export_type: 'json',
        locale: 'en',
        status: 'created',
        payload: { source_refs: ['src_green'] },
        created_at: '2026-05-11T08:00:00Z',
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        saved_neighborhood_id: 'saved_api',
        neighborhood_id: 'nh_amsterdam_ijburg',
        saved_from: 'recommendation',
        note: {},
        created_at: '2026-05-11T08:00:00Z',
        analytics_event: 'match_neighborhood_saved',
      }),
    });

  await expect(updateMatchAlertStatus('alert_api', 'paused')).resolves.toMatchObject({ status: 'paused' });
  await expect(deleteMatchAlert('alert_api')).resolves.toMatchObject({ status: 'deleted' });
  await expect(saveMatchReport('report_api')).resolves.toMatchObject({ saved: true });
  await expect(shareMatchReport('report_api', {
    scope: 'report_view',
    locale: 'en',
    consent_to_share: true,
  })).resolves.toMatchObject({ share_url: '/shared/match/report/token' });
  await expect(exportMatchReport('report_api', {
    export_type: 'json',
    locale: 'en',
  })).resolves.toMatchObject({ status: 'created' });
  await expect(saveMatchNeighborhood({
    neighborhood_id: 'nh_amsterdam_ijburg',
    saved_from: 'recommendation',
  })).resolves.toMatchObject({ neighborhood_id: 'nh_amsterdam_ijburg' });
});

