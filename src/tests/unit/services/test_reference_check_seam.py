#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The DEC-011 reference-check seam, and the rule that it is not bypassed.

DEC-011 says a refresh warns before deleting tracks a Collection or Set is
using. Collections arrive in Phase 6 and Sets in Phase 10, so today the answer
is zero — and that is the *true* answer, not a stub: nothing in this build can
reference a track, so nothing does.

The value of building it now is not the zero. It is that when Phase 6 makes the
answer interesting, there is **one method to implement and no callers to find**.
That only holds if every path that deletes a track already asks, which is what
:class:`TestNoDeletionPathBypassesTheSeam` enforces — while there are still no
such paths, which is the cheapest possible moment to start.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

from cuepoint.models.references import NO_REFERENCES, ReferenceSummary
from cuepoint.persistence.library_source_repository import LibrarySourceRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.interfaces import ILibraryService
from cuepoint.services.library_import_service import LibraryImportService
from cuepoint.services.library_service import LibraryService
from cuepoint.services.migration_runner import MigrationRunner

# src/tests/unit/services/<file> -> parents[3] is "src"
_PACKAGE = Path(__file__).resolve().parents[3] / "cuepoint"

#: Repository methods that permanently remove a library track, taking its
#: history — and from Phase 6 its Collection membership — with it.
#:
#: ``delete_by_rekordbox_ids`` exists only on the track repository, so naming it
#: is unambiguous. Bare ``delete`` is not: ``http_cache`` calls ``cache.delete``
#: and the playlist and source repositories clear their own tables, none of
#: which risks anything a user made. So a bare ``delete`` counts only when its
#: receiver names tracks, which is what a real caller
#: (``self._tracks.delete(...)``) looks like.
DELETION_METHODS = ("delete_by_rekordbox_ids", "delete_many", "delete")

#: Modules allowed to delete library tracks, and why.
#:
#: One entry, which is the point: the list was written empty in LIBRARY-08 so
#: that the first deletion path would have to declare itself, and this is it.
#: The entry is a claim that ``LibraryImportService._check_references`` asks
#: ``ILibraryService.references_for`` about exactly the ids it is about to
#: delete, and refuses without confirmation when the answer is not zero —
#: asserted by ``TestTheApplyAsksTheSeam`` in ``test_apply_refresh.py``, so this
#: is not a claim taken on trust.
DELETION_CALLERS_ALLOWED: set = {"services/library_import_service.py"}


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def library(db):
    return LibraryService(track_repository=TrackRepository(db))


@pytest.mark.unit
class TestTheSeamAnswersToday:
    def test_it_answers_zero_for_an_empty_request(self, library):
        assert library.references_for([]) == NO_REFERENCES

    def test_it_answers_zero_for_any_ids(self, library):
        summary = library.references_for([1, 2, 3, 999])
        assert summary.collection_count == 0
        assert summary.set_count == 0
        assert summary.referenced_track_count == 0
        assert summary.has_references is False

    def test_it_answers_zero_for_ids_that_do_not_exist(self, library):
        """Zero because nothing can reference anything, not because they are gone."""
        assert library.references_for([424242]).has_references is False

    def test_it_accepts_a_generator(self, library):
        """A caller streaming ids must not have them silently ignored."""
        consumed = []

        def ids():
            for value in (1, 2, 3):
                consumed.append(value)
                yield value

        library.references_for(ids())
        assert consumed == [1, 2, 3], "the seam did not read what it was given"

    def test_it_is_on_the_interface_phase_6_will_implement(self):
        assert hasattr(ILibraryService, "references_for")
        assert getattr(ILibraryService.references_for, "__isabstractmethod__", False), (
            "an optional seam is one a Phase 6 implementation can forget"
        )

    def test_the_summary_is_serializable(self, library):
        payload = library.references_for([1]).to_dict()
        assert set(payload) == {
            "collection_count",
            "set_count",
            "referenced_track_count",
            "referenced_track_ids",
            "has_references",
        }


@pytest.mark.unit
class TestTheSummaryDescribesPhase6sContract:
    def test_references_make_it_report_true(self):
        """The shape Phase 6 fills in, asserted so the meaning is fixed now.

        Every number here is different from every other on purpose: with two
        Collections and two named tracks, a ``referenced_track_count`` that
        returned the collection count would have passed.
        """
        summary = ReferenceSummary(
            collection_count=2, set_count=1, referenced_track_ids=(7, 9, 11)
        )
        assert summary.has_references is True
        assert summary.referenced_track_count == 3
        assert summary.collection_count == 2
        assert summary.set_count == 1

    def test_sets_alone_are_enough_to_warn(self):
        assert ReferenceSummary(set_count=1).has_references is True

    def test_collections_alone_are_enough_to_warn(self):
        assert ReferenceSummary(collection_count=1).has_references is True

    def test_named_tracks_without_a_holder_do_not_warn(self):
        """Counts are of referencing things, not of references.

        Guards the arithmetic Phase 6 has to get right: the sentence DEC-011
        feeds says how many Collections a user would find changed.
        """
        assert ReferenceSummary(referenced_track_ids=(1, 2)).has_references is False

    def test_the_shared_zero_is_really_zero(self):
        assert NO_REFERENCES.has_references is False
        assert NO_REFERENCES.referenced_track_count == 0


@pytest.mark.unit
class TestTheDiffCarriesTheSummary:
    """DEC-032: the diff carries it, the preview reads it."""

    @staticmethod
    def _export(tmp_path, tracks, name):
        path = tmp_path / name
        entries = "\n".join(
            f'<TRACK TrackID="{i}" Name="T{i}" Artist="A" '
            f'Location="file://localhost/m/{i}.mp3"/>'
            for i in tracks
        )
        path.write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<DJ_PLAYLISTS><COLLECTION Entries="{len(tracks)}">{entries}'
            "</COLLECTION><PLAYLISTS/></DJ_PLAYLISTS>\n",
            encoding="utf-8",
        )
        return str(path)

    @pytest.fixture
    def service(self, db, library):
        return LibraryImportService(
            TrackRepository(db),
            PlaylistRepository(db),
            LibrarySourceRepository(db),
            db,
            library_service=library,
        )

    def test_a_diff_with_removals_carries_a_summary(self, service, tmp_path):
        service.import_rekordbox_xml(self._export(tmp_path, [1, 2, 3], "a.xml"))
        diff = service.compute_refresh_diff(self._export(tmp_path, [1, 2], "b.xml"))

        assert diff.removed.count == 1
        assert diff.references is not None
        assert diff.references.has_references is False

    def test_a_diff_with_no_removals_still_carries_one(self, service, tmp_path):
        """A caller reading ``diff.references`` never handles it being absent."""
        export = self._export(tmp_path, [1, 2, 3], "a.xml")
        service.import_rekordbox_xml(export)

        diff = service.compute_refresh_diff(export)

        assert diff.removed.count == 0
        assert diff.references is not None

    def test_the_seam_is_asked_about_the_removed_tracks(self, service, tmp_path):
        """Only removals: a changed or re-linked track keeps everything."""
        asked = []

        class Recording(LibraryService):
            def references_for(self, track_ids):
                asked.append(list(track_ids))
                return NO_REFERENCES

        service._library = Recording(track_repository=service._tracks)
        service.import_rekordbox_xml(self._export(tmp_path, [1, 2, 3], "a.xml"))
        removed_id = service._tracks.find_by_rekordbox_id("3").id

        service.compute_refresh_diff(self._export(tmp_path, [1, 2], "b.xml"))

        assert asked == [[removed_id]]

    def test_a_service_without_the_seam_still_produces_the_same_shape(
        self, db, tmp_path
    ):
        """So a caller never sees two different answers for "nothing"."""
        service = LibraryImportService(
            TrackRepository(db), PlaylistRepository(db), LibrarySourceRepository(db), db
        )
        service.import_rekordbox_xml(self._export(tmp_path, [1, 2, 3], "a.xml"))

        diff = service.compute_refresh_diff(self._export(tmp_path, [1, 2], "b.xml"))

        assert diff.references == NO_REFERENCES

    def test_the_serialized_diff_includes_it(self, service, tmp_path):
        service.import_rekordbox_xml(self._export(tmp_path, [1, 2, 3], "a.xml"))
        payload = service.compute_refresh_diff(
            self._export(tmp_path, [1, 2], "b.xml")
        ).to_dict()

        assert payload["references"]["has_references"] is False


def _deletion_calls(path: Path) -> list:
    """Return the library-track deletions a module performs.

    Matched on the receiver as well as the method, so unrelated ``delete``
    calls — an HTTP cache entry, a whole-table clear of the Rekordbox mirror —
    do not read as track deletions. Over-matching would make the rule noisy and
    the allow-list meaningless.
    """
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found = []
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
            continue
        if node.func.attr in ("delete_by_rekordbox_ids", "delete_many"):
            found.append(ast.unparse(node.func))
        elif (
            node.func.attr == "delete"
            and "track" in ast.unparse(node.func.value).lower()
        ):
            found.append(ast.unparse(node.func))
    return found


@pytest.mark.unit
class TestNoDeletionPathBypassesTheSeam:
    """The rule that makes Phase 6 one method rather than a search.

    Written while there are no deletion paths at all, which is the point: the
    first one added — LIBRARY-09's refresh — has to declare itself here, and
    declaring itself means saying whether it consulted ``references_for``.
    """

    def test_only_declared_modules_delete_tracks(self):
        offenders = {}
        for path in _PACKAGE.rglob("*.py"):
            if "__pycache__" in path.parts:
                continue
            relative = path.relative_to(_PACKAGE).as_posix()
            if relative in DELETION_CALLERS_ALLOWED:
                continue
            calls = _deletion_calls(path)
            if calls:
                offenders[relative] = sorted(set(calls))

        assert offenders == {}, (
            f"{offenders} delete without appearing in DELETION_CALLERS_ALLOWED. "
            "A path that removes library tracks must consult "
            "ILibraryService.references_for first (DEC-011) — deleting a track "
            "takes its tags, ratings and Collection membership with it, and "
            "DEC-003 makes that irreversible. Add the call, then add the module "
            "here with the reason."
        )

    def test_the_allow_list_names_real_modules(self):
        """A stale entry would silently widen the rule."""
        for relative in DELETION_CALLERS_ALLOWED:
            assert (_PACKAGE / relative).exists(), f"{relative} no longer exists"

    def test_every_allowed_module_actually_deletes(self):
        """An entry that deletes nothing is permission nobody needed.

        Vacuous while the list is empty, and deliberately kept: the moment
        LIBRARY-09 adds itself, this starts holding the entry to its word.
        """
        for relative in DELETION_CALLERS_ALLOWED:
            assert _deletion_calls(_PACKAGE / relative), (
                f"{relative} is allowed to delete but does not; remove it so the "
                "list keeps meaning what it says"
            )

    def test_the_scan_finds_a_deletion_when_there_is_one(self, tmp_path):
        """The scan has to be able to fail.

        With no deletion path in the codebase yet, every assertion above passes
        against a scan that finds nothing at all — including a broken one.
        """
        module = tmp_path / "deleter.py"
        module.write_text(
            "def remove(self):\n"
            "    self._tracks.delete_by_rekordbox_ids(['1'])\n"
            "    self._tracks.delete(7)\n",
            encoding="utf-8",
        )
        assert len(_deletion_calls(module)) == 2

    def test_the_scan_ignores_deletions_that_are_not_library_tracks(self, tmp_path):
        module = tmp_path / "innocent.py"
        module.write_text(
            "def clear(self):\n"
            "    cache.delete(key)\n"
            "    self._playlists.delete(3)\n"
            "    conn.execute('DELETE FROM tracks')\n",
            encoding="utf-8",
        )
        assert _deletion_calls(module) == []

    def test_the_repository_still_offers_the_deletion_it_guards(self):
        """If these were renamed the scan above would quietly find nothing."""
        for name in DELETION_METHODS:
            assert hasattr(TrackRepository, name), (
                f"TrackRepository.{name} is gone; DELETION_METHODS is now watching "
                "for a call that can never happen"
            )
