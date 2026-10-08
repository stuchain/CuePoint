"""Tests for the release workflows (DIST-04, DEC-170, DEC-177, DEC-178).

Nothing here runs a workflow; it reads the YAML and holds the order and the
rules that make a tag publish a release safely: gate, build, check the Macs,
draft, upload, and only then publish.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

_REPO_ROOT = Path(__file__).resolve().parents[4]
_WORKFLOWS = _REPO_ROOT / ".github" / "workflows"

pytestmark = pytest.mark.unit


def _load(name: str) -> dict:
    data = yaml.safe_load((_WORKFLOWS / name).read_text(encoding="utf-8"))
    # PyYAML reads the bare key `on` as the boolean True.
    if True in data:
        data["on"] = data.pop(True)
    return data


@pytest.fixture(scope="module")
def release() -> dict:
    return _load("release.yml")


@pytest.fixture(scope="module")
def build_workflow() -> dict:
    return _load("desktop-electron.yml")


def _runs(job: dict) -> str:
    return "\n".join(s.get("run", "") for s in job["steps"])


def _gh_steps(job: dict) -> list:
    return [s for s in job["steps"] if "gh " in s.get("run", "")]


def _index(text: str, needle: str) -> int:
    assert needle in text, f"{needle!r} not found"
    return text.index(needle)


class TestMirrorWorkflow:
    def test_is_dispatch_only_and_serialised(self):
        wf = _load("mirror-player-sidecar.yml")
        assert wf["on"] == {"workflow_dispatch": None}
        assert wf["concurrency"]["group"]
        assert wf["permissions"] == {"contents": "write"}


class TestTrigger:
    def test_runs_on_v_tags_only(self, release):
        assert release["on"] == {"push": {"tags": ["v*"]}}

    def test_default_permissions_are_read_only(self, release):
        assert release["permissions"] == {"contents": "read"}

    def test_only_publish_can_write(self, release):
        for name, job in release["jobs"].items():
            perms = job.get("permissions", {})
            if name == "publish":
                assert perms.get("contents") == "write"
            else:
                assert perms.get("contents", "read") == "read"

    def test_publish_is_serialised_per_tag(self, release):
        group = release["jobs"]["publish"]["concurrency"]
        text = group["group"] if isinstance(group, dict) else group
        assert "github.ref_name" in text or "github.ref" in text


class TestJobOrder:
    def test_gate_build_check_publish(self, release):
        jobs = release["jobs"]
        assert "needs" not in jobs["gate"]
        assert jobs["build"]["needs"] == "gate"
        assert jobs["check-macs"]["needs"] == "build"
        assert set(jobs["publish"]["needs"]) == {"gate", "check-macs"}

    def test_build_calls_the_build_workflow_as_a_release(self, release):
        build = release["jobs"]["build"]
        assert build["uses"] == "./.github/workflows/desktop-electron.yml"
        assert build["with"] == {"release": True}
        assert build["secrets"] == "inherit"


class TestGate:
    def test_validates_the_tag_and_the_changelog(self, release):
        text = _runs(release["jobs"]["gate"])
        assert 'validate_version.py --tag "${GITHUB_REF_NAME}"' in text
        assert "release_notes.py" in text
        assert "notes.md" in text

    def test_history_is_fetched_for_the_ancestry_check(self, release):
        checkout = next(
            s
            for s in release["jobs"]["gate"]["steps"]
            if str(s.get("uses", "")).startswith("actions/checkout")
        )
        assert checkout["with"]["fetch-depth"] == 0

    def test_a_normal_tag_must_be_on_main(self, release):
        text = _runs(release["jobs"]["gate"])
        assert 'git merge-base --is-ancestor "$GITHUB_SHA" origin/main' in text
        # Test tags skip it.
        assert "-test." in text
        assert _index(text, "-test.") < _index(text, "merge-base")

    def test_outputs_version_and_prerelease(self, release):
        outputs = release["jobs"]["gate"]["outputs"]
        assert set(outputs) >= {"version", "prerelease"}

    def test_notes_are_uploaded_for_publish(self, release):
        uploads = [
            s
            for s in release["jobs"]["gate"]["steps"]
            if str(s.get("uses", "")).startswith("actions/upload-artifact")
        ]
        assert any("notes.md" in str(u["with"]["path"]) for u in uploads)


class TestCheckMacs:
    def test_runs_on_a_mac_and_takes_both_chips(self, release):
        job = release["jobs"]["check-macs"]
        assert job["runs-on"] == "macos-latest"
        download = next(
            s for s in job["steps"] if "download-artifact" in str(s.get("uses", ""))
        )
        assert download["with"]["pattern"] == "release-macos-*"
        text = _runs(job)
        assert "arm64" in text and "x64" in text

    def test_verifies_the_bundle_and_the_signature(self, release):
        text = _runs(release["jobs"]["check-macs"])
        assert "ditto -x -k" in text
        assert "verify_macos_bundle.py" in text
        assert "codesign --verify --deep --strict" in text

    def test_no_hardened_runtime_is_demanded(self, release):
        # DEC-170: unsigned, so the ad hoc signature is all there is.
        assert "--expect-hardened-runtime" not in _runs(release["jobs"]["check-macs"])


class TestPublish:
    @pytest.fixture()
    def job(self, release):
        return release["jobs"]["publish"]

    def test_draft_then_upload_then_publish(self, job):
        text = _runs(job)
        create = _index(text, "gh release create")
        upload = _index(text, "gh release upload")
        edit = _index(text, "gh release edit")
        assert create < upload < edit
        assert "--draft" in text[create:upload]
        assert "--verify-tag" in text[create:upload]
        assert "--notes-file notes.md" in text[create:upload]
        assert "--clobber" in text[upload:edit]
        assert "--draft=false" in text[edit:]

    def test_the_edit_is_the_last_gh_step(self, job):
        steps = _gh_steps(job)
        assert "gh release edit" in steps[-1]["run"]
        assert sum("gh release edit" in s["run"] for s in steps) == 1
        assert "gh release create" in steps[0]["run"]

    def test_a_test_tag_is_a_pre_release_and_not_latest(self, job):
        text = _runs(job)
        create = text[
            _index(text, "gh release create") : _index(text, "gh release upload")
        ]
        edit = text[_index(text, "gh release edit") :]
        assert "--prerelease" in create
        assert "--prerelease" in edit
        assert "--latest=false" in edit

    def test_a_normal_tag_is_made_latest(self, job):
        edit = _runs(job)
        edit = edit[_index(edit, "gh release edit") :]
        assert "--latest" in edit.replace("--latest=false", "")

    def _step_index(self, job, needle):
        for i, step in enumerate(job["steps"]):
            if needle in step.get("run", ""):
                return i
        raise AssertionError(f"no step runs {needle!r}")

    def test_the_mac_manifests_are_merged_before_the_draft(self, job):
        merge = self._step_index(job, "merge_update_manifests.py")
        create = self._step_index(job, "gh release create")
        assert merge < create
        # The merged file is written into the folder that is uploaded.
        assert "upload/latest-mac.yml" in job["steps"][merge]["run"]

    def test_the_per_leg_mac_manifests_are_not_uploaded(self, job):
        gather = job["steps"][self._step_index(job, "merge_update_manifests.py")]["run"]
        assert "latest-mac.yml" in gather.split("merge_update_manifests.py", 1)[1]
        assert "continue" in gather

    def test_mac_checksums_name_the_merged_manifest_before_the_draft(self, job):
        sums = self._step_index(job, "prepare_release_assets.py mac-sums")
        merge = self._step_index(job, "merge_update_manifests.py")
        assert merge < sums < self._step_index(job, "gh release create")

    def test_every_file_is_checked_before_the_draft(self, job):
        check = self._step_index(job, "prepare_release_assets.py check")
        assert self._step_index(job, "mac-sums") < check
        assert check < self._step_index(job, "gh release create")
        assert "--version" in job["steps"][check]["run"]

    def test_a_rerun_reuses_a_draft_and_refuses_a_published_release(self, job):
        run = job["steps"][self._step_index(job, "gh release create")]["run"]
        assert "gh release view" in run and "isDraft" in run
        assert run.index("gh release view") < run.index("gh release create")
        assert "already published" in run
        # `create` is reached only through the branch where `view` failed.
        assert run.count("gh release create") == 2
        assert "elif" in run

    def test_uses_the_workflow_token(self, job):
        assert job["env"]["GH_TOKEN"] == "${{ github.token }}"


class TestBuildWorkflow:
    def test_is_callable_with_a_release_flag_and_keeps_its_triggers(
        self, build_workflow
    ):
        on = build_workflow["on"]
        assert "push" in on
        assert "pull_request" in on
        release_input = on["workflow_call"]["inputs"]["release"]
        assert release_input["type"] == "boolean"
        assert release_input["default"] is False

    def _step(self, wf, name):
        return next(
            s for s in wf["jobs"]["desktop-electron"]["steps"] if s.get("name") == name
        )

    def test_sentry_upload_is_required_for_a_release(self, build_workflow):
        step = self._step(build_workflow, "Upload source maps to Sentry")
        assert "inputs.release" in str(step["continue-on-error"])
        # A tag push reaches here as the caller's event: 'push'.
        assert "github.event_name == 'push'" in step["if"]
        assert "HAS_SENTRY_TOKEN" in step["if"]

    def test_a_release_without_the_sentry_secret_fails_the_leg(self, build_workflow):
        step = self._step(build_workflow, "Require the Sentry token for a release")
        assert "inputs.release" in step["if"]
        assert "HAS_SENTRY_TOKEN" in step["if"]
        assert "exit 1" in step["run"]
        names = [
            s.get("name") for s in build_workflow["jobs"]["desktop-electron"]["steps"]
        ]
        assert names.index("Require the Sentry token for a release") < names.index(
            "Upload source maps to Sentry"
        )

    def test_release_artifact_holds_only_the_distributables(self, build_workflow):
        step = self._step(build_workflow, "Upload release files")
        assert "inputs.release" in step["if"]
        assert step["with"]["name"] == "release-${{ matrix.leg }}"
        assert step["with"]["retention-days"] <= 14
        paths = step["with"]["path"]
        for needed in (
            "*.blockmap",
            "latest*.yml",
            "SHA256SUMS-${{ matrix.leg }}.txt",
            "CuePoint-*",
        ):
            assert needed in paths
        assert "**" not in paths
