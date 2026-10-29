# Prepare

**Prepare** is where you plan a set: the tracks in the order you will play
them, divided into chapters, with the times you plan to bring each one in and
out. CuePoint checks every transition and says what it finds, suggests what
fits between any two tracks, plays the Set as the queue, and writes it out as a
set list or into Rekordbox.

It works on the library you imported on the [Library](library.md) page, so
import a collection first.

> **Chapters, planned times and notes stay in CuePoint.** Rekordbox has nowhere
> to put them. An export to Rekordbox writes a Set as one ordinary playlist in
> its running order, and a set list file carries the times only in its text and
> CSV forms. See [Taking a Set out of CuePoint](#taking-a-set-out-of-cuepoint).
>
> **Playback plays whole tracks.** Playing a Set plays its tracks in order
> through the ordinary player, each from its start to its end. The planned in
> and out times are your plan, not instructions to the player: nothing starts,
> stops or crossfades at them.

## Sets

A **Set** is a running order. It sits in the same tree as your
[Collections](organization.md#collections), can be filed in folders beside
them, and holds tracks in an order you choose. What it adds is everything a
Collection does not have: chapters, planned times, notes, and checks on how
each track leads into the next.

A track can be in a Set more than once — a reprise at the end, an intro used
twice — and **each time it plays is its own entry**, with its own times and its
own note. The table marks a track played again with a small repeat mark beside its number, and
its title says where else it plays.

A Set holds at most 1,000 tracks, counting each repeat. A Collection holds larger lists.

### Making a Set

- **New Set**, in the menu of the Set's name at the top of Prepare, makes an empty
  Set called "New Set" at once and asks for its name (**Name the Set**, then
  **Save**). In the Library, **Set** in the **+ New** menu at the top of the
  Collections section adds a "New Set" row in the tree to name in place, with
  **Create**.
- **New Set from…** (on Prepare, **New Set from a list…**) copies the tracks of
  something you already have into a new Set, as its one chapter:
  - a **Collection**, in its order and with any repeats;
  - a **Smart Collection**, as the tracks it matches right now, in its saved
    order — later matches join the Smart Collection, not the Set;
  - a **Rekordbox playlist**, in its order — refreshing from Rekordbox never
    changes the Set.

  On the Prepare page, **New Set from a list…** asks what to copy, the name and
  the folder in one dialog. Either way the dialog's button is **Create**. In the
  Library, right-click a Collection, a Smart Collection or a Rekordbox playlist
  and choose **New Set from…**.
- **New Set from these…**, in the Library's right-click menu and the selection
  bar's **Organize ▸**, makes a Set of the tracks you selected, in the order the
  table shows them.
- **Duplicate**, on a Set's right-click menu in the Library, copies a Set
  whole — chapters, times, notes and warnings marked OK — which is how last
  week's plan becomes this week's.

Every one of these is a copy. The Collection, playlist or selection it came
from stays exactly as it was, and nothing links the two afterwards.

### Opening a Set

The sidebar's **Prepare** opens the Set you had open last. The Set's name is the
page's title: click it for a menu that lists your Sets under **Open a Set**, and
holds **Rename…**, **Notes…**, **New Set**, **New Set from a list…** and
**Delete…**. A Set in the Library's tree has **Open in Prepare** on its
right-click menu. The Library's Track details lists the Sets a
track is in, and each opens there too.

### Adding tracks

- **From the Library page**: right-click a selection and choose **Add to
  Set…**, or drag it onto a Set in the Collections tree. Tracks are added at
  the end of the Set's last chapter; tracks already in the Set are skipped and
  counted, as a Collection does.
- **On the Prepare page**: from the panel beside the Set — see
  [Suggestions and the Library tab](#suggestions-and-the-library-tab).
- **A repeat**: select a track and choose **Repeat** (it plays the track again
  after itself), on its row or its right-click menu.

### Changing the running order

- **Drag** a track to a new place. Dropping on the top half of a row puts it
  before that track, the bottom half after it, and on a chapter's heading at the
  start of that chapter.
- **↑** and **↓** (Move up and Move down), on the selected row (also Alt+↑ and
  Alt+↓ while the table has focus, as in the queue), move the selected tracks
  one place. At the edge of a chapter the track crosses into the next one first.
  With several selected, they move together.
- **Remove**, among the same buttons (also Delete), or **Remove from Set** on an
  track's right-click menu, removes the selected tracks and nothing else. No
  track is ever deleted. A toast says what was removed and offers **Undo**, which puts
  them back where they were, with their times and notes (a warning you had
  marked OK is not brought back).

Click, Ctrl-click and Shift-click select rows, **Ctrl+A** (Cmd+A on a Mac) selects every
entry, and **Esc** lets go; the same keys work in the panel beside the Set. Right-click
selects the row first. The menu is the one every track list has (**Play**, **Play next**,
**Add to queue**, and **More** with the track's pages, Copy and Show in folder), with the
Set's own edits under a small **This page** heading.

The buttons are at the right end of the selected row, so they push nothing down.
With nothing selected there are none; with several tracks selected they are on
the one you clicked last, and act on all of them (hover one: "Move 3 tracks
up"). One that cannot act says why ("Already first in the Set"). They are
**↑**, **↓**, **New chapter**, **Repeat** and **Remove**; each is a Tab stop (Tab from the table goes to them) and keeps its
full name for a screen reader. They never cover the row's number or the first
six or so characters of the title (the rest of the selected row's title is shortened
with "…" to make room): in a moderately narrow pane, which includes the default
size in a 1280-wide window, they shrink to symbols (**↑ ↓ Chapter ↻ ×**), and when
even those do not fit (a very narrow pane, or the largest sizes), to one **Actions ▾** button that opens the same menu as a right-click
on the entry. They step aside while you type a Mix in or Mix out on that row.
Because a double-click on the row plays it, they ignore the pointer for half a
second after they appear, and a click on **Remove** takes half a second to act, so
a double-click aimed at the row's end plays it and removes nothing. Drag and
right-click work as before.

Selecting a Set in the Library's tree shows its tracks in the table there, each
once, in the order it first plays; the Library says so above the table. The
running order with its repeats is the Prepare page's.

## The page

The header's title is the Set's name, with a small arrow: it opens the Set's menu
(see [Opening a Set](#opening-a-set)). Its buttons are **View**, **Export ▾** (the
main one) and **Play Set**. Under them, one line says how many tracks the Set has,
its planned running time (left out until you type a time), and how many warnings
its checks found ("32 tracks · 1:58:40 · 19 warnings"; hover the time for how many
tracks have no time, and the warnings for what they are and how many you marked
OK). The warnings count is a link: it selects the first track with a warning you
have not marked OK, and — when it applies — "Files not checked" with
**Missing files ›**, which opens the [Clean](clean.md) page's Missing files (Prepare
no longer runs the file check itself; run **Check every file** there), and "3 without
key" (hover for the whole sentence). A missing key is not a warning: those tracks
are simply not checked for key. The counts shorten to fit (hover them for the whole
line); the link never does. The buttons for the selected tracks are on the selected
row, not here.

The Set's menu holds **Notes…** (notes for the whole Set: the venue, the set
times, anything you want to remember; it reads **Notes (1)…** once the Set has
some). **Export** holds **Export to Rekordbox…**, **Save set list…** and **Copy
set list**. **View** has three ticked items, **Tempo and key lane**, **Transition
strip** and **Mix-in and mix-out columns**; the label never changes, the tick says
whether it is on, and the menu stays open so you can set several. The small
**Columns…** button in the table's header corner chooses the table's columns.

The Set's table has one row each time a track plays. It opens with its number, the track
(**Title** and **Artist**), **BPM**, its **Key** (a coloured chip, the colour of its place on the Camelot wheel),
how long it plays (**Time**), its **Mix in** and **Fit**. The columns kept out of the way until you want them are
**Starts at**, the **Mix out** time you plan, the **Transition**
into it and its **Note**: **View ▸ Mix-in and mix-out columns** brings both times in at once, and
**Columns…** in the header corner shows or hides the others. **Fit** is a dot for how
well the track mixes in from the one before: a filled dot means key and tempo both fit, a
half dot means one of them is off, a ring means both are. Hover the dot for what is off; a
warning you have marked OK counts as fit, and the first track has no dot, as
nothing comes before it. Hover a heading for
what it means. Each chapter has a heading row that states the chapter's facts
under the same columns (under **Fit** it counts the chapter's open warnings). Nothing sorts: the order is the Set. A chapter's
name in its heading is the button that opens its dialog, which has **Move up**,
**Move down** and **Delete chapter…**.

Beside the Set is the panel you add tracks from. Drag the divider between them,
or move it with the arrow keys; the width you choose is remembered.

Selecting a track adds **In this Set** to Track details on the right: its
times, note and chapter, and what the checks found about it.

## Chapters

A chapter is a part of the Set, such as a warm-up, a peak or a close, with its own
target length and tempo range. Every track
belongs to exactly one chapter, and a chapter's tracks are always together in
the running order.

- **New chapter**, on the selected row or a track's right-click menu ("Start a
  new chapter at this track"), splits the Set there (the first track, with
  several selected): that track begins a new chapter.
- A chapter's name in its heading row is a button that opens its dialog (or
  double-click the heading, or choose **Edit chapter…** on its right-click menu,
  which also has **Move chapter up**, **Move chapter down** and **Delete chapter…**). The dialog is titled **Edit chapter
  “Name”**, and a time it cannot read is marked on the **Target length** field itself. Its footer has **Move up**
  and **Move down**, which move the chapter — its tracks move with it — and
  **Delete chapter…** (red, alone on the left), which says which chapter its tracks join first. A Set always keeps one chapter, so the last cannot be deleted.
- A Set with a single unnamed chapter shows no heading at all: it is simply a
  list.

A chapter can carry a **target length** and a **BPM range**. The heading shows
the chapter's planned time against its target ("9:00 of 8:00") and its range,
and the checks say when the chapter runs over or under its target or holds a
track outside its range. Suggestions for a gap inside the chapter keep to its
range.

## Planned times

Each entry can carry a planned **mix in** time and **mix out** time: where in the
track you plan to bring it in and take it out. Type them straight into the
table's **Mix in** and **Mix out** cells (choose **View ▸ Mix-in and mix-out columns** for **Mix out**), or under **In this Set** in Track
details, as `m:ss` or `h:mm:ss` — `0:30`, `4:30`, `1:02:00`.
In the table, click the cell (or press Enter or F2 on the selected entry); Enter or
Tab saves and moves to the next cell (Shift+Tab goes back), Esc drops what you
typed, and leaving the cell saves it. Double-clicking an entry still plays it.
In Track details, press Enter or leave the field; the empty fields show an example (**e.g. 0:00**), not a value. The table's columns beyond the
title may need a sideways scroll in a narrow window. A blank **Mix in** means the start of the track; a blank field
clears a time. A time that cannot be read, an out time before the in time, or an
out time past the end of the track is refused with the reason, which the line
under the header says, the reason first and the entry's name last ("Not saved:
… (Warm One)"), while the cell stays open to correct.

- **An entry is timed when it has an out time.** It plays for its out time less
  its in time, which the **Time** column shows.
- **The running time counts timed entries only**: "9:00 planned", and it says how
  many it did not count ("4 without times") when you hover it. It is left out while
  no time is typed ("No times planned yet", in the track count's hover).
  Times are optional. It never guesses how long an entry without an out time
  will play.
- **Starts at** is when each entry begins, counted from the Set's start. It stops at
  the first entry without an out time: that entry's start is known, and every one after it
  is left blank rather than showing a time that would be wrong.

Each entry can also carry a note — "loop the break", "let it run" — typed in the
Track details and shown in the table's **Note** column.

## Warnings

CuePoint checks every transition, every entry and every chapter, and explains
each thing it finds. **A warning never stops anything**: you can play, save and
export a Set with every warning still open.

- **Into each entry**: a **tempo jump** outside the window Similar tracks uses,
  with half and double time counted as fitting; a **key clash**, two keys with
  no relation on the Camelot wheel; and a track with no BPM to compare. Keys are
  Beatport's (or yours): a track with no key is left out of the key checks
  without a warning, and the line under the header says once how many entries
  have none.
- **On each entry**: a file that was missing or unreadable when files were last
  checked, and a planned time past the end of the track.
- **On each chapter**: over or under its target, and tracks outside its BPM
  range.

The **Transition** column shows the warnings into each entry in a few words, and
its tooltip gives each one in full. The header's count names every kind it
counted. A Set whose files were never checked says so rather than claiming none
are missing; choose **Missing files ›** beside "Files not checked" in the header's line, or run
**Check every file** on the [Clean](clean.md) page.

**Marking a transition warning OK.** Select the entry, and in **In this Set**, or
beside the warning in the [transition strip](#the-transition-strip), choose
**Mark OK** once you have heard the mix work. It stays
visible, muted and marked OK, and **Undo Mark OK** takes the mark
off. A warning marked OK comes back on its own when either track, or
the value it compared, changes — a different track in the slot, a corrected BPM
or key — because what you marked OK is no longer what is there. A key clash
marked OK under one pair of keys comes back when Beatport's key replaces
Rekordbox's and the new pair still clashes.

## Suggestions and the Library tab

The panel beside the Set fills it from two places, on two tabs:

- **Suggestions**: what fits the gap you are looking at.
- **Library**: a search over your library, as the Library page's search box
  searches.

**The insertion point** is where a track from either tab goes: the gap after
the track selected in the Set, between it and the next one — or the end of the
Set with nothing selected. One line at the top of the panel, above the tabs, names it:
"Insert between “Warm Two” and “Warm One” · Warm-up". A track inserted there joins the chapter
of the entry before it.

**From** chooses where both tabs look: all tracks, a Rekordbox playlist
or folder, a Collection, a Smart Collection or a Set. The page remembers the
choice.

**Suggestions are scored against both neighbors.** A suggestion must fit the
track before the gap and the track after it. The panel shows two columns,
**Title** and **Fit**. **Fit** is the short version: the tempo step the track makes
(such as "±0 BPM") and its own key as the usual key chip. Hover a row or its **Fit**
cell for the full reason: the score out of 100 ("72/100"; with a track on each
side it is the mean of the two), and, for each side, how well the track follows
the one before the gap and how well it leads into the one after: the tempo, the
key's relation on the wheel ("Same key", "Next key", "Relative key"), and a
shared genre, label or artist. It uses the same rule as the warnings, so a track
suggested for a gap never has a tempo warning there. Key only adds points, so a
suggestion can still clash in key, and its reasons say so. A track already in
the Set is marked **In Set** at the end of its title: "Already in this Set once:
inserting it plays it again". The Library tab marks the tracks the Set holds the
same way. The same library gives the same list every time. Nothing in
the panel scrolls sideways.

When nothing fits both sides, the panel says so: "Nothing fits between “Build”
and “Peak Jump”", with each track's BPM, how far apart they are, that no tempo is
close to both, and how their keys relate. It then offers **Fit after “Build”**
and **Fit before “Peak Jump”**, each side's own list. The rule is never loosened
to fill a gap.

An empty Set has nothing to fit against, so Suggestions starts once it has its
first track; add that one from the Library tab (the empty state has a button that opens it). The
panel's **Suggestions** and **Library** tabs are the small tabs used inside panels everywhere. Hover anything
cut short or explained by a tip (a warning, a reason, a lane's column) to see the full words in the app's own tip.

**Searching.** The Library tab's box finds tracks by title or artist, and also
by a key ("8A") or a BPM ("124"), as its placeholder says. **Ctrl+F** (Cmd+F on a
Mac) anywhere on the page opens the Library tab and puts the cursor in its box.

**Putting a track in.** Select one or more rows and choose **Insert here**
(**Insert 3 here** for three; until you select one it is greyed, and pointing
at it says "Select tracks below first"), or drag them into the Set. Drop anywhere in the Set table, even in the empty space
below the last row: while you drag, the Set is outlined and says “Drop here to add to” its
name, and a line shows where the tracks will land (above a chapter's heading means the end
of the chapter before, and the line names the chapter). Rows in the Set have a small grip
at their left edge, because dragging them changes the order; rows in the panel have none, because
dragging them only copies a track in. Dragging several selected rows shows a label such as “3 tracks”.
Double-click a row to hear it; its right-click menu has the same **Play**, **Play next**, **Add to queue** and
**More** as the Set's, with **Insert here** under **This page**.

Click a row in either list and Track details shows that track; the list you clicked last wins.
Each tab keeps its search, sort, scroll and selection while you look at the other.

## The tempo and key lanes

**View → Tempo and key lane** draws the Set's shape above its table:

- **Tempo**: each entry's BPM as a mark, stepping from one to the next, so a
  jump is a step you can see.
- **Key**: each entry's place on the Camelot wheel, where neighbors mix well, its mark in that key's colour, joined to the next by a line
  that says how the two keys relate — solid for the same key or one step, dashed
  for the relative key, dotted for a clash.

A track with no BPM or key is a gap in its lane, never a zero. Keys are
Beatport's, or your own correction; a track that has not been matched has none. A line across both
lanes marks where a chapter starts. Clicking a column selects its entry, which
moves the insertion point there. The lanes are a picture of what the table says
in words; they add no fact of their own.

## The transition strip

**View → Transition strip** shows the entry you select beside the one
after it, so you can see how one track ends and the next begins:

- **A row of titles**: each entry's track and its planned times, "In 0:16 ·
  Out 5:42", or "No out time" for one without an out time, then its loudness,
  "−8.4 LUFS" (how loud the track measures), once it is measured.
- **Two waveforms**, each the whole track with its cue points, the part before
  its planned in and after its planned out dimmed.
  A track whose waveform has not been made yet says so in place, with how far
  the analysis has got ("Not made yet — 312 of 4,000"; hover for the whole
  sentence), and **See progress** under the words opens Settings at Waveforms.
- **Between them**, a short caption: the keys (as coloured chips), how they relate, and how far the
  tempo changes: "8A → 9A · next key up · +1.6% BPM". The key words are the ones
  Similar tracks uses ("same key", "next key up" or "down", "relative key", "keys
  clash", in the warning colour, even when the warning below says it too).
  When either track has no Beatport key it says "No Beatport key: key not
  checked" instead. Hover the caption for the whole tempos ("124 → 126 BPM") and,
  when both tracks have a loudness, how much louder or quieter the next one is:
  "+2.1 LU" means the next track is 2.1 dB louder. The planned times are in the
  titles above. CuePoint changes neither track's volume; see
  [Loudness](waveforms.md#loudness).
- **A warning on that transition** is a few words at the end of the caption ("Tempo
  jump", "Keys clash"; hover for the sentence), with
  **Mark OK** beside it ("Undo Mark OK" once marked). Only one is shown, the first
  you have not marked OK (a key clash before a tempo jump); any others, marked or
  not, are counted as "+1 more" (hover it), and the Inspector lists them all. The strip is no taller for
  it.

With nothing selected the strip says to select an entry; with the last entry
selected, its second half reads **End of Set**. Clicking a half selects that
entry, so clicking the second one walks the Set one transition at a time. Both
tracks are put first in the waveform analysis if they are still waiting for it.
See [Waveforms](waveforms.md).

The lanes and the strip start hidden, because each takes about three of the
Set's rows at the default window size, and each is remembered once you open it.
However crowded the window, the Set keeps two whole rows under them: if the
window is too short for that, the page scrolls instead.

## Playing a Set

**Play Set** plays the Set from its first entry. Double-clicking an entry plays
the Set from that entry (Enter on a selected entry types its **Mix in** instead);
**Play Set from here** on its right-click menu does the same. The entries go to the player's queue in
order, **repeats included**, and play through the ordinary player — whole
tracks, start to finish, as described [above](#prepare). **Play next** and **Add
to queue** put entries in the queue without interrupting what is playing.

## Taking a Set out of CuePoint

### Set lists

**Export → Save set list…** writes the Set as a file, to the place you choose
in the save dialog. The file's extension chooses the form:

- **Text** (`.txt`): the Set's name and running time, then each chapter as a
  heading and each entry as `01. [0:00]  Artist – Title`, with its planned times
  where it has them.
- **CSV** (`.csv`): one row per entry, with its position, chapter, start, in,
  out and planned times, artist, title, remixer, BPM, key, length, file, file
  status and note. Spreadsheet programs open it directly; times are written as
  `h:mm:ss` so a spreadsheet does not read `3:45` as hours.
- **M3U8** (`.m3u8`): a playlist other players open, in running order with
  repeats, with each chapter as a comment line. It carries no times.

**Export → Copy set list** puts the text form on the clipboard, for a message
or a post. A missing file is listed, and counted, never left out. Each save is
recorded in **Activity**. The Library's right-click menu on a Set has both too.

### Rekordbox

**Export → Export to Rekordbox…** opens the export with the Set ticked. The
Set is written as **one playlist**, in its running order with its repeats, under
the export's `CuePoint` folder at the folder path it has in CuePoint. Its
chapters, times, notes and warnings marked OK are not written: the playlist is
the running order and nothing else. Everything else about the export is as
[Exporting to Rekordbox](rekordbox-export.md) describes.

## Refreshing, and what a refresh does to a Set

A refresh that removes tracks from your library removes their entries from every
Set too. The refresh preview counts the Sets affected on their own — "1 in 1
Set" — beside the Collections, before anything happens. A Set a refresh emptied
says so when you open it.

## Where Sets live

In the same database as the rest of your library, which CuePoint backs up on
launch. **Those backups are the only copy of a Set's plan.** A Set's tracks can
be exported, but its chapters, times, notes and warnings marked OK exist nowhere
else. Restoring a backup brings all of it back together with the Collections
beside it; [Backups](troubleshooting.md#backups) says how.

## See also

- [Organizing your library](organization.md) — Collections, folders and the tree
  Sets share
- [Exporting to Rekordbox](rekordbox-export.md) — what an export writes
- [Playing music](player.md) — the player a Set plays through
- [Discover](discover.md#similar-tracks) — the similarity rule Suggestions and
  the warnings share
- [Performance](performance.md#prepare) — measured timings for Sets
