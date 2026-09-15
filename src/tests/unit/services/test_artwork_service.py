#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""CLEAN-09's artwork service: reading, fetching and showing (DEC-076).

Over a real database, with the files, the image downloads and the page reads
replaced by recorders, so nothing reaches Beatport and every file opened is
counted:

- **The file's picture comes first**, then Beatport's for an accepted match
  only, then nothing — and a file the check found missing is never opened.
- **Both sizes are made from one read or one download**, and identical images
  are stored once.
- **A stored attempt with no artwork URL is looked up once**, against the page
  it was looked up for.
- **Offline is an empty state**: no exception, no retry on every display, and a
  fetch over a scope stops rather than spending a timeout per track.
- **A refused image is recorded and never decoded again.**
- **A scan reads only present files, decodes nothing, commits in chunks and
  cancels promptly.**
"""

from __future__ import annotations

import hashlib
import io
import threading
import time
import uuid
from typing import Dict, List, Optional, Sequence
from unittest import mock

import pytest
from PIL import Image

from cuepoint.data.artwork import EmbeddedRead
from cuepoint.data.artwork_image import MAX_INPUT_BYTES
from cuepoint.models.artwork import EMBEDDED_NONE, EMBEDDED_PRESENT, EMBEDDED_UNKNOWN
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.file_status import FILE_MISSING, FILE_PRESENT, TrackFileStatus
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.artwork_repository import ArtworkRepository
from cuepoint.persistence.file_status_repository import FileStatusRepository
from cuepoint.persistence.match_repository import MatchRepository
from cuepoint.persistence.track_query import BrowseQueryError
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services import artwork_service as module
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.artwork_cache import ArtworkCache
from cuepoint.services.artwork_service import (
    BEATPORT_FETCH_SIZE,
    EVENT_ARTWORK_SCANNED,
    NOTHING_TO_SCAN,
    RETRY_FAILED_AFTER_SECONDS,
    THUMBNAIL_SIZES,
    UNREACHABLE_AFTER_FAILURES,
    ArtworkScanResult,
    ArtworkService,
    FetchGate,
    fetch_image,
    lookup_page_artwork,
    size_pixels,
)
from cuepoint.services.batch_service import BatchSelection
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.match_state import MatchStateService
from cuepoint.services.migration_runner import MigrationRunner

NOW = "2026-09-15T12:00:00+00:00"
QUESTION = Track(title="A Title", artist="An Artist")
ROW, INSPECTOR = THUMBNAIL_SIZES["row"], THUMBNAIL_SIZES["inspector"]


def jpeg(colour: str = "red", size=(600, 600)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, colour).save(buffer, "JPEG")
    return buffer.getvalue()


def art(name: str) -> str:
    return f"https://geo-media.beatport.com/image_size/{{w}}x{{h}}/{name}.jpg"


def fetched_url(name: str) -> str:
    return art(name).replace("{w}x{h}", f"{BEATPORT_FETCH_SIZE}x{BEATPORT_FETCH_SIZE}")


def page_of(beatport_id: str) -> str:
    return f"https://www.beatport.com/track/a-title/{beatport_id}"


class Clock:
    def __init__(self) -> None:
        self.now = 1_000.0

    def __call__(self) -> float:
        return self.now


class Files:
    """Embedded pictures by path, counting every file opened."""

    def __init__(self) -> None:
        self.pictures: Dict[str, EmbeddedRead] = {}
        self.opened: List[str] = []
        self.lock = threading.Lock()

    def __call__(self, path: str) -> EmbeddedRead:
        with self.lock:
            self.opened.append(path)
        return self.pictures.get(path, EmbeddedRead())


class Web:
    """Beatport images and pages, counting every request."""

    def __init__(self) -> None:
        self.images: Dict[str, Optional[bytes]] = {}
        self.pages: Dict[str, Optional[str]] = {}
        self.fetched: List[str] = []
        self.looked_up: List[str] = []
        self.lock = threading.Lock()

    def fetch(self, url: str) -> Optional[bytes]:
        with self.lock:
            self.fetched.append(url)
        return self.images.get(url)

    def lookup(self, page: str) -> Optional[str]:
        with self.lock:
            self.looked_up.append(page)
        return self.pages.get(page)


class Selections:
    def __init__(self, error: Optional[Exception] = None) -> None:
        self.error = error

    def resolve(self, selection: BatchSelection) -> List[int]:
        if self.error is not None:
            raise self.error
        assert selection.track_ids is not None
        return list(selection.track_ids)


# ------------------------------------------------------------------ fixtures


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def tracks(db) -> TrackRepository:
    return TrackRepository(db)


@pytest.fixture
def artwork(db) -> ArtworkRepository:
    return ArtworkRepository(db)


@pytest.fixture
def files() -> Files:
    return Files()


@pytest.fixture
def web() -> Web:
    return Web()


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def cache(tmp_path) -> ArtworkCache:
    return ArtworkCache(tmp_path / "thumbnails")


@pytest.fixture
def activity(db, tracks) -> ActivityService:
    return ActivityService(ActivityRepository(db), tracks)


@pytest.fixture
def make_service(db, tracks, artwork, activity, cache, files, web, clock):
    def make(**overrides) -> ArtworkService:
        options = dict(
            gate=FetchGate(monotonic=clock),
            fetcher=web.fetch,
            page_lookup=web.lookup,
            reader=files,
            clock=lambda: NOW,
        )
        options.update(overrides)
        return ArtworkService(
            overrides.pop("repository", artwork),
            tracks,
            Selections(),
            activity,
            db,
            cache,
            **{key: value for key, value in options.items() if key != "repository"},
        )

    return make


@pytest.fixture
def service(make_service) -> ArtworkService:
    return make_service()


def add(tracks, db, paths: Sequence[str]) -> List[int]:
    prefix = uuid.uuid4().hex[:8]
    tracks.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=f"{prefix}-{index}",
                title=f"T{index}",
                artist="A",
                file_path=path,
            )
            for index, path in enumerate(paths)
        ]
    )
    rows = db.connect().execute(
        "SELECT id, rekordbox_track_id FROM tracks WHERE rekordbox_track_id LIKE ?",
        (f"{prefix}-%",),
    )
    found = {row["rekordbox_track_id"]: int(row["id"]) for row in rows}
    return [found[f"{prefix}-{index}"] for index in range(len(paths))]


def checked(db, track_ids: Sequence[int], status: str = FILE_PRESENT) -> None:
    repository = FileStatusRepository(db)
    with db.transaction():
        repository.record(
            [
                TrackFileStatus(
                    track_id=track_id,
                    status=status,
                    checked_path=path_of(db, track_id),
                    checked_at=NOW,
                    size_bytes=1 if status == FILE_PRESENT else None,
                )
                for track_id in track_ids
            ]
        )


def path_of(db, track_id: int) -> str:
    return str(
        db.connect()
        .execute("SELECT file_path FROM tracks WHERE id = ?", (track_id,))
        .fetchone()["file_path"]
    )


def candidate(
    beatport_id: str, score: float, artwork_url: Optional[str]
) -> BeatportCandidate:
    return BeatportCandidate(
        url=page_of(beatport_id),
        title="A Title",
        artists="An Artist",
        label=None,
        release_date=None,
        bpm=None,
        key=None,
        genre=None,
        score=score,
        title_sim=90,
        artist_sim=90,
        query_index=1,
        query_text="q",
        candidate_index=1,
        base_score=score,
        bonus_year=0,
        bonus_key=0,
        guard_ok=True,
        reject_reason="",
        elapsed_ms=1,
        is_winner=False,
        release_year=None,
        release_name=None,
        artwork_url=artwork_url,
    )


def matched(
    db,
    tracks,
    activity,
    track_id: int,
    beatport_id: str,
    artwork_url: Optional[str],
    score: float = 97.0,
) -> None:
    """Store an attempt whose winner scores ``score``; 97 is accepted by the rule."""
    best = candidate(beatport_id, score, artwork_url)
    result = TrackResult(
        playlist_index=1,
        title="A Title",
        artist="An Artist",
        matched=True,
        best_match=best,
        candidates=[best],
        match_score=score,
    )
    matches = MatchRepository(db)
    states = MatchStateService(matches, tracks, activity, db)
    states.apply_attempt(matches.add_attempt(track_id, "job", result, QUESTION))


def record(artwork, track_id: int):
    return artwork.get(track_id)


def decoded(data: Optional[bytes]) -> Image.Image:
    assert data is not None
    return Image.open(io.BytesIO(data))


# ------------------------------------------------------------------ showing


@pytest.mark.unit
class TestSizes:
    def test_the_two_sizes_are_the_layout_boxes_at_three_times(self):
        assert THUMBNAIL_SIZES == {"row": 108, "inspector": 288}
        assert size_pixels("row") == 108

    @pytest.mark.parametrize("size", ["small", "", None, 108, "ROW"])
    def test_any_other_size_is_refused(self, service, tracks, db, size):
        [track] = add(tracks, db, ["/m/a.mp3"])
        with pytest.raises(ValueError, match="sizes"):
            service.thumbnail(track, size)

    def test_an_unknown_track_is_a_lookup_error(self, service):
        with pytest.raises(LookupError):
            service.thumbnail(999_999, "row")


@pytest.mark.unit
class TestTheFilesPicture:
    def test_a_picture_becomes_a_thumbnail_and_is_recorded(
        self, service, tracks, db, files, artwork
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        files.pictures["/m/a.mp3"] = EmbeddedRead(data=jpeg(size=(600, 300)))

        image = decoded(service.thumbnail(track, "row"))

        assert image.format == "JPEG" and image.size == (108, 54)
        row = record(artwork, track)
        assert row.embedded == EMBEDDED_PRESENT
        assert row.embedded_hash == hashlib.sha256(jpeg(size=(600, 300))).hexdigest()
        assert row.checked_path == "/m/a.mp3"

    def test_the_second_size_and_the_second_display_open_nothing(
        self, service, tracks, db, files
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        files.pictures["/m/a.mp3"] = EmbeddedRead(data=jpeg())

        service.thumbnail(track, "row")
        assert decoded(service.thumbnail(track, "inspector")).size == (288, 288)
        service.thumbnail(track, "row")

        assert files.opened == ["/m/a.mp3"]

    def test_a_file_the_check_found_missing_is_never_opened(
        self, service, tracks, db, files
    ):
        [track] = add(tracks, db, ["/m/gone.mp3"])
        checked(db, [track], FILE_MISSING)

        assert service.thumbnail(track, "row") is None
        assert files.opened == []

    def test_identical_pictures_are_stored_once(
        self, service, tracks, db, files, cache
    ):
        ids = add(tracks, db, ["/m/a.mp3", "/m/b.mp3"])
        files.pictures["/m/a.mp3"] = EmbeddedRead(data=jpeg())
        files.pictures["/m/b.mp3"] = EmbeddedRead(data=jpeg())

        assert service.thumbnail(ids[0], "row") == service.thumbnail(ids[1], "row")

        assert len(list(cache.directory.rglob("*.jpg"))) == 2  # one per size

    def test_a_file_with_no_picture_is_recorded_and_not_reopened(
        self, service, tracks, db, files, artwork
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])

        assert service.thumbnail(track, "row") is None
        assert service.thumbnail(track, "row") is None

        assert record(artwork, track).embedded == EMBEDDED_NONE
        assert files.opened == ["/m/a.mp3"]

    def test_unreadable_tags_show_nothing_and_are_left_to_the_scan(
        self, service, tracks, db, files, artwork
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        files.pictures["/m/a.mp3"] = EmbeddedRead(error="tags could not be read")

        assert service.thumbnail(track, "row") is None
        assert record(artwork, track) is None

    def test_a_moved_file_is_read_again_at_its_new_path(
        self, service, tracks, db, files, artwork
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        files.pictures["/m/a.mp3"] = EmbeddedRead(data=jpeg("red"))
        service.thumbnail(track, "row")
        with db.transaction() as conn:
            conn.execute(
                "UPDATE tracks SET file_path = '/n/a.mp3' WHERE id = ?", (track,)
            )
        files.pictures["/n/a.mp3"] = EmbeddedRead(data=jpeg("blue"))

        image = decoded(service.thumbnail(track, "row"))

        assert image.getpixel((50, 50))[2] > 200
        assert record(artwork, track).checked_path == "/n/a.mp3"

    def test_a_refused_picture_is_recorded_and_never_decoded_again(
        self, service, tracks, db, files, artwork
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        files.pictures["/m/a.mp3"] = EmbeddedRead(data=b"<svg>not allowed</svg>")

        assert service.thumbnail(track, "row") is None
        assert record(artwork, track).embedded_refused == "format"
        with mock.patch.object(module, "decode_image", side_effect=AssertionError):
            assert service.thumbnail(track, "inspector") is None
        assert files.opened == ["/m/a.mp3"]

    def test_a_display_never_fails_because_it_could_not_record(
        self, make_service, artwork, tracks, db, files
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        files.pictures["/m/a.mp3"] = EmbeddedRead(data=jpeg())
        broken = mock.Mock(wraps=artwork)
        broken.record_embedded.side_effect = RuntimeError("database is locked")

        assert make_service(repository=broken).thumbnail(track, "row") is not None


@pytest.mark.unit
class TestBeatportsImage:
    def test_an_accepted_match_shows_beatports_image_from_one_download(
        self, service, tracks, db, activity, web
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        matched(db, tracks, activity, track, "1", art("one"))
        web.images[fetched_url("one")] = jpeg("green")

        assert decoded(service.thumbnail(track, "row")).size == (108, 108)
        assert decoded(service.thumbnail(track, "inspector")).size == (288, 288)

        assert web.fetched == [fetched_url("one")]
        assert web.looked_up == []

    def test_the_files_own_picture_wins(
        self, service, tracks, db, activity, web, files
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        files.pictures["/m/a.mp3"] = EmbeddedRead(data=jpeg())
        matched(db, tracks, activity, track, "1", art("one"))

        assert service.thumbnail(track, "row") is not None
        assert web.fetched == []

    def test_a_match_only_proposed_shows_nothing_and_fetches_nothing(
        self, service, tracks, db, activity, web
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        matched(db, tracks, activity, track, "1", art("one"), score=80.0)

        assert service.thumbnail(track, "row") is None
        assert web.fetched == [] and web.looked_up == []

    def test_a_url_off_beatports_hosts_is_never_fetched(
        self, service, tracks, db, activity, web
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        matched(db, tracks, activity, track, "1", "https://evil.example/a.jpg")

        assert service.thumbnail(track, "row") is None
        assert web.fetched == []

    def test_an_older_attempt_is_looked_up_once_and_remembered(
        self, make_service, tracks, db, activity, web, artwork, cache
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        matched(db, tracks, activity, track, "1", None)
        web.pages[page_of("1")] = art("found")
        web.images[fetched_url("found")] = jpeg()

        assert make_service().thumbnail(track, "row") is not None
        cache.clear()
        assert make_service().thumbnail(track, "row") is not None

        assert web.looked_up == [page_of("1")]
        row = record(artwork, track)
        assert (row.beatport_page, row.beatport_url) == (page_of("1"), art("found"))

    def test_a_page_with_no_image_is_remembered_as_none(
        self, service, tracks, db, activity, web, artwork
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        matched(db, tracks, activity, track, "1", None)
        web.pages[page_of("1")] = ""

        assert service.thumbnail(track, "row") is None
        assert service.thumbnail(track, "row") is None

        assert web.looked_up == [page_of("1")]
        assert web.fetched == []
        assert record(artwork, track).beatport_url == ""

    def test_a_different_accepted_match_is_a_new_question(
        self, service, tracks, db, activity, web
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        matched(db, tracks, activity, track, "1", None)
        web.pages[page_of("1")] = ""
        service.thumbnail(track, "row")

        matched(db, tracks, activity, track, "2", None)
        web.pages[page_of("2")] = art("two")
        web.images[fetched_url("two")] = jpeg()

        assert service.thumbnail(track, "row") is not None
        assert web.looked_up == [page_of("1"), page_of("2")]

    def test_offline_is_empty_and_not_asked_again_until_later(
        self, service, tracks, db, activity, web, clock
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        matched(db, tracks, activity, track, "1", art("one"))

        assert service.thumbnail(track, "row") is None
        assert service.thumbnail(track, "inspector") is None
        assert web.fetched == [fetched_url("one")]

        clock.now += RETRY_FAILED_AFTER_SECONDS
        web.images[fetched_url("one")] = jpeg()
        assert service.thumbnail(track, "row") is not None
        assert len(web.fetched) == 2

    def test_a_page_that_cannot_be_read_records_nothing(
        self, service, tracks, db, activity, web, artwork
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        matched(db, tracks, activity, track, "1", None)

        assert service.thumbnail(track, "row") is None
        assert record(artwork, track).beatport_page is None

    def test_a_refused_image_is_recorded_and_never_fetched_again(
        self, service, tracks, db, activity, web, artwork, clock
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        matched(db, tracks, activity, track, "1", art("one"))
        web.images[fetched_url("one")] = b"<html>an error page</html>"

        assert service.thumbnail(track, "row") is None
        row = record(artwork, track)
        assert (row.beatport_url, row.beatport_refused) == (art("one"), "format")

        clock.now += RETRY_FAILED_AFTER_SECONDS * 2
        assert service.thumbnail(track, "row") is None
        assert web.fetched == [fetched_url("one")]

    def test_a_refused_file_picture_falls_back_to_beatport(
        self, service, tracks, db, activity, web, files
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        files.pictures["/m/a.mp3"] = EmbeddedRead(data=b"garbage")
        matched(db, tracks, activity, track, "1", art("one"))
        web.images[fetched_url("one")] = jpeg()

        assert service.thumbnail(track, "row") is not None
        assert service.thumbnail(track, "row") is not None
        assert files.opened == ["/m/a.mp3"]


# ------------------------------------------------------------------ the gate


@pytest.mark.unit
class TestFetchGate:
    def test_no_more_than_its_workers_run_at_once(self):
        gate = FetchGate(workers=2)
        running, peak, lock = [0], [0], threading.Lock()

        def request() -> bytes:
            with lock:
                running[0] += 1
                peak[0] = max(peak[0], running[0])
            time.sleep(0.02)
            with lock:
                running[0] -= 1
            return b"x"

        threads = [
            threading.Thread(target=gate.run, args=(f"k{n}", request)) for n in range(8)
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        assert peak[0] == 2

    def test_a_success_forgets_an_earlier_failure(self):
        clock = Clock()
        gate = FetchGate(monotonic=clock)
        gate.run("k", lambda: None)
        clock.now += RETRY_FAILED_AFTER_SECONDS

        assert gate.run("k", lambda: b"x") == b"x"
        assert not gate.recently_failed("k")

    def test_the_failure_memory_is_bounded(self):
        gate = FetchGate(memory_limit=2)
        for key in ("a", "b", "c"):
            gate.run(key, lambda: None)

        assert not gate.recently_failed("a")
        assert gate.recently_failed("c")

    @pytest.mark.parametrize("bounds", [dict(workers=0), dict(memory_limit=0)])
    def test_a_gate_needs_positive_bounds(self, bounds):
        with pytest.raises(ValueError):
            FetchGate(**bounds)


@pytest.mark.unit
class TestTheNetworkEdges:
    def test_an_image_off_beatports_hosts_is_not_requested(self):
        with mock.patch("requests.get") as get:
            assert fetch_image("https://evil.example/a.jpg") is None
        get.assert_not_called()

    def test_a_download_is_read_no_further_than_the_cap(self):
        chunk = b"x" * (1024 * 1024)
        served: List[int] = []

        def chunks(_size):
            for number in range(64):
                served.append(number)
                yield chunk

        response = mock.MagicMock(status_code=200)
        response.__enter__.return_value = response
        response.iter_content.side_effect = chunks
        with mock.patch("requests.get", return_value=response) as get:
            data = fetch_image(art("big"))

        assert data is not None and MAX_INPUT_BYTES < len(
            data
        ) <= MAX_INPUT_BYTES + len(chunk)
        assert len(served) < 64
        assert get.call_args.kwargs["allow_redirects"] is False
        assert get.call_args.kwargs["stream"] is True

    @pytest.mark.parametrize("status", [301, 403, 404, 500])
    def test_anything_but_ok_is_no_image(self, status):
        response = mock.MagicMock(status_code=status)
        response.__enter__.return_value = response
        with mock.patch("requests.get", return_value=response):
            assert fetch_image(art("a")) is None

    def test_a_network_error_is_no_image(self):
        with mock.patch("requests.get", side_effect=OSError("offline")):
            assert fetch_image(art("a")) is None

    def test_a_page_lookup_says_url_none_or_unread(self):
        from bs4 import BeautifulSoup

        from cuepoint.data import beatport

        with_art = BeautifulSoup(
            f'<meta property="og:image" content="{art("p")}"/>', "lxml"
        )
        without = BeautifulSoup("<html></html>", "lxml")
        with mock.patch.object(beatport, "request_html", return_value=with_art):
            assert lookup_page_artwork(page_of("1")) == art("p")
        with mock.patch.object(beatport, "request_html", return_value=without):
            assert lookup_page_artwork(page_of("1")) == ""
        with mock.patch.object(beatport, "request_html", return_value=None):
            assert lookup_page_artwork(page_of("1")) is None
        with mock.patch.object(
            beatport, "request_html", side_effect=OSError("offline")
        ):
            assert lookup_page_artwork(page_of("1")) is None


# ------------------------------------------------------------------ scanning


@pytest.mark.unit
class TestScan:
    def test_it_reads_only_present_files_and_counts_every_track(
        self, service, tracks, db, files, artwork
    ):
        ids = add(
            tracks,
            db,
            [
                "/m/pic.mp3",
                "/m/none.mp3",
                "/m/bad.mp3",
                "/m/gone.mp3",
                "/m/unchecked.mp3",
            ],
        )
        checked(db, ids[:3])
        checked(db, [ids[3]], FILE_MISSING)
        files.pictures["/m/pic.mp3"] = EmbeddedRead(data=jpeg())
        files.pictures["/m/bad.mp3"] = EmbeddedRead(error="tags could not be read")

        result = service.scan([*ids, 987_654])

        assert sorted(files.opened) == ["/m/bad.mp3", "/m/none.mp3", "/m/pic.mp3"]
        assert (
            result.total,
            result.present,
            result.none,
            result.unreadable,
            result.not_read,
            result.vanished,
        ) == (6, 1, 1, 1, 2, 1)
        assert record(artwork, ids[0]).embedded == EMBEDDED_PRESENT
        assert record(artwork, ids[1]).embedded == EMBEDDED_NONE
        bad = record(artwork, ids[2])
        assert (bad.embedded, bad.embedded_refused) == (EMBEDDED_UNKNOWN, "tags")
        assert record(artwork, ids[3]) is None

    def test_a_scan_decodes_nothing(self, service, tracks, db, files, cache):
        [track] = add(tracks, db, ["/m/a.mp3"])
        checked(db, [track])
        files.pictures["/m/a.mp3"] = EmbeddedRead(data=b"any bytes at all")

        with mock.patch.object(module, "decode_image", side_effect=AssertionError):
            assert service.scan([track]).present == 1
        assert cache.total_bytes() == 0

    def test_it_is_recorded_once_in_the_activity_feed(self, service, tracks, db):
        ids = add(tracks, db, ["/m/a.mp3", "/m/b.mp3"])
        checked(db, ids)

        service.scan(ids)

        rows = (
            db.connect()
            .execute(
                "SELECT summary FROM activity_events WHERE type = ?",
                (EVENT_ARTWORK_SCANNED,),
            )
            .fetchall()
        )
        assert [row["summary"] for row in rows] == [
            "Read the artwork of 2 files: 0 with a picture, 2 without"
        ]

    def test_an_empty_scan_records_nothing(self, service, db):
        assert service.scan([]).total == 0
        assert (
            db.connect()
            .execute(
                "SELECT COUNT(*) FROM activity_events WHERE type = ?",
                (EVENT_ARTWORK_SCANNED,),
            )
            .fetchone()[0]
            == 0
        )

    def test_it_reports_progress_up_to_the_total(
        self, service, tracks, db, monkeypatch
    ):
        monkeypatch.setattr(module, "SCAN_CHUNK_SIZE", 2)
        ids = add(tracks, db, [f"/m/{n}.mp3" for n in range(5)])
        checked(db, ids[:4])
        seen: List[tuple] = []

        service.scan(ids, on_progress=lambda done, total: seen.append((done, total)))

        assert seen[0] == (1, 5)
        assert seen[-1] == (5, 5)
        assert [done for done, _ in seen] == sorted(done for done, _ in seen)

    def test_cancelling_stops_promptly_and_keeps_the_chunks_it_finished(
        self, service, tracks, db, files, artwork, monkeypatch
    ):
        monkeypatch.setattr(module, "SCAN_CHUNK_SIZE", 2)
        ids = add(tracks, db, [f"/m/{n}.mp3" for n in range(6)])
        checked(db, ids)
        asked = [0]

        def cancel() -> bool:
            asked[0] += 1
            return asked[0] > 1

        result = service.scan(ids, should_cancel=cancel)

        assert result.cancelled and result.completed == 2
        assert len(files.opened) == 2
        assert sum(record(artwork, track) is not None for track in ids) == 2
        assert result.summary_line().startswith(
            "Stopped after reading the artwork of 2 of 6"
        )

    def test_a_rescan_clears_a_refusal_only_when_the_picture_changed(
        self, service, tracks, db, files, artwork
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        checked(db, [track])
        files.pictures["/m/a.mp3"] = EmbeddedRead(data=b"garbage")
        service.thumbnail(track, "row")
        assert record(artwork, track).embedded_refused == "format"

        service.scan([track])
        assert record(artwork, track).embedded_refused == "format"

        files.pictures["/m/a.mp3"] = EmbeddedRead(data=jpeg())
        service.scan([track])
        assert record(artwork, track).embedded_refused is None
        assert service.thumbnail(track, "row") is not None

    def test_it_writes_nothing_but_artwork_and_the_feed(
        self, service, tracks, db, files
    ):
        ids = add(tracks, db, ["/m/a.mp3"])
        checked(db, ids)
        files.pictures["/m/a.mp3"] = EmbeddedRead(data=jpeg())
        before = db.connect().execute("SELECT * FROM tracks").fetchall()

        service.scan(ids)

        assert [tuple(row) for row in db.connect().execute("SELECT * FROM tracks")] == [
            tuple(row) for row in before
        ]

    def test_an_unknown_trigger_is_refused(self, service):
        with pytest.raises(ValueError, match="trigger"):
            service.scan([], trigger="whenever")


@pytest.mark.unit
class TestFetchingOverAScope:
    def test_accepted_tracks_are_fetched_and_counted(
        self, service, tracks, db, activity, web
    ):
        ids = add(tracks, db, ["/m/a.mp3", "/m/b.mp3", "/m/c.mp3", "/m/d.mp3"])
        matched(db, tracks, activity, ids[0], "1", art("one"))
        matched(db, tracks, activity, ids[1], "2", art("two"))
        matched(db, tracks, activity, ids[2], "3", art("three"), score=80.0)
        web.images[fetched_url("one")] = jpeg()
        web.images[fetched_url("two")] = b"not an image"

        result = service.scan(ids, fetch_beatport=True)

        assert (result.fetched, result.refused, result.unreachable) == (1, 1, False)
        assert sorted(web.fetched) == sorted([fetched_url("one"), fetched_url("two")])
        assert "1 Beatport images ready" in result.summary_line()

    def test_an_image_already_cached_is_ready_without_a_download(
        self, service, tracks, db, activity, web
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        matched(db, tracks, activity, track, "1", art("one"))
        web.images[fetched_url("one")] = jpeg()
        service.thumbnail(track, "row")

        assert service.scan([track], fetch_beatport=True).fetched == 1
        assert web.fetched == [fetched_url("one")]

    def test_without_being_asked_it_fetches_nothing(
        self, service, tracks, db, activity, web
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        matched(db, tracks, activity, track, "1", art("one"))

        service.scan([track])

        assert web.fetched == []

    def test_a_page_naming_no_image_is_neither_fetched_nor_refused(
        self, service, tracks, db, activity, web
    ):
        # Found by CLEAN-10's mutation run: nothing held a scan's counts for an
        # accepted match whose page was looked up and named no image.
        [track] = add(tracks, db, ["/m/a.mp3"])
        matched(db, tracks, activity, track, "1", None)
        web.pages[page_of("1")] = ""

        result = service.scan([track], fetch_beatport=True)

        assert (result.fetched, result.refused, result.unreachable) == (0, 0, False)
        assert web.fetched == []

    def test_pages_that_cannot_be_read_count_towards_unreachable(
        self, service, tracks, db, activity, web
    ):
        count = UNREACHABLE_AFTER_FAILURES + 25
        ids = add(tracks, db, [f"/m/{n}.mp3" for n in range(count)])
        for number, track in enumerate(ids):
            matched(db, tracks, activity, track, str(number + 1), None)

        result = service.scan(ids, fetch_beatport=True)

        assert result.unreachable and result.fetched == 0
        assert web.fetched == []

    def test_offline_it_stops_after_failures_in_a_row(
        self, service, tracks, db, activity, web
    ):
        count = UNREACHABLE_AFTER_FAILURES + 25
        ids = add(tracks, db, [f"/m/{n}.mp3" for n in range(count)])
        for number, track in enumerate(ids):
            matched(db, tracks, activity, track, str(number + 1), art(f"n{number}"))

        result = service.scan(ids, fetch_beatport=True)

        assert result.unreachable and not result.cancelled
        assert len(web.fetched) < count
        assert "could not be reached" in result.summary_line()

    def test_one_track_that_raises_does_not_stop_the_fetch(
        self, make_service, artwork, tracks, db, activity, web
    ):
        ids = add(tracks, db, ["/m/a.mp3", "/m/b.mp3"])
        matched(db, tracks, activity, ids[0], "1", art("one"))
        matched(db, tracks, activity, ids[1], "2", art("two"))
        web.images[fetched_url("two")] = jpeg()
        broken = mock.Mock(wraps=artwork)
        real = artwork.accepted_candidate
        broken.accepted_candidate.side_effect = lambda track: (
            (_ for _ in ()).throw(RuntimeError("boom"))
            if track == ids[0]
            else real(track)
        )

        assert (
            make_service(repository=broken).scan(ids, fetch_beatport=True).fetched == 1
        )


@pytest.mark.unit
class TestResolving:
    def test_a_selection_of_library_tracks_is_kept_in_order(self, service, tracks, db):
        ids = add(tracks, db, ["/m/a.mp3", "/m/b.mp3"])

        assert service.resolve(BatchSelection.of_ids([ids[1], 5_555, ids[0]])) == [
            ids[1],
            ids[0],
        ]

    def test_a_selection_of_nothing_is_refused(self, service):
        with pytest.raises(ValueError, match=NOTHING_TO_SCAN):
            service.resolve(BatchSelection.of_ids([5_555]))

    def test_a_query_that_cannot_be_built_is_its_own_error(
        self, db, tracks, artwork, activity, cache
    ):
        service = ArtworkService(
            artwork, tracks, Selections(BrowseQueryError("bad")), activity, db, cache
        )
        with pytest.raises(BrowseQueryError):
            service.resolve(BatchSelection.of_ids([1]))

    def test_a_batch_refusal_reads_as_nothing_to_scan(
        self, db, tracks, artwork, activity, cache
    ):
        service = ArtworkService(
            artwork, tracks, Selections(ValueError("empty")), activity, db, cache
        )
        with pytest.raises(ValueError, match=NOTHING_TO_SCAN):
            service.resolve(BatchSelection.of_ids([1]))

    def test_the_library_is_every_track(self, service, tracks, db):
        ids = add(tracks, db, ["/m/a.mp3", "/m/b.mp3"])
        assert service.library() == ids


@pytest.mark.unit
class TestTheResult:
    def test_it_holds_its_counts_to_what_a_scan_can_produce(self):
        with pytest.raises(ValueError, match="trigger"):
            ArtworkScanResult(trigger="later", total=0)
        with pytest.raises(ValueError, match="below zero"):
            ArtworkScanResult(trigger="request", total=1, present=-1)
        with pytest.raises(ValueError, match="cannot finish"):
            ArtworkScanResult(trigger="request", total=1, present=2)
        with pytest.raises(ValueError, match="every track"):
            ArtworkScanResult(trigger="request", total=2, present=1)
        with pytest.raises(ValueError, match="more images"):
            ArtworkScanResult(
                trigger="request", total=1, present=1, fetched=1, refused=1
            )

    def test_its_summary_says_what_was_found(self):
        result = ArtworkScanResult(
            trigger="import",
            total=1_205,
            present=1_000,
            none=100,
            unreadable=5,
            not_read=100,
        )

        assert result.summary_line() == (
            "Read the artwork of 1,105 files: 1,000 with a picture, 100 without,"
            " 5 unreadable. 100 tracks are not read: their files are not known to be present"
        )
        single = ArtworkScanResult(trigger="request", total=1, not_read=1)
        assert "1 track is not read" in single.summary_line()

    def test_its_answer_is_the_public_shape(self):
        answer = ArtworkScanResult(trigger="refresh", total=3, present=3).to_dict()

        assert set(answer) == {
            "trigger",
            "total",
            "completed",
            "present",
            "none",
            "unreadable",
            "not_read",
            "vanished",
            "fetched",
            "refused",
            "unreachable",
            "cancelled",
            "duration_seconds",
            "summary_line",
        }
        assert answer["completed"] == 3


@pytest.mark.unit
class TestTheEdges:
    def test_a_refusal_of_an_older_image_does_not_block_a_new_one(
        self, service, tracks, db, activity, web
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        matched(db, tracks, activity, track, "1", art("old"))
        web.images[fetched_url("old")] = b"not an image"
        assert service.thumbnail(track, "row") is None

        matched(db, tracks, activity, track, "2", art("new"))
        web.images[fetched_url("new")] = jpeg()

        assert service.thumbnail(track, "row") is not None

    def test_beatports_500_pixel_image_is_the_one_fetched(
        self, service, tracks, db, activity, web
    ):
        [track] = add(tracks, db, ["/m/a.mp3"])
        matched(db, tracks, activity, track, "1", art("one"))

        service.thumbnail(track, "row")

        assert web.fetched == [
            "https://geo-media.beatport.com/image_size/500x500/one.jpg"
        ]

    def test_failures_broken_by_a_success_are_not_unreachable(
        self, service, tracks, db, activity, web
    ):
        count = UNREACHABLE_AFTER_FAILURES * 2
        ids = add(tracks, db, [f"/m/{n}.mp3" for n in range(count)])
        for number, track in enumerate(ids):
            matched(db, tracks, activity, track, str(number + 1), art(f"n{number}"))
            if number % 2:
                web.images[fetched_url(f"n{number}")] = jpeg(size=(120, 120))

        result = service.scan(ids, fetch_beatport=True)

        assert not result.unreachable
        assert result.fetched == count // 2

    def test_a_track_deleted_during_the_scan_is_counted_as_gone(
        self, make_service, artwork, tracks, db
    ):
        ids = add(tracks, db, ["/m/a.mp3", "/m/b.mp3"])
        checked(db, ids)
        real = artwork.present_files

        def then_delete(track_ids):
            found = real(track_ids)
            with db.transaction() as conn:
                conn.execute("DELETE FROM tracks WHERE id = ?", (ids[1],))
            return found

        spy = mock.Mock(wraps=artwork)
        spy.present_files.side_effect = then_delete

        result = make_service(repository=spy).scan(ids)

        assert (result.none, result.vanished, result.completed, result.total) == (
            1,
            1,
            2,
            2,
        )

    def test_a_success_that_ends_after_a_failure_clears_it(self):
        gate = FetchGate(workers=2)
        entered, release = threading.Event(), threading.Event()

        def slow() -> bytes:
            entered.set()
            assert release.wait(10)
            return b"x"

        worker = threading.Thread(target=gate.run, args=("k", slow))
        worker.start()
        assert entered.wait(10)
        assert gate.run("k", lambda: None) is None
        assert gate.recently_failed("k")

        release.set()
        worker.join()

        assert not gate.recently_failed("k")
