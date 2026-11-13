"""Engine saves on Windows failed when another program held the file for a moment (B7).

What broke: ``commit_temp`` made one ``os.replace``. On Windows an antivirus
scan, Explorer's preview or the search indexer can hold the target for a moment,
and that one replace failed with "Access is denied" (seen once in Sentry,
ELECTRON-4, on the Electron side, which was then given a retry; the engine's
Save to files, exports, set lists and config were not). Easy to bring back:
any writer that calls ``os.replace`` directly instead of ``commit_temp``, or a
platform check that reads the real ``sys.platform`` and so never runs off
Windows in CI.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from cuepoint.utils import atomic_write
from cuepoint.utils.atomic_write import (
    BUSY_RETRY_DELAYS_S,
    replace_retrying,
    write_atomic,
)


def _held(times: int, monkeypatch: pytest.MonkeyPatch) -> list[float]:
    """Make ``os.replace`` refuse ``times`` times as Windows does, then work; returns the waits."""
    real = os.replace
    left = {"n": times}

    def replace(src: os.PathLike[str] | str, dst: os.PathLike[str] | str) -> None:
        if left["n"] > 0:
            left["n"] -= 1
            error = PermissionError(13, "Access is denied")
            error.winerror = 5  # type: ignore[attr-defined]
            raise error
        real(src, dst)

    monkeypatch.setattr(atomic_write.os, "replace", replace)
    waits: list[float] = []
    monkeypatch.setattr(atomic_write.time, "sleep", waits.append)
    return waits


def test_a_save_survives_a_target_held_for_a_moment_on_windows(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "config.yaml"
    target.write_text("old", encoding="utf-8")
    monkeypatch.setattr(atomic_write.sys, "platform", "win32")
    waits = _held(3, monkeypatch)

    write_atomic(target, "new")

    assert target.read_text(encoding="utf-8") == "new"
    assert waits == list(BUSY_RETRY_DELAYS_S[:3])
    assert not [p for p in tmp_path.iterdir() if p.name != "config.yaml"], (
        "no temporary file left behind"
    )


def test_a_target_held_longer_than_a_second_still_fails_and_keeps_the_old_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "set.txt"
    target.write_text("old", encoding="utf-8")
    monkeypatch.setattr(atomic_write.sys, "platform", "win32")
    waits = _held(len(BUSY_RETRY_DELAYS_S) + 1, monkeypatch)

    with pytest.raises(PermissionError):
        write_atomic(target, "new")

    assert target.read_text(encoding="utf-8") == "old"
    assert sum(waits) == pytest.approx(1.0)


def test_off_windows_a_refusal_is_raised_at_once(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source = tmp_path / "a"
    source.write_text("x", encoding="utf-8")
    waits = _held(1, monkeypatch)
    with pytest.raises(PermissionError):
        replace_retrying(source, tmp_path / "b", platform="linux")
    assert waits == []
