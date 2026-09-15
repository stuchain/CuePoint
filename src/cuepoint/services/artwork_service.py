#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Artwork: what files hold, Beatport's image, and thumbnails to show (CLEAN-09, DEC-076).

Two halves, both read-only towards the user's files.

The file half
-------------
An ``artwork_scan`` reads the picture each present file carries and records
whether it has one and a SHA-256 of it. It reads only files the file check found
present at the path the track has now, so a missing file is never opened, and it
decodes nothing: a scan of fifty thousand files reads tags, and an image is
decoded only when it is shown.

The Beatport half
-----------------
Beatport's image is used for an accepted match only (DEC-076), fetched lazily —
when a track is first shown, or by an explicit fetch over a scope — through one
:class:`FetchGate` for the whole engine, so no more than
:data:`BEATPORT_FETCH_WORKERS` requests are ever in flight, and only from
Beatport's own hosts over HTTPS. A candidate stored before CLEAN-09 has no
artwork URL; its page is read once and what it names is recorded against that
page, including "nothing", so a different accepted match is a new question.

Offline is an empty state, never an error: a failed request is remembered for
:data:`RETRY_FAILED_AFTER_SECONDS` so the same image is not asked for on every
display, and a fetch over a scope stops after :data:`UNREACHABLE_AFTER_FAILURES`
failures in a row rather than spending a timeout on every track.

Showing
-------
:meth:`ArtworkService.thumbnail` answers a track at one of the two named sizes:
the file's own picture first, then Beatport's, then nothing. Every image is
decoded through :mod:`cuepoint.data.artwork_image` and cached at both sizes at
once, so the second size never costs a second read or download. An image the
guard refuses is recorded against the picture or URL it came from and never
decoded again; a different picture or URL is a new question.

What a display learns it records, so the vocabulary and the table converge
without a scan. Those writes are best-effort: a display never fails, or waits
longer than the database's busy timeout, because a job holds the database.
"""

from __future__ import annotations

import hashlib
import logging
import threading
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple, TypeVar

from cuepoint.data.artwork import EmbeddedRead, inspect_embedded
from cuepoint.data.artwork_image import (
    MAX_INPUT_BYTES,
    ArtworkRefused,
    decode_image,
    encode_jpeg,
)
from cuepoint.models.artwork import (
    EMBEDDED_NONE,
    EMBEDDED_PRESENT,
    EMBEDDED_UNKNOWN,
    REFUSED_TAGS,
    TrackArtwork,
)
from cuepoint.models.library_track import utc_now_iso
from cuepoint.persistence.artwork_repository import EmbeddedRecord
from cuepoint.persistence.id_chunks import unique_ids
from cuepoint.persistence.track_query import BrowseQueryError
from cuepoint.services.artwork_cache import ArtworkCache
from cuepoint.services.batch_service import BatchSelection
from cuepoint.services.busy_wait import write_waiting
from cuepoint.services.interfaces import (
    IActivityService,
    IArtworkRepository,
    IArtworkService,
    IBatchService,
    IDatabaseService,
    ITrackRepository,
)

_logger = logging.getLogger(__name__)

T = TypeVar("T")

#: The named thumbnail sizes, in pixels. Each is a layout box at 3×, the largest
#: integer scale, so no scale ever draws a thumbnail bigger than it is: the
#: table row (36 CSS pixels, ``ROW_HEIGHT_FALLBACK``) and the Inspector's
#: artwork box (96 CSS pixels).
SIZE_ROW = "row"
SIZE_INSPECTOR = "inspector"
THUMBNAIL_SIZES: Dict[str, int] = {SIZE_ROW: 36 * 3, SIZE_INSPECTOR: 96 * 3}

#: The side of the Beatport image fetched to make thumbnails from: one of
#: Beatport's own sizes, the smallest above the largest thumbnail.
BEATPORT_FETCH_SIZE = 500

#: Beatport requests for artwork in flight at once, across every display and
#: scan. Well under a match run's candidate workers, so fetching artwork never
#: asks more of Beatport than matching does.
BEATPORT_FETCH_WORKERS = 4

#: Seconds to connect and to read a Beatport image.
BEATPORT_FETCH_TIMEOUT = (5.0, 15.0)

#: How long a failed request is left alone before it is tried again.
RETRY_FAILED_AFTER_SECONDS = 600.0

#: Failed requests remembered at once; the oldest is forgotten first.
FAILURE_MEMORY_LIMIT = 10_000

#: Failures in a row after which a fetch over a scope stops: Beatport cannot be
#: reached, and every further track would only spend a timeout.
UNREACHABLE_AFTER_FAILURES = 20

#: Files read per committed chunk of a scan, threads reading them, and tracks
#: fetched between two looks at the cancel flag.
SCAN_CHUNK_SIZE = 200
SCAN_WORKERS = 8
FETCH_CHUNK_SIZE = BEATPORT_FETCH_WORKERS * 5

#: Recorded once per scan.
EVENT_ARTWORK_SCANNED = "clean.artwork.scanned"

TRIGGER_REQUEST = "request"
TRIGGER_IMPORT = "import"
TRIGGER_REFRESH = "refresh"
TRIGGERS = (TRIGGER_REQUEST, TRIGGER_IMPORT, TRIGGER_REFRESH)

DATABASE_BUSY_PATIENCE_SECONDS = 120.0
_BUSY_RETRY_INTERVAL_SECONDS = 0.05

NOTHING_TO_SCAN = (
    "That selection names no tracks in the library, so there is no artwork to read"
)

#: Downloads an image; returns its bytes, or None when it could not.
ImageFetcher = Callable[[str], Optional[bytes]]

#: Reads a Beatport track page; returns the artwork it names, "" for none, or
#: None when the page could not be read.
PageLookup = Callable[[str], Optional[str]]

#: Reads a file's embedded picture.
EmbeddedReader = Callable[[str], EmbeddedRead]

# What looking at a track's Beatport image came to.
_READY = "ready"
_NO_IMAGE = "none"
_REFUSED = "refused"
_FAILED = "failed"

#: The same answers, for callers outside this module (CLEAN-10).
ARTWORK_READY = _READY
ARTWORK_NONE = _NO_IMAGE
ARTWORK_REFUSED = _REFUSED
ARTWORK_FAILED = _FAILED

#: The side of the Beatport image fetched to embed into a file: Beatport's
#: full-size artwork. The image is re-encoded no larger than
#: :data:`EMBED_MAX_DIMENSION`, so what a file receives is bounded whatever the
#: server sends — a 1400-pixel JPEG is a few hundred kilobytes beside a track of
#: ten megabytes or more, and is the size Beatport's own downloads carry.
EMBED_FETCH_SIZE = 1400
EMBED_MAX_DIMENSION = 1400


def size_pixels(size: str) -> int:
    """The pixels of a named size.

    Raises:
        ValueError: If the size is not one of :data:`THUMBNAIL_SIZES`.
    """
    if not isinstance(size, str) or size not in THUMBNAIL_SIZES:
        raise ValueError(
            f"Artwork comes in the sizes {sorted(THUMBNAIL_SIZES)}, not {size!r}"
        )
    return THUMBNAIL_SIZES[size]


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch_image(url: str) -> Optional[bytes]:
    """Download an image from Beatport, reading no more than the guard allows.

    Returns the bytes — at most one chunk past :data:`MAX_INPUT_BYTES`, so an
    oversized image reaches the guard and is refused as such without being read
    whole — or None when it could not be downloaded. Redirects are not
    followed: an image is fetched from Beatport's hosts or not at all.
    """
    from cuepoint.data.beatport import is_beatport_artwork_url
    from cuepoint.models.config import HEADERS

    if not is_beatport_artwork_url(url):
        return None
    try:
        import requests

        with requests.get(
            url,
            headers=HEADERS,
            timeout=BEATPORT_FETCH_TIMEOUT,
            stream=True,
            allow_redirects=False,
        ) as response:
            if response.status_code != 200:
                return None
            chunks: List[bytes] = []
            received = 0
            for chunk in response.iter_content(64 * 1024):
                chunks.append(chunk)
                received += len(chunk)
                if received > MAX_INPUT_BYTES:
                    break
            return b"".join(chunks)
    except Exception as exc:  # noqa: BLE001 — offline is an empty state
        _logger.debug("[artwork] could not fetch %s: %s", url, exc)
        return None


def lookup_page_artwork(page_url: str) -> Optional[str]:
    """The artwork a Beatport track page names: a URL, "" for none, None if unread."""
    from cuepoint.data.beatport import artwork_url_from_page, request_html

    try:
        soup = request_html(page_url)
    except Exception as exc:  # noqa: BLE001 — offline is an empty state
        _logger.debug("[artwork] could not read %s: %s", page_url, exc)
        return None
    if soup is None:
        return None
    return artwork_url_from_page(soup) or ""


class FetchGate:
    """Every Beatport request made for artwork: bounded, and failures remembered.

    One for the engine, shared by every display and scan, so the bound is a
    bound on CuePoint rather than on one caller.
    """

    def __init__(
        self,
        workers: int = BEATPORT_FETCH_WORKERS,
        retry_after_seconds: float = RETRY_FAILED_AFTER_SECONDS,
        memory_limit: int = FAILURE_MEMORY_LIMIT,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        """Bound requests to ``workers`` at once.

        Raises:
            ValueError: If ``workers`` or ``memory_limit`` is not positive.
        """
        if workers <= 0 or memory_limit <= 0:
            raise ValueError("A fetch gate needs positive bounds")
        self._slots = threading.BoundedSemaphore(workers)
        self._retry_after = float(retry_after_seconds)
        self._limit = int(memory_limit)
        self._monotonic = monotonic
        self._failed: "OrderedDict[str, float]" = OrderedDict()
        self._lock = threading.Lock()

    def recently_failed(self, key: str) -> bool:
        """True while a failure of ``key`` is remembered."""
        with self._lock:
            failed_at = self._failed.get(key)
            if failed_at is None:
                return False
            if self._monotonic() - failed_at >= self._retry_after:
                del self._failed[key]
                return False
            return True

    def run(self, key: str, request: Callable[[], Optional[T]]) -> Optional[T]:
        """Make ``request`` in a slot, unless ``key`` failed recently.

        A request that answers None failed, and is remembered as such.
        """
        if self.recently_failed(key):
            return None
        with self._slots:
            answer = request()
        with self._lock:
            if answer is None:
                self._failed[key] = self._monotonic()
                self._failed.move_to_end(key)
                while len(self._failed) > self._limit:
                    self._failed.popitem(last=False)
            else:
                self._failed.pop(key, None)
        return answer


@dataclass(frozen=True)
class _BeatportLook:
    status: str
    images: Dict[int, bytes] = field(default_factory=dict)


@dataclass(frozen=True)
class EmbeddableArtwork:
    """Beatport's image for a track, ready to embed, or why it is not.

    Attributes:
        status: :data:`ARTWORK_READY`, :data:`ARTWORK_NONE`,
            :data:`ARTWORK_REFUSED` or :data:`ARTWORK_FAILED`.
        source_url: The accepted match's artwork URL, when it has one.
        jpeg: The re-encoded image, when ready.
        width, height: Its size, when ready.
    """

    status: str
    source_url: Optional[str] = None
    jpeg: Optional[bytes] = None
    width: int = 0
    height: int = 0

    @property
    def ready(self) -> bool:
        """True when there is an image to embed."""
        return self.status == _READY and self.jpeg is not None


@dataclass(frozen=True)
class ArtworkScanResult:
    """What one scan read.

    Attributes:
        trigger: One of :data:`TRIGGERS`.
        total: Tracks the scan was asked about.
        present, none: Files read that carry a picture, and that carry none.
        unreadable: Files whose tags could not be read.
        not_read: Tracks whose file is not known to be present, so not opened.
        vanished: Tracks that left the library before their row was written.
        fetched: Beatport images ready to show, when asked to fetch.
        refused: Beatport images the guard refused, when asked to fetch.
        unreachable: Whether the fetch stopped because Beatport could not be
            reached. The files were still read.
        cancelled: Whether a cancel stopped it.
        duration_seconds: How long it took.
    """

    trigger: str
    total: int
    present: int = 0
    none: int = 0
    unreadable: int = 0
    not_read: int = 0
    vanished: int = 0
    fetched: int = 0
    refused: int = 0
    unreachable: bool = False
    cancelled: bool = False
    duration_seconds: float = 0.0

    def __post_init__(self) -> None:
        """Hold the counts to what a scan can produce."""
        if self.trigger not in TRIGGERS:
            raise ValueError(f"trigger must be one of {TRIGGERS}, got {self.trigger!r}")
        counts = (
            self.total,
            self.present,
            self.none,
            self.unreadable,
            self.not_read,
            self.vanished,
            self.fetched,
            self.refused,
        )
        if any(count < 0 for count in counts):
            raise ValueError("An artwork scan cannot count below zero")
        if self.completed > self.total:
            raise ValueError(
                f"An artwork scan of {self.total} tracks cannot finish {self.completed}"
            )
        if not self.cancelled and self.completed != self.total:
            raise ValueError("A scan that was not cancelled accounts for every track")
        if self.fetched + self.refused > self.total:
            raise ValueError("A scan cannot fetch more images than it has tracks")

    @property
    def read(self) -> int:
        """Files whose tags were read or tried."""
        return self.present + self.none + self.unreadable

    @property
    def completed(self) -> int:
        """Tracks the scan accounted for."""
        return self.read + self.not_read + self.vanished

    def summary_line(self) -> str:
        """The activity feed's sentence."""
        head = (
            f"Stopped after reading the artwork of {self.read:,} of {self.total:,} tracks"
            if self.cancelled
            else f"Read the artwork of {self.read:,} files"
        )
        parts = [f"{self.present:,} with a picture", f"{self.none:,} without"]
        if self.unreadable:
            parts.append(f"{self.unreadable:,} unreadable")
        line = f"{head}: {', '.join(parts)}"
        if self.not_read:
            are = "is" if self.not_read == 1 else "are"
            noun = "track" if self.not_read == 1 else "tracks"
            line += (
                f". {self.not_read:,} {noun} {are} not read: their files are not"
                " known to be present"
            )
        if self.fetched:
            line += f". {self.fetched:,} Beatport images ready"
        if self.refused:
            line += f". {self.refused:,} Beatport images unreadable"
        if self.unreachable:
            line += (
                ". Beatport could not be reached, so its images were not all fetched"
            )
        return line

    def to_dict(self) -> Dict[str, Any]:
        """The job's answer. A public shape; extend rather than rename."""
        return {
            "trigger": self.trigger,
            "total": self.total,
            "completed": self.completed,
            "present": self.present,
            "none": self.none,
            "unreadable": self.unreadable,
            "not_read": self.not_read,
            "vanished": self.vanished,
            "fetched": self.fetched,
            "refused": self.refused,
            "unreachable": self.unreachable,
            "cancelled": self.cancelled,
            "duration_seconds": round(self.duration_seconds, 3),
            "summary_line": self.summary_line(),
        }


class ArtworkService(IArtworkService):
    """Reads artwork, fetches Beatport's, and makes the thumbnails CuePoint shows."""

    def __init__(
        self,
        artwork_repository: IArtworkRepository,
        track_repository: ITrackRepository,
        batch_service: IBatchService,
        activity_service: Optional[IActivityService],
        database_service: IDatabaseService,
        cache: ArtworkCache,
        *,
        gate: Optional[FetchGate] = None,
        fetcher: ImageFetcher = fetch_image,
        page_lookup: PageLookup = lookup_page_artwork,
        reader: EmbeddedReader = inspect_embedded,
        clock: Callable[[], str] = utc_now_iso,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        """Store collaborators.

        ``fetcher``, ``page_lookup`` and ``reader`` are where the service meets
        the network and the files; tests replace them, so no test reaches
        Beatport. ``gate`` is shared by every service the engine makes.
        """
        self._artwork = artwork_repository
        self._tracks = track_repository
        self._batch = batch_service
        self._activity = activity_service
        self._db = database_service
        self._cache = cache
        self._gate = gate if gate is not None else FetchGate()
        self._fetch_image = fetcher
        self._lookup_page = page_lookup
        self._read = reader
        self._clock = clock
        self._monotonic = monotonic

    # ---------------------------------------------------------------- show

    def thumbnail(self, track_id: int, size: str) -> Optional[bytes]:
        """A track's artwork as a JPEG at a named size, or None when it has none.

        Raises:
            ValueError: If the size is not a named size.
            LookupError: If there is no such track.
        """
        pixels = size_pixels(size)
        track = self._tracks.get(int(track_id))
        if track is None:
            raise LookupError(f"There is no track {track_id} in the library")
        record = self._artwork.get(int(track_id))
        image = self._embedded_thumbnail(int(track_id), track.file_path, record, pixels)
        if image is not None:
            return image
        return self._beatport(int(track_id), record, pixels).images.get(pixels)

    def _embedded_thumbnail(
        self,
        track_id: int,
        file_path: Optional[str],
        record: Optional[TrackArtwork],
        pixels: int,
    ) -> Optional[bytes]:
        current = (
            record
            if record is not None and not record.is_stale_for(file_path)
            else None
        )
        if current is not None:
            if (
                current.embedded_refused is not None
                or current.embedded == EMBEDDED_NONE
            ):
                return None
            if current.embedded == EMBEDDED_PRESENT and current.embedded_hash:
                cached = self._cache.get(current.embedded_hash, pixels)
                if cached is not None:
                    return cached
        if not file_path or self._artwork.file_is_present(track_id) is False:
            # A file the check found missing or unreadable is never opened.
            return None
        read = self._read(file_path)
        if not read.readable:
            # Counted by a scan, which records it; a display only shows nothing.
            return None
        key = _sha256(read.data) if read.data is not None else None
        learned = EMBEDDED_PRESENT if key is not None else EMBEDDED_NONE
        if (
            current is None
            or current.embedded != learned
            or current.embedded_hash != key
        ):
            entry = self._record_for(track_id, file_path, read)
            self._write_quietly(lambda: self._artwork.record_embedded([entry]))
        if read.data is None or key is None:
            return None
        cached = self._cache.get(key, pixels)
        if cached is not None:
            return cached
        try:
            made = self._store_thumbnails(key, read.data)
        except ArtworkRefused as refused:
            reason, picture = refused.reason, key
            _logger.info(
                "[artwork] track %s: the file's picture is unreadable (%s)",
                track_id,
                reason,
            )
            self._write_quietly(
                lambda: self._artwork.refuse_embedded(track_id, picture, reason)
            )
            return None
        return made[pixels]

    def _accepted_artwork(
        self, track_id: int, record: Optional[TrackArtwork]
    ) -> Tuple[str, Optional[str], Optional[str]]:
        """``(status, page, artwork URL)`` for a track's accepted match.

        Reads the candidate's own URL, else what its page was found to name,
        else reads the page once and records the answer. Fetches no image.
        """
        from cuepoint.data.beatport import is_beatport_artwork_url

        accepted = self._artwork.accepted_candidate(track_id)
        if accepted is None:
            return _NO_IMAGE, None, None
        page_url, candidate_artwork = accepted
        if candidate_artwork:
            artwork = candidate_artwork
        elif (
            record is not None
            and record.beatport_page == page_url
            and record.beatport_url is not None
        ):
            artwork = record.beatport_url
        else:
            looked = self._gate.run(
                f"page:{page_url}", lambda: self._lookup_page(page_url)
            )
            if looked is None:
                return _FAILED, page_url, None
            self._write_quietly(
                lambda: self._artwork.record_beatport(track_id, page_url, looked)
            )
            artwork = looked
        if not is_beatport_artwork_url(artwork):
            return _NO_IMAGE, page_url, None
        return _READY, page_url, artwork

    def _beatport(
        self, track_id: int, record: Optional[TrackArtwork], pixels: Optional[int]
    ) -> _BeatportLook:
        """Look at a track's Beatport image, fetching it if it is not cached.

        ``pixels`` is the size wanted; None wants every size, as a scan does.
        """
        from cuepoint.data.beatport import artwork_url_at_size

        status, page_url, artwork = self._accepted_artwork(track_id, record)
        if status != _READY or page_url is None or artwork is None:
            return _BeatportLook(status)
        if (
            record is not None
            and record.beatport_refused is not None
            and record.beatport_url == artwork
        ):
            return _BeatportLook(_REFUSED)

        source = artwork_url_at_size(artwork, BEATPORT_FETCH_SIZE)
        key = _sha256(source.encode("utf-8"))
        wanted = (
            [pixels] if pixels is not None else sorted(set(THUMBNAIL_SIZES.values()))
        )
        cached = {size: self._cache.get(key, size) for size in wanted}
        if all(image is not None for image in cached.values()):
            return _BeatportLook(
                _READY,
                {size: image for size, image in cached.items() if image is not None},
            )
        data = self._gate.run(f"image:{source}", lambda: self._fetch_image(source))
        if data is None:
            return _BeatportLook(_FAILED)
        try:
            made = self._store_thumbnails(key, data)
        except ArtworkRefused as refused:
            reason, image_url = refused.reason, artwork
            _logger.info(
                "[artwork] track %s: Beatport's image is unreadable (%s)",
                track_id,
                reason,
            )
            self._write_quietly(
                lambda: self._artwork.record_beatport(
                    track_id, page_url, image_url, refused=reason
                )
            )
            return _BeatportLook(_REFUSED)
        return _BeatportLook(_READY, made)

    # ---------------------------------------------------------------- embed

    def beatport_artwork_source(self, track_id: int) -> Tuple[str, Optional[str]]:
        """``(status, artwork URL)`` of a track's accepted match, fetching no image.

        ``ready`` with the URL; ``none`` when there is no accepted match or its
        page names no Beatport image; ``failed`` when the page could not be read.
        """
        status, _page, artwork = self._accepted_artwork(
            int(track_id), self._artwork.get(int(track_id))
        )
        return status, artwork

    def embeddable_artwork(self, track_id: int) -> EmbeddableArtwork:
        """Beatport's image for a track, as a clean, bounded JPEG to embed (CLEAN-10).

        Fetched now — the cache holds thumbnails only — at
        :data:`EMBED_FETCH_SIZE`, through the same gate and the same guard as a
        thumbnail, and re-encoded no larger than :data:`EMBED_MAX_DIMENSION` with
        no metadata. What goes into a user's file is never the bytes a server
        returned (DEC-076). Never raises for an image; a refusal is recorded as
        a thumbnail's is.
        """
        from cuepoint.data.beatport import artwork_url_at_size

        record = self._artwork.get(int(track_id))
        status, page_url, artwork = self._accepted_artwork(int(track_id), record)
        if status != _READY or page_url is None or artwork is None:
            return EmbeddableArtwork(status)
        if (
            record is not None
            and record.beatport_refused is not None
            and record.beatport_url == artwork
        ):
            return EmbeddableArtwork(_REFUSED, artwork)
        source = artwork_url_at_size(artwork, EMBED_FETCH_SIZE)
        data = self._gate.run(f"image:{source}", lambda: self._fetch_image(source))
        if data is None:
            return EmbeddableArtwork(_FAILED, artwork)
        try:
            image = decode_image(data)
        except ArtworkRefused as refused:
            reason, image_url = refused.reason, artwork
            _logger.info(
                "[artwork] track %s: Beatport's image is unreadable (%s)",
                track_id,
                reason,
            )
            self._write_quietly(
                lambda: self._artwork.record_beatport(
                    int(track_id), page_url, image_url, refused=reason
                )
            )
            return EmbeddableArtwork(_REFUSED, artwork)
        image.thumbnail((EMBED_MAX_DIMENSION, EMBED_MAX_DIMENSION))
        width, height = image.size
        return EmbeddableArtwork(
            _READY, artwork, encode_jpeg(image), int(width), int(height)
        )

    def _store_thumbnails(self, key: str, data: bytes) -> Dict[int, bytes]:
        """Decode once through the guard and cache every named size."""
        image = decode_image(data)
        made: Dict[int, bytes] = {}
        for pixels in sorted(set(THUMBNAIL_SIZES.values()), reverse=True):
            copy = image.copy()
            copy.thumbnail((pixels, pixels))
            made[pixels] = encode_jpeg(copy)
            self._cache.put(key, pixels, made[pixels])
        return made

    def _write_quietly(self, work: Callable[[], object]) -> None:
        """Record what a display learned, if the database lets it now."""
        try:
            with self._db.transaction():
                work()
        except Exception as exc:  # noqa: BLE001 — a display never fails on a write
            _logger.debug("[artwork] could not record what a display found: %s", exc)

    # ---------------------------------------------------------------- scan

    def resolve(self, selection: BatchSelection) -> List[int]:
        """The library tracks a selection names.

        Raises:
            ValueError: If it names none.
            BrowseQueryError: If a query selection cannot be built.
        """
        try:
            named = self._batch.resolve(selection)
        except BrowseQueryError:
            raise
        except ValueError:
            raise ValueError(NOTHING_TO_SCAN) from None
        found = self._artwork.existing(named)
        if not found:
            raise ValueError(NOTHING_TO_SCAN)
        return found

    def library(self) -> List[int]:
        """Every library track, which may be none."""
        return self._artwork.library_ids()

    def scan(
        self,
        track_ids: Sequence[int],
        *,
        trigger: str = TRIGGER_REQUEST,
        fetch_beatport: bool = False,
        on_progress: Optional[Callable[[int, int], None]] = None,
        should_cancel: Optional[Callable[[], bool]] = None,
    ) -> ArtworkScanResult:
        """Read each present file's picture, and optionally fetch Beatport's images.

        Raises:
            ValueError: If the trigger is unknown.
        """
        if trigger not in TRIGGERS:
            raise ValueError(f"trigger must be one of {TRIGGERS}, got {trigger!r}")
        started = self._monotonic()
        wanted = unique_ids(track_ids)
        total = len(wanted)
        existing = self._artwork.existing(wanted)
        files = self._artwork.present_files(existing)
        counts = {"present": 0, "none": 0, "unreadable": 0, "fetched": 0, "refused": 0}
        vanished = total - len(existing)
        not_read = len(existing) - len(files)
        completed = vanished + not_read
        cancelled = False
        unreachable = False
        _report(on_progress, completed, total)

        with ThreadPoolExecutor(
            max_workers=SCAN_WORKERS, thread_name_prefix="artwork-scan"
        ) as pool:
            for start in range(0, len(files), SCAN_CHUNK_SIZE):
                if should_cancel is not None and should_cancel():
                    cancelled = True
                    break
                chunk = files[start : start + SCAN_CHUNK_SIZE]
                reads = list(pool.map(lambda item: self._read(item[1]), chunk))
                records = [
                    self._record_for(track_id, path, read)
                    for (track_id, path), read in zip(chunk, reads)
                ]
                written = write_waiting(
                    self._db,
                    lambda: self._artwork.record_embedded(records),
                    patience_seconds=DATABASE_BUSY_PATIENCE_SECONDS,
                    interval_seconds=_BUSY_RETRY_INTERVAL_SECONDS,
                )
                for record in records:
                    if record.track_id not in written:
                        vanished += 1
                    elif record.refused == REFUSED_TAGS:
                        counts["unreadable"] += 1
                    elif record.embedded == EMBEDDED_PRESENT:
                        counts["present"] += 1
                    else:
                        counts["none"] += 1
                completed += len(chunk)
                _report(on_progress, completed, total)

            if fetch_beatport and not cancelled:
                accepted = self._artwork.accepted_tracks(
                    self._artwork.existing(existing)
                )
                failures_in_a_row = 0
                for start in range(0, len(accepted), FETCH_CHUNK_SIZE):
                    if should_cancel is not None and should_cancel():
                        cancelled = True
                        break
                    chunk_ids = accepted[start : start + FETCH_CHUNK_SIZE]
                    for status in pool.map(self._fetch_for_scan, chunk_ids):
                        if status == _READY:
                            counts["fetched"] += 1
                        elif status == _REFUSED:
                            counts["refused"] += 1
                        failures_in_a_row = (
                            failures_in_a_row + 1 if status == _FAILED else 0
                        )
                    if failures_in_a_row >= UNREACHABLE_AFTER_FAILURES:
                        unreachable = True
                        break

        result = ArtworkScanResult(
            trigger=trigger,
            total=total,
            present=counts["present"],
            none=counts["none"],
            unreadable=counts["unreadable"],
            not_read=not_read,
            vanished=vanished,
            fetched=counts["fetched"],
            refused=counts["refused"],
            unreachable=unreachable,
            cancelled=cancelled,
            duration_seconds=self._monotonic() - started,
        )
        _logger.info("[artwork] %s (%s)", result.summary_line(), trigger)
        self._record_scan(result)
        return result

    def _record_for(
        self, track_id: int, path: str, read: EmbeddedRead
    ) -> EmbeddedRecord:
        if not read.readable:
            return EmbeddedRecord(
                track_id,
                EMBEDDED_UNKNOWN,
                None,
                self._clock(),
                path,
                refused=REFUSED_TAGS,
            )
        if read.data is None:
            return EmbeddedRecord(track_id, EMBEDDED_NONE, None, self._clock(), path)
        return EmbeddedRecord(
            track_id, EMBEDDED_PRESENT, _sha256(read.data), self._clock(), path
        )

    def _fetch_for_scan(self, track_id: int) -> str:
        """Make a track's Beatport thumbnails ready; say what that came to."""
        try:
            return self._beatport(track_id, self._artwork.get(track_id), None).status
        except Exception as exc:  # noqa: BLE001 — one track does not stop a scan
            _logger.warning(
                "[artwork] track %s: Beatport image not fetched: %s", track_id, exc
            )
            return _FAILED

    def _record_scan(self, result: ArtworkScanResult) -> None:
        if self._activity is None or result.total == 0:
            return
        try:
            self._activity.record_event(
                EVENT_ARTWORK_SCANNED,
                result.summary_line(),
                {
                    "trigger": result.trigger,
                    "total": result.total,
                    "present": result.present,
                    "none": result.none,
                    "unreadable": result.unreadable,
                    "not_read": result.not_read,
                    "fetched": result.fetched,
                    "refused": result.refused,
                    "unreachable": result.unreachable,
                    "cancelled": result.cancelled,
                },
            )
        except Exception as exc:  # noqa: BLE001 — the feed is best-effort
            _logger.debug("[activity] could not record the artwork scan: %s", exc)


def _report(
    on_progress: Optional[Callable[[int, int], None]], completed: int, total: int
) -> None:
    if on_progress is not None:
        on_progress(completed, total)


__all__: Sequence[str] = (
    "ARTWORK_FAILED",
    "ARTWORK_NONE",
    "ARTWORK_READY",
    "ARTWORK_REFUSED",
    "ArtworkScanResult",
    "ArtworkService",
    "BEATPORT_FETCH_SIZE",
    "EMBED_FETCH_SIZE",
    "EMBED_MAX_DIMENSION",
    "EmbeddableArtwork",
    "BEATPORT_FETCH_WORKERS",
    "EVENT_ARTWORK_SCANNED",
    "FetchGate",
    "NOTHING_TO_SCAN",
    "RETRY_FAILED_AFTER_SECONDS",
    "SIZE_INSPECTOR",
    "SIZE_ROW",
    "THUMBNAIL_SIZES",
    "TRIGGERS",
    "TRIGGER_IMPORT",
    "TRIGGER_REFRESH",
    "TRIGGER_REQUEST",
    "UNREACHABLE_AFTER_FAILURES",
    "fetch_image",
    "lookup_page_artwork",
    "size_pixels",
)
