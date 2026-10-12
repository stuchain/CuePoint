"""Engine config endpoints — secure Beatport token storage (Phase E)."""

from __future__ import annotations

import json
from typing import Any, Dict, Optional, Tuple

from cuepoint.services.beatport_token import (
    CONFIG_KEY,
    resolve_access_token,
    set_session_token as _store_session_token,
)

_services_bootstrapped = False


def _ensure_services() -> None:
    global _services_bootstrapped
    if _services_bootstrapped:
        return
    from cuepoint.services.bootstrap import bootstrap_services

    bootstrap_services()
    _services_bootstrapped = True


def _get_config_service():
    _ensure_services()
    from cuepoint.utils.di_container import get_container
    from cuepoint.services.interfaces import IConfigService

    return get_container().resolve(IConfigService)


def _scrub_secret(token: str) -> None:
    """Make a report remove this token wherever it appears (it is a credential)."""
    try:
        from cuepoint.reporting.engine_reporting import add_scrub_token

        add_scrub_token(token)
    except Exception:  # noqa: BLE001 - reporting must never break a token update
        pass


def mask_token(token: str) -> str:
    """Return a masked preview safe for API responses."""
    value = (token or "").strip()
    if not value:
        return ""
    if len(value) <= 4:
        return "••••"
    return f"••••{value[-4:]}"


def get_beatport_token_status() -> Dict[str, Any]:
    """Whether a token is in force, its mask, and where it comes from.

    ``source`` is ``env``, ``session`` (pushed by the desktop app's sign-in) or
    ``config`` (the config key), or ``None`` when there is no token.
    """
    token, source = resolve_access_token(_get_config_service())
    configured = bool(token)
    return {
        "configured": configured,
        "masked": mask_token(token or "") if configured else None,
        "source": source,
    }


def parse_beatport_token_body(raw: bytes) -> Dict[str, Any]:
    if not raw:
        raise ValueError("Request body required")
    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON body") from exc
    if not isinstance(data, dict):
        raise ValueError("JSON body must be an object")
    if "token" not in data:
        raise ValueError("token is required")
    token = data.get("token")
    if token is not None and not isinstance(token, str):
        raise ValueError("token must be a string")
    return {"token": (token or "").strip()}


def parse_beatport_session_body(raw: bytes) -> Dict[str, Any]:
    """``{token: str | null}``; a blank string clears the session token too."""
    if not raw:
        raise ValueError("Request body required")
    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON body") from exc
    if not isinstance(data, dict):
        raise ValueError("JSON body must be an object")
    if "token" not in data:
        raise ValueError("token is required")
    token = data.get("token")
    if token is not None and not isinstance(token, str):
        raise ValueError("token must be a string or null")
    return {"token": (token or "").strip() or None}


def parse_beatport_token_test_body(raw: bytes) -> Dict[str, Any]:
    if not raw:
        return {"token": None}
    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON body") from exc
    if not isinstance(data, dict):
        raise ValueError("JSON body must be an object")
    token = data.get("token")
    if token is not None and not isinstance(token, str):
        raise ValueError("token must be a string")
    return {"token": (token or "").strip() or None}


def set_beatport_token(token: str) -> Dict[str, Any]:
    service = _get_config_service()
    service.set(CONFIG_KEY, token.strip())
    service.save()
    if token.strip():
        _scrub_secret(token)
    return get_beatport_token_status()


def set_session_token(token: Optional[str]) -> Dict[str, Any]:
    """Hold the desktop session token in memory (``None`` forgets it).

    Answers the status; the token itself is never echoed.
    """
    _store_session_token(token)
    if token and token.strip():
        _scrub_secret(token)
    return get_beatport_token_status()


def take_legacy_token() -> Dict[str, Any]:
    """Return the token the config key holds, for the desktop's one-time move.

    The only route that answers a secret; main calls it behind the bearer.
    """
    token = str(_get_config_service().get(CONFIG_KEY) or "").strip()
    return {"token": token or None}


def _resolve_base_url() -> str:
    service = _get_config_service()
    return (
        str(
            service.get("incrate.beatport_api_base_url")
            or "https://api.beatport.com/v4"
        ).strip()
        or "https://api.beatport.com/v4"
    )


def test_beatport_token(token: Optional[str] = None) -> Tuple[bool, str, Optional[str]]:
    """Verify token against Beatport catalog/genres (same as Qt Settings test).

    Returns ``(ok, message, reason)``; ``reason`` is None when ok, else
    ``"missing"`` (nothing to test), ``"rejected"`` (Beatport answered 401/403)
    or ``"unreachable"`` (network error or any other answer).
    """
    resolved = (token or "").strip()
    if not resolved:
        resolved = resolve_access_token(_get_config_service())[0] or ""
    if not resolved:
        return False, "Enter a token first.", "missing"

    try:
        import requests

        url = f"{_resolve_base_url().rstrip('/')}/catalog/genres"
        headers = {
            "Authorization": f"Bearer {resolved}",
            "Content-Type": "application/json",
        }
        response = requests.get(url, headers=headers, timeout=15)
    except Exception:  # noqa: BLE001 — surface to API client
        return False, "The request did not go through.", "unreachable"

    if response.status_code == 200:
        return True, "Token OK", None
    if response.status_code == 401:
        return False, "The token is invalid or has expired.", "rejected"
    if response.status_code == 403:
        return False, "The token is not allowed to use this service.", "rejected"
    return (
        False,
        "Beatport had a problem answering. Try again later.",
        "unreachable",
    )
