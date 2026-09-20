# Changelog

All notable changes to CuePoint will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Resuming a match. A match you stopped, or one CuePoint's closing cut short,
  is offered on the Clean page with how many tracks it left, and an interrupted
  one's Activity entry offers **Resume** too. Resuming matches only the tracks
  it had not reached
- A user guide page for Clean, and a Clean section in the performance guide
  with timings measured on a 50,000-track library carrying 1.2 million stored
  Beatport candidates
- Clean in the Library. Four columns — match state, match score, file status
  and artwork — are in the column list, and sort with what needs you first.
  Key, BPM, genre, label and year show your own value with a small mark saying
  whether it came from Beatport or from you. A track's right-click menu and the
  Actions button offer Match on Beatport, Re-match, Accept match, Reject match,
  Apply Beatport values…, Edit metadata…, Check files and Write tags to files…,
  for one track or everything selected. Filters whose values are a fixed list
  — match state, file status, artwork and the rest — offer them as a choice
- The Inspector shows a track's artwork, a Beatport part — where the track
  stands, the match that was decided, and for each of the five fields what
  Rekordbox sent, what Beatport has and what you see now, with Apply beside
  each — and lets you type your own key, BPM, genre, label and year, with the
  reason shown when a value is refused. **Open on the Clean page** goes to the
  track's review
- Taking changes back. The Inspector's History offers **Revert** on every
  change you made in CuePoint, and a change to many tracks is reverted as one
  from its entry in Activity. Adding tracks to or removing them from a
  Collection cannot be reverted, and its entry says so
- Writing tags to files, from the Library. Choose the fields, preview what
  would change — the preview only reads — and only then write. The write and
  every restore are listed in Activity with **Restore**, which puts back every
  value the write replaced. A write that CuePoint closed in the middle of is
  listed as one whose writes may not have finished, never as a finished write,
  with Restore offered
- A Clean page in the navigation, with four parts. **Review** lists tracks by
  where they stand with Beatport — needs review first — for the whole library,
  a playlist or a Collection. Select a track to see it beside every candidate
  the matcher found, with each difference marked and the reason a candidate was
  refused. Accept one, reject the match, clear your own decision, apply chosen
  fields from an accepted match, or match again. Up and Down move through the
  queue, Left and Right choose a candidate, A accepts, R rejects and N moves on.
  Match a selection or everything shown, and export the list as CSV, JSON or
  Excel. **Missing files** lists files that are not where Rekordbox says, shows
  the nearest folder that still exists, and says a disconnected drive in one
  line; fixing a file still happens in Rekordbox. **Duplicates** shows possible
  duplicates with what put them together, and lets you mark a group as not
  duplicates, tag its tracks or add them to a Collection — nothing is deleted.
  **Health** counts what needs attention, each number opening the Library on
  exactly those tracks, and says when each check last ran
- Your own Collections, beside the Rekordbox playlists in the Library page's
  left pane. Make folders and Collections, drag tracks into them, arrange them
  in the order you want, and move or rename them later. A delete says what it
  removes before removing it, and no Collection operation ever deletes a track
- Smart Collections: build a filter in the Library bar and save it. It keeps
  answering as your library grows, so a track imported next month that matches
  the rules appears in it. Open one and its rules load back into the bar;
  change them and it offers to update it, save a second one, or keep the change
  as an ordinary filter. Duplicate one to start a separate saved filter, or
  freeze one to keep what it matches right now as an ordinary Collection
- Tags, with a manager beside the filter bar: rename, recolour, categorize,
  merge two into one, or delete. Every tag shows how many tracks carry it, and
  both destructive actions say that number before they happen. Filter by tag
  from the same bar, choosing from the tags your library actually uses
- CuePoint's own rating, favorite and notes for a track, kept separate from
  what Rekordbox imported. The Inspector edits them, shows which layer an
  effective rating came from, keeps every imported field read-only, and lists
  the track's change history. Clearing a CuePoint rating falls back to
  Rekordbox's rather than making the track unrated
- Changing many tracks at once: rate, favorite, tag or file everything your
  current search and filters match — tens of thousands of tracks if that is
  what it matches. It asks first with the number, then runs in the background
  with progress and a Cancel button, and records what it did on every track
- A Collections entry in the navigation rail, which opens the Library page with
  the Collections tree focused rather than a second browser

- CuePoint plays your music. Double-click a track in the Library and it plays,
  with the view you were looking at — filtered, sorted, scoped to a playlist —
  becoming the queue in the order on screen. A player bar appears along the
  bottom the first time you play something, with transport, seeking, volume,
  shuffle and repeat, and a queue panel you can reorder by keyboard or by
  dragging. Right-click a track for Play, Play next and Add to queue, on one
  track or on a whole selection
- Audio output settings, under Settings → Audio: choose the interface you
  listen through, and turn on exclusive output to bypass the system mixer and
  hand the file to the hardware in its own format (Windows and macOS). If the
  device is busy or unplugged, playback continues through what is available and
  says what it did — and your choice is kept for when the interface is back
- Playback from the keyboard: Space for play/pause, Ctrl+arrows for tracks and
  volume, Alt+arrows and Delete in the queue. Your keyboard's media keys drive
  CuePoint while its window is in front, and are released when it is not, so
  they still work for whatever you switch to
- Tracks that will not play — a moved file, an unplugged drive — are skipped
  and marked in the queue rather than stopping the session, and are reported
  once for the whole run rather than once each. Nothing about it is permanent:
  the same track plays normally the next time you ask for it
- CuePoint now checks that your tracks' files are still there, after every
  import and every refresh, in the background with its own progress and Stop.
  The Library's filter bar can find missing, unreadable and not-yet-checked
  files, and when a whole drive is unplugged the Activity panel says so in one
  line — "4,812 tracks on E:\ — the drive is not connected" — instead of
  listing thousands of missing files. Nothing is moved or deleted: a moved file
  is fixed in Rekordbox with Relocate, then a refresh
- CuePoint now looks for possible duplicates after every import, refresh and
  match: one file in your collection twice, two tracks matched to the same
  Beatport track, or the same artist, title and mix with lengths within two
  seconds. The Library's filter bar can find tracks in a duplicate group, and by
  what grouped them. Nothing is deleted, merged or changed
- CuePoint now reads the artwork your files carry, after every file check, and
  knows Beatport's artwork for the tracks whose match you accepted. The
  Library's filter bar can find tracks by where their artwork comes from — the
  file, Beatport, none, or not read yet. Pictures are made into small thumbnails
  in a capped cache that "Clear cache" empties; an image that is not a JPEG,
  PNG, WebP, GIF or BMP, or is too large, is refused rather than opened.
  Offline, Beatport's artwork is simply not shown. Nothing is written to your
  files

### Changed
- **Clean is how matching is done.** The inKey and Results pages are gone from
  Tools; import your collection in the Library and match a playlist, a
  Collection or the whole library from Clean. A remembered page or a link to
  inKey or Results opens Clean. Home's main button opens Clean. Settings no
  longer has an Export panel: **Export review list…** on the Clean page does
  that. Past searches are no longer listed; their CSV files stay where they
  were saved. The command-line tool is unchanged
- Scrolling deep into a Library sorted by anything but artist is about five
  times faster (a window at the end of 50,000 tracks sorted by BPM: 0.75 s →
  0.13 s), and sorting by match score is as fast as any other column
  (155 ms → 35 ms). A library database is upgraded once, on first launch
- A change to many tracks no longer says there is no undo: it says the batch
  can be reverted from Activity, except for Collection membership, which still
  cannot be
- A filter chip names a fixed value the way the choice does — "File status is
  Missing" rather than "missing" — and a filter naming a value that field never
  holds is refused rather than matching nothing
- A refresh that would delete tracks carrying your own work now says so before
  it does it, and asks you to confirm. It names each kind with its number:
  tracks filed in Collections, rated or noted, tagged, and reviewed or edited
  in CuePoint. A refresh whose deletions carry none of it still goes ahead
  without asking
- Any long job can be stopped from the status strip, not just a match. Import,
  refresh and a change over many tracks all show a Stop beside their progress,
  and stopping one keeps whatever it had already done
- The window is now laid out as an application frame rather than a centered page.
  Screens sit at the top of a content area that scrolls on its own, and the menu
  bar occupies its own row instead of floating over the content. Previously long
  screens scrolled the whole window, which would have carried the navigation and
  status chrome off-screen as those are added

### Removed
- **Breaking engine API change** (DEC-071, ADR-005). These routes and the
  bridge methods behind them are removed, with inKey and Results:
  `POST /api/v1/jobs/match` (`startMatchJob`), `GET /api/v1/history/recent`
  and `GET /api/v1/history/load` (`getHistoryRecent`, `loadHistoryCsv`),
  `POST /api/v1/tags/sync` (`syncTags`), `POST /api/v1/export`
  (`exportResults`) and `GET /api/v1/xml/playlists` (`getXmlPlaylists`), with
  the CSV and M3U open dialogs only inKey used. `GET /api/v1/jobs/{id}/results`
  no longer carries `results` or `batch_results`, which only the file-based
  match filled; `result` is unchanged. Use `/api/v1/clean/match`,
  `/api/v1/clean/export` and `/api/v1/clean/tags/*` instead. Every removed
  route answers 404 like any unknown path, after the token check
- The Help menu's "Playlist (M3U) export instructions": the desktop app no
  longer matches playlist files

### Fixed
- Importing a large library in the app crawled: a 50,000-track collection that
  takes three seconds reported one track every five seconds and never finished.
  Two parts of the engine had ended up with a connection each to the same
  library file, so recording an import's progress waited on a lock the import
  itself was holding. The same import now takes 3 seconds, and 250,000 tracks
  13 seconds
- The engine no longer leaves a database connection open for every request it
  has ever served; a long session used to accumulate thousands
- A packaged build never reached its engine: the window looked for its preload
  outside the installed app, so nothing in it could talk to CuePoint's engine
- Quitting the packaged app on Windows left its engine running in the
  background, holding the library database and a port, one more on every
  launch. Quitting now stops the engine and everything it started
- On the Clean page, a choice made with Left or Right could be put back to the
  proposed candidate by a background refresh just before **A** was pressed, so
  the wrong candidate was accepted
- The engine's job store locked up for good when a job was stopped and its
  work ended without saying so itself: every job request then waited forever
- Restoring a library backup failed on Windows whenever another part of the
  engine had used the database, because its connection was never closed
- A refusal from the engine was shown with "Error invoking remote method …" in
  front of it, in every dialog and panel; it now reads as the engine wrote it
- On the Clean page, a selected track's comparison made the whole window
  scroll, carrying the navigation and status strip off-screen
- The Library table stopped at 1,200 pixels wide on a large display instead of
  using the whole window
- Writing tags to files — inKey's Sync Tags and the command line — never
  changed the year of a file that already had one, which is nearly every
  purchased track, and still reported success. The year written is now the
  year the file holds
- Opening CuePoint for the first time after installing or updating could fail
  to prepare the library if several parts of the app reached for it at once.
  Each asked which schema updates were missing, and the second then repeated an
  update the first had just applied. Each update now applies exactly once,
  however many ask for it
- A change could fail with "database is locked" when another one finished at
  the same moment — an edit landing as an import completed, for instance. Each
  change read the library before writing to it, and if anything else saved in
  between, the database refused it at once rather than letting it wait its
  turn. Changes now claim their turn before they read, so they wait briefly
  instead of failing
- Opening a Collection with thousands of tracks in it took over a second to
  show the first page and now takes a few milliseconds. The order was being
  worked out by re-reading the whole Collection once for every track in it
- On macOS your keyboard's media keys did nothing, and CuePoint never said why.
  macOS only hands the play, next and previous keys to an app the user has
  allowed under Privacy & Security → Accessibility, and until then it refuses
  them in a way that is indistinguishable from another app already owning them
  — so CuePoint treated a permission it had never asked for as somebody else's
  key and stayed quiet. It now asks once, picks the permission up as soon as it
  is granted without needing a restart, and says plainly when the keys are not
  available instead of leaving you pressing a dead one
- macOS builds could not be signed, and so could not be notarized or
  distributed. The bundled mpv player arrives from upstream with empty
  `.gitkeep` placeholders and their AppleDouble companions inside its
  `Contents/MacOS` directory; macOS treats everything there as code, so
  `codesign` refused the whole player bundle with "code object is not signed at
  all" and the outer app could never be signed around it. The files are now
  stripped when the player is installed, and the macOS build declares the
  hardened runtime, entitlements and signing hooks that notarization requires
- Packaging on macOS failed on a clean build. The freshly built engine sidecar
  was given ten seconds to answer its health check, but a one-file build has to
  unpack ~72 MB and import the engine before it can listen, which measured over
  that on the first run after packaging and about eight seconds on later ones.
  The build broke on exactly the run that mattered and passed on every re-run;
  the check now waits long enough to be about liveness rather than latency
- Building the engine sidecar a second time on Windows failed with "Access is
  denied". The build's health check stopped only the small launcher a one-file
  build starts with, not the engine the launcher had started, so every build
  left an engine running in the background holding the file the next build had
  to replace. The check now stops the engine with its launcher
- Installed builds of CuePoint shipped without the engine that does the work.
  The packaging step looked for it under a directory name the build never
  produced, and packaging treats a missing file as a warning rather than an
  error, so Windows and macOS installers were built and published with the
  engine silently left out. Both bundled components are now named consistently
  and a test holds the two halves together
- A fresh installation could create an empty library database. The packaged
  engine did not include its schema migrations — they are loaded dynamically,
  so the bundler never saw them — and applied none, leaving the first thing you
  did to fail with an unrelated error. The packaged engine now carries them,
  and refuses to start if it ever finds none rather than quietly building
  nothing

### Added
- Groundwork for audio playback: CuePoint now bundles the mpv player engine as a
  second background process, verified on every build to carry the formats it
  promises (FLAC, ALAC, AIFF, WavPack, Monkey's Audio, MP3 and AAC). Nothing
  plays yet - the transport, queue and player bar arrive with the rest of Phase 5
- The Library page is now a browser. Playlists down the left scope what you are
  looking at, a filter bar narrows it — search text, or rules like BPM between
  124 and 130 — and the table sorts by any column. Selecting a track fills the
  Track Inspector with everything CuePoint imported for it, including every
  playlist it belongs to. Columns can be shown, hidden, reordered and resized,
  and CuePoint remembers them
- Browsing stays fast on a 50,000-track collection: CuePoint asks the engine for
  the rows on screen rather than loading the library, so scrolling end to end
  holds a fixed amount of memory
- Ctrl+A selects every track matching what you are looking at — filters
  included, not just the rows on screen — and Esc lets go of it
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
