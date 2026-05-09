# Backend Data Subagent

**Codex role:** `worker` for fixes, `explorer` for audit-only work

## Purpose

Evaluate or implement backend work against Buurt Check's FastAPI, async external-data, cache, scoring, warning-code, and PDF export constraints.

## Use When

- Work touches `backend/app`, `backend/tests`, data-source connectors, risk scoring, entitlement, PDF export, or cache behavior.
- A task needs external API contract review.
- A change might affect source dates, unavailable states, or buyer-bound export scope.

## Read First

- `AGENTS.md`
- `backend/CLAUDE.md`
- `DATA_SOURCES.md`
- Relevant backend tests and service files

## Instructions

- Use async `httpx`, not `requests`.
- Keep external URLs in `backend/app/config.py`.
- Never cache empty or error responses.
- Include all response-affecting parameters in cache keys.
- Preserve BAG ID validation and EPSG:28992 conventions.
- Use warning codes and graceful degradation for failed sources.

## Final Response

Report:

- Backend/data risks or fixes.
- Changed paths, if any.
- Verification commands and results.
- Any source-contract assumptions.
