"""Where the engine finds the Beatport access token.

Three sources, strongest first: the ``BEATPORT_ACCESS_TOKEN`` environment
variable, the desktop session token that Electron main pushes into the engine's
memory after a Beatport sign-in, and the ``incrate.beatport_access_token``
config key (still read, so existing config files keep working).

The session token lives only in this process's memory; it is never written to
disk or logged.
"""

from __future__ import annotations

import os
import threading
from typing import Any, Optional, Tuple

CONFIG_KEY = "incrate.beatport_access_token"
ENV_VAR = "BEATPORT_ACCESS_TOKEN"

SOURCE_ENV = "env"
SOURCE_SESSION = "session"
SOURCE_CONFIG = "config"

_lock = threading.Lock()
_session_token: Optional[str] = None


def set_session_token(token: Optional[str]) -> None:
    """Remember ``token`` for this process, or forget it when blank or ``None``."""
    global _session_token
    value = (token or "").strip()
    with _lock:
        _session_token = value or None


def get_session_token() -> Optional[str]:
    with _lock:
        return _session_token


def resolve_access_token(cfg: Any) -> Tuple[Optional[str], Optional[str]]:
    """Return ``(token, source)``; both ``None`` when no source holds a token."""
    env = (os.environ.get(ENV_VAR) or "").strip()
    if env:
        return env, SOURCE_ENV
    session = get_session_token()
    if session:
        return session, SOURCE_SESSION
    configured = ""
    if cfg is not None:
        configured = str(cfg.get(CONFIG_KEY) or "").strip()
    if configured:
        return configured, SOURCE_CONFIG
    return None, None
