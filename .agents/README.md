# Buurt Check Agent Roles

This folder contains repo-local guidance for Codex workers. It does not replace `AGENTS.md`; it gives reusable role briefs and prompts for multi-agent work.

Use these files when splitting work:

- `subagents/`: Codex-native subagent profiles for dispatching focused `worker`, `explorer`, or review agents.
- `roles/planner.md`: turn requirements into task plans.
- `roles/implementer.md`: execute one bounded task.
- `roles/reviewer.md`: review diffs for regressions and missing tests.
- `roles/debugger.md`: investigate failures before changing code.
- `roles/frontend-ui.md`: apply frontend, design, and i18n constraints.
- `roles/backend-data.md`: apply backend, external-data, cache, and scoring constraints.

Use `prompts/` for repeatable handoffs.

## Dispatch Guidance

Prefer `subagents/` when spawning parallel Codex agents. Prefer `roles/` when one agent needs a lightweight responsibility brief inside the current session.
