<!--
Sync Impact Report
Version change: 2.1.0 -> 2.2.0
Modified principles:
- I. Product Flow Is Sacred: expanded banned first-viewport search patterns
- V. Model Honesty: expanded structured match-results evidence contract
- VI. Existing Dossier Preservation: hardened Dossier rewrite restriction
- VII. Accessibility Is Mandatory: made mobile, reduced-motion, failure, and
  non-map alternatives non-deferrable
- VIII. Test Every Phase: generalized quality-gate language and required
  traceability rows before phase closure
- IX. Preserve Context: expanded required persisted/return context fields
- XII. Small Safe Changes: SHOULD -> MUST for smallest safe change
Added sections:
- XIII. Run And Results Are Gated
- XIV. Results Map Starts National
- XV. Failure States And Analytics Are Required
Removed sections:
- None
Templates requiring updates:
- pending by explicit file-scope constraint: .specify/templates/plan-template.md
- pending by explicit file-scope constraint: .specify/templates/spec-template.md
- pending by explicit file-scope constraint: .specify/templates/tasks-template.md
- pending by explicit file-scope constraint: .specify/templates/checklist-template.md
- pending by explicit file-scope constraint: .specify/templates/commands/*.md
Runtime guidance requiring updates:
- updated: docs/ai/implementation_rules.md
- updated: docs/ai/latest_handoff.md
- not updated by explicit file-scope constraint: AGENTS.md
- not updated by explicit file-scope constraint: CLAUDE.md
Follow-up TODOs:
- Re-run SpecKit template synchronization when edits outside the three-file
  scope are permitted.
-->
# Buurt Check Match-First Revamp Constitution

## Core Principles

### I. Product Flow Is Sacred
All match-first revamp implementation MUST preserve the primary journey:
landing hero -> survey intro -> one-question survey -> review -> backend
matching progress -> animated checkmark success -> Netherlands results map ->
neighborhood 3D detail -> house click -> existing Dossier -> back to match map.
Address search MAY remain available as a secondary path, but it MUST NOT compete
with neighborhood matching on the first screen as a search form, equal CTA,
equal card, tab, mode choice, or visually dominant first-viewport destination.

Rationale: The revamp exists to remove the search-versus-match split. Any
implementation that makes users choose a mode before understanding the product
breaks the central product decision.

### II. Minimal UI, One Decision Per Screen
Onboarding screens MUST ask for exactly one mental action at a time. The survey
MUST show exactly one question at a time, with one progress indicator and a back
path after the first question. Landing, intro, survey, review, progress, and
success states MUST NOT include dashboards, charts, feature grids, long
explanations, ads, pricing blocks, unrelated cards, or exploratory map controls.

Rationale: The PRD prioritizes calm guided discovery. Extra UI during onboarding
creates cognitive load and reintroduces the dashboard pattern the revamp removes.

### III. Bilingual By Design
Every user-facing string introduced or changed by the revamp MUST use
translation keys with Dutch and English values. Components, services, route
labels, progress states, fallback states, validation messages, error messages,
map labels, and Dossier return actions MUST NOT hard-code English or Dutch copy.
Stored values and API payloads MUST use stable language-independent keys.

Rationale: Bilingual support is a product requirement for Dutch users and
international home seekers. Deferring translations makes the flow harder to test
and easier to regress.

### IV. Map Performance First
The app MUST NOT load national 3D buildings. 3D houses MUST load and render
only after a neighborhood is selected, and only within that selected
neighborhood's bounds. Viewport-based loading MAY be used only as a paging or
level-of-detail strategy inside the selected neighborhood, never as an
independent trigger outside it. Results maps MUST provide a 2D fallback,
missing-3D fallback, reduced-motion fallback, and a non-map list alternative.
Hero map animation MUST remain lightweight enough that first-screen readability
and CTA interaction are not delayed by 3D work.

Rationale: The map is central to the experience, but nationwide 3D loading would
damage performance, accessibility, and mobile usability.

### V. Model Honesty
The product MUST NOT claim validated predictive probability, highest predictive
power, objective best fit, or model superiority unless real labels, validation
data, and evaluation results exist. Without labels, matching MUST use
deterministic or semi-deterministic weighted scoring and present the result as a
data-backed fit score with reason codes, confidence, tradeoffs, and limitations.
LLM output MAY explain or translate structured results, but it MUST NOT create
or change match scores, eligibility, confidence, or reason-code truth.

Matching output MUST include the structured evidence required to interpret a
recommendation: eligibility, score or fit label, reason codes, tradeoffs,
confidence, geometry references, model/scoring version, data version, runtime,
evaluation status, source/freshness metadata, and explicit limitations. Missing
or fallback fields MUST be labeled rather than silently omitted.

Rationale: Users make high-stakes housing decisions. Overstating model certainty
would create false trust and legal/product risk.

### VI. Existing Dossier Preservation
The current Dossier interface MUST remain functional throughout the revamp. The
revamp MAY add route context, a house-selection bridge, and a persistent
"Back to match map" action, but it MUST NOT rewrite Dossier modules, risk cards,
entitlement behavior, checkout recovery, PDF/export contracts, or premium/free
content boundaries unless the change is required for route/context preservation
and is covered by regression evidence. Dossier changes MUST be scoped to the
smallest change required for the match journey.

Rationale: The Dossier is an existing product surface with its own evidence,
payment, export, and risk-card contracts. Discovery work must not destabilize it.

### VII. Accessibility Is Mandatory
Keyboard navigation, screen-reader labels, touch targets, text contrast, reduced
motion, focus management, perceivable status states, and non-map list
alternatives are P0 requirements. Core match flow screens, map/list
interactions, progress states, failure states, and the Dossier return action MUST
be usable without a mouse and MUST remain readable on mobile and desktop.
Mobile layout, reduced motion, failure states, and non-map alternatives MUST NOT
be deferred as polish.

Rationale: The primary journey cannot depend on pointer-only map interaction,
motion tolerance, or visual-only cues.

### VIII. Test Every Phase
Each phase MUST include unit tests, integration tests, or E2E tests appropriate
to its risk and acceptance criteria. A phase is complete only when the relevant
acceptance criteria pass under test or verification. Implementers MUST NOT skip
tests to move faster. Any blocked test gate MUST document the command, blocker,
residual risk, and follow-up condition before the phase can be reviewed. Failed
tests MUST be reported honestly and added to the punch list or traceability
notes until fixed. Phase completion also requires the acceptance-linked
traceability rows to be updated before the phase is considered closed.

Rationale: This revamp spans routing, state persistence, matching, maps,
accessibility, and the Dossier bridge. Visual polish alone is not evidence of
correct behavior.

### IX. Preserve Context
Survey answers, session ID, selected neighborhood, result state, map center,
map zoom, list scroll position, mobile map/list mode, selected result ID/rank,
selected house/building, language, matching status, return route, and Dossier
return path MUST survive navigation and the Dossier round trip. A user MUST NOT
be forced to restart the survey after opening a Dossier or moving back from
Dossier to the match map. Any refresh persistence gap MUST be documented as
missing or partial in traceability, never treated as pass.

Rationale: The product flow fails if users lose their recommendation context
while inspecting houses.

### X. No Unsupported Claims
The app MUST NOT promise perfect fit, safety, happiness, investment certainty,
future value, guaranteed affordability, or guaranteed lifestyle outcomes.
Explanations MUST be grounded in available data, deterministic score inputs,
reason codes, source/freshness metadata, and explicit limitations. Missing,
mock, stale, or fallback data MUST be labeled rather than hidden or inflated.

Rationale: Buurt Check can help users reason about neighborhoods and houses, but
it cannot guarantee personal outcomes or market performance.

### XI. Traceability Is Required
Every PRD acceptance criterion MUST map to implementation files, tests or
manual verification, and an honest status of missing, partial, or pass. Codex
and human implementers MUST update
`docs/qa/match_first_revamp_traceability.md` and
`docs/ai/latest_handoff.md` after each implementation phase with completed
work, commands run, residual risks, next steps, and any failed or blocked
checks. An acceptance criterion that is not implemented MUST be marked missing
or partial, never pass.

Rationale: The revamp is complete only when PRD criteria are proven with
evidence. Traceability prevents broad summaries from hiding missing behavior.

### XII. Small Safe Changes
Work MUST proceed phase by phase in the order justified by the PRD, current
architecture, and active tasks. Implementers MUST NOT jump to later phases,
introduce new frameworks, rewrite unrelated modules, or add new product scope
without explicit justification in the plan or task list. Changes MUST be the
smallest safe change that preserves the canonical journey, Dossier behavior,
i18n, accessibility, map performance, model honesty, and context persistence.

Rationale: The highest-risk failures in this repository come from broad
rewrites, mixed old/new match assumptions, and product scope drift. Small
verified increments keep the revamp reviewable.

### XIII. Run And Results Are Gated
Backend matching MUST start only after the user reaches the review screen and
activates the final run CTA. Survey answer persistence, preference-vector
creation, validation, and review readback MAY happen earlier, but match jobs,
ranking, and result generation MUST NOT begin before final user confirmation.
Progress, success, and results screens MUST be backed by real persisted
session/job/result state, not optimistic local state.

Rationale: Starting matching early breaks user consent, makes review
misleading, and can show completed-looking states without backend evidence.

### XIV. Results Map Starts National
The first completed results view MUST open centered on the Netherlands with a
ranked recommendation list and synchronized map markers or areas. The UI MAY
fly to a selected neighborhood only after the national results state is
available and the user chooses a recommendation or restores an explicit saved
selection.

Rationale: The PRD requires national orientation first, then neighborhood
inspection. Skipping directly into local detail removes the discovery step.

### XV. Failure States And Analytics Are Required
Slow backend, failed backend, completed-with-fallback scoring, no strong
matches, missing 3D data, and no reliable address for a selected house MUST
have bilingual, accessible, non-deceptive recovery states. Match-first analytics
MUST cover funnel progress, survey drop-off, match job success/fallback, map and
list engagement, neighborhood detail entry, house click, Dossier open, and
back-to-map return. User-facing analytics labels MUST use translation keys, and
stored analytics values MUST use stable language-independent keys.

Rationale: The product cannot be operated or trusted if failure and engagement
states are invisible or treated as optional.

## Canonical Match-First Journey

The canonical journey for this revamp is:

1. Landing hero with one dominant match CTA and demoted address search.
2. Survey intro explaining the purpose in brief bilingual copy.
3. One-question-at-a-time survey with progress, back behavior, and persistence.
4. Review screen with a single final run CTA.
5. Backend matching progress backed by real persisted session/job state.
6. Animated checkmark success with reduced-motion fallback.
7. Netherlands-centered results map with ranked list and map/list
   synchronization.
8. Selected-neighborhood detail with selected-neighborhood-only 3D houses,
   amenities, and 2D fallback.
9. House click or selection bridge into the existing Dossier.
10. Persistent return from Dossier to the match map without losing context.

Plans, specs, tasks, code reviews, and tests MUST explicitly state which step or
steps they affect. Any deviation from this sequence MUST be documented as a
conflict and justified under Conflict Handling.

## Implementation Gates

Before planning, Codex or any implementer MUST read `docs/prd.md`,
`docs/context/current_architecture.md`, `docs/ai/implementation_rules.md`, and
`.specify/memory/constitution.md`. Plans MUST cite the relevant PRD
requirements, the affected journey step, the current architecture constraint,
the smallest safe technical approach, accessibility/i18n impact, map
performance impact, model-honesty impact, Dossier impact, context-persistence
impact, traceability impact, and test strategy.

Before implementation, Codex or any implementer MUST also read
`docs/ai/latest_handoff.md` and
`docs/qa/match_first_revamp_traceability.md`. Task generation MUST produce
tasks with exact file paths, acceptance criteria, PRD traceability, affected
journey step, required tests, and explicit verification commands. Tasks that
touch the Dossier, map loading, matching scores, context persistence, route
state, or user-facing copy MUST include regression coverage.

During implementation, tests MUST NOT be skipped to move faster. The responsible
implementer MUST run the relevant quality gates for touched areas, including
lint, build, unit, integration, E2E, accessibility, map verification, and any
feature-specific checks listed in the plan. Exact commands belong in repository
runtime guidance, templates, tasks, or the active implementation plan.

## Conflict Handling

If a revamp requirement conflicts with the existing codebase, the implementer
MUST document the conflict, identify the user-visible risk, and propose the
smallest safe change that preserves the canonical journey. Broad rewrites,
dependency additions, Dossier module changes, routing changes, or map-engine
changes MUST explain why smaller adaptations are insufficient.

If the existing code cannot satisfy a requirement in the current phase, the plan
or task list MUST mark the gap explicitly with an owner, acceptance criteria for
closing it, and the behavior users will see until it is closed.

## Governance

This constitution supersedes conflicting implementation assumptions, generated
plans, task templates, runtime guidance, and informal instructions for the Buurt
Check match-first UI revamp. `docs/prd.md` remains the product source of truth;
this constitution governs how PRD requirements are translated into
implementation.

Amendments MUST include a Sync Impact Report, identify affected principles or
sections, update dependent Spec Kit templates, and state the semantic version
bump. MAJOR changes remove or redefine governance obligations in a
backward-incompatible way. MINOR changes add principles, sections, or materially
expanded requirements. PATCH changes clarify wording without changing
compliance obligations.

All specs, plans, task lists, code reviews, and phase-completion decisions MUST
verify constitution compliance. Violations MAY proceed only when documented in
the plan's Complexity Tracking section with a reason, rejected simpler
alternative, owner, and follow-up review condition.

**Version**: 2.2.0 | **Ratified**: 2026-05-11 | **Last Amended**: 2026-05-15
