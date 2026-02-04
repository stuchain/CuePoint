# Known Issues

Design: Step 13 Post-Launch Operations and Support.

## Purpose

This document tracks known issues, workarounds, and planned fixes. Update after each release and after incidents.

## Format

Each entry follows:

```
### [Issue title]
- **Symptom**: What users see
- **Cause**: Root cause (when known)
- **Workaround**: What users can do
- **Fix**: Planned version or status
```

## Current Known Issues

### Update fails on some Windows 10 configurations

- **Symptom**: Auto-update reports failure or hangs
- **Cause**: Appcast or signature verification may fail on older Windows 10 builds
- **Workaround**: Download installer manually from [Releases](https://github.com/stuchain/CuePoint/releases)
- **Fix**: Under investigation

### Large XML exports may be slow

- **Symptom**: Processing stalls or takes very long for XML files > 50MB
- **Cause**: Memory and I/O scaling
- **Workaround**: Split playlists; use `--fast` preset; ensure sufficient RAM
- **Fix**: Ongoing performance improvements

---

## Adding Entries

1. Add new entries at the top of "Current Known Issues"
2. Use the format above
3. Update "Fix" when resolved
4. Move resolved issues to "Resolved" section (optional)

## Resolved (Archive)

_Resolved issues can be moved here for reference._

---

*Last updated: 2026-02-03*
