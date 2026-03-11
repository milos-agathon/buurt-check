# Backend — FastAPI + httpx + Pydantic + Redis + SQLite + Stripe

Python 3.12 API aggregator. External data stays stateless/cached, monetization state is stored in SQLite (per-report entitlements, payments; no user accounts).

## Commands

```bash
uvicorn app.main:app --reload --port 8000   # Dev server
pytest -x -q -m "not live"                  # CI tests (629+ baseline)
pytest -x -q                                # Including live API smoke tests
ruff check . && ruff format .               # MUST pass before commit
```

## API endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/pricing` | Authoritative dossier price from backend config |
| `POST /api/reports/short` | Create/report short dossier record |
| `GET /api/reports/{report_id}/entitlement` | Check entitlement status |
| `POST /api/billing/checkout-session` | Create Stripe Checkout Session |
| `POST /api/billing/webhook` | Stripe webhook (checkout + refund) |
| `GET /suggest?q=` | Autocomplete via PDOK Locatieserver |
| `GET /lookup?id=` | Resolve BAG IDs + coordinates |
| `GET /{vbo_id}/building` | Building facts from BAG WFS |
| `GET /{vbo_id}/building3d` | Target building 3D (~2s) |
| `GET /{vbo_id}/neighborhood3d?rd_x=&rd_y=` | Surrounding 3D (~12-17s) |
| `GET /{vbo_id}/risks?rd_x=&rd_y=&lat=&lng=` | Risk cards with 0-100 scores |
| `GET /{vbo_id}/neighborhood?lat=&lng=&buurt_code=` | CBS neighborhood stats |
| `GET /{vbo_id}/wms-tile?source=&rd_x=&rd_y=&radius=` | WMS tile proxy (PNG) |
| `GET /{vbo_id}/viewing-questions` | Bilingual viewing questions |
| `GET /{vbo_id}/risk-comparisons` | Urbanization-stratified baselines |
| `GET /{vbo_id}/tier-b?buurt_code=` | Crime context |
| `GET /{vbo_id}/property-warnings` | Foundation, erfpacht, VvE, asbestos |
| `GET /{vbo_id}/livability?rd_x=&rd_y=` | Leefbaarometer scores + trend |
| `POST /{vbo_id}/export` | PDF (quick_brief / full_dossier) |

## Conventions

- **Service pattern**: Cache check → external API call → parse → cache on success → return. Never cache empty/error
- **Cache TTLs**: BAG 24h, risks 7d (conditional), CBS/livability/warnings 30d, WMS tiles 24h, tier-B 7d
- **Config**: All URLs in `config.py` as pydantic-settings fields. Env prefix: `BUURT_`
- **Coordinates**: EPSG:28992 everywhere. BAG IDs: 16 digits (`^[0-9]{16}$`)
- **Error handling**: Log + return graceful degradation. Warning codes (`NOISE_NO_VALUE`, `AIR_PARTIAL`, etc.)
- **Models**: All in `models/`. Include `source` + `source_date`. Optional fields default to `None`
- **httpx mock in tests**: `AsyncMock` for client, `MagicMock` for response (`.json()` is sync)
- **Pydantic v2**: Use `Field(default_factory=list)` for list defaults, never bare `= []`
- **Feature flags**: `BUURT_ENABLE_LOD22_ROOFS` etc. Toggle requires cache invalidation
- **CBS crime normalization**: per-1,000 residents (`raw / population * 1000`). Population can be suppressed (`-99995`) → `CRIME_NO_POPULATION`
- **SQLite access**: use `aiosqlite` via `get_db()` context manager; DB runs in WAL mode for concurrent reads
- **Server-side gating**: premium endpoints must depend on `Depends(require_entitlement)`
- **Webhook safety**: webhook handlers must remain idempotent (safe on duplicate Stripe events)
- **Entitlement reads are not cached**: always query SQLite for latest payment state

## Anti-patterns

- `CQL_FILTER` for BAG WFS → use OGC XML Filter (CQL is silently ignored)
- `requests` library → use `httpx` async
- Business logic in route handlers → routes call services
- WGS84 coordinates in responses → everything EPSG:28992
- `sampled_at` as `source_date` → let it be `None`
- Hardcoded URLs in services → all in `config.py`
- SQLAlchemy / PostGIS / any ORM → use direct `aiosqlite` for this MVP

## Scoring reference (0-100)

- Noise: 40dB=100, 53dB=74 (WHO), 63dB=50, 90dB=0
- Air: worst of PM2.5 and NO2 sub-scores
- Climate: categorical (low=85, medium=50, high=15)
- Sunlight: 0h=0, 2h=33, 4h=67, 6h+=100 (winter solstice)
- Severity: 70-100=good, 40-69=moderate, 20-39=poor, 0-19=critical

## 3DBAG & 3D Viewer

- **Scope modes:**
  - **Accelerated (default):** 4 parallel quadrant queries at 120m radius, 1 page each, budget 35s. ~120-150 buildings. Near-ring prefetch skipped (redundant with quadrant coverage)
  - **Conservative:** bbox radius 150m, max pages 5, budget 80s. ~150-250 buildings. Sequential pagination with backup fallback. Enable via `BUURT_THREE_D_CONSERVATIVE_MODE=True`. This is the rollback safety valve — preserves exact pre-optimization behavior
- **Cache version v26** for neighborhood3d. Key includes mode: `neighborhood3d:v26:{accelerated|conservative}:...`
- **Frontend timeout:** 90s — unchanged, must support conservative mode's 80s budget + margin
- **Lookup pand_id:** Lookup endpoint resolves VBO->pand_id with 3s timeout budget. Cache key: `lookup:v2:{id}`. Enables early 3D fetch without waiting for building facts
- **GZip compression:** All responses >1KB compressed via GZipMiddleware
- **3DBAG bbox fallback for target recovery:** When single-item endpoint returns 502, scan bbox results for target `pand_id`
- **3DBAG building coverage:** Controlled by mode constants. In conservative mode, `await near_task` after `asyncio.gather`. In accelerated mode, near-ring is skipped (quadrants cover full radius)
- **Single-flight request deduplication:** `_in_flight: dict[str, asyncio.Task]` at module level for `get_neighborhood_3d`. Use `asyncio.shield()` for shared tasks. Key: `{pand_id}:{rd_x:.0f}:{rd_y:.0f}`. Clean up in `finally`
- **LoD 2.2 is mandatory for all buildings** (including neighbors). Sunlight shadow analysis requires accurate roof geometry
- **Cold latency baselines (Feb 17, pre-optimization):** Damrak 1 = 77s/167 buildings, Kerkstraat 10 = 62s/251 buildings. 90%+ of wait time is 3DBAG API latency
- **PDOK Luchtfoto RGB:** `service.pdok.nl/hwh/luchtfotorgb/wms/v1_0`, layer `Actueel_orthoHR`, JPEG format, CC BY 4.0 license


## Session Learnings (2026-02-28)

- **Webhook DB writes must be atomic**: both payment status and entitlement updates in a single transaction. Non-atomic two-step writes risk permanent user lockout if process dies between steps
- **HTTPException outside aiosqlite.Error try blocks**: broadening except clauses later would silently convert 404->503. Structure: separate try/except per DB call with logic between them
- **Severity delegates to canonical function**: PDF export _severity_for_score delegates to scoring.py severity_from_score. Never re-implement the 70/40/20 thresholds
- **Duplicated code extracted**: _RISK_FAILURE_MESSAGES (frozenset), _property_warnings_cache_key() (helper), both extracted from two inline copies in address.py
- **CancelledError handling**: catch BaseException, not just Exception, for asyncio.CancelledError in gather callbacks (e.g., crime stats pop_task)
- **SlowAPI decorator order depends on response: Response param**: @limiter.limit as outer when no Response param, inner when Response is present. Two valid patterns exist -- do not blindly standardize
- **limiter.reset() in test fixtures**: prevents cross-test rate limit pollution for rate-limited endpoints
- **patch.object(settings, field, value) is sufficient** for pydantic-settings singleton patching -- no ExitStack needed
- **Test baseline**: 629 tests (post-Sunlight v2 weather service, 2026-03-01)

## Session Learnings (2026-03-03)

- **Silent PDF section omission violates graceful degradation**: PDF sections guarded with `if data is not None and data.available` silently disappear. Every section must have an explicit "unavailable" fallback (bilingual message)
- **WCAG contrast for chart accent dark**: `C_ACCENT_DARK` was `#1C8C83` (4.09:1 on white, fails AA). Changed to `#187E76` (4.90:1, passes). Always verify chart text colors against actual backgrounds
- **`skipif` must test actual capability**: `shutil.which('lualatex')` passes when binary exists but can't compile (missing fonts). Use robust probe that compiles a minimal document
- **`hasattr()` guard before attribute-based `skipif`**: `@pytest.mark.skipif(mod.attr is None, ...)` causes collection-time `AttributeError`. Use `not hasattr(mod, 'attr') or mod.attr is None`
- **Monkeypatch target must match import site**: Patching `pdf_export.render_chart_assets_parallel` when function lives in `latex_env.py` silently does nothing
- **Page-specific PDF assertions are fragile**: Asserting content on specific page indices couples tests to layout. Search full PDF text: `"
".join(p.extract_text() for p in reader.pages)`
- **LaTeX Jinja2 delimiters**: Templates use `<< >>` for variables, `<% %>` for blocks, `<# #>` for comments to avoid LaTeX syntax conflicts
- **Benchmark tests are flaky in CI/hooks**: Timing-sensitive tests fail on busy machines. Exclude from pre-commit hooks via `addopts = "-m 'not visual and not benchmark'"`
- **pytest markers must be registered**: Custom markers (`visual`, `benchmark`) in `pyproject.toml` `[tool.pytest.ini_options]` to avoid `PytestUnknownMarkWarning`

## Session Learnings (2026-03-05) — P0 Sunlight Pipeline Fix

- **`cache_set_verified` for confirmed cache writes**: New function in `cache/redis.py` returns boolean confirming whether cache write succeeded. Sunlight submission endpoint includes `"cached": true/false` in response so frontend can detect cache write failures.
- **`build_risk_comparisons()` ordering relative to sunlight wait**: Comparison charts must be built AFTER `_await_sunlight_for_export()` resolves, not before. If built before and a late cache hit arrives, `sunlight_score` becomes non-None but comparison data has stale address rows — the stripping guard (`if sunlight_score is None`) becomes wrong.
- **`_resolve_sunlight_score` backward-compatible fallback**: New helper tries `card.score` first, then falls back to `normalize_sunlight_score(card.winter_hours)`. Handles cached cards written before the score field was added.
- **Backend wait infrastructure was correct**: `_await_sunlight_for_export()` polling every 250ms for 20s worked perfectly. All P0 failures were upstream (frontend submission failures). Resist urge to "fix" correct components when bug is elsewhere.
- **Sunlight consistency tests as data-model unit tests**: `test_sunlight_consistency.py` tests address-row stripping logic using `RiskComparisonsResponse` model instances directly, without HTTP or database setup.

## Session Learnings (2026-03-04)

- **LaTeX \IfFileExists renders both branches in template string**: Python-level \includegraphics search always matches because Jinja2 renders the full template including both the PNG and \BrandFallback branches. The conditional is evaluated by LuaLaTeX at compile time. Name tests honestly as "template structure" checks, not "renders PNG instead of fallback"
- **Logo resolution for print: 300 DPI minimum at target dimensions**: The original 250x50px logo at 22mm width yielded ~289 DPI (borderline). Regenerated at 1440x288px for 28mm width (~1306 DPI). Formula: DPI = (pixels / mm) x 25.4
- **\headheight must accommodate logo height + padding**: Increasing logo from 5.5mm to 7mm required \headheight bump from 16pt to 18pt. Rule of thumb: headheight_pt >= (logo_height_mm x 2.835) + 2pt
- **Pillow is a de facto dependency but not in pyproject.toml**: Used in chart_renderer.py and pdf_export.py. Tests using Pillow need skipif guards for clean CI environments
- **Pre-existing test failures from uncommitted changes confuse verification**: Other tasks' uncommitted edits to pdf_export.py/dossier.tex.j2 caused failures unrelated to current work. Run only the task-specific test file for verification, not the full suite
- **Subagent-driven 3-stage pattern (implement -> spec review -> code quality review) catches ~5 issues per task**: Misleading test names, missing dependency guards, imprecise assertions, inaccurate comments. The two review stages add real value

## Session Learnings (2026-03-06) — P2 Dossier Audit Fixes

- **PDOK BRT to Luchtfoto migration**: `_fetch_location_map()` now uses `settings.luchtfoto_wms_base` with layer `Actueel_orthoHR` (JPEG). BRT `standaard` layer endpoint retired. Attribution: "PDOK Luchtfoto (CC BY 4.0)"
- **Crime score threading pattern**: `crime_score = tier_b.crime.score if tier_b and tier_b.crime else None` — extract once at top of generator, pass to all downstream functions (`_generate_executive_summary`, `_build_risk_cells`, `_draw_cover_page`, `_draw_checklist_page`, livability chart). Prevents silent omission
- **Viewing questions bifurcation**: `_should_include(score)` for flagged categories (score < 70), `_is_good(score)` for confirmation questions (score >= 70). Both generate `QuestionCategory` entries with appropriate severity
- **Risk grid dynamic columns**: `grid_cols = 5 if len(cells) == 5 else 4` — accommodates variable crime data presence in risk summary strip
- **None-safe bar chart rendering**: `min(value or 0, 100)` for `fill_w` + `str(value) if value is not None else "—"` for score display. Missing guards cause TypeError on None values
- **Crime-only lollipop chart as graceful degradation**: When livability data unavailable but crime data exists, render crime-only chart (livability=None, crime=score) instead of nothing

## Session Learnings (2026-03-07) — P2 Dossier Implementation (PR #20)

- **`_draw_notes_section()` helper with page guard**: Extracted from inline while loop. Constants: `_NOTES_RULE_COUNT = 4`, `_NOTES_RULE_SPACING_MM = 8.0`, `_NOTES_SECTION_REQUIRED_MM = 47.0`. Uses `_ensure_page_space()` to avoid orphaned section headers
- **Text color reset before section headings**: `pdf.set_text_color(*SLATE)` before each section title. fpdf2 inherits text color state — if a prior section set red for risk, the next heading would be red without explicit reset
- **`_ensure_page_space(pdf, required_mm)` pattern**: Check `pdf.h - pdf.b_margin - pdf.get_y() < required_mm` before rendering; `pdf.add_page()` if insufficient. Document the budget arithmetic in a comment on the required_mm constant
