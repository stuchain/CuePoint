# Changelog Policy

How to update the changelog.

## Location

`docs/release/CHANGELOG.md`

## Format

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

## When to Update

- **Every PR**: Add entry under `[Unreleased]` for user-visible or notable changes
- **Release**: Move `[Unreleased]` entries to new version section with date

## Categories

| Category | Use For |
| --- | --- |
| Added | New features |
| Changed | Changes to existing behavior |
| Deprecated | Soon-to-be removed features |
| Removed | Removed features |
| Fixed | Bug fixes |
| Security | Vulnerabilities, security improvements |

## Versioning

- Follow [Semantic Versioning](https://semver.org/): MAJOR.MINOR.PATCH
- **MAJOR**: Breaking changes
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes, backward compatible

## PR Checklist

- [ ] Changelog updated for user-facing changes
- [ ] Entry under correct category
- [ ] Clear, concise description
