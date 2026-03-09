"""Unit tests for BeatportApiClient."""

from unittest.mock import Mock, patch

import pytest
import requests

from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.services.beatport_api_client import BeatportApiClient


class TestBeatportApiClientGet:
    """Test BeatportApiClient.get."""

    def test_get_sends_auth_header(self):
        """get() sends Authorization Bearer header."""
        with patch.object(requests.Session, "request") as req:
            req.return_value = Mock(
                status_code=200, json=Mock(return_value={"data": []})
            )
            req.return_value.raise_for_status = Mock()
            client = BeatportApiClient("https://api.test", "secret-token", timeout=30)
            client.get("/genres")
            call_kw = req.call_args[1]
            assert "Authorization" in call_kw["headers"]
            assert call_kw["headers"]["Authorization"] == "Bearer secret-token"

    def test_get_returns_json(self):
        """get() returns response.json()."""
        with patch.object(requests.Session, "request") as req:
            req.return_value = Mock(
                status_code=200, json=Mock(return_value={"data": []})
            )
            req.return_value.raise_for_status = Mock()
            client = BeatportApiClient("https://api.test", "token")
            out = client.get("/genres")
            assert out == {"data": []}

    def test_get_raises_on_401(self):
        """get() raises BeatportAPIError on 401."""
        with patch.object(requests.Session, "request") as req:
            req.return_value = Mock(status_code=401)
            client = BeatportApiClient("https://api.test", "bad-token")
            with pytest.raises(BeatportAPIError) as exc_info:
                client.get("/genres")
            assert exc_info.value.status_code == 401

    def test_get_raises_on_500(self):
        """get() raises BeatportAPIError on 500 (after retries)."""
        with patch.object(requests.Session, "request") as req:
            req.return_value = Mock(status_code=500)
            client = BeatportApiClient("https://api.test", "token")
            with pytest.raises(BeatportAPIError):
                client.get("/genres")

    def test_get_passes_params(self):
        """get() passes params to request."""
        with patch.object(requests.Session, "request") as req:
            req.return_value = Mock(status_code=200, json=Mock(return_value=[]))
            req.return_value.raise_for_status = Mock()
            client = BeatportApiClient("https://api.test", "token")
            client.get("/charts", params={"genre_id": 1, "from": "2025-01-01"})
            call_kw = req.call_args[1]
            assert call_kw["params"] == {"genre_id": 1, "from": "2025-01-01"}

    def test_get_timeout_passed(self):
        """get() passes timeout to request."""
        with patch.object(requests.Session, "request") as req:
            req.return_value = Mock(status_code=200, json=Mock(return_value=[]))
            req.return_value.raise_for_status = Mock()
            client = BeatportApiClient("https://api.test", "token", timeout=15)
            client.get("/genres")
            call_kw = req.call_args[1]
            assert call_kw["timeout"] == 15

    def test_get_empty_token_raises(self):
        """get() with empty token raises BeatportAPIError."""
        client = BeatportApiClient("https://api.test", "")
        with pytest.raises(BeatportAPIError) as exc_info:
            client.get("/genres")
        assert (
            "token" in exc_info.value.message.lower()
            or "Configure" in exc_info.value.message
        )
