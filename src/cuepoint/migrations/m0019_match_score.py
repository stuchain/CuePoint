#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The score of the candidate a track's match state points at, kept beside it (CLEAN-14).

CLEAN-13 made **Match score** a column, a sort and a filter. It was read through
``match_candidates``: one lookup per track into the widest table in the
library, 1.2 million rows at CLEAN-14's scale. Sorting 50,000 tracks by score
took 140 ms against 30 ms for any other column, and every Library row read it.

A candidate is never changed once stored (DEC-066), so the score a state points
at can only change when the state is written again — which
``MatchRepository.set_match`` does, and fills this column as it does. Existing
states are filled here. A state that points at no candidate has no score.
"""

from __future__ import annotations

VERSION = 19

DESCRIPTION = "the matched candidate's score, kept on the match state"

SQL = """
ALTER TABLE track_match ADD COLUMN candidate_score REAL;

UPDATE track_match
   SET candidate_score = (
       SELECT score FROM match_candidates WHERE id = track_match.candidate_id
   )
 WHERE candidate_id IS NOT NULL;
"""
