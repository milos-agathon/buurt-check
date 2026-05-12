# Research: Buurt Check Match-First UI Revamp

## Decision: Preserve the existing React SPA and custom hash router

**Rationale**: The repository is a Vite React SPA with route parsing and hash building in `frontend/src/App.tsx`. Existing routes include `#/search`, `#/address/{vbo_id}`, `#/briefing`, many `#/match/*` routes, shared routes, and prebid pack routes. Preserving this route system is the smallest safe change and avoids a framework migration.

**Alternatives considered**:

- React Router: rejected because it introduces a new routing framework and conflicts with the custom hash parser already used for checkout/Dossier recovery.
- Next.js pages or app router: rejected because the current app is Vite, not Next.js.
- Clean URLs first: deferred because hash routes already work and clean URLs require Vercel rewrite changes plus parser changes.

## Decision: Make `/` resolve to match landing and keep `#/search` secondary

**Rationale**: The PRD and constitution require match-first entry. Search remains technically available but must not compete as an equal CTA, card, tab, or mode. Existing checkout recovery URLs with `report` and `session_id` must keep their Dossier recovery path.

**Alternatives considered**:

- Keep `/` as search: rejected because it violates the primary product flow.
- Remove search: rejected because search remains a supported secondary direct address path.

## Decision: Add Leaflet for 2D results and selected-neighborhood maps

**Rationale**: The actual `frontend/package.json` does not include Leaflet, Mapbox, or MapLibre. The current `MatchMap` is a static projected marker component and cannot satisfy pan/zoom, polygon highlighting, fly-to, synchronized list/map selection, or mobile exploratory map requirements. Leaflet is sufficient for MVP 2D maps and keeps 3D separate in existing Three.js patterns.

**Alternatives considered**:

- Reuse current `MatchMap`: rejected because it lacks real map interactions.
- MapLibre GL: rejected for MVP because it is heavier and adds WebGL map complexity while selected-neighborhood 3D already uses Three.js.
- Custom canvas/WebGL map: rejected because it would recreate mature map behavior and accessibility work.

## Decision: Use lightweight hero animation first

**Rationale**: The landing page must be readable and immediately interactive. A pre-rendered/static/canvas map atmosphere with reduced-motion fallback satisfies the visual direction without competing with Dossier's existing Three.js/worker budgets.

**Alternatives considered**:

- Live national 3D hero: rejected because it risks first-screen performance and violates the MVP-safe guidance.
- Static plain hero with no map signal: rejected because the PRD asks for a map-first spatial atmosphere.

## Decision: Use persisted polling jobs for matching progress

**Rationale**: The backend has FastAPI and SQLite/Turso persistence but no Celery, RQ, ARQ, Dramatiq, Huey, SSE, or WebSocket infrastructure. Polling a persisted job every 1-2 seconds is MVP-safe and supports refresh/retry behavior without new infrastructure.

**Alternatives considered**:

- SSE/WebSocket: rejected for MVP because no existing support exists and progress state can be represented through polling.
- External worker queue: deferred because deterministic scoring is expected to be short-running; add a queue only if measured runtime or multi-process reliability demands it.
- Fake frontend progress: rejected because progress must be backed by real backend state.

## Decision: Use deterministic weighted scoring, not predictive probabilities

**Rationale**: The repository contains deterministic seed-backed match scoring and no historical labels or validation dataset. Presenting predictive probability or highest predictive power would violate model honesty.

**Alternatives considered**:

- Fit/select multiple predictive models now: rejected because no target labels exist.
- Use LLM scoring: rejected because LLMs may explain structured outputs but must not create or modify scores, eligibility, confidence, or reason-code truth.

## Decision: Store match sessions, answers, jobs, and result sets in DB

**Rationale**: Existing match tables cover neighborhoods, metrics, feature vectors, preference vectors, reports, saved neighborhoods, feedback, analytics, and source health, but not resumable sessions or pollable jobs. The PRD requires answer persistence, refresh recovery, progress state, and Dossier return context.

**Alternatives considered**:

- Browser-only session state: rejected because backend matching and Dossier return need canonical session state.
- Redis-only job state: rejected because the repo already uses SQLite/Turso for buyer-bound state and Redis may be unavailable or transient.

## Decision: Load 3D buildings only for selected neighborhoods

**Rationale**: The constitution forbids national 3D loading. Existing Dossier 3D is address/neighborhood scoped and uses plain Three.js. The revamp should follow that pattern with server-side neighborhood bounds validation and 2D fallback.

**Alternatives considered**:

- National 3D building layer: rejected for performance and constitutional compliance.
- Viewport-triggered loading outside selected neighborhood: rejected because viewport loading may only page/LOD inside the selected neighborhood.

## Decision: Preserve Dossier and add only route context plus return action

**Rationale**: The Dossier contains existing risk cards, entitlement, export, prebid, checkout recovery, and 3D context. The PRD requires using it, not redesigning it. The minimum change is a house-to-address bridge plus persistent localized back-to-map action when match context is present.

**Alternatives considered**:

- Redesign Dossier during route cleanup: rejected because it violates scope and increases regression risk.
- Open a separate match-house detail instead of Dossier: rejected because the product contract says house click enters existing Dossier.

## Decision: Keep all strings behind translation keys and analytics behind stable event IDs

**Rationale**: The repo already initializes i18next with EN/NL JSON bundles. The revamp must not hard-code visible copy or use translated labels as stored values or analytics identifiers.

**Alternatives considered**:

- Use defaultValue strings during implementation: rejected because it hides missing translations.
- Use display labels in analytics: rejected for privacy, stability, and bilingual correctness.
