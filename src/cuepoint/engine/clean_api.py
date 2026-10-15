#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Clean over the wire (CLEAN-11).

CLEAN-02 through CLEAN-10 built matching, decisions, applying and hand edits,
reverting, file checks, duplicates, artwork and tag writes. This module is how
the renderer reaches every one of them, and how it reads Library Health
(DEC-075). A module of its own beside :mod:`cuepoint.engine.organization_api`,
for that module's reason: twenty routes are a file of their own.

Every handler validates and delegates
-------------------------------------
No rule about what a match state may be, what a BPM may be, which files a tag
write may open or what Health counts lives here. Those are the services', and
a copy in a handler is a second place for them to disagree. What lives here is
the wire: a body parsed into arguments, a refusal turned into a status, and an
explicit field list on the way out.

Statuses, stated once (:func:`status_for`)
------------------------------------------
- **400** for a request that cannot be honoured as written: a malformed body, a
  refused value, a selection naming nothing. Every service says these with a
  ``ValueError`` whose message names the field or clause, and it is passed on.
- **404** for something named that is not there: a track or an attempt in the
  path, a duplicate group, a match job, a tag write preview that was never made,
  has been forgotten, or has already been written.
- **409** when the request was fine and the library was not: a job holding the
  files or the library (``LIBRARY_BUSY``, with its id and type so the renderer
  can follow it), or a revert of a field that has changed since
  (``REVERT_STALE``).
- **503** when a service cannot be resolved; **500** for anything unrecognized.

Mutations are POSTs to action paths, reads are GETs, as Phase 6 kept them. Work
that runs as a job answers **202** with the job's identity — ``job_id``, ``id``
and ``state``, the shape every job route has — and the job endpoints follow it.
Work small enough to do on the request's thread answers **200** with its result.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from cuepoint.engine.api_errors import ApiError, bad_request, error_payload, not_found
from cuepoint.engine.revisions import LIBRARY, revision_cache
from cuepoint.models.filter_rule import FilterRuleError
from cuepoint.persistence.track_query import BrowseQueryError
from cuepoint.utils.quoting import quoted

#: A page of the file-write record. A write over a whole library records a row
#: per field per file, and nobody reads three hundred thousand of them at once.
WRITES_LIMIT_DEFAULT = 500
WRITES_LIMIT_MAX = 5000

#: The most duplicate groups one page of the listing holds (CLEAN-12). Without
#: ``limit`` the listing is every group, as CLEAN-11 answered it.
DUPLICATES_LIMIT_MAX = 500

#: What a decision may be. ``clear`` returns a track to what its latest answered
#: attempt says.
DECISION_ACCEPT = "accept"
DECISION_REJECT = "reject"
DECISION_CLEAR = "clear"
DECISIONS = (DECISION_ACCEPT, DECISION_REJECT, DECISION_CLEAR)

#: Export formats and the suffix each file must carry. ``xlsx`` is accepted as
#: another name for ``excel``, as the existing export route accepts it.
EXPORT_SUFFIXES = {"csv": ".csv", "json": ".json", "excel": ".xlsx"}

_MATCHES_ROUTE = re.compile(r"^/api/v1/library/tracks/([^/]+)/matches$")
_OVERRIDES_ROUTE = re.compile(r"^/api/v1/library/tracks/([^/]+)/overrides$")
_CANDIDATES_ROUTE = re.compile(r"^/api/v1/clean/attempts/([^/]+)/candidates$")
_FOLDER_ROUTE = re.compile(r"^/api/v1/library/tracks/([^/]+)/folder$")


class CleanUnavailableError(RuntimeError):
    """A Clean service could not be resolved: the database is unreachable."""


def _resolve(interface: Any) -> Any:
    """Resolve one service, per call: this module is imported before bootstrap."""
    try:
        from cuepoint.utils.di_container import get_container

        return get_container().resolve(interface)
    except Exception as exc:  # noqa: BLE001 — surfaced as a 503 to the caller
        raise CleanUnavailableError(str(exc)) from exc


def _service(name: str) -> Any:
    """Resolve an interface from ``services.interfaces`` by name."""
    from cuepoint.services import interfaces

    return _resolve(getattr(interfaces, name))


# ---------------------------------------------------------------------------
# Serializers — explicit field lists
# ---------------------------------------------------------------------------


def attempt_to_dict(attempt: Any) -> Dict[str, Any]:
    """Serialize one match attempt: what was asked, and what came back."""
    return {
        "id": attempt.id,
        "track_id": attempt.track_id,
        "job_id": attempt.job_id,
        "outcome": attempt.outcome,
        "score": attempt.score,
        "best_candidate_id": attempt.best_candidate_id,
        "error": attempt.error,
        "input": attempt.input,
        "queries": attempt.queries,
        "matcher_version": attempt.matcher_version,
        "started_at": attempt.started_at,
        "finished_at": attempt.finished_at,
    }


def candidate_to_dict(candidate: Any) -> Dict[str, Any]:
    """Serialize one candidate, every scored number and the reason it was refused."""
    return {
        "id": candidate.id,
        "attempt_id": candidate.attempt_id,
        "rank": candidate.rank,
        "is_winner": bool(candidate.is_winner),
        "guard_ok": bool(candidate.guard_ok),
        "reject_reason": candidate.reject_reason,
        "score": candidate.score,
        "base_score": candidate.base_score,
        "title_sim": candidate.title_sim,
        "artist_sim": candidate.artist_sim,
        "bonus_year": candidate.bonus_year,
        "bonus_key": candidate.bonus_key,
        "beatport_track_id": candidate.beatport_track_id,
        "url": candidate.url,
        "title": candidate.title,
        "artists": candidate.artists,
        "remixers": candidate.remixers,
        "label": candidate.label,
        "genre": candidate.genre,
        "subgenre": candidate.subgenre,
        "key": candidate.key,
        "bpm": candidate.bpm,
        "release_name": candidate.release_name,
        "release_date": candidate.release_date,
        "release_year": candidate.release_year,
        "artwork_url": candidate.artwork_url,
        "preview_url": candidate.preview_url,
        "query_index": candidate.query_index,
        "query_text": candidate.query_text,
        "candidate_index": candidate.candidate_index,
        "elapsed_ms": candidate.elapsed_ms,
    }


def compared_candidate_to_dict(candidate: Any, track: Optional[Any]) -> Dict[str, Any]:
    """A candidate, the version its title names, and how it differs from the track.

    What the Clean page's comparison draws (CLEAN-12). ``differs`` is null when
    there is no track to compare with.
    """
    from cuepoint.services.match_comparison import differences, mix_of

    return {
        **candidate_to_dict(candidate),
        "mix": mix_of(candidate.title),
        "differs": None if track is None else differences(track, candidate),
    }


def match_state_to_dict(track_id: int, match: Optional[Any]) -> Dict[str, Any]:
    """Serialize where a track stands. A track with no state is ``not_matched``."""
    from cuepoint.models.match_attempt import STATE_NOT_MATCHED

    if match is None:
        return {
            "track_id": int(track_id),
            "state": STATE_NOT_MATCHED,
            "decided_by": None,
            "attempt_id": None,
            "candidate_id": None,
            "newer_attempt_id": None,
            "disputed": False,
            "decided_at": None,
        }
    return {
        "track_id": match.track_id,
        "state": match.state,
        "decided_by": match.decided_by,
        "attempt_id": match.attempt_id,
        "candidate_id": match.candidate_id,
        "newer_attempt_id": match.newer_attempt_id,
        "disputed": match.is_disputed,
        "decided_at": match.decided_at,
    }


def file_write_to_dict(row: Any) -> Dict[str, Any]:
    """Serialize one row of the file-write record, unconfirmed ones marked."""
    return {
        "id": row.id,
        "job_id": row.job_id,
        "track_id": row.track_id,
        "file_path": row.file_path,
        "field": row.field,
        "old_value": row.old_value,
        "old_value_read": row.old_value_was_read,
        "new_value": row.new_value,
        "outcome": row.outcome,
        "reason": row.reason,
        "written_at": row.written_at,
        "pending": row.pending,
        "restore_of": row.restore_of,
    }


def _started(job: Any, answer: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
    """A job that started, with its identity in the shape every job route uses."""
    return 202, {**answer, "job_id": job.id, "id": job.id, "state": job.state.value}


def _track_row(track_id: int) -> Dict[str, Any]:
    """One track as the Library draws it, after an edit changed it."""
    from cuepoint.engine.library_api import track_to_dict

    library = _service("ILibraryService")
    track = library.get_track(int(track_id))
    if track is None:
        raise not_found("TRACK_NOT_FOUND", f"No track with id {track_id}")
    record = _service("IMetadataService").get(int(track_id))
    clean = library.clean_states([int(track_id)]).get(int(track_id))
    sources = library.override_sources([int(track_id)]).get(int(track_id))
    return track_to_dict(track, record, clean, sources)


def _require_track(track_id: int) -> Any:
    """Return the library track, or raise a 404."""
    track = _service("ILibraryService").get_track(int(track_id))
    if track is None:
        raise not_found("TRACK_NOT_FOUND", f"No track with id {track_id}")
    return track


# ---------------------------------------------------------------------------
# Bodies and query strings
# ---------------------------------------------------------------------------


def _body(raw: bytes) -> Dict[str, Any]:
    from cuepoint.engine.organization_api import parse_body

    result: Dict[str, Any] = parse_body(raw)
    return result


def _selection(data: Dict[str, Any]) -> Any:
    from cuepoint.engine.organization_api import parse_selection

    return parse_selection(data)


def _require_int(data: Dict[str, Any], key: str) -> int:
    value = data.get(key)
    if isinstance(value, bool) or not isinstance(value, int):
        raise bad_request(
            f"{key} is required and must be a whole number, not {value!r}"
        )
    return int(value)


def _optional_int(data: Dict[str, Any], key: str) -> Optional[int]:
    return None if data.get(key) is None else _require_int(data, key)


def _require_str(data: Dict[str, Any], key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise bad_request(f"{key} is required and must be a non-empty string")
    return value.strip()


def _optional_bool(data: Dict[str, Any], key: str, default: bool = False) -> bool:
    """A yes or no, refused rather than read for truthiness: ``"false"`` is not false."""
    if key not in data or data[key] is None:
        return default
    value = data[key]
    if not isinstance(value, bool):
        raise bad_request(f"{key} must be true or false, not {value!r}")
    return value


def _only(data: Dict[str, Any], allowed: Sequence[str]) -> None:
    """Refuse a key this route does not take, naming it and what it does take.

    A mistyped option silently ignored is a request that did something other
    than what its sender believes — on routes that write files, not acceptable.
    """
    unknown = sorted(str(key) for key in data if key not in allowed)
    if unknown:
        raise bad_request(
            f"Unknown field {', '.join(unknown)!r}. This request takes: "
            + ", ".join(allowed)
        )


def _one_of_track_or_selection(data: Dict[str, Any]) -> bool:
    """True for one track, False for a selection; refuse both or neither."""
    has_track = data.get("track_id") is not None
    has_selection = data.get("selection") is not None
    if has_track == has_selection:
        raise bad_request("Send either track_id or a selection, not both or neither")
    return has_track


def _query_value(params: Dict[str, List[str]], name: str) -> Optional[str]:
    values = params.get(name) or []
    if len(values) > 1:
        raise bad_request(f"{name} may be given once")
    raw = values[0] if values else None
    return None if raw is None or raw.strip() == "" else raw.strip()


def _query_int(params: Dict[str, List[str]], name: str) -> Optional[int]:
    raw = _query_value(params, name)
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        raise bad_request(f"{name} must be a number, not {raw!r}") from None


def _query_bool(params: Dict[str, List[str]], name: str) -> bool:
    raw = _query_value(params, name)
    if raw is None:
        return False
    if raw.lower() in ("true", "1"):
        return True
    if raw.lower() in ("false", "0"):
        return False
    raise bad_request(f"{name} must be true or false, not {raw!r}")


def _path_int(raw: str, what: str) -> int:
    try:
        return int(raw)
    except ValueError:
        raise bad_request(f"{what} must be a number, not {raw!r}") from None


def _batch_answer(result: Any, job: Any) -> Tuple[int, Dict[str, Any]]:
    """A batch that applied inline, or the job applying it (DEC-063)."""
    if job is not None:
        return _started(job, {})
    return 200, {"applied": result.to_dict()}


# ---------------------------------------------------------------------------
# Matching (CLEAN-03, CLEAN-04)
# ---------------------------------------------------------------------------


def start_match(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Start matching a selection on Beatport, as a resumable job (DEC-065)."""
    from cuepoint.engine.match_jobs import start_match_job

    _only(data, ("selection", "rematch", "label"))
    started = start_match_job(
        job_store,
        _selection(data),
        rematch=_optional_bool(data, "rematch"),
        label=_label(data),
    )
    return _started(started.job, started.to_dict())


def _label(data: Dict[str, Any]) -> Optional[str]:
    """The words a run is listed under: trimmed, never blank, a name not a paste."""
    from cuepoint.models.match_attempt import MAX_LABEL_LENGTH

    if data.get("label") is None:
        return None
    label = _require_str(data, "label")
    if len(label) > MAX_LABEL_LENGTH:
        raise bad_request(f"label is at most {MAX_LABEL_LENGTH} characters")
    return label


def resume_match(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Start a job over the tracks an interrupted match job left."""
    from cuepoint.engine.match_jobs import resume_match_job

    _only(data, ("job_id",))
    started = resume_match_job(job_store, _require_str(data, "job_id"))
    return _started(started.job, started.to_dict())


def resumable_matches(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """Every match job with tracks still waiting, newest first."""
    jobs = _service("IMatchService").resumable()
    return {
        "jobs": [
            {
                "job_id": waiting.job_id,
                "remaining": waiting.remaining,
                "planned": waiting.plan.planned,
                "selected": waiting.plan.selected,
                "excluded": waiting.plan.excluded,
                "rematch": waiting.plan.rematch,
                "created_at": waiting.plan.created_at,
                "resumed_from": waiting.plan.resumed_from,
            }
            for waiting in jobs
        ],
        "total": len(jobs),
    }


#: A page of past searches (C14): twenty by default, as the Match area lists them.
MATCH_JOBS_LIMIT_DEFAULT = 20
MATCH_JOBS_LIMIT_MAX = 200


def match_run_to_dict(run: Any) -> Dict[str, Any]:
    """Serialize one past search: a run and the resumes that finished it."""
    return {
        "job_id": run.job_id,
        "created_at": run.created_at,
        "label": run.label,
        "rematch": run.rematch,
        "selected": run.selected,
        "excluded": run.excluded,
        "planned": run.planned,
        "done": run.done,
        "found": run.found,
        "waiting": run.waiting,
        "not_found": run.not_found,
        "rejected": run.rejected,
        "disputed": run.disputed,
        "status": run.status,
        "finished_at": run.finished_at,
        "search_failed": run.search_failed,
        "latest_job_id": run.latest_job_id,
        "resume_job_id": run.resume_job_id,
    }


def past_matches(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """Past searches, newest first: one entry per run, however often it resumed.

    ``q`` finds text in a run's label or date; ``limit`` and ``offset`` page. The
    counts are the tracks' current state, so they move as matches are reviewed.
    """
    limit = _query_int(params, "limit")
    offset = _query_int(params, "offset")
    limit = MATCH_JOBS_LIMIT_DEFAULT if limit is None else limit
    offset = 0 if offset is None else offset
    if not 1 <= limit <= MATCH_JOBS_LIMIT_MAX:
        raise bad_request(f"limit must be between 1 and {MATCH_JOBS_LIMIT_MAX}")
    if offset < 0:
        raise bad_request("offset cannot be negative")
    runs, total = _service("IMatchJobRepository").history(
        _query_value(params, "q"), limit, offset
    )
    return {"jobs": [match_run_to_dict(run) for run in runs], "total": total}


#: The most rows one read of a review answers: a bigger run is read in pages.
REVIEW_LIMIT_MAX = 20000


def _review_candidate(candidate: Any) -> Dict[str, Any]:
    """The few facts of a candidate the review list draws; the rest is one click away."""
    from cuepoint.services.match_comparison import mix_of

    return {
        "id": candidate.id,
        "title": candidate.title,
        "artists": candidate.artists,
        "mix": mix_of(candidate.title),
        "key": candidate.key,
        "bpm": candidate.bpm,
        "label": candidate.label,
        "genre": candidate.genre,
        "release_year": candidate.release_year,
        "score": candidate.score,
        "guard_ok": bool(candidate.guard_ok),
    }


def match_review(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """Every track of a run or playlist, where each stands, and whether it is ticked.

    ``job_id`` is a run (its resumes included); ``playlist_id`` a playlist; with
    neither it is every matched track of the library. The statuses, the ticks and
    the counts are :mod:`cuepoint.engine.match_review`'s rule, so the table and
    the numbers above it cannot disagree, and they are for every track, whatever
    the page holds. A tick is the person's decision to sync a track's Beatport
    values (ticked is an accepted match, unticked a refused one); without a
    decision of theirs a sure match is ticked and a track with no match is not.

    Rows come in plan order and stay there as ticks change. ``limit`` (at most
    :data:`REVIEW_LIMIT_MAX`) and ``after`` page them; ``after`` is the ``cursor``
    of the last row read, which carries its own place in the order, so a page
    read on never skips or repeats a track. ``ticked_ids`` answers just the ids
    of the ticked tracks, which is what Sync takes to the files.

    The work is a few queries over the whole run, never one per track: states
    in chunks, the candidates of the proposals and refusals (their guards say
    what is ticked), and tracks and candidates for the page.
    """
    from cuepoint.engine import match_review as review
    from cuepoint.services.match_comparison import differences

    job_id = _query_value(params, "job_id")
    playlist_id = _query_int(params, "playlist_id")
    if job_id is not None and playlist_id is not None:
        raise bad_request("Review one run or one playlist, not both")
    limit = _query_int(params, "limit")
    limit = REVIEW_LIMIT_MAX if limit is None else limit
    after = _query_value(params, "after")
    if not 1 <= limit <= REVIEW_LIMIT_MAX:
        raise bad_request(f"limit must be between 1 and {REVIEW_LIMIT_MAX}")
    if after is not None and review.parse_cursor(after) is None:
        raise bad_request("after must be the cursor of a row of this review")

    jobs = _service("IMatchJobRepository")
    label: Optional[str] = None
    if job_id is not None:
        plan = jobs.get(job_id)
        if plan is None:
            raise not_found("MATCH_JOB_NOT_FOUND", "No match job has that id")
        label = plan.label
    entries = jobs.review_entries(job_id, playlist_id)
    ids = [track_id for track_id, _rank in entries]
    ranks = [rank for _track_id, rank in entries]

    matches = _service("IMatchRepository")
    states = matches.get_matches(ids)
    # The latest attempt only matters for a track with no state of its own.
    attempts = matches.latest_attempts(
        [
            track_id
            for track_id in ids
            if track_id not in states or states[track_id].state == "no_match"
        ]
    )
    # What a track points at: a proposal's guards say whether it is ticked, a
    # refusal's score what it reads as, and every row shows the match it has.
    # One read for the whole review, in chunks.
    pointed = matches.get_candidates(
        [state.candidate_id for state in states.values() if state.candidate_id]
    )

    def candidate_of(track_id: int) -> Any:
        state = states.get(track_id)
        return None if state is None else pointed.get(state.candidate_id)

    statuses: List[str] = []
    ticks: List[bool] = []
    for track_id in ids:
        state = states.get(track_id)
        candidate = candidate_of(track_id)
        status = review.status_of(state, attempts.get(track_id), candidate)
        statuses.append(status)
        ticks.append(review.ticked_of(state, status, candidate))
    base: Dict[str, Any] = {
        "job_id": job_id,
        "label": label,
        "total": len(ids),
        "counts": review.count_by_status(statuses),
        "ticked": sum(1 for tick in ticks if tick),
    }
    if _query_bool(params, "ticked_ids"):
        return {
            **base,
            "ids": [track_id for track_id, tick in zip(ids, ticks) if tick],
            "tracks": [],
        }

    order = list(range(len(ids)))
    place = None if after is None else review.parse_cursor(after)
    if place is not None:
        order = [index for index in order if (ranks[index], ids[index]) > place]
    page = order[:limit]
    tracks = {
        t.id: t for t in _service("ITrackRepository").get_many([ids[i] for i in page])
    }
    rows: List[Dict[str, Any]] = []
    for index in page:
        track_id = ids[index]
        track = tracks.get(track_id)
        if track is None:
            continue
        # A track the search found nothing for shows no match: a row with a dash.
        candidate = (
            candidate_of(track_id)
            if statuses[index] in (review.STATUS_MATCHED, review.STATUS_TO_CHECK)
            else None
        )
        rows.append(
            {
                "track_id": track_id,
                "title": track.title,
                "artist": track.artist,
                "status": statuses[index],
                "ticked": ticks[index],
                "disputed": review.is_disputed(states.get(track_id)),
                "tickable": review.is_tickable(statuses[index], candidate),
                "cursor": review.cursor_of(ranks[index], track_id),
                "candidate": (
                    None if candidate is None else _review_candidate(candidate)
                ),
                "differing": (
                    []
                    if candidate is None
                    else review.differing(differences(track, candidate))
                ),
            }
        )
    return {**base, "tracks": rows}


#: The most tracks one tick request names.
TICKS_LIMIT = REVIEW_LIMIT_MAX


def _tick_targets(data: Dict[str, Any]) -> List[int]:
    """The tracks a tick request is about: the ids it names, or a whole review."""
    named = data.get("track_ids")
    scope = data.get("scope")
    if (named is None) == (scope is None):
        raise bad_request("Name the track_ids to tick, or the scope of a whole review")
    if named is not None:
        if (
            not isinstance(named, list)
            or not named
            or len(named) > TICKS_LIMIT
            or not all(
                isinstance(entry, int) and not isinstance(entry, bool)
                for entry in named
            )
        ):
            raise bad_request(
                f"track_ids must be a list of 1 to {TICKS_LIMIT} whole numbers"
            )
        return list(dict.fromkeys(int(entry) for entry in named))
    if not isinstance(scope, dict):
        raise bad_request("scope must be an object: {} for the whole library")
    _only(scope, ("job_id", "playlist_id"))
    job_id = scope.get("job_id")
    playlist_id = _optional_int(scope, "playlist_id")
    if job_id is not None and not isinstance(job_id, str):
        raise bad_request("scope.job_id must be text")
    if job_id is not None and playlist_id is not None:
        raise bad_request("Tick one run or one playlist, not both")
    jobs = _service("IMatchJobRepository")
    if job_id is not None and jobs.get(job_id) is None:
        raise not_found("MATCH_JOB_NOT_FOUND", "No match job has that id")
    return [track_id for track_id, _rank in jobs.review_entries(job_id, playlist_id)]


def set_match_ticks(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Tick or untick tracks of a review: whether their Beatport values will be synced.

    Ticked is an accepted match of the person's, unticked a refused one, recorded
    as one batch in the match history like any decision of theirs (the answer
    names it, so a header tick can be taken back by reverting it). Only a track
    with a match can be ticked: the others are counted as ``skipped`` and left
    as they are. A track already as asked is left alone and not counted, so
    nothing is written for it. A tick of a whole review (``scope``) leaves a
    proposal the guards turned down unticked: it is ticked only by naming it.
    More than the batch threshold of decisions runs as a job. Refused while a
    match runs, which writes the same states. Nothing here touches a value or a
    file.
    """
    import uuid

    from cuepoint.engine import match_review as review
    from cuepoint.engine.match_sync import start_ticks_job
    from cuepoint.services.batch_service import BATCH_JOB_THRESHOLD

    _only(data, ("ticked", "track_ids", "scope"))
    wanted = data.get("ticked")
    if not isinstance(wanted, bool):
        raise bad_request("ticked must be true or false")
    if _active_match_job_id(job_store) is not None:
        raise ApiError(
            409,
            "MATCH_RUNNING",
            "A match is running: wait for it to end, or stop it, then tick.",
        )
    by_scope = data.get("scope") is not None
    ids = _tick_targets(data)
    matches = _service("IMatchRepository")
    states = matches.get_matches(ids)
    pointed = matches.get_candidates(
        [state.candidate_id for state in states.values() if state.candidate_id]
    )
    accept: List[Tuple[int, int]] = []
    reject: List[int] = []
    skipped = 0
    for track_id in ids:
        state = states.get(track_id)
        candidate = None if state is None else pointed.get(state.candidate_id)
        status = review.status_of(state, None, candidate)
        if candidate is None or not review.is_tickable(status, candidate):
            skipped += 1
        elif (
            wanted
            and by_scope
            and status == review.STATUS_TO_CHECK
            and not review.decided_by_user(state)
            and not candidate.guard_ok
        ):
            # Tick-all is not a yes to a proposal the guards turned down.
            skipped += 1
        elif review.ticked_of(state, status, candidate) != wanted:
            if wanted:
                accept.append((track_id, candidate.id))
            else:
                reject.append(track_id)
    batch_id = str(uuid.uuid4())
    if len(accept) + len(reject) > BATCH_JOB_THRESHOLD:
        job = start_ticks_job(job_store, accept, reject, batch_id, wanted, skipped)
        return _started(job, {"ticked": wanted, "batch_id": batch_id})
    changed = _service("IMatchStateService").decide_many(accept, reject, batch_id)
    return 200, {
        "ticked": wanted,
        "changed": changed,
        "skipped": skipped,
        "batch_id": batch_id if changed else None,
    }


def search_match(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Search Beatport for one track with the person's own words (the Review's Search panel).

    The results are scored by the matcher against the track as the library holds it
    and stored as an attempt, so they keep their scores and refusal reasons; accepting
    one is :func:`correct_match` with the candidate's id. Answers the attempt's
    candidates, and ``failure`` (the search's own kind) when the search itself
    failed, which is not the same as Beatport having nothing. Without a Beatport
    sign-in it answers 409 ``BEATPORT_SIGN_IN_NEEDED`` rather than searching in a way
    that cannot work.
    """
    from cuepoint.engine import match_search
    from cuepoint.models.config import SETTINGS
    from cuepoint.services.match_input import library_track_to_track

    _only(data, ("track_id", "query"))
    track_id = _require_int(data, "track_id")
    try:
        query = match_search.clean_query(data.get("query"))
    except ValueError as exc:
        raise bad_request(str(exc)) from exc
    if not query:
        raise bad_request("Type what to search Beatport for")
    stored = _require_track(track_id)
    if _active_match_job_id(job_store) is not None:
        # One match at a time: a hand search writes an attempt and a state, which a
        # match job running beside it is also writing.
        raise ApiError(
            409,
            "MATCH_RUNNING",
            "A match is running: wait for it to end, or stop it, then search.",
        )
    if not match_search.signed_in():
        raise ApiError(
            409,
            "BEATPORT_SIGN_IN_NEEDED",
            "Sign in to Beatport in Settings to search from CuePoint.",
        )
    track = library_track_to_track(stored)
    answered = match_search.search_track(
        track_id,
        track,
        query,
        _service("IMatcherService"),
        _service("IMatchRepository"),
        float(str(SETTINGS.get("MIN_ACCEPT_SCORE", 70))),
    )
    from cuepoint.engine import match_review as review

    listed = attempt_candidates(answered["attempt_id"])
    for entry in listed["candidates"]:
        # What differs from the track, in the review list's words, so a row can be drawn at once.
        entry["differing"] = review.differing(entry["differs"])
    return 200, {
        **listed,
        "query": query,
        "failure": answered["failure"],
        "failure_message": match_search.failure_words(answered["failure"]),
        "state": match_state_to_dict(
            track_id, _service("IMatchRepository").get_match(track_id)
        ),
    }


def track_matches(track_id: int) -> Dict[str, Any]:
    """A track's state, the candidate it points at, and every attempt, newest first.

    ``track`` is the track's imported values, the side of the comparison the
    candidates are marked against (CLEAN-12).
    """
    from cuepoint.services.match_comparison import compared_track

    track = _require_track(track_id)
    repository = _service("IMatchRepository")
    match = repository.get_match(int(track_id))
    candidate = (
        repository.get_candidate(match.candidate_id)
        if match is not None and match.candidate_id is not None
        else None
    )
    attempts = repository.attempts_for(int(track_id))
    return {
        "track_id": int(track_id),
        "track": compared_track(track),
        "state": match_state_to_dict(int(track_id), match),
        "candidate": (
            None if candidate is None else compared_candidate_to_dict(candidate, track)
        ),
        "attempts": [attempt_to_dict(attempt) for attempt in attempts],
        "total": len(attempts),
    }


def attempt_candidates(attempt_id: int) -> Dict[str, Any]:
    """One attempt's candidates, in the order the matcher scored them.

    Each is marked against the track as it was imported. An attempt outlives
    nothing it belongs to — deleting a track deletes its attempts — so the track
    is there; ``differs`` is null only if it is not.
    """
    repository = _service("IMatchRepository")
    attempt = repository.get_attempt(int(attempt_id))
    if attempt is None:
        raise not_found("ATTEMPT_NOT_FOUND", f"No match attempt with id {attempt_id}")
    track = _service("ILibraryService").get_track(int(attempt.track_id))
    candidates = repository.candidates_for(int(attempt_id))
    return {
        "attempt_id": attempt.id,
        "track_id": attempt.track_id,
        "candidates": [
            compared_candidate_to_dict(candidate, track) for candidate in candidates
        ],
        "total": len(candidates),
    }


def track_folder(track_id: int) -> Dict[str, Any]:
    """Where "show in folder" can take a person for one track (CLEAN-07, CLEAN-12).

    ``file_exists`` says the file itself can be shown. Otherwise ``folder`` is
    the nearest folder on its path that still exists, and ``null`` says plainly
    that nothing on the path does — the drive itself is gone. The renderer
    names a library track, never a path, so this reveals nothing about a place
    the library does not already point at.
    """
    import os

    from cuepoint.services.file_check_service import nearest_existing_folder

    track = _require_track(track_id)
    path = str(track.file_path or "")
    exists = bool(path) and os.path.isfile(path)
    return {
        "track_id": int(track_id),
        "file_path": path,
        "file_exists": exists,
        "folder": (
            os.path.dirname(path)
            if exists
            else (nearest_existing_folder(path) if path else None)
        ),
    }


def decide(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Accept a candidate, reject, or clear — for one track or a selection.

    A selection is decided through DEC-063's batch: accepting confirms what each
    track's state proposes, and rejecting refuses it, for tracks nobody has
    decided (CLEAN-04). Clearing is refused for a selection. It would undo
    people's decisions in bulk, and CLEAN-04 settled that overriding a person's
    decision is a per-track act; reverting the batch that made them is the bulk
    form, and it takes back exactly that batch.
    """
    from cuepoint.engine.batch_jobs import apply_or_start
    from cuepoint.services.batch_service import (
        OPERATION_ACCEPT_MATCH,
        OPERATION_REJECT_MATCH,
        BatchOperation,
    )

    _only(data, ("decision", "track_id", "candidate_id", "selection"))
    decision = _require_str(data, "decision").lower()
    if decision not in DECISIONS:
        raise bad_request(
            f"decision must be one of {', '.join(DECISIONS)}, not {decision!r}"
        )
    candidate_id = _optional_int(data, "candidate_id")
    if decision != DECISION_ACCEPT and candidate_id is not None:
        raise bad_request(f"A {decision} names no candidate")

    if _one_of_track_or_selection(data):
        track_id = _require_int(data, "track_id")
        _require_track(track_id)
        states = _service("IMatchStateService")
        if decision == DECISION_ACCEPT:
            if candidate_id is None:
                raise bad_request("An accept names the candidate_id it accepts")
            match = states.accept(track_id, candidate_id)
        elif decision == DECISION_REJECT:
            match = states.reject(track_id)
        else:
            match = states.clear_decision(track_id)
        # ``match``, not ``state``: every job answer carries ``state`` as the
        # job's, and a decision that may be either must not reuse the name.
        return 200, {"match": match_state_to_dict(track_id, match)}

    if decision == DECISION_CLEAR:
        raise bad_request(
            "Clearing decisions is done one track at a time. To take back a batch"
            " of decisions, undo that batch"
        )
    if candidate_id is not None:
        raise bad_request(
            "A selection accepts the candidate each track proposes; name a"
            " candidate_id only for one track"
        )
    kind = (
        OPERATION_ACCEPT_MATCH
        if decision == DECISION_ACCEPT
        else OPERATION_REJECT_MATCH
    )
    result, job = apply_or_start(job_store, _selection(data), BatchOperation(kind))
    return _batch_answer(result, job)


# ---------------------------------------------------------------------------
# Applying, hand edits and reverting (CLEAN-05, CLEAN-06)
# ---------------------------------------------------------------------------


def _fields(data: Dict[str, Any]) -> List[str]:
    fields = data.get("fields")
    if (
        not isinstance(fields, list)
        or not fields
        or not all(isinstance(name, str) for name in fields)
    ):
        raise bad_request("fields must be a non-empty list of field names")
    return list(fields)


def apply_match(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Copy chosen fields from decided candidates into CuePoint's layer (DEC-004)."""
    from cuepoint.engine.batch_jobs import apply_or_start
    from cuepoint.services.batch_service import OPERATION_APPLY_MATCH, BatchOperation

    _only(data, ("fields", "track_id", "selection"))
    fields = _fields(data)
    if _one_of_track_or_selection(data):
        track_id = _require_int(data, "track_id")
        _require_track(track_id)
        _service("IMatchApplyService").apply_match(track_id, fields)
        return 200, {"track": _track_row(track_id)}
    result, job = apply_or_start(
        job_store, _selection(data), BatchOperation(OPERATION_APPLY_MATCH, fields)
    )
    return _batch_answer(result, job)


def preview_apply(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Count what applying would change, for the dialog's button. Reads only, no job."""
    from cuepoint.services.match_apply import chosen_fields
    from cuepoint.services.override_values import NOTATION_CLASSIC

    # A selection only: the dialog counts the tracks it will apply to, never one track.
    _only(data, ("fields", "selection"))
    chosen = chosen_fields(_fields(data))
    track_ids = _service("IBatchService").resolve(_selection(data))
    # No key is applied (DEC-201), as in apply_match, so the notation is moot.
    tracks, per_field = _service("IMatchApplyService").would_change(
        track_ids, chosen, NOTATION_CLASSIC
    )
    return 200, {"tracks": tracks, "fields": per_field}


def correct_match(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Accept a candidate and copy the ticked fields as one act (C14, DEC-068).

    The Match area's Correct. For one track, ``candidate_id`` is the candidate on
    screen and everything it writes shares one ``batch_id``, so "Undo" is the
    existing revert-batch. ``fields`` may be empty (accept alone) and never holds
    the key: ``replace_key`` clears a key that is the person's own so Beatport's
    shows (DEC-201). A selection accepts what each track proposes and copies the
    fields, as a batch (DEC-063). ``/clean/decide`` and ``/clean/apply`` keep
    their own shapes.
    """
    from cuepoint.engine.batch_jobs import apply_or_start
    from cuepoint.services.batch_service import OPERATION_CORRECT_MATCH, BatchOperation
    from cuepoint.services.match_correct import correct_fields

    _only(data, ("track_id", "candidate_id", "selection", "fields", "replace_key"))
    fields = correct_fields(_fields_list(data))
    replace_key = _optional_bool(data, "replace_key")
    if _one_of_track_or_selection(data):
        track_id = _require_int(data, "track_id")
        _require_track(track_id)
        if data.get("candidate_id") is None:
            raise bad_request("A correct names the candidate_id it accepts")
        candidate_id = _require_int(data, "candidate_id")
        if _service("IMatchRepository").get_candidate(candidate_id) is None:
            raise not_found(
                "CANDIDATE_NOT_FOUND", f"No candidate with id {candidate_id}"
            )
        outcome = _service("IMatchCorrectService").correct(
            track_id, candidate_id, fields, replace_key=replace_key
        )
        return 200, {
            "match": match_state_to_dict(track_id, outcome.match),
            "track": _track_row(track_id),
            "batch_id": outcome.batch_id,
            "changed": outcome.changed,
            "applied": outcome.applied,
            "skipped": outcome.skipped,
            "unchanged": outcome.unchanged,
            "key": outcome.key,
        }
    if data.get("candidate_id") is not None:
        raise bad_request(
            "A selection accepts the candidate each track proposes; name a"
            " candidate_id only for one track"
        )
    result, job = apply_or_start(
        job_store,
        _selection(data),
        BatchOperation(
            OPERATION_CORRECT_MATCH, {"fields": fields, "replace_key": replace_key}
        ),
    )
    return _batch_answer(result, job)


def _fields_list(data: Dict[str, Any]) -> List[Any]:
    """The ``fields`` of a correct: a list that may be empty, named or not."""
    fields = data.get("fields")
    if not isinstance(fields, list) or not all(isinstance(n, str) for n in fields):
        raise bad_request("fields must be a list of field names (it may be empty)")
    return fields


def set_overrides(track_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    """Hand-edit any of one track's key, BPM, genre, label and year (DEC-068).

    Only the fields present; ``null`` clears an override and Rekordbox's value
    shows through. Every field of one request is one transaction, so a refused
    value leaves the others unwritten too.
    """
    from cuepoint.models.track_metadata import OVERRIDE_FIELDS

    _require_track(track_id)
    _only(data, OVERRIDE_FIELDS)
    if not data:
        raise bad_request("Nothing to set: send any of " + ", ".join(OVERRIDE_FIELDS))
    _service("IMetadataService").set_overrides(int(track_id), data)
    return {"track": _track_row(track_id)}


def revert_change(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Revert one recorded change to a CuePoint field (CLEAN-06)."""
    _only(data, ("change_id",))
    reverted = _service("IRevertService").revert_change(_require_int(data, "change_id"))
    return 200, {
        "revert": {
            "change_id": reverted.change_id,
            "track_id": reverted.track_id,
            "field": reverted.field,
            "previous_value": reverted.previous_value,
            "restored_value": reverted.restored_value,
            "changed": reverted.changed,
        }
    }


def revert_batch(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Revert every change a batch made, inline or as a job (CLEAN-06)."""
    from cuepoint.engine.batch_jobs import revert_or_start

    _only(data, ("batch_id", "track_id"))
    track_id = _optional_int(data, "track_id")
    if track_id is not None:
        # One track out of a batch that covered many (Undo on a row after Accept all):
        # always inline, since it is the changes of one track.
        reverted = _service("IRevertService").revert_batch(
            _require_str(data, "batch_id"), track_id=track_id
        )
        return 200, {"reverted": reverted.to_dict()}
    result, job = revert_or_start(job_store, _require_str(data, "batch_id"))
    if job is not None:
        return _started(job, {})
    assert result is not None  # revert_or_start answers exactly one of the two
    return 200, {"reverted": result.to_dict()}


# ---------------------------------------------------------------------------
# Files, duplicates and artwork (CLEAN-07, CLEAN-08, CLEAN-09)
# ---------------------------------------------------------------------------


def check_files(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Start checking the files of a selection (DEC-073)."""
    from cuepoint.engine.file_check_jobs import start_file_check_job

    _only(data, ("selection",))
    started = start_file_check_job(job_store, _selection(data))
    return _started(started.job, started.to_dict())


def scan_duplicates(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Start a duplicate scan for some signals, or all of them (DEC-074)."""
    from cuepoint.engine.duplicate_jobs import start_duplicate_scan_job

    _only(data, ("signals",))
    signals = data.get("signals")
    if signals is not None and (
        not isinstance(signals, list) or not all(isinstance(s, str) for s in signals)
    ):
        raise bad_request("signals must be a list of signal names")
    started = start_duplicate_scan_job(job_store, signals)
    return _started(started.job, started.to_dict())


def _member_rows(track_ids: Sequence[int]) -> Dict[int, Dict[str, Any]]:
    """Library rows for a page of group members, read in four queries."""
    from cuepoint.engine.library_api import track_to_dict

    if not track_ids:
        return {}
    tracks = _service("ITrackRepository").get_many(track_ids)
    ids = [int(track.id) for track in tracks if track.id is not None]
    metadata = _service("IMetadataService").get_many(ids) if ids else {}
    library = _service("ILibraryService")
    clean = library.clean_states(ids) if ids else {}
    sources = library.override_sources(ids) if ids else {}
    return {
        int(track.id): track_to_dict(
            track, metadata.get(track.id), clean.get(track.id), sources.get(track.id)
        )
        for track in tracks
        if track.id is not None
    }


def duplicate_groups(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """The stored groups of two or more, dismissed ones only when asked.

    Each group carries ``members``: its tracks as the Library draws them, so a
    person can tell two files apart without opening each (CLEAN-12). ``limit``
    and ``offset`` page the groups; without ``limit`` every group is listed, as
    CLEAN-11 answered, and ``total`` is always every group.
    """
    signal = _query_value(params, "signal")
    include_dismissed = _query_bool(params, "include_dismissed")
    requested = _query_int(params, "limit")
    limit = (
        None if requested is None else max(1, min(int(requested), DUPLICATES_LIMIT_MAX))
    )
    offset = max(0, _query_int(params, "offset") or 0)
    service = _service("IDuplicateService")
    page = service.groups(
        signal, include_dismissed=include_dismissed, limit=limit, offset=offset
    )
    total = service.count_groups(signal, include_dismissed=include_dismissed)
    rows = _member_rows([track_id for group in page for track_id in group.track_ids])
    return {
        "groups": [
            {
                **group.to_dict(),
                "members": [
                    rows[track_id] for track_id in group.track_ids if track_id in rows
                ],
            }
            for group in page
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def dismiss_duplicates(
    data: Dict[str, Any], job_store: Any
) -> Tuple[int, Dict[str, Any]]:
    """Mark a group "not duplicates" for the members it has now."""
    _only(data, ("group_id",))
    group = _service("IDuplicateService").dismiss(_require_int(data, "group_id"))
    return 200, {"group": group.to_dict()}


def restore_duplicates(
    data: Dict[str, Any], job_store: Any
) -> Tuple[int, Dict[str, Any]]:
    """Take a dismissal back, which a mis-click needs."""
    _only(data, ("group_id",))
    group = _service("IDuplicateService").restore(_require_int(data, "group_id"))
    return 200, {"group": group.to_dict()}


def scan_artwork(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Start reading a selection's artwork, optionally fetching Beatport's (DEC-076)."""
    from cuepoint.engine.artwork_jobs import start_artwork_scan_job

    _only(data, ("selection", "fetch_beatport"))
    started = start_artwork_scan_job(
        job_store,
        _selection(data),
        fetch_beatport=_optional_bool(data, "fetch_beatport"),
    )
    return _started(started.job, started.to_dict())


# ---------------------------------------------------------------------------
# Tag writes (CLEAN-10, DEC-070)
# ---------------------------------------------------------------------------


def preview_tags(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Say what a tag write would change, inline or as a job whose id is the preview's."""
    from cuepoint.engine.tag_write_jobs import preview_or_start
    from cuepoint.services.tag_write_options import TagWriteOptions

    _only(data, ("selection", "options"))
    options = TagWriteOptions.from_request(data.get("options"))
    preview, job = preview_or_start(job_store, _selection(data), options)
    if job is not None:
        return _started(job, {"preview_id": job.id})
    assert preview is not None  # preview_or_start answers exactly one of the two
    return 200, {"preview": preview.to_dict()}


def _sync_options(raw: Any) -> Any:
    """A Sync's options, where a request that does not name the comment does not write it.

    The tag writer's own default writes the comment; Sync is about the values a
    match found, so a request from before the Sync window had a Comment row
    (it never named ``write_comment``) keeps meaning what it meant.
    """
    if isinstance(raw, dict) and "write_comment" not in raw:
        return {**raw, "write_comment": False}
    if raw is None:
        return {"write_comment": False}
    return raw


def sync_preview(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Say what a Sync would change in the files. Writes nothing, anywhere.

    The Beatport match's BPM, Genre, Label and Year are laid over what each
    track shows, in memory, and the files are read as the Save window's preview
    reads them. The key a track already shows keeps winning. The answer is a
    tag-write preview, kept under its id for :func:`start_sync`.

    ``options.write_comment`` with ``options.comment_text`` also writes the file's
    comment (the one Rekordbox lists as Comments): text the person typed, not a
    Beatport value. It is written only when asked, and "Keep values already in
    the files" (``keep_existing``) leaves a comment the file already holds alone.
    """
    from cuepoint.engine.match_sync import preview_sync
    from cuepoint.services.tag_write_options import TagWriteOptions

    _only(data, ("selection", "options"))
    options = TagWriteOptions.from_request(_sync_options(data.get("options")))
    preview, job = preview_sync(job_store, _selection(data), options)
    if job is not None:
        return _started(job, {"preview_id": job.id})
    assert preview is not None
    return 200, {"preview": preview.to_dict()}


def start_sync(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Write the files from a Sync preview, then record the decisions and values.

    One job: the files first, then (only for what was written) the ticked tracks
    are accepted and the values each file got are copied into CuePoint's own, as
    one batch named by the job's id. Undoing the save restores both.
    """
    from cuepoint.engine.match_sync import start_sync_job
    from cuepoint.services.tag_write_options import TagWriteOptions

    _only(data, ("preview_id", "options"))
    preview_id = _require_str(data, "preview_id")
    options = (
        None
        if data.get("options") is None
        else TagWriteOptions.from_request(_sync_options(data["options"]))
    )
    job = start_sync_job(job_store, preview_id, options)
    return _started(job, {"preview_id": preview_id})


def write_tags(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Write what a preview planned, once.

    ``options``, when named, choose what to write from what the preview covered
    (C29); without them the write is the preview's own. Options the preview did
    not cover are a 400, before any job starts.
    """
    from cuepoint.engine.tag_write_jobs import start_tag_write_job
    from cuepoint.services.tag_write_options import TagWriteOptions

    _only(data, ("preview_id", "options"))
    preview_id = _require_str(data, "preview_id")
    options = (
        None
        if data.get("options") is None
        else TagWriteOptions.from_request(data["options"])
    )
    job = start_tag_write_job(job_store, preview_id, options)
    return _started(job, {"preview_id": preview_id})


def count_tag_write(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Count what writing some options from a kept preview would change.

    Answered from the preview in memory, with no file read, so a save window can
    ask on every tick. The preview is kept, not taken.
    """
    from cuepoint.engine.tag_write_jobs import count_tag_preview, get_preview_store
    from cuepoint.services.tag_write_options import TagWriteOptions
    from cuepoint.services.tag_write_service import count_fields

    _only(data, ("preview_id", "options"))
    preview_id = _require_str(data, "preview_id")
    raw = data.get("options")
    if not isinstance(raw, dict):
        raise bad_request("options is required and must be an object")
    if TagWriteOptions.nothing_ticked(raw):
        # Nothing ticked is a count of nothing, not a bad request.
        get_preview_store().get(preview_id)
        return 200, {"files": 0, "fields": count_fields(())}
    options = TagWriteOptions.from_request(raw)
    return 200, count_tag_preview(preview_id, options)


def _writes_scope(job_id: Optional[str], track_id: Optional[int]) -> None:
    if (job_id is None) == (track_id is None):
        raise bad_request("Name a job_id or a track_id, not both or neither")


def restore_tags(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Restore what a write job, or every write to a track, replaced.

    The answer says how many of the writes it covers are unconfirmed — recorded
    by a write the engine never saw finish — so the renderer can say so before
    the restore rather than after.
    """
    from cuepoint.engine.tag_write_jobs import start_tag_restore_job

    _only(data, ("job_id", "track_id"))
    job_id = data.get("job_id")
    if job_id is not None:
        job_id = _require_str(data, "job_id")
    track_id = _optional_int(data, "track_id")
    _writes_scope(job_id, track_id)
    _, unconfirmed = _service("IFileWriteRepository").restorable_counts(
        job_id=job_id, track_id=track_id
    )
    started = start_tag_restore_job(job_store, job_id=job_id, track_id=track_id)
    return _started(started.job, {**started.to_dict(), "unconfirmed": unconfirmed})


def tag_writes(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """A page of a write job's or a track's record, unconfirmed rows marked and counted."""
    job_id = _query_value(params, "job_id")
    track_id = _query_int(params, "track_id")
    _writes_scope(job_id, track_id)
    requested = _query_int(params, "limit")
    limit = (
        WRITES_LIMIT_DEFAULT
        if requested is None
        else max(1, min(int(requested), WRITES_LIMIT_MAX))
    )
    offset = max(0, _query_int(params, "offset") or 0)
    repository = _service("IFileWriteRepository")
    total, unconfirmed = repository.counts(job_id=job_id, track_id=track_id)
    rows = repository.page(job_id=job_id, track_id=track_id, limit=limit, offset=offset)
    restorable, restorable_unconfirmed = repository.restorable_counts(
        job_id=job_id, track_id=track_id
    )
    return {
        "job_id": job_id,
        "track_id": track_id,
        "writes": [file_write_to_dict(row) for row in rows],
        "total": total,
        "unconfirmed": unconfirmed,
        "restorable": restorable,
        "restorable_unconfirmed": restorable_unconfirmed,
        "limit": limit,
        "offset": offset,
    }


# ---------------------------------------------------------------------------
# Health and export (DEC-075)
# ---------------------------------------------------------------------------


def library_health(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """Every Health count, each with the rule set whose count it is."""

    # C19b: counts, last-run times and unavailable roots are all read from the
    # library database (the rule sets are constants in code, not config, and no
    # file is stat'ed), so the answer holds until the library changes.
    def compute() -> Dict[str, Any]:
        result: Dict[str, Any] = _service("IHealthService").report().to_dict()
        return result

    return revision_cache(
        "clean/health", dict(sorted(params.items())), (LIBRARY,), compute
    )  # shared answer: serialise only, never mutate


def export_review(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Write a selection's match states and decided candidates to a file.

    The path is one a save dialog chose. It must be absolute and carry the
    format's own suffix, so an export cannot be pointed at a file of another
    kind, and an existing file is replaced only when ``overwrite`` says so.
    """
    _only(data, ("selection", "format", "file_path", "overwrite"))
    file_format = _require_str(data, "format").lower()
    if file_format == "xlsx":
        file_format = "excel"
    suffix = EXPORT_SUFFIXES.get(file_format)
    if suffix is None:
        raise bad_request(
            f"format must be one of csv, json, excel, not {data.get('format')!r}"
        )
    file_path = _require_str(data, "file_path")
    path = Path(file_path)
    if not path.is_absolute():
        raise bad_request(
            f"file_path must be an absolute path, not {quoted(file_path)}"
        )
    if path.suffix.lower() != suffix:
        raise bad_request(f"A {file_format} export is written to a {suffix} file")
    overwrite = _optional_bool(data, "overwrite")
    if path.exists() and not overwrite:
        raise ApiError(
            409,
            "EXPORT_FILE_EXISTS",
            f"{path.name!r} already exists. Send overwrite to replace it",
            file_path=file_path,
        )
    if path.exists() and not path.is_file():
        raise bad_request(f"{quoted(file_path)} is not a file")
    written = _service("IReviewExportService").export(
        _selection(data), file_format, str(path), overwrite=overwrite
    )
    return 200, written.to_dict()


# ---------------------------------------------------------------------------
# Where playlists stand, and what is not in the files yet (G4 2.1, 2.2)
# ---------------------------------------------------------------------------


def _counts_to_dict(counts: Any, running: Any) -> Dict[str, Any]:
    return {
        "track_count": counts.track_count,
        "not_matched": counts.not_matched,
        "waiting": counts.waiting,
        "accepted": counts.accepted,
        "rejected": counts.rejected,
        "no_match": counts.no_match,
        "unsaved": counts.unsaved,
        "running": (
            None
            if running is None
            else {
                "job_id": running.job_id,
                "done": running.done,
                "total": running.total,
            }
        ),
    }


def _active_match_job_id(job_store: Any) -> Optional[str]:
    """The id of the match job that is queued or running, if there is one."""
    from cuepoint.engine.jobs import _ACTIVE_STATES
    from cuepoint.engine.match_jobs import JOB_TYPE_CLEAN_MATCH

    if job_store is None:
        return None
    for job in job_store.list_all():
        if job.type == JOB_TYPE_CLEAN_MATCH and job.state.value in _ACTIVE_STATES:
            return str(job.id)
    return None


def clean_playlists(params: Dict[str, List[str]], job_store: Any) -> Dict[str, Any]:
    """Every playlist with what it needs next, and the whole library's counts."""
    statuses = _service("IMatchStatusService").playlists(
        _active_match_job_id(job_store)
    )
    return {
        "playlists": [
            {
                "id": status.id,
                "name": status.name,
                "path": status.path,
                **_counts_to_dict(status.counts, status.running),
                # In the files: something was written and nothing waits to be.
                "synced": status.last_written_at is not None
                and status.counts.unsaved == 0,
                "synced_at": (
                    status.last_written_at if status.counts.unsaved == 0 else None
                ),
            }
            for status in statuses.playlists
        ],
        "whole_library": _counts_to_dict(
            statuses.whole_library, statuses.whole_library_running
        ),
    }


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

_GET_ROUTES: Dict[str, Callable[[Dict[str, List[str]]], Dict[str, Any]]] = {
    "/api/v1/clean/match/resumable": resumable_matches,
    "/api/v1/clean/match/jobs": past_matches,
    "/api/v1/clean/match/review": match_review,
    "/api/v1/clean/duplicates": duplicate_groups,
    "/api/v1/clean/tags/writes": tag_writes,
    "/api/v1/clean/health": library_health,
}

#: GET routes that also read the engine's jobs (the playlists' running match).
_STORE_GET_ROUTES: Dict[str, Callable[[Dict[str, List[str]], Any], Dict[str, Any]]] = {
    "/api/v1/clean/playlists": clean_playlists,
}

_POST_ROUTES: Dict[str, Callable[[Dict[str, Any], Any], Tuple[int, Dict[str, Any]]]] = {
    "/api/v1/clean/match": start_match,
    "/api/v1/clean/match/resume": resume_match,
    "/api/v1/clean/match/search": search_match,
    "/api/v1/clean/match/ticks": set_match_ticks,
    "/api/v1/clean/decide": decide,
    "/api/v1/clean/apply": apply_match,
    "/api/v1/clean/apply-preview": preview_apply,
    "/api/v1/clean/correct": correct_match,
    "/api/v1/library/revert": revert_change,
    "/api/v1/library/revert/batch": revert_batch,
    "/api/v1/clean/files/check": check_files,
    "/api/v1/clean/duplicates/scan": scan_duplicates,
    "/api/v1/clean/duplicates/dismiss": dismiss_duplicates,
    "/api/v1/clean/duplicates/restore": restore_duplicates,
    "/api/v1/clean/artwork/scan": scan_artwork,
    "/api/v1/clean/sync-preview": sync_preview,
    "/api/v1/clean/sync": start_sync,
    "/api/v1/clean/tags/preview": preview_tags,
    "/api/v1/clean/tags/preview/count": count_tag_write,
    "/api/v1/clean/tags/write": write_tags,
    "/api/v1/clean/tags/restore": restore_tags,
    "/api/v1/clean/export": export_review,
}

#: Every literal path this module answers, for tests and the contract.
GET_PATHS: Tuple[str, ...] = (*_GET_ROUTES, *_STORE_GET_ROUTES)
POST_PATHS: Tuple[str, ...] = tuple(_POST_ROUTES)


def handles_get(path: str) -> bool:
    """True when this module answers a GET for ``path``."""
    return (
        path in _GET_ROUTES
        or path in _STORE_GET_ROUTES
        or _MATCHES_ROUTE.match(path) is not None
        or _CANDIDATES_ROUTE.match(path) is not None
        or _FOLDER_ROUTE.match(path) is not None
    )


def handles_post(path: str) -> bool:
    """True when this module answers a POST for ``path``."""
    return path in _POST_ROUTES or _OVERRIDES_ROUTE.match(path) is not None


def handle_get(
    path: str, params: Dict[str, List[str]], *, job_store: Any = None
) -> Tuple[int, Dict[str, Any]]:
    """Answer a GET, or raise."""
    match = _MATCHES_ROUTE.match(path)
    if match:
        return 200, track_matches(_path_int(match.group(1), "track id"))
    match = _CANDIDATES_ROUTE.match(path)
    if match:
        return 200, attempt_candidates(_path_int(match.group(1), "attempt id"))
    match = _FOLDER_ROUTE.match(path)
    if match:
        return 200, track_folder(_path_int(match.group(1), "track id"))
    store_handler = _STORE_GET_ROUTES.get(path)
    if store_handler is not None:
        return 200, store_handler(params, job_store)
    handler = _GET_ROUTES.get(path)
    if handler is None:
        raise not_found("NOT_FOUND", "Unknown path")
    return 200, handler(params)


def handle_post(path: str, raw: bytes, *, job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Answer a POST, or raise."""
    match = _OVERRIDES_ROUTE.match(path)
    if match:
        track_id = _path_int(match.group(1), "track id")
        return 200, set_overrides(track_id, _body(raw))
    handler = _POST_ROUTES.get(path)
    if handler is None:
        raise not_found("NOT_FOUND", "Unknown path")
    return handler(_body(raw), job_store)


def status_for(exc: BaseException) -> Tuple[int, Dict[str, Any]]:
    """Map an exception from any handler here to a status and an envelope."""
    from cuepoint.engine.jobs import JobTypeBusyError
    from cuepoint.engine.tag_write_jobs import PreviewNotFoundError
    from cuepoint.exceptions.cuepoint_exceptions import ExportError
    from cuepoint.services.revert_service import StaleRevertError

    if isinstance(exc, ApiError):
        return exc.status, exc.payload()
    if isinstance(exc, JobTypeBusyError):
        return 409, error_payload(
            "LIBRARY_BUSY", str(exc), job_id=exc.job_id, job_type=exc.job_type
        )
    if isinstance(exc, PreviewNotFoundError):
        return 404, error_payload(
            "TAG_WRITE_PREVIEW_NOT_FOUND", str(exc), preview_id=exc.preview_id
        )
    if isinstance(exc, StaleRevertError):
        return 409, error_payload("REVERT_STALE", str(exc), change_id=exc.change.id)
    if isinstance(exc, (FilterRuleError, BrowseQueryError, ValueError)):
        return 400, error_payload("INVALID_REQUEST", str(exc))
    if isinstance(exc, LookupError):
        return 404, error_payload("NOT_FOUND", str(exc))
    if isinstance(exc, CleanUnavailableError):
        return 503, error_payload("LIBRARY_UNAVAILABLE", str(exc))
    if isinstance(exc, ExportError):
        return 500, error_payload(exc.error_code or "EXPORT_FAILED", exc.message)
    return 500, error_payload("CLEAN_FAILED", str(exc))


__all__: Sequence[str] = (
    "DECISIONS",
    "GET_PATHS",
    "POST_PATHS",
    "CleanUnavailableError",
    "attempt_to_dict",
    "candidate_to_dict",
    "compared_candidate_to_dict",
    "file_write_to_dict",
    "handle_get",
    "handle_post",
    "handles_get",
    "handles_post",
    "match_state_to_dict",
    "status_for",
)
