"""HARDEN-04: whole-or-nothing writes."""

from __future__ import annotations

import io
import os
import subprocess
import sys
from pathlib import Path

import pytest

from cuepoint.utils import atomic_write
from cuepoint.utils.atomic_write import (
    atomic_file,
    commit_temp,
    pid_alive,
    stage_temp,
    sweep_temp_files,
    temp_name_for,
    write_atomic,
)


def _leftovers(folder: Path) -> list[str]:
    return sorted(
        p.name for p in folder.iterdir() if atomic_write.TEMP_MARKER in p.name
    )


def test_temp_name_shape():
    assert temp_name_for("a.xml", pid=42) == ".a.xml.cuepoint-tmp-42"
    assert temp_name_for("a.xml", pid=42, serial=2) == ".a.xml.cuepoint-tmp-42-2"


def test_writes_bytes_text_and_streams(tmp_path):
    target = tmp_path / "out.bin"
    assert write_atomic(target, b"abc") == 3
    assert target.read_bytes() == b"abc"
    write_atomic(target, "héllo", encoding="utf-8")
    assert target.read_text(encoding="utf-8") == "héllo"
    write_atomic(target, io.BytesIO(b"stream"))
    assert target.read_bytes() == b"stream"
    write_atomic(target, (chunk for chunk in [b"a", "b", b"c"]))
    assert target.read_bytes() == b"abc"
    assert _leftovers(tmp_path) == []


def test_failure_mid_write_keeps_old_file_and_removes_temp(tmp_path):
    target = tmp_path / "out.txt"
    target.write_bytes(b"old")

    def chunks():
        yield b"new-part"
        raise RuntimeError("disk went away")

    with pytest.raises(RuntimeError):
        write_atomic(target, chunks())
    assert target.read_bytes() == b"old"
    assert _leftovers(tmp_path) == []


def test_failure_at_replace_keeps_old_file_and_removes_temp(tmp_path, monkeypatch):
    target = tmp_path / "out.txt"
    target.write_bytes(b"old")

    def refuse(src, dst):
        raise PermissionError("in use")

    monkeypatch.setattr(atomic_write.os, "replace", refuse)
    with pytest.raises(PermissionError):
        write_atomic(target, b"new")
    assert target.read_bytes() == b"old"
    assert _leftovers(tmp_path) == []


def test_temp_is_beside_target_with_pid_name(tmp_path, monkeypatch):
    seen = []
    real_replace = os.replace

    def spy(src, dst):
        seen.append(Path(src).name)
        real_replace(src, dst)

    monkeypatch.setattr(atomic_write.os, "replace", spy)
    write_atomic(tmp_path / "set.m3u8", b"x")
    assert seen == [f".set.m3u8.cuepoint-tmp-{os.getpid()}"]


def test_data_is_fsynced_before_replace(tmp_path, monkeypatch):
    order = []
    real_fsync, real_replace = os.fsync, os.replace
    monkeypatch.setattr(
        atomic_write.os, "fsync", lambda fd: (order.append("fsync"), real_fsync(fd))[1]
    )
    monkeypatch.setattr(
        atomic_write.os,
        "replace",
        lambda a, b: (order.append("replace"), real_replace(a, b))[1],
    )
    write_atomic(tmp_path / "f", b"x")
    assert order.index("fsync") < order.index("replace")


@pytest.mark.skipif(sys.platform == "win32", reason="POSIX folder fsync")
def test_folder_is_fsynced_after_replace_on_posix(tmp_path, monkeypatch):
    opened = []
    fsynced = []
    real_open, real_fsync = os.open, os.fsync

    def spy_open(path, flags, *args, **kwargs):
        fd = real_open(path, flags, *args, **kwargs)
        opened.append((os.fspath(path), fd))
        return fd

    def spy_fsync(fd):
        fsynced.append(fd)
        return real_fsync(fd)

    monkeypatch.setattr(atomic_write.os, "open", spy_open)
    monkeypatch.setattr(atomic_write.os, "fsync", spy_fsync)
    write_atomic(tmp_path / "f", b"x")
    folder_fds = [fd for path, fd in opened if path == str(tmp_path)]
    assert folder_fds and folder_fds[0] in fsynced


def test_keeps_existing_mode(tmp_path):
    if sys.platform == "win32":
        pytest.skip("POSIX modes")
    target = tmp_path / "f"
    target.write_bytes(b"old")
    target.chmod(0o640)
    write_atomic(target, b"new")
    assert target.stat().st_mode & 0o777 == 0o640


def test_atomic_file_commits_on_clean_exit(tmp_path):
    target = tmp_path / "t.csv"
    with atomic_file(target, "w", newline="") as handle:
        handle.write("a,b\r\n")
    assert target.read_bytes() == b"a,b\r\n"
    assert _leftovers(tmp_path) == []


def test_atomic_file_discards_on_error(tmp_path):
    target = tmp_path / "t.csv"
    target.write_text("old")
    with pytest.raises(ValueError):
        with atomic_file(target, "w") as handle:
            handle.write("half")
            raise ValueError("boom")
    assert target.read_text() == "old"
    assert _leftovers(tmp_path) == []


def test_atomic_file_rejects_read_mode(tmp_path):
    with pytest.raises(ValueError):
        with atomic_file(tmp_path / "x", "rb"):
            pass


def test_two_writers_in_one_process_do_not_collide(tmp_path):
    target = tmp_path / "same"
    first = stage_temp(target, b"one")
    second = stage_temp(target, b"two")
    assert first != second
    commit_temp(first, target)
    assert target.read_bytes() == b"one"
    atomic_write.discard_temp(second)
    assert _leftovers(tmp_path) == []


def _dead_pid() -> int:
    process = subprocess.Popen([sys.executable, "-c", "pass"])
    process.wait()
    return process.pid


def test_sweep_removes_dead_pid_temps_only(tmp_path):
    dead = _dead_pid()
    assert not pid_alive(dead)
    gone = tmp_path / temp_name_for("a.xml", pid=dead)
    gone_serial = tmp_path / temp_name_for("b.xml", pid=dead, serial=1)
    mine = tmp_path / temp_name_for("c.xml", pid=os.getpid())
    plain = tmp_path / "a.xml"
    lookalike = tmp_path / f"visible.cuepoint-tmp-{dead}"  # no leading dot
    other = tmp_path / ".hidden"
    for path in (gone, gone_serial, mine, plain, lookalike, other):
        path.write_bytes(b"x")

    removed = sweep_temp_files([tmp_path, tmp_path / "missing"])

    assert sorted(p.name for p in removed) == sorted([gone.name, gone_serial.name])
    assert not gone.exists() and not gone_serial.exists()
    for kept in (mine, plain, lookalike, other):
        assert kept.exists()


def test_pid_alive_for_self():
    assert pid_alive(os.getpid())
    assert not pid_alive(0)


def test_sweep_own_folders_clears_dead_temps_in_home_and_below(tmp_path, monkeypatch):
    home = tmp_path / "home"
    (home / "backups").mkdir(parents=True)
    (home / "cache" / "artwork" / "ab").mkdir(parents=True)
    monkeypatch.setenv("CUEPOINT_HOME", str(home))
    dead = _dead_pid()
    old = [
        home / temp_name_for("library.db", pid=dead),
        home / "backups" / temp_name_for("a.db", pid=dead),
        home / "cache" / "artwork" / "ab" / temp_name_for("x.jpg", pid=dead),
    ]
    live = home / temp_name_for("config.yaml", pid=os.getpid())
    for path in [*old, live]:
        path.write_bytes(b"x")

    removed = atomic_write.sweep_own_folders()

    assert sorted(removed) == sorted(old)
    assert live.exists()
