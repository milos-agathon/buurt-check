# Phase 2: Monetization Infrastructure — Immediate-Pay Full Dossier

**Status:** Supersedes the older freemium/content-gating implementation plan.

**Goal:** Keep the on-screen dossier viewer free, keep `quick_brief` / "Quick checklist" PDF free, and require payment before the first `full_dossier` download.

**Architecture:** The backend keeps `billing` and `reports` endpoints, but the authoritative contract changes from per-report/shared-address unlocks to buyer-bound, address-bound entitlements. The frontend export flow remains centered on the export sheet: `quick_brief` generates immediately, `full_dossier` starts checkout if the current anonymous buyer does not already own that address.

**Non-goals:** No subscriptions, no named user accounts, and no premium viewer unlocks. Monetization applies only to `full_dossier` export access.

---

## Summary Contract

- `quick_brief` is free.
- `full_dossier` is paid before first download.
- The interactive dossier viewer remains free.
- The purchase is scoped to `buyer_key + vbo_id`.
- A paid Full Dossier can be downloaded again by the same anonymous buyer for the same address.
- `report_id` may identify a snapshot, but entitlement is still verified in buyer context.

---

## Product Flow

1. User searches for an address and opens the free viewer.
2. App creates or retrieves an address snapshot via `POST /api/reports/short`.
3. User opens the export sheet.
4. If the user selects `quick_brief`, the PDF is generated immediately with no entitlement check.
5. If the user selects `full_dossier` and no active entitlement exists for the current anonymous buyer and address, the app creates a Stripe Checkout Session.
6. Stripe redirects back with the current `report_id` and checkout metadata.
7. The frontend calls `GET /api/reports/{report_id}/entitlement`.
8. If the backend confirms buyer-scoped entitlement, the frontend enables `full_dossier` download.

**Key rule:** Payment is for the downloadable Full Dossier artifact, not for reading the dossier in the app.

---

## Entitlement Model

### Identity and scope

- No named accounts in MVP.
- The server issues an anonymous `buyer_key` via httpOnly cookie.
- Entitlement is scoped to `buyer_key + vbo_id`.
- `report_id` references the current export/report snapshot and may be used for checkout and redirect continuity.

### Required data model primitives

| Field | Type | Purpose |
|---|---|---|
| `buyer_key` | string | Anonymous buyer identifier issued server-side |
| `report_id` | UUID | Immutable export/report snapshot ID |
| `report_type` | `quick_brief` / `full_dossier` | Export variant |
| `address_key` | string | Normalized address or lookup key |
| `vbo_id` | string | BAG address identifier |
| `generation_version` | string | Schema/content version |
| `payment_status` | `unpaid` / `paid` / `failed` / `refunded` | Payment lifecycle |
| `entitlement_scope` | string | `buyer:<buyer_key>:address:<vbo_id>` |
| `entitlement_status` | `active` / `revoked` | Access state |
| `provider` | string | `stripe` |
| `provider_payment_id` | string | Stripe payment intent or equivalent |
| `purchased_at` | datetime | Purchase timestamp |

### Validation rules

- `POST /api/address/{vbo_id}/export` with `template=quick_brief` requires no entitlement.
- `POST /api/address/{vbo_id}/export` with `template=full_dossier` requires active entitlement for the current `buyer_key + vbo_id`.
- `GET /api/reports/{report_id}/entitlement` must verify the current buyer context, not just the report row.
- Entitlement is verified against the current anonymous buyer and address together.

---

## API Contract

### `POST /api/reports/short`

- Keeps returning `report_id`.
- Only buyer/address purchase status is documented for this endpoint.
- `already_purchased`, if retained, means: "this anonymous buyer already owns the Full Dossier for this address."

### `GET /api/reports/{report_id}/entitlement`

- Returns buyer-scoped entitlement status for the current anonymous buyer and the address linked to `report_id`.
- Must be documented as buyer-scoped entitlement verification.

### `POST /api/billing/checkout-session`

- Creates a one-time Stripe Checkout Session for `full_dossier`.
- Must be the required step before first `full_dossier` download.

### `POST /api/address/{vbo_id}/export`

- `template=quick_brief`: free, no entitlement required.
- `template=full_dossier`: active buyer+address entitlement required.

---

## Frontend Contract

- The export sheet is the single monetization surface.
- The template selector must communicate:
  - `Quick Brief` / `Quick checklist` is free.
  - `Full Dossier` is paid.
- Button behavior must be:
  - `quick_brief`: generate immediately
  - `full_dossier` without entitlement: start checkout
  - `full_dossier` with entitlement: download immediately
- Browser-only trial or entitlement logic is not part of the supported product.
- Preview flags that disable payments or force full-dossier access are deprecated and must not be described as supported product behavior.

---

## Analytics and Monitoring

- Keep checkout funnel events: `checkout_started`, `checkout_completed`, `checkout_failed`.
- Keep export events: `pdf_export_clicked`, `pdf_export_completed`.
- Add buyer/address context where appropriate, but do not log raw cookie values.
- Keep webhook handling idempotent and monitored via Sentry.

---

## Acceptance Criteria

- No plan text still documents browser-only trial logic as the monetization model.
- No plan text still documents entitlement as reusable across unrelated buyers.
- No plan text still documents `report_id` alone as sufficient access control.
- `quick_brief` is documented as free everywhere in this file.
- `full_dossier` is documented as paid-before-first-download everywhere in this file.
- The viewer is documented as free everywhere in this file.

---

## Notes

- This document is the architecture target for the next implementation pass.
- Legacy code paths may still reflect the earlier freemium rollout until implementation catches up.
