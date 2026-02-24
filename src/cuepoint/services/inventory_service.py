"""inCrate inventory service: import from Rekordbox XML, enrich labels, query library."""

import logging
import os
import platform
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from cuepoint.incrate import collection_parser, enrichment, inventory_db

_logger = logging.getLogger(__name__)


def default_inventory_db_path() -> str:
    """Return platform-specific default path for inventory SQLite DB."""
    if platform.system() == "Windows":
        base = os.environ.get("APPDATA", os.path.expanduser("~"))
    elif platform.system() == "Darwin":
        base = os.path.expanduser("~/Library/Application Support")
    else:
        base = os.environ.get("XDG_DATA_HOME", os.path.expanduser("~/.local/share"))
    path = Path(base) / "CuePoint" / "incrate" / "inventory.sqlite"
    path.parent.mkdir(parents=True, exist_ok=True)
    return str(path)


class InventoryService:
    """Facade for inCrate inventory: import, enrich, and query."""

    def __init__(
        self,
        db_path: Optional[str] = None,
        config_service: Optional[Any] = None,
        beatport_service: Optional[Any] = None,
        logging_service: Optional[Any] = None,
        processor_service: Optional[Any] = None,
    ):
        """Initialize the inventory service.

        Args:
            db_path: Path to SQLite inventory DB. If None, taken from config or default.
            config_service: Optional IConfigService for incrate.inventory_db_path, etc.
            beatport_service: Optional IBeatportService (used when processor_service is None).
            logging_service: Optional ILoggingService (currently unused).
            processor_service: Optional IProcessorService for full inKey pipeline + parallel workers.
        """
        self._config = config_service
        self._beatport = beatport_service
        self._logging = logging_service
        self._processor = processor_service

        if db_path is not None:
            self._db_path = db_path
        elif config_service is not None:
            try:
                self._db_path = config_service.get("incrate.inventory_db_path")
            except AttributeError:
                self._db_path = None
            if not self._db_path:
                self._db_path = default_inventory_db_path()
        else:
            self._db_path = default_inventory_db_path()
        inventory_db.init_db(self._db_path)

    @property
    def db_path(self) -> str:
        return self._db_path

    def reset_database(self) -> None:
        """Clear all inventory rows. Use when switching to a different collection.xml."""
        inventory_db.reset_db(self._db_path)
        _logger.info("inCrate: inventory database reset (user can re-import another collection)")

    def import_from_xml(
        self,
        xml_path: str,
        enrich: bool = True,
        progress_callback: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Import COLLECTION from Rekordbox XML and optionally enrich empty labels.

        Args:
            xml_path: Path to Rekordbox XML export.
            enrich: If True, run label enrichment for rows with empty label (when beatport_service set).
            progress_callback: Optional (current, total) for enrichment progress.

        Returns:
            Dict with imported (int), enriched (int), errors (list).
        """
        result: Dict[str, Any] = {"imported": 0, "enriched": 0, "errors": []}
        inventory_db.init_db(self._db_path)
        _logger.info("inCrate import: starting import from %s (enrich=%s)", xml_path, enrich)

        try:
            tracks = list(
                collection_parser.collection_tracks_from_xml(
                    xml_path, progress_callback=progress_callback
                )
            )
            _logger.info("inCrate import: parsed %s tracks, writing to database", len(tracks))
        except FileNotFoundError as e:
            result["errors"].append(str(e))
            raise
        except Exception as e:
            result["errors"].append(str(e))
            raise

        if progress_callback:
            progress_callback(-1, len(tracks))
        _logger.info("inCrate import: upserting %s records to DB", len(tracks))

        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        records = [
            collection_parser.to_inventory_record(ct, now_iso)
            for ct in tracks
        ]
        conn = inventory_db.get_connection(self._db_path)
        try:
            cur = conn.cursor()
            inventory_db.upsert_batch(cur, records)
            conn.commit()
            result["imported"] = len(records)
        finally:
            conn.close()
        _logger.info("inCrate import: DB write complete, imported=%s", result["imported"])

        if enrich and (self._processor is not None or self._beatport is not None):
            delay = 0.5
            if self._config is not None:
                try:
                    delay = float(
                        self._config.get("incrate.enrichment_delay_seconds", 0.5)
                    )
                except (TypeError, AttributeError):
                    pass
            _logger.info("inCrate import: starting label enrichment")
            result["enriched"] = enrichment.enrich_labels_for_empty(
                self._db_path,
                self._beatport or None,
                progress_callback=progress_callback,
                delay_seconds=delay,
                processor_service=self._processor,
                config_service=self._config,
            )
            _logger.info("inCrate import: enrichment complete, enriched=%s", result["enriched"])
        _logger.info("inCrate import: done — imported=%s, enriched=%s", result["imported"], result["enriched"])
        return result

    def get_library_artists(self) -> List[str]:
        """Return distinct library artist names, sorted."""
        conn = inventory_db.get_connection(self._db_path)
        try:
            return inventory_db.get_library_artists(conn.cursor())
        finally:
            conn.close()

    def get_library_labels(self) -> List[str]:
        """Return distinct library labels, sorted."""
        conn = inventory_db.get_connection(self._db_path)
        try:
            return inventory_db.get_library_labels(conn.cursor())
        finally:
            conn.close()

    def has_artist(self, name: str) -> bool:
        """Return True if any track has the given artist (case-insensitive)."""
        conn = inventory_db.get_connection(self._db_path)
        try:
            return inventory_db.has_artist(conn.cursor(), name)
        finally:
            conn.close()

    def get_inventory_stats(self) -> Dict[str, int]:
        """Return total and with_label counts."""
        conn = inventory_db.get_connection(self._db_path)
        try:
            return inventory_db.get_inventory_stats(conn.cursor())
        finally:
            conn.close()

    def list_inventory(
        self,
        limit: int = 5000,
        search: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Return inventory rows for UI (artist, title, label, beatport_url, etc.)."""
        conn = inventory_db.get_connection(self._db_path)
        try:
            return inventory_db.get_all_inventory(conn.cursor(), limit=limit, search=search)
        finally:
            conn.close()
