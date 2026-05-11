# CLAUDE.md -- buurt-check

Mobile-first web app helping expats and first-time homebuyers in the Netherlands avoid bad property purchases. User pastes an address, gets an evidence-backed dossier with risk cards, 3D context, neighborhood stats, and a viewing briefing.

## Tech stack

| Layer | Stack |
|-------|-------|
| Backend | Python 3.12, FastAPI, httpx (async), Pydantic v2, pydantic-settings, Redis, aiosqlite, stripe, app-store-server-library, sentry-sdk[fastapi], scipy, fpdf2 |
| Frontend | React 18, TypeScript 5, Vite 6, Framer Motion, Three.js, Leaflet, SunCalc, i18next, @capacitor/core, @sentry/react |
| Styling | Plain CSS with design tokens ("Polar Frost"). NO Tailwind, NO CSS-in-JS |
| Testing | pytest + pytest-asyncio (backend), Vitest 4.x + Testing Library (frontend), Playwright (E2E) |
| Linting | ruff (backend), TypeScript strict mode via `npm run build` (frontend) |

## Project structure

```
backend/           # FastAPI API aggregator + SQLite entitlements (no user accounts)
  app/api/         # Route handlers (address.py, reports.py, billing.py, dependencies.py)
  app/services/    # Business logic (bag, risk_cards, cbs, scoring, pdf_export, livability, etc.)
  app/db.py        # SQLite init + connection helpers (report/payment storage)
  app/models/      # Pydantic response models
  app/cache/       # Redis with circuit breaker
  app/config.py    # pydantic-settings (BUURT_* env prefix)
  tests/           # pytest (629+ non-live tests)
frontend/          # React + Vite + TypeScript
  src/components/  # All UI components (dossier cards, navigation, search, shortlist)
  src/styles/      # tokens.css (195 CSS custom properties), satoshi.css (font)
  src/services/    # api.ts, entitlement.ts, firstDossier.ts, shortlist.ts, theme.ts
  src/config/      # shared runtime config (e.g. pricing.ts)
  src/i18n/        # en.json + nl.json (~380 keys each, parity enforced)
  src/types/       # TypeScript interfaces mirroring backend models
docs/              # Design specs, plans, palette, UI principles
ios/               # Capacitor iOS wrapper (Swift, Xcode project)
scripts/           # Build, deployment, and release readiness scripts
```

## Commands

```bash
# Backend
cd backend && uvicorn app.main:app --reload --port 8000
cd backend && pytest -x -q -m "not live"   # CI tests (629+ baseline)
cd backend && ruff check .                  # MUST pass before commit
# Payment features require BUURT_STRIPE_SECRET_KEY, BUURT_STRIPE_WEBHOOK_SECRET,
# BUURT_STRIPE_PRICE_CENTS, BUURT_BASE_URL, BUURT_DATABASE_PATH.

# Frontend
cd frontend && npm run dev                  # Dev server (proxies /api to :8000)
cd frontend && npm run build                # MUST pass before commit (strict TS)
cd frontend && npm run test                 # Vitest (867+ baseline)
```

## Architecture decisions

- **Data architecture**: External neighborhood/property data stays stateless + cached in Redis; monetization state (report records, payment status, entitlements) lives in SQLite
- **API routing**: Address intelligence lives in `api/address.py`; monetization flows in `api/reports.py` + `api/billing.py`; entitlement checks are centralized in `api/dependencies.py`
- **0-100 risk scoring**: Backend normalizes raw values via `scoring.py`. 4-level severity: good (70-100), moderate (40-69), poor (20-39), critical (0-19)
- **State management**: App-level `useState` in `App.tsx`. No Redux/Zustand. Screen routing via `activeScreen`
- **i18n from day one**: All strings via `t()`. NL default, EN secondary. Warning codes from backend: `t('feature.warning.${code}', code)`

## Product principles

1. **Consequences over data** — translate every number into "what does this mean for me"
2. **5-8 indicators max per section** — curate aggressively, no dashboard spam
3. **Bilingual by default** — NL default, EN secondary, not bolted on later
4. **Disclaimers mandatory** — always cite source, date, and limitations
5. **Graceful degradation** — if a data source fails, show "unavailable", never crash the dossier

## Development conventions

- **Commits**: Conventional (`feat:`, `fix:`, `docs:`, `chore:`)
- **Branches**: `main` (stable), `feat/<description>` for features
- **Error handling**: Warning codes from backend, i18n keys on frontend
- **Caching**: Never cache empty/error responses. Cache keys must include ALL params affecting response
- **Config**: All external URLs in `config.py`. No hardcoded URLs in services
- **Coordinates**: EPSG:28992 (RD New) everywhere. BAG IDs: 16 digits, validate `^[0-9]{16}$`
- **Quality gates**: `ruff check` + `pytest` + `npm run build` + `npm run test` before any commit

## Anti-patterns — never do these

- `CQL_FILTER` for BAG WFS (silently ignored) — use OGC XML Filter
- `requests` library — use `httpx` async
- CSS `!important` on canvas dimensions — breaks Three.js `renderer.setSize()`
- `--color-accent` (#0D9488) as text on light bg — use `--color-accent-text` / `--color-accent-hover` (#00685F); tertiary warm accent is #C36D4B; full palette in `docs/palette.md`
- `react-three-fiber` or `drei` — plain Three.js only
- React Query / Zustand / Redux — useState + props
- Bare `= []` in Pydantic models — use `Field(default_factory=list)`
- `sampled_at` as `source_date` fallback — let it be `None`
- Infer 3D viewer loading from `buildings.length === 0` — use explicit `loading` prop from parent
- Frontend-only gating for premium data — always enforce backend entitlement checks (`require_entitlement`) on premium endpoints
- Blocking Stripe SDK calls inside async route handlers — wrap provider SDK calls in `asyncio.to_thread()`
- `Query(...)` in dependencies requiring custom HTTP errors — use `Query(None)` + explicit validation for 402 payment-required flows
- Divergent frontend/backend price env vars — keep backend as source of truth via `GET /api/pricing`

## Content visibility rules

### Scope definitions
- **Frontend viewer**: on-screen app experience before purchase
- **Full Dossier/PDF**: paid downloadable report

### Premium-only content (PDF only, NOT in viewer)
- Property Warnings (foundation risk, erfpacht, VvE, asbestos awareness)
- Soil Contamination Check (lead pipe, Bodemloket link)
- Shadow Snapshots
- SunlightRiskCard (scored sunlight analysis)
- Direct sun / clear-sky visibility (heatmap overlay + legend)
- Foundation Risk

These items MUST remain in the Full Dossier/PDF output. They must NOT be rendered in the interactive dossier viewer. The viewer no longer keeps separate premium-only React components for them; export flows consume the underlying fetched data directly.

### Risk cards layout
- Risk cards (RiskTilesGrid) appear **once** at the top of the dossier, in the house phase after AddressHeader.
- No duplicate risk cards blocks exist elsewhere in the dossier.
- Tap-to-expand RiskDetailView is accessible from the top-positioned tiles.

## Risk card contract

Every frontend risk card must have: (1) score 0-100 + severity, (2) plain-language meaning, (3) viewing questions, (4) source + date. The app frontend renders only Noise, Air, and Climate risk tiles; tap opens detail with comparison chart (address vs city vs NL vs WHO). Sunlight analysis stays paid-report/PDF only and must not be rendered as a frontend risk tile or detail view.

## Reference docs (don't embed, just read when needed)

- `docs/design-prd.md` — "Polar Frost" design direction
- `docs/design-spec.md` — Pixel-level visual spec
- `docs/palette.md` — Color palette with WCAG requirements
- `docs/ui-principles.md` — Mobile UX principles
- `docs/sunlight-prd.md` — Sunlight v1 product requirements
- `backend/CLAUDE.md` — Backend-specific conventions
- `frontend/CLAUDE.md` — Frontend-specific conventions
- Data source endpoints + API quirks → already in auto-memory (MEMORY.md)
- Historical session learnings → already in auto-memory (MEMORY.md)

## Session Learnings (2026-02-25) � Resilience and Polish

Key patterns from the resilience hardening session, documented in full in `frontend/CLAUDE.md`:

- **Graceful degradation is not optional**: Every async section needs `error + onRetry` props. Silent swallowing = broken UX. Components fixed this session: NeighborhoodViewer3D, ViewingChecklist, RiskDetailView, BuildingFactsCard.
- **Three race conditions to handle in every re-entrant async handler**: (A) AbortController for duplicate API chains, (B) boolean guard for double-tap on sync-looking ops, (C) activeScreenRef for post-await screen staleness.
- **All timer IDs live in refs**: setTimeout/setInterval/rAF IDs stored in useRef, cleared in cleanup AND on address reset. Missing cleanup causes memory leaks and phantom callbacks.
- **Skeleton layout must mirror loaded layout exactly**: Mismatches cause layout shift. Validate at 375px and 360px widths.
- **Hardcoded hex in components is a recurring bug**: Always use var(--color-*) tokens. Scan new components for hex literals before committing.
- **Deep-link failures need toast + redirect**: URL with ?lookup=... must handle PDOK failure gracefully: toast then navigate to search, not a broken dossier screen.



## Session Learnings (2026-03-03) — PDF Dossier Epics 1-4 + Assessment Discipline

Key patterns from 5 sessions assessing and fixing PDF dossier diagnostic Epics 2-4:

- **Assessment without test execution has >50% false-positive rate for delivery verdicts**: Static code review (by Claude or Codex) gave PASS/PARTIAL verdicts that test execution revealed as 19/23 failures. Never assess delivery without running tests.
- **Uncommitted working tree changes are dangerously unreliable assessment targets**: Code read from working tree may disappear when other sessions or operations clean it. Always verify code state with `git status` and pin assessments to a specific commit.
- **Prerequisite epics must be verified as committed before assessing dependent epics**: Epic 3 depended on Epic 2 deliverables that were never committed. Assessment was meaningless without verifying prerequisites first.
- **Document numbering ambiguity causes assessment confusion**: The diagnostic uses overlapping numbering (Part B defect categories E1-E11 vs Part E-H implementation epics EPIC 1-4). Always specify Part or full title when referencing items.
- **Git stash hides untracked files from all standard workflows**: `git stash -u` captures untracked files invisible to `git diff`, `git log`, `git ls-tree`. Check `git stash list` when files seem missing.
- **Subagent CSS property analysis has significant false-negative rate**: Explore subagents reading grep snippets can miss properties present later in the same CSS block. Always verify subagent CSS claims by reading full rule blocks directly.
- **Three-round assessment self-correction**: Quick scan overestimates, subagent deep-dive overcorrects, direct verification reaches accurate conclusion. Skip subagents for CSS property checks.
- **Silent PDF section omission violates graceful degradation**: When sections guard with `if data is not None`, they silently disappear. Every PDF section must have an explicit "unavailable" fallback.
- **Page-specific PDF assertions are fragile**: Asserting content on specific page indices couples tests to layout. Search full PDF text instead.
- **`skipif` guards must test actual capability, not just binary presence**: `shutil.which('lualatex')` passes when lualatex exists but can't compile (missing fonts). Use a robust probe that actually compiles a minimal document.
- **Feature branches become stale when work merges via different route**: During rebase, all commits had add/add conflicts because identical work was already in main from another branch. `git merge-base --is-ancestor` is the definitive check for stale branches.
- **Context window exhaustion on large review+fix sessions**: Combine adversarial review + implementation in one session risks hitting limits. Consider splitting into review session + fix session.

## Session Learnings (2026-03-01) — Sunlight v2 + PDF Diagnostic

Key patterns from 13 sessions implementing Sunlight v2 Phases 3-6, adversarial code reviews, and PDF dossier quality audit:

- **Deterministic timestamps for solar computations**: Perez luminance weighting uses sun altitude — `new Date()` at night zeroes SVF entirely. Always use a fixed summer noon reference (June 21 12:00 local) for Perez weighting.
- **UTC/local timezone trap in weather alignment**: `getUTCHours()` is mandatory for extracting minutes from ISO date strings. Local extraction drifts 1-2 hours with DST.
- **Codex adversarial review sandbox limitation**: Codex can't execute `npm run test` or `pytest` in its sandbox. This inflates false-negative rate to ~30-50%. Always cross-verify Codex "FAIL" verdicts with actual test runs.
- **Concurrent sessions modify working tree mid-review**: Another session can fix bugs during a long review, causing stale findings. Always verify findings against HEAD before acting on them.
- **Untracked files masquerade as missing**: `git diff` only shows tracked file changes. New files (`??` in git status) won't appear — check `git status` not just `git diff`.
- **Phase scope bleed causes test failures**: Phase 5 work (~60%) leaked into Phase 4 sessions. Keep implementation sessions strictly scoped to one phase.

## Session Learnings (2026-03-04) — PDF Dossier Logo Quality

Key patterns from the PDF dossier logo fix session (subagent-driven development):

- **LaTeX \IfFileExists is compile-time, not Jinja2 render-time**: Both branches appear in rendered template strings. Tests searching for \includegraphics always match both PNG and fallback. Name tests as "template structure" checks, not behavioral assertions.
- **Print asset DPI floor is 300 at target dimensions**: The 250x50px logo at 22mm was borderline (~289 DPI). Regenerated to 1440x288px at 28mm width (~1306 DPI). Formula: DPI = (pixels / mm) x 25.4.
- **Dirty working tree causes false test failures during task verification**: Uncommitted edits from other tasks to shared files (pdf_export.py, dossier.tex.j2) cause unrelated test failures. Run only the task-specific test file when the working tree has other pending changes.
- **Pillow is an undeclared production dependency**: Used in chart_renderer.py and pdf_export.py but missing from pyproject.toml. Tests must use skipif guards until it is declared.
- **3-stage subagent pattern adds measurable review value**: implement -> spec review -> code quality review caught 5 issues per task that the implementer missed (misleading names, missing guards, imprecise assertions).

## Session Learnings (2026-03-05) — P0 Sunlight Pipeline Fix

Key patterns from the P0 sunlight pipeline fix session (SVF WebGL crash + export button gating):

- **Three.js r182 `readRenderTargetPixels()` requires explicit `activeCubeFaceIndex` for `WebGLCubeRenderTarget`**: Omitting the face index parameter crashes in the `finally` block (`bindFramebuffer()` receives array of framebuffers instead of single one). This crashed both SVF Worker AND main-thread fallback, silently failing for every address.
- **Silent errors compound multiplicatively**: 5 independent silent failure modes (WebGL crash swallowed by Worker, Worker failure swallowed by `.catch(() => undefined)`, entitlement guard silent return, race condition with no timeout, DEV-only logging) individually survivable but combined produced zero output while appearing functional.
- **`.catch(() => undefined)` on fire-and-forget async is a critical anti-pattern**: Sunlight submission swallowed all errors silently — the pipeline appeared to work with no console errors while the backend cache was permanently empty.
- **DEV-only logging gates hide production errors**: `if (import.meta.env.DEV)` on critical failure logs (Worker crashes, analysis failures) made production debugging impossible. Critical errors must always log.
- **`onBeforeGenerate` hook pattern decouples pre-export logic from export component**: Rather than putting sunlight submission inside `ExportBottomSheet`, the hook lets `App.tsx` own the lifecycle while the sheet just awaits a promise. Keeps export component testable in isolation.
- **Safety timeout + unavailable state = UX escape hatch**: Without 180s timeout, a crashed sunlight computation leaves the export button disabled forever. Pattern: after reasonable duration, set "unavailable" flag so export enables and PDF renders "Data gap" gracefully.
- **`build_risk_comparisons()` must run AFTER sunlight wait**: Building comparisons before the wait causes timing-dependent data inconsistency — late cache hit updates score but comparison data retains stale rows.
- **A 2-line root cause can require a 27-file, 2686-line fix**: The SVF crash was 2 lines, but properly fixing the pipeline required robust submission with dedup/retry, export gating, pre-export hooks, safety timeouts, logging, backend cache verification, comparison ordering, iOS workarounds, and comprehensive tests.
- **Resist fixing the correct component**: Backend wait infrastructure (`_await_sunlight_for_export()` polling every 250ms for 20s) was correct from the start. All failures were upstream. Investigate where data disappears, not where it is expected.
- **Per-template export timeouts**: `full_dossier` needs 180s (sunlight computation + rendering), `quick_brief` needs 90s. Previous hardcoded 30s was insufficient.
- **iOS PDF download workaround**: WebKit ignores `download` attribute on blob URLs. Detect iOS UA and fall back to `window.open()` with `noopener,noreferrer`.

## Session Learnings (2026-03-06) — P2 Dossier Audit Fixes

Key patterns from the P2 dossier audit fix session (PDF rendering, viewing questions, API endpoint retirement):

- **PDOK BRT Achtergrondkaart WMS retired**: Static map tile endpoint switched from BRT (`standaard` layer, PNG) to Luchtfoto (`Actueel_orthoHR` layer, JPEG, CC BY 4.0). Config key: `luchtfoto_wms_base`.
- **Viewing questions for ALL risk categories, not just flagged**: Good-scoring categories (score >= 70) now get single confirmation questions. Previously these categories were silently omitted from the viewing checklist.
- **None-safe PDF chart rendering**: Bar chart `fill_w` needs `min(value or 0, 100)` guard. Score display needs `str(value) if value is not None else "—"`. Missing guards cause TypeError on None values.
- **Climate source attribution uses scenario text, not "date unknown"**: Climate risk data uses RCP/SSP scenarios, not dated observations. "Date unknown" is misleading for scenario projections.

## Session Learnings (2026-03-07) — P2 Dossier Implementation (PR #20)

Key patterns from subagent-driven P2 dossier implementation session:

- **Background task output files unreliable on Windows**: Output files may be 0 bytes even after successful completion. Subagents reading background task output via `cat` enter infinite retry loops. Prefer foreground test execution or use `TaskGet` tool.
- **Subagent retry loops are the dominant subagent failure mode**: When verification is unreachable (unreadable test output, broken paths), subagents retry the same approach indefinitely instead of failing fast. Subagent prompts must include explicit failure/escalation instructions with a retry cap (e.g., "if you cannot read test output after 2 attempts, commit and report the issue").
- **Windows bash strips backslashes from unquoted paths**: `cat C:\Users\...` becomes `cat C:Users...`. Always quote Windows paths in bash or use Unix-style `/c/Users/...` paths.
- **Dirty working trees require selective staging via patch files**: When 13+ files have unrelated changes, use Python to parse `git diff` into hunks, write patches to `tempfile.mktemp()`, and `git apply --cached`. Verify with `git diff --cached --stat`.
- **`_ensure_page_space()` pattern for PDF section guards**: Check remaining page height before rendering a section; add page if insufficient. Budget = sum of all sub-elements + margin. Document the arithmetic in a comment.
- **Text color reset before each PDF section heading**: fpdf2 inherits text color state across calls. Always `set_text_color(*SLATE)` before section headings to prevent color leakage from prior rendering.
- **Verify audit state before dispatching subagents**: Multi-session audit documents may show all items as PASS. Check whether work actually remains before launching the subagent-driven development workflow.

## Session Learnings (2026-03-18) — Android Google Play Deployment

Key patterns from the Android TWA + Google Play Billing integration session:

- **Two payment paths require separate backend routes**: Stripe (web) and Google Play Billing (Android) are distinct providers. The Google Play verify endpoint (`POST /api/billing/google-play/verify`) handles purchase token → entitlement unlock, completely separate from Stripe webhook flow.
- **Purchase token deduplication is mandatory**: `get_report_by_provider_payment_id(purchase_token)` must run before unlock. A token already linked to a different report returns 409 — prevents one purchase unlocking multiple reports.
- **Google Play purchase state enum**: `0` = active/valid, `2` = pending. Reject pending purchases (409). Any other non-zero state is also invalid.
- **Consume after unlock, not before**: Call `consume_product_purchase()` only after `unlock_report()` succeeds. Consume failure is non-fatal — entitlement remains active. Prevents double-unlock while tolerating consume API hiccups.
- **Google Play OAuth token caching requires double-check locking**: `asyncio.Lock` + expiry check before AND after acquiring the lock prevents redundant token refreshes under concurrent requests. 60-second buffer before expiry avoids using tokens that expire in flight.
- **401 on Google Play API calls should invalidate token cache and retry once**: `_reset_cached_token()` + re-fetch + re-request handles token expiry race condition at the API layer.
- **TWA requires `.well-known/assetlinks.json` served from the domain**: Digital Asset Links file must be accessible for Android to verify the TWA binding. Include it in the Vite PWA `includeAssets` list so it is precached by the service worker.
- **`VitePWA` with `injectManifest` strategy**: Use `strategies: 'injectManifest'` for fine-grained caching control. The `sw.ts` file receives `self.__WB_MANIFEST` injected by Workbox at build time. Set `manifest: false` when `manifest.json` is managed separately.
- **Service worker routing order matters**: Register specific routes (legal pages, API deny) BEFORE the catch-all `NavigationRoute`. Workbox evaluates routes in registration order.
- **`isPlayBillingContextAvailableSync()` for routing, `isPlayBillingReady()` for actual use**: Synchronous check (`window.getDigitalGoodsService` exists) is safe for conditional rendering. Async check (fetches product details from Play) is needed before showing prices.
- **Store pending report ID before `paymentRequest.show()`**: The Play Billing sheet blocks the thread. Store report ID in `sessionStorage` before calling `show()` so a page reload mid-flow can recover it. Clear on success and on abort.
- **`SimpleNamespace` for lightweight mock return values in backend tests**: Instead of constructing full dataclasses in test patches, `SimpleNamespace(purchase_state=0, consumption_state=0)` is terser and less fragile to schema changes.
- **Google Play service account credentials: file OR inline JSON**: Support both `google_play_service_account_file` (path) and `google_play_service_account_json` (inline JSON) in config. Tests use inline JSON; production uses a mounted file.
- **Backend packaging artifacts (`.dist-info`, `wheel/`) must be gitignored**: `bdist.linux-x86_64/` directory from `pip install -e .` gets picked up by git. Add to `backend/.gitignore` immediately when they appear.

## Session Learnings (2026-03-24) — Apple App Store + Vercel + CI

Key patterns from the Apple App Store deployment, Vercel hosting, CI stabilization, and privacy policy sessions:

### Apple App Store Billing Integration
- **Three-provider billing abstraction**: `billingProvider.ts` resolves `stripe | google_play | apple_app_store` at runtime. Priority order: Apple (Capacitor iOS) > Google Play (Digital Goods API) > Stripe (web fallback). Sync check for conditional rendering, async check for actual purchase flow.
- **Capacitor native bridge pattern**: `AppleBillingBridge.swift` is a `CAPPlugin` exposing StoreKit methods. `purchaseProduct` must run on `@MainActor`. All StoreKit-dependent methods need `guard #available(iOS 15.0, *)` since `Product.purchase()` requires iOS 15+.
- **Server-side JWS verification is two-step**: Verify device-side `signedTransactionInfo` locally via `SignedDataVerifier`, THEN fetch authoritative transaction from Apple Server API via `get_transaction_status()`. Never trust device-side JWS alone (could be stale or replayed).
- **`asyncio.to_thread()` for all blocking SDK calls**: `AppStoreServerAPIClient.get_transaction_info()` is synchronous — must wrap in `asyncio.to_thread()`. Same pattern as Google Play and Stripe SDK calls.
- **`lru_cache(maxsize=1)` for Apple client singletons**: Both `_build_signed_data_verifier()` and `_build_api_client()` cached with `reset_apple_app_store_clients()` for test teardown.
- **Apple root certificates bundled as binary assets**: Three `.cer` files at `backend/app/certs/apple/`. Loaded once, cached. Required for JWS chain-of-trust validation.
- **App Store Server Notifications v2 for refunds**: `POST /api/billing/apple-app-store/notifications` handles `REFUND` and `REVOKE` types. Use `rawNotificationType` (string) over typed enum to avoid mapping failures on unknown types.
- **`rawEnvironment` over `.environment.value`**: Same pattern for environment field — raw string more resilient than enum.
- **Apple `price` field is in millis**: `decoded.price` returns integer in milliunits (2990 = 2.99 EUR). Differs from Stripe (cents) and Google Play (micros).
- **PDF share sheet for iOS**: `presentPdfShareSheet` converts base64 blob to temp file, presents `UIActivityViewController`. Temp file cleaned up in `completionWithItemsHandler`. Bypasses WebKit blob URL limitation.
- **`cap sync ios` fails on Windows**: Catch error, fall back to `cap copy ios`. CocoaPods and archive steps require macOS.
- **Xcode project normalization after Capacitor generation**: `update-ios-wrapper.mjs` post-processes `project.pbxproj` to force bundle ID, deployment target (15.0), device family, team ID, entitlements, version numbers. Capacitor defaults don't match production requirements.
- **Release readiness script validates 30+ settings**: `check-ios-release-readiness.mjs` checks Xcode settings, entitlements, AASA file, env vars, certificates, Info.plist, Capacitor config, bundle ID consistency. Supports `--strict` for CI.

### Vercel Deployment
- **7 commits in 30 minutes = cost of deploying without local reproduction**: Each commit was a CI experiment. `vercel build` locally would have caught issues faster.
- **Over-engineering before understanding constraint**: Built 3-script Vercel routing system (`vercel-target.mjs` inspecting Vercel env vars) then immediately deleted it. Simple copy of frontend dist to `dist/` + `public/` was sufficient.
- **`npm exec` behaves differently in Vercel**: `npm exec -- node ./scripts/foo.mjs` worked locally but not in Vercel. Fix: spawn `node` directly via `process.execPath` with resolved absolute path.
- **Monorepo Vercel output directory confusion**: Vercel expects output in predictable location. Root `package.json` + `frontend/package.json` needed explicit routing. Ended with root `build-root-frontend-app.mjs` that copies frontend dist.
- **Root `/public/` directory must be gitignored**: Build script copies frontend dist there for Vercel; don't commit it.

### CI Pipeline Fixes
- **Undeclared dependencies surface in CI first**: `matplotlib`, `tzdata`, `PyMuPDF` all worked locally (transitive deps or platform-provided) but failed in clean CI. Always verify `pip install -e ".[dev]"` in a fresh virtualenv.
- **`tzdata` is a hidden Linux-only dependency**: Windows/macOS have system timezone databases. Linux minimal CI images may not. Python 3.12 falls back to `tzdata` PyPI package.
- **TinyTeX to apt TeX Live for CI**: TinyTeX lighter but requires network fetches via `tlmgr`. `apt`-based install is deterministic. For CI, determinism wins. Controlled by `BUURTCHECK_TEX_INSTALL_MODE` env var.
- **Dual TeX install modes**: `install-texlive.sh` supports both `apt` (CI) and `tlmgr` (local dev with TinyTeX) via env var.

### Privacy Policy Page
- **Static HTML, not React route**: Store review bots don't execute JavaScript. `frontend/public/privacy.html` with own `legal.css` loads independently.
- **Three-provider privacy coverage**: Explicitly names Stripe (web), Google Play Billing (Android), Apple In-App Purchase (iOS) as separate payment data processors.
- **Hash-based app links from legal pages**: Navigation uses `/#/search` to return to SPA, matching hash routing pattern.

### Cross-Cutting Patterns
- **Symmetric provider architecture is predictable but verbose**: Each new billing provider requires ~300 lines backend + ~200 lines frontend + native bridge. Verify/unlock/consume lifecycle and dedup pattern identical across all three.
- **`quoteArg()` + `cmd.exe` spawn pattern duplicated across 5+ scripts**: Build, deploy, and iOS scripts all have near-identical Windows cmd.exe spawn wrappers.
- **Capacitor peer dependencies must be in frontend package.json**: `@capacitor/core` is a peer dep of plugins. Even though it is in root monorepo `package.json`, frontend imports (`appleBilling.ts`) need it in their own dependency tree.
- **Store pending state before native payment sheet**: Both Play Billing and StoreKit sheets block the thread. Store report ID in localStorage/sessionStorage before calling `show()`/`purchaseProduct()`. Clear on success and abort. Recover on page reload.


## Session Learnings (2026-03-26 to 2026-04-02) — Post-Checkout Recovery + Database Abstraction

Key patterns from 10+ iterative commits fixing post-Stripe checkout dossier recovery, database abstraction, and SVG rendering:

### Post-Stripe Checkout Recovery (10 commits)
- **Post-checkout state loss is the core problem**: After Stripe redirect, the app loses all in-memory state (shadow snapshots, sunlight data, 3D viewer). The `handleAddressSelect` flow hits 404 on `checkEntitlement` (webhook not yet processed), falls through to `createShortReport`, overwriting the paid report.
- **`recoveryMode` parameter pattern**: Pass `recoveryMode: 'checkout_return'` through address selection so 404s on entitlement checks are treated as "not yet processed" rather than "doesn't exist," preventing `createShortReport` fallback.
- **`handledCheckoutParamsRef` deduplication gate**: A ref tracks which checkout params have been processed, preventing stale URL params from re-triggering verification on re-renders.
- **Transient sessionStorage for cross-reload state**: Store checkout return context (report ID, VBO ID, session ID) in `sessionStorage` before URL scrubbing. Clear on all three terminal outcomes: success, definitive failure, retry exhaustion.
- **URL scrubbing via `history.replaceState`**: Strip billing query params immediately after capture to prevent stale-parameter replay. Use `replaceState` (not `pushState`) to avoid polluting browser history.
- **Gate recovery on shadow snapshot availability**: Dossier export requires shadow snapshots. Don't auto-trigger export if shadows haven't been computed yet — let the user manually trigger after data loads.
- **Stripe metadata is a wrapper object, not a dict**: `session.metadata` may not support `.get()`. Use accessor functions (`_stripe_field`) for reliable field extraction.

### Database Abstraction
- **libsql/Turso `cursor.rowcount` is unreliable for UPDATEs**: Returns non-integer values. Fallback pattern: if `rowcount` is not `int >= 0`, do a SELECT verification query after the UPDATE.
- **Dual database support (aiosqlite + libsql)**: `BUURT_TURSO_DATABASE_URL` + `BUURT_TURSO_AUTH_TOKEN` env vars switch to Turso. Empty strings = aiosqlite fallback (essential for Windows dev where libsql doesn't build).

### SVG Building Silhouettes (Mar 29)
- **SVG Y-axis increases downward**: Subtracting from `body_top` floats elements above the roof, not below. Recurring coordinate-direction trap.
- **Complex SVG paths render as blobs at small sizes**: Composite geometric primitives (separate rect + polygon per feature) are required for readable silhouettes.
- **Curved gable shapes (klokgevel, halsgevel) read as mosque domes**: Restrict to unambiguous macro-shapes for cultural recognition.

### CSS + Frontend Patterns
- **`position: absolute; top: 100%` resolves against nearest positioned ancestor**: Can be a `sticky` parent rather than intended `relative` parent. Fix: nest dropdown inside correct positioning context.
- **Flex height propagation requires `flex: 1` at every chain level**: Not just the outer container.
- **`pointerDown` over `mouseDown` for mobile**: Touch events don't fire `mouseDown`. Use `pointerDown` with `pointerType: 'touch'` and `isPrimary: true`.
- **Price format must go through i18n**: Hardcoded `3,99` outside bilingual system shows Dutch comma format to English users.

### Process Patterns
- **Auto-compound `git reset --hard origin/main` orphans unpushed commits**: Script must verify push success before resetting. Mar 26 compound commit `6db9661` was lost this way.
- **Compound sessions are token-intensive**: Reading large JSONL session files consumes significant context. 3 of 5 automated compound attempts hit rate limits before completing.
- **Assessment without test execution gives "Fully Implemented" for ~93% actual**: Read-only PRD assessment continues to overestimate. Always run tests.

## Session Learnings (2026-04-03) — PDF Comparison Charts + Shadow Layout

Key patterns from 4 commits improving PDF dossier chart rendering and seasonal shadow layout:

### Comparison Chart Rendering
- **Segmented bar pattern for comparison charts**: Bars composed of discrete segments (4mm wide, 2mm gap) instead of solid fills. Provides visual differentiation at print resolution where thin continuous bars merge.
- **Role-based bar coloring**: Address bar = severity-colored, peer = `#3D4947`, national = `#6D7A77`, reference/benchmark = `#EAB308` dashed. Assign role via `CompRow.role` field + label-text heuristic fallback.
- **`_estimate_comparison_chart_height()` before rendering**: Pre-calculate chart height using `multi_cell(dry_run=True)` for text wrapping, then `_ensure_page_space()`. Prevents charts from spilling across page boundaries.
- **`_estimate_pdf_text_height()` utility**: Wraps fpdf2 `multi_cell(dry_run=True, output="HEIGHT")` for consistent height estimation across all chart types.
- **Legend text as trailing line, not separate section**: Chart legend below the bars as small-font descriptive text. Avoids orphaned legend sections.

### Seasonal Shadow Layout
- **`seasonal_facades` layout context**: 6-panel grid (3 seasons x 2 facade views) detected when shadow images contain equinox/summer/winter + front/rear pairs. Renders as labeled 3x2 grid with season row headers.
- **Shadow label tokenization for robust matching**: `_shadow_label_tokens()` splits on `_` and `-`, normalizes to lowercase. Matches "winter_front", "front-winter", "Winter Front" variants.
- **`_shadow_season_key()` + `_shadow_viewpoint_from_raw()`**: Two-level extraction — first check explicit `season`/`viewpoint` fields, then fall back to token matching in `label` strings.
- **Baseline PDF images removed**: Visual regression baselines deleted to avoid binary bloat. Baselines should be regenerated per-environment.
- **`FacadeResult` model imported for shadow data typing**: Shadow analysis pipeline produces `FacadeResult` with structured season/viewpoint metadata, replacing ad-hoc dict structures.

### Post-Checkout Export Gating
- **Removed `bypassPrerequisites` timeout fallback**: Previously auto-generated PDF after 10s if prerequisites (shadows) weren't ready. Now waits indefinitely — user triggers manually when ready. Prevents generating incomplete dossiers.
- **Simpler prerequisite gate**: Single boolean `postCheckoutPrerequisitesReady` replaces complex bypass logic. Reduces ExportBottomSheet state complexity.

## Session Learnings (2026-04-04) — iOS PDF Fonts + Mobile Browser Chrome

Key patterns from 3 commits fixing iOS PDF rendering and mobile browser bottom-bar occlusion:

### iOS PDF Font Compatibility
- **Satoshi `.ttf` assets were actually CFF/OpenType with `.ttf` extension**: Desktop PDF viewers (macOS Preview, Adobe Reader) tolerate CFF fonts embedded as TrueType by fpdf2, but iOS PDFKit does not — text renders as invisible/blank. The file extension was misleading.
- **Solution: generate real glyf-based TrueType from Inter variable font**: `fontTools.varLib.instancer.instantiateVariableFont()` produces static instances with correct TrueType outlines. Font family aliases ("Satoshi", "SatoshiBlack", "SatoshiMedium") kept to avoid cascading PDF template changes.
- **Satoshi removed from matplotlib chart font stack**: Charts now use `Inter > Source Sans 3 > Helvetica Neue > DejaVu Sans`. Satoshi was never reliably available at chart render time.
- **Font format verification test**: `test_pdf_font_compatibility.py` validates that embedded fonts have `glyf` table (TrueType) not `CFF` table (OpenType). Prevents regression to CFF fonts.

### iOS Safe-Area Tab Bar
- **Two-layer tab bar structure for safe-area**: Outer `.tab-bar` handles `padding-bottom: env(safe-area-inset-bottom)` and `min-height` including safe area. Inner `.tab-bar__inner` contains flex layout at fixed `--tab-bar-height`. Single-layer flex + padding causes button distribution into the safe-area padding zone.

### Mobile Browser Bottom Chrome
- **`position: fixed; bottom: 0` is occluded by mobile browser chrome**: Chrome/Safari mobile show dynamic bottom bars (URL bar, toolbar) that cover fixed-bottom elements. `env(safe-area-inset-bottom)` does NOT account for browser chrome — only device notch/home indicator.
- **`window.visualViewport` API solves this**: `layoutViewportHeight - (visualViewportHeight + offsetTop)` = pixels hidden by browser chrome. Published as CSS custom property `--viewport-bottom-offset`.
- **All fixed-bottom elements must include `var(--viewport-bottom-offset, 0px)`**: TabBar, ActionBar, Toast, BottomSheet, DossierSheet, AnalyticsConsentBanner all updated. Missing one element = partial occlusion.
- **rAF-throttled viewport listener**: `visualViewport` fires resize/scroll events rapidly during browser chrome animation. Single `requestAnimationFrame` gate prevents layout thrashing.
- **Cleanup resets CSS var to `0px`**: Hook cleanup must reset `--viewport-bottom-offset` to avoid stale values if component unmounts.

## Session Learnings (2026-04-07) — Shadow Prewarm, 3D Viewer Polish, First-Visit Tracking

Key patterns from 9 commits covering shadow prewarming, 3D viewer contrast/controls overhaul, landing page refresh, first-visit service, and store listing automation:

### Shadow Prewarm Architecture
- **Shared `build_seasonal_shadow_evidence()` service**: Both `shadow-prewarm` endpoint and export path call the same service function. Eliminates duplicate render logic that previously lived inline in `_do_export_briefing()`. Returns `SeasonalShadowEvidence` dataclass or `None` for all non-success states.
- **Prewarm fires after entitlement, not after address selection**: Shadow rendering is expensive (~30-60s). Only trigger after payment confirmed. Frontend uses `ShadowPrewarmStatus` state machine (`idle -> pending -> ready|skipped|unavailable|failed`) with ref-based dedup keyed on `reportId:vboId`.
- **Terminal status set prevents duplicate prewarm requests**: `TERMINAL_SHADOW_PREWARM_STATUSES` set gates re-entry. Promise ref allows awaiting in-flight requests from export path without re-triggering.
- **`prewarmAddressApi()` at app boot**: Module-level `addressApiWarmupStarted` boolean prevents duplicate `/health` fetches. Best-effort only -- errors swallowed. Warms connection pool before first user interaction.

### 3D Viewer Contrast and Controls
- **Scene background != ground plane color**: Separating `SCENE_BACKGROUND_LIGHT/DARK` from `GROUND_COLOR_LIGHT/DARK` creates depth separation. Previous approach matched both, making geometry hard to distinguish from background.
- **`renderer.outputColorSpace = SRGBColorSpace`**: Missing color space declaration caused washed-out colors in Three.js. Always set explicitly -- default is `LinearSRGBColorSpace` which looks wrong for non-PBR scenes.
- **Camera distance bounds need building-aware floor**: Fixed multiplier (`0.90 * baseDistance`) clips into small buildings. `focusSafeDistance = max(focusSpan * 1.25, building_height * 1.2, 14)` prevents camera from going inside geometry.
- **Camera far plane must exceed max zoom distance**: `PerspectiveCamera(..., near=0.5, far=1400)` -- previous `far=1000` caused clipping at max zoom on large neighborhoods. Set `far >= maxDistance * 1.2`.
- **Material roughness/metalness constants extracted**: 6 material property constants (`TARGET_ROUGHNESS`, `NEIGHBOR_ROUGHNESS`, `GROUND_ROUGHNESS`, etc.) prevent drift between initialization and theme-switch code paths.
- **HemisphereLight sky/ground split creates directional ambient**: Separate sky color (cool blue-white) and ground color (warm slate) replaces uniform ambient. Gives subtle top-down directionality without a second directional light.
- **Hardcoded light intensities across 3 code paths drift silently**: Sun intensity was `0.95/1.0` in init, `0.85/0.9` in time-update, inconsistent in theme-switch. Extract to `SUNLIGHT_INTENSITY_LIGHT/DARK` constants referenced everywhere.

### First-Visit Tracking
- **`clearVisited()` paired with `clearRecent()`**: When user clears recent searches, also reset the first-visit marker so they can re-experience the onboarding search state. Small UX detail that prevents stuck states after data clearing.

### Landing Page and Store Listing
- **`dist-landing/` is the deployed artifact, `landing/` is the source**: Build script copies `landing/` to `dist-landing/` with transforms. Both checked in because landing page is static HTML (no build step from frontend).
- **E2E store listing capture via Playwright**: `store-listing-capture.spec.ts` automates Android store screenshots at exact device dimensions. Declared in root `package.json` (not frontend) since it operates on `dist-landing/`.
- **Landing showcase images as webp**: 3 product screenshots (neighborhood, risk-details, sunlight) at webp compression. Source PNGs kept in `landing/images/source/` for re-export.

## Session Learnings (2026-03-09) — PDF Dossier Design Audits

Key findings from two expert design/data-visualization audits of the generated full dossier PDF:

- **Orphaned heading anti-pattern**: "Comparison Charts" heading renders alone at page bottom with charts on the next page. Use LaTeX `\Needspace{}` to keep headings with their content.
- **Raw API identifiers leak into user-facing PDF**: Climate risk source field shows WFS layer names (`wpn:s0149_hittestress_warme_nachten_huidig`). Strip to human-readable source names before rendering.
- **Comparison bars lack severity color encoding**: All "This address" bars are uniform teal regardless of score (15 vs 92). Color-code bars by severity for instant visual scanning.
- **Score format inconsistent across PDF**: "60/100" in table, "60" in tiles, "score 60/100" in viewing questions. Standardize to one format.
- **Viewing questions buried at page 7 of 8**: Most actionable content (brought to viewings) appears after methodology. Front-load actionable content for print use case.
- **Location map has no property marker**: Aerial photo shows neighborhood but no pin/circle/highlight for the target property.
- **Empty "Dimensions" heading when Leefbaarometer data missing**: Renders heading with no content below. Must either populate or omit — empty headings violate graceful degradation.
- **Cover page has duplicate risk representations**: Risk table and colored tile grid display identical scores. Pick one, use freed space for better information density.
- **Shadow legend repeated 3x identically**: Each seasonal panel repeats the same legend. Show once, reclaim space for larger renders.
- **Property check card borders too thin for print**: 1pt `\fcolorbox` left borders nearly disappear at print resolution. Use 3-4pt borders or background tint.
- **"Sunlight Status: Available" is system noise**: Replace with actual insight ("7.4h winter, up to 14.9h summer"). Only show status for pending/missing states.
