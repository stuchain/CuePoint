"""Tests that run exactly like the app's label search: same BeatportApi + client, same calls.

Use these to iterate until label resolution works:
- Mock tests: assert behavior with simulated API (pagination, match on page 2).
- Live test: when BEATPORT_ACCESS_TOKEN is set, assert Defected and Nothing But resolve.
  Run (mock only, no token):
    pytest src/tests/integration/test_label_search_like_app.py -v

  Run live (set BEATPORT_ACCESS_TOKEN or beatporttoken.txt token=...), then iterate until it passes:
    pytest src/tests/integration/test_label_search_like_app.py::TestLabelSearchLiveLikeApp::test_label_search_live_resolves_defected_and_nothing_but -v -s
"""

import os
from pathlib import Path
from unittest.mock import Mock

import pytest

from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.services.beatport_api import BeatportApi
from cuepoint.services.beatport_api_client import BeatportApiClient


def _live_token() -> str:
    token = (os.environ.get("BEATPORT_ACCESS_TOKEN") or "").strip()
    if not token:
        root = Path(__file__).resolve().parents[3]  # repo root
        token_file = root / "beatporttoken.txt"
        if token_file.exists():
            for line in token_file.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith("token="):
                    token = line.split("=", 1)[1].strip()
                    break
    return token


def _make_page_response(
    page: int, per_page: int, total_count: int, results: list
) -> dict:
    """Same shape as Beatport API: { count, page, per_page, results }."""
    return {
        "count": total_count,
        "page": page,
        "per_page": per_page,
        "results": results,
        "next": f"http://api/catalog/labels?page={page + 1}"
        if page * per_page < total_count
        else None,
        "previous": f"http://api/catalog/labels?page={page - 1}" if page > 1 else None,
    }


class TestLabelSearchLikeAppMocked:
    """Uses same BeatportApi + client as app; client is mocked with real API response shape."""

    def test_search_label_match_on_page_1(self):
        """App flow: search_label_by_name finds match via /catalog/search (tried first) or /catalog/labels."""
        client = Mock(spec=BeatportApiClient)
        # API now tries /catalog/search first; return a search-style response so we resolve from it
        client.get.return_value = {
            "labels": [{"id": 42, "name": "Defected", "slug": "defected"}]
        }
        api = BeatportApi(client, cache_service=None)
        out = api.search_label_by_name("Defected")
        assert out == 42
        client.get.assert_called_once()
        call_args = client.get.call_args
        assert call_args[0][0] == "/catalog/search"
        assert call_args[1]["params"]["q"] == "Defected"

    def test_search_label_match_on_page_2_same_as_app(self):
        """App flow: first page has no match, second page has Defected — we paginate and resolve."""
        client = Mock(spec=BeatportApiClient)
        page1 = _make_page_response(
            page=1,
            per_page=50,
            total_count=100,
            results=[
                {"id": i, "name": f"Other Label {i}", "slug": f"other-label-{i}"}
                for i in range(1, 51)
            ],
        )
        page2 = _make_page_response(
            page=2,
            per_page=50,
            total_count=100,
            results=[
                {"id": i, "name": f"Other Label {i}", "slug": f"other-label-{i}"}
                for i in range(51, 55)
            ]
            + [{"id": 12345, "name": "Defected", "slug": "defected"}]
            + [
                {"id": i, "name": f"Other Label {i}", "slug": f"other-label-{i}"}
                for i in range(56, 101)
            ],
        )

        def get_side_effect(path, params=None, **kwargs):
            if path != "/catalog/labels":
                return None
            page = (params or {}).get("page", 1)
            return page1 if page == 1 else page2

        client.get.side_effect = get_side_effect
        api = BeatportApi(client, cache_service=None)
        out = api.search_label_by_name("Defected")
        assert out == 12345
        assert client.get.call_count >= 2
        calls = [c for c in client.get.call_args_list if c[0][0] == "/catalog/labels"]
        pages_called = [c[1].get("params", {}).get("page") for c in calls]
        assert 1 in pages_called and 2 in pages_called

    def test_search_label_nothing_but_on_page_3(self):
        """App flow: 'Nothing But' on page 3 — we keep paginating until match."""
        client = Mock(spec=BeatportApiClient)

        def make_other_page(page: int):
            return _make_page_response(
                page=page,
                per_page=50,
                total_count=200,
                results=[
                    {
                        "id": (page - 1) * 50 + i,
                        "name": f"Label {(page - 1) * 50 + i}",
                        "slug": f"label-{(page - 1) * 50 + i}",
                    }
                    for i in range(1, 51)
                ],
            )

        def get_side_effect(path, params=None, **kwargs):
            if path != "/catalog/labels":
                return None
            page = (params or {}).get("page", 1)
            if page == 3:
                res = [
                    {
                        "id": (page - 1) * 50 + i,
                        "name": f"Label {(page - 1) * 50 + i}",
                        "slug": f"label-{(page - 1) * 50 + i}",
                    }
                    for i in range(1, 21)
                ]
                res.append({"id": 43219, "name": "Nothing But", "slug": "nothing-but"})
                res += [
                    {
                        "id": (page - 1) * 50 + i,
                        "name": f"Label {(page - 1) * 50 + i}",
                        "slug": f"label-{(page - 1) * 50 + i}",
                    }
                    for i in range(22, 51)
                ]
                return _make_page_response(
                    page=3, per_page=50, total_count=200, results=res
                )
            return make_other_page(page)

        client.get.side_effect = get_side_effect
        api = BeatportApi(client, cache_service=None)
        out = api.search_label_by_name("Nothing But")
        assert out == 43219
        assert client.get.call_count >= 3

    def test_search_label_no_match_after_pages_returns_none(self):
        """App flow: no name/slug match in any page -> None."""
        client = Mock(spec=BeatportApiClient)
        client.get.return_value = _make_page_response(
            page=1,
            per_page=50,
            total_count=50,
            results=[
                {"id": i, "name": f"Other {i}", "slug": f"other-{i}"}
                for i in range(1, 51)
            ],
        )
        api = BeatportApi(client, cache_service=None)
        out = api.search_label_by_name("Defected")
        assert out is None


@pytest.mark.integration
@pytest.mark.skipif(
    not _live_token(), reason="BEATPORT_ACCESS_TOKEN (or beatporttoken.txt) not set"
)
class TestLabelSearchLiveLikeApp:
    """Calls the real API exactly as the app does. Run until this passes to confirm the fix."""

    @pytest.fixture
    def client(self):
        base = os.environ.get("BEATPORT_API_BASE_URL", "https://api.beatport.com/v4")
        return BeatportApiClient(
            base_url=base,
            access_token=_live_token(),
            timeout=30,
        )

    @pytest.fixture
    def api(self, client):
        return BeatportApi(client, cache_service=None)

    def test_label_search_live_resolves_defected_and_nothing_but(self, api):
        """Real API: search_label_by_name resolves 'Defected' and 'Nothing But' as the app does.

        Run: pytest src/tests/integration/test_label_search_like_app.py::TestLabelSearchLiveLikeApp::test_label_search_live_resolves_defected_and_nothing_but -v
        Re-run after each change until it passes.
        """
        # Same call path as discovery._resolve_library_labels_to_ids -> beatport_api.search_label_by_name
        try:
            defected_id = api.search_label_by_name("Defected")
        except BeatportAPIError as e:
            if "BEATPORT_API_AUTH" in str(e) or "401" in str(e):
                pytest.skip(
                    "Invalid or expired Beatport API token (set valid BEATPORT_ACCESS_TOKEN to run)"
                )
            raise
        nothing_but_id = api.search_label_by_name("Nothing But")

        assert defected_id is not None, (
            "search_label_by_name('Defected') returned None. "
            "Check API response shape and pagination; run with -s to see logs."
        )
        assert nothing_but_id is not None, (
            "search_label_by_name('Nothing But') returned None. "
            "Check API response shape and pagination; run with -s to see logs."
        )
