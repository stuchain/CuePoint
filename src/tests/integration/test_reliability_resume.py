#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Integration tests for reliability: resume after partial run (Design 5.51, 5.52, 5.53)."""

from pathlib import Path


from cuepoint.services.checkpoint_service import (
    CheckpointService,
    compute_xml_hash,
)
from cuepoint.services.output_writer import (
    append_rows_to_main_csv,
    write_main_csv,
)
from cuepoint.models.result import TrackResult


def _make_result(
    playlist_index: int, title: str, artist: str, matched: bool
) -> TrackResult:
    """Build a minimal TrackResult for tests."""
    return TrackResult(
        playlist_index=playlist_index,
        title=title,
        artist=artist,
        matched=matched,
        match_score=85.0 if matched else 0.0,
    )


def test_resume_append_to_existing_csv(tmp_path):
    """Design 5.75, 5.118: Append new results to existing main CSV on resume."""
    output_dir = str(tmp_path)
    base = "test_run"
    # Write initial batch (tracks 1-2)
    results1 = [
        _make_result(1, "Track One", "Artist A", True),
        _make_result(2, "Track Two", "Artist B", False),
    ]
    written = write_main_csv(
        results1,
        base + "_20260101_120000.csv",
        output_dir,
        delimiter=",",
        include_metadata=True,
    )
    assert written is not None
    main_path = written
    with open(main_path, encoding="utf-8") as f:
        lines1 = f.readlines()
    assert len(lines1) >= 2  # header + 2 rows

    # Append resume batch (tracks 3-4)
    results2 = [
        _make_result(3, "Track Three", "Artist C", True),
        _make_result(4, "Track Four", "Artist D", False),
    ]
    appended = append_rows_to_main_csv(
        results2,
        main_path,
        delimiter=",",
        include_metadata=True,
    )
    assert appended == main_path
    with open(main_path, encoding="utf-8") as f:
        lines2 = f.readlines()
    assert len(lines2) == len(lines1) + 2  # 2 more data rows


def test_checkpoint_validate_and_resume_with_csv_headers(tmp_path):
    """Design 5.16, 5.29: can_resume validates CSV headers."""
    # Create a valid main CSV
    output_dir = tmp_path / "out"
    output_dir.mkdir()
    main_path = str(output_dir / "main.csv")
    results = [_make_result(1, "A", "B", True)]
    write_main_csv(results, "main.csv", str(output_dir), include_metadata=True)
    assert Path(main_path).exists()

    # Create checkpoint for same XML
    xml_file = tmp_path / "test.xml"
    xml_file.write_text("<root/>", encoding="utf-8")
    xml_hash = compute_xml_hash(str(xml_file))
    svc = CheckpointService(checkpoint_dir=tmp_path)
    svc.save(
        run_id="r1",
        playlist="P",
        xml_path=str(xml_file),
        xml_hash=xml_hash,
        last_track_index=1,
        last_track_id="trk_000001",
        output_paths={"main": main_path},
    )
    # Validate and load should succeed (headers match)
    loaded = svc.validate_and_load(str(xml_file))
    assert loaded is not None
    assert svc.can_resume(loaded, str(xml_file))


def test_run_with_retry_integration_injected_failure():
    """Design 5.51, 5.52: Injected transient failure is retried and succeeds."""
    from cuepoint.services.reliability_retry import run_with_retry

    attempts = []

    def flaky(attempts_list):
        attempts_list.append(1)
        if len(attempts_list) < 2:
            raise ConnectionError("simulated DNS/network failure")
        return "ok"

    result = run_with_retry(flaky, attempts, max_retries=3)
    assert result == "ok"
    assert len(attempts) == 2  # first failed, second succeeded
