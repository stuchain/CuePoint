# The CuePoint window

CuePoint's window is one frame that stays put while you move around it. The
page you are on changes; everything around it does not.

## What is on screen

| Region | Where | What it does |
| --- | --- | --- |
| Menu bar | Top | The app menu, including Help |
| Search | Below the menu bar | Searches your library — see [Searching](#searching) |
| Navigation | Left | Moves between pages; collapses to an icon rail |
| Page | Middle | Whatever you are working on |
| Track Inspector | Right | Details for a selected track; can be resized or hidden |
| Status strip | Bottom | Engine connection, running jobs, and the Activity panel |

The window remembers how you leave it. Collapse the navigation, resize or hide
the Inspector, and it will look the same the next time you open CuePoint. It
also reopens on the page you were last using.

## Navigating

The sidebar lists the pages available to you. Pages that are still being built
are not shown at all rather than appearing and doing nothing.

**Library** is where your Rekordbox collection lives — see
[Your library](library.md). **Clean** is where it is matched on Beatport and
kept tidy — see [Clean](clean.md). **Discover** finds new music on Beatport — see
[Discover](discover.md). **Prepare** is where a set is planned as a running
order, and it reopens on the Set you had open — see [Prepare](prepare.md). On
Prepare, selecting an entry adds **In this Set** to the Inspector, above the
track's own details. The older **inKey** and **Results** pages became Clean,
and **inCrate** became Discover; a link to any of them opens the page that
replaced it. There is no **Tools** group any more: when CuePoint has no page to
reopen, it opens on the Library. Double-clicking a track there plays it; the bar
along the bottom of the window is the player, and it appears the first time you
play something — see [Playing music](player.md).

Collapse the sidebar with the button at its top, or press **Ctrl+B**. Collapsed,
it shows icons only; hover any icon to see its name, and screen readers still
announce the full label.

## Searching

Press **Ctrl+K**, or click the search field, and type at least two characters.
Search looks at track titles, artists, albums and labels.

If you have not imported a Rekordbox collection yet, search says so rather than
reporting that nothing matched — those are different problems. Import one from
the [Library](library.md) page.

**Ctrl+K searches your whole library. Ctrl+F searches the table in front of
you.** They are deliberately different keys, because they do different things.

## The Track Inspector

The panel on the right shows details for whatever track you have selected. Drag
its left edge to resize it, or use the arrow keys once the edge has focus. Hide
it with the **›** button or **Ctrl+I**; a small **‹** button brings it back.

If you sized it on a large monitor and later open CuePoint on a smaller screen,
it shrinks to fit rather than pushing the page off-screen — and returns to your
chosen width when there is room again.

On the Library and Clean pages it shows everything CuePoint knows about the
selected track: its artwork, your own values, its Beatport match, what Rekordbox
sent, and its history. See [The Inspector](library.md#the-inspector).

## The status strip

The strip along the bottom always shows whether the CuePoint engine is
connected.

If the engine stops unexpectedly, CuePoint restarts it for you — the strip
shows **Reconnecting to engine…** with the attempt count while it tries. After
three failed attempts it stops trying and offers a **Restart engine** button,
rather than retrying forever and hiding a real fault. Every start is listed in
Activity, so an engine that keeps dying is visible rather than silently patched
over.

While a job is running — matching a playlist, for example — the strip shows its
progress from wherever you are in the app, including a job that was already
running before the window was reloaded.

The waveform analysis shows as **Analyzing waveforms · 1,234 of 50,000**, counting
your whole library; hover over it for the rate and the time left. Its button is
**Pause** rather than Stop, because that is what it does: the analysis stays
paused, after a restart too, until you resume it from Clean → Health or
Settings → Waveforms. It also steps aside on its own for an import, a refresh, a
file check or a tag write, and carries on after them. See
[Waveforms](waveforms.md).

## Activity

Click **Activity** in the status strip, or press **Ctrl+Shift+A**, for a list of
what CuePoint has done, newest first: backups, engine starts, imports and
refreshes, file checks, matches, edits to many tracks at once, and tags written
to files.

Some entries can be acted on where they are listed. A change to many tracks
offers **Revert this batch**, and a tag write offers **Restore**; each asks once
more before it does anything. See
[Taking a change back](library.md#taking-a-change-back) and
[Restoring](library.md#restoring).

An interrupted Beatport match is listed here too, with **Resume**: resuming
matches only the tracks it had not reached. See [Clean](clean.md#matching).

## Keyboard shortcuts

To see the shortcuts, press **F1** or **Ctrl+?**, or choose **Help > Keyboard shortcuts...**. The dialog lists them by context (Global, Library, Clean, Player and so on). Type in its **Search** field to filter the list by context, action or key. It is a reference: it does not rebind keys. Some keys it lists, such as **Ctrl+O**, **Ctrl+E**, **F5**, **Ctrl+R**, **Ctrl+H**, **Ctrl+,** and **Ctrl+Shift+F**, have no action in the window yet. The keys below are the ones that work.

| Shortcut | Does |
| --- | --- |
| **Ctrl+K** | Search your library |
| **Ctrl+F** | Search within the table on screen |
| **Ctrl+A** | Select every track matching what you are looking at |
| **Esc** | Let go of a selection, or close what is open |
| **Ctrl+B** | Collapse or expand the navigation |
| **Ctrl+I** | Show or hide the Track Inspector |
| **Ctrl+Shift+A** | Open Activity |
| **F1** or **Ctrl+?** | All keyboard shortcuts |

In Clean's review queue:

| Shortcut | Does |
| --- | --- |
| **Up** / **Down** | Previous or next track |
| **Left** / **Right** | Choose another candidate |
| **A** | Accept the chosen candidate |
| **R** | Reject the match |
| **N** | Next track without deciding |

These keys do nothing while you are typing in a field or have a dialog open.

The player's keys (**Space**, **Ctrl** with the arrow keys, and the media keys) are in [Playing music](player.md#from-the-keyboard).

Every part of the window can be reached with **Tab** alone, in the order it
appears on screen: search, navigation, page, Inspector, status strip. Dialogs
take focus when they open, keep **Tab** inside themselves, close on **Escape**,
and hand focus back to whatever opened them.

## Settings

**Settings** is one page in sections, with a list of links at the top (in a rail
on the left when the window is wide) that scroll to each: **Appearance**,
**Motion**, **Playback**, **Waveforms**, **Beatport**, **Rekordbox export**,
**Privacy** and **About & updates**. A setting that applies the moment you change
it shows a small **Saved** beside it for a couple of seconds. **About & updates**
shows the version and has **Getting started**, which opens the first-run
walkthrough again.

## Motion

**Settings → Motion** has a switch for each of ten kinds of movement, in three
groups. **When you act**: **Button presses**, **Things you drag and drop** and
**Hover and keyboard focus**. **When things change**: **Changing state**,
**Opening and closing panels and dialogs**, **Changing page**, **Moving between
views** and **Alerts and confirmations**. **While you wait or scroll**:
**Loading** and **Scrolling**. Each switch has a line saying what moves, and a
small square beside it that moves once when you turn the switch on. **Turn all
on** and **Turn all off** set all ten at once, and **Reset to defaults** (which
asks first, and offers **Undo**) turns them all back on.

The first line says whether your system's Reduce motion setting is on. While it
is, nothing moves, whatever the switches say, and they work again as soon as you
turn it off. Turning a kind off never hides anything: you still see the same
words and states, just without the movement. Today a button's press and a
message sliding in obey their switches; the other kinds will move as more of the
app gains motion.

## Size and theme

**Settings → Appearance** has two choices, both remembered. **Active theme** is
**Neo dark**, **Retro 16-bit**, **Classic**, **Club neon** or **Muted**, or a
custom theme you made: **Create custom theme…** asks for nine colors, and the
borders and bevels are made from them. **Delete** asks first. **Size of text and
controls** is **Small (1×)**, **Large (2×)** (the default) or **Extra large
(3×)**. The interface is pixel art, so it scales in whole steps and edges snap to
whole pixels at every size, which keeps it sharp.

**Reset to defaults** sets Neo dark at the default size after asking, and the
message that follows has **Undo**. Your custom themes are kept.

## Privacy and error reports

**Settings → Privacy** has a switch, **Send error reports**, on by default in released builds.
When CuePoint hits an unexpected error, it sends one report to Sentry (EU region) so the bug can be
fixed. A report says what went wrong, where in CuePoint's code, the steps that led to it, the
version and your operating system. It never carries your file, folder, track, artist, label or
playlist names, your notes, tags or tokens. Turn the switch off and nothing more is sent, at once,
with no restart. **Help → Privacy...** shows whether it is on and takes you to the switch; the full
list, and how long Sentry keeps a report, is in the [Privacy Notice](../policy/privacy-notice.md).
The CLI never sends error reports.

Under **When CuePoint quits**, **Clear cache** and **Clear logs** clear them each
time CuePoint closes. They are the same two choices as in **Help → Privacy...**
(which links here), so the two always agree.
