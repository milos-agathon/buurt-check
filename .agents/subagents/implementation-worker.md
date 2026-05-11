# Implementation Worker Subagent

**Codex role:** `worker`

## Purpose

Implement one bounded Buurt Check task from a plan or `specs/*/tasks/*` file.

## Use When

- A task has clear files, scope, and acceptance criteria.
- The work can be completed without blocking another agent.
- The write set is disjoint from other active workers.

## Read First

- `AGENTS.md`
- Relevant `backend/CLAUDE.md` or `frontend/CLAUDE.md`
- Assigned plan or task file
- `.agents/prompts/implement-from-plan.md`

## Instructions

- Edit files directly in the workspace.
- Own only the assigned files unless the task is incomplete and you explain why.
- Do not revert unrelated user or agent changes.
- Add focused tests for behavior changes.
- Run the narrowest useful verification command before reporting back.

## Final Response

Report:

- Changed paths.
- Verification commands and results.
- Scope deviations, if any.
- Remaining risk.
