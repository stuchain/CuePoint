#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Checkpoint Service (Design 5.8, 5.27, 5.28, 5.29, 5.31).

Saves and loads processing checkpoints for resume-after-crash.
Checkpoint schema is versioned; validation ensures XML unchanged before resume.
"""

import hashlib
import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional

# Design 5.69: Keep checkpoints for 7 days
CHECKPOINT_MAX_AGE_DAYS = 7

# Design 5.28: schema version for checkpoint format
CHECKPOINT_SCHEMA_VERSION = 1
CHECKPOINT_FILENAME = "cuepoint_checkpoint.json"
MAX_CHECKPOINT_SIZE_BYTES = 1024 * 1024  # 1 MB (Design 5.68)


@dataclass
class CheckpointData:
    """Checkpoint state (Design 5.14, 5.28)."""

    schema_version: int = CHECKPOINT_SCHEMA_VERSION
    run_id: str = ""
    playlist: str = ""
    xml_path: str = ""
    xml_hash: str = ""
    last_track_index: int = 0
    last_track_id: str = ""
    output_paths: Dict[str, str] = field(default_factory=dict)
    created_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for JSON."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CheckpointData":
        """Deserialize from JSON dict."""
        return cls(
            schema_version=data.get("schema_version", 0),
            run_id=data.get("run_id", ""),
            playlist=data.get("playlist", ""),
            xml_path=data.get("xml_path", ""),
            xml_hash=data.get("xml_hash", ""),
            last_track_index=int(data.get("last_track_index", 0)),
            last_track_id=data.get("last_track_id", ""),
            output_paths=dict(data.get("output_paths") or {}),
            created_at=data.get("created_at", ""),
        )


def compute_xml_hash(xml_path: str, max_bytes: int = 50 * 1024 * 1024) -> str:
    """Compute SHA256 hash of XML file for integrity check (Design 5.31).

    Reads up to max_bytes to avoid loading huge files.
    """
    path = Path(xml_path)
    if not path.exists():
        return ""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        read = 0
        while read < max_bytes:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
            read += len(chunk)
    return h.hexdigest()


def get_checkpoint_dir() -> Path:
    """Return directory for checkpoint files (app data location)."""
    try:
        from cuepoint.utils.paths import AppPaths
        return AppPaths.data_dir()
    except Exception:
        return Path.home() / ".cuepoint" / "data"


class CheckpointService:
    """Save/load and validate checkpoints (Design 5.27, 5.29, 5.30)."""

    def __init__(self, checkpoint_dir: Optional[Path] = None, logger: Optional[logging.Logger] = None):
        self._dir = Path(checkpoint_dir) if checkpoint_dir else get_checkpoint_dir()
        self._dir.mkdir(parents=True, exist_ok=True)
        self._log = logger or logging.getLogger(__name__)

    def checkpoint_path(self) -> Path:
        return self._dir / CHECKPOINT_FILENAME

    def save(
        self,
        run_id: str,
        playlist: str,
        xml_path: str,
        xml_hash: str,
        last_track_index: int,
        last_track_id: str,
        output_paths: Dict[str, str],
    ) -> None:
        """Write checkpoint to disk (Design 5.27). Uses atomic write via temp file."""
        data = CheckpointData(
            schema_version=CHECKPOINT_SCHEMA_VERSION,
            run_id=run_id,
            playlist=playlist,
            xml_path=xml_path,
            xml_hash=xml_hash,
            last_track_index=last_track_index,
            last_track_id=last_track_id,
            output_paths=dict(output_paths),
            created_at=datetime.now(tz=timezone.utc).isoformat(),
        )
        raw = json.dumps(data.to_dict(), indent=2)
        if len(raw.encode("utf-8")) > MAX_CHECKPOINT_SIZE_BYTES:
            self._log.warning("[reliability] checkpoint too large, skipping save")
            return
        path = self.checkpoint_path()
        tmp_path = path.with_suffix(path.suffix + ".tmp")
        try:
            tmp_path.write_text(raw, encoding="utf-8")
            tmp_path.replace(path)
            self._log.info("[reliability] checkpoint_saved run_id=%s index=%s", run_id, last_track_index)
        except OSError as e:
            self._log.warning("[reliability] checkpoint save failed: %s", e)
            if tmp_path.exists():
                try:
                    tmp_path.unlink()
                except OSError:
                    pass

    def load(self) -> Optional[CheckpointData]:
        """Load checkpoint from disk. Returns None if missing or invalid."""
        path = self.checkpoint_path()
        if not path.exists():
            return None
        try:
            content = path.read_text(encoding="utf-8")
        except OSError as e:
            self._log.warning("[reliability] checkpoint read failed: %s", e)
            return None
        if len(content.encode("utf-8")) > MAX_CHECKPOINT_SIZE_BYTES:
            self._log.warning("[reliability] checkpoint file too large, ignoring")
            return None
        try:
            obj = json.loads(content)
        except json.JSONDecodeError as e:
            self._log.warning("[reliability] checkpoint JSON invalid: %s", e)
            return None
        if not isinstance(obj, dict):
            return None
        data = CheckpointData.from_dict(obj)
        if data.schema_version != CHECKPOINT_SCHEMA_VERSION:
            self._log.warning(
                "[reliability] checkpoint schema_version=%s unsupported",
                data.schema_version,
            )
            return None
        # Design 5.69: Discard checkpoint older than 7 days
        if data.created_at:
            try:
                created = datetime.fromisoformat(
                    data.created_at.replace("Z", "+00:00")
                )
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) - created > timedelta(
                    days=CHECKPOINT_MAX_AGE_DAYS
                ):
                    self._log.info(
                        "[reliability] checkpoint older than %s days, discarding",
                        CHECKPOINT_MAX_AGE_DAYS,
                    )
                    self.discard()
                    return None
            except (ValueError, TypeError):
                pass
        return data

    def _validate_main_csv_headers(self, main_path: str) -> bool:
        """Design 5.16: Ensure main CSV headers match expected schema."""
        try:
            from cuepoint.services.output_writer import _main_csv_fieldnames, read_csv_skip_comments
            expected = set(_main_csv_fieldnames(True))
            fieldnames, _ = read_csv_skip_comments(main_path)
            if not fieldnames:
                return False
            header_set = set(fieldnames)
            return bool(expected and expected.issubset(header_set))
        except Exception:
            return False

    def can_resume(self, checkpoint: CheckpointData, xml_path: str) -> bool:
        """Validate resume preconditions (Design 5.29, 5.30): schema, XML hash, output files exist."""
        if checkpoint.schema_version != CHECKPOINT_SCHEMA_VERSION:
            return False
        current_hash = compute_xml_hash(xml_path)
        if not current_hash or current_hash != checkpoint.xml_hash:
            return False
        for key, out_path in (checkpoint.output_paths or {}).items():
            if not out_path:
                continue
            if not Path(out_path).exists():
                return False
        # Design 5.16: Validate main CSV headers match expected schema
        main_path = (checkpoint.output_paths or {}).get("main")
        if main_path and not self._validate_main_csv_headers(main_path):
            return False
        return True

    def validate_and_load(self, xml_path: str) -> Optional[CheckpointData]:
        """Load checkpoint and validate for resume. Returns None if not resumable."""
        data = self.load()
        if not data:
            return None
        if not self.can_resume(data, xml_path):
            return None
        return data

    def discard(self) -> None:
        """Remove checkpoint file (Design 5.47, 5.49)."""
        path = self.checkpoint_path()
        if path.exists():
            try:
                path.unlink()
                self._log.info("[reliability] checkpoint discarded")
            except OSError as e:
                self._log.warning("[reliability] checkpoint discard failed: %s", e)

    def exists(self) -> bool:
        """Return True if a checkpoint file is present."""
        return self.checkpoint_path().exists()
