# Buurt-check assessment — updated for freemium dossier monetization (no subscription MVP)

**Date:** 2026-02-25  
**Project:** buurt-check  
**Context:** This is an adjusted version of the earlier technical strategy assessment, reflecting the new monetization decision: **free short report + paid long dossier (6 pages)**, **no subscription in MVP**.

---

## Executive update

Your freemium proposal is the right move for buurt-check’s MVP.

It improves the earlier assessment in one important way: it gives a **clear monetization event** (single dossier purchase) without forcing you into the complexity of subscriptions, account lifecycle management, or churn/renewal workflows.

This means the original report changes in these ways:

- **Stripe moves from “defer” to “adopt soon (one-time payments only)”**
- **Auth stays deferred** (still no need for full accounts in MVP)
- **Entitlements become critical now** (because paid access is per-dossier)
- **Onboarding/empty states become even more important** (they drive free → paid conversion)
- **Analytics becomes top-priority** (to measure upgrade conversion)
- **Preview deploys + monitoring remain top priority** (payment and export flows are brittle)

---

## What changes from the previous report

### 1) Payments (Stripe) — status changes

### Previous recommendation
- Defer Stripe until premium/subscriptions are near-term.

### Updated recommendation
- **Adopt soon, but only for one-time dossier purchases.**
- Do **not** implement subscriptions in MVP.
- Do **not** build a wallet/credit system yet.
- Do **not** require accounts if you can avoid it.

### Why this is better
A single paid dossier unlock matches your product:
- high-value decision support artifact
- one-off buyer need
- lower friction than subscription
- simpler backend logic than recurring billing

### Scope boundary for MVP payments
Implement only:
- one-time checkout
- payment success webhook
- dossier entitlement unlock
- refund-safe state handling (basic)
- payment failure + retry UX

Avoid for now:
- subscriptions
- billing portal
- recurring invoices
- team seats
- promo code engine
- credit bundles (can come later)

---

### 2) Auth — still defer

Freemium does **not** automatically mean you need accounts.

You can ship paid dossiers with no full auth if you model access correctly:
- payment tied to a `report_id`
- one-time unlock token or signed receipt
- server-side entitlement lookup

### Recommendation
- **No Clerk/Supabase Auth in MVP unless a hard requirement appears**  
  (e.g., cross-device access, saved paid dossiers, email history, support tooling).

This keeps your MVP lean and avoids building identity flows before they materially improve conversion.

---

### 3) Entitlement model — now mandatory

This is the biggest architectural change caused by freemium.

Before, “premium later” could stay abstract.  
Now you need a concrete entitlement model so payments unlock the correct dossier.

## Required data model primitives (MVP-safe)

Use these primitives now so you do not create future refactor debt:

- `report_id` — immutable ID for a generated report snapshot
- `report_type` — `short` | `long`
- `address_key` — normalized address or source lookup key
- `generation_version` — to track report schema/content version
- `payment_status` — `unpaid` | `paid` | `failed` | `refunded`
- `entitlement_scope` — `report:<report_id>` (not user-wide yet)
- `entitlement_status` — `active` | `revoked`
- `purchase_id` — internal purchase record
- `provider` — `stripe`
- `provider_payment_id` — Stripe checkout/payment ID
- `purchased_at`

### Why this matters
This design lets you add later:
- user accounts
- multi-report bundles
- subscriptions
- agency plans

...without rewriting your entire access model.

---

### 4) Free → Paid conversion UX — now core product work

In the earlier report, onboarding/empty states were important.  
With freemium, they become **direct revenue levers**.

## Recommended conversion flow (MVP)

1. User enters address
2. Generate and show **free short report** immediately
3. Highlight the value they already got
4. Show what the **6-page dossier adds**
5. CTA: **Unlock full dossier**
6. Payment
7. Return directly to unlocked dossier/export

### Key rule
Do **not** paywall before showing value.

If users must pay before seeing anything, conversion will be materially worse.

---

### 5) Analytics — higher priority (conversion instrumentation)

Analytics was already recommended. With freemium, it is now essential.

You need to measure:
- how many users reach short report
- how many click upgrade
- how many complete payment
- where drop-offs happen

## Minimum event taxonomy (MVP)

Track these events from day one:

### Funnel events
- `address_search_submitted`
- `short_report_generated`
- `upgrade_cta_viewed`
- `upgrade_cta_clicked`
- `checkout_started`
- `checkout_completed`
- `checkout_failed`
- `dossier_unlocked`
- `pdf_export_clicked`
- `pdf_export_completed`

### Quality/UX events
- `report_generation_failed`
- `3d_view_opened`
- `3d_view_failed`
- `slow_report_generation` (threshold-based)

### Why this matters
Without this, you won’t know whether low revenue is caused by:
- weak pricing
- weak perceived value
- broken payment flow
- report generation latency
- unclear upgrade UX

---

### 6) Sentry / error monitoring — unchanged, still urgent

This stays a top priority and becomes even more important once money is involved.

Add monitoring before payment launch so you can debug:
- failed unlocks
- webhook mismatches
- export failures after payment
- frontend state issues after checkout redirect

### Recommendation
Add Sentry on:
- frontend (React/Vite)
- backend (FastAPI)
- payment webhook path
- report generation pipeline
- PDF export pipeline

Tag by:
- environment (`dev`, `staging`, `prod`)
- release version
- report type (`short`, `long`)
- payment flow stage (if relevant)

---

### 7) Preview deployments + staging — unchanged, still important

Freemium introduces higher regression risk:
- checkout button hidden/broken
- wrong dossier sections shown
- paid users seeing free content only
- broken redirect after payment

Preview environments are cheap insurance.

### Recommendation
- Frontend preview deploy on every PR
- Staging backend for preview environment
- Test checklist for payment + unlock + export in staging before merge

---

### 8) README + decision log — update required

Your docs should now explicitly document the monetization architecture.

Add a short section:
- freemium model (short free / long paid)
- payment provider
- entitlement model
- webhook event handling
- local test setup for payment flow
- env vars required for payments

This prevents future confusion when you revisit the code after a few weeks.

---

## Updated point-by-point adjustments (only changed items)

Below are only the items from the previous assessment whose status changes because of freemium.

### DO: Use Stripe for Payments
**Previous:** Defer  
**Updated:** **Adopt soon (one-time payments only)**

**Why now:** You now have a concrete paid artifact (6-page dossier) and no subscription requirement. This is exactly the kind of scope where Stripe is appropriate without exploding complexity.

**MVP implementation boundary:**
- One-time checkout only
- Webhook-confirmed unlock
- Per-report entitlement
- No subscriptions
- No billing portal

---

### DO: Use Ready-Made Auth
**Previous:** Defer  
**Updated:** **Still defer**

**Why unchanged:** Freemium per dossier does not require accounts. Avoid adding login/signup friction unless you need:
- cross-device paid access
- saved purchase history
- support workflows keyed by user identity

---

### DO: Set Up Analytics From the Beginning
**Previous:** Adopt now  
**Updated:** **Adopt now (conversion instrumentation required)**

**Why stronger now:** Analytics is no longer “nice to have.” It is required to tune:
- pricing
- paywall placement
- upgrade copy
- checkout conversion

---

### DO: Add Onboarding and Empty States
**Previous:** Adopt now  
**Updated:** **Adopt now (conversion-critical)**

**Why stronger now:** Free users must understand the value of the short report and what the paid dossier adds. Empty and intermediate states are now part of your sales funnel.

---

## What NOT to build in this freemium MVP

This is where most teams lose weeks.

Do **not** build:
- subscriptions
- account system (unless forced by a concrete need)
- credits/wallet
- coupon engine
- invoice admin UI
- custom payment gateway
- “universal entitlements platform”
- PDF customization settings panel (unless conversion data demands it)

Keep the flow narrow:
**Address → Free Snapshot → Upgrade → Pay → Unlock Dossier → Export**

---

## Recommended MVP technical flow (surgically precise)

## Frontend
1. User submits address
2. Call backend to generate/retrieve `short` report
3. Render short report
4. Show upgrade CTA with clear value delta
5. CTA calls backend `create_checkout_session(report_id)`
6. Redirect to Stripe Checkout
7. On success redirect, frontend calls backend `get_entitlement(report_id)`
8. If paid, load `long` dossier + unlock export

## Backend
1. `POST /reports/short` returns short report + `report_id`
2. `POST /billing/checkout-session` validates `report_id` and creates Stripe checkout
3. `POST /billing/webhook` verifies Stripe signature
4. On payment success:
   - mark `payment_status = paid`
   - create `entitlement_scope = report:<report_id>`
5. `GET /reports/{report_id}/long` checks entitlement before returning dossier
6. `POST /exports/pdf` checks entitlement before generating full export

## Security/robustness notes
- Never trust frontend payment success query params alone
- Unlock only after webhook-confirmed payment state
- Make webhook handling idempotent
- Log/report all unlock failures

---

## Pricing implementation note (aligned with your current thinking)

You asked earlier what to charge. The recommendation still stands:

- Start around **€14.99** for the 6-page dossier
- Keep short report free
- No subscription in MVP

But the technical system should not hardcode price assumptions.  
Store pricing config in one place so you can test:
- €9.99
- €14.99
- €19.99

without touching entitlement logic.

---

## Revised priority order (next actions)

### Tier 0 — Before payment launch
1. **Sentry** (frontend + backend)
2. **Secrets hygiene audit** (rotate if needed)
3. **Analytics events** for funnel + failures
4. **Entitlement model** (per-report unlock)
5. **README update** for payment/env/webhook setup

### Tier 1 — Launch freemium
6. Stripe one-time checkout
7. Webhook-based unlock flow
8. Upgrade CTA UX and value framing
9. Paid dossier export path (entitlement-gated)

### Tier 2 — Tighten conversion after launch
10. Improve onboarding copy
11. Improve free report previews of locked content
12. Price experiments
13. Reduce drop-off points in checkout and post-payment redirect

---

## Final verdict (updated)

Your freemium proposal is not just “good” — it is **architecturally cleaner** than a subscription MVP.

It fits buurt-check’s real value delivery:
- a high-value, address-specific decision artifact
- one-off buyer intent
- low-friction payment
- no premature account complexity

The key is to implement it with **clean per-report entitlements** and **webhook-confirmed unlocks**, not a quick UI-only paywall.

If you do that, you can monetize early **without** painting yourself into a corner for subscriptions later.

---

## Deliverable note

This file is the adjusted version of the earlier assessment, tailored to your freemium dossier model (short free, long paid, no subscription in MVP).
