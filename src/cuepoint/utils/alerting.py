#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Alerting Hooks for Repeated Failures (Design 7)

Opt-in callbacks when failure count exceeds threshold.
"""

import logging
from typing import Callable, List, Optional

logger = logging.getLogger(__name__)

# Registered hooks (opt-in); called when threshold exceeded
_alert_hooks: List[Callable[[str, int, Optional[str]], None]] = []
_failure_counts: dict = {}
_default_threshold = 5


def register_alert_hook(callback: Callable[[str, int, Optional[str]], None]) -> None:
    """Register opt-in alert callback. Called with (service_name, failure_count, detail)."""
    if callback not in _alert_hooks:
        _alert_hooks.append(callback)


def unregister_alert_hook(callback: Callable[[str, int, Optional[str]], None]) -> None:
    """Unregister alert callback."""
    if callback in _alert_hooks:
        _alert_hooks.remove(callback)


def record_failure(service_name: str, detail: Optional[str] = None) -> None:
    """Record a failure. If count exceeds threshold, invoke hooks (if enabled)."""
    _failure_counts[service_name] = _failure_counts.get(service_name, 0) + 1
    count = _failure_counts[service_name]
    if count >= _default_threshold and _alert_hooks:
        for hook in _alert_hooks:
            try:
                hook(service_name, count, detail)
            except Exception as e:
                logger.warning("Alert hook failed: %s", e)


def reset_failure_count(service_name: Optional[str] = None) -> None:
    """Reset failure count for service or all."""
    if service_name is None:
        _failure_counts.clear()
    elif service_name in _failure_counts:
        del _failure_counts[service_name]


def get_failure_count(service_name: str) -> int:
    """Get current failure count for service."""
    return _failure_counts.get(service_name, 0)


def is_alerting_enabled() -> bool:
    """True if any hooks are registered (opt-in)."""
    return len(_alert_hooks) > 0
