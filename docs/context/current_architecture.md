# Current Architecture

Last inspected: 2026-05-15

Scope: repository architecture for the Buurt Check match-first revamp. Product
context comes from `docs/prd.md`, but this memo documents current implementation
only. It does not redefine product behavior or mark revamp work complete.

Sources inspected for this memo:

- `docs/prd.md`
- `docs/ai/latest_handoff.md`
- `.specify/memory/constitution.md`
- `docs/qa/match_first_revamp_traceability.md`
- `frontend/src/App.tsx`
- `frontend/src/routing/hashRoutes.ts`
- `frontend/src/components/match-first/*`
- `frontend/src/services/matchFirstApi.ts`
- `backend/app/api/match.py`
- `backend/app/services/match/sessions.py`
- `backend/app/services/match/jobs.py`
- `backend/app/services/match/results.py`
- `backend/app/db.py`

Unknowns are called out explicitly where the repository does not show a
completed architecture or integration path.

Planning baseline from the handoff and traceability docs: Phase 1 route/UI shell
and Phase 2 survey/preference-vector work are documented as closed. Phase 3
backend matching work is marked complete in `specs/002-match-first-revamp/tasks.md`
and has repository support in the inspected backend endpoints/services, but
planning should verify the current worktree before depending on it for broader
frontend map or Dossier work. The next documented implementation area is Phase
4 progress and success states.

## 1. Frontend Framework And Router

- Frontend app: React 19, TypeScript 5.9, Vite 7, Vitest, Playwright.
- Styling: plain CSS plus shared tokens in `frontend/src/styles/tokens.css`.
  There is no Tailwind, CSS modules, or CSS-in-JS.
- State and routing: `frontend/src/App.tsx` owns app-level `useState` and
  orchestration. `frontend/src/routing/hashRoutes.ts` is the custom hash router.
  There is no React Router, Redux, Zustand, or React Query.
- Main route state is the `HashRoute` union from `hashRoutes.ts`. `App.tsx`
  maps parsed routes to `activeScreen` and renders screens with Framer Motion.
- API base resolution is centralized in `frontend/src/config/apiBase.ts`.
  Same-origin `/api` is the default, and hosted web forces first-party `/api`
  when an absolute cross-origin API base is configured.
- PWA setup is in `frontend/vite.config.ts` via `vite-plugin-pwa`. The Vite dev
  server proxies `/api` to `http://127.0.0.1:8000` by default.

## 2. Current Route Map

Hash routes parsed today:

| Route | Current screen | Notes |
| --- | --- | --- |
| `#/` or `#/match` | `matchLanding` | Current first screen is match-first landing. |
| `#/search` | `search` | Address search remains available. Can preserve match-return params. |
| `#/saved` | `shortlist` | Saved address shortlist. |
| `#/compare` | `compare` | Saved address comparison. |
| `#/settings` | `settings` | Hidden during match-first onboarding screens. |
| `#/briefing` | `dossier` | Dossier shell without a path `vbo_id`; usually needs `lookup`. |
| `#/address/{vbo_id}` | `dossier` | Address-level Dossier route. |
| `#/pack/{vbo_id}/{report_id}` | `pack` | Pre-bid pack route. |
| `#/shared/{share_token}` | `shared` | Shared pre-bid briefing. |
| `#/shared-pack/{share_token}` | `shared` | Shared pre-bid pack. |
| `#/match/intro` | `matchSurveyIntro` | Legacy/sessionless intro route. |
| `#/match/survey` | `matchSurvey` | Legacy/sessionless survey route; bootstraps a backend session before answers. |
| `#/match/quiz` | `matchSurvey` | Legacy alias for survey. |
| `#/match/session/{session_id}/intro` | `matchSurveyIntro` | Session-scoped survey intro. |
| `#/match/session/{session_id}/question/{step}` | `matchSurvey` | Bounded by the current 11-question survey config. |
| `#/match/session/{session_id}/review` | `matchReview` | Review and backend vector readback gate. |
| `#/match/session/{session_id}/run` | `matchRun` | Frontend currently renders a neutral local shell; Phase 4 must call the backend run/status endpoints. |
| `#/match/session/{session_id}/success` | `matchSuccess` | Neutral placeholder; does not assert backend completion. |
| `#/match/session/{session_id}/results` | `matchResults` | Neutral/unavailable shell unless local fallback status is set. |
| `#/match/session/{session_id}/neighborhood/{id}` | `matchNeighborhood` | Placeholder/restored-context shell, not a live neighborhood map. |
| `#/match/report` | `matchReport` | Older match report/recommendation surface; backing state is currently initialized as null in `App.tsx`. |
| `#/shared/match/report/{token}` | `matchSharedReport` | Shared match report route. |
| `#/match/compare` | `matchComparison` | Existing match comparison screen. |
| `#/match/similar` | `matchSimilar` | Existing similar-neighborhood screen. |
| `#/match/map` | `matchMap` | Recovery shell asking users to finish survey first. |
| `#/match/listings` | `matchListings` | Existing listings screen. |
| `#/match/alerts` | `matchAlerts` | Existing alerts screen. |
| `#/match/saved` | `matchSaved` | Existing saved match neighborhoods screen. |
| `#/match/admin` | `matchAdmin` | Match admin health dashboard. |

Dossier query/hash params currently parsed:

- `lookup`: address lookup id from Locatieserver.
- `report`: report id.
- `session_id`: checkout session id, not match session id.
- `buyer_resume`: checkout recovery token.
- `match_return`: allowed return target, currently `#/match/map`,
  `#/match/session/{session_id}/results`, or
  `#/match/session/{session_id}/neighborhood/{id}`.
- `match_session`: match session id for return context.
- `match_neighborhood`: selected neighborhood id for return context.
- `match_context`: JSON string carrying map center, zoom, list scroll, mobile
  map/list mode, selected result id/rank, language, and selected house id.

Clean non-hash URLs are parsed by `parseLocationRoute()` for some cases, but
the frontend architecture is still hash-route-first. Unknown: current hosting
rewrite coverage for all match-first clean URLs is not shown outside the Vite
and CI configs inspected here.

## 3. Current Landing, Search, And Match Behavior

Landing:

- `MatchFirstLanding` is the root/current landing surface. It uses
  `HeroMapBackground`, one primary match CTA, a secondary address-search link,
  and an inline Dutch/English language switcher.
- Starting the match calls `POST /api/match/sessions` through
  `createMatchSession()` and routes to
  `#/match/session/{session_id}/intro`.
- The secondary address link routes to `#/search`.
- Landing events are stored by `recordMatchFirstEvent()` in localStorage.

Search:

- `AddressSearch` is a debounced address combobox backed by
  `GET /api/address/suggest`.
- Selecting a suggestion calls the large Dossier loading pipeline in `App.tsx`:
  address lookup, short report creation, entitlement, pre-bid briefing, building
  facts, risk cards, comparisons, viewing questions, livability, neighborhood
  stats, and deferred 3D loading.
- Search still has first-visit evidence cards, recent searches, returning-user
  saved prompts, keyboard navigation, abort handling, and translated copy.

Match-first survey:

- `SurveyIntro`, `SurveyShell`, and `SurveyReview` implement the current
  match-first onboarding shell.
- The survey has 11 configured questions in
  `frontend/src/components/match-first/surveyQuestions.ts`: intent, budget,
  household, anchor location, commute, lifestyle priorities, must-haves,
  dealbreakers, housing types, area character, and language.
- `SurveyShell` shows one question at a time, persists local session snapshots,
  and patches backend answers via `PATCH /api/match/sessions/{session_id}/answers`.
- `SurveyReview` gates the final run handoff by reading back
  `GET /api/match/sessions/{session_id}` and requiring a complete backend
  session with a preference vector whose `raw_answer_refs` match the displayed
  answers.
- The frontend does not currently call `POST /api/match/sessions/{session_id}/run`,
  `GET /status`, or `GET /results`. `matchRun`, `matchSuccess`,
  `matchResults`, and `matchNeighborhood` are neutral shells/placeholders.
- This is the key Phase 4 integration gap: progress and success UI must be
  backed by real persisted backend job state, not local `run_pending` or
  placeholder route state.

Existing older match surfaces:

- `frontend/src/components/match/*` contains comparison, similar search,
  listings, alerts, saved neighborhoods, reports, feedback controls, and admin
  dashboard components.
- `App.tsx` still has routes for these surfaces and calls the older
  `frontend/src/services/matchApi.ts` functions.
- There is no current frontend `MatchQuiz` component in the inspected tree.
  Backend `/api/match/quiz` still exists for the older synchronous quiz path.
- Several old match states in `App.tsx` are initialized as `null` and are not
  wired to a full active quiz/report flow from the new landing.

## 4. Current Dossier Route And Required Params

Primary route:

- `#/address/{vbo_id}` opens the Dossier when a VBO id is known.
- `lookup` is used when entering from an address suggestion and is required for
  reliable cold-start address resolution when `vbo_id` is absent or extra
  lookup context is needed.

Alternate/current recovery routes:

- `#/briefing?lookup={lookup_id}` opens the Dossier shell from lookup context.
- `#/address/{vbo_id}?lookup={lookup_id}` is the normal loaded address route.
- `#/address/{vbo_id}?report={report_id}&session_id={checkout_session_id}` is
  used for checkout/export recovery. `session_id` here is a payment session,
  not a match session.

Dossier interface:

- The on-screen Dossier is rendered in `App.tsx` and wrapped in
  `DossierSheet`.
- Current Dossier modules include `BuildingFootprintMap`, `BuildingFactsCard`,
  `AttentionSummary`, `RiskTilesGrid`, `RiskDetailView`, `LivabilityCard`,
  `LivabilityDetailView`, `NeighborhoodViewer3D`, `ShadowTimeSlider`,
  `NeighborhoodStatsCard`, `ViewingChecklist`, `ActionBar`, and
  `ExportBottomSheet`.
- Frontend risk tiles render Noise, Air, and Climate. Sunlight is not a
  frontend risk tile; it remains 3D/PDF/export evidence.
- If match-return context exists, the Dossier can render a translated
  `Back to match map` action. That action stores activated return context and
  routes back to results or selected-neighborhood placeholders.
- If no reliable address is available after entering from match context, the
  Dossier shows a localized fallback with manual search and back-to-map actions.

Unknown or incomplete:

- There is no implemented house/building click bridge from a selected
  neighborhood result map into Dossier. Current Dossier entry still depends on
  a Locatieserver suggestion or known VBO id.
- Match-return context preservation exists at route/state level, but live
  results-map and selected-neighborhood hydration are not implemented in the
  frontend.

## 5. Current Map Library And 3D Capability

2D map support:

- No Leaflet, Mapbox GL, MapLibre, OpenLayers, or Google Maps dependency is
  present in `frontend/package.json`.
- `BuildingFootprintMap` is an address-level static visual. It fetches a WMS
  image through `/api/address/wms-tile`, overlays a building footprint with SVG,
  and falls back to SVG-only rendering.
- Match result map data exists on the backend (`/api/match/map` and
  match results `map` payloads), but the current frontend match results route
  does not render an interactive Netherlands map.

3D support:

- `NeighborhoodViewer3D` uses plain Three.js (`WebGLRenderer`,
  `OrbitControls`, geometry merging, extruded fallback geometry, LoD 2.2 roof
  surfaces where available).
- It is address-Dossier oriented. It receives building arrays from
  `/api/address/{vbo_id}/building3d` and
  `/api/address/{vbo_id}/neighborhood3d`.
- The backend 3D service is `backend/app/services/three_d_bag.py`, configured
  by `BUURT_THREE_D_BAG_BASE` and related flags in `backend/app/config.py`.
- The 3D viewer also computes sunlight/SVF using Web Workers when supported and
  can fetch orthophoto ground texture through the WMS tile proxy.
- `App.tsx` defers 3D fetches behind viewport intersection for the Dossier.

Reduced-motion and fallback support:

- Match route transitions use Framer Motion with `useReducedMotion()` and
  `getMatchRouteMotionProps()`.
- `HeroMapBackground` reads `prefers-reduced-motion` and marks standard versus
  reduced motion. It uses a static image `/images/showcase-neighborhood.webp`
  and falls back to a CSS grid if the image fails.
- Several CSS files include `prefers-reduced-motion` rules; shared UI components
  such as `AnimatedScore` and `ScoreBar` also check reduced motion.

Unknown or incomplete:

- No frontend map engine has been selected or implemented for the PRD's live
  Netherlands results map, neighborhood polygons, map/list sync, amenity tags,
  or selected-neighborhood-only 3D building layer.
- Backend `MatchGeometryReference.building_layer_available` is currently false
  in serialized match results from seed data.

## 6. Current i18n Mechanism

- i18n is initialized in `frontend/src/i18n/index.ts` with `i18next`,
  `react-i18next`, and `i18next-browser-languagedetector`.
- Bundled resources: `frontend/src/i18n/en.json` and
  `frontend/src/i18n/nl.json`.
- Supported languages: `en` and `nl`; fallback language is `nl`.
- Detection order is localStorage then HTML tag, and language is cached in
  localStorage.
- Translation keys are already used across search, Dossier, match-first survey,
  placeholders, warning codes, and match surfaces.
- Tests include i18n parity/overflow/accessibility guards such as
  `match-i18n.test.ts`, `i18n-completeness.test.ts`, and
  `i18n-overflow-guards.test.ts`.

## 7. Backend API Framework And Endpoint Map

Framework:

- Backend app: FastAPI in `backend/app/main.py`.
- Router assembly: `backend/app/api/router.py` mounts all API routers under
  `/api`.
- Middleware: CORS, GZip, SlowAPI rate limiting, request logging, and Sentry
  setup. Startup initializes the database.
- Packaging: `backend/pyproject.toml`; Python metadata allows `>=3.11`, CI uses
  Python 3.12.

Top-level health:

- `GET /health`
- `GET /api/health`
- `GET /health/forge3d`

Main `/api/address` endpoints:

- Admin/source review: `/admin/source-runs`, `/admin/prebid/source-runs`,
  `/admin/source-runs/{id}`, `/admin/prebid/source-runs/{id}`,
  `/admin/review-tasks/{id}/decision`,
  `/admin/prebid/review-tasks/{id}/decision`.
- Pre-bid: `POST /{vbo_id}/prebid-briefing`,
  `POST /{vbo_id}/prebid/briefing`,
  `GET /{vbo_id}/prebid-briefing/{briefing_id}`,
  `GET /{vbo_id}/prebid-pack`,
  `GET /{vbo_id}/prebid/pack/{report_id}`,
  share/email/delete variants, `GET /shared/{share_token}`,
  `GET /shared-pack/{share_token}`.
- Address/Dossier data: `GET /suggest`, `GET /lookup`, `GET /wms-tile`,
  `GET /{vbo_id}/building`, `GET /{vbo_id}/building3d`,
  `GET /{vbo_id}/neighborhood3d`, `GET /{vbo_id}/weather-tmy`,
  `POST /{vbo_id}/sunlight`, `GET /{vbo_id}/risks`,
  `GET /{vbo_id}/neighborhood`, `GET /{vbo_id}/risk-comparisons`,
  `GET /{vbo_id}/viewing-questions`, `GET /{vbo_id}/tier-b`,
  `GET /{vbo_id}/livability`, `GET /{vbo_id}/property-warnings`,
  `POST /{vbo_id}/export`, `GET /{vbo_id}/export`.

Main `/api/match` endpoints:

- `GET /health`
- `POST /quiz`
- `POST /sessions`
- `GET /sessions/{session_id}`
- `PATCH /sessions/{session_id}/answers`
- `POST /sessions/{session_id}/run`
- `GET /sessions/{session_id}/status`
- `GET /sessions/{session_id}/results`
- `POST /recommendations`
- `POST /similar`
- `GET /map`
- `POST /compare`
- `POST /reports`
- `GET /reports/{report_id}`
- `GET /shared/{share_token}`
- `GET /listings`
- `GET /alerts`
- `POST /alerts`
- `PATCH /alerts/{alert_id}`
- `DELETE /alerts/{alert_id}`
- `POST /feedback`
- `POST /reports/{report_id}/save`
- `POST /reports/{report_id}/share`
- `POST /reports/{report_id}/export`
- `POST /saved-neighborhoods`
- `GET /saved-neighborhoods`
- `DELETE /saved-neighborhoods/{saved_neighborhood_id}`

Other routers:

- `/api/admin/match/health`
- `/api/billing/*` for Stripe, Google Play, Apple App Store, and webhooks.
- `/api/reports/short` and `/api/reports/{report_id}/entitlement`.
- `/api/metrics` and `/api/metrics/event`.
- `/api/shared/prebid/{share_token}` and
  `/api/shared/prebid-pack/{share_token}`.

## 8. Python Services And Data Dependencies

Persistence and cache:

- Persistence uses SQLite locally and Turso/libsql when configured.
  `backend/app/db.py` bootstraps reports, pre-bid, payment, and match tables.
- Match tables include sessions, survey answers, preference vectors, jobs,
  result sets, reports, listings, alerts, saved neighborhoods, feedback,
  analytics events, source health snapshots, and exports.
- Redis cache helpers live in `backend/app/cache/redis.py` with a simple circuit
  breaker. Cache TTLs are configured in `backend/app/config.py`.

External data dependencies configured in `backend/app/config.py`:

- PDOK Locatieserver, BAG WFS, PDOK BAG OGC v2, PDOK Luchtfoto WMS, PDOK BRT WMS.
- 3DBAG API.
- RIVM ALO/noise and GCN/air WMS.
- Climate Atlas WMS and layer index.
- CBS Wijken en Buurten and crime feeds.
- BRO soil/foundation risk sources.
- Leefbaarometer WFS.
- PVGIS TMY weather.
- Official publications SRU, PDOK cadastral/WKPB/RCE, EP Online, RDW parking.
- Stripe, Google Play, Apple App Store, Sentry, optional match providers.

Address/Dossier services:

- `locatieserver.py`, `bag.py`, `bag_ogc.py`, `three_d_bag.py`, `wms_tile.py`,
  `cbs.py`, `leefbaarometer.py`, `risk_cards.py`,
  `risk_comparisons.py`, `foundation_risk.py`, `property_warnings.py`,
  `viewing_questions.py`, `source_orchestrator.py`, source connectors,
  pre-bid services, PDF export services, billing services, and metrics.

Match services:

- `sessions.py`: creates match sessions, reads sessions, patches answers,
  validates answers, stores raw answers and preference vectors.
- `survey_schema.py` and `survey_constants.py`: backend survey order,
  validation, protected-answer rejection, and normalization.
- `preference_vector.py`: builds stable preference vectors from raw answers.
- `jobs.py`: in-process FastAPI `BackgroundTasks` match-job lifecycle with
  persisted job rows, progress stages, status polling, and result retrieval.
  There is no Celery/RQ/ARQ worker in the inspected repository.
- Job durability baseline: persisted in-process jobs are the current
  architecture. A separate queue/worker should be treated as a future
  architecture decision unless planning identifies a concrete durability or
  runtime requirement that the current baseline cannot satisfy.
- `neighborhood_features.py` and `providers/seed.py`: load seeded mock
  neighborhood feature data from
  `backend/app/data/match_seed/neighborhoods.json`.
- `scoring.py`, `recommendations.py`, `results.py`, `model_selection.py`:
  deterministic weighted scoring, recommendation grouping, result
  serialization, and model-honesty fallback. Current results report
  `model_mode: weighted_scoring`, `evaluation_status:
  not_validated_no_labels`, and `predictive_probability_available: false`.
- `map_view.py`, `comparison.py`, `similarity.py`, `listings.py`, `alerts.py`,
  `feedback.py`, `reports.py`, `ai_report.py`, and provider adapters support
  older/current match surfaces.

Python scripts:

- Root scripts include dev reset/start, build/landing/mobile wrappers,
  Spec Kit orchestration, billing readiness, 3D debug/benchmark helpers, PDF
  baseline updates, and release checks.
- Backend scripts include integration verification, 3DBAG probes, latency
  measurement, RIVM ingest, diagnostics, billing smoke/preflight, PDF baseline
  updates, and font conversion.

## 9. Test Commands And CI

Root commands from `package.json`:

- `npm run build`
- `npm run landing:build`
- `npm run landing:serve`
- `npm run landing:test:e2e`
- `npm run landing:check`
- `npm run billing:preflight`
- `npm run billing:smoke`

Frontend commands from `frontend/package.json`:

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run test`
- `npm run test:a11y`
- `npm run test:perf`
- `npm run test:e2e`
- `npm run test:perf:e2e`
- `npm run test:visual`

Backend commands from `backend/pyproject.toml` and repo guidance:

- `ruff check .`
- `pytest -x -q -m "not live and not visual and not benchmark"`
- `pytest -x -q`
- `pytest -x -q -m "visual"`
- `pytest -x -q -m "benchmark"`

CI in `.github/workflows/ci.yml`:

- Frontend Build + Test: Node 22, `npm ci`, `npm run build`, `npm run test`.
- Landing Smoke: installs Chromium Playwright browsers and runs
  `npm run landing:test:e2e`.
- Backend Lint + Unit: Python 3.12, install `backend` with dev extras,
  `ruff check .`, and non-live/non-visual/non-benchmark pytest.
- Backend Visual Regression: depends on backend lint/unit, installs TeX, runs
  visual pytest.
- Backend Performance Benchmarks: depends on backend lint/unit, installs TeX,
  runs benchmark pytest.

Lockfiles:

- Root `package-lock.json` exists for root/mobile tooling.
- `frontend/package-lock.json` exists for the Vite app.
- No Python lockfile was found in the inspected repository; backend dependency
  versions are ranges in `backend/pyproject.toml`.

## 10. Integration Risks For The Match-First Revamp

- `App.tsx` is the highest-risk integration point. It owns routing, match-first
  session flow, Dossier loading, entitlement, checkout recovery, analytics,
  pre-bid state, 3D fetch triggers, and many older match screens.
- Backend match jobs now exist, but the frontend does not call run/status/results
  endpoints yet. Progress, success, results, and selected-neighborhood screens
  must be wired to real backend state before they can claim completion.
- The frontend has no production results-map engine. The PRD needs pan/zoom,
  Netherlands bounds, ranked list sync, markers/polygons, keyboard/list
  alternatives, and mobile performance behavior that the current static/SVG
  address maps do not provide.
- Neighborhood-to-house-to-Dossier bridge is not implemented. Current address
  Dossier entry starts from Locatieserver lookup/VBO id, not from a building
  clicked in a recommendation map.
- Current 3D support is Dossier/address-centered. PRD selected-neighborhood
  buildings for match-first must render as neighborhood-scoped 2D footprints on
  the 2D basemap, and must not reuse any pattern that fetches broad/national 3D
  or building-footprint data.
- The 2026-05-22 PRD update clarifies that selected-neighborhood detail should
  show all available footprints inside the selected neighborhood or current
  selected-neighborhood viewport, progressively loaded with honest partial
  state copy. The current implementation evidence proves scoped/non-national
  requests and boundary clipping, but not all-available paging/completion
  metadata yet.
- The 2026-05-22 BAG semantic update clarifies that selected-neighborhood
  footprints are BAG `pand` records, while house-candidate semantics come from
  linked `verblijfsobject.gebruiksdoel`. The current selected-neighborhood path
  now prefers PDOK BAG OGC v2 `pand` geometry because it includes
  `gebruiksdoel`, `status`, and `aantal_verblijfsobjecten`; 3DBAG remains a
  fallback/richer-detail source and does not by itself provide parsed
  use-purpose metadata in the current model.
- The 2026-05-21 PRD update adds optional additional-preference intake. The
  current architecture has no typed custom-preference registry, extraction
  endpoint, review UI, or tests proving LLM extraction cannot score, rank,
  exclude, infer protected traits, or persist raw free-text analytics content.
- Match data is seeded/mock for current scoring. Until real labels and
  validation data exist, UI copy and API contracts must keep deterministic
  scoring, confidence, limitations, and mock/source metadata explicit.
- Older `/api/match/quiz` and match report/listing/alert surfaces coexist with
  the newer session-based match-first flow. Route and state ownership must avoid
  mixing old synchronous quiz assumptions into the PRD session/job lifecycle.
- Dossier return context is partially implemented but currently returns to
  placeholders. The live results map must hydrate session id, selected
  neighborhood, map center/zoom, list state, language, selected result/house,
  and refresh behavior before Dossier round trips are complete.
- All new copy must continue through `en.json` and `nl.json`; backend warning
  codes should remain stable keys that the frontend translates.
- Reduced-motion support exists in parts of the app, but any new hero, progress,
  checkmark, map fly-to, or 3D behavior must add explicit reduced-motion and
  non-map/list fallbacks.
- Unknown: final map provider, polygon/amenity data source, building-to-address
  resolver, and production hosting rewrites for clean match-first URLs are not
  specified by current code.
