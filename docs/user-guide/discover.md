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
used last. From any track in your library you can also open its
[artist's or label's page](#artist-and-label-pages) and its
[similar tracks](#similar-tracks); both are part of Discover, so the sidebar
keeps **Discover** highlighted while you are on them.

Discover replaces **inCrate**, which used to sit under **Tools** in the sidebar.
See [Where inCrate went](#where-incrate-went) if you used it.

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

**Start run** hands the run to CuePoint. It runs in the background:
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

**"Not owned" means CuePoint has no match for it, not that the file is
missing.** Owned is worked out from your accepted matches every time a run is
opened, so a track you own but have not matched in Clean reads as not owned —
and reads as owned as soon as you accept its match, in every run, old ones
included. If Discover shows you a track you know you have, match that track in
Clean.

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

Discover reads Beatport with your own Beatport token, entered in **Settings →
Beatport** in the **Beatport token** field (**Kept on this computer only**). Without one, or when Beatport does not accept it, the
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

### Getting a token

Beatport does not hand out tokens from your account page. You ask for API
access, and then exchange what they give you for a token.

1. Fill in [Beatport's API key request form](https://accounts.beatport.com/developer/request-api-key)
   (app name, what you will use it for) and wait for approval. Beatport then
   sends you a **client ID**, and possibly a **client secret**, with the rules for
   which sign-in flows you may use. Without a client ID you cannot get a token.
2. Use your client ID to get an **access token** from Beatport. With a client
   secret and a Beatport account, use the password flow. With only a client ID,
   use the authorization code flow. Both are written out in the
   [Beatport v4 reference](../development/beatport-v4-api.md#getting-a-token).
   Keep your client secret private. The answer is a JSON object; the token is its
   `access_token` value.
3. In CuePoint, open **Settings → Beatport**, paste the token into **Beatport
   token** and choose **Save token**. The field hides the value and shows a masked copy once
   it is saved; to replace the token, enter a new one.
4. Choose **Test connection**. CuePoint calls Beatport once and tells you whether
   it accepted the token (in green) or rejected it (in red), so you do not have to
   start a run to find out.

The same steps, shortened, are under **How do I get a token?** in Settings →
Beatport.

You can set the environment variable `BEATPORT_ACCESS_TOKEN` instead. It takes
priority over the saved token.

A token expires after a while (Beatport's answer says when, in `expires_in`).
CuePoint does not refresh it: when Discover says **Beatport rejected the
token**, get a new one as above, or use the refresh token you got with the first
(see the reference), and save it.

### Linking tracks to Beatport

When your library has matched tracks that Discover has not read from Beatport
yet, the page says how many and offers **Resolve Beatport identities**. It reads
those tracks from Beatport — which artists and labels they credit, by their
Beatport ids — so runs find your artists and labels by id rather than by name.
It runs in the background, shown as **Linking tracks to Beatport**, and only
when you ask.

## Artist and label pages

An artist's page shows your own tracks by that artist and, from Beatport,
their recent releases; a label's page does the same for a label. Open one from
anywhere you meet a track:

- **The Inspector.** A track's artist credit is shown as written, with each
  artist in it a link — "Mara Veil, Kiko" is two links — and its label is a
  link just below. The remixer credit is linked the same way.
- **The right-click menu, and Actions… in the selection bar**, with one track
  selected: **Artist page** (a list to choose from when the track credits
  several artists) and **Label page**.
- **A filter chip** that names one artist or label, such as "Credited artist
  is Mara Veil": **Open page**.
- **A page's own header**, which links an artist's labels and a label's
  artists.

### Grouped by name, or a Beatport artist

Artists share names, and one artist's name is spelled several ways, so a page
always says how it knows who it is about:

- **Grouped by name** — your tracks whose credit (or label) spells this name,
  ignoring case, accents and punctuation: "Âme", "AME" and "Ame" are one page.
  CuePoint does not know this artist's Beatport id yet.
- **Beatport artist** or **Beatport label** — CuePoint knows the Beatport id,
  from your tracks that are matched on Beatport and whose identities it has
  resolved (see [Linking tracks to Beatport](#linking-tracks-to-beatport)).
  The page holds the tracks Beatport credits to that id, and your other tracks
  spelled the same way, and says which spellings it includes. A name page you
  open for someone CuePoint has since identified becomes their Beatport page,
  and says it was opened by name.

The header gives how many of your tracks the page holds, the years they span,
their genres, and an artist's labels or a label's artists.

### Your tracks

The first half is the Library's own table, over exactly the tracks the header
counts, newest first. These are your tracks, so they behave as they do in the
Library: double-click one to play it with the rest of the table queued after
it, and use the right-click menu for **Play next**, **Add to queue**, **Similar
tracks** and the track's pages. Selecting a track shows it in the Inspector.

**Open in Library** opens the Library filtered to this page's tracks, so you
can tag, rate or collect them there. **Save as Smart Collection…** saves the
same filter as a Smart Collection that keeps up with your library.

### On Beatport

The second half lists the artist's or label's tracks released on Beatport in
the last year (for an artist) or the last three months (for a label), newest
first, marking the ones you own and the ones on your wantlist. Tick **Hide
tracks you own** to see only what is new to you. The same actions as a run's
table work here: **Add to wantlist**, **Push to Beatport playlist…** and **Open
on Beatport** (see [What you can do with Beatport
tracks](#what-you-can-do-with-beatport-tracks)). CuePoint keeps what it read
for up to twelve hours; **Read again** asks Beatport now.

When there is nothing to list, the half says why:

| It says | Means | What to do |
| --- | --- | --- |
| **Known by name only** | CuePoint does not know this artist's Beatport id. It never searches Beatport for an artist by name, because the wrong artist of the same name is worse than none | **Resolve Beatport identities**, when some of the artist's tracks are matched on Beatport |
| **Several Beatport artists share this name** | Your tracks by this name are matched to different Beatport artists | Choose the one you mean |
| **Not found on Beatport** | Beatport has no label by this name | — |
| **Beatport is not connected**, and the other token states | As at the top of Discover (see [A Beatport token](#a-beatport-token)) | **Open Settings**, or **Try again** |

A label known only by name is looked up on Beatport by its name, and the page
says **Found by name on Beatport** when it was.

Your tracks half works without a token and offline; only the Beatport half
needs Beatport.

## Similar tracks

**Similar tracks**, on a track's right-click menu or its Actions… menu, lists
the tracks in your library closest to it, best first, and says why each one is
there. It works offline, needs no token, and only ever suggests your own
tracks.

A suggestion scores for being close in tempo (or at half or double time),
compatible in key on the Camelot wheel, and sharing the genre, the label or an
artist, each by the values CuePoint shows for your tracks — your own
corrections included. The **Reasons** column says which, in words:

| Reason | Means |
| --- | --- |
| **Same tempo: 124** | The same BPM |
| **Close tempo: 124 → 126** | Within 6% of the track's BPM; the closer, the higher it scores |
| **Half time: 124 → 62** / **Double time: 124 → 248** | Half or double the BPM, which mixes the same |
| **Same key: 8A** | The same key |
| **One step on the wheel: 8A → 9A** | One step either way around the Camelot wheel, in the same mode |
| **Relative key: 8A → 8B** | The relative major or minor |
| **Same genre**, **Same label** | The same genre or label, ignoring case and accents |
| **Shared artist** | An artist both tracks credit, as artist or remixer |

**Score** adds up the points of its reasons, out of 100. A track with no BPM or
key is compared by what it has, and the page says what it could not compare by.
Keys are Beatport's (or your own correction), shown in Camelot, so a track that
has not been matched has no key to compare.
Other copies of the same track (the ones Clean groups as duplicates) are left
out, because the same track again is not a suggestion.

Suggestions are your own tracks: double-click one to play the list from there,
and use the right-click menu to **Play next** or **Add to queue**. **Similar
tracks** on a suggestion's menu makes it the next track to compare with. The
Inspector shows the track you are comparing with until you select a suggestion.

## Where inCrate went

Discover does everything inCrate did, on the library you already imported:
inCrate kept its own copy of your collection, filled in missing labels by
matching on its own, ran as one long wait, kept nothing it found, and could not
tell a track you own from one you do not. **Tools** and its landing page are
gone too; the app opens on the **Library** when it has nowhere else to go, and
an old `inCrate` bookmark or remembered page opens Discover.

**What inCrate kept is still on your computer, and nothing reads it any more.**
CuePoint does not delete your files, so these stay where they were until you
remove them. Both are safe to delete by hand:

| What | Where |
| --- | --- |
| inCrate's inventory (its copy of your collection) | Windows: `%APPDATA%\CuePoint\incrate\inventory.sqlite` · macOS: `~/Library/Application Support/CuePoint/incrate/inventory.sqlite` · Linux: `~/.local/share/CuePoint/incrate/inventory.sqlite` — or wherever `incrate.inventory_db_path` in `config.yaml` pointed |
| inCrate's past results | Windows: `%LOCALAPPDATA%\CuePoint\incrate_past_results.json` · macOS: `~/Library/Application Support/CuePoint/incrate_past_results.json` · Linux: `~/.local/share/CuePoint/incrate_past_results.json` |

Playlists inCrate made on your Beatport account are yours and stay there.

**Settings keep their `incrate.` names.** The Beatport token is still stored as
`incrate.beatport_access_token` in `~/.cuepoint/config.yaml`, and Discover's
defaults as `incrate.new_releases_days`, `incrate.discovery_genre_ids` and
`incrate.playlist_name_format`: the prefix is historical, and renaming it would
break your existing file. These inCrate settings are read by nothing now, and
you may delete them from the file: `incrate.inventory_db_path`,
`incrate.enrich_on_first_import`, `incrate.enrichment_delay_seconds`,
`incrate.beatport_username` and `incrate.beatport_password`. CuePoint does not
edit the file to remove them, and still loads it with them in it.

## See also

- [Your library](library.md) — importing, browsing and the Inspector
- [Clean](clean.md) — matching your tracks on Beatport, which is how Discover
  knows what you own
- [The CuePoint window](the-window.md) — the sidebar, the status strip and
  Activity
