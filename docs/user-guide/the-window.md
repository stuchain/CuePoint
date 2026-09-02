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

Collapse the sidebar with the button at its top, or press **Ctrl+B**. Collapsed,
it shows icons only; hover any icon to see its name, and screen readers still
announce the full label.

## Searching

Press **Ctrl+K**, or click the search field, and type at least two characters.
Search looks at track titles, artists, albums and labels.

If you have not imported a Rekordbox collection yet, search says so rather than
reporting that nothing matched — those are different problems. Importing a
library is coming in a later release.

**Ctrl+K searches your whole library. Ctrl+F searches the table in front of
you.** They are deliberately different keys, because they do different things.

## The Track Inspector

The panel on the right shows details for whatever track you have selected. Drag
its left edge to resize it, or use the arrow keys once the edge has focus. Hide
it with the **›** button or **Ctrl+I**; a small **‹** button brings it back.

If you sized it on a large monitor and later open CuePoint on a smaller screen,
it shrinks to fit rather than pushing the page off-screen — and returns to your
chosen width when there is room again.

The Inspector is empty for now. It fills in as the pages that select tracks
arrive.

## The status strip

The strip along the bottom always shows whether the CuePoint engine is
connected. If the engine stops, the strip says so within a few seconds.

> **If the engine goes offline**, restart CuePoint. The engine does not
> currently restart on its own.

While a job is running — matching a playlist, for example — the strip shows its
progress from wherever you are in the app, including a job that was already
running before the window was reloaded.

## Activity

Click **Activity** in the status strip, or press **Ctrl+Shift+A**, for a list of
what CuePoint has done: imports, backups and edits, newest first.

This is not the same as **past searches**, which lists the result files from
previous matching runs.

Activity is empty until the features that record into it arrive.

## Keyboard shortcuts

| Shortcut | Does |
| --- | --- |
| **Ctrl+K** | Search your library |
| **Ctrl+F** | Search within the table on screen |
| **Ctrl+B** | Collapse or expand the navigation |
| **Ctrl+I** | Show or hide the Track Inspector |
| **Ctrl+Shift+A** | Open Activity |
| **Ctrl+,** | Settings |
| **F1** or **Ctrl+?** | All keyboard shortcuts |

Every part of the window can be reached with **Tab** alone, in the order it
appears on screen: search, navigation, page, Inspector, status strip. Dialogs
take focus when they open, keep **Tab** inside themselves, close on **Escape**,
and hand focus back to whatever opened them.

## Interface scale and theme

CuePoint draws at 1×, 2× or 3× and ships five themes; both live in
**Settings → Appearance**, and both are remembered. The interface is pixel art,
so it scales in whole steps to stay sharp.
