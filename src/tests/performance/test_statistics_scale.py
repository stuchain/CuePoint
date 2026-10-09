"""The Statistics page's plays, spreads and health at scale (STATS-02, STATS-03).

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
    seed_spread_inputs,
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
from cuepoint.persistence.waveform_store import (  # noqa: E402
    WaveformStore,
    default_waveform_store_path,
)
from cuepoint.persistence.waveform_work_repository import (  # noqa: E402
    WaveformWorkRepository,
)
from cuepoint.services.activity_service import ActivityService  # noqa: E402
from cuepoint.services.collection_service import CollectionService  # noqa: E402
from cuepoint.services.statistics_service import StatisticsService  # noqa: E402
from cuepoint.services.waveform_analysis_service import (  # noqa: E402
    WaveformAnalysisService,
)

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

#: How many times the cost of one filtered count over the whole library (a scan
#: of the table, as each spread is) the spreads and the health may cost. The
#: spreads are seven scans and the store's loudness; health is four scans and
#: `plan()`, which builds an object for every present file (measured at 75x and
#: 75x with 20,000 tracks). A scan per
#: bucket would be thousands.
SPREADS_VS_SCAN = 200
HEALTH_VS_SCAN = 150

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
    store = WaveformStore(default_waveform_store_path(database.db_path))
    seed_spread_inputs(database, store)
    analysis = WaveformAnalysisService(
        WaveformWorkRepository(database),
        store,
        None,  # type: ignore[arg-type]
    )
    service = StatisticsService(
        StatisticsRepository(database),
        collections,
        playlists,
        waveform_store=store,
        analysis_service=analysis,
    )
    yield {"service": service, "tracks": tracks, "stored": stored}
    store.close_all()
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


@pytest.mark.performance
@pytest.mark.slow
class TestSpreadsAtScale:
    @pytest.fixture(scope="class")
    def scan(self, library):
        """The cost of one scan of the table: a count that reads every row."""
        rule = RuleSet(rules=(FilterRule("year", "gte", 2000),))
        query = BrowseQuery(rules=rule)
        return median_seconds(lambda: library["tracks"].browse_count(query))

    def test_the_spreads_cover_the_library_with_a_bar_for_each_value(self, library):
        report = library["service"].spreads().to_dict()

        assert report["total"] == TRACKS
        assert len(report["year"]["buckets"]) == 30
        assert len(report["date_added"]["buckets"]) == 120
        assert len(report["tempo"]["buckets"]) > 80
        assert report["loudness"]["buckets"]
        assert report["loudness"]["no_file"]["count"] == 0
        for name in ("genre", "tempo", "year", "date_added", "rating", "loudness"):
            spread = report[name]
            parts = [*spread["buckets"], spread["unknown"]]
            if "no_file" in spread:
                parts.append(spread["no_file"])
            assert sum(part["count"] for part in parts) == TRACKS, name

    def test_the_spreads_cost_a_few_scans_not_one_per_bucket(self, library, scan):
        spreads = median_seconds(lambda: library["service"].spreads())

        print(f"\nspreads: {spreads * 1000:.1f} ms, a scan {scan * 1000:.2f} ms")
        assert spreads <= scan * SPREADS_VS_SCAN, (
            f"spreads took {spreads * 1000:.1f} ms against {scan * 1000:.2f} ms for"
            f" a scan ({spreads / scan:.0f}x; the ceiling is {SPREADS_VS_SCAN}x)"
        )

    def test_health_costs_a_few_scans_not_one_per_state(self, library, scan):
        health = median_seconds(lambda: library["service"].health())

        print(f"\nhealth: {health * 1000:.1f} ms, a scan {scan * 1000:.2f} ms")
        assert health <= scan * HEALTH_VS_SCAN, (
            f"health took {health * 1000:.1f} ms against {scan * 1000:.2f} ms for"
            f" a scan ({health / scan:.0f}x; the ceiling is {HEALTH_VS_SCAN}x)"
        )

    def test_health_counts_every_track_in_each_group(self, library):
        answer = library["service"].health().to_dict()

        assert answer["total"] == TRACKS
        assert sum(e["count"] for e in answer["files"].values()) == TRACKS
        assert sum(e["count"] for e in answer["beatport"].values()) == TRACKS
        assert sum(answer["analyzed"].values()) == TRACKS
        assert answer["files"]["present"]["count"] == TRACKS
