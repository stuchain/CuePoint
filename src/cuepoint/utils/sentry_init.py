#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Sentry initialization for automatic error reporting.

Initializes the Sentry SDK when a DSN is available (env SENTRY_DSN or
default below). Captures unhandled exceptions, ERROR/WARNING logs, and
(when consent is given) sends them to Sentry with full analytic context:
stack traces, local variables, source context, breadcrumbs, and build/env
tags. Use init_sentry_early() right after the crash handler so import-time
and startup errors are also captured.
"""

import logging
import os
import platform
import sys
from typing import Callable, Optional

logger = logging.getLogger(__name__)

# Default DSN for CuePoint Sentry project. Safe to ship (only allows sending events).
# Override with SENTRY_DSN environment variable if needed.
DEFAULT_SENTRY_DSN = (
    "https://f6809b0fe8cdd6674bccbe0c87fd9535@o4510867725746176.ingest.de.sentry.io/4510867733217360"
)


def _consent_allowed() -> bool:
    """Return True if user has consented to error reporting (when QApplication exists)."""
    try:
        from PySide6.QtWidgets import QApplication

        if QApplication.instance() is None:
            return True  # Early crash before GUI; allow send when DSN is set
        from cuepoint.utils.error_reporting_prefs import ErrorReportingPrefs

        prefs = ErrorReportingPrefs()
        return prefs.is_enabled() and prefs.has_user_consented()
    except Exception:
        return False


def _get_analytic_context() -> tuple[dict, dict]:
    """Return (tags, extra) for full analytic context on every Sentry event."""
    tags = {
        "platform": platform.system(),
        "platform_release": platform.release(),
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "machine": platform.machine(),
        "frozen": str(getattr(sys, "frozen", False)),
    }
    extra = {}
    try:
        from cuepoint.version import get_build_info

        build_info = get_build_info()
        extra["build"] = build_info
        if build_info.get("commit_sha"):
            tags["commit_sha"] = build_info.get("short_commit_sha") or build_info.get("commit_sha", "")[:8]
        if build_info.get("build_number"):
            tags["build_number"] = str(build_info["build_number"])
    except Exception:
        pass
    return tags, extra


def init_sentry_early() -> bool:
    """Initialize Sentry as early as possible (call right after CrashHandler).

    Uses SENTRY_DSN only. Consent is enforced in before_send: once
    QApplication exists, events are dropped unless the user has consented;
    before that (e.g. import/startup crash), events are sent so early
    failures are captured.

    Returns:
        True if Sentry was initialized, False otherwise.
    """
    dsn = os.environ.get("SENTRY_DSN", "").strip() or DEFAULT_SENTRY_DSN
    if not dsn:
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.logging import LoggingIntegration
    except ImportError:
        logger.debug("sentry_sdk not installed; Sentry disabled")
        return False

    try:
        from cuepoint.version import get_version

        release = get_version()
    except ImportError:
        release = "unknown"

    env = "development" if os.environ.get("CUEPOINT_DEV") else "production"

    # Send WARNING and ERROR logs as Sentry events; INFO as breadcrumbs
    logging_integration = LoggingIntegration(
        level=logging.INFO,
        event_level=logging.WARNING,
    )

    def before_send(event, hint):
        if not _consent_allowed():
            return None
        tags, extra = _get_analytic_context()
        if event.get("tags") is None:
            event["tags"] = {}
        event["tags"].update(tags)
        if event.get("extra") is None:
            event["extra"] = {}
        event["extra"].update(extra)
        return event

    sentry_sdk.init(
        dsn=dsn,
        release=release,
        environment=env,
        # Full analytic: attach stack traces to all events, local vars, source context
        attach_stacktrace=True,
        include_local_variables=True,
        include_source_context=True,
        max_breadcrumbs=200,
        traces_sample_rate=0.0,
        profiles_sample_rate=0.0,
        send_default_pii=False,
        integrations=[logging_integration],
        before_send=before_send,
    )
    logger.info("Sentry error reporting initialized")
    return True


def init_sentry(
    release: Optional[str] = None,
    consent_check: Optional[Callable[[], bool]] = None,
) -> bool:
    """Initialize Sentry if DSN is set and consent is given.

    Prefer init_sentry_early() so import/startup errors are captured.
    This is used when starting after QApplication exists and you have
    a consent_check callable.

    Args:
        release: App version string (e.g. from get_version()).
        consent_check: Callable that returns True if user has consented
            to error reporting. If None, Sentry is inited whenever DSN is set.

    Returns:
        True if Sentry was initialized, False otherwise.
    """
    dsn = os.environ.get("SENTRY_DSN", "").strip() or DEFAULT_SENTRY_DSN
    if not dsn:
        return False

    if consent_check is not None and not consent_check():
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.logging import LoggingIntegration
    except ImportError:
        logger.debug("sentry_sdk not installed; Sentry disabled")
        return False

    try:
        from cuepoint.version import get_version
    except ImportError:

        def get_version():
            return "unknown"

    env = "development" if os.environ.get("CUEPOINT_DEV") else "production"
    logging_integration = LoggingIntegration(
        level=logging.INFO,
        event_level=logging.WARNING,
    )

    def before_send_with_context(event, hint):
        tags, extra = _get_analytic_context()
        if event.get("tags") is None:
            event["tags"] = {}
        event["tags"].update(tags)
        if event.get("extra") is None:
            event["extra"] = {}
        event["extra"].update(extra)
        return event

    sentry_sdk.init(
        dsn=dsn,
        release=release or get_version(),
        environment=env,
        attach_stacktrace=True,
        include_local_variables=True,
        include_source_context=True,
        max_breadcrumbs=200,
        traces_sample_rate=0.0,
        profiles_sample_rate=0.0,
        send_default_pii=False,
        integrations=[logging_integration],
        before_send=before_send_with_context,
    )
    logger.info("Sentry error reporting initialized")
    return True
