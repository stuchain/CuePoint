#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The artist and label pictures the catalog cache keeps (m0038, DEC-318).

One row per Beatport artist or label: the picture URL, or NULL when Beatport was
asked and named none. A URL is never erased by a later "none"; a "none" is
asked again after 30 days. Only the catalog repository runs SQL against the
table.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from cuepoint.models.beatport_cache import (
    ENTITY_ART_MISS_DAYS,
    EntityArt,
    entity_art_asks,
)
from cuepoint.persistence.beatport_catalog_repository import BeatportCatalogRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

pytestmark = pytest.mark.unit

NOW = datetime(2026, 11, 15, 10, 0, tzinfo=timezone.utc)
URL = "https://geo-media.beatport.com/image_size/{w}x{h}/mara.jpg"
OTHER = "https://geo-media.beatport.com/image_size/{w}x{h}/mara2.jpg"


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def catalog(db):
    return BeatportCatalogRepository(db)


class TestTheRepository:
    def test_a_picture_is_set_and_read_back(self, catalog):
        catalog.set_entity_art("artist", 100, URL, NOW.isoformat())
        found = catalog.entity_art([("artist", 100), ("label", 100)])
        assert found == {
            ("artist", 100): EntityArt("artist", 100, URL, NOW.isoformat())
        }

    def test_nothing_asked_for_is_an_empty_answer(self, catalog):
        assert catalog.entity_art([]) == {}
        assert catalog.entity_art([("artist", 1)]) == {}

    def test_an_artist_and_a_label_with_one_id_are_two_rows(self, catalog):
        catalog.set_entity_art("artist", 7, URL, NOW.isoformat())
        catalog.set_entity_art("label", 7, None, NOW.isoformat())
        found = catalog.entity_art([("artist", 7), ("label", 7)])
        assert found[("artist", 7)].image_url == URL
        assert found[("label", 7)].image_url is None

    def test_a_read_across_chunk_boundaries_finds_every_row(self, catalog):
        ids = list(range(1, 1301))
        for beatport_id in ids:
            catalog.set_entity_art("artist", beatport_id, URL, NOW.isoformat())
        found = catalog.entity_art([("artist", i) for i in ids] + [("label", 5)])
        assert len(found) == 1300

    def test_none_never_erases_a_known_picture(self, catalog):
        catalog.set_entity_art("artist", 100, URL, NOW.isoformat())
        later = (NOW + timedelta(days=40)).isoformat()
        catalog.set_entity_art("artist", 100, None, later)
        row = catalog.entity_art([("artist", 100)])[("artist", 100)]
        assert row.image_url == URL

    def test_a_picture_overwrites_none_and_another_picture(self, catalog):
        catalog.set_entity_art("label", 9, None, NOW.isoformat())
        catalog.set_entity_art("label", 9, URL, NOW.isoformat())
        assert catalog.entity_art([("label", 9)])[("label", 9)].image_url == URL
        catalog.set_entity_art("label", 9, OTHER, NOW.isoformat())
        assert catalog.entity_art([("label", 9)])[("label", 9)].image_url == OTHER

    def test_none_over_none_moves_the_time_it_was_asked(self, catalog):
        catalog.set_entity_art("artist", 3, None, NOW.isoformat())
        later = (NOW + timedelta(days=31)).isoformat()
        catalog.set_entity_art("artist", 3, None, later)
        assert catalog.entity_art([("artist", 3)])[("artist", 3)].read_at == later


class TestTheModel:
    def test_a_url_row_is_always_asked_for(self):
        row = EntityArt("artist", 1, URL, NOW.isoformat())
        assert row.asks(NOW + timedelta(days=3650))

    def test_a_none_row_is_asked_again_after_thirty_days_and_not_before(self):
        row = EntityArt("artist", 1, None, NOW.isoformat())
        assert ENTITY_ART_MISS_DAYS == 30
        assert not row.asks(NOW + timedelta(days=29))
        assert row.asks(NOW + timedelta(days=31))

    def test_no_row_means_not_asked_yet(self):
        assert entity_art_asks(None, NOW)
        assert not entity_art_asks(EntityArt("label", 2, None, NOW.isoformat()), NOW)

    def test_a_picture_off_beatport_s_hosts_is_refused_without_echoing_it(self):
        bad = "https://example.com/secret-token.jpg"
        with pytest.raises(ValueError) as caught:
            EntityArt("artist", 1, bad, NOW.isoformat())
        assert "secret-token" not in str(caught.value)

    def test_a_kind_outside_the_vocabulary_and_a_bad_id_are_refused(self):
        with pytest.raises(ValueError):
            EntityArt("chart", 1, None, NOW.isoformat())
        with pytest.raises(ValueError):
            EntityArt("artist", 0, None, NOW.isoformat())


class TestOwnership:
    def test_only_the_catalog_repository_runs_sql_against_the_table(self):
        package = Path(__file__).resolve().parents[3] / "cuepoint"
        statement = re.compile(
            r"\b(FROM|INTO|UPDATE|JOIN|DELETE\s+FROM)\s+beatport_entity_art\b",
            re.IGNORECASE,
        )
        offenders = [
            path.relative_to(package).as_posix()
            for path in sorted(package.rglob("*.py"))
            if path.parent.name != "migrations"
            and statement.search(path.read_text(encoding="utf-8"))
        ]
        assert offenders == ["persistence/beatport_catalog_repository.py"]


class TestARowThatFailsValidation:
    """One bad row must not break the whole read (the lists, cards and pages)."""

    def _bad(self, db, kind, beatport_id, url):
        with db.transaction() as conn:
            conn.execute(
                "INSERT INTO beatport_entity_art (kind, beatport_id, image_url,"
                " read_at) VALUES (?, ?, ?, ?)",
                (kind, beatport_id, url, NOW.isoformat()),
            )

    def test_it_is_skipped_and_logged_and_the_good_rows_are_kept(
        self, db, catalog, caplog
    ):
        catalog.set_entity_art("artist", 1, URL, NOW.isoformat())
        self._bad(db, "artist", 2, "https://example.com/a.jpg")
        self._bad(db, "label", 3, "http://geo-media.beatport.com/a.jpg")
        with caplog.at_level("WARNING"):
            found = catalog.entity_art([("artist", 1), ("artist", 2), ("label", 3)])
        assert set(found) == {("artist", 1)}
        assert "example.com" not in caplog.text
        assert "artist" in caplog.text

    def test_it_reads_as_never_asked_so_it_can_be_asked_again(self, db, catalog):
        self._bad(db, "artist", 2, "https://example.com/a.jpg")
        assert catalog.entity_art([("artist", 2)]) == {}
        catalog.set_entity_art("artist", 2, URL, NOW.isoformat())
        assert catalog.entity_art([("artist", 2)])[("artist", 2)].image_url == URL
