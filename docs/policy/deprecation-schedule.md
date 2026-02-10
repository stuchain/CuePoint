# Deprecation Schedule — Config Keys and CLI Flags

Concrete schedule for config keys and CLI flags.

**Version 1.0 — 2026-02-03**  
**Last updated**: 2026-02-03

## Overview

This document extends the [Deprecation Policy](deprecation-policy.md) with a concrete schedule for config keys and CLI flags. Deprecations are announced at least 90 days before removal.

## Process

1. **Announce**: Add entry here and in release notes
2. **Warn**: Emit warning when deprecated key/flag is used (if applicable)
3. **Migrate**: Provide migration path in this document
4. **Remove**: After notice period, remove in major/minor release

## Current Schedule

### Config Keys

| Key | Status | Replacement | Removal Target | Notes |
| --- | --- | --- | --- | --- |
| *(none)* | — | — | — | No config keys currently deprecated |

### CLI Flags

| Flag | Status | Replacement | Removal Target | Notes |
| --- | --- | --- | --- | --- |
| *(none)* | — | — | — | No CLI flags currently deprecated |

## Legacy Flat Keys (YAML)

The following flat keys in `config.yaml` are supported for backward compatibility. Prefer nested structure when possible:

| Flat Key | Nested Equivalent | Status |
| --- | --- | --- |
| `DDG_ENABLED` | `network.ddg_enabled` (future) | Supported; nested not yet implemented |
| `DDG_TIMEOUT_SEC` | `network.ddg_timeout_sec` (future) | Supported |
| `DDG_PREFLIGHT_TIMEOUT_SEC` | `network.ddg_preflight_timeout_sec` (future) | Supported |

*Note*: Nested equivalents may be added in a future release. Flat keys will remain supported until explicitly deprecated here.

## Adding a Deprecation

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

## Example Entry (Template)

```
| OLD_KEY | Deprecated | NEW_KEY | v1.3.0 (2026-06-01) | Use NEW_KEY instead. OLD_KEY ignored. |
```

## References

- [Deprecation Policy](deprecation-policy.md) — General process
- [Breaking Change Policy](breaking-change-policy.md) — Major version changes
- [Config Template](../../config/config.yaml.template) — Current config structure
