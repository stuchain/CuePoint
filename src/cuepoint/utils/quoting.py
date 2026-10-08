"""Quote a value inside a message so the report scrubber can find it (REPORT-02).

``f"{value!r}"`` doubles every backslash, so a Windows path reads ``'C:\\\\Users\\\\...'`` in a
message the user sees. ``quoted`` keeps the text as it is and only picks quotes the value does not
contain. It falls back to ``repr`` when no plain quote fits or the value has a line break or another
control character, because the scrubber's quote rule does not span lines.
"""

from __future__ import annotations

import os
from typing import Any

__all__ = ["quoted"]


def quoted(value: Any) -> str:
    """Return ``value`` as text in single quotes, or double quotes when it holds a single one."""
    text = os.fspath(value) if isinstance(value, os.PathLike) else str(value)
    if not text.isprintable():
        return repr(text)
    if "'" not in text:
        return f"'{text}'"
    if '"' not in text:
        return f'"{text}"'
    return repr(text)
