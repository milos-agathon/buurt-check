# Post-Checkout Export Hypotheses Tracker

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
| 1 | H1 | Browser blocks the post-checkout auto-download because it fires after async export completion, outside a user gesture | `testing` | 2026-03-31 |
| 2 | H2 | Regenerating the PDF after checkout is too fragile or too slow, so payment success does not reliably lead to a ready file | `queued` | 2026-03-31 |
| 3 | H3 | Stripe confirmation plus entitlement restore has a race, so export resume sometimes starts before unlock has settled | `queued` | 2026-03-31 |
| 4 | H4 | Full dossier export is gated by sunlight / 3D readiness, so post-checkout resume can stall before PDF generation starts | `queued` | 2026-03-31 |
| 5 | H5 | `sessionStorage` is an unreliable bridge for the post-checkout export intent on some browsers or webviews | `queued` | 2026-03-31 |
| 6 | H6 | The backend export endpoint is too expensive and synchronous, so "download never starts" is really "export never finished" | `queued` | 2026-03-31 |

## Hypotheses

### H1. Browser blocks the post-checkout auto-download

Status: `testing`

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

Exit criteria:

- If the payment redirect now consistently reaches a ready state and the manual button downloads successfully on the browsers that previously failed, move H1 toward `confirmed`.
- If the dossier still fails before the ready state or the manual click still cannot download, move H1 toward `rejected` and test H2 next.

### H2. Regenerating the PDF after checkout is too fragile or too slow

Status: `queued`

Why it is plausible:

- Payment success does not deliver a prebuilt PDF.
- The app stores a post-checkout export intent, reopens the export sheet, and regenerates `full_dossier` after return.
- Any stall in that chain makes the user experience look like "payment succeeded but nothing happened."

Planned test:

- If H1 is rejected, add explicit UI states for:
  - payment confirmed
  - generating dossier
  - dossier ready
- Measure time from redirect confirmation to `export_response_received`.
- Consider separating payment confirmation from export generation so the user can explicitly start generation.

Reject H2 if:

- The resumed export reaches ready state reliably and quickly in the failing browsers once H1 is removed.

### H3. Stripe confirmation plus entitlement restore has a race

Status: `queued`

Why it is plausible:

- The system uses both Stripe webhook unlock and frontend confirmation via `/billing/checkout-session/{session_id}/confirm`.
- `frontend/src/App.tsx` retries, then falls back to delayed polling.
- A frontend return that lands before unlock settles could interrupt clean export resume.

Planned test:

- Add explicit checkpoints for:
  - `checkout_confirm_started`
  - `entitlement_active`
  - `export_sheet_opened`
- Capture timestamps and retry counts during a real checkout flow.
- Compare successful and failed resumes to see whether failures cluster before entitlement activation.

Reject H3 if:

- Entitlement is already active when the failing sessions resume and export still stalls later in the flow.

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

## Next action

Run a real browser checkout on the previously failing device/browser and record:

1. whether the app reaches the post-checkout ready state
2. whether the manual `Download PDF` button works
3. which last checkpoint appears if the flow still fails
