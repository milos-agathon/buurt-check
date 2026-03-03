# PDF QA Guide (Epic 4)

This repository ships a dedicated PDF QA layer for the LaTeX dossier pipeline.

## Suites

- Visual regression: `pytest -m visual backend/tests/test_pdf_visual_regression.py`
- Contrast verification: `pytest backend/tests/test_wcag_contrast.py`
- Bilingual parity: `pytest backend/tests/test_pdf_bilingual_parity.py`
- Performance benchmarks: `pytest -m benchmark backend/tests/test_pdf_performance.py`

## Baseline Artifacts

Baselines are stored in:

- `backend/tests/baselines/pdf/full_en/`
- `backend/tests/baselines/pdf/full_nl/`
- `backend/tests/baselines/pdf/partial_en/`
- `backend/tests/baselines/pdf/partial_nl/`

Each scenario contains:

- `baseline.pdf`
- `page-XXX.png` rendered at 150 DPI

## Regenerating Baselines

From repo root:

```bash
scripts/update-pdf-baselines.sh
```

Equivalent direct command:

```bash
python backend/scripts/update_pdf_baselines.py --dpi 150
```

## CI Usage

- Default unit runs exclude visual and benchmark markers via pytest `addopts`.
- Run visual and benchmark suites in dedicated CI jobs.
- Baseline refresh should be reviewed manually before merge (layout/content sanity check).
