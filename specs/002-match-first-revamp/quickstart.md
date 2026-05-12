# Quickstart: Match-First UI Revamp

This quickstart is for validating the implementation plan once tasks are generated and executed. It is not an implementation script.

## 1. Start The Backend

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

Expected:

- FastAPI starts under `/api`.
- Existing address and match endpoints remain available.
- New match-first session endpoints respond after Phase 3.

## 2. Start The Frontend

```bash
cd frontend
npm run dev
```

Expected:

- Vite starts and proxies `/api` to the backend.
- Opening the app shows the match-first landing screen.
- `#/search` remains available as a secondary direct-address path.

## 3. Phase Validation Commands

### Phase 1: UI shell and route cleanup

```bash
cd frontend
npm run build
npm run test -- src/test/match-first-routing.test.tsx src/components/match-first/MatchFirstLanding.test.tsx
```

Pass criteria:

- `/` and `#/match` render match-first landing.
- Search is a secondary text link.
- Existing hash routes still parse and build.
- Reduced-motion hero fallback renders.

### Phase 2: Survey and preference vector

```bash
cd frontend
npm run test -- src/test/match-first-survey.test.tsx
cd ../backend
pytest -q tests/test_match_sessions.py
```

Pass criteria:

- Exactly one survey question appears per step.
- Back/edit behavior restores previous answers.
- Required validation is localized and accessible.
- Stored answers use stable keys.
- Preference vector generation separates hard filters and weights.

### Phase 3: Matching backend

```bash
cd backend
ruff check .
pytest -q tests/test_match_jobs.py tests/test_match_results_contract.py
```

Pass criteria:

- Match job starts only after review/run.
- Pollable status is backed by persisted job state.
- Results include fit scores, reason codes, confidence, source/freshness metadata, geometry refs, and no predictive probabilities.

### Phase 4: Progress and success states

```bash
cd frontend
npm run test -- src/test/match-first-progress.test.tsx
```

Pass criteria:

- UI messages come from backend stage keys.
- Slow, failed, fallback, and retry states preserve answers.
- Success checkmark appears only after completed job.
- Reduced-motion path is usable.

### Phase 5: Results map

```bash
cd frontend
npm run test -- src/test/match-first-results-map.test.tsx
npm run test:e2e -- tests/e2e/match-first-flow.spec.ts
```

Pass criteria:

- Results open on Netherlands view.
- List selection and map selection synchronize.
- Mobile map/list mode preserves route state.
- Keyboard users can select recommendations without map interaction.

### Phase 6: Neighborhood 3D detail

```bash
cd backend
pytest -q tests/test_match_neighborhood_layers.py
cd ../frontend
npm run test -- src/test/match-first-neighborhood-detail.test.tsx
```

Pass criteria:

- Building requests happen only after selected neighborhood.
- Building bounds are selected-neighborhood scoped.
- Missing 3D shows 2D fallback.
- Amenity tags are preference-aware and concise.

### Phase 7: Dossier bridge

```bash
cd backend
pytest -q tests/test_match_dossier_bridge.py
cd ../frontend
npm run test -- src/test/match-first-dossier-bridge.test.tsx
npm run test:e2e -- tests/e2e/match-first-dossier-roundtrip.spec.ts
```

Pass criteria:

- House selection resolves to existing `#/address/{vbo_id}` when reliable.
- No-address fallback is localized and recoverable.
- Persistent Back to match map restores prior state without rerunning matching.
- Existing Dossier contracts remain intact.

### Phase 8: Final quality gates

```bash
cd backend
ruff check .
pytest -x -q -m "not live"
cd ../frontend
npm run build
npm run test
npm run test:e2e
```

Pass criteria:

- All touched backend and frontend tests pass.
- Accessibility checks cover keyboard, focus, contrast, reduced motion, and non-map alternatives.
- Analytics payloads use stable keys and privacy-safe metadata.

## 4. Manual Smoke Path

1. Open the app at `/`.
2. Confirm the first screen has one dominant match CTA and a smaller address-search link.
3. Switch language and confirm visible copy changes without changing stored answer IDs.
4. Start survey and answer one question at a time.
5. Refresh mid-survey and confirm answers restore.
6. Reach review and confirm no match job started before the final CTA.
7. Click final CTA and observe real polling progress.
8. Wait for success checkmark and open results map.
9. Select a neighborhood from the list and from the map.
10. Open selected-neighborhood detail and confirm no national 3D request occurs.
11. Select a house/address and open the existing Dossier.
12. Use Back to match map and confirm session, selected neighborhood, map/list state, and language restore.

## 5. Rejection Checklist

Reject the implementation if any of these are true:

- It starts with Dossier redesign instead of match-first landing and route cleanup.
- Search is visually equal to Match on the first screen.
- Any new user-facing string is hard-coded or missing EN/NL parity.
- Results claim predictive probability without labels and validation data.
- The app loads national 3D buildings.
- Dossier opened from match context lacks persistent Back to match map.
- A phase skips its acceptance-linked tests or verification.
