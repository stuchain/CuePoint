"""Engine config endpoints — secure Beatport token storage (Phase E)."""

from __future__ import annotations

import json
from typing import Any, Dict, Optional, Tuple

CONFIG_KEY = "incrate.beatport_access_token"

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


def mask_token(token: str) -> str:
    """Return a masked preview safe for API responses."""
    value = (token or "").strip()
    if not value:
        return ""
    if len(value) <= 4:
        return "••••"
    return f"••••{value[-4:]}"


def get_beatport_token_status() -> Dict[str, Any]:
    token = str(_get_config_service().get(CONFIG_KEY) or "").strip()
    configured = bool(token)
    return {
        "configured": configured,
        "masked": mask_token(token) if configured else None,
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
    return get_beatport_token_status()


def _resolve_base_url() -> str:
    service = _get_config_service()
    return (
        str(
            service.get("incrate.beatport_api_base_url")
            or "https://api.beatport.com/v4"
        ).strip()
        or "https://api.beatport.com/v4"
    )


def test_beatport_token(token: Optional[str] = None) -> Tuple[bool, str]:
    """Verify token against Beatport catalog/genres (same as Qt Settings test)."""
    resolved = (token or "").strip()
    if not resolved:
        resolved = str(_get_config_service().get(CONFIG_KEY) or "").strip()
    if not resolved:
        return False, "Enter a token first."

    try:
        import requests

        url = f"{_resolve_base_url().rstrip('/')}/catalog/genres"
        headers = {
            "Authorization": f"Bearer {resolved}",
            "Content-Type": "application/json",
        }
        response = requests.get(url, headers=headers, timeout=15)
    except Exception as exc:  # noqa: BLE001 — surface to API client
        return False, str(exc) or "Request failed."

    if response.status_code == 200:
        return True, "Token OK"
    if response.status_code == 401:
        return False, "Invalid or expired token."
    if response.status_code == 403:
        return False, "Access forbidden (token invalid or insufficient scope)."
    return False, f"API returned {response.status_code}."
