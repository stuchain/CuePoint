"""The packaging contract: what the build writes is what electron-builder copies.

This is the test that would have caught a bug that shipped. `extraResources` in
`apps/desktop-electron/package.json` declared `resources/engine/${os}`, while
`build_engine_sidecar.py` wrote `resources/engine/win32`. `${os}` is a Platform's
`buildConfigurationKey` — `mac` / `win` / `linux` — so the path never resolved on
Windows or macOS. electron-builder does not fail on a missing `from`; it prints
`file source doesn't exist` and carries on, so every packaged Windows and macOS
build contained **no Python engine at all**, and only Linux matched by accident.

Nothing in the repository connected the two sides, so nothing noticed. These
tests are that connection: they expand the macros the way electron-builder does
and assert both sidecar builds write exactly there.

If electron-builder's macro vocabulary ever changes, this file is the place that
should fail first.
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

import pytest

# src/tests/unit/scripts -> 5 levels up
_REPO_ROOT = Path(__file__).resolve().parents[4]
_PACKAGE_JSON = _REPO_ROOT / "apps" / "desktop-electron" / "package.json"


def _load(name: str, relative: str):
    spec = importlib.util.spec_from_file_location(name, _REPO_ROOT / relative)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


engine_build = _load("build_engine_sidecar", "scripts/build_engine_sidecar.py")
player_fetch = _load("fetch_player_sidecar", "scripts/fetch_player_sidecar.py")

pytestmark = pytest.mark.unit


#: How electron-builder expands `${os}`: `Platform.buildConfigurationKey`.
#: (`app-builder-lib/out/core.js`: Platform.MAC = new Platform("mac", "mac",
#: "darwin"), WINDOWS = ("windows", "win", "win32"), LINUX = ("linux", "linux",
#: "linux") — the *second* argument is what `${os}` becomes.)
OS_MACRO = {"win32": "win", "darwin": "mac", "linux": "linux"}

#: How it expands `${arch}`: the `Arch` enum's name.
ARCH_MACRO = {"AMD64": "x64", "x86_64": "x64", "arm64": "arm64", "aarch64": "arm64"}

#: The platform/arch pairs CuePoint builds for.
BUILD_TARGETS = [
    ("win32", "AMD64"),
    ("darwin", "arm64"),
    ("darwin", "x86_64"),
    ("linux", "x86_64"),
]


def _extra_resources() -> list[dict]:
    config = json.loads(_PACKAGE_JSON.read_text(encoding="utf-8"))
    resources: list[dict] = config["build"]["extraResources"]
    return resources


def _expand(pattern: str, system: str, machine: str) -> str:
    """Expand `${os}` and `${arch}` the way electron-builder would."""
    return pattern.replace("${os}", OS_MACRO[system]).replace(
        "${arch}", ARCH_MACRO[machine]
    )


def _source_for(prefix: str) -> str:
    """The declared `from` pattern for a resource directory."""
    matches = [r for r in _extra_resources() if r["from"].startswith(prefix)]
    assert len(matches) == 1, f"expected one {prefix!r} entry, found {matches}"
    return str(matches[0]["from"])


class TestMacrosAreExpandable:
    def test_every_extra_resource_uses_only_known_macros(self):
        """An unknown macro expands to nothing and silently drops the payload."""
        known = {"os", "arch"}
        for resource in _extra_resources():
            used = set(re.findall(r"\$\{(\w+)\}", resource["from"]))
            assert used <= known, (
                f"{resource['from']!r} uses macros this test cannot verify: "
                f"{used - known}"
            )

    def test_both_sidecars_are_declared(self):
        froms = [r["from"] for r in _extra_resources()]
        assert any(f.startswith("resources/engine/") for f in froms)
        assert any(f.startswith("resources/player/") for f in froms)

    def test_each_sidecar_lands_where_the_app_looks_for_it(self):
        """`to` is what `process.resourcesPath` is joined with at runtime."""
        by_from = {r["from"]: r["to"] for r in _extra_resources()}
        assert by_from[_source_for("resources/engine/")] == "engine"
        assert by_from[_source_for("resources/player/")] == "player"


class TestEngineSidecarPath:
    """`build_engine_sidecar.py` must write where `extraResources` reads."""

    @pytest.mark.parametrize(("system", "machine"), BUILD_TARGETS)
    def test_build_output_matches_the_declared_source(self, system, machine):
        declared = _expand(_source_for("resources/engine/"), system, machine)
        written = f"resources/engine/{engine_build.platform_dir(system, machine)}"
        assert written == declared, (
            f"on {system}/{machine} the engine build writes {written!r} but "
            f"electron-builder copies from {declared!r}; the payload would be "
            "silently omitted from the package"
        )

    def test_an_unsupported_platform_returns_none_rather_than_a_bad_path(self):
        assert engine_build.platform_dir("freebsd", "x86_64") is None

    @pytest.mark.parametrize(
        ("machine", "expected"),
        [("AMD64", "x64"), ("x86_64", "x64"), ("arm64", "arm64"), ("aarch64", "arm64")],
    )
    def test_arch_normalization_matches_electron_builders(self, machine, expected):
        assert engine_build.normalize_arch(machine) == expected

    def test_it_does_not_use_pythons_platform_names(self):
        """The exact regression: `win32`/`darwin` are not `${os}` values."""
        for system, machine in BUILD_TARGETS:
            directory = engine_build.platform_dir(system, machine)
            assert not directory.startswith(("win32", "darwin")), (
                f"{directory!r} uses a Python platform name; ${{os}} never "
                "expands to that"
            )


class TestPlayerSidecarPath:
    """The same contract for the mpv sidecar (PLAYER-01)."""

    def test_every_pinned_target_matches_the_declared_source(self):
        declared_pattern = _source_for("resources/player/")
        manifest = player_fetch.load_manifest()
        for target in manifest.targets.values():
            system, _, arch = target.key.partition("-")
            system = {"win32": "win32", "darwin": "darwin", "linux": "linux"}[system]
            machine = {"x64": "x86_64", "arm64": "arm64"}[arch]
            declared = _expand(declared_pattern, system, machine)
            written = f"resources/player/{target.platform_dir}"
            assert written == declared, (
                f"{target.key} installs to {written!r} but electron-builder "
                f"copies from {declared!r}"
            )

    def test_both_sidecars_use_the_same_macro_vocabulary(self):
        """One convention, not two — the reason the engine bug was possible."""
        engine_pattern = _source_for("resources/engine/")
        player_pattern = _source_for("resources/player/")
        engine_macros = set(re.findall(r"\$\{(\w+)\}", engine_pattern))
        player_macros = set(re.findall(r"\$\{(\w+)\}", player_pattern))
        assert engine_macros == player_macros


class TestArchIsPartOfThePath:
    """Without `${arch}`, two builds for one OS overwrite each other."""

    def test_the_two_macos_arches_get_different_directories(self):
        arm = _expand(_source_for("resources/player/"), "darwin", "arm64")
        intel = _expand(_source_for("resources/player/"), "darwin", "x86_64")
        assert arm != intel

    def test_the_engine_also_separates_macos_arches(self):
        assert engine_build.platform_dir(
            "darwin", "arm64"
        ) != engine_build.platform_dir("darwin", "x86_64")
