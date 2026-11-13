"""Regression: Save to files skipped every M4A, MP4 and M4B as an unsupported format.

What broke: ``tag_fields`` only recorded and restored ID3, FLAC and Ogg tags, so
``tag_format_of`` answered None for the MP4 family and the Save to files run put
each such file in ``unsupported_format``. The writer itself already writes the
standard iTunes atoms, but a write that cannot be undone is not made (DEC-070).

Easy to reintroduce: anything that drops ``.m4a`` from ``tag_fields``' formats,
or records only the standard atoms, so an undo leaves out the legacy atoms
(``KEY\\x00``, ``COMM``...) the writer removes.

The test asserts the symptom: an M4A is written, and Undo puts back every atom
the write touched, exactly.
"""

from __future__ import annotations


import pytest

from cuepoint.services.tag_write_service import SKIP_UNSUPPORTED_FORMAT
from tests.fixtures.audio_files import audio_copy, tag_dump
from tests.unit.services.test_tag_write_service import ALL_FIELDS, VALUES, World


@pytest.fixture
def library(tmp_path):
    made = World(tmp_path)
    yield made
    made.db.close_all()


def test_save_to_files_writes_an_m4a_and_undo_restores_it_exactly(library):
    from mutagen.mp4 import MP4

    path = audio_copy(library.music, "m4a", "legacy.m4a")
    audio = MP4(str(path))
    audio.tags["KEY\x00"] = ["5A"]
    audio.tags["BPM\x00"] = ["120"]
    audio.tags["COMM"] = ["old comment"]
    audio.save()
    track = library.add(path, **VALUES)
    original = tag_dump(path)

    preview = library.preview([track], **ALL_FIELDS)
    assert SKIP_UNSUPPORTED_FORMAT not in preview.skipped
    result = library.service().write(preview, "job-1")

    assert (result.written, result.failed) == (1, 0)
    tags = MP4(str(path)).tags
    assert [bytes(v) for v in tags["----:com.apple.iTunes:initialkey"]] == [b"Am"]
    assert "KEY\x00" not in tags and "COMM" not in tags

    restored = library.service().restore("restore-1", job_id="job-1")

    assert restored.failed == 0 and restored.skipped == 0
    assert tag_dump(path) == original
