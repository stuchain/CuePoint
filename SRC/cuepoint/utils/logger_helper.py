#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Logger Helper

Utility functions for getting logger instances without DI.
Useful for legacy code that hasn't been migrated to dependency injection.
"""


from cuepoint.services.interfaces import ILoggingService
from cuepoint.services.logging_service import LoggingService
from cuepoint.utils.di_container import get_container


def get_logger() -> ILoggingService:
    """Get a logger instance.

    Tries to get logger from DI container first. If not available,
    creates a new LoggingService instance.

    Returns:
        ILoggingService instance.
    """
    try:
        container = get_container()
        if container.is_registered(ILoggingService):
            return container.resolve(ILoggingService)
    except Exception:
        pass

    # Fallback: create a new instance
    return LoggingService()
