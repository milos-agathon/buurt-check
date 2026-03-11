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


def test_embed_chart_png_uses_passed_dimensions_without_pil_probe(monkeypatch):
    calls: dict[str, object] = {}

    class _PdfStub:
        def image(self, image_stream, *, x, y, w, h):  # type: ignore[no-untyped-def]
            calls["stream"] = image_stream
            calls["x"] = x
            calls["y"] = y
            calls["w"] = w
            calls["h"] = h

    pdf = _PdfStub()

    def _unexpected_open(*_args, **_kwargs):
        raise AssertionError("pdf_export should not probe chart dimensions via PIL")

    monkeypatch.setattr(pe.Image, "open", _unexpected_open)

    end_y = pe._embed_chart_png(
        pdf,
        _tiny_png_bytes(),
        x=10,
        y=20,
        width=180,
        source_width_mm=160.0,
        source_height_mm=24.0,
    )

    assert end_y == pytest.approx(47.0)
    assert calls["x"] == 10
    assert calls["y"] == 20
    assert calls["w"] == 180
    assert calls["h"] == pytest.approx(27.0)


@pytest.mark.skipif(
    not hasattr(pe, "chart_renderer") or pe.chart_renderer is None,
    reason="chart_renderer unavailable",
)
def test_draw_comparison_chart_uses_chart_renderer(monkeypatch):
    called = {"value": False}

    def _fake_render(
        *,
        category,
        address_score,
        comparisons,
        output_format="pdf",
        show_row_labels=True,
        show_axis_labels=True,
    ):
        called["value"] = True
        assert output_format == "png"
        assert show_row_labels is False
        assert show_axis_labels is False
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
def test_draw_risk_grid_passes_five_cell_layout(monkeypatch):
    called = {"value": False}

    def _fake_render(*, cells, cols=4, output_format="pdf"):
        called["value"] = True
        assert output_format == "png"
        assert cols == 5
        assert len(cells) == 5
        assert cells[-1].category == "Crime"
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
            ("Crime", 74, "Good"),
        ],
        cols=5,
    )

    assert called["value"] is True
    assert end_y > 20


@pytest.mark.skipif(
    not hasattr(pe, "chart_renderer") or pe.chart_renderer is None,
    reason="chart_renderer unavailable",
)
def test_draw_age_bars_uses_chart_renderer(monkeypatch):
    called = {"value": False}

    def _fake_render(*, age_data, output_format="pdf", is_nl=False):
        called["value"] = True
        assert output_format == "png"
        assert isinstance(age_data, AgeProfile)
        assert is_nl is False
        return _tiny_png_bytes()

    monkeypatch.setattr(pe.chart_renderer, "render_age_distribution", _fake_render)

    pdf = BuurtCheckPDF(language="en")
    pdf.add_page()
    end_y = pdf.draw_age_bars(10, 30, 180, AgeProfile(age_0_24=20, age_25_64=60, age_65_plus=20))

    assert called["value"] is True
    assert end_y > 30
