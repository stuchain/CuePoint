#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for Step 6.3: Crash Handling

Tests CrashHandler, ThreadExceptionHandler, ExceptionContext, CrashReport, and CrashReportMetadata.
"""

import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from cuepoint.utils.crash_handler import (
    CrashHandler,
    CrashReport,
    CrashReportMetadata,
    ExceptionContext,
    ThreadExceptionHandler,
)


class TestCrashHandler:
    """Test CrashHandler class."""

    def test_init(self):
        """Test crash handler initialization."""
        handler = CrashHandler()
        assert handler._original_excepthook is not None
        assert handler._crash_dialog_shown is False

    def test_restore_handler(self):
        """Test restoring original handler."""
        original = sys.excepthook
        handler = CrashHandler()
        # Handler should have saved the original
        assert handler._original_excepthook is not None
        handler.restore_handler()
        # After restore, excepthook should be the original (or at least not the handler's method)
        assert sys.excepthook != handler._handle_exception


class TestExceptionContext:
    """Test ExceptionContext class."""

    def test_push_context(self):
        """Test pushing context."""
        ExceptionContext._context_stack = []
        ExceptionContext.push_context("test_operation")
        assert len(ExceptionContext._context_stack) == 1
        assert ExceptionContext._context_stack[0]["context"] == "test_operation"

    def test_pop_context(self):
        """Test popping context."""
        ExceptionContext._context_stack = []
        ExceptionContext.push_context("test1")
        ExceptionContext.push_context("test2")
        ExceptionContext.pop_context()
        assert len(ExceptionContext._context_stack) == 1
        assert ExceptionContext._context_stack[0]["context"] == "test1"

    def test_get_context(self):
        """Test getting context."""
        ExceptionContext._context_stack = []
        ExceptionContext.push_context("test_operation")
        context = ExceptionContext.get_context()
        assert "application_context" in context
        assert len(context["application_context"]) == 1


class TestCrashReport:
    """Test CrashReport class."""

    def test_generate_report(self):
        """Test generating crash report."""
        exception = ValueError("Test error")
        traceback_str = "Traceback (most recent call last):\n  File test.py, line 1\n    raise ValueError('Test error')\nValueError: Test error"
        
        report = CrashReport.generate_report(exception, traceback_str)
        
        assert "timestamp" in report
        assert "exception" in report
        assert report["exception"]["type"] == "ValueError"
        assert report["exception"]["message"] == "Test error"
        assert "application" in report
        assert "system" in report
        assert "context" in report
        assert "paths" in report

    def test_save_report(self):
        """Test saving crash report."""
        with tempfile.TemporaryDirectory() as tmpdir:
            report = {
                "timestamp": "2024-01-01T00:00:00",
                "exception": {"type": "ValueError", "message": "Test"},
            }
            report_path = Path(tmpdir) / "crash_report.json"
            
            CrashReport.save_report(report, report_path)
            
            assert report_path.exists()
            loaded = json.loads(report_path.read_text())
            assert loaded["exception"]["type"] == "ValueError"


class TestCrashReportMetadata:
    """Test CrashReportMetadata class."""

    def test_generate_report_id(self):
        """Test generating report ID."""
        report_id1 = CrashReportMetadata.generate_report_id("ValueError", "traceback1")
        report_id2 = CrashReportMetadata.generate_report_id("ValueError", "traceback1")
        report_id3 = CrashReportMetadata.generate_report_id("ValueError", "traceback2")
        
        # Same exception and traceback should generate same ID
        assert report_id1 == report_id2
        # Different traceback should generate different ID
        assert report_id1 != report_id3
        # ID should be 16 characters
        assert len(report_id1) == 16

    def test_add_metadata(self):
        """Test adding metadata to report."""
        report = {
            "timestamp": "2024-01-01T00:00:00",
            "exception": {"type": "ValueError", "traceback": "test"},
        }
        
        report_with_metadata = CrashReportMetadata.add_metadata(report)
        
        assert "metadata" in report_with_metadata
        assert "report_id" in report_with_metadata["metadata"]
        assert "session_id" in report_with_metadata["metadata"]
        assert "timestamp" in report_with_metadata["metadata"]
