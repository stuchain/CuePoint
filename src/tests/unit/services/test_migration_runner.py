#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for library database schema migrations.

The central guarantee is that a CuePoint update never requires the user to
delete their database, so these tests focus on: migrations apply in order and
exactly once, a failure rolls back cleanly and can be resumed, and a database
written by a newer CuePoint is refused rather than damaged.
"""

from __future__ import annotations

import pytest

from cuepoint.exceptions.cuepoint_exceptions import DatabaseError
from cuepoint.migrations import (
    Migration,
    discover_migrations,
    split_sql_statements,
)
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.interfaces import IMigrationRunner
from cuepoint.services.migration_runner import SCHEMA_VERSION_TABLE, MigrationRunner


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    yield service
    service.close_all()


def _migration(version: int, sql: str = "", description: str = "test") -> Migration:
    return Migration(
        version=version,
        description=description,
        sql=sql,
        module_name=f"m{version:04d}_test",
    )


def _tables(db: DatabaseService) -> set[str]:
    return {
        row["name"]
        for row in db.connect().execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
    }


@pytest.mark.unit
class TestDiscovery:
    def test_implements_interface(self):
        assert issubclass(MigrationRunner, IMigrationRunner)

    def test_real_migrations_are_discoverable(self):
        """The shipped migration set must load; guards against a broken module."""
        migrations = discover_migrations()
        assert migrations, "no migrations discovered"
        assert [m.version for m in migrations] == list(range(1, len(migrations) + 1)), (
            "shipped migrations must be sequential from 1"
        )

    def test_real_migrations_have_descriptions(self):
        assert all(m.description.strip() for m in discover_migrations())

    def test_migrations_are_python_modules_not_data_files(self):
        """Migrations must survive PyInstaller packaging.

        Data files need explicit spec entries and have been missed before in
        this repo (incrate/schema.sql is absent from the packaged sidecar).
        Python modules are followed automatically via the module graph.
        """
        import cuepoint.migrations as migrations_pkg

        package_dir = migrations_pkg.__path__[0]
        from pathlib import Path

        assert not list(Path(package_dir).glob("*.sql")), (
            "migrations must be .py modules, not .sql data files"
        )


@pytest.mark.unit
class TestVersionTracking:
    def test_fresh_database_is_version_zero(self, db):
        assert MigrationRunner(db, migrations=[]).current_version() == 0

    def test_target_version_is_highest_migration(self, db):
        runner = MigrationRunner(db, migrations=[_migration(1), _migration(2)])
        assert runner.target_version == 2

    def test_target_version_zero_when_no_migrations(self, db):
        assert MigrationRunner(db, migrations=[]).target_version == 0

    def test_version_recorded_after_migrate(self, db):
        runner = MigrationRunner(db, migrations=[_migration(1), _migration(2)])
        runner.migrate()
        assert runner.current_version() == 2

    def test_schema_version_rows_describe_each_migration(self, db):
        runner = MigrationRunner(
            db,
            migrations=[
                _migration(1, description="first"),
                _migration(2, description="second"),
            ],
        )
        runner.migrate()

        rows = (
            db.connect()
            .execute(
                f"SELECT version, description, applied_at FROM {SCHEMA_VERSION_TABLE} "
                "ORDER BY version"
            )
            .fetchall()
        )
        assert [r["version"] for r in rows] == [1, 2]
        assert [r["description"] for r in rows] == ["first", "second"]
        assert all(r["applied_at"] for r in rows)


@pytest.mark.unit
class TestApplyingMigrations:
    def test_applies_pending_in_order(self, db):
        applied_order = [
            _migration(1, "CREATE TABLE a (id INTEGER);"),
            _migration(2, "CREATE TABLE b (id INTEGER);"),
            _migration(3, "CREATE TABLE c (id INTEGER);"),
        ]
        applied = MigrationRunner(db, migrations=applied_order).migrate()

        assert [m.version for m in applied] == [1, 2, 3]
        assert {"a", "b", "c"} <= _tables(db)

    def test_migrate_is_idempotent(self, db):
        runner = MigrationRunner(
            db, migrations=[_migration(1, "CREATE TABLE a (id INTEGER);")]
        )
        assert len(runner.migrate()) == 1
        assert runner.migrate() == [], "second run must apply nothing"

    def test_only_pending_migrations_are_applied(self, db):
        """Simulates upgrading CuePoint: v1 applied, v2 ships later."""
        first = _migration(1, "CREATE TABLE a (id INTEGER);")
        MigrationRunner(db, migrations=[first]).migrate()

        second = _migration(2, "CREATE TABLE b (id INTEGER);")
        applied = MigrationRunner(db, migrations=[first, second]).migrate()

        assert [m.version for m in applied] == [2], "must not re-apply migration 1"
        assert {"a", "b"} <= _tables(db)

    def test_pending_migrations_reported(self, db):
        first = _migration(1)
        MigrationRunner(db, migrations=[first]).migrate()

        runner = MigrationRunner(db, migrations=[first, _migration(2), _migration(3)])
        assert [m.version for m in runner.pending_migrations()] == [2, 3]

    def test_empty_migration_still_records_version(self, db):
        """The baseline migration creates nothing but must mark the version."""
        runner = MigrationRunner(db, migrations=[_migration(1, sql="")])
        runner.migrate()
        assert runner.current_version() == 1

    def test_multi_statement_migration(self, db):
        runner = MigrationRunner(
            db,
            migrations=[
                _migration(
                    1,
                    """
                    CREATE TABLE a (id INTEGER PRIMARY KEY);
                    CREATE TABLE b (id INTEGER PRIMARY KEY);
                    CREATE INDEX idx_b ON b (id);
                    """,
                )
            ],
        )
        runner.migrate()
        assert {"a", "b"} <= _tables(db)

    def test_no_migrations_is_a_no_op(self, db):
        assert MigrationRunner(db, migrations=[]).migrate() == []


@pytest.mark.unit
class TestFailureIsAtomic:
    def test_failing_migration_rolls_back_its_own_ddl(self, db):
        """A half-applied migration is the corruption migrations exist to prevent.

        Regression guard: an earlier implementation used executescript(), which
        issues an implicit COMMIT and left the DDL committed after rollback.
        """
        runner = MigrationRunner(
            db,
            migrations=[
                _migration(
                    1,
                    """
                    CREATE TABLE partial (id INTEGER);
                    INSERT INTO does_not_exist VALUES (1);
                    """,
                )
            ],
        )
        with pytest.raises(DatabaseError) as exc:
            runner.migrate()

        assert exc.value.error_code == "DB_MIGRATION_FAILED"
        assert "partial" not in _tables(db), "DDL survived a failed migration"
        assert runner.current_version() == 0

    def test_earlier_migrations_survive_a_later_failure(self, db):
        runner = MigrationRunner(
            db,
            migrations=[
                _migration(1, "CREATE TABLE good (id INTEGER);"),
                _migration(
                    2, "CREATE TABLE bad (id INTEGER); INSERT INTO nope VALUES (1);"
                ),
            ],
        )
        with pytest.raises(DatabaseError):
            runner.migrate()

        assert "good" in _tables(db)
        assert "bad" not in _tables(db)
        assert runner.current_version() == 1

    def test_failed_migration_can_be_resumed_after_fix(self, db):
        """An interrupted upgrade must resume, not require deleting the database."""
        broken = _migration(
            2, "CREATE TABLE b (id INTEGER); INSERT INTO nope VALUES (1);"
        )
        first = _migration(1, "CREATE TABLE a (id INTEGER);")

        with pytest.raises(DatabaseError):
            MigrationRunner(db, migrations=[first, broken]).migrate()
        assert MigrationRunner(db, migrations=[first]).current_version() == 1

        fixed = _migration(2, "CREATE TABLE b (id INTEGER);")
        applied = MigrationRunner(db, migrations=[first, fixed]).migrate()

        assert [m.version for m in applied] == [2]
        assert {"a", "b"} <= _tables(db)

    def test_error_context_identifies_the_migration(self, db):
        runner = MigrationRunner(
            db, migrations=[_migration(1, "INSERT INTO nope VALUES (1);")]
        )
        with pytest.raises(DatabaseError) as exc:
            runner.migrate()
        assert exc.value.context["migration_version"] == 1
        assert exc.value.context["db_path"] == str(db.db_path)


@pytest.mark.unit
class TestDowngradeProtection:
    def test_database_newer_than_app_is_refused(self, db):
        """Opening a newer database with an older app must not damage it."""
        MigrationRunner(db, migrations=[_migration(1), _migration(2)]).migrate()

        older_app = MigrationRunner(db, migrations=[_migration(1)])
        with pytest.raises(DatabaseError) as exc:
            older_app.migrate()

        assert exc.value.error_code == "DB_SCHEMA_TOO_NEW"
        assert exc.value.context["database_version"] == 2
        assert exc.value.context["supported_version"] == 1

    def test_downgrade_message_tells_user_what_to_do(self, db):
        MigrationRunner(db, migrations=[_migration(1), _migration(2)]).migrate()
        with pytest.raises(DatabaseError) as exc:
            MigrationRunner(db, migrations=[_migration(1)]).migrate()
        assert "newer version of CuePoint" in exc.value.message


@pytest.mark.unit
class TestSqlStatementSplitting:
    def test_splits_on_statement_boundaries(self):
        statements = split_sql_statements(
            "CREATE TABLE a (id INTEGER); CREATE TABLE b (id INTEGER);"
        )
        assert len(statements) == 2

    def test_two_statements_on_one_line_are_split(self, tmp_path):
        """execute() takes a single statement, so same-line pairs must split.

        Regression guard: a line-based splitter left these joined, which failed
        at runtime with "You can only execute one statement at a time".
        """
        service = DatabaseService(db_path=tmp_path / "one-line.db")
        try:
            runner = MigrationRunner(
                service,
                migrations=[
                    _migration(
                        1, "CREATE TABLE a (id INTEGER); CREATE TABLE b (id INTEGER);"
                    )
                ],
            )
            runner.migrate()
            assert {"a", "b"} <= _tables(service)
        finally:
            service.close_all()

    def test_semicolon_inside_string_literal_is_not_a_boundary(self):
        statements = split_sql_statements("INSERT INTO t (v) VALUES ('a;b');")
        assert len(statements) == 1
        assert "a;b" in statements[0]

    def test_trigger_body_is_kept_together(self):
        """CREATE TRIGGER contains semicolons; naive splitting would break it."""
        script = """
        CREATE TRIGGER t AFTER INSERT ON x
        BEGIN
            UPDATE x SET n = n + 1;
            UPDATE x SET m = m + 1;
        END;
        """
        assert len(split_sql_statements(script)) == 1

    def test_comments_only_yields_no_statements(self):
        assert split_sql_statements("-- just a comment\n") == []

    def test_block_comment_only_yields_no_statements(self):
        assert split_sql_statements("/* nothing to do */") == []

    def test_empty_script_yields_no_statements(self):
        assert split_sql_statements("") == []
        assert split_sql_statements("   \n  ") == []

    def test_statement_without_trailing_semicolon(self):
        assert len(split_sql_statements("CREATE TABLE a (id INTEGER)")) == 1

    def test_comments_between_statements_are_dropped(self):
        statements = split_sql_statements(
            """
            -- first
            CREATE TABLE a (id INTEGER);
            -- second
            CREATE TABLE b (id INTEGER);
            """
        )
        assert len(statements) == 2
