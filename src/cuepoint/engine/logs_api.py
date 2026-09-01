"""Log viewer HTTP API for Electron engine sidecar (Phase 6)."""

from __future__ import annotations

import re
from typing import Any, Dict, Optional

from cuepoint.utils.paths import AppPaths
from cuepoint.utils.support_bundle import SupportBundleGenerator


def _normalize_level(level: Optional[str]) -> Optional[str]:
    if not level:
        return None
    level_str = str(level).strip()
    if not level_str or level_str.lower() == "all":
        return None
    upper = level_str.upper()
    if upper in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
        return upper
    return None


def _filter_lines(
    text: str,
    *,
    level: Optional[str],
    search: Optional[str],
) -> str:
    lines = text.splitlines()

    if level:
        # Logger uses padded level names, e.g. `[INFO    ]`
        level_re = re.compile(rf"\[{re.escape(level)}\s*\]")
        lines = [ln for ln in lines if level_re.search(ln)]

    if search:
        term = str(search).lower()
        lines = [ln for ln in lines if term in ln.lower()]

    return "\n".join(lines)


def get_cuepoint_logs_dir() -> str:
    return str(AppPaths.logs_dir())


def get_cuepoint_log_text(
    *,
    level: Optional[str] = None,
    search: Optional[str] = None,
    tail_lines: int = 10_000,
    max_bytes: int = 5_000_000,
    sanitize: bool = True,
) -> Dict[str, Any]:
    """Return cuepoint.log contents (optionally filtered), safe for UI display."""
    logs_dir = AppPaths.logs_dir()
    log_file = logs_dir / "cuepoint.log"

    if not log_file.exists():
        return {
            "logs_dir": str(logs_dir),
            "cuepoint_log": "",
            "size_bytes": 0,
        }

    try:
        size_bytes = log_file.stat().st_size
    except Exception:
        size_bytes = 0

    # Read up to max_bytes from the end to avoid huge payloads.
    try:
        with open(log_file, "rb") as f:
            if max_bytes > 0 and size_bytes > max_bytes:
                f.seek(size_bytes - max_bytes)
            raw = f.read()
    except Exception:
        raw = b""

    text = raw.decode("utf-8", errors="ignore")

    # Apply tail filtering after decoding.
    lines = text.splitlines()
    if len(lines) > tail_lines:
        text = "\n".join(lines[-tail_lines:])

    text = _filter_lines(text, level=_normalize_level(level), search=search)

    if sanitize:
        text = SupportBundleGenerator._sanitize_log_content(text)

    return {
        "logs_dir": str(logs_dir),
        "cuepoint_log": text,
        "size_bytes": size_bytes,
    }
