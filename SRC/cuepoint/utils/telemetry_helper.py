#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Telemetry Helper (Step 14)

Safe access to telemetry service for instrumentation.
Returns a no-op when service is unavailable.
"""

from __future__ import annotations

from typing import Any, Dict, Optional


class _NoOpTelemetry:
    """No-op telemetry when service unavailable."""

    def track(
        self, event_name: str, properties: Optional[Dict[str, Any]] = None
    ) -> None:
        pass

    def flush(self) -> None:
        pass

    def delete_local_data(self) -> None:
        pass


_noop = _NoOpTelemetry()


def get_telemetry() -> Any:
    """Get telemetry service from DI container, or no-op if unavailable."""
    try:
        from cuepoint.services.interfaces import ITelemetryService
        from cuepoint.utils.di_container import get_container

        container = get_container()
        if container.is_registered(ITelemetryService):
            return container.resolve(ITelemetryService)
    except Exception:
        pass
    return _noop
