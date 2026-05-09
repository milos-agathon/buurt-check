# Buurt Check Subagents

These are Codex-native subagent profiles for splitting Buurt Check work. They are not copied from another repo; they describe how to dispatch focused Codex `worker` or `explorer` agents in this codebase.

Use a subagent when the task is bounded, can run in parallel with other work, and has a clear output. Prefer one subagent per task file under `specs/*/tasks/`.

## Profiles

- `implementation-worker.md`: implements one bounded task.
- `code-reviewer.md`: reviews a diff or task result.
- `debugging-investigator.md`: investigates a failing command or workflow.
- `frontend-quality-agent.md`: checks frontend UI, i18n, accessibility, and browser behavior.
- `backend-data-agent.md`: checks backend API, data-source, cache, scoring, and warning-code behavior.
- `security-privacy-reviewer.md`: checks entitlement, buyer key, privacy, and data handling risks.

## Dispatch Pattern

When spawning a subagent, include:

- The subagent profile path.
- The exact task, plan, PR, or failure being assigned.
- Files or modules the agent owns.
- Files or modules the agent must not edit.
- Required verification commands.
- Expected final response format.

Workers are not alone in the codebase. Tell them to preserve unrelated user changes and to avoid reverting edits made by other agents.
