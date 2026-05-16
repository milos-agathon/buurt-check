# Buurt Check Match-First Implementation Rules

Before planning, read:

- `docs/prd.md`
- `docs/context/current_architecture.md`
- `docs/ai/implementation_rules.md`
- `.specify/memory/constitution.md`

The PRD is the product contract.

Before implementation, also read:

- `docs/ai/latest_handoff.md`
- `docs/qa/match_first_revamp_traceability.md`

If any required context file is missing, stop and document the blocker before
changing product behavior.

Before implementation, produce concrete tasks with exact file paths, acceptance
criteria, PRD traceability, affected journey step, required tests, and explicit
verification commands.

## Non-Negotiable Rules

- Preserve the canonical flow: landing hero -> survey intro -> one-question
  survey -> review -> backend matching progress -> checkmark success ->
  Netherlands results map -> neighborhood detail -> house click -> existing
  Dossier -> back to match map.
- Search is secondary on the landing screen. It must not appear as a search
  form, equal CTA, equal card, tab, mode choice, or visually dominant first
  viewport destination.
- The survey is one-question-at-a-time with progress, validation, persistence,
  and back behavior.
- Backend matching must start only after the user reaches the review screen and
  activates the final run CTA. Answer persistence, preference-vector creation,
  validation, and review readback may happen earlier; match jobs, ranking, and
  result generation must not.
- Progress, success, and results screens must be backed by real persisted
  session, job, and result state, not optimistic local state.
- All user-facing text must use Dutch/English translation keys. Do not hard-code
  visible English or Dutch strings.
- Preserve the existing Dossier, risk tiles, entitlement, checkout recovery, and
  export contracts. Do not rewrite Dossier modules unless required for route or
  context preservation and covered by regression evidence.
- 3D buildings may load only after a neighborhood is selected and only for that
  selected neighborhood or a narrow selected-neighborhood viewport used for
  paging/level-of-detail. Never load national 3D buildings.
- Provide reduced-motion, 2D, and non-map list fallbacks for map and 3D flows.
- The first completed results view must open centered on the Netherlands with a
  ranked list and synchronized map markers or areas. Fly-to neighborhood detail
  only after that national state exists and the user chooses a recommendation or
  restores an explicit saved selection.
- Match results must include eligibility, score or fit label, reason codes,
  tradeoffs, confidence, geometry references, model/scoring version, data
  version, runtime, evaluation status, source/freshness metadata, and explicit
  limitations. Label missing or fallback fields.
- Predictive claims require real labels and validation evidence. Without that
  evidence, describe results as deterministic or semi-deterministic data-backed
  fit scores, not probabilities or objective truth.
- Do not promise perfect fit, safety, happiness, investment certainty, future
  value, guaranteed affordability, or guaranteed outcomes.
- Slow backend, failed backend, completed-with-fallback scoring, no strong
  matches, missing 3D data, and no reliable address for a selected house must
  have bilingual, accessible, non-deceptive recovery states.
- Store stable keys, not translated labels, in API payloads, persistence,
  analytics, preference vectors, reason codes, and warning codes.
- Match-first analytics must cover funnel progress, survey drop-off, match job
  success/fallback, map and list engagement, neighborhood detail entry, house
  click, Dossier open, and back-to-map return. Stored analytics values must use
  stable language-independent keys.
- Preserve survey answers, session ID, selected neighborhood, result state, map
  center, map zoom, list scroll, mobile map/list mode, selected result ID/rank,
  selected house/building, language, matching status, return route, and Dossier
  return path through navigation and Dossier round trips. Any refresh
  persistence gap is missing or partial acceptance, not pass.
- Every implementation phase must run relevant tests and update
  `docs/ai/latest_handoff.md` and
  `docs/qa/match_first_revamp_traceability.md` with work completed, commands
  run, residual risks, and next steps.
- If tests fail, report failures honestly and update the punch list or
  traceability notes.
- If an acceptance criterion is not implemented, mark it missing or partial,
  never pass.
- Implement phase by phase. Do not jump to later phases, add new frameworks,
  rewrite unrelated modules, or add product scope without explicit
  justification.
- Changes must be the smallest safe change that preserves the canonical journey,
  Dossier behavior, i18n, accessibility, map performance, model honesty, and
  context persistence.

## Quality Gates

Run the relevant lint, build, unit, integration, E2E, accessibility, map
verification, and feature-specific checks for touched areas. Use `AGENTS.md`,
active tasks, and implementation plans for exact commands.

Use targeted test commands during development, but do not mark a phase complete
without acceptance-linked verification and updated traceability rows.
