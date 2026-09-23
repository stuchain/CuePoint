# Beatport v4 catalog fixtures (DISCOVER-01)

The parsers in `cuepoint/services/beatport_catalog.py` are written against these files, and
`src/tests/unit/services/test_beatport_catalog.py` holds them to it. No test reaches the network.

## Recorded (2026-09-23)

`recorded/` holds eleven real, sanitized responses, taken with a developer's own token (scope
`app:docs user:dj`) by `scripts/beatport_v4_spike.py --playlist --write-fixtures`. Every
reconstructed shape below agreed with them: the agreement tests passed over all eleven with no
parser change. They also showed two things the reconstruction did not have, both now read and
pinned by `src/tests/regression/test_regression_v4_chart_artist_and_date.py`:

- a chart carries `artist: {id, name, slug}` when a Beatport artist made it, and `null` otherwise;
  `person` is the publishing *account*, whose `owner_name` can differ from the artist's name
  (DJEFF's chart is owned by "OFFICIALDJEFFMUSIC") and whose `id` is not an artist id;
- a chart's date is `publish_date`, not `published_date`.

They are public catalog data. The one personal answer, the throwaway playlist's, has its id and
name replaced (`playlist_created.json`); nothing here names the account that recorded them.

## Where each shape comes from

DISCOVER-01 asks for these to be **recorded** from the live API with a developer's token. When the
step was implemented no token was available, so the files are **reconstructed**, and each shape has
a stated source:

| Evidence | What it establishes |
| --- | --- |
| The live API, unauthenticated (2026-09-23) | The route map below: Beatport's router answers **404** for a path it lacks and **401** for one it has, before it checks a token. That every path wants its trailing slash (a missing one is a **301**, including on POST). `error_unauthenticated.json`, recorded verbatim. |
| [beatportdl](https://github.com/unspok3n/beatportdl) `internal/beatport/*.go` | Field names and types, because Go's typed decoder fails on a type mismatch: track `id, name, mix_name, slug, artists[], remixers[], bpm (int), key{name, camelot_number, camelot_letter, chord_type{name}}, genre{id,name,slug}, sub_genre, release{…, label{id,name,slug}}, publish_date, url`; release `new_release_date`, `tracks` as a list of URL strings; chart `person{owner_name, owner_slug}`; listings `{next, previous, count, page (a string), per_page, results}`; `catalog/tracks/?artist_id=` and `?label_id=`. |
| [beets-beatport4](https://github.com/Samik081/beets-beatport4) | Key names such as `"Eb Minor"`, `"A Minor"`; `results` unwrapped from listings. |
| This repository's browser flow (`incrate/beatport_playlist_browser.py`) | A user's playlist page is `https://www.beatport.com/library/playlists/{id}`. |

Names, ids and dates in the reconstructed files are invented. Fields the parsers do not read (price,
image, ISRC, samples) are present so a test proves they are ignored rather than required.

**Route map** (live, 2026-09-23). Exist: `catalog/tracks/`, `catalog/tracks/{id}/`,
`catalog/artists/{id}/`, `catalog/artists/{id}/tracks/`, `catalog/labels/`, `catalog/labels/{id}/`,
`catalog/labels/{id}/releases/`, `catalog/releases/{id}/tracks/`, `catalog/charts/`,
`catalog/charts/{id}/`, `catalog/charts/{id}/tracks/`, `catalog/genres/`, `catalog/search/`,
`my/account/`, `my/playlists/`, `my/playlists/{id}/`, `my/playlists/{id}/tracks/`,
`my/playlists/{id}/tracks/bulk/`. Do not exist: `catalog/artists/{id}/charts/`,
`catalog/artists/{id}/releases/`, `catalog/artists/{id}/top-10-tracks/`,
`catalog/labels/{id}/charts/`, `catalog/labels/{id}/tracks/`, `catalog/labels/{id}/top-10-tracks/`.

## Replacing them with recordings

```powershell
$env:BEATPORT_ACCESS_TOKEN = "..."     # PowerShell; the script reads the environment only
python scripts/beatport_v4_spike.py --playlist --write-fixtures
python -m pytest src/tests/unit/services/test_beatport_catalog.py -q
```

The script sanitizes every body before writing it (no email, user, account or token field; a
playlist's id and name replaced), writes them to `recorded/` under the same file names, and writes
a report to `output/beatport_v4_spike/`. The reconstructed files stay: the value tests read them,
because they hold the cases a recording cannot be relied on to contain (two artists and a remixer, no
key, no BPM, a release with no label, a page older than the window).

The **agreement tests** run over every JSON file here and in `recorded/`: for each track, artist,
label and listing they check that the parser read exactly what the raw JSON says — every id, every
artist in order, the label, the release, the tempo and the key. So once recordings exist, a failing
agreement test is a shape this reconstruction got wrong, and the parser is what changes. Record the
report in `docs/v1/PHASE9_DISCOVER.md` under DISCOVER-01's outcome.
