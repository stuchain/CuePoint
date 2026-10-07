"""``scrub_breadcrumb``: one breadcrumb through the event rules (REPORT-03)."""

from __future__ import annotations

import copy

from cuepoint.reporting.scrub import ScrubContext, scrub_breadcrumb, scrub_event

CTX = ScrubContext(home="/Users/anna", user_name="anna", tokens=("tok-abcdef",))


def test_message_and_data_are_scrubbed() -> None:
    crumb = {
        "category": "log",
        "level": "info",
        "message": "opened '/Users/anna/Music/House/a.flac' for anna",
        "data": {"track_title": "Secret Song", "count": 3},
    }
    before = copy.deepcopy(crumb)
    out = scrub_breadcrumb(crumb, CTX)
    assert crumb == before, "the input was changed"
    assert out is not None
    assert "anna" not in out["message"]
    assert "/Users" not in out["message"]
    assert out["data"]["track_title"] != "Secret Song"
    assert out["data"]["count"] == 3
    assert out["category"] == "log"


def test_dropped_categories_return_none() -> None:
    for category in ("ui.click", "ui.input", "console"):
        assert scrub_breadcrumb({"category": category, "message": "Track"}, CTX) is None


def test_same_result_as_the_event_rule() -> None:
    crumb = {
        "category": "http",
        "message": "GET /api/v1/jobs/{id} 200 token=tok-abcdef",
        "data": {"route": "/api/v1/jobs/{id}", "status": 200},
    }
    via_event = scrub_event({"breadcrumbs": [crumb]}, CTX)["breadcrumbs"][0]
    assert scrub_breadcrumb(crumb, CTX) == via_event
    assert "tok-abcdef" not in str(scrub_breadcrumb(crumb, CTX))
