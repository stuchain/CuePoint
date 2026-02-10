# Breaking Change Policy — CuePoint

**Version 1.0 — 2026-02-03**  
**Last updated**: 2026-02-03

## Overview

This policy describes how CuePoint handles breaking changes and ensures users can migrate safely.

## Semantic Versioning

CuePoint follows [Semantic Versioning](https://semver.org/):

- **Major**: Breaking changes (e.g., 1.0 → 2.0)
- **Minor**: New features, backward compatible (e.g., 1.0 → 1.1)
- **Patch**: Bug fixes, backward compatible (e.g., 1.0 → 1.0.1)

## Breaking Change Requirements

When introducing a breaking change:

1. **Deprecation first**: Deprecate the old behavior before removing it (see [Deprecation Policy](deprecation-policy.md)).
2. **Migration guide**: Provide clear steps to migrate from old to new behavior.
3. **Release notes**: Document the change in release notes with a "Breaking Changes" section.
4. **Changelog**: Include in CHANGELOG with migration instructions.

## Examples of Breaking Changes

- Output CSV schema changes (column renames, removals)
- Config key renames or removals
- CLI flag behavior changes
- Removal of deprecated features

## Migration Documentation

When a breaking change is released, we provide:

- **What changed**: Clear description of the change.
- **Why**: Rationale for the change.
- **How to migrate**: Step-by-step instructions.
- **Timeline**: When the change takes effect.

## Contact

For questions about breaking changes, open an issue in the CuePoint repository.
