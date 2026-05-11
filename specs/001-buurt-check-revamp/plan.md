# Implementation Plan: Buurt Check Revamp

**Branch**: `001-buurt-check-revamp` | **Date**: 2026-05-11 | **Spec**: `specs/001-buurt-check-revamp/spec.md`
**Input**: Feature specification from `specs/001-buurt-check-revamp/spec.md`, derived from `docs/prd.md`

## Summary

Build Buurt Check Revamp as a neighborhood-first discovery flow on the existing FastAPI + React repository. The implementation adds a new bounded "match" surface alongside the current address dossier: quiz input becomes a deterministic preference vector; provider-backed neighborhood metrics become normalized feature vectors; a scoring engine ranks and categorizes neighborhoods; AI only turns structured evidence into bilingual report prose; the UI exposes landing, quiz, report, comparison, map, listings, save/share/export, alerts, feedback, and admin monitoring.

The first implementation uses seeded/mock data and provider interfaces for configurable MVP geography: Amsterdam, Utrecht, Rotterdam, The Hague, Eindhoven, and commuter-style example neighborhoods. Real official data and licensed listing providers plug in later through adapter contracts. Large changes are split by FR dependency so deterministic domain logic, provenance, and tests land before AI, listing, alert, and admin layers.

## Architecture Overview

### Module Boundaries

```text
frontend/src/
├── App.tsx                         # keeps app-level useState/activeScreen routing
├── components/match/               # landing, quiz, report, comparison, map, listings, alerts
├── services/matchApi.ts            # typed fetch wrapper for /api/match/*
├── services/matchStorage.ts        # local/session fallback for saved neighborhoods/reports
├── services/matchAnalytics.ts      # product event sink wrapper
├── types/match.ts                  # TS interfaces mirroring backend models
├── i18n/en.json, nl.json           # all new copy keys
└── styles/tokens.css               # existing Polar Frost tokens, no CSS-in-JS/Tailwind

backend/app/
├── api/match.py                    # quiz, rankings, reports, comparison, map, listings, alerts
├── api/admin_match.py              # internal data-quality dashboard endpoints
├── models/match.py                 # Pydantic v2 request/response contracts
├── services/match/
│   ├── quiz.py                     # quiz validation and profile normalization
│   ├── preferences.py              # preference vector and hard filters
│   ├── personas.py                 # persona overlays
│   ├── feature_vectors.py          # neighborhood feature vector assembly
│   ├── scoring.py                  # deterministic fit/confidence/category scoring
│   ├── recommendations.py          # top/surprising/stretch/reconsider categories
│   ├── similarity.py               # similar-neighborhood search
│   ├── evidence.py                 # evidence ledger and source coverage assembly
│   ├── ai_report.py                # prompt construction, schemas, validation, fallback
│   ├── reports.py                  # save/share/export orchestration
│   ├── comparison.py               # curated side-by-side comparison model
│   ├── listings.py                 # listing adapter orchestration
│   ├── alerts.py                   # alert rules and mock dispatcher integration
│   ├── feedback.py                 # love/maybe/not-for-me event handling
│   ├── instrumentation.py          # stable product events and mock sink
│   └── admin.py                    # source health, missing data, anomalies
├── services/match/providers/
│   ├── official.py                 # OfficialDataProvider Protocol
│   ├── listings.py                 # ListingProvider Protocol + MockListingProvider
│   ├── notifications.py            # NotificationProvider Protocol + MockNotificationProvider
│   └── seed.py                     # SeedMockImporter
└── db.py                           # extends existing SQLite/Turso bootstrap schema
```

### Separation Rules

- UI components render typed API responses and local/session fallback state. They do not calculate authoritative scores.
- API/routes validate payloads, call service orchestrators, and return Pydantic response models. They do not contain scoring formulas or provider-specific logic.
- Domain logic is pure where practical: preference vectors, personas, scoring, categories, confidence, similarity, alert eligibility, and report validation are independently unit-testable.
- Data providers implement protocols. Seed/mock providers are first-class and explicitly mark source type, confidence, and mock status.
- Deterministic scoring is independent from AI report generation. AI receives only structured `ReportInput`, never raw unconstrained context, and cannot change scores, categories, eligibility, or confidence.
- Report save/share/export uses the existing buyer/session-oriented persistence style and keeps `report_id` as a snapshot reference, not a bearer entitlement token.
- Notifications start with a mock dispatcher that records intended sends. Real email/push providers plug in behind `NotificationProvider`.
- Admin monitoring is read-only for MVP and reports source health, stale/missing metrics, mock coverage, guardrail blocks, alert failures, and scoring anomalies.

## Technical Context

**Language/Version**: Backend Python package requires `>=3.11` and project guidance targets Python 3.12; frontend TypeScript 5.9.3 with strict build.
**Primary Dependencies**: FastAPI, httpx async, Pydantic v2, pydantic-settings, Redis cache, aiosqlite/libsql, fpdf2/Jinja2; React 19.2 in package metadata, Vite 7.2, Framer Motion, Three.js, i18next, Testing Library, Vitest 4, Playwright.
**Storage**: Existing SQLite/Turso abstraction in `backend/app/db.py`; Redis for cache; browser local/session storage fallback for unauthenticated saves until server sync exists.
**Testing**: pytest + pytest-asyncio for backend, ruff for lint; Vitest + Testing Library and TypeScript build for frontend; Playwright for E2E; existing accessibility tests with jest-axe.
**Target Platform**: Web app with FastAPI backend and Vite frontend, mobile-first responsive UI.
**Project Type**: Full-stack web application.
**Performance Goals**: Quiz submission to deterministic ranking under 2s with seeded data; report viewer first render under 3s after ranking response; map remains interactive at MVP seed scale; AI report generation async/optional with deterministic fallback available immediately.
**Constraints**: No scraping; no hard-coded external URLs outside config; no LLM-created scores; every metric used in ranking/report/comparison/map/listings/alerts/admin has source metadata; all user-facing copy in EN/NL i18n; no Redux/Zustand/React Query.
**Scale/Scope**: FR1-FR14 umbrella, delivered in P0/P1 slices. MVP geography is configurable and seeded for five major city regions plus commuter-style examples, not full Netherlands production coverage.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Requirement | Status / Evidence |
|------|-------------|-------------------|
| PRD traceability | List the `docs/prd.md` FR1-FR14 IDs this feature implements, changes, or defers. | PASS: This plan covers FR1-FR14 with phases and matrix below. |
| Deterministic scoring | Identify scoring, confidence, persona, preference-vector, ranking, and alert logic. Confirm source of truth is structured logic, not LLM output. | PASS: `services/match/preferences.py`, `personas.py`, `scoring.py`, `recommendations.py`, `similarity.py`, and `alerts.py` own deterministic decisions. |
| Evidence and provenance | Identify official, commercial/listing, mock, derived, and missing data. Define source/freshness/confidence treatment. | PASS: `MetricSource`, `NeighborhoodMetric`, `DataSourceRun`, and `EvidenceItem` model source type, timestamp, geography level, confidence, and limitations. |
| Responsible AI/fairness | Confirm no scoring uses protected traits and report copy avoids unsupported safety/crime/social-group certainty. | PASS: Fairness guardrails in report schema, validation, AI eval fixtures, and scoring feature allowlist. |
| Licensed listings | For FR9/listing work, confirm adapter boundary, licensed-provider configuration, and labeled mock/outbound/unavailable fallback. No scraping. | PASS: `ListingProvider` protocol and `MockListingProvider`; no scraping path. |
| Bilingual/accessibility | Identify strings and interaction states. Confirm Dutch/English, keyboard access, responsiveness, and non-color-only status cues. | PASS: All new UI copy through `frontend/src/i18n`; core flows tested by i18n and a11y smoke suites. |
| Test-first critical logic | List required tests for scoring, confidence, personas, vectors, guardrails, listing fallbacks, provenance, alerts, fairness. | PASS: Testing strategy enumerates unit, integration, E2E, AI eval, and a11y tests. |
| Product tone | Confirm warm, personal, playful copy is backed by transparent data explanations, tradeoffs, and confidence. | PASS: AI output schema requires evidence-linked sections and limitations; UI cards show source/freshness. |
| Operational visibility | Identify admin monitoring/logging/diagnostics. | PASS: Admin module and observability plan cover freshness, source failures, mock usage, anomalies, guardrails, alerts, and success metrics. |
| No thin AI wrapper | Explain defensible value. | PASS: Data pipelines, feature engineering, scoring, confidence, explainability, UX, alerts, and adapter contracts are independent of AI prose. |

**Post-Design Re-check**: PASS. `research.md`, `data-model.md`, `contracts/match-api.md`, and `quickstart.md` preserve the same boundaries and do not introduce constitution violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-buurt-check-revamp/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── match-api.md
└── tasks.md                    # created later by /speckit-tasks
```

### Source Code (planned)

```text
backend/
├── app/
│   ├── api/
│   │   ├── match.py
│   │   └── admin_match.py
│   ├── models/
│   │   └── match.py
│   ├── services/
│   │   └── match/
│   │       ├── admin.py
│   │       ├── ai_report.py
│   │       ├── alerts.py
│   │       ├── comparison.py
│   │       ├── evidence.py
│   │       ├── feature_vectors.py
│   │       ├── feedback.py
│   │       ├── instrumentation.py
│   │       ├── listings.py
│   │       ├── personas.py
│   │       ├── preferences.py
│   │       ├── quiz.py
│   │       ├── recommendations.py
│   │       ├── reports.py
│   │       ├── scoring.py
│   │       ├── similarity.py
│   │       └── providers/
│   └── data/
│       └── match_seed/
└── tests/
    ├── test_match_*.py
    ├── fixtures/match/
    └── evals/test_ai_report_*.py

frontend/
├── src/
│   ├── components/
│   │   └── match/
│   ├── services/
│   │   ├── matchApi.ts
│   │   ├── matchAnalytics.ts
│   │   └── matchStorage.ts
│   ├── types/
│   │   └── match.ts
│   ├── i18n/
│   │   ├── en.json
│   │   └── nl.json
│   └── test/
│       └── match-*.test.tsx
└── tests/e2e/
    └── match-*.spec.ts
```

**Structure Decision**: Keep the existing two-project layout. Add a new `/api/match` router rather than expanding the already-large `api/address.py`, while continuing to include routes through `api/router.py`. Use the existing SQLite/Turso bootstrap, Pydantic model style, typed frontend service layer, i18n files, and plain CSS tokens.

## Data Model

See `specs/001-buurt-check-revamp/data-model.md` for full table/entity details. Core persistence groups:

- Geography and metrics: `neighborhoods`, `neighborhood_metrics`, `metric_sources`, `normalized_feature_vectors`, `data_import_runs`.
- User/session state: `anonymous_sessions`, future-linkable `user_profiles`, `preference_vectors`, `saved_neighborhoods`.
- Recommendations and reports: `recommendations`, `reports`, `report_sections`, `share_tokens`, `exports`.
- Listings and alerts: `listings`, `listing_provider_runs`, `alerts`, `notification_dispatch_records`.
- Feedback/admin/observability: `feedback_events`, `analytics_events`, `guardrail_events`, `source_health_snapshots`, `scoring_anomalies`.

## API and Interface Plan

See `specs/001-buurt-check-revamp/contracts/match-api.md` for endpoint and provider contracts. Planned route groups:

- `POST /api/match/quiz` validates raw quiz answers and returns a profile plus preference vector.
- `POST /api/match/recommendations` returns categorized deterministic rankings.
- `POST /api/match/reports` assembles evidence, generates/validates AI or fallback narrative, and persists a report snapshot.
- `GET /api/match/reports/{report_id}` returns a saved report when session/share rules allow.
- `POST /api/match/reports/{report_id}/share` creates a share reference.
- `POST /api/match/reports/{report_id}/export` exports browser/server-compatible report content.
- `POST /api/match/compare` returns side-by-side comparison for at least three neighborhoods.
- `POST /api/match/similar` returns similar-neighborhood alternatives with reasons.
- `GET /api/match/map` returns map-ready scored neighborhoods inside configured MVP region bounds.
- `GET /api/match/listings` returns licensed, mock, user-provided, outbound, or unavailable listing surface data.
- `POST /api/match/alerts` creates an alert rule and records mock/real dispatch intent.
- `POST /api/match/feedback` records love/maybe/not-for-me and returns reranking hints.
- `GET /api/admin/match/health` returns source freshness, missing data, provider status, guardrails, alert failures, and anomalies.

Provider interfaces:

- `OfficialDataProvider.fetch_metrics(region_config) -> list[NeighborhoodMetricRecord]`
- `ListingProvider.fetch_listings(criteria) -> ListingProviderResult`
- `NotificationProvider.dispatch(alert, listing_matches) -> NotificationDispatchRecord`
- `ReportGenerator.generate(input) -> ReportOutput`
- `InstrumentationSink.record(event) -> None`

## UI Route Plan

The existing SPA keeps `activeScreen` state in `App.tsx`; this feature adds match-oriented screen states rather than introducing a routing library:

- `matchLanding`: bilingual promise, language control, CTAs for quiz and known-neighborhood comparison.
- `matchQuiz`: 3-6 minute mobile-first wizard for intent, budget, household, anchors, commute/radius, must/nice/avoid, property type, and lifestyle priorities.
- `matchLoading`: deterministic scoring progress, source coverage status, graceful AI fallback messaging.
- `matchReport`: Woonkompas/Buurt Match report with profile summary, top matches, surprising alternatives, stretch areas, reconsider areas, tradeoffs, sources, confidence, and suggested alerts.
- `matchComparison`: at least three neighborhoods side by side with curated 5-8 indicators per section.
- `matchMap`: recommendation map with score/category/confidence filters and unsupported-region states.
- `matchListings`: listing availability module with licensed/mock/unavailable status, buy/rent separation, and listing clicks.
- `matchSaved`: saved neighborhoods/reports, share/export actions, local/session fallback state.
- `matchAlerts`: alert creation and management by neighborhood, budget, property type, and buy/rent intent.
- `matchFeedback`: embedded controls on recommendation cards plus undo where feasible.
- `matchAdmin`: internal dashboard for source health, stale/missing metrics, mock coverage, anomalies, guardrails, provider status, and alert failures.

All UI modules use existing Polar Frost tokens, no Tailwind/CSS-in-JS, keyboard-reachable controls, non-color-only badges, and EN/NL copy keys.

## AI Plan

### Structured Input Schema

`ReportInput` includes:

- `locale`: `en` or `nl`.
- `profile_summary`: sanitized quiz/profile fields.
- `preference_vector`: weights, hard filters, avoid signals, journey intent, persona overlays.
- `recommendations`: categorized ranks with scores, drivers, tradeoffs, confidence, freshness, and source coverage.
- `comparisons`: curated metric table for selected neighborhoods.
- `similar_neighborhoods`: similarity scores, shared drivers, differences, constraints.
- `listings_context`: provider mode, listing counts, source status, limitations; not raw scraped content.
- `evidence_items`: claim-safe facts with source name, source type, timestamp, geography level, confidence, limitations.
- `approved_limitations`: fixed disclaimer fragments.

### Structured Output Schema

`ReportOutput` includes:

- `profile_narrative`
- `recommendation_sections[]` with `neighborhood_id`, `category`, `why_it_fits`, `tradeoffs`, `watchouts`, `evidence_refs[]`
- `surprising_alternatives[]`
- `stretch_areas[]`
- `avoid_or_reconsider[]`
- `comparison_summary`
- `similar_neighborhood_summary`
- `listing_context_summary`
- `suggested_alerts[]`
- `next_steps[]`
- `limitations[]`
- `locale`
- `validation_status`

### Guardrail Validation

- Validate output with Pydantic before returning or saving.
- Reject unsupported numeric claims, missing `evidence_refs`, certainty language, protected/sensitive trait claims, legal/mortgage/tax/bid advice, and score/category changes.
- Record `guardrail_events` for blocked or rewritten claims.
- Use deterministic fallback sections if generation fails, schema validation fails, citations are missing, or policy/fairness validation blocks the output.

### Evidence-Only Prompt Construction

- Prompt receives only `ReportInput`, fixed tone rules, fixed limitations, and citation IDs.
- The model is instructed to explain scores but not calculate or modify scores.
- Missing metrics are represented as missing; prompt never asks the model to infer gaps from memory.
- Source references are citation IDs from `evidence_items`, not free-form URLs invented by the model.

### Bilingual Output

- Locale comes from quiz/user preference.
- Static UI strings stay in i18n JSON.
- AI/fallback report narrative is generated or rendered in the selected locale from the same deterministic inputs.
- Changing language regenerates narrative only; scores and categories stay stable.

### Deterministic Fallback

- Template-driven report uses score drivers, tradeoffs, confidence, freshness, and limitations.
- Fallback supports EN/NL and preserves the full report structure.
- AI unavailability does not block ranking, comparison, map, save/share/export, listings, alerts, or feedback.

## Testing Strategy

### Backend Unit Tests

- Preference vector: hard filters, weights, buy/rent/both, avoid signals, anchors, language.
- Persona detection: family, newcomer, city-escape, single/couple, buyer, renter, starter, multi-overlay confidence.
- Scoring engine: eligibility, weighted score, budget realism, commute feasibility, availability, penalties, confidence, deterministic ordering.
- Recommendation categories: top, surprising, stretch, avoid-or-reconsider, empty hard-filter relaxations.
- Similar-neighborhood search: vector distance, constraints, reasons, sparse-data confidence, protected-trait exclusion.
- Alert rules: criteria validation, duplicate handling, buy/rent separation, mock dispatcher records.
- Report validation: schema, evidence references, fallback path, blocked unsupported claims, bilingual output.
- Provider contracts: seed/mock import metadata, listing provider modes, notification provider failures.

### Backend Integration Tests

- Quiz-to-report happy path with seeded data.
- Missing/stale metric downgrades confidence and appears in report/admin.
- AI unavailable path returns deterministic fallback report.
- Listing provider unavailable/mock mode does not affect live scores unless explicitly marked.
- Feedback event changes reranking hints without violating source-backed explanations.
- Save/share/export preserves source/freshness/limitations.

### Frontend Tests

- Vitest/Testing Library for quiz validation, recommendation cards, comparison, map unavailable states, listings, alert creation, save/share/export, feedback controls, admin dashboard states.
- i18n parity tests for all new `match.*` keys in EN/NL.
- Accessibility smoke tests for landing, quiz, report, comparison, map, save/share, alert creation, feedback, and admin dashboard.
- Keyboard navigation tests for wizard controls, tabs, map/list filters, modals/bottom sheets, and share/export flows.

### E2E Tests

- Landing CTA and language selection.
- Full quiz-to-report flow.
- Report opens with top/surprising/stretch/reconsider categories.
- Compare at least three neighborhoods.
- Map shows scored neighborhoods and unsupported-region state.
- Save/share/export report.
- Alert creation from recommendation/listing/saved neighborhood.
- Feedback love/maybe/not-for-me and reranking indication.
- Admin dashboard healthy/degraded/mock/stale/anomaly states.

### AI Eval Fixtures

- Hallucination: missing metric must not become a claim.
- Source accuracy: every factual claim cites valid evidence IDs.
- Score-driver consistency: explanation matches deterministic top drivers.
- Repeated-run consistency: stable structured inputs produce equivalent report sections, claim coverage, and guardrail outcomes.
- Preference sensitivity: changed user preferences alter explanations only through deterministic scoring/report inputs, not model speculation.
- Bilingual output: EN/NL equivalent structure and no missing fallback keys.
- Fairness: no protected/sensitive demographic scoring, inference, or stigmatizing area language.

### Quality Gates

- Backend: `cd backend && ruff check .`, `cd backend && pytest -x -q -m "not live"`.
- Frontend: `cd frontend && npm run build`, `cd frontend && npm run test`.
- E2E for affected core flows: `cd frontend && npm run test:e2e -- tests/e2e/match-*.spec.ts`.

## Implementation Phases

### Phase 0 - Planning and Contracts

FR anchors: FR1-FR14.

- Finalize plan, research, data model, contracts, quickstart.
- Confirm no constitution gates are unresolved.
- Keep all implementation tasks small enough for review.

### Phase 1 - Domain Core with Seed Data (P0)

FR anchors: FR1, FR2, FR3, FR4, FR7.

- Add Pydantic and TypeScript match models.
- Add seed/mock region and metric importer.
- Implement preference quiz normalization, preference vector, persona overlays, feature vector assembly, deterministic scoring, confidence, recommendation categories, and similar-neighborhood search.
- Add backend unit tests before or alongside implementation.

### Phase 2 - API Orchestration and UI Quiz/Ranking (P0)

FR anchors: FR1, FR3, FR4, FR8, FR12.

- Add `/api/match/quiz`, `/recommendations`, `/similar`, `/map`.
- Add typed frontend service and match landing/quiz/loading/report shell.
- Render deterministic recommendations, source coverage, confidence, and freshness with EN/NL copy.
- Add integration tests and frontend tests for seeded happy path and degraded data states.

### Phase 3 - Evidence Assembly and AI/Fallback Report (P0)

FR anchors: FR4, FR5, FR11, FR12.

- Implement evidence ledger and structured report input/output schemas.
- Implement evidence-only AI prompt construction behind a report generator interface.
- Implement deterministic EN/NL fallback.
- Add report save/read snapshot model and initial export contract.
- Add AI eval fixtures and guardrail event recording.

### Phase 4 - Comparison and Map Completion (P0)

FR anchors: FR6, FR7, FR8.

- Build comparison service and UI for at least three neighborhoods.
- Build map-ready API contract and frontend map view using existing map conventions.
- Add unsupported geography and sparse-data states.
- Add E2E coverage for comparison/map.

### Phase 5 - Listings, Alerts, Save/Share/Export (P1)

FR anchors: FR9, FR10, FR11, FR13.

- Implement `ListingProvider` protocol and `MockListingProvider`.
- Implement listing module, listing click instrumentation, and compliant unavailable/outbound states.
- Implement alert rules, alert persistence, mock notification dispatch records.
- Implement saved neighborhoods/reports and share/export flows with local/session fallback and server snapshots.
- Implement feedback events and deterministic reranking hints.

### Phase 6 - Admin, Observability, and Product Metrics (P1)

FR anchors: FR14 plus success metrics.

- Add admin health endpoints and dashboard.
- Log data source failures, stale/missing metrics, mock coverage, guardrail blocks, scoring anomalies, listing provider health, and alert dispatch failures.
- Add product event sink and required event contracts: quiz start, quiz completion, report viewed, neighborhood saved, listing click, alert created, feedback submitted.
- Add admin E2E and observability tests.

### Phase 7 - Real Provider Adapters (P1/P2 Extension)

FR anchors: FR3, FR9, FR10, FR14.

- Replace selected seed providers with real official-data adapters incrementally.
- Add licensed listing provider implementation only after access is confirmed.
- Keep adapter results contract-compatible with seed/mock data and enforce provenance.

## Observability Plan

- Use structured backend logging for provider failures, data import runs, missing metrics, stale data, guardrail blocks, scoring anomalies, listing provider failures, and alert dispatch failures.
- Persist `data_import_runs`, `source_health_snapshots`, `scoring_anomalies`, `guardrail_events`, `notification_dispatch_records`, and `analytics_events`.
- Admin dashboard surfaces coverage by region, source type, confidence, freshness, mock-vs-real data, listing provider mode, and alert status.
- Frontend surfaces user-facing stale/missing/source confidence on recommendations, report sections, comparison, map details, listings, and exports.
- Track PRD success metrics through stable event names and privacy-safe payloads.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Listing data access is unavailable or expensive | Start with adapter interface, mock/unavailable/outbound states, and no scraping. Defer real provider to licensed access. |
| AI hallucination damages trust | Structured input/output, evidence IDs, guardrail validation, deterministic fallback, and AI eval fixtures. |
| Scoring becomes opaque or discriminatory | Feature allowlist, no protected traits, deterministic tests, source/freshness display, fairness fixtures. |
| Data is stale, sparse, or inconsistent | Confidence downgrades, missing/stale badges, admin source health, data import run history. |
| Diff becomes too large | Phase by FR dependency and module boundary; implement seed/domain logic before UI breadth and provider integrations. |
| Current address-dossier code is large and tightly coupled | Add `match` bounded context instead of modifying `api/address.py` and `App.tsx` beyond route/screen integration points. |
| Product feels like a dashboard or too playful | Curate 5-8 indicators, use Woonkompas tone only when paired with evidence, tradeoffs, and limitations. |
| No account model blocks save/share/alerts | Use local/session plus anonymous session IDs and future-linkable tables; avoid treating report IDs as bearer tokens. |

## PRD Traceability Matrix

| PRD FR | Planned modules | API/UI | Tests | Phase |
|--------|-----------------|--------|-------|-------|
| FR1 Preference quiz | `quiz.py`, `preferences.py`, `match` UI wizard | `POST /api/match/quiz`, `matchQuiz` | vector, validation, i18n, E2E quiz | Phase 1-2 |
| FR2 Persona detection | `personas.py` | quiz response, report profile summary | persona overlay unit tests | Phase 1 |
| FR3 Scoring engine | `feature_vectors.py`, `scoring.py` | recommendations API/report cards | deterministic scoring/confidence tests | Phase 1-2 |
| FR4 Explainable output | `recommendations.py`, `evidence.py` | recommendation cards/details | why/tradeoff/confidence/source tests | Phase 1-3 |
| FR5 AI report | `ai_report.py`, `reports.py` | report generation/viewer/export | AI eval, fallback, validation tests | Phase 3 |
| FR6 Comparison | `comparison.py` | `POST /api/match/compare`, `matchComparison` | 3+ comparison and source parity tests | Phase 4 |
| FR7 Similar neighborhoods | `similarity.py` | `POST /api/match/similar` | similarity/reason/confidence tests | Phase 1,4 |
| FR8 Map view | map response service, frontend map | `GET /api/match/map`, `matchMap` | map E2E, unsupported-region states | Phase 2,4 |
| FR9 Listings | `listings.py`, `providers/listings.py` | `GET /api/match/listings`, listings module | provider mode/no-scraping/mock tests | Phase 5 |
| FR10 Alerts | `alerts.py`, notification provider | `POST /api/match/alerts`, alert UI | rule, duplicate, dispatcher tests | Phase 5 |
| FR11 Save/share/export | `reports.py`, `matchStorage.ts` | report save/read/share/export | persistence/export/share tests | Phase 3,5 |
| FR12 Multilingual | i18n keys, report locale handling | all match screens | EN/NL parity and bilingual report tests | Phase 2-5 |
| FR13 Feedback loop | `feedback.py`, reranking hints | `POST /api/match/feedback`, card controls | feedback event and consistency tests | Phase 5 |
| FR14 Admin dashboard | `admin.py`, `admin_match.py` | `GET /api/admin/match/health`, admin UI | source health/anomaly/guardrail E2E | Phase 6 |
| Success metrics | `instrumentation.py`, `matchAnalytics.ts` | product event sink | event contract tests | Phase 6 |

## Complexity Tracking

No constitution violations are planned. The only deliberate complexity is a new `match` bounded context and provider protocols; this is required to keep deterministic scoring, AI report generation, data providers, listings, notifications, and admin monitoring separate and testable.
