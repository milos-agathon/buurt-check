# Context Index

This file is the map for new ChatGPT, Codex, or SpecKit sessions. Use it to
find the current source-of-truth artifacts before planning or changing code.

## Source-Of-Truth Artifacts

### `docs/ai/latest_handoff.md`

First file to read when resuming work. It should summarize the current phase,
recently completed tasks, commands run, residual risks, and the next smallest
safe step. If it is stale, verify against the task list and traceability doc
before implementing.

### `docs/prd.md`

Product contract for the Buurt Check match-first UI revamp. It defines the
canonical journey, MVP scope, non-goals, acceptance criteria, UX rules,
monetization boundaries, model-honesty requirements, and Dossier preservation
requirements. When any other artifact conflicts with the PRD, treat the PRD as
authoritative and document the conflict.

### `docs/context/current_architecture.md`

Existing stack contract. Read this to understand the current FastAPI backend,
React/Vite frontend, custom hash routing, Dossier architecture, match backend,
map/3D constraints, i18n setup, tests, risky integration points, and smallest
safe adaptation path.

### `.specify/memory/constitution.md`

Governance contract. It turns the PRD into mandatory implementation rules:
match-first flow, minimal onboarding, bilingual copy, selected-neighborhood-only
3D, model honesty, Dossier preservation, accessibility, testing, context
preservation, and unsupported-claim guardrails.

### `specs/**/spec.md`

Feature requirements contract. Read the active feature spec, especially
`specs/002-match-first-revamp/spec.md`, to understand user stories, functional
requirements, edge cases, data contracts, success criteria, and PRD
traceability.

### `specs/**/plan.md`

Technical plan contract. Read the active feature plan to understand technical
context, architecture decisions, route changes, API endpoints, data model,
component plan, implementation phases, risks, and quality gates.

### `specs/**/tasks.md`

Implementation task contract. Use this to determine the current phase,
dependency order, exact files likely to change, acceptance criteria, and
required verification commands. Do not skip ahead when earlier tasks are
unchecked unless the handoff and traceability docs explicitly justify it.

### `docs/qa/match_first_revamp_traceability.md`

Acceptance evidence contract. Read this to verify which phase criteria are
actually closed, which tests/commands proved them, and which gaps were
remediated. A checked task is not enough by itself; traceability should show the
acceptance evidence.

### `docs/qa/open_punchlist.md`

Known remaining work. Read this for unresolved review items, incomplete
acceptance criteria, blocked checks, regressions, and cleanup tasks. If the file
is missing, treat that as a documentation gap and check
`docs/qa/match_first_revamp_traceability.md` plus the active task list before
claiming no punch-list items remain.

## New Session Startup Checklist

Before making changes, every new ChatGPT or Codex session should:

1. Read `docs/ai/latest_handoff.md`.
2. Read `docs/prd.md`.
3. Read `docs/context/current_architecture.md`.
4. Read `.specify/memory/constitution.md`.
5. Read the active `specs/**/spec.md`, `specs/**/plan.md`, and
   `specs/**/tasks.md`.
6. Read `docs/qa/match_first_revamp_traceability.md`.
7. Read `docs/qa/open_punchlist.md` if present.
8. Identify the current phase, completed work, missing acceptance criteria, next
   smallest safe step, likely files to change, and required tests.
9. Only then plan or implement changes.

## Operating Notes

- The active match-first feature is currently expected under
  `specs/002-match-first-revamp/`.
- Use `rg --files specs docs/qa docs/ai` to discover available context files.
- Keep this index concise and update it when new source-of-truth artifacts are
  added or renamed.
