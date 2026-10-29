"""Whole-or-nothing file writes (HARDEN-04).

Every file CuePoint writes is, after a crash or a power cut, either the old
version or the new one, never a mix and never empty. The way there is the same
for all of them: write a temporary file beside the target, flush it, ``fsync`` it,
``os.replace`` it over the target, then ``fsync`` the folder (POSIX) so the rename
itself survives a power cut.

The temporary file is named ``.<name>.cuepoint-tmp-<pid>`` (a ``-<n>`` is added
when two writers in one process write the same target at once), so what a killed
write leaves behind can be told apart and swept: :func:`sweep_temp_files` removes
those whose process is gone. The Electron side has the same helper
(``electron/atomicWrite.ts``) and the same names.

Three levels, for the writers that need them:

* :func:`write_atomic` - bytes, text or a stream in; the file is whole or absent.
* :func:`atomic_file` - a context manager yielding a file object, for writers that
  stream (CSV, JSON, XML). Leaving the block with an exception discards the
  temporary file and leaves the target as it was.
* :func:`stage_temp` / :func:`commit_temp` / :func:`discard_temp` - the pieces,
  for writers that do something between writing and replacing (a cancel check,
  keeping the previous file, verifying the copy of an audio file).
"""

from __future__ import annotations

import contextlib
import os
import re
import sys
from pathlib import Path
from typing import IO, Any, Iterable, Iterator, List, Sequence, Union

TEMP_MARKER = ".cuepoint-tmp-"

# ``.<name>.cuepoint-tmp-<pid>`` or ``.<name>.cuepoint-tmp-<pid>-<n>``.
_TEMP_NAME = re.compile(r"^\..+\.cuepoint-tmp-(\d+)(?:-\d+)?$")

PathLike = Union[str, "os.PathLike[str]"]
Data = Union[bytes, bytearray, memoryview, str, IO[Any], Iterable[Union[bytes, str]]]


def temp_name_for(name: str, pid: int | None = None, serial: int = 0) -> str:
    """The temporary file name for a file called ``name``."""
    base = f".{name}{TEMP_MARKER}{os.getpid() if pid is None else pid}"
    return base if serial == 0 else f"{base}-{serial}"


def fsync_folder(folder: PathLike) -> None:
    """``fsync`` a folder so a rename in it survives a power cut (POSIX only).

    Windows cannot open a folder this way, and a failure is not worth failing a
    write that has already landed, so errors are swallowed.
    """
    if sys.platform == "win32":
        return
    try:
        descriptor = os.open(os.fspath(folder), os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(descriptor)
    except OSError:
        pass
    finally:
        os.close(descriptor)


def _create_temp(final: Path) -> "tuple[Path, int]":
    """Create the temporary file beside ``final``, exclusively; return (path, fd)."""
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0)
    serial = 0
    while True:
        candidate = final.with_name(temp_name_for(final.name, serial=serial))
        try:
            return candidate, os.open(candidate, flags, 0o666)
        except FileExistsError:
            serial += 1
            if serial > 1000:  # pragma: no cover - something is badly wrong
                raise


def discard_temp(temp: PathLike) -> None:
    """Remove a temporary file if it is still there; never raises."""
    try:
        os.unlink(temp)
    except OSError:
        pass


def _write_data(stream: IO[Any], data: Data, encoding: str) -> None:
    if isinstance(data, str):
        stream.write(data.encode(encoding))
    elif isinstance(data, (bytes, bytearray, memoryview)):
        stream.write(data)
    elif hasattr(data, "read"):
        while True:
            chunk = data.read(1024 * 1024)  # type: ignore[union-attr]
            if not chunk:
                break
            stream.write(chunk.encode(encoding) if isinstance(chunk, str) else chunk)
    else:
        for chunk in data:  # type: ignore[union-attr]
            stream.write(chunk.encode(encoding) if isinstance(chunk, str) else chunk)


def stage_temp(path: PathLike, data: Data, *, encoding: str = "utf-8") -> Path:
    """Write ``data`` to a flushed, fsynced temporary file beside ``path``.

    Returns the temporary file's path. The caller then calls :func:`commit_temp`
    or :func:`discard_temp`. If writing fails the temporary file is removed.
    """
    final = Path(path)
    temp, descriptor = _create_temp(final)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            _write_data(stream, data, encoding)
            stream.flush()
            os.fsync(stream.fileno())
    except BaseException:
        discard_temp(temp)
        raise
    return temp


def fsync_file(path: PathLike) -> None:
    """``fsync`` a file by path (for a copy another library wrote)."""
    flags = os.O_RDWR | getattr(os, "O_BINARY", 0)
    descriptor = os.open(os.fspath(path), flags)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def commit_temp(temp: PathLike, path: PathLike) -> None:
    """Put the temporary file in place of ``path``, then ``fsync`` the folder.

    The temporary file is not removed on failure; the caller discards it.
    """
    os.replace(temp, path)
    fsync_folder(Path(path).parent)


def write_atomic(path: PathLike, data: Data, *, encoding: str = "utf-8") -> int:
    """Replace ``path`` with ``data`` whole or not at all; returns bytes written.

    ``data`` is bytes, text (encoded with ``encoding``), a binary or text stream,
    or an iterable of bytes or text chunks. A failure anywhere leaves the old
    file as it was and no temporary file behind.
    """
    final = Path(path)
    temp = stage_temp(final, data, encoding=encoding)
    try:
        size = temp.stat().st_size
        _keep_mode(final, temp)
        commit_temp(temp, final)
    except BaseException:
        discard_temp(temp)
        raise
    return size


def _keep_mode(final: Path, temp: Path) -> None:
    """Give the new file the old file's permission bits (POSIX)."""
    if sys.platform == "win32":
        return
    try:
        os.chmod(temp, os.stat(final).st_mode & 0o7777)
    except OSError:
        pass


@contextlib.contextmanager
def atomic_file(
    path: PathLike,
    mode: str = "wb",
    *,
    encoding: str | None = None,
    newline: str | None = None,
    buffering: int = -1,
) -> Iterator[IO[Any]]:
    """Open a temporary file for streaming; on a clean exit it replaces ``path``.

    ``mode`` is ``"wb"`` or ``"w"`` (text, ``encoding`` default UTF-8). An
    exception in the block discards the temporary file and leaves ``path`` alone.
    """
    if "w" not in mode:
        raise ValueError("atomic_file is for writing: mode must contain 'w'")
    final = Path(path)
    temp, descriptor = _create_temp(final)
    try:
        if "b" in mode:
            stream: IO[Any] = os.fdopen(descriptor, "wb", buffering=buffering)
        else:
            stream = os.fdopen(
                descriptor,
                "w",
                buffering=buffering,
                encoding=encoding or "utf-8",
                newline=newline,
            )
        with stream:
            yield stream
            stream.flush()
            os.fsync(stream.fileno())
        _keep_mode(final, temp)
        commit_temp(temp, final)
    except BaseException:
        discard_temp(temp)
        raise


def pid_alive(pid: int) -> bool:
    """Whether a process with this id exists (unknown counts as alive)."""
    if pid <= 0:
        return False
    if sys.platform == "win32":  # pragma: no cover - exercised on Windows only
        import ctypes

        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        handle = kernel32.OpenProcess(0x1000, False, pid)  # QUERY_LIMITED_INFORMATION
        if not handle:
            return kernel32.GetLastError() == 5  # access denied: it exists
        kernel32.CloseHandle(handle)
        return True
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return True
    return True


def sweep_temp_files(folders: Iterable[PathLike]) -> List[Path]:
    """Remove ``.*.cuepoint-tmp-<pid>`` files whose process is gone.

    Looks only at the top level of each folder given (missing folders are
    skipped). Returns the files removed. Never raises.
    """
    removed: List[Path] = []
    for folder in folders:
        try:
            entries = list(os.scandir(folder))
        except OSError:
            continue
        for entry in entries:
            match = _TEMP_NAME.match(entry.name)
            if match is None:
                continue
            try:
                if not entry.is_file(follow_symlinks=False):
                    continue
                if pid_alive(int(match.group(1))):
                    continue
                os.unlink(entry.path)
                removed.append(Path(entry.path))
            except OSError:
                continue
    return removed


def _folders_below(root: Path, depth: int) -> List[Path]:
    """``root`` and the folders below it, ``depth`` levels down (missing: none)."""
    found: List[Path] = []
    if not root.is_dir():
        return found
    found.append(root)
    if depth <= 0:
        return found
    try:
        children = [
            Path(e.path) for e in os.scandir(root) if e.is_dir(follow_symlinks=False)
        ]
    except OSError:
        return found
    for child in children:
        found.extend(_folders_below(child, depth - 1))
    return found


def sweep_own_folders() -> List[Path]:
    """Sweep CuePoint's own folders (home, data, backups, the artwork cache).

    Called once at engine start. Never raises: a sweep that cannot run is not
    worth stopping the engine for.
    """
    try:
        from cuepoint.services.artwork_cache import default_artwork_cache_dir
        from cuepoint.utils.paths import cuepoint_home

        roots = [cuepoint_home(), default_artwork_cache_dir()]
        folders: List[Path] = []
        for root in roots:
            folders.extend(_folders_below(Path(root), 3))
        return sweep_temp_files(folders)
    except Exception:  # noqa: BLE001 - housekeeping only
        return []


__all__: Sequence[str] = (
    "TEMP_MARKER",
    "atomic_file",
    "commit_temp",
    "discard_temp",
    "fsync_file",
    "fsync_folder",
    "pid_alive",
    "stage_temp",
    "sweep_own_folders",
    "sweep_temp_files",
    "temp_name_for",
    "write_atomic",
)
