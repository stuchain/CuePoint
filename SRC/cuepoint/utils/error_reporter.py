#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Error Reporter for GitHub Issues

Reports application errors to GitHub Issues automatically.
FREE, EASIEST option - uses existing GitHub account.

Implements Step 11.2 - Error Monitoring & Crash Reporting.
"""

import hashlib
import json
import logging
import os
import platform
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional

import requests

from cuepoint.version import get_version, get_build_info


class ErrorReporter:
    """Report errors to GitHub Issues."""
    
    def __init__(
        self,
        github_repo: str,
        github_token: Optional[str] = None,
        enabled: bool = True
    ):
        """
        Initialize error reporter.
        
        Args:
            github_repo: GitHub repository (format: "owner/repo")
            github_token: GitHub personal access token (optional, can use GITHUB_TOKEN env var)
            enabled: Whether error reporting is enabled
        """
        self.github_repo = github_repo
        self.github_token = github_token or self._get_token_from_env()
        self.enabled = enabled and bool(self.github_token)
        
        self.logger = logging.getLogger(__name__)
        
        # Error cache to avoid duplicate reports
        self._reported_errors: Dict[str, datetime] = {}
        self._cache_file = Path.home() / ".cuepoint" / "error_cache.json"
        self._load_error_cache()
    
    def _get_token_from_env(self) -> Optional[str]:
        """Get GitHub token from environment variable."""
        return os.getenv("GITHUB_TOKEN")
    
    def _load_error_cache(self) -> None:
        """Load error cache from disk."""
        try:
            if self._cache_file.exists():
                with open(self._cache_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for error_hash, timestamp_str in data.items():
                        try:
                            self._reported_errors[error_hash] = datetime.fromisoformat(timestamp_str)
                        except (ValueError, TypeError):
                            # Skip invalid entries
                            continue
        except Exception as e:
            self.logger.warning(f"Could not load error cache: {e}")
    
    def _save_error_cache(self) -> None:
        """Save error cache to disk."""
        try:
            self._cache_file.parent.mkdir(parents=True, exist_ok=True)
            data = {
                error_hash: timestamp.isoformat()
                for error_hash, timestamp in self._reported_errors.items()
            }
            with open(self._cache_file, 'w', encoding='utf-8') as f:
                json.dump(data, f)
        except Exception as e:
            self.logger.warning(f"Could not save error cache: {e}")
    
    def _should_report_error(self, error_hash: str) -> bool:
        """Check if error should be reported (avoid duplicates)."""
        if error_hash not in self._reported_errors:
            return True
        
        # Report again if last report was > 24 hours ago
        last_report = self._reported_errors[error_hash]
        time_since_report = datetime.now() - last_report
        return time_since_report.total_seconds() > 86400  # 24 hours
    
    def _filter_sensitive_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Filter sensitive data from error report."""
        filtered = {}
        sensitive_keys = [
            'password', 'token', 'key', 'secret', 'api_key',
            'file_path', 'path', 'directory', 'username', 'email'
        ]
        
        for key, value in data.items():
            key_lower = key.lower()
            if any(sensitive in key_lower for sensitive in sensitive_keys):
                filtered[key] = '[REDACTED]'
            elif isinstance(value, dict):
                filtered[key] = self._filter_sensitive_data(value)
            elif isinstance(value, str) and len(value) > 500:
                filtered[key] = value[:500] + '... [TRUNCATED]'
            else:
                filtered[key] = value
        
        return filtered
    
    def _create_error_issue(self, error_info: Dict[str, Any]) -> Optional[int]:
        """Create GitHub issue for error."""
        if not self.enabled:
            return None
        
        try:
            # Prepare issue title
            error_type = error_info.get('error_type', 'Unknown Error')
            error_message = error_info.get('error_message', 'No message')
            title = f"[Auto-Reported] {error_type}: {error_message[:100]}"
            
            # Prepare issue body
            body = self._format_error_body(error_info)
            
            # Create issue via GitHub API
            url = f"https://api.github.com/repos/{self.github_repo}/issues"
            headers = {
                "Authorization": f"token {self.github_token}",
                "Accept": "application/vnd.github.v3+json"
            }
            data = {
                "title": title,
                "body": body,
                "labels": ["auto-reported", "error", "bug"]
            }
            
            response = requests.post(url, headers=headers, json=data, timeout=10)
            response.raise_for_status()
            
            issue_data = response.json()
            issue_number = issue_data.get('number')
            
            self.logger.info(f"Error reported to GitHub Issue #{issue_number}")
            return issue_number
            
        except Exception as e:
            self.logger.error(f"Failed to report error to GitHub: {e}")
            return None
    
    def _format_error_body(self, error_info: Dict[str, Any]) -> str:
        """Format error information as GitHub issue body."""
        lines = [
            "## Auto-Reported Error",
            "",
            "This error was automatically reported by the application.",
            "",
            "### Error Details",
            "",
            f"**Error Type**: `{error_info.get('error_type', 'Unknown')}`",
            f"**Error Message**: `{error_info.get('error_message', 'No message')}`",
            "",
            "### System Information",
            "",
            f"- **Version**: {error_info.get('version', 'Unknown')}",
            f"- **OS**: {error_info.get('os', 'Unknown')}",
            f"- **Platform**: {error_info.get('platform', 'Unknown')}",
            f"- **Python**: {error_info.get('python_version', 'Unknown')}",
            "",
            "### Error Context",
            "",
            "```",
            error_info.get('traceback', 'No traceback available'),
            "```",
            "",
        ]
        
        # Add build info if available
        if 'build_info' in error_info:
            lines.extend([
                "### Build Information",
                "",
                "```json",
                json.dumps(error_info['build_info'], indent=2),
                "```",
                "",
            ])
        
        # Add additional info if available
        if error_info.get('additional_info'):
            lines.extend([
                "### Additional Information",
                "",
                "```json",
                json.dumps(error_info.get('additional_info', {}), indent=2),
                "```",
                "",
            ])
        
        lines.extend([
            "---",
            "",
            "*This issue was automatically created. Please verify and add any additional context.*"
        ])
        
        return "\n".join(lines)
    
    def report_error(
        self,
        error_type: str,
        error_message: str,
        traceback: Optional[str] = None,
        additional_info: Optional[Dict[str, Any]] = None
    ) -> Optional[int]:
        """
        Report an error to GitHub Issues.
        
        Args:
            error_type: Type of error (e.g., "Crash", "Exception")
            error_message: Error message
            traceback: Error traceback (optional)
            additional_info: Additional error context (optional)
        
        Returns:
            GitHub issue number if reported, None otherwise
        """
        if not self.enabled:
            return None
        
        # Collect error information
        error_info = {
            'error_type': error_type,
            'error_message': error_message,
            'traceback': traceback or 'No traceback available',
            'timestamp': datetime.now().isoformat(),
            'version': get_version(),
            'os': platform.system(),
            'platform': platform.platform(),
            'python_version': sys.version,
            'additional_info': additional_info or {}
        }
        
        # Add build info if available
        try:
            build_info = get_build_info()
            error_info['build_info'] = build_info
        except Exception:
            pass
        
        # Filter sensitive data
        error_info = self._filter_sensitive_data(error_info)
        
        # Generate error hash for deduplication
        error_hash = hashlib.md5(
            f"{error_type}:{error_message}".encode()
        ).hexdigest()
        
        # Check if should report
        if not self._should_report_error(error_hash):
            self.logger.debug(f"Error already reported recently, skipping: {error_hash}")
            return None
        
        # Report error
        issue_number = self._create_error_issue(error_info)
        
        if issue_number:
            # Update cache
            self._reported_errors[error_hash] = datetime.now()
            self._save_error_cache()
        
        return issue_number


# Global error reporter instance
_error_reporter: Optional[ErrorReporter] = None


def init_error_reporter(
    github_repo: str,
    github_token: Optional[str] = None,
    enabled: bool = True
) -> None:
    """Initialize global error reporter."""
    global _error_reporter
    _error_reporter = ErrorReporter(github_repo, github_token, enabled)


def report_error(
    error_type: str,
    error_message: str,
    traceback: Optional[str] = None,
    additional_info: Optional[Dict[str, Any]] = None
) -> Optional[int]:
    """Report error using global error reporter."""
    if _error_reporter:
        return _error_reporter.report_error(
            error_type, error_message, traceback, additional_info
        )
    return None

