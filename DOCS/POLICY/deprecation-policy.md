# Deprecation Policy — CuePoint

**Version 1.0 — 2026-02-03**  
**Last updated**: 2026-02-03

## Overview

This policy describes how CuePoint handles deprecations and breaking changes.

## Deprecation Notice

- **Minimum notice period**: 90 days before removal or breaking change.
- **Announcement**: Deprecations are announced in release notes and, when applicable, in the changelog.
- **Documentation**: Deprecated features are documented with a clear migration path.

## What We Deprecate

- **Config keys**: Settings that are removed or renamed.
- **CLI flags**: Command-line options that are removed or changed.
- **Output formats**: Schemas or file formats that change incompatibly.
- **APIs**: Internal or public interfaces that change.

## Deprecation Process

1. **Announce**: Add deprecation notice in release notes and docs.
2. **Document**: Provide migration steps and alternatives.
3. **Warn**: Emit warnings or log messages when deprecated features are used.
4. **Remove**: After the notice period, remove the deprecated feature in a major or minor release.

## Migration Guidance

When a feature is deprecated, we provide:

- **Clear migration steps**: How to update config, CLI usage, or code.
- **Timeline**: When the feature will be removed.
- **Alternatives**: Recommended replacement or workaround.

Example: *"Config key `old_key` is deprecated. Use `new_key` instead. `old_key` will be removed in v1.2.0 (expected 2026-05-01)."*

## Exceptions

- **Security**: Critical security fixes may require shorter notice.
- **Legal**: Compliance-related changes may require immediate updates.

## Contact

For questions about deprecations, open an issue in the CuePoint repository.
