"""The browser search's URLs are capped at ``max_results`` when direct search finds none.

**What broke.** ``track_urls`` prefers Beatport's direct search
(``PREFER_DIRECT_SEARCH`` is on by default). When that found nothing and the
browser search found URLs, the branch returned ``browser_urls`` whole, while
every other branch returns ``[:max_results]``. A run asking for 5 candidates
could fetch and score 20 pages, past the budget the user's settings set.

**Why it hid.** The tests that would have caught it ran the direct search
against the real Beatport API, which answered, so they took another branch.
With the network blocked they reach this one.

**Easy to reintroduce** because the branch has three returns, and only this one
lacked the slice.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from cuepoint.data.beatport import track_urls

pytestmark = pytest.mark.unit

BROWSER = [f"https://www.beatport.com/track/browser{i}/9000{i}" for i in range(10)]


@pytest.mark.parametrize("max_results", [1, 5, 9])
def test_browser_urls_never_exceed_max_results_after_an_empty_direct_search(
    max_results,
):
    settings = {
        "PREFER_DIRECT_SEARCH": True,
        "USE_BROWSER_AUTOMATION": True,
        "DDG_PREFLIGHT_ENABLED": False,
    }
    with (
        patch.dict("cuepoint.data.beatport.SETTINGS", settings),
        patch("cuepoint.data.beatport_search.beatport_search_direct", return_value=[]),
        patch(
            "cuepoint.data.beatport_search.beatport_search_browser",
            return_value=BROWSER,
        ),
        patch("cuepoint.data.beatport.ddg_track_urls", return_value=[]) as ddg,
    ):
        urls = track_urls(1, "Some Track", max_results=max_results)

    assert urls == BROWSER[:max_results]
    ddg.assert_not_called()
