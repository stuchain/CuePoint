#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Migration 0029 and the saved artist and label lists it holds."""

from __future__ import annotations

import json
import sqlite3

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.persistence.discover_list_repository import (
    MAX_MEMBERS,
    MAX_NAME,
    DiscoverListNameTaken,
    DiscoverListRepository,
)
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def lists(db):
    return DiscoverListRepository(db)


class TestMigration:
    def test_it_is_discovered_at_its_number(self):
        by_version = {m.version: m for m in discover_migrations()}
        assert by_version[29].module_name == "m0029_discover_lists"

    def test_a_library_with_no_picked_run_gets_no_list(self, lists):
        assert lists.all() == []

    @pytest.fixture
    def old(self, tmp_path):
        service = DatabaseService(db_path=tmp_path / "v28.db")
        MigrationRunner(
            service, migrations=[m for m in discover_migrations() if m.version <= 28]
        ).migrate()
        yield service
        service.close_all()

    def _run(self, service, started, artists, labels):
        with service.transaction() as conn:
            conn.execute(
                "INSERT INTO discovery_runs (started_at, params_json) VALUES (?, ?)",
                (started, json.dumps({"artists": artists, "labels": labels})),
            )

    def test_the_newest_picked_selection_becomes_a_list(self, old):
        self._run(
            old, "2026-01-01T00:00:00+00:00", {"picked": ["Old One"]}, {"picked": None}
        )
        self._run(
            old,
            "2026-02-01T00:00:00+00:00",
            {"picked": ["Bicep", "Ben UFO", "Bicep", " "]},
            {"picked": ["Anjunadeep"]},
        )
        self._run(old, "2026-03-01T00:00:00+00:00", {"picked": []}, {"picked": None})
        MigrationRunner(old).migrate()
        found = {
            (item["kind"], item["name"]): item["members"]
            for item in DiscoverListRepository(old).all()
        }
        assert found == {
            ("artist", "My artists"): ["Bicep", "Ben UFO"],
            ("label", "My labels"): ["Anjunadeep"],
        }

    def test_a_malformed_run_is_skipped_not_fatal(self, old):
        self._run(
            old, "2026-01-01T00:00:00+00:00", {"picked": ["Bicep"]}, {"picked": None}
        )
        with old.transaction() as conn:
            conn.execute(
                "INSERT INTO discovery_runs (started_at, params_json) VALUES (?, ?)",
                ("2026-02-01T00:00:00+00:00", "{not json"),
            )
        MigrationRunner(old).migrate()
        found = {
            (i["kind"], i["name"]): i["members"]
            for i in DiscoverListRepository(old).all()
        }
        assert found == {("artist", "My artists"): ["Bicep"]}

    def test_only_a_malformed_run_leaves_no_list(self, old):
        with old.transaction() as conn:
            conn.execute(
                "INSERT INTO discovery_runs (started_at, params_json) VALUES (?, ?)",
                ("2026-02-01T00:00:00+00:00", "nonsense"),
            )
        MigrationRunner(old).migrate()
        assert DiscoverListRepository(old).all() == []

    def test_members_follow_the_repository_rules(self, old):
        names = ["  Bicep  ", "Bicep", "x" * 301, "", "Ben UFO", 5]
        self._run(old, "2026-01-01T00:00:00+00:00", {"picked": names}, {"picked": None})
        MigrationRunner(old).migrate()
        (made,) = DiscoverListRepository(old).all()
        assert made["members"] == ["Bicep", "Ben UFO"]

    def test_runs_that_looked_at_everything_leave_no_list(self, old):
        self._run(old, "2026-01-01T00:00:00+00:00", {"picked": None}, {"picked": None})
        MigrationRunner(old).migrate()
        assert DiscoverListRepository(old).all() == []


class TestCreate:
    def test_a_list_keeps_its_name_kind_and_ordered_members(self, lists):
        made = lists.create("artist", "  Techno   nights ", ["B", "A", "B", "C"])
        assert made["name"] == "Techno nights"
        assert made["kind"] == "artist"
        assert made["members"] == ["B", "A", "C"]
        assert made["created_at"] == made["updated_at"]
        assert lists.get(made["id"]) == made

    def test_an_empty_list_is_allowed(self, lists):
        assert lists.create("label", "Later")["members"] == []

    def test_a_name_is_unique_within_its_kind_without_regard_to_case(self, lists):
        lists.create("artist", "House")
        with pytest.raises(DiscoverListNameTaken):
            lists.create("artist", " house ")
        assert lists.create("label", "House")["kind"] == "label"

    @pytest.mark.parametrize(
        ("kind", "name", "members", "words"),
        [
            ("track", "x", [], "artists or labels"),
            ("artist", "", [], "name"),
            ("artist", "   ", [], "name"),
            ("artist", 5, [], "text"),
            ("artist", "n" * (MAX_NAME + 1), [], "at most"),
            ("artist", "x", "Bicep", "list of names"),
            ("artist", "x", [3], "another kind"),
            ("artist", "x", ["  "], "empty"),
            ("artist", "x", ["m" * 301], "at most"),
        ],
    )
    def test_it_refuses_what_it_cannot_keep(self, lists, kind, name, members, words):
        with pytest.raises(ValueError, match=words):
            lists.create(kind, name, members)
        assert lists.all() == []

    def test_it_refuses_too_many_members(self, lists):
        with pytest.raises(ValueError, match="at most"):
            lists.create("artist", "Huge", [str(i) for i in range(MAX_MEMBERS + 1)])


class TestReadUpdateDelete:
    def test_lists_come_by_kind_then_name(self, lists):
        lists.create("label", "b")
        lists.create("artist", "Z")
        lists.create("artist", "a")
        assert [(x["kind"], x["name"]) for x in lists.all()] == [
            ("artist", "a"),
            ("artist", "Z"),
            ("label", "b"),
        ]
        assert [x["name"] for x in lists.all("artist")] == ["a", "Z"]

    def test_update_renames_and_replaces_members_and_stamps_the_time(self, lists):
        made = lists.create("artist", "One", ["A"])
        changed = lists.update(made["id"], name="Two", members=["B", "C"])
        assert changed is not None
        assert (changed["name"], changed["members"]) == ("Two", ["B", "C"])
        assert changed["created_at"] == made["created_at"]
        assert changed["updated_at"] >= made["updated_at"]

    def test_what_is_not_sent_is_kept(self, lists):
        made = lists.create("artist", "One", ["A"])
        assert lists.update(made["id"], name="Two")["members"] == ["A"]  # type: ignore[index]
        assert lists.update(made["id"], members=[])["name"] == "Two"  # type: ignore[index]

    def test_renaming_to_its_own_name_in_other_case_is_allowed(self, lists):
        made = lists.create("artist", "house")
        assert lists.update(made["id"], name="House")["name"] == "House"  # type: ignore[index]

    def test_renaming_onto_another_list_is_refused_and_changes_nothing(self, lists):
        lists.create("artist", "One", ["A"])
        other = lists.create("artist", "Two", ["B"])
        with pytest.raises(DiscoverListNameTaken):
            lists.update(other["id"], name="one", members=["Z"])
        assert lists.get(other["id"])["members"] == ["B"]  # type: ignore[index]

    def test_an_unknown_list_is_none_and_a_bad_edit_is_refused_first(self, lists):
        assert lists.update(99, name="x") is None
        assert lists.get(99) is None
        with pytest.raises(ValueError):
            lists.update(99, name="")

    def test_delete_removes_the_list_and_its_members(self, lists, db):
        made = lists.create("artist", "One", ["A", "B"])
        assert lists.delete(made["id"]) is True
        assert lists.delete(made["id"]) is False
        left = (
            db.connect()
            .execute("SELECT COUNT(*) FROM discover_list_members")
            .fetchone()
        )
        assert left[0] == 0

    def test_a_failed_write_leaves_nothing_behind(self, lists, db, monkeypatch):
        def broken(*_args, **_kwargs):
            raise sqlite3.OperationalError("disk full")

        monkeypatch.setattr(DiscoverListRepository, "_write_members", broken)
        with pytest.raises(sqlite3.OperationalError):
            lists.create("artist", "One", ["A"])
        assert lists.all() == []
