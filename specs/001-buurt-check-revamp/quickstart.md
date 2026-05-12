# Quickstart: Buurt Check Revamp Planning Artifacts

This quickstart is for implementing the revamp from the Spec Kit plan. It does not require real provider credentials because the first slices use seed/mock providers.

## 1. Read the Planning Set

```powershell
Get-Content -Raw docs\prd.md
Get-Content -Raw specs\001-buurt-check-revamp\spec.md
Get-Content -Raw specs\001-buurt-check-revamp\plan.md
Get-Content -Raw specs\001-buurt-check-revamp\data-model.md
Get-Content -Raw specs\001-buurt-check-revamp\contracts\match-api.md
```

## 2. Confirm Current Stack

```powershell
Get-Content -Raw backend\pyproject.toml
Get-Content -Raw frontend\package.json
Get-Content -Raw frontend\src\styles\tokens.css
```

Implementation must keep:

- FastAPI, async `httpx`, Pydantic v2, pydantic-settings.
- SQLite/Turso through `backend/app/db.py`.
- React + TypeScript + Vite.
- Plain CSS and Polar Frost tokens.
- Existing app-level state pattern; no Redux/Zustand/React Query.
- i18n through `frontend/src/i18n/en.json` and `frontend/src/i18n/nl.json`.

## 3. Start with P0 Domain Tests

Create backend tests before or alongside implementation:

```powershell
cd backend
pytest -q tests\test_match_preferences.py tests\test_match_personas.py tests\test_match_scoring.py
```

Initial failures should cover:

- Preference vector captures hard filters, weighted priorities, buy/rent/both, language, anchors, and avoid signals.
- Persona detection supports family, newcomer, city-escape, single/couple, buyer, renter, and starter overlays.
- Scoring produces deterministic top/surprising/stretch/reconsider categories with confidence and source refs.

## 4. Seed Data First

Add seed/mock data under `backend/app/data/match_seed/` and load it through `SeedMockImporter`.

Requirements:

- Include Amsterdam, Utrecht, Rotterdam, The Hague, Eindhoven, and commuter-style example neighborhoods.
- Mark mock records with source type `mock`.
- Include source name, source type, timestamp, geography level, confidence, and limitations for every metric.
- Missing data must be explicit and lower confidence.

## 5. Add API Slices

Add `backend/app/api/match.py` and include it from `backend/app/api/router.py`.

Implement in this order:

1. `POST /api/match/quiz`
2. `POST /api/match/recommendations`
3. `POST /api/match/similar`
4. `GET /api/match/map`
5. `POST /api/match/reports`
6. `POST /api/match/compare`
7. Listings, alerts, feedback, admin endpoints

Use `contracts/match-api.md` as the response contract.

## 6. Add Frontend Slices

Create:

```text
frontend/src/types/match.ts
frontend/src/services/matchApi.ts
frontend/src/services/matchStorage.ts
frontend/src/services/matchAnalytics.ts
frontend/src/components/match/
```

Add screens through the existing `App.tsx` screen state:

- `matchLanding`
- `matchQuiz`
- `matchLoading`
- `matchReport`
- `matchComparison`
- `matchMap`
- `matchListings`
- `matchSaved`
- `matchAlerts`
- `matchAdmin`

All new visible copy must be added to both i18n JSON files.

## 7. Verification Commands

Backend:

```powershell
cd backend
ruff check .
pytest -x -q -m "not live"
```

Frontend:

```powershell
cd frontend
npm run build
npm run test
```

E2E for this feature once screens exist:

```powershell
cd frontend
npm run test:e2e -- tests/e2e/match-*.spec.ts
```

## 8. Manual Smoke Flow

1. Start backend:

   ```powershell
   cd backend
   uvicorn app.main:app --reload --port 8000
   ```

2. Start frontend:

   ```powershell
   cd frontend
   npm run dev
   ```

3. In the browser:

   - Open the match landing page.
   - Switch EN/NL and confirm no missing keys.
   - Complete quiz for `both` intent.
   - Confirm top/surprising/stretch/reconsider categories.
   - Open report and confirm evidence/source/freshness/confidence.
   - Compare three neighborhoods.
   - Open map.
   - Save at least three neighborhoods.
   - Create an alert in mock notification mode.
   - Submit love/maybe/not-for-me feedback.
   - Open admin dashboard and confirm mock/stale/missing/provider statuses are visible.

## 9. Completion Criteria for a Phase

A phase is not complete until:

- Relevant unit/integration/UI/E2E tests are added and passing.
- New user-facing copy exists in EN and NL.
- Source/freshness/confidence appears wherever data is shown.
- AI, if touched, has schema validation and deterministic fallback.
- Provider failures and missing/stale metrics are logged or visible in admin diagnostics.
- Quality gates for touched areas are run and documented.
