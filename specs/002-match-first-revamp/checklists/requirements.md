# Specification Quality Checklist: Buurt Check Match-First UI Revamp

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-12
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] Implementation constraints are limited to constitution-required current-architecture facts, route/API compatibility, and planning blockers
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria remain measurable and product-facing while implementation constraints are isolated in clarifications, dependencies, and planning gates
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] Implementation details do not leak into product behavior requirements except where constitution/current-architecture constraints are required for safe planning

## Notes

- Validation pass 1 completed on 2026-05-12.
- The spec intentionally records existing architecture conflicts only as constraints and smallest-safe-change guidance; implementation details are deferred to planning.
- No clarification markers remain. PRD open decisions were resolved using explicit user instructions where provided: the primary CTA is "Find my dream neighborhood" / "Vind mijn droombuurt"; the guided intake remains one question at a time with one optional additional-preferences prompt; model output must not overclaim predictive power; selected-neighborhood buildings render as scoped 2D footprints; Dossier is preserved with back-to-match-map context.
- 2026-05-21 reassessment added the hybrid additional-preferences workflow: strict-schema extraction, custom-preference registry statuses, user review, privacy-safe analytics, and no LLM scoring/ranking/exclusion/inference.
- 2026-05-22 reassessment clarified selected-neighborhood building footprints: the intended UX is all available selected-neighborhood or current selected-neighborhood viewport footprints loaded progressively with honest partial states, not an unlabeled representative sample.
- Reassessment on 2026-05-12 corrected stale generic checklist wording so constitution-required architecture constraints are not incorrectly treated as specification defects.

---

# Requirements Quality Checklist: Match-First PRD Compliance

**Purpose**: Validate that the match-first revamp requirements are complete, clear, consistent, measurable, and ready for planning against `docs/prd.md` and the constitution.
**Created**: 2026-05-12
**Feature**: [spec.md](../spec.md)

**Note**: These items test the quality of the written requirements, not whether implementation already behaves correctly.
**Input Limitation**: `.specify/scripts/powershell/check-prerequisites.ps1 -Json` reported that `plan.md` is missing for `specs/002-match-first-revamp`; this checklist is therefore based on `spec.md`, `docs/prd.md`, `docs/context/current_architecture.md`, and `.specify/memory/constitution.md`.

## Requirement Completeness

- [x] CHK001 Are landing hierarchy requirements complete enough to prevent address search from appearing as an equal CTA, equal card, tab, or mode choice alongside matching? [Completeness, Spec §FR-002, Spec §FR-003, PRD §6.2, Constitution I]
- [x] CHK002 Are landing requirements complete for one dominant match CTA, language switcher, lightweight map atmosphere, reduced-motion fallback, low-bandwidth fallback, and explicit exclusion of search forms or feature grids? [Completeness, Spec §FR-001 to §FR-006, PRD §8.1]
- [x] CHK003 Are survey intro requirements complete for a brief purpose explanation and exactly one localized start CTA before questions begin? [Completeness, Spec §FR-007 to §FR-010, PRD §7 Phase 1]
- [x] CHK004 Are survey flow requirements complete for exactly one question at a time, progress indicator, back control after question one, validation, answer editing, and persistence within an active session? [Completeness, Spec §FR-011 to §FR-015, PRD §8.2]
- [x] CHK005 Are guided intake content requirements complete for 10 to 12 core steps covering intent, budget, household, anchor, commute, lifestyle priorities, must-haves, dealbreakers, housing type, area character, language/report preference where needed, plus optional additional preferences and review? [Completeness, Spec §FR-016, Spec §FR-018, PRD §8.3]
- [x] CHK005A Are additional-preference requirements complete for one focused optional prompt, skip path, strict-schema extraction, registry classification, and user review before matching? [Completeness, Spec §FR-021A to §FR-021C, PRD §8.4.1]
- [x] CHK006 Are answer persistence requirements complete for refresh, navigation away, language changes, answer edits, and downstream stale-state handling? [Completeness, Spec §FR-013, Spec §FR-014, Spec §FR-019, Spec §Edge Cases]
- [x] CHK007 Are bilingual translation-key requirements complete for landing, survey, review, validation, progress, success, map, fallback, route label, accessibility label, and Dossier return text? [Completeness, Spec §FR-063, Spec §FR-064, Constitution III]
- [x] CHK008 Are stored guided answer, custom-preference, and preference-vector requirements complete enough to ensure stable language-independent keys are stored instead of translated strings or raw free text? [Completeness, Spec §FR-017, Spec §Guided Answer Contract, Spec §Custom Preference Contract, Spec §Preference Vector Contract]
- [x] CHK009 Are review and run requirements complete for a concise summary, one final run CTA, and an explicit prohibition on starting matching before final review confirmation? [Completeness, Spec §FR-022 to §FR-025, PRD §7 Phase 3]
- [x] CHK010 Are matching output requirements complete for fit score or label, reason codes, tradeoffs, confidence, geometry references, source/freshness metadata, model version, data version, and evaluation status? [Completeness, Spec §FR-029, Spec §FR-031, Spec §Match Result Contract, PRD §8.5]
- [x] CHK011 Are model-honesty requirements complete for deterministic or semi-deterministic weighted scoring, absent or disabled predictive probability fields, no probability or model-superiority claims without validation labels and evaluation results, and no LLM-created scores/ranks/eligibility/confidence/source metadata? [Completeness, Spec §FR-032, Spec §FR-033, Spec §FR-034A, Spec §Match Result Contract, Constitution V]
- [x] CHK012 Are progress-screen requirements complete for friendly localized status messages, real job-stage mapping, perceivable progress, reduced-motion alternative, slow/failure recovery, and no technical logs or fake precision? [Completeness, Spec §FR-035 to §FR-038, PRD §14.4 to §14.6]
- [x] CHK013 Are success-state requirements complete for a large Buurt Check checkmark, localized completion copy, reduced-motion variant, and transition or single CTA into the map? [Completeness, Spec §FR-039 to §FR-041, PRD §7 Phase 5]
- [x] CHK014 Are results-map requirements complete for a Netherlands-centered starting context, ranked neighborhood list, map features, concise reasons, detail expansion, mobile map/list mode, and non-map alternative? [Completeness, Spec §FR-042 to §FR-049, PRD §7 Phase 6]
- [x] CHK015 Are list/map synchronization requirements complete in both directions, including selected neighborhood state, highlight behavior, scroll/zoom preservation, and screen-reader access through the list alternative? [Completeness, Spec §FR-043, Spec §FR-046 to §FR-049, Spec §Map State Contract]
- [x] CHK016 Are selected-neighborhood detail requirements complete for boundary focus, selected-neighborhood-only all-available/progressively loaded 2D footprints, measurable performance budget, partial-loading and missing-footprint explanations, basemap/list fallback, preference-aware amenities, house selection, and return to results? [Completeness, Spec §FR-050 to §FR-056, Constitution IV]
- [x] CHK017 Are amenity-tag requirements complete for deriving visible tags from stable preference keys, limiting the default visible set, using translation keys for labels, and including relevance reason/source metadata? [Completeness, Spec §FR-054, Spec §Amenity Tag Set, PRD §16.4]
- [x] CHK018 Are house-selection and Dossier bridge requirements complete for reliable address resolution, fallback address selection, existing Dossier entry, route context preservation, and no Dossier redesign? [Completeness, Spec §FR-055, Spec §FR-057, Spec §FR-062, Constitution VI]
- [x] CHK019 Are Back-to-match-map requirements complete for persistent localized action, prior selected-neighborhood or results-map target, map center/zoom/list/mobile state, language, selected house context, and no rerun unless preferences changed? [Completeness, Spec §FR-058 to §FR-061, Spec §Dossier Return Context, Constitution IX]
- [x] CHK020 Are analytics requirements complete for landing CTA, survey start, question-level drop-off, survey completion, additional-preferences prompt/extraction/review outcomes, match run, failure/fallback, results open, neighborhood selection, amenity interaction, house selection, Dossier open, back-to-map use, and quality feedback, without storing raw free text? [Completeness, Spec §FR-071, Spec §FR-072, Spec §SC-014, PRD §20]

## Requirement Clarity

- [x] CHK021 Is "visually secondary search" defined with enough specificity that reviewers can distinguish a small secondary text link from an equal button, card, tab, or mode selector? [Clarity, Spec §FR-003, Spec §FR-075, PRD §6.2]
- [x] CHK022 Is "exactly one question at a time" defined clearly enough to exclude sidebars, secondary prompts, tips, maps, charts, dashboards, and unrelated cards from survey steps? [Clarity, Spec §FR-011, Spec §FR-020, Constitution II]
- [x] CHK023 Is the survey progress requirement specific about what the user sees during every question step and how progress remains perceivable for assistive technologies? [Clarity, Spec §FR-012, Spec §FR-065]
- [x] CHK024 Is the back-control requirement specific about after-question-one availability, answer restoration, dependent-answer invalidation, and persistence boundaries? [Clarity, Spec §FR-013, Spec §Guided Answer Contract]
- [x] CHK025 Is the final CTA boundary specific about which state transition creates a match job and which prior states must not create one? [Clarity, Spec §FR-025, Spec §Core State Transitions]
- [x] CHK026 Is the preference vector contract specific about hard filters versus soft weights, raw answer references, reviewed custom-preference statuses, exclusions, anchor context, normalized weights, and vector version metadata? [Clarity, Spec §FR-026, Spec §FR-027, Spec §Preference Vector Contract]
- [x] CHK027 Is "confidence" defined sufficiently for recommendation output, missing or stale data, fallback scoring, and user-facing limitations? [Clarity, Spec §FR-031, Spec §FR-034, Spec §Data AI and Trust Constraints]
- [x] CHK028 Is the no-predictive-claims rule specific about prohibited phrases and fields such as validated probability, objective best, highest predictive power, and model superiority? [Clarity, Spec §FR-033, Spec §SC-008, Constitution V]
- [x] CHK029 Is the selected-neighborhood-only 2D footprint requirement specific enough to prohibit national building-footprint and national 3D building requests, viewport-triggered loading outside the selected neighborhood, and unlabeled representative samples? [Clarity, Spec §FR-051, Constitution IV]
- [x] CHK030 Is the Dossier preservation requirement specific about which existing contracts are out of scope for casual rewrite, including risk cards, entitlement, PDF/export, and premium/free boundaries? [Clarity, Spec §FR-062, Constitution VI]

## Requirement Consistency

- [x] CHK031 Do the landing requirements consistently express match-first as the primary product flow while keeping search technically available only as a secondary path? [Consistency, Spec §FR-002, Spec §FR-003, Spec §FR-075, PRD §27.3]
- [x] CHK032 Do i18n requirements consistently separate translated display labels from stable stored keys in survey answers, preference vectors, analytics events, amenity tags, and route/state payloads? [Consistency, Spec §FR-017, Spec §FR-063, Spec §FR-064, Spec §FR-072]
- [x] CHK033 Do matching requirements consistently describe MVP output as weighted fit scoring rather than validated predictive probability across functional requirements, contracts, success criteria, assumptions, and trust constraints? [Consistency, Spec §FR-032, Spec §FR-033, Spec §SC-008, Spec §Assumptions]
- [x] CHK034 Do progress and success requirements align with the canonical journey sequence from review confirmation to progress, checkmark success, and Netherlands results map? [Consistency, Spec §FR-035 to §FR-042, Spec §Core State Transitions, Constitution Canonical Journey]
- [x] CHK035 Do map requirements consistently preserve selected neighborhood and list/map state when moving between Netherlands results, neighborhood detail, Dossier, and return paths? [Consistency, Spec §FR-048, Spec §FR-056, Spec §FR-060, Spec §Map State Contract]
- [x] CHK036 Do 2D building-footprint requirements consistently enforce selected-neighborhood scope, progressive all-available loading, completion metadata, partial-state copy, and no representative-sample claims across functional requirements, edge cases, performance targets, tests, and constitution constraints? [Consistency, Spec §FR-051, Spec §FR-052, Spec §SC-010, Spec §Success Criteria]
- [x] CHK037 Do Dossier requirements consistently preserve the existing Dossier while allowing only route context, house-selection bridge, and persistent back-to-match-map action as revamp changes? [Consistency, Spec §FR-057 to §FR-062, Constitution VI]
- [x] CHK038 Do analytics requirements consistently use stable event names and privacy-safe payloads rather than translated labels or sensitive user context? [Consistency, Spec §FR-068, Spec §FR-071, Spec §FR-072, PRD §19, PRD §20]

## Acceptance Criteria Quality

- [x] CHK039 Are acceptance criteria for landing hierarchy measurable enough to determine whether search competes visually with matching across desktop and mobile variants? [Acceptance Criteria, Spec §User Story 1, Spec §SC-001, Spec §SC-002]
- [x] CHK040 Are acceptance criteria for one-question guided intake screens objective enough to detect multiple visible questions, missing progress, missing back path, non-persisted answers, or an additional-preferences prompt that becomes unbounded chat? [Acceptance Criteria, Spec §User Story 2, Spec §SC-003, Spec §SC-004]
- [x] CHK041 Are acceptance criteria for backend run timing objective enough to prove no match run exists before final review confirmation and every run has real pollable state afterward? [Acceptance Criteria, Spec §User Story 3, Spec §SC-006]
- [x] CHK042 Are acceptance criteria for matching output objective enough to validate every required explanation and metadata field without relying on vague "good recommendation" language? [Acceptance Criteria, Spec §User Story 3, Spec §SC-007]
- [x] CHK043 Are acceptance criteria for predictive-claim prevention measurable enough to enforce zero unsupported probability or objective-best claims in user-facing recommendation screens? [Acceptance Criteria, Spec §SC-008]
- [x] CHK044 Are acceptance criteria for progress and success states measurable enough to distinguish friendly localized status messages, non-technical fallbacks, animated checkmark, reduced-motion checkmark, and transition to results? [Acceptance Criteria, Spec §User Story 4, Spec §Phase 4 Test Strategy]
- [x] CHK045 Are acceptance criteria for results map and list synchronization measurable for map-to-list, list-to-map, mobile map/list switching, keyboard list alternative, and no matching rerun on selection? [Acceptance Criteria, Spec §User Story 5, Spec §SC-009]
- [x] CHK046 Are acceptance criteria for selected-neighborhood 2D footprints precise enough to measure no national building-footprint/3D data, selected-neighborhood bounds only, progressive all-available loading or honest current-viewport partial state, basemap/list fallback, amenity limits, and 3-second usable-state budget? [Acceptance Criteria, Spec §User Story 6, Spec §SC-010, Spec §SC-015]
- [x] CHK047 Are acceptance criteria for Dossier round trip measurable for Dossier entry, persistent localized back action, state restoration, no rerun, and opening another house after return? [Acceptance Criteria, Spec §User Story 7, Spec §SC-011, Spec §SC-016]
- [x] CHK048 Are accessibility acceptance criteria decomposed into testable keyboard navigation, screen-reader labels, focus management, contrast, touch targets, reduced motion, status perception, and non-map alternatives? [Acceptance Criteria, Spec §FR-065, Spec §FR-066, Spec §SC-013]
- [x] CHK049 Are analytics acceptance criteria measurable for funnel, custom-preference extraction/review, and drop-off instrumentation, including event names, phase coverage, failure/fallback events, no raw free text, and privacy-safe metadata? [Acceptance Criteria, Spec §FR-071, Spec §FR-072, Spec §SC-014]

## Scenario and Edge Case Coverage

- [x] CHK050 Are refresh and resume scenarios covered for survey, progress, results, selected-neighborhood detail, Dossier, and return-to-map without silently losing completed answers? [Coverage, Spec §Edge Cases, Spec §FR-076]
- [x] CHK051 Are language-change scenarios covered so visible copy changes while stored values, preference vector keys, analytics identifiers, and selected state remain stable? [Coverage, Spec §Edge Cases, Spec §FR-017, Spec §FR-063]
- [x] CHK052 Are slow, failed, and completed-with-fallback matching scenarios covered with localized friendly messages, answer preservation, retry behavior, and honest fallback labeling? [Coverage, Spec §FR-034, Spec §FR-037, Spec §FR-073]
- [x] CHK053 Are missing/stale data scenarios covered for recommendation confidence, limitations, source freshness, no strong matches, near-misses, missing footprints, unsupported custom preferences, extraction unavailable states, and no address for selected building? [Coverage, Spec §Edge Cases, Spec §FR-067, Spec §FR-073]
- [x] CHK054 Are non-map and reduced-motion scenarios covered across hero, survey transitions, progress, checkmark, map movement, neighborhood detail, and house/Dossier entry? [Coverage, Spec §Edge Cases, Spec §FR-005, Spec §FR-036, Spec §FR-041, Spec §FR-049]
- [x] CHK055 Are accessibility failure modes covered for users who cannot use a pointer map, cannot tolerate motion, rely on screen readers, use keyboard only, or use mobile touch input? [Coverage, Spec §FR-021, Spec §FR-065, Spec §FR-066]

## Dependencies and Assumptions

- [x] CHK056 Are current-architecture conflicts documented as requirements inputs, including search-first landing, multi-section match form, synchronous match endpoints, projected marker map, no selected-neighborhood 2D footprint layer, no custom-preference extraction/registry, and no Dossier return context? [Dependency, Spec §Known Codebase Conflicts, Current Architecture Memo]
- [x] CHK057 Are backend job-state dependencies documented clearly enough for planning to choose a real persisted or pollable approach rather than frontend-only fake progress? [Dependency, Spec §FR-028, Spec §Backend Execution Baseline]
- [x] CHK058 Are map-layer dependencies documented clearly enough for planning to avoid treating the existing projected `MatchMap` as sufficient for Netherlands pan/zoom/polygon/list synchronization? [Dependency, Spec §Map and 3D Baseline, Current Architecture Memo]
- [x] CHK059 Are predictive-data assumptions documented clearly enough to block predictive probability fields until real labels, validation data, and evaluation results exist? [Assumption, Spec §Predictive-data Baseline, Spec §Assumptions]
- [x] CHK060 Are plan and task prerequisites explicit enough that the next Spec Kit steps must add exact file paths, acceptance criteria, PRD traceability, affected journey steps, required tests, and verification commands before implementation? [Process, Constitution Implementation Gates]
