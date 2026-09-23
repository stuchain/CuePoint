#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Discovery over the library, as a kept run (DISCOVER-05, DEC-090, DEC-091).

inCrate's algorithm, ported rather than reinvented: **charts** in the chosen
genres and dates made by artists in the library, every track of each, then
**recent releases** from labels in the library, de-duplicated by Beatport
track id in the order found. What changes is what it reads, and what it keeps.

What it reads
-------------
- **The library, once, at start** (DEC-063, DEC-090). Its artists are every
  credited name (DISCOVER-03's credit index, read whole, not a capped facet);
  its labels every effective label, overrides included. A subset the user
  picked narrows them, by DISCOVER-03's ``name_key``. The scope as resolved is
  recorded in the run's ``params_json``, with its counts, so a run always says
  what it looked for.
- **Identity by id where resolution has one** (DEC-095). A chart counts when
  the Beatport artist who made it is one DISCOVER-04 linked to a library
  artist in scope, or, for a library artist resolution has linked to no id,
  when that artist's name has its key; a chart no artist made counts by its
  account's name. DISCOVER-01's recording showed
  why both: DJEFF's account is "OFFICIALDJEFFMUSIC". A label uses the Beatport
  id resolution linked to it; otherwise the name-lookup cache; only a miss
  asks Beatport, and its answer — "not found" included — is kept, so a second
  run makes no label searches. inCrate's hard-coded ``_CANONICAL_LABEL_IDS``
  is not ported (DEC-099).
- **DISCOVER-01's catalog methods**: ``charts``, ``chart_tracks``,
  ``label_tracks``, and ``search_label_by_name``. A chart listing names its
  artist, so only a matching chart costs a second request; inCrate read every
  chart's detail to find out.

What it keeps
-------------
The run is stored before Beatport is asked anything, and what it finds is
committed as it goes, at most once a second (:data:`FLUSH_INTERVAL_SECONDS`),
each commit one transaction: the catalog rows, the tracks the run had not
found yet at the next positions, and **every** reason each was found —
inCrate kept the first. A cancel keeps what was found and records
``cancelled``; a refusal every later request would repeat (a rejected token,
say) fails the run with DISCOVER-01's error class and keeps what was found;
so do :data:`~cuepoint.services.beatport_api_client.MAX_CONSECUTIVE_FAILURES`
failures in a row. One activity event, ``discovery.ran``, says how it ended.

Two things of inCrate's are deliberately not ported: the retry of *all*
genres when the chosen ones gave no chart tracks, which returned charts from
genres the user had not chosen; and "an empty list of artists means all" —
here ``None`` is all, and an empty selection is none.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import (
    Any,
    Callable,
    Dict,
    Iterable,
    List,
    Optional,
    Protocol,
    Sequence,
    Set,
    Tuple,
)

from cuepoint.core.entity_names import name_key
from cuepoint.incrate.beatport_api_models import CatalogChart, CatalogTrack
from cuepoint.models.beatport_cache import ENTITY_LABEL, BeatportNameLookup
from cuepoint.models.discovery_run import (
    OWNED_HIDE,
    RUN_CANCELLED,
    RUN_FAILED,
    RUN_SUCCEEDED,
    SORT_FOUND,
    SOURCE_CHART,
    SOURCE_LABEL_RELEASE,
    DiscoveryRun,
    DiscoveryRunSource,
    RunTracksPage,
)
from cuepoint.services.beatport_api_client import (
    ERROR_FORBIDDEN,
    ERROR_NO_TOKEN,
    ERROR_RATE_LIMITED,
    ERROR_REJECTED,
    MAX_CONSECUTIVE_FAILURES,
    REPEATING_ERROR_CLASSES,
    classify_beatport_error,
)
from cuepoint.services.beatport_catalog import positive_id
from cuepoint.services.interfaces import (
    IActivityService,
    IDiscoveryRepository,
    IDiscoveryService,
    ITrackCreditRepository,
)

_logger = logging.getLogger(__name__)

#: How far back the charts reach when no dates are given: inCrate's default.
DEFAULT_CHART_DAYS = 30

#: How far back the label releases reach when no number is given or
#: configured: inCrate's ``incrate.new_releases_days`` default.
DEFAULT_NEW_RELEASES_DAYS = 30

#: The longest chart window, and the most days of releases, a run accepts. A
#: year of charts in a genre is already thousands of listing entries.
MAX_WINDOW_DAYS = 366

#: The most genres one run reads charts for.
MAX_GENRES = 50

#: How long "Beatport knows no label by this name" is trusted before a run
#: asks again. A label found is kept: Beatport's ids do not change.
NOT_FOUND_LOOKUP_MAX_AGE = timedelta(days=30)

#: How often a run commits what it has found, at most. A commit waits for the
#: disk, and one per chart or label took 4.4 of a mocked 5.7-second run at
#: 50,000 tracks; once a second, a crash loses at most a second's findings, and
#: a cancel or a failure loses none, since both commit before the run ends.
FLUSH_INTERVAL_SECONDS = 1.0

#: How many found tracks a run holds before committing them anyway.
FLUSH_TRACKS = 1000

#: The activity event every run records, whatever its outcome.
EVENT_DISCOVERY_RAN = "discovery.ran"

#: The error a run left open by a crash is closed with (DISCOVER-02's fourth
#: binding note).
INTERRUPTED_ERROR = "CuePoint stopped before the run finished"

#: The stages a run reports its progress in.
STAGE_CHARTS = "Reading charts"
STAGE_LABELS = "Resolving labels"
STAGE_RELEASES = "Reading releases"

_STOPPED_BECAUSE = {
    ERROR_NO_TOKEN: "no Beatport token is configured",
    ERROR_REJECTED: "Beatport rejected the token",
    ERROR_FORBIDDEN: "the token is not allowed to read the catalog",
    ERROR_RATE_LIMITED: "Beatport asked CuePoint to slow down",
}

_FAILED = object()


class DiscoverySource(Protocol):
    """What a run needs from ``BeatportApi`` (DISCOVER-01)."""

    def require_token(self) -> None:
        """Raise a ``no_token`` ``BeatportAPIError`` when there is no token."""
        ...

    def charts(
        self, genre_id: Optional[int], since: date, until: date
    ) -> List[CatalogChart]:
        """Charts in a genre published in a window, newest first."""
        ...

    def chart_tracks(self, chart_id: int) -> List[CatalogTrack]:
        """Every track of a chart, in chart order."""
        ...

    def search_label_by_name(self, name: str) -> Optional[int]:
        """A label's Beatport id by name, or None."""
        ...

    def label_tracks(
        self, label_id: int, since: date, until: Optional[date] = None
    ) -> List[CatalogTrack]:
        """A label's tracks released in a window, newest first."""
        ...


@dataclass(frozen=True)
class DiscoveryRequest:
    """What one run is asked to do, with every default filled in.

    Attributes:
        genre_ids: The genres to read charts in; none reads no charts.
        charts_from: The first day a chart may be published.
        charts_to: The last.
        new_releases_days: How many days back label releases are read.
        artists: The library artists to match chart makers against, as the
            user named them; ``None`` for every artist in the library.
        labels: The library labels to read releases from; ``None`` for all.
    """

    genre_ids: Tuple[int, ...]
    charts_from: date
    charts_to: date
    new_releases_days: int
    artists: Optional[Tuple[str, ...]] = None
    labels: Optional[Tuple[str, ...]] = None

    def __post_init__(self) -> None:
        """Validate the request."""
        if len(self.genre_ids) > MAX_GENRES:
            raise ValueError(f"A run reads at most {MAX_GENRES} genres")
        if any(positive_id(g) != g for g in self.genre_ids):
            raise ValueError(f"Genre ids are positive whole numbers: {self.genre_ids}")
        if len(set(self.genre_ids)) != len(self.genre_ids):
            raise ValueError("A genre is named once")
        if self.charts_from > self.charts_to:
            raise ValueError("The chart window ends before it starts")
        if (self.charts_to - self.charts_from).days >= MAX_WINDOW_DAYS:
            raise ValueError(f"The chart window is at most {MAX_WINDOW_DAYS} days")
        days = self.new_releases_days
        if isinstance(days, bool) or not isinstance(days, int):
            raise ValueError("new_releases_days is a whole number of days")
        if not 1 <= days <= MAX_WINDOW_DAYS:
            raise ValueError(f"new_releases_days is 1 to {MAX_WINDOW_DAYS}")
        for names in (self.artists, self.labels):
            if names is not None and any(
                not isinstance(n, str) or not n.strip() for n in names
            ):
                raise ValueError("A picked artist or label is a name")


@dataclass
class _State:
    """A run's progress, as it goes."""

    run_id: int
    counts: Dict[str, int] = field(default_factory=dict)
    in_a_row: int = 0
    releases: Set[int] = field(default_factory=set)
    pending_tracks: List[CatalogTrack] = field(default_factory=list)
    pending_sources: List[DiscoveryRunSource] = field(default_factory=list)
    last_flush: float = 0.0


class _Cancelled(Exception):
    pass


class _Stopped(Exception):
    def __init__(self, error_class: str, message: str) -> None:
        super().__init__(message)
        self.error_class = error_class
        self.message = message


def _names(values: Optional[Iterable[str]]) -> Optional[Tuple[str, ...]]:
    """Picked names as given, trimmed, each once; ``None`` stays "all"."""
    if values is None:
        return None
    if isinstance(values, str):
        raise ValueError("Picked names are a list, not one string")
    cleaned: List[str] = []
    for value in values:
        if not isinstance(value, str):
            raise ValueError(f"A picked name is text, got {value!r}")
        text = value.strip()
        if text and text not in cleaned:
            cleaned.append(text)
    return tuple(cleaned)


def _pick(
    library: Sequence[Tuple[str, str]], picked: Optional[Tuple[str, ...]]
) -> List[Tuple[str, str]]:
    """The library's ``(key, name)`` entries a selection names, in key order."""
    if picked is None:
        return list(library)
    wanted = {name_key(n) for n in picked}
    return [entry for entry in library if entry[0] in wanted]


def local_date(moment: datetime) -> date:
    """The user's date at ``moment``: a window of days is counted in their days,
    as inCrate's ``date.today()`` counted it, while timestamps stay UTC."""
    return moment.astimezone().date() if moment.tzinfo is not None else moment.date()


def _count(n: int, one: str, many: str) -> str:
    return f"{n:,} {one if n == 1 else many}"


def summary_line(run: DiscoveryRun) -> str:
    """The activity feed's sentence for a run that has ended."""
    found = (
        f"found {_count(run.tracks_found, 'track', 'tracks')} in "
        f"{_count(run.charts_read, 'chart', 'charts')} and "
        f"{_count(run.releases_read, 'release', 'releases')}"
    )
    if run.outcome == RUN_SUCCEEDED:
        return f"Discovery {found}"
    if run.outcome == RUN_CANCELLED:
        return f"Discovery cancelled; {found}"
    reason = (
        _STOPPED_BECAUSE.get(run.error_class, "Beatport could not be reached")
        if run.error_class is not None
        else "of an error"
    )
    return f"Discovery stopped because {reason}; {found}"


class DiscoveryService(IDiscoveryService):
    """Runs discovery over the library and reads the runs it kept."""

    def __init__(
        self,
        runs: IDiscoveryRepository,
        credits: ITrackCreditRepository,
        beatport: DiscoverySource,
        activity_service: Optional[IActivityService] = None,
        config_service: Optional[Any] = None,
        *,
        max_consecutive_failures: int = MAX_CONSECUTIVE_FAILURES,
        clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        if max_consecutive_failures < 1:
            raise ValueError("max_consecutive_failures must be at least 1")
        self._runs = runs
        self._credits = credits
        self._beatport = beatport
        self._activity = activity_service
        self._config = config_service
        self._max_failures = max_consecutive_failures
        self._clock = clock
        self._monotonic = monotonic

    # --------------------------------------------------------------- asking

    def require_token(self) -> None:
        """Refuse, as ``no_token``, when no Beatport token is configured.

        Raises:
            BeatportAPIError: Classified ``no_token``.
        """
        self._beatport.require_token()

    def request(
        self,
        genre_ids: Optional[Iterable[int]] = None,
        charts_from: Optional[date] = None,
        charts_to: Optional[date] = None,
        new_releases_days: Optional[int] = None,
        artists: Optional[Iterable[str]] = None,
        labels: Optional[Iterable[str]] = None,
    ) -> DiscoveryRequest:
        """A run's request, with inCrate's defaults for what is not given.

        Genres default to ``incrate.discovery_genre_ids`` and the release days
        to ``incrate.new_releases_days`` (the config keys keep their prefix,
        the phase's cross-cutting fact 7); the charts to the last
        :data:`DEFAULT_CHART_DAYS` days.

        Raises:
            ValueError: If a value is not one a run can use.
        """
        today = local_date(self._clock())
        until = charts_to or today
        since = charts_from or (until - timedelta(days=DEFAULT_CHART_DAYS))
        if genre_ids is None:
            genres = self._configured_genres()
        else:
            genres = []
            for value in genre_ids:
                genre = positive_id(value)
                if genre is None or isinstance(value, bool):
                    raise ValueError(
                        f"A genre id is a positive whole number, got {value!r}"
                    )
                if genre not in genres:
                    genres.append(genre)
        days = (
            self._configured_days() if new_releases_days is None else new_releases_days
        )
        return DiscoveryRequest(
            genre_ids=tuple(genres),
            charts_from=since,
            charts_to=until,
            new_releases_days=days,
            artists=_names(artists),
            labels=_names(labels),
        )

    def _configured_genres(self) -> List[int]:
        raw = self._config_value("incrate.discovery_genre_ids")
        if not isinstance(raw, (list, tuple)):
            return []
        genres: List[int] = []
        for value in raw:
            genre = positive_id(value)
            if genre is not None and genre not in genres:
                genres.append(genre)
        return genres[:MAX_GENRES]

    def _configured_days(self) -> int:
        raw = self._config_value("incrate.new_releases_days")
        days = positive_id(raw) if raw is not None else None
        if days is None or days > MAX_WINDOW_DAYS:
            return DEFAULT_NEW_RELEASES_DAYS
        return days

    def _config_value(self, key: str) -> Any:
        if self._config is None:
            return None
        try:
            return self._config.get(key)
        except Exception:  # noqa: BLE001 — a broken config falls back to defaults
            return None

    # -------------------------------------------------------------- running

    def run(
        self,
        request: DiscoveryRequest,
        *,
        job_id: Optional[str] = None,
        on_progress: Optional[Callable[[str, int, int], None]] = None,
        should_cancel: Optional[Callable[[], bool]] = None,
    ) -> DiscoveryRun:
        """Run discovery and return the run as it ended.

        ``on_progress`` is told ``(stage, done, total)``; ``should_cancel`` is
        asked before every Beatport request. A run that fails for a reason
        other than Beatport — a bug, a database error while running — is
        still ended as ``failed`` with that reason, so no run is left open.
        """
        now = self._clock()
        today = local_date(now)
        artists = _pick(self._credits.library_artists(), request.artists)
        labels = _pick(self._credits.library_labels(), request.labels)
        artist_names = dict(artists)
        linked_artists = {
            beatport_id: key
            for beatport_id, key in self._credits.artist_ids_by_key().items()
            if key in artist_names
        }
        label_names = dict(labels)
        linked_labels = {
            key: beatport_id
            for key, beatport_id in self._credits.label_ids_by_key().items()
            if key in label_names
        }
        releases_from = today - timedelta(days=request.new_releases_days)
        params = {
            "genre_ids": list(request.genre_ids),
            "charts_from": request.charts_from.isoformat(),
            "charts_to": request.charts_to.isoformat(),
            "new_releases_days": request.new_releases_days,
            "releases_from": releases_from.isoformat(),
            "releases_to": today.isoformat(),
            "artists": {
                "picked": None if request.artists is None else list(request.artists),
                "count": len(artists),
                "linked_ids": len(linked_artists),
                "scope": [{"key": k, "name": n} for k, n in artists],
            },
            "labels": {
                "picked": None if request.labels is None else list(request.labels),
                "count": len(labels),
                "linked_ids": len(linked_labels),
                "scope": [{"key": k, "name": n} for k, n in labels],
            },
        }
        run = self._runs.start_run(
            DiscoveryRun(
                started_at=now.isoformat(),
                params_json=json.dumps(params, ensure_ascii=False),
                job_id=job_id,
                artists_in_scope=len(artists),
                labels_in_scope=len(labels),
            )
        )
        assert run.id is not None
        state = _State(
            run_id=run.id,
            counts={
                "artists_in_scope": len(artists),
                "labels_in_scope": len(labels),
                "labels_resolved": 0,
                "charts_read": 0,
                "releases_read": 0,
            },
        )
        state.last_flush = self._monotonic()
        cancel = should_cancel or (lambda: False)
        progress = on_progress or (lambda stage, done, total: None)
        outcome, error, error_class = RUN_SUCCEEDED, None, None
        try:
            self._read_charts(
                state, request, artist_names, linked_artists, progress, cancel
            )
            resolved = self._resolve_labels(
                state, labels, linked_labels, progress, cancel
            )
            self._read_releases(state, resolved, releases_from, today, progress, cancel)
            self._flush(state)
        except _Cancelled:
            outcome = RUN_CANCELLED
        except _Stopped as stopped:
            outcome, error, error_class = (
                RUN_FAILED,
                stopped.message,
                stopped.error_class,
            )
        except Exception as exc:  # noqa: BLE001 — the run is ended, not left open
            _logger.warning("[discover] run %s failed: %s", run.id, exc, exc_info=True)
            outcome, error = RUN_FAILED, str(exc) or type(exc).__name__
        if outcome != RUN_SUCCEEDED:
            self._flush(state)
        self._runs.update_counts(state.run_id, _stored_counts(state))
        ended = self._runs.finish_run(
            state.run_id,
            outcome,
            self._clock().isoformat(),
            error=error,
            error_class=error_class,
        )
        self._record(ended)
        return ended

    def _ask(
        self,
        state: _State,
        cancel: Callable[[], bool],
        call: Callable[..., Any],
        *args: Any,
    ) -> Any:
        """One Beatport request, with the run's cancel and failure rules.

        Returns the answer, or :data:`_FAILED` for a failure the run carries on
        past.

        Raises:
            _Cancelled: If the run was asked to stop.
            _Stopped: On a refusal every later request would repeat, or on the
                last of too many failures in a row.
        """
        if cancel():
            raise _Cancelled()
        try:
            answer = call(*args)
        except Exception as exc:  # noqa: BLE001 — classified and counted
            kind = classify_beatport_error(exc)
            state.in_a_row += 1
            _logger.warning(
                "[discover] run %s: %s%r failed (%s): %s",
                state.run_id,
                getattr(call, "__name__", "request"),
                args,
                kind,
                exc,
            )
            if kind in REPEATING_ERROR_CLASSES or state.in_a_row >= self._max_failures:
                raise _Stopped(kind, str(exc) or kind) from exc
            return _FAILED
        state.in_a_row = 0
        return answer

    def _record(self, run: DiscoveryRun) -> None:
        if self._activity is None:
            return
        detail = {
            "run_id": run.id,
            "outcome": run.outcome,
            "tracks_found": run.tracks_found,
            "charts_read": run.charts_read,
            "releases_read": run.releases_read,
            "artists_in_scope": run.artists_in_scope,
            "labels_in_scope": run.labels_in_scope,
            "labels_resolved": run.labels_resolved,
            "error_class": run.error_class,
        }
        try:
            self._activity.record_event(EVENT_DISCOVERY_RAN, summary_line(run), detail)
        except Exception as exc:  # noqa: BLE001 — the feed is best-effort
            _logger.debug(
                "[activity] could not record discovery run %s: %s", run.id, exc
            )

    def _store(
        self,
        state: _State,
        tracks: Sequence[CatalogTrack],
        sources: Sequence[DiscoveryRunSource],
    ) -> None:
        """Hold what a chart or label gave, committing at most once a second."""
        state.pending_tracks.extend(tracks)
        state.pending_sources.extend(sources)
        if (
            len(state.pending_tracks) >= FLUSH_TRACKS
            or self._monotonic() - state.last_flush >= FLUSH_INTERVAL_SECONDS
        ):
            self._flush(state)

    def _flush(self, state: _State) -> None:
        """Commit what the run holds, with its counts, in one transaction."""
        state.last_flush = self._monotonic()
        if not state.pending_tracks and not state.pending_sources:
            return
        tracks, sources = state.pending_tracks, state.pending_sources
        state.pending_tracks, state.pending_sources = [], []
        self._runs.record_found(
            state.run_id,
            tracks,
            sources,
            self._clock().isoformat(),
            _stored_counts(state),
        )

    # --- charts

    def _read_charts(
        self,
        state: _State,
        request: DiscoveryRequest,
        artist_names: Dict[str, str],
        linked: Dict[int, str],
        progress: Callable[[str, int, int], None],
        cancel: Callable[[], bool],
    ) -> None:
        genres = request.genre_ids if artist_names else ()
        progress(STAGE_CHARTS, 0, len(genres))
        seen: Set[int] = set()
        for done, genre_id in enumerate(genres):
            charts = self._ask(
                state,
                cancel,
                self._beatport.charts,
                genre_id,
                request.charts_from,
                request.charts_to,
            )
            if charts is not _FAILED:
                for chart in charts:
                    if chart.id in seen:
                        continue
                    seen.add(chart.id)
                    curator = chart_curator(chart, artist_names, linked)
                    if curator is None:
                        continue
                    tracks = self._ask(
                        state, cancel, self._beatport.chart_tracks, chart.id
                    )
                    if tracks is _FAILED:
                        continue
                    state.counts["charts_read"] += 1
                    self._store(
                        state,
                        tracks,
                        [
                            DiscoveryRunSource(
                                run_id=state.run_id,
                                beatport_track_id=track.id,
                                source_type=SOURCE_CHART,
                                source_id=chart.id,
                                matched_on=curator,
                                source_name=chart.name,
                                source_url=chart.url,
                            )
                            for track in tracks
                        ],
                    )
            progress(STAGE_CHARTS, done + 1, len(genres))

    # --- labels

    def _resolve_labels(
        self,
        state: _State,
        labels: Sequence[Tuple[str, str]],
        linked: Dict[str, int],
        progress: Callable[[str, int, int], None],
        cancel: Callable[[], bool],
    ) -> List[Tuple[str, int]]:
        """Each label in scope with a Beatport id, as ``(name, id)``, in order."""
        progress(STAGE_LABELS, 0, len(labels))
        cached = self._runs.lookups(
            ENTITY_LABEL, [key for key, _ in labels if key not in linked]
        )
        stale_before = (self._clock() - NOT_FOUND_LOOKUP_MAX_AGE).isoformat()
        resolved: List[Tuple[str, int]] = []
        for done, (key, name) in enumerate(labels):
            beatport_id: Optional[int] = linked.get(key)
            lookup = cached.get(key)
            if (
                beatport_id is None
                and lookup is not None
                and (lookup.found or lookup.looked_up_at >= stale_before)
            ):
                beatport_id = lookup.beatport_id
            elif beatport_id is None:
                answer = self._ask(
                    state, cancel, self._beatport.search_label_by_name, name
                )
                if answer is not _FAILED:
                    beatport_id = positive_id(answer)
                    self._runs.save_lookup(
                        BeatportNameLookup(
                            kind=ENTITY_LABEL,
                            name_key=key,
                            looked_up_at=self._clock().isoformat(),
                            beatport_id=beatport_id,
                        )
                    )
            if beatport_id is not None:
                resolved.append((name, beatport_id))
                state.counts["labels_resolved"] = len(resolved)
            progress(STAGE_LABELS, done + 1, len(labels))
        self._runs.update_counts(state.run_id, _stored_counts(state))
        return resolved

    # --- releases

    def _read_releases(
        self,
        state: _State,
        labels: Sequence[Tuple[str, int]],
        since: date,
        until: date,
        progress: Callable[[str, int, int], None],
        cancel: Callable[[], bool],
    ) -> None:
        progress(STAGE_RELEASES, 0, len(labels))
        for done, (name, label_id) in enumerate(labels):
            tracks = self._ask(
                state, cancel, self._beatport.label_tracks, label_id, since, until
            )
            if tracks is not _FAILED:
                released = [t for t in tracks if t.release_id is not None]
                state.releases.update(t.release_id for t in released if t.release_id)
                state.counts["releases_read"] = len(state.releases)
                self._store(
                    state,
                    released,
                    [
                        DiscoveryRunSource(
                            run_id=state.run_id,
                            beatport_track_id=track.id,
                            source_type=SOURCE_LABEL_RELEASE,
                            source_id=int(track.release_id or 0),
                            matched_on=name,
                            source_name=track.release_name or None,
                        )
                        for track in released
                    ],
                )
            progress(STAGE_RELEASES, done + 1, len(labels))

    # ------------------------------------------------------------- reading

    def close_interrupted(self) -> List[int]:
        """End every run a crash left open, as failed, keeping what it found."""
        return self._runs.close_interrupted(
            self._clock().isoformat(), INTERRUPTED_ERROR
        )

    def list_runs(self, limit: int = 50, offset: int = 0) -> List[DiscoveryRun]:
        """Runs, newest first."""
        return self._runs.list_runs(limit, offset)

    def get_run(self, run_id: int) -> Optional[DiscoveryRun]:
        """One run, or None."""
        return self._runs.get_run(run_id)

    def run_tracks(
        self,
        run_id: int,
        owned: str = OWNED_HIDE,
        sort: str = SORT_FOUND,
        descending: bool = False,
        offset: int = 0,
        limit: int = 100,
    ) -> RunTracksPage:
        """A window of a run's tracks, owned hidden by default (DEC-092).

        Raises:
            LookupError: If there is no such run.
            ValueError: If the filter, sort or window is not one a run answers.
        """
        if self._runs.get_run(run_id) is None:
            raise LookupError(f"No discovery run {run_id}")
        return self._runs.run_tracks(run_id, owned, sort, descending, offset, limit)

    def delete_run(self, run_id: int) -> bool:
        """Delete an ended run; True when it existed.

        Raises:
            ValueError: If it is still running.
        """
        return self._runs.delete_run(run_id)


def chart_curator(
    chart: CatalogChart, artist_names: Dict[str, str], linked: Dict[int, str]
) -> Optional[str]:
    """The library artist a chart is in scope for, as the library names it.

    DEC-095: where CuePoint knows a library artist's Beatport id, that id is
    who the artist is. So a chart a Beatport artist made counts for:

    - the library artist resolution linked that artist's id to; or else
    - the library artist whose key its name has — but only one resolution
      linked to no id at all. An artist known by id is not matched by name, so
      a chart by someone else of the same name does not count.

    A chart no artist made counts by the name of the account that published
    it, the only signal it carries. None when it counts for nobody.
    """
    if chart.artist is not None:
        key = linked.get(chart.artist.id)
        if key is None:
            candidate = name_key(chart.artist.name)
            if candidate in artist_names and candidate not in set(linked.values()):
                key = candidate
        return artist_names[key] if key is not None else None
    if chart.owner_name:
        return artist_names.get(name_key(chart.owner_name))
    return None


def _stored_counts(state: _State) -> Dict[str, int]:
    return {
        name: state.counts[name]
        for name in ("labels_resolved", "charts_read", "releases_read")
    }
