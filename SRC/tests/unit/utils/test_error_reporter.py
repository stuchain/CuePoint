#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for Error Reporter Module

Comprehensive test suite covering all error reporter functionality.
"""

import json
import os
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

import pytest
import requests

from cuepoint.utils.error_reporter import ErrorReporter, init_error_reporter, report_error


class TestErrorReporter:
    """Test ErrorReporter class."""
    
    @pytest.fixture
    def temp_cache_dir(self):
        """Create temporary cache directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield Path(tmpdir)
    
    @pytest.fixture
    def error_reporter(self, temp_cache_dir, monkeypatch):
        """Create ErrorReporter instance for testing."""
        # Mock cache file location
        def mock_home():
            return temp_cache_dir
        
        monkeypatch.setattr(
            'cuepoint.utils.error_reporter.Path.home',
            mock_home
        )
        
        reporter = ErrorReporter(
            github_repo="test/repo",
            github_token="test_token",
            enabled=True
        )
        # Override cache file location
        reporter._cache_file = temp_cache_dir / ".cuepoint" / "error_cache.json"
        return reporter
    
    def test_init_with_token(self, error_reporter):
        """Test ErrorReporter initialization with token."""
        assert error_reporter.github_repo == "test/repo"
        assert error_reporter.github_token == "test_token"
        assert error_reporter.enabled is True
    
    def test_init_without_token(self, temp_cache_dir, monkeypatch):
        """Test ErrorReporter initialization without token."""
        def mock_home():
            return temp_cache_dir
        
        monkeypatch.setattr(
            'cuepoint.utils.error_reporter.Path.home',
            mock_home
        )
        
        reporter = ErrorReporter(
            github_repo="test/repo",
            github_token=None,
            enabled=True
        )
        assert reporter.enabled is False  # Disabled without token
    
    def test_init_disabled(self, error_reporter):
        """Test ErrorReporter initialization when disabled."""
        error_reporter.enabled = False
        assert error_reporter.enabled is False
    
    def test_load_error_cache_new_file(self, error_reporter):
        """Test loading error cache from new file."""
        error_reporter._load_error_cache()
        assert len(error_reporter._reported_errors) == 0
    
    def test_load_error_cache_existing_file(self, error_reporter):
        """Test loading error cache from existing file."""
        # Create cache file
        error_reporter._cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_data = {
            "error_hash_1": datetime.now().isoformat(),
            "error_hash_2": (datetime.now() - timedelta(hours=25)).isoformat()
        }
        with open(error_reporter._cache_file, 'w', encoding='utf-8') as f:
            json.dump(cache_data, f)
        
        error_reporter._load_error_cache()
        assert len(error_reporter._reported_errors) == 2
    
    def test_save_error_cache(self, error_reporter):
        """Test saving error cache to file."""
        error_reporter._reported_errors = {
            "error_hash_1": datetime.now(),
            "error_hash_2": datetime.now() - timedelta(hours=1)
        }
        
        error_reporter._save_error_cache()
        
        assert error_reporter._cache_file.exists()
        with open(error_reporter._cache_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            assert "error_hash_1" in data
            assert "error_hash_2" in data
    
    def test_should_report_error_new_error(self, error_reporter):
        """Test should_report_error for new error."""
        assert error_reporter._should_report_error("new_error_hash") is True
    
    def test_should_report_error_recent_error(self, error_reporter):
        """Test should_report_error for recently reported error."""
        error_reporter._reported_errors["recent_error"] = datetime.now()
        assert error_reporter._should_report_error("recent_error") is False
    
    def test_should_report_error_old_error(self, error_reporter):
        """Test should_report_error for old error (> 24 hours)."""
        error_reporter._reported_errors["old_error"] = datetime.now() - timedelta(hours=25)
        assert error_reporter._should_report_error("old_error") is True
    
    def test_filter_sensitive_data_passwords(self, error_reporter):
        """Test filtering sensitive data (passwords)."""
        data = {
            "password": "secret123",
            "username": "user",
            "message": "Error occurred"
        }
        filtered = error_reporter._filter_sensitive_data(data)
        
        assert filtered["password"] == "[REDACTED]"
        assert filtered["username"] == "[REDACTED]"
        assert filtered["message"] == "Error occurred"
    
    def test_filter_sensitive_data_nested(self, error_reporter):
        """Test filtering sensitive data in nested structures."""
        data = {
            "user": {
                "password": "secret",
                "email": "user@example.com"
            },
            "message": "Error"
        }
        filtered = error_reporter._filter_sensitive_data(data)
        
        assert filtered["user"]["password"] == "[REDACTED]"
        assert filtered["user"]["email"] == "[REDACTED]"
        assert filtered["message"] == "Error"
    
    def test_filter_sensitive_data_long_strings(self, error_reporter):
        """Test truncating long strings."""
        long_string = "x" * 1000
        data = {"traceback": long_string}
        filtered = error_reporter._filter_sensitive_data(data)
        
        # Should be truncated to 500 + "... [TRUNCATED]" (15 chars) = 515 total
        assert len(filtered["traceback"]) == 515  # 500 + "... [TRUNCATED]"
        assert filtered["traceback"].endswith("... [TRUNCATED]")
        assert len(filtered["traceback"]) <= 515
    
    @patch('cuepoint.utils.error_reporter.requests.post')
    def test_create_error_issue_success(self, mock_post, error_reporter):
        """Test successful error issue creation."""
        mock_response = Mock()
        mock_response.json.return_value = {"number": 123}
        mock_response.raise_for_status = Mock()
        mock_post.return_value = mock_response
        
        error_info = {
            "error_type": "ValueError",
            "error_message": "Test error",
            "traceback": "Traceback...",
            "version": "1.0.0",
            "os": "Windows",
            "platform": "Windows-10",
            "python_version": "3.11.0"
        }
        
        issue_number = error_reporter._create_error_issue(error_info)
        
        assert issue_number == 123
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert "api.github.com" in call_args[0][0]
        assert call_args[1]["json"]["title"].startswith("[Auto-Reported]")
    
    @patch('cuepoint.utils.error_reporter.requests.post')
    def test_create_error_issue_failure(self, mock_post, error_reporter):
        """Test error issue creation failure."""
        mock_post.side_effect = requests.RequestException("Network error")
        
        error_info = {"error_type": "Test", "error_message": "Test"}
        issue_number = error_reporter._create_error_issue(error_info)
        
        assert issue_number is None
    
    @patch('cuepoint.utils.error_reporter.requests.post')
    @patch('cuepoint.utils.error_reporter.get_version')
    @patch('cuepoint.utils.error_reporter.get_build_info')
    def test_report_error_success(self, mock_build_info, mock_version, mock_post, error_reporter, temp_cache_dir):
        """Test successful error reporting."""
        mock_version.return_value = "1.0.0"
        mock_build_info.return_value = {"build_number": "123"}
        
        mock_response = Mock()
        mock_response.json.return_value = {"number": 456}
        mock_response.raise_for_status = Mock()
        mock_post.return_value = mock_response
        
        issue_number = error_reporter.report_error(
            error_type="TestError",
            error_message="Test error message",
            traceback="Traceback...",
            additional_info={"key": "value"}
        )
        
        assert issue_number == 456
        # Check that error was cached (hash should be in reported_errors)
        assert len(error_reporter._reported_errors) > 0
    
    @patch('cuepoint.utils.error_reporter.requests.post')
    def test_report_error_deduplication(self, mock_post, error_reporter):
        """Test error reporting deduplication."""
        mock_response = Mock()
        mock_response.json.return_value = {"number": 789}
        mock_response.raise_for_status = Mock()
        mock_post.return_value = mock_response
        
        # Report first error
        error_reporter.report_error("TestError", "Test message")
        assert mock_post.call_count == 1
        
        # Report same error again (should be deduplicated)
        error_reporter.report_error("TestError", "Test message")
        assert mock_post.call_count == 1  # Not called again
    
    def test_report_error_disabled(self, error_reporter):
        """Test error reporting when disabled."""
        error_reporter.enabled = False
        
        issue_number = error_reporter.report_error(
            "TestError",
            "Test message"
        )
        
        assert issue_number is None
    
    @patch('cuepoint.utils.error_reporter.requests.post')
    @patch('cuepoint.utils.error_reporter.get_version')
    @patch('cuepoint.utils.error_reporter.get_build_info')
    def test_report_error_with_build_info(self, mock_build_info, mock_version, mock_post, error_reporter):
        """Test error reporting includes build info."""
        mock_version.return_value = "1.0.0"
        mock_build_info.return_value = {"build_number": "123"}
        
        mock_response = Mock()
        mock_response.json.return_value = {"number": 999}
        mock_response.raise_for_status = Mock()
        mock_post.return_value = mock_response
        
        error_reporter.report_error("TestError", "Test message")
        
        # Verify build info was included in the issue body
        call_args = mock_post.call_args
        issue_body = call_args[1]["json"]["body"]
        assert "Build Information" in issue_body


class TestErrorReporterIntegration:
    """Integration tests for error reporter."""
    
    @patch('cuepoint.utils.error_reporter.ErrorReporter')
    def test_init_error_reporter(self, mock_reporter_class):
        """Test global error reporter initialization."""
        init_error_reporter("test/repo", "token", True)
        
        mock_reporter_class.assert_called_once_with("test/repo", "token", True)
    
    @patch('cuepoint.utils.error_reporter._error_reporter')
    def test_report_error_global(self, mock_reporter):
        """Test global report_error function."""
        mock_reporter.report_error.return_value = 123
        
        issue_number = report_error("TestError", "Test message")
        
        assert issue_number == 123
        mock_reporter.report_error.assert_called_once()
    
    def test_report_error_no_reporter(self):
        """Test report_error when no global reporter."""
        # Reset global reporter
        import cuepoint.utils.error_reporter as er_module
        er_module._error_reporter = None
        
        issue_number = report_error("TestError", "Test message")
        assert issue_number is None


class TestErrorReporterEdgeCases:
    """Test edge cases and error handling."""
    
    @pytest.fixture
    def temp_cache_dir(self):
        """Create temporary cache directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield Path(tmpdir)
    
    def test_malformed_cache_file(self, temp_cache_dir, monkeypatch):
        """Test handling of malformed cache file."""
        def mock_home():
            return temp_cache_dir
        
        monkeypatch.setattr(
            'cuepoint.utils.error_reporter.Path.home',
            mock_home
        )
        
        reporter = ErrorReporter("test/repo", "token", True)
        reporter._cache_file = temp_cache_dir / ".cuepoint" / "error_cache.json"
        
        # Create malformed cache file
        reporter._cache_file.parent.mkdir(parents=True, exist_ok=True)
        with open(reporter._cache_file, 'w', encoding='utf-8') as f:
            f.write("invalid json")
        
        # Should not crash, should handle gracefully
        reporter._load_error_cache()
        assert len(reporter._reported_errors) == 0
    
    @pytest.fixture
    def error_reporter(self, temp_cache_dir, monkeypatch):
        """Create ErrorReporter instance for testing."""
        def mock_home():
            return temp_cache_dir
        
        monkeypatch.setattr(
            'cuepoint.utils.error_reporter.Path.home',
            mock_home
        )
        
        reporter = ErrorReporter("test/repo", "token", True)
        reporter._cache_file = temp_cache_dir / ".cuepoint" / "error_cache.json"
        return reporter
    
    def test_cache_file_permissions_error(self, error_reporter, monkeypatch):
        """Test handling of cache file permission errors."""
        def mock_open(*args, **kwargs):
            raise PermissionError("Permission denied")
        
        monkeypatch.setattr("builtins.open", mock_open)
        
        # Should not crash
        error_reporter._save_error_cache()
        error_reporter._load_error_cache()
    
    @patch('cuepoint.utils.error_reporter.requests.post')
    def test_github_api_rate_limit(self, mock_post, error_reporter):
        """Test handling of GitHub API rate limits."""
        mock_response = Mock()
        mock_response.status_code = 403
        mock_response.raise_for_status.side_effect = requests.HTTPError("Rate limit exceeded")
        mock_post.return_value = mock_response
        
        issue_number = error_reporter.report_error("TestError", "Test message")
        
        assert issue_number is None  # Should fail gracefully
    
    def test_get_token_from_env(self, temp_cache_dir, monkeypatch):
        """Test getting token from environment variable."""
        def mock_home():
            return temp_cache_dir
        
        monkeypatch.setattr(
            'cuepoint.utils.error_reporter.Path.home',
            mock_home
        )
        
        with patch.dict(os.environ, {"GITHUB_TOKEN": "env_token"}):
            reporter = ErrorReporter("test/repo", github_token=None, enabled=True)
            assert reporter.github_token == "env_token"
            assert reporter.enabled is True

