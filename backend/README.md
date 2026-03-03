# buurt-check backend

FastAPI API aggregator for Dutch property intelligence. Aggregates data from BAG, RIVM, CBS, 3DBAG, Klimaateffectatlas, and other Dutch geospatial APIs into risk scores, neighborhood profiles, and PDF dossiers.

## Quick start

```bash
uvicorn app.main:app --reload --port 8000
```

## Testing

```bash
pytest -x -q -m "not live"          # CI tests (629+ baseline)
pytest -x -q                        # Include live API smoke tests
pytest -x -q -m "visual"            # Visual regression tests (requires lualatex)
pytest -x -q -m "benchmark"         # Performance benchmarks
ruff check .                        # Lint (must pass before commit)
```

## LaTeX PDF pipeline

The backend renders property dossiers and viewing briefs as PDF via LuaLaTeX.

### Prerequisites

- **LuaLaTeX** — via TeX Live (TinyTeX recommended) or system TeX distribution
- **Inter fonts** — OTF files in `assets/fonts/` (Regular, Bold, Italic, BoldItalic, SemiBold)
- **TeX packages** — install via `scripts/install-texlive.sh`
  - `BUURTCHECK_TEX_INSTALL_MODE=apt` installs `texlive-base`, `texlive-luatex`, `texlive-latex-extra`, `texlive-fonts-extra`
  - `BUURTCHECK_TEX_INSTALL_MODE=tlmgr` installs package-level dependencies for TinyTeX/TeX Live

### Templates

| Template | Purpose |
|----------|---------|
| `templates/preamble.tex.j2` | Shared preamble (fonts, colors, headers) |
| `templates/dossier.tex.j2` | Full multi-page property dossier |
| `templates/brief.tex.j2` | Single-page quick viewing brief |

Templates use Jinja2 with custom delimiters (`<< >>`, `<% %>`, `<# #>`) to avoid conflicts with LaTeX braces. See `app/services/latex_env.py` for the rendering environment.

### CI integration

- Run `scripts/install-texlive.sh` to install required TeX packages
- Run `lualatex --version` to verify binary availability in the CI environment
- Font assets must be present at `assets/fonts/`
- Tests that require `lualatex` are skipped automatically when it is not on PATH
