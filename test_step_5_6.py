#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test script for Step 5.6: Error Handling & Logging

Tests:
1. Custom exception hierarchy
2. LoggingService functionality
3. ErrorHandler functionality
4. Integration with DI container
"""

import sys
import os
from pathlib import Path

# Add to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from cuepoint.exceptions.cuepoint_exceptions import (
    CuePointException,
    ProcessingError,
    BeatportAPIError,
    ValidationError,
    ConfigurationError,
    ExportError,
    CacheError
)
from cuepoint.services.logging_service import LoggingService
from cuepoint.utils.error_handler import ErrorHandler
from cuepoint.utils.di_container import reset_container, get_container
from cuepoint.services.bootstrap import bootstrap_services
from cuepoint.services.interfaces import ILoggingService


def test_exception_hierarchy():
    """Test custom exception hierarchy."""
    print("=" * 60)
    print("Test 1: Custom Exception Hierarchy")
    print("=" * 60)
    
    # Test base exception
    base_ex = CuePointException("Base error", error_code="BASE001", context={"key": "value"})
    assert str(base_ex) == "[BASE001] Base error"
    assert base_ex.error_code == "BASE001"
    assert base_ex.context == {"key": "value"}
    print("[OK] Base exception works")
    
    # Test ProcessingError
    proc_ex = ProcessingError("Processing failed", context={"track": "Test Track"})
    assert isinstance(proc_ex, CuePointException)
    print("[OK] ProcessingError works")
    
    # Test BeatportAPIError
    api_ex = BeatportAPIError("API error", status_code=404)
    assert isinstance(api_ex, CuePointException)
    assert api_ex.status_code == 404
    print("[OK] BeatportAPIError works")
    
    # Test other exceptions
    assert isinstance(ValidationError("Invalid"), CuePointException)
    assert isinstance(ConfigurationError("Config error"), CuePointException)
    assert isinstance(ExportError("Export failed"), CuePointException)
    assert isinstance(CacheError("Cache error"), CuePointException)
    print("[OK] All exception types work")
    print()


def test_logging_service():
    """Test LoggingService functionality."""
    print("=" * 60)
    print("Test 2: LoggingService")
    print("=" * 60)
    
    # Create temporary log directory
    test_log_dir = Path(__file__).parent / "test_logs"
    test_log_dir.mkdir(exist_ok=True)
    
    # Create logging service
    logger = LoggingService(
        log_dir=test_log_dir,
        log_level="DEBUG",
        enable_file_logging=True,
        enable_console_logging=True
    )
    
    # Test all log levels
    logger.debug("Debug message")
    logger.info("Info message")
    logger.warning("Warning message")
    logger.error("Error message")
    logger.critical("Critical message")
    
    # Test with extra context
    logger.info("Message with context", extra={"key": "value", "number": 42})
    
    # Test error with exception info
    try:
        raise ValueError("Test exception")
    except Exception as e:
        logger.error("Error with exception", exc_info=e)
    
    # Check log file exists
    log_file = test_log_dir / "cuepoint.log"
    assert log_file.exists(), "Log file should exist"
    print(f"[OK] Log file created: {log_file}")
    
    # Read log file and verify content
    log_content = log_file.read_text(encoding='utf-8')
    assert "Info message" in log_content
    assert "Error message" in log_content
    print("[OK] Log messages written to file")
    print()


def test_error_handler():
    """Test ErrorHandler functionality."""
    print("=" * 60)
    print("Test 3: ErrorHandler")
    print("=" * 60)
    
    # Create logging service and error handler
    logger = LoggingService(enable_file_logging=False, enable_console_logging=False)
    error_handler = ErrorHandler(logger)
    
    # Test callback registration
    callback_called = [False]
    
    def test_callback(error: Exception):
        callback_called[0] = True
        assert isinstance(error, ProcessingError)
    
    error_handler.register_callback(test_callback)
    
    # Test handling ProcessingError
    test_error = ProcessingError("Test processing error", context={"track": "Test"})
    error_handler.handle_error(test_error, show_user=False)
    
    assert callback_called[0], "Callback should be called"
    print("[OK] Error handler processes errors correctly")
    print("[OK] Callbacks are invoked")
    
    # Test handle_and_recover
    def failing_function():
        raise ValueError("This will fail")
    
    result = error_handler.handle_and_recover(failing_function, default_return="default")
    assert result == "default", "Should return default value on error"
    print("[OK] Error recovery works")
    print()


def test_di_integration():
    """Test integration with DI container."""
    print("=" * 60)
    print("Test 4: DI Container Integration")
    print("=" * 60)
    
    # Reset and bootstrap
    reset_container()
    bootstrap_services()
    container = get_container()
    
    # Resolve logging service
    logger = container.resolve(ILoggingService)
    assert isinstance(logger, LoggingService)
    print("[OK] LoggingService resolved from DI container")
    
    # Test logging through DI
    logger.info("Test message from DI")
    print("[OK] Logging works through DI")
    print()


def test_logger_helper():
    """Test logger helper function."""
    print("=" * 60)
    print("Test 5: Logger Helper")
    print("=" * 60)
    
    from cuepoint.utils.logger_helper import get_logger
    
    # Get logger (should work with or without DI)
    logger = get_logger()
    assert logger is not None
    logger.info("Test message from helper")
    print("[OK] Logger helper works")
    print()


def main():
    """Run all tests."""
    print("\n" + "=" * 60)
    print("Step 5.6: Error Handling & Logging - Test Suite")
    print("=" * 60 + "\n")
    
    try:
        test_exception_hierarchy()
        test_logging_service()
        test_error_handler()
        test_di_integration()
        test_logger_helper()
        
        print("=" * 60)
        print("[OK] ALL TESTS PASSED")
        print("=" * 60)
        return 0
    except Exception as e:
        print(f"\n[FAIL] TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())

