#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for policy document resolution (Step 11: Business and Legal Readiness).
"""

import subprocess
import sys
from pathlib import Path

import pytest

from cuepoint.utils.policy_docs import (
    find_data_processing_notice,
    find_privacy_notice,
    find_support_policy,
    find_terms_of_use,
    find_third_party_licenses,
    load_policy_text,
)


class TestPolicyDocs:
    """Tests for policy document resolution."""

    def test_load_policy_text_with_valid_path(self, tmp_path):
        """Load policy text from existing file."""
        doc = tmp_path / "test.md"
        doc.write_text("Hello, policy!", encoding="utf-8")
        result = load_policy_text(doc, "fallback")
        assert result == "Hello, policy!"

    def test_load_policy_text_with_none_returns_fallback(self):
        """Load policy text with None path returns fallback."""
        result = load_policy_text(None, "fallback text")
        assert result == "fallback text"

    def test_load_policy_text_with_missing_file_returns_fallback(self, tmp_path):
        """Load policy text with non-existent path returns fallback."""
        missing = tmp_path / "nonexistent.md"
        result = load_policy_text(missing, "fallback")
        assert result == "fallback"

    def test_find_terms_of_use_from_source(self):
        """Find terms of use when running from source."""
        path = find_terms_of_use()
        # From source, docs/policy/terms-of-use.md should exist
        if path:
            assert path.exists()
            assert "terms-of-use" in path.name or "terms" in path.name

    def test_find_privacy_notice_from_source(self):
        """Find privacy notice when running from source."""
        path = find_privacy_notice()
        if path:
            assert path.exists()

    def test_find_third_party_licenses_from_source(self):
        """Find third-party licenses - may not exist in source (generated at build)."""
        path = find_third_party_licenses()
        # In source without running generate_licenses, path may be None
        if path:
            assert path.exists()
            assert "LICENSE" in path.name or "licenses" in str(path)

    def test_find_support_policy_from_source(self):
        """Find support policy when running from source (Step 11)."""
        path = find_support_policy()
        assert path is not None, "support-sla.md should exist in docs/policy/"
        assert path.exists()
        assert "support" in path.name.lower() or "sla" in path.name.lower()

    def test_find_data_processing_notice_from_source(self):
        """Find data processing notice when running from source (Step 11)."""
        path = find_data_processing_notice()
        assert path is not None, (
            "data-processing-notice.md should exist in docs/policy/"
        )
        assert path.exists()
        assert "data-processing" in path.name or "data" in path.name


class TestLicenseBundleGeneration:
    """Tests for license bundle (Step 11.13)."""

    def test_generate_licenses_script_exists(self):
        """Verify generate_licenses.py exists and can be run."""
        script = (
            Path(__file__).resolve().parents[4] / "scripts" / "generate_licenses.py"
        )
        assert script.exists(), "scripts/generate_licenses.py must exist"

    def test_license_bundle_contains_key_deps(self):
        """If THIRD_PARTY_LICENSES.txt exists, it should contain key dependencies."""
        repo_root = Path(__file__).resolve().parents[4]
        licenses_file = repo_root / "THIRD_PARTY_LICENSES.txt"
        if not licenses_file.exists():
            pytest.skip(
                "THIRD_PARTY_LICENSES.txt not generated (run generate_licenses.py)"
            )
        content = licenses_file.read_text(encoding="utf-8", errors="replace")
        assert "THIRD-PARTY LICENSES" in content or "Package:" in content
        # Should have at least one dependency
        assert "License:" in content


class TestCLIPolicyFlags:
    """Tests for CLI policy flags (Step 11.196: --show-privacy, --show-terms)."""

    def test_show_privacy_flag_prints_content(self):
        """--show-privacy prints privacy notice and exits."""
        import os

        project_root = Path(__file__).resolve().parents[4]
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        result = subprocess.run(
            [sys.executable, str(project_root / "src" / "main.py"), "--show-privacy"],
            cwd=str(project_root),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
            env=env,
        )
        assert result.returncode == 0, f"CLI failed: {result.stderr}"
        stdout = result.stdout or ""
        assert "privacy" in stdout.lower() or "data" in stdout.lower()

    def test_show_terms_flag_prints_content(self):
        """--show-terms prints terms of use and exits."""
        import os

        project_root = Path(__file__).resolve().parents[4]
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        result = subprocess.run(
            [sys.executable, str(project_root / "src" / "main.py"), "--show-terms"],
            cwd=str(project_root),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
            env=env,
        )
        assert result.returncode == 0, f"CLI failed: {result.stderr}"
        stdout = result.stdout or ""
        assert "terms" in stdout.lower() or "use" in stdout.lower()


class TestPolicyDocsExist:
    """Verify all Step 11 policy documents exist in repo."""

    def test_privacy_notice_exists(self):
        """docs/policy/privacy-notice.md or PRIVACY_NOTICE.md exists."""
        repo_root = Path(__file__).resolve().parents[4]
        assert (repo_root / "docs" / "policy" / "privacy-notice.md").exists() or (
            repo_root / "PRIVACY_NOTICE.md"
        ).exists()

    def test_terms_of_use_exists(self):
        """docs/policy/terms-of-use.md exists."""
        repo_root = Path(__file__).resolve().parents[4]
        assert (repo_root / "docs" / "policy" / "terms-of-use.md").exists()

    def test_support_sla_exists(self):
        """docs/policy/support-sla.md exists."""
        repo_root = Path(__file__).resolve().parents[4]
        assert (repo_root / "docs" / "policy" / "support-sla.md").exists()

    def test_data_processing_notice_exists(self):
        """docs/policy/data-processing-notice.md exists."""
        repo_root = Path(__file__).resolve().parents[4]
        assert (repo_root / "docs" / "policy" / "data-processing-notice.md").exists()

    def test_code_of_conduct_exists(self):
        """docs/policy/code-of-conduct.md exists."""
        repo_root = Path(__file__).resolve().parents[4]
        assert (repo_root / "docs" / "policy" / "code-of-conduct.md").exists()

    def test_community_contributions_exists(self):
        """docs/policy/community-contributions.md exists."""
        repo_root = Path(__file__).resolve().parents[4]
        assert (repo_root / "docs" / "policy" / "community-contributions.md").exists()
