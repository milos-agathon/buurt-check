from unittest.mock import patch


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


def test_sentry_skipped_when_sdk_not_installed():
    """Sentry should gracefully skip when sentry-sdk is not installed."""
    with patch("app.sentry_setup.settings") as mock_settings, \
         patch("app.sentry_setup._HAS_SENTRY", False), \
         patch("app.sentry_setup.sentry_sdk", None):
        mock_settings.sentry_dsn = "https://examplePublicKey@o0.ingest.sentry.io/0"
        from app.sentry_setup import init_sentry
        init_sentry()
        # Should not crash — just log and return
