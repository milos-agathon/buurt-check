# Bug Audit Feedback Resolution (2026-02-28)

This note captures follow-up corrections from the quality assessment of the 2026-02-27 audit.

## Resolved Feedback Items

1. **P2-51 (footprint transform) reclassified**
   - Resolution: marked as a mischaracterization.
   - Reason: the implementation uses a polynomial WGS84 -> RD transform (Rijksdriehoekstelsel), not a simple linear degrees-to-meters approximation.

2. **P2-27 (`resp.json()` without `await`) severity**
   - Resolution: reclassified to low impact.
   - Reason: response body parsing happens after the HTTP response is already buffered; no practical abort-related data-loss bug was demonstrated.

3. **P3-31 (`RiskLevel` aliases)**
   - Resolution: treated as intentional design, not a defect.
   - Reason: aliases (`good=low`, `moderate=medium`, `poor=high`) preserve backward-compatible wire values and cache/model deserialization behavior.

4. **P3-36 (`sunlight.title` vs `risk.sunlight.title`)**
   - Resolution: treated as intentional key split, not an inconsistency.
   - Reason: `sunlight.title*` keys are for sunlight analysis/card context, while `risk.sunlight.*` keys are for risk-tile labeling and summaries.

5. **Test-count reconciliation**
   - Resolution: baseline counts updated in project instructions.
   - Current validated counts:
     - Backend: `565` passing non-live tests (`4 skipped`, `9 deselected`)
     - Frontend: `705` passing tests

## Outcome

All confirmed P0-P2 runtime defects remain fixed. This follow-up closes the remaining documentation/classification issues identified in the quality assessment.
