# Lessons Learned

## 2026-02-11 - 3D neighborhood long-tail latency

- Symptom: neighborhood 3D loading exceeded 2 minutes in real usage.
- Root pattern:
  - High-detail context enrichment (LoD 2.2 per surrounding building) was coupled to the primary interactive path.
  - Frontend timeout allowed extreme tail latency (`220s`), hiding SLA violations.
- Preventive rule:
  - Keep interactive path bounded and deterministic; heavy enrichment must be opt-in/background.
  - Enforce an explicit end-user timeout budget (<=30s) in the client for slow external dependencies.
  - Version cache keys when response shape/perf strategy changes to avoid stale heavy payloads.

## 2026-02-15 - Municipality normalization / cache poisoning

- Symptom: erfpacht detection was case-sensitive ("Amsterdam" → True, "amsterdam" → False) but both mapped to the same cache key. A first request with non-canonical casing could cache the wrong result for 7 days.
- Root pattern:
  - Cache key normalization (`lower().strip()`) happened at the API layer but was not mirrored in the service layer's business logic.
  - Config list used title-case strings; comparison used Python `in` (exact match).
- Preventive rule:
  - **Normalize user/context inputs once at the entry point** and pass the normalized value through to both cache keying and business logic. Never normalize for cache keys separately from the logic that produces the cached value.
  - Use `casefold()` (not `lower()`) for Unicode-safe case-insensitive comparison.
  - When a config list is compared against user input, normalize both sides of the comparison.

## 2026-02-15 - DOM order assertions for section ordering

- Symptom: E2E test originally used bounding-box (layout position) assertions to verify dossier section order. This is fragile when sections use `position: fixed/sticky` or when viewport dimensions change.
- Root pattern:
  - Layout-position assertions depend on CSS rendering, which varies across browsers, viewports, and scroll positions.
  - DOM order (`compareDocumentPosition`) directly reflects the source order, which is what the rendering engine uses for flow layout.
- Preventive rule:
  - **Prefer DOM-order assertions** (`compareDocumentPosition`, `previousSibling`, `nextSibling`) over layout-position assertions (`getBoundingClientRect()`) for verifying fixed/sticky UI element ordering.
  - Reserve bounding-box assertions for tests that specifically verify pixel-level layout behavior.
