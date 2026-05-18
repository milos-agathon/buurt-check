# Open Punch List

Updated: 2026-05-18

Phase 8 local automated QA is closed for the implemented match-first MVP flow.
The items below are intentionally deferred and are not marked pass in
traceability.

## Deferred Items

| Item | Status | Why deferred | Follow-up condition |
| --- | --- | --- | --- |
| Human usability metrics SC-001/SC-003 | PARTIAL / RELEASE RESEARCH | Automated UI/E2E checks verify landing hierarchy and mobile survey completion, but the PRD/spec percentage targets require human first-time-user validation. | Run product/usability research before public release and record whether users identify the primary action within 5 seconds and complete the survey on mobile without guidance. |
| Live production performance profiling | PARTIAL / RELEASE CONDITION | Local Playwright performance E2E now covers landing, secondary search reveal, results map usability, list/map sync, pan/zoom response, selected-neighborhood detail readiness, scoped building requests, no national 3D request, and reduced-motion mobile behavior. Live Lighthouse/real-device profiling against production hosting was outside this local implementation turn. | Run production or staging mobile profiling on the named target devices/network before public release. |
| Real selected-neighborhood 3D provider coverage | PARTIAL | The implemented product correctly scopes selected-neighborhood building requests and shows the required 2D/list fallback when 3D data is missing. Live provider coverage and data quality validation remain separate provider-integration work. | Validate live provider availability and nonblank selected-neighborhood 3D rendering before enabling a provider-backed 3D default beyond the current fallback. |
| Repo-wide frontend lint cleanup | PARTIAL | The final Phase 8 frontend build, unit, a11y, E2E, and performance gates passed. Previous repo-wide `npm run lint` failures are pre-existing and span unrelated files/rules outside the match-first Phase 8 slice. | Schedule a separate lint cleanup task if repo-wide lint becomes a required release or CI gate. |

Resolved 2026-05-18: anonymous match-session deletion is now implemented as
`DELETE /api/match/sessions/{session_id}` with tests proving the session is
soft-deleted and related anonymous answers, vectors, jobs, result sets, and
analytics rows are removed.

Resolved 2026-05-18: EN and NL reduced-motion quickstart smoke evidence is now
recorded in `docs/qa/final_evidence.md` and
`docs/qa/match_first_revamp_traceability.md`. Browser: Chromium. Viewport:
390x844. Reduced-motion state: `prefers-reduced-motion: reduce`. Result: PASS
for both languages with no blockers.

Resolved 2026-05-18: Phase 8 analytics review blockers are closed. Backend
analytics now rejects private top-level `session_id` values containing 16-digit
address/VBO-like identifiers, embedded `#/address/...` routes, `lookup=`
markers, email-shaped values, or free-text sentence values, and tests assert
rejected payloads persist no analytics rows. Backend
match-first context strings under allowed keys now must be short stable
tokens/routes, so free-text `reason`/`source` values and lookup-bearing
`session_id` values are dropped before persistence. Frontend results-map-open
analytics now emits only from hydrated `ResultsMap`; the final journey E2E
asserts exact once-per-flow local and backend counts for the landing CTA, final
run CTA, results map opened, Dossier opened, and Back-to-map return success
events. The non-spec `match_neighborhood_clicked` event was removed from
frontend/backend catalogs and ResultsMap now records spec
`match_recommendation_selected` before opening detail.

Resolved 2026-05-18: unrelated `docs/superpowers` allowlisting and untracked
state files were removed from the Phase 8 changeset. Phase 8 evidence remains
limited to the QA, handoff, and acceptance-traceability artifacts listed in
`docs/qa/final_evidence.md`.

No account, checkout, listing marketplace, AI chat, or unrelated analytics work
is deferred here because those items are outside the match-first MVP scope.
