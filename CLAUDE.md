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
  tests/           # pytest (613+ non-live tests)
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
cd backend && pytest -x -q -m "not live"   # CI tests (613+ baseline)
cd backend && ruff check .                  # MUST pass before commit
# Payment features require BUURT_STRIPE_SECRET_KEY, BUURT_STRIPE_WEBHOOK_SECRET,
# BUURT_STRIPE_PRICE_CENTS, BUURT_BASE_URL, BUURT_DATABASE_PATH.

# Frontend
cd frontend && npm run dev                  # Dev server (proxies /api to :8000)
cd frontend && npm run build                # MUST pass before commit (strict TS)
cd frontend && npm run test                 # Vitest (713+ baseline)
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


