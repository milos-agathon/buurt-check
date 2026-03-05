"""LaTeX rendering and compilation helpers for PDF export.

This module provides a small Jinja2-based template environment and a LuaLaTeX
compiler wrapper. The public API is intentionally stable because tests and
orchestrators import these symbols directly.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path
from typing import Any

import jinja2

logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = _BACKEND_DIR / "templates"

# Keep template defaults aligned with historical paths, but gracefully fall
# back to the current repo layout where assets live in app/assets.
FONTS_DIR = _BACKEND_DIR / "assets" / "fonts"
if not FONTS_DIR.exists():
    FONTS_DIR = _BACKEND_DIR.parent / "assets" / "fonts"

LOGOS_DIR = _BACKEND_DIR / "assets" / "logos"
if not LOGOS_DIR.exists():
    LOGOS_DIR = _BACKEND_DIR.parent / "assets" / "logos"

LOGO_PATH = LOGOS_DIR / "buurt-check-lockup-horizontal.png"

# TeX is happier with POSIX separators across platforms.
FONTS_DIR_TEX = FONTS_DIR.as_posix()
LOGO_PATH_TEX = LOGO_PATH.as_posix()

_LATEX_SPECIAL_CHARS: dict[str, str] = {
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}

_DUTCH_MONTHS = (
    "januari",
    "februari",
    "maart",
    "april",
    "mei",
    "juni",
    "juli",
    "augustus",
    "september",
    "oktober",
    "november",
    "december",
)

_SEVERITY_COLOR_MAP: dict[str, str] = {
    "good": "sev-good",
    "moderate": "sev-mod",
    "poor": "sev-poor",
    "critical": "sev-crit",
}
_SEVERITY_LABEL_NL: dict[str, str] = {
    "good": "Goed",
    "moderate": "Matig",
    "poor": "Slecht",
    "critical": "Kritiek",
}


def _severity_value(severity: object | None) -> str | None:
    if severity is None:
        return None
    raw = getattr(severity, "value", severity)
    if raw is None:
        return None
    return str(raw).strip().lower()


def _sev_color(severity: object | None) -> str:
    value = _severity_value(severity)
    if value is None:
        return "MutedText"
    return _SEVERITY_COLOR_MAP.get(value, "MutedText")


def _sev_label(severity: object | None, language: str = "en") -> str:
    value = _severity_value(severity)
    if value is None:
        return ""
    if language == "nl":
        return _SEVERITY_LABEL_NL.get(value, value.capitalize())
    return value.capitalize()


def _create_latex_env() -> jinja2.Environment:
    env = jinja2.Environment(
        loader=jinja2.FileSystemLoader(str(TEMPLATES_DIR)),
        block_start_string="<%",
        block_end_string="%>",
        variable_start_string="<<",
        variable_end_string=">>",
        comment_start_string="<#",
        comment_end_string="#>",
        autoescape=False,
        trim_blocks=True,
        lstrip_blocks=True,
        undefined=jinja2.StrictUndefined,
    )
    env.filters["sev_color"] = _sev_color
    env.filters["sev_label"] = _sev_label
    return env


_env = _create_latex_env()


def render_template(name: str, **variables: object) -> str:
    """Render a named `.tex.j2` template using strict Jinja2 variables."""
    template = _env.get_template(name)
    return template.render(**variables)


def render_preamble(language: str = "en") -> str:
    """Render the shared LaTeX preamble used by brief and dossier templates."""
    return render_template(
        "preamble.tex.j2",
        fonts_dir=FONTS_DIR_TEX,
        logo_path=LOGO_PATH_TEX,
        language=language,
    )


def format_preparation_date(value: date, language: str = "en") -> str:
    """Format a preparation date consistently for EN/NL output."""
    if language == "nl":
        month = _DUTCH_MONTHS[value.month - 1]
        return f"{value.day} {month} {value.year}"
    return value.strftime("%d %B %Y").lstrip("0")


def _preferred_tmp_dir() -> str | None:
    tmp_root = Path("/tmp")
    if tmp_root.exists() and os.access(tmp_root, os.W_OK):
        return str(tmp_root)
    return None


def escape_latex(text: str) -> str:
    """Escape text for safe insertion into LaTeX templates.

    The sequence keeps backslashes stable by replacing them with a sentinel
    before escaping other characters, then restoring them as `\\textbackslash{}`.
    """
    _BACKSLASH_SENTINEL = "\x00BACKSLASH\x00"
    text = text.replace("\\", _BACKSLASH_SENTINEL)
    for char, replacement in _LATEX_SPECIAL_CHARS.items():
        text = text.replace(char, replacement)
    text = text.replace(_BACKSLASH_SENTINEL, r"\textbackslash{}")
    return text


def render_dossier(
    *,
    address: str,
    language: str = "en",
    building_year: int | None = None,
    building_use: str | None = None,
    floor_area: int | None = None,
    preparation_date: str = "",
    risks: dict[str, Any] | None = None,
    executive_summary: str | None = None,
    sunlight_score: int | None = None,
    risk_comparisons: dict[str, Any] | None = None,
    neighborhood: dict[str, Any] | None = None,
    livability: dict[str, Any] | None = None,
    tier_b: dict[str, Any] | None = None,
    property_warnings: dict[str, Any] | None = None,
    viewing_questions: dict[str, Any] | None = None,
    provenance: dict[str, Any] | None = None,
    risk_grid_chart: str | None = None,
    comparison_charts: dict[str, str] | None = None,
    age_chart: str | None = None,
    age_interpretation: str | None = None,
    livability_chart: str | None = None,
    livability_trend_summary: str | None = None,
    energy_label: str | None = None,
    shadow_images: list[str] | None = None,
    location_map: str | None = None,
    shadow_time_labels: list[str] | None = None,
    sunlight_state: str = "error",
    sunlight_pending_message: str | None = None,
    sunlight_unavailable_message: str | None = None,
    postcode: str | None = None,
    methodology: dict[str, Any] | None = None,
) -> str:
    """Render the full dossier LaTeX document."""
    preamble_content = render_preamble(language=language)
    return render_template(
        "dossier.tex.j2",
        preamble_content=preamble_content,
        address=address,
        language=language,
        building_year=building_year,
        building_use=building_use,
        floor_area=floor_area,
        preparation_date=preparation_date,
        risks=risks,
        executive_summary=executive_summary,
        sunlight_score=sunlight_score,
        risk_comparisons=risk_comparisons,
        neighborhood=neighborhood,
        livability=livability,
        tier_b=tier_b,
        property_warnings=property_warnings,
        viewing_questions=viewing_questions,
        provenance=provenance,
        risk_grid_chart=risk_grid_chart,
        comparison_charts=comparison_charts,
        age_chart=age_chart,
        age_interpretation=age_interpretation,
        livability_chart=livability_chart,
        livability_trend_summary=livability_trend_summary,
        energy_label=energy_label,
        shadow_images=shadow_images,
        location_map=location_map,
        shadow_time_labels=shadow_time_labels,
        sunlight_state=sunlight_state,
        sunlight_pending_message=sunlight_pending_message,
        sunlight_unavailable_message=sunlight_unavailable_message,
        postcode=postcode,
        methodology=methodology,
    )


def render_brief(
    *,
    address: str,
    language: str = "en",
    building_year: int | None = None,
    building_use: str | None = None,
    floor_area: int | None = None,
    preparation_date: str = "",
    risks: dict[str, Any] | None = None,
    sunlight_score: int | None = None,
    risk_grid_chart: str | None = None,
    shadow_image: str | None = None,
    location_map: str | None = None,
    viewing_questions: dict[str, Any] | None = None,
    questions_clipped: bool = False,
) -> str:
    """Render the single-page quick viewing brief LaTeX document."""
    preamble_content = render_preamble(language=language)
    return render_template(
        "brief.tex.j2",
        preamble_content=preamble_content,
        address=address,
        language=language,
        building_year=building_year,
        building_use=building_use,
        floor_area=floor_area,
        preparation_date=preparation_date,
        risks=risks,
        sunlight_score=sunlight_score,
        risk_grid_chart=risk_grid_chart,
        shadow_image=shadow_image,
        location_map=location_map,
        viewing_questions=viewing_questions,
        questions_clipped=questions_clipped,
    )


def compile_latex_to_pdf(
    tex_source: str,
    *,
    timeout: int = 30,
    passes: int = 2,
) -> bytes:
    """Compile LaTeX source to PDF using LuaLaTeX."""
    if not shutil.which("lualatex"):
        raise RuntimeError("lualatex is not installed or not on PATH")
    if passes < 1:
        raise ValueError("passes must be >= 1")

    tmp_dir = tempfile.mkdtemp(prefix="buurtcheck_dossier_", dir=_preferred_tmp_dir())
    try:
        tex_path = os.path.join(tmp_dir, "dossier.tex")
        with open(tex_path, "w", encoding="utf-8") as f:
            f.write(tex_source)

        started = time.monotonic()
        result: subprocess.CompletedProcess[str] | None = None
        for pass_idx in range(1, passes + 1):
            elapsed = time.monotonic() - started
            remaining = max(1, timeout - int(elapsed))
            result = subprocess.run(
                [
                    "lualatex",
                    "--interaction=nonstopmode",
                    f"--output-directory={tmp_dir}",
                    tex_path,
                ],
                capture_output=True,
                text=True,
                timeout=remaining,
                cwd=tmp_dir,
            )
            if pass_idx == passes and result.returncode != 0:
                break

        pdf_path = os.path.join(tmp_dir, "dossier.pdf")
        if result is None:
            raise RuntimeError("lualatex did not run")
        if result.returncode != 0:
            log_tail = result.stdout[-3000:] if result.stdout else "(no output)"
            logger.error("lualatex failed (exit %d):\n%s", result.returncode, log_tail)
            raise RuntimeError(
                f"lualatex compilation failed (exit {result.returncode}):\n{log_tail}"
            )

        if not os.path.isfile(pdf_path):
            raise RuntimeError("lualatex succeeded but no PDF was generated")

        with open(pdf_path, "rb") as f:
            return f.read()
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def compile_latex_to_pdf_with_fallback(
    tex_source: str,
    *,
    fallback_pdf_factory: Callable[[], bytes],
    timeout: int = 4,
    passes: int = 2,
) -> bytes:
    """Compile with LaTeX and fallback to an alternate PDF renderer on failure."""
    try:
        return compile_latex_to_pdf(tex_source, timeout=timeout, passes=passes)
    except (RuntimeError, subprocess.TimeoutExpired):
        logger.exception("LaTeX compile failed; using fallback PDF renderer")
        return fallback_pdf_factory()


def render_chart_assets_parallel(
    chart_jobs: dict[str, Callable[[], bytes]],
    *,
    max_workers: int | None = None,
) -> dict[str, bytes]:
    """Render chart assets concurrently for lower end-to-end dossier latency."""
    if not chart_jobs:
        return {}
    if max_workers is None:
        max_workers = min(8, max(1, len(chart_jobs)))

    rendered: dict[str, bytes] = {}
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(job): name for name, job in chart_jobs.items()}
        for future in as_completed(futures):
            name = futures[future]
            rendered[name] = future.result()
    return rendered
