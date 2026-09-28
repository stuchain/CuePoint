"""A Beatport playlist's default name: short (e.g. feb26) or ISO date.

Written for inCrate and kept when it retired (DISCOVER-12): the playlist push
(``beatport_playlist_service.py``) names a playlist this way unless the user
gives a name, in the format ``incrate.playlist_name_format`` chooses.
"""

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
