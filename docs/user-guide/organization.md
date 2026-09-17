# Organizing your library

Rekordbox decides what is in your collection. CuePoint lets you decide what to
do with it: your own Collections, your own tags, your own ratings and notes, and
saved filters that keep answering as your library grows.

All of it lives beside the Library page's track table, in the left pane, so
organizing and browsing are the same screen rather than two.

> **None of this appears in Rekordbox.** CuePoint reads your Rekordbox export
> and writes nothing back — not to the XML, not to your audio files. Your
> Collections, tags and ratings are CuePoint's, and they stay in CuePoint until
> a later release adds an export. See
> [What Rekordbox does and does not see](#what-rekordbox-does-and-does-not-see).

## Collections

A Collection is your own list of tracks: a set you are building, a shortlist,
anything Rekordbox has no folder for. Folders hold Collections, and Collections
hold tracks.

- **Make one** with the buttons at the top of the Collections section. A new
  Collection opens ready for its name.
- **Put tracks in it** by dragging a selection onto it, or by right-clicking a
  selection and choosing **Add to Collection…**.
- **Arrange it** by dragging rows inside it. A Collection opens in the order you
  arranged, not alphabetically, and that order is saved.
- **Move and file** Collections by dragging them between folders.
- **Rename** with F2 or the pencil, **delete** with Delete or the ✕.

A delete says what it will remove before it removes it — "this folder and the
three Collections in it" — and **no Collection operation ever deletes a track**.
Removing a track from a Collection removes it from that list and nowhere else.

The same track can be in a Collection twice, if you put it there twice on
purpose. Dropping a selection that is already partly there tells you what it
skipped rather than quietly making duplicates.

## Smart Collections

A Smart Collection is a saved filter. Build a filter in the bar above the
table — genre is Techno, BPM between 122 and 126, rated 4 or more — and choose
**Save as Smart Collection…**.

It keeps asking. A track you import next month that matches the rules appears in
it without you doing anything, and a track that stops matching leaves.

- **Open one** and its rules load into the filter bar, so you can see what it
  asks and change it.
- **Change the rules** and the bar says "modified, not saved". You then choose:
  update the Collection, save the change as a second one, or keep the change as
  an ordinary filter and leave the saved one alone. Nothing is decided for you.
- **Duplicate** one to start a second, separate saved filter from it. The two
  never speak again.
- **Freeze** one to turn what it matches *right now* into an ordinary
  Collection. The frozen copy stops changing; the Smart Collection carries on.

A Smart Collection holding a rule about a tag or a Collection you later delete
is shown with a warning marker rather than hidden, and it says which rule broke.

## Tags

A tag is a word you put on a track — Peak-time, Opener, Needs a trim — and then
filter by. A track can carry as many as you like.

- **Add one** from a track's right-click menu, or from the Inspector on the
  right. Typing a name that does not exist yet offers to make it.
- **Filter by one** in the filter bar: choose Tag, and pick from the tags your
  library actually uses, with the number of tracks beside each.
- **Tend the vocabulary** with the **Tags…** button beside the filter bar:
  rename, recolour, give a category, merge two into one, or delete.

Every tag shows how many tracks carry it, and both destructive actions say so
before they happen: deleting Peak-time is one thing when three tracks have it
and another when four hundred do.

Merging takes one tag off and puts the other on, everywhere at once, and then
removes the one you merged away. It is the fix for noticing you have both
"Peak Time" and "Peak-time".

## Ratings, favorites and notes

CuePoint keeps its own rating for a track, separate from the one Rekordbox
imported. The Inspector shows both, and says which one you are looking at.

- **Rate** from the Inspector or from a track's right-click menu.
- **Clear** a CuePoint rating and the track falls back to Rekordbox's, rather
  than becoming unrated.
- **Favorite** is a yes-or-no of its own, and filterable.
- **Notes** are free text, for the thing that is not a tag.

Every change is recorded. The Inspector's History shows what changed, when,
and what it was before — which is how you find out what a refresh did, and what
you did last Tuesday. A change you made in CuePoint has a **Revert** button
there; see [Taking a change back](library.md#taking-a-change-back).

## Changing a lot of tracks at once

Select some tracks and the actions apply to all of them. Select **everything
matching** — the button that appears when you select all — and the actions apply
to every track your current search and filters match, which may be tens of
thousands.

A change over more than a handful asks first, and says how many. It then runs in
the background with a progress bar and a Cancel button, and you can keep working
while it does. Cancelling stops it where it is; what was already changed stays
changed, and the History of each track says what happened.

There is no undo button, but a whole change can be taken back: its entry in the
**Activity** panel offers **Revert this batch**. The exception is adding tracks
to a Collection or removing them from one, which cannot be reverted — add or
remove them again instead. That is why every step says its number first.

## What a refresh does to all of this

Refreshing re-reads your Rekordbox export. Tracks that are no longer in it are
deleted, and **their ratings, tags, notes, history and Collection membership go
with them.**

If any of those tracks are filed in a Collection, the preview says so before
anything happens — "3 tracks you are about to remove are used in 2 Collections"
— and you have to tick a box to continue. This is the one place CuePoint asks
twice, because it is the one place a refresh destroys work that exists nowhere
else.

A Collection a refresh has emptied says so, rather than inviting you to drop
tracks into it as though it were new.

## What Rekordbox does and does not see

**Nothing you do here is visible in Rekordbox.** Collections are not playlists,
CuePoint ratings are not Rekordbox ratings, and tags are not written into your
audio files. CuePoint never modifies your XML export or your music files.

That is deliberate: a tool that reads your library and writes only to its own
database is one whose mistakes are recoverable. Carrying your organization back
out to Rekordbox is a later release, and it will be something you ask for
explicitly rather than something that happens.

Two things follow from it:

- Rekordbox playlists shown in the left pane are a mirror, and are read-only by
  every path. You cannot drag into them, and nothing here changes them.
- If you also use inCrate, it still keeps its own separate copy of your
  collection — see [Your library](library.md#incrate-keeps-a-separate-inventory).
  Collections and tags are not shared with it.

## Where the data lives

In the same SQLite file as the rest of your library
(`~/.cuepoint/cuepoint.db` on macOS and Linux, `%USERPROFILE%\.cuepoint\` on
Windows). CuePoint backs it up on launch and keeps the last several backups.

**Those backups are the only copy of this work.** A track can be re-imported
from Rekordbox; a rating, a note, a tag and a Collection cannot be recovered
from anything else. Restoring a backup brings all of it back together — the
tree, the membership and its order, the tags with their colours and categories,
the ratings, the notes, and the history behind them.

## See also

- [Your library](library.md) — importing, browsing and refreshing
- [Performance](performance.md#your-own-collections-tags-and-ratings) — measured
  timings for Collections, tags and large changes
- [The CuePoint window](the-window.md) — navigation, search and the Inspector
