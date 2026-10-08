# Changelog

All notable changes to CuePoint will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Track details, in a calmer order.** The panel beside every page is now named
  **Track details**; hidden, it is a tab down the right edge that shows the
  selected title, and one click brings it back. Under the title, **Play**, **Play
  next**, **Add to queue**, **Similar tracks** and **Show in folder** act on the
  track (on every selected track, except Similar tracks, which uses the first).
  The key reads with where it came from ("8A · A minor · Beatport", "… · yours",
  or "No Beatport key" with **Match on Beatport**). Sections fold and are
  remembered: Yours, Details from Rekordbox, Cue points, Where it is, Beatport
  and History. **Edit values…** opens the same editor Fix values uses; with
  several tracks selected, **Edit values for 4 tracks…** opens Fix values with
  them. The value boxes and the Beatport section's **Apply** buttons are gone,
  and an unmatched track's Beatport section is one sentence and **Match on
  Beatport**. Ratings, file saves, waveform states and cues are in plainer words.
- **Clean can fix many tracks at once, and matches from one window.** A new
  **Fix values** tab has **Edit values…**, **Use Beatport's values…** and **Save
  changes into the files…** for the tracks you came with, the whole library, or
  any mix of playlists, Collections and Sets; a change over 1,000 tracks asks
  first, with the number. **Match tracks…**, in the header, opens one window for
  the tracks not looked up yet, all tracks, chosen places or the tracks you came
  with, and says how many it will search for. Each Health count opens what fixes
  it, and **No Beatport key** opens the Library on Key is empty with **Match
  tracks…** for those tracks.
- **A Camelot wheel beside search.** The button opens a pixel-art wheel of the 24
  keys, lit for the track you selected (else the one playing) and the keys that mix
  with it; a line says which track and key. Click a key to see every track in that
  key in the Library. A track with no Beatport key says so, with **Match on
  Beatport**. The key in the player bar's track line opens the same wheel for the
  playing track.
- **A Medium (1.5×) size, and it is the default.** **Settings → Appearance → Size
  of text and controls** now offers Small (1×), Medium (1.5×), Large (2×) and
  Extra large (3×). If you never chose a size, CuePoint opens at 1.5× and shows
  more of your tracks at once; a size you chose is kept
- **About shows the app's version and its build.** The build is the short commit
  the app was made from, or "not recorded" for a build made by hand
- **An error screen instead of a blank window.** When part of the app fails
  while drawing, it says "Something went wrong" with **Reload**; a failing page
  leaves the sidebar and the player bar working
- **Prepare says what things mean, and starts a second Set.** **New Set ▾** in
  Prepare's header makes a Set, or one from something you have, with a Set open.
  The header says "No times planned yet" until you type one; the columns are
  **Mix in**, **Mix out**, **Starts at** and **Plays for**; warnings are
  accepted with **Accept** (**Undo accept** takes it back); **Files not checked — check now**
  starts the file check; Suggestions show **Fit** out of 100 under **Fits after**
  and **Fits before**; the insertion line sits above the tabs, and the Insert
  button reads **Pick tracks** until you pick; **Notes** and **View ▾** are
  buttons; a chapter is explained where you make one; and a waveform that is not
  made yet says how far the analysis is, with **See progress**
- **Help → Report a problem.** Send a note, as you wrote it, with the app's
  version and the last error report's id. It is off when error reports are off
- **Waveform analysis.** After every file check, CuePoint works out a waveform
  for each file the check found, in the background, at low priority, through the
  player's own decoder: your Sets' tracks first, then your Collections', then the
  newest. The status strip counts it through the library ("Analysing waveforms ·
  1,234 of 50,000", with the rate and time left on hover), and its button is
  **Pause**. Clean → Health shows how far it has got, with **Pause**, **Resume**
  and **Analyse waveforms**. A pause is kept across restarts; an unpaused
  analysis carries on after a restart where it stopped. It steps aside for an
  import, a refresh, a file check or a tag write, which never wait for it. A file
  that could not be read is not retried until it changes, and a file on a
  disconnected drive is never counted as failed
- **Settings → Waveforms.** The analysis's progress with **Pause** or
  **Resume**; the colour choice, **Three bands** (lows, mids and highs in colours
  of their own, as Rekordbox draws them) or **One colour**, remembered on this
  computer and shown on a preview of the track in the player, with its cues,
  beat grid and playhead; and **Delete waveform data…**, which first says how
  much disk the waveforms take and that the whole library will be analysed
  again. Every theme, and every custom theme, has waveform colours kept readable
  against its panels
- **Waveforms in the player bar, the Inspector and the Library.** The playing
  track's waveform fills the bar's seek control, the part already played dimmed,
  the playhead moving across it; click or drag on it to seek, exactly as on the
  slider, which is still there for the keyboard and screen readers and still
  shows until the waveform is ready (its tooltip says why). The bar is no
  taller. The Inspector draws the selected track's waveform under its header,
  with its cue points, loops and beat grid; when that track is the one playing
  it shows the playhead and a click seeks, otherwise it is a picture and a click
  does nothing. A track you play or select that is still waiting is analysed
  next. The Library offers a **Waveform** column (Columns…), hidden until you
  choose it: each row draws its track's waveform, or one muted word ("Waiting",
  "Missing") when it has none, and rows that scroll quickly past are not read
- **Prepare's transition strip.** **View ▾ → Show transition strip** shows the
  selected entry's waveform beside the next one's, with their cue points, the
  part before each planned in and after each planned out dimmed, each entry's
  times over it ("In 0:16 · Out 5:42") and the transition between them in words
  ("Out 5:42 → In 0:16", "untimed" where nothing is planned, **End of Set** after
  the last). Clicking a half selects that entry. It starts hidden and is
  remembered, like the tempo and key lanes. With either open, the Set now keeps
  two whole rows however crowded the window: a window too short for that
  scrolls the page instead
- **Loudness, measured with each waveform.** The pass that draws a track's
  waveform also measures its integrated loudness and its peak (EBU R128, the
  sample peak). The Inspector says it under the waveform ("Loudness −8.4 LUFS ·
  Peak −0.3 dBFS"), the Library offers a **Loudness** column (Columns…, hidden
  until you choose it, copied as "−8.4 LUFS"), and Prepare's transition strip
  ends each title with its track's loudness and says how much louder the next
  one is ("+2.1 LU"). A silent track, or one too short to measure, says so. It
  is shown only: nothing turns a track up or down, and nothing is written to
  your files or to Rekordbox. A library analysed before this keeps every
  waveform, and each track is measured once more in the background, after any
  track without a waveform; a track you select or play is measured first.
  "Delete waveform data" deletes the loudness with the waveforms
- **A Waveforms page in the user guide**: where waveforms appear, what the
  colours and marks mean, how long a first analysis takes, how to pause it, and
  where the data lives
- **Cue points and beat grids from Rekordbox.** An import and a refresh read
  each track's hot cues, memory cues, loops, fades, load points and beat grid
  from the export, and the Inspector lists them under **From Rekordbox**, one
  line each ("A · 1:04.0 · Drop"), with the grid's tempo, or "variable" with its
  range. They are read-only: nothing in CuePoint edits them, and an export to
  Rekordbox still leaves every cue in the file exactly as it was. A refresh's
  preview counts the tracks whose cues or grid changed, in one line. A mark
  CuePoint does not recognise is skipped, never guessed at, and the import says
  how many. A library imported before this release has its cues read once from
  the file it was imported from, at the first start, when that file is
  unchanged ("Reading cue points"); otherwise they arrive with the next refresh,
  and the Inspector says so
- The **Prepare** page, in the sidebar, and **Sets**. A Set is a running order
  you are preparing to play: tracks in the order you will play them, repeats
  allowed, divided into **chapters** with an optional name, notes, target length
  and BPM range. Each entry can carry planned **in and out times** and a note;
  the running time counts the entries you timed and says how many you did not,
  and each entry shows when it **starts**. CuePoint checks every transition
  (tempo jumps, key clashes, a BPM or key it cannot compare), every entry (a
  missing file, a time past the track's end) and every chapter (over or under
  its target, outside its range), explains each finding, and never blocks
  anything; a transition warning you **Acknowledge** stays accepted until either
  track or its values change. **Suggestions** fits a track to any gap, scored
  against the tracks on both sides with each side's reasons, keeping to the
  chapter's BPM range and saying plainly when nothing fits both; a **Library**
  tab searches your library, and either inserts at the gap or by drag. Optional
  **tempo and key lanes** draw the Set's shape. **Play Set**, or a double-click
  on an entry, plays the entries in order, repeats included, through the
  unchanged player — whole tracks, not the planned times. A Set saves as a
  text, CSV or M3U8 **set list**, copies as text, and exports to Rekordbox as
  one playlist in its running order. Chapters, planned times and notes stay in
  CuePoint. See the new user guide page, Prepare
- Sets in the Library's Collections tree, filed in folders beside Collections:
  **New Set**; **New Set from…** a Collection, a Smart Collection or a Rekordbox
  playlist; **New Set from the selection…** and **Add to Set…** on a selection;
  **Open in Prepare**, **Duplicate**, **Save set list…**, **Copy set list** and
  **Export to Rekordbox…** on a Set. Selecting a Set scopes the table to its
  tracks, each listed once. The Inspector lists the Sets a track is in, rules
  can name a Set, Clean can be scoped to one, and the refresh warning counts the
  Sets a refresh would take tracks from
- The **Discover** page, in the sidebar. **Runs** finds new music on Beatport
  from your library: charts your artists made in the genres you choose, and
  recent releases on your labels — every artist and label, or the ones you pick.
  A run works in the background, shown in the status strip, and is kept with
  what it looked for, how it ended and what it found. Tracks you already own
  (through an accepted match) are hidden and counted. Found tracks can go on a
  **Wantlist**, with a note and a bought mark, be pushed to a new playlist on
  your Beatport account, or be opened on Beatport. Without a Beatport token, or
  when Beatport refuses it, the page says so with a link to the token in
  Settings, and past runs and the wantlist still open. **Resolve Beatport
  identities** reads your matched tracks' artists and labels from Beatport when
  you ask. See the new user guide page, Discover
- **Artist and label pages**, under Discover. An artist's page holds your own
  tracks by that artist — the Library's table, playable and queueable as there
  — and their recent releases on Beatport, marked owned or on your wantlist; a
  label's page does the same for a label. Each says whether it knows the artist
  by their Beatport id or groups your tracks by the name. **Open in Library**
  and **Save as Smart Collection…** take the page's tracks to the Library.
  Reach one from the Inspector, where each artist in a track's credit and its
  label are now links, from **Artist page** and **Label page** on a track's
  right-click menu and **Actions…**, and from **Open page** on a filter chip
  that names one artist or label
- **Similar tracks**, on a track's right-click menu and **Actions…**: the tracks
  in your library closest to it in tempo, key, genre, label and artists, best
  first, each with its reasons in words ("One step on the wheel: 8A → 9A").
  Offline, and playable and queueable like any library track
- Two Library filters that find an artist or a label by its Beatport id:
  **Beatport artist** and **Beatport label**. A track counts when its accepted
  Beatport match credits that artist or label, and so does an unmatched track
  whose artist or label name the matched ones tie to that id alone, so two
  artists who share a name are never mixed. They find tracks once CuePoint has
  read your matched tracks' credits from Beatport, which needs a Beatport token
- Two Library filters that find an artist or a label rather than a piece of
  text. **Credited artist** finds every track an artist is credited on — in a
  list of artists, featured, or as the remixer — so "B" no longer also finds
  "Bob B". **Label, any spelling** treats "Nightfall Audio", "NIGHTFALL AUDIO"
  and "Nightfall-Audio" as one label, and reads your own label where you have
  set one. Both ignore capitals, accents and punctuation, offer the names in
  your library to choose from, and work in Smart Collections. The first start
  after updating indexes your artists and labels in the background, shown as
  **Indexing artists and labels** in the status bar; at 50,000 tracks it takes
  about a second
- Export to Rekordbox. **Export to Rekordbox…** in the Library's **Collection
  file** menu, or on a Collection, Smart Collection or folder's right-click menu, writes a new
  Rekordbox XML file carrying your key, BPM, genre, label, year and rating, and
  the Collections you tick as playlists in a `CuePoint` folder. It is made by
  patching a copy of the file you imported, so cue points, beat grids and
  everything else Rekordbox wrote are kept exactly as they were. A preview
  states what will be written first — the tracks and fields that change, each
  playlist, a source file that has changed since the import (with **Refresh
  first**), tracks the file lacks, missing audio files and a folder name that
  is already taken — and the button says what it will do. Tags, notes and
  favorites are not exported; the file you imported and your audio files are
  never written. The export runs as a job you can stop, and is listed in
  Activity. See the new user guide page, Exporting to Rekordbox
- Settings shows where Rekordbox exports go, the key notation the next one
  starts in, and the recent exports
- The Collections tree has a right-click menu (also the menu key and
  Shift+F10) with rename, delete, duplicate, freeze and Export to Rekordbox…
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
- **Error reports are on in released builds, with a switch.** When CuePoint hits an
  unexpected error, a released build sends one scrubbed report to Sentry (EU
  region): the error, where it happened, the steps before it, the version and
  your operating system, never file, folder, track, artist, label or playlist
  names, notes, tags or tokens. Turn it off in **Settings → Privacy → Send error
  reports**, at once and with no restart. The privacy notice, Help → Privacy and
  the user guide say what is sent. Builds run from source and the CLI send
  nothing
- **Export to Rekordbox** takes Sets beside Collections: each ticked Set is
  written as one playlist in its running order, repeats included, at its folder
  path, and recorded as a Set. Its chapters, planned times, notes and accepted
  warnings are not written
- A library database is upgraded once, on the first launch of this version, to
  hold Sets (ADR-008). The launch backup is taken first; every Collection, Smart
  Collection, folder, entry and export record keeps its id, order and contents.
  At 50,000 tracks with 100,000 Collection entries it takes about a third of a
  second
- **Import a different collection…** is in the Library header's new
  **Collection file** menu, beside **Export to Rekordbox…**. Three buttons did
  not fit the header at the default window size and pushed the track table
  almost out of sight
- **Clean is how matching is done.** The inKey and Results pages are gone from
  Tools; import your collection in the Library and match a playlist, a
  Collection or the whole library from Clean. A remembered page or a link to
  inKey or Results opens Clean. Settings no longer has an Export panel: **Export review list…** on the Clean page does
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
- **Code, scripts, dependencies and docs nothing used** (Phase 12, DEC-147).
  Qt and the retired Qt app's code are gone, with the 30 Python modules and 12
  Electron and renderer files nothing reached, the old app's build and release
  workflows, 90 scripts nothing ran, 13 Python and 3 npm dependencies nothing
  used, and 115 docs that were stale or said the same thing twice. Nothing a
  user relies on changed: the app, the CLI and its flags, the engine's routes
  and answers, config keys, the databases and exports are as they were. CI now
  fails when a Python module, script or desktop source file that nothing runs
  appears again (`scripts/audit_dead_code.py --check`)
- **inCrate and the Tools group** (DEC-090, DEC-100, ADR-007). Discover does
  everything inCrate did, on the library you already imported, so there is no
  second import. The app opens on the **Library** when it has no page to
  reopen, rather than on Tools' landing page; a link to `/incrate`, or inCrate
  as the page you were last on, opens Discover, and `/` or a remembered Tools
  opens the Library. inCrate's inventory database and
  `incrate_past_results.json` stay where they were — nothing reads them any
  more, and they can be deleted by hand; see Discover's user guide page, "Where
  inCrate went". The `incrate.` settings keep their names; five of them are read
  by nothing now and may be removed from `config.yaml`
  (`incrate.inventory_db_path`, `incrate.enrich_on_first_import`,
  `incrate.enrichment_delay_seconds`, `incrate.beatport_username`,
  `incrate.beatport_password`). The developer script
  `scripts/create_incrate_playlist.py` is removed
- **Breaking engine API change** (DEC-090, ADR-007). inCrate's routes and the
  bridge methods behind them are removed: `GET /api/v1/incrate/inventory`
  (`getIncrateInventory`), `POST /api/v1/incrate/import` (`importIncrateXml`),
  `POST /api/v1/incrate/reset` (`resetIncrateInventory`),
  `GET /api/v1/incrate/discover/options` (`getIncrateDiscoverOptions`),
  `POST /api/v1/incrate/discover` (`runIncrateDiscover`) and
  `POST /api/v1/incrate/playlist` (`createIncratePlaylist`). Use
  `/api/v1/discover/*` instead. Every removed route answers 404 like any unknown
  path, after the token check
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
- **Table rows are as tall as the size says.** Rows in the Library, Collections,
  Clean, Discover and Prepare tables were 36 pixels at every size, so at Extra
  large the text in them had no room. They are now 33, 50, 66 and 99 pixels at
  1×, 1.5×, 2× and 3×
- **A good file could be recorded as having no audio, or lose its loudness.** On a
  busy machine `mpv` sometimes exits before its log is all on disk, and the
  waveform analysis read the missing lines as "no audio was decoded" or "loudness
  not measured". A decode whose log stops before `mpv`'s last line is now run
  again, up to three times in all
- **A request the engine could not answer dropped the connection.** An error that
  escaped a request handler printed its traceback to a pipe nothing reads and
  closed the connection, so the app saw "connection aborted" and no reason. It now
  answers `500 INTERNAL_ERROR` with the usual error envelope. The engine's
  failures, steps and failed jobs are also prepared for error reporting
  (Phase 13); nothing is sent, because a release carries no reporting address yet
- **The engine's image library carried known vulnerabilities.** Pillow, which
  reads artwork, is raised from 12.1.1 to 12.3.0, past the 35 advisories
  published against it; aiohttp and pytest, used only in development, are raised
  past theirs too
- **A match could look at more Beatport pages than asked for.** When Beatport's
  own search found nothing and the browser search found many, every one of its
  results was fetched and scored, past the number of candidates the settings
  allow. The browser's results are now held to that number, as every other
  search's are
- **A request the engine refused could fail as a dropped connection** on
  Windows instead of saying why: the engine answered before reading what was
  sent, and closing with that unread made Windows reset the connection. The
  engine now reads every request in full before it answers
- **A desktop build made outside CI stopped with an error** after writing the
  installer (electron-builder could not name the repository). It now finishes
- **Waveform decoders could outlive an engine that was killed** on Windows (End
  Task, a crash, or a process-tree kill that listed the processes before a
  decode began), and were found idle hours later. Each decoder now joins a job
  that Windows ends with the engine, however the engine ends
- **CuePoint would not start when the browser storage it keeps display
  preferences in refused to be read** (disabled, or full): the scale and theme
  were read without a fallback, and the window stayed empty. Both now read as
  their defaults, and a scale or theme chosen then applies for the session even
  though it cannot be remembered
- **Creating a playlist on Beatport always failed** (in inCrate, which Discover
  replaced; Discover's push uses the corrected request), saying the token
  might lack playlist access whatever the token was. Beatport redirects the
  address CuePoint posted to, and the redirect turned the request into a read of
  your playlists, so no playlist was ever made. CuePoint now posts to the
  address Beatport expects, and the link it gives you opens the playlist on
  beatport.com rather than a page that did not exist. A request that Beatport
  redirects is now reported as an error instead of quietly doing something else
- A Beatport chart's curator is read where Beatport's current API puts it, so
  charts curated by artists in your collection can be found; inCrate read every
  chart's curator as blank
- **Charts made by artists in your collection were missed** whose Beatport
  account has a different name from the artist — DJEFF's charts, published by
  "OFFICIALDJEFFMUSIC", were never found for a library holding DJEFF. A chart
  an artist made is now credited to that artist. inCrate also read no chart's
  date, so the chart date range you chose never excluded a chart and charts
  were not listed newest first; both now work
- **On macOS, an export could overwrite the Rekordbox file it was read from.**
  Saving an export as `COLLECTION.XML` when the library had been imported from
  `collection.xml` was allowed, and on a Mac's ordinary disk those two names are
  one file — so the export replaced the library, with no warning. The check that
  refuses the source as a destination compared the two spellings instead of
  asking the disk whether they were the same file; it now asks, so a different
  capitalisation, a hard link, or the same file reached by another name are all
  refused on every platform. Windows was never affected
- **On macOS, nothing worked for the first ten seconds and CuePoint said it
  was ready.** The engine needs about ten seconds to start the first time a
  packaged build is run, and CuePoint waited only five before giving up — while
  the status strip reported "Engine connected" as soon as the engine had been
  launched, rather than when it answered. Every action in that window failed.
  CuePoint now waits as long as starting actually takes, and the strip says
  "Starting engine…" until the engine is really there
- CuePoint's window now opens straight away instead of waiting for the engine,
  which took it from about nine seconds to about two on macOS. The window is
  usable while the engine finishes starting, and whatever the first screen asks
  for arrives once the engine can answer — the Library shows your collection
  rather than saying none has been imported
- Double-clicking a track in the Library did not always play it: selecting the
  row made the list jump, so the second click landed somewhere else. Selecting
  a track no longer moves the list
- The engine could keep running after the app had gone — on its port, holding
  the library database — when the app was killed or crashed, or when quitting
  finished before its cleanup did. Quitting now waits for its cleanup, and the
  engine ends itself when the app that started it is no longer there
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

## Retired desktop app (Qt)

The versions below were released by the Qt app that the Electron app replaced (Phase 12). Their
numbers come before the version scheme of DEC-145, so they are not version sections: no release of
the current app reads its notes from them (DEC-178).

### 0.0.3 (2026-06-24)

#### Fixed
- Beatport search: parse current `__NEXT_DATA__` format (`tracks.data[]` with `track_id`/`track_name`) so direct search returns track URLs again
- Prefer direct Beatport search by default; disable browser automation fallback in packaged builds

#### Added
- Step 10 implementation: Final Configuration & Release Readiness
- Comprehensive Step 10 validation script
- CHANGELOG.md for tracking all changes

### 1.0.0 (2024-12-14)

#### Added
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

#### Security
- Code signing for macOS (Developer ID)
- Code signing for Windows
- macOS notarization support
- Security scanning in CI/CD
- License compliance verification

#### Documentation
- Comprehensive documentation in docs/
- Build system documentation
- Release process documentation
- User guides and developer guides

#### Infrastructure
- Complete CI/CD pipeline with GitHub Actions
- Automated testing (unit, integration, UI)
- Release gates and quality checks
- Build system for macOS and Windows
- Update feed generation and publishing

### 0.9.0 (2024-11-01)

#### Added
- Beta release features
- Initial UI implementation
- Core metadata processing

#### Changed
- Improved performance
- Enhanced error handling

---

## Release Notes Format

Each release should include:
- **Version**: Semantic version (MAJOR.MINOR.PATCH)
- **Date**: Release date in YYYY-MM-DD format
- **Categories**: Added, Changed, Deprecated, Removed, Fixed, Security

## Version History

- The Qt app's 0.0.3, 1.0.0 and 0.9.0 are listed under "Retired desktop app (Qt)" above.
