#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for schema migration (Step 12)."""

import csv
import os
from pathlib import Path

import pytest

from cuepoint.services.schema_migration import (
    F002_MIGRATION_FAILED,
    _parse_schema_version,
    migrate_csv_file,
    run_migrate,
)


@pytest.mark.unit
class TestParseSchemaVersion:
    """Test schema version parsing."""

    def test_parse_schema_version_v1(self, tmp_path):
        """Parse schema_version=1 from header."""
        p = tmp_path / "test.csv"
        p.write_text("# schema_version=1\n# run_id=abc\ncol1,col2\n1,2\n")
        assert _parse_schema_version(str(p)) == 1

    def test_parse_schema_version_v2(self, tmp_path):
        """Parse schema_version=2 from header."""
        p = tmp_path / "test.csv"
        p.write_text("# schema_version=2\ncol1,col2\n1,2\n")
        assert _parse_schema_version(str(p)) == 2

    def test_parse_schema_version_missing(self, tmp_path):
        """No schema_version returns None."""
        p = tmp_path / "test.csv"
        p.write_text("col1,col2\n1,2\n")
        assert _parse_schema_version(str(p)) is None

    def test_parse_schema_version_nonexistent(self):
        """Nonexistent file returns None."""
        assert _parse_schema_version("/nonexistent/path.csv") is None


@pytest.mark.unit
class TestMigrateCsvFile:
    """Test single file migration."""

    def test_migrate_v1_to_v2_adds_column(self, tmp_path):
        """Migration v1->v2 adds output_schema_version column."""
        p = tmp_path / "main.csv"
        p.write_text(
            "# schema_version=1\n# run_id=test\n"
            "playlist_index,original_title,beatport_url\n"
            "1,Test Track,https://beatport.com/track/t/123\n"
        )
        ok, err = migrate_csv_file(str(p), 1, 2, create_backup_file=False)
        assert ok, err
        assert err is None
        content = p.read_text()
        assert "# schema_version=2" in content
        assert "output_schema_version" in content or "2" in content
        # Check data rows
        with open(p, "r", newline="", encoding="utf-8") as f:
            lines = [l for l in f if not l.strip().startswith("#")]
        reader = csv.DictReader(lines)
        rows = list(reader)
        assert len(rows) >= 1
        assert "output_schema_version" in rows[0] or "output_schema_version" in reader.fieldnames

    def test_migrate_same_version_no_op(self, tmp_path):
        """Migrate v1->v1 is no-op (success)."""
        p = tmp_path / "main.csv"
        p.write_text("# schema_version=1\ncol1,col2\n1,2\n")
        ok, err = migrate_csv_file(str(p), 1, 1, create_backup_file=False)
        assert ok
        assert err is None

    def test_migrate_file_not_found(self):
        """Nonexistent file returns error."""
        ok, err = migrate_csv_file("/nonexistent/file.csv", 1, 2)
        assert not ok
        assert "not found" in (err or "").lower() or "File" in (err or "")

    def test_migrate_no_path_returns_error(self, tmp_path):
        """No migration path returns error."""
        p = tmp_path / "existing.csv"
        p.write_text("# schema_version=2\ncol1\n1\n")
        ok, err = migrate_csv_file(str(p), 2, 1, create_backup_file=False)
        assert not ok
        assert "No migration path" in (err or "") or "path" in (err or "").lower()


@pytest.mark.unit
class TestRunMigrate:
    """Test run_migrate entry point."""

    def test_run_migrate_file(self, tmp_path):
        """Run migrate on single file."""
        p = tmp_path / "out.csv"
        p.write_text("# schema_version=1\ncol1,col2\n1,2\n")
        result = run_migrate(1, 2, file_path=str(p))
        assert result.files_migrated == 1
        assert not result.errors

    def test_run_migrate_directory(self, tmp_path):
        """Run migrate on directory."""
        (tmp_path / "a.csv").write_text("# schema_version=1\ncol1\n1\n")
        (tmp_path / "b.csv").write_text("# schema_version=1\ncol1\n2\n")
        result = run_migrate(1, 2, directory=str(tmp_path))
        assert result.files_migrated == 2
        assert not result.errors

    def test_run_migrate_no_target_returns_error(self):
        """Specify neither file nor directory returns error."""
        result = run_migrate(1, 2)
        assert result.files_migrated == 0
        assert any("file" in e.lower() or "directory" in e.lower() for e in result.errors)

    def test_run_migrate_unsupported_version(self):
        """Unsupported version returns error."""
        result = run_migrate(0, 2, file_path="/tmp/x.csv")
        assert result.files_migrated == 0
        assert result.errors
