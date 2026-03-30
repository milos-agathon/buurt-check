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
    # TODO(Epic 3): Tag transactions with report_type when report endpoints exist.
    # Use sentry_sdk.set_tag("report_type", ...) in the billing/reports router.
    logger.info("Sentry initialized (env=%s)", settings.sentry_environment)


def capture_message(
    message: str,
    *,
    level: str = "info",
    tags: dict[str, str] | None = None,
) -> None:
    if not settings.sentry_dsn or not _HAS_SENTRY or sentry_sdk is None:
        return

    with sentry_sdk.push_scope() as scope:
        for key, value in (tags or {}).items():
            scope.set_tag(key, value)
        sentry_sdk.capture_message(message, level=level)
