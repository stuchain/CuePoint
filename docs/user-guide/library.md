# Your library

CuePoint keeps its own copy of your Rekordbox collection. Import an XML export
once and CuePoint holds your tracks, your playlists and what is in them, so
everything else it does can start from your actual music instead of asking you
for a file every time. The Library page is also where you browse it: playlists,
filters, sorting and a track's full detail.

Open **Library** in the sidebar.

## Importing a collection

1. In Rekordbox, use **File → Export Collection in xml format** and save the
   file somewhere you will find it again. Downloads is fine.
2. In CuePoint, open **Library** and choose **Import a collection…**.
3. Pick the file. CuePoint reads it in the background — you can keep using the
   rest of the app, and the strip along the bottom shows how far it has got.

When it finishes, the page shows what CuePoint now holds and which file it came
from. **It remembers that file**, so refreshing later takes one click.

To switch to a different export later, open **Collection file ▾** at the top of
the Library and choose **Import a different collection…**. The same menu has
**Export to Rekordbox…** — see [Exporting to Rekordbox](rekordbox-export.md).

A 50,000-track collection takes about eleven seconds to import. See
[Performance](performance.md#the-library) for the measured numbers.

### If the file is not right

CuePoint refuses a file that is not a Rekordbox collection export rather than
importing an empty library and telling you it worked. If you exported a single
playlist instead of the whole collection, the file has no collection in it and
CuePoint will say so — export again with **File → Export Collection**.

## Browsing your library

Once something is imported, the Library page **is** your collection: the
playlists down the left, the tracks in the middle, and everything CuePoint
knows about whichever track you clicked in the Inspector on the right.

Nothing here changes your music. The Library page reads.

### Finding tracks

- **Click a playlist** on the left to look at just that playlist. Folders show
  everything underneath them. **All tracks** goes back to the whole library.
- **Type in the search box** to narrow to matching titles, artists, albums and
  labels. It searches whatever you are looking at, so a search inside a playlist
  stays inside that playlist.
- **Add a filter** for anything more specific — BPM between 124 and 130, genre
  is Techno, comment contains "promo". Filters stack, and the bar says how many
  tracks are left after them.
- **Click a column heading** to sort by it; click again to reverse it.

A playlist opens in the order you arranged it in Rekordbox, which is what a set
list is for. The whole library opens by artist. Sorting a playlist by anything
else and then going back to **All tracks** does not carry that sort over.

### Choosing columns

**Columns…** opens the list. Nine are shown to start with — the ones a DJ reads —
and twelve more are there if you want them: remixer, year, plays, date added,
colour, bitrate, comment, the file path, and four from
[Clean](#clean-in-the-library) — **Match**, **Score**, **File status** and
**Artwork**. Turn them on and off, drag a heading to move a column, drag its
edge to resize it. CuePoint remembers all of it.

Key, BPM, genre, label and year show **your** value when you have set one. A
small mark beside the value says so — **B** when it was applied from Beatport,
a dot when you typed it — and pointing at the mark says where it came from and
what Rekordbox has underneath.

### Selecting tracks

Click to select, Ctrl+click (Cmd+click) to add one, Shift+click for a range —
a range works even across parts of a long list you have not scrolled to yet.

**Ctrl+A selects everything matching what you are looking at**, filters and all.
That means *everything*, not just the rows on screen: select-all over a filtered
47,000-track view selects 47,000 tracks. **Esc** lets go. **Ctrl+F** puts the
cursor in the search box.

With something selected you can **Copy** it — the visible columns, in the order
you have them, ready to paste into a spreadsheet — and, for a single track,
**Show in folder**. A copy is capped at 5,000 tracks and tells you when it hit
the cap. If a file is no longer where Rekordbox says it is, **Show in folder**
opens the nearest folder that still exists, and says so.

**Actions…**, and a track's right-click menu, offer the same list: everything in
[Organizing your library](organization.md), and the Clean actions below.

### The Inspector

Selecting one track fills the Inspector. From the top:

- **The track's artwork**, or *No artwork* when it has none.
- **Yours** — what you have added in CuePoint: your rating, favorite, notes,
  tags, and your key, BPM, genre, label and year. See
  [Organizing your library](organization.md) and
  [Your own values](#your-own-values).
- **Beatport** — where the track stands with its Beatport match, and for key,
  BPM, genre, label and year: what Rekordbox sent, what Beatport has, and what
  you see now, with where that came from. See
  [The Beatport zone](#the-beatport-zone).
- **From Rekordbox** — everything the import captured: remixer, album, label,
  genre, key, BPM, year, length, rating, plays, colour, comment, bitrate, when
  it was added and where the file is. **This part is read-only.** It is what
  Rekordbox sent, and a refresh replaces it.
- The Collections and playlists the track is in. Click one to jump to it.
- **History** — every change to the track, and who made it.

Ctrl+I hides the Inspector if you would rather have the width. Double-clicking a
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
- If something has changed, CuePoint reads the export and shows you **exactly
  what a refresh would do** before doing any of it.

The page also tells you, without being asked, when the export has changed since
your last import — that is what **Out of date** means next to the file name.

### What the preview shows

| Line | Means |
| --- | --- |
| New tracks | In the export, not yet in CuePoint |
| Updated tracks | In both, with something different in Rekordbox |
| **Tracks removed from Rekordbox** | In CuePoint, no longer in the export — **these get deleted** |
| Re-linked after renumbering | Rekordbox gave the track a new ID; CuePoint recognised the file and kept everything |
| New / edited / deleted playlists | The same, for your playlist tree |

Nothing happens until you press the confirm button. **Cancel changes nothing** —
the preview only reads.

### What a refresh deletes

**A refresh deletes the tracks that are no longer in your export, and it cannot
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

If CuePoint says it **could not tell** whether the export changed, check it
anyway — that message means the file's details could not be read, not that
nothing happened.

Very rarely, an export can be edited without its size or modified time changing,
and CuePoint would then say nothing has changed when something has. Re-exporting
from Rekordbox always fixes this, because a fresh export has a new modified
time.

## Five things worth knowing

### What you do in CuePoint stays in CuePoint

**Collections, tags, ratings, favorites, notes and your own values are
CuePoint's, and they are invisible in Rekordbox.** CuePoint reads your export
and never writes to it, so nothing you organize here changes what Rekordbox
shows you. Two things take your work out of CuePoint, and each happens only
when you ask, after a preview: [Exporting to Rekordbox](rekordbox-export.md),
which writes a new XML file with your values and Collections (tags, notes and
favorites stay behind), and [Writing tags to files](#writing-tags-to-files).
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

**File checked** filters by the day a file was last checked.

**An unplugged drive is one line, not thousands.** If every track on a drive is
missing because the drive itself is not there, the Activity panel says so once —
for example *4,812 tracks on E:\ — the drive is not connected* — and CuePoint
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
| File path | One file is in your Rekordbox collection twice |
| Beatport track | Two tracks were matched to the same Beatport track |
| Artist and title | The same artist, title and mix, with lengths within two seconds of each other |

Filter the Library with **In a duplicate group**, or with **Duplicate signal**
to see one kind. A track can be in more than one group, for example when a file
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

For a track whose Beatport match you accepted, CuePoint also knows Beatport's
artwork for that release. It is downloaded only when it is needed, only from
Beatport, and never for a match you have not accepted. Offline, it is simply not
there — nothing fails.

Filter the Library with **Artwork**, or show it as a column:

| Value | Means |
| --- | --- |
| In the file | The file carries its own picture |
| From Beatport | The file has none, and Beatport's artwork for the accepted match is used |
| None | The file was read and carries no picture, and there is no Beatport artwork |
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
[write tags to files](#writing-tags-to-files), and it never replaces a picture a
file already has.

### inCrate keeps a separate inventory

**inCrate has its own copy of your collection, and importing into one does not
import into the other.** If you use inCrate, you will import your XML twice —
once on the Library page and once in inCrate — and the two can drift apart if
you refresh one and not the other.

This is not an oversight; it is the cost of adding the library underneath a tool
that already had one, without breaking inCrate while doing it. A later release
moves inCrate onto the shared library and this duplication goes away. Until
then, if inCrate's results look out of date, re-import there too.

## Clean in the Library

Everything the [Clean](clean.md) page knows about a track is visible here too,
and every Clean action on a track is in its right-click menu and behind
**Actions…**.

### Columns and filters

| Column | Shows |
| --- | --- |
| Match | Where the track stands with Beatport: Needs review, Accepted, Rejected, No match or Not matched — and *disputed* when a newer match disagrees with your decision |
| Score | The score of the Beatport match the track points at |
| File status | What the last file check found |
| Artwork | The track's picture, or where it would come from |

Each of the first three sorts by what needs you first. The same facts are
filters: **Match state**, **Match decided by**, **Match disputed**,
**Match score**, **File status** and **Artwork**. A filter whose values are a
fixed list offers them to pick from rather than a box to type into.

### The Clean actions

| Action | Does |
| --- | --- |
| Match on Beatport | Looks the tracks up on Beatport, skipping any already matched or decided. It runs in the background |
| Re-match | Looks them up again. A decision you made is kept, and a newer match that disagrees marks the track *disputed* |
| Accept match / Reject match | Decides what the matcher proposed, for tracks nobody has decided yet |
| Apply Beatport values… | Copies the fields you choose from each track's accepted match into your values |
| Edit metadata… | Sets or clears your key, BPM, genre, label or year |
| Check files | Looks for the files again |
| Write tags to files… | See [Writing tags to files](#writing-tags-to-files) |

Accepting a match changes no value on its own. **Apply** is what copies
Beatport's values, and they become your values — Rekordbox's stay underneath.

### The Beatport zone

The Inspector's Beatport zone says where the track stands, who decided it, and
which Beatport track was decided. For each of key, BPM, genre, label and year it
shows three lines — **Rekordbox**, **Beatport** and **Now** — and says whether
*Now* is Rekordbox's value, one applied from Beatport, or one you typed. An
accepted match offers **Apply** beside each field it has a value for.
**Open on the Clean page** takes you to the track's review.

### Your own values

Type a key, BPM, genre, label or year in the **Yours** zone and press Enter, or
move to another field. Empty the box to clear yours and see Rekordbox's again.
CuePoint checks every value: a key in classic (Am), Camelot (8A) or short (Amin)
notation, a BPM between 20 and 300 with at most two decimals, a year from 1900 to
next year, and a genre or label up to 200 characters. A value it refuses is
explained under the field, and nothing is saved.

Your values are what the Library shows, sorts and filters by, and what Smart
Collections match. Rekordbox's value is still there: filter with **Rekordbox
BPM**, for example, to ask about it alone.

### Taking a change back

The Inspector's **History** offers **Revert** beside every change you made in
CuePoint — a rating, a favorite, a note, a tag, one of your values or a match
decision. Changes Rekordbox made are not offered: change those in Rekordbox.

A revert that would throw away a later change is refused, and says what the
value is now. Revert the later change first, or edit the value directly.

A change made to many tracks at once is taken back from its entry in the
**Activity** panel: **Revert this batch**, then **Revert** to confirm. Adding
tracks to a Collection or removing them from one cannot be reverted; its entry
says so. A revert is itself a change, and can be reverted too.

## Writing tags to files

**Write tags to files…** puts your values into the audio files themselves, so
Rekordbox and other software can read them. It is the one thing CuePoint does
outside its own library, so it always goes in the same order:

1. **Choose what to write**: key (in the notation you choose), BPM, year,
   genre, label, a comment, and whether to add Beatport's artwork to files that
   have none. The comment is off to start with, because it replaces whatever
   comment a file has.
2. **Preview.** CuePoint reads the files and says how many would change, which
   values would be written, and which files are skipped and why. **The preview
   is a read and changes nothing.** Changing an option throws the preview away.
3. **Write.** Only after a preview has answered. Each value a file held is
   recorded before it is replaced.

What is written is the value you see in the Library: yours where you have one,
Rekordbox's otherwise. A field a file already holds is not written again.

### Files that are skipped

| Skipped | Why |
| --- | --- |
| WAV files | CuePoint does not write tags into WAV files |
| Other formats | CuePoint writes MP3, AIFF, FLAC and Ogg Vorbis only |
| Missing or unreadable files | The last file check did not find them |
| Files never checked | CuePoint writes only to a file it checked where it is now — run **Check files** first |
| Files that already hold these values | Nothing would change |
| Files that changed since the preview | Neither the old nor the new value is what you confirmed; preview again |

**Artwork is added only to files that have none, and only when you ask.** A
file's own picture is never replaced.

### Rekordbox shows the new values only after it re-reads the files

Rekordbox keeps its own copy of every tag. Until it re-reads a file, it keeps
showing the old values. In Rekordbox, select the tracks and choose
**Reload Tag**. Then refresh CuePoint's library, if you want Rekordbox's values
here to match.

### Restoring

After a write, the dialog offers **Restore these files**, and so does the
write's entry in the **Activity** panel. The Inspector's History offers
**Restore the file's tags** for one track. A restore puts back every tag value
the write replaced, and removes a picture it added.

A value you or another program changed in the file since the write is left
alone, and the restore says so.

**A restored file can stay slightly larger than it was.** Every value is back,
but the tag keeps the room it grew into, as every tagging program does. That
room is reused by the next write.

### "May not have finished"

CuePoint records each value before it touches the file, and confirms it after
reading the file back. If CuePoint closes while writing — it is quit, it
crashes, the computer shuts down — some values are recorded but not confirmed.
The Activity panel then says **Writing tags stopped when CuePoint closed**, and
how many writes **may not have finished**. They are never counted as written.

Such a file may hold the new value or still hold the old one. **Restore** is the
safe answer either way: a file that still holds its old value counts as already
restored, and one that holds the new value gets the old one back. Then write
again if you still want to.

## Where the data lives

Your library is a single SQLite file in your CuePoint home directory
(`~/.cuepoint/cuepoint.db` on macOS and Linux, `%USERPROFILE%\.cuepoint\` on
Windows). About 20 MB for 50,000 tracks, and more once they are matched:
every Beatport candidate a match found is kept, about 300 MB for 30,000 matched
tracks — see [Performance](performance.md#clean). CuePoint backs it up on launch, and the
Activity panel lists those backups along with every import and refresh — which
is where to look if you want to know what a refresh actually did.

Nothing is uploaded anywhere. The library never leaves your machine.

## See also

- [Organizing your library](organization.md) — Collections, tags and ratings
- [Clean](clean.md) — matching on Beatport, reviewing, missing files, duplicates and Health
- [The CuePoint window](the-window.md#keyboard-shortcuts) — navigation, search, the status strip, and the keys for Clean's review queue
- [Performance](performance.md#the-library) — measured timings at 50,000 tracks
- [Troubleshooting](troubleshooting.md)
