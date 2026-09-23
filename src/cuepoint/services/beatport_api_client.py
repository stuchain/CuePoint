"""Low-level HTTP client for Beatport API (Phase 2). Auth, GET, error handling, retries.

Every catalog request CuePoint makes goes through :class:`BeatportApiClient`, so
the rules that have to hold for all of them live here (DISCOVER-01):

- **A request budget.** At most :data:`MAX_CONCURRENT_REQUESTS` requests are in
  flight across the whole engine, whichever service makes them, so a discovery
  run and an open page cannot exceed it together.
- **Errors say what happened.** :func:`classify_beatport_error` turns any
  failure into one of five classes (:data:`BEATPORT_ERROR_CLASSES`), which is
  what every empty state downstream is built from (DEC-098).
- **A 429 is honored once.** ``Retry-After`` is waited out a single time when
  it is short enough to wait for, and then reported, rather than retried in a
  loop that a rate limiter would only extend.
- **A POST is never redirected.** Beatport answers a path without its trailing
  slash with a 301, and ``requests`` replays a redirected POST as a GET — so a
  create would silently read a list instead. POSTs refuse redirects outright.
- **Responses are bounded.** A body larger than :data:`MAX_RESPONSE_BYTES` is
  refused before it is parsed.
"""

import email.utils
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

import requests

from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.services.reliability_retry import run_with_retry

_logger = logging.getLogger(__name__)

#: Beatport requests in flight at once, across the engine.
MAX_CONCURRENT_REQUESTS = 4

#: The longest ``Retry-After`` CuePoint waits out before retrying once. A
#: longer one is reported straight away: nobody should watch a job sit still
#: for minutes because a rate limiter said so.
MAX_RETRY_AFTER_SECONDS = 30.0

#: The wait before the one retry of a 429 that gave no ``Retry-After``.
DEFAULT_RETRY_AFTER_SECONDS = 2.0

#: The largest response body parsed. The biggest legitimate answer is a page
#: of 100 tracks, well under 1 MiB.
MAX_RESPONSE_BYTES = 8 * 1024 * 1024

#: No token is configured.
ERROR_NO_TOKEN = "no_token"
#: Beatport rejected the token (401): invalid or expired.
ERROR_REJECTED = "rejected"
#: The token is valid but not allowed this (403), e.g. no playlist scope.
ERROR_FORBIDDEN = "forbidden"
#: Rate limited (429), after the one honored ``Retry-After``.
ERROR_RATE_LIMITED = "rate_limited"
#: Anything else: network, timeout, 5xx, an unreadable or oversized answer.
ERROR_UNAVAILABLE = "unavailable"

BEATPORT_ERROR_CLASSES = (
    ERROR_NO_TOKEN,
    ERROR_REJECTED,
    ERROR_FORBIDDEN,
    ERROR_RATE_LIMITED,
    ERROR_UNAVAILABLE,
)

_NO_TOKEN_MESSAGE = (
    "Configure Beatport API token "
    "(incrate.beatport_access_token or BEATPORT_ACCESS_TOKEN)"
)

# One gate for the engine: every client shares it unless a test passes its own.
_SHARED_REQUEST_GATE = threading.BoundedSemaphore(MAX_CONCURRENT_REQUESTS)


def classify_beatport_error(error: BaseException) -> str:
    """Return the :data:`BEATPORT_ERROR_CLASSES` member describing ``error``.

    Anything that is not a recognised Beatport refusal is ``unavailable``: the
    person can do nothing about it but try again later.
    """
    if isinstance(error, BeatportAPIError):
        if error.error_code == "BEATPORT_API_NO_TOKEN":
            return ERROR_NO_TOKEN
        status = error.status_code
        if status == 401:
            return ERROR_REJECTED
        if status == 403:
            return ERROR_FORBIDDEN
        if status == 429:
            return ERROR_RATE_LIMITED
    return ERROR_UNAVAILABLE


def parse_retry_after(
    value: Optional[str], now: Optional[datetime] = None
) -> Optional[float]:
    """Seconds to wait from a ``Retry-After`` header, or None if it says nothing.

    The header is either a number of seconds or an HTTP date. A date in the
    past is zero seconds.
    """
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    try:
        seconds = float(text)
    except ValueError:
        try:
            when = email.utils.parsedate_to_datetime(text)
        except (TypeError, ValueError):
            return None
        if when is None:
            return None
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        current = now or datetime.now(timezone.utc)
        seconds = (when - current).total_seconds()
    if seconds != seconds:  # NaN
        return None
    return max(0.0, seconds)


class BeatportApiClient:
    """HTTP client for Beatport API with Bearer auth and retries."""

    def __init__(
        self,
        base_url: str,
        access_token: str,
        timeout: int = 30,
        session: Optional[requests.Session] = None,
        request_gate: Optional[threading.BoundedSemaphore] = None,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self.base_url = base_url.rstrip("/")
        self.access_token = access_token or ""
        self.timeout = timeout
        self._session = session if session is not None else requests.Session()
        self._gate = request_gate if request_gate is not None else _SHARED_REQUEST_GATE
        self._sleep = sleep

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    def _require_token(self) -> None:
        if not self.access_token:
            raise BeatportAPIError(
                _NO_TOKEN_MESSAGE,
                status_code=0,
                error_code="BEATPORT_API_NO_TOKEN",
            )

    def _request(self, method: str, path: str, **kwargs: Any) -> requests.Response:
        url = f"{self.base_url}/{path.lstrip('/')}"
        kwargs.setdefault("headers", self._headers())
        kwargs.setdefault("timeout", self.timeout)
        params = kwargs.get("params") or {}
        _logger.info(
            "Beatport API request: %s %s params=%s",
            method,
            path,
            {
                k: (str(v)[:80] if v is not None else v)
                for k, v in list(params.items())[:5]
            },
        )
        with self._gate:
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
            body_len = 0
            _logger.info(
                "Beatport API response: %s %s -> %s", method, path, resp.status_code
            )
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
            headers = getattr(resp, "headers", None) or {}
            raise BeatportAPIError(
                "Rate limited; try again later",
                status_code=429,
                retry_after=parse_retry_after(headers.get("Retry-After")),
                error_code="BEATPORT_API_RATE_LIMIT",
            )
        if resp.status_code >= 500:
            raise BeatportAPIError(
                f"Beatport API error: {resp.status_code}",
                status_code=resp.status_code,
                error_code="BEATPORT_API_SERVER_ERROR",
            )
        if isinstance(body_len, int) and body_len > MAX_RESPONSE_BYTES:
            raise BeatportAPIError(
                f"Beatport API response too large ({body_len} bytes)",
                status_code=resp.status_code,
                error_code="BEATPORT_API_TOO_LARGE",
            )
        return resp

    def _honoring_rate_limit_once(self, call: Callable[[], Any]) -> Any:
        """Run ``call``; on a 429, wait out ``Retry-After`` once and run it again.

        A second 429, or a ``Retry-After`` longer than
        :data:`MAX_RETRY_AFTER_SECONDS`, is raised for the caller to report.
        """
        try:
            return call()
        except BeatportAPIError as e:
            if e.status_code != 429:
                raise
            wait = e.retry_after
            if wait is None:
                wait = DEFAULT_RETRY_AFTER_SECONDS
            if wait > MAX_RETRY_AFTER_SECONDS:
                raise
            _logger.info("Beatport API 429: waiting %.1fs before one retry", wait)
            self._sleep(wait)
            return call()

    def get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """GET path with optional query params; return JSON.

        A 404 answers None. A 429 is retried once, honoring ``Retry-After``;
        a 5xx is retried with backoff. A 401 or 403 is raised at once.
        """
        self._require_token()

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
            try:
                return self._honoring_rate_limit_once(_get)
            except BeatportAPIError as e:
                status = getattr(e, "status_code", None) or 0
                if status >= 500:
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
        """POST path with optional JSON body; return JSON. Raises on 4xx/5xx.

        Never follows a redirect (see the module docstring), and is not retried
        except for one honored 429, which Beatport answers before acting.
        """
        self._require_token()

        def _post() -> Any:
            resp = self._request("POST", path, json=json or {}, allow_redirects=False)
            if 300 <= resp.status_code < 400:
                raise BeatportAPIError(
                    f"Beatport API redirected a POST to {path!r} "
                    f"({resp.status_code}); the path is wrong",
                    status_code=resp.status_code,
                    error_code="BEATPORT_API_REDIRECT",
                )
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

        try:
            return self._honoring_rate_limit_once(_post)
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
