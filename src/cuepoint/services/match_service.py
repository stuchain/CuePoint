#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Matching a library scope on Beatport, resumably (CLEAN-03, DEC-065).

What DEC-065 asks for is small to say — match any scope the Library browses,
store an attempt per track as it goes, and continue after a cancel or a restart
— and this module is where each part of it is decided. The engine's
:mod:`~cuepoint.engine.match_jobs` wraps it in a job; nothing here knows about
jobs, HTTP or threads beyond the matcher's own.

The plan is written once
------------------------
:meth:`MatchService.prepare` resolves a selection — ids, or the query naming
them (DEC-045) — through the batch path's own resolver, keeps the tracks that
exist, deduplicates them (a Collection holding a track twice matches it once,
cross-cutting fact 8), and, unless it is a re-match, leaves out tracks already
settled (see :mod:`~cuepoint.persistence.match_job_repository`). The plan is
then written in one transaction and never re-evaluated: a job that re-ran its
query would drift as tracks it matched stopped matching the query (DEC-063).

A request that names nothing, or only tracks already matched, is refused before
any job exists, for ``batch_jobs``'s reason: a job that starts and immediately
has nothing to do is a worse way to say no than an error.

Many matchers, one writer
-------------------------
The matcher is network-bound and slow; SQLite takes one writer. So a pool of
``TRACK_WORKERS`` threads runs ``process_track`` and nothing else, and the
thread calling :meth:`MatchService.run` does every read and write. It hands the
pool at most one track per worker at a time, so the work waiting in memory is
bounded by the pool, a cancel has nothing queued to unwind, and tracks are
started in plan order.

Each result is committed as it arrives: the attempt with every candidate
(CLEAN-02), the plan row flagged done, and the state rule CLEAN-04 plugs in,
in **one transaction**. A job killed at track 31,204 therefore has 31,204
stored attempts, each with its row done, and a resume starts at the rest.
Committing on arrival rather than in plan order means a slow track never holds
finished ones hostage in memory: forty-five seconds of Beatport time is not
something to lose to a crash for the sake of tidy ids.

A commit that meets a lock — a refresh applying in one long transaction — is
retried rather than dropped. A database that refuses a write for any other
reason stops the job, because matching a library whose results cannot be saved
would spend hours of Beatport time for nothing.

Cancelling
----------
A cancel stops new tracks starting at once. Tracks already being matched are
allowed to finish and are stored: they are real answers, and each is bounded by
``PER_TRACK_TIME_BUDGET_SEC``. The matcher has no cancellation point of its own
— ``ProcessingController`` never reaches ``core/matcher.py``, whose loop checks
only its time budget — and cross-cutting fact 4 keeps it unchanged, so this is
the finest cancel available without discarding work.

When searches stop answering
----------------------------
The matcher turns a failed search into an empty result, not an error, so a lost
connection looks like thousands of tracks with nothing on Beatport — found in
seconds each, because there is nothing to fetch. :data:`SEARCH_OUTAGE_STREAK`
tracks in a row with no candidates at all stop the job, and those tracks are put
back in the queue, so resuming once the network is back asks them again. Their
attempts stay stored (DEC-066), and they are not "answered", so no later match
leaves them out either. A real title draws candidates even when nothing
matches, which is what makes a run of empty ones a signal.

What the job says
-----------------
"N of M tracks, K accepted, J need review, E errors" once CLEAN-04's state rule
is plugged in, and "found / not found" until then — never a percentage standing
in for a time estimate (cross-cutting fact 6). One activity event per run
records the counts (DEC-029).

Settings
--------
:meth:`MatchService.effective_settings` and :meth:`MatchService.track_workers`
build what ``process_playlist_from_xml`` builds, from the same configuration,
so Clean and the CLI match identically for the same input; a test runs both and
compares. They are restated here rather than shared because the CLI's path is
not to be edited by this phase (cross-cutting fact 7).
"""

from __future__ import annotations

import logging
import sqlite3
import time
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from dataclasses import dataclass, field
from typing import (
    TYPE_CHECKING,
    Any,
    Callable,
    Dict,
    List,
    Optional,
    Tuple,
    TypeVar,
)

from cuepoint.exceptions.cuepoint_exceptions import DatabaseError
from cuepoint.models.config import SETTINGS
from cuepoint.models.library_track import utc_now_iso
from cuepoint.models.match_attempt import (
    OUTCOME_ERROR,
    OUTCOME_MATCHED,
    OUTCOME_NO_MATCH,
    STATE_ACCEPTED,
    STATE_NEEDS_REVIEW,
    MatchAttempt,
    MatchJobTrack,
    MatchPlan,
    ResumableMatch,
    TrackMatch,
)
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.services.interfaces import (
    IActivityService,
    IBatchService,
    IConfigService,
    IDatabaseService,
    IMatchJobRepository,
    IMatchRepository,
    IMatchService,
    IProcessorService,
    ITrackRepository,
)
from cuepoint.services.match_input import library_track_to_track

if TYPE_CHECKING:
    from cuepoint.services.batch_service import BatchSelection

_logger = logging.getLogger(__name__)

#: The activity event one run records, carrying its counts (DEC-029).
EVENT_MATCH_FINISHED = "clean.match"

#: Recorded once for each match job a restart interrupted, offering it for
#: resumption rather than resuming it unasked (DEC-065).
EVENT_MATCH_INTERRUPTED = "clean.match.interrupted"

#: Tracks in a row with no candidates at all before a run decides searches have
#: stopped answering. Twenty-five is two pools' worth at the default twelve
#: workers: long enough that a scope of obscure titles does not trip it, short
#: enough that an outage costs a minute rather than a library.
SEARCH_OUTAGE_STREAK = 25

#: How long a commit waits on a locked database before the job gives up. A
#: refresh applies in one transaction, and a large one holds the lock for tens
#: of seconds; two minutes outlasts that without hiding a real hang.
LOCK_RETRY_SECONDS = 120.0

#: How often the writer looks up from waiting to see whether a cancel arrived.
_POLL_SECONDS = 0.25

#: Decides a track's state from a stored attempt, inside the attempt's
#: transaction. CLEAN-04 provides it; returns the state it wrote, if any.
StateRule = Callable[[MatchAttempt], Optional[TrackMatch]]

_T = TypeVar("_T")


class MatchStorageError(RuntimeError):
    """The library database would not take a match result, so the job stopped.

    Raised for anything other than a lock that clears or a track that is gone:
    a full disk, a read-only file, a broken database. Every track already
    stored stays stored, and the rest are left waiting to resume.
    """


@dataclass(frozen=True)
class MatchDraft:
    """A resolved selection, ready to be written as a job's plan.

    Attributes:
        track_ids: The tracks to match, deduplicated, in the selection's order.
        selected: How many library tracks the selection named.
        rematch: Whether settled tracks were kept in.
    """

    track_ids: Tuple[int, ...]
    selected: int
    rematch: bool

    @property
    def planned(self) -> int:
        """How many tracks the job will match."""
        return len(self.track_ids)

    @property
    def excluded(self) -> int:
        """How many named tracks were left out as already settled."""
        return self.selected - len(self.track_ids)


@dataclass(frozen=True)
class MatchJobResult:
    """How far a match job has got, in the numbers a user is owed.

    The same object is a progress tick while the job runs and its answer when
    it ends. ``completed`` counts plan rows done — matched, or skipped because
    the track was gone or had no title — including any a resumed plan started
    with; the outcome counts are this run's.

    Attributes:
        job_id: The job.
        planned: Tracks in its plan.
        selected: Tracks it was handed; ``excluded`` of those were left out.
        excluded: Tracks left out before matching.
        rematch: Whether it was a re-match.
        resumed_from: The job it took over, if it is a resume.
        completed: Plan rows done.
        matched, no_match, errors: Stored attempts by outcome.
        skipped: Tracks it could not ask about: deleted, or with no title.
        unstored: Results the database refused for that track alone; they are
            left waiting, so a resume asks again.
        accepted, needs_review: Tracks the state rule put in those states.
        in_progress: Tracks being matched right now.
        cancelled: A cancel was requested.
        search_unavailable: The job stopped because searches came back empty.
        states_known: Whether a state rule ran, and so whether ``accepted`` and
            ``needs_review`` mean anything.
    """

    job_id: str
    planned: int
    selected: int
    excluded: int
    rematch: bool = False
    resumed_from: Optional[str] = None
    completed: int = 0
    matched: int = 0
    no_match: int = 0
    errors: int = 0
    skipped: int = 0
    unstored: int = 0
    accepted: int = 0
    needs_review: int = 0
    in_progress: int = 0
    cancelled: bool = False
    search_unavailable: bool = False
    states_known: bool = False

    def __post_init__(self) -> None:
        """Refuse counts that do not add up."""
        if not 0 <= self.completed <= self.planned:
            raise ValueError(
                f"A match job cannot have finished {self.completed} of"
                f" {self.planned} tracks"
            )

    @property
    def remaining(self) -> int:
        """Tracks still waiting."""
        return self.planned - self.completed

    def to_dict(self) -> Dict[str, Any]:
        """The counts as a payload, for a job result and an activity event."""
        return {
            "job_id": self.job_id,
            "resumed_from": self.resumed_from,
            "rematch": self.rematch,
            "selected": self.selected,
            "excluded": self.excluded,
            "planned": self.planned,
            "completed": self.completed,
            "remaining": self.remaining,
            "matched": self.matched,
            "no_match": self.no_match,
            "errors": self.errors,
            "skipped": self.skipped,
            "unstored": self.unstored,
            "accepted": self.accepted,
            "needs_review": self.needs_review,
            "cancelled": self.cancelled,
            "search_unavailable": self.search_unavailable,
            "states_known": self.states_known,
        }


def describe(result: MatchJobResult) -> str:
    """Say where a match job stands, for the status strip and the activity feed."""
    parts = [f"{result.completed} of {_tracks(result.planned)}"]
    if result.states_known:
        parts += [f"{result.accepted} accepted", f"{result.needs_review} need review"]
    else:
        parts += [f"{result.matched} found", f"{result.no_match} not found"]
    parts.append(f"{result.errors} error" + ("" if result.errors == 1 else "s"))
    if result.skipped:
        parts.append(f"{result.skipped} skipped")
    if result.unstored:
        parts.append(f"{result.unstored} not saved")
    sentence = "Beatport match: " + ", ".join(parts)
    if result.excluded:
        sentence += f" ({result.excluded} already matched, left out)"

    if result.search_unavailable:
        sentence += (
            f" — stopped because Beatport returned nothing for"
            f" {SEARCH_OUTAGE_STREAK} tracks in a row; {result.remaining} left to"
            " resume"
        )
    elif result.cancelled:
        sentence += f" — cancelled, {result.remaining} left to resume"
    if result.in_progress and (result.cancelled or result.search_unavailable):
        sentence += f" (finishing {result.in_progress} in progress)"
    return sentence


def describe_interrupted(waiting: ResumableMatch) -> str:
    """Offer an interrupted match job for resumption, in one sentence."""
    return (
        f"A Beatport match stopped when CuePoint closed, with {waiting.remaining}"
        f" of {_tracks(waiting.plan.planned)} left. It can be resumed."
    )


class MatchService(IMatchService):
    """Plans, runs and resumes matches over library tracks (DEC-065)."""

    def __init__(
        self,
        processor_service: IProcessorService,
        config_service: IConfigService,
        track_repository: ITrackRepository,
        match_repository: IMatchRepository,
        match_job_repository: IMatchJobRepository,
        batch_service: IBatchService,
        activity_service: IActivityService,
        database_service: IDatabaseService,
        state_rule: Optional[StateRule] = None,
    ) -> None:
        """Initialize the service.

        Args:
            processor_service: ``process_track``, the whole of the matching.
            config_service: Where the matcher's settings come from.
            track_repository: Reads the imported record a track is matched on.
            match_repository: Stores attempts (CLEAN-02).
            match_job_repository: The plan and its progress.
            batch_service: Resolves a selection, exactly as a batch does.
            activity_service: The one event per run.
            database_service: Opens the transaction an attempt and its plan row
                commit in. No SQL is run here.
            state_rule: CLEAN-04's rule, run inside that transaction.
        """
        self._processor = processor_service
        self._config = config_service
        self._tracks = track_repository
        self._matches = match_repository
        self._jobs = match_job_repository
        self._batch = batch_service
        self._activity = activity_service
        self._db = database_service
        self._state_rule = state_rule

    # ------------------------------------------------------------- settings

    def effective_settings(self) -> Dict[str, Any]:
        """Return the matcher settings ``process_playlist_from_xml`` builds."""
        return {key: self._config.get(key, SETTINGS.get(key)) for key in SETTINGS}

    def track_workers(self, settings: Dict[str, Any]) -> int:
        """Return how many tracks the XML path would match at once."""
        fallback: Any = SETTINGS.get("TRACK_WORKERS", 1)
        try:
            workers = int(settings.get("TRACK_WORKERS", fallback))
        except (TypeError, ValueError):
            try:
                workers = int(fallback)
            except (TypeError, ValueError):
                workers = 1
        cap = self._config.get("performance.max_workers", 8)
        if isinstance(cap, (int, float)) and cap >= 1:
            workers = min(workers, int(cap))
        return max(1, workers)

    # ------------------------------------------------------------- planning

    def prepare(self, selection: "BatchSelection", rematch: bool = False) -> MatchDraft:
        """Resolve a selection into the tracks a match job will cover.

        Raises:
            ValueError: If the selection names no library tracks, or every one
                it names is already settled and this is not a re-match.
            BrowseQueryError: If a query selection cannot be built.
        """
        named = self._jobs.existing(self._batch.resolve(selection))
        if not named:
            raise ValueError(
                "That selection names no tracks in the library, so there is nothing"
                " to match"
            )
        settled = set() if rematch else self._jobs.settled(named)
        wanted = tuple(track_id for track_id in named if track_id not in settled)
        if not wanted:
            raise ValueError(
                f"All {_tracks(len(named))} in that selection are already matched or"
                " decided. Re-match them to ask Beatport again."
            )
        return MatchDraft(track_ids=wanted, selected=len(named), rematch=bool(rematch))

    def write_plan(self, job_id: str, draft: MatchDraft) -> MatchPlan:
        """Write a prepared selection as a job's plan, in one transaction."""
        return self._jobs.create(
            job_id,
            draft.track_ids,
            rematch=draft.rematch,
            selected=draft.selected,
            created_at=utc_now_iso(),
        )

    def resumable(self) -> List[ResumableMatch]:
        """Return every match job with tracks still waiting, newest first."""
        return self._jobs.resumable()

    def check_resumable(self, job_id: str) -> ResumableMatch:
        """Return a job that can be resumed, or say why it cannot.

        Raises:
            LookupError: If there is no such match job.
            ValueError: If it has nothing left.
        """
        plan = self._jobs.get(job_id)
        if plan is None:
            raise LookupError(f"No match job {job_id}")
        planned, done = self._jobs.progress(job_id)
        if planned == done:
            raise ValueError(f"Match job {job_id} has nothing left to resume")
        return ResumableMatch(plan=plan, remaining=planned - done)

    def take_over(self, from_job_id: str, job_id: str) -> MatchPlan:
        """Give a new job the tracks an interrupted one left, and return its plan."""
        return self._jobs.take_over(from_job_id, job_id, utc_now_iso())

    # -------------------------------------------------------------- running

    def run(
        self,
        job_id: str,
        *,
        on_progress: Optional[Callable[[MatchJobResult], None]] = None,
        should_cancel: Optional[Callable[[], bool]] = None,
    ) -> MatchJobResult:
        """Match every waiting track of a job's plan, committing each as it lands.

        Args:
            job_id: A job whose plan has been written.
            on_progress: Called after every track, and once before the first.
            should_cancel: Asked between tracks. Tracks already being matched
                finish and are stored.

        Returns:
            What the run did. Its activity event is already recorded.

        Raises:
            LookupError: If the job has no plan.
            MatchStorageError: If the database stopped taking results.
        """
        plan = self._jobs.get(job_id)
        if plan is None:
            raise LookupError(f"No match job {job_id}")
        planned, done = self._jobs.progress(job_id)
        waiting = iter(self._jobs.waiting(job_id))
        settings = self.effective_settings()
        workers = self.track_workers(settings)
        tally = _Tally(
            plan=plan,
            planned=planned,
            completed=done,
            states_known=self._state_rule is not None,
        )

        def report() -> None:
            if on_progress is not None:
                on_progress(tally.result())

        report()
        in_flight: Dict[
            "Future[Tuple[TrackResult, str]]", Tuple[MatchJobTrack, Track]
        ] = {}
        pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="clean-match")
        try:
            while True:
                if (
                    not tally.cancelled
                    and should_cancel is not None
                    and should_cancel()
                ):
                    tally.cancelled = True
                    report()

                while not tally.stopping and len(in_flight) < workers:
                    row = next(waiting, None)
                    if row is None:
                        break
                    track = self._question_for(job_id, row)
                    if track is None:
                        tally.skipped += 1
                        tally.completed += 1
                        report()
                        continue
                    future = pool.submit(self._ask, row.position + 1, track, settings)
                    in_flight[future] = (row, track)
                tally.in_progress = len(in_flight)

                if not in_flight:
                    break
                finished, _ = wait(
                    tuple(in_flight), timeout=_POLL_SECONDS, return_when=FIRST_COMPLETED
                )
                for future in finished:
                    row, track = in_flight.pop(future)
                    result, finished_at = future.result()
                    self._record_track(job_id, row, track, result, finished_at, tally)
                    tally.in_progress = len(in_flight)
                    report()
        except BaseException:
            pool.shutdown(wait=False, cancel_futures=True)
            tally.in_progress = 0
            self._record_event(tally.result(), failed=True)
            raise
        pool.shutdown(wait=True)

        if tally.rewind:
            self._with_lock_retry(lambda: self._jobs.mark_waiting(job_id, tally.rewind))
            tally.completed = self._jobs.progress(job_id)[1]

        outcome = tally.result()
        report()
        self._record_event(outcome)
        return outcome

    # --------------------------------------------------------------- helpers

    def _question_for(self, job_id: str, row: MatchJobTrack) -> Optional[Track]:
        """Return what to ask the matcher about a plan row, or skip the row.

        Read on the writer's thread, just before the track is matched, so a
        track a refresh deleted a moment ago is found missing here rather than
        failing a write later.
        """
        stored = self._tracks.get(row.track_id)
        if stored is None:
            reason = "it is no longer in the library"
        else:
            try:
                return library_track_to_track(stored)
            except ValueError as exc:
                reason = str(exc)
        _logger.info("[clean-match] track %s skipped: %s", row.track_id, reason)
        self._with_lock_retry(lambda: self._jobs.mark_done(job_id, row.position))
        return None

    def _ask(
        self, idx: int, track: Track, settings: Dict[str, Any]
    ) -> Tuple[TrackResult, str]:
        """Match one track on a pool thread. Never raises: a failure is an answer.

        An exception becomes an error result shaped as the XML path shapes one,
        so it is stored as an ``error`` attempt — which, unlike an empty result,
        no later match mistakes for an answer.
        """
        started = time.perf_counter()
        try:
            result = self._processor.process_track(idx, track, settings)
            if not isinstance(result, TrackResult):
                raise TypeError(
                    f"process_track returned {type(result).__name__}, not a TrackResult"
                )
        except Exception as exc:  # noqa: BLE001 — stored as the attempt's error
            _logger.warning(
                "[clean-match] track %s could not be matched: %s",
                track.track_id,
                exc,
                exc_info=True,
            )
            result = TrackResult(
                playlist_index=idx,
                title=track.title,
                artist=track.artist,
                matched=False,
                error=str(exc) or type(exc).__name__,
                processing_time=time.perf_counter() - started,
                file_path=track.file_path,
            )
        return result, utc_now_iso()

    def _record_track(
        self,
        job_id: str,
        row: MatchJobTrack,
        track: Track,
        result: TrackResult,
        finished_at: str,
        tally: "_Tally",
    ) -> None:
        """Store one finished track and count it."""
        try:
            attempt, state = self._with_lock_retry(
                lambda: self._store(job_id, row, track, result, finished_at)
            )
        except sqlite3.IntegrityError as exc:
            if self._tracks.get(row.track_id) is None:
                # Deleted while it was being matched: a refresh may run beside
                # a match job, and this is the race that allows.
                _logger.info("[clean-match] track %s left mid-match", row.track_id)
                self._with_lock_retry(
                    lambda: self._jobs.mark_done(job_id, row.position)
                )
                tally.skipped += 1
                tally.completed += 1
                return
            _logger.warning(
                "[clean-match] track %s result refused: %s", row.track_id, exc
            )
            tally.unstored += 1
            return
        except ValueError as exc:
            _logger.warning(
                "[clean-match] track %s result refused: %s", row.track_id, exc
            )
            tally.unstored += 1
            return

        tally.completed += 1
        tally.count(attempt, state, result, row.position)

    def _store(
        self,
        job_id: str,
        row: MatchJobTrack,
        track: Track,
        result: TrackResult,
        finished_at: str,
    ) -> Tuple[MatchAttempt, Optional[TrackMatch]]:
        """The one transaction a finished track commits in."""
        with self._db.transaction():
            attempt = self._matches.add_attempt(
                row.track_id, job_id, result, track, finished_at=finished_at
            )
            self._jobs.mark_done(job_id, row.position)
            state = self._state_rule(attempt) if self._state_rule is not None else None
        return attempt, state

    def _with_lock_retry(self, write: Callable[[], _T]) -> _T:
        """Run a write, waiting out a locked database.

        Raises:
            sqlite3.IntegrityError: Unchanged — it is a fact about the row.
            MatchStorageError: If the database refuses for any other reason, or
                stays locked past :data:`LOCK_RETRY_SECONDS`.
        """
        deadline = time.monotonic() + LOCK_RETRY_SECONDS
        delay = 0.05
        while True:
            try:
                return write()
            except sqlite3.IntegrityError:
                raise
            except (sqlite3.Error, DatabaseError) as exc:
                if not _is_lock(exc):
                    raise MatchStorageError(
                        f"The library database would not save a match result: {exc}"
                    ) from exc
                if time.monotonic() >= deadline:
                    raise MatchStorageError(
                        "The library database stayed locked for"
                        f" {LOCK_RETRY_SECONDS:.0f} seconds"
                    ) from exc
                time.sleep(delay)
                delay = min(delay * 2, 1.0)

    def _record_event(self, result: MatchJobResult, failed: bool = False) -> None:
        """Record the one event a run writes (DEC-029). Never raises.

        The work is done and stored whether or not the feed can say so, and a
        job must not be reported failed because its summary could not be.
        """
        summary = describe(result)
        if failed:
            summary += " — stopped by an error"
        detail = result.to_dict()
        detail["failed"] = failed
        try:
            self._activity.record_event(EVENT_MATCH_FINISHED, summary, detail)
        except Exception as exc:  # noqa: BLE001 — the feed is a record, not a step
            _logger.warning("[clean-match] could not record the run: %s", exc)


@dataclass
class _Tally:
    """A run's counts as they change, on the writer's thread only."""

    plan: MatchPlan
    planned: int
    completed: int
    states_known: bool
    matched: int = 0
    no_match: int = 0
    errors: int = 0
    skipped: int = 0
    unstored: int = 0
    accepted: int = 0
    needs_review: int = 0
    in_progress: int = 0
    cancelled: bool = False
    search_unavailable: bool = False
    #: Positions of the tracks in the current run of empty results.
    streak: List[int] = field(default_factory=list)
    #: Positions to put back in the queue when the run ends.
    rewind: List[int] = field(default_factory=list)

    @property
    def stopping(self) -> bool:
        """True once no new track should start."""
        return self.cancelled or self.search_unavailable

    def count(
        self,
        attempt: MatchAttempt,
        state: Optional[TrackMatch],
        result: TrackResult,
        position: int,
    ) -> None:
        """Count a stored attempt, and watch for searches that stopped answering."""
        if attempt.outcome == OUTCOME_MATCHED:
            self.matched += 1
        elif attempt.outcome == OUTCOME_ERROR:
            self.errors += 1
        else:
            self.no_match += 1
        if state is not None:
            if state.state == STATE_ACCEPTED:
                self.accepted += 1
            elif state.state == STATE_NEEDS_REVIEW:
                self.needs_review += 1

        if attempt.outcome == OUTCOME_NO_MATCH and not result.candidates:
            if self.search_unavailable:
                self.rewind.append(position)
            else:
                self.streak.append(position)
                if len(self.streak) >= SEARCH_OUTAGE_STREAK:
                    self.search_unavailable = True
                    self.rewind.extend(self.streak)
        elif attempt.outcome != OUTCOME_ERROR:
            # Candidates came back, so search is answering. An error says
            # nothing either way about search, and leaves the streak alone.
            self.streak.clear()

    def result(self) -> MatchJobResult:
        """The counts so far, as a result."""
        return MatchJobResult(
            job_id=self.plan.job_id,
            planned=self.planned,
            selected=self.plan.selected,
            excluded=self.plan.excluded,
            rematch=self.plan.rematch,
            resumed_from=self.plan.resumed_from,
            completed=self.completed,
            matched=self.matched,
            no_match=self.no_match,
            errors=self.errors,
            skipped=self.skipped,
            unstored=self.unstored,
            accepted=self.accepted,
            needs_review=self.needs_review,
            in_progress=self.in_progress,
            cancelled=self.cancelled,
            search_unavailable=self.search_unavailable,
            states_known=self.states_known,
        )


def _is_lock(exc: BaseException) -> bool:
    """True when an error, or what caused it, is SQLite saying it is busy."""
    current: Optional[BaseException] = exc
    while current is not None:
        if isinstance(current, sqlite3.OperationalError):
            message = str(current).lower()
            if "locked" in message or "busy" in message:
                return True
        current = current.__cause__
    return False


def _tracks(count: int) -> str:
    """``"1 track"`` or ``"40 tracks"``."""
    return f"{count} track" if count == 1 else f"{count} tracks"


__all__ = (
    "EVENT_MATCH_FINISHED",
    "EVENT_MATCH_INTERRUPTED",
    "LOCK_RETRY_SECONDS",
    "SEARCH_OUTAGE_STREAK",
    "MatchDraft",
    "MatchJobResult",
    "MatchService",
    "MatchStorageError",
    "StateRule",
    "describe",
    "describe_interrupted",
)
