# Discover

**Discover** finds new music on Beatport from the artists and labels in your
library: charts your artists made, and recent releases on your labels. It keeps
every run it makes, knows which of the tracks it finds you already own, and
gives the ones you want somewhere to go — a **wantlist** in CuePoint, or a
playlist on your Beatport account.

It works on the library you imported on the [Library](library.md) page, so
import a collection first. It reads Beatport with your Beatport token, which is
entered in **Settings** (see [A Beatport token](#a-beatport-token)).

Discover has two tabs, **Runs** and **Wantlist**, and reopens on the tab you
used last.

> inCrate is still in the sidebar under **Tools**, unchanged, while Discover
> takes over its work. A later release retires it; nothing in Discover reads or
> changes inCrate's own inventory.

## Runs

The **Runs** tab lists every run you have made, newest first, each with its
date, how it ended, what it looked for and how many tracks it found. Choose a
run to open it beside the list, or **New run** to start another. When the page
is narrow, the list sits above the run instead of beside it.

### Starting a run

**New run** asks what to look for, starting from your defaults:

- **Chart genres** — Beatport charts in these genres, made by artists in your
  library, between the two **Charts** dates. With no genre chosen, the run
  reads no charts.
- **Releases from the last … days** — new releases on your labels in that many
  days.
- **Artists** and **Labels** — every artist or label in your library, only the
  ones you choose (from a list of the names in your library, with how many
  tracks each has), or none.

**Start run** hands the run to CuePoint's engine. It runs in the background:
the status strip shows **Reading charts**, **Resolving labels** or **Reading
releases** with its progress and a **Stop** button, and you can keep working.
The run appears in the list as soon as it starts, and its tracks appear while
it runs. A run you stop keeps what it had found.

### A run's tracks

An opened run says what it looked for and how it ended — including why, if
Beatport stopped it — and lists what it found: title and mix, artists, label,
release date, BPM, key, genre, which chart or release it was found in, whether
you own it, and whether it is on your wantlist.

**Tracks you already own are hidden**, and the page says how many: "12 owned
tracks hidden". A track counts as owned when a track in your library has an
accepted Beatport match to it (see [Clean](clean.md)). Tick **Show tracks you
own** to see them too.

Sort by title, artists, release date, or the order the run found them, by
clicking a column's header. **Columns…** chooses which columns to show, and the
table remembers its layout.

**Delete run…** removes a run and its list of tracks. Tracks you added to the
wantlist from it stay there.

## The wantlist

The **Wantlist** tab lists the Beatport tracks you want, with a note, the date
you added each, and whether you bought it. Two filters, used together:

- **Owned** — tracks your library has (through an accepted match), or not.
- **Bought** — tracks you marked bought, or not.

So "bought, but not in my library yet" is **Bought only** with **Not owned**.
Marking a track bought is your own note; it reads as owned once you import the
file and Clean matches it.

## What you can do with Beatport tracks

Select tracks with a click, add to the selection with Ctrl-click (Cmd-click on
macOS), and extend it with Shift-click. What you can do depends on what is
selected, and the same actions are on the right-click menu:

| Action | Where | What it does |
| --- | --- | --- |
| **Add to wantlist** | A run | Adds the selected tracks to your wantlist, noting the run they came from. A track already there is left as it is |
| **Push to Beatport playlist…** | Both | Makes a new playlist on your Beatport account with the selected tracks — or, with nothing selected, every track the table shows, in its order |
| **Open on Beatport** | Both | Opens each selected track's Beatport page in your browser, up to ten at once |
| **Edit note…** | Wantlist, one track | A note of your own, up to 1,000 characters. Leave it empty to clear it |
| **Mark bought** / **Mark not bought** | Wantlist | Marks the selected tracks bought, or takes the mark away when all of them are marked |
| **Remove from wantlist** | Wantlist | Takes the selected tracks off the wantlist |

**Pushing to a playlist** asks for the playlist's name (today's date by default)
and whether to include tracks you already own, which it leaves out unless you
tick **Include tracks you already own**. The push runs in the background, shown
in the status strip as **Pushing to Beatport**; when it ends, the page says how
many tracks were added and offers **Open the playlist**. If Beatport refuses the
token for playlists, the page says so and nothing is made.

Beatport tracks are not tracks in your library: they have no file, so a
double-click does nothing, they cannot be played, and the Inspector shows
nothing for them.

## A Beatport token

Discover reads Beatport with your own Beatport token, entered in **Settings**
under **Beatport token**. Without one, or when Beatport does not accept it, the
page says so at the top, with **Open Settings**, which takes you straight to the
token field:

| The page says | Means | What to do |
| --- | --- | --- |
| **Beatport is not connected** | No token is set | Enter one in Settings |
| **Beatport rejected the token** | The token is wrong or has expired | Enter a new one in Settings |
| **Beatport refused this token** | The token works but is not allowed to do this | Enter a token that is |
| **Beatport is limiting requests** | Too many requests; it says how long to wait | **Try again** later |
| **Beatport cannot be reached** | No connection, or Beatport is down | **Try again** later |

Without a token you can still open past runs and use your wantlist; a new run
and a push need one.

### Resolving Beatport identities

When your library has matched tracks that Discover has not read from Beatport
yet, the page says how many and offers **Resolve Beatport identities**. It reads
those tracks from Beatport — which artists and labels they credit, by their
Beatport ids — so runs find your artists and labels by id rather than by name.
It runs in the background, shown as **Resolving Beatport identities**, and only
when you ask.

## See also

- [Your library](library.md) — importing, browsing and the Inspector
- [Clean](clean.md) — matching your tracks on Beatport, which is how Discover
  knows what you own
- [The CuePoint window](the-window.md) — the sidebar, the status strip and
  Activity
