# CLAUDE.md -- buurt-check

Mobile-first web app helping expats and first-time homebuyers in the Netherlands avoid bad property purchases. User pastes an address, gets an evidence-backed dossier with risk cards, 3D context, neighborhood stats, and a viewing briefing.

## Tech stack

| Layer | Stack |
|-------|-------|
| Backend | Python 3.12, FastAPI, httpx (async), Pydantic v2, pydantic-settings, Redis, aiosqlite, stripe, sentry-sdk[fastapi], scipy, fpdf2 |
| Frontend | React 18, TypeScript 5, Vite 6, Framer Motion, Three.js, Leaflet, SunCalc, i18next, @sentry/react |
| Styling | Plain CSS with design tokens ("Polar Frost"). NO Tailwind, NO CSS-in-JS |
| Testing | pytest + pytest-asyncio (backend), Vitest 4.x + Testing Library (frontend), Playwright (E2E) |
| Linting | ruff (backend), TypeScript strict mode via `npm run build` (frontend) |

## Project structure

```
backend/           # FastAPI API aggregator + SQLite entitlements (no user accounts)
  app/api/         # Route handlers (address.py, reports.py, billing.py, dependencies.py)
  app/services/    # Business logic (bag, risk_cards, cbs, scoring, pdf_export, livability, etc.)
  app/db.py        # SQLite init + connection helpers (report/payment storage)
  app/models/      # Pydantic response models
  app/cache/       # Redis with circuit breaker
  app/config.py    # pydantic-settings (BUURT_* env prefix)
  tests/           # pytest (629+ non-live tests)
frontend/          # React + Vite + TypeScript
  src/components/  # All UI components (dossier cards, navigation, search, shortlist)
  src/styles/      # tokens.css (195 CSS custom properties), satoshi.css (font)
  src/services/    # api.ts, entitlement.ts, firstDossier.ts, shortlist.ts, theme.ts
  src/config/      # shared runtime config (e.g. pricing.ts)
  src/i18n/        # en.json + nl.json (~380 keys each, parity enforced)
  src/types/       # TypeScript interfaces mirroring backend models
docs/              # Design specs, plans, palette, UI principles
```

## Commands

```bash
# Backend
cd backend && uvicorn app.main:app --reload --port 8000
cd backend && pytest -x -q -m "not live"   # CI tests (629+ baseline)
cd backend && ruff check .                  # MUST pass before commit
# Payment features require BUURT_STRIPE_SECRET_KEY, BUURT_STRIPE_WEBHOOK_SECRET,
# BUURT_STRIPE_PRICE_CENTS, BUURT_BASE_URL, BUURT_DATABASE_PATH.

# Frontend
cd frontend && npm run dev                  # Dev server (proxies /api to :8000)
cd frontend && npm run build                # MUST pass before commit (strict TS)
cd frontend && npm run test                 # Vitest (867+ baseline)
```

## Architecture decisions

- **Data architecture**: External neighborhood/property data stays stateless + cached in Redis; monetization state (report records, payment status, entitlements) lives in SQLite
- **API routing**: Address intelligence lives in `api/address.py`; monetization flows in `api/reports.py` + `api/billing.py`; entitlement checks are centralized in `api/dependencies.py`
- **0-100 risk scoring**: Backend normalizes raw values via `scoring.py`. 4-level severity: good (70-100), moderate (40-69), poor (20-39), critical (0-19)
- **State management**: App-level `useState` in `App.tsx`. No Redux/Zustand. Screen routing via `activeScreen`
- **i18n from day one**: All strings via `t()`. NL default, EN secondary. Warning codes from backend: `t('feature.warning.${code}', code)`

## Product principles

1. **Consequences over data** — translate every number into "what does this mean for me"
2. **5-8 indicators max per section** — curate aggressively, no dashboard spam
3. **Bilingual by default** — NL default, EN secondary, not bolted on later
4. **Disclaimers mandatory** — always cite source, date, and limitations
5. **Graceful degradation** — if a data source fails, show "unavailable", never crash the dossier

## Development conventions

- **Commits**: Conventional (`feat:`, `fix:`, `docs:`, `chore:`)
- **Branches**: `main` (stable), `feat/<description>` for features
- **Error handling**: Warning codes from backend, i18n keys on frontend
- **Caching**: Never cache empty/error responses. Cache keys must include ALL params affecting response
- **Config**: All external URLs in `config.py`. No hardcoded URLs in services
- **Coordinates**: EPSG:28992 (RD New) everywhere. BAG IDs: 16 digits, validate `^[0-9]{16}$`
- **Quality gates**: `ruff check` + `pytest` + `npm run build` + `npm run test` before any commit

## Anti-patterns — never do these

- `CQL_FILTER` for BAG WFS (silently ignored) — use OGC XML Filter
- `requests` library — use `httpx` async
- CSS `!important` on canvas dimensions — breaks Three.js `renderer.setSize()`
- `--color-accent` (#2EC4B6) as text on light bg (fails WCAG) — use `--color-accent-text` (#1C8C83)
- `react-three-fiber` or `drei` — plain Three.js only
- React Query / Zustand / Redux — useState + props
- Bare `= []` in Pydantic models — use `Field(default_factory=list)`
- `sampled_at` as `source_date` fallback — let it be `None`
- Infer 3D viewer loading from `buildings.length === 0` — use explicit `loading` prop from parent
- Frontend-only gating for premium data — always enforce backend entitlement checks (`require_entitlement`) on premium endpoints
- Blocking Stripe SDK calls inside async route handlers — wrap provider SDK calls in `asyncio.to_thread()`
- `Query(...)` in dependencies requiring custom HTTP errors — use `Query(None)` + explicit validation for 402 payment-required flows
- Divergent frontend/backend price env vars — keep backend as source of truth via `GET /api/pricing`

## Risk card contract

Every risk card must have: (1) score 0-100 + severity, (2) plain-language meaning, (3) viewing questions, (4) source + date. Tiles in 2x2 grid; tap opens detail with comparison chart (address vs city vs NL vs WHO).

## Reference docs (don't embed, just read when needed)

- `docs/design-prd.md` — "Polar Frost" design direction
- `docs/design-spec.md` — Pixel-level visual spec
- `docs/palette.md` — Color palette with WCAG requirements
- `docs/ui-principles.md` — Mobile UX principles
- `docs/sunlight-prd.md` — Sunlight v1 product requirements
- `backend/CLAUDE.md` — Backend-specific conventions
- `frontend/CLAUDE.md` — Frontend-specific conventions
- Data source endpoints + API quirks → already in auto-memory (MEMORY.md)
- Historical session learnings → already in auto-memory (MEMORY.md)

## Session Learnings (2026-02-25) � Resilience and Polish

Key patterns from the resilience hardening session, documented in full in `frontend/CLAUDE.md`:

- **Graceful degradation is not optional**: Every async section needs `error + onRetry` props. Silent swallowing = broken UX. Components fixed this session: NeighborhoodViewer3D, ViewingChecklist, RiskDetailView, BuildingFactsCard.
- **Three race conditions to handle in every re-entrant async handler**: (A) AbortController for duplicate API chains, (B) boolean guard for double-tap on sync-looking ops, (C) activeScreenRef for post-await screen staleness.
- **All timer IDs live in refs**: setTimeout/setInterval/rAF IDs stored in useRef, cleared in cleanup AND on address reset. Missing cleanup causes memory leaks and phantom callbacks.
- **Skeleton layout must mirror loaded layout exactly**: Mismatches cause layout shift. Validate at 375px and 360px widths.
- **Hardcoded hex in components is a recurring bug**: Always use var(--color-*) tokens. Scan new components for hex literals before committing.
- **Deep-link failures need toast + redirect**: URL with ?lookup=... must handle PDOK failure gracefully: toast then navigate to search, not a broken dossier screen.



## Session Learnings (2026-03-03) — PDF Dossier Epics 1-4 + Assessment Discipline

Key patterns from 5 sessions assessing and fixing PDF dossier diagnostic Epics 2-4:

- **Assessment without test execution has >50% false-positive rate for delivery verdicts**: Static code review (by Claude or Codex) gave PASS/PARTIAL verdicts that test execution revealed as 19/23 failures. Never assess delivery without running tests.
- **Uncommitted working tree changes are dangerously unreliable assessment targets**: Code read from working tree may disappear when other sessions or operations clean it. Always verify code state with `git status` and pin assessments to a specific commit.
- **Prerequisite epics must be verified as committed before assessing dependent epics**: Epic 3 depended on Epic 2 deliverables that were never committed. Assessment was meaningless without verifying prerequisites first.
- **Document numbering ambiguity causes assessment confusion**: The diagnostic uses overlapping numbering (Part B defect categories E1-E11 vs Part E-H implementation epics EPIC 1-4). Always specify Part or full title when referencing items.
- **Git stash hides untracked files from all standard workflows**: `git stash -u` captures untracked files invisible to `git diff`, `git log`, `git ls-tree`. Check `git stash list` when files seem missing.
- **Subagent CSS property analysis has significant false-negative rate**: Explore subagents reading grep snippets can miss properties present later in the same CSS block. Always verify subagent CSS claims by reading full rule blocks directly.
- **Three-round assessment self-correction**: Quick scan overestimates, subagent deep-dive overcorrects, direct verification reaches accurate conclusion. Skip subagents for CSS property checks.
- **Silent PDF section omission violates graceful degradation**: When sections guard with `if data is not None`, they silently disappear. Every PDF section must have an explicit "unavailable" fallback.
- **Page-specific PDF assertions are fragile**: Asserting content on specific page indices couples tests to layout. Search full PDF text instead.
- **`skipif` guards must test actual capability, not just binary presence**: `shutil.which('lualatex')` passes when lualatex exists but can't compile (missing fonts). Use a robust probe that actually compiles a minimal document.
- **Feature branches become stale when work merges via different route**: During rebase, all commits had add/add conflicts because identical work was already in main from another branch. `git merge-base --is-ancestor` is the definitive check for stale branches.
- **Context window exhaustion on large review+fix sessions**: Combine adversarial review + implementation in one session risks hitting limits. Consider splitting into review session + fix session.

## Session Learnings (2026-03-01) — Sunlight v2 + PDF Diagnostic

Key patterns from 13 sessions implementing Sunlight v2 Phases 3-6, adversarial code reviews, and PDF dossier quality audit:

- **Deterministic timestamps for solar computations**: Perez luminance weighting uses sun altitude — `new Date()` at night zeroes SVF entirely. Always use a fixed summer noon reference (June 21 12:00 local) for Perez weighting.
- **UTC/local timezone trap in weather alignment**: `getUTCHours()` is mandatory for extracting minutes from ISO date strings. Local extraction drifts 1-2 hours with DST.
- **Codex adversarial review sandbox limitation**: Codex can't execute `npm run test` or `pytest` in its sandbox. This inflates false-negative rate to ~30-50%. Always cross-verify Codex "FAIL" verdicts with actual test runs.
- **Concurrent sessions modify working tree mid-review**: Another session can fix bugs during a long review, causing stale findings. Always verify findings against HEAD before acting on them.
- **Untracked files masquerade as missing**: `git diff` only shows tracked file changes. New files (`??` in git status) won't appear — check `git status` not just `git diff`.
- **Phase scope bleed causes test failures**: Phase 5 work (~60%) leaked into Phase 4 sessions. Keep implementation sessions strictly scoped to one phase.
- **PDF root cause is rendering, not data**: Backend computes sunlight, livability, property warnings, crime — but drops them at the fpdf2 rendering boundary. The dossier PDF uses minimal primitives (1mm bars, no axes/legends). This is a rendering gap, not a data gap.
