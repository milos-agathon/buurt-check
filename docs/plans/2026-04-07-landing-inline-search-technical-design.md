# Landing Inline Search Technical Design

Date: April 7, 2026
Status: ticket-ready, blocked on production CORS deployment fix
Source plan: `docs/plans/2026-04-04-website-premium-audit.md` Task 8

## Goal

Define the landing-page inline-search implementation against the real Buurt Check app/backend contract. This document replaces the invalid `#/search?lookup=` assumption from the audit.

## Chosen integration boundary

The static landing page must call the existing first-party backend proxy on `app.buurt-check.nl`. It must not call PDOK Locatieserver directly from the browser.

## Current blocker

As of April 7, 2026, production suggest and lookup GET requests can return valid JSON, but responses for origin `https://buurt-check.nl` omit `Access-Control-Allow-Origin`. Diagnostic browser-style `OPTIONS` probes return `400 Bad Request` with `Disallowed CORS origin`. Inline-search UI work remains blocked until deployed backend configuration matches the repo CORS contract.

## Required deployment fix

Before UI work starts:

1. Confirm the deployed backend is running the current CORS code path from `backend/app/main.py`.
2. Set the production backend environment variable exactly to:

```bash
BUURT_CORS_ORIGINS=["https://app.buurt-check.nl","https://buurt-check.nl"]
```

3. Redeploy the backend service for `app.buurt-check.nl`.
4. Re-run the verification probes below.
5. Record successful probe output in `docs/plans/2026-03-30-website-implementation-status.md` or in this document.

## Production verification probes

Use a real suggestion ID returned by the suggest request:

```bash
curl.exe --max-time 6.5 -i -H "Origin: https://buurt-check.nl" "https://app.buurt-check.nl/api/address/suggest?q=Damrak&limit=1"
curl.exe --max-time 8 -i -H "Origin: https://buurt-check.nl" "https://app.buurt-check.nl/api/address/lookup?id=<suggestion.id>"
curl.exe --max-time 6.5 -i -X OPTIONS -H "Origin: https://buurt-check.nl" -H "Access-Control-Request-Method: GET" "https://app.buurt-check.nl/api/address/suggest?q=Damrak&limit=1"
curl.exe --max-time 8 -i -X OPTIONS -H "Origin: https://buurt-check.nl" -H "Access-Control-Request-Method: GET" "https://app.buurt-check.nl/api/address/lookup?id=<suggestion.id>"
```

Success gate:

- suggest GET completes within `6500ms`
- lookup GET completes within `8000ms`
- both GET responses include `Access-Control-Allow-Origin: https://buurt-check.nl`
- lookup proof uses a real suggestion ID, not a fake ID

## Backend and routing contract

- `GET https://app.buurt-check.nl/api/address/suggest?q={query}&limit=7`
- `GET https://app.buurt-check.nl/api/address/lookup?id={suggestion.id}`
- on selection, read `ResolvedAddress.adresseerbaar_object_id` as `vboId`
- preserve the selected suggestion `id` as `lookupId`
- navigate to `https://app.buurt-check.nl/#/address/{encodeURIComponent(vboId)}?lookup={encodeURIComponent(lookupId)}`

## Landing UI behavior

- require at least two query characters before suggest
- debounce suggest requests by `300ms`
- use `AbortController` to cancel stale suggest and lookup requests
- deduplicate identical normalized suggest queries while in flight
- use `credentials: 'omit'`
- keep the existing fallback CTA to `https://app.buurt-check.nl/#/search` visible at all times

## Failure states

- fewer than two characters: no request
- suggest failure, CORS failure, invalid JSON, timeout, or `429`: show unavailable state and keep CTA fallback
- lookup timeout or network failure: show retry affordance and keep CTA fallback
- lookup without `adresseerbaar_object_id`: show unavailable state and keep CTA fallback

## Analytics

Use these event names:

- `landing_search_suggest_success`
- `landing_search_suggest_unavailable`
- `landing_search_lookup_success`
- `landing_search_lookup_unavailable`
- `landing_search_deeplink_click`

Smoke coverage must cover suggest success, suggest unavailable fallback, lookup success, lookup missing `adresseerbaar_object_id`, and stale-request cancellation.

## Implementation files after approval

- `landing/index.html`
- `frontend/tests/e2e/landing-page.spec.ts`
- `dist-landing/` after `npm run landing:build`

## Complexity

Medium. Estimated `1.5-2.5` implementation days after PRD approval and post-deploy CORS verification.
