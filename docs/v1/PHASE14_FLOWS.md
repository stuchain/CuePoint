# CuePoint v1.0.0 — Phase 14: How Each Task Works, Today and After

Status: **Written 2026-10-08, marked the same day.** Asked for by the user after the page reviews
(`PHASE14_REVIEWS.md`): every task a DJ does in CuePoint, step by step, today and after Phase 14 as
accepted, so that what is hidden, crowded or impossible shows up before it is built. Twenty
proposals (FLW-1…FLW-20) came out of it. The user accepted all twenty (DEC-199), narrowing FLW-1 to
the actions that matter most, and added two of their own: a Keys page in the sidebar (FLW-21,
DEC-200) and Beatport's key as the only key CuePoint trusts (FLW-22, DEC-201).

The published walkthrough, with screenshots and the marks, is the artifact
https://claude.ai/artifact/3bVk6XFFXf8Qmf4S4NduKo. The screenshots are those in `phase14/`.

How the steps were found: three read-only surveys of the renderer (Library and Inspector; Clean
and Discover; Prepare, the shell, the player and Settings), each listing every action, where it
lives and how it is reached, with `file:line`. Tags below mark a step that is reachable only by
right-click, only on hover, only by dragging, hidden (shown only in some state or behind a menu),
crowded (many functions in one place), or that cannot be done at all.

## The tasks

### F1 — First run to a library

Open CuePoint for the first time and get your Rekordbox collection in.

**Today**

1. The app opens on the Library with a three-screen tour, “Getting started”. It covers importing and Clean only; Prepare, Discover and the player are never mentioned.
2. Click “Import a collection…” and pick the Rekordbox XML file.
3. When it finishes, five kinds of background work start on their own (checking files, finding duplicates, reading artwork, analysing waveforms). The status strip shows one at a time. *(hidden)*
4. There is no player bar until something plays, though Space already plays and pauses. *(hidden)*

**After Phase 14 as accepted**

- A short guide that covers every page, and a first-steps checklist on the empty Library (RUN-1, RUN-3).
- The Library explains the work that follows an import (LIB-1); pages that need a library are dimmed before the first import (NAV-5).
- The status strip speaks in plain words and shows nothing when idle (STR-1 to STR-3).

**Still in the way**

- Nothing big. The native menu still offers Reload and Developer Tools (see FLW-20).

**Proposals**: FLW-20.

**Screenshots**: `phase14/firstrun-1.png`, `phase14/library-empty.png`, `phase14/library-after-import-working-1.png`.

### F2 — Re-check Rekordbox for changes

After changing things in Rekordbox, bring the changes into CuePoint.

**Today**

1. Click “Check for changes”. A window lists what would change; click “Apply changes”.
2. To load a different XML file: open “Collection file ▾”, then “Import a different collection…”. *(hidden)*
3. “Export to Rekordbox…” sits in the same “Collection file ▾” menu, though it does the opposite. *(hidden)*

**After Phase 14 as accepted**

- The button says “Rekordbox” (LIB-3).

**Still in the way**

- Import and export are two unrelated jobs hidden in one menu, and “Collection file” clashes with CuePoint's own Collections.

**Proposals**: FLW-11.

**Screenshots**: `phase14/library-header.png`, `phase14/library-collection-file-menu.png`, `phase14/library-refresh-preview-dialog.png`.

### F3 — Find tracks in a key, and see a playlist's keys

Open a playlist, see which keys it holds, and show only the tracks in one key (your example).

**Today**

1. Click the playlist.
2. Click “Add filter”.
3. In “Field”, find “Key” in a list of about 40 fields (it starts on “Title”). There are three key fields: “Key”, “Rekordbox key” and “CuePoint key”. *(crowded)*
4. Leave “Condition” on “is”.
5. Click into “Value”. A browser autocomplete pops up with the playlist's keys and how many tracks have each. This popup is the only place the app shows which keys a playlist holds. *(hidden)*
6. Type “8A” and click “Add”. The chip reads “Key is 8A”.
7. It matches the text exactly: tracks whose key is stored as “Am” are missed. Typing 8A in “Search these tracks…” finds nothing, because search covers only title, artist, album and label. *(can't be done)*
8. Saving it as a Smart Collection keeps the rule but drops the playlist, so “8A in this playlist” is saved as “8A anywhere in the library”. *(can't be done)*

**After Phase 14 as accepted**

- A Camelot wheel button beside search on every page (DEC-133). It lights the selected track's key and the keys that mix with it. Clicking a key opens the whole Library on that key and clears other filters (DEC-160), so it leaves the playlist.
- The filter fields are grouped under plain names (LIB-7).

**Still in the way**

- Filtering a playlist by key is still six steps, and nothing shows the playlist's keys at a glance.
- The wheel answers “what mixes with this track”, not “what is in this playlist”.
- 8A and Am are still different keys to the filter.

**Proposals**: FLW-4, FLW-5, FLW-6, FLW-7.

**Screenshots**: `phase14/library-add-filter.png`, `phase14/library-filter-field-list-full.png`, `phase14/library-filtered-counts.png`.

### F4 — Filter by BPM or genre, and keep it

Show tracks between 122 and 126 BPM in House, and save that as a list that updates itself.

**Today**

1. “Add filter”, Field “BPM”, Condition “is between”, type “From” and “To”, “Add”.
2. “Add filter” again, Field “Genre”, Condition “is”, type or pick a genre, “Add”. Rules always combine with AND; there is no OR between rules.
3. “Save as Smart Collection…”, type a name, “Save”.
4. Later edits to the rules show three buttons: “Update “Name””, “Save as a new Smart Collection…” and “Keep as a filter”. *(hidden)*

**After Phase 14 as accepted**

- Plain field names (LIB-7).

**Still in the way**

- Ten clicks for a BPM range and a genre, the two filters a DJ uses most.

**Proposals**: FLW-4, FLW-7.

**Screenshots**: `phase14/library-add-filter.png`.

### F5 — Do something with several tracks

Select tracks and add them to a Collection, tag them, rate them, queue them or fix their values.

**Today**

1. Click, then Shift-click or Ctrl-click to select. The bar shows “N tracks selected” with “Actions…”, “Copy”, “Show in folder” and “Clear”.
2. “Actions…” opens a menu of about 20 entries. Right-click opens a menu of about 25, mixing playback, Collections, tags, rating, Beatport matching, editing values and writing files. *(crowded)*
3. “Play next” and “Add to queue” are only in the right-click menu, not in “Actions…”. *(right-click only)*
4. “Similar tracks”, “Artist page” and “Label page” are only in these menus. *(right-click only)*

**After Phase 14 as accepted**

- The menu is grouped into Organize ▸, Explore ▸, Beatport ▸ and Fix ▸, with plain names (LIB-6).

**Still in the way**

- Every one of these actions still lives inside a menu, and the two menus still differ.

**Proposals**: FLW-1, FLW-8.

**Screenshots**: `phase14/library-actions-menu.png`, `phase14/library-track-menu-full.png`, `phase14/library-track-menu-matched-full.png`.

### F6 — Look at one track and change something

Read a track's details, rate it, tag it, or correct its key.

**Today**

1. Click a row. The Inspector on the right shows one long column of eight or more sections: Rekordbox's values, your values, Beatport, cues, where it is, history. *(crowded)*
2. “Yours” alone holds about ten controls: stars, favorite, notes, tags, and five value boxes that save when you click away, with no Save button. *(crowded)*
3. The same five values can also be edited through “Edit metadata…” in the right-click menu.
4. There is no Play button, and “Similar tracks” is not here. *(can't be done)*
5. Hiding the Inspector (Ctrl+I) leaves no other way to see these details. *(hidden)*

**After Phase 14 as accepted**

- Called “Track details”, with a line on how to fill it (INS-1).
- Sections fold, in a calmer order, remembered (INS-3).
- The value boxes hide behind “Correct a value…” (INS-4).
- With several tracks selected, it offers to edit all of them (INS-11).

**Still in the way**

- You still cannot play the track or open similar tracks from its own details.

**Proposals**: FLW-9.

**Screenshots**: `phase14/inspector-track-selected-overview.png`, `phase14/inspector-override-typed.png`, `phase14/inspector-multi-selection.png`.

### F7 — Play and queue

Play a track, line up what comes next, and reorder the queue.

**Today**

1. Double-click a row, or select it and press Enter. The whole view becomes the queue. *(hidden)*
2. “Play next” and “Add to queue” are right-click only. *(right-click only)*
3. The player bar appears after the first play. Its buttons are icons with no words.
4. The queue icon opens the queue. Drag rows, or Alt+↑ and Alt+↓, to reorder; “×” or Delete removes.

**After Phase 14 as accepted**

- Every player button named on hover, the queue count on its button, the repeat state in words (BAR-1 to BAR-3).
- The playing title opens the track (BAR-4); the queue gets a help line, Clear and a drop marker (BAR-8).

**Still in the way**

- Starting playback and queueing still need a double-click or a right-click.

**Proposals**: FLW-8, FLW-9.

**Screenshots**: `phase14/player-bar-playing.png`, `phase14/player-queue-panel-open.png`.

### F8 — Make a Collection or a Set and fill it

Create a crate for a gig and put tracks in it.

**Today**

1. Under “Collections”, click one of three “+” icons. Only their tooltips say which is New Collection, New Set or New folder. *(hover only)*
2. Rename, Delete, Duplicate and Freeze show as small icons only while the pointer is over a row. *(hover only)*
3. Open in Prepare, New Set from…, Save set list…, Copy set list, Export to Rekordbox… and Duplicate (for a Set) are right-click only. *(right-click only)*
4. Add tracks by dragging rows onto the Collection, or “Actions…” then “Add to Collection…”.
5. Reordering tracks inside a Collection is a drag that works only with no search, no filter and the Collection's own order. *(drag only)*

**After Phase 14 as accepted**

- Collections sit under Library in the sidebar (DEC-156); “Collection” means only CuePoint's lists (LIB-4).

**Still in the way**

- Most of what you can do to a Collection is hidden behind hover or right-click.

**Proposals**: FLW-10.

**Screenshots**: `phase14/library-collections-tree.png`.

### F9 — Match tracks to Beatport and decide

Find each track on Beatport, then accept or reject what CuePoint found.

**Today**

1. Clean → Review. One tab holds about 22 functions: choosing what to show, starting matching, re-matching, exporting the list, the comparison, Accept, Reject, Next, Clear decision, and applying fields. *(crowded)*
2. Click “Match all N” or select rows and “Match selection”.
3. Pick a row; below it, pick a candidate, then “Accept #k”, “Reject” or “Next”. Bare keys A, R, N and the arrows do the same.
4. If accepted, tick fields and “Apply N fields”.
5. The same Match, Accept, Reject and Apply also sit in the Library's right-click menu.

**After Phase 14 as accepted**

- Plain names for match states (CLN-4); the scoring behind “Why this score?” (CLN-5); what Accept and Apply do (CLN-6).
- One re-match control instead of two (CLN-10); the keyboard hint hidden until asked for (CLN-12).

**Still in the way**

- Starting a match and deciding on matches still share one crowded tab.

**Proposals**: FLW-3, FLW-12, FLW-13.

**Screenshots**: `phase14/clean-comparison-panel.png`, `phase14/clean-tabs-header.png`, `phase14/clean-accepted-apply-fieldset.png`.

### F10 — Fix what is wrong with the library

See what needs attention, then deal with missing files, duplicates and wrong values.

**Today**

1. Clean → Health shows counts. Clicking one, such as “Missing or unreadable files”, opens the Library filtered, not Clean's own Missing files tab. *(hidden)*
2. “Check every file” is in three places; “Find duplicates” in two.
3. Missing files can only be fixed in Rekordbox (Relocate, export again, then refresh). *(can't be done)*
4. Changing values for many tracks (“Edit metadata…”, “Apply Beatport values…”, “Write tags to files…”) is only in the Library's right-click menu. Clean, the page for fixing, has none of it. *(right-click only)*

**After Phase 14 as accepted**

- Missing files says the fix in steps with a link to Refresh (CLN-8); plain names for the checks (CLN-9).

**Still in the way**

- Health sends you away from Clean, and bulk fixing lives on another page behind a menu.

**Proposals**: FLW-2, FLW-12, FLW-14.

**Screenshots**: `phase14/clean-health-overview.png`, `phase14/clean-missing-files.png`.

### F11 — Find new music on Beatport

Look for new releases from your artists and labels, and keep the ones you want.

**Today**

1. Discover → Runs → “New run”. Fill in genres, chart dates, days, artists and labels, then “Start run”.
2. The same tab holds the setup form, the list of past runs and the results. *(crowded)*
3. Actions on results appear only after you select rows: “Add to wantlist”, “Push to Beatport playlist…”, “Open on Beatport”. With nothing selected, Push means “everything shown”. *(hidden)*
4. Runs hide tracks you own; artist pages show them; the Wantlist shows both. There is no keyword search.

**After Phase 14 as accepted**

- An intro line (DSC-1); “Run” renamed (DSC-2); the token explained (DSC-3); resolving made automatic (DSC-4); “owned” explained once (DSC-6); “Push” renamed (DSC-7).

**Still in the way**

- One tab still sets up searches, keeps their history and shows results.

**Proposals**: FLW-3, FLW-15.

**Screenshots**: `phase14/discover-new-run-panel.png`, `phase14/discover-run-detail.png`, `phase14/discover-run-context-menu.png`.

### F12 — Artist, label and similar tracks

From a track you like, see the artist's and label's other tracks, and tracks like it.

**Today**

1. Click the artist or label name in the Inspector, or right-click a row → “Artist page” / “Label page”.
2. “Similar tracks” is reachable only from a right-click or “Actions…” menu. No button anywhere opens it. *(right-click only)*
3. Beatport result rows in Discover have no artist or label links, and the Discover page links to none of these pages. *(can't be done)*

**After Phase 14 as accepted**

- Artist and label identity in plain words (DSC-9); Similar tracks readable (DSC-10); Discover points to its sub-pages (DSC-11).

**Still in the way**

- Similar tracks still needs a menu.

**Proposals**: FLW-9, FLW-16.

**Screenshots**: `phase14/discover-artist-beatport.png`, `phase14/discover-similar-tracks.png`.

### F13 — Build a Set for a gig

Make a Set, add tracks, order them, split it into chapters and time it.

**Today**

1. Prepare offers “New Set” only when you have no Sets. After that, new Sets are made from a “+” icon in the Library's Collections. *(hidden)*
2. Add tracks: “Insert here” in the panel beside the Set, drag, right-click “Insert here”, or Library “Add to Set…”.
3. Reorder entries by dragging only; no button or key does it. *(drag only)*
4. Make a chapter: right-click an entry → “Start a chapter here”. Edit it: double-click the heading or right-click it. *(right-click only)*
5. Remove an entry or insert a repeat: right-click only. *(right-click only)*
6. In and Out times are only in the Inspector, under “In this Set”. Hide the Inspector and there is no way to time the Set. *(hidden)*

**After Phase 14 as accepted**

- “New Set” in Prepare's header (PRP-1); real buttons for Notes and View (PRP-10); chapters explained (PRP-11); the insertion line above the tabs with a visible reason (PRP-9).

**Still in the way**

- Ordering, chapters, removing and timing are still drag, right-click or Inspector only.

**Proposals**: FLW-17, FLW-18.

**Screenshots**: `phase14/prepare-entry-menu.png`, `phase14/prepare-chapter-menu.png`, `phase14/prepare-inspector-lead-zone-scrolled.png`.

### F14 — Check how two tracks mix

See whether one track goes into the next: key, tempo, and where you mix out and in.

**Today**

1. “View ▾” → “Show tempo and key lanes” and “Show transition strip”. Both start hidden. *(hidden)*
2. Select a track. The strip shows its waveform and the next one's, with “Out 5:30 → In 0:45 · +2.1 LU”. It shows no key or BPM.
3. Key relations in the lanes and the warning sentences in the table (⚠) show only on hover. *(hover only)*
4. Accepting a warning (“Acknowledge”) is only in the Inspector. *(hidden)*

**After Phase 14 as accepted**

- Plain key and loudness words (PRP-8); one word, “Accept”, for warnings (PRP-5); the Camelot wheel (PAGES-10).

**Still in the way**

- The strip still leaves out the two things a DJ checks first.

**Proposals**: FLW-19.

**Screenshots**: `phase14/prepare-lanes-and-strip.png`, `phase14/prepare-view-menu.png`.

### F15 — Export to Rekordbox, or a set list

Take Collections and Sets back into Rekordbox, or save a Set's track list.

**Today**

1. Rekordbox: “Collection file ▾” → “Export to Rekordbox…”, Prepare “Export ▾”, or right-click a Collection. *(hidden)*
2. Set list: Prepare “Export ▾” → “Save set list…” or “Copy set list”; the same two items on a Set's right-click menu.
3. Set lists cannot be imported or printed. *(can't be done)*

**After Phase 14 as accepted**

- The export facts in plain words (SET-9).

**Still in the way**

- Export starts from three places, two of them hidden.

**Proposals**: FLW-10, FLW-11.

**Screenshots**: `phase14/library-collection-file-menu.png`.

### F16 — See background work and what failed

Know what CuePoint is doing, and what went wrong.

**Today**

1. The status strip shows one job and “+N more”, which you cannot click.
2. Finished and failed jobs disappear from the strip. *(can't be done)*
3. “Activity” (Ctrl+Shift+A) lists the last 50 events with raw names and raw details.

**After Phase 14 as accepted**

- Plain job labels with a reason on hover (STR-3); “+N more” opens the list (STR-5); Activity in words, grouped by day, with plain errors (STR-6 to STR-8).

**Still in the way**

- Nothing big left.

**Screenshots**: `phase14/shell-status-job-running.png`, `phase14/shell-activity-panel-events.png`.

### F17 — Change settings

Set the theme, size, audio, waveforms, Beatport token and privacy.

**Today**

1. Sidebar → Settings. One long page of panels; the Beatport token sits in a panel titled “Settings”.
2. Clearing the cache and logs on exit is only in Help → “Privacy…”, not on the Settings page. *(hidden)*
3. The Shortcuts list shows eight shortcuts that do nothing, and Ctrl+R reloads the window. *(can't be done)*

**After Phase 14 as accepted**

- Sections with a contents rail (SET-1); one Privacy section (SET-7); a “Saved” tick (SET-10); reset per section (SET-11); the 1.5× size (PAGES-14).

**Still in the way**

- The dead shortcuts and the Electron menu remain outside the Library.

**Proposals**: FLW-20.

**Screenshots**: `phase14/settings-whole-overview.png`, `phase14/shell-help-menu.png`.

### F3, again — the keys of one or several playlists

The user's own addition (2026-10-08): seeing which keys one playlist, or several together, holds is
its own function, with its own place in the sidebar, not only a filter inside the Library. That is
FLW-21. And the keys it counts are Beatport's: a key Rekordbox wrote may be wrong (FLW-22).

## The proposals and the marks

Every proposal was marked **Yes** on 2026-10-08 (DEC-199). FLW-1 carries the user's note: "Yes but
not ALL, like some will be too much, only the most important ones we need to be distinct."

#### FLW-1 — Every action has a visible place; right-click and keys are only shortcuts (a rule for the whole app)

**Mark**: **Yes** (2026-10-08), narrowed: only the most important actions (see below)

**What**: A rule for the whole app: anything you can do from a right-click menu, a hover icon or a key must also be a labelled button or a visible menu on the page. Right-click and keys stay, as faster ways to the same thing. PAGES-13 checks every page against it.

**Why**: Your request. Today about 30 actions are right-click, hover or drag only (marked in the walkthroughs).

**Size**: M (a rule; the work is in FLW-8, 10, 17). **Built in**: PAGES-13, and each page step. **Tasks**: F5.

#### FLW-2 — Each function has one home; other places link to it (a rule for the whole app)

**Mark**: **Yes** (2026-10-08)

**What**: When the same thing can be done in several places, one page owns it and the others link there. Fixing values belongs to Clean, organizing to the Library, Sets to Prepare. For example, “Check every file” lives in Clean; the Library's entry opens Clean.

**Why**: “Check every file” is in four places, matching in three, Export to Rekordbox in three, and editing values in two, each slightly different.

**Size**: M. **Built in**: PAGES-13 checks it; each page step builds its own homes. **Tasks**: F10.

#### FLW-3 — One job per tab or panel (a rule for the whole app)

**Mark**: **Yes** (2026-10-08)

**What**: A tab or panel does one kind of thing. Where one does several (Clean's Review, Discover's Runs, the track menu), it is split. Review and Runs are the two splits proposed below.

**Why**: Your request: no tab with ten functions.

**Size**: M. **Built in**: PAGES-07, PAGES-08. **Tasks**: F9, F11.

#### FLW-4 — Quick filters for Key, BPM and Genre above the table

**Mark**: **Yes** (2026-10-08)

**What**: Three buttons sit above every track table: Key, BPM, Genre. Key opens a list of the keys in what you are looking at (a playlist, a Collection, everything), in Camelot order with counts: “8A · 12, 9A · 7…”. Click one to filter, click more to add them. BPM opens a range with the view's lowest and highest values. Genre lists the view's genres with counts. Each shows as a chip like any rule. “Add filter” stays for everything else. The wheel keeps its own job: what mixes with the selected track, across the whole library.

**Why**: Your example: seeing and filtering a playlist's keys takes six steps today and the list of keys is a hidden autocomplete. This makes it one click, and a BPM range two.

**Size**: M (needs a key facet with Camelot order from the engine). **Built in**: PAGES-05. **Tasks**: F3, F4.

#### FLW-5 — Search understands keys and BPM

**Mark**: **Yes** (2026-10-08)

**What**: Typing “8A”, “Am” or “124” in the Library's search also matches the key or BPM, and the results say why they matched.

**Why**: Today typing 8A finds nothing, which reads as “no tracks in 8A”.

**Size**: S–M (engine search). **Built in**: PAGES-05. **Tasks**: F3.

#### FLW-6 — One Key field, in any notation

**Mark**: **Yes** (2026-10-08)

**What**: The filter has one “Key” field. “8A” and “Am” are the same key, whatever notation the file uses. “Rekordbox key” and “CuePoint key” move under the Rekordbox-only and your-values groups.

**Why**: Three key fields today, and a filter for 8A misses tracks stored as Am.

**Size**: M (engine key matching). **Built in**: PAGES-05. **Tasks**: F3.

#### FLW-7 — Smart Collections remember the playlist

**Mark**: **Yes** (2026-10-08)

**What**: A new rule, “In playlist”, lets a Smart Collection keep where it came from. Saving while a playlist is open adds it, so “8A in Warm-up” stays that.

**Why**: Today the playlist is dropped silently on save.

**Size**: M (engine rule field). **Built in**: PAGES-05. **Tasks**: F3, F4.

#### FLW-8 — A visible action bar for selected tracks

**Mark**: **Yes** (2026-10-08)

**What**: Selecting tracks shows a bar of grouped buttons above the table, the same groups LIB-6 gives the menu: Play ▸ (Play, Play next, Add to queue), Organize ▸, Explore ▸, Fix ▸ (which opens Clean, FLW-12). Right-click shows exactly the same groups. “Actions…” goes. This amends LIB-6, which only regrouped the menu. *(Settled by the 2026-10-08 review: the groups are Play, Organize, Explore, Beatport, Fix and More, listed in PAGES-05.)*

**Why**: Every multi-track action is in a menu today, and the two menus differ.

**Size**: M. **Built in**: PAGES-05. **Tasks**: F5, F7.

#### FLW-9 — Track buttons at the top of Track details

**Mark**: **Yes** (2026-10-08)

**What**: A row of buttons under the track's title: Play, Play next, Similar tracks, Show in folder. The artist and label stay links.

**Why**: You can't play a track or open similar tracks from its own details today.

**Size**: S. **Built in**: PAGES-06. **Tasks**: F6, F7, F12.

#### FLW-10 — Labelled buttons for Collections, and a bar for the selected one

**Mark**: **Yes** (2026-10-08)

**What**: The three “+” icons become labelled buttons: “New Collection”, “New Set”, “New folder”. Selecting a Collection or Set shows a small bar under the tree: Rename, Duplicate, Delete, and for a Set, Open in Prepare, Save set list, Export to Rekordbox. Hover icons and right-click keep working.

**Why**: Most Collection actions are hover or right-click only.

**Size**: M. **Built in**: PAGES-05. **Tasks**: F8, F15.

#### FLW-11 — Import and Export as their own buttons

**Mark**: **Yes** (2026-10-08)

**What**: The Library header shows “Check Rekordbox for changes”, “Import another file…” and “Export to Rekordbox…” as three buttons. “Collection file ▾” goes.

**Why**: Two opposite jobs hidden in one menu, under a name that clashes with Collections.

**Size**: S. **Built in**: PAGES-05. **Tasks**: F2, F15.

#### FLW-12 — Clean owns matching and fixing, with a “Fix values” tab

**Mark**: **Yes** (2026-10-08)

**What**: Clean gets a tab, “Fix values”, holding Edit values, Use Beatport's values and Save changes into the files, for a selection or a scope you pick (the Library, a playlist, a Collection). The Library's Fix ▸ and Beatport ▸ open Clean with the selected tracks. Clean's tabs become: Review matches, Fix values, Missing files, Duplicates, Health.

**Why**: The page for fixing has no bulk fixing; it lives in a Library menu.

**Size**: L. **Built in**: PAGES-07. **Tasks**: F9, F10.

#### FLW-13 — Split Review: start matching from the header, decide in the tab

**Mark**: **Yes** (2026-10-08)

**What**: Clean's header gets one “Match tracks…” button that opens a small window: what to match, and whether to match again. The Review tab keeps only the queue, the comparison and the decision buttons. “Export review list…” moves to the header too.

**Why**: Review holds about 22 functions today.

**Size**: M. **Built in**: PAGES-07. **Tasks**: F9.

#### FLW-14 — Health counts open Clean's own tabs

**Mark**: **Yes** (2026-10-08)

**What**: “Missing or unreadable files” opens Missing files, “In a duplicate group” opens Duplicates, “Needs review” opens Review. Counts with no tab of their own (no key, no genre) still open the Library filtered. *(2026-10-08 review: “No Beatport key” opens the Library on the same rule as its count, with Match tracks….)*

**Why**: Health sends you to the Library even when Clean has the tab for it.

**Size**: S. **Built in**: PAGES-07. **Tasks**: F10.

#### FLW-15 — Discover: setting up a search and reading results apart

**Mark**: **Yes** (2026-10-08)

**What**: Discover's tabs become “New search”, “Results” (past searches on the left, the chosen one's tracks on the right) and “Wantlist”. Owned tracks are hidden the same way everywhere, with the same switch. Result actions are always visible, disabled with a reason until rows are selected.

**Why**: The Runs tab holds setup, history and results; owned tracks are treated three ways.

**Size**: M. **Built in**: PAGES-08. **Tasks**: F11.

#### FLW-16 — Artist and label links on Beatport results

**Mark**: **Yes** (2026-10-08)

**What**: In Discover's result and wantlist tables, artist and label names are links to their pages.

**Why**: Nothing on Discover reaches the artist or label pages.

**Size**: S. **Built in**: PAGES-08. **Tasks**: F12.

#### FLW-17 — A toolbar for the selected Set entry

**Mark**: **Yes** (2026-10-08)

**What**: Selecting an entry in Prepare shows buttons above the Set: Move up, Move down (also Alt+↑ and Alt+↓, as in the queue), Start a chapter here, Repeat after, Remove. A chapter heading gets an Edit button. Drag and right-click keep working.

**Why**: Ordering, chapters and removing are drag or right-click only today.

**Size**: M. **Built in**: PAGES-09. **Tasks**: F13.

#### FLW-18 — In and Out times in the Set table

**Mark**: **Yes** (2026-10-08)

**What**: In and Out become columns you can type into in the Set table, so timing a Set never needs the Inspector. The Inspector keeps the same fields.

**Why**: Hiding the Inspector leaves no way to time a Set.

**Size**: M. **Built in**: PAGES-09. **Tasks**: F13.

#### FLW-19 — Key and BPM in the transition strip, with the warning in words

**Mark**: **Yes** (2026-10-08)

**What**: The strip's caption reads “8A → 9A · one step up · 124 → 126 BPM (+1.6%) · Out 5:30 → In 0:45”, and any warning shows as a sentence under it, with Accept beside it.

**Why**: The strip leaves out key and tempo; warnings are hover or Inspector only.

**Size**: S–M. **Built in**: PAGES-09. **Tasks**: F14.

#### FLW-20 — CuePoint's own app menu, and only shortcuts that work

**Mark**: **Yes** (2026-10-08)

**What**: The Electron default menu (Reload, Developer Tools, Zoom) is replaced by CuePoint's: File (Import, Check Rekordbox for changes, Export to Rekordbox), View (Size, Track details, sidebar), Help. *(2026-10-08 review: Export stays out of the menu, as DEC-087 has it; Edit is added; the in-window bar goes, Q-202.)* The Shortcuts list shows only shortcuts that work, with Prepare's added. This extends LIB-12 to the whole app.

**Why**: Ctrl+R reloads the window though the list calls it something else; eight listed shortcuts do nothing; Zoom fights the Size setting.

**Size**: S–M. **Built in**: PAGES-03. **Tasks**: F1, F17.

### FLW-1 as narrowed — which actions get a visible place

Only the actions a DJ reaches for often get a labelled button or a visible menu. The rest stay in
the right-click menu and on keys, and say so in the Shortcuts list.

| Gets a visible place | Where | Proposal |
| --- | --- | --- |
| Play, Play next, Add to queue | The selection bar; Track details | FLW-8, FLW-9 |
| Copy, Show in folder | The selection bar's More ▸ (visible today, kept so); Show in folder also in Track details | FLW-8, FLW-9 |
| Similar tracks | Track details; the selection bar's Explore | FLW-8, FLW-9 |
| Add to Collection, Add to Set, New Set from these | The selection bar's Organize | FLW-8 |
| New Collection, New Set, New folder | Labelled buttons over the tree | FLW-10 |
| Open in Prepare, Save set list (a Set); Rename, Duplicate, Delete, Export to Rekordbox (any node) | The bar under the tree | FLW-10 |
| Import, Check Rekordbox for changes, Export to Rekordbox | The Library header | FLW-11 |
| Edit values, Use Beatport's values, Save changes into the files | Clean → Fix values | FLW-12 |
| Start matching | Clean's header | FLW-13 |
| Move up, Move down, Start a chapter here, Repeat after, Remove; edit, move or delete a chapter | Prepare's entry buttons; the chapter heading's buttons | FLW-17 |
| In and Out times | The Set table | FLW-18 |
| The keys of one or several playlists | The Keys page in the sidebar | FLW-21 |

| Stays right-click or keys only | Why |
| --- | --- |
| Rate ▸ and Favorite from a row | The stars and the heart are in Track details |
| Add tag… and Remove tag… from a row | Tags are in Track details and Organize ▸ for a selection |
| Freeze a Smart Collection into a Collection | Rare; the hover icon and the menu are enough |
| Copy set list, New Set from… on a tree node | Save set list… and Organize ▸'s New Set from these are visible |
| Reorder a Collection's tracks or the queue by drag | Alt+↑ and Alt+↓ do it from the keyboard: the queue's today, a Collection's added in PAGES-05 |
| Column resize and reorder by drag | "Columns…" does both |
| Insert here from a source row's menu | The "Insert here" button is beside the table |
| Bare A, R, N and arrows in Review | The buttons are beside them |

#### FLW-21 — A Keys page in the sidebar (the user's)

**Mark**: **Yes**, asked for by the user (2026-10-08, DEC-200)

**What**: A sidebar entry, **Keys**, opens a page that answers "which keys are in these tracks".
Pick one or several playlists, Collections or Sets (or the whole library) on the left. The middle
shows the Camelot wheel with each key's track count on its segment, darker where there are more,
and a list of the same counts in Camelot order with a bar for each. "No Beatport key: N" is its
own line. Click one or more keys to list those tracks below, with the selection bar's actions;
"Show keys that mix with 8A" lights the compatible keys by DEC-096's rule. "Open in Library" and
"Save as Smart Collection…" (keeping the playlists, FLW-7) carry the choice on.

**Why**: The user's request: the key population of one or several playlists is its own job, not a
filter tucked into the Library.

**Size**: L. **Built in**: PAGES-16.

#### FLW-22 — Beatport's key is the only key CuePoint trusts (the user's)

**Mark**: **Yes**, decided by the user (2026-10-08, DEC-201: "Beatport only")

**What**: A track's key is your own correction if you made one, else the key of its accepted
Beatport match. A track with neither has no key: it shows "No Beatport key", and is left out of
key filters, the wheel, the Keys page's counts and Prepare's key checks. Rekordbox's key stays
visible in Track details, marked as Rekordbox's and not used.

**Why**: The user: "even if it has keys from rekordbox they might be wrong, the only right keys
will be from beatport".

**Size**: M–L (engine-wide). **Built in**: PAGES-15.

## After the full review (2026-10-08)

A review of Phase 14 against every decision settled the details the proposals above left open. The
step text in `PHASE14_PAGES.md` is the authority; in short:
- **Labels, one each**: "Check Rekordbox for changes" (Q-206), "Import another file…" (before the
  first import, "Import your Rekordbox collection…"), "Export to Rekordbox…", "Match tracks…" for the
  match window (any number of tracks) and "Match on Beatport" for one track matched in place, "Edit values…", "Save changes into the files…", "Save review
  list as a file…", "Clear queue", "Clear selection", "Clear all filters".
- **One home each** (FLW-2): matching many tracks is Clean's window, editing is one editor (Track
  details for one track, Fix values for many, Q-203), export is the Library's and the tree's, never
  the app menu (DEC-087), and the keys of playlists are the Keys page's (Q-204).
- **Bars never jump** (Q-207): the selection bar, the tree's bar and Prepare's entry buttons are
  always shown, disabled with a reason until something is selected.
- **Nothing hover-only**: reasons shown in a title are also shown on keyboard focus, and the queue's
  failure reason is text on the row.
- **Discover's tabs** (FLW-15) replace DSC-2's names; the Wantlist keeps its three-way "In your
  library" filter, set to Any.
- **Keys** (FLW-22): Camelot everywhere; a track with no Beatport key is a notice in Prepare, not a
  warning; the first-run guide has a matching screen; someone who updates is told once (Q-205).
