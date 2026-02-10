#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Centralized retry/backoff policy for reliability (Design 5.1, 5.6, 5.37, 5.113).

Single source for max_retries, base delay, and jitter. Used by network-facing
services so config (reliability.max_retries, etc.) drives behavior.
"""

import random
import time
from typing import Any, Callable, Optional, TypeVar

T = TypeVar("T")


def get_retry_config(
    config_service: Optional[Any] = None,
    max_retries: Optional[int] = None,
    base_delay: float = 0.5,
    jitter_range: float = 0.25,
) -> dict:
    """Build retry config from config_service or defaults (Design 5.37).

    Args:
        config_service: Optional IConfigService to read reliability.*.
        max_retries: Override; else from reliability.max_retries or 3.
        base_delay: Base delay in seconds (Design 5.37: 0.5s).
        jitter_range: Max jitter in seconds (0–0.25s).

    Returns:
        Dict with max_retries, base_delay, jitter_range.
    """
    out = {"base_delay": base_delay, "jitter_range": jitter_range}
    if config_service is not None:
        try:
            out["max_retries"] = int(config_service.get("reliability.max_retries", 3))
        except (TypeError, ValueError):
            out["max_retries"] = 3
    else:
        out["max_retries"] = max_retries if max_retries is not None else 3
    return out


def run_with_retry(
    fn: Callable[..., T],
    *args: Any,
    config_service: Optional[Any] = None,
    on_retry: Optional[Callable[[int, int, float, Exception], None]] = None,
    max_retries: Optional[int] = None,
    base_delay: float = 0.5,
    jitter_range: float = 0.25,
    **kwargs: Any,
) -> T:
    """Run callable with centralized retry/backoff (Design 5.1, 5.63, 5.113).

    delay = base * 2^attempt + jitter (Design 5.37).

    Args:
        fn: Callable to run (e.g. lambda: request_html(url)).
        *args: Positional args for fn.
        config_service: Optional IConfigService for reliability.max_retries.
        on_retry: Optional callback(attempt, max_attempts, delay, error) for UI.
        max_retries: Override max retries.
        base_delay: Base delay in seconds.
        jitter_range: Jitter range in seconds.
        **kwargs: Keyword args for fn.

    Returns:
        Result of fn(*args, **kwargs).

    Raises:
        Last exception if all attempts fail.
    """
    cfg = get_retry_config(
        config_service=config_service,
        max_retries=max_retries,
        base_delay=base_delay,
        jitter_range=jitter_range,
    )
    max_attempts = cfg["max_retries"]
    base = cfg["base_delay"]
    jitter_max = cfg["jitter_range"]
    last_exc: Optional[Exception] = None

    for attempt in range(max_attempts + 1):
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            last_exc = e
            if attempt == max_attempts:
                raise
            delay = min(base * (2**attempt), 60.0)
            jitter = random.uniform(0, jitter_max)
            total_delay = delay + jitter
            if on_retry:
                try:
                    on_retry(attempt + 1, max_attempts, total_delay, e)
                except Exception:
                    pass
            time.sleep(total_delay)

    if last_exc is not None:
        raise last_exc
    raise RuntimeError("run_with_retry: unreachable")
