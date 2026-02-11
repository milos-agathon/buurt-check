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
