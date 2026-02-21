Below is the **single consolidated spec** (no patches, no cross-referencing). It inlines the corrected Mark Teal anchor (**#24A097**), adds the **dark/reverse rule**, and includes **prefers-reduced-motion**.

---

## Buurt-Check Logo Implementation Spec (Single Source of Truth)

### Grade (current → target)

* Current: **B+ (8.3–8.6/10)**
* Target after this sprint: **A− / A (9.0–9.6/10)**

### Non-negotiable standards (why these requirements exist)

* **Non-text contrast:** UI icons/meaningful graphics must meet **≥ 3:1** contrast against adjacent colors (WCAG SC 1.4.11). Note: thresholds are not rounded; **2.999:1 fails**. ([W3C][1])
* **App icons:** keep a safe zone so content isn’t clipped; ensure recognizability at every size. ([Apple Developer][2])
* **Android adaptive icons:** must support masks using **foreground/background layers** and safe zone behavior. ([Android Developers][3])
* **PWA icons:** provide **192×192** and **512×512** and a **maskable** variant via manifest `purpose`. ([MDN Web Docs][4])
* **Reduced motion:** respect user motion preferences with `prefers-reduced-motion`. ([MDN Web Docs][4])

---

# Box 1 — Color Tokens + Usage Rules (verified)

### Tokens

* **Brand Teal:** `#2EC4B6`

  * Use for **on-dark / reverse** mark contexts and **large fills/background accents** (not on white for load-bearing mark contrast).
* **Mark Teal (on light):** `#24A097`

  * Use for **on-white / light backgrounds** where the mark is a UI/meaningful graphic and must meet SC 1.4.11. ([W3C][1])
* **Polar Slate:** `#1C2D3F`
* **White:** `#FFFFFF`
* **Text Teal token (reserved for text):** `#1C8C83`

  * Text contrast rules are different (WCAG 1.4.3 uses **4.5:1** for normal text). ([W3C][5])

### Two-teal rule (no ambiguity)

1. **Mark on light:** If adjacent background is **white/light**, use **Mark Teal `#24A097`** so the mark clears **≥ 3:1** non-text contrast. ([W3C][1])
2. **Mark on dark:** If adjacent background is **Polar Slate `#1C2D3F` or darker**, use **Brand Teal `#2EC4B6`** for maximum legibility in dark UI (still compliant; polarity flips the legibility concern). ([W3C][1])

---

## Priority Order

1. **Ticket 1 (Apply Mark Teal rules)** + **Ticket 2 (Unified mark family)**
2. **Ticket 3 (App icon + PWA icons)**
3. **Ticket 4 (Stacked lockup spacing)**
4. **Ticket 5 (Wordmark SVG cleanup)**

**Definition of Done (applies to every ticket): Context Test Checklist** (bottom)

---

# Ticket 1 — Apply Mark Teal rules to all mark-bearing exports

**Goal:** Every logo/mark export uses the correct teal for the background polarity, with SC 1.4.11 coverage on light backgrounds. ([W3C][1])

**Deliverables**

* Updated SVG exports (horizontal, mono, reverse, stacked, favicon source SVG) using:

  * `#24A097` on white/light
  * `#2EC4B6` on Polar Slate/dark

**Acceptance tests**

* On white: mark is clearly visible at **16px / 24px / 32px** and meets **≥ 3:1** (no rounding). ([W3C][1])
* On Polar Slate: mark reads crisply in nav/header contexts.

---

# Ticket 2 — Unified Mark Family (Detail + Micro) preserving existing concept

**Goal:** One identity across sizes, with a size-optimized micro mark that preserves the **Dutch asymmetric gable** + **check exits roof** gesture.

### Deliverables

* **Detail Mark** (recommended use: **≥ 48px**)
* **Micro Mark** (use: **16–48px**)
* **Favicon** derived from **Micro Mark** (not a separate style)

### Must preserve (signature + story)

* **Asymmetric Dutch gable** (left steep, right shallow)
* **Check “breaks out”** of the house (verified-home narrative)

### Must change (micro legibility constraint)

* **Roof gap behavior:** At micro sizes, the current open/roof exit can read like a broken outline.
  For **Micro Mark**, **close or simplify the enclosure** so the house silhouette reads complete, while preserving “breakout” via **overlap** (check crossing boundary), not via a missing wall segment.

### Don’t (explicit fence)

* **Do not add new conceptual elements** (no pin, grid, dot, location marker). Keep story strictly **house + check**.

### Size boundary behavior

* At **exactly 48px:** either mark acceptable.
* In responsive/automated contexts: **prefer Micro Mark at 48px and below**.
* Transition must not be noticeable to users (avoid showing both at similar sizes).

### Animation rules

* **Detail Mark:** keep the current draw-house → reveal-check animation.
* **Micro Mark:** simplified equivalent or same animation if geometry permits.
* **App icons/PWA icons:** **static only** (strip animation CSS/SMIL).

### Reduced motion requirement

* Wrap animations so they only run when the user has **no preference** for reduced motion:

  * `@media (prefers-reduced-motion: no-preference) { …animations… }`
  * Otherwise: static mark. ([MDN Web Docs][4])

**Acceptance tests**

* **24px**: silhouette reads as a complete house, not a broken shape.
* **Browser tab strip**: favicon remains distinct among **8+** favicons.
* **Consistency**: Micro and Detail look like the same brand when used near each other (40px vs 56px).

---

# Ticket 3 — App Icon System + PWA Manifest Icons (derived from unified family)

**Goal:** Correct install surfaces for native + PWA, with safe zones and masking behavior.

## 3A) Native app icon badges

**Background tile colors (specified)**

* **Hero (Dark):** Polar Slate `#1C2D3F` tile, **white house** + **Brand Teal `#2EC4B6` check**
* **Light:** light tile, Polar Slate house + **Mark Teal `#24A097` check**
* **Mono:** single-color variant (white or black depending on context)

**Deliverables**

* `AppIcon_Dark`, `AppIcon_Light`, `AppIcon_Mono`
* iOS master icon artwork respecting safe zone principles. ([Apple Developer][2])
* Android adaptive icons:

  * `foreground` + `background` layers
  * safe zone respected so masks don’t clip important geometry. ([Android Developers][3])

**Acceptance tests**

* Home screen grid (20+ icons): recognizable at a glance.
* Android masks (circle/squircle/rounded-square): no clipping of signature gable/check. ([Android Developers][3])

## 3B) PWA manifest icons (web install)

**Deliverables (minimum)**

* `pwa-192x192.png`
* `pwa-512x512.png`
* **Maskable** variants for both sizes (with extra padding/safe zone) and manifest entries using `purpose: "maskable"`. ([MDN Web Docs][4])

**Acceptance tests**

* Installed PWA icon looks correct on Android launcher masks (maskable behaves as intended). ([MDN Web Docs][4])

---

# Ticket 4 — Stacked lockup spacing (badge cohesion)

**Goal:** stacked lockup reads as one unit.

**Change**

* Reduce mark↔wordmark vertical gap by **20–25%**.
* Optical centering pass.

**Acceptance tests**

* Squint test: reads as a cohesive badge, not icon + caption.

---

# Ticket 5 — Wordmark SVG corruption cleanup (explicit callout)

**Goal:** clean, stable vector paths.

**Known fragment to eliminate**

* In horizontal lockup around “uu”, fragment:
  `v0v-19.0816c12.2,0 2.44,5.23296 4.88,8.7216`

**Instruction**

* Re-export “Buurt Check” from the original **Satoshi** font outlines in the vector tool.
* Do **not** patch existing paths; replace with clean outline export.

**Acceptance tests**

* No stray nodes/fragments; consistent rendering across browsers/design tools.

---

## Context Test Checklist (Definition of Done for all tickets)

Render and verify on real surfaces (not just mockups):

1. App navbar at **44px** on Polar Slate background
2. PDF export header
3. Browser tab strip favicon among **8+** favicons
4. Mobile home screen grid among **20+** real app icons
5. White background at **16/24/32px** (baseline visibility)