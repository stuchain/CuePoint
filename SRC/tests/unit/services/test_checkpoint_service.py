#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for checkpoint service (Design 5.8, 5.27, 5.116)."""

import json


from cuepoint.services.checkpoint_service import (
    CHECKPOINT_SCHEMA_VERSION,
    CheckpointData,
    CheckpointService,
    compute_xml_hash,
)


def test_checkpoint_data_to_from_dict():
    """CheckpointData serializes and deserializes correctly."""
    data = CheckpointData(
        schema_version=CHECKPOINT_SCHEMA_VERSION,
        run_id="abc123",
        playlist="MyPlaylist",
        xml_path="/path/to.xml",
        xml_hash="deadbeef",
        last_track_index=120,
        last_track_id="trk_000120",
        output_paths={"main": "/out/main.csv"},
        created_at="2026-01-31T12:00:00Z",
    )
    d = data.to_dict()
    assert d["schema_version"] == CHECKPOINT_SCHEMA_VERSION
    assert d["run_id"] == "abc123"
    assert d["last_track_index"] == 120
    assert d["output_paths"]["main"] == "/out/main.csv"
    restored = CheckpointData.from_dict(d)
    assert restored.run_id == data.run_id
    assert restored.last_track_index == data.last_track_index
    assert restored.output_paths == data.output_paths


def test_compute_xml_hash_returns_hex_string(tmp_path):
    """compute_xml_hash returns 64-char hex SHA256."""
    f = tmp_path / "test.xml"
    f.write_text("<root>hello</root>", encoding="utf-8")
    h = compute_xml_hash(str(f))
    assert isinstance(h, str)
    assert len(h) == 64
    assert all(c in "0123456789abcdef" for c in h)


def test_compute_xml_hash_missing_file():
    """compute_xml_hash returns empty string for missing file."""
    result = compute_xml_hash("/nonexistent/path.xml")
    assert result == ""


def test_checkpoint_service_save_load(tmp_path):
    """CheckpointService save and load round-trip (Design 5.116)."""
    svc = CheckpointService(checkpoint_dir=tmp_path)
    assert not svc.exists()
    svc.save(
        run_id="run1",
        playlist="P",
        xml_path="/x.xml",
        xml_hash="abc",
        last_track_index=50,
        last_track_id="trk_000050",
        output_paths={"main": "/out/main.csv"},
    )
    assert svc.exists()
    data = svc.load()
    assert data is not None
    assert data.run_id == "run1"
    assert data.last_track_index == 50
    assert data.output_paths.get("main") == "/out/main.csv"


def test_checkpoint_service_load_missing(tmp_path):
    """Load returns None when no checkpoint file."""
    svc = CheckpointService(checkpoint_dir=tmp_path)
    assert svc.load() is None


def test_checkpoint_service_corrupt_json_ignored(tmp_path):
    """Corrupt JSON checkpoint is ignored (Design 5.116)."""
    path = tmp_path / "cuepoint_checkpoint.json"
    path.write_text("{ invalid json", encoding="utf-8")
    svc = CheckpointService(checkpoint_dir=tmp_path)
    assert svc.load() is None


def test_checkpoint_service_unsupported_schema_version(tmp_path):
    """Unsupported schema version returns None (Design 5.116)."""
    path = tmp_path / "cuepoint_checkpoint.json"
    path.write_text(
        json.dumps({"schema_version": 999, "run_id": "x", "last_track_index": 0}),
        encoding="utf-8",
    )
    svc = CheckpointService(checkpoint_dir=tmp_path)
    assert svc.load() is None


def test_checkpoint_service_can_resume_hash_mismatch(tmp_path):
    """can_resume False when XML hash does not match."""
    svc = CheckpointService(checkpoint_dir=tmp_path)
    xml_file = tmp_path / "input.xml"
    xml_file.write_text("<a/>", encoding="utf-8")
    _ = compute_xml_hash(str(xml_file))  # Hash exists but mismatch is tested via cp
    cp = CheckpointData(
        schema_version=CHECKPOINT_SCHEMA_VERSION,
        run_id="r",
        xml_path=str(xml_file),
        xml_hash="different_hash",
        last_track_index=1,
        output_paths={},
    )
    assert not svc.can_resume(cp, str(xml_file))


def test_checkpoint_service_discard(tmp_path):
    """discard removes checkpoint file."""
    svc = CheckpointService(checkpoint_dir=tmp_path)
    svc.save(
        run_id="r",
        playlist="P",
        xml_path="/x.xml",
        xml_hash="h",
        last_track_index=1,
        last_track_id="trk_000001",
        output_paths={},
    )
    assert svc.exists()
    svc.discard()
    assert not svc.exists()


def test_checkpoint_service_validate_and_load_no_checkpoint(tmp_path):
    """validate_and_load returns None when no checkpoint."""
    xml_file = tmp_path / "input.xml"
    xml_file.write_text("<a/>", encoding="utf-8")
    svc = CheckpointService(checkpoint_dir=tmp_path)
    assert svc.validate_and_load(str(xml_file)) is None
