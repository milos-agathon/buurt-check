# buurt-check backend

FastAPI API aggregator for Dutch property intelligence. Aggregates data from BAG, RIVM, CBS, 3DBAG, Klimaateffectatlas, and other Dutch geospatial APIs into risk scores, neighborhood profiles, and PDF dossiers.

## Quick start

```bash
uvicorn app.main:app --reload --port 8000
```

## Production web launch

Deploy the backend as a dedicated FastAPI service and keep the public browser origin on `https://app.buurt-check.nl`. The frontend Vercel app should proxy `/api/*` to this backend by setting `BACKEND_URL` in the frontend project.

### Container build

```bash
cd backend
docker build -t buurt-check-backend .
docker run --env-file .env -p 8000:8000 buurt-check-backend
```

### Required production env vars

- `BUURT_BASE_URL=https://app.buurt-check.nl`
- `BUURT_CORS_ORIGINS=["https://app.buurt-check.nl","https://buurt-check.nl"]`
- `BUURT_STRIPE_SECRET_KEY`
- `BUURT_STRIPE_WEBHOOK_SECRET`
- `BUURT_TURSO_DATABASE_URL`
- `BUURT_TURSO_AUTH_TOKEN`
- `BUURT_REDIS_URL`
- `BUURT_SENTRY_DSN`
- `BUURT_SENTRY_ENVIRONMENT=production`

`BUURT_DATABASE_PATH` is acceptable for local development only. For production, use Turso or another networked libsql backend so buyer-bound report state survives container restarts and scales beyond a single instance.

### Health checks

- `GET /health`
- `GET /health/forge3d`

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
