# Phase 2: Monetization Infrastructure — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform buurt-check from a free tool into a freemium product with Stripe one-time payments, per-report entitlements, content gating, and conversion analytics — no subscriptions, no user accounts.

**Architecture:** The backend gains a new `billing` router and `reports` router alongside the existing `address` router. A SQLite database (single file, no ORM) stores report records and entitlements. The frontend adds an `UpgradeCTA` component and gates premium dossier sections behind entitlement state fetched after Stripe redirect. Sentry is added to both frontend and backend for error monitoring. Analytics events are tracked via a lightweight custom event bus that can be swapped for a third-party provider later.

**Tech Stack:** Python 3.12 (FastAPI, httpx, stripe), React 18 (TypeScript, Vite), SQLite (aiosqlite), Stripe Checkout, Sentry (@sentry/react, sentry-sdk[fastapi])

**Source of truth:** `docs/plans/2026-02-13-premium-features-design.md` lines 332–496 (Phase 2 specification)

### Review History

**v1 → v2:** Resolved C1 (Sentry dynamic import), C2 (frontend Sentry), C3 (deprecated startup), C5 (Stripe error mock), D1 (server gating), D2 (refund webhook), D3 (CLAUDE.md update).

**v2 → v3:** Applied 9 fixes from reassessment.

**v3 → v4 (this version):** Applied 5 fixes from re-review:

| ID | Severity | Fix |
|----|----------|-----|
| D4-R | Low | `@limiter.limit()` decorators added to code examples (were only in requirements text + quality gate) |
| D7-R | Low | Schema deviation rationale cross-referenced from review history |
| N2 | Minor | Tree-shaking note on static Sentry import in `analytics.ts` |
| N3 | Minor | `test_store_provider_session` assertion comment clarified |
| N4 | Minor | `get_report_by_payment_intent` and `revoke_entitlement` tests added to Story 1.2; minimum count → 10 |

**v3 changes (for reference):**

| ID | Severity | Fix |
|----|----------|-----|
| C4-R | **CRITICAL** | `stripe.checkout.Session.create` wrapped in `asyncio.to_thread()` — was blocking event loop |
| N1 | Medium | `require_entitlement` uses `Query(None)` not `Query(...)` — FastAPI now returns 402, not 422 |
| C4-B | Medium | New `store_provider_session()` function replaces wrong `update_payment_status(report.payment_status)` call |
| D4 | Medium | `@limiter.limit()` decorators added to checkout and reports endpoints |
| D5 | Low | `provider="stripe"` set in `_handle_checkout_completed` |
| D6 | Low | `get_report_by_session` removed (dead code — no caller) |
| D7 | Low | Schema deviations from design doc documented with rationale (see [D7 note in Story 1.1](#epic-1-database--entitlement-model)) |
| M2 | Minor | `GET /api/pricing` endpoint added — frontend fetches authoritative price from backend |
| M3 | Minor | `analytics.ts` uses static `import * as Sentry` (consistent with `sentry.ts`) |

---

## Table of Contents

1. [Epic 0: Observability Foundation](#epic-0-observability-foundation) (Sentry + Analytics)
2. [Epic 1: Database & Entitlement Model](#epic-1-database--entitlement-model)
3. [Epic 2: Report Generation Endpoints](#epic-2-report-generation-endpoints)
4. [Epic 3: Stripe Payment Integration](#epic-3-stripe-payment-integration)
5. [Epic 4: Frontend Content Gating](#epic-4-frontend-content-gating)
6. [Epic 5: Upgrade CTA & Conversion UX](#epic-5-upgrade-cta--conversion-ux)
7. [Epic 6: End-to-End Integration & Polish](#epic-6-end-to-end-integration--polish)

---

## Epic 0: Observability Foundation

**Why:** The design doc (line 472) is explicit: "Add Sentry before payment launch so you can debug failed unlocks, webhook mismatches, export failures after payment, and frontend state issues after checkout redirect." Analytics (line 449) is "essential to tune pricing, paywall placement, upgrade copy, and checkout conversion." Both are Tier 0 — before any payment code ships.

### Story 0.1: Backend Sentry Integration

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/app/config.py`
- Create: `backend/app/sentry_setup.py`
- Test: `backend/tests/test_sentry_setup.py`

**Why:** Capture unhandled exceptions, slow endpoints, and payment webhook failures in production. Required before payment launch per design doc line 472.

**Requirements:**
- Add `sentry-sdk[fastapi]` to backend dependencies
- Add `BUURT_SENTRY_DSN` setting in `config.py` (default empty string = disabled)
- Add `BUURT_SENTRY_ENVIRONMENT` setting (default `"dev"`)
- Initialize Sentry in `sentry_setup.py` with FastAPI integration, only when DSN is non-empty
- Call `init_sentry()` from `main.py` before app creation
- Set `traces_sample_rate=0.1` (10% of transactions)
- Tag transactions with `report_type` when available
- Sentry must be import-safe: no crash if DSN is empty or sentry-sdk not installed

**Step 1: Write failing test**

> **C1 fix:** `init_sentry()` uses a guarded top-level `import sentry_sdk`. Tests must patch
> `"app.sentry_setup.sentry_sdk"` (where the module is looked up), NOT `"sentry_sdk"` (the
> real module). The implementation does `import sentry_sdk` at the top level, wrapped in
> `try/except ImportError`, and the function checks `settings.sentry_dsn` before calling
> `sentry_sdk.init()`.

```python
# backend/tests/test_sentry_setup.py
from unittest.mock import patch, MagicMock

def test_sentry_skipped_when_no_dsn():
    """Sentry should not initialize when DSN is empty."""
    with patch("app.sentry_setup.settings") as mock_settings, \
         patch("app.sentry_setup.sentry_sdk") as mock_sdk:
        mock_settings.sentry_dsn = ""
        from app.sentry_setup import init_sentry
        init_sentry()
        mock_sdk.init.assert_not_called()

def test_sentry_initialized_when_dsn_present():
    """Sentry should initialize when DSN is provided."""
    with patch("app.sentry_setup.settings") as mock_settings, \
         patch("app.sentry_setup.sentry_sdk") as mock_sdk:
        mock_settings.sentry_dsn = "https://examplePublicKey@o0.ingest.sentry.io/0"
        mock_settings.sentry_environment = "test"
        from app.sentry_setup import init_sentry
        init_sentry()
        mock_sdk.init.assert_called_once()
        call_kwargs = mock_sdk.init.call_args[1]
        assert call_kwargs["dsn"] == "https://examplePublicKey@o0.ingest.sentry.io/0"
        assert call_kwargs["environment"] == "test"
        assert call_kwargs["traces_sample_rate"] == 0.1
```

**Step 2: Run test — expect FAIL** (module doesn't exist)
```bash
cd backend && python -m pytest tests/test_sentry_setup.py -v
```

**Step 3: Add config settings**
Add to `backend/app/config.py` inside `Settings` class:
```python
# Sentry (error monitoring)
sentry_dsn: str = ""
sentry_environment: str = "dev"
```

**Step 4: Implement `sentry_setup.py`**

> **C1 fix:** Top-level `import sentry_sdk` in try/except so the module attribute
> exists for patching. The guard checks `settings.sentry_dsn` at call time.

```python
# backend/app/sentry_setup.py
import logging

from app.config import settings

logger = logging.getLogger(__name__)

try:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration
    _HAS_SENTRY = True
except ImportError:
    sentry_sdk = None  # type: ignore[assignment]
    _HAS_SENTRY = False


def init_sentry() -> None:
    if not settings.sentry_dsn:
        logger.info("Sentry DSN not configured — skipping initialization")
        return

    if not _HAS_SENTRY:
        logger.warning("sentry-sdk not installed — skipping Sentry init")
        return

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment,
        traces_sample_rate=0.1,
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
        ],
    )
    logger.info("Sentry initialized (env=%s)", settings.sentry_environment)
```

**Step 5: Wire into `main.py`** — add `from app.sentry_setup import init_sentry` and call `init_sentry()` before `app = FastAPI(...)`.

**Step 6: Run tests**
```bash
cd backend && python -m pytest tests/test_sentry_setup.py -v
```

**Step 7: Commit**
```bash
git add backend/app/sentry_setup.py backend/app/config.py backend/app/main.py backend/tests/test_sentry_setup.py
git commit -m "feat: add backend Sentry integration (disabled by default)"
```

**Definition of done:**
- `init_sentry()` called on startup
- No-op when DSN is empty (tests prove this)
- `ruff check` passes
- All existing backend tests still pass

---

### Story 0.2: Frontend Sentry Integration

**Files:**
- Modify: `frontend/package.json` (add `@sentry/react`)
- Create: `frontend/src/services/sentry.ts`
- Modify: `frontend/src/main.tsx`
- Test: `frontend/src/services/sentry.test.ts`

**Why:** Capture frontend JS exceptions, especially post-checkout redirect state issues and failed PDF exports after payment.

**Requirements:**
- Add `@sentry/react` dependency
- Add `VITE_SENTRY_DSN` env var (empty = disabled)
- Initialize Sentry in `sentry.ts`, call from `main.tsx` before `ReactDOM.createRoot`
- Set `environment` from `VITE_SENTRY_ENVIRONMENT` (default `"dev"`)
- Set `release` from `__APP_VERSION__` (already defined in vite.config.ts)
- `tracesSampleRate: 0.1`
- Import-safe: no crash when DSN is empty

**Step 1: Write failing test**

> **C2 fix:** Use static import (not dynamic `import().then()`). Vitest `vi.mock`
> intercepts static imports reliably. The test asserts synchronously because the
> implementation is synchronous.

```typescript
// frontend/src/services/sentry.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/react';

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
}));

describe('initSentry', () => {
  beforeEach(() => {
    vi.mocked(Sentry.init).mockReset();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('does not call Sentry.init when DSN is empty', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    const { initSentry } = await import('./sentry');
    initSentry();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('calls Sentry.init when DSN is set', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://example@sentry.io/1');
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'test');
    const { initSentry } = await import('./sentry');
    initSentry();
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://example@sentry.io/1',
        environment: 'test',
        tracesSampleRate: 0.1,
      }),
    );
  });
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Install dependency**
```bash
cd frontend && npm install @sentry/react
```

**Step 4: Implement**

> **C2 fix:** Static import. `initSentry()` is synchronous — Sentry.init runs
> immediately. No `.then()` race condition.

```typescript
// frontend/src/services/sentry.ts
import * as Sentry from '@sentry/react';

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'dev',
    release: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined,
    tracesSampleRate: 0.1,
  });
}
```

> **Note:** This adds `@sentry/react` to the main bundle (~15KB gzipped). Tree-shaking
> cannot help here because `Sentry.init()` is called unconditionally when DSN is set.
> If bundle budget is a concern (~414KB current), revisit with dynamic import + async
> init in a later story.

> **N2 note — Tree-shaking concern for `analytics.ts`:** Because `analytics.ts` uses
> `import * as Sentry from '@sentry/react'` (M3 fix), and `analytics.ts` is imported
> by many components (14 events across 4+ files per Story 6.2), `@sentry/react` becomes
> part of the main bundle even when Sentry is unconfigured. The ~15KB cost is acceptable
> at current budget (~414KB). If bundle budget tightens, replace with a lazy wrapper:
> `const getSentry = () => import('@sentry/react')` — but this reintroduces the async
> complexity that M3 was designed to eliminate. Revisit only if bundle budget is breached.

**Step 5: Wire into `main.tsx`** — import and call `initSentry()` before `createRoot`.

**Step 6: Run tests**
```bash
cd frontend && npm run test -- --run src/services/sentry.test.ts
```

**Step 7: Commit**
```bash
git add frontend/src/services/sentry.ts frontend/src/services/sentry.test.ts frontend/src/main.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat: add frontend Sentry integration (disabled by default)"
```

**Definition of done:**
- Sentry init runs before React render
- No-op when env var empty
- `npm run build` passes (TypeScript strict)
- All existing frontend tests pass

---

### Story 0.3: Analytics Event Bus

**Files:**
- Create: `frontend/src/services/analytics.ts`
- Test: `frontend/src/services/analytics.test.ts`

**Why:** Design doc line 449: "Track these events from day one." Without conversion funnel instrumentation, you cannot debug revenue problems. This creates a thin abstraction so events can be routed to console (dev), Sentry breadcrumbs, or a third-party provider later.

**Requirements:**
- Export `trackEvent(name: string, properties?: Record<string, string | number | boolean>): void`
- In dev mode (`import.meta.env.DEV`): `console.debug('[analytics]', name, properties)`
- If Sentry is initialized: add as Sentry breadcrumb
- Event names from design doc (lines 452-468):
  - `address_search_submitted`, `short_report_generated`, `upgrade_cta_viewed`, `upgrade_cta_clicked`, `checkout_started`, `checkout_completed`, `checkout_failed`, `dossier_unlocked`, `pdf_export_clicked`, `pdf_export_completed`, `report_generation_failed`, `3d_view_opened`, `3d_view_failed`, `slow_report_generation`

**Step 1: Write tests**
```typescript
// frontend/src/services/analytics.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trackEvent } from './analytics';

describe('trackEvent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('logs to console in dev mode', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    trackEvent('upgrade_cta_clicked', { report_id: 'abc-123' });
    expect(spy).toHaveBeenCalledWith(
      '[analytics]',
      'upgrade_cta_clicked',
      { report_id: 'abc-123' },
    );
  });

  it('does not throw when called with no properties', () => {
    expect(() => trackEvent('address_search_submitted')).not.toThrow();
  });
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement**

> **M3 fix:** Use static `import * as Sentry` (consistent with `sentry.ts` from Story 0.2).
> Dynamic `import('@sentry/react').then(...)` is inconsistent and harder to test. Guard with
> a try/catch so the module still works if `@sentry/react` is not installed.

```typescript
// frontend/src/services/analytics.ts
import * as Sentry from '@sentry/react';

export function trackEvent(
  name: string,
  properties?: Record<string, string | number | boolean>,
): void {
  if (import.meta.env.DEV) {
    console.debug('[analytics]', name, properties);
  }

  // Sentry breadcrumb (fire-and-forget, no hard dependency)
  try {
    Sentry.addBreadcrumb({
      category: 'analytics',
      message: name,
      data: properties,
      level: 'info',
    });
  } catch {
    // Sentry not initialized or not available — that's fine.
  }
}
```

**Step 4: Run tests**
```bash
cd frontend && npm run test -- --run src/services/analytics.test.ts
```

**Step 5: Commit**
```bash
git add frontend/src/services/analytics.ts frontend/src/services/analytics.test.ts
git commit -m "feat: add analytics event bus with console + Sentry breadcrumb output"
```

**Definition of done:**
- `trackEvent` callable from any component
- Logs in dev, silent in prod (until third-party wired)
- `npm run build` passes

---

## Epic 1: Database & Entitlement Model

**Why:** The design doc (lines 377-397) specifies per-report entitlements with 11 data fields. The current backend is stateless (no database). We need persistent storage for report records and payment state. SQLite is the minimum viable choice: zero infrastructure, single file, sufficient for single-server MVP.

### Story 1.1: SQLite Database Setup

**Files:**
- Create: `backend/app/db.py`
- Modify: `backend/app/config.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_db.py`

**Why:** The entitlement model requires persistent storage. SQLite with aiosqlite gives us async access with zero infrastructure overhead. This is the first time the backend has a database — it's a deliberate architectural expansion.

**Requirements:**
- Add `aiosqlite` to dependencies
- Add `BUURT_DATABASE_PATH` setting (default `"buurt_check.db"`)
- Create `db.py` with:
  - `init_db()`: creates tables if not exist, called on app startup
  - `get_db()`: returns aiosqlite connection (context manager pattern)
- Schema (from design doc lines 381-396):
  ```sql
  CREATE TABLE IF NOT EXISTS reports (
    report_id TEXT PRIMARY KEY,
    report_type TEXT NOT NULL CHECK(report_type IN ('short', 'long')),
    address_key TEXT NOT NULL,
    vbo_id TEXT NOT NULL,
    generation_version TEXT NOT NULL DEFAULT '1',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    payment_status TEXT NOT NULL DEFAULT 'unpaid'
      CHECK(payment_status IN ('unpaid', 'paid', 'failed', 'refunded')),
    entitlement_status TEXT NOT NULL DEFAULT 'inactive'
      CHECK(entitlement_status IN ('active', 'inactive', 'revoked')),
    provider TEXT,
    provider_payment_id TEXT,
    provider_session_id TEXT,
    purchased_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_reports_vbo_id ON reports(vbo_id);
  CREATE INDEX IF NOT EXISTS idx_reports_provider_session ON reports(provider_session_id);
  ```
- Startup lifespan event calls `init_db()`
- In tests: use `:memory:` database

> **D7 note — Intentional schema deviations from design doc (lines 381-396):**
> - **Added:** `vbo_id` column (not in design doc) — needed for `find_existing_paid_report` lookup by address.
> - **Split:** Design doc's `provider_id` split into `provider_payment_id` + `provider_session_id` — Stripe uses separate IDs for checkout sessions vs payment intents.
> - **Omitted:** `entitlement_scope` (design doc: `report:<report_id>`) — deferred. Current MVP has exactly one scope (per-report). Adding the column when multi-scope is needed avoids YAGNI.
> - **Omitted:** `purchase_id` (design doc: UUID internal purchase record) — the `report_id` serves as the purchase identifier. A separate `purchase_id` adds indirection with no current benefit.

**Step 1: Write failing tests**
```python
# backend/tests/test_db.py
import pytest
from app.db import init_db, get_db


@pytest.mark.asyncio
async def test_init_db_creates_reports_table(tmp_path):
    db_path = str(tmp_path / "test.db")
    await init_db(db_path)
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='reports'"
        )
        row = await cursor.fetchone()
        assert row is not None
        assert row[0] == "reports"


@pytest.mark.asyncio
async def test_init_db_idempotent(tmp_path):
    db_path = str(tmp_path / "test.db")
    await init_db(db_path)
    await init_db(db_path)  # Should not raise


@pytest.mark.asyncio
async def test_init_db_enables_wal_mode(tmp_path):
    """WAL mode must be enabled for concurrent read/write under FastAPI."""
    db_path = str(tmp_path / "test.db")
    await init_db(db_path)
    async with get_db(db_path) as db:
        cursor = await db.execute("PRAGMA journal_mode")
        row = await cursor.fetchone()
        assert row[0] == "wal"


@pytest.mark.asyncio
async def test_concurrent_reads_and_writes(tmp_path):
    """SQLite under concurrent FastAPI requests must not deadlock."""
    import asyncio
    db_path = str(tmp_path / "test.db")
    await init_db(db_path)

    async def write_row(i: int) -> None:
        async with get_db(db_path) as db:
            await db.execute(
                "INSERT INTO reports (report_id, report_type, address_key, vbo_id) "
                "VALUES (?, 'short', 'test', '0363010012345678')",
                (f"report-{i}",),
            )
            await db.commit()

    async def read_rows() -> int:
        async with get_db(db_path) as db:
            cursor = await db.execute("SELECT COUNT(*) FROM reports")
            row = await cursor.fetchone()
            return row[0]

    # 10 concurrent writes + reads should not deadlock or error
    tasks = [write_row(i) for i in range(10)] + [read_rows() for _ in range(5)]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    errors = [r for r in results if isinstance(r, Exception)]
    assert errors == [], f"Concurrent DB access errors: {errors}"
```

**Step 2: Run — expect FAIL**

**Step 3: Implement `db.py`**
```python
# backend/app/db.py
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import aiosqlite

from app.config import settings

logger = logging.getLogger(__name__)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS reports (
    report_id TEXT PRIMARY KEY,
    report_type TEXT NOT NULL CHECK(report_type IN ('short', 'long')),
    address_key TEXT NOT NULL,
    vbo_id TEXT NOT NULL,
    generation_version TEXT NOT NULL DEFAULT '1',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    payment_status TEXT NOT NULL DEFAULT 'unpaid'
        CHECK(payment_status IN ('unpaid', 'paid', 'failed', 'refunded')),
    entitlement_status TEXT NOT NULL DEFAULT 'inactive'
        CHECK(entitlement_status IN ('active', 'inactive', 'revoked')),
    provider TEXT,
    provider_payment_id TEXT,
    provider_session_id TEXT,
    purchased_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_reports_vbo_id ON reports(vbo_id);
CREATE INDEX IF NOT EXISTS idx_reports_provider_session ON reports(provider_session_id);
"""


async def init_db(db_path: str | None = None) -> None:
    path = db_path or settings.database_path
    async with aiosqlite.connect(path) as db:
        # WAL mode: allows concurrent readers during writes.
        # Critical for FastAPI async handlers hitting the DB simultaneously.
        await db.execute("PRAGMA journal_mode=WAL")
        await db.executescript(_SCHEMA)
        await db.commit()
    logger.info("Database initialized at %s", path)


@asynccontextmanager
async def get_db(db_path: str | None = None) -> AsyncGenerator[aiosqlite.Connection, None]:
    path = db_path or settings.database_path
    async with aiosqlite.connect(path) as db:
        db.row_factory = aiosqlite.Row
        yield db
```

**Step 4: Add config**
```python
# In config.py Settings class:
database_path: str = "buurt_check.db"
```

**Step 5: Wire startup** — In `main.py`, use the FastAPI `lifespan` context manager (NOT
the deprecated `@app.on_event("startup")`):

> **C3 fix:** `on_event` is deprecated since FastAPI 0.93. Use `lifespan` async context manager.

```python
# In main.py:
from contextlib import asynccontextmanager
from app.db import init_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(
    title="buurt-check API",
    version="0.1.0",
    description="Pre-viewing intelligence for property buyers in the Netherlands",
    lifespan=lifespan,
)
```

**Step 6: Run tests**
```bash
cd backend && python -m pytest tests/test_db.py -v
```

**Step 7: Commit**
```bash
git add backend/app/db.py backend/app/config.py backend/app/main.py backend/tests/test_db.py
git commit -m "feat: add SQLite database with reports table for entitlement model"
```

**Definition of done:**
- `reports` table created on startup
- `get_db()` context manager works
- Schema matches design doc fields
- Idempotent initialization
- `ruff check` passes

---

### Story 1.2: Report Repository (CRUD)

**Files:**
- Create: `backend/app/services/reports.py`
- Test: `backend/tests/test_reports.py`

**Why:** Encapsulate all report database operations in a single service. Route handlers and billing logic call this — never raw SQL elsewhere.

**Requirements:**
- `create_report(vbo_id, address_key, report_type) -> report_id: str` — generates UUID, inserts row, returns ID
- `get_report(report_id) -> Report | None` — returns Pydantic model or None
- `update_payment_status(report_id, status, provider?, provider_payment_id?, purchased_at?) -> bool` — transitions payment_status (e.g. "unpaid" → "paid"). D5 fix: accepts `provider` param so the column gets set to `"stripe"` on checkout completion.
- `store_provider_session(report_id, provider_session_id) -> bool` — stores Stripe session ID without changing payment_status (C4-B fix: separated from `update_payment_status` to avoid semantically wrong status pass-through)
- `check_entitlement(report_id) -> bool` — returns True if `entitlement_status == 'active'`
- `activate_entitlement(report_id) -> bool` — sets `entitlement_status = 'active'`
- `find_existing_paid_report(vbo_id) -> Report | None` — returns most recent paid report for this address
- `get_report_by_payment_intent(provider_payment_id) -> Report | None` — lookup by Stripe payment intent ID (used by refund webhook handler, D2)
- `revoke_entitlement(report_id) -> bool` — sets `entitlement_status = 'revoked'` (used by refund webhook handler, D2)

> **D6 note:** `get_report_by_session(provider_session_id)` was removed — no code path calls
> it. The refund handler looks up by `payment_intent_id` (via `provider_payment_id`), not
> `session_id`. If session-based lookups are needed later, add the function then.

**Step 1: Write tests (minimum 10)**
```python
# backend/tests/test_reports.py
import pytest
from app.db import init_db
from app.services.reports import (
    create_report, get_report, update_payment_status, store_provider_session,
    check_entitlement, activate_entitlement, find_existing_paid_report,
    get_report_by_payment_intent, revoke_entitlement,
)

@pytest.fixture
async def db_path(tmp_path):
    path = str(tmp_path / "test.db")
    await init_db(path)
    return path

@pytest.mark.asyncio
async def test_create_and_get_report(db_path):
    report_id = await create_report("0363010012345678", "Amsterdam, Damrak 1", "short", db_path=db_path)
    report = await get_report(report_id, db_path=db_path)
    assert report is not None
    assert report.vbo_id == "0363010012345678"
    assert report.report_type == "short"
    assert report.payment_status == "unpaid"

@pytest.mark.asyncio
async def test_check_entitlement_false_by_default(db_path):
    report_id = await create_report("0363010012345678", "Amsterdam, Damrak 1", "long", db_path=db_path)
    assert await check_entitlement(report_id, db_path=db_path) is False

@pytest.mark.asyncio
async def test_activate_entitlement(db_path):
    report_id = await create_report("0363010012345678", "Amsterdam, Damrak 1", "long", db_path=db_path)
    await activate_entitlement(report_id, db_path=db_path)
    assert await check_entitlement(report_id, db_path=db_path) is True

@pytest.mark.asyncio
async def test_update_payment_status(db_path):
    report_id = await create_report("0363010012345678", "Amsterdam, Damrak 1", "long", db_path=db_path)
    await update_payment_status(report_id, "paid", provider_payment_id="pi_123", db_path=db_path)
    report = await get_report(report_id, db_path=db_path)
    assert report.payment_status == "paid"

@pytest.mark.asyncio
async def test_find_existing_paid_report(db_path):
    report_id = await create_report("0363010012345678", "Amsterdam, Damrak 1", "long", db_path=db_path)
    await update_payment_status(report_id, "paid", db_path=db_path)
    await activate_entitlement(report_id, db_path=db_path)
    found = await find_existing_paid_report("0363010012345678", db_path=db_path)
    assert found is not None
    assert found.report_id == report_id

@pytest.mark.asyncio
async def test_find_existing_paid_report_none_when_unpaid(db_path):
    await create_report("0363010012345678", "Amsterdam, Damrak 1", "long", db_path=db_path)
    found = await find_existing_paid_report("0363010012345678", db_path=db_path)
    assert found is None

@pytest.mark.asyncio
async def test_get_nonexistent_report(db_path):
    report = await get_report("nonexistent-id", db_path=db_path)
    assert report is None

@pytest.mark.asyncio
async def test_store_provider_session(db_path):
    """C4-B: store_provider_session stores Stripe session ID without changing payment_status.

    This is the key invariant: storing the session ID is a separate operation from
    updating payment status. The report must remain 'unpaid' after this call —
    only the webhook handler transitions payment_status to 'paid'.
    """
    report_id = await create_report("0363010012345678", "Amsterdam, Damrak 1", "long", db_path=db_path)
    # Verify initial state
    report_before = await get_report(report_id, db_path=db_path)
    assert report_before.payment_status == "unpaid"

    # Store session ID
    await store_provider_session(report_id, provider_session_id="cs_test_abc", db_path=db_path)

    # Verify: session ID stored, payment_status unchanged
    report_after = await get_report(report_id, db_path=db_path)
    assert report_after.provider_session_id == "cs_test_abc"
    assert report_after.payment_status == "unpaid"  # N3: MUST remain unpaid — only webhook changes this

@pytest.mark.asyncio
async def test_get_report_by_payment_intent(db_path):
    """N4: Lookup report by Stripe payment_intent ID (used by refund webhook handler)."""
    report_id = await create_report("0363010012345678", "Amsterdam, Damrak 1", "long", db_path=db_path)
    await update_payment_status(
        report_id, "paid", provider="stripe",
        provider_payment_id="pi_test_123", db_path=db_path,
    )
    # Lookup by payment intent
    found = await get_report_by_payment_intent("pi_test_123", db_path=db_path)
    assert found is not None
    assert found.report_id == report_id
    # Non-existent payment intent returns None
    not_found = await get_report_by_payment_intent("pi_nonexistent", db_path=db_path)
    assert not_found is None

@pytest.mark.asyncio
async def test_revoke_entitlement(db_path):
    """N4: Revoke entitlement sets status to 'revoked' (used by refund webhook handler)."""
    report_id = await create_report("0363010012345678", "Amsterdam, Damrak 1", "long", db_path=db_path)
    await activate_entitlement(report_id, db_path=db_path)
    assert await check_entitlement(report_id, db_path=db_path) is True
    # Revoke
    result = await revoke_entitlement(report_id, db_path=db_path)
    assert result is True
    assert await check_entitlement(report_id, db_path=db_path) is False
    # Verify status is 'revoked', not just 'inactive'
    report = await get_report(report_id, db_path=db_path)
    assert report.entitlement_status == "revoked"
```

**Step 2: Run — expect FAIL**

**Step 3: Implement**

Create Pydantic model:
```python
# In backend/app/models/report.py
from pydantic import BaseModel

class Report(BaseModel):
    report_id: str
    report_type: str  # 'short' | 'long'
    address_key: str
    vbo_id: str
    generation_version: str
    created_at: str
    payment_status: str  # 'unpaid' | 'paid' | 'failed' | 'refunded'
    entitlement_status: str  # 'active' | 'inactive' | 'revoked'
    provider: str | None = None
    provider_payment_id: str | None = None
    provider_session_id: str | None = None
    purchased_at: str | None = None
```

Implement repository in `backend/app/services/reports.py`.

**Step 4: Run tests**
```bash
cd backend && python -m pytest tests/test_reports.py -v
```

**Step 5: Commit**
```bash
git add backend/app/services/reports.py backend/app/models/report.py backend/tests/test_reports.py
git commit -m "feat: add report repository with entitlement CRUD operations"
```

**Definition of done:**
- All 8 tests pass
- UUID generation is correct
- Entitlement checks work
- `ruff check` passes

---

## Epic 2: Report Generation Endpoints

**Why:** The design doc (lines 434-440) specifies `POST /reports/short` and `GET /reports/{report_id}/long` endpoints that wrap existing dossier data fetching into a report lifecycle. The short report is always free; the long report requires entitlement.

### Story 2.1: Short Report Endpoint

**Files:**
- Create: `backend/app/api/reports.py`
- Modify: `backend/app/api/router.py`
- Test: `backend/tests/test_reports_api.py`

**Why:** `POST /reports/short` is the entry point for the freemium funnel. It creates a report record and returns existing dossier data (risk tile summaries, attention badge, building facts) alongside a `report_id` that the frontend uses for the upgrade CTA.

**Requirements:**
- `POST /api/reports/short` accepts `{ vbo_id, address_key }` body
- Creates a `short` report record in DB
- Returns `{ report_id, report_type: "short" }` — the short report data itself is already loaded by the existing `/api/address/*` endpoints. The `report_id` is the key artifact.
- If a paid report already exists for this `vbo_id`, return it instead (skip re-purchase)
- **D4 fix — Rate limited: 10/minute** via `@limiter.limit("10/minute")` decorator (uses existing SlowAPI from `app/rate_limit.py`). Must import `limiter` and apply decorator to the route function.

**Step 1: Write tests**

> **C4 fix:** The service functions (`create_report`, `find_existing_paid_report`) import
> `settings` from `app.config`, NOT from `app.api.reports`. Patching `app.api.reports.settings`
> doesn't reach the service layer. Fix: patch `app.config.settings` (the canonical source)
> which affects ALL importers. Use `ExitStack` to patch BOTH `app.config.settings` and
> `app.services.reports.settings` to ensure coverage.

```python
# backend/tests/test_reports_api.py
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, MagicMock
from contextlib import ExitStack
from app.main import app
from app.db import init_db

@pytest.fixture
async def db_path(tmp_path):
    path = str(tmp_path / "test.db")
    await init_db(path)
    return path

@pytest.fixture
def client(db_path):
    """Patch settings at ALL import sites that read database_path."""
    mock_settings = MagicMock()
    mock_settings.database_path = db_path
    mock_settings.rate_limit_enabled = False
    with ExitStack() as stack:
        stack.enter_context(patch("app.config.settings", mock_settings))
        stack.enter_context(patch("app.services.reports.settings", mock_settings))
        stack.enter_context(patch("app.api.reports.settings", mock_settings))
        transport = ASGITransport(app=app)
        yield AsyncClient(transport=transport, base_url="http://test")

@pytest.mark.asyncio
async def test_create_short_report(client):
    async with client:
        response = await client.post("/api/reports/short", json={
            "vbo_id": "0363010012345678",
            "address_key": "Damrak 1, Amsterdam",
        })
    assert response.status_code == 200
    data = response.json()
    assert "report_id" in data
    assert data["report_type"] == "short"

@pytest.mark.asyncio
async def test_returns_existing_paid_report(client, db_path):
    # Pre-create a paid report (uses db_path directly, bypassing settings)
    from app.services.reports import create_report, update_payment_status, activate_entitlement
    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)
    await update_payment_status(rid, "paid", db_path=db_path)
    await activate_entitlement(rid, db_path=db_path)

    async with client:
        response = await client.post("/api/reports/short", json={
            "vbo_id": "0363010012345678",
            "address_key": "Damrak 1",
        })
    data = response.json()
    assert data["report_id"] == rid
    assert data["already_purchased"] is True
```

**Step 2: Implement the router**

```python
# backend/app/api/reports.py
import logging
from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from app.services.reports import create_report, find_existing_paid_report
from app.rate_limit import limiter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reports", tags=["reports"])


class ShortReportRequest(BaseModel):
    vbo_id: str = Field(..., pattern=r"^[0-9]{16}$")
    address_key: str = Field(..., min_length=1)


class ShortReportResponse(BaseModel):
    report_id: str
    report_type: str
    already_purchased: bool = False


# D4: Rate limit report creation to prevent abuse
@limiter.limit("10/minute")
@router.post("/short", response_model=ShortReportResponse)
async def create_short_report(request: Request, body: ShortReportRequest):
    # Check for existing paid report
    existing = await find_existing_paid_report(body.vbo_id)
    if existing:
        return ShortReportResponse(
            report_id=existing.report_id,
            report_type=existing.report_type,
            already_purchased=True,
        )

    report_id = await create_report(body.vbo_id, body.address_key, "short")
    return ShortReportResponse(report_id=report_id, report_type="short")
```

**Step 3: Register in router.py**
```python
from app.api.reports import router as reports_router
router.include_router(reports_router)
```

**Step 4: Run tests**
```bash
cd backend && python -m pytest tests/test_reports_api.py -v
```

**Step 5: Commit**
```bash
git add backend/app/api/reports.py backend/app/api/router.py backend/tests/test_reports_api.py
git commit -m "feat: add POST /reports/short endpoint for freemium funnel entry"
```

**Definition of done:**
- Endpoint creates report record
- Returns existing paid report if found
- `ruff check` passes
- Existing tests unbroken

---

### Story 2.2: Entitlement Check Endpoint

**Files:**
- Modify: `backend/app/api/reports.py`
- Modify: `backend/tests/test_reports_api.py`

**Why:** `GET /reports/{report_id}/entitlement` is called by the frontend after Stripe checkout redirect to verify payment went through (design doc line 431: step 7).

**Requirements:**
- `GET /api/reports/{report_id}/entitlement`
- Returns `{ report_id, entitled: bool, report_type }`
- Returns 404 if report_id doesn't exist
- Never trusts frontend query params alone (design doc line 442)

**Step 1: Write tests**
```python
@pytest.mark.asyncio
async def test_entitlement_check_false(client, db_path):
    from app.services.reports import create_report
    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)
    response = await client.get(f"/api/reports/{rid}/entitlement")
    assert response.status_code == 200
    assert response.json()["entitled"] is False

@pytest.mark.asyncio
async def test_entitlement_check_true(client, db_path):
    from app.services.reports import create_report, activate_entitlement
    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)
    await activate_entitlement(rid, db_path=db_path)
    response = await client.get(f"/api/reports/{rid}/entitlement")
    assert response.status_code == 200
    assert response.json()["entitled"] is True

@pytest.mark.asyncio
async def test_entitlement_check_not_found(client):
    response = await client.get("/api/reports/nonexistent/entitlement")
    assert response.status_code == 404
```

**Step 2: Implement**

Add to `reports.py`:
```python
from fastapi import HTTPException
from app.services.reports import get_report, check_entitlement

class EntitlementResponse(BaseModel):
    report_id: str
    entitled: bool
    report_type: str

@router.get("/{report_id}/entitlement", response_model=EntitlementResponse)
async def get_entitlement(report_id: str):
    report = await get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    entitled = await check_entitlement(report_id)
    return EntitlementResponse(
        report_id=report_id,
        entitled=entitled,
        report_type=report.report_type,
    )
```

**Step 3: Run tests, commit**

**Definition of done:**
- Returns correct entitlement state
- 404 for unknown reports
- Used by frontend after Stripe redirect

---

## Epic 3: Stripe Payment Integration

**Why:** This is the revenue engine. Design doc lines 406-411 define the MVP Stripe scope: one-time checkout, webhook verification, entitlement unlock, refund handling. No subscriptions.

### Story 3.1: Stripe Checkout Session Creation

**Files:**
- Create: `backend/app/api/billing.py`
- Modify: `backend/app/config.py`
- Modify: `backend/app/api/router.py`
- Test: `backend/tests/test_billing.py`

**Why:** `POST /billing/checkout-session` creates a Stripe Checkout session for the long dossier purchase. This is step 5 of the conversion flow (design doc line 363).

**Requirements:**
- Add `stripe` to backend dependencies
- Add settings: `BUURT_STRIPE_SECRET_KEY`, `BUURT_STRIPE_WEBHOOK_SECRET`, `BUURT_STRIPE_PRICE_CENTS` (default 1499), `BUURT_BASE_URL` (for redirect URLs)
- `POST /api/billing/checkout-session` accepts `{ report_id }`
- **D4 fix — Rate limited: 5/minute** via `@limiter.limit("5/minute")` decorator (uses existing SlowAPI from `app/rate_limit.py`)
- Validates report exists and is unpaid
- Creates Stripe Checkout Session with:
  - `mode="payment"` (one-time, not subscription)
  - `line_items`: 1x dossier at configured price
  - `success_url`: `{BASE_URL}/#/address/{vbo_id}?report={report_id}&session_id={CHECKOUT_SESSION_ID}`
  - `cancel_url`: `{BASE_URL}/#/address/{vbo_id}`
  - `metadata`: `{ report_id, vbo_id }`
- Stores `provider_session_id` on report record
- Returns `{ checkout_url }` (Stripe hosted page URL)
- Rate limited: 5/minute

**Step 1: Write tests** (mock Stripe API)

> **C4/C5 fix applied:** Billing tests use the same ExitStack multi-patch pattern as
> reports tests, ensuring `settings.database_path` is patched at both the API and
> service layer. Stripe is mocked at `app.api.billing.stripe`.

```python
# backend/tests/test_billing.py
import pytest
from unittest.mock import patch, MagicMock
from contextlib import ExitStack
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db import init_db


@pytest.fixture
async def db_path(tmp_path):
    path = str(tmp_path / "test.db")
    await init_db(path)
    return path


def _billing_patches(db_path, extra_settings=None):
    """Create ExitStack with all necessary patches for billing tests."""
    stack = ExitStack()
    mock_settings = MagicMock()
    mock_settings.database_path = db_path
    mock_settings.stripe_secret_key = "sk_test_xxx"
    mock_settings.stripe_webhook_secret = "whsec_test"
    mock_settings.stripe_price_cents = 1499
    mock_settings.base_url = "http://localhost:5173"
    mock_settings.rate_limit_enabled = False
    if extra_settings:
        for k, v in extra_settings.items():
            setattr(mock_settings, k, v)
    stack.enter_context(patch("app.config.settings", mock_settings))
    stack.enter_context(patch("app.services.reports.settings", mock_settings))
    stack.enter_context(patch("app.api.billing.settings", mock_settings))
    mock_stripe = stack.enter_context(patch("app.api.billing.stripe"))
    return stack, mock_settings, mock_stripe


@pytest.mark.asyncio
async def test_create_checkout_session(db_path):
    """C4-R: stripe.checkout.Session.create is called via asyncio.to_thread.
    The mock still works because to_thread calls the function with the kwargs."""
    from app.services.reports import create_report
    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)

    mock_session = MagicMock()
    mock_session.id = "cs_test_abc123"
    mock_session.url = "https://checkout.stripe.com/pay/cs_test_abc123"

    stack, _, mock_stripe = _billing_patches(db_path)
    with stack:
        mock_stripe.checkout.Session.create.return_value = mock_session
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/billing/checkout-session", json={
                "report_id": rid,
            })

    assert response.status_code == 200
    data = response.json()
    assert data["checkout_url"] == "https://checkout.stripe.com/pay/cs_test_abc123"


@pytest.mark.asyncio
async def test_checkout_rejects_nonexistent_report(db_path):
    stack, _, _ = _billing_patches(db_path)
    with stack:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/billing/checkout-session", json={
                "report_id": "nonexistent",
            })
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_checkout_rejects_already_paid(db_path):
    from app.services.reports import create_report, update_payment_status
    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)
    await update_payment_status(rid, "paid", db_path=db_path)

    stack, _, _ = _billing_patches(db_path)
    with stack:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/billing/checkout-session", json={
                "report_id": rid,
            })
    assert response.status_code == 409
```

**Step 2: Implement**

Add config settings:
```python
# config.py
stripe_secret_key: str = ""
stripe_webhook_secret: str = ""
stripe_price_cents: int = 1499  # EUR 14.99
base_url: str = "http://localhost:5173"
```

Implement `billing.py`:

> **C4-R fix:** `stripe.checkout.Session.create()` is a synchronous HTTP call to Stripe's
> API (200-800ms, up to 3s on cold start). Running it directly in an async handler blocks the
> entire event loop, causing cascading timeouts for ALL concurrent requests. Wrap in
> `asyncio.to_thread()` to offload to a thread pool.

```python
# backend/app/api/billing.py
import asyncio
import logging
import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.config import settings
from app.rate_limit import limiter
from app.services.reports import (
    get_report, get_report_by_payment_intent, store_provider_session,
    update_payment_status, activate_entitlement, revoke_entitlement,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])


class CheckoutRequest(BaseModel):
    report_id: str


class CheckoutResponse(BaseModel):
    checkout_url: str


# D4: Rate limit checkout to prevent payment abuse
@limiter.limit("5/minute")
@router.post("/checkout-session", response_model=CheckoutResponse)
async def create_checkout_session(request: Request, body: CheckoutRequest):
    report = await get_report(body.report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.payment_status == "paid":
        raise HTTPException(status_code=409, detail="Report already paid")

    stripe.api_key = settings.stripe_secret_key

    # C4-R: Stripe SDK is synchronous — offload to thread pool to avoid
    # blocking the async event loop (would stall ALL concurrent requests).
    session = await asyncio.to_thread(
        stripe.checkout.Session.create,
        mode="payment",
        line_items=[{
            "price_data": {
                "currency": "eur",
                "unit_amount": settings.stripe_price_cents,
                "product_data": {
                    "name": "Buurt Check Full Dossier",
                    "description": f"Complete property analysis for {report.address_key}",
                },
            },
            "quantity": 1,
        }],
        success_url=(
            f"{settings.base_url}/#/address/{report.vbo_id}"
            f"?report={body.report_id}"
            "&session_id={CHECKOUT_SESSION_ID}"
        ),
        cancel_url=f"{settings.base_url}/#/address/{report.vbo_id}",
        metadata={
            "report_id": body.report_id,
            "vbo_id": report.vbo_id,
        },
    )

    # C4-B fix: Store Stripe session ID on the report. Use a dedicated function
    # instead of update_payment_status (which implies a status transition).
    await store_provider_session(body.report_id, provider_session_id=session.id)

    return CheckoutResponse(checkout_url=session.url)
```

**Step 3: Register router, run tests, commit**

**Definition of done:**
- Stripe session created with correct metadata
- Rejects nonexistent/already-paid reports
- Session ID stored on report
- `ruff check` passes

---

### Story 3.2: Stripe Webhook Handler

**Files:**
- Modify: `backend/app/api/billing.py`
- Modify: `backend/tests/test_billing.py`

**Why:** The webhook is the source of truth for payment confirmation. Design doc line 443: "Never trust frontend payment success query params alone." Line 444: "Unlock only after webhook-confirmed payment state." Line 445: "Make webhook handling idempotent."

**Requirements:**
- `POST /api/billing/webhook` — receives raw body, verifies Stripe signature
- Handles `checkout.session.completed` event:
  1. Extract `report_id` from session metadata
  2. Update `payment_status = 'paid'`
  3. Set `entitlement_status = 'active'`
  4. Store `provider_payment_id` (payment intent ID)
  5. Set `purchased_at` timestamp
- **D2 fix — Handles `charge.refunded` event** (design doc line 410: "Refund-safe state handling"):
  1. Look up report by `payment_intent` → `provider_payment_id`
  2. Update `payment_status = 'refunded'`
  3. Set `entitlement_status = 'revoked'`
  4. Log refund for manual review
- Idempotent: processing same event twice has no side effects
- Returns 200 to Stripe even on internal processing errors (log, don't reject)
- Rejects invalid signatures with 400

**Step 1: Write tests**
```python
@pytest.mark.asyncio
async def test_webhook_valid_signature(db_path):
    from app.services.reports import create_report, get_report
    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)

    event_data = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_abc",
                "payment_intent": "pi_test_123",
                "metadata": {"report_id": rid, "vbo_id": "0363010012345678"},
            }
        }
    }

    stack, _, mock_stripe = _billing_patches(db_path)
    with stack:
        mock_stripe.Webhook.construct_event.return_value = event_data
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/billing/webhook",
                content=b'{}',
                headers={"stripe-signature": "t=123,v1=abc"},
            )
        assert response.status_code == 200

    report = await get_report(rid, db_path=db_path)
    assert report.payment_status == "paid"
    assert report.entitlement_status == "active"


@pytest.mark.asyncio
async def test_webhook_invalid_signature():
    """C5 fix: Use ValueError (which the handler catches) instead of
    stripe.error.SignatureVerificationError (which requires the real stripe
    package to be importable and has a non-trivial constructor signature)."""
    with patch("app.api.billing.stripe") as mock_stripe, \
         patch("app.api.billing.settings") as mock_settings:
        mock_settings.stripe_webhook_secret = "whsec_test"
        mock_settings.rate_limit_enabled = False
        mock_stripe.Webhook.construct_event.side_effect = ValueError("Invalid signature")
        # The handler catches (ValueError, stripe.error.SignatureVerificationError).
        # ValueError covers the test case without needing the real stripe package.

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/billing/webhook",
                content=b'{}',
                headers={"stripe-signature": "bad"},
            )
        assert response.status_code == 400


@pytest.mark.asyncio
async def test_webhook_idempotent(db_path):
    """Processing same event twice should not error."""
    from app.services.reports import create_report
    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)

    event_data = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_abc",
                "payment_intent": "pi_test_123",
                "metadata": {"report_id": rid},
            }
        }
    }

    stack, _, mock_stripe = _billing_patches(db_path)
    with stack:
        mock_stripe.Webhook.construct_event.return_value = event_data
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post("/api/billing/webhook", content=b'{}', headers={"stripe-signature": "ok"})
            response = await client.post("/api/billing/webhook", content=b'{}', headers={"stripe-signature": "ok"})
        assert response.status_code == 200
```

**Step 2: Implement webhook endpoint**

```python
@router.post("/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.stripe_webhook_secret,
        )
    except (ValueError, stripe.error.SignatureVerificationError) as e:
        logger.warning("Webhook signature verification failed: %s", e)
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        report_id = session.get("metadata", {}).get("report_id")
        if report_id:
            try:
                await _handle_checkout_completed(report_id, session)
            except Exception:
                logger.exception("Failed to process checkout.session.completed for report %s", report_id)

    elif event["type"] == "charge.refunded":
        # D2: Refund handling — revoke entitlement on refund
        charge = event["data"]["object"]
        payment_intent_id = charge.get("payment_intent")
        if payment_intent_id:
            try:
                await _handle_charge_refunded(payment_intent_id)
            except Exception:
                logger.exception("Failed to process charge.refunded for pi %s", payment_intent_id)

    return {"status": "ok"}


async def _handle_checkout_completed(report_id: str, session: dict) -> None:
    report = await get_report(report_id)
    if not report:
        logger.error("Webhook: report %s not found", report_id)
        return
    if report.payment_status == "paid":
        logger.info("Webhook: report %s already paid (idempotent)", report_id)
        return

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()

    # D5 fix: Set provider="stripe" so the column is never NULL
    await update_payment_status(
        report_id, "paid",
        provider="stripe",
        provider_payment_id=session.get("payment_intent"),
        purchased_at=now,
    )
    await activate_entitlement(report_id)
    logger.info("Webhook: report %s unlocked", report_id)


async def _handle_charge_refunded(payment_intent_id: str) -> None:
    """D2: Revoke entitlement when a charge is refunded."""
    report = await get_report_by_payment_intent(payment_intent_id)
    if not report:
        logger.warning("Refund webhook: no report found for pi %s", payment_intent_id)
        return
    if report.payment_status == "refunded":
        logger.info("Refund webhook: report %s already refunded (idempotent)", report.report_id)
        return

    await update_payment_status(report.report_id, "refunded")
    await revoke_entitlement(report.report_id)
    logger.info("Refund webhook: report %s entitlement revoked", report.report_id)
```

> **Note:** This requires two additional repository functions in `reports.py`:
> - `get_report_by_payment_intent(provider_payment_id) -> Report | None` — lookup by Stripe payment intent ID
> - `revoke_entitlement(report_id) -> bool` — sets `entitlement_status = 'revoked'`
>
> These are small additions to Story 1.2's repository.

**Step 3: Run tests, commit**

**Definition of done:**
- Signature verification works
- Entitlement activated on valid webhook
- Idempotent processing
- Invalid signatures rejected with 400
- Errors logged but 200 returned to Stripe
- `ruff check` passes

---

### Story 3.3: Entitlement-Gated Export

**Files:**
- Modify: `backend/app/api/address.py` (export endpoint)
- Test: `backend/tests/test_export_entitlement.py`

**Why:** Design doc line 440: "POST /exports/pdf checks entitlement before generating full export." The existing export endpoint must reject `full_dossier` template requests unless the report is paid.

**Requirements:**
- Add optional `report_id` field to `ExportRequest`
- If `template == "full_dossier"` and no `report_id` provided → 402 (Payment Required)
- If `template == "full_dossier"` and `report_id` provided but not entitled → 402
- If `template == "quick_brief"` → always allowed (free)
- Backward-compatible: existing `quick_brief` calls work unchanged

**Step 1: Write tests**

**Step 2: Add `report_id` field to `ExportRequest`, add entitlement check before full_dossier generation**

**Step 3: Run tests, commit**

**Definition of done:**
- `quick_brief` always works
- `full_dossier` requires valid, entitled `report_id`
- 402 status for payment-required scenarios
- Existing export tests still pass

---

### Story 3.4: Server-Side Entitlement Gating for Premium Endpoints

**Files:**
- Create: `backend/app/api/dependencies.py`
- Modify: `backend/app/api/address.py` (add dependency to premium endpoints)
- Test: `backend/tests/test_server_gating.py`

**Why (D1 fix):** Frontend-only gating is a security risk. Any user with browser DevTools can
bypass client-side checks and call premium data endpoints directly. While the free short report
data is already available via the existing endpoints, the premium-only endpoints (viewing
questions, risk comparisons, property warnings, livability, tier-b, wms-tile, building3d,
neighborhood3d) must enforce entitlement on the server. Without this, the paywall is cosmetic.

> **Accepted trade-off:** The existing `/api/address/{vbo_id}/risks` endpoint remains ungated
> because risk tile scores are part of the free short report. Only endpoints whose data is
> exclusively in the paid dossier are gated. The `/api/address/{vbo_id}/building` endpoint
> also remains ungated (BuildingFactsCard is free).

**Requirements:**
- Create a FastAPI dependency `require_entitlement`:

  > **N1 fix:** Use `Query(None)` (optional), NOT `Query(...)` (required). With `Query(...)`,
  > FastAPI returns 422 (Validation Error) for a missing param *before* the dependency body
  > executes — so the 402 response is never reached. With `Query(None)`, the dependency runs
  > and can return 402 as intended.

  ```python
  # backend/app/api/dependencies.py
  from fastapi import Query, HTTPException
  from app.services.reports import check_entitlement

  async def require_entitlement(report_id: str | None = Query(None)):
      """Dependency that verifies report_id has active entitlement.
      Add to premium endpoints via `Depends(require_entitlement)`.
      """
      if not report_id:
          raise HTTPException(status_code=402, detail="Payment required")
      entitled = await check_entitlement(report_id)
      if not entitled:
          raise HTTPException(status_code=402, detail="Payment required")
  ```
- Add `Depends(require_entitlement)` to these premium endpoints in `address.py`:
  - `GET /{vbo_id}/viewing-questions`
  - `GET /{vbo_id}/risk-comparisons`
  - `GET /{vbo_id}/property-warnings`
  - `GET /{vbo_id}/livability`
  - `GET /{vbo_id}/tier-b`
  - `GET /{vbo_id}/building3d`
  - `GET /{vbo_id}/neighborhood3d`
  - `GET /{vbo_id}/wms-tile`
- Endpoints remain callable without `report_id` during the first-dossier-free flow
  by accepting an optional `first_free` query param (validated against a server-side
  flag — see implementation notes below)
- **First-dossier bypass:** For the first-free flow, the frontend sends
  `report_id` from the short report creation (Story 2.1). The backend can
  auto-activate entitlement for first-free reports. This avoids a separate bypass
  mechanism — the first-dossier-free logic in Story 5.3 calls the backend to
  activate entitlement on the report, making it pass `require_entitlement` normally.

**Step 1: Write tests**
```python
# backend/tests/test_server_gating.py
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from contextlib import ExitStack
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db import init_db


@pytest.fixture
async def db_path(tmp_path):
    path = str(tmp_path / "test.db")
    await init_db(path)
    return path


def _gating_patches(db_path):
    stack = ExitStack()
    mock_settings = MagicMock()
    mock_settings.database_path = db_path
    mock_settings.rate_limit_enabled = False
    stack.enter_context(patch("app.config.settings", mock_settings))
    stack.enter_context(patch("app.services.reports.settings", mock_settings))
    return stack


@pytest.mark.asyncio
async def test_premium_endpoint_rejects_without_report_id(db_path):
    """Premium endpoints must return 402 when no report_id provided.
    N1 fix: require_entitlement uses Query(None) so FastAPI doesn't intercept
    with 422 before the dependency body runs."""
    stack = _gating_patches(db_path)
    with stack:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/address/0363010012345678/viewing-questions")
    assert response.status_code == 402


@pytest.mark.asyncio
async def test_premium_endpoint_rejects_unentitled_report(db_path):
    """Premium endpoints must return 402 for unpaid report_id."""
    from app.services.reports import create_report
    rid = await create_report("0363010012345678", "Damrak 1", "short", db_path=db_path)
    stack = _gating_patches(db_path)
    with stack:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/address/0363010012345678/viewing-questions?report_id={rid}"
            )
    assert response.status_code == 402


@pytest.mark.asyncio
async def test_premium_endpoint_allows_entitled_report(db_path):
    """Premium endpoints must allow access with entitled report_id."""
    from app.services.reports import create_report, activate_entitlement
    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)
    await activate_entitlement(rid, db_path=db_path)
    stack = _gating_patches(db_path)
    # Mock the actual data-fetching service so we don't call external APIs
    with stack:
        with patch("app.api.address.get_viewing_questions", new_callable=AsyncMock) as mock_svc:
            mock_svc.return_value = {"questions": []}
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    f"/api/address/0363010012345678/viewing-questions?report_id={rid}"
                )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_free_endpoint_works_without_report_id(db_path):
    """Free endpoints (building, risks, suggest, lookup) must work without report_id."""
    stack = _gating_patches(db_path)
    with stack:
        with patch("app.api.address.get_building_facts", new_callable=AsyncMock) as mock_svc:
            mock_svc.return_value = {"facts": {}}
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get("/api/address/0363010012345678/building")
    assert response.status_code == 200
```

**Step 2: Implement dependency, add to premium endpoints**

**Step 3: Update frontend API calls to include `report_id` query param for premium endpoints**

Modify `frontend/src/services/api.ts` — all premium API functions accept optional `reportId`
parameter and append `?report_id=...` to the URL.

**Step 4: Run full test suite (both backend and frontend), commit**

```bash
cd backend && python -m pytest -x -q -m "not live"
cd frontend && npm run test
```

**Step 5: Commit**
```bash
git add backend/app/api/dependencies.py backend/app/api/address.py backend/tests/test_server_gating.py frontend/src/services/api.ts
git commit -m "feat: add server-side entitlement gating for premium endpoints"
```

**Definition of done:**
- Premium endpoints return 402 without valid entitled `report_id`
- Free endpoints (`building`, `risks`, `suggest`, `lookup`, `neighborhood`) work without `report_id`
- First-dossier-free flow works (entitlement auto-activated on first report)
- Frontend passes `report_id` to all premium API calls
- All existing tests still pass
- `ruff check` passes

---

## Epic 4: Frontend Content Gating

**Why:** The design doc (lines 338-354) defines exactly what's free and what's paid. The frontend must show the free short report immediately, then gate premium sections behind entitlement state. The AttentionSummary badge is always visible (line 341), but individual warning cards are gated (line 351).

### Story 4.1: Entitlement State Management

**Files:**
- Create: `frontend/src/services/entitlement.ts`
- Test: `frontend/src/services/entitlement.test.ts`
- Modify: `frontend/src/services/api.ts` (add report/entitlement API calls)
- Modify: `frontend/src/types/api.ts` (add types)

**Why:** The frontend needs to track whether the current dossier is entitled (paid) or free. This state determines which sections render and whether the upgrade CTA is shown.

**Requirements:**
- Add TypeScript types:
  ```typescript
  interface ShortReportResponse {
    report_id: string;
    report_type: 'short' | 'long';
    already_purchased: boolean;
  }
  interface EntitlementResponse {
    report_id: string;
    entitled: boolean;
    report_type: string;
  }
  ```
- Add API functions: `createShortReport(vboId, addressKey)`, `checkEntitlement(reportId)`, `createCheckoutSession(reportId)`
- `entitlement.ts` exports:
  - `getStoredEntitlement(vboId): { reportId: string; entitled: boolean } | null` — reads from sessionStorage
  - `storeEntitlement(vboId, reportId, entitled): void` — writes to sessionStorage
  - `clearEntitlement(vboId): void`
- SessionStorage key: `buurt-check:entitlement:{vboId}`

**Step 1: Write tests**
```typescript
// frontend/src/services/entitlement.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getStoredEntitlement, storeEntitlement, clearEntitlement } from './entitlement';

describe('entitlement storage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns null when no entitlement stored', () => {
    expect(getStoredEntitlement('0363010012345678')).toBeNull();
  });

  it('stores and retrieves entitlement', () => {
    storeEntitlement('0363010012345678', 'report-123', true);
    const result = getStoredEntitlement('0363010012345678');
    expect(result).toEqual({ reportId: 'report-123', entitled: true });
  });

  it('clears entitlement', () => {
    storeEntitlement('0363010012345678', 'report-123', true);
    clearEntitlement('0363010012345678');
    expect(getStoredEntitlement('0363010012345678')).toBeNull();
  });
});
```

**Step 2: Implement, run tests, commit**

**Definition of done:**
- Entitlement state persisted per-address in sessionStorage
- API functions match backend endpoints
- TypeScript types match backend models
- `npm run build` passes

---

### Story 4.2: Wire Entitlement into App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

**Why:** When an address is selected, create a short report to get a `report_id`. Check if it's already purchased. After Stripe redirect, verify entitlement. This state drives which dossier sections render.

**Requirements:**
- New state variables: `reportId: string | null`, `isEntitled: boolean`
- In `handleAddressSelect`: after address resolves, call `createShortReport(vboId, addressKey)` to get `report_id`
- Store `reportId` in state and sessionStorage
- If `already_purchased === true`: set `isEntitled = true`
- On page load with `?report=...&session_id=...` in hash: call `checkEntitlement(reportId)` to verify
- Pass `isEntitled` down to dossier sections that need gating
- On new address select: clear entitlement for previous address

**Implementation notes:**
- This is a state management change in App.tsx — follows existing patterns (useState + IIFE for async)
- The `handleAddressSelect` callback (currently at ~line 1560 in App.tsx) already fires parallel IIFEs for risks, stats, etc. Add one more for the short report creation
- Check for `?report=` and `?session_id=` in `parseHashRoute` function

**Definition of done:**
- `reportId` populated after address select
- `isEntitled` correctly reflects payment state
- Post-checkout redirect triggers entitlement verification
- Existing dossier flow unbroken (free report still works identically)

---

### Story 4.3: Gate Premium Dossier Sections

**Files:**
- Modify: `frontend/src/App.tsx` (conditional rendering)
- Create: `frontend/src/components/LockedSection.tsx`
- Create: `frontend/src/components/LockedSection.css`
- Test: `frontend/src/components/LockedSection.test.tsx`

**Why:** Design doc lines 338-354 define the free/paid split. Free users see risk tile scores and AttentionSummary badge but not detail views, warning cards, viewing questions, or PDF export.

**Requirements:**
- **Always free (shown to all users):**
  - BuildingFootprintMap
  - AttentionSummary (badge + flag count — but NOT individual flag labels for non-entitled)
  - AddressHeader + coverage strip
  - SummaryStrip (risk score pills)
  - BuildingFactsCard
  - RiskTilesGrid (2x2 scores + severity labels + one-line summary)
  - NeighborhoodStatsCard (summary level — already shows just indicators)
- **Premium (gated behind `isEntitled`):**
  - RiskDetailView (tap-to-expand on risk tiles)
  - PropertyWarningsCard (individual warning cards)
  - SoilInfoCard
  - LivabilityCard + LivabilityDetailView
  - NeighborhoodViewer3D + ShadowTimeSlider + ShadowSnapshots + SunlightRiskCard
  - TierBSignalsCard
  - ViewingChecklist
  - PDF export (full_dossier template)
  - Compare (side-by-side)
- `LockedSection` component:
  - Shows blurred/faded placeholder with lock icon
  - Text: "Unlock full dossier to see [section name]"
  - Tapping opens upgrade flow (calls `onUpgrade` prop)
  - Uses `--color-surface` background with `opacity: 0.6` overlay
  - Accessible: `aria-label` describing locked state

**Design contract for LockedSection:**
```
+----------------------------------+
|  [lock icon]                     |
|  Unlock full dossier             |
|  to see property warnings        |
|                                  |
|  [Unlock for EUR 14.99]  button  |
+----------------------------------+
```

**Step 1: Write tests for LockedSection**
```typescript
// frontend/src/components/LockedSection.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LockedSection from './LockedSection';

describe('LockedSection', () => {
  it('renders lock message with section name', () => {
    render(<LockedSection sectionName="property warnings" onUpgrade={vi.fn()} />);
    expect(screen.getByText(/property warnings/)).toBeInTheDocument();
  });

  it('calls onUpgrade when CTA clicked', () => {
    const onUpgrade = vi.fn();
    render(<LockedSection sectionName="property warnings" onUpgrade={onUpgrade} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onUpgrade).toHaveBeenCalledOnce();
  });

  it('has accessible label', () => {
    render(<LockedSection sectionName="property warnings" onUpgrade={vi.fn()} />);
    expect(screen.getByRole('region')).toHaveAttribute('aria-label');
  });
});
```

**Step 2: Implement `LockedSection.tsx`**

**Step 3: In App.tsx, wrap premium sections with conditional:**
```tsx
{isEntitled ? (
  <PropertyWarningsCard ... />
) : (
  <LockedSection sectionName={t('premium.section.warnings')} onUpgrade={handleUpgrade} />
)}
```

**Step 4: Run tests, commit**

**Definition of done:**
- Free sections always visible
- Premium sections show `LockedSection` when not entitled
- LockedSection is accessible and tappable
- i18n keys added for section names
- `npm run build` passes
- Existing E2E section order test updated

---

## Epic 5: Upgrade CTA & Conversion UX

**Why:** The design doc (lines 356-368) specifies the exact conversion flow. The upgrade CTA is the critical conversion point — it must communicate value clearly and lead to a frictionless checkout.

### Story 5.1: UpgradeCTA Component

**Files:**
- Create: `frontend/src/components/UpgradeCTA.tsx`
- Create: `frontend/src/components/UpgradeCTA.css`
- Test: `frontend/src/components/UpgradeCTA.test.tsx`

**Why:** This is the primary conversion element. It shows between the free and locked sections, communicating what the full dossier adds. Design doc line 351: "Upgrade CTA clearly shows what the long dossier adds."

**Requirements:**
- Positioned after RiskTilesGrid, before the first locked section
- Shows:
  - "Unlock the full dossier" heading
  - Bullet list of what's included (warning details, viewing questions, 3D analysis, PDF export, compare)
  - Price: "EUR 14.99 — one-time, for this address"
  - Primary CTA button: "Unlock full dossier" (Arctic Teal filled)
  - Subtle reassurance: "No account needed. Instant access."
- Fires `trackEvent('upgrade_cta_viewed')` when entering viewport (IntersectionObserver)
- Fires `trackEvent('upgrade_cta_clicked')` on button click
- Props: `onUpgrade: () => void`, `price: string`
- Responsive: full-width card in dossier flow
- Follows Polar Frost design tokens

**Step 1: Write tests**

**Step 2: Implement component**

**Step 3: Wire into App.tsx** — render between free and locked sections when `!isEntitled`

**Step 4: Run tests, commit**

**Definition of done:**
- CTA visible to free users in correct position
- Analytics events fire on view and click
- i18n keys for all text (EN + NL)
- Accessible
- Hidden when entitled

---

### Story 5.2: Checkout Flow Integration

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/services/api.ts`

**Why:** When the user clicks "Unlock full dossier", the frontend must create a checkout session and redirect to Stripe. On return, verify the entitlement and unlock the dossier.

**Requirements:**
- `handleUpgrade` callback:
  1. `trackEvent('checkout_started')`
  2. Call `createCheckoutSession(reportId)` → gets `checkout_url`
  3. `window.location.href = checkout_url` (Stripe redirect)
- On return from Stripe (URL has `?report=...&session_id=...`):
  1. Parse `report` and `session_id` from hash params
  2. Call `checkEntitlement(reportId)`
  3. If entitled: `trackEvent('dossier_unlocked')`, set `isEntitled = true`, show toast "Dossier unlocked!"
  4. If not entitled yet (webhook delay): poll up to 3 times with 2s interval, then show "Processing payment..." message
  5. If still not entitled after polling: show "Payment received — your dossier will unlock shortly. Refresh in a moment."
- Error handling: if checkout session creation fails, show toast with human-friendly message

**Definition of done:**
- Full checkout flow works: click CTA → Stripe → redirect back → dossier unlocked
- Polling handles webhook delay gracefully
- Analytics events at each stage
- Error states handled with user-friendly messages
- No account creation needed

---

### Story 5.3: First-Dossier Free Rule

**Files:**
- Create: `frontend/src/services/firstDossier.ts`
- Test: `frontend/src/services/firstDossier.test.ts`
- Modify: `frontend/src/App.tsx`

**Why:** Design doc line 354: "First full dossier is completely ungated (per `ui-principles.md` Section 13)." This is the try-before-buy mechanism. First-time users see the full dossier without paying, establishing trust and demonstrating value.

**Requirements:**
- `localStorage` key: `buurt-check:first-dossier-used`
- `isFirstDossierAvailable(): boolean` — true if key is not set
- `markFirstDossierUsed(): void` — sets the key
- In App.tsx: if `isFirstDossierAvailable()`, set `isEntitled = true` for the first address and call `markFirstDossierUsed()` after dossier renders
- On second address: normal freemium gating applies

**Step 1: Write tests**
```typescript
describe('firstDossier', () => {
  beforeEach(() => localStorage.clear());

  it('first dossier is available by default', () => {
    expect(isFirstDossierAvailable()).toBe(true);
  });

  it('not available after marked used', () => {
    markFirstDossierUsed();
    expect(isFirstDossierAvailable()).toBe(false);
  });
});
```

**Step 2: Implement, wire into App.tsx, commit**

**Definition of done:**
- First address gets full dossier free
- Second address triggers freemium gating
- Flag persists across sessions (localStorage)

---

## Epic 6: End-to-End Integration & Polish

**Why:** Individual pieces need to work together. Analytics events need to fire at the right moments. i18n needs both EN and NL. Edge cases (double-click, page refresh during checkout, back button from Stripe) need handling.

### Story 6.1: i18n Keys for Premium Features

**Files:**
- Modify: `frontend/src/i18n/en.json`
- Modify: `frontend/src/i18n/nl.json`

**Why:** All new user-facing strings need both EN and NL translations. The design doc text provides EN copy; NL translations need to match tone and meaning.

**Requirements — new keys (~30):**
```
premium.upgrade.title — "Unlock the full dossier"
premium.upgrade.subtitle — "One-time payment for this address"
premium.upgrade.price — "EUR {{price}}"
premium.upgrade.cta — "Unlock full dossier"
premium.upgrade.reassurance — "No account needed. Instant access."
premium.upgrade.includes.warnings — "Detailed property warning cards"
premium.upgrade.includes.viewing — "Personalized viewing questions"
premium.upgrade.includes.3d — "3D building analysis & sunlight"
premium.upgrade.includes.pdf — "PDF export for your records"
premium.upgrade.includes.compare — "Side-by-side address comparison"
premium.locked.title — "This section is part of the full dossier"
premium.locked.cta — "Unlock for EUR {{price}}"
premium.section.warnings — "property warnings"
premium.section.soil — "soil information"
premium.section.livability — "livability analysis"
premium.section.3d — "3D building analysis"
premium.section.sunlight — "sunlight analysis"
premium.section.tierb — "energy & crime data"
premium.section.viewing — "viewing questions"
premium.checkout.processing — "Processing payment..."
premium.checkout.success — "Dossier unlocked!"
premium.checkout.delayed — "Payment received — your dossier will unlock shortly."
premium.checkout.failed — "Payment could not be completed. Please try again."
premium.first_free — "Your first full dossier is free!"
```

**Definition of done:**
- Both en.json and nl.json updated
- Key count parity maintained (existing test enforces this)
- NL translations are natural Dutch, not machine-translated

---

### Story 6.2: Analytics Event Instrumentation

**Files:**
- Modify: `frontend/src/App.tsx` (add `trackEvent` calls at funnel points)
- Modify: `frontend/src/components/AddressSearch.tsx`
- Modify: `frontend/src/components/UpgradeCTA.tsx`
- Modify: `frontend/src/components/ExportBottomSheet.tsx`

**Why:** Design doc lines 452-468 list 14 specific events. Without these, revenue debugging is impossible.

**Requirements — instrument these events:**
- `address_search_submitted` — in AddressSearch when user selects an address
- `short_report_generated` — in App.tsx after `createShortReport` succeeds
- `upgrade_cta_viewed` — in UpgradeCTA via IntersectionObserver
- `upgrade_cta_clicked` — in UpgradeCTA on button click
- `checkout_started` — in handleUpgrade before redirect
- `checkout_completed` — after successful entitlement check post-redirect
- `checkout_failed` — on checkout session creation error
- `dossier_unlocked` — when entitlement verified true
- `pdf_export_clicked` — in ExportBottomSheet on generate button
- `pdf_export_completed` — after PDF blob received
- `report_generation_failed` — on API error during dossier data fetch
- `3d_view_opened` — when NeighborhoodViewer3D mounts with data
- `3d_view_failed` — on 3D viewer error
- `slow_report_generation` — if building facts take > 5s

**Definition of done:**
- All 14 events instrumented
- Each event fires exactly once per occurrence
- Properties include relevant context (report_id, vbo_id where applicable)
- Console output visible in dev mode

---

### Story 6.3: Edge Case Handling

**Files:**
- Modify: `frontend/src/App.tsx`
- Test: edge case scenarios

**Why:** Payment flows have failure modes that standard app flows don't. These must be handled gracefully.

**Requirements:**
- **Double-click on upgrade CTA:** Boolean guard (`isCheckingOut` state) disables button after first click
- **Page refresh during checkout:** On mount, if URL has `?report=...` but no `session_id`, re-check entitlement for that report
- **Back button from Stripe:** User returns to dossier without completing payment. No state change needed — dossier stays in free mode
- **Webhook delay:** Post-redirect polling (Story 5.2) handles this. After 3 attempts, show explanatory message
- **Network error during checkout session creation:** Toast with "Could not start checkout. Please try again."
- **Expired checkout session:** User returns with old `session_id`. Entitlement check returns false → show "Payment was not completed" message

**Definition of done:**
- No double-purchase possible
- All error paths show user-friendly messages
- No broken state on any navigation path

---

### Story 6.4: Pricing Configuration

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/app/api/billing.py` (add `GET /api/pricing` endpoint, M2 fix)
- Create: `frontend/src/config/pricing.ts`
- Modify: `frontend/src/components/UpgradeCTA.tsx`
- Modify: `frontend/src/components/LockedSection.tsx`
- Modify: `frontend/src/App.tsx` (call `fetchPrice()` on mount)

**Why:** Design doc line 375: "Store pricing config in one place so you can test EUR 9.99 / 14.99 / 19.99 without touching entitlement logic."

**Requirements:**

> **M2 fix:** Frontend and backend have separate price env vars (`BUURT_STRIPE_PRICE_CENTS`
> and `VITE_DOSSIER_PRICE_EUR`). Changing one without the other means the CTA shows one price
> but Stripe charges another. Fix: add a `GET /api/pricing` endpoint that returns the
> authoritative price from the backend. Frontend fetches this on app init and uses it for all
> display. The `VITE_DOSSIER_PRICE_EUR` env var becomes a fallback only (for SSR/initial
> render before the API responds).

- Backend: `BUURT_STRIPE_PRICE_CENTS = 1499` (already in Story 3.1)
- **New endpoint:** `GET /api/pricing` returns `{ price_cents: 1499, price_eur: "14.99", currency: "EUR" }`. Derives `price_eur` from `price_cents` (`price_cents / 100`). No auth required.
- Frontend: `VITE_DOSSIER_PRICE_EUR = "14.99"` env var as **fallback only**
- `frontend/src/config/pricing.ts`:
  ```typescript
  // Fallback price for initial render (before API response)
  const FALLBACK_PRICE = import.meta.env.VITE_DOSSIER_PRICE_EUR || '14.99';

  let _cachedPrice: string = FALLBACK_PRICE;

  export async function fetchPrice(): Promise<string> {
    try {
      const res = await fetch('/api/pricing');
      if (res.ok) {
        const data = await res.json();
        _cachedPrice = data.price_eur;
      }
    } catch { /* use fallback */ }
    return _cachedPrice;
  }

  export function getDossierPrice(): string { return _cachedPrice; }
  export function getDossierPriceDisplay(): string { return `€${_cachedPrice}`; }
  ```
- Call `fetchPrice()` in App.tsx on mount (non-blocking — display uses fallback until resolved)
- All price displays read from `getDossierPriceDisplay()`, not hardcoded
- Changing price requires updating **one** env var: `BUURT_STRIPE_PRICE_CENTS` on the backend. Frontend auto-syncs via API.

**Definition of done:**
- `GET /api/pricing` returns current price derived from backend config
- Frontend fetches price on init, falls back to env var
- Price configurable via single backend env var
- No hardcoded price strings in components

---

### Story 6.5: README & Environment Setup

**Files:**
- Modify: `backend/.env.example` (create if doesn't exist)
- Modify: `frontend/.env.example` (create if doesn't exist)

**Why:** Design doc line 5 in Tier 0: "README update for payment/env/webhook setup." Developers need to know how to configure Stripe, Sentry, and the database.

**Requirements:**
- Document all new env vars:
  ```
  # Backend
  BUURT_STRIPE_SECRET_KEY=sk_test_...
  BUURT_STRIPE_WEBHOOK_SECRET=whsec_...
  BUURT_STRIPE_PRICE_CENTS=1499
  BUURT_BASE_URL=http://localhost:5173
  BUURT_DATABASE_PATH=buurt_check.db
  BUURT_SENTRY_DSN=
  BUURT_SENTRY_ENVIRONMENT=dev

  # Frontend
  VITE_SENTRY_DSN=
  VITE_SENTRY_ENVIRONMENT=dev
  VITE_DOSSIER_PRICE_EUR=14.99
  ```
- Document Stripe webhook setup for local dev (Stripe CLI: `stripe listen --forward-to localhost:8000/api/billing/webhook`)
- Document the first-dossier-free behavior

**Definition of done:**
- All env vars documented
- Local development setup instructions work
- Stripe CLI webhook forwarding documented

---

### Story 6.6: Update CLAUDE.md & MEMORY.md (D3 fix)

**Files:**
- Modify: `CLAUDE.md`
- Modify: `backend/CLAUDE.md`
- Modify: `frontend/CLAUDE.md`
- Modify: `C:\Users\milos\.claude\projects\D--buurt-check\memory\MEMORY.md`

**Why (D3):** CLAUDE.md is the project's ground truth for AI-assisted development. Phase 2
introduces the first database, a payment system, new API routers, new env vars, and new
dependencies — none of which are documented in CLAUDE.md today. Without updating these files,
future sessions will make incorrect assumptions about the architecture (e.g., "no database",
"stateless aggregator only").

**Requirements — update each file with:**

**`CLAUDE.md` (root):**
- Update "Tech stack" table: add `aiosqlite`, `stripe`, `sentry-sdk[fastapi]`, `@sentry/react`
- Update "Architecture decisions": note that a SQLite database now exists for report entitlements
  (still stateless for external data — no user accounts)
- Update "Commands": note `BUURT_STRIPE_SECRET_KEY` etc. are required for payment features
- Update "Project structure": add `app/db.py`, `app/api/billing.py`, `app/api/reports.py`,
  `app/api/dependencies.py`, `app/models/report.py`, `frontend/src/services/entitlement.ts`,
  `frontend/src/services/firstDossier.ts`, `frontend/src/config/pricing.ts`
- Add new anti-patterns:
  - "Frontend-only content gating without server-side entitlement check → always use `require_entitlement` dependency on premium endpoints"
  - "Synchronous Stripe SDK calls in async handlers → always use `asyncio.to_thread()` (C4-R)"
  - "`Query(...)` in FastAPI dependencies that need custom error codes → use `Query(None)` + manual check (N1)"
  - "Separate frontend/backend price env vars → single source of truth via `GET /api/pricing` (M2)"
- Update test baselines to reflect new test counts

**`backend/CLAUDE.md`:**
- Add endpoints: `POST /reports/short`, `GET /reports/{id}/entitlement`,
  `POST /billing/checkout-session`, `POST /billing/webhook`
- Add conventions: SQLite with WAL mode, `aiosqlite` context manager, entitlement gating via
  `Depends(require_entitlement)`, Stripe webhook idempotency
- Add cache section: report entitlements are NOT cached (always read from DB for consistency)
- Update test baseline

**`frontend/CLAUDE.md`:**
- Add "Entitlement & gating" section: `isEntitled` state, `LockedSection` component,
  first-dossier-free rule, `report_id` passed to premium API calls
- Add "Checkout flow" section: redirect to Stripe, post-redirect polling, analytics events
- Update i18n key count to reflect `premium.*` keys

**`MEMORY.md`:**
- Update "Project Status" section with Phase 2 completion
- Add "Payment & Entitlement" section with key patterns
- Update dependency list and test baselines

**Step 1: Read current state of each file**

**Step 2: Apply edits — surgical additions only, no reformatting existing content**

**Step 3: Verify no duplicate or contradictory entries**

**Step 4: Commit**
```bash
git add CLAUDE.md backend/CLAUDE.md frontend/CLAUDE.md
git commit -m "docs: update CLAUDE.md files with Phase 2 architecture changes"
```

**Definition of done:**
- All four doc files updated with Phase 2 changes
- No contradictions with existing content
- Future Claude sessions will correctly understand the app has a database and payment system
- Test baselines accurate

---

## Quality Gates (Phase 2 Complete)

Before merging Phase 2:

- [ ] All existing backend tests pass (baseline: 466+)
- [ ] All existing frontend tests pass (baseline: 572+)
- [ ] New backend tests: +25 minimum (db, reports, billing, export entitlement, server gating)
- [ ] New frontend tests: +15 minimum (entitlement, LockedSection, UpgradeCTA, analytics, first-dossier)
- [ ] `ruff check` clean
- [ ] `npm run build` clean
- [ ] en.json and nl.json key counts match
- [ ] Free short report shows: map, building facts, risk tiles, attention badge, neighborhood stats
- [ ] Premium sections show LockedSection when not entitled
- [ ] **Server-side gating:** Premium endpoints return 402 (not 422) without entitled `report_id` (D1, N1)
- [ ] **Server-side gating:** Free endpoints work without `report_id`
- [ ] First dossier is completely free
- [ ] Second dossier triggers upgrade CTA
- [ ] **Stripe checkout uses `asyncio.to_thread`** — not blocking the event loop (C4-R)
- [ ] Stripe checkout creates session and redirects
- [ ] Webhook unlocks entitlement and sets `provider="stripe"` (D5)
- [ ] Webhook revokes entitlement on refund (D2)
- [ ] Post-redirect verification works (including polling for webhook delay)
- [ ] PDF full_dossier export gated by entitlement
- [ ] All 14 analytics events fire correctly
- [ ] Sentry captures errors in dev/staging
- [ ] Analytics uses static Sentry import (M3)
- [ ] Double-click prevention on all payment buttons
- [ ] **Pricing: `GET /api/pricing` returns authoritative price** from backend (M2)
- [ ] Frontend price display syncs from backend API, not hardcoded (M2)
- [ ] **Rate limiters wired:** `@limiter.limit("10/minute")` on POST /reports/short, `@limiter.limit("5/minute")` on POST /billing/checkout-session (D4)
- [ ] `store_provider_session` used instead of `update_payment_status` for session ID storage (C4-B)
- [ ] CLAUDE.md, backend/CLAUDE.md, frontend/CLAUDE.md updated with Phase 2 changes (D3)

---

## Dependency Graph

```
Epic 0 (Observability) ←── no dependencies, start immediately
    ├── Story 0.1: Backend Sentry
    ├── Story 0.2: Frontend Sentry
    └── Story 0.3: Analytics Event Bus

Epic 1 (Database) ←── no dependencies, can parallel with Epic 0
    ├── Story 1.1: SQLite Setup
    └── Story 1.2: Report Repository ←── depends on 1.1

Epic 2 (Report Endpoints) ←── depends on Epic 1
    ├── Story 2.1: Short Report Endpoint ←── depends on 1.2
    └── Story 2.2: Entitlement Check ←── depends on 1.2

Epic 3 (Stripe + Server Gating) ←── depends on Epic 1 + 2
    ├── Story 3.1: Checkout Session ←── depends on 1.2
    ├── Story 3.2: Webhook Handler ←── depends on 1.2
    ├── Story 3.3: Gated Export ←── depends on 1.2
    └── Story 3.4: Server-Side Gating ←── depends on 1.2, 2.2

Epic 4 (Frontend Gating) ←── depends on Epic 2 + 3.4
    ├── Story 4.1: Entitlement State ←── depends on 2.1, 2.2, 3.4 (API fns send report_id)
    ├── Story 4.2: Wire into App.tsx ←── depends on 4.1
    └── Story 4.3: Gate Premium Sections ←── depends on 4.2

Epic 5 (Upgrade CTA) ←── depends on Epic 3 + 4
    ├── Story 5.1: UpgradeCTA Component ←── depends on 4.3
    ├── Story 5.2: Checkout Flow ←── depends on 3.1, 4.2
    └── Story 5.3: First-Dossier Free ←── depends on 4.2

Epic 6 (Integration) ←── depends on all above
    ├── Story 6.1: i18n Keys ←── depends on 4.3, 5.1
    ├── Story 6.2: Analytics Instrumentation ←── depends on 0.3, 5.2
    ├── Story 6.3: Edge Cases ←── depends on 5.2
    ├── Story 6.4: Pricing Config ←── depends on 3.1, 5.1
    ├── Story 6.5: README ←── depends on all stories
    └── Story 6.6: CLAUDE.md Update ←── last (after all code changes)
```

**Parallelizable work:** Epic 0 and Epic 1 can run simultaneously. Within Epic 0, all 3 stories are independent. Within Epic 3, stories 3.1 and 3.2 can be developed in parallel.

---

## Explicit Exclusions (from design doc lines 413-420)

Do NOT build any of the following in this phase:
- Subscriptions or recurring billing
- Billing portal or invoice admin
- User accounts or identity/auth flows
- Credits, wallet, or coupon engine
- Custom payment gateway
- "Universal entitlements platform"
- PDF customization settings panel

---

## New Dependencies

| Package | Side | Purpose | Version |
|---------|------|---------|---------|
| `sentry-sdk[fastapi]` | Backend | Error monitoring | latest |
| `stripe` | Backend | Payment processing | latest |
| `aiosqlite` | Backend | Async SQLite access | latest |
| `@sentry/react` | Frontend | Error monitoring | latest |

No other new dependencies. All frontend gating uses existing React + CSS tokens + i18n.
