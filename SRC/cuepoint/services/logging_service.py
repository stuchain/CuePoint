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
    """Service for logging operations using Python's logging module.
    
    Provides a simple interface to Python's logging system with automatic
    handler setup if none exists.
    
    Attributes:
        logger: Python logging.Logger instance.
    """
    
    def __init__(self, logger_name: str = "cuepoint") -> None:
        """Initialize logging service.
        
        Sets up a logger with console handler if none exists.
        
        Args:
            logger_name: Name for the logger (default: "cuepoint").
        """
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
    
    def debug(self, message: str, **kwargs: Any) -> None:
        """Log debug message.
        
        Args:
            message: Debug message to log.
            **kwargs: Additional arguments passed to logger.
        """
        self.logger.debug(message, **kwargs)
    
    def info(self, message: str, **kwargs: Any) -> None:
        """Log info message.
        
        Args:
            message: Info message to log.
            **kwargs: Additional arguments passed to logger.
        """
        self.logger.info(message, **kwargs)
    
    def warning(self, message: str, **kwargs: Any) -> None:
        """Log warning message.
        
        Args:
            message: Warning message to log.
            **kwargs: Additional arguments passed to logger.
        """
        self.logger.warning(message, **kwargs)
    
    def error(self, message: str, **kwargs: Any) -> None:
        """Log error message.
        
        Args:
            message: Error message to log.
            **kwargs: Additional arguments passed to logger.
        """
        self.logger.error(message, **kwargs)
