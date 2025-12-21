#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for Metrics Tracking Script

Tests GitHub metrics collection and reporting.
"""

import json
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

import pytest

# Import the script functions
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent.parent / "scripts"))

from track_metrics import get_github_metrics, generate_metrics_report


class TestGitHubMetricsCollection:
    """Test GitHub metrics collection."""
    
    @pytest.fixture
    def mock_releases_response(self):
        """Mock GitHub releases API response."""
        mock = Mock()
        mock.status_code = 200
        mock.json.return_value = [
            {
                "tag_name": "v1.0.0",
                "published_at": "2025-01-15T00:00:00Z",
                "assets": [
                    {"download_count": 100, "name": "CuePoint.exe"},
                    {"download_count": 50, "name": "CuePoint.dmg"}
                ]
            },
            {
                "tag_name": "v0.9.0",
                "published_at": "2024-12-01T00:00:00Z",
                "assets": [
                    {"download_count": 75, "name": "CuePoint.exe"}
                ]
            }
        ]
        return mock
    
    @pytest.fixture
    def mock_issues_response(self):
        """Mock GitHub issues API response."""
        mock = Mock()
        mock.status_code = 200
        mock.json.return_value = [
            {"state": "open", "number": 1, "title": "Bug 1"},
            {"state": "open", "number": 2, "title": "Bug 2"},
            {"state": "closed", "number": 3, "title": "Bug 3"},
            {"state": "open", "number": 4, "pull_request": {}, "title": "PR 1"}  # PR, not issue
        ]
        return mock
    
    @pytest.fixture
    def mock_repo_response(self):
        """Mock GitHub repository API response."""
        mock = Mock()
        mock.status_code = 200
        mock.json.return_value = {
            "stargazers_count": 100,
            "forks_count": 25,
            "watchers_count": 50,
            "open_issues_count": 2
        }
        return mock
    
    @patch('track_metrics.requests.get')
    def test_get_github_metrics_success(
        self, mock_get, mock_repo_response, mock_issues_response, mock_releases_response
    ):
        """Test successful GitHub metrics collection."""
        # Configure mock responses in order
        mock_get.side_effect = [
            mock_releases_response,  # Releases
            mock_issues_response,     # Issues
            mock_repo_response        # Repo
        ]
        
        metrics = get_github_metrics("test/repo", "token")
        
        assert metrics["total_downloads"] == 225  # 100 + 50 + 75
        assert metrics["release_count"] == 2
        assert metrics["latest_release"] == "v1.0.0"
        assert metrics["total_issues"] == 3  # Excludes PR
        assert metrics["open_issues"] == 2
        assert metrics["closed_issues"] == 1
        assert metrics["stars"] == 100
        assert metrics["forks"] == 25
        assert metrics["watchers"] == 50
        assert len(metrics["release_downloads"]) == 2
    
    @patch('track_metrics.requests.get')
    def test_get_github_metrics_no_token(self, mock_get):
        """Test metrics collection without token (public repo)."""
        # Create separate mocks for each API call
        mock_releases = Mock()
        mock_releases.status_code = 200
        mock_releases.json.return_value = []
        
        mock_issues = Mock()
        mock_issues.status_code = 200
        mock_issues.json.return_value = []
        
        mock_repo = Mock()
        mock_repo.status_code = 200
        mock_repo.json.return_value = {
            "stargazers_count": 0,
            "forks_count": 0,
            "watchers_count": 0,
            "open_issues_count": 0
        }
        
        mock_get.side_effect = [mock_releases, mock_issues, mock_repo]
        
        metrics = get_github_metrics("test/repo", None)
        
        # Should work without token for public repos
        assert "total_downloads" in metrics
        assert metrics["total_downloads"] == 0
        assert metrics["stars"] == 0
    
    @patch('track_metrics.requests.get')
    def test_get_github_metrics_api_error(self, mock_get):
        """Test handling of API errors."""
        mock_response = Mock()
        mock_response.status_code = 500
        mock_response.raise_for_status.side_effect = Exception("Server error")
        mock_get.return_value = mock_response
        
        with pytest.raises(Exception):
            get_github_metrics("test/repo", "token")
    
    @patch('track_metrics.requests.get')
    def test_get_github_metrics_not_found(self, mock_get):
        """Test handling of repository not found."""
        mock_response = Mock()
        mock_response.status_code = 404
        mock_get.return_value = mock_response
        
        metrics = get_github_metrics("test/repo", "token")
        
        # Should handle 404 gracefully
        assert metrics.get("total_downloads", 0) == 0
        assert metrics.get("release_count", 0) == 0
    
    @patch('track_metrics.requests.get')
    def test_get_github_metrics_no_releases(self, mock_get):
        """Test metrics collection with no releases."""
        mock_releases = Mock()
        mock_releases.status_code = 200
        mock_releases.json.return_value = []
        
        mock_issues = Mock()
        mock_issues.status_code = 200
        mock_issues.json.return_value = []
        
        mock_repo = Mock()
        mock_repo.status_code = 200
        mock_repo.json.return_value = {
            "stargazers_count": 0,
            "forks_count": 0,
            "watchers_count": 0,
            "open_issues_count": 0
        }
        
        mock_get.side_effect = [mock_releases, mock_issues, mock_repo]
        
        metrics = get_github_metrics("test/repo", "token")
        
        assert metrics["total_downloads"] == 0
        assert metrics["release_count"] == 0
        assert metrics["latest_release"] is None
        assert len(metrics["release_downloads"]) == 0


class TestMetricsReportGeneration:
    """Test metrics report generation."""
    
    @pytest.fixture
    def sample_metrics(self):
        """Sample metrics for testing."""
        return {
            "total_downloads": 1000,
            "release_count": 5,
            "latest_release": "v1.0.0",
            "total_issues": 50,
            "open_issues": 10,
            "closed_issues": 40,
            "stars": 100,
            "forks": 25,
            "watchers": 50,
            "release_downloads": [
                {"version": "v1.0.0", "downloads": 500, "published_at": "2025-01-15T00:00:00Z"}
            ]
        }
    
    def test_generate_metrics_report(self, sample_metrics):
        """Test metrics report generation."""
        with tempfile.TemporaryDirectory() as tmpdir:
            output_file = Path(tmpdir) / "report.json"
            
            generate_metrics_report(sample_metrics, output_file)
            
            assert output_file.exists()
            
            with open(output_file, 'r', encoding='utf-8') as f:
                report = json.load(f)
            
            assert "timestamp" in report
            assert "metrics" in report
            assert "summary" in report
            assert report["metrics"]["total_downloads"] == 1000
            assert report["summary"]["total_downloads"] == 1000
            assert report["summary"]["release_count"] == 5
            assert report["summary"]["total_issues"] == 50
    
    def test_generate_metrics_report_creates_directory(self, sample_metrics):
        """Test that report generation creates directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "new_dir" / "report.json"
            
            generate_metrics_report(sample_metrics, output_path)
            
            assert output_path.exists()
            assert output_path.parent.exists()
    
    def test_generate_metrics_report_structure(self, sample_metrics):
        """Test report structure and content."""
        with tempfile.TemporaryDirectory() as tmpdir:
            output_file = Path(tmpdir) / "report.json"
            
            generate_metrics_report(sample_metrics, output_file)
            
            with open(output_file, 'r', encoding='utf-8') as f:
                report = json.load(f)
            
            # Check structure
            assert isinstance(report, dict)
            assert "timestamp" in report
            assert "metrics" in report
            assert "summary" in report
            
            # Check timestamp format
            assert "T" in report["timestamp"] or "-" in report["timestamp"]
            
            # Check metrics content
            assert isinstance(report["metrics"], dict)
            assert report["metrics"]["total_downloads"] == 1000
            
            # Check summary content
            assert isinstance(report["summary"], dict)
            assert "total_downloads" in report["summary"]
            assert "release_count" in report["summary"]


class TestMetricsScriptIntegration:
    """Integration tests for metrics script."""
    
    @patch('track_metrics.get_github_metrics')
    @patch('track_metrics.generate_metrics_report')
    def test_main_success(self, mock_generate, mock_get_metrics):
        """Test main function success path."""
        mock_get_metrics.return_value = {
            "total_downloads": 1000,
            "release_count": 5,
            "stars": 100
        }
        
        from track_metrics import main
        
        # Mock sys.argv
        import sys
        original_argv = sys.argv
        sys.argv = ['track_metrics.py', '--repo', 'test/repo']
        
        try:
            result = main()
            assert result == 0
            mock_get_metrics.assert_called_once()
            mock_generate.assert_called_once()
        finally:
            sys.argv = original_argv
    
    @patch('track_metrics.get_github_metrics')
    def test_main_api_error(self, mock_get_metrics):
        """Test main function with API error."""
        import requests
        mock_get_metrics.side_effect = requests.RequestException("API error")
        
        from track_metrics import main
        
        import sys
        original_argv = sys.argv
        sys.argv = ['track_metrics.py', '--repo', 'test/repo']
        
        try:
            result = main()
            assert result == 1
        finally:
            sys.argv = original_argv

