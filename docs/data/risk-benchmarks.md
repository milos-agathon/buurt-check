# Risk Benchmarks

`backend/app/services/risk_comparisons.py` now loads customer-visible comparison benchmarks from [backend/app/data/risk_benchmarks.json](/c:/Users/milos/buurt-check/backend/app/data/risk_benchmarks.json).

The artifact is versioned and carries benchmark provenance instead of hiding it in service literals. Each category block contains:

- `category`
- a `peer` benchmark block with role, benchmark family, urbanization-level scores, source, source date, derivation summary, owner, and review due date
- a `national` benchmark block with the same provenance metadata plus a single score
- a `reference` benchmark block with the same provenance metadata plus a single score

Editing rules:

- Change the JSON artifact, not literals in `risk_comparisons.py`.
- Keep all four categories present: `noise`, `air_quality`, `climate_stress`, `sunlight`.
- Keep one peer score for every `UrbanizationLevel` value.
- Update the derivation summary and review date in the same diff whenever a benchmark value changes.

Validation rules are enforced at import and test time so missing metadata, invalid score ranges, or incomplete category coverage fail fast.
