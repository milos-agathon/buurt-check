# Current Architecture Memo

Source inspected for the match-first revamp: `docs/prd.md`. The requested
`docs/prd/buurt_check_match_first_ui_revamp_prd.md` path is not present in
this checkout.

## Product Direction

The PRD changes Buurt Check from an address-search-first app into a
match-first, map-first neighborhood discovery flow. Address search should remain
available, but as a secondary path or as the final house-selection bridge into
the existing Dossier.

Current implementation already has a match foundation, but it is not the PRD
flow yet. The main gaps are: first screen still defaults to search, the match
quiz is a multi-section form, match runs are synchronous request/response calls,
the map is a projected marker canvas rather than an interactive Netherlands map,
and Dossier has no persistent back-to-match-map context.

## Package And Runtime Shape

- Root `package.json` is a thin workspace shell for landing builds, Android TWA,
  iOS Capacitor, billing preflights, and delegating frontend build/install.
- Root `package-lock.json` is lockfile v3 and mostly covers Capacitor/Bubblewrap
  tooling.
- `frontend/package.json` owns the web app: React, Vite, PWA, tests, Playwright,
  and UI/runtime dependencies.
- `frontend/package-lock.json` is lockfile v3. Resolved key versions include
  React 19.2.4, React DOM 19.2.4, Vite 7.2.4, Vitest 4.0.18, Playwright 1.58.1,
  Three 0.182.0, Framer Motion 12.34.0, and i18next 25.8.1.
- Backend packaging is in `backend/pyproject.toml`; CI uses Python 3.12 even
  though the project metadata allows `>=3.11`.

## Frontend Architecture

- The app is a single React SPA in `frontend/src/App.tsx` with app-level
  `useState` and a custom hash router. There is no React Router.
- Screen state is the `activeScreen` union: search, dossier, saved, compare,
  settings, prebid shared/pack screens, and multiple match screens.
- Current canonical app routes are hash routes such as `#/search`,
  `#/address/{vbo_id}`, `#/briefing`, `#/match`, `#/match/quiz`,
  `#/match/report`, `#/match/map`, and `#/match/saved`.
- Vercel rewrites only cover `/search`, `/saved`, `/compare`, `/settings`, and
  `/address/:path*`; direct clean URLs for new PRD routes like
  `/match/:sessionId/results` or `/dossier/:addressId` are not currently wired.
- `App.tsx` also orchestrates address lookup, report creation, entitlement,
  prebid briefing, progressive Dossier loading, match API calls, analytics, and
  checkout recovery. It is the highest-risk integration surface.

## Current Search UI

- `AddressSearch` is the current primary entry screen.
- It uses a debounced combobox against `/api/address/suggest`, then passes the
  selected `AddressSuggestion` to `App.tsx`.
- It includes first-visit evidence cards, recent searches, returning-user saved
  property prompts, keyboard navigation, pointer selection, abort handling, and
  i18n copy.
- Selecting an address triggers the large `handleAddressSelect` pipeline in
  `App.tsx`: lookup, short report creation, entitlement check, prebid briefing,
  building facts, risk cards, comparisons, viewing questions, livability,
  neighborhood stats, and deferred 3D loading.

## Current Match UI

- Match components live under `frontend/src/components/match`.
- `MatchLanding` is reachable at `#/match` and has a language selector, a
  primary quiz CTA, and a secondary compare-known-neighborhoods CTA. This still
  presents multiple choices and is not the PRD's single dominant entry.
- `MatchQuiz` is a single long form with multiple fieldsets. It does not show
  one question at a time, does not expose a progress bar/back-step flow, and
  does not persist survey answers as a resumable session.
- The current frontend submits `/api/match/quiz`, then derives requests for
  recommendations, reports, comparison, similar neighborhoods, map, listings,
  alerts, feedback, save/share/export.
- `MatchMap` renders markers by projecting lon/lat into percentages within API
  bounds. It is not pan/zoom capable, has no basemap, has no polygon layer, and
  has no selected-neighborhood 3D house layer.

## Current Dossier Interface

- The interactive Dossier remains an address-level experience, mounted from the
  `dossier` screen in `App.tsx` and wrapped by `DossierSheet`.
- It is composed from many cards and lazy components: `BuildingFootprintMap`,
  `BuildingFactsCard`, `AttentionSummary`, `RiskTilesGrid`, `RiskDetailView`,
  `LivabilityCard`, `NeighborhoodViewer3D`, `ShadowTimeSlider`,
  `NeighborhoodStatsCard`, `ViewingChecklist`, `ActionBar`, and
  `ExportBottomSheet`.
- The frontend renders only Noise, Air, and Climate risk tiles; sunlight remains
  PDF/export evidence and client-computed background state.
- Dossier navigation currently supports jump-to-house/neighborhood/checklist,
  back-to-search, saved/compare, and export actions. It does not carry a
  match-session return target or "Back to match map" action.

## Maps And 3D

- There is no Leaflet, Mapbox, or MapLibre dependency in the current frontend.
- `BuildingFootprintMap` uses a same-origin backend WMS proxy
  `/api/address/wms-tile` for PDOK Luchtfoto imagery, with SVG footprint overlay
  and SVG fallback.
- `NeighborhoodViewer3D` is plain Three.js with `WebGLRenderer`,
  `OrbitControls`, merged geometry, LoD/fallback building geometry, orthophoto
  ground texture, Web Workers for sunlight/SVF, and mobile/device performance
  guards.
- Backend 3D data comes through `/api/address/{vbo_id}/building3d` and
  `/api/address/{vbo_id}/neighborhood3d`, backed by 3DBAG services.
- The PRD's results map and neighborhood detail map will need a real map layer
  strategy. Reusing current projected-marker code is insufficient for pan/zoom,
  Netherlands-level exploration, polygons, neighborhood selection, or amenity
  layers.

## I18n And Theming

- i18n is initialized in `frontend/src/i18n/index.ts` with bundled `en.json` and
  `nl.json`, `supportedLngs: ['en', 'nl']`, browser language detection via
  localStorage/html tag, and Dutch fallback.
- Match strings already exist under `match.*` keys in both locales.
- The revamp should continue using translation keys for every new screen, route
  label, warning, progress state, and map fallback.
- Styling is plain CSS with tokens in `frontend/src/styles/tokens.css`; no
  Tailwind or CSS-in-JS is in use.

## Backend Architecture

- FastAPI app setup is in `backend/app/main.py`; routers are assembled under
  `/api` in `backend/app/api/router.py`.
- Middleware includes CORS, GZip, SlowAPI rate limiting, Sentry setup, request
  logging, and startup database initialization.
- Address/Dossier endpoints are mostly in `backend/app/api/address.py`: suggest,
  lookup, WMS tile proxy, building, building3d, neighborhood3d, risks,
  risk-comparisons, neighborhood stats, viewing questions, tier-b, livability,
  property warnings, sunlight submission, prebid briefing/pack/share/email, and
  export.
- Reports and buyer-bound entitlement live under `/api/reports`; billing and
  app-store verification live under `/api/billing`.
- Match endpoints are under `/api/match`: quiz, recommendations, similar, map,
  compare, reports, shared report, listings, alerts, feedback, saved
  neighborhoods, and report export.
- Admin match health is under `/api/admin/match/health`.

## Current Match Backend

- The match backend is deterministic and seed-backed today.
- `/api/match/quiz` converts one submitted payload into a preference vector via
  `services/match/preferences.py` and persona overlays via
  `services/match/personas.py`.
- Recommendations load `backend/app/data/match_seed/neighborhoods.json` through
  `SeedMockImporter`; source health explicitly reports mock-only seed data.
- `services/match/scoring.py` computes deterministic 0-100 fit scores from
  feature vectors, hard filters, commute/budget/availability components,
  confidence, missing/stale features, and tradeoff penalties.
- There is a database schema for match sessions, preference vectors, reports,
  alerts, saved neighborhoods, feedback, source health, exports, and analytics,
  but the current API does not expose the PRD's session/status/results job flow.
- There is no Celery/RQ/ARQ worker. Long-running or staged match jobs would need
  either a lightweight in-process job pattern, polling over persisted state, or a
  new worker/queue decision.

## Services, Scripts, And Data

- Backend external-data services include Locatieserver, BAG, CBS,
  Leefbaarometer, RIVM/noise/air/climate risk cards, PDOK/BRO foundation risk,
  WMS tiles, 3DBAG, weather, source orchestration, prebid briefing/pack, PDF
  export, billing providers, metrics, and match modules.
- Redis caching is used via `backend/app/cache/redis.py` with a circuit breaker;
  conventions prohibit caching empty/error responses and require full parameter
  keys.
- Persistence uses SQLite locally and Turso/libsql when configured. The DB
  bootstrap creates report, prebid, entitlement, and match tables.
- Scripts cover dev startup/reset, Spec Kit orchestration, landing build/serve,
  mobile wrapper sync/build, billing checks, 3D benchmarks/probes, PDF baseline
  updates, and backend verification utilities.

## Tests And CI

- Current test footprint inspected: 99 backend pytest files with about 755 test
  functions; 143 frontend Vitest/Playwright spec files with about 1,049 test
  cases.
- CI runs frontend `npm ci`, `npm run build`, and `npm run test` on Node 22.
- CI runs backend install, `ruff check .`, and pytest excluding live, visual,
  and benchmark markers on Python 3.12.
- CI also has landing Playwright smoke, backend visual regression with TeX, and
  backend benchmark jobs.
- Existing targeted tests already cover address search behavior, match API,
  match scoring, map, comparison, reports, listings, alerts, saved state,
  feedback, i18n, accessibility, and key E2E flows.

## Constraints For The Match-First Revamp

- Preserve the existing Dossier contract and route into it after address/house
  selection; do not replace the Dossier as part of initial route cleanup.
- Keep search technically available, but demote it in the first screen per PRD.
- Do not render sunlight as a frontend risk tile; keep the current Noise, Air,
  Climate risk-card surface.
- Keep all user-facing copy in EN/NL translation files.
- Use plain CSS and existing design tokens.
- Use plain Three.js where 3D is needed; do not add react-three-fiber/drei.
- Any clean URL route expansion must update Vercel rewrites and the custom route
  parser together.
- Any backend matching progress UI must be backed by real persisted or pollable
  state; avoid fake progress that diverges from backend completion.

## Risky Integration Points

- `App.tsx` is already responsible for routing, Dossier orchestration,
  entitlement, checkout recovery, match state, analytics, and prebid state.
  Adding the PRD flow directly there will increase coupling unless route/session
  state is carefully isolated.
- The current match API has no session resource, answer patching, run endpoint,
  status endpoint, or async job lifecycle. The PRD route model cannot be mapped
  cleanly onto the current synchronous endpoints without backend contract work.
- The current `MatchQuiz` payload shape is close to a preference vector, but the
  UI is not one-question-at-a-time and does not preserve raw answers step by
  step. Retrofitting persistence will affect frontend state, backend models, and
  tests.
- The current `MatchMap` is not a map library. A production results map needs a
  deliberate dependency or custom canvas/WebGL plan, plus basemap/licensing,
  polygon data, accessibility alternatives, and mobile performance budgets.
- Neighborhood-to-house selection is not implemented. Existing Dossier entry
  starts from a Locatieserver address suggestion, not from a building clicked on
  a neighborhood map. A new bridge must resolve building/parcel/house selection
  to a reliable address or fallback manual search.
- Dossier currently assumes return-to-search as the main escape hatch. Match
  context preservation needs session ID, selected neighborhood, route state, and
  back navigation that survive refresh/checkout.
- Match data is seed/mock today. PRD claims about model fitting, predictive
  power, confidence, and nationwide results must remain framed as deterministic
  scoring until real feature data and validation targets exist.
- A live animated hero map could compete with Dossier's existing Three.js and
  worker budgets. The PRD's lightweight/pre-rendered hero recommendation is a
  safer first implementation path.
