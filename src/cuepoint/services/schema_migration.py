#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Schema migration tool (Step 12: Future-Proofing).

Migrates output CSV files between schema versions.
Creates .bak backup before migration (Design 12.26).
"""

import csv
import os
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

from cuepoint.data.providers import F002_MIGRATION_FAILED
from cuepoint.services.integrity_service import create_backup
from cuepoint.services.output_writer import read_csv_skip_comments

# Supported schema versions
SCHEMA_VERSION_MIN = 1
SCHEMA_VERSION_MAX = 2


@dataclass
class MigrationResult:
    """Result of a migration run."""

    files_migrated: int
    errors: List[str]
    backups_created: List[str]


def _parse_schema_version(filepath: str) -> Optional[int]:
    """Parse schema_version from CSV header lines."""
    try:
        with open(filepath, "r", newline="", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("# schema_version="):
                    try:
                        return int(line.split("=", 1)[1].strip())
                    except (ValueError, IndexError):
                        return None
                if line and not line.startswith("#"):
                    break
    except OSError:
        pass
    return None


def _read_header_lines(filepath: str) -> List[str]:
    """Read comment header lines from CSV."""
    lines = []
    try:
        with open(filepath, "r", newline="", encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("#"):
                    lines.append(line.rstrip("\n"))
                else:
                    break
    except OSError:
        pass
    return lines


def _migrate_v1_to_v2(row: Dict[str, Any]) -> Dict[str, Any]:
    """Migration v1 -> v2: Add output_schema_version if missing (Design 12.157)."""
    if "output_schema_version" not in row:
        row["output_schema_version"] = "2"
    return row


# Migration functions: (from_version, to_version) -> row transformer
_MIGRATIONS: Dict[Tuple[int, int], Callable[[Dict[str, Any]], Dict[str, Any]]] = {
    (1, 2): _migrate_v1_to_v2,
}


def _get_migration_chain(from_ver: int, to_ver: int) -> List[Tuple[int, int]]:
    """Get the chain of migrations to apply (from_ver -> from_ver+1 -> ... -> to_ver)."""
    if from_ver >= to_ver:
        return []
    chain = []
    for v in range(from_ver, to_ver):
        step = (v, v + 1)
        if step not in _MIGRATIONS:
            return []  # No path
        chain.append(step)
    return chain


def migrate_csv_file(
    filepath: str,
    from_version: int,
    to_version: int,
    create_backup_file: bool = True,
) -> Tuple[bool, Optional[str]]:
    """Migrate a single CSV file from one schema version to another.

    Args:
        filepath: Path to CSV file.
        from_version: Source schema version.
        to_version: Target schema version.
        create_backup_file: If True, create .bak before overwriting.

    Returns:
        Tuple of (success, error_message).
    """
    path = os.path.abspath(filepath)
    if not os.path.exists(path) or not os.path.isfile(path):
        return False, f"File not found: {path}"

    chain = _get_migration_chain(from_version, to_version)
    if not chain:
        if from_version == to_version:
            return True, None
        return False, f"No migration path from v{from_version} to v{to_version}"

    # Create backup (Design 12.26)
    if create_backup_file:
        bak = create_backup(path)
        if not bak:
            return False, f"{F002_MIGRATION_FAILED}: Could not create backup"

    try:
        fieldnames, rows = read_csv_skip_comments(path)
        if not fieldnames:
            return False, f"{F002_MIGRATION_FAILED}: No headers in CSV"

        # Apply migration chain
        for step in chain:
            migrate_fn = _MIGRATIONS[step]
            rows = [migrate_fn(dict(row)) for row in rows]
            # Ensure new columns are in fieldnames
            for row in rows:
                for k in row:
                    if k not in fieldnames:
                        fieldnames.append(k)

        # Write back with updated schema version
        header_lines = _read_header_lines(path)
        new_header_lines = []
        for line in header_lines:
            if line.strip().startswith("# schema_version="):
                new_header_lines.append(f"# schema_version={to_version}")
            else:
                new_header_lines.append(line)

        # If no schema_version in header, add it
        if not any("# schema_version=" in h for h in new_header_lines):
            new_header_lines.insert(0, f"# schema_version={to_version}")

        with open(path, "w", newline="", encoding="utf-8") as f:
            for line in new_header_lines:
                f.write(line + "\n")
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)

        return True, None
    except Exception as e:
        return False, f"{F002_MIGRATION_FAILED}: {e}"


def migrate_directory(
    directory: str,
    from_version: int,
    to_version: int,
    pattern: str = "*.csv",
) -> MigrationResult:
    """Migrate all matching CSV files in a directory.

    Args:
        directory: Directory path.
        from_version: Source schema version.
        to_version: Target schema version.
        pattern: Glob pattern (default *.csv). Excludes *_candidates, *_queries, *_review.

    Returns:
        MigrationResult with counts and errors.
    """
    import glob

    errors: List[str] = []
    backups: List[str] = []
    migrated = 0

    dir_path = os.path.abspath(directory)
    if not os.path.isdir(dir_path):
        return MigrationResult(0, [f"Directory not found: {dir_path}"], [])

    for filepath in glob.glob(os.path.join(dir_path, pattern)):
        if any(x in filepath for x in ["_candidates", "_queries", "_review"]):
            continue
        try:
            detected = _parse_schema_version(filepath)
            from_ver = from_version if from_version >= 0 else (detected or 1)
            if from_ver != to_version:
                ok, err = migrate_csv_file(filepath, from_ver, to_version)
                if ok:
                    migrated += 1
                elif err:
                    errors.append(f"{filepath}: {err}")
        except Exception as e:
            errors.append(f"{filepath}: {e}")

    return MigrationResult(migrated, errors, backups)


def run_migrate(
    from_version: int,
    to_version: int,
    file_path: Optional[str] = None,
    directory: Optional[str] = None,
) -> MigrationResult:
    """Run migration on file or directory.

    Args:
        from_version: Source schema version (1 or 2).
        to_version: Target schema version.
        file_path: Single file to migrate (optional).
        directory: Directory to migrate (optional).

    Returns:
        MigrationResult.
    """
    if from_version < SCHEMA_VERSION_MIN or from_version > SCHEMA_VERSION_MAX:
        return MigrationResult(0, [f"Unsupported from_version: {from_version}"], [])
    if to_version < SCHEMA_VERSION_MIN or to_version > SCHEMA_VERSION_MAX:
        return MigrationResult(0, [f"Unsupported to_version: {to_version}"], [])

    if file_path:
        ok, err = migrate_csv_file(file_path, from_version, to_version)
        if ok:
            return MigrationResult(1, [], [])
        return MigrationResult(0, [err or "Unknown error"], [])

    if directory:
        return migrate_directory(directory, from_version, to_version)

    return MigrationResult(0, ["Specify --file or --directory"], [])
