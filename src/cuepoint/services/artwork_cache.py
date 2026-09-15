#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The bounded cache of artwork thumbnails (CLEAN-09, DEC-076 as amended).

It holds thumbnails only, as JPEG files, one per source image per named size.
No original is ever written: embedded artwork already lives in the file, and a
Beatport image is fetched again when CLEAN-10 embeds it. Everything here can be
rebuilt by scanning again, which is why the cache sits outside the database and
outside the DEC-009 backup.

Keys, and why identical images are stored once
----------------------------------------------
A key is a SHA-256 of where the image came from: of the embedded picture's
bytes, or of the Beatport URL fetched. Two tracks from one release share an
image, and store it once.

Bounded, least recently used first
----------------------------------
The cache has a byte cap. A thumbnail read is touched, so its modified time is
when it was last used — a file system's access time cannot be trusted for that,
and Windows does not keep one by default. When a write takes the cache over the
cap, the least recently used thumbnails are deleted until it is back under
:data:`EVICT_TO_FRACTION` of it, so a cache at its cap does not evict on every
write.

Writes go to a temporary file in the same folder and are renamed into place, so
a reader never sees half a thumbnail and a crash never leaves one.
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import tempfile
import threading
from pathlib import Path
from typing import List, Optional, Tuple

_logger = logging.getLogger(__name__)

#: The cap on the whole cache. A table-row thumbnail is a few kilobytes and an
#: Inspector one a few tens; see CLEAN-09's measurements for a 50,000-track
#: library, which this holds every row thumbnail of with room to spare.
ARTWORK_CACHE_MAX_BYTES = 512 * 1024 * 1024

#: How far below the cap an eviction goes.
EVICT_TO_FRACTION = 0.9

_KEY = re.compile(r"[0-9a-f]{64}")
_SUFFIX = ".jpg"


class ArtworkCache:
    """Thumbnails on disk, keyed by source and size, bounded in bytes."""

    def __init__(
        self, directory: Path, max_bytes: int = ARTWORK_CACHE_MAX_BYTES
    ) -> None:
        """Use ``directory``, created when the first thumbnail is written.

        Raises:
            ValueError: If ``max_bytes`` is not positive.
        """
        if int(max_bytes) <= 0:
            raise ValueError(f"The artwork cache needs a positive cap, not {max_bytes}")
        self._directory = Path(directory)
        self._max_bytes = int(max_bytes)
        self._lock = threading.Lock()
        self._total: Optional[int] = None

    @property
    def directory(self) -> Path:
        """Where the thumbnails live."""
        return self._directory

    @property
    def max_bytes(self) -> int:
        """The cap."""
        return self._max_bytes

    def path_for(self, key: str, size: int) -> Path:
        """The file a thumbnail is kept in.

        Raises:
            ValueError: If the key is not a SHA-256 in hex or the size is not a
                positive whole number. A key is never a path a caller chose.
        """
        if not isinstance(key, str) or not _KEY.fullmatch(key):
            raise ValueError(f"An artwork cache key is a SHA-256 in hex, not {key!r}")
        if isinstance(size, bool) or not isinstance(size, int) or size <= 0:
            raise ValueError(
                f"A thumbnail size is a positive whole number, not {size!r}"
            )
        return self._directory / key[:2] / f"{key}-{size}{_SUFFIX}"

    def get(self, key: str, size: int) -> Optional[bytes]:
        """The thumbnail, touched as used; None when it is not cached."""
        path = self.path_for(key, size)
        try:
            data = path.read_bytes()
        except OSError:
            return None
        try:
            os.utime(path, None)
        except OSError:
            pass
        return data

    def has(self, key: str, size: int) -> bool:
        """Whether a thumbnail is cached, without touching it."""
        return self.path_for(key, size).is_file()

    def put(self, key: str, size: int, data: bytes) -> None:
        """Store a thumbnail, evicting the least recently used past the cap."""
        path = self.path_for(key, size)
        if not self._directory.is_dir():
            # Cleared from outside (Privacy → Clear cache): count again.
            with self._lock:
                self._total = None
        path.parent.mkdir(parents=True, exist_ok=True)
        previous = path.stat().st_size if path.is_file() else 0
        handle, temporary = tempfile.mkstemp(dir=str(path.parent), suffix=".part")
        try:
            with os.fdopen(handle, "wb") as out:
                out.write(data)
            os.replace(temporary, path)
        except BaseException:
            try:
                os.remove(temporary)
            except OSError:
                pass
            raise
        with self._lock:
            if self._total is not None:
                self._total += len(data) - previous
        if self.total_bytes() > self._max_bytes:
            self.evict()

    def total_bytes(self) -> int:
        """Bytes the cache holds, counted once and then kept up to date."""
        with self._lock:
            if self._total is None:
                self._total = sum(size for _, size, _ in self._entries())
            return self._total

    def evict(self) -> int:
        """Delete least recently used thumbnails until under the low mark.

        Returns:
            How many thumbnails were deleted.
        """
        target = int(self._max_bytes * EVICT_TO_FRACTION)
        with self._lock:
            entries = sorted(self._entries(), key=lambda entry: entry[2])
            total = sum(size for _, size, _ in entries)
            removed = 0
            for path, size, _ in entries:
                if total <= target:
                    break
                try:
                    path.unlink()
                except OSError:
                    continue
                total -= size
                removed += 1
            self._total = total
        if removed:
            _logger.info("[artwork] evicted %d thumbnails from the cache", removed)
        return removed

    def clear(self) -> None:
        """Delete every thumbnail."""
        with self._lock:
            for path, _, _ in self._entries():
                try:
                    path.unlink()
                except OSError:
                    pass
            self._total = 0

    def _entries(self) -> List[Tuple[Path, int, float]]:
        """Every thumbnail as ``(path, size, last used)``."""
        found: List[Tuple[Path, int, float]] = []
        if not self._directory.is_dir():
            return found
        for path in self._directory.glob(f"*/*{_SUFFIX}"):
            try:
                stat = path.stat()
            except OSError:
                continue
            found.append((path, int(stat.st_size), float(stat.st_mtime)))
        return found


def clear_artwork_cache() -> None:
    """Delete every thumbnail in the default location. Never raises."""
    try:
        shutil.rmtree(default_artwork_cache_dir(), ignore_errors=True)
    except Exception as exc:  # noqa: BLE001 — clearing a cache is best-effort
        _logger.debug("[artwork] could not clear the thumbnail cache: %s", exc)


def default_artwork_cache_dir() -> Path:
    """Where thumbnails live: the platform's cache directory, under ``artwork``.

    ``%LOCALAPPDATA%\\CuePoint`` on Windows, ``~/Library/Caches/CuePoint`` on
    macOS, ``~/.cache/CuePoint`` on Linux — the cache location every other
    CuePoint cache uses. When ``CUEPOINT_HOME`` is set the thumbnails follow it
    instead, under ``cache``, so a second profile, a portable install and the
    test suite keep theirs beside the rest of their state.
    """
    from cuepoint.utils.paths import CUEPOINT_HOME_ENV, AppPaths, cuepoint_home

    if os.environ.get(CUEPOINT_HOME_ENV, "").strip():
        return cuepoint_home() / "cache" / "artwork"
    return AppPaths.cache_dir() / "artwork"


__all__ = (
    "ARTWORK_CACHE_MAX_BYTES",
    "EVICT_TO_FRACTION",
    "ArtworkCache",
    "clear_artwork_cache",
    "default_artwork_cache_dir",
)
