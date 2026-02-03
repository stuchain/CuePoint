# Output Schema Versioning

Design 10.12, 10.36. Versioning policy for CSV and export formats.

## Overview

CuePoint exports CSV, JSON, and Excel. Schema changes can break downstream tools. This policy defines how we version and evolve output formats.

## Current Schema

- **CSV**: Main results, candidates, audit log. See `SRC/cuepoint/services/output_writer.py`
- **JSON**: Same data in JSON structure
- **Excel**: Same columns in spreadsheet format

## Schema Version

Output files include a `schema_version` header (Design 9). Current version: `1.0`.

## Versioning Rules

| Change Type | Version Bump | Migration |
| --- | --- | --- |
| New optional column | PATCH | None |
| Renamed column | MINOR | Document old→new mapping |
| Removed column | MAJOR | Migration guide required |
| Changed column meaning | MAJOR | Migration guide required |

## Adding a New Column

1. Add column to `_main_csv_fieldnames()` or equivalent
2. Update `TrackResult.to_dict()` if needed
3. Document in this file and release notes
4. No schema version bump if additive and optional

## Breaking Changes

For breaking changes:

1. Bump schema version (e.g., 1.0 → 2.0)
2. Add migration guide in `DOCS/RELEASE/` or `DOCS/GUIDES/`
3. Document in release notes
4. Consider backward-compat mode (e.g., flag for old format)

## Key Columns (CSV)

Core columns: `original_title`, `original_artists`, `beatport_title`, `beatport_artists`, `beatport_key`, `beatport_key_camelot`, `beatport_year`, `beatport_bpm`, `beatport_url`, `match_score`, `confidence`, etc.

Full list: `output_writer._main_csv_fieldnames()`.
