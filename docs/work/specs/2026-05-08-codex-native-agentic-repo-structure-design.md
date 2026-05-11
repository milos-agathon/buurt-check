# Codex-Native Agentic Repo Structure Design

**Date:** 2026-05-08

**Status:** Approved for implementation

**Goal:** Bring the organizational strengths of the Cairn working environment into Buurt Check without copying Cairn product content, application code, or domain-specific documents.

## Scope

This design creates a Buurt Check-specific operating structure for Codex work:

- Repo-local agent role descriptions.
- Reusable task, review, debug, and verification prompts.
- A cleaner documentation taxonomy for product, design, technical, and work artifacts.
- Feature specs with task files that can be handed to multiple Codex workers.
- Explicit guardrails that prevent cross-project content import.

This does not change backend, frontend, app behavior, build tooling, deployment, or product scope.

## Structure

The new structure is:

```text
.agents/
  README.md
  subagents/
    implementation-worker.md
    code-reviewer.md
    debugging-investigator.md
    frontend-quality-agent.md
    backend-data-agent.md
    security-privacy-reviewer.md
  roles/
    planner.md
    implementer.md
    reviewer.md
    debugger.md
    frontend-ui.md
    backend-data.md
  prompts/
    implement-from-plan.md
    review-branch.md
    debug-failure.md
    verify-before-pr.md

docs/
  README.md
  work/
    README.md
    plans/
    decisions/
    reviews/
    specs/

specs/
  README.md
  _template/
    README.md
    requirements.md
    plan.md
    verification.md
    tasks/
      task-01-slice.md
```

Existing docs remain valid. The new folders become the default destination for future PRDs, specs, implementation plans, review notes, decisions, and verification records.

## Agent Model

Codex work should be split by subagent profile, role, and task boundary:

- `implementation-worker`: executes one bounded task file and reports changed paths.
- `code-reviewer`: reviews diffs for behavior, regressions, missing tests, and contract violations.
- `debugging-investigator`: investigates failures with evidence before proposing fixes.
- `frontend-quality-agent`: checks React, CSS, i18n, mobile-first, browser, and Polar Frost constraints.
- `backend-data-agent`: checks FastAPI, async `httpx`, Pydantic v2, cache, data-source, scoring, and warning-code constraints.
- `security-privacy-reviewer`: checks buyer keys, entitlements, exports, privacy, analytics, and data exposure.
- `planner`, `implementer`, `reviewer`, `debugger`, `frontend-ui`, and `backend-data` remain lightweight role briefs for current-session work.

The `.agents/subagents` files are the preferred dispatch profiles when spawning Codex agents. The `.agents/prompts` files provide copyable prompts for repeatable handoffs. They should refer to Buurt Check docs and commands, not Cairn material.

## Documentation Rules

Future documents should use these homes:

- Product docs: `docs/product/` when created or migrated.
- Design docs: `docs/design/` when created or migrated.
- Technical references: `docs/technical/` when created or migrated.
- Active implementation plans: `docs/work/plans/`.
- Decisions: `docs/work/decisions/`.
- Review notes: `docs/work/reviews/`.
- Feature specs and task breakdowns: `specs/<yyyy-mm-dd-feature-name>/`.

The existing `docs/plans/` directory remains readable for historical plans. New active plans should use `docs/work/plans/`.

## Content Boundary

The implementation must not copy Cairn prose, source code, product requirements, business strategy, data models, or UI copy. It may reproduce only generic structural ideas:

- Directory names.
- Artifact categories.
- Task-file pattern.
- Role/prompt pattern.
- Plan/review/debug workflow shape.

All file contents must be newly written for Buurt Check.

## Verification

Because this is documentation and workflow scaffolding, verification is file-system and content focused:

- Confirm all expected files exist.
- Confirm no generated file contains Cairn project names or route-domain content.
- Confirm docs explain future artifact locations.
- Confirm existing application code is untouched by this work.
