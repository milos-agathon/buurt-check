import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.router import router
from app.config import settings
from app.db import database_backend_label, init_db
from app.rate_limit import limiter
from app.sentry_setup import init_sentry

logger = logging.getLogger(__name__)
_access = logging.getLogger("buurt.access")
_NATIVE_APP_CORS_ORIGINS = (
    "capacitor://localhost",
    "http://localhost",
)

init_sentry()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("Persistence backend ready: %s", database_backend_label())
    yield


app = FastAPI(
    title="buurt-check API",
    version="0.1.0",
    description="Pre-viewing intelligence for property buyers in the Netherlands",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


def _resolved_cors_origins() -> list[str]:
    origins = [origin.rstrip("/") for origin in settings.cors_origins if origin.strip()]
    origins.extend(_NATIVE_APP_CORS_ORIGINS)
    deduped: list[str] = []
    for origin in origins:
        if origin not in deduped:
            deduped.append(origin)
    return deduped

app.add_middleware(
    CORSMiddleware,
    allow_origins=_resolved_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)
# SlowAPIMiddleware added last = outermost, so GZip can still measure response
# sizes before compressing (SlowAPIMiddleware StreamingResponse wrapping doesn't
# interfere with GZip's minimum_size check).
app.add_middleware(SlowAPIMiddleware)

app.include_router(router)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = (time.monotonic() - start) * 1000
    _access.info(
        "%s %s %d %.0fms",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/health/forge3d")
async def health_forge3d():
    """Report forge3d renderer availability (always returns 200)."""
    from app.config import settings
    from app.services.forge3d_renderer import get_forge3d_status

    status = get_forge3d_status()
    return {
        "enabled": settings.forge3d_enabled,
        **status,
    }
