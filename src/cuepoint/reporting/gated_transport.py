"""The SDK's HTTP transport, checking REPORT-01's flag as an envelope is about to leave.

``before_send`` runs when an event is captured; the transport sends from a worker thread a
moment later. Checking again here means turning reporting off drops what is still queued, so
nothing is sent after the switch is off and nothing is kept for later (DEC-128).

Imports ``sentry_sdk``, so only :func:`~cuepoint.reporting.engine_reporting.setup_engine_reporting`
loads it, and only when a DSN is set.
"""

from __future__ import annotations

from typing import Any

from sentry_sdk.transport import HttpTransport

from cuepoint.engine.reporting_api import reporting_enabled


class GatedHttpTransport(HttpTransport):
    """``HttpTransport`` that sends nothing while the flag is off."""

    def _send_envelope(self, envelope: Any) -> None:
        if not reporting_enabled():
            return
        super()._send_envelope(envelope)
