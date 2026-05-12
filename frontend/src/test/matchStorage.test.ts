import {
  deleteSavedNeighborhoodLocal,
  getSavedNeighborhoodsLocal,
  getSavedReportsLocal,
  saveNeighborhoodLocal,
  saveReportLocal,
} from '../services/matchStorage';

beforeEach(() => {
  window.localStorage.clear();
});

it('saves reports with future account linkage fields but no bearer entitlement', () => {
  const saved = saveReportLocal({
    report_id: 'report_local',
    session_id: 'anon_local',
    linked_user_id: null,
    buyer_key: 'buyer_local',
  });

  expect(saved.report_id).toBe('report_local');
  expect(saved.buyer_key).toBe('buyer_local');
  expect(getSavedReportsLocal()).toHaveLength(1);
  expect(JSON.stringify(getSavedReportsLocal())).not.toContain('entitlement_token');
});

it('saves and deletes local neighborhoods', () => {
  const saved = saveNeighborhoodLocal({
    session_id: 'anon_local',
    neighborhood_id: 'nh_amsterdam_ijburg',
    saved_from: 'recommendation',
  });

  expect(getSavedNeighborhoodsLocal()).toHaveLength(1);
  expect(deleteSavedNeighborhoodLocal(saved.saved_neighborhood_id)).toBe(true);
  expect(getSavedNeighborhoodsLocal()).toHaveLength(0);
});

