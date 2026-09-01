#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Persistence layer for the CuePoint library database.

Repositories are the only place that executes SQL against ``cuepoint.db``.
Keeping queries here — rather than letting services or API handlers reach for a
connection — means schema changes have one blast radius, and query plans can be
reasoned about in one place as the library grows to tens of thousands of tracks.

This package is distinct from :mod:`cuepoint.data`, which adapts *external*
sources (Rekordbox XML, Beatport, audio file tags). ``data`` reads the outside
world; ``persistence`` owns CuePoint's own store.
"""

from cuepoint.persistence.track_repository import TrackRepository

__all__ = ["TrackRepository"]
