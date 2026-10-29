# Your library

CuePoint keeps its own copy of your Rekordbox file. Import a Rekordbox file
once and CuePoint holds your tracks, your playlists and what is in them, so
everything else it does can start from your actual music instead of asking you
for a file every time. The Library page is also where you browse it: playlists,
filters, sorting and a track's full detail.

Open **Library** in the sidebar.

## Importing a Rekordbox file

Until something is imported, the Library shows only its header and **First
steps**, a short checklist. Its first step, **Import a Rekordbox
file**, has **Import a Rekordbox file…** and **How do I get one?** beside it, and the
hint under it says: in Rekordbox choose File → Export Collection in xml format,
then import that file; nothing in Rekordbox is changed. The steps are:

1. In Rekordbox, use **File → Export Collection in xml format** and save the
   file somewhere you will find it again. Downloads is fine.
2. In CuePoint, open **Library** and click **Import a Rekordbox file…** in the first step.
3. Pick the file. CuePoint reads it in the background — you can keep using the
   rest of the app, and the strip along the bottom shows how far it has got.
   Nothing in Rekordbox is changed.

When it finishes, the page shows what CuePoint now holds and which file it came
from. **It remembers that file**, so checking for changes later takes one click.

### The Library header

The header says what the table below is showing. Its title is the playlist,
Collection, Set or Smart Collection you opened, or **All tracks**. A line above
it is always there and names where it lives (*Library*, *Playlists › Gigs 2026 ›
Summer* or *Collections › Gigs › October*), so the page does not move when you
pick something. Under the title, one line gives what that holds: the
number of tracks, their running time, the BPM range and the number of keys,
for example *306 tracks · 21h 4m · 120–134 BPM · 14 keys*. The search and the
filters do not change that line; the toolbar above the table counts what they
leave.

Beside the title is the file the library came from, as its name and a badge:
**Up to date**, **Changed in Rekordbox**, **File not found** or **Not checked
yet**. Point at the name for the full path and when CuePoint last read the
file. Two buttons sit on the right: **Check for changes** (it turns
primary when the file changed or went missing) and **Export to Rekordbox…** —
see [Exporting to Rekordbox](rekordbox-export.md). Their words are never cut:
in a narrow window or at a large size the badge and the First steps chip
beside the title go first, and the title row wraps before a button shrinks.

To switch to a different Rekordbox file, use **Change file…** in
**Settings → Rekordbox**, or **File → Import a Rekordbox file…** (**Ctrl+O**).

**After an import**, a note under the header says CuePoint is checking that your
music files are where Rekordbox says, reading their artwork and drawing each
track's waveform, and that you can browse and play while it works. A "Now:" line
shows the step and how far it is, for example *Now: drawing waveforms, 1,204 of
12,000*. Close it with its **×**; it goes by itself when the work ends. When
that work is done and no track has a Beatport key yet, the same line says so.
Matching is done in [Clean](clean.md#match), or from **Beatport ▸ Match
tracks…** on a selection.

A 50,000-track collection takes about eleven seconds to import. See
[Performance](performance.md#the-library) for the measured numbers.

### If the file is not right

CuePoint refuses a file that is not a Rekordbox file rather than
importing an empty library and telling you it worked. If you exported a single
playlist instead of the whole collection, the file has no collection in it and
CuePoint will say so — export again with **File → Export Collection**.

## Browsing your library

Once something is imported, the Library page **is** your collection: the
playlists down the left, the tracks in the middle, and everything CuePoint
knows about whichever track you clicked in Track details on the right.

Nothing here changes your music. The Library page reads.

### Finding tracks

- **Click a playlist** on the left to look at just that playlist. A folder is not a
  playlist: picking one says *Gigs 2026 is a folder* and asks you to pick one of
  its playlists (an empty folder says *This folder is empty*). **All tracks** goes back to the whole library.
- **Type in the search box** to narrow to matching titles, artists, albums and
  labels. It also understands keys and tempos: "8A" finds the tracks in 8A (so
  does "A minor"), and "124" finds the tracks at 124 BPM, from 123.5 up to 124.5
  (type "124.5" to ask for exactly that). A row found that way says so under its
  title — "Key 8A" or "124 BPM" — and the same appears in the search from
  anywhere (Ctrl+K). It searches whatever you are looking at, so a search inside
  a playlist stays inside that playlist.
- **Use the quick filters** beside the search box: **Key ▾** (the keys in what
  you are looking at, in Camelot order, with how many tracks each has, and **No
  Beatport key**), **BPM ▾** (a From and To range) and **Genre ▾** (the most
  common genres). Each choice becomes a chip on the same row; choosing a second
  key makes one "any of" chip. The quick filters are on the Library table only.
  When no track has a Beatport key yet, the Key list says *No tracks have a
  Beatport key yet. Keys come from matching.* If a Key filter finds nothing,
  the line above the table says the same. Matching is in Clean, or **Beatport
  ▸ Match on Beatport…** on a selection; the Library has no Match button of its own
  beside the filters.
- **Add a filter** for anything more specific — BPM between 124 and 130, genre
  is Techno, comment contains "promo". The fields are grouped (Track, Your notes
  and ratings, Rekordbox only, Beatport match, Files, Where it is). Filters
  stack, and the bar says how many tracks are left after them. The row scrolls
  sideways when there are many chips and says "+N more"; **Clear all filters**
  removes them all. A filter another page opened, such as an artist (**Beatport
  artist is …**) or **Similar to “…”**, is a chip like any other.
- **In playlist** (under *Where it is*) keeps tracks that are in any of the
  playlists, Collections or Sets you pick. A Smart Collection cannot be picked:
  it is a rule, not a list, so CuePoint says so. Saving a Smart Collection while
  a playlist is open adds an In playlist rule, so the saved view keeps its
  playlist.
- **Click a column heading** to sort by it; click again to reverse it.

**Filter by one artist or one label, however it is spelled.** Two filters look
for an artist or a label rather than for text:

- **Credited artist** finds the tracks an artist is credited on — as one of
  several artists, as a featured artist, or as the remixer. "Credited artist is
  B" finds "A, B" and "B feat. D", and not "Bob B", which **Artist contains B**
  would. Credits are split at commas and at "feat.", "ft." and "featuring", but
  not at "&", "and", "x" or "vs", so "Above & Beyond" stays one act.
- **Label, any spelling** finds a label's tracks whatever the spelling:
  "Nightfall Audio", "NIGHTFALL AUDIO" and "Nightfall-Audio" are one label. It
  reads your own label when you have set one, as the Label column does.

Both ignore capitals, accents on letters like é and Â, and punctuation, and
both offer the names in your library to choose from. The first time CuePoint
starts after this update it takes a few seconds to index your artists and
labels — **Getting artist and label pages ready** in the status strip — and until then
these two filters may find fewer tracks than they should.

**Beatport artist** and **Beatport label** find an artist's or a label's tracks
by its Beatport id, the number at the end of its page address on
beatport.com. A track counts when its confirmed Beatport match credits that
artist or label, and so does a track that is not matched yet when its artist or
label name has been tied to that id by the tracks that are, and to no other
artist of the same name. They need CuePoint to have read your matched tracks'
credits from Beatport, which needs you to be signed in to Beatport, and until it has they
find nothing.

A playlist opens in the order you arranged it in Rekordbox, which is what a set
list is for. The whole library opens by artist. Sorting a playlist by anything
else and then going back to **All tracks** does not carry that sort over.

### When a table is empty

An empty table says why and offers the next step as a button:

| What you see | Button |
| --- | --- |
| **No tracks match this search.** | **Clear the search** (or **Clear all filters**, or **Clear search and filters**, whichever is narrowing the view) |
| **Nothing matches these rules right now.** (a Smart Collection) | **Edit the rules**, which opens **Add filter** |
| **This playlist is empty.** Playlists come from Rekordbox, so add tracks there | **Check for changes** |
| **Gigs 2026 is a folder.** Pick one of its 4 playlists in the list (or **This folder is empty.**) | none |
| **This Collection is empty.** (or Set) Drop tracks onto it, or use **Add to Collection** | **Browse the whole library** |
| **This Rekordbox file has no tracks in it.** | **Import a Rekordbox file…** |

### Choosing columns

**Columns…**, a small button in the table's top right corner, opens the list.
Nine are shown to start with — the ones a DJ reads — in this order: Title,
Artist, Key, BPM, Length, Genre, Label, Rating and Album. Key and BPM come
third and fourth so they stay on screen with Track details open. If you had
never rearranged the old order, CuePoint moved your saved layout to this one
once, keeping your widths and what you had hidden; a layout you had arranged
yourself was left alone. Fourteen more are there if you want them: remixer, year, plays, date added,
color, bitrate, comment, the file path, four from
[Clean](#clean-in-the-library) — **Match**, **Score**, **File status** and
**Artwork** — **Waveform**, which draws each track's waveform, and
**Loudness**, which says how loud each track is, in LUFS (see
[Waveforms](waveforms.md#loudness)). Turn them on and off, drag a heading to move
a column, drag its edge to resize it. CuePoint remembers all of it.

Rows can be dragged anywhere (onto a Collection in the pane, say), but the ⠿ grip
shows only inside a Collection, where the order of the rows matters.

BPM, genre, label and year show **your** value when you have set one. A
small mark beside the value says so — **B** when it was applied from Beatport,
a dot when you typed it — and pointing at the mark, or tabbing to it, says in
words where the value came from and what Rekordbox has underneath. The Columns
list repeats what the marks mean. A key is marked only when you typed it: a key
from Beatport is the track's key, not an edit.

**Key is Beatport's key.** A track's key is the one you typed, or else the key
of its confirmed Beatport match, shown in Camelot (8A) as a small colored chip.
The colors follow the Camelot wheel, one hue for each number, deeper for A and
lighter for B, as in Mixed In Key; point at a chip for the key's name ("A
minor"). The same chips are in Keys, Discover, Clean and Prepare. **Settings →
Appearance → Tables → Color key chips** (on to start with) turns them back into
plain text, and **Keys written as** (Camelot, Musical or Both) changes the
words on the chips ("8A", "Am" or "8A · Am") everywhere, the player bar's key
included; files and exports keep their own notation. Rekordbox's key is never
used, so a track with no confirmed match shows "—" in the Key column (point at
the heading: *Keys come from Beatport matches*), and every
key filter, count, check and export leaves it out. After a fresh import no track
has a key until matching runs: open [Clean](clean.md) and match your library.
The key filter understands every notation, so "Key is 8A" finds a track whose
Beatport key is "A minor".

There is one **Key** field, and it compares keys by what they mean, so 8A,
"A minor" and "Am" are the same. The one that used to be called "CuePoint key"
is **Your key**, and Rekordbox's own is **Key from Rekordbox**, in
the Rekordbox only group; CuePoint uses Beatport's key, not that one.

### Row height

Table rows follow the text size, so more of them fit. **Settings → Appearance
→ Tables → Row density** is **Compact** (the default) or **Roomy**, which gives
each row about a third more air. It applies to every table, and **Reset
Appearance** puts it back to Compact.

### Selecting tracks

Click to select, Ctrl+click (Cmd+click) to add one, Shift+click for a range —
a range works even across parts of a long list you have not scrolled to yet.

**Ctrl+A selects everything matching what you are looking at**, filters and all.
That means *everything*, not just the rows on screen: select-all over a filtered
47,000-track view selects 47,000 tracks. **Esc** lets go. **Ctrl+F** puts the
cursor in the search box.

With the table focused (click it or Tab to it), **Up** and **Down** select the previous or next track and **Shift** with them extends the selection; **Home**, **End**, **Page Up** and **Page Down** jump; **Ctrl+Space** adds or removes the focused track (on a Mac, Cmd+click does); **Enter** plays it. Enter and **Shift+F10** act on the last row you clicked, including a Shift-click. The list scrolls to keep it in view.

The track in the player is marked in the table: its title is in the accent colour, with a small speaker at the start of its row, and a screen reader hears "Now playing". Tracks already played since CuePoint started have their title in a muted colour; that is forgotten when you quit. The same marks show in the Keys, Discover and Prepare track tables.

A toolbar sits directly above the table. With nothing selected it holds only
the track count ("1,204 tracks", or "Showing 240 of 12,000 tracks" while a
search or filter narrows the view) and **Select all**. Select something and
four menus appear, with **N selected ×** (the × clears the selection) after
them. The toolbar keeps the same height either way, so the table never moves
when you select a row. If the count does not fit it is cut short (ending in
"…") rather than pushing a button onto a second line. The count is in the same
figures as the table.

The filter row is always one line. When the window or the text size leaves it
too little room, its buttons fold away in steps: **Tags…** moves into **Add
filter**'s menu, then **Select all**, **Clear all filters** and **Save as Smart
Collection…** into a **More** menu at the row's end (the count stays, as "240
of 12,000 tracks"), then **Add filter** into **More**, then **Key**, **BPM**
and **Genre** into one **Filters** menu, and last **More** into **Filters**.
They come back as soon as there is room.

| Menu | Holds |
| --- | --- |
| **Play ▸** | **Play**, **Play next**, **Add to queue**, for the selected tracks in the order the table shows them |
| **Organize ▸** | **Add to Collection…**, **Add to Set…**, **New Set from these…**, **Remove from "name"** (inside a Collection), **Add tag…**, **Remove tag…**, **Rate ▸**, **Favorite**, **Remove favorite**, **Copy**. See [Organizing your library](organization.md) |
| **Beatport ▸** | **Match on Beatport…** and **Review these matches** open [Clean](clean.md) with the selected tracks; **Copy Beatport values…** opens its dialog right here |
| **More ▸** | **Similar tracks**, **Artist page** and **Label page** (see [Discover](discover.md#artist-and-label-pages); with several tracks selected they open the first one's), **Edit values…** (its dialog opens right here), **Show in folder** |

The Library has no sync bar. Syncing values into the audio files is done per
playlist, on Clean ([Saving values into your
files](clean.md#saving-values-into-your-files)). Checking that the files are
still there is on Clean ▸ Missing files.

A track's right-click menu is the same on every page: **Play**, **Play next** and
**Add to queue** on its first lines, then **Organize ▸** and **Beatport ▸**
under a small **This page** heading (what only the Library does), and **More ▸** last.
Entries that are greyed say why when you point at them. Use the Tab
key once to reach the toolbar, then the arrow keys to move between its buttons.

**Copy** (in Organize) puts the visible columns, in the order you have them, ready to paste
into a spreadsheet; it is capped at 5,000 tracks and tells you when it hit the
cap. **Show in folder** works for a single track; if its file is no longer where
Rekordbox says it is, it opens the nearest folder that still exists, and says
so. A filter chip that names one artist or label, such as "Credited artist is
Mara Veil", offers **Open page**.

### Track details

Track details opens a moment after you first select a track, and then stays open
while you click around, even with nothing selected. Its **×** closes it; the
**Details** button, last in the page header, brings it back (the button shows only
while the panel is hidden), as does **Ctrl+I**. Closing it yourself on the Library
keeps it closed there until you open it again. When the window is too narrow for the
table and the panel side by side, the panel folds itself; **Details** still opens it.
From the top:

- **A small cover**, or *No artwork* when it has none, beside the title, the
  artists and the label. Each artist in the credit, and the label, is a link to
  their page (see [Discover](discover.md#artist-and-label-pages)).
- With several tracks selected, a line under the title reads "3 selected · Edit
  values…"; **Edit values…** edits all of them, while the fields below still change
  only the track shown.

Track details has no Play, Queue or Similar buttons: play, queue and find similar
tracks from the selection bar or a row's right-click menu, where **Show in folder** is
too.

Under the title are three tabs: **Overview**, **Beatport** and **Yours**.
The panel remembers the tab you last chose and opens on **Overview** the first time.

- **Overview** — a labelled grid of facts: **Key** (the chip, the Camelot wheel
  button beside it, and the key's name; the key chip is itself the button that opens the
  wheel, and resting the pointer on the key's name shows where it came from, Beatport or you; a track with none shows a dash and **Match on
  Beatport**, which opens Clean to match this one track), **BPM**,
  **Genre**, **Loudness** ("−8.4 LUFS"), **Peak** ("−0.3 dBFS") and **Beatport** (how
  the match stands, a link to the Beatport tab), then **In playlists**, **In Collections** and **In Sets**: where the track
  is, each a link that opens it (a Set opens in Prepare), with **Add to…** after the
  Collections to add the track to one. Then **its waveform**, a short strip with its cue points, loops and
  beat grid; when the track is the one playing, a click on it seeks (a track whose
  loudness could not be measured says why under it). See [Waveforms](waveforms.md). At the foot, two sections that
  start folded and stay as you leave them:
  - **Cue points**, from Rekordbox and read-only: every hot cue, memory cue, loop,
    fade and load point, one line each in the order the track plays them, and the
    beat grid's tempo. See
    [Cue points and beat grids](#cue-points-and-beat-grids-come-from-rekordbox--and-stay-there).
  - **From your Rekordbox file** — everything the import captured: remixer, album,
    label, genre, BPM, year, length, rating, plays, color, comment, bitrate, when
    it was added and where the file is. **This part is read-only.** It is what
    Rekordbox sent, and a refresh replaces it.
- **Beatport** — where the track stands with its Beatport match. See
  [The Beatport tab](#the-beatport-tab).
- **Yours** — what you have added in CuePoint: your rating, favorite (the heart
  beside the stars), notes, tags (the **Add a tag** label sits above its field
  and **Add** button), and **Edit values…**, a standard button, for your key, BPM,
  genre, label and year. See [Organizing your library](organization.md) and
  [Your own values](#your-own-values). Under it, **History** — every change to the
  track, and who made it; it starts folded and its heading counts the changes
  ("History · 4 changes").

The facts on Overview, the Beatport tab's fields and History share one grid:
a short label on the left and its value in the same type as the table.

With several tracks selected, the panel shows the last one you clicked, and
**Edit values for 4 tracks…** opens the editor for all of them, right here.

Track details and the Collections list on the left grow and shrink with the text size
(**Settings > Appearance** or **View > Size**), so a bigger size does not squeeze them.
The left pane narrows a little when Track details opens, and a name that no longer fits ends in “…” (hover for the whole name). Ctrl+I hides Track details if you would rather have the width. Double-clicking a
track plays it; see [The player](player.md).

### Large collections

Browsing 50,000 tracks does not load 50,000 tracks. CuePoint fetches what is on
screen and a little either side, so scrolling stays smooth and memory stays flat
however far you go. A row that has not arrived yet is blank for a moment rather
than moving everything around it. See
[Performance](performance.md#the-library) for the measured numbers.

## Refreshing after Rekordbox changes

Your collection moves on: you buy tracks, you rate them, you delete things.
CuePoint does not watch the file, so you decide when to catch up.

Open **Library** and press **Check for changes**.

- If nothing has changed, CuePoint says so immediately. It does not re-read a
  50,000-track file to tell you nothing happened — it compares the file's
  modified time and size against what it recorded when it imported.
- If something has changed, CuePoint reads your Rekordbox file and shows you **exactly
  what a refresh would do** before doing any of it.

The page also tells you, without being asked, when your Rekordbox file has changed since
your last import — that is what **Changed in Rekordbox** means next to the file
name. **Not checked yet** means CuePoint could not tell, so check to be sure.

### What the preview shows

| Line | Means |
| --- | --- |
| New tracks | In your Rekordbox file, not yet in CuePoint |
| Updated tracks | In both, with something different in Rekordbox |
| **Tracks removed from Rekordbox** | In CuePoint, no longer in your Rekordbox file — **these get deleted** |
| Re-linked after renumbering | Rekordbox gave the track a new ID; CuePoint recognized the file and kept everything |
| Tracks whose cues or beat grid changed | Tracks you kept whose cue points or grid are different in Rekordbox |
| New / edited / deleted playlists | The same, for your playlist tree |

Nothing happens until you press the confirm button. **Cancel changes nothing** —
the preview only reads.

### What a refresh deletes

**A refresh deletes the tracks that are no longer in your Rekordbox file, and it cannot
be undone.**

Anything CuePoint has attached to those tracks goes with them: ratings, tags,
play history, and — from a later release — their membership of any Collection or
Set you have built. This is deliberate. CuePoint's library is a mirror of
Rekordbox's, and a mirror that kept tracks you deleted would slowly fill with
things you cannot see in Rekordbox and cannot get rid of in CuePoint.

The preview is there so this is a decision rather than a surprise. It names the
number, tells you what goes with them, and puts that number on the button you
press. If you are not sure, **Cancel** and look at Rekordbox first.

Removing a track from a *playlist* does not delete it. Only a track that has
left your collection entirely is removed.

### Re-numbering is not deletion

Rekordbox sometimes hands out new TrackIDs — after rebuilding a library, or on
some upgrades. CuePoint matches those tracks by their file instead, keeps
everything attached to them, and reports them as **re-linked**. They are not
deleted and re-added, and they do not appear in the removal count.

### When CuePoint cannot tell whether the file changed

If CuePoint says it **could not tell** whether your Rekordbox file changed, check it
anyway — that message means the file's details could not be read, not that
nothing happened.

Very rarely, an export can be edited without its size or modified time changing,
and CuePoint would then say nothing has changed when something has. Re-exporting
from Rekordbox always fixes this, because a fresh export has a new modified
time.

## Five things worth knowing

### What you do in CuePoint stays in CuePoint

**Collections, tags, ratings, favorites, notes and your own values are
CuePoint's, and they are invisible in Rekordbox.** CuePoint reads your Rekordbox file
and never writes to it, so nothing you organize here changes what Rekordbox
shows you. Two things take your work out of CuePoint, and each happens only
when you ask, after a preview: [Exporting to Rekordbox](rekordbox-export.md),
which writes a new XML file with your values and Collections (tags, notes and
favorites stay behind), and [Syncing to files](#syncing-to-files).
See [Organizing your library](organization.md).

### CuePoint checks that your files are still there — and never moves them

After every import and every refresh, CuePoint looks for each track's file where
Rekordbox says it is. The check runs in the background: the status strip shows
**Checking files** with its progress and a Stop button, and the Activity panel
records what it found. It only looks — nothing is read, moved, renamed or
deleted, and CuePoint never writes to your audio files while doing it.

Each track ends up with a **File status** you can filter by in the Library:

| File status | Means |
| --- | --- |
| Present | The file is there and can be opened |
| Missing | Nothing is at that path |
| Unreadable | Something is there but cannot be opened — usually a permissions problem, or a folder where the file should be |
| Not checked | Not checked yet, or Rekordbox has given the track a new path since the last check |

**Last checked on disk** filters by the day a file was last checked.

**An unplugged drive is one line, not thousands.** If every track on a drive is
missing because the drive itself is not there, the Activity panel says so once —
for example *4,812 tracks on E:\, and the drive is not connected*, and CuePoint
does not look for each file on it. Plug the drive in and refresh, and the next
check finds them.

**Fix a moved file in Rekordbox.** The path belongs to Rekordbox: use its
**Relocate** command on the missing track, export again, and refresh in
CuePoint. The refresh brings in the new path and the check that follows it
confirms the file.

A large library on a spinning disk or a network share can take a while to check
the first time; you can keep working while it runs, and stopping it keeps
everything it already checked.

### CuePoint points out possible duplicates — and never removes them

After every import, refresh and match, CuePoint looks for tracks that may be the
same recording. The status strip shows **Finding duplicates** while it looks,
and the Activity panel records what it found. Each group says why its tracks
were put together:

| Grouped by | Means |
| --- | --- |
| File path | One file is listed twice in your Rekordbox file |
| Beatport track | Two tracks were matched to the same Beatport track |
| Artist and title | The same artist, title and mix, with lengths within two seconds of each other |

Filter the Library with **Possible duplicate**, or with
**Why it looks like a duplicate** to see one kind. A track can be in more than one group, for example when a file
imported twice is also the same title twice.

The artist-and-title signal is the one that can be wrong: two different
recordings can share a name. That is why every group names what grouped it. A
plain title and its "Original Mix" count as one mix; an Extended Mix, a
remix by someone else or "Part 2" do not.

**CuePoint never deletes, merges or edits a duplicate.** A track removed in
CuePoint would come back with the next refresh, and the file is yours. If you
want a duplicate gone, remove it in Rekordbox and refresh.

### CuePoint reads your artwork — and never changes it

After every file check, CuePoint reads the picture each of your files carries.
The status strip shows **Reading artwork** while it does, and the Activity panel
records how many files have a picture. Only files the check found are opened.

For a track whose Beatport match you confirmed, CuePoint also knows Beatport's
artwork for that release. It is downloaded only when it is needed, only from
Beatport, and never for a match you have not confirmed. Offline, it is simply not
there — nothing fails.

Filter the Library with **Artwork**, or show it as a column:

| Value | Means |
| --- | --- |
| In the file | The file carries its own picture |
| From Beatport | The file has none, and Beatport's artwork for the confirmed match is used |
| — | The file was read and carries no picture, and there is no Beatport artwork |
| Not read yet | The file has not been read yet where it is now |

A picture is only opened if it is a JPEG, PNG, WebP, GIF or BMP of a sensible
size. Anything else is counted as unreadable and left alone, because a picture
from an unknown file or a website is exactly the kind of thing that should not
be opened blindly.

CuePoint keeps small copies of the artwork for display, never the originals, in
a cache that is capped at 512 MB and is not part of your backups. **Clear cache
now** in the Privacy dialog empties it, as does **Clear cache on exit**; the
copies are made again as they are needed.

**Reading artwork writes nothing to your files.** Adding Beatport's artwork to a
file that has none is an option when you
[sync to files](#syncing-to-files), and it never replaces a picture a
file already has.

### Cue points and beat grids come from Rekordbox — and stay there

An import and a refresh read each track's cue points and beat grid from the
export, the ones you set in Rekordbox. Track details lists them under **Cue
points**:

```
Cues · 2 hot, 3 memory
■ Memory · 0:00.0 · Intro
■ A · 1:04.0 · Drop
■ C · 2:00.0–2:07.5 · Loop · Build loop
Beat grid · 128.00 BPM
```

- A hot cue is its letter, **A** to **H**; a memory cue says **Memory**. A
  loop shows where it starts and ends; a fade-in, fade-out or load point says
  which it is. Times are to a tenth of a second, and the square is the cue's
  color in Rekordbox.
- A grid that changes tempo says **variable**, with the range.
- **They are read-only.** Nothing in CuePoint edits a cue or a grid, and an
  [export to Rekordbox](rekordbox-export.md) never writes one: it leaves every
  cue in your collection exactly as it was. To change a cue, change it in
  Rekordbox, export, and refresh.
- A refresh replaces a track's cues and grid with the file's, and the preview
  counts the tracks whose cues or grid changed, in one line.
- A mark CuePoint does not recognize, or one Rekordbox wrote incompletely, is
  skipped rather than guessed at, and the import says how many it skipped.

**A library imported before this release** has its cues read once from the
collection file it was imported from, the first time CuePoint starts, if that
file is still exactly as it was. The status strip shows **Reading your cue points**
while it does, and Activity records it. If the file has changed since, the
Track details says *Cue points and the beat grid are read from Rekordbox. They
appear after you Check for changes.* and they do.

### One import, for everything

**Everything in CuePoint reads this one library**, so you import your collection
once. [Discover](discover.md), which replaced inCrate, works on it directly;
inCrate kept a separate copy of its own, which nothing reads any more — see
[Where inCrate went](discover.md#where-incrate-went).

## Clean in the Library

Everything the [Clean](clean.md) page knows about a track is visible here too,
and the Clean actions on a track are in the toolbar's **Beatport ▸** and
**More ▸** and in its right-click menu. They open Clean with the tracks you
selected; deciding a match (confirm or reject) is done there, in Review.

### Columns and filters

| Column | Shows |
| --- | --- |
| Match | Where the track stands with Beatport: Confirmed, To check, No match, Not looked up yet or Rejected — and *changed after you confirmed* when a newer search found a different best match than the one you chose |
| Score | The score of the Beatport match the track points at |
| File status | What the last file check found |
| Artwork | The track's picture, or where it would come from |

Each of the first three sorts by what needs you first. The same facts are
filters: **Beatport match**, **Match decided by (you or CuePoint)**,
**Changed after you confirmed**, **Beatport match score**, **File status** and
**Artwork**. A filter whose values are a fixed list offers them to pick from rather than a box to type into.

### The Clean actions

| Action | Does |
| --- | --- |
| Match on Beatport… | Opens Clean's match window with the selected tracks, to look them up on Beatport. A decision you made is kept, and a newer match that disagrees marks the track *changed after you confirmed* |
| Review these matches | Opens Clean's Review on the first selected track, where matches are confirmed or rejected |
| Copy Beatport values… | Opens a dialog here to copy the fields you choose from each track's confirmed match into your values |
| Edit values… (in More) | Opens a dialog here to set or clear your key, BPM, genre, label or year |

Confirming a match changes no value on its own. **Copy Beatport values…** is what copies
Beatport's values, and they become your values — Rekordbox's stay underneath.

### The Beatport tab

Track details' **Beatport** tab says how strong the match is and how it was decided,
in one line ("Strong match · Confirmed automatically"; rest the pointer on it for the
score). Under it a table puts **Rekordbox**'s values beside **Beatport**'s, for the
title, artist, key, BPM, genre, label and year either side has. Where the value in use
is not Rekordbox's (one applied from Beatport, or one you typed), Rekordbox's cell
says **Using** with that value; a Beatport value that differs from the one in use is
marked. A track not looked up yet gets one sentence and **Match on Beatport**. Copying
Beatport's values is done in Review and from the Library's Beatport menu, not here.
**Open in Clean** takes you to the track's side-by-side review, and **Open on
Beatport** to its page there.

### Your own values

Open the **Yours** tab, then choose **Edit values…** to set a key, BPM, genre, label or year
for the track. It is the same editor the Library's **Edit values…** uses, and shows what each
value is now. Choose *Clear mine* for a field to go back. The **Your values**
line under it lists what you have edited, opens by itself when there is
something to list, and offers **Go back** for each: to Rekordbox's value, or for
the key to Beatport's key, or to none.
CuePoint checks every value: a key in classic (Am), Camelot (8A) or short (Amin)
notation, a BPM between 20 and 300 with at most two decimals, a year from 1900 to
next year, and a genre or label up to 200 characters. A value it refuses is
explained in the editor, and nothing is saved.

A key you type is a correction: it beats Beatport's key for that track, and it
stays when a match is rejected. Your values are what the Library shows, sorts and filters by, and what Smart
Collections match. Rekordbox's value is still there: filter with **Rekordbox
BPM**, for example, to ask about it alone.

### Undoing a change

Track details' **History** offers **Undo** beside every change you made in
CuePoint — a rating, a favorite, a note, a tag, one of your values or a match
decision. Changes Rekordbox made are not offered: change those in Rekordbox.

An undo that would throw away a later change is refused, and says what the
value is now. Undo the later change first, or edit the value directly.

A change made to many tracks at once is taken back from its entry in the
**Activity** panel: **Undo all of these**, then **Undo** to confirm. Adding
tracks to a Collection or removing them from one cannot be undone; its entry
says so. An undo is itself a change, and can be undone too.

## Syncing to files

**Sync to files…**, on Clean, puts your values into the audio files themselves, so
Rekordbox and other software can read them. It is the one thing CuePoint does
outside its own library, so it always goes in the same order:

1. **Choose what to sync**: key (in the notation you choose; a track with no
   key keeps the key its file already has), BPM, year,
   genre, label, a comment, and whether to add Beatport's artwork to files that
   have none. The comment is off to start with, because it replaces whatever
   comment a file has.
2. **Preview.** CuePoint reads the files and says how many would change, which
   values would be written, and which files are skipped and why. **The preview
   is a read and changes nothing.** Changing an option throws the preview away.
3. **Sync.** Only after a preview has answered. The button reads **Sync N files**, or **Nothing to sync** when no file would change. Each value a file held is
   recorded before it is replaced.

What is saved is the value you see in the Library: yours where you have one,
Rekordbox's otherwise. A field a file already holds is not saved again.

### Files that are skipped

| Skipped | Why |
| --- | --- |
| WAV files | CuePoint does not sync to WAV files |
| Other formats | CuePoint writes MP3, AIFF, FLAC and Ogg Vorbis only |
| Missing or unreadable files | The last file check did not find them |
| Files never checked | CuePoint writes only to a file it checked where it is now — run **Check every file** on Clean ▸ Missing files first |
| Files that already hold these values | Nothing would change |
| Files that changed since the preview | Neither the old nor the new value is what you confirmed; preview again |

**Artwork is added only to files that have none, and only when you ask.** A
file's own picture is never replaced.

### Rekordbox shows the new values only after it re-reads the files

Rekordbox keeps its own copy of every tag. Until it re-reads a file, it keeps
showing the old values. In Rekordbox, select the tracks and choose
**Reload Tag**. Then refresh CuePoint's library, if you want Rekordbox's values
here to match.

### Undoing a sync

After a sync, the dialog offers **Undo this sync**, and so does the
sync's entry in the **Activity** panel. Track details' History offers
**Undo this sync** for one track. Undoing puts back every tag value
the sync replaced, and removes a picture it added.

A value you or another program changed in the file since the save is left
alone, and the undo says so.

**An undone file can stay slightly larger than it was.** Every value is back,
but the tag keeps the room it grew into, as every tagging program does. That
room is reused by the next save.

### "May not have finished"

CuePoint records each value before it touches the file, and confirms it after
reading the file back. If CuePoint closes while writing — it is quit, it
crashes, the computer shuts down — some values are recorded but not confirmed.
The Activity panel then says **Saving to files stopped when CuePoint closed**, and
how many writes **may not have finished**. They are never counted as saved.

Such a file may hold the new value or still hold the old one. **Undo** is the
safe answer either way: a file that still holds its old value counts as already
undone, and one that holds the new value gets the old one back. Then save
again if you still want to.

## Where the data lives

Your library is a single SQLite file in your CuePoint home directory
(`~/.cuepoint/cuepoint.db` on macOS and Linux, `%USERPROFILE%\.cuepoint\` on
Windows). About 20 MB for 50,000 tracks, and more once they are matched:
every Beatport candidate a match found is kept, about 300 MB for 30,000 matched
tracks — see [Performance](performance.md#clean). CuePoint backs it up on launch ([Backups](troubleshooting.md#backups) covers making one and restoring one), and the
Activity panel lists those backups along with every import and refresh — which
is where to look if you want to know what a refresh actually did.

Nothing is uploaded anywhere. The library never leaves your machine.

## See also

- [Organizing your library](organization.md) — Collections, tags and ratings
- [Clean](clean.md) — matching on Beatport, checking matches, missing files, duplicates and Health
- [Discover](discover.md) — new music from your artists and labels, the wantlist, artist and label pages, and similar tracks
- [Prepare](prepare.md) — Sets: running orders with chapters, planned times and checks
- [The CuePoint window](the-window.md#keyboard-shortcuts) — navigation, search, the status strip, and the keys for Clean's Match area
- [Performance](performance.md#the-library) — measured timings at 50,000 tracks
- [Troubleshooting](troubleshooting.md)
