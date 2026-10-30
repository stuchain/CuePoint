# Compatibility: breaking changes, deprecations, output schema and the changelog

How CuePoint changes what users and scripts rely on: when a change counts as breaking, how a feature is deprecated and when it goes, how the CLI's output files are versioned, and how the changelog records it.

## Breaking Change Policy
### Overview

This policy describes how CuePoint handles breaking changes and ensures users can migrate safely.

### Semantic Versioning

CuePoint follows [Semantic Versioning](https://semver.org/):

- **Major**: Breaking changes (e.g., 1.0 → 2.0)
- **Minor**: New features, backward compatible (e.g., 1.0 → 1.1)
- **Patch**: Bug fixes, backward compatible (e.g., 1.0 → 1.0.1)

### Breaking Change Requirements

When introducing a breaking change:

1. **Deprecation first**: Deprecate the old behavior before removing it (see [Deprecation Policy](compatibility.md)).
2. **Migration guide**: Provide clear steps to migrate from old to new behavior.
3. **Release notes**: Document the change in release notes with a "Breaking Changes" section.
4. **Changelog**: Include in CHANGELOG with migration instructions.

### Examples of Breaking Changes

- Output CSV schema changes (column renames, removals)
- Config key renames or removals
- CLI flag behavior changes
- Removal of deprecated features

### Migration Documentation

When a breaking change is released, we provide:

- **What changed**: Clear description of the change.
- **Why**: Rationale for the change.
- **How to migrate**: Step-by-step instructions.
- **Timeline**: When the change takes effect.

### Contact

For questions about breaking changes, open an issue in the CuePoint repository.

## Deprecation Policy
### Overview

This policy describes how CuePoint handles deprecations and breaking changes.

### Deprecation Notice

- **Minimum notice period**: 90 days before removal or breaking change.
- **Announcement**: Deprecations are announced in release notes and, when applicable, in the changelog.
- **Documentation**: Deprecated features are documented with a clear migration path.

### What We Deprecate

- **Config keys**: Settings that are removed or renamed.
- **CLI flags**: Command-line options that are removed or changed.
- **Output formats**: Schemas or file formats that change incompatibly.
- **APIs**: Internal or public interfaces that change.

### Deprecation Process

1. **Announce**: Add deprecation notice in release notes and docs.
2. **Document**: Provide migration steps and alternatives.
3. **Warn**: Emit warnings or log messages when deprecated features are used.
4. **Remove**: After the notice period, remove the deprecated feature in a major or minor release.

### Migration Guidance

When a feature is deprecated, we provide:

- **Clear migration steps**: How to update config, CLI usage, or code.
- **Timeline**: When the feature will be removed.
- **Alternatives**: Recommended replacement or workaround.

Example: *"Config key `old_key` is deprecated. Use `new_key` instead. `old_key` will be removed in v1.2.0 (expected 2026-05-01)."*

### Exceptions

- **Security**: Critical security fixes may require shorter notice.
- **Legal**: Compliance-related changes may require immediate updates.

### Contact

For questions about deprecations, open an issue in the CuePoint repository.

## Deprecation Schedule — Config Keys and CLI Flags

Concrete schedule for config keys and CLI flags.


### Overview

This document extends the [Deprecation Policy](compatibility.md) with a concrete schedule for config keys and CLI flags. Deprecations are announced at least 90 days before removal.

### Process

1. **Announce**: Add entry here and in release notes
2. **Warn**: Emit warning when deprecated key/flag is used (if applicable)
3. **Migrate**: Provide migration path in this document
4. **Remove**: After notice period, remove in major/minor release

### Current Schedule

#### Config Keys

| Key | Status | Replacement | Removal Target | Notes |
| --- | --- | --- | --- | --- |
| *(none)* | — | — | — | No config keys currently deprecated |

#### CLI Flags

| Flag | Status | Replacement | Removal Target | Notes |
| --- | --- | --- | --- | --- |
| *(none)* | — | — | — | No CLI flags currently deprecated |

### Legacy Flat Keys (YAML)

The following flat keys in `config.yaml` are supported for backward compatibility. Prefer nested structure when possible:

| Flat Key | Nested Equivalent | Status |
| --- | --- | --- |
| `DDG_ENABLED` | `network.ddg_enabled` (future) | Supported; nested not yet implemented |
| `DDG_TIMEOUT_SEC` | `network.ddg_timeout_sec` (future) | Supported |
| `DDG_PREFLIGHT_TIMEOUT_SEC` | `network.ddg_preflight_timeout_sec` (future) | Supported |

*Note*: Nested equivalents may be added in a future release. Flat keys will remain supported until explicitly deprecated here.

### Adding a Deprecation

When deprecating a config key or CLI flag:

1. Add entry to the table above with:
   - Key/flag name
   - Status: `Deprecated`
   - Replacement (new key/flag or alternative)
   - Removal target (version and date, ≥90 days out)
   - Notes (migration steps)
2. Add deprecation warning in code:
   - Config keys: Add to `_DEPRECATED_CONFIG_KEYS` in `cuepoint.utils.deprecation`
   - CLI flags: Add to `_DEPRECATED_CLI_FLAGS` and call `warn_deprecated_cli_flag()` in main.py
3. Document in release notes and changelog
4. Update this document when removed

### Example Entry (Template)

```
| OLD_KEY | Deprecated | NEW_KEY | v1.3.0 (2026-06-01) | Use NEW_KEY instead. OLD_KEY ignored. |
```

### References

- [Deprecation Policy](compatibility.md) — General process
- [Breaking Change Policy](compatibility.md) — Major version changes
- [Config Template](../../config/config.yaml.template) — Current config structure

## Output Schema Versioning

Versioning policy for CSV and export formats.

### Overview

CuePoint exports CSV, JSON, and Excel. Schema changes can break downstream tools. This policy defines how we version and evolve output formats.

### Current Schema

- **CSV**: Main results, candidates, audit log. See `src/cuepoint/services/output_writer.py`
- **JSON**: Same data in JSON structure
- **Excel**: Same columns in spreadsheet format

### Schema Version

Output files include a `schema_version` header. Current version: `1.0`.

### Versioning Rules

| Change Type | Version Bump | Migration |
| --- | --- | --- |
| New optional column | PATCH | None |
| Renamed column | MINOR | Document old→new mapping |
| Removed column | MAJOR | Migration guide required |
| Changed column meaning | MAJOR | Migration guide required |

### Adding a New Column

1. Add column to `_main_csv_fieldnames()` or equivalent
2. Update `TrackResult.to_dict()` if needed
3. Document in this file and release notes
4. No schema version bump if additive and optional

### Breaking Changes

For breaking changes:

1. Bump schema version (e.g., 1.0 → 2.0)
2. Add a migration guide in `docs/release/`
3. Document in release notes
4. Consider backward-compat mode (e.g., flag for old format)

### Key Columns (CSV)

Core columns: `original_title`, `original_artists`, `beatport_title`, `beatport_artists`, `beatport_key`, `beatport_key_camelot`, `beatport_year`, `beatport_bpm`, `beatport_url`, `match_score`, `confidence`, etc.

Full list: `output_writer._main_csv_fieldnames()`.

## Changelog Policy

How to update the changelog.

### Location

`docs/release/CHANGELOG.md`

### Format

Follow [Keep a Changelog](https://keepachangelog.com/en/1.0.0/):

```markdown
## [Unreleased]

### Added
- New feature description

### Changed
- Change description

### Fixed
- Bug fix description

### Security
- Security-related change

## [1.2.3] - 2026-02-03

### Added
- ...
```

### When to Update

- **Every PR**: Add entry under `[Unreleased]` for user-visible or notable changes
- **Release**: Move `[Unreleased]` entries to new version section with date

### Categories

| Category | Use For |
| --- | --- |
| Added | New features |
| Changed | Changes to existing behavior |
| Deprecated | Soon-to-be removed features |
| Removed | Removed features |
| Fixed | Bug fixes |
| Security | Vulnerabilities, security improvements |

### Versioning

- Follow [Semantic Versioning](https://semver.org/): MAJOR.MINOR.PATCH
- **MAJOR**: Breaking changes
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes, backward compatible

### PR Checklist

- [ ] Changelog updated for user-facing changes
- [ ] Entry under correct category
- [ ] Clear, concise description
