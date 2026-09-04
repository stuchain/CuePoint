# Changelog

All notable changes to CuePoint will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- The window is now laid out as an application frame rather than a centered page.
  Screens sit at the top of a content area that scrolls on its own, and the menu
  bar occupies its own row instead of floating over the content. Previously long
  screens scrolled the whole window, which would have carried the navigation and
  status chrome off-screen as those are added

### Added
- A Library page. Import a Rekordbox collection and CuePoint keeps it — tracks,
  playlists and playlist membership — and remembers the export it came from, so
  refreshing later is one click. The page tells you when that export has changed
  since your last import
- Refreshing shows you what would change before it changes anything: how many
  tracks would be added, updated and removed, which tracks would be deleted, and
  a warning that deleting them takes their ratings, tags and history with them.
  Nothing happens until you confirm, and cancelling changes nothing
- Checking an unchanged collection for changes is now instant. CuePoint compares
  the export's modified time and size against what it recorded at import instead
  of re-reading a 50,000-track file to tell you nothing happened
- CuePoint now restarts its engine if it stops unexpectedly, showing
  "Reconnecting to engine…" while it tries. After three attempts it stops and
  offers a Restart engine button instead of retrying indefinitely
- The Activity panel now lists library backups and engine starts, so a
  repeatedly crashing engine is visible rather than silently restarted
- Keyboard shortcuts for the window: Ctrl+B collapses the navigation, Ctrl+I
  shows or hides the Track Inspector, and Ctrl+Shift+A opens Activity. Every
  part of the window can now be reached with Tab alone
- An Activity panel, opened from the status strip, listing what CuePoint has
  done — imports, backups and edits — newest first
- A status strip along the bottom of the window shows whether the engine is
  connected and the progress of any running job, wherever you are in the app —
  including a job that was already running before the window reloaded
- A Track Inspector panel docked to the right of the window. Drag its edge to
  resize it, or hide it with Ctrl+I; the width and whether it is showing are
  remembered between sessions. It stays put as you move between pages, and will
  fill with track details as those screens arrive
- Search your library from the header, or with Ctrl+K. It searches track titles,
  artists, albums and labels, and says so plainly when no library has been
  imported yet rather than reporting that nothing matched
- A navigation sidebar replaces the floating row of links. It can be collapsed to
  an icon-only rail and remembers that choice between sessions
- The app reopens on the page you were last using. If that page is no longer
  available it opens on the tool picker rather than showing nothing
- The library database is now backed up automatically when the app starts, keeping
  the five most recent copies in `~/.cuepoint/backups/`. The backup is taken before
  any schema upgrade runs, so a copy of the previous state always exists, and is
  skipped when nothing has changed since the last one. A backup failure never
  prevents the app from starting
- Pixel-art icons for every navigation destination, so the sidebar reads as
  icons alone when collapsed
- Pixel-art icons for the toolbar. Settings, Export and Filter are now drawn as
  pixel artwork instead of Unicode glyphs, joined by transport (play/pause/next/
  previous) and navigation (home/library/activity) icons for upcoming screens.
  The artwork inherits the active theme's colour, so all five themes are covered
  by one drawing, and it stays sharp at every interface scale

### Known limitations
- CuePoint does not check that your track files are still on disk. A track whose
  file has moved or been deleted looks like any other until a later release adds
  the check
- inCrate keeps its own separate inventory. Importing your collection on the
  Library page does not import it into inCrate, and the two can drift apart —
  see [Your library](../user-guide/library.md). A later release moves inCrate
  onto the shared library

### Fixed
- Tracks whose filename contains a `?` or a `#` can now be found on disk.
  CuePoint cut the path short at the first one — `Is This A Dream? (Remix).mp3`
  became `Is This A Dream`, with no extension — so writing tags to those tracks
  silently did nothing. Seven tracks in a 3,880-track collection were affected
- Dialogs can be used from the keyboard. They now take focus when they open,
  keep Tab inside themselves, close on Escape, and return focus to whatever
  opened them — previously a dialog could be opened and never reached
- Parts of a page are no longer cut off with no way to reach them. At larger
  interface scales the results page hid content below the fold, and its filter
  control could be missing entirely even at the default scale
- The engine connection indicator now updates. It previously read the engine's
  state once when the window opened and never again, so it could report a
  connection long after the engine had stopped
- The top of a page is no longer unreachable when it is taller than the window.
  Long pages were centred vertically, which pushed their top edge above the
  scrollable area with no way to bring it back — the inKey screen lost its whole
  toolbar this way at the default interface scale
- Screens now render in the installed app. The window showed its menu bar and
  navigation but an empty content area on every page, because the app used a
  browser-style router while the installed build loads its files from disk —
  no page ever matched. Development builds were unaffected, which is why it went
  unnoticed. Navigation, reloading and deep links all work now
- `PrivacyService` and `OnboardingService` no longer import PySide6. Both had an
  unguarded module-level `from PySide6.QtCore import QSettings`, which raised
  `ImportError` in the shipped Electron engine sidecar (PySide6 is not in the
  default requirements). Both now persist through `ConfigService`
  (`~/.cuepoint/config.yaml`), restoring the AGENTS.md invariant that Qt must not
  enter core, engine, CLI, or services
- Parallel playlist processing: cancelling a run no longer calls `result()` on
  already-cancelled track futures (which raised `CancelledError`) nor logs the
  expected "futures left over after cancellation" case at warning/error level,
  eliminating spurious Sentry issues (PYTHON-1C, PYTHON-1D) on every user
  cancellation of a parallel (`TRACK_WORKERS > 1`) run

## [0.0.3] - 2026-06-24

### Fixed
- Beatport search: parse current `__NEXT_DATA__` format (`tracks.data[]` with `track_id`/`track_name`) so direct search returns track URLs again
- Prefer direct Beatport search by default; disable browser automation fallback in packaged builds

### Added
- Step 10 implementation: Final Configuration & Release Readiness
- Comprehensive Step 10 validation script
- CHANGELOG.md for tracking all changes

## [1.0.0] - 2024-12-14

### Added
- Initial production release
- Beatport metadata enrichment functionality
- Single and batch processing modes
- CSV and JSON export capabilities
- Results filtering and search
- Auto-update system with Sparkle (macOS) and Squirrel (Windows) support
- Comprehensive error handling and logging
- Performance monitoring and diagnostics
- Privacy notice and compliance features
- Localization support infrastructure
- Accessibility features
- Professional UI polish and enhancements

### Security
- Code signing for macOS (Developer ID)
- Code signing for Windows
- macOS notarization support
- Security scanning in CI/CD
- License compliance verification

### Documentation
- Comprehensive documentation in docs/
- Build system documentation
- Release process documentation
- User guides and developer guides

### Infrastructure
- Complete CI/CD pipeline with GitHub Actions
- Automated testing (unit, integration, UI)
- Release gates and quality checks
- Build system for macOS and Windows
- Update feed generation and publishing

## [0.9.0] - 2024-11-01

### Added
- Beta release features
- Initial UI implementation
- Core metadata processing

### Changed
- Improved performance
- Enhanced error handling

---

## Release Notes Format

Each release should include:
- **Version**: Semantic version (MAJOR.MINOR.PATCH)
- **Date**: Release date in YYYY-MM-DD format
- **Categories**: Added, Changed, Deprecated, Removed, Fixed, Security

## Version History

- **1.0.0** (2024-12-14): Initial production release
- **0.9.0** (2024-11-01): Beta release
