# Palette Alignment Assessment — 2026-02-10

## Scope

Rigorous audit of the Polar Frost Token Alignment implementation against `docs/palette.md`, the implementation plan, and the Section 7 implementation checklist.

---

## What Was Completed

| Step | Description | Status |
|------|-------------|--------|
| 1 | Add slate/teal scale tokens, nav/overlay, choropleth ramps | Done |
| 2 | Fix 17 hardcoded colors across 8 CSS files | Done (with issues) |
| 3 | ActionBar secondary border 1.5px → 1px | Done |
| 4 | 3D viewer uniform slate neighbors + teal edge glow | Done |
| 5 | Map → PDOK BRT grijs; chart colors aligned | Done |
| 6 | Documentation updates | Done |

**Build:** Passes. **Tests:** 330/330 pass (37 files, 0 failures).

---

## Issues Found

### Issue 1: TopBar Token Semantic Mismatch (3 values)

**Severity: Medium — Visual regression in nav bar**

The TopBar CSS replacements used coarse tokens that don't match the original opacity values:

| Element | Original | Token Used | Token Value | Delta |
|---------|----------|-----------|-------------|-------|
| Lang-toggle BG | `rgba(255,255,255,0.12)` | `--color-nav-border` | `rgba(255,255,255,0.1)` | -17% opacity |
| Lang-toggle border | `rgba(255,255,255,0.15)` | `--color-nav-border` | `rgba(255,255,255,0.1)` | -33% opacity |
| Settings icon color | `rgba(255,255,255,0.7)` | `--color-nav-text-dimmed` | `rgba(255,255,255,0.6)` | -14% opacity |

**Problems:**
- The lang-toggle border (0.15) was intentionally more opaque than its background (0.12) to create visual separation. Both now map to 0.1, losing the hierarchy.
- The settings gear icon at 0.6 is noticeably dimmer than the intended 0.7.

**Fix:** Add 2 new tokens to `tokens.css`:
```css
/* In :root */
--color-nav-control-bg: rgba(255, 255, 255, 0.12);
--color-nav-icon: rgba(255, 255, 255, 0.7);
```

Then update TopBar.css:
```css
/* Line 36: lang-toggle bg */
background: var(--color-nav-control-bg);

/* Line 39: lang-toggle border — keep --color-nav-border (0.1 vs 0.15 is acceptable
   since border is thinner than fill and already uses a defined token) */

/* Line 69: settings icon */
color: var(--color-nav-icon);
```

**Files:** `frontend/src/styles/tokens.css`, `frontend/src/components/TopBar.css`

---

### Issue 2: Perf Banner Hardcoded `white` (CSS keyword)

**Severity: Low — Functional but violates token discipline**

`NeighborhoodViewer3D.css:110` uses `color: white` instead of a token.

**However**, changing to `var(--color-text-inverse)` would **break dark mode**: in dark mode `--color-text-inverse` is `#1C2D3F` (dark slate), but the banner background `--color-overlay-dark` is `rgba(0,0,0,0.85)` (near-black). Dark text on near-black = **~1.1:1 contrast ratio**, WCAG failure.

**Fix:** Keep `white` as-is, OR define a purpose-specific token:
```css
/* In :root */
--color-overlay-text: #FFFFFF;

/* In [data-theme="dark"] */
--color-overlay-text: #FFFFFF;  /* Same — always white on dark overlays */
```

Then: `color: var(--color-overlay-text);`

**File:** `frontend/src/styles/tokens.css`, `frontend/src/components/NeighborhoodViewer3D.css`

---

### Issue 3: Undefined Token `--color-border-strong`

**Severity: Medium — CSS references a non-existent token**

`ParallelCoordinates.css:22` uses `stroke: var(--color-border-strong)` but this token is not defined in `tokens.css`. The browser falls back to the initial value (likely transparent or `currentColor`), making the axis lines invisible or unpredictable.

**Fix:** Either define the missing token:
```css
/* In :root */
--color-border-strong: var(--slate-500);

/* In [data-theme="dark"] */
--color-border-strong: var(--slate-200);
```

Or replace inline:
```css
.parallel-coordinates__axis-line {
  stroke: var(--color-text-secondary);
  stroke-width: 1;
}
```

**File:** `frontend/src/styles/tokens.css` or `frontend/src/components/ui/ParallelCoordinates.css`

---

### Issue 4: Accent Used as Text on Light Surfaces (WCAG Fail)

**Severity: High — Accessibility violation per palette.md Section 2**

Palette.md rule: "Accent is never text on light surfaces." Two CSS rules violate this:

| File | Line | Selector | Context | Contrast |
|------|------|----------|---------|----------|
| `AddressSearch.css` | 22 | `.address-search__wrapper:focus-within .address-search__pin` | Teal icon on white input bg | 2.17:1 (FAIL AA) |
| `AddressHeader.css` | 52 | `.address-header__bookmark--active` | Teal icon on white card bg | 2.17:1 (FAIL AA) |

**Note:** `Toast.css:39` also uses `color: var(--color-accent)` but on a dark toast background (`#1C2D3F`), giving 6.47:1 — this one passes.

**Fix for icons:** These are decorative icons, not readable text. Palette.md says accent can be used as "icon fill." However, WCAG requires 3:1 minimum for non-text UI components (WCAG 2.1 SC 1.4.11). At 2.17:1, even as icons this technically fails.

Conservative fix:
```css
/* AddressSearch.css line 22 */
color: var(--color-accent-text);  /* #1C8C83, 4.52:1 on white */

/* AddressHeader.css line 52 */
color: var(--color-accent-text);  /* #1C8C83, 4.52:1 on white */
```

**Files:** `frontend/src/components/AddressSearch.css`, `frontend/src/components/AddressHeader.css`

---

### Issue 5: RiskDetailView Hardcoded `white` Checkmark

**Severity: Negligible — Acceptable**

`RiskDetailView.css:203` uses `border: solid white` for a checkmark inside a checked checkbox. This is inside a `:checked::after` pseudo-element on a teal background. White on teal is 4.51:1 — passes AA. No token exists for internal pseudo-element decorations. **No action needed.**

---

### Issue 6: Dark Mode Basemap Not Implemented

**Severity: Low — Non-blocking, visual quality gap**

Neither `BuildingFootprintMap.tsx` (Leaflet 2D) nor `NeighborhoodViewer3D.tsx` (Three.js WMTS) switch to a dark basemap when dark mode is active. The `grijs` basemap is desaturated but still light-toned, which looks jarring on a dark-mode card surface.

**Fix (deferred):** Add theme-aware basemap URL switching. PDOK does not provide a dark-themed WMTS layer, so this would require either:
- A CSS `filter: invert(1) hue-rotate(180deg)` hack on the Leaflet container
- CartoDB dark_all tiles as an alternative dark-mode source
- Accept the light basemap in dark mode (current behavior)

**Recommendation:** Document as a known limitation and defer. The current grijs basemap is acceptable.

---

### Issue 7: No Ghost Button Variant

**Severity: Low — No consumers currently need it**

Palette.md Section 3 defines 5 button variants: primary, secondary, ghost, destructive, disabled. The codebase has primary and secondary (ActionBar), destructive (SettingsScreen), and disabled states — but no explicit "ghost" variant (inline link-style teal text button).

**Fix:** Not needed now. The plan explicitly said "No new wrapper components — existing inline button/chip styles already follow palette rules." Ghost buttons can be added when a consumer needs them. **No action needed.**

---

### Issue 8: Choropleth Ramp Tokens Have No Consumers

**Severity: Negligible — Tokens are forward-looking**

The 14 choropleth ramp tokens (`--ramp-seq-*`, `--ramp-div-*`) are defined but no component consumes them. This was acknowledged in the plan: "define ramp as CSS tokens only (no consumers yet)."

**No action needed.** Tokens are ready for future neighborhood score visualization.

---

## Palette.md Section 7 Checklist Assessment

| # | Item | Verdict | Notes |
|---|------|---------|-------|
| 1 | CSS custom properties for all tokens | **PASS** | ~195 tokens including scales, ramps, dark mode |
| 2 | Button styles follow 5-variant spec | **PARTIAL** | Missing ghost variant. Plan scoped this out. |
| 3 | Chip/badge backgrounds token-correct | **PASS** | SeverityBadge, risk badges all use tokens |
| 4 | Basemap is desaturated, slate-tinted | **PASS** | PDOK BRT grijs is desaturated |
| 5 | Choropleth ramp tokens defined | **PASS** | 14 tokens, no consumers yet (by design) |
| 6 | Dark mode token layer active | **PASS** | Full dark mode override set + 3-way toggle |
| 7 | Accent never appears as text on light surfaces | **FAIL** | 2 violations: AddressSearch pin, AddressHeader bookmark |
| 8 | Primary CTA count ≤1 per screen | **PARTIAL** | Settings screen has multiple teal-active toggles |
| 9 | Test at 200% zoom | **NOT TESTED** | Manual verification needed |
| 10 | Test map overlays light/dark | **PARTIAL** | No dark-mode basemap switching |
| 11 | Test on low-brightness/OLED | **NOT TESTED** | Dark mode exists but not OLED-optimized |

---

## Concrete Steps to Fix All Issues

### Priority 1: Fixes Required Before Merge

#### Fix 1A: Add missing nav tokens and fix TopBar (Issue 1)

**File: `frontend/src/styles/tokens.css`** — Add to `:root`:
```css
--color-nav-control-bg: rgba(255, 255, 255, 0.12);
--color-nav-icon: rgba(255, 255, 255, 0.7);
```

**File: `frontend/src/components/TopBar.css`** — Update:
```css
/* Line 36: lang-toggle background */
background: var(--color-nav-control-bg);
/* (keep line 39 border as var(--color-nav-border)) */

/* Line 69: settings icon */
color: var(--color-nav-icon);
```

#### Fix 1B: Define `--color-border-strong` token (Issue 3)

**File: `frontend/src/styles/tokens.css`** — Add to `:root`:
```css
--color-border-strong: var(--slate-500);
```

Add to `[data-theme="dark"]`:
```css
--color-border-strong: var(--slate-200);
```

#### Fix 1C: Fix accent-as-icon-color on light backgrounds (Issue 4)

**File: `frontend/src/components/AddressSearch.css`** — Line 22:
```css
/* Change: */
color: var(--color-accent);
/* To: */
color: var(--color-accent-text);
```

**File: `frontend/src/components/AddressHeader.css`** — Line 52:
```css
/* Change: */
color: var(--color-accent);
/* To: */
color: var(--color-accent-text);
```

#### Fix 1D: Perf banner text color (Issue 2)

**File: `frontend/src/styles/tokens.css`** — Add to `:root` and `[data-theme="dark"]`:
```css
--color-overlay-text: #FFFFFF;
```

**File: `frontend/src/components/NeighborhoodViewer3D.css`** — Line 110:
```css
/* Change: */
color: white;
/* To: */
color: var(--color-overlay-text);
```

### Priority 2: Deferred (Non-Blocking)

| Item | Action | When |
|------|--------|------|
| Dark basemap in dark mode | Add theme-aware basemap URL or CSS invert filter | Next visual QA pass |
| Ghost button variant | Define `.btn--ghost` CSS class | When first consumer appears |
| Settings screen CTA count | Audit toggle styling (teal-active vs neutral-active) | Next UX review |
| 200% zoom testing | Manual QA session on real device | Before production launch |
| OLED optimization | Consider `#000000` base background option | Low priority |

---

## Verification After Fixes

After applying Priority 1 fixes, run:
1. `npm run build` — must pass clean
2. `npx vitest --run` — must pass 330+ tests
3. Visual check: TopBar lang-toggle should have visible border differentiation
4. Visual check: Settings icon should be legible (not too dim)
5. Visual check: ParallelCoordinates axis lines should be visible
6. Visual check: AddressSearch focus pin and bookmark icon should be darker teal (`#1C8C83`)
7. Visual check: Perf banner text should be white in both light and dark mode
