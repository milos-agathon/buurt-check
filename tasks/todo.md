# F3 Risk Cards End-to-End Plan

## Goal

Implement F3 from `docs/prd.md` fully: noise, air quality, climate stress, and sunlight risk cards with score/level, plain explanation, viewing check question, and source+date.

## Plan

- [x] 1) Backend models + endpoint
  - Add risk-card response models.
  - Add `GET /api/address/{vbo_id}/risks` with cache and graceful degradation.

- [x] 2) Backend risk services
  - Implement noise sampling (RIVM WMS Lden road traffic).
  - Implement air sampling (RIVM GCN PM2.5 + NO2).
  - Implement climate stress sampling (Klimaateffectatlas layers; heat + water signals).
  - Implement threshold-based low/medium/high classification and source/date metadata.

- [x] 3) Frontend API/types + UI cards
  - Add risk API client + TS types.
  - Add F3 UI cards for noise, air quality, climate stress.
  - Keep sunlight as F3 card and add source+date rendering.
  - Integrate risk fetch in `App.tsx` without blocking F1/F2 flow.

- [x] 4) i18n + styling
  - Add EN/NL copy for all new card labels, meanings, viewing questions, and source text.
  - Add component CSS for risk cards.

- [x] 5) Tests + verification
  - Add/extend backend tests for endpoint/service behavior.
  - Add/extend frontend tests for API client/components/App flow.
  - Run: `ruff check`, backend pytest, frontend vitest, `npm run build`.

## Review

- Implemented F3 end-to-end:
  - Backend: new risk models, new risk service (`noise`, `air_quality`, `climate_stress`), new endpoint `GET /api/address/{vbo_id}/risks`, 7-day cache, graceful degradation.
  - Frontend: integrated F3 fetch flow, new `RiskCardsPanel` component, EN/NL copy for all F3 card elements, updated sunlight card to show source+date.
  - Test updates: backend endpoint/service/model coverage + frontend API/component/App coverage.
- Verification run:
  - `backend`: `python -m ruff check app tests`, `python -m pytest tests -q` -> 86 passed.
  - `frontend`: `npm run test` -> 104 passed, `npm run build` -> success, `npm run test:e2e` -> 1 passed.
