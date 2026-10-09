"""The Statistics page's plays at scale (STATS-02).

Phase 15 designed the page against 50,000 tracks and a year of weekly refreshes:
each route is a few grouped scans, not a count per bucket (fact 11).
``scripts/bench_library.py --statistics`` is the full measurement and prints the
number that goes in the docs. These tests are the part worth running repeatedly:
20,000 tracks with 52 weeks of history, asserting **relationships** rather than
wall-clock seconds, because absolute timings vary by machine and a test that fails
on a slow laptop teaches people to ignore it.

The reference is ``browse_count``, the Library's own count, of every track with a
play: a scan of the whole table, as ``plays`` reads it. ``plays`` must answer within
a fixed multiple of it, so a change that makes the page a scan per artist or label
cannot pass. (A count with no rules is a size the table keeps, a thousand times
cheaper than any question about its rows, and says nothing about them.)

Marked slow. ``scripts/run_tests.py --no-slow`` skips them; a release run does not.
"""

from __future__ import annotations

import statistics
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

# `scripts/` is not a package and is not on the path; the generator lives there
# because it is also a command a person runs.
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts"))

from bench_library import (  # noqa: E402
    HISTORY_MOVED_PER_WEEK,
    HISTORY_WEEKS,
    build_play_history,
    build_service,
    write_export,
)

from cuepoint.models.filter_rule import FilterRule, RuleSet  # noqa: E402
from cuepoint.persistence.activity_repository import ActivityRepository  # noqa: E402
from cuepoint.persistence.collection_repository import (  # noqa: E402
    CollectionRepository,
)
from cuepoint.persistence.statistics_repository import (  # noqa: E402
    StatisticsRepository,
)
from cuepoint.persistence.track_query import BrowseQuery  # noqa: E402
from cuepoint.services.activity_service import ActivityService  # noqa: E402
from cuepoint.services.collection_service import CollectionService  # noqa: E402
from cuepoint.services.statistics_service import StatisticsService  # noqa: E402

#: Big enough for the relationships to be real, small enough to run often.
TRACKS = 20_000
PLAYLISTS = 20

#: How many times the cost of counting the played tracks one plays answer may
#: cost. Measured at 20,000 tracks it is 20 to 30, from three grouped scans; a scan
#: per artist or label would be hundreds.
PLAYS_VS_COUNT = 50

#: How much slower 200 rows may be than 10. The lists are cut after the grouping,
#: so asking for more costs the sort of what is already grouped and nothing else.
LIMIT_GROWTH = 3

#: Timed samples per case. A median keeps one noisy pass from deciding it.
SAMPLES = 7


def median_seconds(call) -> float:
    """Median wall time of ``call`` after a warm-up."""
    call()
    samples = []
    for _ in range(SAMPLES):
        started = time.perf_counter()
        call()
        samples.append(time.perf_counter() - started)
    return statistics.median(samples)


@pytest.fixture(scope="module")
def library(tmp_path_factory):
    """20,000 tracks, imported once, with a year of weekly history."""
    workspace = tmp_path_factory.mktemp("statistics-scale")
    export = write_export(
        workspace / "collection.xml", list(range(1, TRACKS + 1)), PLAYLISTS
    )
    importer, tracks, playlists = build_service(workspace / "library.db")
    importer.import_rekordbox_xml(str(export))
    database = importer._db
    stored = build_play_history(database)
    collections = CollectionService(
        CollectionRepository(database),
        database,
        tracks,
        ActivityService(ActivityRepository(database), tracks),
        playlists,
    )
    service = StatisticsService(StatisticsRepository(database), collections, playlists)
    yield {"service": service, "tracks": tracks, "stored": stored}
    database.close_all()


@pytest.mark.performance
@pytest.mark.slow
class TestPlaysAtScale:
    def test_the_history_is_a_year_of_weekly_reads(self, library):
        assert library["stored"] == HISTORY_WEEKS * HISTORY_MOVED_PER_WEEK
        reads = library["service"].plays().to_dict()
        assert reads["history_from"] < reads["last_read"]

    @pytest.mark.parametrize("window", ["all time", "since 90 days"])
    def test_plays_answers_within_a_multiple_of_counting_the_library(
        self, library, window
    ):
        service, tracks = library["service"], library["tracks"]
        since = (
            None
            if window == "all time"
            else (datetime.now(timezone.utc) - timedelta(days=90)).date()
        )

        played = BrowseQuery(rules=RuleSet(rules=(FilterRule("play_count", "gt", 0),)))
        count = median_seconds(lambda: tracks.browse_count(played))
        plays = median_seconds(lambda: service.plays(limit=200, since=since))

        answer = service.plays(limit=200, since=since).to_dict()
        assert answer["tracks"] and answer["artists"] and answer["labels"]
        print(f"\nplays {window}: {plays * 1000:.1f} ms, count {count * 1000:.2f} ms")
        assert plays <= count * PLAYS_VS_COUNT, (
            f"plays took {plays * 1000:.1f} ms against {count * 1000:.2f} ms to count"
            f" the played tracks ({plays / count:.0f}x; the ceiling is {PLAYS_VS_COUNT}x)"
        )

    def test_asking_for_more_rows_costs_little_more(self, library):
        service = library["service"]

        few = median_seconds(lambda: service.plays(limit=10))
        many = median_seconds(lambda: service.plays(limit=200))

        assert many <= few * LIMIT_GROWTH, (
            f"200 rows took {many * 1000:.1f} ms against {few * 1000:.1f} ms for 10"
        )

    def test_a_window_costs_by_its_size_not_the_histories(self, library):
        service = library["service"]
        reads = service._repository.reads()

        week = median_seconds(lambda: service.plays(limit=10, since_read=reads[-1][0]))
        year = median_seconds(lambda: service.plays(limit=10, since_read=reads[1][0]))

        # The last week is one 52nd of the year's rows.
        assert week < year
