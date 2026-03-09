"""Unit tests for incrate collection_parser."""

import os
import tempfile
import xml.etree.ElementTree as ET

from cuepoint.incrate.collection_parser import (
    collection_tracks_from_xml,
    to_inventory_record,
    track_key,
)
from cuepoint.incrate.models import CollectionTrack


def _minimal_collection_xml(tracks):
    """Build DJ_PLAYLISTS XML with only COLLECTION and given TRACKs.
    tracks: list of dicts with TrackID, Name, Artist (optional Label, Remixer).
    """
    root = ET.Element("DJ_PLAYLISTS")
    root.set("Version", "1.0.0")
    collection = ET.SubElement(root, "COLLECTION")
    for tr in tracks:
        t = ET.SubElement(collection, "TRACK")
        t.set("TrackID", tr.get("TrackID", ""))
        t.set("Name", tr.get("Name", ""))
        t.set("Artist", tr.get("Artist", ""))
        if "Label" in tr:
            t.set("Label", tr["Label"])
        if "Remixer" in tr:
            t.set("Remixer", tr["Remixer"])
    return ET.tostring(root, encoding="unicode")


class TestCollectionTracksFromXml:
    """Test collection_tracks_from_xml."""

    def test_collection_tracks_from_xml_yields_collection_track(self):
        """One track in XML yields one CollectionTrack with fields matching XML."""
        xml = _minimal_collection_xml(
            [
                {
                    "TrackID": "42",
                    "Name": "My Track",
                    "Artist": "My Artist",
                    "Label": "My Label",
                    "Remixer": "Remixer X",
                },
            ]
        )
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write(xml)
            f.flush()
            path = f.name
        try:
            tracks = list(collection_tracks_from_xml(path))
            assert len(tracks) == 1
            ct = tracks[0]
            assert isinstance(ct, CollectionTrack)
            assert ct.track_id == "42"
            assert ct.title == "My Track"
            assert ct.artist == "My Artist"
            assert ct.remix_version == "Remixer X"
            assert ct.label == "My Label"
        finally:
            os.unlink(path)


class TestTrackKey:
    """Test track_key."""

    def test_track_key_is_track_id(self):
        """track_key(record) returns record.track_id."""
        ct = CollectionTrack(
            track_id="123", title="T", artist="A", remix_version="", label=None
        )
        assert track_key(ct) == "123"


class TestToInventoryRecord:
    """Test to_inventory_record."""

    def test_to_inventory_record_has_created_updated_at(self):
        """to_inventory_record sets created_at and updated_at to now_iso."""
        ct = CollectionTrack(
            track_id="1", title="T", artist="A", remix_version="", label=None
        )
        now_iso = "2025-02-26T12:00:00Z"
        record = to_inventory_record(ct, now_iso)
        assert record.created_at == now_iso
        assert record.updated_at == now_iso
        assert record.track_key == "1"
        assert record.track_id == "1"
        assert record.artist == "A"
        assert record.title == "T"
        assert record.beatport_track_id is None
        assert record.beatport_url is None
