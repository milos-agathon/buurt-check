"""Visual regression suite for dossier PDFs (Epic 4, Story 4.1)."""

from __future__ import annotations

import warnings
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from tests.epic4_pdf_fixtures import SCENARIOS, render_dossier_pdf

fitz = pytest.importorskip("fitz", reason="PyMuPDF is required for visual regression")

BASELINES_ROOT = Path(__file__).resolve().parent / "baselines" / "pdf"
DPI = 150
PASS_THRESHOLD = 2.0
FAIL_THRESHOLD = 5.0
DELTA_THRESHOLD = 16


pytestmark = [
    pytest.mark.visual,
]


def _render_pdf_pages(pdf_bytes: bytes, dpi: int = DPI) -> list[np.ndarray]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        zoom = dpi / 72.0
        matrix = fitz.Matrix(zoom, zoom)
        pages: list[np.ndarray] = []
        for page in doc:
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
                pix.height,
                pix.width,
                pix.n,
            )
            pages.append(arr)
        return pages
    finally:
        doc.close()


def _load_baseline_pages(scenario_dir: Path) -> list[np.ndarray]:
    png_paths = sorted(scenario_dir.glob("page-*.png"))
    pages: list[np.ndarray] = []
    for path in png_paths:
        with Image.open(path) as image:
            pages.append(np.asarray(image.convert("RGB"), dtype=np.uint8))
    return pages


def _diff_percent(actual: np.ndarray, baseline: np.ndarray) -> float:
    if actual.shape != baseline.shape:
        return 100.0
    delta = np.abs(actual.astype(np.int16) - baseline.astype(np.int16))
    changed = np.any(delta > DELTA_THRESHOLD, axis=2)
    return float(changed.mean() * 100.0)


@pytest.mark.parametrize("kind,language", SCENARIOS)
def test_pdf_visual_regression(kind: str, language: str) -> None:
    scenario_key = f"{kind}_{language}"
    scenario_dir = BASELINES_ROOT / scenario_key

    if not scenario_dir.exists():
        pytest.skip(
            f"Missing baseline directory: {scenario_dir}. "
            "Run backend/scripts/update_pdf_baselines.py locally to generate baselines.",
        )

    baseline_pages = _load_baseline_pages(scenario_dir)
    if not baseline_pages:
        pytest.skip(
            f"No baseline PNG pages found in {scenario_dir}. "
            "Run backend/scripts/update_pdf_baselines.py locally to generate page images.",
        )

    actual_pdf = render_dossier_pdf(kind, language)
    actual_pages = _render_pdf_pages(actual_pdf)

    assert len(actual_pages) == len(baseline_pages), (
        f"Page count mismatch for {scenario_key}: "
        f"actual={len(actual_pages)} baseline={len(baseline_pages)}"
    )

    warnings_found: list[str] = []
    failures: list[str] = []
    page_pairs = zip(actual_pages, baseline_pages, strict=True)
    for idx, (actual, baseline) in enumerate(page_pairs, start=1):
        diff = _diff_percent(actual, baseline)
        if diff > FAIL_THRESHOLD:
            failures.append(f"page {idx}: {diff:.2f}% diff (> {FAIL_THRESHOLD:.1f}%)")
        elif diff >= PASS_THRESHOLD:
            warnings_found.append(
                f"page {idx}: {diff:.2f}% diff "
                f"({PASS_THRESHOLD:.1f}% - {FAIL_THRESHOLD:.1f}% warning band)"
            )

    if warnings_found:
        warnings.warn(
            f"Visual regression warnings for {scenario_key}: " + "; ".join(warnings_found),
            stacklevel=2,
        )

    assert not failures, (
        f"Visual regression failed for {scenario_key}: " + "; ".join(failures)
    )
