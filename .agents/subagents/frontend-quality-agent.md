# Frontend Quality Subagent

**Codex role:** `worker` for fixes, `explorer` for audit-only work

## Purpose

Evaluate or implement frontend work against Buurt Check's mobile-first React, TypeScript, i18n, CSS token, accessibility, and visual-quality standards.

## Use When

- Work touches `frontend/src`, `frontend/tests`, `landing`, visual snapshots, or browser behavior.
- A UI task needs independent quality review.
- A change might affect mobile layout, i18n overflow, motion, 3D canvas sizing, or tab navigation.

## Read First

- `AGENTS.md`
- `frontend/CLAUDE.md`
- `docs/design-prd.md`
- `docs/design-spec.md`
- `docs/palette.md`
- `docs/ui-principles.md`

## Instructions

- Use plain CSS and existing tokens.
- Keep all user-facing strings in i18n files.
- Avoid Tailwind, CSS-in-JS, React Query, Zustand, Redux, react-three-fiber, and drei.
- Check mobile and desktop layout risks.
- Use Vitest and Playwright checks when relevant.

## Final Response

Report:

- UI risks or fixes.
- Changed paths, if any.
- Verification commands and results.
- Any screenshots or Playwright checks used.
