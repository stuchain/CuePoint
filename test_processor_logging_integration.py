#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Integration test for processor.py logging changes

Tests that:
1. Processor imports correctly with new logger
2. Logger is properly initialized
3. All logging levels work
4. No import errors or runtime issues
"""

import sys
import os
from pathlib import Path

# Add to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))


def test_processor_imports():
    """Test that processor.py imports without errors."""
    print("=" * 60)
    print("Test: Processor Imports")
    print("=" * 60)
    
    try:
        # This should work without errors
        from cuepoint.services.processor import _logger, generate_summary_report
        assert _logger is not None, "Logger should be initialized"
        print("[OK] Processor imports successfully")
        print("[OK] Logger is initialized")
        return True
    except Exception as e:
        print(f"[FAIL] Import failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_processor_logger_functionality():
    """Test that processor logger works correctly."""
    print("=" * 60)
    print("Test: Processor Logger Functionality")
    print("=" * 60)
    
    try:
        from cuepoint.services.processor import _logger
        
        # Test all log levels
        _logger.debug("Debug message from processor test")
        _logger.info("Info message from processor test")
        _logger.warning("Warning message from processor test")
        _logger.error("Error message from processor test")
        _logger.critical("Critical message from processor test")
        
        # Test with extra context
        _logger.info("Message with context", extra={"test_key": "test_value"})
        
        print("[OK] All log levels work")
        print("[OK] Context logging works")
        return True
    except Exception as e:
        print(f"[FAIL] Logger test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_processor_functions():
    """Test that processor functions still work."""
    print("=" * 60)
    print("Test: Processor Functions")
    print("=" * 60)
    
    try:
        from cuepoint.services.processor import generate_summary_report
        
        # Test summary report generation
        summary = generate_summary_report(
            playlist_name="Test Playlist",
            rows=[],
            all_candidates=[],
            all_queries=[],
            processing_time_sec=1.5,
            output_files={"main": "test.csv"}
        )
        
        assert isinstance(summary, str)
        # For empty rows, it returns "No tracks processed."
        assert len(summary) > 0
        print(f"[OK] generate_summary_report works (returned: {summary[:50]}...)")
        return True
    except Exception as e:
        print(f"[FAIL] Function test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_log_file_creation():
    """Test that log files are created correctly."""
    print("=" * 60)
    print("Test: Log File Creation")
    print("=" * 60)
    
    try:
        from cuepoint.services.logging_service import LoggingService
        from pathlib import Path
        import tempfile
        import time
        
        # Create temp directory
        temp_dir = Path(tempfile.mkdtemp())
        
        # Create logger with file logging
        logger = LoggingService(
            log_dir=temp_dir,
            enable_console_logging=False,
            enable_file_logging=True
        )
        
        # Write some messages
        logger.info("Test message 1")
        logger.error("Test message 2")
        
        # Give file system time to write
        time.sleep(0.1)
        
        # Check log file exists
        log_file = temp_dir / "cuepoint.log"
        assert log_file.exists(), "Log file should exist"
        
        # Read and verify content
        content = log_file.read_text(encoding='utf-8')
        assert "Test message 1" in content
        assert "Test message 2" in content
        
        print(f"[OK] Log file created: {log_file}")
        print("[OK] Log messages written correctly")
        
        # Cleanup (close handlers first)
        for handler in logger.logger.handlers:
            handler.close()
        
        # Try to remove (may fail on Windows due to file locking, but that's OK)
        try:
            import shutil
            time.sleep(0.1)  # Give time for file handles to close
            shutil.rmtree(temp_dir)
        except Exception:
            pass  # Windows file locking issue is OK
        
        return True
    except Exception as e:
        print(f"[FAIL] Log file test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all integration tests."""
    print("\n" + "=" * 60)
    print("Processor Logging Integration Tests")
    print("=" * 60 + "\n")
    
    tests = [
        test_processor_imports,
        test_processor_logger_functionality,
        test_processor_functions,
        test_log_file_creation,
    ]
    
    results = []
    for test in tests:
        try:
            result = test()
            results.append(result)
            print()
        except Exception as e:
            print(f"[FAIL] Test {test.__name__} crashed: {e}")
            import traceback
            traceback.print_exc()
            results.append(False)
            print()
    
    # Summary
    print("=" * 60)
    passed = sum(results)
    total = len(results)
    if passed == total:
        print(f"[OK] ALL TESTS PASSED ({passed}/{total})")
        print("=" * 60)
        return 0
    else:
        print(f"[FAIL] SOME TESTS FAILED ({passed}/{total} passed)")
        print("=" * 60)
        return 1


if __name__ == "__main__":
    sys.exit(main())

