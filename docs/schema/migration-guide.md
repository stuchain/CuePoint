# Output Schema Migration Guide

Migrating output CSV files between schema versions.

## Overview

When the output schema changes (e.g., new columns, renamed fields), use the migration tool to update existing CSV files.

## Migration Command

```bash
cuepoint migrate --from 1 --to 2 [--file path] [--directory dir]
```

- `--from V`: Source schema version (required)
- `--to V`: Target schema version (required)
- `--file PATH`: Migrate a single CSV file
- `--directory DIR`: Migrate all main CSVs in directory (excludes _candidates, _queries, _review)

## Preconditions

1. **Backup**: The tool creates a `.bak` timestamped backup before overwriting (see implementation).
2. **Schema versions**: Supported versions 1 and 2.

## Migration Steps

1. **Backup**: Ensure you have a copy of your outputs, or let the tool create `.bak` files.
2. **Run migration**:
   ```bash
   cuepoint migrate --from 1 --to 2 --directory output
   ```
3. **Verify**: Check that migrated files have the expected columns and data.

## Schema Version History

| Version | Changes |
| --- | --- |
| 1 | Initial schema. Columns: playlist_index, original_title, beatport_title, etc. |
| 2 | Added `output_schema_version` column for traceability. |

## Rollback

If migration fails, restore from the `.bak` file created before migration:

```bash
cp output/beatport_enriched_20240101_120000.csv.20240101_120500.bak output/beatport_enriched_20240101_120000.csv
```

## Error Codes

- **F001**: Provider missing
- **F002**: Migration failed (see error message for details)
- **F003**: Schema version unsupported
