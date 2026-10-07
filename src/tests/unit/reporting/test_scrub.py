"""The Python scrubber against the shared corpus and its property tests (REPORT-02, DEC-127).

``apps/desktop-electron/electron/reportScrub.test.ts`` reads the same fixture files; the two
scrubbers must give the same output on every entry.
"""

from __future__ import annotations

import copy
import json
import re
import time
from pathlib import Path
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from cuepoint.reporting.scrub import (
    OUTPUT_TAIL_ATTACHMENTS,
    ScrubContext,
    scrub_attachment,
    scrub_event,
    scrub_text,
)

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "reporting"


def _load(name: str) -> list[dict[str, Any]]:
    path = FIXTURES / name
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


def _ctx(raw: dict[str, Any]) -> ScrubContext:
    return ScrubContext(
        home=raw["home"],
        user_name=raw["user_name"],
        app_roots=tuple(raw["app_roots"]),
        tokens=tuple(raw["tokens"]),
    )


# Part B's raise-site entries join the run as soon as their file exists.
ENTRIES = _load("scrub_corpus.json") + _load("raise_site_events.json")


def test_corpus_is_not_empty() -> None:
    assert len(_load("scrub_corpus.json")) >= 50


@pytest.mark.parametrize("entry", ENTRIES, ids=[e["name"] for e in ENTRIES])
def test_corpus_entry(entry: dict[str, Any]) -> None:
    original = copy.deepcopy(entry["input"])
    assert scrub_event(entry["input"], _ctx(entry["ctx"])) == entry["expected"]
    assert entry["input"] == original, "the input was changed"


def test_scrub_text_matches_the_message_rule() -> None:
    ctx = ScrubContext(home="/Users/anna", user_name="anna")
    assert (
        scrub_text("Cannot open '/Users/anna/a.flac'", ctx)
        == "Cannot open '<home>/<file>.flac'"
    )
    assert scrub_text("Track 'Strobe' failed", ctx) == "Track '<value>' failed"


def test_scrub_attachment_keeps_only_the_output_tails() -> None:
    ctx = ScrubContext(home="/Users/anna", user_name="anna")
    assert OUTPUT_TAIL_ATTACHMENTS == ("engine-output.txt", "player-output.txt")
    text = "start /Users/anna/Music/a.flac\nBearer abc.def\r\nplayed 'Strobe'"
    for name in OUTPUT_TAIL_ATTACHMENTS:
        assert scrub_attachment(name, text, ctx) == (
            "start <home>/<dir>/<file>.flac\nBearer <token>\r\nplayed '<value>'"
        )
    assert scrub_attachment("config.json", "{}", ctx) is None
    assert scrub_attachment("engine-output.txt.bak", text, ctx) is None


def test_empty_context_still_scrubs_tokens_and_quotes() -> None:
    ctx = ScrubContext()
    assert scrub_text("a 'b' token=zzz", ctx) == "a '<value>' token=<token>"


def test_from_environment_reads_home_token_and_frozen_root(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CUEPOINT_TOKEN", "tok-1234567890")
    ctx = ScrubContext.from_environment()
    assert ctx.home == str(Path.home())
    assert ctx.tokens == ("tok-1234567890",)
    assert ctx.app_roots == ()
    monkeypatch.setattr("sys.frozen", True, raising=False)
    monkeypatch.setattr("sys.executable", str(Path("/opt/CuePoint/cuepoint-engine")))
    assert ScrubContext.from_environment().app_roots == (str(Path("/opt/CuePoint")),)
    monkeypatch.delenv("CUEPOINT_TOKEN")
    assert ScrubContext.from_environment().tokens == ()


# ---------------------------------------------------------------------------
# Property tests
# ---------------------------------------------------------------------------

_USERS = ["anna", "dj_mike", "Joel", "samuel99", "mar\u00eda"]
_WORDS = [
    "Strobe",
    "Don't Stop",
    "Caf\u00e9 del Mar",
    "\u591c\u306e\u97f3\u697d",
    "Rock 'n Roll",
    "DJ's Choice",
    "Friday Night Mix",
    "mau5trap",
    "Resident Advisor",
    "Closer \u2014 Extended",
    "Nu Disco 2024",
    "O'Brien's Waltz",
    "Lovin' You (Ol' Skool Mix)",
    "Rock 'n' Roll",
]


@st.composite
def _scenario(draw: st.DrawFn) -> dict[str, Any]:
    user = draw(st.sampled_from(_USERS))
    home = draw(
        st.sampled_from(
            [
                f"C:\\Users\\{user}",
                f"/Users/{user}",
                f"/home/{user}",
                f"D:/Users/{user}",
            ]
        )
    )
    values = [
        draw(st.sampled_from(_WORDS))
        + draw(st.sampled_from(["", " Remix", " (Club Mix)"]))
        for _ in range(4)
    ]
    # A library value never contains the user's name, so "no user name left" is checkable.
    values = [v for v in values if user.lower() not in v.lower()] or ["Strobe"]
    token = draw(
        st.text(
            alphabet="abcdefghijklmnopqrstuvwxyz0123456789-_", min_size=12, max_size=40
        )
    )
    return {"user": user, "home": home, "values": values, "token": "tk" + token}


def _q(value: str) -> str:
    """Quote as Python's repr does: double quotes when the value holds an apostrophe."""
    return f'"{value}"' if "'" in value else f"'{value}'"


def _build_event(s: dict[str, Any]) -> dict[str, Any]:
    sep = "\\" if "\\" in s["home"] else "/"
    title, artist, label, playlist = (s["values"] * 4)[:4]
    path = f"{s['home']}{sep}Music{sep}House{sep}2024{sep}track.flac"
    quoted_path = _q(f"{s['home']}{sep}Music{sep}{playlist}{sep}{title}.flac")
    return {
        "message": f"Track {_q(title)} by \u201c{artist}\u201d not in {_q(playlist)} at {path} for {s['user']} token={s['token']}",
        "logentry": {
            "message": "bad %s",
            "formatted": f"bad {quoted_path}",
            "params": [path],
        },
        "exception": {
            "values": [
                {
                    "type": "ValueError",
                    "value": f"label {_q(label)} missing in {quoted_path}; Bearer {s['token']}",
                    "stacktrace": {
                        "frames": [
                            {
                                "filename": "x.py",
                                "abs_path": path,
                                "vars": {
                                    "title": title,
                                    "home": s["home"],
                                    "user": s["user"],
                                },
                            }
                        ]
                    },
                }
            ]
        },
        "extra": {
            "track_title": title,
            "playlistName": playlist,
            "track": {"artist": artist, "label": label, "n": 3},
            "note": f"{title} - {artist}",
            "where": quoted_path,
            "session": s["token"],
        },
        "contexts": {
            "job": {"playlist": playlist, "file": path},
            "device": {"name": s["user"]},
        },
        "breadcrumbs": [
            {
                "category": "log",
                "message": f"opened {_q(title)} from {path}",
                "data": {"artist": artist, "path": path},
            },
            {"category": "ui.click", "message": f"{title} {artist}"},
        ],
        "server_name": f"{s['user']}-laptop",
        "user": {"username": s["user"]},
        "tags": {"where": path, "playlist": playlist},
    }


@settings(max_examples=150, deadline=None)
@given(_scenario())
def test_property_nothing_personal_survives(s: dict[str, Any]) -> None:
    ctx = ScrubContext(home=s["home"], user_name=s["user"], tokens=(s["token"],))
    event = _build_event(s)
    before = copy.deepcopy(event)
    out = json.dumps(scrub_event(event, ctx), ensure_ascii=False)
    assert event == before
    haystack = out.lower()
    assert s["user"].lower() not in haystack
    assert s["home"].lower() not in haystack
    assert s["home"].replace("\\", "\\\\").lower() not in haystack
    assert s["token"] not in out
    for value in s["values"]:
        if len(value) >= 3:
            assert value.lower() not in haystack, value
        # Every word of a value is gone too, not only the whole value.
        for word in re.split(r"[^\w]+", value.lower()):
            if len(word) >= 3:
                assert not re.search(rf"(?<!\w){re.escape(word)}(?!\w)", haystack), word


# ---------------------------------------------------------------------------
# Review fixes: linear time, a home folder with a space
# ---------------------------------------------------------------------------

_PATHOLOGICAL = [
    "'a " * 33_000,
    "'a' " * 25_000,
    '"' * 100_000,
    "\u2018a " * 33_000,
    "a" * 100_000,
    "/a" * 50_000,
    "\\" * 100_000,
    "token=" * 17_000,
    "%2F" * 33_000,
    "eyJ" * 33_000,
    "<home>/a " * 9_000,
    "anna " * 20_000,
]


@pytest.mark.parametrize(
    "text", _PATHOLOGICAL, ids=[f"input-{i}" for i in range(len(_PATHOLOGICAL))]
)
def test_pathological_inputs_scrub_in_linear_time(text: str) -> None:
    ctx = ScrubContext(home="/Users/anna", user_name="anna", tokens=("tokentoken",))
    started = time.perf_counter()
    scrub_text(text, ctx)
    assert time.perf_counter() - started < 1.0


def test_a_home_folder_with_a_space_leaves_nothing_of_it() -> None:
    ctx = ScrubContext(home="C:\\Users\\Anna Smith", user_name="Anna")
    for text in (
        "open C:\\Users\\Anna Smith\\Music\\Daft Punk\\x.flac",
        "open c:/users/ANNA SMITH/Music/x.flac",
        "'C:\\Users\\Anna Smith\\Music\\x.flac' failed",
    ):
        out = scrub_text(text, ctx).lower()
        assert "smith" not in out
        assert "anna" not in out
