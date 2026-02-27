"""Beatport OAuth helpers: client credentials from env/file, token via password grant."""

import logging
import os
from pathlib import Path
from typing import Any, Callable, Optional, Tuple

import requests

_logger = logging.getLogger(__name__)

TOKEN_URL = "https://api.beatport.com/v4/auth/o/token/"


def get_oauth_client_credentials(
    config_get: Optional[Callable[[str], Any]] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """Return (client_id, client_secret) from env, config, or ~/.cuepoint/beatporttoken.txt."""
    cid = (os.environ.get("BEATPORT_CLIENT_ID") or "").strip()
    csecret = (os.environ.get("BEATPORT_CLIENT_SECRET") or "").strip()
    if cid and csecret:
        return (cid, csecret)
    if config_get:
        try:
            cid = cid or (config_get("incrate.beatport_client_id") or "").strip()
            csecret = csecret or (config_get("incrate.beatport_client_secret") or "").strip()
            if cid and csecret:
                return (cid, csecret)
        except Exception:
            pass
    token_file = Path.home() / ".cuepoint" / "beatporttoken.txt"
    if not token_file.exists():
        return (None, None)
    try:
        for line in token_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                k = k.strip().lower()
                v = v.strip()
                if k == "client_id":
                    cid = cid or v
                elif k == "client_secret":
                    csecret = csecret or v
    except Exception as e:
        _logger.debug("Could not read beatporttoken.txt: %s", e)
    return (cid or None, csecret or None)


def token_via_password(
    client_id: str,
    client_secret: str,
    username: str,
    password: str,
) -> str:
    """Exchange username/password for an access token (OAuth2 password grant)."""
    resp = requests.post(
        TOKEN_URL,
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "username": username.strip(),
            "password": password,
            "grant_type": "password",
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    access_token = data.get("access_token")
    if not access_token:
        raise RuntimeError("Token response had no access_token")
    return access_token
