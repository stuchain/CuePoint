#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Performance monitoring decorators and utilities.

Provides decorators for measuring function execution time and
logging slow operations.
"""

import functools
import time
from typing import Any, Callable, Optional

try:
    from cuepoint.utils.logger_helper import get_logger

    LOGGER_AVAILABLE = True
except ImportError:
    LOGGER_AVAILABLE = False


def measure_time(
    threshold: float = 1.0,
    log_slow: bool = True,
    logger: Optional[Any] = None,
) -> Callable:
    """Decorator to measure function execution time.

    Args:
        threshold: Time threshold in seconds. Operations exceeding this
            will be logged if log_slow is True.
        log_slow: If True, log operations that exceed threshold.
        logger: Logger instance to use. If None, uses get_logger().

    Returns:
        Decorator function.

    Example:
        @measure_time(threshold=0.5)
        def slow_function():
            # ... code ...
            pass
    """

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            start = time.perf_counter()
            result = func(*args, **kwargs)
            duration = time.perf_counter() - start

            # Log if duration exceeds threshold
            if log_slow and duration > threshold:
                if logger is not None:
                    log_func = logger.warning
                elif LOGGER_AVAILABLE:
                    log_func = get_logger().warning
                else:
                    log_func = print

                log_func(
                    f"Slow operation: {func.__name__} took {duration:.3f}s "
                    f"(threshold: {threshold:.3f}s)",
                    extra={"function": func.__name__, "duration": duration},
                )

            return result

        return wrapper

    return decorator


def measure_time_async(
    threshold: float = 1.0,
    log_slow: bool = True,
    logger: Optional[Any] = None,
) -> Callable:
    """Decorator to measure async function execution time.

    Args:
        threshold: Time threshold in seconds. Operations exceeding this
            will be logged if log_slow is True.
        log_slow: If True, log operations that exceed threshold.
        logger: Logger instance to use. If None, uses get_logger().

    Returns:
        Decorator function for async functions.

    Example:
        @measure_time_async(threshold=0.5)
        async def slow_async_function():
            # ... code ...
            pass
    """
    import asyncio

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            start = time.perf_counter()
            result = await func(*args, **kwargs)
            duration = time.perf_counter() - start

            # Log if duration exceeds threshold
            if log_slow and duration > threshold:
                if logger is not None:
                    log_func = logger.warning
                elif LOGGER_AVAILABLE:
                    log_func = get_logger().warning
                else:
                    log_func = print

                log_func(
                    f"Slow async operation: {func.__name__} took {duration:.3f}s "
                    f"(threshold: {threshold:.3f}s)",
                    extra={"function": func.__name__, "duration": duration},
                )

            return result

        return wrapper

    return decorator


class PerformanceContext:
    """Context manager for measuring code block execution time."""

    def __init__(
        self,
        name: str,
        threshold: float = 1.0,
        log_slow: bool = True,
        logger: Optional[Any] = None,
    ):
        """Initialize performance context.

        Args:
            name: Name of the operation being measured.
            threshold: Time threshold in seconds.
            log_slow: If True, log operations that exceed threshold.
            logger: Logger instance to use.
        """
        self.name = name
        self.threshold = threshold
        self.log_slow = log_slow
        self.logger = logger
        self.start_time: Optional[float] = None
        self.duration: Optional[float] = None

    def __enter__(self) -> "PerformanceContext":
        """Enter context manager."""
        self.start_time = time.perf_counter()
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Exit context manager."""
        if self.start_time is not None:
            self.duration = time.perf_counter() - self.start_time

            # Log if duration exceeds threshold
            if self.log_slow and self.duration > self.threshold:
                if self.logger is not None:
                    log_func = self.logger.warning
                elif LOGGER_AVAILABLE:
                    log_func = get_logger().warning
                else:
                    log_func = print

                log_func(
                    f"Slow operation: {self.name} took {self.duration:.3f}s "
                    f"(threshold: {self.threshold:.3f}s)",
                    extra={"operation": self.name, "duration": self.duration},
                )

    def get_duration(self) -> Optional[float]:
        """Get measured duration in seconds."""
        return self.duration


# Convenience function for context manager usage
def measure_block(
    name: str,
    threshold: float = 1.0,
    log_slow: bool = True,
    logger: Optional[Any] = None,
) -> PerformanceContext:
    """Create a performance measurement context.

    Args:
        name: Name of the operation being measured.
        threshold: Time threshold in seconds.
        log_slow: If True, log operations that exceed threshold.
        logger: Logger instance to use.

    Returns:
        PerformanceContext instance.

    Example:
        with measure_block("process_track", threshold=5.0):
            result = process_track(track)
    """
    return PerformanceContext(name, threshold, log_slow, logger)

