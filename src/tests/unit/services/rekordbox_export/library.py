#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The library and source file the export's service tests share.

Kept apart from the fixtures that build them so a test can name a value — the
source's own bytes, say — without importing from a conftest.
"""

from __future__ import annotations

#: A source whose values are exactly what the library holds, so that a preview
#: over it reports nothing changed unless a test changes something. Track 99 is
#: in the file and not in the library; the library's fourth track is in the
#: library and not in the file. Those two are DEC-082's counts.
SOURCE = b"""<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="4">
    <TRACK TrackID="1" Name="One" Artist="A" Tonality="Am" AverageBpm="128.00"\
 Genre="Techno" Label="Drumcode" Year="2019" Rating="102"\
 Location="file://localhost/C:/Music/one.mp3">
      <TEMPO Inizio="0.025" Bpm="128.00" Metro="4/4" Battito="1"/>
      <POSITION_MARK Name="Intro" Type="0" Start="0.025" Num="-1"/>
    </TRACK>
    <TRACK TrackID="2" Name="Two" Artist="B" Tonality="F#m" AverageBpm="124.00"\
 Genre="House" Label="Defected" Year="2021" Rating="0"/>
    <TRACK TrackID="3" Name="Three" Artist="C" Tonality="Gm" AverageBpm="90.00"/>
    <TRACK TrackID="99" Name="Stranger" Artist="Nobody" Tonality="Dm"/>
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="0"/>
  </PLAYLISTS>
</DJ_PLAYLISTS>
"""

#: What the library holds, matching the file track for track and value for value.
LIBRARY = (
    dict(
        rekordbox_track_id="1",
        file_path="/m/one.mp3",
        title="One",
        artist="A",
        key="Am",
        bpm=128.0,
        genre="Techno",
        label="Drumcode",
        year=2019,
        rating=2,
    ),
    dict(
        rekordbox_track_id="2",
        file_path="/m/two.mp3",
        title="Two",
        artist="B",
        key="F#m",
        bpm=124.0,
        genre="House",
        label="Defected",
        year=2021,
        rating=0,
    ),
    dict(
        rekordbox_track_id="3",
        file_path="/m/three.mp3",
        title="Three",
        artist="C",
        key="Gm",
        bpm=90.0,
    ),
    dict(
        rekordbox_track_id="4",
        file_path="/m/four.mp3",
        title="Four",
        artist="D",
        key="Cm",
        bpm=140.0,
    ),
)
