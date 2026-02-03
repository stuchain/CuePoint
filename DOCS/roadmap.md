# CuePoint Roadmap

**Step 12: Future-Proofing** — Track major features and planned evolution.

**Last updated**: 2026-02-03

## Overview

This document tracks planned major features and source expansion for CuePoint. It is updated quarterly and before each major release.

## Current Version

- **Active**: v1.x (Rekordbox → Beatport enrichment)
- **Primary provider**: Beatport
- **Output schema**: v2

## Roadmap Themes

### 1. Source Expansion (High Priority)

| Feature | Status | Target | Notes |
| --- | --- | --- | --- |
| Additional metadata providers | Planned | v2.0 | Traktor, Discogs, Spotify via pluggable provider interface |
| Multi-provider fallback | Implemented | v1.x | Provider abstraction in place; Beatport only today |
| Alternative search backends | Backlog | Future | Consider MusicBrainz, Juno, Bandcamp as providers |

### 2. Rekordbox Compatibility

| Feature | Status | Target | Notes |
| --- | --- | --- | --- |
| Rekordbox 7.x full support | Experimental | v1.1 | XML v2 schema; report issues |
| Rekordbox 8.x | Backlog | Future | Track when released |

### 3. Output and Schema

| Feature | Status | Target | Notes |
| --- | --- | --- | --- |
| Schema v3 (extended fields) | Backlog | v2.0 | Label, genre, release date expansion |
| JSON export format | Backlog | Future | Alternative to CSV for integrations |

### 4. Performance and Reliability

| Feature | Status | Target | Notes |
| --- | --- | --- | --- |
| Incremental processing | Implemented | v1.x | `--incremental` flag |
| Resume/checkpoint | Implemented | v1.x | `--resume` flag |
| Offline mode with cache | Implemented | v1.x | HTTP cache + self-healing |

### 5. User Experience

| Feature | Status | Target | Notes |
| --- | --- | --- | --- |
| GUI improvements | Ongoing | v1.x | Per release |
| Batch processing UI | Backlog | Future | Process multiple playlists |
| Preview before export | Implemented | v1.x | Preview outputs step |

## Prioritization

- **P0**: Critical for release (blockers)
- **P1**: High value, planned for next major
- **P2**: Backlog, evaluated quarterly

## Review Cadence

- **Quarterly**: Update roadmap, reprioritize backlog
- **Pre-release**: Confirm target versions for planned items
- **Post-release**: Mark completed, adjust dates

## Contributing

To propose a roadmap item:

1. Open an issue with the `roadmap` label
2. Describe the feature, rationale, and target version
3. Link to this document in the issue

## References

- [Deprecation Schedule](POLICY/deprecation-schedule.md) — Config and CLI changes
- [Metadata Sources & Caching Strategy](DEVELOPMENT/metadata-sources-caching-strategy.md) — Provider and cache strategy
- [Beatport Site Change Plan](DEVELOPMENT/beatport-site-change-plan.md) — Provider resilience
