#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Measure the library at the size it was designed for (LIBRARY-12).

Phase 3 was built against 50,000 tracks: the parser streams and clears elements
rather than building a tree, the upsert resolves identity against one snapshot
rather than a query per track, and the diff reads the collection once. Every one
of those choices costs something in clarity, and the only honest way to keep
them is to run the number.

What it measures, in order, against a generated export:

1. **Import** — the whole thing, from an empty database.
2. **Re-import** — the same file again. Must change nothing (every track updated,
   none inserted) and must not duplicate.
3. **Unchanged diff** — a refresh preview against the file it was imported from.
   This is the common case, and the one that must not feel like a fresh import.
4. **Edited diff** — a preview against a file with tracks added, changed and
   removed.
5. **Apply** — the refresh, including the deletions.

With ``--statistics`` it then gives the library a year of weekly play history and
times the Statistics page's plays route, all time and since 90 days (STATS-02),
then gives the tracks varied years, tempos and dates, file checks and a waveform
store with loudness, and times its spreads and health routes (STATS-03).

Memory is reported as `tracemalloc`'s peak, which is the number the streaming
design exists to hold down: it says how much Python allocated at once, so a
parser that quietly built the whole collection in memory would show up here even
on a machine with room to spare. RSS is reported too when ``psutil`` is
installed, because peak allocation is not the same as what the OS sees.

Nothing here touches ``~/.cuepoint``: the database is a temporary file and the
services are constructed with an explicit path, so no config is ever read.

Usage::

    python scripts/bench_library.py                     # 50,000 tracks
    python scripts/bench_library.py --tracks 5000        # a quicker pass
    python scripts/bench_library.py --json report.json   # machine-readable
    python scripts/bench_library.py --statistics         # and the Statistics routes
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
import statistics
import time
import tracemalloc
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from cuepoint.persistence.activity_repository import ActivityRepository  # noqa: E402
from cuepoint.persistence.authored_data_repository import (  # noqa: E402
    AuthoredDataRepository,
)
from cuepoint.persistence.collection_repository import (  # noqa: E402
    CollectionRepository,
)
from cuepoint.persistence.library_source_repository import (  # noqa: E402
    LibrarySourceRepository,
)
from cuepoint.persistence.match_repository import MatchRepository  # noqa: E402
from cuepoint.persistence.playlist_repository import PlaylistRepository  # noqa: E402
from cuepoint.persistence.statistics_repository import (  # noqa: E402
    StatisticsRepository,
)
from cuepoint.persistence.waveform_store import (  # noqa: E402
    WaveformStore,
    default_waveform_store_path,
)
from cuepoint.persistence.waveform_work_repository import (  # noqa: E402
    WaveformWorkRepository,
)
from cuepoint.persistence.tag_repository import TagRepository  # noqa: E402
from cuepoint.persistence.track_metadata_repository import (  # noqa: E402
    TrackMetadataRepository,
)
from cuepoint.data.audio_decode import ANALYSIS_VERSION, LOUDNESS_VERSION  # noqa: E402
from cuepoint.models.filter_rule import FilterRule, RuleSet  # noqa: E402
from cuepoint.persistence.track_query import BrowseQuery  # noqa: E402
from cuepoint.persistence.track_repository import TrackRepository  # noqa: E402
from cuepoint.services.activity_service import ActivityService  # noqa: E402
from cuepoint.services.batch_service import (  # noqa: E402
    BatchOperation,
    BatchSelection,
    BatchService,
)
from cuepoint.services.collection_service import CollectionService  # noqa: E402
from cuepoint.services.database_service import DatabaseService  # noqa: E402
from cuepoint.services.library_import_service import (  # noqa: E402
    LibraryImportService,
)
from cuepoint.services.library_service import LibraryService  # noqa: E402
from cuepoint.services.match_apply import MatchApplyService  # noqa: E402
from cuepoint.services.match_state import MatchStateService  # noqa: E402
from cuepoint.services.metadata_service import MetadataService  # noqa: E402
from cuepoint.services.migration_runner import MigrationRunner  # noqa: E402
from cuepoint.services.statistics_service import (  # noqa: E402
    PlaysScope,
    StatisticsService,
)
from cuepoint.services.waveform_analysis_service import (  # noqa: E402
    WaveformAnalysisService,
)
from cuepoint.services.tag_service import TagService  # noqa: E402

#: Default size. The number Phase 3 was designed against, so the default is the
#: claim rather than something convenient.
DEFAULT_TRACKS = 50_000

#: Playlists to mirror, and how many tracks each holds. A real 3,880-track
#: export had 206 playlists and 13,870 entries — roughly 3.5 entries per track —
#: so these keep the mirror proportionate rather than trivial.
DEFAULT_PLAYLISTS = 250
ENTRIES_PER_PLAYLIST = 700

#: Genres a generated collection spreads across. A real 3,880-track export had
#: a couple of dozen; eight is enough for a facet to be a real question rather
#: than one row, without pretending to model anyone's taste.
GENRES = (
    "House",
    "Tech House",
    "Deep House",
    "Progressive House",
    "Techno",
    "Melodic Techno",
    "Minimal",
    "Electronica",
)

TRACK_ATTRS = (
    'Genre="{genre}" Album="Album {i}" Label="Label {j}" Tonality="{key}" '
    'AverageBpm="{bpm}.00" Year="2024" TotalTime="{total}" BitRate="320" '
    'Rating="{rating}" PlayCount="{plays}" DateAdded="2024-01-01" '
    'Comments="generated"'
)


def _mb(value: int) -> float:
    return round(value / (1024 * 1024), 1)


def rss_mb() -> Optional[float]:
    """Resident set size, if ``psutil`` is here to say."""
    try:
        import psutil
    except ImportError:
        return None
    return round(psutil.Process().memory_info().rss / (1024 * 1024), 1)


@dataclass
class Phase:
    """One measured step."""

    name: str
    seconds: float
    peak_mb: float
    rss_mb: Optional[float] = None
    detail: Dict[str, Any] = field(default_factory=dict)

    @property
    def per_1k(self) -> float:
        """Seconds per thousand tracks, for comparing sizes."""
        total = self.detail.get("tracks")
        if not total:
            return 0.0
        return round(self.seconds / (total / 1000), 3)


class Measured:
    """Time and peak-allocation around a block."""

    def __init__(self, name: str, phases: List[Phase]) -> None:
        self.name = name
        self.phases = phases
        self.detail: Dict[str, Any] = {}

    def __enter__(self) -> "Measured":
        tracemalloc.start()
        self._started = time.perf_counter()
        return self

    def __exit__(self, *exc: Any) -> None:
        seconds = time.perf_counter() - self._started
        _current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        self.phases.append(
            Phase(
                name=self.name,
                seconds=round(seconds, 2),
                peak_mb=_mb(peak),
                rss_mb=rss_mb(),
                detail=self.detail,
            )
        )


def write_export(
    path: Path,
    track_ids: List[int],
    playlists: int = DEFAULT_PLAYLISTS,
    title: str = "Track",
) -> Path:
    """Stream a Rekordbox-shaped export to disk.

    Written a line at a time rather than joined in memory: a 50,000-track export
    is ~20 MB of XML, and building it as one string would make the generator the
    most memory-hungry thing in this script.
    """
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write('<?xml version="1.0" encoding="UTF-8"?>\n')
        handle.write('<DJ_PLAYLISTS Version="1.0.0">\n')
        handle.write(f'  <COLLECTION Entries="{len(track_ids)}">\n')
        for i in track_ids:
            attrs = TRACK_ATTRS.format(
                i=i % 500,
                j=i % 120,
                genre=GENRES[i % len(GENRES)],
                key=f"{(i % 12) + 1}{'AB'[i % 2]}",
                bpm=118 + (i % 22),
                total=180 + (i % 300),
                rating=(i % 6) * 51,
                plays=i % 40,
            )
            handle.write(
                f'    <TRACK TrackID="{i}" Name="{title} {i}" '
                f'Artist="Artist {i % 900}" {attrs} '
                f'Location="file://localhost/music/{i // 1000}/{i}.mp3"/>\n'
            )
        handle.write("  </COLLECTION>\n")

        handle.write('  <PLAYLISTS><NODE Name="ROOT" Type="0" Count="1">\n')
        handle.write(f'    <NODE Name="Sets" Type="0" Count="{playlists}">\n')
        for p in range(playlists):
            members = [
                track_ids[(p * 37 + k) % len(track_ids)]
                for k in range(min(ENTRIES_PER_PLAYLIST, len(track_ids)))
            ]
            handle.write(
                f'      <NODE Name="set {p:04d}" Type="1" Entries="{len(members)}">\n'
            )
            for member in members:
                handle.write(f'        <TRACK Key="{member}"/>\n')
            handle.write("      </NODE>\n")
        handle.write("    </NODE>\n")
        handle.write("  </NODE></PLAYLISTS>\n")
        handle.write("</DJ_PLAYLISTS>\n")
    return path


def build_service(
    db_path: Path,
) -> tuple[LibraryImportService, TrackRepository, PlaylistRepository]:
    """Wire the real services against a scratch database.

    The repositories come back too: LIBUI-01's browse query is measured
    directly against them, because it is the read the Library table runs on
    every scroll and it is far too fast to see through an import.

    The library service is given CuePoint's own two repositories because ORG-04
    made them required: without the Collections one, ``references_for`` would
    answer "nothing is holding these tracks" and wave DEC-011's deletion
    through, which is why it has no default to fall back on.
    """
    database = DatabaseService(db_path=db_path)
    MigrationRunner(database).migrate()
    tracks = TrackRepository(database)
    playlists = PlaylistRepository(database)
    service = LibraryImportService(
        tracks,
        playlists,
        LibrarySourceRepository(database),
        database,
        library_service=LibraryService(
            track_repository=tracks,
            collection_repository=CollectionRepository(database),
            metadata_repository=TrackMetadataRepository(database),
            authored_repository=AuthoredDataRepository(database),
        ),
    )
    return service, tracks, playlists


#: Times per browse case. Enough for a median to mean something, few enough
#: that the whole measurement stays a rounding error next to the import.
BROWSE_REPEATS = 7


def _median_ms(call) -> float:
    """Median wall time of ``call``, in milliseconds, after a warm-up."""
    call()  # warm the page cache, so the first case is not the slow one
    samples = []
    for _ in range(BROWSE_REPEATS):
        started = time.perf_counter()
        call()
        samples.append((time.perf_counter() - started) * 1000)
    return round(statistics.median(samples), 2)


def _give_beatport_keys(track_repo: TrackRepository, total: int) -> None:
    """Accept a Beatport match carrying a key for about 70% of the tracks.

    The rows the matcher writes (PAGES-15): an attempt, a candidate with the
    key, and an accepted state pointing at it. Done in bulk, so the library the
    Keys page counts looks like a matched one.
    """
    keys = [f"{(i % 12) + 1}{'AB'[i % 2]}" for i in range(24)]
    with track_repo._db.transaction(join_existing=True) as conn:
        ids = [
            int(row[0])
            for row in conn.execute("SELECT id FROM tracks ORDER BY id").fetchall()
        ]
        for index, track_id in enumerate(ids):
            if index % 10 >= 7:
                continue
            attempt = conn.execute(
                "INSERT INTO match_attempts (track_id, started_at, finished_at,"
                " outcome, input_json) VALUES (?, 't', 't', 'matched', '{}')",
                (track_id,),
            ).lastrowid
            candidate = conn.execute(
                "INSERT INTO match_candidates (attempt_id, rank, beatport_track_id,"
                " url, key, score, guard_ok, is_winner)"
                " VALUES (?, 0, ?, ?, ?, 96, 1, 1)",
                (attempt, f"bp{track_id}", f"https://bp/{track_id}", keys[index % 24]),
            ).lastrowid
            conn.execute(
                "INSERT OR REPLACE INTO track_match (track_id, state, decided_by,"
                " attempt_id, candidate_id, decided_at)"
                " VALUES (?, 'accepted', 'auto', ?, ?, 't')",
                (track_id, attempt, candidate),
            )


def measure_browse(
    track_repo: TrackRepository, playlist_repo: PlaylistRepository, total: int
) -> List[Dict[str, Any]]:
    """Time the queries the Library table runs (LIBUI-01, DEC-040).

    These are milliseconds, not seconds: they run on every scroll, sort click
    and playlist selection, so the number that matters is whether they are
    imperceptible rather than whether they are faster than an import. The deep
    page is measured because ``LIMIT ? OFFSET ?`` gets slower the further in it
    reaches, and a 50,000-row table is where that shows.
    """
    nodes = playlist_repo.list_all()
    leaf = next((n for n in nodes if not n.is_folder), None)
    folder = next((n for n in nodes if n.is_folder and n.depth > 0), None)

    cases: List[tuple] = [
        (
            "first page, default order",
            lambda: track_repo.browse(BrowseQuery(), limit=100),
        ),
        ("count, whole library", lambda: track_repo.browse_count(BrowseQuery())),
        (
            f"deep page (offset {max(0, total - 100):,})",
            lambda: track_repo.browse(
                BrowseQuery(), limit=100, offset=max(0, total - 100)
            ),
        ),
    ]
    for sort in ("title", "bpm", "genre", "rating", "date_added", "duration_seconds"):
        cases.append(
            (
                f"first page, by {sort}",
                lambda sort=sort: track_repo.browse(BrowseQuery(sort=sort), limit=100),
            )
        )
    cases.append(
        (
            "first page, by bpm descending",
            lambda: track_repo.browse(
                BrowseQuery(sort="bpm", direction="desc"), limit=100
            ),
        )
    )
    cases.append(
        (
            "text query, first page",
            lambda: track_repo.browse(BrowseQuery(query="Artist 42"), limit=100),
        )
    )
    cases.append(
        (
            "text query, count",
            lambda: track_repo.browse_count(BrowseQuery(query="Artist 42")),
        )
    )
    if leaf is not None:
        cases.append(
            (
                "playlist scope, first page",
                lambda: track_repo.browse(BrowseQuery(playlist_id=leaf.id), limit=100),
            )
        )
        cases.append(
            (
                "playlist scope, playlist order",
                lambda: track_repo.browse(
                    BrowseQuery(playlist_id=leaf.id, sort="playlist_position"),
                    limit=100,
                ),
            )
        )
        cases.append(
            (
                "playlist scope, count",
                lambda: track_repo.browse_count(BrowseQuery(playlist_id=leaf.id)),
            )
        )
    if folder is not None:
        cases.append(
            (
                "folder scope, first page",
                lambda: track_repo.browse(
                    BrowseQuery(playlist_id=folder.id), limit=100
                ),
            )
        )
        cases.append(
            (
                "folder scope, count",
                lambda: track_repo.browse_count(BrowseQuery(playlist_id=folder.id)),
            )
        )

    # LIBUI-02: filters and facets. These run when a user types in the filter
    # bar and every time that bar redraws its choices, so they are measured
    # beside the queries they narrow.
    genre_rule = RuleSet(rules=(FilterRule("genre", "is", "Tech House"),))
    narrow = RuleSet(
        rules=(
            FilterRule("genre", "is", "Tech House"),
            FilterRule("bpm", "between", [122, 126]),
            FilterRule("rating", "gte", 3),
        )
    )
    cases += [
        (
            "filtered page, one rule",
            lambda: track_repo.browse(BrowseQuery(rules=genre_rule), limit=100),
        ),
        (
            "filtered count, one rule",
            lambda: track_repo.browse_count(BrowseQuery(rules=genre_rule)),
        ),
        (
            "filtered page, three rules",
            lambda: track_repo.browse(BrowseQuery(rules=narrow), limit=100),
        ),
        (
            "filtered count, three rules",
            lambda: track_repo.browse_count(BrowseQuery(rules=narrow)),
        ),
        ("facet: genre", lambda: track_repo.facet_values(field="genre")),
        ("facet: label (120 values)", lambda: track_repo.facet_values(field="label")),
        ("facet: rating", lambda: track_repo.facet_values(field="rating")),
        # Deliberately unindexed (migration 0008): the price of a long tail.
        (
            "facet: artist (900, no index)",
            lambda: track_repo.facet_values(field="artist"),
        ),
        (
            "facet: genre under a filter",
            lambda: track_repo.facet_values(BrowseQuery(rules=narrow), "genre"),
        ),
        ("facet: bpm range", lambda: track_repo.facet_range(field="bpm")),
    ]

    # PAGES-16: the Keys page's counts. A track's key is its accepted Beatport
    # match's, so most of the library is given one first (the export has none),
    # then the grouped read is timed over the whole library and over ticked
    # playlists, the two things the page asks.
    _give_beatport_keys(track_repo, total)
    ticked = [n for n in nodes if not n.is_folder][:3]
    ticked_rule = RuleSet(
        rules=(
            FilterRule(
                "in_playlist",
                "any_of",
                [{"kind": "playlist", "id": int(n.id)} for n in ticked],
            ),
        )
    )
    cases += [
        (
            "key population, whole library",
            lambda: track_repo.facet_values(BrowseQuery(), "key", limit=24),
        ),
        (
            "key population, three playlists",
            lambda: track_repo.facet_values(
                BrowseQuery(rules=ticked_rule), "key", limit=24
            ),
        ),
    ]

    measured: List[Dict[str, Any]] = []
    for name, call in cases:
        outcome = call()
        if isinstance(outcome, int):
            rows = outcome
        elif hasattr(outcome, "values"):  # a facet: how many choices it offers
            rows = len(outcome.values)
        elif hasattr(outcome, "missing"):  # a range: how many tracks lack one
            rows = outcome.missing
        else:
            rows = len(outcome)
        measured.append({"name": name, "ms": _median_ms(call), "rows": rows})
    return measured


#: What Phase 6 is measured against (ORG-13). A real library's organization is
#: not proportional to its size — a DJ with 50,000 tracks has a few hundred
#: Collections and a few dozen tags, and files the same track under several.
DEFAULT_COLLECTIONS = 200
DEFAULT_TAGS = 40
#: Tag assignments. Four per track at 50,000 tracks: enough that a tag rule is
#: a real join rather than a lookup against a handful of rows.
ASSIGNMENTS_PER_TRACK = 4
#: One Collection large enough to be the slow case for membership and reorder.
BIG_COLLECTION_ENTRIES = 5_000


def build_organization(database, tracks_repo, total: int):
    """Wire CuePoint's own services over the same database.

    Constructed here rather than through :func:`bootstrap_services`, which
    reads the user's config to find a database. Nothing in this script may
    touch ``~/.cuepoint``.
    """
    activity = ActivityService(ActivityRepository(database), tracks_repo)
    tags = TagService(TagRepository(database), activity, database)
    collections = CollectionService(
        CollectionRepository(database), database, tracks_repo, activity
    )
    metadata = MetadataService(
        TrackMetadataRepository(database), tracks_repo, activity, database
    )
    matches = MatchRepository(database)
    batch = BatchService(
        metadata,
        tags,
        collections,
        tracks_repo,
        activity,
        database,
        MatchStateService(matches, tracks_repo, activity, database),
        MatchApplyService(matches, metadata, tracks_repo, database),
    )
    return tags, collections, batch


def seed_organization(tags_service, collections_service, ids, phases, total: int):
    """Create the tree, the vocabulary and the memberships, and time it.

    Returns ``(tag_ids, collection_ids, big_collection_id)``.
    """
    with Measured("organize", phases) as m:
        # A tree with folders, so the read below walks something shaped like a
        # real one rather than a flat list.
        folder_ids = [
            collections_service.create_folder(f"folder {index}").id
            for index in range(8)
        ]
        collection_ids = []
        for index in range(DEFAULT_COLLECTIONS):
            parent = folder_ids[index % len(folder_ids)] if index % 3 else None
            collection_ids.append(
                collections_service.create_collection(
                    f"collection {index:03d}", parent
                ).id
            )

        tag_ids = [
            tags_service.create_or_get(
                f"tag {index:02d}", category=f"category {index % 5}"
            ).id
            for index in range(DEFAULT_TAGS)
        ]

        # Spread over the library rather than over the first few thousand
        # tracks: a rule that matched a contiguous block would be answered by
        # the browse index instead of by the join being measured.
        for offset, tag_id in enumerate(tag_ids):
            step = DEFAULT_TAGS // ASSIGNMENTS_PER_TRACK
            members = ids[offset::step]
            tags_service.assign(members, tag_id)

        # Every Collection holds something, and the first holds a lot. Clamped
        # to the library, so `--tracks 2000` measures a 2,000-entry Collection
        # rather than failing on a slice that is not there.
        big = collection_ids[0]
        big_entries = min(BIG_COLLECTION_ENTRIES, len(ids))
        collections_service.add_tracks(big, ids[:big_entries])
        for index, collection_id in enumerate(collection_ids[1:], start=1):
            collections_service.add_tracks(
                collection_id, ids[index * 7 : index * 7 + 25]
            )

        m.detail = {
            "tracks": total,
            "collections": len(collection_ids),
            "folders": len(folder_ids),
            "tags": len(tag_ids),
            "assignments": sum(
                len(ids[offset :: DEFAULT_TAGS // ASSIGNMENTS_PER_TRACK])
                for offset in range(DEFAULT_TAGS)
            ),
            "largest_collection": collections_service.counts(big)[0],
        }
    return tag_ids, collection_ids, big, big_entries


def measure_organization(
    track_repo,
    tags_service,
    collections_service,
    batch_service,
    tag_ids,
    big,
    big_entries,
):
    """Time the reads and writes Phase 6 added (ORG-13).

    The same milliseconds-not-seconds rule as :func:`measure_browse`: a
    Collection is a scope on the one browse path (DEC-023), so these run on
    every click in the left pane and every redraw of the filter bar.
    """
    tag_rule = RuleSet(rules=(FilterRule("tag", "has_tag", tag_ids[0]),))
    two_tags = RuleSet(
        rules=(
            FilterRule("tag", "has_tag", tag_ids[0]),
            FilterRule("tag", "has_tag", tag_ids[1]),
        )
    )
    membership = RuleSet(rules=(FilterRule("collection", "in_collection", big),))

    cases = [
        (
            "Collection scope, first page",
            lambda: track_repo.browse(
                BrowseQuery(collection_id=big, sort="collection_position"), limit=100
            ),
        ),
        (
            "Collection scope, count",
            lambda: track_repo.browse_count(BrowseQuery(collection_id=big)),
        ),
        (
            "membership rule, first page",
            lambda: track_repo.browse(BrowseQuery(rules=membership), limit=100),
        ),
        (
            "membership rule, count",
            lambda: track_repo.browse_count(BrowseQuery(rules=membership)),
        ),
        (
            "tag rule, first page",
            lambda: track_repo.browse(BrowseQuery(rules=tag_rule), limit=100),
        ),
        (
            "tag rule, count",
            lambda: track_repo.browse_count(BrowseQuery(rules=tag_rule)),
        ),
        (
            "two tag rules, count",
            lambda: track_repo.browse_count(BrowseQuery(rules=two_tags)),
        ),
        ("facet: tag", lambda: track_repo.facet_values(field="tag")),
        (
            "facet: tag under a filter",
            lambda: track_repo.facet_values(BrowseQuery(rules=tag_rule), "tag"),
        ),
        ("the Collections tree", lambda: collections_service.tree()),
        ("the tag vocabulary", lambda: tags_service.list_all()),
    ]

    measured = []
    for name, call in cases:
        outcome = call()
        if isinstance(outcome, int):
            rows = outcome
        elif hasattr(outcome, "values"):
            rows = len(outcome.values)
        else:
            rows = len(outcome)
        measured.append({"name": name, "ms": _median_ms(call), "rows": rows})

    # A reorder inside the big Collection. Measured on its own because it is a
    # write in the middle of thousands of rows, which is where the position
    # shuffle costs something; and undone each time, so the median is of the
    # same move rather than of a row walking towards the front.
    entries = collections_service.entries(big, limit=1, offset=big_entries // 2)
    entry_id = entries[0].id
    original = entries[0].position

    def reorder():
        collections_service.reorder_entry(entry_id, 0)
        collections_service.reorder_entry(entry_id, original)

    measured.append(
        {
            "name": f"reorder inside {big_entries:,} entries",
            "ms": _median_ms(reorder),
            "rows": big_entries,
        }
    )
    return measured


def measure_batch(batch_service, phases, total: int):
    """The phase-level claim: one operation over everything a query matches.

    DEC-045 says the ids never reach the renderer; DEC-063 says the work is a
    job with one batch id. What is measured here is the engine's half — the
    resolve and the chunked write — because that is the part that takes the
    time and the part a 47,913-track library would find out about.
    """
    with Measured("batch: favorite everything matching", phases) as m:
        result = batch_service.apply_batch(
            BatchSelection.matching(BrowseQuery()),
            BatchOperation(kind="set_favorite", value=True),
        )
        m.detail = {
            "tracks": total,
            "total": result.total,
            "changed": result.changed,
            "unchanged": result.unchanged,
        }
    return result


#: What the Statistics page is measured against (STATS-02): a DJ who refreshes
#: weekly for a year, with 500 play counts moving each week (Phase 15, fact 11).
HISTORY_WEEKS = 52
HISTORY_MOVED_PER_WEEK = 500

#: What the plays route has to answer within on the development machine.
PLAYS_BUDGET_MS = 500

#: And the spreads and the health routes (STATS-03).
SPREADS_BUDGET_MS = 1000
HEALTH_BUDGET_MS = 500


def build_play_history(
    database: DatabaseService,
    weeks: int = HISTORY_WEEKS,
    moved: int = HISTORY_MOVED_PER_WEEK,
) -> int:
    """Give the imported library ``weeks`` of weekly reads, ``moved`` counts each.

    The import and the phases before it left a few reads. They are dated back
    to before the year starts and a read is added for each week since, each storing ``moved`` tracks'
    counts a few plays higher than before: what ``weeks`` real refreshes would
    leave, written directly because a refresh of 50,000 tracks takes seconds and
    this is about reading the history back. ``tracks.play_count`` is brought up to
    the last count, as a real refresh would have left it.

    Returns:
        The ``play_counts`` rows written.
    """
    connection = database.connect()
    counts = {
        int(row[0]): int(row[1])
        for row in connection.execute(
            "SELECT id, play_count FROM tracks WHERE play_count IS NOT NULL ORDER BY id"
        )
    }
    ids = list(counts)
    moved = min(moved, len(ids))
    end = datetime.now(timezone.utc).replace(microsecond=0)
    written = 0
    with database.transaction() as conn:
        # Every read the import and the phases before it left (the import, the
        # re-import, a refresh) is dated a year back, a day apart: they were
        # stamped now, which would put them inside every "since" window.
        earlier = [
            r[0] for r in conn.execute("SELECT id FROM library_reads ORDER BY id")
        ]
        for index, read_id in enumerate(earlier):
            when = end - timedelta(weeks=weeks, days=len(earlier) - index)
            conn.execute(
                "UPDATE library_reads SET read_at = ? WHERE id = ?",
                (when.isoformat(), read_id),
            )
        for week in range(1, weeks + 1):
            when = end - timedelta(weeks=weeks - week)
            read_id = conn.execute(
                "INSERT INTO library_reads (read_at, kind, tracks, changed)"
                " VALUES (?, 'refresh', ?, ?)",
                (when.isoformat(), len(ids), moved),
            ).lastrowid
            rows = []
            for step in range(moved):
                track_id = ids[(week * moved + step) % len(ids)]
                counts[track_id] += 1 + step % 5
                rows.append((track_id, read_id, counts[track_id]))
            conn.executemany(
                "INSERT INTO play_counts (track_id, read_id, play_count)"
                " VALUES (?, ?, ?)",
                rows,
            )
            written += len(rows)
        conn.executemany(
            "UPDATE tracks SET play_count = ? WHERE id = ?",
            [(count, track_id) for track_id, count in counts.items()],
        )
    return written


def seed_spread_inputs(database: DatabaseService, store: WaveformStore) -> int:
    """Vary what the spreads read, check every file, and measure most of them.

    The generated export gives every track one year and one date, so the spreads
    would have one bar each. This gives them what a library has: thirty years,
    120 months, tempos from 80 to 170, and ratings 0 to 5 (STATS-03); a present
    file check for every track; and a waveform store with a row for four tracks
    in five and a loudness for seven in ten, written directly because analysing
    50,000 files is a different benchmark.

    Returns:
        The loudness readings written.
    """
    with database.transaction() as conn:
        conn.execute(
            "UPDATE tracks SET year = 1995 + id % 30,"
            " bpm = 80 + id % 90 + (id % 10) / 10.0,"
            " date_added = printf('%04d-%02d-%02d', 2016 + id % 10,"
            " 1 + (id / 10) % 12, 1 + id % 28),"
            " rating = id % 6"
        )
        conn.execute(
            "INSERT OR REPLACE INTO track_files"
            " (track_id, status, checked_path, size_bytes, checked_at, reason)"
            " SELECT id, 'present', file_path, 1000 + id % 1000,"
            " '2026-10-01T10:00:00+00:00', NULL FROM tracks"
            " WHERE file_path IS NOT NULL AND file_path <> ''"
        )
        paths = [
            (str(row[0]), 1000 + int(row[1]) % 1000, int(row[1]))
            for row in conn.execute("SELECT file_path, id FROM tracks ORDER BY id")
        ]
    waveforms = [
        (
            path,
            size,
            1,
            ANALYSIS_VERSION,
            "ready",
            None,
            1000,
            "2026-10-01T10:00:00+00:00",
            b"CPWF",
        )
        for path, size, ident in paths
        if ident % 5
    ]
    loudness = [
        (path, size, 1, LOUDNESS_VERSION, -14.0 + (ident % 90) / 10.0, -1.0, None)
        for path, size, ident in paths
        if ident % 10 < 7 and ident % 5
    ]
    connection = store.connect()
    with connection:
        connection.executemany(
            "INSERT OR REPLACE INTO waveforms (path, size_bytes, mtime_ns,"
            " analysis_version, state, reason, duration_ms, analysed_at, data)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            waveforms,
        )
        connection.executemany(
            "INSERT OR REPLACE INTO loudness (path, size_bytes, mtime_ns,"
            " loudness_version, integrated_lufs, peak_dbfs, reason)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            loudness,
        )
    return len(loudness)


def measure_statistics(
    database: DatabaseService,
    track_repo: TrackRepository,
    playlist_repo: PlaylistRepository,
    collections_service: CollectionService,
) -> List[Dict[str, Any]]:
    """Time the plays, spreads and health routes (STATS-02, STATS-03).

    Beside the count of the whole library, the cheapest question the Library
    asks, so the plays are read as a multiple of something already imperceptible.
    """
    store = WaveformStore(default_waveform_store_path(database.db_path))
    seed_spread_inputs(database, store)
    # `plan()` reads the library and the store only; the service that analyses a
    # file is for a run, which this does not make.
    analysis = WaveformAnalysisService(
        WaveformWorkRepository(database),
        store,
        None,  # type: ignore[arg-type]
    )
    service = StatisticsService(
        StatisticsRepository(database),
        collections_service,
        playlist_repo,
        waveform_store=store,
        analysis_service=analysis,
    )
    # The largest playlist; a folder holding all 250 is a scope the Library itself
    # takes 175,000 entries to read, which says nothing about the spreads.
    playlist = PlaysScope(
        "playlist",
        int(
            database.connect()
            .execute(
                "SELECT playlist_id FROM rekordbox_playlist_tracks"
                " GROUP BY playlist_id ORDER BY COUNT(*) DESC, playlist_id LIMIT 1"
            )
            .fetchone()[0]
        ),
    )
    reads = StatisticsRepository(database).reads()
    ninety_days = (datetime.now(timezone.utc) - timedelta(days=90)).date()
    cases: List[tuple] = [
        ("count, whole library", lambda: track_repo.browse_count(BrowseQuery())),
        ("plays, all time", lambda: service.plays(limit=10).tracks),
        ("plays, all time, 200 rows", lambda: service.plays(limit=200).tracks),
        (
            "plays, since 90 days",
            lambda: service.plays(limit=10, since=ninety_days).tracks,
        ),
        (
            "plays, since the last read",
            lambda: service.plays(limit=10, since_read=reads[-1][0]).tracks,
        ),
        ("spreads", lambda: service.spreads().total),
        ("spreads, playlist scope", lambda: service.spreads(playlist).total),
        ("health", lambda: service.health().total),
        ("health, playlist scope", lambda: service.health(playlist).total),
    ]
    measured: List[Dict[str, Any]] = []
    for name, call in cases:
        outcome = call()
        rows = outcome if isinstance(outcome, int) else len(outcome)
        measured.append({"name": name, "ms": _median_ms(call), "rows": rows})
    store.close_all()
    return measured


def run(
    tracks: int, playlists: int, workspace: Path, with_statistics: bool = False
) -> Dict[str, Any]:
    """Run every phase and return the report."""
    phases: List[Phase] = []
    ids = list(range(1, tracks + 1))

    base = workspace / "collection.xml"
    with Measured("generate", phases) as m:
        write_export(base, ids, playlists)
        m.detail = {"tracks": tracks, "bytes": base.stat().st_size}

    service, track_repo, playlist_repo = build_service(workspace / "library.db")

    with Measured("import", phases) as m:
        summary = service.import_rekordbox_xml(str(base))
        m.detail = {
            "tracks": summary.track_count,
            "inserted": summary.tracks_inserted,
            "playlists": summary.playlists.playlists,
            "entries": summary.playlists.entries,
        }

    with Measured("re-import (idempotent)", phases) as m:
        again = service.import_rekordbox_xml(str(base))
        m.detail = {
            "tracks": again.track_count,
            "inserted": again.tracks_inserted,
            "updated": again.tracks_updated,
        }

    browse = measure_browse(track_repo, playlist_repo, tracks)

    # CuePoint's own organization, over the same library (ORG-13). Built after
    # the browse measurements so those are of a library nothing has organized,
    # and before the refresh ones so the diff has Collections to warn about.
    tags_service, collections_service, batch_service = build_organization(
        service._db, track_repo, tracks
    )
    tag_ids, _collection_ids, big, big_entries = seed_organization(
        tags_service, collections_service, ids, phases, tracks
    )
    organization = measure_organization(
        track_repo,
        tags_service,
        collections_service,
        batch_service,
        tag_ids,
        big,
        big_entries,
    )
    batch_result = measure_batch(batch_service, phases, tracks)

    with Measured("diff, nothing changed", phases) as m:
        unchanged = service.compute_refresh_diff(str(base))
        m.detail = {
            "tracks": tracks,
            "is_empty": unchanged.is_empty,
            "read_the_file": unchanged.contents_compared,
        }

    # The same question with the shortcut refused, so the report says what a
    # full comparison of an unchanged collection actually costs rather than
    # only what the shortcut saves.
    with Measured("diff, nothing changed (forced)", phases) as m:
        forced = service.compute_refresh_diff(str(base), force=True)
        m.detail = {
            "tracks": tracks,
            "is_empty": forced.is_empty,
            "read_the_file": forced.contents_compared,
        }

    # An edit a real user would make: some gone, some renamed, some new.
    edited = workspace / "collection-edited.xml"
    removed = max(1, tracks // 100)
    added = max(1, tracks // 200)
    kept = ids[removed:]
    fresh = list(range(10_000_000, 10_000_000 + added))
    with Measured("generate edited", phases) as m:
        write_export(edited, kept + fresh, playlists)
        m.detail = {"tracks": len(kept) + added, "bytes": edited.stat().st_size}

    with Measured("diff, edited", phases) as m:
        diff = service.compute_refresh_diff(str(edited))
        m.detail = {
            "tracks": tracks,
            "added": diff.added.count,
            "changed": diff.changed.count,
            "removed": diff.removed.count,
            # DEC-011, non-zero for the first time: the tracks this refresh
            # would delete are filed in Collections, so the apply below has to
            # be confirmed rather than simply run (ORG-13).
            "referenced_tracks": diff.references.referenced_track_count,
            "referencing_collections": diff.references.collection_count,
        }

    with Measured("apply refresh", phases) as m:
        applied = service.apply_refresh(diff, confirm_references=True)
        m.detail = {
            "tracks": applied.track_count,
            "inserted": applied.tracks_inserted,
            "deleted": applied.tracks_deleted,
        }

    # Last, so the history it adds cannot change what the refresh phases above
    # measure: they are the numbers STATS-01 recorded.
    statistics_cases: List[Dict[str, Any]] = []
    if with_statistics:
        with Measured("build a year of play history", phases) as m:
            stored = build_play_history(service._db)
            m.detail = {"weeks": HISTORY_WEEKS, "play_counts": stored}
        statistics_cases = measure_statistics(
            service._db, track_repo, playlist_repo, collections_service
        )

    problems = []
    by_name = {p.name: p for p in phases}
    reimport = by_name["re-import (idempotent)"]
    if reimport.detail["inserted"] != 0:
        problems.append("re-importing the same file inserted rows")
    if reimport.detail["tracks"] != tracks:
        problems.append("re-importing the same file changed the track count")
    if not by_name["diff, nothing changed"].detail["is_empty"]:
        problems.append("an unchanged file produced a non-empty diff")
    if by_name["diff, nothing changed"].detail["read_the_file"]:
        problems.append("an unchanged file was read rather than short-circuited")
    if not by_name["diff, nothing changed (forced)"].detail["read_the_file"]:
        problems.append("force did not read the file")
    if not by_name["diff, nothing changed (forced)"].detail["is_empty"]:
        problems.append("reading an unchanged file in full found a difference")
    edited_diff = by_name["diff, edited"].detail
    if edited_diff["removed"] != removed or edited_diff["added"] != added:
        problems.append("the diff did not match the edit that was made")
    if edited_diff["referencing_collections"] <= 0:
        problems.append("the refresh deleted filed tracks without DEC-011 noticing")
    if edited_diff["referenced_tracks"] > edited_diff["removed"]:
        problems.append("DEC-011 warned about more tracks than the refresh removes")
    if by_name["apply refresh"].detail["deleted"] != removed:
        problems.append("the apply did not delete what the preview promised")
    organized = by_name["organize"].detail
    if organized["collections"] != DEFAULT_COLLECTIONS:
        problems.append("not every Collection was created")
    if organized["tags"] != DEFAULT_TAGS:
        problems.append("not every tag was created")
    largest = min(BIG_COLLECTION_ENTRIES, tracks)
    if organized["largest_collection"] != largest:
        problems.append("the large Collection did not hold what it was given")
    batched = by_name["batch: favorite everything matching"].detail
    if batched["total"] != tracks:
        problems.append("the batch did not resolve the whole library")
    if batched["changed"] != tracks:
        problems.append("the batch did not change every track it resolved")
    by_org = {case["name"]: case for case in organization}
    if by_org["Collection scope, count"]["rows"] != largest:
        problems.append("a Collection scope counted something other than its entries")
    if by_org["membership rule, count"]["rows"] != largest:
        problems.append("a membership rule and its scope disagreed")
    if by_org["tag rule, count"]["rows"] <= 0:
        problems.append("a tag rule that should match found nothing")
    if by_org["two tag rules, count"]["rows"] > by_org["tag rule, count"]["rows"]:
        problems.append("adding a tag rule found more tracks, not fewer")
    if by_org["facet: tag"]["rows"] < DEFAULT_TAGS:
        problems.append("the tag facet did not offer every tag")
    if by_org["the tag vocabulary"]["rows"] != DEFAULT_TAGS:
        problems.append("the tag vocabulary lost a tag")
    for case in statistics_cases:
        budget = {
            "plays": PLAYS_BUDGET_MS,
            "spreads": SPREADS_BUDGET_MS,
            "health": HEALTH_BUDGET_MS,
        }.get(case["name"].split(",")[0])
        if budget is not None and case["ms"] > budget:
            problems.append(
                f"{case['name']} took {case['ms']} ms; the budget is {budget}"
            )
    by_stat = {case["name"]: case for case in statistics_cases}
    if statistics_cases and by_stat["spreads"]["rows"] != tracks - removed + added:
        problems.append("the spreads did not count the library they were asked of")
    if statistics_cases and by_stat["health"]["rows"] != by_stat["spreads"]["rows"]:
        problems.append("health and the spreads counted different libraries")
    if statistics_cases and statistics_cases[1]["rows"] <= 0:
        problems.append("the plays route found no played track")
    by_case = {case["name"]: case for case in browse}
    if by_case["count, whole library"]["rows"] != tracks:
        problems.append("browse counted a different library than was imported")
    if by_case["first page, default order"]["rows"] != min(100, tracks):
        problems.append("the first browse page was not a full window")
    if by_case["playlist scope, count"]["rows"] <= 0:
        problems.append("a playlist scope found no tracks")
    if by_case["facet: genre"]["rows"] != len(GENRES):
        problems.append("the genre facet did not find every genre")
    if by_case["filtered count, one rule"]["rows"] <= 0:
        problems.append("a filter that should match found nothing")
    if (
        by_case["filtered count, three rules"]["rows"]
        > by_case["filtered count, one rule"]["rows"]
    ):
        problems.append("adding rules found more tracks, not fewer")

    # Closed first, and the journal counted: an open SQLite connection can be
    # holding most of the database in a -wal file that stat() would not see, and
    # a size read before the checkpoint reports almost nothing.
    service._db.close_all()
    db_bytes = sum(
        candidate.stat().st_size
        for candidate in workspace.glob("library.db*")
        if candidate.is_file()
    )
    return {
        "tracks": tracks,
        "playlists": playlists,
        "collections": DEFAULT_COLLECTIONS,
        "tags": DEFAULT_TAGS,
        "database_mb": _mb(db_bytes),
        "phases": [asdict(p) for p in phases],
        "browse": browse,
        "organization": organization,
        "statistics": statistics_cases,
        "batch": {
            "total": batch_result.total,
            "changed": batch_result.changed,
            "unchanged": batch_result.unchanged,
        },
        "problems": problems,
    }


def report(result: Dict[str, Any]) -> None:
    """Print the table that goes in the docs."""
    print(
        f"\n{result['tracks']:,} tracks, {result['playlists']} playlists — "
        f"database {result['database_mb']} MB\n"
    )
    print(f"{'phase':<24}{'seconds':>9}{'s / 1k':>9}{'peak MB':>10}{'RSS MB':>9}")
    print("-" * 61)
    for phase in result["phases"]:
        per_1k = ""
        if phase["detail"].get("tracks"):
            per_1k = f"{phase['seconds'] / (phase['detail']['tracks'] / 1000):.3f}"
        rss = "" if phase["rss_mb"] is None else f"{phase['rss_mb']:.1f}"
        print(
            f"{phase['name']:<24}{phase['seconds']:>9.2f}{per_1k:>9}"
            f"{phase['peak_mb']:>10.1f}{rss:>9}"
        )
    print()
    for phase in result["phases"]:
        if phase["detail"]:
            print(f"  {phase['name']}: {phase['detail']}")

    if result.get("browse"):
        print()
        print(f"{'browse query (LIBUI-01)':<34}{'median ms':>11}{'rows':>9}")
        print("-" * 54)
        for case in result["browse"]:
            print(f"{case['name']:<34}{case['ms']:>11.2f}{case['rows']:>9,}")
    if result.get("organization"):
        print()
        print(f"{'organization (ORG-13)':<34}{'median ms':>11}{'rows':>9}")
        print("-" * 54)
        for case in result["organization"]:
            print(f"{case['name']:<34}{case['ms']:>11.2f}{case['rows']:>9,}")
    if result.get("statistics"):
        print()
        print(f"{'statistics (STATS-02, STATS-03)':<34}{'median ms':>11}{'rows':>9}")
        print("-" * 54)
        for case in result["statistics"]:
            print(f"{case['name']:<34}{case['ms']:>11.2f}{case['rows']:>9,}")
    if result["problems"]:
        print("\nPROBLEMS:")
        for problem in result["problems"]:
            print(f"  - {problem}")
    else:
        print("\nEvery phase produced the result it promised.")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tracks", type=int, default=DEFAULT_TRACKS)
    parser.add_argument("--playlists", type=int, default=DEFAULT_PLAYLISTS)
    parser.add_argument("--json", type=Path, default=None, help="write the report")
    parser.add_argument(
        "--statistics",
        action="store_true",
        help="add a year of play history and time the Statistics routes (STATS-02/03)",
    )
    parser.add_argument(
        "--keep", action="store_true", help="leave the generated files in place"
    )
    args = parser.parse_args(argv)
    # The report has an em dash in it and Windows consoles default to cp1252.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    workspace = Path(tempfile.mkdtemp(prefix="cuepoint-bench-"))
    print(f"workspace: {workspace}")
    try:
        result = run(args.tracks, args.playlists, workspace, args.statistics)
        report(result)
        if args.json:
            args.json.write_text(json.dumps(result, indent=2), encoding="utf-8")
            print(f"\nwrote {args.json}")
        return 1 if result["problems"] else 0
    finally:
        if args.keep:
            print(f"kept {workspace}")
        else:
            shutil.rmtree(workspace, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
