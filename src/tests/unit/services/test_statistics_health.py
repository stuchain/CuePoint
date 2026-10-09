"""Unit tests for the health numbers the Statistics page answers with (STATS-03).

Over the nine-track library ``test_statistics_spreads`` builds: five files present,
one missing, one unreadable, one checked at a path the track no longer has and one
never checked; one track in each match state and five never matched; two analyzed
files, one failed, two waiting. The expected numbers are written out from that, not
computed by the code under test.
"""

from __future__ import annotations

import pytest

from cuepoint.models.file_status import FILE_PRESENT
from cuepoint.models.filter_rule import MATCH_STATE_CHOICES, RuleSet
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.statistics_repository import StatisticsRepository
from cuepoint.persistence.waveform_store import WaveformStoreError
from cuepoint.services.statistics_service import PlaysScope, StatisticsService
from tests.unit.services.test_statistics_spreads import (
    NOW,
    SCOPES,
    SpreadWorld,
    build_spread_world,
)

pytestmark = pytest.mark.unit

FILE_STATES = ("present", "missing", "unreadable", "not_checked")
MATCH_STATES = ("accepted", "needs_review", "rejected", "no_match", "not_matched")
ANALYZED = ("analyzed", "failed", "waiting", "no_file")


@pytest.fixture
def world(tmp_path):
    built = build_spread_world(tmp_path)
    yield built
    built.store.close_all()
    built.db.close_all()


def health(world: SpreadWorld, kind: str = "library") -> dict:
    return world.statistics.health(world.scope(kind)).to_dict()


def counts(entries: dict) -> dict:
    return {name: entry["count"] for name, entry in entries.items()}


def test_the_answer_has_exactly_the_documented_fields(world):
    answer = health(world)

    assert set(answer) == {
        "scope",
        "total",
        "files",
        "beatport",
        "analyzed",
        "checked_at",
    }
    assert answer["scope"] == "library"
    assert list(answer["files"]) == list(FILE_STATES)
    assert list(answer["beatport"]) == list(MATCH_STATES)
    assert list(answer["analyzed"]) == list(ANALYZED)
    for entry in [*answer["files"].values(), *answer["beatport"].values()]:
        assert set(entry) == {"count", "rules"}
    assert all(isinstance(n, int) for n in answer["analyzed"].values())


def test_the_four_file_states_sum_to_the_scope(world):
    answer = health(world)

    # e was checked at another path, so it reads as never checked.
    assert counts(answer["files"]) == {
        "present": 5,
        "missing": 1,
        "unreadable": 1,
        "not_checked": 2,
    }
    assert sum(counts(answer["files"]).values()) == answer["total"] == 9


def test_the_five_match_states_sum_to_the_scope(world):
    answer = health(world)

    assert counts(answer["beatport"]) == {
        "accepted": 1,
        "needs_review": 1,
        "rejected": 1,
        "no_match": 1,
        "not_matched": 5,
    }
    assert sum(counts(answer["beatport"]).values()) == answer["total"]


def test_the_match_states_are_the_filters_own_choices(world):
    assert set(health(world)["beatport"]) == {state for state, _ in MATCH_STATE_CHOICES}


def test_each_state_opens_its_is_rule(world):
    answer = health(world)

    assert answer["files"]["missing"]["rules"]["rules"] == [
        {"field": "file_status", "operator": "is", "value": "missing"}
    ]
    assert answer["beatport"]["needs_review"]["rules"]["rules"] == [
        {"field": "match_state", "operator": "is", "value": "needs_review"}
    ]


def test_analyzed_counts_only_present_files_and_sums_to_the_scope(world):
    answer = health(world)

    # a and b are done. i failed. g's file is not the size that was analyzed and
    # h's loudness is of another version, so both are waiting. Four tracks have
    # no present file.
    assert answer["analyzed"] == {
        "analyzed": 2,
        "failed": 1,
        "waiting": 2,
        "no_file": 4,
    }
    assert sum(answer["analyzed"].values()) == answer["total"]


def test_for_the_whole_library_analyzed_equals_the_analysis_plans_own_counts(world):
    plan = world.analysis.plan(limit=0, ordered=False)
    answer = health(world)["analyzed"]

    assert answer["analyzed"] == plan.analysed
    assert answer["failed"] == plan.failed
    assert answer["waiting"] == plan.remaining
    assert answer["no_file"] == health(world)["total"] - plan.present


def test_the_plan_counts_only_the_tracks_it_is_given(world):
    wanted = {world.ids["a"], world.ids["g"]}

    scoped = world.analysis.plan(limit=0, ordered=False, track_ids=wanted)
    whole = world.analysis.plan(limit=0, ordered=False)

    assert (scoped.present, scoped.analysed, scoped.failed) == (2, 1, 0)
    assert scoped.remaining == 1
    assert whole.present == 5
    assert world.analysis.plan(limit=0, ordered=False, track_ids=set()).present == 0


def test_checked_at_is_the_latest_check_of_a_current_path(world):
    # c's check is the latest of the current ones; e's, later still, was made at
    # a path the track no longer has.
    assert health(world)["checked_at"] == "2026-10-02T08:00:00+00:00"


def test_checked_at_is_null_when_nothing_was_checked(world):
    with world.db.transaction() as conn:
        conn.execute("DELETE FROM track_files")

    answer = health(world)

    assert answer["checked_at"] is None
    assert answer["files"]["not_checked"]["count"] == 9
    assert answer["analyzed"]["no_file"] == 9


def test_a_collection_scopes_every_count(world):
    answer = health(world, "collection")

    # a (present, accepted, analyzed), c (missing, rejected), e (not checked, not
    # matched) and f (not checked, not matched).
    assert answer["total"] == 4
    assert counts(answer["files"]) == {
        "present": 1,
        "missing": 1,
        "unreadable": 0,
        "not_checked": 2,
    }
    assert counts(answer["beatport"]) == {
        "accepted": 1,
        "needs_review": 0,
        "rejected": 1,
        "no_match": 0,
        "not_matched": 2,
    }
    assert answer["analyzed"] == {
        "analyzed": 1,
        "failed": 0,
        "waiting": 0,
        "no_file": 3,
    }
    assert answer["checked_at"] == "2026-10-02T08:00:00+00:00"


def test_without_the_analysis_nothing_is_analyzed(world):
    from cuepoint.persistence.playlist_repository import PlaylistRepository
    from cuepoint.persistence.statistics_repository import StatisticsRepository
    from cuepoint.services.statistics_service import StatisticsService

    service = StatisticsService(
        StatisticsRepository(world.db), world.collections, PlaylistRepository(world.db)
    )

    assert service.health().to_dict()["analyzed"] == {
        "analyzed": 0,
        "failed": 0,
        "waiting": 5,
        "no_file": 4,
    }


@pytest.mark.parametrize("kind", SCOPES)
def test_every_count_with_rules_opens_exactly_what_it_counted(world, kind):
    scope = world.scope(kind)
    answer = world.statistics.health(scope).to_dict()
    total = world.count(world.statistics.scope_rules(scope))

    assert answer["total"] == total
    for group in ("files", "beatport"):
        assert sum(counts(answer[group]).values()) == total, (kind, group)
        for name, entry in answer[group].items():
            rules = RuleSet.from_dict(entry["rules"])
            assert world.count(rules) == entry["count"], (kind, group, name)
    assert sum(answer["analyzed"].values()) == total, kind


def test_a_scope_that_is_not_there_is_refused(world):
    from cuepoint.services.statistics_service import ScopeNotFoundError

    with pytest.raises(ScopeNotFoundError):
        world.statistics.health(PlaysScope("collection", 99_999))


def share_a_path(world: SpreadWorld, copies: int = 4) -> None:
    """Tracks outside every scope that are filed at ``a``'s path, checked present."""
    path = world.path("a")
    with world.db.transaction() as conn:
        for copy in range(copies):
            conn.execute(
                "INSERT INTO tracks (rekordbox_track_id, title, artist, file_path,"
                " normalized_path, created_at, updated_at)"
                " VALUES (?, 'dup', 'A', ?, ?, ?, ?)",
                (f"dup{copy}", path, path, NOW, NOW),
            )
            track = conn.execute("SELECT max(id) FROM tracks").fetchone()[0]
            conn.execute(
                "INSERT INTO track_files (track_id, status, checked_path, size_bytes,"
                " checked_at) VALUES (?, 'present', ?, 1000, ?)",
                (track, path, NOW),
            )


def test_a_track_outside_the_scope_that_shares_a_path_is_not_counted(world):
    share_a_path(world)

    answer = health(world, "collection")

    # a's file is analyzed once for the scope; its four namesakes are elsewhere.
    assert answer["total"] == 4
    assert answer["analyzed"] == {
        "analyzed": 1,
        "failed": 0,
        "waiting": 0,
        "no_file": 3,
    }
    assert sum(answer["analyzed"].values()) == answer["total"]


def test_the_whole_library_counts_every_track_that_shares_a_path(world):
    share_a_path(world)

    answer = health(world)

    assert answer["analyzed"]["analyzed"] == 2 + 4
    assert sum(answer["analyzed"].values()) == answer["total"] == 13


def test_checked_at_ignores_a_later_check_of_a_track_outside_the_scope(world):
    # g is not in the Collection (a, c, e, f); its check is the latest of all.
    world.check("g", FILE_PRESENT, at="2026-10-09T23:00:00+00:00")

    assert health(world)["checked_at"] == "2026-10-09T23:00:00+00:00"
    assert health(world, "collection")["checked_at"] == "2026-10-02T08:00:00+00:00"


class BrokenStore:
    """A waveform store that cannot be read."""

    def readings(self, *_args):
        raise WaveformStoreError("the store is gone")

    def current_files(self, *_args):
        raise WaveformStoreError("the store is gone")


@pytest.mark.parametrize("kind", ["library", "collection"])
def test_an_unreadable_store_reads_as_nothing_measured_and_the_sums_hold(world, kind):
    broken = BrokenStore()
    world.analysis._store = broken
    service = StatisticsService(
        StatisticsRepository(world.db),
        world.collections,
        PlaylistRepository(world.db),
        waveform_store=broken,
        analysis_service=world.analysis,
    )
    scope = world.scope(kind)

    answer = service.health(scope).to_dict()
    loudness = service.spreads(scope).to_dict()["loudness"]

    assert answer["analyzed"]["analyzed"] == answer["analyzed"]["failed"] == 0
    assert sum(answer["analyzed"].values()) == answer["total"]
    # Every present file waits when nothing can be read about it.
    assert answer["analyzed"]["waiting"] == answer["files"]["present"]["count"]
    assert loudness["buckets"] == []
    assert (
        loudness["unknown"]["count"] + loudness["no_file"]["count"] == loudness["total"]
    )
    assert loudness["unknown"]["count"] == answer["files"]["present"]["count"]
