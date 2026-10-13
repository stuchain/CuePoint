#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""CLEAN-10's tag write: preview, record, write, restore (DEC-070, DEC-076).

Over a real database and real files copied into a temporary directory — MP3,
AIFF, FLAC and Ogg Vorbis — with Beatport replaced by a recorder, so every claim
is about what ends up in a file and in ``file_writes``:

- **The preview predicts exactly the writes the job makes**, and writes nothing.
- **Every changed field is recorded with what the file held**, before the file
  is touched, and confirmed against what it holds afterwards.
- **Write, then restore, leaves every tag value as it was**, read back with
  mutagen directly.
- **WAV, missing, unreadable, unchecked and unsupported files are skipped with
  their reasons**, and a file that changed since its preview is skipped too.
- **Artwork goes only into a file with none** — including one that gained a
  picture after the preview — and a restore removes exactly that picture.
- **A crash between the record and the write restores cleanly**, and so does
  one between the write and its confirmation.
- **A stale restore skips and reports**, rather than overwriting.
"""

from __future__ import annotations

import io
import os
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest
from mutagen.flac import FLAC, Picture
from mutagen.id3 import APIC, COMM, ID3
from PIL import Image

from tests.unit.key_support import accept_with_key
from cuepoint.data.artwork import inspect_embedded, read_embedded
from cuepoint.data.tag_fields import (
    TAG_FIELDS,
    display_value,
    embed_front_cover,
    picture_hash,
    read_tag_fields,
)
from cuepoint.data.tag_writer import write_key_comment_year_to_file
from cuepoint.models.artwork import EMBEDDED_NONE, EMBEDDED_PRESENT
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.file_status import (
    FILE_MISSING,
    FILE_PRESENT,
    FILE_UNREADABLE,
    TrackFileStatus,
)
from cuepoint.models.file_write import (
    WRITE_FAILED,
    WRITE_RESTORED,
    WRITE_SKIPPED,
    WRITE_WRITTEN,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.artwork_repository import ArtworkRepository
from cuepoint.persistence.file_status_repository import FileStatusRepository
from cuepoint.persistence.file_write_repository import FileWriteRepository
from cuepoint.persistence.match_repository import MatchRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.artwork_cache import ArtworkCache
from cuepoint.services.artwork_service import (
    EMBED_FETCH_SIZE,
    EMBED_MAX_DIMENSION,
    UNREACHABLE_AFTER_FAILURES,
    ArtworkService,
    EmbeddableArtwork,
    FetchGate,
)
from cuepoint.services.batch_service import BatchSelection
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.match_state import MatchStateService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.tag_write_options import TagWriteOptions
from cuepoint.services import tag_write_service as tag_write_module
from cuepoint.services.tag_write_service import (
    ARTWORK_ABSENT,
    EVENT_TAGS_RESTORED,
    EVENT_TAGS_WRITTEN,
    FIELD_ARTWORK,
    KEPT_REASONS,
    FIELD_ARTWORK_UNAVAILABLE,
    FIELD_FILE_HAS_VALUE,
    FIELD_HAS_ARTWORK,
    FIELD_KEY_UNRECOGNIZED,
    FIELD_NO_BEATPORT_ARTWORK,
    FIELD_NO_VALUE,
    FIELD_UNCHANGED,
    NOTHING_TO_RESTORE,
    NOTHING_TO_WRITE,
    SKIP_CHANGED_SINCE_PREVIEW,
    SKIP_MISSING,
    SKIP_NOT_CHECKED,
    SKIP_NOTHING_TO_WRITE,
    SKIP_TAGS_UNREADABLE,
    SKIP_UNREADABLE,
    SKIP_UNSUPPORTED_FORMAT,
    SKIP_VANISHED,
    SKIP_WAV,
    TagRestoreResult,
    TagWritePreview,
    TagWriteResult,
    TagWriteService,
    bpm_text,
    key_text,
)
from tests.fixtures.audio_files import SUPPORTED, audio_copy, jpeg_bytes, tag_dump

NOW = "2026-09-15T12:00:00+00:00"
QUESTION = Track(title="A Title", artist="An Artist")


def art(name: str) -> str:
    return f"https://geo-media.beatport.com/image_size/{{w}}x{{h}}/{name}.jpg"


def embed_url(name: str) -> str:
    return art(name).replace("{w}x{h}", f"{EMBED_FETCH_SIZE}x{EMBED_FETCH_SIZE}")


def big_jpeg(colour: str = "red", size=(1600, 1600)) -> bytes:
    buffer = io.BytesIO()
    image = Image.new("RGB", size, colour)
    exif = Image.Exif()
    exif[0x010F] = "A Camera Maker"
    image.save(buffer, "JPEG", exif=exif.tobytes())
    return buffer.getvalue()


class Crash(BaseException):
    """The engine dying: nothing a job catches."""


class Web:
    """Beatport's images and pages, counting every request."""

    def __init__(self) -> None:
        self.images: Dict[str, Optional[bytes]] = {}
        self.pages: Dict[str, Optional[str]] = {}
        self.fetched: List[str] = []

    def fetch(self, url: str) -> Optional[bytes]:
        self.fetched.append(url)
        return self.images.get(url)

    def lookup(self, page: str) -> Optional[str]:
        return self.pages.get(page)


class Selections:
    def resolve(self, selection: BatchSelection) -> List[int]:
        assert selection.track_ids is not None
        if not selection.track_ids:
            raise ValueError("nothing")
        return list(selection.track_ids)


class World:
    """A library on disk: tracks, their files, checks, overrides and matches."""

    def __init__(self, tmp_path: Path) -> None:
        self.root = tmp_path
        self.music = tmp_path / "music"
        self.db = DatabaseService(db_path=tmp_path / "cuepoint.db")
        MigrationRunner(self.db).migrate()
        self.tracks = TrackRepository(self.db)
        self.statuses = FileStatusRepository(self.db)
        self.artwork = ArtworkRepository(self.db)
        self.writes = FileWriteRepository(self.db)
        self.metadata = TrackMetadataRepository(self.db)
        self.activity = ActivityService(ActivityRepository(self.db), self.tracks)
        self.web = Web()
        self.artwork_service = ArtworkService(
            self.artwork,
            self.tracks,
            Selections(),  # type: ignore[arg-type]
            self.activity,
            self.db,
            ArtworkCache(tmp_path / "thumbnails"),
            gate=FetchGate(),
            fetcher=self.web.fetch,
            page_lookup=self.web.lookup,
            reader=inspect_embedded,
        )

    def service(self, **overrides: Any) -> TagWriteService:
        return TagWriteService(
            self.writes,
            self.statuses,
            self.artwork,
            self.artwork_service,
            Selections(),  # type: ignore[arg-type]
            self.activity,
            self.db,
            **overrides,
        )

    def file(self, kind: str, name: Optional[str] = None) -> Path:
        return audio_copy(self.music, kind, name or f"{uuid.uuid4().hex[:8]}.{kind}")

    def add(
        self, path: Any, checked: Optional[str] = FILE_PRESENT, **fields: Any
    ) -> int:
        rekordbox_id = uuid.uuid4().hex
        self.tracks.add_many(
            [
                LibraryTrack(
                    rekordbox_track_id=rekordbox_id,
                    title="A Title",
                    artist="An Artist",
                    file_path=str(path),
                    **fields,
                )
            ]
        )
        track_id = int(
            self.db.connect()
            .execute(
                "SELECT id FROM tracks WHERE rekordbox_track_id = ?", (rekordbox_id,)
            )
            .fetchone()["id"]
        )
        if fields.get("key"):
            # The key is Beatport's, by an accepted match (PAGES-15), not the
            # one Rekordbox read.
            accept_with_key(self.db, track_id, fields["key"])
        if checked is not None:
            self.check(track_id, checked)
        return track_id

    def check(self, track_id: int, status: str = FILE_PRESENT, path=None) -> None:
        current = self.path_of(track_id) if path is None else str(path)
        size = (
            os.stat(current).st_size
            if status == FILE_PRESENT and os.path.exists(current)
            else None
        )
        with self.db.transaction():
            self.statuses.record(
                [TrackFileStatus(track_id, status, current, NOW, size_bytes=size)]
            )

    def path_of(self, track_id: int) -> str:
        return str(
            self.db.connect()
            .execute("SELECT file_path FROM tracks WHERE id = ?", (track_id,))
            .fetchone()["file_path"]
        )

    def override(self, track_id: int, field: str, value: Any) -> None:
        self.metadata.set_override(track_id, field, value)

    def accept(self, track_id: int, artwork_url: Optional[str], **values: Any) -> None:
        best = BeatportCandidate(
            url=f"https://www.beatport.com/track/a-title/{uuid.uuid4().int % 10**6}",
            title="A Title",
            artists="An Artist",
            label=values.get("label"),
            release_date=None,
            bpm=values.get("bpm"),
            key=values.get("key"),
            genre=values.get("genre"),
            score=97.0,
            title_sim=90,
            artist_sim=90,
            query_index=1,
            query_text="q",
            candidate_index=1,
            base_score=97.0,
            bonus_year=0,
            bonus_key=0,
            guard_ok=True,
            reject_reason="",
            elapsed_ms=1,
            is_winner=False,
            release_year=values.get("year"),
            release_name=None,
            artwork_url=artwork_url,
        )
        result = TrackResult(
            playlist_index=1,
            title="A Title",
            artist="An Artist",
            matched=True,
            best_match=best,
            candidates=[best],
            match_score=97.0,
        )
        matches = MatchRepository(self.db)
        states = MatchStateService(matches, self.tracks, self.activity, self.db)
        states.apply_attempt(matches.add_attempt(track_id, "job", result, QUESTION))

    def options(self, **raw: Any) -> TagWriteOptions:
        return TagWriteOptions.from_request(raw)

    def preview(self, ids, service=None, **raw: Any) -> TagWritePreview:
        return (service or self.service()).preview(
            ids, self.options(**raw), preview_id=f"preview-{uuid.uuid4().hex[:6]}"
        )

    def events(self, event_type: str):
        return self.activity.recent_events(event_type=event_type)


@pytest.fixture
def world(tmp_path):
    made = World(tmp_path)
    yield made
    made.db.close_all()


ALL_FIELDS = dict(write_bpm=True, write_genre=True)
ARTWORK_ONLY = dict(
    write_key=False,
    write_year=False,
    write_label=False,
    write_comment=False,
    embed_missing_artwork=True,
)
VALUES = dict(key="8A", year=2019, label="A Label", bpm=124.5, genre="Tech House")


def skipped_ids(preview: TagWritePreview) -> Dict[str, List[Optional[int]]]:
    return {
        reason: sorted(ref.track_id for ref in refs if ref.track_id is not None)
        for reason, refs in preview.skipped.items()
    }


def prepare_existing_tags(path: Path) -> None:
    """Values a real file carries before CuePoint touches it."""
    write_key_comment_year_to_file(
        str(path), "C", "bought on beatport", "2001", "Old Label", "120", "Old Genre"
    )
    if path.suffix == ".mp3":
        tags = ID3(str(path))
        tags.add(COMM(encoding=1, lang="eng", desc="iTunNORM", text=[" 00000A2B"]))
        tags.save(str(path))


# --------------------------------------------------------------------- values


@pytest.mark.unit
class TestWhatIsWritten:
    @pytest.mark.parametrize(
        "key_format, stored, written",
        [
            ("normal", "8A", "Am"),
            ("normal", "F#", "F#"),
            ("normal", "A min", "Am"),
            ("camelot", "Am", "8A"),
            ("camelot", "8a", "8A"),
            ("short", "G#m", "Abmin"),
            ("short", "C", "Cmaj"),
        ],
    )
    def test_a_key_in_the_chosen_notation(self, key_format, stored, written):
        assert key_text(stored, key_format) == (written, "")

    @pytest.mark.parametrize("key", [None, "", "  "])
    def test_no_key_is_no_value(self, key):
        assert key_text(key, "normal") == (None, FIELD_NO_VALUE)

    def test_a_key_that_is_not_a_key_is_not_written(self):
        assert key_text("Open 1m", "camelot") == (None, FIELD_KEY_UNRECOGNIZED)

    @pytest.mark.parametrize(
        "bpm, text",
        [(128.0, "128"), (124.5, "124.5"), (124.98, "124.98"), (0, None), (None, None)],
    )
    def test_a_bpm_as_a_tag_holds_it(self, bpm, text):
        assert bpm_text(bpm) == text

    def test_the_effective_value_is_written_not_rekordbox_underneath(self, world):
        path = world.file("mp3")
        track = world.add(path, key="C", label="Rekordbox Label")
        world.override(track, "key", "Am")

        preview = world.preview([track], write_comment=False)
        world.service().write(preview, "job-1")

        after = read_tag_fields(path)
        assert display_value(after.value("key")) == "Am"
        assert display_value(after.value("label")) == "Rekordbox Label"

    def test_an_accepted_match_writes_its_key_and_nothing_else(self, world):
        # DEC-070 still holds for every field but the key: accepting a match
        # applies nothing. The key is the match's own (DEC-201).
        path = world.file("flac")
        track = world.add(path)
        world.accept(track, None, key="Gm", label="Beatport Label", year=2020)

        preview = world.preview([track], write_comment=False, **ALL_FIELDS)

        assert [f.fields for f in preview.files] == [("key",)]
        assert preview.field_skipped == {
            name: {FIELD_NO_VALUE: 1} for name in ("year", "label", "bpm", "genre")
        }

    def test_fields_not_written_are_counted_by_reason(self, world):
        path = world.file("mp3")
        write_key_comment_year_to_file(str(path), None, "ok", None, None, None, None)
        track = world.add(path, key="Open 1m", year=2019)

        preview = world.preview([track])

        assert preview.files[0].fields == ("year",)
        assert preview.field_skipped == {
            "key": {FIELD_NO_VALUE: 1},
            "label": {FIELD_NO_VALUE: 1},
            "comment": {FIELD_UNCHANGED: 1},
        }


# -------------------------------------------------------------- the preview


@pytest.mark.unit
class TestThePreviewPredictsTheWrite:
    @pytest.mark.parametrize("kind", SUPPORTED)
    def test_the_write_records_exactly_the_previewed_fields(self, world, kind):
        path = world.file(kind)
        prepare_existing_tags(path)
        track = world.add(path, **VALUES)
        before = read_tag_fields(path)

        preview = world.preview([track], **ALL_FIELDS)
        [planned] = preview.files
        result = world.service().write(preview, "job-1")
        rows = world.writes.for_job("job-1")
        after = read_tag_fields(path)

        assert planned.fields == tuple(TAG_FIELDS)
        assert [row.field for row in rows] == list(planned.fields)
        for row in rows:
            assert (row.outcome, row.pending, row.track_id) == (
                WRITE_WRITTEN,
                False,
                track,
            )
            assert row.old_value == before.value(row.field), row.field
            assert row.new_value == after.value(row.field), row.field
            assert row.new_value == planned.changes[row.field][1], row.field
        assert result.written == 1 and result.fields == {name: 1 for name in TAG_FIELDS}
        assert display_value(after.value("key")) == "Am"
        assert display_value(after.value("bpm")) == "124.5"
        assert display_value(after.value("comment")) == "ok"

    def test_a_preview_after_the_write_finds_nothing_left_to_change(self, world):
        path = world.file("aiff")
        track = world.add(path, **VALUES)
        world.service().write(world.preview([track], **ALL_FIELDS), "job-1")

        again = world.preview([track], **ALL_FIELDS)

        assert again.files == ()
        assert skipped_ids(again) == {SKIP_NOTHING_TO_WRITE: [track]}
        assert again.field_skipped == {
            name: {FIELD_UNCHANGED: 1} for name in TAG_FIELDS
        }

    def test_a_preview_writes_nothing_anywhere(self, world):
        paths = [world.file(kind) for kind in SUPPORTED]
        tracks = [world.add(path, **VALUES) for path in paths]
        world.accept(tracks[0], art("one"))
        world.web.images[embed_url("one")] = big_jpeg()
        before = [path.read_bytes() for path in paths]
        sizes = [world.statuses.get(track).size_bytes for track in tracks]

        preview = world.preview(tracks, embed_missing_artwork=True, **ALL_FIELDS)

        assert len(preview.files) == 4
        assert [path.read_bytes() for path in paths] == before
        assert (
            world.db.connect().execute("SELECT count(*) FROM file_writes").fetchone()[0]
            == 0
        )
        assert [world.statuses.get(track).size_bytes for track in tracks] == sizes

    def test_the_preview_answers_in_path_order_with_its_counts(self, world):
        tracks = [
            world.add(world.file("mp3", name), key="Am") for name in ("b.mp3", "a.mp3")
        ]

        preview = world.preview(tracks, write_comment=False)
        shown = preview.to_dict()

        assert [planned.track_id for planned in preview.files] == [tracks[1], tracks[0]]
        assert shown["files"] == 2 and shown["total"] == 2
        assert shown["fields"]["key"] == 2
        assert shown["changes"][0]["fields"] == {"key": {"from": None, "to": "Am"}}
        assert shown["summary_line"] == "2 files would change: 2 key"
        assert shown["options"]["write_comment"] is False

    def test_a_cancelled_preview_says_so_and_cannot_be_written(self, world):
        track = world.add(world.file("mp3"), key="Am")

        preview = world.service().preview(
            [track], world.options(), preview_id="p", should_cancel=lambda: True
        )

        assert preview.cancelled and preview.files == ()
        with pytest.raises(ValueError, match="cancelled"):
            world.service().write(preview, "job-1")

    def test_a_selection_of_nothing_is_refused(self, world):
        with pytest.raises(ValueError, match=NOTHING_TO_WRITE):
            world.service().resolve(BatchSelection.of_ids([123_456]))
        track = world.add(world.file("mp3"))
        assert world.service().resolve(BatchSelection.of_ids([track, 99_999])) == [
            track
        ]


# -------------------------------------------------------------------- skips


@pytest.mark.unit
class TestSkippedWithReasons:
    def test_every_file_that_is_not_written_says_why(self, world):
        wav = world.add(world.file("wav"), key="Am")
        missing = world.add(world.file("mp3"), checked=FILE_MISSING, key="Am")
        unreadable = world.add(world.file("mp3"), checked=FILE_UNREADABLE, key="Am")
        never = world.add(world.file("mp3"), checked=None, key="Am")
        moved = world.add(world.file("mp3"), checked=None, key="Am")
        world.check(moved, path=world.root / "old" / "moved.mp3")
        m4a = world.add(world.file("m4a"), key="Am")
        no_path = world.add("", checked=None, key="Am")
        noise = world.music / "noise.flac"
        noise.write_bytes(b"not a flac" * 100)
        broken = world.add(noise, key="Am")
        nothing = world.add(world.file("ogg"))
        files = sorted(world.music.iterdir())
        before = {path: path.read_bytes() for path in files}

        preview = world.preview(
            [
                wav,
                missing,
                unreadable,
                never,
                moved,
                m4a,
                no_path,
                broken,
                nothing,
                777_777,
            ],
            write_comment=False,
        )
        result = world.service().write(preview, "job-1")

        assert skipped_ids(preview) == {
            SKIP_WAV: [wav],
            SKIP_MISSING: [missing],
            SKIP_UNREADABLE: [unreadable],
            SKIP_NOT_CHECKED: sorted([never, moved, no_path]),
            SKIP_UNSUPPORTED_FORMAT: [m4a],
            SKIP_TAGS_UNREADABLE: [broken],
            SKIP_NOTHING_TO_WRITE: [nothing],
            SKIP_VANISHED: [777_777],
        }
        assert preview.files == ()
        assert result.total == 0 and result.written == 0
        assert {path: path.read_bytes() for path in files} == before


# ----------------------------------------------------------------- restoring


@pytest.mark.unit
class TestWriteThenRestore:
    @pytest.mark.parametrize("kind", SUPPORTED)
    def test_every_tag_value_is_as_it_was(self, world, kind):
        path = world.file(kind)
        prepare_existing_tags(path)
        track = world.add(path, **VALUES)
        world.accept(track, art("one"))
        world.web.images[embed_url("one")] = big_jpeg()
        dumped = tag_dump(path)

        world.service().write(
            world.preview([track], embed_missing_artwork=True, **ALL_FIELDS), "job-1"
        )
        assert tag_dump(path) != dumped
        written = world.writes.for_job("job-1")
        restored = world.service().restore("restore-1", job_id="job-1")

        assert tag_dump(path) == dumped
        assert (
            restored.total,
            restored.restored,
            restored.skipped,
            restored.failed,
        ) == (
            len(written),
            len(written),
            0,
            0,
        )
        rows = world.writes.for_job("restore-1")
        assert sorted(row.restore_of for row in rows) == sorted(
            row.id for row in written
        )
        assert all(row.outcome == WRITE_RESTORED and not row.pending for row in rows)
        assert world.writes.restorable(job_id="job-1") == []
        with pytest.raises(ValueError, match=NOTHING_TO_RESTORE):
            world.service().restore("restore-2", job_id="job-1")

    def test_a_stale_field_is_skipped_and_reported_and_the_rest_restored(self, world):
        path = world.file("flac")
        track = world.add(path, key="Am", label="A Label")
        world.service().write(world.preview([track], write_comment=False), "job-1")
        write_key_comment_year_to_file(str(path), "Dm", None, None, None, None, None)

        result = world.service().restore("restore-1", job_id="job-1")

        after = read_tag_fields(path)
        assert display_value(after.value("key")) == "Dm"
        assert after.value("label") is None
        assert (result.restored, result.skipped) == (1, 1)
        [problem] = result.problems
        assert problem.field == "key" and "Dm" in problem.message
        skipped = [
            row
            for row in world.writes.for_job("restore-1")
            if row.outcome == WRITE_SKIPPED
        ]
        assert [row.field for row in skipped] == ["key"]
        # Still restorable once the file holds CuePoint's value again.
        assert [row.field for row in world.writes.restorable(job_id="job-1")] == ["key"]

    def test_a_track_is_restored_newest_write_first_back_to_the_original(self, world):
        path = world.file("mp3")
        prepare_existing_tags(path)
        track = world.add(path, key="Am")
        dumped = tag_dump(path)
        world.service().write(world.preview([track], write_comment=False), "job-1")
        world.override(track, "key", "Em")
        world.service().write(world.preview([track], write_comment=False), "job-2")
        assert display_value(read_tag_fields(path).value("key")) == "Em"

        result = world.service().restore("restore-1", track_id=track)

        assert tag_dump(path) == dumped
        assert (result.total, result.restored, result.skipped) == (2, 2, 0)
        rows = world.writes.for_job("restore-1")
        firsts = [world.writes.get(row.restore_of).job_id for row in rows]
        assert firsts == ["job-2", "job-1"]

    def test_restoring_a_job_or_a_track_names_exactly_one(self, world):
        with pytest.raises(ValueError, match="not both or neither"):
            world.service().restore("r", job_id="a", track_id=1)
        with pytest.raises(ValueError, match="not both or neither"):
            world.service().restore("r")

    def test_the_file_of_a_track_deleted_from_the_library_is_still_restored(
        self, world
    ):
        path = world.file("ogg")
        track = world.add(path, key="Am")
        dumped = tag_dump(path)
        world.service().write(world.preview([track]), "job-1")
        with world.db.transaction() as conn:
            conn.execute("DELETE FROM tracks WHERE id = ?", (track,))
        assert all(row.track_id is None for row in world.writes.for_job("job-1"))

        result = world.service().restore("restore-1", job_id="job-1")

        assert result.restored == 2 and tag_dump(path) == dumped


# ------------------------------------------------------------------ crashes


@pytest.mark.unit
class TestACrash:
    def test_after_the_record_and_before_the_write_restores_cleanly(self, world):
        path = world.file("aiff")
        track = world.add(path, **VALUES)
        dumped = tag_dump(path)
        preview = world.preview([track], **ALL_FIELDS)

        def dies(*_args: Any) -> Any:
            raise Crash()

        with pytest.raises(Crash):
            world.service(writer=dies).write(preview, "job-1")

        rows = world.writes.for_job("job-1")
        assert len(rows) == len(TAG_FIELDS)
        assert all(row.pending and row.outcome == WRITE_WRITTEN for row in rows)
        assert tag_dump(path) == dumped

        result = world.service().restore("restore-1", job_id="job-1")

        assert (result.restored, result.already, result.failed) == (6, 6, 0)
        assert tag_dump(path) == dumped
        assert world.writes.restorable(job_id="job-1") == []

    def test_after_the_write_and_before_its_confirmation_restores_the_old_values(
        self, world
    ):
        path = world.file("mp3")
        prepare_existing_tags(path)
        track = world.add(path, **VALUES)
        dumped = tag_dump(path)
        preview = world.preview([track], **ALL_FIELDS)

        def writes_then_dies(*args: Any) -> Any:
            write_key_comment_year_to_file(*args)
            raise Crash()

        with pytest.raises(Crash):
            world.service(writer=writes_then_dies).write(preview, "job-1")
        assert tag_dump(path) != dumped
        assert all(row.pending for row in world.writes.for_job("job-1"))

        result = world.service().restore("restore-1", job_id="job-1")

        assert (result.restored, result.already, result.skipped) == (6, 0, 0)
        assert tag_dump(path) == dumped


# ------------------------------------------------------ changed since preview


@pytest.mark.unit
class TestChangedSinceThePreview:
    def test_an_override_changed_after_the_preview_skips_the_file(self, world):
        path = world.file("mp3")
        track = world.add(path, key="Am")
        preview = world.preview([track], write_comment=False)
        world.override(track, "key", "Em")
        before = path.read_bytes()

        result = world.service().write(preview, "job-1")

        assert result.skipped == {SKIP_CHANGED_SINCE_PREVIEW: 1}
        assert path.read_bytes() == before

    def test_a_field_unchanged_in_the_preview_that_changed_since_skips_the_file(
        self, world
    ):
        path = world.file("mp3")
        write_key_comment_year_to_file(str(path), None, "ok", None, None, None, None)
        track = world.add(path, key="Am")
        preview = world.preview([track])
        assert preview.field_skipped == {
            "year": {FIELD_NO_VALUE: 1},
            "label": {FIELD_NO_VALUE: 1},
            "comment": {FIELD_UNCHANGED: 1},
        }
        world.override(track, "label", "New Label")

        assert world.service().write(preview, "job-1").skipped == {
            SKIP_CHANGED_SINCE_PREVIEW: 1
        }

    def test_a_path_a_refresh_changed_skips_the_file(self, world):
        path = world.file("flac")
        track = world.add(path, key="Am")
        preview = world.preview([track])
        with world.db.transaction() as conn:
            conn.execute(
                "UPDATE tracks SET file_path = ? WHERE id = ?",
                (str(world.file("flac")), track),
            )

        assert world.service().write(preview, "job-1").skipped == {
            SKIP_CHANGED_SINCE_PREVIEW: 1
        }

    @pytest.mark.parametrize(
        "status, reason",
        [(FILE_MISSING, SKIP_MISSING), (FILE_UNREADABLE, SKIP_UNREADABLE)],
    )
    def test_a_file_checked_again_since_is_skipped_for_what_was_found(
        self, world, status, reason
    ):
        track = world.add(world.file("mp3"), key="Am")
        preview = world.preview([track])
        world.check(track, status)

        assert world.service().write(preview, "job-1").skipped == {reason: 1}

    def test_a_track_deleted_since_is_vanished(self, world):
        track = world.add(world.file("mp3"), key="Am")
        preview = world.preview([track])
        with world.db.transaction() as conn:
            conn.execute("DELETE FROM tracks WHERE id = ?", (track,))

        assert world.service().write(preview, "job-1").skipped == {SKIP_VANISHED: 1}

    def test_a_field_the_file_already_holds_is_not_written_again(self, world):
        path = world.file("ogg")
        track = world.add(path, key="Am", label="A Label")
        preview = world.preview([track], write_comment=False)
        write_key_comment_year_to_file(str(path), "Am", None, None, None, None, None)

        result = world.service().write(preview, "job-1")

        assert [row.field for row in world.writes.for_job("job-1")] == ["label"]
        assert result.field_skipped == {"key": {FIELD_UNCHANGED: 1}}
        assert result.written == 1

    def test_a_file_holding_every_value_already_is_nothing_to_write(self, world):
        path = world.file("ogg")
        track = world.add(path, key="Am")
        preview = world.preview([track], write_comment=False)
        write_key_comment_year_to_file(str(path), "Am", None, None, None, None, None)

        assert world.service().write(preview, "job-1").skipped == {
            SKIP_NOTHING_TO_WRITE: 1
        }
        assert world.writes.for_job("job-1") == []


# ------------------------------------------------------------------ artwork


@pytest.mark.unit
class TestArtwork:
    def artworked(self, world, kind="mp3"):
        path = world.file(kind)
        track = world.add(path)
        world.accept(track, art("one"))
        world.web.images[embed_url("one")] = big_jpeg()
        return path, track

    @pytest.mark.parametrize("kind", SUPPORTED)
    def test_beatports_image_goes_into_a_file_with_none_clean_and_bounded(
        self, world, kind
    ):
        path, track = self.artworked(world, kind)

        preview = world.preview([track], **ARTWORK_ONLY)
        assert preview.field_counts[FIELD_ARTWORK] == 1
        result = world.service().write(preview, "job-1")

        data = read_embedded(path)
        assert data is not None
        image = Image.open(io.BytesIO(data))
        assert image.format == "JPEG"
        assert image.size == (EMBED_MAX_DIMENSION, EMBED_MAX_DIMENSION)
        assert len(image.getexif()) == 0
        [row] = world.writes.for_job("job-1")
        assert (row.field, row.old_value, row.pending) == (
            FIELD_ARTWORK,
            ARTWORK_ABSENT,
            False,
        )
        assert row.new_value["sha256"] == picture_hash(data)
        assert result.fields == {FIELD_ARTWORK: 1}
        record = world.artwork.get(track)
        assert (record.embedded, record.embedded_hash) == (
            EMBEDDED_PRESENT,
            picture_hash(data),
        )
        assert world.statuses.get(track).size_bytes == os.stat(path).st_size
        assert world.web.fetched == [embed_url("one")]

        restored = world.service().restore("restore-1", job_id="job-1")

        assert restored.restored == 1 and read_tag_fields(path).pictures == ()
        assert world.artwork.get(track).embedded == EMBEDDED_NONE
        assert world.statuses.get(track).size_bytes == os.stat(path).st_size

    def test_never_into_a_file_that_has_one_and_nothing_is_fetched(self, world):
        path, track = self.artworked(world, "flac")
        embed_front_cover(path, jpeg_bytes("green"), 40, 20)

        preview = world.preview([track], **ARTWORK_ONLY)

        assert preview.files == ()
        assert preview.field_skipped == {FIELD_ARTWORK: {FIELD_HAS_ARTWORK: 1}}
        assert world.web.fetched == []

    def test_never_into_a_file_that_gained_one_after_the_preview(self, world):
        path, track = self.artworked(world, "mp3")
        preview = world.preview([track], **ARTWORK_ONLY)
        theirs = jpeg_bytes("green")
        tags = ID3(str(path)) if path.stat().st_size and _has_id3(path) else ID3()
        tags.add(
            APIC(encoding=3, mime="image/jpeg", type=0, desc="theirs", data=theirs)
        )
        tags.save(str(path))

        result = world.service().write(preview, "job-1")

        assert result.skipped == {SKIP_NOTHING_TO_WRITE: 1}
        assert result.field_skipped == {FIELD_ARTWORK: {FIELD_HAS_ARTWORK: 1}}
        assert read_tag_fields(path).pictures == (picture_hash(theirs),)
        assert world.writes.for_job("job-1") == []

    def test_a_picture_arriving_between_the_last_look_and_the_save_is_not_replaced(
        self, world
    ):
        path, track = self.artworked(world, "flac")
        track_two_path = path
        preview = world.preview([track], **ARTWORK_ONLY)
        service = world.service()
        original = world.artwork_service.embeddable_artwork

        def a_tagger_gets_there_first(track_id: int):
            answer = original(track_id)
            audio = FLAC(str(track_two_path))
            picture = Picture()
            picture.type = 3
            picture.mime = "image/jpeg"
            picture.data = jpeg_bytes("green")
            audio.add_picture(picture)
            audio.save()
            return answer

        world.artwork_service.embeddable_artwork = a_tagger_gets_there_first  # type: ignore[method-assign]

        result = service.write(preview, "job-1")

        [row] = world.writes.for_job("job-1")
        assert (row.outcome, row.pending) == (WRITE_FAILED, False)
        assert "gained a picture" in (row.reason or "")
        assert read_tag_fields(path).pictures == (picture_hash(jpeg_bytes("green")),)
        assert result.failed == 1 and result.written == 0

    def test_an_image_that_cannot_be_fetched_is_skipped_by_the_write(self, world):
        path, track = self.artworked(world, "ogg")
        world.web.images.clear()

        preview = world.preview([track], **ARTWORK_ONLY)
        assert preview.field_counts[FIELD_ARTWORK] == 1
        assert preview.field_skipped == {}
        result = world.service().write(preview, "job-1")

        assert result.skipped == {SKIP_NOTHING_TO_WRITE: 1}
        assert result.field_skipped == {FIELD_ARTWORK: {FIELD_ARTWORK_UNAVAILABLE: 1}}
        assert read_tag_fields(path).pictures == ()

    def test_an_image_the_guard_refuses_is_never_embedded(self, world):
        path, track = self.artworked(world, "mp3")
        tiff = io.BytesIO()
        Image.new("RGB", (40, 40), "red").save(tiff, "TIFF")
        world.web.images[embed_url("one")] = tiff.getvalue()

        preview = world.preview([track], **ARTWORK_ONLY)
        result = world.service().write(preview, "job-1")

        assert result.field_skipped == {FIELD_ARTWORK: {FIELD_ARTWORK_UNAVAILABLE: 1}}
        assert world.artwork.get(track).beatport_refused == "format"
        assert read_tag_fields(path).pictures == ()

    def test_no_accepted_match_has_no_beatport_artwork(self, world):
        track = world.add(world.file("mp3"))

        preview = world.preview([track], **ARTWORK_ONLY)

        assert preview.field_skipped == {FIELD_ARTWORK: {FIELD_NO_BEATPORT_ARTWORK: 1}}

    def test_a_preview_of_many_tracks_never_touches_beatport(self, world):
        tracks = []
        for index in range(60):
            track = world.add(world.file("mp3"))
            world.accept(track, art(f"n{index}"))
            tracks.append(track)

        preview = world.preview(tracks, **ARTWORK_ONLY)

        assert preview.field_counts[FIELD_ARTWORK] == len(tracks)
        assert world.web.fetched == []

    def test_a_different_accepted_image_since_the_preview_skips_the_file(self, world):
        path, track = self.artworked(world, "aiff")
        preview = world.preview([track], **ARTWORK_ONLY)
        world.accept(track, art("two"))

        result = world.service().write(preview, "job-1")

        assert result.skipped == {SKIP_CHANGED_SINCE_PREVIEW: 1}
        assert read_tag_fields(path).pictures == ()

    def test_restoring_removes_our_picture_and_leaves_another(self, world):
        path, track = self.artworked(world, "flac")
        world.service().write(
            world.preview([track], **ARTWORK_ONLY),
            "job-1",
        )
        audio = FLAC(str(path))
        theirs = Picture()
        theirs.type = 0
        theirs.mime = "image/jpeg"
        theirs.data = jpeg_bytes("green")
        audio.add_picture(theirs)
        audio.save()

        result = world.service().restore("restore-1", job_id="job-1")

        assert result.restored == 1
        assert read_tag_fields(path).pictures == (picture_hash(theirs.data),)

    def test_a_picture_replaced_by_another_is_stale(self, world):
        path, track = self.artworked(world, "flac")
        world.service().write(
            world.preview([track], **ARTWORK_ONLY),
            "job-1",
        )
        audio = FLAC(str(path))
        audio.clear_pictures()
        audio.save()
        embed_front_cover(path, jpeg_bytes("green"), 40, 20)

        result = world.service().restore("restore-1", job_id="job-1")

        assert (result.restored, result.skipped) == (0, 1)
        assert result.problems[0].message.startswith(
            "The file's artwork is now a different picture"
        )
        assert read_tag_fields(path).pictures == (picture_hash(jpeg_bytes("green")),)


def _has_id3(path: Path) -> bool:
    try:
        ID3(str(path))
    except Exception:
        return False
    return True


# ----------------------------------------------------------------- failures


@pytest.mark.unit
class TestFailures:
    def test_a_file_that_will_not_take_a_write_fails_and_the_others_are_written(
        self, world
    ):
        locked = world.file("mp3", "a-locked.mp3")
        fine = world.file("mp3", "b-fine.mp3")
        tracks = [world.add(locked, key="Am"), world.add(fine, key="Am")]
        dumped = tag_dump(locked)
        preview = world.preview(tracks, write_comment=False)

        def writer(path: str, *values: Any):
            if path == str(locked):
                return "WRITE_ERROR", "The file is locked by another program"
            return write_key_comment_year_to_file(path, *values)

        result = world.service(writer=writer).write(preview, "job-1")

        assert (result.written, result.failed, result.failed_fields) == (1, 1, 1)
        failed = [
            row for row in world.writes.for_job("job-1") if row.file_path == str(locked)
        ]
        assert [(row.outcome, row.pending, row.reason) for row in failed] == [
            (WRITE_FAILED, False, "The file is locked by another program")
        ]
        assert tag_dump(locked) == dumped
        assert display_value(read_tag_fields(fine).value("key")) == "Am"
        [problem] = result.problems
        assert (problem.file_path, problem.field) == (str(locked), "key")
        # A failed write has nothing to restore.
        assert [row.file_path for row in world.writes.restorable(job_id="job-1")] == [
            str(fine)
        ]

    def test_a_writer_that_raises_is_a_failure_not_a_crash(self, world):
        track = world.add(world.file("mp3"), key="Am")
        preview = world.preview([track], write_comment=False)

        def raises(*_args: Any):
            raise OSError("disk full")

        result = world.service(writer=raises).write(preview, "job-1")

        assert result.failed == 1
        [row] = world.writes.for_job("job-1")
        assert (row.outcome, row.reason) == (WRITE_FAILED, "disk full")

    def test_tags_that_cannot_be_read_at_write_time_fail_the_file(self, world):
        path = world.file("flac")
        track = world.add(path, key="Am")
        preview = world.preview([track], write_comment=False)
        path.write_bytes(b"no longer a flac" * 50)

        result = world.service().write(preview, "job-1")

        assert result.failed == 1 and world.writes.for_job("job-1") == []
        assert "could not be read" in result.problems[0].message

    def test_a_value_that_reads_back_otherwise_is_recorded_as_it_reads(self, world):
        path = world.file("mp3")
        track = world.add(path, key="Am")
        preview = world.preview([track], write_comment=False)

        def writes_another_key(path_: str, *values: Any):
            return write_key_comment_year_to_file(path_, "Bbm", *values[1:])

        result = world.service(writer=writes_another_key).write(preview, "job-1")

        [row] = world.writes.for_job("job-1")
        assert (row.outcome, row.new_value) == (WRITE_WRITTEN, {"TKEY": ["Bbm"]})
        assert result.written == 1
        # And a restore recognises it as CuePoint's.
        assert world.service().restore("restore-1", job_id="job-1").restored == 1
        assert read_tag_fields(path).value("key") is None

    def test_a_restore_that_cannot_read_the_file_fails_every_field(self, world):
        path = world.file("flac")
        track = world.add(path, key="Am", label="L")
        world.service().write(world.preview([track], write_comment=False), "job-1")
        path.write_bytes(b"gone" * 10)

        result = world.service().restore("restore-1", job_id="job-1")

        assert (result.failed, result.restored) == (2, 0)
        rows = world.writes.for_job("restore-1")
        assert {row.outcome for row in rows} == {WRITE_FAILED}
        # Nothing was restored, so it can be restored once the file is back.
        assert len(world.writes.restorable(job_id="job-1")) == 2


# --------------------------------------------------------------- job shape


@pytest.mark.unit
class TestTheJobsAnswer:
    def test_one_event_per_write_and_per_restore_with_counts(self, world):
        tracks = [world.add(world.file("mp3"), key="Am") for _ in range(3)]
        tracks.append(world.add(world.file("wav"), key="Am"))

        world.service().write(world.preview(tracks, write_comment=False), "job-1")
        world.service().restore("restore-1", job_id="job-1")

        [written] = world.events(EVENT_TAGS_WRITTEN)
        assert written.detail["written"] == 3 and written.detail["job_id"] == "job-1"
        assert written.summary == "Wrote tags to 3 files"
        [restored] = world.events(EVENT_TAGS_RESTORED)
        assert (restored.detail["restored"], restored.detail["files"]) == (3, 3)
        assert restored.summary == "Restored 3 fields in 3 files"

    def test_writing_nothing_records_no_event(self, world):
        track = world.add(world.file("wav"), key="Am")

        world.service().write(world.preview([track]), "job-1")

        assert world.events(EVENT_TAGS_WRITTEN) == []

    def test_a_cancel_stops_between_files_and_answers_what_it_did(self, world):
        tracks = [world.add(world.file("mp3"), key="Am") for _ in range(3)]
        preview = world.preview(tracks, write_comment=False)
        asked: List[int] = []

        def cancel_after_one() -> bool:
            asked.append(1)
            return len(asked) > 1

        result = world.service().write(preview, "job-1", should_cancel=cancel_after_one)

        assert (result.cancelled, result.written, result.total) == (True, 1, 3)
        assert result.summary_line().startswith("Stopped after 1 of 3 files")
        assert result.to_dict()["cancelled"] is True

    def test_progress_reaches_its_total(self, world):
        tracks = [world.add(world.file("mp3"), key="Am") for _ in range(3)]
        ticks: List[tuple] = []

        preview = world.service().preview(
            tracks,
            world.options(),
            preview_id="p",
            on_progress=lambda *t: ticks.append(t),
        )
        assert ticks[-1] == (3, 3)
        ticks.clear()
        world.service().write(preview, "job", on_progress=lambda *t: ticks.append(t))
        assert ticks[0] == (0, 3) and ticks[-1] == (3, 3)

    def test_the_answers_hold_their_counts(self):
        with pytest.raises(ValueError, match="accounts for each"):
            TagWriteResult(job_id="j", preview_id="p", total=2, written=1)
        with pytest.raises(ValueError, match="accounts for each"):
            TagRestoreResult(job_id="j", total=2, restored=1)
        with pytest.raises(ValueError, match="do not add up"):
            TagRestoreResult(job_id="j", total=1, restored=0, already=1, cancelled=True)
        with pytest.raises(ValueError, match="Unknown skip reasons"):
            TagWritePreview(
                preview_id="p",
                options=TagWriteOptions.from_request({}),
                total=0,
                skipped={"because": ()},
            )

    def test_a_result_lists_at_most_its_example_limit(self):
        from cuepoint.services.tag_write_service import EXAMPLE_LIMIT, FileProblem

        problems = tuple(FileProblem(n, f"/m/{n}.mp3", "x") for n in range(1, 80))
        result = TagWriteResult(
            job_id="j", preview_id="p", total=79, failed=79, problems=problems
        )
        shown = result.to_dict()
        assert len(shown["problems"]) == EXAMPLE_LIMIT and shown["problems_truncated"]


# ------------------------------------------------------------ second lines


@pytest.mark.unit
class TestTheSecondLines:
    """Checks that sit behind another check, each proved to do its own work.

    Found by mutation testing: each of these could be removed without any test
    above failing, because the check in front of it catches the usual case.
    """

    def artworked(self, world, kind="mp3", key=None):
        path = world.file(kind)
        track = world.add(path)
        world.accept(track, art("one"), key=key)
        world.web.images[embed_url("one")] = big_jpeg()
        return path, track

    def test_beatports_image_is_fetched_at_its_full_1400_pixels(self, world):
        path, track = self.artworked(world)

        world.service().write(world.preview([track], **ARTWORK_ONLY), "job-1")

        assert world.web.fetched == [
            "https://geo-media.beatport.com/image_size/1400x1400/one.jpg"
        ]

    def test_an_image_the_guard_refused_is_not_counted_or_fetched_again(self, world):
        path, track = self.artworked(world)
        tiff = io.BytesIO()
        Image.new("RGB", (40, 40), "red").save(tiff, "TIFF")
        world.web.images[embed_url("one")] = tiff.getvalue()
        world.service().write(world.preview([track], **ARTWORK_ONLY), "job-1")
        fetched = list(world.web.fetched)

        again = world.preview([track], **ARTWORK_ONLY)

        assert world.web.fetched == fetched
        assert again.field_skipped == {FIELD_ARTWORK: {FIELD_NO_BEATPORT_ARTWORK: 1}}

    def test_an_image_that_is_not_the_previewed_artwork_is_not_embedded(self, world):
        path, track = self.artworked(world)
        preview = world.preview([track], **ARTWORK_ONLY)
        real = world.artwork_service.embeddable_artwork

        def another_image(track_id: int) -> EmbeddableArtwork:
            look = real(track_id)
            return EmbeddableArtwork(
                look.status, art("two"), look.jpeg, look.width, look.height
            )

        world.artwork_service.embeddable_artwork = another_image  # type: ignore[method-assign]

        result = world.service().write(preview, "job-1")

        assert result.skipped == {SKIP_NOTHING_TO_WRITE: 1}
        assert result.field_skipped == {FIELD_ARTWORK: {FIELD_ARTWORK_UNAVAILABLE: 1}}
        assert read_tag_fields(path).pictures == ()

    def test_a_file_whose_tags_will_not_take_does_not_receive_a_picture(self, world):
        path, track = self.artworked(world, key="Am")
        preview = world.preview(
            [track],
            write_comment=False,
            write_year=False,
            write_label=False,
            embed_missing_artwork=True,
        )

        result = world.service(writer=lambda *_: ("WRITE_ERROR", "locked")).write(
            preview, "job-1"
        )

        rows = {row.field: row for row in world.writes.for_job("job-1")}
        assert (rows["key"].outcome, rows[FIELD_ARTWORK].outcome) == (
            WRITE_FAILED,
            WRITE_FAILED,
        )
        assert "tags could not be written" in (rows[FIELD_ARTWORK].reason or "")
        assert read_tag_fields(path).pictures == ()
        assert result.failed == 1

    def test_a_picture_that_will_not_come_out_is_a_failed_restore(
        self, world, monkeypatch
    ):
        path, track = self.artworked(world, "ogg")
        world.service().write(world.preview([track], **ARTWORK_ONLY), "job-1")
        monkeypatch.setattr(tag_write_module, "remove_picture", lambda *_: False)

        result = world.service().restore("restore-1", job_id="job-1")

        assert (result.restored, result.failed) == (0, 1)
        [row] = world.writes.for_job("restore-1")
        assert (row.outcome, row.pending) == (WRITE_FAILED, False)
        assert len(read_tag_fields(path).pictures) == 1
        assert len(world.writes.restorable(job_id="job-1")) == 1

    def test_a_crash_during_a_restore_leaves_the_write_restorable(
        self, world, monkeypatch
    ):
        path = world.file("flac")
        track = world.add(path, key="Am")
        dumped = tag_dump(path)
        world.service().write(world.preview([track]), "job-1")
        written = tag_dump(path)

        def dies(*_args: Any) -> None:
            raise Crash()

        monkeypatch.setattr(tag_write_module, "restore_tag_fields", dies)
        with pytest.raises(Crash):
            world.service().restore("restore-1", job_id="job-1")

        assert tag_dump(path) == written
        rows = world.writes.for_job("restore-1")
        assert rows and all(row.pending for row in rows)
        assert len(world.writes.restorable(job_id="job-1")) == 2

        monkeypatch.undo()
        assert world.service().restore("restore-2", job_id="job-1").restored == 2
        assert tag_dump(path) == dumped

    def test_a_file_with_nothing_to_write_is_never_opened(self, world):
        world.music.mkdir(parents=True, exist_ok=True)
        noise = world.music / "noise.flac"
        noise.write_bytes(b"not a flac" * 50)
        track = world.add(noise)
        opened: List[str] = []

        def reader(path: str):
            opened.append(path)
            return read_tag_fields(path)

        preview = world.preview(
            [track], service=world.service(reader=reader), write_comment=False
        )

        assert skipped_ids(preview) == {SKIP_NOTHING_TO_WRITE: [track]}
        assert opened == []


# ------------------------------------------- one preview covers every choice

MIXED = dict(key="8A", year=2019, label="New Label", bpm=124.5, genre="House")
EVERYTHING = dict(write_bpm=True, write_genre=True)


def seed_file(path: Path, state: str) -> None:
    """A file whose tags hold nothing, the values MIXED names, or other ones."""
    if state == "same":
        write_key_comment_year_to_file(
            str(path), "Am", None, "2019", "New Label", "124.5", "House"
        )
    elif state == "different":
        write_key_comment_year_to_file(
            str(path), "C", None, "2001", "Old Label", "120", "Old Genre"
        )


def mixed_library(world) -> Dict[str, int]:
    """An MP3 and a FLAC in each of three states: empty, same and different."""
    tracks: Dict[str, int] = {}
    for kind in ("mp3", "flac"):
        for state in ("empty", "same", "different"):
            path = world.file(kind, f"{state}.{kind}")
            seed_file(path, state)
            tracks[f"{state}.{kind}"] = world.add(path, **MIXED)
    return tracks


class Reads:
    """A tag reader that counts what it is asked to read."""

    def __init__(self) -> None:
        self.paths: List[str] = []

    def __call__(self, path: str):
        self.paths.append(path)
        return read_tag_fields(path)


def label_only(world, **raw: Any) -> TagWriteOptions:
    return world.options(
        write_key=False,
        write_year=False,
        write_label=True,
        write_comment=False,
        **raw,
    )


@pytest.mark.unit
class TestKeepExisting:
    @pytest.mark.parametrize("kind", ["mp3", "flac"])
    def test_a_field_the_file_holds_is_left_and_an_empty_one_is_filled(
        self, world, kind
    ):
        held = world.file(kind, f"held.{kind}")
        write_key_comment_year_to_file(
            str(held), None, None, None, "Old Label", None, None
        )
        empty = world.file(kind, f"empty.{kind}")
        tracks = [world.add(held, **MIXED), world.add(empty, **MIXED)]

        preview = world.preview(tracks, write_comment=False, keep_existing=True)
        result = world.service().write(preview, "job-1")

        by_track = {planned.track_id: planned.fields for planned in preview.files}
        assert by_track == {
            tracks[0]: ("key", "year"),
            tracks[1]: ("key", "year", "label"),
        }
        assert preview.field_skipped == {"label": {FIELD_FILE_HAS_VALUE: 1}}
        assert display_value(read_tag_fields(held).value("label")) == "Old Label"
        assert display_value(read_tag_fields(empty).value("label")) == "New Label"
        assert result.fields["label"] == 1

    def test_it_is_off_unless_asked_and_replaces_as_before(self, world):
        path = world.file("mp3")
        write_key_comment_year_to_file(
            str(path), None, None, None, "Old Label", None, None
        )
        track = world.add(path, **MIXED)

        preview = world.preview([track], write_comment=False)

        assert preview.options.keep_existing is False
        assert preview.files[0].fields == ("key", "year", "label")

    def test_equal_values_are_unchanged_not_held(self, world):
        path = world.file("flac")
        write_key_comment_year_to_file(
            str(path), None, None, None, "New Label", None, None
        )
        track = world.add(path, label="New Label")

        preview = world.preview([track], write_comment=False, keep_existing=True)

        assert preview.field_skipped["label"] == {FIELD_UNCHANGED: 1}

    def test_a_value_that_arrived_after_the_preview_is_left_at_write_time(self, world):
        path = world.file("ogg")
        track = world.add(path, **MIXED)
        preview = world.preview([track], write_comment=False, keep_existing=True)
        assert preview.files[0].fields == ("key", "year", "label")
        write_key_comment_year_to_file(
            str(path), None, None, None, "Theirs", None, None
        )

        result = world.service().write(preview, "job-1")

        assert result.field_skipped == {"label": {FIELD_FILE_HAS_VALUE: 1}}
        assert [row.field for row in world.writes.for_job("job-1")] == ["key", "year"]
        assert display_value(read_tag_fields(path).value("label")) == "Theirs"


@pytest.mark.unit
class TestFieldChoices:
    def test_counts_on_files_that_are_empty_the_same_or_different(self, world):
        tracks = mixed_library(world)

        choices = world.preview(list(tracks.values()), **EVERYTHING).to_dict()[
            "field_choices"
        ]

        for name in ("year", "label", "bpm", "genre"):
            assert choices[name] == {"replace": 2, "fill": 2}, name
        # "same" holds Am: equal in Rekordbox's spelling, different in the others.
        assert choices["key"] == {
            "normal": {"replace": 2, "fill": 2},
            "camelot": {"replace": 4, "fill": 2},
            "short": {"replace": 4, "fill": 2},
        }
        assert set(choices) == {"key", "year", "label", "bpm", "genre", "comment"}
        assert choices["comment"] == {"replace": 0, "fill": 6}

    def test_every_field_is_counted_whatever_the_asked_options_leave_out(self, world):
        tracks = mixed_library(world)

        shown = world.preview(
            list(tracks.values()), write_comment=False, write_label=False
        ).to_dict()

        assert shown["fields"]["label"] == 0
        assert shown["field_choices"]["label"] == {"replace": 2, "fill": 2}
        assert shown["field_choices"]["bpm"] == {"replace": 2, "fill": 2}
        assert "comment" not in shown["field_choices"]
        assert "artwork" not in shown["field_choices"]

    def test_the_existing_outputs_mean_what_they_did(self, world):
        tracks = mixed_library(world)

        shown = world.preview(
            list(tracks.values()), write_comment=False, write_label=False
        ).to_dict()

        # The two "same" files hold everything asked for.
        assert shown["total"] == 6 and shown["files"] == 4
        assert shown["skipped"][SKIP_NOTHING_TO_WRITE]["count"] == 2
        assert shown["fields"]["key"] == 4 and shown["fields"]["year"] == 4
        assert shown["fields"]["bpm"] == 0
        assert shown["field_skipped"] == {
            "key": {FIELD_UNCHANGED: 2},
            "year": {FIELD_UNCHANGED: 2},
        }
        assert shown["summary_line"] == (
            "4 files would change: 4 key, 4 year. 2 files skipped"
        )

    def test_a_file_is_read_once_however_many_choices_it_serves(self, world):
        tracks = mixed_library(world)
        world.accept(tracks["empty.mp3"], art("one"))
        reads = Reads()

        preview = world.preview(
            list(tracks.values()),
            service=world.service(reader=reads),
            embed_missing_artwork=True,
            **EVERYTHING,
        )

        assert len(preview.files) == 6
        assert len(reads.paths) == 6 and len(set(reads.paths)) == 6

    def test_a_file_the_asked_fields_leave_alone_is_still_read_for_the_others(
        self, world
    ):
        path = world.file("mp3")
        track = world.add(path, genre="House")
        reads = Reads()

        preview = world.preview(
            [track], service=world.service(reader=reads), write_comment=False
        )

        assert skipped_ids(preview) == {SKIP_NOTHING_TO_WRITE: [track]}
        assert reads.paths == [str(path)]
        assert preview.to_dict()["field_choices"]["genre"] == {"replace": 0, "fill": 1}

    def test_the_comment_is_a_choice_only_when_it_was_asked(self, world):
        path = world.file("flac")
        write_key_comment_year_to_file(
            str(path), None, "old note", None, None, None, None
        )
        empty = world.file("mp3")
        tracks = [world.add(path, key="Am"), world.add(empty, key="Am")]

        asked = world.preview(tracks, comment_text="reviewed").to_dict()
        not_asked = world.preview(tracks, write_comment=False).to_dict()

        assert asked["field_choices"]["comment"] == {"replace": 1, "fill": 1}
        assert "comment" not in not_asked["field_choices"]

    def test_artwork_counts_files_with_no_picture_that_could_receive_one(self, world):
        bare = world.file("mp3")
        held = world.file("flac")
        embed_front_cover(held, jpeg_bytes("green"), 40, 20)
        none = world.file("ogg")
        tracks = [world.add(bare), world.add(held), world.add(none)]
        world.accept(tracks[0], art("one"))
        world.accept(tracks[1], art("two"))

        shown = world.preview(tracks, **ARTWORK_ONLY).to_dict()

        assert shown["field_choices"]["artwork"] == {"fill": 1}
        assert shown["field_skipped"]["artwork"] == {
            FIELD_HAS_ARTWORK: 1,
            FIELD_NO_BEATPORT_ARTWORK: 1,
        }


@pytest.mark.unit
class TestPlan:
    def test_the_plan_for_the_previews_own_options_is_its_files(self, world):
        tracks = mixed_library(world)
        world.accept(tracks["empty.mp3"], art("one"))
        for raw in (
            dict(**EVERYTHING),
            dict(write_comment=False, key_format="camelot"),
            dict(keep_existing=True, **EVERYTHING),
            dict(embed_missing_artwork=True, keep_existing=True),
        ):
            preview = world.preview(list(tracks.values()), **raw)

            assert preview.plan(preview.options) == preview.files, raw

    def test_a_plan_is_built_without_reading_a_file(self, world):
        tracks = mixed_library(world)
        reads = Reads()
        preview = world.preview(
            list(tracks.values()), service=world.service(reader=reads), **EVERYTHING
        )
        reads.paths.clear()

        preview.plan(world.options(write_genre=True, keep_existing=True))

        assert reads.paths == []

    def test_a_subset_plans_only_those_fields_and_the_files_they_change(self, world):
        tracks = mixed_library(world)
        preview = world.preview(list(tracks.values()), **EVERYTHING)

        planned = preview.plan(
            world.options(
                write_key=False,
                write_year=False,
                write_label=False,
                write_comment=False,
                write_genre=True,
            )
        )

        # "same" files already hold House.
        assert sorted(p.track_id for p in planned) == sorted(
            tracks[name]
            for name in ("empty.mp3", "empty.flac", "different.mp3", "different.flac")
        )
        assert {p.fields for p in planned} == {("genre",)}

    def test_keep_existing_and_the_key_style_are_chosen_at_plan_time(self, world):
        tracks = mixed_library(world)
        preview = world.preview(list(tracks.values()), write_comment=False)

        replacing = preview.plan(
            world.options(write_comment=False, key_format="camelot")
        )
        keeping = preview.plan(
            world.options(write_comment=False, key_format="camelot", keep_existing=True)
        )

        assert {p.values["key"] for p in replacing} == {"8A"}
        assert len(replacing) == 6
        assert sorted(p.track_id for p in keeping) == sorted(
            tracks[name] for name in ("empty.mp3", "empty.flac")
        )
        assert {p.fields for p in keeping} == {("key", "year", "label")}

    def test_options_beyond_what_the_preview_covers_are_refused_by_name(self, world):
        tracks = mixed_library(world)
        preview = world.preview(
            list(tracks.values()), write_comment=False, comment_text="seen"
        )

        assert preview.covers(world.options(write_comment=False, write_genre=True))
        for raw, word in [
            (dict(write_comment=True), "comment"),
            (dict(write_comment=False, embed_missing_artwork=True), "artwork"),
        ]:
            assert preview.covers(world.options(**raw)) is False
            with pytest.raises(ValueError, match=word):
                preview.plan(world.options(**raw))

    def test_a_comment_is_covered_only_with_the_text_the_preview_used(self, world):
        tracks = mixed_library(world)
        preview = world.preview(list(tracks.values()), comment_text="seen")

        assert preview.covers(world.options(comment_text="seen"))
        with pytest.raises(ValueError, match="comment_text"):
            preview.plan(world.options(comment_text="other"))

    def test_artwork_asked_by_the_preview_may_be_dropped_not_added(self, world):
        path = world.file("mp3")
        track = world.add(path)
        world.accept(track, art("one"), key="Am")
        with_art = world.preview(
            [track], embed_missing_artwork=True, write_comment=False
        )
        without = world.preview([track], write_comment=False)

        assert with_art.covers(world.options(write_comment=False))
        assert not without.covers(
            world.options(write_comment=False, embed_missing_artwork=True)
        )
        assert [
            p.fields for p in with_art.plan(world.options(write_comment=False))
        ] == [("key",)]


@pytest.mark.unit
class TestWriteWithOptions:
    def test_a_subset_writes_only_those_fields(self, world):
        tracks = mixed_library(world)
        paths = {name: Path(world.path_of(track)) for name, track in tracks.items()}
        preview = world.preview(list(tracks.values()), **EVERYTHING)
        before = {name: tag_dump(path) for name, path in paths.items()}

        result = world.service().write(
            preview, "job-1", label_only(world, keep_existing=True)
        )

        rows = [
            row for row in world.writes.for_job("job-1") if row.outcome == WRITE_WRITTEN
        ]
        assert {row.field for row in rows} == {"label"}
        assert {row.track_id for row in rows} == {
            tracks["empty.mp3"],
            tracks["empty.flac"],
        }
        assert result.total == 2 and result.written == 2
        assert result.fields["label"] == 2
        for name, path in paths.items():
            if name.startswith("empty"):
                assert display_value(read_tag_fields(path).value("label")) == (
                    "New Label"
                )
            else:
                assert tag_dump(path) == before[name]

    def test_a_key_style_other_than_the_previews_is_written(self, world):
        path = world.file("flac")
        track = world.add(path, key="Am")
        preview = world.preview([track], write_comment=False)

        world.service().write(
            preview, "job-1", world.options(write_comment=False, key_format="camelot")
        )

        assert display_value(read_tag_fields(path).value("key")) == "8A"

    def test_a_write_wider_than_its_preview_is_refused_and_writes_nothing(self, world):
        path = world.file("mp3")
        track = world.add(path, **MIXED)
        preview = world.preview([track], write_comment=False)
        before = path.read_bytes()

        with pytest.raises(ValueError, match="artwork"):
            world.service().write(
                preview,
                "job-1",
                world.options(write_comment=False, embed_missing_artwork=True),
            )

        assert path.read_bytes() == before
        assert world.writes.for_job("job-1") == []

    def test_without_options_it_writes_what_the_preview_planned(self, world):
        path = world.file("mp3")
        track = world.add(path, **MIXED)
        preview = world.preview([track], keep_existing=True, **EVERYTHING)

        result = world.service().write(preview, "job-1", None)

        assert result.total == len(preview.files) == 1
        assert result.fields["genre"] == 1


@pytest.mark.unit
class TestArtworkIsCountedNotFetched:
    def forbid_the_network(self, world, monkeypatch) -> None:
        def refuses(*_args: Any, **_kwargs: Any):
            raise AssertionError("a preview must not fetch artwork")

        for name in ("embeddable_artwork", "beatport_artwork_source", "thumbnail"):
            monkeypatch.setattr(world.artwork_service, name, refuses)
        # Nor may it get as far as the page reader or the gate every request passes.
        monkeypatch.setattr(world.artwork_service, "_lookup_page", refuses)
        monkeypatch.setattr(world.artwork_service._gate, "run", refuses)

    def page_of(self, world, track: int) -> str:
        accepted = world.artwork_service._artwork.accepted_candidate(track)
        assert accepted is not None
        return accepted[0]

    def test_a_preview_calls_no_fetching_method_and_makes_no_request(
        self, world, monkeypatch
    ):
        tracks = []
        for kind in ("mp3", "flac", "ogg"):
            track = world.add(world.file(kind), key="Am")
            world.accept(track, art(kind))
            tracks.append(track)
        world.accept(tracks[2], None)  # a match whose page nobody has read
        self.forbid_the_network(world, monkeypatch)

        preview = world.preview(tracks, embed_missing_artwork=True, write_comment=False)

        assert preview.field_counts[FIELD_ARTWORK] == 3
        assert world.web.fetched == [] and world.web.pages == {}

    def test_a_match_whose_page_was_never_read_is_counted_and_fetched_at_write(
        self, world
    ):
        path = world.file("mp3")
        track = world.add(path)
        world.accept(track, None)
        world.web.pages[self.page_of(world, track)] = art("one")
        world.web.images[embed_url("one")] = big_jpeg()

        preview = world.preview([track], **ARTWORK_ONLY)
        [planned] = preview.files

        assert planned.fields == (FIELD_ARTWORK,)
        assert planned.to_dict()["artwork"] is True
        assert world.web.fetched == []
        result = world.service().write(preview, "job-1")
        assert result.fields == {FIELD_ARTWORK: 1}
        assert len(read_tag_fields(path).pictures) == 1

    def test_the_write_says_when_the_page_names_no_image(self, world):
        path = world.file("flac")
        track = world.add(path)
        world.accept(track, None)
        world.web.pages[self.page_of(world, track)] = "https://example.com/x.jpg"

        preview = world.preview([track], **ARTWORK_ONLY)
        result = world.service().write(preview, "job-1")

        assert preview.field_counts[FIELD_ARTWORK] == 1
        assert result.field_skipped == {FIELD_ARTWORK: {FIELD_NO_BEATPORT_ARTWORK: 1}}
        assert read_tag_fields(path).pictures == ()

    def test_known_artwork_by_what_is_already_recorded(self, world, monkeypatch):
        service = world.artwork_service
        none = world.add(world.file("mp3"))
        by_candidate = world.add(world.file("mp3"))
        read_page = world.add(world.file("mp3"))
        page_without_image = world.add(world.file("mp3"))
        unread = world.add(world.file("mp3"))
        for track, url in [
            (by_candidate, art("one")),
            (read_page, None),
            (page_without_image, None),
            (unread, None),
        ]:
            world.accept(track, url)
        world.artwork.record_beatport(
            read_page, self.page_of(world, read_page), art("two")
        )
        world.artwork.record_beatport(
            page_without_image, self.page_of(world, page_without_image), ""
        )
        self.forbid_the_network(world, monkeypatch)

        assert service.known_beatport_artwork(none) == ("none", None)
        assert service.known_beatport_artwork(by_candidate) == ("ready", art("one"))
        assert service.known_beatport_artwork(read_page) == ("ready", art("two"))
        assert service.known_beatport_artwork(page_without_image) == ("none", None)
        assert service.known_beatport_artwork(unread) == ("unknown", None)
        assert world.web.fetched == []


def written_rows(world, job_id: str):
    return [r for r in world.writes.for_job(job_id) if r.outcome == WRITE_WRITTEN]


def skipped_rows(world, job_id: str):
    return [r for r in world.writes.for_job(job_id) if r.outcome == WRITE_SKIPPED]


@pytest.mark.unit
class TestKeptFieldsAreRecorded:
    """A ticked field not written because the file holds it leaves a skipped row (C29)."""

    def test_unchanged_and_kept_fields_record_what_the_file_holds_and_what_would_go(
        self, world
    ):
        tracks = mixed_library(world)
        by_name = {Path(world.path_of(t)).name: t for t in tracks.values()}
        preview = world.preview(list(tracks.values()), write_comment=False)

        world.service().write(
            preview,
            "job-1",
            world.options(
                write_comment=False, key_format="camelot", keep_existing=True
            ),
        )

        by_file = {}
        for row in skipped_rows(world, "job-1"):
            by_file.setdefault(Path(row.file_path).name, {})[row.field] = row
        assert set(by_file) == {
            "same.mp3",
            "same.flac",
            "different.mp3",
            "different.flac",
        }
        for kind in ("mp3", "flac"):
            written = read_tag_fields(world.music / f"empty.{kind}")
            same = by_file[f"same.{kind}"]
            assert set(same) == {"key", "year", "label"}
            # Equal values are unchanged; Am against camelot's 8A is a kept value.
            assert same["year"].reason == KEPT_REASONS[FIELD_UNCHANGED]
            assert same["year"].old_value == same["year"].new_value
            assert same["key"].reason == KEPT_REASONS[FIELD_FILE_HAS_VALUE]
            assert display_value(same["key"].old_value) == "Am"
            different = by_file[f"different.{kind}"]
            assert set(different) == {"key", "year", "label"}
            assert {r.reason for r in different.values()} == {
                KEPT_REASONS[FIELD_FILE_HAS_VALUE]
            }
            assert display_value(different["key"].old_value) == "C"
            for name in ("key", "year", "label"):
                # What would have gone in is what an empty file received.
                assert different[name].new_value == written.value(name), name
            assert same["key"].new_value == written.value("key")
            for row in (*same.values(), *different.values()):
                assert (row.outcome, row.pending, row.restore_of) == (
                    WRITE_SKIPPED,
                    False,
                    None,
                )
                assert row.track_id == by_name[Path(row.file_path).name]

    def test_files_with_nothing_to_write_get_rows_and_the_write_may_plan_none(
        self, world
    ):
        tracks = {
            name: track
            for name, track in mixed_library(world).items()
            if name.startswith("same")
        }
        preview = world.preview(list(tracks.values()), write_comment=False)
        assert preview.files == ()

        result = world.service().write(
            preview, "job-1", world.options(write_comment=False)
        )

        assert (result.total, result.written) == (0, 0)
        rows = world.writes.for_job("job-1")
        assert {r.outcome for r in rows} == {WRITE_SKIPPED}
        assert sorted((r.track_id, r.field) for r in rows) == sorted(
            (track, name)
            for track in tracks.values()
            for name in ("key", "year", "label")
        )
        [event] = world.events(EVENT_TAGS_WRITTEN)
        assert event.summary == "Marked 6 values as already in the files"
        assert event.detail["kept"] == 6 and event.detail["total"] == 0
        assert event.detail["options"]["write_comment"] is False
        assert "comment_text" not in event.detail["options"]

    def test_restore_ignores_them(self, world):
        tracks = mixed_library(world)
        preview = world.preview(list(tracks.values()), write_comment=False)
        world.service().write(
            preview, "job-1", world.options(write_comment=False, keep_existing=True)
        )
        written = written_rows(world, "job-1")
        assert skipped_rows(world, "job-1") and written

        assert len(world.writes.restorable(job_id="job-1")) == len(written)
        assert world.writes.restorable_counts(job_id="job-1") == (len(written), 0)
        restored = world.service().restore("restore-1", job_id="job-1")
        assert restored.total == len(written) and restored.skipped == 0

    def test_a_job_with_only_skipped_rows_has_nothing_to_restore(self, world):
        tracks = {
            name: track
            for name, track in mixed_library(world).items()
            if name.startswith("same")
        }
        preview = world.preview(list(tracks.values()), write_comment=False)
        world.service().write(preview, "job-1", world.options(write_comment=False))

        assert world.writes.restorable_counts(job_id="job-1") == (0, 0)
        with pytest.raises(ValueError, match=NOTHING_TO_RESTORE):
            world.service().restore("restore-1", job_id="job-1")

    def test_a_write_without_options_records_no_skipped_rows(self, world):
        tracks = mixed_library(world)
        preview = world.preview(list(tracks.values()), keep_existing=True)

        world.service().write(preview, "job-1")

        rows = world.writes.for_job("job-1")
        assert rows and {r.outcome for r in rows} == {WRITE_WRITTEN}

    def test_rows_are_recorded_in_chunks(self, world, monkeypatch):
        tracks = mixed_library(world)
        preview = world.preview(list(tracks.values()), write_comment=False)
        monkeypatch.setattr(tag_write_module, "KEPT_ROWS_CHUNK", 4)
        calls: List[int] = []
        original = world.writes.record

        def counting(rows):
            calls.append(len(rows))
            return original(rows)

        monkeypatch.setattr(world.writes, "record", counting)

        world.service().write(preview, "job-1", world.options(write_comment=False))

        kept = len(skipped_rows(world, "job-1"))
        assert kept > 4
        assert sum(calls) == kept + len(written_rows(world, "job-1"))
        assert max(calls) <= 4 + 3  # a chunk, plus at most one file's fields

    def test_the_written_event_carries_the_options_without_the_comment(self, world):
        track = world.add(world.file("mp3"), key="Am")
        preview = world.preview([track], comment_text="secret note")

        world.service().write(preview, "job-1")

        [event] = world.events(EVENT_TAGS_WRITTEN)
        assert event.detail["options"]["write_key"] is True
        assert event.detail["options"]["keep_existing"] is False
        assert "comment_text" not in event.detail["options"]
        assert "secret note" not in str(event.detail)


@pytest.mark.unit
class TestPreviewAnswersKeepTheirMeaning:
    def test_a_file_that_will_not_read_and_has_nothing_asked_is_nothing_to_write(
        self, world
    ):
        world.music.mkdir(parents=True, exist_ok=True)
        noise = world.music / "noise.flac"
        noise.write_bytes(b"not a flac" * 100)
        broken = world.add(noise, genre="House")
        asked = world.add(world.file("flac", "a.flac"), key="Am")
        quiet = world.add(world.file("mp3", "z.mp3"))
        held = world.file("ogg", "m.ogg")
        write_key_comment_year_to_file(str(held), "Am", None, None, None, None, None)
        late = world.add(held, key="Am")

        preview = world.preview([broken, asked, quiet, late], write_comment=False)

        assert skipped_ids(preview) == {
            SKIP_NOTHING_TO_WRITE: sorted([broken, quiet, late])
        }
        # Files with no value for what was asked come first, as they always did.
        names = [Path(r.file_path).name for r in preview.skipped[SKIP_NOTHING_TO_WRITE]]
        assert names == ["noise.flac", "z.mp3", "m.ogg"]

    def test_a_lookup_that_fails_does_not_count_an_image(self, world, monkeypatch):
        track = world.add(world.file("mp3"))
        world.accept(track, art("one"))

        def fails(_track_id: int):
            raise RuntimeError("the database is busy")

        monkeypatch.setattr(world.artwork_service, "known_beatport_artwork", fails)

        preview = world.preview([track], **ARTWORK_ONLY)

        assert preview.files == ()
        assert preview.field_skipped == {FIELD_ARTWORK: {FIELD_NO_BEATPORT_ARTWORK: 1}}


@pytest.mark.unit
class TestWriteStopsAskingWhenBeatportIsUnreachable:
    def test_artwork_stops_after_a_run_of_failures_and_tags_are_still_written(
        self, world
    ):
        tracks = []
        for index in range(UNREACHABLE_AFTER_FAILURES + 15):
            track = world.add(world.file("mp3"))
            world.accept(track, art(f"n{index}"), key="Am")
            tracks.append(track)

        preview = world.preview(tracks, write_comment=False, embed_missing_artwork=True)
        assert preview.field_counts[FIELD_ARTWORK] == len(tracks)
        result = world.service().write(preview, "job-1")

        assert result.fields["key"] == len(tracks)
        assert result.fields.get(FIELD_ARTWORK, 0) == 0
        assert result.field_skipped[FIELD_ARTWORK] == {
            FIELD_ARTWORK_UNAVAILABLE: len(tracks)
        }
        assert UNREACHABLE_AFTER_FAILURES <= len(world.web.fetched) < len(tracks)


@pytest.mark.unit
class TestKeptRowsOfFilesNotVisited:
    def held_files(self, world):
        return {
            name: track
            for name, track in mixed_library(world).items()
            if name.startswith(("same", "different"))
        }

    def test_a_track_that_changed_since_the_preview_gets_no_row(self, world):
        tracks = self.held_files(world)
        preview = world.preview(list(tracks.values()), write_comment=False)
        with world.db.transaction() as conn:
            conn.execute(
                "UPDATE tracks SET file_path = ? WHERE id = ?",
                (str(world.file("mp3", "elsewhere.mp3")), tracks["same.mp3"]),
            )
        world.override(tracks["different.mp3"], "label", "Changed Label")
        world.check(tracks["same.flac"], FILE_MISSING)

        world.service().write(
            preview, "job-1", world.options(write_comment=False, keep_existing=True)
        )

        assert {r.track_id for r in skipped_rows(world, "job-1")} == {
            tracks["different.flac"]
        }

    def test_a_cancel_stops_recording_before_the_next_chunk(self, world, monkeypatch):
        tracks = self.held_files(world)
        preview = world.preview(list(tracks.values()), write_comment=False)
        monkeypatch.setattr(tag_write_module, "KEPT_ROWS_CHUNK", 1)
        asked: List[int] = []

        def cancel_after_two_looks() -> bool:
            asked.append(1)
            return len(asked) > 2

        result = world.service().write(
            preview,
            "job-1",
            world.options(write_comment=False, keep_existing=True),
            should_cancel=cancel_after_two_looks,
        )

        assert result.cancelled
        recorded_tracks = {r.track_id for r in skipped_rows(world, "job-1")}
        assert len(recorded_tracks) == 2 < len(tracks)
