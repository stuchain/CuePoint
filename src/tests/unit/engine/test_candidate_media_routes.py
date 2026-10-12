#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The candidate media routes: a match candidate's artwork and audio preview.

Over a real engine and database, with the network replaced, so nothing reaches
Beatport:

- ``GET /api/v1/clean/candidates/{id}/artwork?size=`` answers a JPEG at a named
  size, 204 for none, 400 for a missing or unknown size, 404 for an unknown
  candidate.
- ``GET /api/v1/clean/candidates/{id}/preview`` answers ``audio/mpeg`` with its
  length and ``no-store``, 204 for none (offline included), 404 for an unknown
  candidate.
- Both need the token, and neither reaches the clean router's own paths.
"""

from __future__ import annotations

import io
import socket
import urllib.error
import urllib.request
import uuid
from typing import Any, Dict, Optional, Tuple

import pytest
from PIL import Image

from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.services import artwork_service, candidate_preview
from cuepoint.services.candidate_preview import PreviewAudio
from cuepoint.services import database_service as database_service_module
from cuepoint.utils.di_container import get_container, reset_container

TOKEN = "media-token"
AUDIO = b"ID3" + b"\x00" * 100
PAGE = "https://www.beatport.com/track/a-title/{}"
ART = "https://geo-media.beatport.com/image_size/{{w}}x{{h}}/{}.jpg"
SAMPLE = "https://geo-samples.beatport.com/track/{}.LOFI.mp3"


def resolve(interface: Any) -> Any:
    return get_container().resolve(interface)


def jpeg(size=(600, 600)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, "blue").save(buffer, "JPEG")
    return buffer.getvalue()


@pytest.fixture
def library_db(tmp_path, monkeypatch):
    from cuepoint.services.bootstrap import bootstrap_services
    from cuepoint.services.interfaces import IDatabaseService, IMigrationRunner

    db_path = tmp_path / "cuepoint.db"
    monkeypatch.setattr(
        database_service_module, "default_database_path", lambda: db_path
    )
    reset_container()
    bootstrap_services()
    resolve(IMigrationRunner).migrate()
    yield db_path
    resolve(IDatabaseService).close_all()
    reset_container()


@pytest.fixture
def engine(library_db):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        port = int(sock.getsockname()[1])
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
    )
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        thread.join(timeout=2)


class Web:
    """Beatport's images, samples and pages, counting every request."""

    def __init__(self) -> None:
        self.images: Dict[str, Optional[bytes]] = {}
        self.audio: Dict[str, Optional[PreviewAudio]] = {}
        self.pages: Dict[str, Optional[str]] = {}
        self.requested = []
        self.looked_up = []

    def fetch_image(self, url: str) -> Optional[bytes]:
        self.requested.append(url)
        return self.images.get(url)

    def fetch_preview(self, url: str) -> Optional[PreviewAudio]:
        self.requested.append(url)
        return self.audio.get(url)

    def lookup_page(self, page: str) -> Optional[str]:
        self.looked_up.append(page)
        return self.pages.get(page)


@pytest.fixture
def web(library_db, tmp_path, monkeypatch) -> Web:
    """Nothing reaches the network: every fetch and page read is answered here.

    Only the module-level edges are replaced; bootstrap's own registration of
    the artwork service, which builds a service for every request, is kept.
    """
    from cuepoint.services import bootstrap

    web = Web()
    monkeypatch.setattr(bootstrap, "default_artwork_cache_dir", lambda: tmp_path / "t")
    monkeypatch.setattr(artwork_service, "fetch_image", web.fetch_image)
    monkeypatch.setattr(artwork_service, "lookup_page_artwork", web.lookup_page)
    monkeypatch.setattr(candidate_preview, "fetch_preview", web.fetch_preview)
    monkeypatch.setattr(candidate_preview, "lookup_page_preview", lambda page: None)
    return web


def get(base: str, path: str, token: Optional[str] = TOKEN) -> Tuple[int, dict, bytes]:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    request = urllib.request.Request(f"{base}{path}", headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers), exc.read()


def candidate(
    number: str, artwork: Optional[str], preview: Optional[str]
) -> BeatportCandidate:
    return BeatportCandidate(
        url=PAGE.format(number),
        title="A Title",
        artists="An Artist",
        label=None,
        release_date=None,
        bpm=None,
        key=None,
        genre=None,
        score=80.0,
        title_sim=90,
        artist_sim=90,
        query_index=1,
        query_text="q",
        candidate_index=1,
        base_score=80.0,
        bonus_year=0,
        bonus_key=0,
        guard_ok=True,
        reject_reason="",
        elapsed_ms=1,
        is_winner=False,
        release_year=None,
        release_name=None,
        artwork_url=artwork,
        preview_url=preview,
    )


def stored_candidate(
    number: str, artwork: Optional[str] = None, preview: Optional[str] = None
) -> int:
    """Store a track with one attempt whose only candidate is this one; return its id."""
    from cuepoint.persistence.match_repository import MatchRepository
    from cuepoint.services.interfaces import IDatabaseService, ITrackRepository

    tracks = resolve(ITrackRepository)
    tracks.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=f"{uuid.uuid4().hex[:8]}-{number}",
                title="A Title",
                artist="An Artist",
                file_path=f"/m/{number}.mp3",
            )
        ]
    )
    db = resolve(IDatabaseService)
    track_id = int(
        db.connect()
        .execute("SELECT id FROM tracks ORDER BY id DESC LIMIT 1")
        .fetchone()["id"]
    )
    best = candidate(number, artwork, preview)
    result = TrackResult(
        playlist_index=1,
        title="A Title",
        artist="An Artist",
        matched=True,
        best_match=best,
        candidates=[best],
        match_score=80.0,
    )
    MatchRepository(db).add_attempt(
        track_id, "job", result, Track(title="A Title", artist="An Artist")
    )
    row = (
        db.connect()
        .execute(
            "SELECT id FROM match_candidates WHERE url = ?", (PAGE.format(number),)
        )
        .fetchone()
    )
    return int(row["id"])


# ------------------------------------------------------------------ artwork


class TestCandidateArtwork:
    def test_a_candidate_with_artwork_is_a_jpeg_at_the_named_size(self, engine, web):
        cid = stored_candidate("1", artwork=ART.format("one"))
        web.images["https://geo-media.beatport.com/image_size/500x500/one.jpg"] = jpeg()

        status, headers, body = get(
            engine, f"/api/v1/clean/candidates/{cid}/artwork?size=inspector"
        )

        assert status == 200
        assert headers["Content-Type"] == "image/jpeg"
        assert headers["Cache-Control"] == "no-store"
        assert Image.open(io.BytesIO(body)).size == (288, 288)

        status, _, body = get(
            engine, f"/api/v1/clean/candidates/{cid}/artwork?size=row"
        )
        assert status == 200
        assert Image.open(io.BytesIO(body)).size == (108, 108)
        assert len(web.requested) == 1

    def test_no_artwork_is_204_and_empty(self, engine, web):
        cid = stored_candidate("1", artwork=None)

        status, _, body = get(
            engine, f"/api/v1/clean/candidates/{cid}/artwork?size=row"
        )

        assert (status, body) == (204, b"")

    def test_offline_is_204_not_an_error(self, engine, web):
        cid = stored_candidate("1", artwork=ART.format("one"))

        status, _, body = get(
            engine, f"/api/v1/clean/candidates/{cid}/artwork?size=row"
        )

        assert (status, body) == (204, b"")

    def test_an_unknown_candidate_is_404_in_the_error_envelope(self, engine, web):
        status, _, body = get(
            engine, "/api/v1/clean/candidates/987654/artwork?size=row"
        )

        assert status == 404
        assert b"CANDIDATE_NOT_FOUND" in body

    @pytest.mark.parametrize(
        "query", ["", "?size=huge", "?size=row&size=inspector", "?size=../../x"]
    )
    def test_a_missing_or_unknown_size_is_400(self, engine, web, query):
        cid = stored_candidate("1", artwork=ART.format("one"))

        status, _, body = get(engine, f"/api/v1/clean/candidates/{cid}/artwork{query}")

        assert status == 400
        assert b"INVALID_REQUEST" in body
        assert web.requested == []

    def test_no_token_is_401(self, engine, web):
        cid = stored_candidate("1", artwork=ART.format("one"))

        status, _, _ = get(
            engine, f"/api/v1/clean/candidates/{cid}/artwork?size=row", token=None
        )

        assert status == 401
        assert web.requested == []

    def test_a_failure_inside_is_500_with_a_message(self, engine, web):
        from cuepoint.services.interfaces import IArtworkService

        broken = type(
            "Broken", (), {"candidate_thumbnail": lambda self, cid, size: 1 / 0}
        )()
        get_container().register_singleton(IArtworkService, broken)

        status, _, body = get(engine, "/api/v1/clean/candidates/1/artwork?size=row")

        assert status == 500
        assert b"ARTWORK_FAILED" in body

    def test_it_writes_no_track_artwork_row(self, engine, web):
        from cuepoint.services.interfaces import IDatabaseService

        cid = stored_candidate("1", artwork=ART.format("one"))
        web.images["https://geo-media.beatport.com/image_size/500x500/one.jpg"] = jpeg()

        get(engine, f"/api/v1/clean/candidates/{cid}/artwork?size=row")

        rows = (
            resolve(IDatabaseService)
            .connect()
            .execute("SELECT COUNT(*) AS n FROM track_artwork")
            .fetchone()["n"]
        )
        assert rows == 0


# ------------------------------------------------------------------ preview


class TestWhatTheEngineRemembers:
    def test_a_page_is_looked_up_once_across_requests_that_each_build_a_service(
        self, engine, web
    ):
        cid = stored_candidate("1", artwork=None)
        web.pages[PAGE.format("1")] = ART.format("found")
        web.images["https://geo-media.beatport.com/image_size/500x500/found.jpg"] = (
            jpeg()
        )

        first = get(engine, f"/api/v1/clean/candidates/{cid}/artwork?size=row")
        second = get(engine, f"/api/v1/clean/candidates/{cid}/artwork?size=inspector")

        assert (first[0], second[0]) == (200, 200)
        assert web.looked_up == [PAGE.format("1")]

    def test_a_page_with_no_image_is_not_asked_again_by_a_later_request(
        self, engine, web
    ):
        cid = stored_candidate("1", artwork=None)
        web.pages[PAGE.format("1")] = ""

        get(engine, f"/api/v1/clean/candidates/{cid}/artwork?size=row")
        status, _, _ = get(engine, f"/api/v1/clean/candidates/{cid}/artwork?size=row")

        assert status == 204
        assert web.looked_up == [PAGE.format("1")]

    def test_previews_and_artwork_share_one_gate(self, engine, web):
        from cuepoint.services.candidate_preview import shared_preview_service
        from cuepoint.services.interfaces import IArtworkService

        assert shared_preview_service()._gate is resolve(IArtworkService).gate
        assert resolve(IArtworkService).gate is resolve(IArtworkService).gate


class TestCandidatePreview:
    def test_a_candidate_with_a_preview_is_mpeg_with_its_length_and_no_store(
        self, engine, web
    ):
        cid = stored_candidate("1", preview=SAMPLE.format("one"))
        web.audio[SAMPLE.format("one")] = PreviewAudio(AUDIO)

        status, headers, body = get(engine, f"/api/v1/clean/candidates/{cid}/preview")

        assert status == 200
        assert headers["Content-Type"] == "audio/mpeg"
        assert headers["Content-Length"] == str(len(AUDIO))
        assert headers["Cache-Control"] == "no-store"
        assert body == AUDIO

    def test_the_upstream_audio_type_labels_the_answer(self, engine, web):
        cid = stored_candidate("1", preview=SAMPLE.format("one"))
        web.audio[SAMPLE.format("one")] = PreviewAudio(AUDIO, "audio/mp4")

        status, headers, _ = get(engine, f"/api/v1/clean/candidates/{cid}/preview")

        assert (status, headers["Content-Type"]) == (200, "audio/mp4")

    def test_a_second_request_is_served_from_memory(self, engine, web):
        cid = stored_candidate("1", preview=SAMPLE.format("one"))
        web.audio[SAMPLE.format("one")] = PreviewAudio(AUDIO)

        get(engine, f"/api/v1/clean/candidates/{cid}/preview")
        status, _, body = get(engine, f"/api/v1/clean/candidates/{cid}/preview")

        assert (status, body) == (200, AUDIO)
        assert web.requested == [SAMPLE.format("one")]

    def test_no_preview_is_204_and_empty(self, engine, web):
        cid = stored_candidate("1")

        status, _, body = get(engine, f"/api/v1/clean/candidates/{cid}/preview")

        assert (status, body) == (204, b"")

    def test_offline_is_204_not_an_error(self, engine, web):
        cid = stored_candidate("1", preview=SAMPLE.format("one"))

        status, _, body = get(engine, f"/api/v1/clean/candidates/{cid}/preview")

        assert (status, body) == (204, b"")

    def test_an_unknown_candidate_is_404_in_the_error_envelope(self, engine, web):
        status, _, body = get(engine, "/api/v1/clean/candidates/987654/preview")

        assert status == 404
        assert b"CANDIDATE_NOT_FOUND" in body

    def test_no_token_is_401(self, engine, web):
        cid = stored_candidate("1", preview=SAMPLE.format("one"))

        status, _, _ = get(
            engine, f"/api/v1/clean/candidates/{cid}/preview", token=None
        )

        assert status == 401
        assert web.requested == []

    def test_a_path_in_place_of_an_id_is_not_the_route(self, engine, web):
        status, _, body = get(engine, "/api/v1/clean/candidates/..%2Fx/preview")

        assert status != 200
        assert b"audio/mpeg" not in body

    def test_a_failure_inside_is_500_with_a_message(self, engine, web, monkeypatch):
        class Broken:
            def preview(self, candidate_id):
                raise RuntimeError("boom")

        monkeypatch.setattr(
            candidate_preview, "shared_preview_service", lambda: Broken()
        )

        status, _, body = get(engine, "/api/v1/clean/candidates/1/preview")

        assert status == 500
        assert b"PREVIEW_FAILED" in body
