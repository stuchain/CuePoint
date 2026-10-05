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
> **Playback plays whole tracks.** Playing a Set plays its entries in order
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
own note. The table marks a track played again with ↻ beside its number, and
its title says where else it plays.

A Set holds at most 1,000 entries. A Collection holds larger lists.

### Making a Set

- **New Set**, on the Prepare page or beside **New Collection** at the top of
  the Library's Collections section, makes an empty Set in the folder you
  choose.
- **New Set from…** copies the tracks of something you already have into a new
  Set, as its one chapter:
  - a **Collection**, in its order and with any repeats;
  - a **Smart Collection**, as the tracks it matches right now, in its saved
    order — later matches join the Smart Collection, not the Set;
  - a **Rekordbox playlist**, in its order — refreshing from Rekordbox never
    changes the Set.

  On the Prepare page, **New Set from…** asks what to copy first. In the
  Library, right-click a Collection, a Smart Collection or a Rekordbox playlist
  and choose **New Set from…**.
- **New Set from the selection…**, in the Library's right-click menu and its
  **Actions** menu, makes a Set of the tracks you selected, in the order the
  table shows them.
- **Duplicate**, on a Set's right-click menu in the Library, copies a Set
  whole — chapters, times, notes and accepted warnings — which is how last
  week's plan becomes this week's.

Every one of these is a copy. The Collection, playlist or selection it came
from stays exactly as it was, and nothing links the two afterwards.

### Opening a Set

The sidebar's **Prepare** opens the Set you had open last. The picker at the
top of the page opens any other, and a Set in the Library's tree has **Open in
Prepare** on its right-click menu. The Library's Inspector lists the Sets a
track is in, and each opens there too.

### Adding tracks

- **From the Library page**: right-click a selection and choose **Add to
  Set…**, or drag it onto a Set in the Collections tree. Tracks are added at
  the end of the Set's last chapter; tracks already in the Set are skipped and
  counted, as a Collection does.
- **On the Prepare page**: from the panel beside the Set — see
  [Suggestions and the Library tab](#suggestions-and-the-library-tab).
- **A repeat**: right-click an entry and choose **Insert a repeat after**.

### Changing the running order

- **Drag** an entry to a new place. Dropping on the top half of an entry puts it
  before that entry, the bottom half after it, and on a chapter's heading at the
  start of that chapter.
- **Remove from Set**, on an entry's right-click menu, removes that entry and
  nothing else. No track is ever deleted.

Selecting a Set in the Library's tree shows its tracks in the table there, each
once, in the order it first plays; the Library says so above the table. The
running order with its repeats is the Prepare page's.

## The page

The header's picker names the Set open. Beside it are **Play Set** and
**Export ▾**. Under them, one line says how many entries the Set has, its
planned running time, how many warnings its checks found and how many you
accepted, and — when it applies — that its files have never been checked.
**Notes…** holds notes for the whole Set: the venue, the set times, anything you
want to remember. **View ▾** shows or hides the tempo and key lanes and the
transition strip, and chooses the table's columns.

The Set's table has one row per entry: its number, when it **Starts**, its
planned **In** and **Out** times, how long it is **Planned** to play, the track,
its BPM and key, the **Transition** into it, and its note. Each chapter has a
heading row that states the chapter's facts under the same columns. Nothing
sorts: the order is the Set.

Beside the Set is the panel you add tracks from. Drag the divider between them,
or move it with the arrow keys; the width you choose is remembered.

Selecting an entry adds **In this Set** to the Inspector on the right: the
entry's times, note and chapter, and what the checks found about it.

## Chapters

A chapter is a stretch of the Set: a warm-up, a peak, a close. Every entry
belongs to exactly one chapter, and a chapter's entries are always together in
the running order.

- **Start a chapter here**, on an entry's right-click menu, splits its chapter
  at that entry.
- A chapter's heading row has **Rename, targets and notes…** (or double-click
  the heading), **Move chapter up**, **Move chapter down** — its entries move
  with it — and **Delete chapter…**, which says which chapter its entries join
  first. A Set always keeps one chapter, so the last cannot be deleted.
- A Set with a single unnamed chapter shows no heading at all: it is simply a
  list.

A chapter can carry a **target length** and a **BPM range**. The heading shows
the chapter's planned time against its target ("9:00 of 8:00") and its range,
and the checks say when the chapter runs over or under its target or holds a
track outside its range. Suggestions for a gap inside the chapter keep to its
range.

## Planned times

Each entry can carry a planned **in** time and **out** time: where in the track
you plan to bring it in and take it out. Type them in the Inspector's **In this
Set** as `m:ss` or `h:mm:ss` — `0:30`, `4:30`, `1:02:00` — and press Enter or
leave the field. A blank **In** means the start of the track; a blank field
clears a time. A time that cannot be read, an out time before the in time, or an
out time past the end of the track is refused with the reason.

- **An entry is timed when it has an out time.** It plays for its out time less
  its in time, which the **Planned** column shows.
- **The running time counts timed entries only**, and says how many it did not
  count: "9:00 planned · 4 untimed". It never guesses how long an untimed entry
  will play.
- **Starts** is when each entry begins, counted from the Set's start. It stops at
  the first untimed entry: that entry's start is known, and every one after it
  is left blank rather than showing a time that would be wrong.

Each entry can also carry a note — "loop the break", "let it run" — typed in the
Inspector and shown in the table's **Note** column.

## Warnings

CuePoint checks every transition, every entry and every chapter, and explains
each thing it finds. **A warning never stops anything**: you can play, save and
export a Set with every warning still open.

- **Into each entry**: a **tempo jump** outside the window Similar tracks uses,
  with half and double time counted as fitting; a **key clash**, two keys with
  no relation on the Camelot wheel; and a track with no BPM or key to compare.
- **On each entry**: a file that was missing or unreadable when files were last
  checked, and a planned time past the end of the track.
- **On each chapter**: over or under its target, and tracks outside its BPM
  range.

The **Transition** column shows the warnings into each entry in a few words, and
its tooltip gives each one in full. The header's count names every kind it
counted. A Set whose files were never checked says so rather than claiming none
are missing; run **Check files** in the Library, or **Check every file** on the
[Clean](clean.md) page.

**Accepting a transition warning.** Select the entry, and in **In this Set**
choose **Acknowledge** beside the warning: you have heard the mix and it works.
It stays visible, muted and marked accepted, and **Withdraw** takes the
acceptance back. An accepted warning comes back on its own when either track, or
the value it compared, changes — a different track in the slot, a corrected BPM
or key — because what you accepted is no longer what is there.

## Suggestions and the Library tab

The panel beside the Set fills it from two places, on two tabs:

- **Suggestions**: what fits the gap you are looking at.
- **Library**: a search over your library, as the Library page's search box
  searches.

**The insertion point** is where a track from either tab goes: the gap after
the entry selected in the Set, between it and the next one — or the end of the
Set with nothing selected. A line at the top of the tab names it: "Between
“Warm Two” and “Warm One”, in Warm-up". A track inserted there joins the chapter
of the entry before it.

**From** chooses where both tabs look: your whole library, a Rekordbox playlist
or folder, a Collection, a Smart Collection or a Set. The page remembers the
choice.

**Suggestions are scored against both neighbours.** A suggestion must fit the
track before the gap and the track after it, and each side's reasons are shown
in their own column: the tempo, the key's relation on the wheel, and a shared
genre, label or artist. It uses the same rule as the warnings, so a track
suggested for a gap never has a tempo warning there. Key only adds points, so a
suggestion can still clash in key, and its reasons say so. A track already in
the Set is marked: "Already in this Set once: inserting it plays it again".
The same library gives the same list every time.

When nothing fits both sides, the panel says so: "Nothing fits between “Build”
and “Peak Jump”", with each track's BPM, how far apart they are, that no tempo is
close to both, and how their keys relate. It then offers **Fit after “Build”**
and **Fit before “Peak Jump”**, each side's own list. The rule is never loosened
to fill a gap.

An empty Set has nothing to fit against, so Suggestions starts once it has its
first track; add that one from the Library tab.

**Putting a track in.** Select one or more rows and choose **Insert here**
(**Insert 3 here** for three), or drag them into the Set where you want them.
Double-click a row to hear it; its right-click menu also queues it, and opens its
Similar tracks and its artist's or label's page.

## The tempo and key lanes

**View ▾ → Show tempo and key lanes** draws the Set's shape above its table:

- **Tempo**: each entry's BPM as a mark, stepping from one to the next, so a
  jump is a step you can see.
- **Key**: each entry's place on the Camelot wheel, joined to the next by a line
  that says how the two keys relate — solid for the same key or one step, dashed
  for the relative key, dotted for a clash.

A track with no BPM or key is a gap in its lane, never a zero. A line across both
lanes marks where a chapter starts. Clicking a column selects its entry, which
moves the insertion point there. The lanes are a picture of what the table says
in words; they add no fact of their own.

## The transition strip

**View ▾ → Show transition strip** shows the entry you select beside the one
after it, so you can see how one track ends and the next begins:

- **A row of titles**: each entry's track and its planned times, "In 0:16 ·
  Out 5:42", or "Untimed" for one without an out time.
- **Two waveforms**, each the whole track with its cue points, the part before
  its planned in and after its planned out dimmed.
- **Between them**, in words, how the one goes out and the next comes in:
  "Out 5:42 → In 0:16". "Untimed" stands for an out time not typed yet, and
  "untimed" for a next entry with no times at all.

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

**Play Set** plays the Set from its first entry. Double-clicking an entry, or
pressing Enter on it, plays the Set from that entry; **Play Set from here** on
its right-click menu does the same. The entries go to the player's queue in
order, **repeats included**, and play through the ordinary player — whole
tracks, start to finish, as described [above](#prepare). **Play next** and **Add
to queue** put entries in the queue without interrupting what is playing.

## Taking a Set out of CuePoint

### Set lists

**Export ▾ → Save set list…** writes the Set as a file, to the place you choose
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

**Export ▾ → Copy set list** puts the text form on the clipboard, for a message
or a post. A missing file is listed, and counted, never left out. Each save is
recorded in **Activity**. The Library's right-click menu on a Set has both too.

### Rekordbox

**Export ▾ → Export to Rekordbox…** opens the export with the Set ticked. The
Set is written as **one playlist**, in its running order with its repeats, under
the export's `CuePoint` folder at the folder path it has in CuePoint. Its
chapters, times, notes and accepted warnings are not written: the playlist is
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
be exported, but its chapters, times, notes and accepted warnings exist nowhere
else. Restoring a backup brings all of it back together with the Collections
beside it.

## See also

- [Organizing your library](organization.md) — Collections, folders and the tree
  Sets share
- [Exporting to Rekordbox](rekordbox-export.md) — what an export writes
- [Playing music](player.md) — the player a Set plays through
- [Discover](discover.md#similar-tracks) — the similarity rule Suggestions and
  the warnings share
- [Performance](performance.md#prepare) — measured timings for Sets
