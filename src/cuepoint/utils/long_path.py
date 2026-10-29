#!/usr/bin/env python3
# -*- coding: utf-8 -*-

r"""The spelling of a path that a Windows file call can open at any length (HARDEN-06).

Windows' ordinary file calls refuse an absolute path of 260 characters or more
(``MAX_PATH``), however deep the folder really is; a library under a long
artist/album tree, or a share path, is not rare. The ``\?\`` prefix turns the
limit off, and ``\?\UNC\`` does the same for ``\server\share``.

:func:`os_path` is the one place that knows this. Everything that hands a
*library* path to the operating system (the file check, the decoder, a tag
write, the export's folder checks) passes it through here first, and nothing
else changes: on every other platform, and for any path of 259 characters or
fewer, the text comes back untouched, so a short path is never rewritten and a
stored or displayed path is never the prefixed form.

The prefix switches Windows' own path clean-up off, so the helper does what it
would have done: forward slashes become backslashes and ``.``/``..`` segments
are collapsed. A relative path, or one with no drive (``\Music\a.mp3``),
cannot be prefixed and is returned as it came.
"""

from __future__ import annotations

import ntpath
import os
import re
from typing import Optional, Union

#: The longest absolute path Windows opens without the prefix: ``MAX_PATH`` is
#: 260 including the terminating NUL.
LIMIT = 259

_PREFIX = "\\\\?\\"
_UNC_PREFIX = "\\\\?\\UNC\\"

_ALREADY_PREFIXED = re.compile(r"^(\\\\[?.]\\|//[?.]/)")
_DRIVE_ABSOLUTE = re.compile(r"^[A-Za-z]:[\\/]")
_UNC = re.compile(r"^[\\/]{2}[^\\/?.][^\\/]*[\\/]+[^\\/]+")


def display_path(path: Optional[str]) -> Optional[str]:
    r"""Return ``path`` without the ``\?\`` prefix, for showing or recording.

    The prefix is for the operating system's calls only; a path a person reads
    or the library stores is the ordinary one (``\?\UNC\s\x`` becomes
    ``\s\x``).
    """
    if not path:
        return path
    if path.startswith(_UNC_PREFIX):
        return "\\\\" + path[len(_UNC_PREFIX) :]
    if path.startswith(_PREFIX):
        return path[len(_PREFIX) :]
    return path


def os_path(
    path: Union[str, "os.PathLike[str]", None], reserve: int = 0
) -> Optional[str]:
    r"""Return ``path`` spelled so the operating system can open it.

    On Windows an absolute path longer than :data:`LIMIT` characters gets the
    ``\?\`` prefix (``\?\UNC\`` for a network path); anything else, and
    every path on another platform, is returned unchanged. ``None`` and an
    empty string come back as they are.

    ``reserve`` is room for a name the caller will build beside the file (a
    temporary copy next to a tag write): the path is prefixed when it plus
    that many characters would pass the limit, so the sibling is as openable
    as the file.
    """
    if path is None or path == "":
        return path  # type: ignore[return-value]
    text = os.fspath(path)
    if os.name != "nt" or len(text) + reserve <= LIMIT:
        return text
    if _ALREADY_PREFIXED.match(text):
        return text
    if _UNC.match(text):
        normal = ntpath.normpath(text.replace("/", "\\"))
        return _UNC_PREFIX + normal[2:]
    if _DRIVE_ABSOLUTE.match(text):
        return _PREFIX + ntpath.normpath(text.replace("/", "\\"))
    return text
