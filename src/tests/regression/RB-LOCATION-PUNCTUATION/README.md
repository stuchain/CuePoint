# RB-LOCATION-PUNCTUATION — track paths truncated at `?` and `#`

## What broke

`get_track_locations()` returned a truncated file path for any track whose
filename contains `?` or `#`. inKey uses that path to write tags back to the
audio file, so those tracks silently could not be found: the path lost
everything from the punctuation onwards, including the extension.

`/music/Is This A Dream? (Remix).mp3` came back as `/music/Is This A Dream`.

## Why it happened

The function decoded the `Location` attribute and then did this:

```python
# Strip query string or fragment (e.g. ?version=1) so suffix is correct
if "?" in location:
    location = location.split("?")[0]
if "#" in location:
    location = location.split("#")[0]
```

That is URL thinking applied to a file path. `Location` is a `file://` URL, so a
query or fragment is theoretically possible — but Rekordbox never writes one,
and it does not consistently escape these characters when they appear in a
filename. A real 3,880-track export writes `?` **unencoded** and `#` both
unencoded (`C's Movement #1`) and percent-encoded (`f%23m`), so splitting either
before or after decoding still truncates real names. There is nothing to strip:
in a Rekordbox `Location`, `?` and `#` are always part of the filename.

## How it was found

Parsing a user's real collection for LIBRARY-02. Seven of their 3,880 tracks are
affected — `Is This A Dream?`, `Where's My Voice?`, `Yeah, You?`,
`How U Feeling?`, `What Do You Need?`, `f#m - Open Air`, `C's Movement #1`.

## The fix

`get_track_locations()` now decodes through `location_to_path()`, which does not
split, and keeps only the local-lookup steps that are its own job — platform
separators and `resolve()`.

## Easy to reintroduce

Anyone reading `Location` as a URL will reach for `urlparse`, whose `.path`
drops the query and fragment in exactly the same way. The test asserts the
symptom — the returned path still names the file — rather than the shape of the
fix.

## A note on the fixture

`?` is not a legal filename character on Windows, so only the `#` case can be
backed by a real file on disk in a cross-platform test. The `?` cases are
asserted on the returned path instead, which is where the defect actually was.
