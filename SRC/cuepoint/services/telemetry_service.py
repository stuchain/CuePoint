#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Telemetry Service (Step 14: Analytics, Monitoring, and Telemetry)

Opt-in, privacy-respecting telemetry for product improvement.
- Events are queued and sent only when telemetry is enabled
- No PII: file paths, playlist names, raw queries are scrubbed
- Local buffer with retry for offline resilience
- HTTPS-only transport
"""

from __future__ import annotations

import json
import random
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from cuepoint.utils.platform import PlatformInfo
from cuepoint.version import get_version

# PII-sensitive property keys that must be scrubbed or omitted
_PII_KEYS: Set[str] = {
    "file_path",
    "xml_path",
    "output_path",
    "playlist_name",
    "output_dir",
    "query",
    "title",
    "artist",
}

# Max events in memory queue (Design 14.29)
MAX_QUEUE_SIZE = 100

# Max events per batch (Design 14.69)
MAX_BATCH_SIZE = 20

# Max payload size in bytes (Design 14.10)
MAX_PAYLOAD_BYTES = 5 * 1024

# Schema version for event format
SCHEMA_VERSION = 1


def _scrub_properties(properties: Dict[str, Any]) -> Dict[str, Any]:
    """Remove or redact PII from event properties."""
    if not properties:
        return {}
    scrubbed: Dict[str, Any] = {}
    for key, value in properties.items():
        key_lower = key.lower()
        if any(pii in key_lower for pii in _PII_KEYS):
            continue
        if isinstance(value, (list, dict)):
            continue  # No nested objects (Design 14.129)
        if isinstance(value, (str, int, float, bool)) or value is None:
            scrubbed[key] = value
    return scrubbed


class TelemetryService:
    """Opt-in telemetry service with local queue and optional remote send."""

    def __init__(
        self,
        config_service: Any,
        logging_service: Optional[Any] = None,
        data_dir: Optional[Path] = None,
    ) -> None:
        """Initialize telemetry service.

        Args:
            config_service: Service for reading telemetry.enabled, endpoint, sample_rate
            logging_service: Optional logger for telemetry send failures
            data_dir: Directory for local event buffer (default: ~/.cuepoint/telemetry)
        """
        self._config = config_service
        self._log = logging_service
        self._data_dir = data_dir or (Path.home() / ".cuepoint" / "telemetry")
        self._queue: List[Dict[str, Any]] = []
        self._lock = threading.Lock()
        self._session_id: Optional[str] = None

    def _get_session_id(self) -> str:
        """Get or create session ID (stable per app launch)."""
        if self._session_id is None:
            self._session_id = str(uuid.uuid4())[:16]
        return self._session_id

    def _is_enabled(self) -> bool:
        """Check if telemetry is enabled (opt-in)."""
        try:
            return bool(self._config.get("telemetry.enabled", False))
        except Exception:
            return False

    def _should_sample(self) -> bool:
        """Apply sample rate (1.0 = all, 0.1 = 10%)."""
        try:
            rate = float(self._config.get("telemetry.sample_rate", 1.0))
            return rate >= 1.0 or random.random() < rate
        except Exception:
            return True

    def _build_event(self, event_name: str, properties: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Build a telemetry event with required fields."""
        props = _scrub_properties(properties or {})
        # Omit None/empty values
        props = {k: v for k, v in props.items() if v is not None}
        platform_info = PlatformInfo()
        return {
            "event": event_name,
            "event_id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "schema_version": SCHEMA_VERSION,
            "version": get_version(),
            "os": platform_info.platform,
            "session_id": self._get_session_id(),
            "properties": props,
        }

    def _enqueue(self, event: Dict[str, Any]) -> None:
        """Add event to queue, drop oldest if over limit."""
        with self._lock:
            self._queue.append(event)
            if len(self._queue) > MAX_QUEUE_SIZE:
                self._queue.pop(0)

    def _persist_events(self, events: List[Dict[str, Any]]) -> None:
        """Persist events to local file for offline buffer / local dashboard."""
        if not events:
            return
        try:
            self._data_dir.mkdir(parents=True, exist_ok=True)
            path = self._data_dir / "events.jsonl"
            with open(path, "a", encoding="utf-8") as f:
                for ev in events:
                    f.write(json.dumps(ev, ensure_ascii=False) + "\n")
        except Exception as e:
            if self._log:
                self._log.warning("[telemetry] Could not persist events: %s", e)

    def _send_batch(self, events: List[Dict[str, Any]]) -> bool:
        """Send batch to configured endpoint via HTTPS. Returns True if successful."""
        endpoint = self._config.get("telemetry.endpoint") if self._config else None
        if not endpoint or not str(endpoint).startswith("https://"):
            return False
        try:
            import urllib.request

            payload = json.dumps({"events": events}, ensure_ascii=False).encode("utf-8")
            if len(payload) > MAX_PAYLOAD_BYTES:
                return False
            req = urllib.request.Request(
                endpoint,
                data=payload,
                method="POST",
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                return 200 <= resp.status < 300
        except Exception as e:
            if self._log:
                self._log.debug("[telemetry] Send failed: %s", e)
            return False

    def track(
        self,
        event_name: str,
        properties: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Track a telemetry event (no-op if disabled or not sampled).

        Args:
            event_name: Event name (snake_case, e.g. app_start, run_complete)
            properties: Optional event properties (primitives only, PII scrubbed)
        """
        if not self._is_enabled():
            return
        if not self._should_sample():
            return
        event = self._build_event(event_name, properties)
        endpoint = self._config.get("telemetry.endpoint") if self._config else None
        if endpoint:
            self._enqueue(event)
            with self._lock:
                if len(self._queue) >= MAX_BATCH_SIZE:
                    batch = self._queue[:MAX_BATCH_SIZE]
                    self._queue = self._queue[MAX_BATCH_SIZE:]
                else:
                    batch = []
            if batch:
                ok = self._send_batch(batch)
                if not ok:
                    with self._lock:
                        self._queue = batch + self._queue
                        if len(self._queue) > MAX_QUEUE_SIZE:
                            self._queue = self._queue[-MAX_QUEUE_SIZE:]
        else:
            self._persist_events([event])

    def flush(self) -> None:
        """Flush queued events (send or persist)."""
        with self._lock:
            batch = list(self._queue)
            self._queue.clear()
        if batch:
            endpoint = self._config.get("telemetry.endpoint") if self._config else None
            if endpoint:
                self._send_batch(batch)
            else:
                try:
                    self._data_dir.mkdir(parents=True, exist_ok=True)
                    path = self._data_dir / "events.jsonl"
                    with open(path, "a", encoding="utf-8") as f:
                        for ev in batch:
                            f.write(json.dumps(ev, ensure_ascii=False) + "\n")
                except Exception:
                    pass

    def delete_local_data(self) -> None:
        """Delete local telemetry data (on opt-out)."""
        try:
            path = self._data_dir / "events.jsonl"
            if path.exists():
                path.unlink()
            with self._lock:
                self._queue.clear()
        except Exception:
            pass
