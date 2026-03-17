# CLAUDE.md -- buurt-check

Mobile-first web app helping expats and first-time homebuyers in the Netherlands avoid bad property purchases. User pastes an address, gets an evidence-backed dossier with risk cards, 3D context, neighborhood stats, and a viewing checklist.

## Tech stack

| Layer | Stack |
|-------|-------|
| Backend | Python 3.12, FastAPI, httpx (async), Pydantic v2, pydantic-settings, Redis, scipy, fpdf2 |
| Frontend | React 18, TypeScript 5, Vite 6, Framer Motion, Three.js, Leaflet, SunCalc, i18next |
| Styling | Plain CSS with design tokens ("Polar Frost"). NO Tailwind, NO CSS-in-JS |
| Testing | pytest + pytest-asyncio (backend), Vitest 4.x + Testing Library (frontend), Playwright (E2E) |
| Linting | ruff (backend), TypeScript strict mode via `npm run build` (frontend) |

## Project structure

```
backend/           # FastAPI external-data aggregator + buyer-bound monetization state
  app/api/         # Route handlers (address.py — all 15 endpoints under /api/address/)
  app/services/    # Business logic (bag, risk_cards, cbs, scoring, pdf_export, livability, etc.)
  app/models/      # Pydantic response models
  app/cache/       # Redis with circuit breaker
  app/config.py    # pydantic-settings (BUURT_* env prefix)
  tests/           # pytest (565+ non-live tests)
frontend/          # React + Vite + TypeScript
  src/components/  # All UI components (dossier cards, navigation, search, shortlist)
  src/styles/      # tokens.css (195 CSS custom properties), satoshi.css (font)
  src/services/    # api.ts (fetch), shortlist.ts, theme.ts (dark mode)
  src/i18n/        # en.json + nl.json (~380 keys each, parity enforced)
  src/types/       # TypeScript interfaces mirroring backend models
docs/              # Design specs, plans, palette, UI principles
```

## Commands

```bash
# Backend
cd backend && uvicorn app.main:app --reload --port 8000
cd backend && pytest -x -q -m "not live"   # CI tests (565+ baseline)
cd backend && ruff check .                  # MUST pass before commit

# Frontend
cd frontend && npm run dev                  # Dev server (proxies /api to :8000)
cd frontend && npm run build                # MUST pass before commit (strict TS)
cd frontend && npm run test                 # Vitest (705+ baseline)
```

## Architecture decisions

- **Stateless external data aggregator**: Backend proxies Dutch government APIs (BAG, CBS, RIVM, 3DBAG, Klimaateffectatlas, Leefbaarometer) with Redis caching; SQLite/Turso stores buyer-bound dossier purchase state
- **Single router**: All endpoints in `api/address.py`. Services do the work
- **0-100 risk scoring**: Backend normalizes raw values via `scoring.py`. 4-level severity: good (70-100), moderate (40-69), poor (20-39), critical (0-19)
- **State management**: App-level `useState` in `App.tsx`. No Redux/Zustand. Screen routing via `activeScreen`
- **i18n from day one**: All strings via `t()`. EN + NL. Warning codes from backend: `t('feature.warning.${code}', code)`
- **Export contract**: `quick_brief` / quick checklist PDF is free; `full_dossier` requires payment before first download; the interactive viewer remains free
- **Purchase scope**: No user accounts in MVP. Use a server-issued anonymous buyer key and bind entitlement to `buyer_key + vbo_id`

## Product principles

1. **Consequences over data** — translate every number into "what does this mean for me"
2. **5-8 indicators max per section** — curate aggressively, no dashboard spam
3. **Bilingual by default** — EN/NL, not bolted on later
4. **Disclaimers mandatory** — always cite source, date, and limitations
5. **Graceful degradation** — if a data source fails, show "unavailable", never crash the dossier

## Monetization notes

- Keep the supported product contract simple: free on-screen viewer, free `quick_brief`, paid-before-download `full_dossier`
- Make entitlement decisions on the server, scoped to the anonymous buyer and the address
- Do not treat `report_id` as a bearer token by itself; docs and future implementation should treat it as an export snapshot reference within a buyer-bound purchase flow

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

## Risk card contract

Every risk card must have: (1) score 0-100 + severity, (2) plain-language meaning, (3) viewing questions, (4) source + date. Tiles in 2x2 grid; tap opens detail with comparison chart (address vs city vs NL vs WHO).

## Reference docs (don't embed, just read when needed)

- `docs/design-prd.md` — "Polar Frost" design direction
- `docs/design-spec.md` — Pixel-level visual spec
- `docs/palette.md` — Color palette with WCAG requirements
- `docs/ui-principles.md` — Mobile UX principles
- `backend/CLAUDE.md` — Backend-specific conventions
- `frontend/CLAUDE.md` — Frontend-specific conventions
- Data source endpoints + API quirks → already in auto-memory (MEMORY.md)
- Historical session learnings → already in auto-memory (MEMORY.md)
