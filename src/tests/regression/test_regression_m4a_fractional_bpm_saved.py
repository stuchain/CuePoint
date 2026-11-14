"""Regression: an M4A with a fractional BPM stayed "not in the files yet" after a save.

What broke: a BPM of 126.5 is written to an M4A as the whole number ``tmpo`` holds
(127), and the write's record says ``{"tmpo": [127]}``. The unsaved-values rule
compared that record with CuePoint's own 126.5 at two decimals, so the field was
unsaved forever and every save wrote it again.

Easy to reintroduce: any change to the unsaved BPM comparison that stops
rounding the way ``tag_writer._mp4_bpm`` does for MP4 files. The test reads the
record from the file the real writer wrote, as the symptom a person saw.
"""

from __future__ import annotations

import json

from cuepoint.data.tag_fields import read_tag_fields
from cuepoint.data.tag_writer import STATUS_OK, write_key_comment_year_to_file
from cuepoint.models.filter_rule import UNSAVED_VALUES_SQL
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from tests.fixtures.audio_files import audio_copy
from tests.unit.persistence.match_status_support import add_track, write_row


def test_a_saved_fractional_bpm_is_no_longer_unsaved(tmp_path):
    path = audio_copy(tmp_path, "m4a")
    db = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(db).migrate()
    try:
        track = add_track(db, str(path), bpm=124.0)
        TrackMetadataRepository(db).set_override(track, "bpm", 126.5)

        def unsaved() -> bool:
            rows = db.connect().execute(
                f"SELECT field FROM ({UNSAVED_VALUES_SQL}) WHERE track_id = ?",
                (track,),
            )
            return any(row["field"] == "bpm" for row in rows)

        assert unsaved()
        status = write_key_comment_year_to_file(
            str(path), key=None, comment=None, year=None, bpm="126.5"
        )
        assert status == (STATUS_OK, None)
        record = read_tag_fields(path).value("bpm")
        assert record == {"tmpo": [127]}
        write_row(db, track, "bpm", new_value_json=json.dumps(record))

        assert not unsaved()
    finally:
        db.close_all()
