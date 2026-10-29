"""Regression: an M4A's comment, genre, year, BPM and key were not readable by players.

What broke: syncing to files reported success and the write was checked, but the
catch-all writer stored an M4A's values under made-up atoms (``COMM``, ``GENR``,
``DATE``, ``LABE``, ``BPM``, ``KEY``). Rekordbox and other players read
``\xa9cmt``, ``\xa9gen``, ``\xa9day``, ``tmpo`` and the freeform ``initialkey``,
so the Comment in particular never showed after Reload Tag. The check read the
same made-up names back, so it agreed with the writer and proved nothing.

Easy to reintroduce: any change that sends ``.m4a`` back to the generic
``audio["COMMENT"] = ...`` path passes every round trip that reads with the same
names it writes.

The test asserts the symptom, the way a player reads the file: through the
atoms iTunes defines, using mutagen directly.
"""

from __future__ import annotations


from cuepoint.data.tag_writer import STATUS_OK, write_key_comment_year_to_file
from tests.fixtures.audio_files import audio_copy


def test_a_player_reading_the_itunes_atoms_sees_what_was_synced(tmp_path):
    path = audio_copy(tmp_path, "m4a")

    status = write_key_comment_year_to_file(
        str(path),
        key="8A",
        comment="peak time",
        year="2021",
        label="Label X",
        bpm="126",
        genre="House",
    )

    assert status == (STATUS_OK, None)
    from mutagen.mp4 import MP4

    tags = MP4(str(path)).tags
    assert tags is not None
    assert tags.get("\xa9cmt") == ["peak time"]
    assert tags.get("\xa9gen") == ["House"]
    assert tags.get("\xa9day") == ["2021"]
    assert tags.get("tmpo") == [126]
    assert [bytes(v) for v in tags.get("----:com.apple.iTunes:initialkey", [])] == [
        b"8A"
    ]
    assert [bytes(v) for v in tags.get("----:com.apple.iTunes:LABEL", [])] == [
        b"Label X"
    ]
    for made_up in ("COMM", "GENR", "DATE", "LABE", "BPM\x00", "KEY\x00"):
        assert made_up not in tags
