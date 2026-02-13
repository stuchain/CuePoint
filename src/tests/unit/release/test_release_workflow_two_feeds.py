#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Sanity checks for release workflow: two appcast feeds (stable vs test).

Ensures test-tag steps use correct condition and test publish does NOT pass --index
(design: I3 - test tag must not mutate stable or index).
"""

from pathlib import Path

import pytest
import yaml


_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
_RELEASE_YAML = _REPO_ROOT / ".github" / "workflows" / "release.yml"


@pytest.mark.unit
class TestReleaseWorkflowTwoFeeds:
    """Release workflow must enforce stable vs test appcast separation."""

    @pytest.fixture
    def workflow(self):
        with open(_RELEASE_YAML, encoding="utf-8") as f:
            return yaml.safe_load(f)

    def test_test_steps_condition_contains_test(self, workflow):
        """Test-tag steps must run only when ref contains '-test'."""
        steps = workflow["jobs"]["release"]["steps"]
        test_step_names = (
            "Fetch Existing Test Appcast Feeds",
            "Generate Test Appcast Feeds",
            "Validate Test Appcast Feeds",
            "Publish Test Appcast Feeds to GitHub Pages",
        )
        for step in steps:
            name = step.get("name", "")
            if name in test_step_names:
                cond = step.get("if", "")
                assert "contains(github.ref_name, '-test')" in cond, (
                    f"Step '{name}' must have condition contains(github.ref_name, '-test')"
                )
                assert "!contains" not in cond, (
                    f"Step '{name}' must run on test tag (no !contains)"
                )

    def test_stable_steps_condition_not_contains_test(self, workflow):
        """Stable appcast steps must run only when ref does NOT contain '-test'."""
        steps = workflow["jobs"]["release"]["steps"]
        stable_step_names = (
            "Fetch Existing Appcast Feeds",
            "Generate Appcast Feeds",
            "Validate Appcast Feeds",
            "Publish Appcast Feeds to GitHub Pages",
        )
        for step in steps:
            name = step.get("name", "")
            if name in stable_step_names:
                cond = step.get("if", "")
                assert "!contains(github.ref_name, '-test')" in cond, (
                    f"Step '{name}' must have condition !contains(github.ref_name, '-test')"
                )

    def test_publish_test_appcast_does_not_include_index(self, workflow):
        """Publish Test Appcast step must NOT pass --index (design I3)."""
        steps = workflow["jobs"]["release"]["steps"]
        run_content = None
        for step in steps:
            if step.get("name") == "Publish Test Appcast Feeds to GitHub Pages":
                run_content = step.get("run", "")
                break
        assert run_content is not None, "Publish Test Appcast Feeds step not found"
        assert "--index" not in run_content, (
            "Test appcast publish must not pass --index (must not mutate index.html)"
        )
        assert "updates/macos/test/appcast.xml" in run_content
        assert "updates/windows/test/appcast.xml" in run_content

    def test_publish_stable_appcast_includes_index(self, workflow):
        """Stable publish step must pass --index (so website gets index)."""
        steps = workflow["jobs"]["release"]["steps"]
        run_content = None
        for step in steps:
            if step.get("name") == "Publish Appcast Feeds to GitHub Pages":
                run_content = step.get("run", "")
                break
        assert run_content is not None, "Publish Appcast Feeds step not found"
        assert "--index" in run_content
        assert "gh-pages-root/index.html" in run_content
