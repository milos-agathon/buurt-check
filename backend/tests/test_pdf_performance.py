"""Performance benchmark and safeguards for dossier rendering (Epic 4, Story 4.3)."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
import time
from pathlib import Path

import pytest

from app.services import latex_env, pdf_export
from app.services.latex_env import (
    compile_latex_to_pdf,
    compile_latex_to_pdf_with_fallback,
    render_chart_assets_parallel,
)
from tests.epic4_pdf_fixtures import render_brief_pdf, render_dossier_pdf


def _latency_stats(durations: list[float]) -> tuple[float, float]:
    ordered = sorted(durations)
    mid = len(ordered) // 2
    median = ordered[mid] if len(ordered) % 2 else (ordered[mid - 1] + ordered[mid]) / 2.0
    idx = max(0, int(round(0.95 * (len(ordered) - 1))))
    return median, ordered[idx]


def _warm_pdf_renderer(render_pdf) -> None:  # type: ignore[no-untyped-def]
    # Discard first-run LuaLaTeX/font startup cost so the benchmark captures
    # steady-state dossier generation rather than one-time process warmup.
    pdf = render_pdf()
    assert pdf.startswith(b"%PDF-")


@pytest.mark.benchmark
def test_dossier_generation_latency() -> None:
    runs = 10
    durations: list[float] = []

    _warm_pdf_renderer(lambda: render_dossier_pdf("full", "en", timeout=20))

    for _ in range(runs):
        t0 = time.perf_counter()
        pdf = render_dossier_pdf("full", "en", timeout=20)
        durations.append(time.perf_counter() - t0)
        assert pdf.startswith(b"%PDF-")

    median, p95 = _latency_stats(durations)
    assert median < 3.0, f"median latency {median:.2f}s >= 3.0s"
    assert p95 < 4.0, f"p95 latency {p95:.2f}s >= 4.0s"


@pytest.mark.benchmark
@pytest.mark.skipif(shutil.which("lualatex") is None, reason="lualatex not installed")
def test_brief_generation_latency() -> None:
    runs = 10
    durations: list[float] = []

    _warm_pdf_renderer(lambda: render_brief_pdf("en", timeout=20))

    for _ in range(runs):
        t0 = time.perf_counter()
        pdf = render_brief_pdf("en", timeout=20)
        durations.append(time.perf_counter() - t0)
        assert pdf.startswith(b"%PDF-")

    median, p95 = _latency_stats(durations)
    assert median < 1.5, f"median latency {median:.2f}s >= 1.5s"
    assert p95 < 2.0, f"p95 latency {p95:.2f}s >= 2.0s"


def test_latex_fallback_triggers_above_timeout(monkeypatch) -> None:
    def fake_compile(_tex: str, *, timeout: int = 30, passes: int = 2) -> bytes:
        raise subprocess.TimeoutExpired(cmd=["lualatex"], timeout=timeout)

    monkeypatch.setattr(latex_env, "compile_latex_to_pdf", fake_compile)

    result = compile_latex_to_pdf_with_fallback(
        "\\documentclass{article}\\begin{document}x\\end{document}",
        fallback_pdf_factory=lambda: b"%PDF-fallback",
        timeout=4,
    )

    assert result == b"%PDF-fallback"


def test_latex_compile_uses_nonstopmode_and_tmp(monkeypatch, tmp_path: Path) -> None:
    captured: dict[str, object] = {}

    monkeypatch.setattr(latex_env, "_preferred_tmp_dir", lambda: "/tmp")
    monkeypatch.setattr(shutil, "which", lambda _name: "lualatex")

    temp_dir = tmp_path / "latex-job"
    temp_dir.mkdir(parents=True, exist_ok=True)

    def fake_mkdtemp(*, prefix: str, dir: str | None = None) -> str:
        captured["prefix"] = prefix
        captured["dir"] = dir
        return str(temp_dir)

    monkeypatch.setattr(tempfile, "mkdtemp", fake_mkdtemp)

    class _Result:
        returncode = 0
        stdout = "ok"

    def fake_run(args, **kwargs):  # type: ignore[no-untyped-def]
        captured["args"] = list(args)
        captured["cwd"] = kwargs.get("cwd")
        (temp_dir / "dossier.pdf").write_bytes(b"%PDF-1.4\n")
        return _Result()

    monkeypatch.setattr(subprocess, "run", fake_run)

    pdf = compile_latex_to_pdf(
        "\\documentclass{article}\\begin{document}x\\end{document}",
        timeout=5,
    )

    assert pdf.startswith(b"%PDF-")
    assert captured["dir"] == "/tmp"
    assert "--interaction=nonstopmode" in captured["args"]


def test_chart_rendering_parallelized() -> None:
    def _job(_: int) -> bytes:
        time.sleep(0.2)
        return b"ok"

    jobs = {f"chart_{i}": (lambda i=i: _job(i)) for i in range(4)}

    start = time.perf_counter()
    rendered = render_chart_assets_parallel(jobs)
    elapsed = time.perf_counter() - start

    assert len(rendered) == 4
    # Sequential runtime would be ~0.8s. Parallel should remain well below that.
    assert elapsed < 0.55, f"chart rendering appears sequential ({elapsed:.2f}s)"


def test_pdf_export_full_dossier_uses_parallel_chart_jobs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    def fake_parallel(chart_jobs, *, max_workers=None):  # type: ignore[no-untyped-def]
        captured["job_keys"] = set(chart_jobs.keys())
        assert max_workers is None
        return {
            "risk_grid_chart": b"png-risk-grid",
            "comparison_charts": {"noise": b"png-noise-chart"},
        }

    monkeypatch.setattr(pdf_export, "render_chart_assets_parallel", fake_parallel)
    monkeypatch.setattr(
        pdf_export,
        "compile_latex_to_pdf_with_fallback",
        lambda _tex, *, fallback_pdf_factory, timeout=4, passes=2: b"%PDF-parallel-path",
    )

    def fake_render_dossier(**kwargs: object) -> str:
        captured["context"] = kwargs
        return "dummy-tex"

    monkeypatch.setattr(pdf_export, "render_dossier", fake_render_dossier)

    result = pdf_export._generate_full_dossier_latex(
        address="Damrak 1, Amsterdam",
        building_year=1900,
        building_use="Residential",
        risks=None,
        sunlight_score=None,
        viewing_questions=None,
        shadow_image_b64=None,
        language="en",
        floor_area=None,
        neighborhood_stats=None,
        tier_b=None,
        risk_comparisons=None,
        property_warnings_data=None,
        provenance=None,
        location_map_b64=None,
        livability=None,
        shadow_images=None,
    )

    assert result == b"%PDF-parallel-path"
    assert captured["job_keys"] == {
        "risk_grid_chart",
        "comparison_charts",
    }
    context = captured["context"]
    assert isinstance(context, dict)
    assert context["risk_grid_chart"] is not None
    assert str(context["risk_grid_chart"]).endswith(("risk_grid.pdf", "risk_grid.png"))
    comparison_paths = context["comparison_charts"]
    assert isinstance(comparison_paths, dict)
    assert str(comparison_paths["noise"]).endswith(("comparison_noise.pdf", "comparison_noise.png"))
    assert context["age_chart"] is None
    assert context["livability_chart"] is None
    assert context["shadow_images"] is None


def test_pdf_export_chart_tmp_dirs_use_preferred_tmp_dir(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    captured_prefixes: list[str] = []

    class _FakeTempDir:
        def __init__(self, *, prefix: str):
            captured_prefixes.append(prefix)
            self._path = tmp_path / f"{prefix}{len(captured_prefixes)}"
            self._path.mkdir(parents=True, exist_ok=True)

        def __enter__(self) -> str:
            return str(self._path)

        def __exit__(self, exc_type, exc, tb) -> bool:  # type: ignore[no-untyped-def]
            return False

    monkeypatch.setattr(pdf_export.tempfile, "TemporaryDirectory", _FakeTempDir)
    monkeypatch.setattr(pdf_export, "render_chart_assets_parallel", lambda *args, **kwargs: {})
    monkeypatch.setattr(pdf_export, "render_dossier", lambda **kwargs: "dummy-dossier-tex")
    monkeypatch.setattr(pdf_export, "render_brief", lambda **kwargs: "dummy-brief-tex")
    monkeypatch.setattr(
        pdf_export,
        "compile_latex_to_pdf_with_fallback",
        lambda _tex, *, fallback_pdf_factory, timeout=4, passes=2: b"%PDF-tmpdir-path",
    )

    full_pdf = pdf_export._generate_full_dossier_latex(
        address="Damrak 1, Amsterdam",
        building_year=None,
        building_use=None,
        risks=None,
        sunlight_score=None,
        viewing_questions=None,
        shadow_image_b64=None,
        language="en",
        floor_area=None,
        neighborhood_stats=None,
        tier_b=None,
        risk_comparisons=None,
        property_warnings_data=None,
        provenance=None,
        location_map_b64=None,
        livability=None,
        shadow_images=None,
    )
    brief_pdf = pdf_export._generate_quick_brief_latex(
        address="Damrak 1, Amsterdam",
        building_year=None,
        building_use=None,
        risks=None,
        sunlight_score=None,
        viewing_questions=None,
        shadow_image_b64=None,
        language="en",
        floor_area=None,
    )

    assert full_pdf == b"%PDF-tmpdir-path"
    assert brief_pdf == b"%PDF-tmpdir-path"
    assert captured_prefixes == [
        "buurtcheck_latex_assets_",
        "buurtcheck_latex_assets_",
    ]
