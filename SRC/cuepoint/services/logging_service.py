#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Logging Service Implementation

Simple logging service that wraps Python's logging module.
"""

import logging
from typing import Any
from cuepoint.services.interfaces import ILoggingService


class LoggingService(ILoggingService):
    """Implementation of logging service using Python's logging module."""
    
    def __init__(self, logger_name: str = "cuepoint"):
        self.logger = logging.getLogger(logger_name)
        if not self.logger.handlers:
            # Set up basic handler if none exists
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)
            self.logger.setLevel(logging.INFO)
    
    def debug(self, message: str, **kwargs) -> None:
        """Log debug message."""
        self.logger.debug(message, **kwargs)
    
    def info(self, message: str, **kwargs) -> None:
        """Log info message."""
        self.logger.info(message, **kwargs)
    
    def warning(self, message: str, **kwargs) -> None:
        """Log warning message."""
        self.logger.warning(message, **kwargs)
    
    def error(self, message: str, **kwargs) -> None:
        """Log error message."""
        self.logger.error(message, **kwargs)
