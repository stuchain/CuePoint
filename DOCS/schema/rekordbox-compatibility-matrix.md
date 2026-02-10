# Rekordbox XML Compatibility Matrix

Compatibility matrix for Rekordbox XML versions.

## Overview

CuePoint parses Rekordbox XML export files to extract playlists and track metadata. This document tracks tested Rekordbox versions and known quirks.

## Compatibility Matrix

| Rekordbox | XML Version | Status | Notes |
| --- | --- | --- | --- |
| 5.x | v1 | Supported | Standard XML structure |
| 6.0 | v1 | Supported | |
| 6.1 | v1 | Supported | |
| 6.2 | v1 | Supported | |
| 6.3 | v1 | Supported | |
| 6.4 | v1 | Supported | |
| 6.5 | v1 | Supported | |
| 6.6 | v1 | Supported | |
| 6.7 | v1 | Supported | |
| 6.8 | v1 | Supported | |
| 6.9 | v1 | Supported | |
| 7.0 | v2 | Experimental | New schema; report issues |

## XML Schema Variants

- **v1**: `<DJ_PLAYLISTS>` root, `<COLLECTION>` with `<TRACK>`, `<PLAYLIST>` with `<TRACK>` references
- **v2**: (Rekordbox 7) - Structure may differ; experimental support

## Validation Checklist

When adding support for a new Rekordbox version:

- [ ] Validate XML parsing for the version
- [ ] Validate playlist extraction
- [ ] Validate track metadata (title, artist, BPM, key)
- [ ] Run integration tests with sample XML
- [ ] Update this matrix

## Testing Schedule

Run compatibility tests before each major release. Store results in `compatibility-report.md` (optional).

## Known Quirks

- **Rekordbox 6.x**: Some exports may have empty `<Name>` for tracks; we fall back to filename.
- **Multi-byte characters**: UTF-8 encoding is required; CuePoint expects UTF-8 XML.
