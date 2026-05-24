# Open Punch List

Updated: 2026-05-22

Phase 8 local automated QA is closed for the implemented match-first MVP flow.
The items below are intentionally deferred and are not marked pass in
traceability.

## Deferred Items

| Item | Status | Why deferred | Follow-up condition |
| --- | --- | --- | --- |
| Human usability metrics SC-001/SC-003 | PARTIAL / RELEASE RESEARCH | Automated UI/E2E checks verify landing hierarchy and mobile survey completion, but the PRD/spec percentage targets require human first-time-user validation. | Run product/usability research before public release and record whether users identify the primary action within 5 seconds and complete the survey on mobile without guidance. |
| Live production performance profiling | PARTIAL / RELEASE CONDITION | Local Playwright performance E2E now covers landing, secondary search reveal, results map usability, list/map sync, pan/zoom response, selected-neighborhood detail readiness, scoped building requests, no national building-footprint or 3D request, and reduced-motion mobile behavior. Live Lighthouse/real-device profiling against production hosting was outside this local implementation turn. | Run production or staging mobile profiling on the named target devices/network before public release. |
| Real selected-neighborhood 2D footprint provider coverage | PARTIAL | The implemented product correctly scopes selected-neighborhood building requests and shows the required basemap/list fallback when footprint data is missing. Live provider coverage and data quality validation remain separate provider-integration work. | Validate live provider availability and nonblank selected-neighborhood 2D footprint rendering before release. |
| Longer-term no-paid marker importers and monitoring | PARTIAL | Selected-neighborhood live loaders now cover parks, schools, childcare, transit, parking, EV charging, swimming-water lookup, and Overture POI context for daily shops, cafes/restaurants, healthcare, and libraries/culture. A durable offline import/refresh path is still cleaner for schedule-grade NDOV/GTFS transit and for reducing dependency on live provider latency. | Implement offline refresh jobs, provider monitoring, and coverage validation for the live no-paid marker sources before public release. |
| Dense real amenity marker visual smoke | PARTIAL | The selected-neighborhood map renders every returned amenity point marker with type-specific marker shapes and dedicated emojis, while the right-side Relevant amenities panel acts as the matching emoji/label legend and filter surface. Automated component tests cover marker count, shape, and emoji contracts, but dense live provider responses still need visual overlap and touch-target inspection. | Run desktop/mobile browser smoke against a selected neighborhood with dense real amenity records before release. |
| Repo-wide frontend lint cleanup | PARTIAL | The final Phase 8 frontend build, unit, a11y, E2E, and performance gates passed. Previous repo-wide `npm run lint` failures are pre-existing and span unrelated files/rules outside the match-first Phase 8 slice. | Schedule a separate lint cleanup task if repo-wide lint becomes a required release or CI gate. |

Resolved 2026-05-22: Progressive all-available selected-neighborhood building
footprints are implemented with response completion metadata, opaque provider
page cursors, frontend progressive loading, deduped footprint merging, visible
partial-state copy, and analytics events for partial/complete layer state.
Dense live-neighborhood provider validation remains useful release smoke, but
the Phase 6A implementation is no longer a missing punch-list item.

Resolved 2026-05-22: Hybrid additional-preferences intake is implemented for
the MVP with one optional prompt after guided intake, backend strict-schema
custom-preference extraction/review endpoints, typed registry statuses,
reviewed persistence, vector no-score guards for non-scoreable statuses,
analytics metadata allowlisting without raw text, Dutch/English UI copy, and
focused backend/frontend tests. The current registry is intentionally narrow and
deterministic; broader natural-language extraction coverage can be expanded
later behind the same schema, review, and no-LLM-scoring guardrails.

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

No account, checkout, listing marketplace, unbounded AI chat, LLM scorer, or
unrelated analytics work is deferred here because those items are outside the
match-first MVP scope.
