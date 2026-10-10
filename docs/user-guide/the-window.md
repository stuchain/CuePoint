# The CuePoint window

CuePoint's window is one frame that stays put while you move around it. The
page you are on changes; everything around it does not.

## What is on screen

| Region | Where | What it does |
| --- | --- | --- |
| Menu bar | Top | CuePoint's one menu bar: File, Edit, View and Help (see [The menu bar](#the-menu-bar)) |
| Search | Top of the window | Searches your library — see [Searching](#searching) |
| Camelot wheel | Top of the window, beside search | Shows which keys mix with a track — see [The Camelot wheel](#the-camelot-wheel) |
| Sidebar | Left | The CuePoint logo, then the pages; collapses to an icon rail |
| Page | Middle | Whatever you are working on |
| Track details | Right | Details for a selected track; can be resized or hidden |
| Status strip | Bottom | Whether CuePoint is ready, what is running in the background, and the Activity panel |

The window remembers how you leave it. Collapse the navigation, resize or hide
Track details, and it will look the same the next time you open CuePoint. It
also reopens on the page you were last using.

## Navigating

The sidebar lists the pages available to you, with the CuePoint logo and name at
its top (click them to go home, to the Library). Each page has a one-line hint
under its name, and the same line is its tooltip when the sidebar is collapsed:
**Library** "Your Rekordbox tracks", **Collections** "Your own groups and smart
lists", **Keys** "The keys in your playlists, Collections and Sets", **Clean** "Fix values with Beatport", **Discover** "Find new music",
**Prepare** "Plan a set", **Statistics** "See what you play most and how your library is made up" and **Settings** "Look, sound, accounts". **Collections**
sits indented under **Library**, because it is a way into the Library page's own
tree; **Keys** follows it (see [Keys](keys.md)). **Settings** is pinned to the bottom, under a thin line.

Until you import a Rekordbox collection, **Collections**, **Keys**, **Clean**, **Discover**,
**Prepare** and **Statistics** are dimmed and their hint reads "Import your Rekordbox collection
first". They still open: they just have nothing to show yet. They light up on their
own after the first import.

**Library** is where your Rekordbox collection lives — see
[Your library](library.md). **Clean** is where it is matched on Beatport and
kept tidy — see [Clean](clean.md). **Discover** finds new music on Beatport — see
[Discover](discover.md). **Prepare** is where a set is planned as a running
order, and it reopens on the Set you had open — see [Prepare](prepare.md). On
Prepare, selecting an entry adds **In this Set** to Track details, above the
track's own details. **Statistics** follows Prepare and shows what you play most and how your library is made up — see [Statistics](statistics.md). The older **inKey** and **Results** pages became Clean,
and **inCrate** became Discover; a link to any of them opens the page that
replaced it. There is no **Tools** group any more: when CuePoint has no page to
reopen, it opens on the Library. Double-clicking a track there plays it; the bar
along the bottom of the window is the player, and it appears the first time you
play something — see [Playing music](player.md).

Collapse the sidebar with the arrow button under the logo (**Collapse sidebar
(Ctrl+B)**), or press **Ctrl+B**, or choose **View > Sidebar**. Collapsed, it shows
the logo and icons only; hover any icon to see its name and hint, and screen readers
still announce the full label.

## Searching

Press **Ctrl+K**, or click the search field, and type at least two characters; one
letter shows "Keep typing: at least 2 letters". Search looks at track titles,
artists, albums and labels.

The results are a list you can use from the keyboard: **Up** and **Down** move
through them, **Enter** (or a click) opens the Library on that track, selected, with
its details in Track details, and **Shift+Enter** plays it. Each row also has a
small play button. The results close when you click anywhere else, tab away or press
**Esc**; clicking in the field brings them back.

If you have not imported a Rekordbox collection yet, search says so rather than
reporting that nothing matched — those are different problems. Import one from
the [Library](library.md) page. If CuePoint is still starting, search says "Search
will work once CuePoint has finished starting." If a search fails, it says "Search
didn't work. Try again."

**Ctrl+K searches your whole library. Ctrl+F searches the table in front of
you.** They are deliberately different keys, because they do different things.

## The Camelot wheel

The button beside the search field opens a wheel of the 24 keys, drawn in pixels: the
minor keys (A) in the inner ring and the major keys (B) in the outer one, 12 at the
top like a clock. It lights the key of the track you have selected, or, with nothing
selected, the track that is playing, and the keys that mix with it: one step either
way round the wheel in the same ring, and the relative key in the other ring. A line
under the wheel names the track and its key, for example "Selected: Strobe · 8A" or
"Playing: Strobe · 8A".

The key is the track's Beatport key (see [Library](library.md)); Rekordbox's key is
not used. So the wheel says what is missing:

- With no track selected or playing it lights nothing and says "Select or play a
  track to light its key."
- A selected track with no Beatport key lights nothing and says "This track has no
  Beatport key yet", with **Match on Beatport**, which opens Clean. It does this even
  while a track with a key plays: the track you selected wins.
- If no track in your library has a key yet, it says "No track in your library has a
  Beatport key yet." with **Match tracks…**.

**Click a key** to open the whole Library on every track in that key, in any
notation: the click replaces the search, the filters, the quick-filter chips and the
playlist or Collection you had open, with one filter, "Key is 9A". Each key's tooltip
says so ("9A: show every 9A track in the Library"). The Library's **Key** list can then
add the other keys that were lit.

From the keyboard, **Tab** to the wheel button and press **Enter**; inside, the
**Left** and **Right** arrows move round the ring, **Up** and **Down** switch rings,
and **Enter** filters. **Esc**, a click outside or the button again closes it. Each
key is a button named for what it is, for example "8A, A minor, compatible".

The key in the [player bar](player.md#the-player-bar)'s track line opens the same
wheel for the playing track, whatever is selected, captioned "Playing: …".

## The menu bar

CuePoint has one menu bar, its own, in place of the generic one Electron adds and
the small Help menu CuePoint used to draw inside the window.

- **CuePoint** (on a Mac only): **About CuePoint**, **Settings...** (**Cmd+,**) and
  **Quit**.
- **File**: **Import another file...** (**Ctrl+O**) opens the Library and asks for a
  Rekordbox XML file, as the Library's own button does; **Check Rekordbox for
  changes** starts the same check. Exporting is not here: it stays on the Library
  and on a Collection's or Set's own bar, because a menu item has no scope.
- **Edit**: **Undo**, **Redo**, **Cut**, **Copy**, **Paste** and **Select all**, so
  copying and pasting work in every text field, including the Beatport token.
- **View**: **Size** (Small, Medium, Large and Extra large, with the one in use
  ticked), **Bigger** (**Ctrl+=**), **Smaller** (**Ctrl+-**), **Default size**
  (**Ctrl+0**), **Track details**, **Sidebar**, and, on Windows and Linux,
  **Settings...** (**Ctrl+,**). These keys change the Size setting, the same one as
  Settings → Appearance; they never zoom the page.
- **Help**: **Getting started**, **Shortcuts**, **Report a problem...**, **Privacy**
  (opens Settings → Privacy), then **Troubleshooting** (**Diagnostics...**, **Log
  viewer...**, **Export support bundle...** and **How to export from Rekordbox...**),
  and on Windows and Linux **About CuePoint**.

A development build of CuePoint adds a **Developer** menu with reload and the
developer tools; a released build has neither.

## Track details

The panel on the right shows details for whatever track you have selected. Drag
its left edge to resize it, or use the arrow keys once the edge has focus. Hide
it with the **›** button or **Ctrl+I**. Hidden, it becomes a tab down the right
edge that reads **Track details** and the title of the selected track; one click
brings it back.

If you sized it on a large monitor and later open CuePoint on a smaller screen,
it shrinks to fit rather than pushing the page off-screen — and returns to your
chosen width when there is room again.

On the Library and Clean pages it shows everything CuePoint knows about the
selected track: its artwork, buttons to play it, your own values, what Rekordbox
sent, its Beatport match, and its history. Each part folds under its heading, and
the panel remembers which you folded. See [Track details](library.md#track-details).

## The status strip

The strip along the bottom says **Ready** when CuePoint is working normally. While
it starts it says **Starting up…**, and when its library service stops and comes
back it says **Reconnecting… (attempt 2 of 3)**. The version number is in
**Help > About CuePoint** and in Settings → About & updates.

If CuePoint's library service stops unexpectedly, CuePoint restarts it for you.
After three failed attempts it stops trying, says **CuePoint's library service
stopped** and offers a **Restart library service** button, rather than retrying
forever and hiding a real fault. Hover over the message for the technical reason.
Every start is listed in Activity, so a service that keeps stopping is visible
rather than silently patched over.

When nothing is running the strip shows nothing more. While something is running
in the background — matching a playlist, for example — the strip names it and shows
its progress from wherever you are in the app, including work that was already
running before the window was reloaded. Each count is written the same way:
**Matching on Beatport · 120 of 4,000**. Hover over the name, or tab to it, for
what CuePoint is doing and whether you can keep working.

When more than one thing is running, **+2 more** opens a small list of all of it,
each with its progress and a **Stop** button where the work can be stopped. Press
**Esc** or click elsewhere to close it.

The waveform analysis shows as **Analyzing waveforms · 1,234 of 50,000**, counting
your whole library; hover over it for the rate and the time left. Its button is
**Pause** rather than Stop, because that is what it does: the analysis stays
paused, after a restart too, until you resume it from Clean → Health or
Settings → Waveforms. It also steps aside on its own for an import, a refresh, a
file check or a tag write, and carries on after them. See
[Waveforms](waveforms.md).

## Activity

Click **Activity** in the status strip, or press **Ctrl+Shift+A**, for a list of
what CuePoint has done, newest first and grouped by day (**Today**, **Yesterday**,
then dates such as **Oct 3**): backups, app starts, imports and refreshes, file
checks, matches, edits to many tracks at once, and tags written to files. Each
entry has a short word for its kind and the counts and names that matter; the
rest of what was recorded is behind its **Details**.

Some entries can be acted on where they are listed. A change to many tracks
offers **Revert this batch**, and a tag write offers **Restore**; each asks once
more before it does anything. See
[Taking a change back](library.md#taking-a-change-back) and
[Restoring](library.md#restoring).

An interrupted Beatport match is listed here too, with **Resume**: resuming
matches only the tracks it had not reached. See [Clean](clean.md#matching).

## Keyboard shortcuts

To see the shortcuts, press **F1** or **Ctrl+?**, or choose **Help > Shortcuts**. The dialog lists them by context (Global, Library, Tables, Prepare, Clean, Player). Type in its **Search** field to filter the list by context, action or key. It is a reference: it does not rebind keys, and every key it lists does something. On a Mac, use **Cmd** where it says **Ctrl**.

| Shortcut | Does |
| --- | --- |
| **Ctrl+O** | Import another Rekordbox file |
| **Ctrl+,** | Open Settings |
| **Ctrl+=** / **Ctrl+-** / **Ctrl+0** | Bigger, smaller, the default size |
| **Ctrl+K** | Search your library |
| **Ctrl+F** | Search within the table on screen |
| **Ctrl+A** | Select every track matching what you are looking at |
| **Enter** | On the Library table: play the selected track |
| **Shift+F10** | On the Library table: open the track menu |
| **F2** / **Delete** | In the Collections list: rename or delete the selected Collection |
| **Alt+Up** / **Alt+Down** | On the Library table, in a Collection: move the selected track up or down |
| **Up** / **Down** | In any track table: select the previous or next track |
| **Shift+Up** / **Shift+Down** | Add the next track up or down to the selection |
| **Home** / **End**, **Page Up** / **Page Down** | Jump to the first or last track, or a page at a time |
| **Ctrl+Space** | Add or remove the focused track |
| **Esc** | Let go of a selection, or close what is open |
| **Ctrl+B** | Collapse or expand the sidebar |
| **Ctrl+I** | Show or hide Track details |
| **Ctrl+Shift+A** | Open Activity |
| **F1** or **Ctrl+?** | All keyboard shortcuts |

In Clean's review queue, **Up** and **Down** move through the queue instead.

On Prepare, **Left** / **Right** resize the source panel once its divider has focus,
and **Enter** saves an entry's In or Out time.

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
appears on screen: search, sidebar, page, Track details, status strip. Dialogs
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
words and states, just without the movement.

Everything that moves does so in whole-pixel steps, and every fade is smooth.
Here is where each kind shows:

- **Button presses**: a button moves down a notch while you press it, and so do
  checkboxes, radio buttons and the star rating. The **Saved** tick steps up into
  place.
- **Things you drag and drop**: a row you pick up dims and shifts aside, a row
  you drop settles into its place, the queue's drop marker steps in, and a
  column's resize handle shows a line while you hover or drag it.
- **Hover and keyboard focus**: buttons lift a notch under the pointer, sidebar and
  Settings links lean toward it, a row in a track table shows a bar on its edge,
  and a control steps into its focus ring.
- **Changing state**: a badge that changes kind or words steps once, the selected
  tab steps into place, and a section of Track details steps open when you open it.
  The Camelot wheel's lit keys step as they light, and on the Keys page a key's
  count steps when it changes, on the wheel and in the list.
- **Opening and closing panels and dialogs**: dialogs, menus, the search results,
  the **+N more** list, toasts and the Track details panel step in and fade out,
  and the Camelot wheel steps in and fades out. A closing dialog or menu takes no clicks while it
  fades: whatever is behind it takes them at once.
- **Changing page**: the new page steps in; the sidebar, header, player and
  status strip stay still. It never waits for the page's data.
- **Moving between views**: a search result glides into its row in the Library
  when you open it. That is the only one: a table row you pick does not move, so a
  double-click to play and a shift-click range always land.
- **Alerts and confirmations**: a time Prepare refuses, a chapter length it
  refuses, shakes; new search results and a finished background task pulse once.
- **Loading**: a small pixel spinner turns while the library is being read, and
  rows of a table that have not arrived yet pulse. Rows hold still while you scroll.
- **Scrolling**: in Settings, the link for the section you are reading steps in, and a
  section's heading settles as it comes into view. Track tables never animate as they
  scroll.

## Size and theme

**Settings → Appearance** has two choices, both remembered. **Active theme** is
**Neo dark**, **Retro 16-bit**, **Classic**, **Club neon** or **Muted**, or a
custom theme you made: **Create custom theme…** asks for nine colors, and the
borders and bevels are made from them. **Delete** asks first. **Size of text and
controls** is **Small (1×)**, **Medium (1.5×)** (the default), **Large (2×)** or
**Extra large (3×)**. Edges and lines snap to whole pixels at every size, so the
pixel style stays sharp. Table rows are as tall as the size says, so the text in
them is never cut. If you chose a size before, CuePoint keeps it; if you never
did, it opens at Medium.

**Reset to defaults** sets Neo dark at the default size after asking, and the
message that follows has **Undo**. Your custom themes are kept.

## Privacy and error reports

**Settings → Privacy** has a switch, **Send error reports**, on by default in released builds.
When CuePoint hits an unexpected error, it sends one report to Sentry (EU region) so the bug can be
fixed. A report says what went wrong, where in CuePoint's code, the steps that led to it, the
version and your operating system. It never carries your file, folder, track, artist, label or
playlist names, your notes, tags or tokens. Turn the switch off and nothing more is sent, at once,
with no restart. **Help → Privacy** opens Settings → Privacy, where the switch is; the full
list, and how long Sentry keeps a report, is in the [Privacy Notice](../policy/privacy-notice.md).
The CLI never sends error reports.

Under **When CuePoint quits**, **Clear cache** and **Clear logs** clear them each
time CuePoint closes. This is the one place those choices are made: the **Privacy
details** dialog explains them and links here.
