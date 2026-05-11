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
