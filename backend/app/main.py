import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.router import router
from app.config import settings
from app.rate_limit import limiter
from app.sentry_setup import init_sentry

_access = logging.getLogger("buurt.access")

init_sentry()

app = FastAPI(
    title="buurt-check API",
    version="0.1.0",
    description="Pre-viewing intelligence for property buyers in the Netherlands",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
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
        "%s %s %s %.0fms",
        duration_ms,
        request.method,
        request.url.path,
        response.status_code,
    )
    return response


@app.get("/health")
async def health():
    return {"status": "ok"}
