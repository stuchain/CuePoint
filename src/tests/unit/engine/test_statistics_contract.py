"""The answers' shapes are the ones the Statistics page will be written against (STATS-02, STATS-03).

The engine serializes one answer; STATS-04 declares it in ``engineClient.ts`` and
the renderer's bridge types copy it (``desktopContract.test.ts`` holds the two
TypeScript copies together). This holds, from Python, against real answers: the
fields every part of the answer carries, that every rule set is the filter
vocabulary's own, and that every refusal arrives under a declared code. The two
last tests compare the TypeScript with the answers, the way
``test_waveforms_contract`` does.
"""

from __future__ import annotations

import re

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
from tests.unit.services.test_statistics_spreads import (
    FIELDS,
    SCOPES,
    build_spread_world,
)

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


def _members(interface: str) -> dict:
    """Each member of an exported client interface and its declared type text."""
    text = _client()
    start = text.index(f"export interface {interface} ")
    body = text[start : text.index("\n}", start)]
    return dict(re.findall(r"^ {2}([a-z_]+)\??: (.*);$", body, re.M))


def _admits(declared: str, value) -> bool:
    """Whether a TypeScript type text can hold this JSON value (nullability included)."""
    for alias in re.findall(r"[A-Z][A-Za-z]+", declared):
        found = re.search(rf"^export type {alias} =\s*([^;]*);", _client(), re.M)
        if found:
            declared = declared.replace(alias, found.group(1))
    if value is None:
        return "null" in declared.split(" | ")
    if isinstance(value, bool):
        return "boolean" in declared
    if isinstance(value, (int, float)):
        return "number" in declared or re.search(r"\d", declared) is not None
    if isinstance(value, str):
        return "string" in declared or '"' in declared
    if isinstance(value, list):
        return declared.endswith("[]")
    return True


def _check_members(interface: str, sample: dict) -> None:
    """Every member's declared type admits the payload's value, and null only where declared."""
    declared = _members(interface)
    for name, value in sample.items():
        assert _admits(declared[name], value), (interface, name, declared[name], value)
    optional = set(re.findall(r"^ {2}([a-z_]+)\?:", _interface_body(interface), re.M))
    assert optional <= set(sample) | {"no_file"}, (interface, optional)


def _interface_body(interface: str) -> str:
    text = _client()
    start = text.index(f"export interface {interface} ")
    return text[start : text.index("\n}", start)]


def test_the_client_declares_every_field_of_the_answer(world):
    answer = world.plays(limit=200)

    assert _fields("StatisticsPlays") == set(answer)
    assert _fields("StatisticsTrack") == set(answer["tracks"][0])
    assert _fields("StatisticsArtist") == set(answer["artists"][0])
    assert _fields("StatisticsLabel") == set(answer["labels"][0])
    assert _fields("StatisticsCount") == set(answer["never_played"])
    text = _client()
    assert f'"{api.PLAYS_PATH}' in text or f"`{api.PLAYS_PATH}" in text
    _check_members("StatisticsPlays", answer)
    _check_members("StatisticsTrack", answer["tracks"][0])
    _check_members("StatisticsArtist", answer["artists"][0])
    _check_members("StatisticsLabel", answer["labels"][0])
    _check_members("StatisticsCount", answer["never_played"])
    # A window with no history answers null where an all-time one answers text.
    empty = world.plays(limit=10, **midnight("2026-03-11"))
    assert _admits(_members("StatisticsPlays")["since"], empty["since"])
    assert _admits(_members("StatisticsPlays")["history_from"], None)
    assert _admits(_members("StatisticsPlays")["last_read"], None)


# ---------------------------------------------------------------- STATS-03

SPREADS = {"scope", "total", *FIELDS}
SPREAD = {"buckets", "unknown", "total"}
BUCKET = {"label", "value", "count", "rules"}
LINE = {"label", "count", "rules"}
HEALTH = {"scope", "total", "files", "beatport", "analyzed", "checked_at"}
FILE_STATES = {"present", "missing", "unreadable", "not_checked"}
MATCH_STATES = {"accepted", "needs_review", "rejected", "no_match", "not_matched"}
ANALYZED = {"analyzed", "failed", "waiting", "no_file"}


@pytest.fixture
def spread_world(tmp_path):
    built = build_spread_world(tmp_path)
    yield built
    built.store.close_all()
    built.db.close_all()


def rule_sets(spreads, health):
    """Every rule set in the two answers."""
    for name in FIELDS:
        spread = spreads[name]
        for part in [*spread["buckets"], spread["unknown"]]:
            if part["rules"] is not None:
                yield part["rules"]
        if "no_file" in spread:
            assert spread["no_file"]["rules"] is None
    for group in ("files", "beatport"):
        for entry in health[group].values():
            yield entry["rules"]


def test_the_spreads_carry_exactly_the_documented_fields(spread_world):
    for kind in SCOPES:
        report = spread_world.spreads(kind)

        assert set(report) == SPREADS
        for name in FIELDS:
            spread = report[name]
            assert set(spread) == SPREAD | (
                {"no_file"} if name == "loudness" else set()
            )
            for bucket in spread["buckets"]:
                assert set(bucket) == BUCKET
            assert set(spread["unknown"]) == LINE
            if name == "loudness":
                assert set(spread["no_file"]) == LINE


def test_loudness_has_no_rules_and_the_other_five_have_them_where_a_rule_can_say_it(
    spread_world,
):
    report = spread_world.spreads()

    assert all(b["rules"] is None for b in report["loudness"]["buckets"])
    for name in FIELDS[:-1]:
        assert report[name]["buckets"][0]["rules"] is not None, name
    # A malformed date has no rule, and neither has what is left after the cut.
    assert report["date_added"]["unknown"]["rules"] is None


def test_health_carries_exactly_the_documented_fields(spread_world):
    for kind in SCOPES:
        answer = spread_world.statistics.health(spread_world.scope(kind)).to_dict()

        assert set(answer) == HEALTH
        assert set(answer["files"]) == FILE_STATES
        assert set(answer["beatport"]) == MATCH_STATES
        assert set(answer["analyzed"]) == ANALYZED
        for entry in [*answer["files"].values(), *answer["beatport"].values()]:
            assert set(entry) == COUNT


def test_every_spreads_and_health_rule_set_is_the_filters_own_vocabulary(
    spread_world,
):
    vocabulary = {field["name"]: field["operators"] for field in describe_fields()}
    for kind in SCOPES:
        scope = spread_world.scope(kind)
        spreads = spread_world.statistics.spreads(scope).to_dict()
        health = spread_world.statistics.health(scope).to_dict()
        for rules in rule_sets(spreads, health):
            assert RuleSet.from_dict(rules).validated().to_dict() == rules
            for rule in rules["rules"]:
                assert rule["operator"] in vocabulary[rule["field"]], rule


def test_the_two_routes_are_declared_beside_the_plays_route():
    assert api.SPREADS_PATH == "/api/v1/statistics/spreads"
    assert api.HEALTH_PATH == "/api/v1/statistics/health"
    assert api.GET_PATHS == (api.PLAYS_PATH, api.SPREADS_PATH, api.HEALTH_PATH)


def test_the_client_declares_every_field_of_the_spreads_and_health(spread_world):
    spreads = spread_world.spreads()
    health = spread_world.statistics.health().to_dict()

    assert _fields("StatisticsSpreads") == set(spreads)
    assert _fields("StatisticsSpread") >= SPREAD
    assert _fields("StatisticsBucket") == set(spreads["genre"]["buckets"][0])
    assert _fields("StatisticsLine") == set(spreads["genre"]["unknown"])
    assert _fields("StatisticsHealth") == set(health)
    text = _client()
    for path in (api.SPREADS_PATH, api.HEALTH_PATH):
        assert f'"{path}' in text or f"`{path}" in text
    _check_members("StatisticsSpreads", spreads)
    for name in FIELDS:
        _check_members("StatisticsSpread", spreads[name])
    _check_members("StatisticsBucket", spreads["genre"]["buckets"][0])
    _check_members("StatisticsLine", spreads["genre"]["unknown"])
    _check_members("StatisticsHealth", health)
    _check_members("StatisticsAnalyzed", health["analyzed"])
    # A bucket with no rule (Other), a line with no rule and a health never checked are null.
    assert _admits(_members("StatisticsBucket")["rules"], None)
    assert _admits(_members("StatisticsLine")["rules"], None)
    assert _admits(_members("StatisticsBucket")["value"], None)
    assert _admits(_members("StatisticsHealth")["checked_at"], None)
