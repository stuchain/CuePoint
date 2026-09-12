#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A restored backup brings CuePoint's own work back with it (ORG-13).

Phase 6's second cross-cutting fact: **this is the first phase whose data
exists nowhere else.** A Rekordbox track can be re-imported from the XML. A
rating, a note, a tag, a Collection and a saved rule set cannot be recovered
from anything — which makes DEC-009's launch backup the only copy of real user
work, and makes "the restore is silently incomplete" a failure nobody would
notice until it had already cost them everything.

The backup is a whole-database copy, so it would take a deliberate mistake for
it to be partial — which is exactly why this is worth pinning rather than
assuming. Migration 0009 put every one of these tables in the same file as
``tracks``; a later phase that moved tags to a sidecar, or excluded a table
from the copy for size, would break this and nothing else would say so.

So a library is built with one of everything Phase 6 can make, backed up,
destroyed in the way a real loss looks, restored, and read back **through the
services** rather than through SQL. Reading it back through the repositories is
what makes it a test of the data being usable rather than of rows existing.
"""

from __future__ import annotations

import json

import pytest

from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.tag_repository import TagRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.backup_service import BackupService
from cuepoint.services.collection_service import CollectionService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.metadata_service import MetadataService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.tag_service import TagService


@pytest.fixture
def workspace(tmp_path):
    return tmp_path


@pytest.fixture
def db(workspace):
    service = DatabaseService(db_path=workspace / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


def services(database):
    """Everything Phase 6 writes with, over one database."""
    tracks = TrackRepository(database)
    activity = ActivityService(ActivityRepository(database), tracks)
    return {
        "tracks": tracks,
        "activity": activity,
        "tags": TagService(TagRepository(database), activity, database),
        "collections": CollectionService(
            CollectionRepository(database), database, tracks, activity
        ),
        "metadata": MetadataService(
            TrackMetadataRepository(database), tracks, activity, database
        ),
    }


#: What a user would lose. One of each, with values that are distinguishable
#: from one another: a rating of 3 and a favorite of True cannot be confused
#: for each other's default, and a note is the only free text.
def populate(database):
    """Build a small library with one of everything, and return what to expect."""
    parts = services(database)
    track_ids = []
    for index in range(1, 4):
        track = parts["tracks"].add(
            LibraryTrack(
                rekordbox_track_id=str(index),
                file_path=f"/music/{index}.mp3",
                title=f"Track {index}",
                artist=f"Artist {index}",
                genre="Techno" if index < 3 else "House",
            )
        )
        track_ids.append(track.id)

    tag = parts["tags"].create_or_get("Peak-time", category="energy", colour="danger")
    parts["tags"].assign(track_ids[:2], tag.id)

    folder = parts["collections"].create_folder("Sets")
    collection = parts["collections"].create_collection("Warmups", folder.id)
    parts["collections"].add_tracks(collection.id, track_ids)

    rules = RuleSet(rules=(FilterRule("genre", "is", "Techno"),))
    smart = parts["collections"].create_smart("Recent techno", rules)

    parts["metadata"].set_rating(track_ids[0], 3)
    parts["metadata"].set_favorite(track_ids[0], True)
    parts["metadata"].set_notes(track_ids[0], "opens the second hour")

    return {
        "track_ids": track_ids,
        "tag_id": tag.id,
        "folder_id": folder.id,
        "collection_id": collection.id,
        "smart_id": smart.id,
    }


def destroy(database):
    """Lose the work the way it is actually lost.

    Not by deleting the file — a restore over a missing database is the easy
    case. This is the one that matters: the data is gone and the database is
    still there, which is what a bad migration, a mistaken delete or a
    half-finished refresh leaves behind.
    """
    parts = services(database)
    for node in parts["collections"].tree():
        if node.parent_id is None:
            parts["collections"].delete(node.id)
    for usage in parts["tags"].list_all():
        parts["tags"].delete(usage.tag.id)
    for track_id in [track.id for track in parts["tracks"].list_all()]:
        parts["metadata"].set_rating(track_id, None)
        parts["metadata"].set_favorite(track_id, False)
        parts["metadata"].set_notes(track_id, None)


@pytest.mark.unit
class TestARestoreBringsBackPhase6sWork:
    @pytest.fixture
    def restored(self, db, workspace):
        """Populate, back up, destroy, restore — and answer from the restore."""
        expected = populate(db)
        backup = BackupService(db).create_backup(reason="test")

        destroy(db)
        # The loss is real before the restore, or this test would pass against
        # a restore that did nothing at all.
        assert services(db)["collections"].tree() == []
        assert services(db)["tags"].list_all() == []

        BackupService(db).restore(backup.path)
        return expected, services(db)

    def test_the_tree_comes_back(self, restored):
        expected, parts = restored
        names = {node.name: node for node in parts["collections"].tree()}
        assert set(names) == {"Sets", "Warmups", "Recent techno"}
        assert names["Warmups"].parent_id == names["Sets"].id

    def test_a_collection_still_holds_its_tracks_in_order(self, restored):
        expected, parts = restored
        node = next(n for n in parts["collections"].tree() if n.name == "Warmups")
        entries = parts["collections"].entries(node.id)
        assert [entry.track_id for entry in entries] == expected["track_ids"]
        assert [entry.position for entry in entries] == [0, 1, 2]

    def test_a_smart_collection_still_holds_its_question(self, restored):
        _expected, parts = restored
        node = next(n for n in parts["collections"].tree() if n.name == "Recent techno")
        # DEC-061: a Smart Collection holds a question, not rows. A restore
        # that brought back the rows and lost the rules would look right in a
        # tree and be wrong the moment the library changed.
        assert node.rules_json is not None
        saved = json.loads(node.rules_json)
        assert saved["rules"][0]["field"] == "genre"
        assert saved["rules"][0]["value"] == "Techno"

    def test_a_smart_collection_still_answers(self, restored):
        _expected, parts = restored
        node = next(n for n in parts["collections"].tree() if n.name == "Recent techno")
        resolved = parts["collections"].resolve(node.id)
        assert resolved.is_broken is False
        assert resolved.require_query() is not None

    def test_the_tag_vocabulary_comes_back_whole(self, restored):
        _expected, parts = restored
        tags = [usage.tag for usage in parts["tags"].list_all()]
        assert [tag.name for tag in tags] == ["Peak-time"]
        # Category and colour too: a tag that came back grey and uncategorized
        # is a tag the user has to set up again.
        assert tags[0].category == "energy"
        assert tags[0].colour == "danger"

    def test_the_tracks_still_carry_their_tags(self, restored):
        expected, parts = restored
        carried = parts["tags"].tags_for_tracks(expected["track_ids"])
        assert sorted(carried) == sorted(expected["track_ids"][:2])
        assert parts["tags"].list_all()[0].track_count == 2

    def test_cuepoints_own_metadata_comes_back(self, restored):
        expected, parts = restored
        metadata = parts["metadata"].get(expected["track_ids"][0])
        assert metadata is not None
        assert metadata.rating == 3
        assert metadata.favorite is True
        assert metadata.notes == "opens the second hour"

    def test_the_imported_library_is_still_there_too(self, restored):
        expected, parts = restored
        assert parts["tracks"].count() == len(expected["track_ids"])

    def test_the_history_of_those_changes_survives(self, restored):
        expected, parts = restored
        # DEC-008: per-field history instead of undo. A restore that dropped it
        # would leave the values with no account of where they came from.
        changes = parts["activity"].track_history(expected["track_ids"][0])
        fields = {change.field_name for change in changes}
        # DEC-057's name for it: CuePoint's rating is not Rekordbox's, and the
        # history has to say which one moved.
        assert "cuepoint_rating" in fields
        assert "favorite" in fields
        assert "notes" in fields


@pytest.mark.unit
class TestTheBackupItself:
    def test_it_verifies_before_it_restores(self, db, workspace):
        """A corrupt backup is refused rather than attempted.

        The refusal has to happen *before* the restore starts, not as the
        failure of one. Both end with the library intact, but only one of them
        tells the user the truth: "this backup could not be read" is something
        they can act on, and "restoring failed, the database from before was
        saved first" describes work that never began and leaves a safety copy
        of a library nothing was going to touch.
        """
        from cuepoint.exceptions.cuepoint_exceptions import DatabaseError

        populate(db)
        service = BackupService(db)
        backup = service.create_backup(reason="test")
        backup.path.write_bytes(b"not a database")
        before = len(service.list_backups())

        with pytest.raises(DatabaseError) as raised:
            service.restore(backup.path)

        assert raised.value.error_code in {"BACKUP_UNREADABLE", "BACKUP_CORRUPT"}
        # Nothing was attempted: no pre-restore copy was taken.
        assert len(service.list_backups()) == before
        # And the library it refused to overwrite is untouched.
        assert services(db)["tags"].list_all() != []

    def test_the_restore_is_itself_recoverable(self, db, workspace):
        """Restoring by mistake is not the end of it.

        The pre-restore database is backed up first, so a user who restores
        last week's library over this week's can get this week's back.
        """
        populate(db)
        first = BackupService(db).create_backup(reason="test")

        parts = services(db)
        parts["tags"].create_or_get("Closer")

        safety = BackupService(db).restore(first.path)
        assert "Closer" not in {u.tag.name for u in services(db)["tags"].list_all()}

        BackupService(db).restore(safety.path)
        assert "Closer" in {u.tag.name for u in services(db)["tags"].list_all()}
