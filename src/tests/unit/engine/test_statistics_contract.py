"""The plays answer's shape is the one the Statistics page will be written against (STATS-02).

The engine serializes one answer; STATS-04 declares it in ``engineClient.ts`` and
the renderer's bridge types copy it (``desktopContract.test.ts`` holds the two
TypeScript copies together). No TypeScript declares it yet, so this holds what is
checkable now, from Python, against real answers: the fields every part of the
answer carries, that every rule set is the filter vocabulary's own, and that
every refusal arrives under a declared code. The last test compares the
TypeScript with the answer, the way ``test_waveforms_contract`` does, and runs
as soon as STATS-04 adds the types.
"""

from __future__ import annotations

import pytest

from cuepoint.engine import statistics_api as api
from cuepoint.engine.api_errors import bad_request
from cuepoint.models.filter_rule import RuleSet, describe_fields
from cuepoint.services.statistics_service import (
    PlaysScope,
    ReadNotFoundError,
    ScopeNotFoundError,
)
from tests.unit.engine.test_discover_contract import _client, _fields
from tests.unit.services.test_statistics_plays import build_world, midnight, scope_of

pytestmark = pytest.mark.unit

#: The parts of the answer and the fields each carries.
ANSWER = {
    "since",
    "since_clamped",
    "history_from",
    "last_read",
    "tracks",
    "artists",
    "labels",
    "never_played",
    "unknown",
}
TRACK = {"id", "title", "artist", "plays"}
ARTIST = {"name", "name_key", "plays", "tracks", "rules", "opens_more"}
LABEL = {"name", "label_key", "plays", "tracks", "rules", "opens_more"}
COUNT = {"count", "rules"}


@pytest.fixture
def world(tmp_path):
    built = build_world(tmp_path)
    yield built
    built.db.close_all()


def answers(world):
    """Real answers: all time, since a date, since a read, and in a scope."""
    yield world.plays(limit=200)
    yield world.plays(limit=200, **midnight("2026-02-01"))
    yield world.plays(limit=200, since_read=world.reads[-1])
    yield world.plays(limit=200, scope=scope_of(world, "collection"))
    yield world.plays(limit=200, scope=scope_of(world, "playlist"))


def test_every_answer_carries_exactly_the_documented_fields(world):
    for answer in answers(world):
        assert set(answer) == ANSWER
        assert answer["tracks"] and answer["artists"] and answer["labels"]
        for row in answer["tracks"]:
            assert set(row) == TRACK
        for row in answer["artists"]:
            assert set(row) == ARTIST
        for row in answer["labels"]:
            assert set(row) == LABEL
        assert set(answer["never_played"]) == COUNT
        assert set(answer["unknown"]) == COUNT


def test_the_answer_is_empty_but_whole_when_nothing_was_played_since(world):
    answer = world.plays(**midnight("2026-03-11"))

    assert set(answer) == ANSWER
    assert answer["tracks"] == answer["artists"] == answer["labels"] == []
    assert set(answer["never_played"]) == COUNT


def test_every_rule_set_is_made_of_the_filters_own_fields_and_operators(world):
    vocabulary = {field["name"]: field["operators"] for field in describe_fields()}
    for answer in answers(world):
        sets = [answer["never_played"]["rules"], answer["unknown"]["rules"]]
        sets += [row["rules"] for row in answer["artists"] + answer["labels"]]
        for rules in sets:
            assert RuleSet.from_dict(rules).validated().to_dict() == rules
            for rule in rules["rules"]:
                assert rule["operator"] in vocabulary[rule["field"]], rule


def test_the_limits_are_the_five_the_page_offers():
    assert api.LIMITS == (10, 25, 50, 100, 200)
    assert api.DEFAULT_LIMIT == 10


@pytest.mark.parametrize(
    "exc, status, code",
    [
        (bad_request("no"), 400, api.INVALID_REQUEST),
        (ScopeNotFoundError("no"), 404, api.NOT_FOUND),
        (ReadNotFoundError("no"), 404, api.NOT_FOUND),
        (api.StatisticsUnavailableError("no"), 503, api.UNAVAILABLE),
        (RuntimeError("no"), 500, api.FAILED),
    ],
)
def test_every_refusal_arrives_under_a_declared_code(exc, status, code):
    got_status, payload = api.status_for(exc)

    assert (got_status, payload["error"]["code"]) == (status, code)
    assert set(payload["error"]) == {"code", "message"}
    if status < 500:
        assert code in api.REFUSAL_CODES


def test_a_scope_is_named_as_the_page_will_send_it():
    assert api.parse_scope("library") == PlaysScope("library")
    assert api.parse_scope("collection:7") == PlaysScope("collection", 7)
    assert api.parse_scope("playlist:7") == PlaysScope("playlist", 7)


@pytest.mark.skipif(
    "StatisticsPlays" not in _client(),
    reason="STATS-04 declares the plays types in engineClient.ts",
)
def test_the_client_declares_every_field_of_the_answer(world):
    answer = world.plays(limit=200)

    assert _fields("StatisticsPlays") == set(answer)
    assert _fields("StatisticsTrack") == set(answer["tracks"][0])
    assert _fields("StatisticsArtist") == set(answer["artists"][0])
    assert _fields("StatisticsLabel") == set(answer["labels"][0])
    assert _fields("StatisticsCount") == set(answer["never_played"])
    text = _client()
    assert f'"{api.PLAYS_PATH}' in text or f"`{api.PLAYS_PATH}" in text
