# Phase 0 Research: Buurt Check Revamp

## Decision: Add a New Match Bounded Context

**Decision**: Implement the revamp under `backend/app/services/match`, `backend/app/api/match.py`, `backend/app/models/match.py`, and `frontend/src/components/match`.

**Rationale**: The current app is centered on address dossiers and has large existing modules such as `api/address.py`, `App.tsx`, and PDF/export services. The revamp introduces neighborhood-first discovery, preference vectors, recommendations, listings, alerts, and admin monitoring. A bounded context keeps this work reviewable without destabilizing the current property dossier.

**Alternatives considered**:

- Extend `api/address.py`: rejected because the revamp is not address-first and would increase coupling.
- New separate app: rejected because it would duplicate config, i18n, auth/session, data, testing, and design-system infrastructure.

## Decision: Deterministic Scoring Is the Source of Truth

**Decision**: Preference vector generation, persona overlays, feature vectors, hard filters, fit scores, confidence, categories, similar-neighborhood search, and alert eligibility are deterministic Python service functions.

**Rationale**: The constitution and PRD require repeatable, explainable scoring. AI can explain and translate but cannot create or change scores.

**Alternatives considered**:

- LLM-generated ranking: rejected by PRD and fairness/trust constraints.
- Frontend-side ranking: rejected because scores must be consistent, testable, and auditable server-side.

## Decision: Provider Interfaces Before Real Integrations

**Decision**: Use `OfficialDataProvider`, `ListingProvider`, `NotificationProvider`, `ReportGenerator`, and `InstrumentationSink` interfaces. Ship `SeedMockImporter`, `MockListingProvider`, and `MockNotificationProvider` first.

**Rationale**: MVP needs implementation momentum without depending on licensed listing access or complete official-data ingestion. Interfaces allow real providers to be added later with the same provenance contract.

**Alternatives considered**:

- Hard-code seed data directly in scoring: rejected because provider boundaries would be harder to retrofit.
- Scrape listings: rejected by constitution and legal/commercial risk.

## Decision: SQLite/Turso Persistence Extended Through Existing DB Layer

**Decision**: Extend `backend/app/db.py` bootstrap schema for match tables and keep local SQLite/Turso parity.

**Rationale**: The repository already has a working async DB abstraction, tests, buyer/session state, and share/export patterns. Reusing it avoids a storage migration during the revamp.

**Alternatives considered**:

- Introduce PostgreSQL: rejected as unnecessary platform churn for MVP planning.
- Browser-only persistence: rejected because reports, alerts, admin monitoring, data imports, and source health need server-side state.

## Decision: Structured Report Input and Output

**Decision**: AI report generation uses Pydantic schemas for `ReportInput` and `ReportOutput`, validates every evidence-linked section, and falls back to deterministic templates.

**Rationale**: The report should feel personal while remaining evidence-backed. Structured input/output makes hallucination, missing citations, score-driver mismatch, and bilingual parity testable.

**Alternatives considered**:

- Free-form prompt with markdown response: rejected because validation and source traceability are weak.
- No AI in MVP: rejected because FR5 is P0, but fallback ensures AI downtime does not block the core journey.

## Decision: Use Existing SPA State Pattern

**Decision**: Add match screens to `App.tsx` state/activeScreen flow and keep typed services in `frontend/src/services`.

**Rationale**: Project conventions explicitly avoid Redux/Zustand/React Query and currently use app-level state. The revamp can be added as screen states without a routing framework migration.

**Alternatives considered**:

- Add React Router: rejected as unrelated architectural churn.
- Add a global state library: rejected by repo conventions.

## Decision: Browser or Server Export May Be Selected Later, Contract First

**Decision**: Plan the report export contract and require source/freshness/limitations preservation. The implementation can choose browser-generated or server-rendered PDF in tasks after comparing reuse of current `pdf_export.py` with frontend report layout.

**Rationale**: The current backend has substantial PDF infrastructure, but the Woonkompas report is a different content model. The plan should fix the contract first and keep implementation reviewable.

**Alternatives considered**:

- Reuse existing PDF export immediately: possible, but may couple neighborhood reports to property dossier templates too early.
- Browser-only export immediately: possible, but must still satisfy share/export tests and source metadata requirements.

## Decision: Admin Monitoring Is Read-Only for MVP

**Decision**: Admin dashboard surfaces health, freshness, missing data, mock coverage, provider status, guardrails, alert failures, and scoring anomalies. It does not include billing, support tooling, or source-run mutation in MVP.

**Rationale**: FR14 requires visibility, not operations tooling. Read-only monitoring reduces blast radius.

**Alternatives considered**:

- Full admin CRUD: rejected as P2 scope.
- Logs only: rejected because PRD requires internal users to identify issues by supported region.

## Decision: Product Events Use a Mockable Sink

**Decision**: Required events are emitted through `InstrumentationSink` with a local/mock sink first.

**Rationale**: Event names and payload contracts must be testable before selecting analytics infrastructure.

**Alternatives considered**:

- Depend on a hosted analytics provider for MVP: rejected as unnecessary external dependency.
- Defer events: rejected because success metrics are part of the spec.
