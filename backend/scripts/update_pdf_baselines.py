#!/usr/bin/env python
"""Regenerate baseline dossier PDFs and page PNGs for visual regression tests."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import fitz


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dpi", type=int, default=150, help="PNG render resolution (default: 150)")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()

    backend_dir = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(backend_dir))

    from tests.epic4_pdf_fixtures import SCENARIOS, render_dossier_pdf

    baselines_root = backend_dir / "tests" / "baselines" / "pdf"
    baselines_root.mkdir(parents=True, exist_ok=True)

    zoom = args.dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)

    for kind, language in SCENARIOS:
        key = f"{kind}_{language}"
        out_dir = baselines_root / key
        out_dir.mkdir(parents=True, exist_ok=True)

        pdf_bytes = render_dossier_pdf(kind, language)
        (out_dir / "baseline.pdf").write_bytes(pdf_bytes)

        for stale in out_dir.glob("page-*.png"):
            stale.unlink()

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page_count = len(doc)
        try:
            for idx, page in enumerate(doc, start=1):
                pix = page.get_pixmap(matrix=matrix, alpha=False)
                pix.save(str(out_dir / f"page-{idx:03d}.png"))
        finally:
            doc.close()

        print(f"updated {key} ({page_count} pages)")

    print(f"baselines written to: {baselines_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
