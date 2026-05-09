# Codex-Native Agentic Repo Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a Buurt Check-specific Codex working structure for plans, specs, task files, reviews, debugging, verification, and role-based multi-agent handoffs.

**Architecture:** This is a documentation/workflow scaffold only. It adds repo-local `.agents` role and prompt files, `docs/work` indexes, and a reusable `specs/_template` without changing backend, frontend, or runtime behavior.

**Tech Stack:** Markdown, PowerShell verification, existing Buurt Check Python/FastAPI and React/Vite commands referenced only as workflow gates.

---

## File Structure

- Create `.agents/README.md`: explains how Codex agents should use repo-local roles and prompts.
- Create `.agents/subagents/README.md`: explains Codex-native subagent dispatch.
- Create `.agents/subagents/implementation-worker.md`: bounded implementation subagent profile.
- Create `.agents/subagents/code-reviewer.md`: review subagent profile.
- Create `.agents/subagents/debugging-investigator.md`: debugging subagent profile.
- Create `.agents/subagents/frontend-quality-agent.md`: frontend quality subagent profile.
- Create `.agents/subagents/backend-data-agent.md`: backend/data subagent profile.
- Create `.agents/subagents/security-privacy-reviewer.md`: security/privacy subagent profile.
- Create `.agents/roles/planner.md`: planning role contract.
- Create `.agents/roles/implementer.md`: implementation role contract.
- Create `.agents/roles/reviewer.md`: review role contract.
- Create `.agents/roles/debugger.md`: debugging role contract.
- Create `.agents/roles/frontend-ui.md`: frontend constraints role.
- Create `.agents/roles/backend-data.md`: backend/data constraints role.
- Create `.agents/prompts/implement-from-plan.md`: worker kickoff prompt.
- Create `.agents/prompts/review-branch.md`: review prompt.
- Create `.agents/prompts/debug-failure.md`: debug prompt.
- Create `.agents/prompts/verify-before-pr.md`: verification prompt.
- Create `docs/README.md`: documentation map.
- Create `docs/work/README.md`: active work artifact policy.
- Create `docs/work/decisions/README.md`: decision-record folder placeholder.
- Create `docs/work/reviews/README.md`: review-notes folder placeholder.
- Create `specs/README.md`: feature-spec workflow.
- Create `specs/_template/README.md`: feature spec overview template.
- Create `specs/_template/requirements.md`: requirements template.
- Create `specs/_template/plan.md`: implementation plan template.
- Create `specs/_template/verification.md`: verification log template.
- Create `specs/_template/tasks/task-01-slice.md`: bounded task template.
- Modify `.gitignore`: allow `docs/README.md`, `docs/work/**`, and `specs/**/tasks/**` to be tracked.

## Task 1: Documentation Indexes

**Files:**
- Create: `docs/README.md`
- Create: `docs/work/README.md`
- Create: `docs/work/decisions/README.md`
- Create: `docs/work/reviews/README.md`
- Create: `specs/README.md`

- [ ] **Step 1: Create `docs/README.md`**

```markdown
# Buurt Check Documentation

This directory contains product, design, technical, and active work documentation for Buurt Check.

## Current Canonical Docs

- Product PRD: `docs/prd.md`
- Design direction: `docs/design-prd.md`
- Visual spec: `docs/design-spec.md`
- Palette: `docs/palette.md`
- UI principles: `docs/ui-principles.md`
- Data source reference: `DATA_SOURCES.md`
- Agent instructions: `AGENTS.md`

## New Work Areas

- `docs/work/plans/`: active implementation plans written for Codex execution.
- `docs/work/decisions/`: short decision records for architectural and product choices.
- `docs/work/reviews/`: review notes, QA passes, and pre-PR findings.
- `docs/work/specs/`: design specs for repo organization and workflow changes.
- `specs/`: feature-level specs with task files for multi-agent implementation.

Historical documents remain valid in their current locations. New active work should use the work areas above.
```

- [ ] **Step 2: Create `docs/work/README.md`**

```markdown
# Active Work

Use this folder for artifacts that guide or record active engineering work.

## Folders

- `plans/`: implementation plans with checkbox tasks and verification steps.
- `decisions/`: concise records of decisions that affect future work.
- `reviews/`: code review notes, design review notes, and QA findings.
- `specs/`: workflow or repo-structure specs that do not belong to a single product feature.

## Rules

- Prefer dated filenames: `YYYY-MM-DD-topic.md`.
- Keep product requirements in `docs/prd.md` or a feature folder under `specs/`.
- Keep implementation work in task files that can be assigned to one worker without shared write conflicts.
- Include verification commands and expected results in every plan.
```

- [ ] **Step 3: Create `docs/work/decisions/README.md`**

```markdown
# Decisions

Use this folder for short decision records that affect future Buurt Check product, architecture, workflow, or agentic implementation work.
```

- [ ] **Step 4: Create `docs/work/reviews/README.md`**

```markdown
# Reviews

Use this folder for code review notes, design review notes, QA passes, and pre-PR findings that should stay with the repo.
```

- [ ] **Step 5: Create `specs/README.md`**

```markdown
# Feature Specs

Each feature spec is a self-contained packet that can be planned, implemented, reviewed, debugged, and verified by Codex workers.

## Structure

Copy `specs/_template/` to `specs/YYYY-MM-DD-feature-name/` and fill in:

- `README.md`: feature overview and links.
- `requirements.md`: user-visible requirements and constraints.
- `plan.md`: task-level implementation plan.
- `verification.md`: commands run, outcomes, and residual risk.
- `tasks/`: one file per bounded implementation slice.

## Task Boundaries

Each task file should name:

- Goal.
- Scope.
- Likely files touched.
- Acceptance criteria.
- Required checks.
- Out of scope.
- Review focus.

Task files are the preferred handoff unit for subagents.
```

- [ ] **Step 6: Verify docs indexes exist**

Run:

```powershell
Test-Path docs\README.md; Test-Path docs\work\README.md; Test-Path docs\work\decisions\README.md; Test-Path docs\work\reviews\README.md; Test-Path specs\README.md
```

Expected:

```text
True
True
True
True
True
```

## Task 2: Agent Role Files

**Files:**
- Create: `.agents/README.md`
- Create: `.agents/roles/planner.md`
- Create: `.agents/roles/implementer.md`
- Create: `.agents/roles/reviewer.md`
- Create: `.agents/roles/debugger.md`
- Create: `.agents/roles/frontend-ui.md`
- Create: `.agents/roles/backend-data.md`

- [ ] **Step 1: Create `.agents/README.md`**

```markdown
# Buurt Check Agent Roles

This folder contains repo-local guidance for Codex workers. It does not replace `AGENTS.md`; it gives reusable role briefs and prompts for multi-agent work.

Use these files when splitting work:

- `roles/planner.md`: turn requirements into task plans.
- `roles/implementer.md`: execute one bounded task.
- `roles/reviewer.md`: review diffs for regressions and missing tests.
- `roles/debugger.md`: investigate failures before changing code.
- `roles/frontend-ui.md`: apply frontend, design, and i18n constraints.
- `roles/backend-data.md`: apply backend, external-data, cache, and scoring constraints.

Use `prompts/` for repeatable handoffs.
```

- [ ] **Step 2: Create planner role**

```markdown
# Planner Role

Convert an approved spec into a task-level implementation plan.

## Responsibilities

- Keep tasks independently assignable.
- Define exact files likely touched.
- Include acceptance criteria and verification commands.
- Preserve Buurt Check constraints from `AGENTS.md`, `backend/CLAUDE.md`, and `frontend/CLAUDE.md`.
- Avoid broad refactors unless they are required for the task.

## Output

Write plans to `docs/work/plans/YYYY-MM-DD-topic.md` or to the feature folder under `specs/`.
```

- [ ] **Step 3: Create implementer role**

```markdown
# Implementer Role

Execute one bounded task from a plan or `specs/*/tasks/*` file.

## Responsibilities

- Read the task file and the relevant project instructions before editing.
- Keep changes inside the task scope.
- Do not revert unrelated user changes.
- Add or update focused tests when behavior changes.
- Report changed paths and verification results.
```

- [ ] **Step 4: Create reviewer role**

```markdown
# Reviewer Role

Review changes as a code reviewer.

## Responsibilities

- Lead with bugs, regressions, missing tests, and product-contract violations.
- Reference exact files and lines when possible.
- Check risk-card, monetization, i18n, graceful-degradation, and data-source constraints when relevant.
- Keep summaries short and secondary to findings.
```

- [ ] **Step 5: Create debugger role**

```markdown
# Debugger Role

Investigate failures with evidence before proposing fixes.

## Responsibilities

- Reproduce the failure or collect the closest available evidence.
- Identify the failing layer: backend, frontend, data source, cache, test harness, build, or browser.
- Make the smallest fix that explains the evidence.
- Verify the fix with the narrow failing check first, then broader checks when needed.
```

- [ ] **Step 6: Create frontend-ui role**

```markdown
# Frontend UI Role

Apply Buurt Check frontend constraints.

## Responsibilities

- Use React 18, TypeScript, Vite, plain CSS, i18next, Framer Motion, Three.js, and Leaflet as already established.
- Preserve mobile-first behavior and the Polar Frost design direction.
- Use existing CSS tokens and avoid Tailwind or CSS-in-JS.
- Keep all user-facing strings in i18n files.
- Verify layout-sensitive work with Vitest and Playwright when relevant.
```

- [ ] **Step 7: Create backend-data role**

```markdown
# Backend Data Role

Apply Buurt Check backend and external-data constraints.

## Responsibilities

- Use FastAPI, async `httpx`, Pydantic v2, pydantic-settings, Redis, scipy, and fpdf2 as already established.
- Keep external URLs in `backend/app/config.py`.
- Never cache empty or error responses.
- Include every response-affecting parameter in cache keys.
- Preserve BAG ID validation and EPSG:28992 coordinate conventions.
- Use warning codes for degraded data paths.
```

- [ ] **Step 8: Verify role files exist**

Run:

```powershell
Get-ChildItem .agents\roles -File | Select-Object -ExpandProperty Name
```

Expected includes:

```text
backend-data.md
debugger.md
frontend-ui.md
implementer.md
planner.md
reviewer.md
```

## Task 3: Agent Prompt Files

**Files:**
- Create: `.agents/prompts/implement-from-plan.md`
- Create: `.agents/prompts/review-branch.md`
- Create: `.agents/prompts/debug-failure.md`
- Create: `.agents/prompts/verify-before-pr.md`

- [ ] **Step 1: Create implement-from-plan prompt**

```markdown
# Implement From Plan Prompt

You are implementing one bounded Buurt Check task.

Read:

- `AGENTS.md`
- Relevant backend or frontend `CLAUDE.md`
- The assigned plan or task file

Rules:

- Own only the files named by the task unless the task proves incomplete.
- Do not revert unrelated user changes.
- Add focused tests for behavior changes.
- Run the narrowest useful verification command.
- Finish with changed paths, commands run, and remaining risk.
```

- [ ] **Step 2: Create review-branch prompt**

```markdown
# Review Branch Prompt

Review the current branch as a code reviewer.

Prioritize:

- Behavioral regressions.
- Product contract violations.
- Missing or weak tests.
- i18n and graceful-degradation failures.
- Backend cache, data-source, scoring, and warning-code errors.
- Frontend mobile layout, accessibility, and design-token regressions.

Return findings first, ordered by severity, with file and line references.
```

- [ ] **Step 3: Create debug-failure prompt**

```markdown
# Debug Failure Prompt

Investigate the reported failure before editing.

Process:

- Capture the exact failing command, page, or workflow.
- Reproduce the failure or explain why it cannot be reproduced locally.
- Identify the smallest code path that explains the evidence.
- Apply the smallest fix.
- Re-run the failing check and one broader relevant check.

Report evidence, changed paths, verification commands, and residual risk.
```

- [ ] **Step 4: Create verify-before-pr prompt**

```markdown
# Verify Before PR Prompt

Verify the branch before opening or updating a PR.

Required checks by touched area:

- Backend: `cd backend && ruff check .`
- Backend behavior: `cd backend && pytest -x -q -m "not live"`
- Frontend type/build: `cd frontend && npm run build`
- Frontend behavior: `cd frontend && npm run test`

If a full check is too expensive, run the narrow check first and state which full gate remains.
```

- [ ] **Step 5: Verify prompt files exist**

Run:

```powershell
Get-ChildItem .agents\prompts -File | Select-Object -ExpandProperty Name
```

Expected includes:

```text
debug-failure.md
implement-from-plan.md
review-branch.md
verify-before-pr.md
```

## Task 4: Feature Spec Template

**Files:**
- Create: `specs/_template/README.md`
- Create: `specs/_template/requirements.md`
- Create: `specs/_template/plan.md`
- Create: `specs/_template/verification.md`
- Create: `specs/_template/tasks/task-01-slice.md`

- [ ] **Step 1: Create template README**

```markdown
# Feature Name

## Purpose

Describe the user or engineering outcome in one paragraph.

## Links

- Requirements: `requirements.md`
- Plan: `plan.md`
- Verification: `verification.md`
- Tasks: `tasks/`

## Boundaries

State what this feature changes and what it explicitly leaves alone.
```

- [ ] **Step 2: Create requirements template**

```markdown
# Requirements

## User Outcome

State the outcome this work creates.

## Functional Requirements

- Requirement 1 with observable behavior.
- Requirement 2 with observable behavior.

## Constraints

- Preserve Buurt Check product principles from `AGENTS.md`.
- Keep strings bilingual when frontend UI changes.
- Show degraded data as unavailable instead of crashing.

## Out Of Scope

- Name excluded work explicitly.
```

- [ ] **Step 3: Create plan template**

```markdown
# Implementation Plan

## Task List

- [ ] Task 1: Describe the bounded slice and link to `tasks/task-01-slice.md`.

## Verification Gates

- Backend lint when backend files change.
- Backend tests when backend behavior changes.
- Frontend build when frontend TypeScript changes.
- Frontend tests when frontend behavior changes.
- Playwright when layout, navigation, or browser behavior changes.
```

- [ ] **Step 4: Create verification template**

```markdown
# Verification

## Commands Run

| Command | Result | Notes |
|---------|--------|-------|
| `command here` | Not run | Record why before completion. |

## Review Notes

Record review findings and how they were resolved.

## Residual Risk

State any remaining risk clearly.
```

- [ ] **Step 5: Create task template**

```markdown
# Task 01: Bounded Slice

## Goal

State the result this task produces.

## Scope

- Files likely touched:
- Behavior changed:
- Tests changed:

## Acceptance Criteria

- Observable condition that proves the task is complete.

## Required Checks

- Narrow command:
- Broader command:

## Out Of Scope

- Work this task must not perform.

## Review Focus

- What reviewers should inspect closely.
```

- [ ] **Step 6: Verify template files exist**

Run:

```powershell
Test-Path specs\_template\README.md
Test-Path specs\_template\requirements.md
Test-Path specs\_template\plan.md
Test-Path specs\_template\verification.md
Test-Path specs\_template\tasks\task-01-slice.md
```

Expected:

```text
True
True
True
True
True
```

## Task 5: Boundary Verification

**Files:**
- Read-only verification across files created in Tasks 1-4.
- Modify: `.gitignore`

- [ ] **Step 1: Verify no Cairn content names are present**

Run:

```powershell
rg -n "Cairn|cairn|route package|runner|GPX|Better Auth|Next\\.js|shadcn" .agents docs\work specs
```

Expected: no matches, except this implementation plan may mention `Cairn` only in the context of prohibiting content import. If matches appear in generated scaffold files outside this plan or the design spec, revise them.

- [ ] **Step 2: Verify app code was not touched by this work**

Run:

```powershell
git status --short .gitignore .agents docs\README.md docs\work specs
```

Expected: only `.gitignore`, `.agents`, `docs/README.md`, `docs/work`, and `specs` changes are listed for this work.

- [ ] **Step 3: Commit only the scaffold files after review**

Run:

```powershell
git add .gitignore .agents docs\README.md docs\work specs
git commit -m "docs: add codex-native agentic work structure"
```

Expected: commit succeeds without staging unrelated backend, frontend, mobile, legal, or asset changes.
