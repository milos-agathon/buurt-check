# AGENTS.md -- buurt-check

Mobile-first web app for Dutch home seekers. The current product contract is the
Buurt Check match-first UI revamp: users start by matching with neighborhoods,
then inspect houses, then open the existing address-level Dossier.

## Required Reading Before Implementation

Before planning or implementing match-first work, read these files in this
order:

1. `docs/prd.md`
2. `docs/ai/latest_handoff.md`
3. `.specify/memory/constitution.md`
4. `docs/qa/match_first_revamp_traceability.md`

If a file is missing, stop and document that blocker before implementing. The
PRD is the product contract. SpecKit artifacts, task lists, and generated plans
must serve the PRD rather than redefine it.

## Repository Setup

```bash
# Root / frontend dependencies
npm ci
npm --prefix frontend ci

# Backend dependencies
cd backend && python -m pip install -e ".[dev]"
```

Useful local startup commands:

```bash
# Full local reset/check/start helper on Windows
.\scripts\dev-start.ps1

# Backend
cd backend && uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm run dev
```

## Discovered Commands

Root scripts:

```bash
npm run build
npm run landing:build
npm run landing:serve
npm run landing:test:e2e
npm run landing:check
npm run billing:preflight
npm run billing:smoke
```

Backend:

```bash
cd backend && ruff check .
cd backend && pytest -x -q -m "not live"
cd backend && pytest -x -q
cd backend && pytest -x -q -m "visual"
cd backend && pytest -x -q -m "benchmark"
```

Frontend:

```bash
cd frontend && npm run dev
cd frontend && npm run build
cd frontend && npm run lint
cd frontend && npm run test
cd frontend && npm run test:a11y
cd frontend && npm run test:perf
cd frontend && npm run test:e2e
cd frontend && npm run test:perf:e2e
cd frontend && npm run test:visual
```

Before committing, run the relevant gates for touched areas. For broad revamp
work this usually means backend `ruff check` plus targeted/non-live pytest, and
frontend `npm run build` plus targeted Vitest/Playwright.

## Current Stack

| Layer | Stack |
| --- | --- |
| Backend | Python 3.12 target, FastAPI, httpx async, Pydantic v2, pydantic-settings, Redis, SQLite/Turso/libsql, fpdf2 |
| Frontend | React 19, TypeScript 5.9, Vite 7, Framer Motion, Three.js, SunCalc, i18next |
| Styling | Plain CSS with Polar Frost design tokens. No Tailwind. No CSS-in-JS. |
| Testing | pytest + pytest-asyncio, Vitest 4 + Testing Library, Playwright |
| Linting | ruff for backend, ESLint/frontend build for frontend |

## Project Structure

```text
backend/
  app/api/              FastAPI routers
  app/services/         Business logic and external-data integrations
  app/services/match/   Match-first/session/scoring/job services
  app/models/           Pydantic response/request models
  app/cache/            Redis cache with circuit breaker
  app/config.py         pydantic-settings, BUURT_* env prefix
  tests/                pytest suites

frontend/
  src/App.tsx           SPA orchestration and custom hash routing
  src/components/       UI components
  src/components/match-first/
                         Match-first revamp screens
  src/services/         Typed fetch, storage, analytics helpers
  src/i18n/             en.json + nl.json
  src/styles/           tokens.css and shared CSS
  src/types/            TypeScript contracts

docs/
  prd.md                Product contract for match-first revamp
  ai/                   Agent handoff and implementation rules
  qa/                   Traceability and punch-list evidence

specs/
  002-match-first-revamp/
                         SpecKit plan, spec, contracts, tasks
```

## Non-Negotiable Match-First Product Rules

- The PRD is the product contract. When docs or generated tasks conflict with
  `docs/prd.md`, preserve the PRD and document the conflict.
- Primary flow is sacred: landing hero -> survey intro -> one-question guided
  intake -> optional additional-preferences prompt -> review -> backend
  matching progress -> animated checkmark success -> Netherlands results map ->
  neighborhood 2D detail -> house click -> existing Dossier -> back to match
  map.
- Search must remain secondary on the landing screen. It must not compete with
  Match as an equal CTA, card, tab, mode choice, or visual destination.
- The guided intake is one-question-at-a-time. Show one question or one
  optional additional-preferences prompt, one progress indicator, and a back
  path after the first question. Do not add dashboards, charts, feature grids,
  ads, pricing blocks, or unrelated content to onboarding.
- Conversational intake may use an LLM only to extract user-stated preferences
  into a strict schema, ask bounded follow-ups, and classify preferences through
  a typed registry as scoreable, map-context-only, saved-unsupported,
  disallowed, or needs-clarification. LLM output must be reviewed by the user
  before matching and must not score or rank neighborhoods.
- All user-facing text must use translation keys in both Dutch and English. Do
  not hard-code English or Dutch strings in components, services, route labels,
  validation messages, progress states, fallbacks, or analytics display labels.
- Preserve the existing Dossier. Do not casually rewrite Dossier modules,
  risk-card behavior, entitlement, checkout recovery, or export contracts. Add
  route context and a persistent "Back to match map" action only as needed.
- Selected-neighborhood buildings must render as 2D BAG `pand` footprints on
  the 2D basemap, scoped only to the selected neighborhood or the current
  selected-neighborhood viewport used for progressive paging. House semantics
  come from linked `verblijfsobject.gebruiksdoel`, not from the `pand`
  footprint itself. Prioritize pands whose `gebruiksdoel` contains
  `woonfunctie`; keep non-residential-only pands, `overige gebruiksfunctie`,
  and `aantal_verblijfsobjecten = 0` pands visible as deferred/greyed
  footprints rather than permanently filtering them out. The intended product
  behavior is to show every available footprint inside the selected
  neighborhood where source data exists, not an unlabeled representative
  sample. If only part of the selected neighborhood is loaded, label the
  partial state honestly. Never load national building footprints or national
  3D buildings. Selected-neighborhood amenity overlays
  must render every returned no-paid amenity point marker from the backend
  response, with type-specific shapes plus dedicated amenity emojis, and a
  matching right-side Relevant amenities marker legend/filter panel that shows
  those same emojis. Provide reduced-motion and non-map list fallbacks.
- Predictive claims require real labels and validation evidence. Without them,
  present deterministic or semi-deterministic weighted scoring as a data-backed
  fit score with reason codes, confidence, tradeoffs, sources, and limitations.
- Do not promise perfect fit, safety, happiness, investment certainty, future
  value, guaranteed affordability, or guaranteed outcomes.
- Every implementation phase must run relevant tests and update
  `docs/ai/latest_handoff.md` and
  `docs/qa/match_first_revamp_traceability.md` with completed work, commands
  run, residual risks, and next steps.

## Architecture Decisions

- **State management**: App-level `useState` and custom hash routing in
  `App.tsx`. Do not add Redux, Zustand, React Query, or React Router for this
  revamp.
- **Backend shape**: Keep route handlers thin. Services own business logic.
  Match-first endpoints live under `/api/match` unless a plan explicitly
  justifies otherwise.
- **Matching**: Use deterministic weighted scoring until real labels and
  validation data exist. LLMs may explain structured results but must not create
  or modify scores, eligibility, confidence, hard-filter outcomes, or source
  metadata. LLMs may support conversational intake only as structured
  extraction into the backend preference registry.
- **Persistence**: Use existing SQLite/Turso/libsql patterns. Store stable keys,
  raw answer references, vector versions, job state, result state, and return
  context where required.
- **Config**: All external URLs and provider settings belong in backend config.
  Do not hardcode external URLs in frontend services.
- **Coordinates**: EPSG:28992 (RD New) is canonical. WGS84 values are display
  coordinates and must be named explicitly.
- **Caching**: Never cache empty/error responses. Cache keys must include every
  parameter that affects the response.

## Dossier And Risk Card Contract

- The on-screen Dossier viewer remains free.
- `quick_brief` is free.
- `full_dossier` requires server-side buyer/address entitlement before first
  download.
- Entitlement decisions are scoped to the anonymous buyer and address
  (`buyer_key + vbo_id`), not to `report_id` alone.
- Frontend risk tiles render only Noise, Air, and Climate. Sunlight remains
  paid-report/PDF evidence and must not become a frontend risk tile or detail
  view.
- Every frontend risk card needs score/severity, plain-language meaning,
  viewing questions, and source/date.

## Development Conventions

- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`.
- Branches: `main` is stable; use `feat/<description>` for feature work.
- Use `httpx` async, not `requests`.
- Use Pydantic v2 `Field(default_factory=list)` for list defaults.
- Keep match-first selected-neighborhood buildings as 2D footprints. For
  existing Dossier 3D surfaces, use plain Three.js only and do not add
  `react-three-fiber` or `drei`.
- Use plain CSS and tokens. Do not add Tailwind, CSS modules, or styled
  components.
- Avoid CSS `!important` on canvas dimensions because it breaks
  `renderer.setSize()`.
- Use `--color-accent-text` / `--color-accent-hover` for teal text on light
  backgrounds, not `--color-accent`.
- Warning/error codes from backend should be stable keys rendered through i18n
  on the frontend.

## Reference Docs

- `docs/prd.md` -- product contract
- `docs/ai/implementation_rules.md` -- concise non-negotiable implementation rules
- `docs/ai/latest_handoff.md` -- current phase, recent changes, commands, risks
- `.specify/memory/constitution.md` -- governance rules
- `docs/qa/match_first_revamp_traceability.md` -- phase closure and acceptance evidence
- `docs/context/current_architecture.md` -- current architecture constraints
- `docs/design-prd.md`, `docs/design-spec.md`, `docs/palette.md`,
  `docs/ui-principles.md` -- design references
- `backend/CLAUDE.md`, `frontend/CLAUDE.md` -- area-specific conventions

<!-- SPECKIT START -->
For additional context about the Buurt Check Revamp technical approach,
architecture, data model, contracts, testing strategy, and implementation
phases, read `specs/002-match-first-revamp/plan.md`. For governing rules,
read `.specify/memory/constitution.md`.
<!-- SPECKIT END -->
