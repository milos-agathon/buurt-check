# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]
**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]
**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]
**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]
**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]
**Project Type**: [e.g., library/cli/web-service/mobile-app/compiler/desktop-app or NEEDS CLARIFICATION]
**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]
**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]
**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Requirement | Status / Evidence |
|------|-------------|-------------------|
| Required inputs read | Confirm `docs/prd.md` and `docs/context/current_architecture.md` were read before planning. | [PASS/FAIL with links] |
| Product flow | Identify the canonical journey step(s) affected and confirm search does not compete with match on the first screen. | [PASS/FAIL/N/A with links] |
| Minimal UI | Confirm onboarding keeps one decision per screen and survey screens show exactly one question with progress/back behavior. | [PASS/FAIL/N/A with links] |
| Bilingual by design | List every new or changed user-facing string surface and confirm Dutch/English translation keys, including validation and fallback messages. | [PASS/FAIL/N/A with links] |
| Map performance | Confirm no national 3D building loading; 3D houses load/render only after neighborhood selection and only within selected-neighborhood bounds; viewport loading is used only for paging/LOD inside that neighborhood; 2D fallback, reduced-motion fallback, and non-map list alternative exist. | [PASS/FAIL/N/A with links] |
| Model honesty | Identify scoring/probability/confidence claims and confirm validated predictive claims are absent unless labels and validation data exist. | [PASS/FAIL/N/A with links] |
| Dossier preservation | Identify any Dossier touchpoints and confirm the smallest safe change, persistent back-to-map action, and regression coverage. | [PASS/FAIL/N/A with links] |
| Accessibility | Confirm keyboard access, screen-reader labels, touch targets, contrast, reduced motion, focus management, and non-map alternatives. | [PASS/FAIL/N/A with links] |
| Phase testing | List unit, integration, E2E, accessibility, or map verification required for each affected phase and acceptance criterion. | [PASS/FAIL with links] |
| Context preservation | Confirm survey answers, session ID, selected neighborhood, map state, language, and Dossier return path survive navigation. | [PASS/FAIL/N/A with links] |
| Unsupported claims | Confirm copy and explanations avoid perfect fit, safety, happiness, investment certainty, future value, and other unsupported claims. | [PASS/FAIL/N/A with links] |
| Conflict handling | Document conflicts with the current codebase and propose the smallest safe change. | [PASS/FAIL/N/A with links] |

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
