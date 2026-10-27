# Changelog

All notable changes to CuePoint will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Keys written as Camelot, Musical or Both.** **Settings › Appearance › Tables › Keys written as** changes how a key is written everywhere it is shown: tables, the Camelot wheel (labels and middle), the player bar, Prepare, Statistics and the Library's Key filter. **Camelot (8A)** is the default, **Musical (Am)** and **Both (8A · Am)** are new. It only changes the words on screen: chips keep their Camelot colors, and files, exports and matching keep their own notation. **Reset appearance** puts it back to Camelot.
- **View has Search library… and Activity….** Both are in the **View** menu with their keys (**Ctrl+K** and **Ctrl+Shift+A**), and the shortcuts list now includes Clean's review (**Enter** plays, **Space** ticks) and the queue's keys (**Up**, **Down**, **Home**, **End**, **Enter**, **Menu key**, **Alt+Up**, **Alt+Down**, **Delete**).
- **A "more" icon.** The selected Collection's row menu is a three-dot icon button, and Discover's icon in the sidebar is a gem, so it no longer looks like the Search magnifier.
- **Continue a dig that stopped partway.** A dig stopped by Beatport, a refused sign-in, a closed app or your **Stop** now reads "Stopped" (not "Failed"), says why on its card and has a **Continue** button that picks it up where it stopped, skipping the charts, artists and labels already read and adding to the same dig. Clean's Past searches also say why a match stopped ("Stopped: Beatport did not answer."); **Resume** was already there.

### Fixed
- **Back from a chart keeps your place.** In a dig, opening a chart, artist or label card and pressing **Back to all results** returned to the top of the cards. It now returns to where you were.
- **Controls measure the same on every OS.** Inter, the face of every control and figure, now ships with the app (weights 400, 500, 600 and 700) instead of falling back to Segoe UI or the system font on Windows and macOS, so buttons, chips and columns no longer differ in width from one OS to the next.
- **The queue count on the player bar is readable in the Muted and Classic themes.**
- **Stop shows as soon as a job starts.** A bulk change, import or other job you start appears in the status strip straight away with its **Stop** button. Before, it could take up to two seconds, so a quick job could end before you could stop it.
- **Next stays on the next track.** Pressing **Next** just as a track started no longer makes the queue jump back to that track for a moment.
- **Interface fixes.** Radios keep their border on hover; cut-off headers and the Statistics header facts fit; low-contrast text, hover tabs and borders in Retro, Neo dark and Muted are readable; a right-click on an unselected row selects it first (the menu then acts on that row); **Undo** after removing tracks from a Collection or a Set puts them back in their old places, and a partly removed selection says so; **Enter** in Prepare plays the entry (it used to open an editor), and **Enter** in a dialog submits once.
- **Selection bar, Prepare entry buttons and narrow windows.** The Library's and Keys' selection bar lies over the table's bottom rows, so selecting a row no longer moves the table, and a double-click on an unselected row plays it. Prepare's entry buttons stop left of Mix in, Mix out and Starts at, so a click on a time edits it. At large text sizes the player keeps its timeline and puts shuffle, repeat, the queue and the zoomed waveform in a **More** menu, the sidebar fits without scrolling, the pane headings keep **+ New** whole, the Keys track list and the Library filter row fold **Select all**, **Open in Library** and **Tags…** into menus, and the BPM chart writes a count only where it fits (**Show the numbers** lists them all). Smaller fixes: Most played's header band, the Suggestions toolbar, Activity's category chips, Clean › Review's tick boxes and the **In use** chip, the Sync dialog's WAV note, the Clean › Playlists footer, the Columns dialog's arrows, and the focus ring left on a sidebar icon after a menu opens another page.
- **Second consistency re-check.** A Library pane heading that does not fit wraps (**+ New** and **from Rekordbox** go under the title, never "Collectio…"); the filter row's search gives way before the row wraps, so **Select all** stays on its line at 1.5×, with Track details open and in a 1,024-wide window; a tight sidebar draws its icons at the Medium size and drops the logo row, so the 3× rail does not scroll. Activity's categories are tinted chips like **Done**, and toasts and Activity lines are in Inter. Statistics › Health says "Artwork last read today, 8:28 AM"; Edit values says why it is greyed in a notice in its body; with one Beatport track selected, Discover's three Open buttons are one **Open** menu; a scope's trail (**Collections › Gigs**) sits above the title as on the Artist, Label and Similar pages; the Similar page's header lines up with theirs; row lines run through the pinned Title column; Past searches shows its dates and results whole; a failed queue item's reason wraps instead of reading "Could n…"; Track details › Yours stacks its labels; and a date range never breaks inside a date.
- **Statistics no longer flickers while a dig runs.** A Discover dig saves what it finds about once a second, and CuePoint took each save for a change to your library, so Statistics (and the Library, Clean and Keys behind it) read everything again and Plays dimmed under "Loading plays…" every second. Discover's saves now count apart from the library's, and when Statistics does read again on its own it swaps the new numbers in without dimming; only a choice you make (Since, the list length, the scope) shows the reading look.
- **Digs and Clean matches no longer stop when the Beatport sign-in renews.** Requests wait out the few seconds while the new sign-in arrives (CuePoint checks for it every second once the old one ends) and a request Beatport refuses is tried once more with the new sign-in. This covers Discover, Clean, lookups, playlist pushes and Beatport pages.
- **Back from a chart in Discover is instant.** Opening a card from a dig and pressing **Back** no longer freezes and reloads every card and cover: the cards stay as you left them, at the same place in the page, with their ticks and open rows. Card pictures and Clean's candidate covers are asked for only when they are on or near the screen, a few at a time, and kept for when you come back, so the rest of the app is no longer stuck behind hundreds of cover requests.
- **Holding Up or Down in Clean's Check the match panel is smooth, and a past dig opens at once.** Moving along the review with the panel open redraws only the two rows that change and lays out the panel and the table on their own instead of the whole page, covers arriving no longer shift anything, and the panel reads the track you stop on rather than every track you pass. Opening a past dig in Discover shows it as selected, with its header, straight away, and a grid of card shapes holds the cards' place until they arrive.

### Changed
- **Round 3 polish (523 review items).**
  - **One look.** Text lands on whole pixels at every size, there are two icon sizes, floating surfaces cast hard pixel shadows, row hover is a quieter shade, margins are even on both sides, and high-contrast mode shows the selection. Labels share one face, fields show their box, all-good states are quiet, every fold is the same disclosure with its arrow at the row end, and toasts float over the page (above a selection bar) instead of taking room.
  - **Menus and dialogs.** Menus open above their button with submenus level with their parent and one grey active look. Dialogs keep their words while closing, share one footer, and grey Cancel while deleting. A "…" means the next step asks for something first. The menu bar hides itself (Alt shows it) and follows the theme; the window remembers its size and place and opens in the app's colour.
  - **Library.** The Library, Keys and Prepare panes meet the sidebar, with 20 between side-by-side panes. On All tracks the file is a menu (Check for changes, Import a different file…, Copy path) with a check chip; the trail sits in the facts line. **Select all** is in the selection bar, **Manage tags…** in Add filter, the Key filter is a grid of chips, Copy is **Copy as text**, and a refresh keeps your place. Tables put BPM before Key, start with label, rating, album, release date and sources hidden, shrink Title first when narrow, and **Columns** gains drag, Alt+arrows and a Not shown list.
  - **Track details** has three tabs (Overview, Beatport, Yours) and no Play, Queue or Similar buttons (use the selection bar or a row's menu). Overview lists the playlists and Collections a track is in, with **Add to…**; Beatport compares Rekordbox's values with Beatport's. It opens a moment after you first select a track, stays open, and folds itself when the window is too narrow for the table.
  - **Player.** Play is grey with a violet icon and turns violet only while playing; the transport is smaller and the right-hand buttons square. The zoomed waveform shows on Library, Prepare and Keys only, from the page edge. The queue has Track details' head, a line of gestures, a dimmer look for played tracks, a quiet **Clear queue** that asks first, and type-ahead.
  - **Clean** opens on the tracks to check when any wait, with their count in the sidebar, a **To check only** filter and **N** for the next one. A second match waits its turn instead of being refused. Duplicates are grouped by track with play and a **Keep** that deletes nothing and can be undone. "Past searches" is **Past matches**, and **Read artwork** is in Missing files.
  - **Discover** cards share one layout (a square picture with the name beside it), a dig's tracks have one **Beatport** menu, and New dig is a centred form with a **When** group and **Start dig**. Charts and runs still come first.
  - **Keys** has three matching panes (Sources, Keys, Tracks) with a **Wheel | List** switch; the wheel stays smooth with pixel labels and a "Brighter = more tracks" legend. **Statistics** has Overview, Plays and Health tabs; Health is read-only and links to Clean.
  - **Prepare**'s title is the Set's name and opens the Set menu; one New Set flow ends in **Create**; the Library tab marks tracks already in the Set and **Ctrl+F** searches it; the warnings count jumps to the first warning; "tracks" replaces "entries".
  - **Settings** edits a theme on the page with typeable hex codes, says **In use** for the active custom theme, shows **Reset to defaults** only when something differs, and keeps Get help, Keyboard shortcuts and About in About & updates. **Getting started** closes with × or Escape, and First steps waits for it.
  - **Exports to Rekordbox** reuse one file name and keep a dated backup of the file they replace; Export opens its own save dialog. The Log viewer saves through the system's save dialog. Dates follow the region set in the system. The window title names the page or the playing track.
- **The interface speaks in the pixel face.** Buttons, tabs, chips, menus, labels and column headers are now drawn in the same pixel face as the page titles. Track names, cells, what you type and sentences stay in Inter, so data is still easy to read.
- **Everything lines up.** Each panel keeps one left and one right edge: quiet buttons, panel titles, section arrows and Prepare's side panel no longer sit a few pixels in. The Library's pane now meets the table's lines exactly, its tree steps in less, and the sidebar's icons have more room.
- **Nothing in the Library wraps.** The filter row stays one line at every window size and text size: when room runs out its buttons fold into **Add filter**, **More** and **Filters** menus, and the count stays as "240 of 12,000 tracks". The pane headings stay one line too (a narrow pane drops "from Rekordbox" and shows **+**), **All tracks** sits on the section headings' edge, the player's facts line has no dots around the key, and Track details' section arrows sit at the end of their row with more room around **Edit values**.
- **Steadier details.** A status chip looks the same on a hovered or selected row, a panel's own edge lights up when you can drag it, being selected no longer moves a Settings link, and the activity strip is centred with a thinner bar.
- **A calmer, more consistent look.** Surfaces are told apart by tone instead of outlines, toolbar buttons are quiet until hovered, popovers and dialogs share one shadow, scrollbars are thinner, and checkboxes, radios, sliders, search fields, selects, filter chips, the selection bar, menus, notices and charts follow one set of sizes and colors across every page and theme.
- **Smoother motion.** Pages, dialogs, menus, filter lists, the Camelot wheel, hint tips, toasts and Track details now ease in and out smoothly instead of moving in two held steps, and a new page starts moving once it is on screen, so it no longer sticks at half strength and then pops. A pressed button, checkbox, radio or player button darkens and sits down at once. The tab you pick lights at once and only its underline grows in. Small decorations (the spinner, a refused value's shake, chart bars, the wheel's lit keys) keep their pixel steps.
- **One font in a line.** Lines of facts, counts and notes under a title (a dig's genres and dates and "5,805 tracks found", a page's header facts, search results' key and tempo, Activity's times and details, Prepare's transition caption and times, notes and empty-list lines) are wholly in the plain data font, so words and numbers no longer mix two fonts in one line. Titles, chips, buttons, tabs and labels stay in the pixel font.
- **Look and wording, page by page.**
  - **Toggles and radios.** A button that is on has one soft violet look and reports itself as pressed, and a radio is a square with a small square inside.
  - **Sync and match words.** Writing to files is **Sync** everywhere (**Sync to files…**, **Sync 17 files**, **Nothing to sync**, **Undo this sync**), the Library header says **Up to date**, **Check for changes** is the one word for re-reading the Rekordbox file, and **Copy Beatport values…** replaces "Use Beatport's values…". Match states read **Confirmed**, **To check**, **No match**, **Not looked up yet**, **Rejected** and **Search failed**, and the agree button is **Use this match**. Confirmed rows are a quiet tick; only problems get a chip.
  - **Clean.** Match is one row of tabs, a caption ("Step 1 of 3 · Tick playlists", "Step 3 of 3 · Check and sync …"), and search; a Review is a view inside Playlists with a **‹ Playlists** back button, and **Sync to files…** sits at its bottom right. Playlists, Past searches and the Review share the Library table's look. **Enter** plays a review row and **Space** ticks it.
  - **Keys.** Two panes: the Sources and the wheel (or the list of counts) on the left, the track list beside them with its toolbar (count, **Select all**, **Open in Library** and the **Wheel | List** switch), so picking a key shows its tracks at once.
  - **The queue** opens at the Track details width, scales with the text size and can be dragged wider, but never past half the window.
  - **Prepare.** **View** has ticked items (**Tempo lane**, **Transition strip**, **Mix in and Mix out**); the New Set dialogs end in **Create**; **Enter** plays from the selected entry and **F2** edits its mix-in time. The Set table opens with fewer columns (Fit, Starts at, Mix in, Mix out, Transition and Note are in **Columns…**).
  - **Statistics, Settings and dialogs.** Statistics lists share the Library table's header, row height and hover, with a sticky header; Settings has a sticky section list; dialogs share one name-and-folder form and one footer; set list toasts have no full stop.
  - **Activity** is a row in the sidebar's foot above Settings and **View → Activity…**; the status strip has no button.
  - **Themes** change colour only: tuned palettes (line strength, a darker Classic toolbar, a cyan link in Club neon, softer status colours in Muted) and Rekordbox's blue, orange and white in every waveform. Text sizes are **Extra small (1×)**, **Small (1.25×)**, **Medium (1.5×)**, **Large** and **Extra large**.
  - **Artist, Label and Similar pages** opened from the Library, Track details, Clean, Prepare, Keys or the player bar say so in their top line (**Library › Artist**) and keep the Library lit in the sidebar.
  - **Past matches has no Delete.** Digs can be deleted from Discover, but the engine has no endpoint to delete a Clean match run, so Past matches only opens, resumes, matches again and saves the review list.
- **UI consistency foundation.** Buttons have six button looks (primary, secondary, write, danger, confirm-delete and quiet; a bare button is secondary), status text uses the text colours, font weights have names, and chips, notices, toasts, menus and dialogs are shared. Writing to files is **Sync** ("Up to date" when nothing is waiting), match states read Confirmed, To check, No match, Not looked up yet and Rejected, tables share one look, and column widths are remembered in 1x units so a text-size change keeps them. Waveform colours follow Rekordbox in every theme.

## [1.0.0-test.4] - 2026-10-18

### Added
- **Round 5 review fixes.** The Library header stays one line at 1,264 x 735 (the First steps chip goes first, then the file and its state move to the facts line), the action bar draws no count while nothing is filtered, the search field shares the filters' line, and menu chevrons are 12px at 1x to 1.75x. The player bar's other buttons are the standard size, the compact bar starts under 700px of window height (the zoomed waveform strip stays at 735) and its queue count sits beside the icon. Details has one name, **Track details**, with its state in `aria-expanded`; tab counts read "Missing files, 3"; context-menu groups and disabled entries are named for a screen reader; square tick boxes and radios have a forced-colors fallback and a radio is a dot, not a tick; hints show on keyboard focus; and a renderer reload keeps the tabs.
- **One look across every page.** Cards, empty states, reason lines, text areas, track facts lines (artist, label, key, BPM, year in one order), dialog footers, bar charts and tooltips are now single shared pieces, so Statistics, Settings, Clean, Discover, Prepare, Keys and the Library share the same boxes, spacing and wording. Settings sections are the same cards as Statistics.
- **Details is the last button of every page's header.** A button with a panel icon and "Details", after a small divider and the same height as its neighbours, pressed while the panel is open; the floating handle is gone. **Ctrl+I** still works.
- **Clean's candidates show their cover.** Every Beatport candidate in the Review's candidate panel has a small cover at its left (a placeholder when Beatport has none); the order is unchanged, the one in use first, then by score.
- **Library toolbars are evenly spaced** with the same height and padding for the filter bar and the action bar, and the left pane's lines line up with the right side.
- **A fresh start opens Clean on Match ▸ Playlists and Discover on New dig.** Within a session, tabs keep their state.
- **Statistics has three tabs: Plays, Library and Health.** Plays holds the listening charts, Library the spreads of keys, BPM, genres, labels, years and ratings as bars and ranked lists (new engine data), and Health the counts of what needs attention, each linking to the tracks.
- **Clean ▸ Playlists shows each playlist's own progress.** Only the playlist being matched shows its bar, "Matching 12 of 24" and **Stop**; the other rows stay as they were, and the line at the top of Clean is gone. The Review's candidates are listed best first, with the one you chose or confirmed on top.
- **Discover ▸ New dig: Start looking is a bar under the form**, where it stays in view.
- **Getting started has CuePoint's logo and four pictures** showing how to export from Rekordbox, and **Match on Beatport** stays greyed until a file is imported.
- **Sync can write a comment.** The Sync window has a **Comment** row, ticked, with a text field that says "ok": it writes that text into each file's comment tag, the one Rekordbox lists as Comments, so you can tell which files were synced. **Keep values already in the files** leaves a comment already there alone, a Sync's **Undo this save** puts it back, and a longer text than 255 characters or one with control characters is tidied or refused. A Sync request that does not name the comment still writes none (`write_comment` / `comment_text` on `/clean/sync-preview` and `/clean/sync`).
- **The playlists list knows which playlists are in your files.** `GET /clean/playlists` gives each playlist `synced` (a sync wrote some of its tracks and nothing is left to save) and `synced_at` (when it last did), counted in SQL so a large library stays quick; an undone write does not count.
- **Discover: a dig with no artists reads artists' charts only.** Charts by ordinary Beatport users (no linked artist) are skipped, so the dig matches what Beatport's genre charts page lists and spends no request on the rest. **Settings → Beatport → Include charts by regular Beatport users** turns them back on; the choice is sent with each dig and recorded in its run (`include_user_charts`, default off). Charts by your library's artists are unchanged.
- **Discover ▸ Results are rows of cards.** A dig's tracks are grouped by where they came from: **Your artists' charts** (the charts the artists you chose made, or **Genre charts** when you chose none), **Your artists' new releases** (a round card per artist with "3 charts · 4 new") and **Your labels** (a card per label with "6 new"; labels make no charts). With artists chosen there are no general genre charts, and an artist's or label's new releases count only in the genres you ticked. Click a card to open its tracks (preview, key, BPM, in-library marks, ticks to leave some out); **See all** shows a long row; **Everything** opens the whole dig as one table with a **From** column. Tick cards for a bar, "Ticked: Argy, Afterlife · 20 tracks · 3 already in your library", with **Add to wantlist** and **Add to playlist**, which makes a new Beatport playlist or adds to one you already have, skipping the tracks your library owns and saying so. A dig made before this reads as the one list it was.
- **Track details has tabs.** Under the title and its Play, Queue and Similar buttons, **Overview**, **Beatport**, **Where** and **Yours** replace the folded sections. Overview is a labelled grid (key with its wheel button, BPM, genre, loudness, cue points, Beatport status) above the waveform, with the cue points and Rekordbox details folded at its foot; the panel remembers your last tab. **Beatport** says the matched release and the fields that agree on one line, and shows in full only the fields that differ, with **Compare all on the Clean page** for the rest.
- **Discover preview buttons fit the rows.** The ▶ is a smaller outlined circle that sits inside the row instead of being clipped, the playing state is the same circle filled with ■ and the moving bars beside it, and the Preview column is narrower.
- **Discover ▸ Results is lined up and its previews are visible.** The tabs, banner, dig cards and table share one left edge, with more room between the cards and the table. **Delete this dig…** moved into a ⋯ menu on each card (still asks first), and a running dig shows a thin progress line. The table has a **Preview** column with a small round ▶ per row; the playing row shows ■ with moving bars (still when Motion is off) and a tint. The lookup banner's button now reads **Look them up**.
- **Clean ▸ Match: each playlist has its own Match.** The tick boxes and the header's Match button are gone. A playlist being matched shows a bar, "Matching 12 of 24" and a **Stop**; when done it says "9 to check" and "15 confirmed" and offers **Review 9 ›**, which opens the **Review** of that search (below), with a **‹ Playlists** button back. If earlier searches left more tracks waiting in the playlist than that run holds, Review opens the playlist instead. From another page, a note says "hJ matched · 15 confirmed · 9 to check" with **Review 9**. **Correct** is now Enter, **Not this track** is N and **Skip** is S; a held key decides once.
- **Clean ▸ Match: a Review of every track after a match.** When a match ends you land on **Review hJ**, a list of all the search's tracks with **Status** (To check, Not found, Search failed, Matched, Done), your track, the Beatport match, **Differs** (which part differs: title, remix, key, BPM…), a ▶ preview and one-click decisions (**✓ Correct**, **✕ Not this**, **Details ›**, **Search ›**, **Leave unmatched**, **Undo**). Chips with counts filter it, a coloured bar shows them, **Confirm all 13 matched** asks first, naming the values it will copy, and offers Undo; you can also tick rows and **Correct N selected**. Decided rows dim and move to the bottom, and a click on a row opens its details. A long search is read a page at a time with only the rows in view drawn, **Rejected** and **Changed since you decided** are chips of their own, and **Undo** on a row takes back only that track's decision and the values it copied, even after Confirm all, and the note after Confirm all has **Undo confirming 13** for the whole batch. **Search** in the details now searches Beatport from CuePoint with your own words, scores the results against your track and keeps them, with **Use this** on each (it needs your Beatport sign-in and says so without one; **Search Beatport myself…** still opens the browser). **Details ›** opens your file beside the Beatport match in a panel next to the list (**Correct** Enter, **Not this track** N, **Skip** S, **↑↓** between tracks, **Esc** closes); **Search ›** opens a search box filled with the title and artist, with **Use this** on each result. When every row is decided, "hJ is reviewed" offers **Save N to files…**. **Past searches ▸ Open**, **Review N ›** and the end-of-match note open the same list.
- **Clean says what the matching is doing, from any tab.** While a match runs, a line at the top of Clean reads "Matching hJ · 11 of 24 · about 2 minutes left" with a bar and **Stop**, read from the running match so it is right after you leave the page and come back. A greyed **Match** says why ("one match at a time"). A search that finds nothing shows a red note ("hJ: 24 searches failed", or "hJ: no Beatport match for 24 tracks. This usually means the search failed…") with **See the 24 ›**, and its row says **24 not found** with **Match again**. Past searches now count searches that failed apart from tracks Beatport had nothing for.
- **Keys are colored chips.** A key is a small chip in its Camelot color (12 hues round the wheel, deeper for A and lighter for B), with the key's name as its hint, in every table. **Settings → Appearance → Tables → Color keys** turns them back into plain text (R4-2, DEC-272).
- **Library header names what it shows.** The title is the playlist, Collection, Set or Smart Collection you opened (or **All tracks**), with a line under it: tracks, running time, BPM range and number of keys. The source is the file's name and its state, with the path and last-read time in its hint; two buttons remain, **Check for changes** and **Export to Rekordbox…** (R4-4, K9, DEC-290).
- **A green save bar under every Clean tab.** When values CuePoint holds are not in your audio files yet, the bar says "47 tracks have new values that aren't in your files yet." with **See changes** and **Save to files…**; it is gone when nothing is waiting. On Match ▸ Playlists, a playlist that is ready to save has its own **Save N to files…**, which opens the save window on that playlist's unsaved tracks (C23, DEC-262, DEC-292).
- **A preview on every row of Clean's Review list.** The ▶ plays Beatport's sample for the proposed match, so you can hear it before you take the values (K12, DEC-292).
- **Keys shows the wheel or the list.** A **Wheel | List** switch above the counts shows one at a time and remembers your choice; **No Beatport key** stays on the page in both, and each wheel segment is named with its count (K15).
- **Motion is one choice.** **Settings → Motion** is now **On**, **Off** or **Custom**; **Choose each kind…** opens the ten switches, and Custom is chosen for you when they differ. On still gives way to your system's Reduce motion. Playback no longer shows **Exclusive output** where the system has none, and Privacy has one **More about this** (K11).
- **Compact size (1.25×), and a size picked for your screen.** **Settings → Appearance** and **View → Size** gain **Compact (1.25×)** between Small and Medium. A new install opens at Compact on a screen shorter than 860 pixels and at Medium otherwise; if you updated, your size is unchanged. A size too big for your screen is greyed with the reason, and the one that suits the screen is marked (R2-5).
- **Zoomed waveform above the player.** While a track plays, a strip above the player bar shows about 8 seconds either side of the playhead, scrolling with the music, with a line on every beat and a stronger one on each bar from the track's Rekordbox beat grid (a track without one shows no lines). Click it to seek. The first play of a track takes a second or two to sharpen; recently played tracks are kept, up to 256 MB. Turn it off in **Settings → Waveforms** (DEC-250).
- **The zoomed waveform is ready when the track starts.** The strip above the player now prepares the track you select and the next one in the queue ahead of time, so it no longer starts blocky and sharpens. If it is still not ready, it draws a smooth outline and fades to the detail instead of showing blocks.
- **Hover hints.** Resting the pointer on a button for a moment shows its themed hint, the same one the keyboard shows, everywhere in the app, disabled buttons included. The player bar's title, artist and key have one too.
- **Sign in to Beatport.** Settings → Beatport and Discover's banner have a **Sign in to Beatport** button that opens Beatport's own page in a window of its own. When you have signed in, CuePoint keeps the sign-in encrypted on your computer and renews it by itself; **Sign out** forgets it. Pasting a token still works, under **Paste a token instead**. Where the system has no secure key store (some Linux setups), you sign in again each time CuePoint starts. Where the system has a secure key store, a token already saved in your config file is moved into the encrypted store on the first launch; otherwise it stays in the file and is still used. CuePoint uses your own Beatport account and the same low request rate as before.
- **Clean's Match area.** The Review matches tab is now **Match**, with **Playlists**, the **Review** of a search (your track beside the best Beatport match, with the other results, a likelihood, and Beatport previews and **Play your file**) and **Past searches** (every search you ran, with Open, Resume and Match again). Press Enter to Correct, N for Not this track, S to skip, B to hear the preview and Y to play your file (DEC-251).

- **Waveform button on the player bar.** One click hides or shows the zoomed waveform above the bar; the button is lit while it shows, and the choice is remembered and matches Settings → Waveforms (DEC-257).
- **Scroll to zoom the zoomed waveform.** The mouse wheel over the strip zooms from 4 to 64 seconds, and the span is remembered. Its hint sits just above the strip and says the span (DEC-257).
- **The playing track is marked in tables.** In the Library, Keys, Discover and Prepare track tables, the row of the track in the player has its title in the accent colour and a small speaker at the start of the row, and a screen reader hears "Now playing". Tracks already played since CuePoint started have a muted title (R4-6, DEC-268).
- **Saved artist and label lists for a dig.** New dig's Artists and Labels are now every one in your library, **a saved list** (picked from a drop-down that says how many names it holds, with **Edit…** and **+ New list** beside it) or none. A list has a name, can be renamed, changed and deleted in the same chooser, and is kept by CuePoint; an earlier dig's chosen artists and labels become **My artists** and **My labels**. **Start looking** moves to a bar at the bottom of the panel that says "2 genres · 25 artists · 9 labels" and holds **Releases from the last … days**.
- **Library lines up and loses its save bar.** The pane and the table share three row heights (All tracks with the search row, the Collections heading with the Play / Organize bar, + New with the table header), so the divider runs straight across. The ⠿ grip shows only inside a Collection; rows still drag anywhere. The green save bar is gone from the Library; saving into your files is per playlist, on Clean.

### Changed
- **Track details, when hidden, is a small Details button** at the top of the right edge in the title row. It takes no column, and the page header leaves room for it. The window title is "CuePoint", and the sidebar's hints sit beside their items.
- **One look across the app.** One spacing scale (2, 4, 8, 12, 16, 24) and a 12 px page margin on every page; Settings fills the window instead of sitting in a capped column. Buttons have one standard look with a hierarchy: violet for the one main action, green for buttons that write to your files, red for delete (a filled red only on a delete dialog's confirm button), grey for the rest, plain text for quiet links.
- **Shared pieces.** Status chips, headings (page 24, dialog 18, section 14, small bold labels), links (one colour, underlined on hover), 20 px bordered close buttons, two tab styles, one empty-state layout, one focus ring (violet, 2 px, square), whole-number icon sizes, search fields with a search icon and a clear button, and the app's own hints instead of native tooltips. Fonts use weights 400 and 700 only.
- **Track lists are 26 px rows everywhere** (Library, Keys, Discover, Prepare, Clean Review, the queue, Statistics lists and search results), with the data in one font, cut-off text ending in … and the full value in the hint, and number columns aligned with their headings. Dates, times, lengths and counts read the same way everywhere, and a track's facts always read artist · label · key · BPM · year.
- **The key chip is the Camelot wheel button.** In Track details and the player bar, click the coloured key to open the wheel; the separate Wheel button is gone.
- **Clean ▸ Playlists** shows the three steps (tick, review, sync to files) and a **Synced** chip with the date when a playlist's values are in your files; the Match button sits in a bottom bar that counts the ticked playlists and tracks.
- **Clean ▸ Review: a "Your track" card** tops the candidates panel (title, artists, label · key · BPM · length · year, play), with the Beatport candidates below it and their differences in orange. The shortcuts dialog lists Home, End and Ctrl+A for the review.
- **Window and pages.** The window cannot shrink below 1024 × 640, and its title names the page you are on. The Export to Rekordbox button is green, as the other buttons that write to files are.
- **Clean ▸ Match is five steps: match, review, untick, swap a candidate, sync.** Tick one or more playlists (or **Whole library**, which excludes the playlists) and press **Match N playlists**: the only way to start. Each playlist you matched gets its own **Review hJ** tab, a plain table with a tick, **Status** (Matched, Check, Not found, Search failed), your track, the Beatport match with the part that differs marked, and a ▶. Matched tracks start ticked and tracks with no match cannot be; untick a track to leave it out, and the header tick does every track. A tick is kept by CuePoint as your decision (ticked is an accepted match, unticked a refused one) and survives a later match. Click a row for a side panel straight on the Beatport candidates: **Use this**, a search box with **Search Beatport**, **None of these — leave it out**, and **More** for why a candidate scored as it did and the attempt picker. Up and Down move along the table and Esc closes the panel.
- **Sync moved to each playlist's Review, and writes nothing until you press it.** The green **Sync hJ to files…** opens one window for that playlist's ticked tracks: BPM, Genre, Label, Year and Key (with its style), how many files each would change, **Keep values already in the files**, **See every change** and **Sync N tracks**. Opening it only previews, laying each match's values over the tracks in memory. **Sync N tracks** is one step that writes the files, then accepts the ticked matches and copies, into CuePoint's own values, only the values each file actually received, as one batch; **Undo this save** puts the files and that batch back. A failed write leaves nothing else changed. The choice of values is made there and nowhere else. The whole collection is the **Whole library** row's Review.
- **Clean has no per-track Correct, Not this or Skip, and no save bar.** The Enter, N, S, B, Y, Left and Right keys, the “When I say Correct, also update” box, **Confirm all N matched**, **Correct N selected**, per-row Undo, the filter chips and the coloured bar are gone; the ticks do their job. A playlist row has no Match or Stop of its own, and the green save bar under the Clean tabs is replaced by Sync in each Review. The header tick leaves proposals the checks turned down unticked, runs as a job when it is long, waits while a match runs, and its note has an **Undo**. A decision a newer search disagrees with shows **Check** with “newer match differs”. Space on a row ticks it, and the table is one tab stop.
- **The Camelot wheel button says what it is.** On Track details' key line, after the key's name, it is a small bordered button with a mini ring in the twelve key colours and the word **Wheel**, in place of the plain pixel icon. It opens the same wheel.
- **The sidebar shows CuePoint's own icon.** The app icon and the name "CuePoint" head the sidebar, and the name lights on hover; the collapsed rail shows the icon alone.
- **The status strip is quiet when all is well.** "Ready" is no longer drawn (a screen reader still hears it); the strip shows text only while CuePoint is starting, when work is running, or when something stops.
- **Clean ▸ Match has no Table and no One at a time.** Its tabs are **Playlists**, **Review hJ** (only while a search is open) and **Past searches**; the Review list does the job of both, and the Inspector now stays out of it in favour of the details panel beside the list.
- **Track details takes less room.** A small cover sits beside the title, one line under it holds the key chip, BPM, genre and loudness, and the waveform is shorter. Every section starts folded and says its answer on the right of its heading ("Beatport · Confirmed", "Where it is · 1 Set · 1 playlist", "Cue points · none · grid 124", "Yours · no rating"); opening one shows what it showed before. The "Not in any Collection yet…" sentence is gone. The **+ New** button over Collections is one small line again, with its chevron beside the label.
- **Table rows follow the text size.** Rows are the small text size times a density, so a Library shows many more tracks. **Settings → Appearance → Tables → Row density** is **Compact** (the default) or **Roomy**; Reset Appearance puts it back (R4-1, DEC-278).
- **The Library toolbar shows only what you can use.** With nothing selected it holds the track count and **Select all**; with a selection it shows **Play**, **Organize**, **Beatport** and **More** and "N selected ×". **Explore** and **Fix** are gone (Similar tracks, the artist and label pages and Edit values… are in More, Copy is in Organize), and **Columns…** is a small button in the table's top right corner. The key notes and Key filter no longer have **Match tracks…** buttons; matching is Beatport ▸ Match tracks… and Clean (K2, K21, DEC-286).
- **Key and BPM come third and fourth.** The default Library columns are Title, Artist, Key, BPM, Length, Genre, Label, Rating, Album. A saved layout still in the old default order is moved once, keeping widths and what is hidden; a layout you arranged is left alone (K1, DEC-289).
- **Import a Rekordbox file… moved.** It is in **Settings → Rekordbox** and the File menu, not the Library header (R4-4, DEC-290).
- **Saving into the files is the green bar.** **More ▸ Save to files…** is gone from the Library; the green save bar at the bottom of the page does it (C23).
- **The empty Library is First steps only.** Before an import the page shows its header and the checklist, whose first step has **Import…** and **How do I get one?**; the separate "Nothing imported yet" panel is gone. The Library's counts are set in the table's figures (K16, R4-3, DEC-293).
- **Clean has three tabs.** **Match**, **Missing files** and **Duplicates**; Fix values and Health are gone. An old Health link opens Statistics ▸ Health and an old Fix values link opens the Library. **Edit values…**, **Use Beatport's values…** and saving to files now open in place in the Library, Track details and Keys instead of taking you to Clean. Missing files shows one check button at a time, **Check every file** before any check and then **Check again** (**Check N again** with rows selected); the match window's button reads **Match N tracks**, **Match N tracks again** or **Match the N chosen**, with the reason beside it when greyed; a Duplicates confirmation names its verb and count (K3, K4, R3-2, DEC-291).
- **Match opens on your playlists.** Clean ▸ Match has a new first view, **Playlists**, with each playlist's Beatport status, a filter box and a **Whole library** row. Tick playlists and choose **Match N playlists on Beatport** (or **Match the whole library on Beatport**, or **… again**); **Review N** opens One at a time on that playlist's waiting tracks. A running match shows one line with a progress bar. The header's match button is gone; the match window still opens for tracks handed in from other pages (C22, DEC-292).
- **Match's toolbar is trimmed, and Missing files is one line when nothing is missing.** One at a time no longer has **Back to Table**; **From** shows only with two or more past searches; the Table's **Values to take** box and tip are a menu on the **Correct ticked values** button (which says "(4 fields)" when not all five are ticked); **Save review list as a file…** moved to each run in Past searches. With no missing files the tab reads "All 306 files found · checked today 07:54 · Check again" (K12, K13, DEC-292).
- **One at a time keeps its buttons in view.** The artwork is a 48 px thumbnail that opens larger, and **Correct**, **Not this track** and **Skip** stay pinned at the bottom of the screen (R2-3).
- **Waveform analysis no longer slows the app.** Reading your files for their waveforms now runs in a separate background process, so pages, searches and the player stay quick while a library is being analysed. Nothing is analysed again, and the waveforms are the same (DEC-284).
- **Messages stay for errors and sit above the player.** Errors and warnings stay until you close them with **×**; other messages still go by themselves, and hovering over one keeps it on screen. The stack now sits above the player bar and status strip instead of covering them, and the same message pushed again replaces the one showing; at most five show at once (DEC-281).
- **One banner when CuePoint stops in the background.** A single banner above the page says what happened and offers **Start it again** (or **Get help…** if that fails); the page is dimmed and its buttons stop until CuePoint is back, and the status strip says **Stopped**, **Starting again… (1 of 3)** or **Getting ready…** instead of keeping a green **Ready** until the next check (DEC-274).
- **The first-run guide has four steps and ticks what is done.** Welcome, **Bring in your Rekordbox file** (with a **How?** button), **Match your tracks on Beatport**, and an optional **Sign in to Beatport**; each shows a check line such as "✓ 306 tracks imported" once it is done, and the step dots tell a screen reader where you are. The page tour is gone. The Library's **First steps** list now ends with **Sign in to Beatport**. The shortcuts list groups rows under **Everywhere**, **Library** and the other pages, uses the menu's own words, and shows keys in the body font so Ctrl+O and Ctrl+0 differ; a section's detail button reads **Less about this** (DEC-287).
- **A slimmer status strip.** The strip along the bottom is one button tall, with no padding above or below, so the page above it gets a little more room (DEC-266).
- **Activity says it in plain words.** A row no longer repeats a count its sentence already gives, or shows zeros, yes/no values or raw `key: value` lines. Match results read "Matched 38 tracks on Beatport: 17 confirmed, 21 waiting for you", the artist and label lookup "Looked up artists and labels for 120 tracks: 117 found on Beatport", the file check "Checked 306 files: 3 missing", and waveforms use American spelling ("Analyzed", "All waveforms are up to date") (R3-6).
- **The queue opens in the right-hand column.** It takes the place of Track details, which comes back when you close it (or press Ctrl+I), so the table keeps its full height instead of shrinking above the player bar (DEC-264).
- **Help has one Get help dialog.** **Help → Get help…** replaces **Report a problem…** and the **Troubleshooting** group: it sends a note, saves a help file to attach to an email or a GitHub issue, and opens the log folder; **Diagnostics…** and **Log viewer…** sit under **Details for support**. The Help menu reads Getting started, Keyboard shortcuts, Get help…, How to get your Rekordbox file…, Privacy. File → Check Rekordbox for changes is now **Check for changes**, About no longer lists the library service, and Diagnostics is no longer in a monospace font (DEC-265).
- **Dialog buttons say what they change and how many.** Edit values says **Change 40 tracks** (greyed, with the reason above it, until you set or clear a value), Use Beatport's values says **Copy to 212 tracks** with a count beside each tick, the big-batch question says **Change 4,213 tracks** or **Copy to 4,213 tracks**, and the tag manager says **Delete tag** or **Merge tags**. **Reset Appearance**, **Reset Motion** and **Reset Waveforms** act at once and offer **Undo**, with no question first. A submenu opened near the bottom of the window lines its bottom up with its entry instead of covering the menu (DEC-267).
- When CuePoint loses touch with its background process, an action that fails says so in one sentence ("CuePoint lost touch with its background process. Nothing was changed.", or "…partway through. Activity shows what was done." for work already started) instead of "fetch failed". A feature that only works in the desktop app says "This needs the CuePoint desktop app."
- **Clearer themes.** Every built-in theme now keeps its panels, borders, greyed text, buttons and status colours readable against each other: Retro 16's panels and borders show again, Classic and Club neon's raised panels stand out, white on Neo dark's buttons is easier to read, and Muted's warnings are yellow, not the accent's amber. Custom themes follow the same rules (DEC-253).
- **One look for buttons, badges and menus.** Greyed buttons are flat and readable instead of faded, status badges have a thin coloured border instead of a shadow, dialog close buttons and menu arrows are drawn as pixel icons, and a highlighted menu item looks like a selected row (DEC-255).
- **Calmer lines and text.** Lines between areas are one thin line everywhere, focus rings and links each have one colour, labels are no longer in capitals, and loose text is the same size as the rest of the page. Settings marks the section you are reading even with motion off (DEC-260).
- **Every page has the same header and controls.** Keys, Statistics, Settings and Discover's artist, label and similar pages use the shared page header, every dropdown has the same look and greys when unavailable, and arrows, crosses and repeat marks are pixel icons everywhere (DEC-294).
- Discover's banner says **Sign in to Beatport** (or **Sign in again**, also when Beatport refused the token) with the button beside it, where it said Open Settings. Settings → Beatport lost its "How do I get a token?" help.
- The Camelot wheel (header and Keys page) is drawn as smooth wedges with even gaps.
- **The key wheel's labels have room.** Key names sit clear of the wedge edges, with the track count a little smaller beneath them.
- **Space plays and pauses after a click.** Space now plays or pauses unless you are typing, a dialog or menu is open, or you Tabbed to the control. Clicking Next and then pressing Space pauses instead of skipping again, and Space works after clicking the waveform. The player bar and the queue can no longer be drag-selected.
- The player bar's waveform sits centred between the controls on either side of it.
- **Quieter look.** A selected row now shows a lighter fill with a thin accent bar on its left, in every list, instead of a heavy frame; the frame only appears while you move with the keyboard. Buttons, menus, dialogs and the search box lose their bevels and black drop shadows: buttons keep the pixel font at one height with a thin border, and tabs are underlined instead of boxed. The player bar keeps its look (DEC-241).
- **Charts no longer say "Point at or tab to a bar to read it."** A bar's name still shows when you point at it or reach it with Tab.
- **Collections left the sidebar.** Collections live in the Library's left pane, where they always were; an old link or a remembered Collections page opens the Library (DEC-244).
- **The Collections pane is quieter.** An empty tree says "No Collections yet", and the Rename, Duplicate, Delete and Export bar appears only when you select a Collection, Set or folder (DEC-245).
- **Track details is compact.** One row of small buttons (Play, Play next, Queue, Similar, Folder), the favourite heart beside the stars, and Yours folded until you open it, with a short summary on its heading. Hover the stars to see where a rating comes from (DEC-246).
- **The Export to Rekordbox dialog leads with a summary** of tracks, changed values and playlists. Warnings that change the result stay in view; the rest, including the playlist ticks and key notation, is under **Details** (DEC-247).
- **First steps is a small chip** beside the Library heading ("First steps 2/4") instead of a big button above the filters (DEC-248).
- **Prepare's entry buttons are on the selected row.** ↑, ↓, Chapter here, Repeat after and Remove sit at the right end of the selected entry's row instead of under the header, and none shows until an entry is selected. The line under the header reads "32 tracks · 19 warnings" (the planned time once you plan one), and the transition caption keeps the keys, the tempo change and one warning with Accept (DEC-249).
- **Correct replaces Accept and Apply.** Correct accepts the match and updates the values you ticked (BPM, genre, label, year) in one step, with one **Undo** that appears only when something changed. The **Key** tick is off until you turn it on; it only appears when you had set a key of your own, and ticking it replaces yours with Beatport's. The old "In" menu is gone from Match: choose a search in **From** (DEC-251).
- **Clean's tabs have no introduction line.** The tabs are Match, Fix values, Missing files, Duplicates and Health (DEC-251).
- **No hidden filters in the Library.** Choosing All tracks, a playlist or a Collection after opening the Library from a link (Similar tracks, a Health count, an Artist page) kept the link's filter but dropped its chip, so the table showed fewer tracks with nothing saying why. The chip now stays, and removing it shows every track.

- **No Keychain question unless you sign in.** On a Mac, CuePoint now touches the Keychain only to keep or read a Beatport sign-in, so a launch without one never asks for it. Before, every launch asked, and where macOS needed you for that (no login keychain) the app froze until you answered.

- **Short windows start without the zoomed waveform.** Until you choose, a window under 700 px of content hides it; the default window keeps it, and the bar button brings it back (DEC-257).
- **The zoomed waveform dims while paused.** The player bar's volume slider is a little shorter to make room for the new waveform button (DEC-257).

- **One word for each idea.** The app, the menus and the guide now say Rekordbox file (not export or collection) for what you import, Save to files, Undo, Correct and confirmed, Mark OK, Sign in to Beatport, — and not set for a missing value, and dig for a Discover search; "token" appears only in the pasted-token fallback, and a test keeps the old words out (DEC-295).
- **Check for changes with nothing new shows a toast.** When the Rekordbox file has not changed, "rekordbox.xml has no changes" appears instead of a dialog to dismiss (R3-11).
- **The Library pane is easier to read.** Folders step in one arrow width per level with a faint guide line and brighter, semi-bold names, counts sit in a right-hand column and long names end in "…" (hover for the whole name), and Collections and Playlists share one header style (fold arrow, title, "+ New" or "from Rekordbox"). The Rename, Duplicate, Delete and Export bar stays at the bottom, dimmed with its reason when nothing is selected. The pane starts at the top with no blank band.
- **The Library header shows where you are.** A line above the title always names the path ("Library", "Playlists › Gigs 2026 › Summer", "Collections › Gigs › October"), so the page no longer moves when you pick a playlist. Selecting a Rekordbox playlist folder says "Gigs 2026 is a folder" and asks you to pick one of its playlists, or says the folder is empty, instead of calling it an empty playlist.
- **Getting started has one layout.** Every step has its words on the left and one picture on the right, the dots sit in the footer, the dialog keeps one height, and **Skip** stays on every step (dimmed on the last). The pictures use CuePoint's pixel font, fit their text, show three window dots and say Rekordbox where the captions do.
- **One wording and one empty page for importing.** The buttons and titles say "Import a Rekordbox file…" and the help link "How do I get one?" everywhere. Clean, Keys, Statistics, Discover and Prepare show the same block before a library is imported (page icon, "No library yet", one line on what the page does, the import button), and only one violet Import button shows at a time.
- **Picked options look picked.** A ticked box shows its pixel tick and a picked option shows a violet square inside its box, in Settings, Discover and the dialogs.
- **Tabs, fold arrows and pickers match.** Tabs inside a page (Track details, Keys' Wheel | List, Clean's second row, Prepare's Suggestions | Library) are one framed strip with the picked part filled, every section that folds uses the same chevron, Statistics' column headers share one size, and the pickers beside a page title are sized to their longest name with the text on the left. Search boxes too narrow for their hint say "Search…".
- **Clean's Missing files and Duplicates line up.** Both bars use the app's font, Missing files says when it last checked ("Checked today, 4:42 PM") and both show the same empty block. Past searches with nothing yet shows that block too ("No searches yet" and a Go to Playlists button), with no search box until there is something to search. In Playlists, "In your files" says "Not yet" until a sync writes some of a playlist's tracks.
- **Clean's Review header fits.** The title keeps the playlist name and moves the counts ("271 tracks · 12 not found") to the line under it, and the column is headed "Beatport" with "Beatport match" in its hint.
- **Discover's New dig has no repeated heading.** The tab is the heading and the sign-in banner sits under the tabs with the usual gap. A dig's table numbers its first column "#", a chart without a cover shows the shared cover placeholder, and in Results the open dig's card is the heading, with its details under it, instead of saying the dig's name twice.
- **Keys' Sources is as tall as the wheel** and its rows use the Library tree's steps, icons and counts with a tick box in front. The Camelot wheel on the Keys page uses each key's color (brighter for fuller slices) when **Color keys** is on, as the pop-up wheel does, and opens from the player bar just above the bar, or beside the key in Track details.
- **Prepare's side panel fits.** The insert line wraps to two lines, Suggestions shows **Title** and one **Fit** column (the full reason is in its hover hint) with no sideways scroll, and the Set table's last column clears the scrollbar. A chapter's **Edit…** sits right after its name and no longer scrolls the Set sideways.
- **Pages keep their headers when narrow.** With the queue or Track details open, or in a 1,024-wide window, the title always shows, the picker shrinks with "…", and the buttons wrap to a second line. Prepare and Statistics never scroll sideways.
- **Track details' tabs share one look.** Beatport, Where and Yours use Overview's labelled rows with no frames or fills, the stray sideways scrollbar is gone, and Play, Queue and Similar are standard buttons in one row. Statistics' tabs each remember their own scroll place, and Health's "Not synced to files" gets its green-outlined mark.
- **Smaller text and control fixes.** Every delete button is red (alone on the left of a dialog footer), the Columns window moves rows with ↑ and ↓, Activity writes times like "4:58 PM" with curly quotes and no repeated Set name, the Shortcuts note about Cmd is gone, and the sentence-case places left over now read "Not found", "Sync Whole library to files…", "Reset appearance", "Reset privacy" and "Import a Rekordbox file…". The keys' ♭ and ♯ are drawn in CuePoint's pixel font.
- **The Sync window's numbers agree.** Each ticked row counts the files that field will change, and the button reads "Write 17 files", or "Nothing to write" with its reason when every ticked row is 0. A note such as "WAV files are skipped" sits above the buttons.
- **Dialogs come in three widths.** Small for a question (Delete, New Set from), medium for a form (Edit values, Export, Chapter, Sync, Custom theme) and large only for tables and lists (Columns, Shortcuts, Activity).
- **The engine banner says what restarted.** When CuePoint's background part stops, the top banner reads "CuePoint stopped working in the background. Starting it again (1 of 3)…" with "Library loaded at 5:17 PM" after it, and the status strip stays quiet while it shows.

### Fixed
- **Export to Rekordbox takes the first click.** The Export button no longer greys out for a moment when CuePoint rereads your Collections in the background, which could swallow a click right after choosing where to save.
- **A Mac update this Mac cannot run is set aside cleanly.** When a new version needs a newer macOS, CuePoint now says so and keeps the version you have, instead of reporting a failed download and fetching it again at every check. Its download folder, and an installed update's leftover copy, are deleted again: inside the app they could not be, because the delete stopped at the app's `app.asar` archive.
- **The "Matching 18 tracks on Beatport." message closes by itself** when the match ends, instead of staying in the corner until you close it.
- **The Tags window with no tags** shows one empty message instead of a cut-off second column and a sideways scrollbar.
- **The Library pane no longer pushes All tracks far down** when the toolbar grows (a small window, the queue open, Add filter open).
- **Sidebar:** hovering a page link no longer shows a sideways scrollbar.
- **Prepare:** Track details follows a track you click or play in the Library or Suggestions picker, not only the Set table. Ctrl+A and Esc work in the Set, and headings that cannot sort no longer look clickable.
- **Keys:** the 10A and 10B chips no longer run into the key's name.
- **Lengths** over a minute no longer round up to "2:60".
- **Library** header no longer says "0 tracks" for a moment after an import.
- **Settings:** the side menu highlights the page you are on after you click Playback.
- **Discover:** the artist page's Your tracks table is no longer drawn two pixels tall; the selection count is shown once.
- **Lists:** Shift-click no longer paints a text selection; the Library's Rating column shows the effective rating; text on a chip is readable in every theme; the player and search show a key's Camelot code, not a raw "Am"; two confirmation prompts that used the system dialog now use CuePoint's own; Ctrl+I works on macOS.
- **Every Match button stayed greyed after you left Clean during a match and came back.** Pages stay alive behind the one you are on, and the one that was hidden lost track of the match it had started, so Match looked "running" for good with no way to start another or to stop it. Clean now reads what is running from the engine, so the buttons, the line at the top and Stop are right on return.
- **Matching finds tracks again, through your Beatport sign-in.** Clean's match now searches Beatport's catalog with your signed-in account instead of Beatport's website and DuckDuckGo, which Beatport blocks. A track whose search failed is stored as a search error (`search_failed:signed_out`, `rate_limited`, `blocked`, `timeout`, `network` or `unavailable`) rather than "Not found", the log says why in one line, a refusal pauses further searches for a while so the rest of the playlist fails in seconds, and a new sign-in clears it. Without a sign-in, the website path is still tried.
- **A selected table row draws one accent bar, not one per column.** In Clean ▸ Past searches the purple bar was drawn at every column edge of the opened row; it is now at the row's left edge only, and a test keeps any table from doing it again.
- **Discover no longer stalls on a long dig.** A dig's table, and the table on an artist or label page, grew to the height of all its rows and drew every one of them (1,481 rows took seconds on each click, and slowed the pages opened after it); they now draw only the rows in view. Opening Discover also keeps the count of tracks that need artist info until your library changes.
- **Clicking the player bar's waveform lands exactly.** The playhead goes straight to where you clicked and no longer flashes back to the old spot first, and clicks are no longer rounded to the half second. Arrow keys on the focused bar step 5 seconds.
- **The zoomed waveform no longer jerks when you pause.** It eases to a stop instead of snapping back and then nudging forward, and starts again without a hop when you resume.
- **Beatport sign-in now finishes.** On some computers (seen on Windows) the sign-in window stayed open after you signed in and CuePoint never took the sign-in. CuePoint now accepts the token Beatport's own site holds for you, tries again when Beatport's check answers oddly instead of giving up, checks once more when you close the window, and closes the window even if the page asks it to stay. A new `beatport-signin.log` next to CuePoint's other logs says how each sign-in went; it holds no password or token (DEC-254).
- **Dragging tracks into a Set.** Drop anywhere in the Set table, including the space below the last row and an empty Set's whole area: the Set is outlined and says where the tracks will go, a line shows the spot, and dragging several rows shows "3 tracks". Draggable rows have a grip (DEC-243).
- The Play button showed Play while music played after you switched tracks during playback, or after a track ran on into the next one.
- The key in the player bar's track line sat lower than the words around it.

## [1.0.0-test.3] - 2026-10-12

### Changed
- A test version for checking that CuePoint updates itself when you quit: an installed 1.0.0-test.2 downloads this one and installs it when you quit instead of choosing Restart now.
- **The Mac icon looks native.** On macOS it is now a rounded square like the apps around it, instead of a square tile that macOS put inside a grey box. Windows and Linux keep the square tile.
- **Scrollbars match the theme.** Every list and panel has a narrow, square scrollbar in the theme's colours, in place of the system's grey bar. It lightens under the pointer and takes the theme's accent colour while you drag it.

## [1.0.0-test.2] - 2026-10-10


### Added
- **Track tables work from the keyboard.** Up and Down select the previous or next track, Shift with them extends the selection, and Home, End, Page Up and Page Down jump. Ctrl+Space adds or removes the focused track (on a Mac, Cmd-click does: Cmd+Space is Spotlight), and Ctrl+A selects all where the table has a Select all. Enter does what a double-click does in the Library, Keys, Similar, Discover's Library half, and Prepare's source list (play), selects the focused row alone in Discover's Beatport tables, and edits the time in Prepare's Set table. The table scrolls to keep the track in view. Mouse selection is unchanged, except that Enter and Shift+F10 now act on the last row you clicked, including a Shift-click. Clean's review queue keeps its own keys. In Discover's tables, Shift+Down now keeps extending past the second row.

### Changed
- A test version for checking that CuePoint updates itself: an installed 1.0.0-test.1 offers this one, downloads it and installs it when you restart or quit.
- **Similar tracks' Open in Library brings the suggestions.** It opens the Library on the track you are comparing with and every suggestion shown, or only the ones you selected, under one filter, **Similar to “<track>” (N tracks)**, removed with its × like any other. Such a list cannot be saved as a Smart Collection; the Library says to add the tracks to a Collection instead.

### Fixed
- **On Windows the engine no longer shares its port.** It could bind a port another program was still listening on, and Windows then handed some of the app's requests to that program, where they waited unanswered. The engine now refuses a port in use on Windows, as it already did on macOS and Linux.
- **The app's pixel font is bundled.** CuePoint no longer asks Google Fonts for Pixelify Sans each time it starts, so it looks the same offline and sends nothing to Google (DEC-232).
- **Waveform analysis no longer stalls for 5 minutes on one track.** The bundled player's decoder could hang for good while writing its log, an upstream mpv bug (a lost wake-up in its log writer), and the analysis waited out the 5-minute limit on that track. A decode that stops making progress for 30 seconds is now stopped and the track decoded again; it is marked as timed out only if every try hangs (DEC-229).

## [1.0.0-test.1] - 2026-10-10

### Added
- **CuePoint updates itself.** On Windows and Mac it checks GitHub at launch and every 4 hours, downloads a newer version in the background, and shows **CuePoint X is ready** in the status strip: **Restart now** installs it, **Later** installs it when you quit. **Settings > About & updates** has **Check for updates**, and **What's new** shows what changed, once after an update. Linux shows **CuePoint X is out** with a download link, as does a Mac whose app cannot replace itself. Both Mac chips are covered (an Intel build running on Apple Silicon is offered the Apple Silicon one). An update installs only after CuePoint has finished closing; if closing takes over 5 seconds it installs at the next quit. If an install does not take, CuePoint says so the next time it starts. Starting CuePoint a second time brings the first window forward instead of opening another copy, and links in release notes open only for GitHub and the CuePoint site. Test versions (`X.Y.Z-test.N`) are installed by hand and take newer test or normal versions; normal versions only normal ones. See [Updates](../user-guide/updates.md) and the [privacy notice](https://github.com/stuchain/CuePoint/blob/main/PRIVACY_NOTICE.md).
- **Prepare's chapter buttons work from the keyboard, and Discover has the Library's selection bar.** Edit, up, down and delete on a chapter's heading are reached with Tab, and Enter on one presses it. An artist's or label's "Your tracks" and the Similar tracks page replace "Actions…" with Play, Explore (and More on the first) in the bar the Library uses, always shown and grayed out until you select tracks; right-clicking a row shows the same groups, Play's entries first, then Explore ▸ and More ▸. Similar tracks has an Open in Library button.
- **Every kind of motion is built, each behind its own switch in Settings > Motion.** Buttons,
  checkboxes and stars press; hovered and focused things step; rows you pick up and drop lift and
  settle; badges, tabs and Track details sections change with a short step; dialogs, menus, the
  search results, toasts and the Track details panel step in and fade out (a closing one takes no
  clicks, so what is behind it takes them at once); a new page steps in while the shell stays still;
  a pixel spinner and pulsing placeholder rows show loading; a search result glides into its Library
  row; a refused time shakes and new search results and finished
  tasks pulse; and in Settings the link for the section you are reading follows the scroll. Moves
  step in whole pixels at every size and fades stay smooth. Reduce motion still stops everything,
  and a kind turned off hides nothing. Track tables never animate while they scroll; the
  scroll checks with every kind on show no long task over 50 ms at 1x or 1.5x
  (see [Performance](../user-guide/performance.md)).
- **A first-run guide that gets you to a matched library.** Five screens: what
  CuePoint does, how to get your collection out of Rekordbox (**Show me how**),
  **Import your Rekordbox collection...**, **Match tracks...**, and where
  everything is, with pictures drawn in the app's pixel icons. A click outside it
  no longer ends it, and Esc closes it without marking it done. **Help > Getting
  started** always opens it at the first screen. **First steps** (import, match your tracks, play a
  track, add your Beatport token) tick as each becomes true: a list on the empty
  Library, then one entry on the Library's notice line (**First steps: 2 of 4
  done**) that opens the list, until all four are done. If you update from an earlier version, a single
  note, **What changed**, tells you the app is now Medium size (1.5×) and that keys
  now come only from Beatport, with how many of your tracks have a key.
- **A Keys page.** A new page after Library and Collections shows which keys your
  playlists, Collections and Sets hold. Tick the sources (the whole library to start),
  and the Camelot wheel writes each key's track count on it, darker for more, beside
  a list of the same counts in Camelot order with **No Beatport key** on its own
  line. Click a key (Ctrl+Click or Shift+Click for several) to see its tracks in the
  usual table with the Library's buttons; **Show keys that mix with 8A** lights the
  keys that go with it, and **Open in Library** and **Save as Smart Collection…**
  carry the choice on. The Library's Key list gains **See these on the Keys page**.
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
- **The Library's actions are buttons you can see.** A toolbar above the table (one
  line when there is room, two at the default window with Track details open) holds
  the selection bar, always there: **Play ▸**, **Organize ▸**, **Explore ▸**,
  **Beatport ▸**, **Fix ▸** and **More ▸**, then **Clear selection**, with the
  right-click menu showing the same groups as submenus. With nothing selected the buttons are
  dimmed and say "Select tracks first". **Beatport ▸** and **Fix ▸** open Clean with
  the selected tracks, so **Accept match** and **Reject match** now live in Review.
  The track count ("1,204 tracks · 3 selected", or "Showing 240 of 12,000 tracks"
  while a search or filter narrows the view) and **Columns…** share the toolbar, so
  the table shows more tracks: four whole rows in the default window. Over the
  Collections tree, **New** with **Collection**, **Set** and **Folder** name what
  they make, and a bar under it, always there, holds
  **Rename**, **Duplicate**, **Delete**, **Export to Rekordbox…** and, for a Set,
  **Open in Prepare** and **Save set list…**. **Alt+Up** and **Alt+Down** move a
  Collection's selected track. A change to many tracks now asks "Change 4,213
  tracks?"
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
- **Prepare can order, chapter and time a Set with buttons and typing.** The line
  under the header has **Move up**, **Move down**, **Start a chapter here**,
  **Repeat after** and **Remove** for the selected entries (Alt+↑, Alt+↓ and
  Delete do the first, second and last), disabled with "Select an entry" until
  one is selected; a chapter's heading has **Edit**, **↑**, **↓** and **×**.
  **Mix in** and **Mix out** are typed in the table (click the cell, or Enter or
  F2), Enter or Tab saving and moving on, and a time CuePoint refuses is said on
  the header's line by name. The transition strip's caption reads the keys and
  tempos ("8A → 9A · next key up · 124 → 126 BPM (+1.6%) · Out 5:30 → In 0:45"),
  with a warning and **Accept** at its end. A track with no Beatport key is not a
  warning: the header says "3 entries have no Beatport key" with **Match
  tracks…**
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
- **Edit values keeps what you type as it opens.** The dialog cleared its form just after it was
  drawn, so a value typed in that moment (from Fix ▸ Edit values…, which opens it at once) was
  wiped and Apply asked for a field. The form is now cleared before the dialog is shown.
- **Discover's Results tab no longer squeezes a past search's card until its "Delete this search…" button covers the text.** At the default window and size the runs column was about 180 px wide. It now keeps a minimum width, the button sits on its own line under the card, and long text wraps (the summary also shows in full on hover).
- **Opening a database connection no longer breaks another thread's `join()`.** Each connect to the
  library database or the waveform store closed ended threads' connections by asking every owner
  `is_alive()`. Before Python 3.13 that briefly takes the thread's own lock, so a join of that same
  thread on another thread could fail with `AssertionError` and then `release unlocked lock`. This
  happened intermittently on the Windows CI runners. The check now reads `threading.enumerate()`.
- **The engine answers while a background job computes.** A search, a browse or a Set edit could
  take seconds, and more than 5 s on Windows, while a waveform analysis or a match ran: each
  request waited hundreds of times for the busy thread to hand back Python's interpreter lock. The
  lock is now handed over within 0.5 ms (DEC-221).
- **A search during a match answers sooner still.** Each request checked that the library's
  schema was current, four times, and opened its own database connection: 16 of a search's 22
  statements, each a wait for a busy job thread. The schema is now checked once (again after a
  restore), and a request takes over a connection an earlier one finished with. The engine also
  lets the app close each connection first, so its port no longer collects closed connections
  that on macOS could make a new one take a second to connect (DEC-223).
- **Scrolling a long track table is smooth on slower Macs again.** Three things made one frame of
  a fast scroll run past 50 ms on the Mac runners, most often at the default 1.5× size. On a
  display that is not high-resolution, a track table scrolled on the main thread, and every row on
  screen became a layer of its own that had to be sorted out again as each page of rows came in; the
  table now scrolls on the compositor, which took the work of a scroll down by about a fifth. Every
  row also carried the hover bar's box, hidden off its edge; the bar is now drawn only on the row
  under the pointer, and not while the table scrolls (it still steps in the same way). And with the
  Waveform column shown, a page of rows getting their pictures painted every canvas in one go;
  waveforms are now painted a few at a time, a few milliseconds per turn.
- **The Library's toolbar keeps to two lines on Windows.** In a 1,280 × 800 window at 1.5× with Track details open, the row above the table took a third line on Windows (and the table lost a row), because it fit on Linux by about 10 pixels. Its two lines are now laid out on purpose, the six groups on the first and Clear selection, the count, Select all and Columns… on the second, with room to spare on every system; if the count does not fit it is cut short rather than pushing a button onto another line.
- **A dialog opened while another is closing is read out by its own title.** Every dialog shared one title id, so while one played its exit the next one took the closing one's name for screen readers.
- **Checking Rekordbox for changes, and refreshing, always come back.** Now and then the check or
  the refresh finished but the Library never heard it: the review never opened, or its button kept
  spinning. The last update about a task could be lost when the task ended at the moment the one
  before it was being sent.
- **Importing an export where Rekordbox gave a renumbered track's old ID to a new track works.** The
  import used to stop with "UNIQUE constraint failed" and change nothing.
- **View > Size > Smaller (Ctrl+-) or Bigger (Ctrl+=) pressed twice quickly steps twice.** The second
  press used to step from the size before the first and land on the same size.
- **Moving a Set's entry twice in a row puts it where you meant.** A second Move up or Move down (or Alt+Up and Alt+Down) pressed right after the first used to be worked out from the order before the first one, and could move the wrong way. It now waits for the first and uses the order you see.
- **Typing a value into the Library filter no longer closes the app on a Mac.** The suggestion list under
  the filter's Value field and under Track details' tag field was the browser's own pop-up, which crashed
  the app on macOS. It is now a list inside CuePoint's window, with the same suggestions: Up and Down
  move through it, Enter or a click chooses, Escape closes it, and it opens over the page without moving
  anything.
- **The page fits a Windows window's real size (1,264 × 735 inside 1,280 × 800).** The Library's toolbar
  keeps two lines with Track details open, the Collections pane no longer scrolls sideways or loses its
  sixth row, and Settings' Reset to defaults and Turn all off buttons wrap instead of running past the
  page at the largest text size.
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
