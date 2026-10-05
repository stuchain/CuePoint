#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Guards that only the persistence layer touches the library database.

Scattering SQL across services and API handlers is how a schema change turns
into a hunt through the whole codebase, and how query plans silently regress at
50,000 tracks. Repositories are the single place that talks to ``cuepoint.db``.

This is an architectural rule, so it is enforced rather than documented: adding
a query somewhere new fails here with an explanation, instead of passing review
unnoticed.

Note this is about CuePoint's *library* database only. inCrate's separate
inventory database, and the module that owned it, retired in DISCOVER-12; the
file is left on disk, and nothing opens it.
"""

from __future__ import annotations

from pathlib import Path

import pytest

# src/tests/unit/persistence/<file> -> parents[3] is "src"
_PACKAGE = Path(__file__).resolve().parents[3] / "cuepoint"

# Modules allowed to depend on the library database connection.
_ALLOWED = {
    "services/database_service.py",  # owns the connection itself
    "services/migration_runner.py",  # owns schema_version and migrations
    "services/interfaces.py",  # declares the contracts
    "services/bootstrap.py",  # wires them together
    # Backup/restore operates on the database as a whole — SQLite's backup API
    # and PRAGMA quick_check — and never queries library tables. The rule here
    # is about queries against the schema being spread around, which is what
    # makes a schema change unbounded; whole-file operations are a different
    # concern. Anything added to this list must be able to say the same.
    "services/backup_service.py",
    # The import/refresh service runs no SQL: it opens one transaction and lets
    # the repositories write inside it. It is on this list because it is the
    # only place that knows a delete, an upsert, a playlist rewrite and a source
    # record belong together — a refresh that committed some of those and then
    # failed would be data loss (LIBRARY-09, DEC-003). It says the same thing
    # backup_service does: it holds the database, it does not query it.
    "services/library_import_service.py",
    # Phase 6's two editing services, for the same reason and with the same
    # limit: they run no SQL. Each opens one transaction so that a change and
    # the history entry recording it (DEC-008) succeed or fail together —
    # tagging twelve thousand tracks writes twelve thousand history rows, and a
    # log that survives a rolled-back write is a log that lies. They hold the
    # database; they do not query it.
    "services/metadata_service.py",
    "services/tag_service.py",
    "services/collection_service.py",
    # ORG-07's batch path, which is the reason the three above hold a boundary
    # at all: it opens one transaction per chunk of a thousand tracks and lets
    # their writes join it, because a write that commits on its own costs
    # 1.95 ms per track against 0.014 ms inside one (ORG-02, DEC-063). It runs
    # no SQL — it does not even know which tables the operation it was handed
    # will touch.
    "services/batch_service.py",
    # CLEAN-03's match job, for the same reason and with the same limit. A
    # finished track's attempt, its plan row and its state are one transaction,
    # so a job killed mid-library has exactly as many stored attempts as done
    # rows (DEC-065). It opens that transaction and lets three repositories
    # write inside it; the SQL is theirs.
    "services/match_service.py",
    # CLEAN-04's decisions, for the reason metadata_service is here: a decision
    # and the history entry recording it succeed or fail together (DEC-008), and
    # the state rule joins the transaction a match job stores an attempt in.
    "services/match_state.py",
    # CLEAN-05's apply: every field of one apply and its history share one
    # transaction, so an apply is whole or absent. No SQL is run there.
    "services/match_apply.py",
    # CLEAN-06's revert: a revert and its activity event are one transaction,
    # and a batch revert commits a chunk of changes at a time as ORG-07's batch
    # does. The writes are the owning services'; no SQL is run there.
    "services/revert_service.py",
    # CLEAN-07's file check commits what it found a chunk at a time, as ORG-07's
    # batch does, so a cancelled check keeps every chunk it finished. The rows
    # are written by the file status repository; no SQL is run there.
    "services/file_check_service.py",
    # CLEAN-08's duplicate scan writes one signal's groups per transaction,
    # and a dismissal with its fingerprint in one. The SQL is the duplicate
    # repository's.
    "services/duplicate_service.py",
    # CLEAN-09's artwork scan commits what it read a chunk at a time, and a
    # display records what it learned in a transaction of its own. The SQL is
    # the artwork repository's.
    "services/artwork_service.py",
    # CLEAN-10's tag write records every field before it touches a file and
    # confirms it after, each in a transaction of its own, so a crash can never
    # leave a written file with no record. The SQL is the file write, file
    # status and artwork repositories'.
    "services/tag_write_service.py",
    # EXPORT-05's Rekordbox export: an export's row, its playlist rows and its
    # activity event are one transaction, opened after the file is in place, so
    # the record never claims a file that is not there and never half-describes
    # one that is. The SQL is the export repository's and the activity
    # service's; no SQL is run there.
    "services/rekordbox_export_service.py",
    # DISCOVER-06's wantlist: each change and the activity event recording it
    # are one transaction, so the Activity panel's history of the list is the
    # list's history (DEC-008). The SQL is the wantlist, catalog and activity
    # repositories'; no SQL is run there.
    "services/wantlist_service.py",
    # PREP-03's Set editing: each edit's check and its write are one
    # transaction, so a refusal ("the only chapter", "already starts here", "past
    # the track's end") is judged against the rows it would write over, and the
    # plan is read whole rather than as chapters and entries from two moments.
    # The SQL is the Set and Collection repositories'; no SQL is run there.
    "services/set_service.py",
    # PREP-05's warnings: a check reads a Set's entries, chapters and
    # acknowledgements in one transaction, so it never pairs an entry with a
    # chapter list from another moment, and an acknowledgement is judged
    # against the rows it is written beside. The SQL is the Set and Collection
    # repositories'; no SQL is run there.
    "services/set_analysis_service.py",
    # PREP-06's set lists: a set list is read in one transaction, so its
    # chapters, times and file checks are from one moment, and a save's
    # activity event is recorded in its own. The SQL is the Set repository's
    # and the activity service's; no SQL is run there.
    "services/set_list_service.py",
    # The one retry loop for a write that finds the database busy: it opens
    # the transaction it retries, and runs no SQL of its own.
    "services/busy_wait.py",
    # WAVE-04's marks backfill writes a chunk of tracks' marks per transaction,
    # each after checking, in that transaction, that no import or refresh has
    # read them since it started, so it never writes over what one did. The SQL
    # is the marks, track and source repositories'; no SQL is run there.
    "services/marks_backfill_service.py",
}
_ALLOWED_PREFIXES = ("persistence/", "migrations/")


def _modules_referencing_database() -> set[str]:
    found = set()
    for path in _PACKAGE.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        if "IDatabaseService" in text:
            found.add(path.relative_to(_PACKAGE).as_posix())
    return found


@pytest.mark.unit
class TestPersistenceBoundary:
    def test_only_persistence_layer_uses_the_library_database(self):
        offenders = sorted(
            module
            for module in _modules_referencing_database()
            if module not in _ALLOWED and not module.startswith(_ALLOWED_PREFIXES)
        )
        assert not offenders, (
            "these modules reach for the library database directly; queries "
            f"belong in a repository under cuepoint/persistence/: {offenders}. "
            "If a module genuinely operates on the database as a file rather "
            "than querying it, add it to _ALLOWED with that justification."
        )

    def test_package_path_resolves(self):
        """Guards the guard: scanning the wrong directory would pass vacuously."""
        assert _PACKAGE.is_dir(), f"cuepoint package not found at {_PACKAGE}"

    def test_repository_layer_actually_exists(self):
        """Guards the guard: finding nothing at all would also pass vacuously."""
        referencing = _modules_referencing_database()
        assert any(module.startswith("persistence/") for module in referencing), (
            f"no persistence module found; scanned {_PACKAGE}"
        )
