# Known Issues

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

### No in-app updates

- **Symptom**: There is no "Check for updates" action; the app never offers a new version
- **Cause**: The previous update flow was built on PySide6/Qt and was never wired into the
  Electron shell, so it could not run in the shipped app. That dead code has been removed rather
  than left in place appearing to work
- **Workaround**: Download the latest installer from [Releases](https://github.com/stuchain/CuePoint/releases)
- **Fix**: An Electron-native updater reusing the existing appcast feed is planned, not yet
  scheduled. See [update-system.md](../features/update-system.md)

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
