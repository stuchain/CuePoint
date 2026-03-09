"""Playlist name generation for inCrate (Phase 4): short (e.g. feb26) or ISO date."""

from datetime import date
from typing import Optional

_MONTH_ABBREV = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
]


def default_playlist_name(
    format: str = "short",
    reference_date: Optional[date] = None,
) -> str:
    """Return a default playlist name from the given format and date.

    Args:
        format: "short" -> e.g. "feb26" (month abbrev lower + day); "iso" -> e.g. "2025-02-26".
            Unknown format defaults to "short".
        reference_date: Date to use; if None, uses date.today().

    Returns:
        Playlist name string.
    """
    d = reference_date or date.today()
    if format == "iso":
        return d.isoformat()
    # short or unknown
    month_idx = d.month - 1
    if 0 <= month_idx < len(_MONTH_ABBREV):
        month_str = _MONTH_ABBREV[month_idx]
    else:
        month_str = "jan"
    return f"{month_str}{d.day}"
