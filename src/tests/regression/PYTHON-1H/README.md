# PYTHON-1H — a library export of 2.6 GB is not refused

## What happened

A user in France picked a 2.6 GB Rekordbox export. The import refused it with
"XML file too large: 2616715592 bytes (max 104857600). Refusing to parse to
prevent resource exhaustion." under the generic code `LIBRARY_IMPORT_FAILED`.
The Library page showed that developer message as it was, and Sentry received it
as a bug.

## Why it was easy to reintroduce

Every reader shared one 100 MiB limit, set for the readers that build the whole
tree (five to seven times the file in memory). The readers the desktop app uses
do not; they were held to it anyway. Raising the one number would have been
wrong too, because the import kept every track's cue points and beat grid in
memory until the track pass ended (7.5 GB for a 2.6 GB file). So the limit is
now one per kind of reader, and the import writes the marks from a spill file.

## What the test pins

An import of a real, small export whose file reports 2.6 GB succeeds and writes
every track. The file is built in the test; only its reported size is patched.

The refusal that remains (over 4 GiB) is pinned in
`src/tests/unit/data/test_rekordbox_size_limits.py` and
`src/tests/unit/engine/test_library_import_job.py`.
