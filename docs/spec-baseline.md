# Buurt-check Spec Baseline (Phase 1 Lock)

Date: 2026-02-11

This document is the canonical baseline for Phase 1 spec lock.  
If any statement in `docs/prd.md`, `docs/design-prd.md`, or `docs/design-spec.md` conflicts with this file, this file wins.

## 1. Locked decisions

| Decision ID | Decision | Outcome |
|---|---|---|
| D1-1 | Architecture migration now? | No migration now. Keep current stack and update docs to implementation reality. |
| D2-2 | Visual authority | Keep Polar Frost visual system and update design docs to match. |
| D3-2R | forge3 scope | Implement forge3 renderer for report rendering only (PDF/export). Web rendering remains Three.js. |
| D4-2 | Mapillary scope | Include Mapillary in current scope now. |
| D5-1 | PDF depth | Keep dual-template export: `quick_brief` and `full_dossier`. |

## 2. Authorities

| Domain | Source of truth |
|---|---|
| Product scope and feature definitions | `docs/prd.md` with this baseline overrides |
| Visual behavior and pixel specs | `docs/design-spec.md` aligned to Polar Frost |
| Design principles and UX intent | `docs/design-prd.md` aligned to Polar Frost |
| Architecture and implementation constraints | `AGENTS.md` plus `docs/prd.md` section 10 |

## 3. Feature delivery labels

Label meaning:
- `Implemented now`: part of current delivery scope (may still have implementation gaps).
- `Post-MVP`: explicitly deferred.

| Feature ID | Feature | Delivery label | Current implementation level |
|---|---|---|---|
| F1 | Address resolution + building facts | Implemented now | Implemented and tested. |
| F2a | Interactive 3D + shadow timeline (Three.js) | Implemented now | Implemented and tested. |
| F2b | Static shadow snapshots for export (forge3 report renderer) | Implemented now | Gap: forge3 report renderer not yet integrated end-to-end. |
| F2c | Sunlight analysis card | Implemented now | Implemented with current path; forge3 parity enhancements can follow. |
| F3 | Risk cards (noise, air, climate, sunlight) | Implemented now | Implemented and tested. |
| F4 | Neighborhood snapshot | Implemented now | Implemented and tested. |
| F5 | Shortlist + compare + PDF export (quick + full) | Implemented now | Implemented and tested. |
| F6 | Crime card | Implemented now | Implemented and tested. |
| F7 | Energy label card | Implemented now | Implemented and tested. |
| F8 | Mapillary street-level panel | Implemented now | Implemented and tested. |
| P1 | Web renderer migration away from Three.js | Post-MVP | Deferred by D1-1 and D3-2R. |
| P2 | Full architecture migration (Zustand/Tailwind/Framer) | Post-MVP | Deferred by D1-1. |
| P3 | Photorealistic facade projection from street imagery | Post-MVP | Deferred intentionally. |
| P4 | React Native wrapper | Post-MVP | Deferred intentionally. |

## 4. Source-of-truth matrix

Requirement format: `requirement ID -> owner files -> acceptance tests`.

| Requirement ID | Requirement | Owner files | Acceptance tests |
|---|---|---|---|
| REQ-F1-ADDR | Address suggest/lookup + building facts | `backend/app/api/address.py`, `backend/app/services/locatieserver.py`, `backend/app/services/bag.py`, `frontend/src/components/AddressSearch.tsx` | `backend/tests/test_address_api.py`, `backend/tests/test_locatieserver.py`, `backend/tests/test_bag.py`, `frontend/src/components/AddressSearch.test.tsx`, `frontend/tests/e2e/f1-address-building.spec.ts` |
| REQ-F2A-WEB3D | Web 3D viewer with shadow controls | `frontend/src/components/NeighborhoodViewer3D.tsx`, `frontend/src/components/ShadowControls.tsx`, `frontend/src/components/OverlayControls.tsx` | `frontend/src/components/NeighborhoodViewer3D.test.tsx`, `frontend/src/components/ShadowControls.test.tsx`, `frontend/src/components/OverlayControls.test.tsx` |
| REQ-F2B-REPORT | Report snapshot rendering path using forge3 (export only) | `backend/app/api/address.py`, `backend/app/services/pdf_export.py`, `backend/app/services/three_d_bag.py` | `backend/tests/test_pdf_export.py` plus new forge3 integration tests (to be added) |
| REQ-F2C-SUNLIGHT | Sunlight risk analysis output | `frontend/src/components/SunlightRiskCard.tsx`, `backend/app/services/risk_cards.py` | `frontend/src/components/SunlightRiskCard.test.tsx`, `backend/tests/test_risk_cards.py` |
| REQ-F3-RISKS | Risk cards with score, meaning, actions, source/date | `backend/app/services/risk_cards.py`, `frontend/src/components/RiskCardsPanel.tsx`, `frontend/src/components/RiskDetailView.tsx` | `backend/tests/test_risk_cards.py`, `frontend/src/components/RiskCardsPanel.test.tsx`, `frontend/src/components/RiskDetailView.test.tsx`, `frontend/tests/e2e/f3-risk-cards.spec.ts` |
| REQ-F4-NEIGHBOR | Neighborhood indicators | `backend/app/services/cbs.py`, `frontend/src/components/NeighborhoodStatsCard.tsx` | `backend/tests/test_cbs.py`, `frontend/src/components/NeighborhoodStatsCard.test.tsx`, `frontend/tests/e2e/f4-neighborhood-stats.spec.ts` |
| REQ-F5-SHORTLIST | Shortlist + compare (2-3 homes) | `frontend/src/services/shortlist.ts`, `frontend/src/components/ShortlistScreen.tsx`, `frontend/src/components/CompareScreen.tsx` | `frontend/src/services/shortlist.test.ts`, `frontend/src/components/ShortlistScreen.test.tsx`, `frontend/src/components/CompareScreen.test.tsx` |
| REQ-F5-PDF | Dual-template export (`quick_brief`, `full_dossier`) | `backend/app/services/pdf_export.py`, `backend/app/api/address.py`, `frontend/src/components/ExportBottomSheet.tsx` | `backend/tests/test_pdf_export.py`, `backend/tests/test_address_api.py`, `frontend/src/components/ExportBottomSheet.test.tsx` |
| REQ-F6-CRIME | Crime card + disclaimers | `backend/app/services/tier_b.py`, `frontend/src/components/TierBSignalsCard.tsx` | `backend/tests/test_address_api.py`, `frontend/src/components/TierBSignalsCard.test.tsx` |
| REQ-F7-ENERGY | Energy label card + disclaimers | `backend/app/services/tier_b.py`, `frontend/src/components/TierBSignalsCard.tsx` | `backend/tests/test_address_api.py`, `frontend/src/components/TierBSignalsCard.test.tsx` |
| REQ-F8-MAPILLARY | Mapillary street-level panel in dossier | `backend/app/services/mapillary.py`, `backend/app/models/mapillary.py`, `backend/app/api/address.py`, `frontend/src/components/MapillaryPanel.tsx`, `frontend/src/services/api.ts`, `frontend/src/App.tsx` | `backend/tests/test_address_api.py`, `backend/tests/test_models.py`, `frontend/src/components/MapillaryPanel.test.tsx`, `frontend/src/services/api.test.ts`, `frontend/src/App.test.tsx` |
| REQ-I18N | Bilingual EN/NL user-facing text | `frontend/src/i18n/en.json`, `frontend/src/i18n/nl.json`, `frontend/src/**/*.tsx` | `frontend/src/App.test.tsx`, i18n coverage checks in component tests |
| REQ-DEGRADE | Graceful degradation on upstream failures | `backend/app/services/*.py`, `frontend/src/components/*` risk/status states | `backend/tests/test_risk_cards.py`, `backend/tests/test_cache.py`, UI component fallback tests |
| REQ-QG-BE | Backend quality gates | `backend/pyproject.toml`, backend test suite | `ruff check .`, `pytest -q`, `pytest -q -m live` |
| REQ-QG-FE | Frontend quality gates | `frontend/package.json`, frontend test suite, build config | `npm test`, `npm run test:e2e`, `npm run build` |
