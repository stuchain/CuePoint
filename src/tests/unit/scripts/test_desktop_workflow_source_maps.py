"""The desktop workflow uploads source maps safely and ships none (REPORT-07, DEC-148)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml

_REPO_ROOT = Path(__file__).resolve().parents[4]
_WORKFLOW = _REPO_ROOT / ".github" / "workflows" / "desktop-electron.yml"


def _job() -> dict:
    return yaml.safe_load(_WORKFLOW.read_text(encoding="utf-8"))["jobs"][
        "desktop-electron"
    ]


def _index(steps: list[dict], name: str) -> int:
    return next(i for i, step in enumerate(steps) if step.get("name") == name)


@pytest.mark.unit
class TestSourceMapSteps:
    def test_the_token_is_in_one_step_only_and_the_job_has_a_flag(self):
        job = _job()
        assert (
            job["env"]["HAS_SENTRY_TOKEN"] == "${{ secrets.SENTRY_AUTH_TOKEN != '' }}"
        )
        assert "SENTRY_AUTH_TOKEN" not in job["env"]
        holders = [
            step["name"]
            for step in job["steps"]
            if "secrets.SENTRY_AUTH_TOKEN" in json.dumps(step)
        ]
        assert holders == ["Upload source maps to Sentry"]
        step = job["steps"][_index(job["steps"], "Upload source maps to Sentry")]
        assert step["env"]["SENTRY_AUTH_TOKEN"] == "${{ secrets.SENTRY_AUTH_TOKEN }}"
        # The token is read from the environment by sentry-cli; never echoed or put on a command line.
        assert "SENTRY_AUTH_TOKEN" not in step["run"]
        assert "secrets." not in step["run"]

    def test_upload_is_for_pushes_with_the_secret_and_fails_the_build_only_on_a_tag(
        self,
    ):
        step = _job()["steps"][_index(_job()["steps"], "Upload source maps to Sentry")]
        assert (
            step["if"]
            == "github.event_name == 'push' && env.HAS_SENTRY_TOKEN == 'true'"
        )
        assert (
            step["continue-on-error"] == "${{ !startsWith(github.ref, 'refs/tags/') }}"
        )

    def test_the_upload_names_the_org_project_release_and_dist(self):
        step = _job()["steps"][_index(_job()["steps"], "Upload source maps to Sentry")]
        assert step["env"]["SENTRY_ORG"] == "cuepoint"
        assert step["env"]["SENTRY_PROJECT"] == "electron"
        run = step["run"]
        assert "sourcemaps inject electron-dist renderer/dist" in run
        assert "sourcemaps upload" in run
        assert "cuepoint@${version}" in run
        assert '--dist "${dist}"' in run
        assert "${CUEPOINT_BUILD_COMMIT:0:7}" in run

    def test_the_commit_is_given_to_every_build_step(self):
        # A pull request's `github.sha` is a merge commit; its head is the code that was written.
        assert (
            _job()["env"]["CUEPOINT_BUILD_COMMIT"]
            == "${{ github.event.pull_request.head.sha || github.sha }}"
        )

    def test_order_build_inject_delete_then_package_without_rebuilding(self):
        steps = _job()["steps"]
        build = _index(steps, "Build desktop shell")
        upload = _index(steps, "Upload source maps to Sentry")
        delete = _index(steps, "Delete source maps")
        package = _index(steps, "Build Electron installers + artifacts")
        assert build < upload < delete < package
        # Straight after the build: no test step can fail first and skip it.
        assert upload == build + 1
        # `npm run dist` rebuilds first, which would replace the files `inject` wrote ids into.
        assert steps[package]["run"].startswith("npm run package")
        assert "npm run build" not in steps[package]["run"]
        # Portable (the Windows leg has no GNU find), and run even when the upload failed.
        assert "find " not in steps[delete]["run"]
        assert "'.map'" in steps[delete]["run"] and "rmSync" in steps[delete]["run"]
        assert steps[delete]["if"] == "always()"

    def test_every_leg_runs_the_steps_in_bash(self):
        steps = _job()["steps"]
        for name in ("Upload source maps to Sentry", "Delete source maps"):
            assert steps[_index(steps, name)]["shell"] == "bash"
