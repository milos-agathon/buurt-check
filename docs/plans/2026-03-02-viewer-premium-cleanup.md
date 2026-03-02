# Viewer Premium Content Cleanup — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove premium-only content (Property Warnings, Sunlight, Asbestos, Soil, Shadow Snapshots) from the frontend viewer while keeping it in the Full Dossier PDF. Remove duplicate buy CTA from LockedSection.

**Architecture:** Frontend-only changes. Remove viewer-side rendering of 6 premium items. Data fetching remains (PDF still needs it). LockedSection simplified. Tests updated to match new viewer composition.

**Tech Stack:** React 18, TypeScript, Vitest, i18next

**Pre-existing completions:** Orders 3, 4, 5 are already done. Only Orders 1 and 2 need implementation.

---

### Task 1: Remove PropertyWarnings section from viewer

**Files:**
- Modify: `frontend/src/App.tsx:2842-2863`

**Step 1: Remove the PropertyWarnings conditional block**

Delete the entire block at lines 2842-2863 — the `{progressivePhase !== 'house' && ...}` that renders either `PropertyWarningsCard` or `LockedSection` for warnings:

```tsx
// DELETE this entire block (lines 2842-2863):
{progressivePhase !== 'house' && (isEntitled ? (propertyWarningsLoading || propertyWarnings || propertyWarningsError) : true) && (
  <div className="dossier-section" style={dossierSectionStyle(4)} data-section-index={4}>
    <h3 id="section-warnings" className="app__section-label">{t('warnings.sectionTitle')}</h3>
    {isEntitled ? (
      <PropertyWarningsCard ... />
    ) : (
      <LockedSection sectionName={t('premium.section.warnings', 'property warnings')} />
    )}
  </div>
)}
```

**Step 2: Renumber downstream section indexes**

After removing section 4, shift all `data-section-index` and `dossierSectionStyle()` calls down by 1:
- Section 5 (Livability) → 4
- Section 6 (3D Viewer) → 5
- Section 7 (NeighborhoodStats) → 6
- Section 8 (TierB) → 7
- Section 9 (ViewingChecklist) → 8
- Section 10 (ActionBar) → 9

**Step 3: Verify build compiles**

Run: `cd frontend && npm run build`
Expected: PASS (no TS errors — PropertyWarningsCard import and data stay for PDF, just not rendered)

---

### Task 2: Remove sunlight tile from RiskTilesGrid

**Files:**
- Modify: `frontend/src/components/RiskTilesGrid.tsx`

**Step 1: Remove the sunlight tile and related code**

In `RiskTilesGrid.tsx`, remove:
1. The `sunlight` prop from the interface (line 8)
2. The `normalizeSunlightScore` function (lines 27-29)
3. The `sunlightScore` and `sunlightSeverity` calculations (lines 32-35)
4. The sunlight `<RiskTile>` element (lines 60-66)
5. The `SunlightResult` import (line 3)

Result should be 3 tiles: noise, air, climate. The interface should be:

```tsx
interface RiskTilesGridProps {
  risks?: RiskCardsResponse;
  onTileTap?: (category: string) => void;
}
```

**Step 2: Remove sunlight prop from App.tsx usage**

In `App.tsx` line 2797, remove `sunlight={sunlight ?? undefined}` from the `<RiskTilesGrid>` JSX.

**Step 3: Verify build compiles**

Run: `cd frontend && npm run build`
Expected: PASS

---

### Task 3: Remove sunlight from detail view and tile tap handler

**Files:**
- Modify: `frontend/src/App.tsx:2351-2420` (getDetailProps), `App.tsx:956-965` (handleRiskTileTap)

**Step 1: Remove sunlight case from getDetailProps**

In the `getDetailProps` function (~line 2351):
1. Remove the `sunlightScore`, `sunlightSeverity`, `sunlightMeaning` calculations (lines 2352-2364)
2. Remove the `category !== 'sunlight'` check in line 2367 — change to just `if (!currentRiskCards) return null;`
3. Remove the `case 'sunlight':` block (lines 2409-2417)

**Step 2: Remove sunlight from activeQuestions fallback**

Search for `fallbackSunlightQuestions` usage and remove the sunlight branch from the questions memo (around line 2575-2588 per exploration).

**Step 3: Verify build compiles**

Run: `cd frontend && npm run build`
Expected: PASS

---

### Task 4: Simplify AttentionSummary — remove warnings and sunlight

**Files:**
- Modify: `frontend/src/components/AttentionSummary.tsx`

**Step 1: Remove warning flags and sunlight from computeFlags**

Replace `computeFlags` to only use noise, air, climate risk scores:

```tsx
function computeFlags(
  riskCards: RiskCardsResponse | undefined,
): { flags: Flag[]; assessed: number } {
  const flags: Flag[] = [];
  let assessed = 0;

  const scores: Record<string, number | undefined> = {};
  if (riskCards) {
    scores.noise = riskCards.noise.score;
    scores.air_quality = riskCards.air_quality.score;
    scores.climate = riskCards.climate_stress.score;
  }

  for (const [cat, score] of Object.entries(scores)) {
    if (score == null) continue;
    assessed += 1;
    if (score < 30) {
      flags.push({ category: cat, severity: 'critical' });
    } else if (score < 50) {
      flags.push({ category: cat, severity: 'elevated' });
    }
  }

  return { flags, assessed };
}
```

**Step 2: Simplify Props interface and component**

Remove unused props: `warnings`, `sunlightScore`, `livability`, `includeAsbestos`. Remove their imports (`PropertyWarningsResponse`, `LivabilityResponse`). Update the component signature:

```tsx
interface Props {
  riskCards?: RiskCardsResponse;
}

function AttentionSummary({ riskCards }: Props) {
  // ...
  const { flags, assessed } = useMemo(
    () => computeFlags(riskCards),
    [riskCards],
  );

  if (!riskCards) return null;

  const total = 3; // noise, air, climate (sunlight removed)
  // ...rest unchanged
}
```

**Step 3: Update AttentionSummary usage in App.tsx**

In `App.tsx` around line 2724, simplify the props:

```tsx
<AttentionSummary
  riskCards={riskCards ?? undefined}
/>
```

Remove `warnings={propertyWarnings ?? undefined}`, `sunlightScore={...}`, `livability={...}`, `includeAsbestos={false}`.

Also update the render guard (line 2716-2717): remove the `propertyWarningsLoading`/`propertyWarnings`/`propertyWarningsError` checks since AttentionSummary no longer needs warnings data.

**Step 4: Verify build compiles**

Run: `cd frontend && npm run build`
Expected: PASS

---

### Task 5: Remove upgrade prompt from LockedSection (Order #2)

**Files:**
- Modify: `frontend/src/components/LockedSection.tsx:20`

**Step 1: Remove the upgrade prompt line**

Delete line 20:
```tsx
<p className="locked-section__subtitle">{t('premium.locked.upgradePrompt')}</p>
```

LockedSection now shows only title + subtitle (section name), no purchase prompt.

**Step 2: Verify build compiles**

Run: `cd frontend && npm run build`
Expected: PASS

---

### Task 6: Update tests — AttentionSummary

**Files:**
- Modify: `frontend/src/components/AttentionSummary.test.tsx`

**Step 1: Update all tests to match new simplified API**

Key changes:
1. Remove `warnings` and `sunlightScore` from all `renderSummary` calls
2. Remove test helpers that create warning data: `makeCleanWarnings`, `makeFoundationHighWarnings`, `makeApartmentWarnings`, `makePre1980Warnings`
3. Remove `PropertyWarningsResponse` import and `makePropertyWarningsResponse` import
4. Remove `LivabilityResponse` import
5. Update `total` from 4 to 3 everywhere (`/4 of 4/` → `/3 of 3/`, `/2 of 4/` → `/2 of 3/`)
6. Delete tests that test warning-specific behavior:
   - `'includes VvE in flag count for apartments'`
   - `'includes asbestos in flag count for pre-1980'`
   - `'includes lead pipe flag when flagged'`
   - `'does not include lead pipe flag when not flagged'`
   - `'lead pipe flag count is not affected by low livability'`
   - `'does NOT flag livability even when normalized < 40 (v7 spec)'`
7. Update `'shows red badge for multiple flags'`: use two bad risk scores instead of risk+warning
8. Update `'renders flag bullet list when flags exist'`: use risk cards with two bad scores (no warnings)

**Step 2: Run tests**

Run: `cd frontend && npx vitest run src/components/AttentionSummary.test.tsx`
Expected: ALL PASS

---

### Task 7: Update tests — App.test.tsx section order + stagger

**Files:**
- Modify: `frontend/src/App.test.tsx:796-912`

**Step 1: Update section order regression test**

In `'renders sections in the full v7 canonical order'` (line 797):
1. Remove the `expect(screen.getByTestId('property-warnings'))` assertion (line 825)
2. Remove `'[data-testid="property-warnings"], '` from the selector (line 841)
3. Remove `if (tid === 'property-warnings') return 'warnings';` from the mapper (line 855)
4. Remove `'warnings'` from the expected array (line 872)

New expected order:
```ts
const expected = [
  'attention', 'address-header', 'building', 'risk',
  'livability', 'viewer-3d',
  'stats', 'tierb', 'checklist', 'actionbar',
];
```

**Step 2: Update stagger indexes test**

In `'applies stagger indexes to dossier sections for reveal animation'` (line 879):
- Update expected unique indexes from `[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]` to `[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]` (10 sections instead of 11)

**Step 3: Run tests**

Run: `cd frontend && npx vitest run src/App.test.tsx`
Expected: ALL PASS

---

### Task 8: Update tests — LockedSection

**Files:**
- Modify: `frontend/src/components/LockedSection.test.tsx`

**Step 1: Add test verifying no upgrade prompt**

Add a test or update existing to confirm upgrade prompt text is absent:

```tsx
it('does not render an upgrade prompt', () => {
  renderLockedSection();
  expect(screen.queryByText(/purchase/i)).not.toBeInTheDocument();
});
```

**Step 2: Run tests**

Run: `cd frontend && npx vitest run src/components/LockedSection.test.tsx`
Expected: ALL PASS

---

### Task 9: Run full test suite and quality gates

**Step 1: Run all frontend tests**

Run: `cd frontend && npm run test`
Expected: 850+ tests pass (some removed, baseline adjusted)

**Step 2: Run TypeScript build**

Run: `cd frontend && npm run build`
Expected: PASS with no errors

**Step 3: Run backend tests (sanity check — no backend changes)**

Run: `cd backend && python -m pytest -x -q -m "not live"`
Expected: 629+ PASS (unchanged)

**Step 4: Run ruff**

Run: `cd backend && ruff check .`
Expected: PASS (no backend changes)

---

### Task 10: Commit

**Step 1: Stage and commit all changes**

```bash
git add frontend/src/App.tsx \
  frontend/src/components/AttentionSummary.tsx \
  frontend/src/components/AttentionSummary.test.tsx \
  frontend/src/components/RiskTilesGrid.tsx \
  frontend/src/components/LockedSection.tsx \
  frontend/src/components/LockedSection.test.tsx \
  frontend/src/App.test.tsx \
  docs/plans/2026-03-02-viewer-premium-cleanup-design.md \
  docs/plans/2026-03-02-viewer-premium-cleanup.md
git commit -m "feat: hide premium-only content from viewer (Orders 1+2)

Remove PropertyWarnings section, sunlight tile, and sunlight detail
view from the frontend viewer. These items remain in the Full Dossier
PDF. Simplify AttentionSummary to only flag noise/air/climate risks.
Remove upgrade prompt from LockedSection."
```
