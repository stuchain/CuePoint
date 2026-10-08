# Discover

**Discover** finds new music on Beatport from the artists and labels already in
your library, lets you keep what you want on a **wantlist**, and sends it to a
playlist on your Beatport account. It reads the charts your artists made and the
recent releases on your labels, remembers every search it makes, and knows which
of the tracks it finds are already in your library.

It works on the library you imported on the [Library](library.md) page, so
import a collection first. It reads Beatport with your Beatport sign-in key (a
"token"), which you enter in **Settings** (see [A Beatport token](#a-beatport-token)).

Discover has three tabs, **New search**, **Results** and **Wantlist**, and
reopens on the tab you used last. From any artist or label name in a table you
can open that [artist's or label's page](#artist-and-label-pages), and from a
track's details in the Library you can open its
[Similar tracks](#similar-tracks). Both are part of Discover, so the sidebar
keeps **Discover** highlighted while you are on them. The first time you open
Discover a card says where they are; choose **Got it** and it stays away.

Discover replaces **inCrate**, which used to sit under **Tools** in the sidebar.
See [Where inCrate went](#where-incrate-went) if you used it.

## New search

**New search** asks what to look for, starting from your defaults. Press
**Start looking** when you are ready.

- **Genres for DJ charts.** On Beatport, artists publish charts, which are short
  lists of tracks they play. CuePoint reads the charts made by artists in your
  library, in the genres you tick. Tick no genre and it reads no charts. A line
  under the genres says which dates it will read ("Charts from the last 30
  days"); to choose other dates open **More options**, which holds **Charts
  from** and **Charts to**.
- **Releases from the last … days.** New releases on your labels in that many
  days.
- **Artists** and **Labels.** Every artist or label in your library, only the
  ones you choose (from a list of the names in your library, with how many
  tracks each has), or none.

**Start looking** hands the search to CuePoint, which does it in the
background. The status strip shows how far it has got, with a **Stop** button,
and you can keep working; the page opens **Results** on the new search as soon
as it begins. A search you stop keeps what it had found. The form keeps what you
filled in while you look at another tab.

## Results

**Results** lists every search you have made, newest first, each titled "Search
of" its date, with how it ended, what it looked for and how many tracks it found.
Choose a search to open it beside the list; when the page is narrow, the list
sits above it instead. With no search yet it says so and offers **New search**.

An open search says what it looked for and how it ended, including why, if
Beatport stopped it. While it works, the page says so in words and that it can
take a few minutes; the tracks it has found appear as they arrive. It lists what
it found: title and mix, artists, label, release date, BPM, key, genre, **Why
it's here** (the chart or release the track was found in), whether it is
**In your library**, and whether it is on your wantlist.

Artist and label names in the table are links to their pages. Press Tab to reach
them within a row; a click on one opens the page without selecting the row.

**Tracks already in your library are hidden** by default, with one switch,
**Hide tracks already in your library**, and one count line over the table:
"40 found · 12 already in your library (hidden)". Turn the switch off to see them,
marked **In your library**. A track counts as in your library when a track there
has an accepted Beatport match to it (see [Clean](clean.md)).

**"Not in your library" means CuePoint has no match for it, not that the file is
missing.** It is worked out from your accepted matches every time a search is
opened, so a track you have but have not matched on the Clean page is shown as
not in your library, and is marked as soon as you accept its match, in every
search, old ones included. If Discover shows you a track you know you have,
match that track in Clean.

Sort by title, artists, release date, or the order the search found them, by
clicking a column's header. **Columns…** chooses which columns to show, and the
table remembers its layout.

**Delete this search…**, on the search's row in the list, removes a search and
its list of tracks after asking. Tracks you added to the wantlist from it stay
there. A search that is still running cannot be deleted.

## The wantlist

The **Wantlist** tab lists the Beatport tracks you want, with a note, the date
you added each, and whether you marked it bought. It shows every wanted track,
including ones now in your library, which are marked **In your library**: it is
your own list, so nothing is hidden from it. Two filters, used together, each
**Any**, **No** or **Yes**:

- **In your library**: tracks your library has (through an accepted match), or not.
- **Marked bought**: tracks you marked bought, or not.

So "bought, but not in my library yet" is **Marked bought: Yes** with **In your
library: No**. Marking a track bought is your own note; it reads as in your
library once you import the file and Clean matches it. One line counts the
wanted tracks, how many are marked bought and how many are in your library.

An empty wantlist says how to fill it: add tracks from Results or an artist page.

## What you can do with Beatport tracks

Select tracks with a click, add to the selection with Ctrl-click (Cmd-click on
macOS), and extend it with Shift-click. The actions are always shown above the
table; the ones that need tracks are grayed out until you select some, and their
hint says why. The same actions are on the right-click menu:

| Action | Where | What it does |
| --- | --- | --- |
| **Add to wantlist** | Results, artist and label pages | Adds the selected tracks to your wantlist, noting the search they came from. A track already there is left as it is |
| **Make a Beatport playlist…** | Everywhere | Makes a new playlist on your Beatport account with the selected tracks, or, with nothing selected, every track the table shows, in its order. The hint beside it says which: "All 48 shown" or "3 selected" |
| **Open on Beatport** | Everywhere | Opens each selected track's Beatport page in your browser, up to ten at once |
| **Edit note…** | Wantlist, one track | A note of your own, up to 1,000 characters. Leave it empty to clear it |
| **Mark bought** / **Mark not bought** | Wantlist | Marks the selected tracks bought, or takes the mark away when all of them are marked |
| **Remove from wantlist** | Wantlist | Takes the selected tracks off the wantlist |

**Making a playlist** asks for the playlist's name (today's date by default)
and whether to include tracks already in your library, which it leaves out
unless you tick **Include tracks already in your library**. It makes a new
playlist each time. It works in the background, shown in the status strip, and
when it ends the page says how many tracks it made the playlist with and offers
**Open the playlist**. If Beatport refuses the token for playlists, the page says
so and nothing is made.

Beatport tracks are not tracks in your library: they have no file, so a
double-click does nothing and they cannot be played. Selecting one lights its
key on the Camelot wheel in the header, and Track details says there is nothing
to inspect.

## A Beatport token

Discover reads Beatport with your own Beatport token, entered in **Settings →
Beatport** in the **Beatport token** field (**Kept on this computer only**). Without one, or when Beatport does not accept it, the
page says so at the top, with **Open Settings**, which takes you straight to the
token field:

| The page says | Means | What to do |
| --- | --- | --- |
| **Connect your Beatport account** | No token is set | Enter one in Settings |
| **Beatport rejected the token** | The token is wrong or has expired | Enter a new one in Settings |
| **Beatport refused this token** | The token works but is not allowed to do this | Enter a token that is |
| **Beatport is limiting requests** | Too many requests; it says how long to wait | **Try again** later |
| **Beatport cannot be reached** | No connection, or Beatport is down | **Try again** later |

Without a token you can still open past searches and use your wantlist; a new
search and a playlist need one.

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
   start a search to find out.

The same steps, shortened, are under **How do I get a token?** in Settings →
Beatport.

You can set the environment variable `BEATPORT_ACCESS_TOKEN` instead. It takes
priority over the saved token.

A token expires after a while (Beatport's answer says when, in `expires_in`).
CuePoint does not refresh it: when Discover says **Beatport rejected the
token**, get a new one as above, or use the refresh token you got with the first
(see the reference), and save it.

### Linking tracks to Beatport

Once your tracks are matched on Beatport (see [Clean](clean.md)), Discover reads
those tracks from Beatport to learn which Beatport artists and labels they
credit. That makes searches and artist pages more accurate, because they can
find your artists and labels exactly rather than by spelling. **CuePoint does
this by itself** when a match finishes, as long as a token is set, and the status
strip shows it as **Linking tracks to Beatport**. With no token it does nothing.

If some tracks are still waiting, for example because you added the token later,
the page says how many and offers **Look them up now**. While it works, the page
says what it is doing and that you can leave it.

## Artist and label pages

An artist's page shows your own tracks by that artist and, from Beatport,
their recent releases; a label's page does the same for a label. Open one from
anywhere you meet a track:

- **Track details.** A track's artist credit is shown as written, with each
  artist in it a link — "Mara Veil, Kiko" is two links — and its label is a
  link just below. The remixer credit is linked the same way.
- **The right-click menu, and Explore ▸ in the selection bar**: **Artist page**
  (a list to choose from when the track credits several artists) and **Label
  page**. With several tracks selected they open the first one's.
- **A filter chip** that names one artist or label, such as "Credited artist
  is Mara Veil": **Open page**.
- **A page's own header**, which links an artist's labels and a label's
  artists.

### Linked to Beatport, or your tracks by this name

Artists share names, and one artist's name is spelled several ways, so a page
always says how it knows who it is about:

- **Your tracks by this name** shows your tracks whose credit (or label) spells
  this name, ignoring case, accents and punctuation: "Âme", "AME" and "Ame" are
  one page. CuePoint has not linked this artist to Beatport yet.
- **Linked to Beatport** means CuePoint knows which Beatport artist or label
  this is, from your tracks that are matched on Beatport (see [Linking tracks to
  Beatport](#linking-tracks-to-beatport)). The page holds the tracks Beatport
  credits to them, and your other tracks spelled the same way, and says which
  spellings it includes. A name page you open for someone CuePoint has since
  linked becomes their Beatport page, and says it was opened by name.

The page is titled with the name your library spells most often, or **Unknown
artist** when no track has one; it is never titled with a number.

The header gives how many of your tracks the page holds, the years they span,
their genres, and an artist's labels or a label's artists.

### Your tracks

The first half is the Library's own table, over exactly the tracks the header
counts, newest first. These are your tracks, so they behave as they do in the
Library: double-click one to play it with the rest of the table queued after
it, and use the right-click menu for **Play next**, **Add to queue**, **Similar
tracks** and the track's pages. Selecting a track shows it in Track details.

**Open in Library** opens the Library filtered to this page's tracks, so you
can tag, rate or collect them there. **Save as Smart Collection…** saves the
same filter as a Smart Collection that keeps up with your library.

### On Beatport

The second half lists the artist's or label's tracks released on Beatport in
the last year (for an artist) or the last three months (for a label), newest
first. It has the same switch as Results, **Hide tracks already in your
library**, on by default, so what is left is what is new to you; turn it off to
see them marked **In your library**. The same actions as Results work here (see
[What you can do with Beatport tracks](#what-you-can-do-with-beatport-tracks)),
and artist and label names are links too. CuePoint keeps what it read for up to
twelve hours and says so ("Saved earlier from Beatport"); **Check Beatport
again** asks Beatport now.

When there is nothing to list, the half says why:

| It says | Means | What to do |
| --- | --- | --- |
| **Not linked to Beatport yet** | CuePoint does not know which Beatport artist this is. It never searches Beatport for an artist by name, because the wrong artist of the same name is worse than none | **Look them up now**, when some of the artist's tracks are matched on Beatport |
| **Several Beatport artists share this name** | Your tracks by this name are matched to different Beatport artists | Choose the one you mean |
| **Not found on Beatport** | Beatport has no label by this name | None |
| **Connect your Beatport account**, and the other token states | As at the top of Discover (see [A Beatport token](#a-beatport-token)) | **Open Settings**, or **Try again** |

A label known only by name is looked up on Beatport by its name, and the page
says **Found by name on Beatport** when it was.

Your tracks half works without a token and offline; only the Beatport half
needs Beatport.

## Similar tracks

**Similar tracks**, in a track's details in the Library (and on its right-click
menu), lists the tracks in your library that **mix well** with it, best match
first, and says why each one is there. It works offline, needs no token, and only
ever suggests your own tracks.

A suggestion is close in tempo (or at half or double the tempo), compatible in
key on the Camelot wheel, and may share the genre, the label or an artist, each
by the values CuePoint shows for your tracks, your own corrections included. The
**Match** column says how good a match it is in a word, **Strong**, **Good** or
**Some**, and keeps the number (out of 100) in its tooltip. The **Reasons**
column says which, in words:

| Reason | Means |
| --- | --- |
| **Same tempo: 124** | The same BPM |
| **Close tempo: 124 → 126** | Within 6% of the track's BPM; the closer, the better |
| **Half the tempo: 124 → 62** / **Double the tempo: 124 → 248** | Half or double the BPM, which mixes the same |
| **Same key: 8A** | The same key |
| **Mixes well (next key): 8A → 9A** | One step either way around the Camelot wheel, in the same mode |
| **Mixes well (relative key): 8A → 8B** | The relative major or minor |
| **Same genre**, **Same label** | The same genre or label, ignoring case and accents |
| **Shared artist** | An artist both tracks credit, as artist or remixer |

A track with no BPM or key is compared by what it has, and the page says what it
could not compare by. Keys are Beatport's (or your own correction), shown in
Camelot, so a track that has not been matched has no key to compare. Other copies
of the same track (the ones Clean groups as duplicates) are left out, because the
same track again is not a suggestion.

Selecting a suggestion lights its key on the Camelot wheel in the header.
Suggestions are your own tracks: double-click one to play the list from there,
and use the right-click menu to **Play next** or **Add to queue**. **Similar
tracks** on a suggestion's menu makes it the next track to compare with. The
Track details shows the track you are comparing with until you select a suggestion.

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

- [Your library](library.md) — importing, browsing and Track details
- [Clean](clean.md) — matching your tracks on Beatport, which is how Discover
  knows what you own
- [The CuePoint window](the-window.md) — the sidebar, the status strip and
  Activity
