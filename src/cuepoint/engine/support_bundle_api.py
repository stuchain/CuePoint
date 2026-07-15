"""Support bundle export via engine HTTP API (Phase 7)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from cuepoint.utils.support_bundle import SupportBundleGenerator


def parse_support_bundle_body(raw: bytes) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON body") from exc
    if not isinstance(data, dict):
        raise ValueError("JSON body must be an object")
    return data


def run_support_bundle(body: Dict[str, Any]) -> Dict[str, Any]:
    output_dir_raw = body.get("output_dir")
    if not output_dir_raw or not str(output_dir_raw).strip():
        raise ValueError("output_dir is required")
    output_dir = Path(str(output_dir_raw)).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    include_logs = bool(body.get("include_logs", True))
    include_config = bool(body.get("include_config", True))
    sanitize = bool(body.get("sanitize", True))

    bundle_path = SupportBundleGenerator.generate_bundle(
        output_dir,
        include_logs=include_logs,
        include_config=include_config,
        sanitize=sanitize,
    )
    return {
        "bundle_path": str(bundle_path),
        "file_name": bundle_path.name,
        "size_bytes": bundle_path.stat().st_size,
    }
