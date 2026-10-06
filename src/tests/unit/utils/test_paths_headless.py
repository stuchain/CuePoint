"""The platform locations ``AppPaths`` builds on, without Qt (PRUNE-02).

``_standard_path`` once asked Qt's ``QStandardPaths`` first and fell back to the
operating system's conventions when Qt was missing or ``CUEPOINT_HEADLESS`` was
set, which is how the Electron engine sidecar always ran. Qt is gone, so the
fallback is the only path. These tests hold its answers on Windows, macOS and
Linux to what the sidecar has always resolved, whatever this machine is.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from cuepoint.utils import paths

HOME = Path("/home/dj")

#: What each platform answered before Qt was removed, for each location.
EXPECTED = {
    "windows": {
        "AppConfigLocation": Path("C:/Users/dj/AppData/Roaming"),
        "AppLocalDataLocation": Path("C:/Users/dj/AppData/Local"),
        "CacheLocation": Path("C:/Users/dj/AppData/Local"),
        "DocumentsLocation": Path("C:/Users/dj/Documents"),
    },
    "macos": {
        "AppConfigLocation": HOME / "Library" / "Application Support",
        "AppLocalDataLocation": HOME / "Library" / "Application Support",
        "CacheLocation": HOME / "Library" / "Caches",
        "DocumentsLocation": HOME / "Documents",
    },
    "linux": {
        "AppConfigLocation": HOME / ".config",
        "AppLocalDataLocation": HOME / ".local" / "share",
        "CacheLocation": HOME / ".cache",
        "DocumentsLocation": HOME / "Documents",
    },
}


@pytest.fixture()
def on(monkeypatch):
    """Make ``paths`` believe it runs on the given platform."""

    def choose(platform_name: str) -> None:
        monkeypatch.setattr(paths, "is_windows", lambda: platform_name == "windows")
        monkeypatch.setattr(paths, "is_macos", lambda: platform_name == "macos")
        monkeypatch.setattr(paths.Path, "home", classmethod(lambda cls: HOME))
        monkeypatch.setenv("APPDATA", "C:/Users/dj/AppData/Roaming")
        monkeypatch.setenv("LOCALAPPDATA", "C:/Users/dj/AppData/Local")
        monkeypatch.setenv("USERPROFILE", "C:/Users/dj")

    return choose


@pytest.mark.parametrize("platform_name", sorted(EXPECTED))
@pytest.mark.parametrize("location", sorted(EXPECTED["linux"]))
def test_each_platform_answers_as_it_always_has(on, platform_name, location):
    on(platform_name)
    assert paths._standard_path(location) == EXPECTED[platform_name][location]


def test_windows_falls_back_to_the_home_directory_without_its_variables(
    on, monkeypatch
):
    on("windows")
    for name in ("APPDATA", "LOCALAPPDATA", "USERPROFILE"):
        monkeypatch.delenv(name)
    assert paths._standard_path("AppConfigLocation") == HOME / "AppData" / "Roaming"
    assert paths._standard_path("CacheLocation") == HOME / "AppData" / "Local"
    assert paths._standard_path("DocumentsLocation") == HOME / "Documents"


def test_an_unknown_location_is_refused(on):
    on("linux")
    with pytest.raises(ValueError, match="Unknown standard path location"):
        paths._standard_path("MusicLocation")


def test_the_old_headless_switch_changes_nothing(on, monkeypatch):
    # CUEPOINT_HEADLESS used to skip Qt; with no Qt, every run is headless.
    on("linux")
    monkeypatch.delenv("CUEPOINT_HEADLESS", raising=False)
    without = paths._standard_path("AppConfigLocation")
    monkeypatch.setenv("CUEPOINT_HEADLESS", "1")
    assert paths._standard_path("AppConfigLocation") == without == HOME / ".config"


def test_app_paths_build_their_directories_on_it(monkeypatch, tmp_path):
    monkeypatch.setattr(paths, "is_windows", lambda: False)
    monkeypatch.setattr(paths, "is_macos", lambda: False)
    monkeypatch.setattr(paths.Path, "home", classmethod(lambda cls: tmp_path))
    assert paths.AppPaths.config_dir() == tmp_path / ".config" / "CuePoint"
    assert paths.AppPaths.data_dir() == tmp_path / ".local" / "share" / "CuePoint"
    assert paths.AppPaths.config_dir().is_dir()
