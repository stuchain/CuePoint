# Discover

**Discover** finds new music on Beatport from the artists and labels already in
your library, lets you keep what you want on a **wantlist**, and sends it to a
playlist on your Beatport account. It reads the charts your artists made and the
recent releases of your artists and labels, remembers every dig it makes, and knows which
of the tracks it finds are already in your library.

It works on the library you imported on the [Library](library.md) page, so
import a collection first. It reads Beatport as you, once you sign in to Beatport (see
[Signing in to Beatport](#signing-in-to-beatport)).

Discover has three tabs, **New dig**, **Results** and **Wantlist**, and
reopens on the tab you used last. From any artist or label name in a table you
can open that [artist's or label's page](#artist-and-label-pages), and from a
track's details in the Library you can open its
[Similar tracks](#similar-tracks). Both are part of Discover, so the sidebar
keeps **Discover** highlighted while you are on them.

Discover replaces **inCrate**, which used to sit under **Tools** in the sidebar.
See [Where inCrate went](#where-incrate-went) if you used it.

## New dig

**New dig** asks what to look for, starting from your defaults. A bar at the
bottom says what the dig will cover ("2 genres · 25 artists · 9 labels") and
holds **Releases from the last … days** and **Start looking**, which stay in
view however long the form is.

- **Genres for DJ charts.** On Beatport, artists publish charts, which are short
  lists of tracks they play. Which charts CuePoint reads depends on the artists
  you chose below: the charts **those artists made** in the genres you tick; with
  **every artist** in your library, the charts any of them made; with **none**,
  the general charts of those genres, by anyone (the newest 25 in each genre, 150
  in all; Results says when a dig was cut short).
  Tick no genre and it reads no charts. The heading says which dates it will
  read ("last 30 days"); to choose other dates open **More options**, which holds
  **Charts from** and **Charts to**. Until you sign in to Beatport, the genres
  read "Genres appear after you sign in."
- **Artists** and **Labels.** Each is every artist or label in your library
  (with how many), **a saved list** of them, or none. A saved list is picked
  from the drop-down beside it, which says how many names each list holds.
- **Releases from the last … days** (in the bottom bar). New releases on your
  labels, and on the artists you chose from a saved list, in that many days. When
  you ticked genres, only releases in those genres count.

### Saved lists

A saved list is a name you give to a set of artists, or of labels, so you do not
choose them again for every dig. Lists are kept by CuePoint and are the same
each time you open it.

- **+ New list** under Artists or Labels opens the chooser: type a name, tick
  the artists or labels from the names in your library (with how many tracks
  each has) and press **Save**. The new list is chosen for the dig.
- **Edit…** changes the list shown in the drop-down: its name and the names in
  it. It does not change what the dig looks for: if "every" is chosen, it stays. A name in the list that is no longer in your library stays, ticked, until
  you untick it.
- **Delete list** (inside the chooser, after asking once) removes the list. The
  artists or labels stay in your library. If the dig was using that list, it
  keeps "a saved list" with none chosen, and **Start looking** waits until you
  pick another list or choose every one yourself.
- A list's name must be different from your other lists of the same kind (capital
  letters do not count). Artist lists and label lists are separate.

If you had chosen artists or labels for an earlier dig, the newest of those
choices is kept as a list called **My artists** or **My labels**, so nothing you
picked is lost.

A dig that uses a list looks for the names in it, exactly as a dig where you
ticked the same names would.

**Start looking** hands the dig to CuePoint, which does it in the
background. The status strip shows how far it has got, with a **Stop** button,
and you can keep working; the page opens **Results** on the new dig as soon
as it begins. A dig you stop keeps what it had found. The form keeps what you
filled in while you look at another tab.

## Results

**Results** lists every dig you have made, newest first, each titled "Dig
of" its date, with how it ended, what it looked for and how many tracks it found.
Choose a dig to open it beside the list; when the page is narrow, the list
sits above it instead. With no dig yet it says so and offers **New dig**.

An open dig shows how it ended, including why, if Beatport stopped it, and
one line saying what it looked for (for example "House · last 30 days · 67
artists · 28 labels"); open that line for the full wording and the artist and
label names. While it works, the cards it has found appear as they arrive and
the status bar at the bottom shows how far it has got.

### Rows of cards

What a dig found is grouped by where it came from, in rows of cards:

- **Your artists' charts.** The charts made by the artists you chose, in the
  genres you ticked, one card per chart. When you chose no artists this row is
  **Genre charts** instead: the general charts of those genres. With artists
  chosen there are no general genre charts.
- **Your artists' new releases.** One card per artist you chose, with a round
  picture and "3 charts · 4 new": how many of their charts the dig read and how
  many new releases it found in your genres and days. A dig looks up at most 200
  chosen artists and says so above the cards when it cut a longer list.
  With **every artist** in your library the row is called **Your artists** and
  its cards say only "3 charts": a dig does not look up new releases for a whole
  library.
- **Your labels.** One card per label, with "6 new": its new releases in your
  genres and days. Labels make no charts.

Each card has a picture, its name, what it holds and a **tick** in its corner.
A row shows its first six cards; **See all** shows the rest. Click a card to open
its tracks: a table with a preview, key, BPM and **In your library** marks, in
which you can select tracks to leave some out, and **All results** to go back.

**Tick** cards to act on several at once. A bar appears at the foot: "Ticked:
Argy, Afterlife · 20 tracks · 3 already in your library". A track on two ticked
cards is counted once, and tracks your library already has are left out.

- **Add to wantlist** adds those tracks and says how many already in your
  library were left out.
- **Add to playlist** asks whether to make **a new playlist** (you name it) or
  add to **a playlist I already have** on Beatport, and whether to include tracks
  already in your library (off by default; they are skipped and counted). The
  dialog says how many tracks will go. Adding to an existing playlist skips any
  track it already holds and says so.

**Everything** opens the whole dig as one table, each track once, with a **From**
column naming the chart, artist or label it came from. A dig made before cards
existed has no cards and opens as that table.

### The tracks table

The table (in a card, or in Everything) lists: title and mix, artists, label,
release date, BPM, key, genre, **From**, whether it is **In your library**, and
whether it is on your wantlist.

Artist and label names in the table are links to their pages. Press Tab to reach
them within a row; a click on one opens the page without selecting the row.

**Tracks already in your library are hidden** by default, with one switch,
**Hide tracks already in your library**, and one count line over the table:
"40 found · 12 already in your library (hidden)". Turn the switch off to see them,
marked **In your library**. A track counts as in your library when a track there
has a confirmed Beatport match to it (see [Clean](clean.md)).

**"Not in your library" means CuePoint has no match for it, not that the file is
missing.** It is worked out from your confirmed matches every time a dig is
opened, so a track you have but have not matched on the Clean page is shown as
not in your library, and is marked as soon as you confirm its match, in every
dig, old ones included. If Discover shows you a track you know you have,
match that track in Clean.

Sort by title, artists, release date, or the order the dig found them, by
clicking a column's header. The **Columns…** icon in the table header's right
corner chooses which columns to show, and the table remembers its layout.

**Delete this dig…**, in the ⋯ menu at the corner of the dig's card in the list, removes a dig and
its list of tracks after asking. Tracks you added to the wantlist from it stay
there. A dig that is still running cannot be deleted.

## The wantlist

The **Wantlist** tab lists the Beatport tracks you want, with a note, the date
you added each, and whether you marked it bought. It shows every wanted track,
including ones now in your library, which are marked **In your library**: it is
your own list, so nothing is hidden from it. Two filters, used together, each
**Any**, **No** or **Yes**:

- **In your library**: tracks your library has (through a confirmed match), or not.
- **Marked bought**: tracks you marked bought, or not.

So "bought, but not in my library yet" is **Marked bought: Yes** with **In your
library: No**. Marking a track bought is your own note; it reads as in your
library once you import the file and Clean matches it. One line counts the
wanted tracks, how many are marked bought and how many are in your library.

An empty wantlist shows only a short note on how to fill it (use **Add to wantlist** on a dig's results); its filters and table appear once it holds a track.

## What you can do with Beatport tracks

Select tracks with a click, add to the selection with Ctrl-click (Cmd-click on
macOS), and extend it with Shift-click. The actions are always shown above the
table; the ones that need tracks are grayed out until you select some, and their
hint says why. From the keyboard, Up and Down move the selection, Shift extends it, and Ctrl+A selects every track the table has loaded. The same actions are on the right-click menu:

| Action | Where | What it does |
| --- | --- | --- |
| **Add to wantlist** | Results, artist and label pages | Adds the selected tracks to your wantlist, noting the dig they came from. A track already there is left as it is |
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
**Open the playlist**. If Beatport refuses your sign-in for playlists, the page says
so and nothing is made.

Beatport tracks are not tracks in your library: they have no file, so a
double-click does nothing. Selecting one lights its
key on the Camelot wheel when you open it, and Track details says there is nothing
to inspect.

**Previews.** The small round ▶ button under **Preview** at the left of each Beatport row plays the track's
two-minute sample from Beatport, so you can hear it before you buy or add it. It
needs Beatport to be reachable. When Beatport has no sample the button grays
out and says "No preview"; if you were offline when you pressed it, that is
temporary, and it works again a few minutes later or once you are back online.
Scrolling the table does not interrupt a sample that is playing. Only one
sound plays at a time: starting a preview stops the one before it, and playing a track in the player stops the
preview.

## Signing in to Beatport

Discover reads Beatport as you. Choose **Sign in to Beatport**, in **Settings →
Beatport** or in the banner at the top of Discover, and sign in on Beatport's own
page in the window that opens. The window closes by itself when you are in. Your
password goes to Beatport, never to CuePoint. CuePoint then keeps the sign-in on
your computer, encrypted, and renews it by itself while you use the app: Beatport's
access changes about every 12 minutes and CuePoint fetches the new one quietly (also when
your computer wakes from sleep), and the Beatport sign-in itself lasts about 30 days
from your last use, after which you sign in again. Settings
shows **Signed in to Beatport · ••••abcd · renews by itself**, with **Test
connection** and **Sign out**.

CuePoint uses your own Beatport account, at the same low request rate as before.
Beatport may change how its sign-in works, which can stop this from working until
CuePoint is updated, and you should check that Beatport's terms suit how you use it.

When the page says something else:

| The page says | Means | What to do |
| --- | --- | --- |
| **Sign in to Beatport to search its charts and releases.** | You are not signed in | **Sign in to Beatport** |
| **Beatport sign-in ended or was refused.** | The sign-in ran out and could not be renewed, or Beatport refused it | **Sign in again** |
| **Beatport refused this sign-in.** | The sign-in works but is not allowed to do this | **Sign in again**; a pasted token that is refused needs replacing under **Paste a token instead** |
| **Beatport is limiting requests** | Too many requests; it says how long to wait | **Try again** later |
| **Beatport cannot be reached** | No connection, or Beatport is down | **Try again** later |

Without a sign-in you can still open past digs and use your wantlist; a new
dig and a playlist need one.

**Sign out** deletes the sign-in from your computer and clears what the sign-in
window kept. Where the system has no secure key store (some Linux setups without
a keyring), CuePoint cannot keep the sign-in safely, so you sign in again each
time it starts; Settings says so.

### If the sign-in window does not finish

If you have signed in but the window stays open, wait a few seconds and close it:
CuePoint checks once more when it closes, and Settings then says whether you are
signed in. If you are not, CuePoint wrote what happened to `beatport-signin.log`:

- Windows: `%LOCALAPPDATA%\CuePoint\Logs\beatport-signin.log`
- macOS: `~/Library/Application Support/CuePoint/Logs/beatport-signin.log`

If CuePoint was slow to start, the first lines may be in
`%APPDATA%\CuePoint\logs` (Windows) or `~/Library/Logs/CuePoint` (macOS) instead.

**Help → Get help… → Open log folder** opens that folder. The
log has no password or sign-in in it, so you can send it as it is when you report
the problem.

### Pasting a token instead

If the sign-in window does not work for you, **Settings → Beatport → Paste a
token instead** takes a token you already have. Paste it into **Beatport token**,
choose **Save token**, then **Test connection**: CuePoint calls Beatport once and
tells you whether Beatport let it in (in green) or refused it (in red). Once
it is saved, the field is replaced by **Using a pasted token · ••••abcd** with
**Test connection** and **Sign out**; to replace the token, sign out first.

Beatport does not hand out tokens from your account page. You ask for API access,
and then exchange what they give you for a token.

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
3. Paste the token as above.

A pasted token is not renewed. It expires after a while (Beatport's answer says
when, in `expires_in`); when Discover says **Beatport sign-in ended or was
refused.**, sign in, or paste a new one.

You can set the environment variable `BEATPORT_ACCESS_TOKEN` instead. It takes
priority over a sign-in and over a saved one; Settings then says **Using
BEATPORT_ACCESS_TOKEN from the environment** and turns the sign-in button off.

### Linking tracks to Beatport

Once your tracks are matched on Beatport (see [Clean](clean.md)), Discover reads
those tracks from Beatport to learn which Beatport artists and labels they
credit. That makes searches and artist pages more accurate, because they can
find your artists and labels exactly rather than by spelling. **CuePoint does
this by itself** when a match finishes, as long as you are signed in, and the status
strip shows it as **Linking tracks to Beatport**. When you are not signed in it does nothing.

If some tracks are still waiting, for example because you signed in later,
the page says how many and offers **Look them up**. While it works, the status bar
shows the progress and you can leave the page.

## Artist and label pages

An artist's page shows your own tracks by that artist and, from Beatport,
their recent releases; a label's page does the same for a label. Open one from
anywhere you meet a track:

- **Track details.** A track's artist credit is shown as written, with each
  artist in it a link — "Mara Veil, Kiko" is two links — and its label is a
  link just below. The remixer credit is linked the same way.
- **The right-click menu, and More ▸ in the selection bar**: **Artist page**
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
  credits to them, and your other tracks spelled the same way. The spellings it
  includes are under **More about this**. A name page you open for someone CuePoint has since
  linked becomes their Beatport page, and says it was opened by name.

The page is titled with the name your library spells most often, or **Unknown
artist** when no track has one; it is never titled with a number.

The header gives how many of your tracks the page holds, the years they span,
their genres, and an artist's labels or a label's artists.

### Your tracks

The first half is the Library's own table, over exactly the tracks the header
counts, newest first. These are your tracks, so they behave as they do in the
Library: double-click one to play it with the rest of the table queued after
it. Selecting a track shows it in Track details.

Under the table is the Library's selection bar: with nothing selected only the
count and **Select all**, with a selection **Play ▸** (Play, Play next, Add to
queue), **More ▸** (Similar tracks, the artist and label pages, then Copy and
Show in folder; with several tracks selected the pages open the first one's) and
"N selected ×". **Columns…** is in the table's top right corner. The right-click
menu on a track (or on several) holds the same groups: Play, Play next and Add
to queue first, then **More ▸**. Organizing is the Library's, and matching and fixing values are
Clean's, so those groups are not here.

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
| **Not linked to Beatport yet** | CuePoint does not know which Beatport artist this is. It never searches Beatport for an artist by name, because the wrong artist of the same name is worse than none | **Look them up**, when some of the artist's tracks are matched on Beatport |
| **Several Beatport artists share this name** | Your tracks by this name are matched to different Beatport artists | Choose the one you mean |
| **No match** | Beatport has no label by this name | None |
| **Sign in to Beatport to search its charts and releases.**, and the other sign-in states | As at the top of Discover (see [Signing in to Beatport](#signing-in-to-beatport)) | **Sign in to Beatport**, **Sign in again**, or **Try again** |

A label known only by name is looked up on Beatport by its name, and the page
says **Found by name on Beatport** when it was.

Your tracks half works without a sign-in and offline; only the Beatport half
needs Beatport.

## Similar tracks

**Similar** in a track's details in the Library (and on its right-click
menu), lists the tracks in your library that **mix well** with it, best match
first, and says why each one is there. It works offline, needs no sign-in, and only
ever suggests your own tracks.

A suggestion is close in tempo (or at half or double the tempo), compatible in
key on the Camelot wheel, and may share the genre, the label or an artist, each
by the values CuePoint shows for your tracks, your own corrections included. Short
columns say which: **Key** (the track's key and how it relates to the one you are
comparing with: **same**, **+1** or **−1** a step round the wheel, **rel.** for the
relative key, **next** for another neighbour), **BPM Δ** (the tempo change, such as
**−2** or **+3**, **±0** for the same, **0.5×** or **2×** for half or double), and a
**✓** under **G**, **L** and **A** (genre, label, artist) when it is shared. **Fit** is a bar of
five blocks, the more filled the closer the match; hover it for the word (Strong,
Good or Some) and the number out of 100. Hover any of the other cells for the
reason in words:

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

Selecting a suggestion lights its key on the Camelot wheel when you open it.
Suggestions are your own tracks: double-click one to play the list from there,
and use the bar under the table (**Play ▸** and **More ▸**, shown once you select
some) or the right-click menu, which holds the same two groups,
to **Play next** or **Add to queue**. **Similar tracks** under More makes a suggestion
the next track to compare with. **Open in Library** opens the Library on the track you are comparing with and its suggestions, or on the suggestions you selected and that track, so you can tag, rate or collect them there. The filter reads **Similar to “<track>”**; remove it with its **×** or **Clear all filters**. The Library shows them in its own sort order. A list of tracks cannot be saved as a Smart Collection: add them to a Collection instead. The
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

**Settings keep their `incrate.` names.** The config key `incrate.beatport_access_token`
in `~/.cuepoint/config.yaml` is still read. Where the system has a secure key
store, a saved sign-in in it is moved into the encrypted store the first time you start
CuePoint after updating (the key stays, emptied); otherwise it stays in the file
and is still used, and Settings says **Using the sign-in saved in CuePoint's config
file**. Discover's
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
