# Feature Specification: Buurt Check Match-First UI Revamp

**Feature Branch**: `002-match-first-revamp`
**Created**: 2026-05-12
**Status**: Draft
**Input**: User description: "Create a master feature specification for the Buurt Check Match-First UI Revamp from docs/prd.md, docs/context/current_architecture.md, and .specify/memory/constitution.md. Build exactly the PRD product: a match-first journey from landing CTA through one-question guided intake, optional additional-preferences prompt, confirmed backend matching, progress, checkmark, Netherlands results map, selected-neighborhood 2D building detail, house click into existing Dossier, and persistent back to match map."

## Clarifications

### Session 2026-05-12

- Q: Which current frontend routing system must this revamp preserve? → A: The current app is a Vite React SPA using a custom hash router in `frontend/src/App.tsx`; new match-session routes must be implemented through that parser/hash builder or explicitly mapped clean-url rewrites, not through Next.js pages or React Router.
- Q: Which existing routes must remain valid? → A: Preserve current hash routes including `#/search`, `#/address/{vbo_id}`, `#/briefing`, `#/saved`, `#/compare`, `#/settings`, `#/match`, `#/match/quiz`, `#/match/report`, `#/match/map`, `#/match/compare`, `#/match/similar`, `#/match/listings`, `#/match/alerts`, `#/match/saved`, `#/match/admin`, `#/shared/match/report/{token}`, `#/pack/{vbo_id}/{report_id}`, `#/shared-pack/{token}`, and `#/shared/{token}` while adding the match-first flow.
- Q: What is the current Dossier route and required route data? → A: The canonical Dossier route is `#/address/{vbo_id}` where `vbo_id` is the addressable object ID; optional route query data includes `lookup`, `report`, `session_id`, and `buyer_resume`, and `#/briefing` is used for Dossier/checkout recovery when no `vbo_id` is available.
- Q: Does the current frontend have a production map library for the match map? → A: No Leaflet, Mapbox, or MapLibre dependency is present; current `MatchMap` is a projected marker component without pan/zoom/polygons, while existing 3D buildings are plain Three.js Dossier components backed by address-level 3DBAG endpoints. The match-first selected-neighborhood map must render scoped buildings as 2D footprints on its 2D basemap.
- Q: Does the app already have bilingual i18n infrastructure? → A: Yes; `react-i18next` is initialized with bundled `en.json` and `nl.json`, supported languages `en` and `nl`, Dutch fallback, and localStorage/html-tag detection, so every revamp string must use those translation files and stable keys.
- Q: What backend framework and current match API shape exist? → A: The backend is FastAPI with routers under `/api`; current match endpoints live under `/api/match` and are synchronous seed-backed endpoints such as `/quiz`, `/recommendations`, `/map`, `/compare`, `/reports`, `/listings`, `/alerts`, `/feedback`, and `/saved-neighborhoods`.
- Q: Is there an existing Python worker or job queue for matching? → A: No Celery, RQ, ARQ, Dramatiq, Huey, or match job table exists; the revamp must add real persisted or pollable session/job state and may choose an in-process FastAPI job pattern or a new worker/queue during planning.
- Q: Do historical labels exist for predictive model selection? → A: No historical predictive labels or validation dataset are present; current match data is deterministic scoring over mock/seed neighborhood features plus feedback events that are not sufficient validation labels.
- Q: What must happen when no predictive labels exist? → A: MVP matching must use deterministic or semi-deterministic weighted scoring, set predictive probability fields to absent/null/disabled, and describe results only as data-backed fit scores with reason codes, confidence, tradeoffs, source freshness, and limitations.
- Q: What is the exact MVP hero animation behavior? → A: Use a pre-rendered loop, static image with subtle CSS motion, or optimized 2D canvas map atmosphere for MVP; do not ship a heavy live national 3D scene on the landing screen.
- Q: What is the exact reduced-motion fallback? → A: With `prefers-reduced-motion`, show a static map frame or image, disable drift/fly/confetti-style motion, keep the headline/CTA/search link usable, and use static or near-static progress/checkmark states.
- Q: What is the exact Dossier return behavior? → A: A Dossier opened from match context must expose a persistent localized back-to-match-map action that restores the previous match session, selected neighborhood or results view, map center/zoom/list state, mobile map/list mode, language, and selected house context without rerunning matching unless preferences changed.
- Q: What test strategy applies to phases? → A: Each phase needs acceptance-linked verification: frontend Vitest/Testing Library for UI state and i18n, backend pytest for API/session/scoring contracts, Playwright for end-to-end routing/map/Dossier round trips, and reduced-motion/accessibility checks for affected screens.

### Session 2026-05-21

- Q: How should the flow handle preferences not covered by the fixed questions, such as beach proximity or religious structure? -> A: Keep the one-question guided intake, then add one optional "anything else that matters?" prompt. If an LLM is used, it only extracts user-stated preferences into a strict schema, asks bounded clarifying questions, and classifies each extracted item through the backend custom-preference registry as `scoreable`, `map_context_only`, `saved_unsupported`, `disallowed`, or `needs_clarification`.
- Q: Can conversational input directly decide a user's best-fit neighborhoods? -> A: No. LLM output must be reviewed by the user and validated by backend registry rules before matching. LLMs must not score, rank, exclude, infer protected traits or religious identity, create confidence, or modify eligibility, hard-filter outcomes, reason-code truth, or source metadata.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start Match-First Journey (Priority: P1)

A first-time home seeker arrives at Buurt Check and immediately understands that the main action is to find a matching neighborhood. The landing screen shows an animated map atmosphere, one dominant match CTA, a language switcher, and only a small secondary address-search link for users who already have an address.

**Why this priority**: This removes the current search-versus-match split, which is the core reason for the revamp.

**Independent Test**: Can be tested by opening the first screen in Dutch and English, confirming that the primary CTA starts the match journey and address search is present only as a small secondary link.

**Acceptance Scenarios**:

1. **Given** a user opens Buurt Check for the first time, **When** the landing screen appears, **Then** the only dominant CTA is "Find my dream neighborhood" or "Vind mijn droombuurt".
2. **Given** a user already has an address, **When** they inspect the landing screen, **Then** they can find "Already have an address?" or "Heb je al een adres?" as a secondary text link that is not styled as an equal button, card, tab, or mode.
3. **Given** a user has reduced-motion enabled or the animated background cannot load, **When** the landing screen renders, **Then** the headline, CTA, language switcher, and secondary search link remain readable and usable.

---

### User Story 2 - Complete Guided Intake With Optional Additional Preferences (Priority: P1)

A user clicks the match CTA, sees a short survey intro, completes a guided intake that shows exactly one question at a time, and can optionally describe extra needs that the fixed questions did not cover. The system extracts those extra needs into reviewed structured preferences instead of treating the text as a direct recommendation prompt.

**Why this priority**: Guided intake is the required input for meaningful neighborhood matching, while the optional additional-preferences step prevents the fixed question set from missing important user-stated needs.

**Independent Test**: Can be tested by starting a match session, answering each guided question, refreshing partway through, going back to change answers, submitting or skipping the additional-preferences prompt, and verifying the final review reflects guided answers plus reviewed custom-preference status in both languages.

**Acceptance Scenarios**:

1. **Given** the user clicks the landing CTA, **When** the survey intro appears, **Then** the user sees only a brief explanation and a single "Start the match" or "Start de match" CTA.
2. **Given** the user is in the guided intake, **When** any guided step is displayed, **Then** exactly one question is visible, one progress indicator is visible, and no dashboard, chart, feature grid, advertisement, pricing block, or unrelated card appears.
3. **Given** the user has answered at least one question, **When** they use the back button, **Then** they return to the previous question with the previous answer still selected.
4. **Given** a required question is unanswered, **When** the user tries to continue, **Then** the survey blocks advancement with an accessible localized validation message.
5. **Given** the user reaches the additional-preferences prompt, **When** they submit "near the beach" or "close to the coast", **Then** the system stores only a structured custom preference such as `coast_or_beach_proximity` with a reviewed status and never stores raw free-text analytics content.
6. **Given** the user mentions a sensitive or unsupported preference such as "people like me" or religious identity, **When** extraction runs, **Then** the item is marked `disallowed` or `saved_unsupported` and cannot become a scoring, ranking, eligibility, or demographic-profiling input.

---

### User Story 3 - Confirm and Run Matching (Priority: P1)

After the final guided question and optional additional-preferences review, the user reviews a concise summary and explicitly confirms before backend matching starts. The system creates a preference vector from guided answers plus registry-validated custom preferences, starts an asynchronous match job, compares preferences against neighborhood features, and returns ranked neighborhoods with scores, reason codes, tradeoffs, confidence, geometry references, and model/data metadata.

**Why this priority**: Matching is the product value. The PRD requires the backend run to start only after user confirmation and to stay honest about model limits.

**Independent Test**: Can be tested by completing the guided intake, confirming or rejecting extracted custom preferences on the review screen, observing a real match job state transition, and validating that returned results contain ranked neighborhoods and required explanation metadata.

**Acceptance Scenarios**:

1. **Given** the user reaches the review screen, **When** they have not clicked "Show my matches" or "Toon mijn matches", **Then** no match job has started.
2. **Given** the user confirms the review, **When** matching starts, **Then** a match session/job enters a pollable progress state backed by actual backend state.
3. **Given** the match job completes, **When** results are available, **Then** each ranked neighborhood includes eligibility, fit score or fit label, reason codes, tradeoffs, 0-100 confidence, geometry references, source/freshness metadata, runtime, evaluation status, explicit limitations, and model/data version metadata.
4. **Given** the system lacks validation labels for predictive modeling, **When** results are presented, **Then** they are described as data-backed fit scores rather than predictive probabilities or objective best neighborhoods.

---

### User Story 4 - Follow Friendly Progress to Results (Priority: P1)

While matching runs, the user sees calm animated progress messages and then a large Buurt Check checkmark before opening the results map.

**Why this priority**: This phase bridges user effort and results, prevents uncertainty, and must not expose technical logs or fake model precision.

**Independent Test**: Can be tested by starting a match job, verifying localized progress states, verifying failure/fallback states, and confirming successful completion shows the checkmark before results.

**Acceptance Scenarios**:

1. **Given** a match job is running, **When** the progress screen updates, **Then** the user sees friendly localized status messages such as reading preferences, building profile, comparing neighborhoods, checking tradeoffs, and preparing results.
2. **Given** the match job completes, **When** the success state appears, **Then** the screen shows a large animated Buurt Check checkmark with a reduced-motion alternative.
3. **Given** matching is slow or fails, **When** the user remains on the progress screen, **Then** the system shows a non-technical localized message and preserves the user's answers for retry.

---

### User Story 5 - Explore Ranked Neighborhood Results (Priority: P1)

The user opens a Netherlands-centered results map with a ranked list of recommended neighborhoods. List items and map markers or polygons stay synchronized, and selecting a result flies to the neighborhood without rerunning matching.

**Why this priority**: The results map is the first exploratory surface and must translate matching into places the user can inspect.

**Independent Test**: Can be tested by opening completed match results, selecting neighborhoods from the list and map, checking mobile map/list behavior, confirming state survives navigation and the Dossier round trip, and marking any refresh persistence gap as missing or partial in traceability.

**Acceptance Scenarios**:

1. **Given** matching is complete, **When** the results screen opens, **Then** the map starts centered on the Netherlands and shows ranked neighborhoods as both map features and a list.
2. **Given** the user clicks a ranked list item, **When** the map responds, **Then** it flies to the selected neighborhood, highlights the corresponding marker or polygon, and preserves the ranked list context.
3. **Given** the user clicks a map marker or polygon, **When** the result is selected, **Then** the corresponding ranked list item is highlighted and available to screen-reader and keyboard users through a non-map list alternative.

---

### User Story 6 - Inspect Selected Neighborhood and Houses (Priority: P1)

The user selects a neighborhood and sees a detail state with only that neighborhood's boundary, all available selected-neighborhood 2D house/building footprints where source data exists, preference-aware amenity tags, and selectable houses. Dense footprint data may load progressively by selected-neighborhood viewport or page, but the UI must not silently present a representative sample as complete.

**Why this priority**: This connects neighborhood discovery to the house-level Dossier while enforcing map performance and avoiding clutter.

**Independent Test**: Can be tested by selecting a neighborhood, verifying that building footprints are scoped to the selected neighborhood only, progressively load all available footprint pages or clearly label the current visible viewport as partial, render as 2D shapes on the 2D basemap, check fallback behavior, and selecting a house.

**Acceptance Scenarios**:

1. **Given** the user selects a neighborhood, **When** the detail map loads, **Then** only the selected neighborhood boundary and houses within that selected neighborhood are eligible to render as 2D footprints.
2. **Given** selected-neighborhood footprint source data exists, **When** the user opens, pans, or zooms the detail map, **Then** the app progressively loads every available footprint for the selected neighborhood or current selected-neighborhood viewport and labels any partial page/viewport state until loading is complete.
3. **Given** building footprint data is unavailable, **When** the detail map loads, **Then** the user sees a localized explanation and a basemap/amenity fallback without losing house-selection capability where reliable address data exists.
4. **Given** the user selected lifestyle priorities in the survey, **When** amenity tags are shown, **Then** the visible tags are preference-aware and limited to a concise default set.
5. **Given** the user selects a neighborhood on a plan-defined target acceptance device profile, **When** the detail state opens, **Then** the selected boundary and either fallback context or the first selected-neighborhood 2D footprint content become usable within the stated performance budget without loading national building footprints or national 3D buildings.

---

### User Story 7 - Open Existing Dossier and Return to Match Map (Priority: P1)

The user clicks a house and enters the existing address-level Dossier. The Dossier preserves match context and includes a persistent "Back to match map" or "Terug naar matchkaart" action that returns to the prior map state without restarting matching.

**Why this priority**: The revamp must preserve the existing Dossier product while making the round trip from neighborhood discovery reliable.

**Independent Test**: Can be tested by selecting a house from a matched neighborhood, opening the Dossier, using the back-to-map action, and confirming the match session, selected neighborhood, zoom/list state, language, and results are preserved.

**Acceptance Scenarios**:

1. **Given** the user clicks a selectable house, **When** a reliable address or address-selection fallback is available, **Then** the existing Dossier opens for that house or chosen address.
2. **Given** the Dossier opens from match context, **When** the user views any Dossier section, **Then** the persistent return action remains available without replacing or redesigning Dossier modules.
3. **Given** the user clicks "Back to match map" or "Terug naar matchkaart", **When** the map reopens, **Then** the previous match session, selected neighborhood, result list, zoom/list state, and language are restored and matching does not rerun unless preferences changed.
4. **Given** the user returns from Dossier to the match map, **When** they select another house in the same neighborhood or another matched neighborhood, **Then** the app opens the existing Dossier for the new house without restarting the survey or rerunning matching.

### Edge Cases

- A user refreshes during survey, progress, results, neighborhood detail, or Dossier: recover the latest feasible session state and never silently discard completed answers.
- A user changes language mid-flow: visible copy changes language, stored values remain stable language-independent keys, and completed answers remain intact.
- A required data source is missing, stale, or partially unavailable: show results with clear confidence and limitations when possible; otherwise show a retryable failure state.
- Matching finds no strong matches: show possible near-matches or constraint-relaxation options without claiming that any result is perfect.
- Matching completes with deterministic fallback after advanced ranking fails: show results using the stable scoring model and a non-technical localized fallback explanation.
- A selected building lacks a reliable address: show a localized fallback that lets the user choose a nearby address, search manually, or return to the map.
- Additional free-text preference extraction is unavailable, inconclusive, or times out: keep the guided answers, show a localized retry/skip path, and do not block matching unless the user chooses to retry.
- A user-stated preference maps to a registry key that has no scoreable source yet: show it on review as saved or map-context-only, not as a scoring input.
- A user-stated preference implies protected traits, religious identity, demographics, or subjective safety certainty: classify it as disallowed or unsupported and prevent scoring, ranking, or analytics storage of raw text.
- The user has reduced-motion enabled: all animated hero, survey transitions, progress, checkmark, and map fly-to behaviors provide static or subtle alternatives.
- The user cannot use the map: ranked results, recommendation details, neighborhood selection, and Dossier entry remain available through keyboard-accessible list controls.

## PRD Traceability *(mandatory)*

| Spec Item | PRD Requirement(s) | Journey Step(s) | Traceability Notes |
|-----------|--------------------|-----------------|--------------------|
| User Story 1 | Sections 2.3, 3.1 goals 1-2, 6.2, 7 Phase 0, FR-L1 to FR-L6 | landing hero | Replaces search/match split with one dominant match CTA and demoted search. |
| User Story 2 | Sections 5.1, 5.7, 7 Phases 1-2, 8.2, 8.3, 8.4.1, 9 | survey intro, one-question guided intake, additional-preferences prompt | Enforces one question at a time, progress, back behavior, persistence, validation, minimal UI, and reviewed structured custom preferences. |
| User Story 3 | Sections 7 Phase 3, 8.4, 8.4.1, 8.5, 8.6, 8.7, 14, 15 | review, backend matching | Confirms matching only after final CTA and returns ranked data-backed recommendations from guided plus registry-validated custom preferences. |
| User Story 4 | Sections 7 Phases 4-5, 10.5, 14.4, 14.5, 14.6, 17.3, 17.4 | matching progress, checkmark success | Covers friendly progress, completion, fallback, and no technical logs. |
| User Story 5 | Sections 7 Phase 6, 8.8, 11, 16.2 | Netherlands results map | Covers national results map, ranked list, marker/list synchronization, mobile support. |
| User Story 6 | Sections 7 Phase 7, 8.9, 12, 16.3, 16.4 | neighborhood 2D building detail | Covers selected-neighborhood-only 2D building footprints, boundary, amenities, house selection. |
| User Story 7 | Sections 7 Phase 8, 8.10, 13, 27.5 | existing Dossier, back to match map | Preserves existing Dossier and adds persistent match-map return. |
| Functional Requirements FR-001 to FR-010 | FR-L1 to FR-L6, UX principles | landing hero, survey intro | Locks first-screen entry and intro behavior. |
| Functional Requirements FR-011 to FR-021C | FR-S1 to FR-S10, survey content, custom preference registry | one-question guided intake, additional-preferences prompt | Locks guided intake behavior, custom preference extraction/review, and content boundaries. |
| Functional Requirements FR-022 to FR-038 | FR-P1 to FR-P7, FR-M1 to FR-M7, model selection, output schema | review, backend matching, progress | Locks preference vector, custom-preference status handling, async job, scoring honesty, output contracts. |
| Functional Requirements FR-039 to FR-041 | Sections 7 Phase 5, 17.4 | checkmark success | Locks successful completion behavior and reduced-motion completion feedback. |
| Functional Requirements FR-042 to FR-049 | FR-R1 to FR-R7 | results map | Locks Netherlands map, ranked list, marker/list synchronization, mobile switching, and non-map alternative. |
| Functional Requirements FR-050 to FR-056 | FR-N1 to FR-N6 | neighborhood detail | Locks selected-neighborhood detail, all-available 2D footprint scope with progressive loading, fallback, house selection, return-to-results, and performance budget. |
| Functional Requirements FR-057 to FR-062 | FR-D1 to FR-D5, Dossier integration | house click, existing Dossier, back to map | Locks Dossier preservation, context round trip, and inspecting another house without restart. |
| Functional Requirements FR-063 to FR-078 | Sections 18-21, analytics and success metrics | all steps | Covers accessibility, i18n, failure states, privacy, analytics, and clutter constraints. |
| Success Criteria SC-001 to SC-016 | Section 20, 22, 24 acceptance criteria | all steps | Converts PRD outcomes into measurable product success criteria. |

## Match-First Constitution Constraints *(mandatory)*

- **Canonical journey step(s)**: This spec covers the full journey: landing hero -> survey intro -> one-question guided intake -> optional additional-preferences prompt -> review -> backend matching progress -> animated checkmark success -> Netherlands results map -> neighborhood 2D building detail -> house click -> existing Dossier -> back to match map.
- **Search treatment**: Address search remains technically available only as a secondary path. On the first screen it appears as a small text link for users who already have an address. It MUST NOT appear as an equal CTA, card, tab, mode choice, or prominent form.
- **One-decision UI**: Landing, intro, survey, review, progress, and success states contain one primary action or decision at a time. They MUST NOT include dashboards, charts, feature grids, long explanations, ads, pricing blocks, unrelated cards, or exploratory map controls.
- **Bilingual copy**: All user-facing text uses stable translation keys with Dutch and English values. Required namespaces include landing, guided intake, additional preferences, custom-preference review statuses, review, progress, success, results, neighborhood, dossier, validation, failure, accessibility labels, and analytics labels where displayed.
- **Map performance/fallbacks**: National building footprints and national 3D buildings are forbidden. Selected-neighborhood BAG `pand` records load and render as 2D footprints only after a neighborhood is selected and only inside that selected neighborhood's bounds. House-candidate semantics come from linked `verblijfsobject.gebruiksdoel`, with `woonfunctie` prioritized for selection. Non-residential-only pands, `overige gebruiksfunctie`, and `aantal_verblijfsobjecten = 0` pands remain visible as deferred footprints rather than being permanently filtered out. Where source data exists, the intended UX is every available footprint inside the selected neighborhood or current selected-neighborhood viewport, progressively loaded and honestly labeled while partial. Results and detail maps require reduced-motion, missing-footprint, partial-loading, and non-map list alternatives.
- **Model honesty**: Matching is presented as deterministic or semi-deterministic data-backed fit scoring unless real labels, validation data, and evaluation results prove predictive claims. Confidence, tradeoffs, reason codes, source freshness, and limitations are required. LLM extraction, if enabled, is intake-only and cannot score, rank, exclude, infer sensitive traits, create confidence, or modify source metadata.
- **Dossier preservation**: Existing Dossier modules, risk-card behavior, entitlement, PDF/export contracts, and premium/free boundaries are preserved. The revamp adds only the house-selection bridge, route context, and persistent back-to-match-map action needed for the match journey.
- **Accessibility**: Keyboard navigation, screen-reader labels, touch targets, contrast, focus management, perceivable status states, reduced motion, and non-map alternatives are P0 across the full journey.
- **Context preservation**: Guided answers, reviewed custom preferences, extraction status, session ID, selected neighborhood, result state, map center, map zoom, list scroll position, mobile map/list mode, selected result ID/rank, selected house/building, language, matching status, return route, and Dossier return path MUST survive navigation and the Dossier round trip. Any refresh persistence gap MUST be documented as missing or partial in traceability.
- **Unsupported claims**: Copy and explanations MUST NOT promise perfect fit, safety, happiness, investment certainty, future value, guaranteed affordability, or guaranteed lifestyle outcomes.
- **Known codebase conflicts**: Current architecture is search-first on the landing surface, has a multi-section match form, synchronous match requests, a non-pan/zoom projected marker map, no selected-neighborhood 2D building-footprint layer, and no Dossier back-to-match-map context. The smallest safe change is to add match-first flow and contracts around existing Dossier behavior rather than redesigning Dossier.
- **Repository architecture baseline**: The revamp targets the existing Vite React SPA and custom hash router in `frontend/src/App.tsx`, not Next.js or React Router. Existing hash routes remain compatible while new match-session route states are added.
- **Map and building baseline**: The current repository has no Leaflet, Mapbox, or MapLibre map dependency. Existing 3D support is plain Three.js in the Dossier context through address-level 3DBAG data; the match-first selected-neighborhood map uses 2D footprints on its 2D basemap, and the results map needs a deliberate map-layer implementation instead of treating the current projected `MatchMap` as sufficient for PRD pan/zoom/polygon behavior.
- **Backend execution baseline**: The backend is FastAPI. Existing match endpoints are synchronous and seed-backed, with no Python worker or queue; backend progress for this revamp must be backed by new real persisted or pollable state rather than purely frontend fake progress.
- **Predictive-data baseline**: The repository contains mock/seed match data and deterministic scoring, but no historical labels or validation dataset for predictive model selection. MVP output is therefore weighted fit scoring, not validated predictive probability.

## Requirements *(mandatory)*

### Functional Requirements

#### Phase 0 - Landing Hero

- **FR-001**: System MUST present a landing hero with a lightweight animated map atmosphere that remains readable and usable on mobile and desktop; MVP implementation MUST use a pre-rendered loop, static image with subtle CSS motion, or optimized 2D canvas unless a live scene has proven first-screen performance, readability, reduced-motion, and CTA-interaction budgets. Heavy live national 3D scenes are forbidden. *(PRD: FR-L1, Section 16.1; Constitution IV)*
- **FR-002**: System MUST present exactly one dominant primary CTA on the landing hero: "Find my dream neighborhood" in English and "Vind mijn droombuurt" in Dutch through translation keys. *(PRD: FR-L2, Section 10.1)*
- **FR-003**: System MUST demote address search to a small secondary "Already have an address?" or "Heb je al een adres?" link on the landing hero. *(PRD: FR-L3, Section 6.2)*
- **FR-004**: System MUST provide a language switcher on the landing hero before the user starts the survey. *(PRD: FR-L4)*
- **FR-005**: System MUST provide reduced-motion and low-bandwidth fallbacks for the hero by showing a static map frame or image, disabling background drift/fly motion, and preserving the CTA, language switcher, and secondary search link. *(PRD: FR-L5, FR-L6)*
- **FR-006**: System MUST NOT show a search form, match/search mode choice, feature grid, report cards, pricing block, dashboard, or long explanation on the landing hero. *(PRD: Section 7 Phase 0)*

#### Phase 1 - Survey Intro

- **FR-007**: System MUST transition from the landing CTA into a survey intro rather than directly into questions. *(PRD: Section 7 Phase 1)*
- **FR-008**: Survey intro MUST briefly explain that the product needs to understand how the user wants to live before matching neighborhoods. *(PRD: Section 7 Phase 1, Section 10.2)*
- **FR-009**: Survey intro MUST provide one CTA only: "Start the match" in English and "Start de match" in Dutch through translation keys. *(PRD: Section 7 Phase 1)*
- **FR-010**: Survey intro MUST remain visually minimal and MUST NOT expose model details, data tables, feature cards, pricing, or address search as a competing action. *(PRD: Sections 5.1, 5.6)*

#### Phase 2 - Guided Intake and Additional Preferences

- **FR-011**: Guided intake MUST show exactly one question at a time. *(PRD: FR-S1)*
- **FR-012**: Survey MUST show a progress indicator throughout the question flow. *(PRD: FR-S2)*
- **FR-013**: Survey MUST show a back control after the first question and allow users to change prior answers without losing later answers unless those later answers become invalid. *(PRD: FR-S3, Section 9.3)*
- **FR-014**: Survey MUST persist each answer selection or update immediately within the active match session before the user can rely on the answer in review or matching. *(PRD: FR-S4, Section 7 Phase 2)*
- **FR-014A**: If answer persistence fails, the survey MUST keep the user on the current question, preserve the visible local selection, show an accessible localized retry state, and MUST NOT advance to the next question or review until persistence succeeds. *(PRD: FR-S4, FR-S5, Section 21)*
- **FR-015**: Survey MUST validate required answers before allowing advancement and provide localized accessible validation messages. *(PRD: FR-S5)*
- **FR-016**: Guided intake MUST support the required question types for the PRD survey: single select, multi-select, budget range or presets, commute/travel tolerance, anchor location, optional free-text additional preferences, and review. *(PRD: FR-S6, Section 8.3)*
- **FR-017**: Survey MUST use stable language-independent answer keys and localized labels. *(PRD: FR-P5, Section 10.3)*
- **FR-018**: Guided intake MUST include 10 to 12 core questions covering intent, budget, household type, anchor location, commute/travel tolerance, lifestyle priorities, must-haves, dealbreakers, housing type, area character, and language/report preference where needed, plus an optional additional-preferences prompt before review. *(PRD: Section 8.3)*
- **FR-019**: Survey MUST allow users to refresh or navigate away and resume completed answers within the active session; any refresh persistence gap MUST be marked missing or partial in traceability. *(PRD: FR-S4, Constitution IX)*
- **FR-020**: Survey MUST NOT show multiple questions, sidebars, tips, charts, maps, unrelated content, or explanatory clutter during questions. *(PRD: FR-S7)*
- **FR-021**: Survey MUST be completable with keyboard, screen reader, and touch input. *(PRD: A11Y-1, A11Y-4, A11Y-5)*
- **FR-021A**: System MUST provide one optional additional-preferences prompt that lets the user describe preferences not covered by the guided questions and skip without penalty. The prompt MUST NOT be an unbounded chat surface or recommendation assistant. *(PRD: FR-S8, Section 8.3, Section 9.6)*
- **FR-021B**: If LLM extraction is enabled, the backend MUST convert user-stated additional preferences into a strict structured schema and validate each item against a typed custom-preference registry before review. Extracted items MUST be classified as `scoreable`, `map_context_only`, `saved_unsupported`, `disallowed`, or `needs_clarification`. *(PRD: FR-S9, FR-P6, Section 8.4.1)*
- **FR-021C**: Review MUST show every extracted custom preference and its use status before matching starts, and users MUST be able to accept, edit, remove, or skip extracted items. Raw free-text content MUST NOT be stored in analytics. *(PRD: FR-S10, FR-P7, Sections 9.6, 19.1, 20)*

#### Phase 3 - Review and Confirm Matching

- **FR-022**: System MUST show a final review screen after the last survey question and before matching starts. *(PRD: Section 7 Phase 3)*
- **FR-023**: Review screen MUST summarize the user's answers concisely and allow users to go back to edit answers. *(PRD: Section 7 Phase 3, Section 9.3)*
- **FR-024**: Review screen MUST include one final run CTA: "Show my matches" in English and "Toon mijn matches" in Dutch through translation keys. *(PRD: Section 7 Phase 3)*
- **FR-025**: System MUST NOT start a matching run until the user confirms from the review screen. *(PRD: FR-M1)*

#### Phase 3 - Preference Vector and Backend Matching

- **FR-026**: System MUST convert raw guided answers plus user-reviewed, registry-validated custom preferences into a structured preference vector containing hard filters, soft preferences, normalized weights, exclusions, housing preferences, custom preference statuses, language, and anchor context where provided. *(PRD: FR-P1, FR-P2, FR-P3, FR-P6)*
- **FR-027**: System MUST preserve raw guided answers and custom-preference references separately from derived preference weights for explanation, debugging, and future editing. Raw additional-preference text MUST NOT become analytics content. *(PRD: FR-P4, FR-P5, FR-P7)*
- **FR-028**: System MUST start an asynchronous matching job after final confirmation and expose real persisted or pollable session/job status to the user-facing progress screen. The implementation plan MUST use the smallest safe backend execution approach compatible with the existing FastAPI/Redis/SQLite-Turso stack; any new worker or queue framework MUST be justified in Complexity Tracking with rejected simpler alternatives, operational impact, and test coverage. *(PRD: FR-M2, Section 14.4; Constitution XII)*
- **FR-029**: System MUST compare the preference vector against neighborhood feature data and produce eligibility, score, reason codes, tradeoffs, and confidence for each candidate neighborhood. *(PRD: FR-M3)*
- **FR-030**: System MUST exclude neighborhoods that fail hard constraints from normal top matches unless clearly labeled as stretch or near-miss results. *(PRD: FR-M5)*
- **FR-031**: System MUST return ranked neighborhood recommendations with eligibility, fit score or fit label, concise reasons, reason codes, tradeoffs, confidence, geometry references, source/freshness metadata, model/scoring version, data version, runtime, evaluation status, and explicit limitations. Missing, mock, stale, or fallback fields MUST be labeled rather than silently omitted. *(PRD: FR-M4, FR-M6, Section 8.7; Constitution V)*
- **FR-032**: System MUST use deterministic or semi-deterministic weighted scoring for MVP because no historical predictive labels or validation dataset exists in the repository. *(PRD: Section 8.6, Constitution V)*
- **FR-033**: System MUST NOT present "highest predictive power", validated probability, objective best fit, or model superiority claims unless a future feature adds real labels, validation data, and documented evaluation results. *(PRD: Section 8.6, Constitution V)*
- **FR-034**: System MUST handle advanced ranking failure by falling back to stable scoring where possible and labeling the run as completed with fallback. *(PRD: FR-M7, Section 14.6)*
- **FR-034A**: LLM output MUST NOT create or modify match scores, ranks, eligibility, confidence, hard-filter outcomes, reason-code truth, source metadata, or recommendation limitations. The backend scoring service remains the only source of scoring truth. *(PRD: Section 8.6, FR-P7; Constitution V)*

#### Phase 4 - Matching Progress

- **FR-035**: Progress screen MUST show friendly localized status messages mapped to real job stages, not technical logs, model names, or raw algorithm details. *(PRD: Section 7 Phase 4, Section 10.5)*
- **FR-036**: Progress screen MUST show perceivable progress and a reduced-motion alternative. *(PRD: Section 7 Phase 4, A11Y-2)*
- **FR-037**: Progress screen MUST preserve answers and expose retry or safe recovery when matching is slow or fails. *(PRD: Sections 14.6, 21.3, 21.4)*
- **FR-038**: Backend job/result states MUST include at minimum `created`, `queued`, `reading_preferences`, `building_profile`, `loading_neighborhood_data`, `applying_filters`, `running_models`, `scoring_tradeoffs`, `preparing_map`, `completed`, `failed`, `completed_with_fallback`, and `completed_no_strong_matches`; user-facing progress copy MUST map these technical states to friendly localized message keys rather than exposing raw state names. *(PRD: Section 14.5, Sections 21.1, 21.4)*
- **FR-038A**: The implementation plan MUST define the slow-backend threshold that triggers localized slow-progress copy and slow-backend analytics while preserving the active session. *(PRD: Section 21.3; Constitution XV)*

#### Phase 5 - Successful Completion

- **FR-039**: Success screen MUST show a large Buurt Check checkmark when matching completes, using a smooth draw animation only when motion is allowed. *(PRD: Section 7 Phase 5, Section 17.4)*
- **FR-040**: Success screen MUST provide localized completion copy and either automatically transition to results after a short delay or offer one "Open my map" or "Open mijn kaart" CTA. *(PRD: Section 7 Phase 5)*
- **FR-041**: Success screen MUST provide a reduced-motion variant that uses a static or near-static checkmark and no confetti, bounce, spin, or distracting effects. *(PRD: Section 17.4, A11Y-2)*

#### Phase 6 - Netherlands Results Map

- **FR-042**: Results MUST open on a map centered on the Netherlands, backed by persisted completed result state rather than optimistic local state. *(PRD: FR-R1; Constitution XIV)*
- **FR-043**: Results MUST show a ranked list of recommended neighborhoods synchronized with markers or polygons on the map. *(PRD: FR-R2, FR-R4)*
- **FR-044**: Each recommendation MUST show a fit score or fit label and one to two concise reason lines by default. *(PRD: FR-R5)*
- **FR-045**: Detailed explanation MUST be available only through expansion or detail state so the default results list stays clean. *(PRD: FR-R6)*
- **FR-046**: Clicking a list item MUST fly to and highlight the corresponding neighborhood. *(PRD: FR-R3)*
- **FR-047**: Clicking a map marker or polygon MUST highlight the corresponding list item. *(PRD: FR-R4)*
- **FR-048**: Mobile results MUST support a map/list switching pattern that preserves selected neighborhood and scroll/zoom state. *(PRD: FR-R7)*
- **FR-049**: Results MUST provide a non-map list alternative that supports keyboard and screen-reader users. *(PRD: A11Y-6)*
- **FR-049A**: The implementation plan MUST name target acceptance device profiles and preserve these minimum budgets unless it records a stricter replacement: landing hero headline/CTA/language/search-link usable within 2.5 seconds on the target mobile profile, results map initial list and national map frame usable within 3 seconds after completed results are available, list-to-map and map-to-list selection feedback within 150 ms after local result data is loaded, and pan/zoom input response within 100 ms for already-loaded result geometry. *(PRD: Sections 16.1, 16.2; Constitution IV)*
- **FR-049B**: Results map MUST support manual pan and zoom controls on desktop and mobile in addition to list-to-map fly-to behavior, while preserving synchronized ranked-list state. *(PRD: Section 7 Phase 6, Section 16.2)*

#### Phase 7 - Neighborhood Detail and House Selection

- **FR-050**: Selecting a neighborhood MUST open a detail state that clearly highlights only the selected neighborhood boundary. *(PRD: FR-N2)*
- **FR-051**: Neighborhood detail MUST load/render 2D BAG `pand` footprints only after neighborhood selection and only within that selected neighborhood's bounds. Where source data exists, it MUST progressively load every available footprint inside the selected neighborhood or current selected-neighborhood viewport, not an unlabeled representative sample. It MUST prioritize pands whose linked verblijfsobject `gebruiksdoel` contains `woonfunctie` for house selection while keeping non-house pands visible as deferred footprints. *(PRD: FR-N1, Section 16.3, Constitution IV)*
- **FR-052**: Neighborhood detail MUST meet a measurable performance budget: after neighborhood selection, the selected boundary and either 2D fallback context or the first selected-neighborhood building content MUST become usable within 3 seconds on target acceptance device profiles named in the implementation plan, while any remaining buildings and amenities load progressively without blocking navigation. *(PRD: FR-N6, Section 16.3, Constitution IV)*
- **FR-052A**: If only a subset of selected-neighborhood buildings has loaded, the UI MUST expose a localized partial-loading state such as loading more buildings or showing buildings in the visible area, and backend responses MUST expose enough completion/cursor metadata for the frontend not to mislabel a partial response as complete. *(PRD: FR-N1, FR-N6, Section 12.3)*
- **FR-053**: Neighborhood detail MUST provide a missing-footprint fallback that shows basemap/amenity context and a localized explanation. *(PRD: FR-N5)*
- **FR-054**: Neighborhood detail MUST show preference-aware amenity categories in a curated 5 to 7 item right-side Relevant amenities legend/filter panel, and MUST render every returned no-paid amenity point marker on the selected-neighborhood map with a distinct marker shape and dedicated emoji for its amenity type. The right-side Relevant amenities legend/filter panel MUST show the same dedicated emoji identity as the map markers. The frontend MUST NOT add a marker-count cap after the backend amenity response. No-paid marker sources are PDOK BGT/BRT parks/green, DUO schools matched to BAG, LRK childcare matched to BAG, OV-haltes Nederland actueel WFS for live scoped transit markers with NDOV/GTFS as the preferred import source, RDW/Nationaal Parkeerregister parking, NDW DOT-NL public charging points, Zwemwater.nl swim spots, and Overture Places open POI context for daily shops, cafes/restaurants, healthcare, and libraries/culture. Sports-field markers are excluded from the active marker stack because the available broad sports sources were not reliable enough for field-only pins. *(PRD: FR-N3, Section 16.4)*
- **FR-055**: Neighborhood detail MUST allow selecting a house or building only when a reliable Dossier entry path or fallback address selection path is available. *(PRD: FR-N4, Section 21.5)*
- **FR-056**: Neighborhood detail MUST include a way to return to the Netherlands results view without losing the match session. *(PRD: Section 7 Phase 7)*

#### Phase 8 - Existing Dossier Integration

- **FR-057**: House selection MUST open the existing address-level Dossier rather than a redesigned Dossier surface, using the current `#/address/{vbo_id}` route when a reliable BAG addressable object ID is resolved or a localized address-selection fallback when it is not. *(PRD: FR-D1)*
- **FR-058**: Dossier entry from match context MUST preserve session ID, job ID, result set ID, preference vector version, selected neighborhood, result state, map center, map zoom, list scroll position, mobile map/list mode, selected result ID/rank, selected house/building or address context, preferences, language, return route, Dossier return path, and current Dossier route query data where relevant (`lookup`, `report`, `session_id`, `buyer_resume`). *(PRD: FR-D2; Constitution IX)*
- **FR-059**: Dossier MUST include a persistent localized "Back to match map" or "Terug naar matchkaart" action. *(PRD: FR-D3)*
- **FR-060**: Returning from Dossier MUST restore the prior match map state, preferring the selected-neighborhood detail state when the house was opened from that detail view and otherwise restoring the Netherlands results map; matching MUST NOT rerun unless the user changed preferences. *(PRD: FR-D4, Section 13.3)*
- **FR-061**: After returning from Dossier, the user MUST be able to inspect another house in the same selected neighborhood or a different matched neighborhood from the preserved results without restarting the survey or rerunning matching. *(PRD: FR-D5, Section 13.3)*
- **FR-062**: Dossier changes MUST NOT alter risk-card contracts, entitlement behavior, checkout recovery, PDF/export contract, premium/free boundaries, or existing evidence-backed Dossier modules except where necessary for route context and back navigation. The on-screen Dossier viewer and `quick_brief` MUST remain free; `full_dossier` MUST continue to require server-side buyer/address entitlement before download; frontend risk tiles MUST remain limited to Noise, Air, and Climate; and Sunlight MUST remain paid-report/PDF evidence rather than becoming a frontend risk tile or detail view. *(PRD: Section 13, Constitution VI)*

#### Cross-Cutting Accessibility, I18n, Privacy, Analytics, and Scope

- **FR-063**: Every user-facing string introduced or changed by the revamp MUST use translation keys with Dutch and English values. *(PRD: Section 5.5, Constitution III)*
- **FR-064**: Validation, error, fallback, progress, map, route labels, Dossier return action, screen-reader labels, and status messages MUST be bilingual through translation keys. *(PRD: Section 26, Constitution III)*
- **FR-065**: The full journey, including progress states, failure states, map/list interactions, house selection, and the Dossier return action, MUST support keyboard navigation, screen-reader labels, focus management, touch targets, text contrast, perceivable status updates, and reduced motion on mobile and desktop. *(PRD: Section 18, A11Y-1, A11Y-2, A11Y-3, A11Y-4, A11Y-5; Constitution VII)*
- **FR-066**: Maps MUST have non-map alternatives for discovering recommendations and selecting neighborhoods. *(PRD: A11Y-6)*
- **FR-067**: System MUST show source, freshness, confidence, and limitations in recommendation detail states or Dossier context without cluttering onboarding. *(PRD: Sections 5.6, 15.3)*
- **FR-068**: System MUST treat preference data, budget, household context, and anchors as sensitive user context; MUST NOT sell preference data; MUST avoid collecting names, emails, or accounts for MVP matching; MUST separate anonymous match sessions from accounts; MUST retain preference data only as needed for active anonymous matching unless the user explicitly saves results or creates an account; MUST provide a session-deletion path for anonymous match data or mark deletion as missing/partial in traceability with the retention limit, blocker, and follow-up condition; and MUST show clear privacy copy before account creation or saving results. *(PRD: Sections 15.4, 19.1)*
- **FR-069**: Anchor inputs MUST allow city-level anchors as an alternative to exact addresses, MUST mark exact address anchors as optional, MUST store geocoded anchors only when needed for matching, and MUST NOT expose exact anchors in shareable outputs unless the user explicitly chooses. *(PRD: Section 19.2)*
- **FR-070**: Matching MUST NOT use protected or sensitive demographic traits as scoring or exclusion criteria. *(PRD: Section 19.3)*
- **FR-070A**: Additional-preference extraction MUST NOT infer protected traits, religious identity, ethnicity, family status beyond explicit non-sensitive household needs, income class, or demographic similarity. User-stated religious or cultural amenity needs MAY be handled only as neutral place/amenity proximity or map-context preferences when official data supports it. *(PRD: Sections 8.4.1, 19.3)*
- **FR-071**: System MUST collect analytics events for activation, survey start, per-question survey progress and drop-off, survey completion, additional-preferences prompt shown/skipped/submitted, custom-preference extraction/review outcomes by stable preference key/status only, final run CTA, match job queued/running/completed/failed/completed-with-fallback/completed-no-strong-matches, match runtime, slow backend, no strong matches, results confidence sufficiency, results engagement, neighborhood list selection, marker or polygon selection, neighborhood detail, missing-footprint fallback, amenity tag interaction, house selection, no reliable address, Dossier open, back-to-map clicked, back-to-map return success, failures, fallbacks, and quality feedback where a feedback UI exists. *(PRD: Section 20; Constitution XV)*
- **FR-072**: Analytics MUST use stable event names and MUST NOT store translated labels, raw additional-preference text, exact anchors, protected traits, or sensitive personal data as event identifiers or event context. *(PRD: Section 20, Constitution III)*
- **FR-073**: System MUST provide bilingual, accessible, non-deceptive recovery states for session creation failure, answer-save failure, no strong matches, slow backend, failed backend, completed-with-fallback scoring, stale or unavailable result sets, map-layer load failure, building-layer load failure, amenity-layer load failure, missing building-footprint data, partial selected-neighborhood building loading, and no reliable address for a selected house. Each state MUST preserve the session where possible, expose a clear recovery action, and avoid unsupported certainty. *(PRD: Section 21; Constitution XV)*
- **FR-074**: System MUST NOT add a full listing marketplace, unbounded AI chat, LLM-based scorer, account system, checkout redesign, paid-report redesign, complex dashboard, nationwide building-footprint/3D preload, or all map layers as part of this revamp. *(PRD: Sections 3.2, 22.2)*
- **FR-075**: System MUST keep search technically available for direct address checks while keeping it secondary in first-screen hierarchy. *(PRD: Section 27.3)*
- **FR-076**: System MUST preserve user context across navigation, Dossier round trip, language changes, and map/list toggles, including guided answers, reviewed custom preferences, extraction statuses, session ID, selected neighborhood, result state, map center/zoom, list scroll, mobile map/list mode, selected result ID/rank, selected house/building, language, matching status, return route, and Dossier return path. Refresh persistence gaps MUST be marked missing or partial in traceability, never treated as pass. *(PRD: Section 27.5, Constitution IX)*
- **FR-077**: System MUST avoid claims of perfect fit, safety, happiness, investment certainty, future value, guaranteed affordability, or guaranteed outcomes. *(PRD: Section 3.2, Constitution X)*
- **FR-078**: Every implementation phase derived from this spec MUST include acceptance-linked tests or verification for affected behavior. *(PRD: Section 23, Constitution VIII)*

### Key Entities *(include if feature involves data)*

- **Match Session**: Anonymous user journey container. Key attributes: session ID, language, current phase, answer completion state, match job state, selected neighborhood, map state, return path, timestamps, and expiration/deletion metadata.
- **Guided Intake Answer Set**: Raw answers keyed by stable language-independent question and answer IDs. Includes required/optional status, validation status, modified timestamp, and whether downstream answers remain valid after edits.
- **Custom Preference**: User-stated additional preference extracted into a structured key, status, privacy class, evidence/source availability, optional bounded clarification state, user review decision, and reason code. Examples include `coast_or_beach_proximity` as scoreable where data exists, `place_of_worship_proximity` as neutral amenity map context where supported, and demographic similarity requests as disallowed.
- **Preference Vector**: Derived representation of guided answers plus reviewed scoreable custom preferences. Includes intent, budget range, household context key, anchor locations or city anchors, travel tolerance, hard filters, normalized weights, avoid list, housing preferences, custom preference statuses, and language key.
- **Neighborhood Feature Record**: Data-backed neighborhood attributes available for matching. Includes neighborhood ID, name key or localized display data, municipality, centroid, geometry reference, feature values, missing/stale indicators, source references, and freshness metadata.
- **Building Footprint Page**: Scoped selected-neighborhood building payload. Includes neighborhood ID, requested RD bounds or tile/chunk, data version, simplification level, completion status, optional cursor/next page token, clipped footprint features, source refs, limitations, and fallback or partial-load reason codes.
- **Match Job**: Asynchronous matching run. Includes job ID, session ID, status, progress stage, started/completed timestamps, fallback flag, runtime, error class for internal use, model/scoring version, data version, evaluation status, and stable failure/fallback reason codes.
- **Neighborhood Recommendation**: Ranked result for a candidate neighborhood. Includes rank, neighborhood ID, fit score or label, eligibility status, confidence, reason codes, tradeoffs, matched preferences, failed hard filters where shown as near-miss, geometry references, source/freshness metadata, and explicit limitations.
- **Geometry Reference**: Stable reference to map geometry needed for results and detail views. Includes neighborhood polygon reference, centroid, boundary source/freshness metadata, selected-neighborhood building layer reference, and amenity layer references.
- **Amenity Tag Set**: Preference-aware visible amenity categories for the selected neighborhood. Includes tag keys, labels through translations, relevance reason codes, and source metadata.
- **House Selection Context**: Selected house/building reference inside a neighborhood. Includes building or parcel ID where available, address resolution status, candidate addresses, selected address, Dossier route target, and fallback reason.
- **Dossier Return Context**: State needed to return from Dossier to the match map. Includes session ID, job ID, result set ID, preference vector version, result state, selected result ID/rank, selected neighborhood, selected house/building/address, map center, map zoom, list scroll position, mobile map/list mode, language, return route, Dossier return path, current Dossier route query data where relevant, and whether preferences changed.
- **Analytics Event**: Product telemetry event. Includes stable event name, session ID or anonymous journey ID, phase, locale, stable question/custom-preference key where relevant, result/neighborhood/amenity/house IDs where relevant, status/outcome, and non-sensitive metadata. Event identifiers MUST be stable keys and MUST NOT use translated labels, addresses, exact anchors, raw free-text answers, raw additional-preference text, or sensitive household/budget details.

### Data Contracts and State Transitions

Current route compatibility contract:

- Existing hash routes MUST remain valid during the revamp: `#/search`, `#/address/{vbo_id}`, `#/briefing`, `#/saved`, `#/compare`, `#/settings`, existing `#/match/*` routes, shared routes, and prebid pack routes.
- Legacy `#/match/*` routes are compatibility-only surfaces during this revamp and MUST NOT reintroduce dashboards, competing search/match modes, or first-viewport destinations that conflict with the canonical match-first journey.
- New match-first routes or route states MUST be added through the current custom route parser/hash builder unless the plan explicitly updates clean URL rewrites and documents compatibility.
- Dossier route construction MUST retain support for `vbo_id`, `lookup`, `report`, `session_id`, and `buyer_resume` query context because these are already used for address lookup and checkout recovery.

#### Minimum API Contract

- Planning MUST define or preserve request body, response body, stable error-code, and retry/idempotency behavior for `POST /api/match/sessions`, `GET /api/match/sessions/{session_id}`, `PATCH /api/match/sessions/{session_id}/answers`, `POST /api/match/sessions/{session_id}/preference-extraction`, `PATCH /api/match/sessions/{session_id}/custom-preferences`, `POST /api/match/sessions/{session_id}/run`, `GET /api/match/sessions/{session_id}/status`, `GET /api/match/sessions/{session_id}/results`, `GET /api/match/neighborhoods/{neighborhood_id}`, `GET /api/match/neighborhoods/{neighborhood_id}/map-layers`, `GET /api/match/neighborhoods/{neighborhood_id}/buildings`, `GET /api/match/neighborhoods/{neighborhood_id}/amenities`, and `POST /api/match/dossier/from-building`.
- API payloads MUST use stable language-independent keys, include every field required by the guided answer, custom preference, preference vector, match result, confidence, map state, analytics, and Dossier return contracts below, and MUST NOT expose translated labels or raw additional-preference text as stored identifiers.

#### Guided Answer Contract

- Answers MUST be stored as stable keys, never translated labels.
- Required answers MUST include validation status.
- Optional answers MUST be distinguishable from unanswered required answers.
- Editing an answer MUST update the answer timestamp and mark any dependent derived data as stale until recomputed.
- Language changes MUST affect display labels only, not stored values.

#### Custom Preference Contract

- Additional-preference extraction MUST accept raw text only for the extraction request and MUST NOT persist raw text into analytics.
- Extracted preferences MUST use stable `preference_key`, `status`, `privacy_class`, `source_support`, `reason_code`, `review_state`, and optional `clarification_prompt_key` fields.
- Status values MUST be exactly `scoreable`, `map_context_only`, `saved_unsupported`, `disallowed`, or `needs_clarification` unless a later PRD update extends the registry.
- `scoreable` preferences MUST map to an approved scoring feature and source coverage. `map_context_only` preferences MAY affect map overlays or explanation context but MUST NOT affect score. `saved_unsupported` preferences are retained for review/future support but MUST NOT score. `disallowed` preferences MUST be excluded from scoring, ranking, map filters, analytics content, and explanation claims.
- Users MUST review extracted preferences before matching starts.

#### Preference Vector Contract

- Preference vector MUST include raw guided answer references, reviewed custom preference references, hard filters, soft preference weights, avoid/exclusion keys, anchor context, and language key.
- Hard filters MUST be represented separately from weighted preferences.
- Weights MUST be normalized so recommendations can explain relative preference influence.
- Derived vector MUST include version metadata so stale results can be detected after preference edits.
- Only registry-approved `scoreable` custom preferences MAY become hard filters or weighted score inputs.

#### Match Result Contract

- Result set MUST include session ID, job ID, result set ID, preference vector version, completed status, model/scoring version, data version, runtime, evaluation status, generated timestamp, fallback status, and stable failure/fallback reason codes where applicable.
- Each recommendation MUST include rank, neighborhood ID, eligibility, score, stable fit label key, reason codes, tradeoffs, confidence, geometry references, source/freshness metadata, and explicit limitations. Missing or fallback fields MUST be labeled with stable keys rendered through translation keys, not stored translated strings.
- MVP result sets MUST report a weighted-scoring model mode unless a future validated predictive dataset is added.
- Predictive probability fields MUST be absent or clearly disabled unless validation evidence exists.
- Near-miss results MUST be labeled separately from normal top matches.

#### Confidence Contract

- Recommendation confidence MUST be represented as a data-quality confidence score from 0 to 100 plus a stable confidence level key: `high` for 80-100, `medium` for 50-79, `low` for 20-49, and `insufficient` for 0-19.
- Recommendation payloads MUST use this 0-100 confidence contract and the listed level keys; legacy label variants such as `medium_high` MUST NOT be used.
- Confidence MUST describe data completeness, freshness, source coverage, geometry reliability, scoring fallback mode, and missing-feature impact; it MUST NOT be presented as predictive probability, likelihood of happiness, investment certainty, safety certainty, or objective truth.
- A recommendation is considered to have sufficient confidence only when confidence is at least 50 and no blocking limitation exists for geometry, hard-filter eligibility, or required source coverage.
- Confidence MUST be downgraded when required or heavily weighted features are missing, stale, mock-only, sparse, conflicting, fallback-derived, or supported only by approximate geometry; each downgrade MUST be expressible through stable reason or limitation codes.
- Recommendation detail states MUST expose confidence level, important downgrade reasons, and source/freshness limitations in localized copy without adding clutter to onboarding screens.

#### Map State Contract

- Results map state MUST include session ID, job ID, result set ID, preference vector version, selected result ID, map center, zoom, list scroll/selection state, mobile map/list mode, and language.
- Neighborhood detail state MUST include selected neighborhood ID, boundary reference, visible amenity tag keys, selected house/building if any, building footprint loading completeness or active viewport/page cursor, and whether 2D footprints, partial loading, or fallback context are active.
- Dossier return context MUST restore the latest relevant map state without rerunning matching unless preference vector version changed; return target MUST be the selected-neighborhood detail view when the Dossier was opened from a house in that view, otherwise the Netherlands results map.

#### Analytics Event Contract

- Funnel analytics MUST include stable events including `match_landing_cta_shown`, `match_landing_cta_clicked`, `match_survey_intro_shown`, `match_survey_started`, `match_survey_question_shown`, `match_survey_answer_saved`, `match_survey_answer_save_failed`, `match_survey_question_abandoned`, `match_survey_completed`, `match_additional_preferences_prompt_shown`, `match_additional_preferences_skipped`, `match_additional_preferences_submitted`, `match_custom_preferences_extracted`, `match_custom_preferences_reviewed`, `match_custom_preference_rejected`, `match_final_run_cta_clicked`, `match_job_queued`, `match_job_running`, `match_job_completed`, `match_job_failed`, `match_job_completed_with_fallback`, `match_job_completed_no_strong_matches`, `match_job_slow`, `match_results_unavailable`, `match_results_confidence_sufficient`, `match_success_checkmark_shown`, `match_results_map_opened`, `match_recommendation_selected`, `match_map_feature_selected`, `match_map_layer_failed`, `match_neighborhood_detail_opened`, `match_building_layer_failed`, `match_building_layer_partial`, `match_building_layer_complete`, `match_amenity_layer_failed`, `match_missing_footprint_fallback_shown`, `match_amenity_interacted`, `match_house_selected`, `match_no_reliable_address_shown`, `match_dossier_opened`, `match_back_to_map_clicked`, `match_back_to_map_return_success`, and `match_quality_feedback_submitted` where a feedback UI exists.
- Survey drop-off MUST be attributable to stable question keys and step numbers, not translated question text or answer labels.
- Analytics payloads MUST use stable route, question, custom-preference, recommendation, neighborhood, amenity, and status keys; payloads MUST avoid translated labels, exact address anchors, free-text answers, raw additional-preference text, and sensitive personal data.

#### Core State Transitions

1. `landing` -> `survey_intro`: user clicks primary match CTA.
2. `landing` -> `session_create_failed`: session creation fails; localized retry state is shown without promoting address search.
3. `session_create_failed` -> `survey_intro`: user retries and session creation succeeds.
4. `survey_intro` -> `survey_question`: user starts the match.
5. `survey_question[n]` -> `answer_persisting`: user selects or updates an answer.
6. `answer_persisting` -> `survey_question[n]`: answer save fails; localized retry state is shown and the user remains on the same question.
7. `answer_persisting` -> `survey_question[n+1]`: required answer is valid and persisted.
8. `survey_question[n]` -> `survey_question[n-1]`: user uses back control; prior answer is restored.
9. `survey_question[last]` -> `additional_preferences`: final guided answer is valid and persisted.
10. `additional_preferences` -> `preference_extracting`: user submits optional additional-preference text.
11. `additional_preferences` -> `review`: user skips additional preferences.
12. `preference_extracting` -> `additional_preferences`: extraction needs clarification, fails, or is unavailable; localized retry/skip is shown without losing guided answers.
13. `preference_extracting` -> `review`: extracted preferences are classified and ready for user review.
14. `review` -> `matching_queued`: user confirms final CTA; guided answers plus reviewed custom preferences are current.
15. `matching_queued` -> `matching_running`: backend job starts with real status.
16. `matching_running` -> `matching_slow`: plan-defined slow-backend threshold is reached; localized slow-progress copy and slow-backend analytics fire while the same job continues.
17. `matching_running` or `matching_slow` -> `completed_with_fallback`: advanced ranking fails but stable scoring succeeds.
18. `matching_running` or `matching_slow` -> `matching_failed`: no usable results can be produced.
19. `matching_running` or `matching_slow` -> `completed_no_strong_matches`: scoring completes but normal top matches are not strong enough; near-matches and constraint-relaxation actions are shown.
20. `matching_failed` -> `review` or `matching_queued`: user edits answers or retries the same saved session.
21. `matching_running` or `matching_slow` -> `completed`: persisted result set is complete.
22. `completed`, `completed_with_fallback`, or `completed_no_strong_matches` -> `success_checkmark`: user sees the required completion confirmation with clearly labeled fallback or near-match context where applicable before results.
23. `success_checkmark` -> `results_map`: user opens map or timed transition completes.
24. `results_map` -> `results_unavailable`: completed result set is missing, stale, or cannot be loaded; localized recovery is shown without fabricating results.
25. `results_unavailable` -> `review` or `matching_queued`: user edits answers or retries the same saved session.
26. `results_map` -> `neighborhood_detail`: user selects a recommendation.
27. `results_map` or `neighborhood_detail` -> `map_layer_failed`: map, building, or amenity layer fails; localized 2D/list fallback or retry is shown.
28. `map_layer_failed` -> `results_map` or `neighborhood_detail`: user retries or continues with an available fallback.
29. `neighborhood_detail` -> `address_selection_fallback`: user selects a building without a reliable address.
30. `address_selection_fallback` -> `dossier` or `neighborhood_detail`: user chooses a nearby/manual address or returns to map.
31. `neighborhood_detail` -> `dossier`: user selects a house/address with a reliable Dossier path.
32. `dossier` -> `neighborhood_detail` or `results_map`: user activates back-to-match-map action.
33. Any state with changed preferences -> `review`: results are marked stale and matching MUST rerun only after confirmation.

### Data, AI, and Trust Constraints *(mandatory when feature uses data or AI)*

- **Data categories**: Official public data, existing Dossier data, neighborhood feature data, derived internal scores, geometry references, and explicitly labeled mock/seed data where real data is unavailable.
- **Source and freshness**: Recommendation detail and Dossier context MUST show source, loaded date or source date where available, freshness, confidence, missing data, and limitation indicators without cluttering onboarding.
- **AI boundary**: Language models MAY extract user-stated additional preferences into a strict schema, ask bounded clarification questions, and summarize, translate, or explain already-computed structured results. They MUST NOT create or change eligibility, scores, ranks, confidence, reason-code truth, hard-filter outcomes, source metadata, or recommendation limitations.
- **Fairness guardrails**: Protected or sensitive demographic traits MUST NOT be inferred or used to score, exclude, or rank neighborhoods. Household and lifestyle preferences MAY be used only as user-stated needs, not demographic profiling. Religious or cultural amenities MAY appear only as neutral user-requested amenity/map context where official data supports that category.
- **Listing data mode**: This revamp is not a listing marketplace. House selection is a bridge to existing Dossier behavior; any listing or availability signal is a neighborhood-level proxy unless a licensed provider is explicitly added in a later feature.
- **Operational visibility**: Logs and analytics MUST expose data freshness, missing feature data, source failures, match fallback rate, scoring anomalies, guardrail blocks, and job failures for operators without adding a new admin UI surface to MVP scope.
- **Reason codes and limitations**: Recommendations MUST explain fit through stable reason codes, tradeoffs, source-backed data, and limitations. Copy MUST avoid unsupported promises or objective certainty.

## Success Criteria *(mandatory)*

Phase completion test strategy:

- **Phase 1 - UI shell and route cleanup**: Vitest/Testing Library MUST cover the landing hierarchy, demoted search link, route parser/hash builder compatibility, language switcher, reduced-motion hero fallback, and no competing search-first CTA; run `cd frontend && npm run build`, targeted Vitest, and accessibility checks for changed screens.
- **Phase 2 - Guided intake and preference vector**: Frontend tests MUST cover one-question-at-a-time rendering, optional additional-preferences prompt, extraction/review UI, progress, back/edit behavior, validation, refresh persistence, language switching, and stable answer/custom-preference keys; backend tests MUST cover session/answer persistence, custom-preference registry validation, extraction contract handling where enabled, and preference vector generation.
- **Phase 3 - Matching backend**: Backend pytest MUST cover session creation, answer patching, run confirmation, pollable job states, deterministic scoring, hard filters, reason codes, fallback behavior, no predictive probability without labels, and source/freshness metadata; run `cd backend && ruff check .` and relevant non-live pytest.
- **Phase 4 - Progress and success states**: Tests MUST verify progress messages map to the required real backend job stages (`created`, `queued`, `reading_preferences`, `building_profile`, `loading_neighborhood_data`, `applying_filters`, `running_models`, `scoring_tradeoffs`, `preparing_map`, `completed`, `failed`, `completed_with_fallback`, `completed_no_strong_matches`), slow/failed/fallback/no-strong-match states preserve answers, reduced-motion progress is usable, and the success checkmark transitions to results without fake precision.
- **Phase 5 - Results map**: Frontend tests and Playwright checks MUST cover Netherlands initial view, ranked list/map synchronization, marker or polygon selection, mobile map/list switching, keyboard-accessible non-map alternatives, and no match rerun when selecting a result.
- **Phase 6 - Neighborhood 2D building detail**: Tests MUST prove building-footprint requests happen only after a neighborhood is selected and only for selected-neighborhood bounds, never nationally; prove progressive footprint paging/completion metadata and honest partial-loading copy; verify missing-footprint/reduced-motion fallbacks, amenity tag limits, house-selection availability, and the 3-second usable-state budget on target acceptance profiles named by the implementation plan before Phase 6 work starts.
- **Phase 7 - Dossier bridge**: Integration and E2E tests MUST cover house-to-address resolution or fallback, entry into existing `#/address/{vbo_id}` Dossier, preservation of Dossier/export/risk-card contracts, persistent localized back-to-match-map action, restored selected-neighborhood/results map state, and opening a second house without restarting or rerunning matching.

### Measurable Outcomes

- **SC-001**: At least 90% of first-time usability test participants can identify the primary action on the landing screen within 5 seconds.
- **SC-002**: 100% of landing screen variants show address search as a secondary link rather than an equal CTA, card, tab, or mode choice.
- **SC-003**: At least 80% of test users can complete the guided intake and either submit or skip additional preferences without external guidance on mobile.
- **SC-004**: No guided intake screen displays more than one question at a time in automated or manual acceptance checks, and the additional-preferences step remains one focused prompt rather than an unbounded chat surface.
- **SC-005**: 100% of completed guided intake sessions produce a valid preference vector with hard filters, weights, raw answer references, reviewed custom-preference statuses, and language-independent keys.
- **SC-006**: 100% of match runs start only after final review confirmation.
- **SC-007**: At least 95% of successful match runs return ranked neighborhoods with required eligibility, score, stable fit label key, reason codes, tradeoffs, 0-100 data-quality confidence score, confidence level key, confidence downgrade reasons where applicable, geometry references, source/freshness metadata, explicit limitations, runtime, evaluation status, and model/data version metadata.
- **SC-008**: 0 user-facing recommendation screens claim predictive probability or objective best fit unless validation evidence is present.
- **SC-009**: At least 95% of completed match sessions can open the Netherlands results map and select a neighborhood from either the list or map.
- **SC-010**: 0 selected-neighborhood detail states load or render national building-footprint or national 3D building data, and 0 selected-neighborhood detail states present an unlabeled representative building sample as complete neighborhood coverage.
- **SC-011**: At least 95% of Dossier entries opened from match context can return to the prior match map state without rerunning matching.
- **SC-012**: 100% of new or changed user-facing strings in the revamp have English and Dutch translation keys.
- **SC-013**: Core flow accessibility checks verify keyboard navigation, screen-reader labels, focus management, perceivable progress and failure states, readable text contrast including over hero/map backgrounds, touch targets, reduced motion, map/list interactions, Dossier return action, and non-map alternatives for all major screens.
- **SC-014**: Funnel and drop-off analytics cover the stable event keys listed in the Analytics Event Contract, including landing CTA, survey intro, survey start, survey question shown, survey answer saved or failed, question-level drop-off by stable question key, survey completion, additional-preferences prompt shown/skipped/submitted, custom-preference extraction/review outcomes by stable keys/statuses only, final run CTA, match job queued/running/completed/failed/completed-with-fallback/completed-no-strong-matches, match runtime, slow backend, no strong matches, unavailable results, results confidence sufficiency, success checkmark, results open, recommendation list select, map marker or polygon select, neighborhood detail open, map/building/amenity layer failures, missing-footprint fallback, amenity interaction, house select, no reliable address, Dossier open, back-to-map clicked, back-to-map return success, failures, fallbacks, and quality feedback events where a feedback UI exists.
- **SC-015**: At least 95% of selected-neighborhood detail acceptance runs on plan-defined target acceptance device profiles become usable within 3 seconds after neighborhood selection by showing the selected boundary plus either fallback context or first selected-neighborhood 2D footprint content.
- **SC-016**: At least 95% of users who return from Dossier to the match map can open a second house Dossier from the preserved same-neighborhood or ranked-results context without restarting the survey or rerunning matching.

## Assumptions

- Users are anonymous for MVP matching unless an existing account or entitlement flow is already in use elsewhere in the product.
- Match results and on-screen viewer remain free unless an existing product contract already requires gating outside this revamp.
- Existing Dossier, risk-card, entitlement, quick brief, and full dossier export contracts remain in force and are not redesigned by this feature.
- Current seed/mock match data MAY be used only when clearly labeled; production claims require real source/freshness metadata.
- Because no historical predictive labels exist in the repository, the first implementation MUST use deterministic or semi-deterministic weighted scoring; predictive or model-selection claims require future validation data.
- The MVP hero map MUST use a pre-rendered map loop, optimized 2D canvas, or static map image with subtle motion; live 3D MAY be revisited only after performance and accessibility budgets are proven.
- The Netherlands is the intended results context. If data coverage is incomplete, unavailable areas MUST be labeled through confidence or limitation states rather than hidden behind unsupported certainty.
- The guided intake's exact wording MAY evolve during design, but it MUST remain 10 to 12 core questions plus one optional additional-preferences prompt, one mental action at a time, and fully bilingual through translation keys.
- The optional additional-preferences prompt is an intake aid, not an AI recommendation chat; it can be shipped with deterministic extraction rules first and an LLM extractor only after the strict schema, registry, privacy, and review contracts are implemented.
