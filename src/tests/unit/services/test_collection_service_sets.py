#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A Set through the Collection code (PREP-02, DEC-102, DEC-104).

The repository's tests hold where each entry of a Set goes. These hold what the
services around it now answer for a Set, one question at a time:

- **The tree.** A Set is made with one chapter, filed in a folder, and is not a
  folder itself.
- **"New Set from…"** copies a Collection with its repeats, a Smart Collection's
  current answer in its saved order, a Rekordbox playlist in its order, or a
  selection in the order given; all of it into one chapter, in one transaction
  with one activity event, and nothing when it is refused.
- **Duplicating a Set** copies its plan, and is refused for anything else.
- **The limit** holds for a batch too: a selection a Set cannot hold whole is
  refused before the first chunk.
- **References** count a Set as a Set, never as a Collection.
- **Rules**: "in Set X" is membership, and resolves to the Set's tracks.
- **Freeze** beside a Set leaves the Set as it was.
"""

from __future__ import annotations

from typing import List

import pytest

from cuepoint.models.collection import KIND_COLLECTION, KIND_SET
from cuepoint.models.filter_rule import FilterRule, FilterRuleError, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.rekordbox_playlist import (
    KIND_FOLDER as RB_FOLDER,
)
from cuepoint.models.rekordbox_playlist import (
    KIND_PLAYLIST,
    RekordboxPlaylist,
)
from cuepoint.models.set_plan import MAX_SET_ENTRIES, SetLimitError
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.authored_data_repository import AuthoredDataRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.match_repository import MatchRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.rule_references import BrokenRuleError
from cuepoint.persistence.tag_repository import TagRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.batch_service import (
    OPERATION_ADD_TO_COLLECTION,
    OPERATION_REMOVE_FROM_COLLECTION,
    BatchOperation,
    BatchSelection,
    BatchService,
)
from cuepoint.services.collection_service import (
    EVENT_SET_CREATED_FROM,
    SOURCE_COLLECTION,
    SOURCE_PLAYLIST,
    SOURCE_SELECTION,
    CollectionService,
    SetSource,
)
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_service import LibraryService
from cuepoint.services.match_apply import MatchApplyService
from cuepoint.services.match_state import MatchStateService
from cuepoint.services.metadata_service import MetadataService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.tag_service import TagService


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def tracks(db):
    repo = TrackRepository(db)
    repo.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=str(i),
                file_path=f"/m/{i}.mp3",
                title=f"T{i:02d}",
                artist="A",
                genre="Techno" if i % 2 else "House",
            )
            for i in range(1, 11)
        ]
    )
    return repo


@pytest.fixture
def ids(db, tracks) -> List[int]:
    rows = db.connect().execute("SELECT id FROM tracks ORDER BY id").fetchall()
    return [int(row["id"]) for row in rows]


@pytest.fixture
def repo(db, tracks):
    return CollectionRepository(db)


@pytest.fixture
def activity(db, tracks):
    return ActivityService(ActivityRepository(db), tracks)


@pytest.fixture
def playlists(db, tracks):
    return PlaylistRepository(db)


@pytest.fixture
def service(db, repo, tracks, activity, playlists):
    return CollectionService(repo, db, tracks, activity, playlists)


def techno() -> RuleSet:
    return RuleSet(rules=(FilterRule(field="genre", operator="is", value="Techno"),))


def events(activity) -> list:
    return activity.recent_events(event_type=EVENT_SET_CREATED_FROM)


def chapters_of(db, set_id) -> List[int]:
    rows = db.connect().execute(
        "SELECT ch.position FROM collection_tracks ct"
        " JOIN set_entries se ON se.entry_id = ct.id"
        " JOIN set_chapters ch ON ch.id = se.chapter_id"
        " WHERE ct.collection_id = ? ORDER BY ct.position",
        (set_id,),
    )
    return [int(row["position"]) for row in rows]


def node_count(db) -> int:
    return int(
        db.connect().execute("SELECT count(*) AS n FROM collections").fetchone()["n"]
    )


# --------------------------------------------------------------------- tree


@pytest.mark.unit
class TestTheTree:
    def test_a_set_is_created_with_one_chapter(self, service, repo):
        made = service.create_set("Friday")
        assert made.kind == KIND_SET
        assert len(repo.chapters(made.id)) == 1

    def test_a_set_is_filed_under_a_folder(self, service):
        folder = service.create_folder("Gigs")
        made = service.create_set("Friday", folder.id)
        assert (made.parent_id, made.depth) == (folder.id, 1)

    def test_a_set_contains_nothing(self, service):
        gig = service.create_set("Friday")
        with pytest.raises(ValueError, match="'Friday' is a set, and only a folder"):
            service.create_collection("Inside", gig.id)
        crate = service.create_collection("Crate")
        with pytest.raises(ValueError, match="only a folder"):
            service.move(crate.id, gig.id)

    def test_a_set_moves_and_renames_like_any_node(self, service, repo):
        folder = service.create_folder("Gigs")
        gig = service.create_set("Friday")
        service.move(gig.id, folder.id)
        service.rename(gig.id, "Friday late")
        moved = service.get(gig.id)
        assert (moved.parent_id, moved.name) == (folder.id, "Friday late")
        assert len(repo.chapters(gig.id)) == 1

    def test_a_set_is_not_a_smart_collection(self, service):
        gig = service.create_set("Friday")
        for call in (service.resolve, service.freeze, service.duplicate):
            with pytest.raises(ValueError, match="is a set, not a smart collection"):
                call(gig.id)
        with pytest.raises(ValueError, match="is a set, not a smart collection"):
            service.update_rules(gig.id, techno())

    def test_the_delete_preview_names_the_set(self, service, ids):
        folder = service.create_folder("Gigs")
        gig = service.create_set("Friday", folder.id)
        service.add_tracks(gig.id, ids[:3])
        preview = service.delete_preview(folder.id)
        assert (preview.folders, preview.sets, preview.entries, preview.nodes) == (
            1,
            1,
            3,
            2,
        )
        assert service.delete(folder.id) == preview


@pytest.mark.unit
class TestMembership:
    def test_a_set_holds_tracks_by_every_service_path(self, service, db, ids):
        gig = service.create_set("Friday")
        result = service.add_tracks(gig.id, [ids[0], ids[1], ids[0]])
        assert (result.added, result.skipped) == (2, 0)
        service.insert_track(gig.id, ids[0], 2)
        moved = service.reorder_entry(service.entries(gig.id)[2].id, 0)
        assert moved.position == 0
        service.remove_entries([service.entries(gig.id)[1].id])
        assert service.counts(gig.id) == (2, 2)
        assert chapters_of(db, gig.id) == [0, 0]

    def test_a_chapter_can_be_named_through_the_service(self, service, repo, db, ids):
        gig = service.create_set("Friday")
        service.add_tracks(gig.id, ids[:2])
        opening = repo.chapters(gig.id)[0].id
        with db.transaction() as conn:
            peak = conn.execute(
                "INSERT INTO set_chapters (collection_id, position, name,"
                " created_at, updated_at) VALUES (?, 1, 'Peak', 'x', 'x')",
                (gig.id,),
            ).lastrowid
        service.insert_track(gig.id, ids[5], 2, chapter_id=peak)
        assert chapters_of(db, gig.id) == [0, 0, 1]
        service.reorder_entry(service.entries(gig.id)[2].id, 2, chapter_id=opening)
        assert chapters_of(db, gig.id) == [0, 0, 0]

    def test_check_add_refuses_what_would_not_fit(self, service, db, tracks):
        tracks.add_many(
            [
                LibraryTrack(
                    rekordbox_track_id=f"x{i}",
                    file_path=f"/m/x{i}.mp3",
                    title=f"X{i}",
                    artist="A",
                )
                for i in range(MAX_SET_ENTRIES)
            ]
        )
        every = [int(r["id"]) for r in db.connect().execute("SELECT id FROM tracks")]
        gig = service.create_set("Friday")
        service.add_tracks(gig.id, every[:MAX_SET_ENTRIES])

        service.check_add(gig.id, every[:MAX_SET_ENTRIES])  # all already there
        with pytest.raises(SetLimitError, match="adding 10 would make 1,010"):
            service.check_add(gig.id, every)
        crate = service.create_collection("Crate")
        service.check_add(crate.id, every)  # a Collection has no limit
        with pytest.raises(ValueError, match="is a folder"):
            service.check_add(service.create_folder("Gigs").id, every)


# ---------------------------------------------------------- new set from…


@pytest.mark.unit
class TestNewSetFrom:
    def test_a_collection_with_its_repeat(self, service, activity, db, ids):
        crate = service.create_collection("Crate")
        service.add_tracks(crate.id, [ids[2], ids[0]])
        service.insert_track(crate.id, ids[2], 2)

        made = service.create_set_from(SetSource.collection(crate.id))
        assert made.set.kind == KIND_SET and made.set.name == "Crate"
        assert service.entries(made.set.id)[0].collection_id == made.set.id
        assert [e.track_id for e in service.entries(made.set.id)] == [
            ids[2],
            ids[0],
            ids[2],
        ]
        assert chapters_of(db, made.set.id) == [0, 0, 0]
        assert (made.source_kind, made.source_id, made.source_name) == (
            SOURCE_COLLECTION,
            crate.id,
            "Crate",
        )
        assert made.track_count == 3
        # A copy, not a conversion: the Collection is still a Collection.
        assert service.get(crate.id).kind == KIND_COLLECTION
        assert len(service.entries(crate.id)) == 3

    def test_a_smart_collection_in_its_saved_order(self, service, tracks, ids):
        smart = service.create_smart("Techno", techno(), sort="title", direction="desc")
        made = service.create_set_from(SetSource.collection(smart.id), "Tonight")
        expected = tracks.browse_ids(
            BrowseQuery(rules=techno(), sort="title", direction="desc")
        )
        assert [e.track_id for e in service.entries(made.set.id)] == expected
        assert len(expected) == 5 and made.set.name == "Tonight"

    def test_a_rekordbox_playlist_in_its_order_with_repeats(
        self, service, playlists, ids
    ):
        playlists.replace_tree(
            [
                RekordboxPlaylist(
                    name="ROOT",
                    kind=RB_FOLDER,
                    depth=0,
                    position=0,
                    rekordbox_path="ROOT",
                ),
                RekordboxPlaylist(
                    name="peak",
                    kind=KIND_PLAYLIST,
                    depth=1,
                    position=0,
                    rekordbox_path="ROOT/peak",
                    parent_path="ROOT",
                    track_refs=["4", "5", "4"],
                ),
            ]
        )
        peak = playlists.find_by_path("ROOT/peak")
        made = service.create_set_from(SetSource.playlist(peak.id))
        assert made.set.name == "peak"
        assert [e.track_id for e in service.entries(made.set.id)] == [
            ids[3],
            ids[4],
            ids[3],
        ]
        assert made.source_kind == SOURCE_PLAYLIST

        folder = playlists.find_by_path("ROOT")
        with pytest.raises(ValueError, match="'ROOT' is a Rekordbox folder"):
            service.create_set_from(SetSource.playlist(folder.id))
        with pytest.raises(ValueError, match="No such Rekordbox playlist"):
            service.create_set_from(SetSource.playlist(987654))

    def test_a_selection_in_the_order_given(self, service, ids):
        made = service.create_set_from(
            SetSource.selection([ids[6], ids[1], ids[4]]), "Picked"
        )
        assert [e.track_id for e in service.entries(made.set.id)] == [
            ids[6],
            ids[1],
            ids[4],
        ]
        assert (made.source_kind, made.source_id, made.source_name) == (
            SOURCE_SELECTION,
            None,
            None,
        )

    def test_a_selection_needs_a_name(self, service, db, ids):
        with pytest.raises(ValueError, match="needs a name"):
            service.create_set_from(SetSource.selection(ids[:2]))
        assert node_count(db) == 0

    def test_it_files_the_set_where_asked(self, service, ids):
        folder = service.create_folder("Gigs")
        crate = service.create_collection("Crate")
        made = service.create_set_from(
            SetSource.collection(crate.id), parent_id=folder.id
        )
        assert made.set.parent_id == folder.id

    def test_it_records_one_event(self, service, activity, ids):
        crate = service.create_collection("Crate")
        service.add_tracks(crate.id, ids[:3])
        made = service.create_set_from(SetSource.collection(crate.id), "Friday")
        (event,) = events(activity)
        assert event.summary == "Made the Set 'Friday' from 'Crate' — 3 tracks"
        assert event.detail == {
            "set_id": made.set.id,
            "set_name": "Friday",
            "source_kind": SOURCE_COLLECTION,
            "source_id": crate.id,
            "source_name": "Crate",
            "tracks": 3,
        }
        service.create_set_from(SetSource.selection(ids[:1]), "One")
        assert events(activity)[0].summary == (
            "Made the Set 'One' from a selection — 1 track"
        )

    @pytest.mark.parametrize("kind", ["folder", "set"])
    def test_a_node_without_its_own_tracks_is_refused(self, service, db, kind):
        source = (
            service.create_folder("Gigs")
            if kind == "folder"
            else service.create_set("S")
        )
        words = "is a folder" if kind == "folder" else "is already a Set: duplicate"
        with pytest.raises(ValueError, match=words):
            service.create_set_from(SetSource.collection(source.id))
        assert node_count(db) == 1

    def test_a_broken_smart_collection_is_refused(self, service, db):
        crate = service.create_collection("Crate")
        rule = RuleSet(
            rules=(
                FilterRule(
                    field="collection", operator="in_collection", value=crate.id
                ),
            )
        )
        smart = service.create_smart("In crate", rule)
        service.delete(crate.id)
        with pytest.raises(BrokenRuleError):
            service.create_set_from(SetSource.collection(smart.id))
        assert node_count(db) == 1

    def test_past_the_limit_nothing_is_written(self, service, activity, db, tracks):
        tracks.add_many(
            [
                LibraryTrack(
                    rekordbox_track_id=f"x{i}",
                    file_path=f"/m/x{i}.mp3",
                    title=f"X{i}",
                    artist="A",
                )
                for i in range(MAX_SET_ENTRIES)
            ]
        )
        every = [int(r["id"]) for r in db.connect().execute("SELECT id FROM tracks")]
        with pytest.raises(SetLimitError, match="'Huge' holds 0 entries"):
            service.create_set_from(SetSource.selection(every), "Huge")
        assert node_count(db) == 0
        assert events(activity) == []

    def test_a_failure_part_way_leaves_nothing(self, service, activity, db, ids):
        crate = service.create_collection("Crate")
        service.add_tracks(crate.id, ids[:2])

        def refuse(*args, **kwargs):
            raise RuntimeError("feed unavailable")

        service._activity.record_event = refuse  # type: ignore[method-assign]
        with pytest.raises(RuntimeError):
            service.create_set_from(SetSource.collection(crate.id), "Friday")
        assert node_count(db) == 1
        assert (
            int(
                db.connect()
                .execute("SELECT count(*) AS n FROM set_details")
                .fetchone()["n"]
            )
            == 0
        )

    @pytest.mark.parametrize(
        "kind, node_id, track_ids",
        [
            ("album", 1, ()),
            (SOURCE_SELECTION, None, ()),
            (SOURCE_SELECTION, 1, (1,)),
            (SOURCE_COLLECTION, None, ()),
            (SOURCE_PLAYLIST, 1, (1,)),
        ],
    )
    def test_a_source_says_what_it_is(self, kind, node_id, track_ids):
        with pytest.raises(ValueError):
            SetSource(kind, id=node_id, track_ids=track_ids)


@pytest.mark.unit
class TestDuplicatingASet:
    def test_the_copy_is_named_and_whole(self, service, repo, db, ids):
        gig = service.create_set("Friday")
        service.add_tracks(gig.id, ids[:3])
        copy = service.duplicate_set(gig.id)
        assert copy.name == "Friday copy" and copy.kind == KIND_SET
        assert [e.track_id for e in service.entries(copy.id)] == ids[:3]
        assert chapters_of(db, copy.id) == [0, 0, 0]
        assert service.duplicate_set(gig.id, "Saturday").name == "Saturday"

    def test_a_long_name_is_trimmed_to_fit(self, service):
        gig = service.create_set("x" * 120)
        copy = service.duplicate_set(gig.id)
        assert len(copy.name) == 120 and copy.name.endswith(" copy")

    @pytest.mark.parametrize("make", ["create_collection", "create_folder"])
    def test_only_a_set(self, service, make):
        node = getattr(service, make)("Other")
        with pytest.raises(ValueError, match="not a Set"):
            service.duplicate_set(node.id)
        with pytest.raises(ValueError, match="No such collection"):
            service.duplicate_set(987654)


# -------------------------------------------------------------------- batch


@pytest.fixture
def batch(db, tracks, activity, service) -> BatchService:
    metadata = MetadataService(TrackMetadataRepository(db), tracks, activity, db)
    return BatchService(
        metadata,
        TagService(TagRepository(db), activity, db),
        service,
        tracks,
        activity,
        db,
        MatchStateService(MatchRepository(db), tracks, activity, db),
        MatchApplyService(MatchRepository(db), metadata, tracks, db),
    )


@pytest.mark.unit
class TestBatchIntoASet:
    def test_a_selection_is_added_into_the_last_chapter(self, batch, service, db, ids):
        gig = service.create_set("Friday")
        service.add_tracks(gig.id, ids[:2])
        result = batch.apply_batch(
            BatchSelection.of_ids(ids[1:5]),
            BatchOperation(OPERATION_ADD_TO_COLLECTION, gig.id),
        )
        assert (result.changed, result.unchanged) == (3, 1)
        assert chapters_of(db, gig.id) == [0] * 5

    def test_removing_takes_every_entry_of_the_track(self, batch, service, ids):
        gig = service.create_set("Friday")
        service.add_tracks(gig.id, ids[:2])
        service.insert_track(gig.id, ids[0], 2)
        batch.apply_batch(
            BatchSelection.of_ids([ids[0]]),
            BatchOperation(OPERATION_REMOVE_FROM_COLLECTION, gig.id),
        )
        assert [e.track_id for e in service.entries(gig.id)] == [ids[1]]

    def test_a_selection_that_would_not_fit_is_refused_whole(
        self, batch, service, db, tracks, monkeypatch
    ):
        """Chunks commit one at a time, so the limit is checked first."""
        from cuepoint.services import batch_service as module

        monkeypatch.setattr(module, "BATCH_CHUNK_SIZE", 100)
        tracks.add_many(
            [
                LibraryTrack(
                    rekordbox_track_id=f"x{i}",
                    file_path=f"/m/x{i}.mp3",
                    title=f"X{i}",
                    artist="A",
                )
                for i in range(MAX_SET_ENTRIES)
            ]
        )
        every = [int(r["id"]) for r in db.connect().execute("SELECT id FROM tracks")]
        gig = service.create_set("Friday")
        operation = BatchOperation(OPERATION_ADD_TO_COLLECTION, gig.id)

        with pytest.raises(SetLimitError):
            batch.check(operation, every)
        with pytest.raises(SetLimitError):
            batch.apply_batch(BatchSelection.of_ids(every), operation)
        assert service.counts(gig.id) == (0, 0)

        assert batch.check(operation) == "Friday"
        assert batch.check(operation, every[:MAX_SET_ENTRIES]) == "Friday"


# --------------------------------------------------------------- references


@pytest.mark.unit
class TestReferences:
    @pytest.fixture
    def library(self, db, tracks):
        return LibraryService(
            track_repository=tracks,
            collection_repository=CollectionRepository(db),
            metadata_repository=TrackMetadataRepository(db),
            authored_repository=AuthoredDataRepository(db),
        )

    def test_a_set_is_counted_as_a_set(self, service, library, ids):
        crate = service.create_collection("Crate")
        gig = service.create_set("Friday")
        service.add_tracks(crate.id, ids[:2])
        service.add_tracks(gig.id, [ids[1], ids[2], ids[3], ids[4]])
        service.insert_track(gig.id, ids[1], 0)

        summary = library.references_for(ids[:6])
        assert (summary.collection_count, summary.collection_ids) == (1, (crate.id,))
        assert summary.collection_track_count == 2
        assert (summary.set_count, summary.set_ids) == (1, (gig.id,))
        assert summary.set_track_count == 4
        # ids[1] is in both, and is one referenced track.
        assert summary.referenced_track_ids == tuple(ids[:5])
        assert summary.has_references

    def test_a_set_alone_is_a_reference(self, service, library, ids):
        gig = service.create_set("Friday")
        service.add_tracks(gig.id, ids[:1])
        summary = library.references_for(ids)
        assert (summary.collection_count, summary.set_count) == (0, 1)
        assert summary.has_references
        payload = summary.to_dict()
        assert (payload["set_track_count"], payload["set_ids"]) == (1, [gig.id])


# -------------------------------------------------------------------- rules


@pytest.mark.unit
class TestRulesNamingASet:
    def in_set(self, set_id, operator="in_collection") -> RuleSet:
        return RuleSet(
            rules=(FilterRule(field="collection", operator=operator, value=set_id),)
        )

    def test_in_set_resolves_to_the_sets_tracks(self, service, tracks, ids):
        gig = service.create_set("Friday")
        service.add_tracks(gig.id, [ids[3], ids[1]])
        service.insert_track(gig.id, ids[3], 2)
        smart = service.create_smart("In Friday", self.in_set(gig.id))
        query = service.resolve(smart.id).require_query()
        assert sorted(tracks.browse_ids(query)) == [ids[1], ids[3]]

    def test_not_in_set_is_the_rest(self, service, tracks, ids):
        gig = service.create_set("Friday")
        service.add_tracks(gig.id, ids[:3])
        smart = service.create_smart(
            "Not Friday", self.in_set(gig.id, "not_in_collection")
        )
        query = service.resolve(smart.id).require_query()
        assert sorted(tracks.browse_ids(query)) == ids[3:]

    def test_a_deleted_set_breaks_the_rule(self, service, ids):
        gig = service.create_set("Friday")
        smart = service.create_smart("In Friday", self.in_set(gig.id))
        service.delete(gig.id)
        assert service.resolve(smart.id).is_broken

    def test_a_smart_collection_is_still_refused(self, service):
        smart = service.create_smart("Techno", techno())
        with pytest.raises(FilterRuleError, match="is a Smart Collection"):
            service.create_smart("Nested", self.in_set(smart.id))


# ------------------------------------------------------------------- freeze


@pytest.mark.unit
class TestFreezeBesideASet:
    def test_a_freeze_into_a_sets_folder_leaves_the_set_alone(
        self, service, repo, db, ids
    ):
        folder = service.create_folder("Gigs")
        gig = service.create_set("Friday", folder.id)
        service.add_tracks(gig.id, ids[:3])
        before = (service.entries(gig.id), repo.entry_plans(gig.id))
        smart = service.create_smart("Techno", techno(), parent_id=folder.id)

        frozen = service.freeze(smart.id)
        assert frozen.collection.kind == KIND_COLLECTION
        assert frozen.collection.parent_id == folder.id
        assert repo.set_details(frozen.collection.id) is None
        assert (service.entries(gig.id), repo.entry_plans(gig.id)) == before
        assert (
            int(
                db.connect()
                .execute(
                    "SELECT count(*) AS n FROM set_entries WHERE collection_id = ?",
                    (frozen.collection.id,),
                )
                .fetchone()["n"]
            )
            == 0
        )
