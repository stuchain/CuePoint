"""Low-level HTTP client for Beatport API (Phase 2). Auth, GET, error handling, retries."""

import logging
from typing import Any, Dict, Optional

import requests

from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.services.reliability_retry import run_with_retry

_logger = logging.getLogger(__name__)


class BeatportApiClient:
    """HTTP client for Beatport API with Bearer auth and retries."""

    def __init__(
        self,
        base_url: str,
        access_token: str,
        timeout: int = 30,
        session: Optional[requests.Session] = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.access_token = access_token or ""
        self.timeout = timeout
        self._session = session if session is not None else requests.Session()

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    def _request(self, method: str, path: str, **kwargs: Any) -> requests.Response:
        url = f"{self.base_url}/{path.lstrip('/')}"
        kwargs.setdefault("headers", self._headers())
        kwargs.setdefault("timeout", self.timeout)
        params = kwargs.get("params") or {}
        _logger.info(
            "Beatport API request: %s %s params=%s",
            method,
            path,
            {k: (str(v)[:80] if v is not None else v) for k, v in list(params.items())[:5]},
        )
        resp = self._session.request(method, url, **kwargs)
        try:
            body_len = len(resp.content) if resp.content else 0
            _logger.info(
                "Beatport API response: %s %s -> %s (body %s bytes)",
                method,
                path,
                resp.status_code,
                body_len,
            )
        except Exception:
            _logger.info("Beatport API response: %s %s -> %s", method, path, resp.status_code)
        if resp.status_code == 401:
            _logger.warning("Beatport API 401: invalid or expired token")
            raise BeatportAPIError(
                "Invalid or expired Beatport API token",
                status_code=401,
                error_code="BEATPORT_API_AUTH",
            )
        if resp.status_code == 403:
            raise BeatportAPIError(
                "Beatport API access forbidden",
                status_code=403,
                error_code="BEATPORT_API_FORBIDDEN",
            )
        if resp.status_code == 429:
            _logger.warning("Beatport API 429 rate limit")
            raise BeatportAPIError(
                "Rate limited; try again later",
                status_code=429,
                error_code="BEATPORT_API_RATE_LIMIT",
            )
        if resp.status_code >= 500:
            raise BeatportAPIError(
                f"Beatport API error: {resp.status_code}",
                status_code=resp.status_code,
                error_code="BEATPORT_API_SERVER_ERROR",
            )
        return resp

    def get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """GET path with optional query params; return JSON. Retries on 5xx/429 only."""
        if not self.access_token:
            raise BeatportAPIError(
                "Configure Beatport API token (incrate.beatport_access_token or BEATPORT_ACCESS_TOKEN)",
                status_code=0,
                error_code="BEATPORT_API_NO_TOKEN",
            )

        def _get() -> Any:
            resp = self._request("GET", path, params=params)
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            try:
                return resp.json()
            except ValueError as e:
                raise BeatportAPIError(
                    "Invalid API response",
                    error_code="BEATPORT_API_JSON",
                ) from e

        try:
            return _get()
        except BeatportAPIError as e:
            if getattr(e, "status_code", None) in (401, 403):
                raise
            if getattr(e, "status_code", None) in (429,) or (
                getattr(e, "status_code", 0) and getattr(e, "status_code", 0) >= 500
            ):
                return run_with_retry(_get, max_retries=2, base_delay=1.0)
            raise
        except requests.exceptions.Timeout as e:
            raise BeatportAPIError(
                "Request timed out",
                status_code=0,
                error_code="BEATPORT_API_TIMEOUT",
            ) from e
        except requests.exceptions.RequestException as e:
            raise BeatportAPIError(
                str(e) or "Beatport API request failed",
                status_code=getattr(getattr(e, "response", None), "status_code", None),
                error_code="BEATPORT_API_HTTP",
            ) from e

    def post(self, path: str, json: Optional[Dict[str, Any]] = None) -> Any:
        """POST path with optional JSON body; return JSON. Raises on 4xx/5xx."""
        if not self.access_token:
            raise BeatportAPIError(
                "Configure Beatport API token (incrate.beatport_access_token or BEATPORT_ACCESS_TOKEN)",
                status_code=0,
                error_code="BEATPORT_API_NO_TOKEN",
            )
        resp = self._request("POST", path, json=json or {})
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        try:
            return resp.json() if resp.content else None
        except ValueError as e:
            raise BeatportAPIError(
                "Invalid API response",
                error_code="BEATPORT_API_JSON",
            ) from e
