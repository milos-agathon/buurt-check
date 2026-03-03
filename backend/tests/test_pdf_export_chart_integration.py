"""Integration checks: pdf_export delegates chart drawing to chart_renderer."""

from __future__ import annotations

import io

import pytest
from PIL import Image

from app.models.neighborhood import AgeProfile
from app.services import pdf_export as pe
from app.services.pdf_export import MUTED, TEAL, BuurtCheckPDF


def _tiny_png_bytes() -> bytes:
    image = Image.new("RGB", (64, 32), (240, 242, 245))
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


@pytest.mark.skipif(
    not hasattr(pe, "chart_renderer") or pe.chart_renderer is None,
    reason="chart_renderer unavailable",
)
def test_draw_comparison_chart_uses_chart_renderer(monkeypatch):
    called = {"value": False}

    def _fake_render(*, category, address_score, comparisons, output_format="pdf"):
        called["value"] = True
        assert output_format == "png"
        assert address_score == 65
        assert category == "Noise - comparison"
        assert len(comparisons) == 1
        return _tiny_png_bytes()

    monkeypatch.setattr(pe.chart_renderer, "render_risk_comparison", _fake_render)

    pdf = BuurtCheckPDF(language="en")
    pdf.add_page()
    end_y = pdf.draw_comparison_chart(
        10,
        30,
        180,
        [
            ("This address", 65, TEAL, False),
            ("Peer baseline", 55, MUTED, False),
        ],
        chart_title="Noise - comparison",
    )

    assert called["value"] is True
    assert end_y > 30


@pytest.mark.skipif(
    not hasattr(pe, "chart_renderer") or pe.chart_renderer is None,
    reason="chart_renderer unavailable",
)
def test_draw_risk_grid_uses_chart_renderer(monkeypatch):
    called = {"value": False}

    def _fake_render(*, cells, cols=4, output_format="pdf"):
        called["value"] = True
        assert output_format == "png"
        assert cols == 2
        assert len(cells) == 4
        return _tiny_png_bytes()

    monkeypatch.setattr(pe.chart_renderer, "render_risk_summary_grid", _fake_render)

    pdf = BuurtCheckPDF(language="en")
    pdf.add_page()
    end_y = pdf.draw_risk_grid(
        10,
        20,
        180,
        [
            ("Noise", 65, "Moderate"),
            ("Air", 80, "Good"),
            ("Climate", 30, "Poor"),
            ("Sunlight", None, "N/A"),
        ],
        cols=2,
    )

    assert called["value"] is True
    assert end_y > 20


@pytest.mark.skipif(
    not hasattr(pe, "chart_renderer") or pe.chart_renderer is None,
    reason="chart_renderer unavailable",
)
def test_draw_age_bars_uses_chart_renderer(monkeypatch):
    called = {"value": False}

    def _fake_render(*, age_data, output_format="pdf"):
        called["value"] = True
        assert output_format == "png"
        assert isinstance(age_data, AgeProfile)
        return _tiny_png_bytes()

    monkeypatch.setattr(pe.chart_renderer, "render_age_distribution", _fake_render)

    pdf = BuurtCheckPDF(language="en")
    pdf.add_page()
    end_y = pdf.draw_age_bars(10, 30, 180, AgeProfile(age_0_24=20, age_25_64=60, age_65_plus=20))

    assert called["value"] is True
    assert end_y > 30
