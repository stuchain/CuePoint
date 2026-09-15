#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Where an artwork answer was found, and what was refused (CLEAN-09, DEC-076).

Migration 0011 gave ``track_artwork`` what a file held and when it was read. Two
things building the scan needed that it could not say:

- **Which path was read.** A refresh that changes a track's path makes an
  answer about the old file an answer about nothing, exactly as a file check's
  is (CLEAN-07). ``checked_path`` lets the vocabulary read such a row as
  "unknown" rather than as the old file's picture.
- **That a picture was refused, and why.** Every image goes through one guarded
  decoder, and an image it refuses is recorded rather than decoded again on
  every display. ``embedded_refused`` holds why the file's picture could not be
  used — its tags could not be read, or the guard refused the image — and
  ``beatport_refused`` why Beatport's image was refused. A failed download is
  not a refusal and is never recorded: offline is an empty state (DEC-076).
- **Which page Beatport's image was read from.** A candidate stored before
  CLEAN-09 has no artwork URL, so its page is read once and the answer is kept
  in ``beatport_url``. ``beatport_page`` names that page, so when a different
  candidate is accepted the old answer is not taken for the new one's.

The reasons are CHECKs, for m0006's reason. Which reason may go with which
answer is a rule between columns, so it lives in the model.
"""

from __future__ import annotations

VERSION = 17

DESCRIPTION = "the path artwork was read at, and refused artwork"

SQL = """
ALTER TABLE track_artwork ADD COLUMN checked_path TEXT;

ALTER TABLE track_artwork ADD COLUMN embedded_refused TEXT
    CHECK (embedded_refused IN ('tags', 'too_large', 'format', 'dimensions', 'corrupt'));

ALTER TABLE track_artwork ADD COLUMN beatport_refused TEXT
    CHECK (beatport_refused IN ('too_large', 'format', 'dimensions', 'corrupt'));

ALTER TABLE track_artwork ADD COLUMN beatport_page TEXT;
"""
