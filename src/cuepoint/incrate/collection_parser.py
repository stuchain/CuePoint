"""Map Rekordbox COLLECTION parse output to inCrate models."""

from typing import Callable, Iterator, Optional

from cuepoint.data.rekordbox import parse_collection
from cuepoint.incrate.models import CollectionTrack, InventoryRecord


def collection_tracks_from_xml(
    xml_path: str,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> Iterator[CollectionTrack]:
    """Yield CollectionTrack for each TRACK in the COLLECTION of the given XML.

    Calls parse_collection from rekordbox and maps each tuple to CollectionTrack.
    progress_callback(current, -1) is invoked during parse when total is unknown.
    """
    for track_id, title, artist, remix_version, label in parse_collection(
        xml_path, progress_callback=progress_callback
    ):
        yield CollectionTrack(
            track_id=track_id,
            title=title,
            artist=artist,
            remix_version=remix_version,
            label=label,
        )


def track_key(record: CollectionTrack) -> str:
    """Return the unique key for upsert. Phase 1: track_id."""
    return record.track_id


def to_inventory_record(ct: CollectionTrack, now_iso: str) -> InventoryRecord:
    """Build an InventoryRecord from a CollectionTrack with created_at/updated_at set."""
    return InventoryRecord(
        track_key=track_key(ct),
        track_id=ct.track_id,
        artist=ct.artist,
        title=ct.title,
        remix_version=ct.remix_version,
        label=ct.label,
        beatport_track_id=None,
        beatport_url=None,
        created_at=now_iso,
        updated_at=now_iso,
    )
