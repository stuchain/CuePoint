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
# A copy of an audio file keeps its extension so a library can tell the format:
# ``.<stem>.cuepoint-tmp-<pid>[-<n>].<ext>``.
_TEMP_NAME = re.compile(r"^\..+\.cuepoint-tmp-(\d+)(?:-\d+)?(?:\.[^.]+)?$")

PathLike = Union[str, "os.PathLike[str]"]
Data = Union[bytes, bytearray, memoryview, str, IO[Any], Iterable[Union[bytes, str]]]


def temp_name_for(
    name: str,
    pid: int | None = None,
    serial: int = 0,
    keep_extension: bool = False,
) -> str:
    """The temporary file name for a file called ``name``.

    With ``keep_extension`` the original extension stays last
    (``.song.cuepoint-tmp-42.mp3``), for copies a library must recognise by name.
    """
    stem, extension = os.path.splitext(name) if keep_extension else (name, "")
    base = f".{stem}{TEMP_MARKER}{os.getpid() if pid is None else pid}"
    return (base if serial == 0 else f"{base}-{serial}") + extension


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


def create_temp(final: Path, keep_extension: bool = False) -> "tuple[Path, int]":
    """Create the temporary file beside ``final``, exclusively; return (path, fd).

    A name already taken (a concurrent write in this process) gets the next ``-<n>``.
    """
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0)
    serial = 0
    while True:
        candidate = final.with_name(
            temp_name_for(final.name, serial=serial, keep_extension=keep_extension)
        )
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
            chunk = data.read(1024 * 1024)
            if not chunk:
                break
            stream.write(chunk.encode(encoding) if isinstance(chunk, str) else chunk)
    else:
        for chunk in data:
            stream.write(chunk.encode(encoding) if isinstance(chunk, str) else chunk)


def stage_temp(path: PathLike, data: Data, *, encoding: str = "utf-8") -> Path:
    """Write ``data`` to a flushed, fsynced temporary file beside ``path``.

    Returns the temporary file's path. The caller then calls :func:`commit_temp`
    or :func:`discard_temp`. If writing fails the temporary file is removed.
    """
    final = Path(path)
    temp, descriptor = create_temp(final)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            _write_data(stream, data, encoding)
            stream.flush()
            os.fsync(stream.fileno())
        _keep_mode(final, temp)
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
    temp, descriptor = create_temp(final)
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


def sweep_stale_copies_of(final: PathLike, keep_extension: bool = False) -> List[Path]:
    """Remove dead processes' temporary copies of this one file; never raises."""
    final = Path(final)
    stem, extension = (
        os.path.splitext(final.name) if keep_extension else (final.name, "")
    )
    pattern = re.compile(
        r"^\."
        + re.escape(stem)
        + re.escape(TEMP_MARKER)
        + r"(\d+)(?:-\d+)?"
        + re.escape(extension)
        + "$"
    )
    removed: List[Path] = []
    try:
        entries = list(os.scandir(final.parent))
    except OSError:
        return removed
    for entry in entries:
        match = pattern.match(entry.name)
        if match is None or pid_alive(int(match.group(1))):
            continue
        try:
            os.unlink(entry.path)
            removed.append(Path(entry.path))
        except OSError:
            continue
    return removed


_PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
_STILL_ACTIVE = 259
_ERROR_INVALID_PARAMETER = 87


def _windows_pid_alive(
    pid: int, kernel32: Any = None, get_last_error: Any = None
) -> bool:
    """Windows liveness: the id opens *and* the process has not exited.

    ``os.kill(pid, 0)`` does not probe on Windows, and ``OpenProcess`` alone is
    not enough: an exited process still opens for as long as anything holds a
    handle to it (a ``Popen`` that has not been waited on, a parent), so its id
    would read as alive. ``GetExitCodeProcess`` says whether it has finished.
    A live process that itself exits with code 259 (``STILL_ACTIVE``) is read as
    still alive; that is rare, and "unknown counts as alive" is the safe side
    for a sweep that deletes files.

    ``kernel32`` and ``get_last_error`` are injectable so tests can drive this
    on any system.
    """
    import ctypes

    if kernel32 is None:
        kernel32 = getattr(ctypes, "WinDLL")("kernel32", use_last_error=True)
        kernel32.OpenProcess.restype = ctypes.c_void_p
    if get_last_error is None:
        get_last_error = getattr(ctypes, "get_last_error")
    handle = kernel32.OpenProcess(_PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not handle:
        # Only "no such process id" means dead; access denied and the rest mean alive.
        return bool(get_last_error() != _ERROR_INVALID_PARAMETER)
    try:
        code = ctypes.c_ulong(0)
        if not kernel32.GetExitCodeProcess(ctypes.c_void_p(handle), ctypes.byref(code)):
            return True  # cannot tell: alive
        return bool(code.value == _STILL_ACTIVE)
    finally:
        kernel32.CloseHandle(ctypes.c_void_p(handle))


def pid_alive(pid: int) -> bool:
    """Whether a process with this id exists (unknown counts as alive)."""
    if pid <= 0:
        return False
    if sys.platform == "win32":  # pragma: no cover - exercised on Windows only
        return _windows_pid_alive(pid)
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
    "create_temp",
    "stage_temp",
    "sweep_stale_copies_of",
    "sweep_own_folders",
    "sweep_temp_files",
    "temp_name_for",
    "write_atomic",
)
