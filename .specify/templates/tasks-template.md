---

description: "Task list template for feature implementation"
---

# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED for every phase touched by the feature. Use unit,
integration, E2E, accessibility, or map-performance verification according to
the acceptance criteria and risk. A phase is not complete when it looks good; it
is complete when its acceptance criteria pass with evidence. Failed or blocked
test gates MUST be reported honestly and carried into the punch list or
traceability notes until fixed.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] [PRD: FR#/section] [Journey: step] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- **[PRD: FR#/section]**: Which `docs/prd.md` requirement(s) this task traces to
- **[Journey: step]**: Which canonical journey step this task changes
- Include exact file paths in descriptions
- Include task-level acceptance criteria for implementation and verification tasks
- Include traceability and handoff update tasks for every implementation phase
- Keep tasks within the current phase unless a later-phase dependency is
  explicitly justified

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- **Web app**: `backend/src/`, `frontend/src/`
- **Mobile**: `api/src/`, `ios/src/` or `android/src/`
- Paths shown below assume single project - adjust based on plan.md structure

<!--
  ============================================================================
  IMPORTANT: The tasks below are SAMPLE TASKS for illustration purposes only.

  The /speckit-tasks command MUST replace these with actual tasks based on:
  - User stories from spec.md (with their priorities P1, P2, P3...)
  - Feature requirements from plan.md
  - Entities from data-model.md
  - Endpoints from contracts/

  Tasks MUST be organized by user story so each story can be:
  - Implemented independently
  - Tested independently
  - Delivered as an MVP increment
  - Traced to docs/prd.md requirement IDs or sections

  DO NOT keep these sample tasks in the generated tasks.md file.
  ============================================================================
-->

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create project structure per implementation plan
- [ ] T002 Initialize [language] project with [framework] dependencies
- [ ] T003 [P] Configure linting and formatting tools

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

Examples of foundational tasks (adjust based on your project):

- [ ] T004 Setup database schema and migrations framework
- [ ] T005 [P] Implement authentication/authorization framework
- [ ] T006 [P] Setup API routing and middleware structure
- [ ] T007 Create base models/entities that all stories depend on
- [ ] T008 Configure error handling and logging infrastructure
- [ ] T009 Setup environment configuration management
- [ ] TXXX [P] [PRD: Section 7/8] [Journey: cross-flow] Add match session/context persistence scaffolding for survey answers, session ID, selected neighborhood, map state, language, and Dossier return path. Acceptance: refresh/navigation does not clear required context in covered flows.
- [ ] TXXX [P] [PRD: Section 16] [Journey: results/neighborhood map] Add map fallback scaffolding for selected-neighborhood-only 3D loading, 2D fallback, reduced motion, and non-map recommendation list. Acceptance: 3D houses are not requested or rendered until a neighborhood is selected, and viewport paging/LOD stays inside selected-neighborhood bounds.
- [ ] TXXX [P] [PRD: FR-L4/FR-S6/Section 26] [Journey: cross-flow] Add Dutch/English i18n key scaffolding for every new user-facing state, validation message, fallback, route label, and Dossier return action. Acceptance: no hard-coded user-facing copy in touched components/services.
- [ ] TXXX [P] [PRD: Section 24] [Journey: cross-flow] Add phase traceability scaffolding in `docs/qa/match_first_revamp_traceability.md` and handoff update expectations in `docs/ai/latest_handoff.md`. Acceptance: touched PRD acceptance criteria can be marked missing, partial, or pass with evidence.

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - [Title] (Priority: P1) 🎯 MVP

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 1

> **NOTE: Write tests for the story's acceptance criteria before or alongside implementation. Do not mark the phase complete until they pass.**

- [ ] T010 [P] [US1] [PRD: FR#] [Journey: step] Contract test for [endpoint] in tests/contract/test_[name].py. Acceptance: [specific assertion]
- [ ] T011 [P] [US1] [PRD: FR#] [Journey: step] Integration/E2E test for [user journey] in tests/integration/test_[name].py. Acceptance: [specific assertion]
- [ ] TXXX [P] [US1] [PRD: FR#] [Journey: step] Accessibility/i18n/map/model-context regression test in [path]. Acceptance: [specific assertion]

### Implementation for User Story 1

- [ ] T012 [P] [US1] [PRD: FR#] [Journey: step] Create [Entity1] model in src/models/[entity1].py. Acceptance: [specific behavior]
- [ ] T013 [P] [US1] [PRD: FR#] [Journey: step] Create [Entity2] model in src/models/[entity2].py. Acceptance: [specific behavior]
- [ ] T014 [US1] [PRD: FR#] [Journey: step] Implement [Service] in src/services/[service].py (depends on T012, T013). Acceptance: [specific behavior]
- [ ] T015 [US1] [PRD: FR#] [Journey: step] Implement [endpoint/feature] in src/[location]/[file].py. Acceptance: [specific behavior]
- [ ] T016 [US1] [PRD: FR#] [Journey: step] Add validation, graceful degradation, and error handling with translation keys. Acceptance: [specific fallback]
- [ ] T017 [US1] [PRD: FR#] [Journey: step] Add context persistence, accessibility labels, and regression coverage where this story touches the canonical journey. Acceptance: [specific verification]

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - [Title] (Priority: P2)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 2

- [ ] T018 [P] [US2] [PRD: FR#] [Journey: step] Contract test for [endpoint] in tests/contract/test_[name].py. Acceptance: [specific assertion]
- [ ] T019 [P] [US2] [PRD: FR#] [Journey: step] Integration/E2E test for [user journey] in tests/integration/test_[name].py. Acceptance: [specific assertion]

### Implementation for User Story 2

- [ ] T020 [P] [US2] [PRD: FR#] [Journey: step] Create [Entity] model in src/models/[entity].py. Acceptance: [specific behavior]
- [ ] T021 [US2] [PRD: FR#] [Journey: step] Implement [Service] in src/services/[service].py. Acceptance: [specific behavior]
- [ ] T022 [US2] [PRD: FR#] [Journey: step] Implement [endpoint/feature] in src/[location]/[file].py. Acceptance: [specific behavior]
- [ ] T023 [US2] [PRD: FR#] [Journey: step] Integrate with User Story 1 components (if needed). Acceptance: [specific behavior]

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - [Title] (Priority: P3)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 3

- [ ] T024 [P] [US3] [PRD: FR#] [Journey: step] Contract test for [endpoint] in tests/contract/test_[name].py. Acceptance: [specific assertion]
- [ ] T025 [P] [US3] [PRD: FR#] [Journey: step] Integration/E2E test for [user journey] in tests/integration/test_[name].py. Acceptance: [specific assertion]

### Implementation for User Story 3

- [ ] T026 [P] [US3] [PRD: FR#] [Journey: step] Create [Entity] model in src/models/[entity].py. Acceptance: [specific behavior]
- [ ] T027 [US3] [PRD: FR#] [Journey: step] Implement [Service] in src/services/[service].py. Acceptance: [specific behavior]
- [ ] T028 [US3] [PRD: FR#] [Journey: step] Implement [endpoint/feature] in src/[location]/[file].py. Acceptance: [specific behavior]

**Checkpoint**: All user stories should now be independently functional

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] TXXX [P] Documentation updates in docs/
- [ ] TXXX Code cleanup and refactoring
- [ ] TXXX Performance optimization across all stories
- [ ] TXXX [P] Additional tests for phase acceptance criteria and regression coverage in tests/
- [ ] TXXX Security hardening
- [ ] TXXX [P] Verify Dutch/English i18n parity and absence of hard-coded user-facing copy in touched files
- [ ] TXXX [P] Verify keyboard navigation, screen-reader labels, touch targets, contrast, reduced motion, and non-map alternatives
- [ ] TXXX [P] Verify map performance constraints: no national 3D building requests, selected-neighborhood-only 3D loading/rendering, viewport paging/LOD only inside selected-neighborhood bounds, 2D fallback, reduced-motion fallback
- [ ] TXXX [P] Verify context preservation across survey, results map, neighborhood detail, Dossier, and back-to-map navigation
- [ ] TXXX [P] Verify model/copy honesty: no unsupported claims about perfect fit, safety, happiness, investment certainty, or future value
- [ ] TXXX [P] Update `docs/qa/match_first_revamp_traceability.md` with implementation files, tests/manual verification, status, residual risks, and missing/partial items for this phase
- [ ] TXXX [P] Update `docs/ai/latest_handoff.md` with completed work, commands run, pass/fail status, residual risks, and next smallest safe step
- [ ] TXXX Run quickstart.md validation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 but should be independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - May integrate with US1/US2 but should be independently testable

### Within Each User Story

- Tests for phase acceptance criteria MUST be written before or alongside implementation
- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "[PRD: FR#] Contract test for [endpoint] in tests/contract/test_[name].py"
Task: "[PRD: FR#] Integration test for [user journey] in tests/integration/test_[name].py"

# Launch all models for User Story 1 together:
Task: "Create [Entity1] model in src/models/[entity1].py"
Task: "Create [Entity2] model in src/models/[entity2].py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- [PRD: FR#/section] label maps task to docs/prd.md for constitution traceability
- [Journey: step] label maps task to the canonical match-first journey
- Each user story should be independently completable and testable
- Verify phase acceptance criteria with tests or documented commands before completion
- Do not mark a PRD acceptance criterion pass unless linked evidence exists in traceability
- Do not introduce new frameworks, rewrite unrelated modules, or jump phases without explicit justification
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
