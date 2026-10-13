#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Who must let go of a database file before it is moved or deleted.

Something outside persistence (the engine's revisions) may keep a read-only
connection open on ``cuepoint.db`` or ``waveforms.db``. On Windows an open
SQLite connection forbids renaming or deleting the file (and its ``-wal`` and
``-shm``), so code that is about to do that calls :func:`release` first.

A watcher registers a callback with :func:`register`; the callback receives the
path and closes any connection of its own on that file. It must reopen lazily
and treat the file as changed. Persistence knows nothing about who registers.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Callable, List, Union

_logger = logging.getLogger(__name__)

Callback = Callable[[Path], None]

_lock = threading.Lock()
_callbacks: List[Callback] = []


def register(callback: Callback) -> None:
    """Add ``callback`` (once) to those told when a file is about to be moved."""
    with _lock:
        if callback not in _callbacks:
            _callbacks.append(callback)


def unregister(callback: Callback) -> None:
    """Remove ``callback``; unknown callbacks are ignored."""
    with _lock:
        if callback in _callbacks:
            _callbacks.remove(callback)


def release(path: Union[str, Path]) -> None:
    """Ask every watcher to close its connection on ``path``.

    Never raises: a watcher that fails must not stop a restore or a set-aside.
    """
    target = Path(path)
    with _lock:
        callbacks = list(_callbacks)
    for callback in callbacks:
        try:
            callback(target)
        except Exception:  # noqa: BLE001 — best effort, see above
            _logger.debug("[file_watchers] release of %s failed", target, exc_info=True)


__all__ = ("register", "release", "unregister")
