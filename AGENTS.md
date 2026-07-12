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
  src/services/    # api.ts (fetch), shortlist.ts, theme.ts (light default; dark opt-in)
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

## Match-first revamp constitution

- Primary flow is sacred: landing hero -> survey intro -> one-question survey -> review -> backend matching progress -> animated checkmark success -> Netherlands results map -> neighborhood 3D detail -> house click -> existing Dossier -> back to match map.
- Search stays secondary on the first screen. It must not compete with match as an equal CTA, card, tab, or mode choice.
- Onboarding is minimal: one decision per screen, exactly one survey question at a time, no dashboards, charts, feature grids, long explanations, ads, or unrelated content.
- All user-facing text uses Dutch/English translation keys. Do not hard-code English or Dutch strings in components, services, route labels, progress states, fallbacks, or validation messages.
- Map performance comes first: never load national 3D buildings. Load and render 3D houses only after a neighborhood is selected, and only within that selected neighborhood's bounds. Viewport-based loading may be used only for paging or level-of-detail inside the selected neighborhood, never as an independent trigger outside it. Include 2D, reduced-motion, and non-map list fallbacks.
- Be honest about models. Without real labels and validation data, present deterministic or semi-deterministic weighted scoring as a data-backed fit score, not predictive probability.
- Preserve the existing Dossier. Add route context and a persistent "Back to match map" action only as needed; do not casually rewrite Dossier modules.
- Accessibility is P0: keyboard navigation, screen-reader labels, touch targets, contrast, focus management, reduced motion, and non-map alternatives.
- Every phase needs tests or verification tied to acceptance criteria. Do not skip tests to move faster.
- Preserve context across navigation: survey answers, session ID, selected neighborhood, map state, language, selected house, and Dossier return path.
- Do not promise perfect fit, safety, happiness, investment certainty, future value, or guaranteed outcomes. Ground explanations in data, reason codes, sources, and limitations.
- Before planning, read `docs/prd.md` and `docs/context/current_architecture.md`. Before implementation, produce tasks with exact file paths and acceptance criteria. If a requirement conflicts with the codebase, document the conflict and propose the smallest safe change.

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
- `--color-accent` (#0D9488) as text on light bg — use `--color-accent-text` / `--color-accent-hover` (#00685F); tertiary warm accent is #C36D4B; full palette in `docs/palette.md`
- `react-three-fiber` or `drei` — plain Three.js only
- React Query / Zustand / Redux — useState + props
- Bare `= []` in Pydantic models — use `Field(default_factory=list)`
- `sampled_at` as `source_date` fallback — let it be `None`

## Risk card contract

Every frontend risk card must have: (1) score 0-100 + severity, (2) plain-language meaning, (3) viewing questions, (4) source + date. The app frontend renders only Noise, Air, and Climate risk tiles; tap opens detail with comparison chart (address vs city vs NL vs WHO). Sunlight analysis stays paid-report/PDF only and must not be rendered as a frontend risk tile or detail view.

## Reference docs (don't embed, just read when needed)

- `docs/design-prd.md` — "Polar Frost" design direction
- `docs/design-spec.md` — Pixel-level visual spec
- `docs/palette.md` — Color palette with WCAG requirements
- `docs/ui-principles.md` — Mobile UX principles
- `backend/CLAUDE.md` — Backend-specific conventions
- `frontend/CLAUDE.md` — Frontend-specific conventions
- Data source endpoints + API quirks → already in auto-memory (MEMORY.md)
- Historical session learnings → already in auto-memory (MEMORY.md)

<!-- SPECKIT START -->
For additional context about the Buurt Check Revamp technical approach,
architecture, data model, contracts, testing strategy, and implementation
phases, read `specs/002-match-first-revamp/plan.md`. For governing rules,
read `.specify/memory/constitution.md`.
<!-- SPECKIT END -->
