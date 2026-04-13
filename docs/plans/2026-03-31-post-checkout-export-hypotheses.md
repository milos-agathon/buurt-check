# Post-Checkout Export Hypotheses Tracker

> Alignment note (2026-04-12): For any guidance affecting `https://buurt-check.nl/`, its associated legal pages, or `https://app.buurt-check.nl/#/search` and adjacent app UI states, `docs/plans/2026-04-12-website-and-app-design-10-10-spec.md` is the governing document. If this file conflicts with that spec on layout, hierarchy, spacing, visual system, bilingual asset handling, desktop adaptation, loading-state clarity, export recovery UX, or legal-page consistency, the 2026-04-12 spec controls.

Date: 2026-03-31
Owner: Milos / Codex
Scope: payment success redirect -> entitlement restore -> export resume -> PDF delivery

## Status legend

- `testing`: isolated change is live or being actively verified in the browser
- `queued`: plausible hypothesis, not isolated yet
- `rejected`: tested and not supported by the result
- `confirmed`: strongly supported by the test result and/or production evidence

## Current summary

| Rank | ID | Hypothesis | Status | Last update |
| --- | --- | --- | --- | --- |
| 1 | H1 | Browser blocks the post-checkout auto-download because it fires after async export completion, outside a user gesture | `rejected` | 2026-03-31 |
| 2 | H2 | Regenerating the PDF after checkout is too fragile or too slow, so payment success does not reliably lead to a ready file | `rejected` | 2026-03-31 |
| 3 | H3 | Stripe confirmation plus entitlement restore has a race, so export resume sometimes starts before unlock has settled | `rejected` | 2026-03-31 |
| 4 | H4 | Full dossier export is gated by sunlight / 3D readiness, so post-checkout resume can stall before PDF generation starts | `queued` | 2026-03-31 |
| 5 | H5 | `sessionStorage` is an unreliable bridge for the post-checkout export intent on some browsers or webviews | `queued` | 2026-03-31 |
| 6 | H6 | The backend export endpoint is too expensive and synchronous, so "download never starts" is really "export never finished" | `queued` | 2026-03-31 |

## Hypotheses

### H1. Browser blocks the post-checkout auto-download

Status: `rejected`

Why it is plausible:

- `frontend/src/components/ExportBottomSheet.tsx` auto-generated the resumed full dossier and then called `downloadPdfBlob(...)` from a `useEffect`.
- `frontend/src/services/api.ts` uses browser-dependent blob download behavior and an iOS `window.open(...)` fallback.
- That pattern is a classic fit for Safari / iPhone download suppression because the download attempt happens after async work, not directly from a user click.

Change shipped to test H1:

- Keep auto-generation after checkout.
- Remove the automatic post-checkout download attempt.
- Show an explicit post-checkout ready state with a visible `Download PDF` button.
- Add lightweight post-checkout checkpoints for:
  - `auto_generate_started`
  - `export_response_received`
  - `download_attempt_started`
  - `download_attempt_failed`

Implementation reference:

- Commit: `9cab5c8` (`fix: require manual post-checkout dossier download`)

Observed result:

- Real checkout behavior still stopped at:
  - `Betaling wordt verwerkt...`
  - `Betaling ontvangen — je dossier wordt zo ontgrendeld.`
- The flow did not recover into a visible ready-to-download state.
- That means removing the async auto-download did not address the primary failure.

Reason for rejection:

- The failure happens before a successful export-ready state is reached, so the browser download gesture is not the main bottleneck.

### H2. Regenerating the PDF after checkout is too fragile or too slow

Status: `rejected`

Why it is plausible:

- Payment success does not deliver a prebuilt PDF.
- The app stores a post-checkout export intent, reopens the export sheet, and regenerates `full_dossier` after return.
- Any stall in that chain makes the user experience look like "payment succeeded but nothing happened."

Change shipped to test H2:

- Stop auto-generating the full dossier immediately after checkout resume.
- Open the export sheet in an explicit unlocked state first.
- Require a deliberate `Generate dossier` click before export starts.
- Keep the later `Download PDF` step manual.
- Add checkpoints for:
  - `checkout_confirm_started`
  - `entitlement_active`
  - `export_sheet_opened`
  - `resume_ready_to_generate`
  - `generate_started`
  - `export_response_received`
  - `download_attempt_started`
  - `download_attempt_failed`

What this test is trying to prove:

- Whether separating payment confirmation from expensive PDF regeneration makes the post-checkout flow visible, understandable, and reliable enough to complete.

Observed result:

- Real checkout behavior still stopped at:
  - `Betaling wordt verwerkt...`
  - `Betaling ontvangen — je dossier wordt zo ontgrendeld.`
- The flow still did not advance into the explicit unlocked export sheet state with `Generate dossier`.
- That means PDF generation is not the first thing going wrong after payment success.

Reason for rejection:

- The user still never reaches the manual generation state, so separating checkout from PDF generation did not isolate the failure.

### H3. Stripe confirmation plus entitlement restore has a race

Status: `rejected`

Why it is plausible:

- The system uses both Stripe webhook unlock and frontend confirmation via `/billing/checkout-session/{session_id}/confirm`.
- `frontend/src/App.tsx` retries, then falls back to delayed polling.
- A frontend return that lands before unlock settles could interrupt clean export resume.

Change shipped to test H3:

- Stop opening the export sheet immediately from the checkout-success callback.
- Queue the post-checkout resume until the current dossier context is ready:
  - address resolved
  - report ID matches the unlocked report
  - entitlement is active
  - the initial dossier loading state has cleared
- Keep the `sessionStorage` post-checkout intent intact until the sheet is actually opened.
- Add explicit checkpoints for:
  - `checkout_confirm_started`
  - `checkout_confirm_attempt`
  - `entitlement_active`
  - `resume_queued`
  - `export_sheet_opened`
- Add a regression test covering a Stripe confirmation that succeeds before building facts finish loading.

What this test is trying to prove:

- Whether the resumed export was being triggered too early, during a transient report/loading state where the unlocked sheet could be lost before the user ever saw it.

Observed result:

- Real checkout behavior still stopped at:
  - `Betaling wordt verwerkt...`
  - `Betaling ontvangen — je dossier wordt zo ontgrendeld.`
- The flow still did not advance into the resumed export UI after entitlement restore.
- The queued post-checkout resume never surfaced a visible unlocked export sheet or recovery state.

Reason for rejection:

- The user still never reaches the resumed export UI after payment success, so delaying resume until the dossier context settles did not isolate the failure.

### H4. Sunlight / 3D gating blocks full dossier export

Status: `queued`

Why it is plausible:

- `frontend/src/App.tsx` and `frontend/src/components/ExportBottomSheet.tsx` intentionally delay full-dossier generation until `sunlightReady`.
- The export-open path also tries to trigger 3D fetching if needed.
- That adds another async dependency after payment success.

Planned test:

- Add explicit checkpoints for `sunlight_ready` and `sunlight_failed`.
- Measure whether failing sessions ever reach `auto_generate_started`.
- If needed, temporarily allow full-dossier export to proceed without waiting for sunlight so the PDF can generate with `N/A`.

Reject H4 if:

- Failing sessions already have `sunlightReady === true` before export starts.

### H5. `sessionStorage` is an unreliable post-checkout bridge

Status: `queued`

Why it is plausible:

- The app depends on `POST_CHECKOUT_EXPORT_SESSION_KEY` to remember that it should resume the full dossier export after payment.
- Browser privacy behavior, webviews, or odd redirect timing can lose that state even when entitlement is restored.

Planned test:

- Add a visible diagnostic when the user is entitled but no post-checkout export intent exists.
- Log whether the stored intent is present on checkout start and after return.
- Compare failures across Safari, Chrome, and in-app browsers.

Reject H5 if:

- The failing sessions always restore the export intent correctly and still fail later in the flow.

### H6. Backend export is too expensive and synchronous

Status: `queued`

Why it is plausible:

- `/address/{vbo_id}/export` does substantial work before sending PDF bytes.
- A slow or stalled export looks identical to "download never started" from the user's perspective.

Planned test:

- Add timing around export request start and response receipt.
- Compare quick-brief versus full-dossier timings.
- If needed, instrument backend timing inside the export endpoint for the major stages.

Reject H6 if:

- The export response is received quickly in failing sessions and the problem happens only at the browser-delivery step.

## Decision log

| Date | Change | Result |
| --- | --- | --- |
| 2026-03-31 | Shipped the H1 isolation patch on `main`: keep post-checkout auto-generation, remove auto-download, show manual `Download PDF` CTA, add lightweight checkpoints | H1 moved from proposed to `testing` |
| 2026-03-31 | Browser test result for H1: user still saw delayed payment state and then nothing | H1 moved from `testing` to `rejected` |
| 2026-03-31 | Shipped the H2 isolation patch on `main`: stop post-checkout auto-generation, open an unlocked export state first, require explicit `Generate dossier`, add checkout/export checkpoints | H2 moved from `queued` to `testing` |
| 2026-03-31 | Browser test result for H2: user still saw the delayed payment state and never reached the unlocked `Generate dossier` sheet | H2 moved from `testing` to `rejected` |
| 2026-03-31 | Shipped the H3 isolation patch on `main`: queue the post-checkout resume until dossier context is ready, retain the stored export intent until the sheet actually opens, add confirm-attempt checkpoints | H3 moved from `queued` to `testing` |
| 2026-03-31 | Browser test result for H3: user still saw the delayed payment state and never advanced into the resumed export UI after entitlement restore | H3 moved from `testing` to `rejected` |

## Immediate recovery plan

The next change should stop relying on an automatic post-checkout recovery path. H4-H6 remain queued as deferred follow-up hypotheses, but they are not the immediate next action while this recovery flow is being implemented and validated.

Recovery flow direction:

- After payment success, show a dedicated success state.
- Present a visible `Download dossier` button in that state.
- Do not keep automatic download as an option in the post-checkout path.

Explicit user-visible states:

- `payment confirmed`
- `generating dossier`
- `dossier ready`

Required client checkpoints:

- `checkout_confirm_started`
- `entitlement_active`
- `export_sheet_opened`
- `auto_generate_started`
- `export_response_received`
- `download_attempt_started`
- `download_attempt_failed`

Frontend flow contract for the next implementation:

- The manual post-payment recovery CTA label is `Download dossier`.
- The post-checkout flow should not use any automatic download fallback.
- Checkpoint names stay in snake_case to match the existing client logging convention.
- UI states are documented in plain language for the user-facing flow, separate from checkpoint names.

## Next action

Implement and validate the dedicated post-payment recovery UI:

1. show the dedicated payment-success state with a visible `Download dossier` CTA
2. move the user through the explicit `payment confirmed` -> `generating dossier` -> `dossier ready` states
3. emit the required client checkpoints consistently through that flow
4. return to H4-H6 only if this recovery path still fails to produce a reliable download experience
