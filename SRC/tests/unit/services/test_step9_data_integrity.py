#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Step 9: Data Integrity and Auditability - Unit tests.

Tests schema validation, checksums, audit log, verification, backup,
re-import readiness, summary report, diff report, and review-only mode.
"""

import json
import os
from pathlib import Path

import pytest

from cuepoint.models.result import TrackResult
from cuepoint.services.integrity_service import (
    SCHEMA_VERSION,
    compute_sha256,
    create_backup,
    generate_diff_report,
    generate_run_id,
    get_csv_header_lines,
    result_to_audit_entry,
    validate_main_csv_schema,
    validate_reimport_readiness,
    verify_checksum,
    verify_outputs,
    write_audit_log,
    write_checksum_file,
    write_summary_report,
)
from cuepoint.services.output_writer import write_csv_files
from cuepoint.utils.run_context import clear_run_id, set_run_id


@pytest.fixture
def sample_results():
    """Create sample TrackResult list for testing."""
    return [
        TrackResult(
            playlist_index=1,
            title="Test Song",
            artist="Test Artist",
            matched=True,
            beatport_url="https://beatport.com/track/123",
            beatport_title="Test Song",
            beatport_artists="Test Artist",
            match_score=95.0,
            confidence="high",
            queries_data=[
                {"index": 0, "query": "Test Song Test Artist", "candidates": 5}
            ],
            candidates_data=[],
        ),
        TrackResult(
            playlist_index=2,
            title="Another Track",
            artist="Another Artist",
            matched=False,
            queries_data=[{"index": 0, "query": "Another Track", "candidates": 0}],
            candidates_data=[],
        ),
    ]


class TestSchemaValidation:
    """Test schema validation (Design 9.43, 9.44)."""

    def test_validate_main_csv_schema_valid(self):
        """Valid headers pass validation."""
        headers = [
            "playlist_index",
            "original_title",
            "original_artists",
            "beatport_title",
            "beatport_artists",
            "beatport_key",
            "beatport_key_camelot",
            "beatport_year",
            "beatport_bpm",
            "beatport_url",
            "title_sim",
            "artist_sim",
            "match_score",
            "confidence",
            "search_query_index",
            "search_stop_query_index",
            "candidate_index",
        ]
        valid, err = validate_main_csv_schema(headers, include_metadata=False)
        assert valid is True
        assert err is None

    def test_validate_main_csv_schema_missing_column(self):
        """Missing required column fails (D001)."""
        headers = ["playlist_index", "original_title"]  # Missing many
        valid, err = validate_main_csv_schema(headers, include_metadata=False)
        assert valid is False
        assert "D001" in err
        assert "Missing" in err


class TestValidateReimportReadiness:
    """Test re-import validation (Design 9.149, 9.150)."""

    def test_validate_reimport_readiness_valid(self):
        """Headers with Rekordbox re-import columns pass."""
        headers = [
            "playlist_index",
            "original_title",
            "original_artists",
            "beatport_title",
            "beatport_artists",
        ]
        valid, err = validate_reimport_readiness(headers)
        assert valid is True
        assert err is None

    def test_validate_reimport_readiness_missing_playlist_index(self):
        """Missing playlist_index fails."""
        headers = ["original_title", "original_artists"]
        valid, err = validate_reimport_readiness(headers)
        assert valid is False
        assert "D001" in err
        assert "playlist_index" in err
        assert "Rekordbox" in err

    def test_validate_reimport_readiness_missing_original_title(self):
        """Missing original_title fails."""
        headers = ["playlist_index", "original_artists"]
        valid, err = validate_reimport_readiness(headers)
        assert valid is False
        assert "original_title" in err


class TestChecksums:
    """Test checksum generation and verification (Design 9.18, 9.166)."""

    def test_compute_sha256(self, tmp_path):
        """SHA256 is computed correctly."""
        f = tmp_path / "test.txt"
        f.write_text("hello world")
        digest = compute_sha256(str(f))
        assert len(digest) == 64
        assert all(c in "0123456789abcdef" for c in digest)

    def test_write_and_verify_checksum(self, tmp_path):
        """Checksum file can be written and verified."""
        f = tmp_path / "data.csv"
        f.write_text("a,b,c\n1,2,3\n")
        checksum = compute_sha256(str(f))
        sha_path = write_checksum_file(str(f), checksum)
        assert os.path.exists(sha_path)
        assert sha_path.endswith(".sha256")
        valid, err = verify_checksum(str(f))
        assert valid is True
        assert err is None

    def test_verify_checksum_mismatch(self, tmp_path):
        """Modified file fails checksum (D002)."""
        f = tmp_path / "data.csv"
        f.write_text("original")
        write_checksum_file(str(f), compute_sha256(str(f)))
        f.write_text("modified")
        valid, err = verify_checksum(str(f))
        assert valid is False
        assert "D002" in err


class TestAuditLog:
    """Test audit log (Design 9.22, 9.88)."""

    def test_result_to_audit_entry(self, sample_results):
        """TrackResult converts to audit entry."""
        entry = result_to_audit_entry(sample_results[0])
        assert entry["track_id"] == "trk_000001"
        assert entry["title"] == "Test Song"
        assert entry["artist"] == "Test Artist"
        assert entry["query"] == "Test Song Test Artist"
        assert "score" in entry

    def test_write_audit_log(self, sample_results, tmp_path):
        """Audit log is written as JSONL."""
        path = tmp_path / "audit.jsonl"
        result = write_audit_log(sample_results, str(path), "run123")
        assert result is not None
        assert os.path.exists(path)
        lines = path.read_text(encoding="utf-8").strip().split("\n")
        assert len(lines) >= 2  # Header + entries
        import json

        first = json.loads(lines[0])
        assert first.get("run_id") == "run123"
        assert first.get("schema_version") == SCHEMA_VERSION


class TestRunIdAndHeaders:
    """Test run ID and CSV headers (Design 9.15, 9.86)."""

    def test_generate_run_id_uses_context(self):
        """generate_run_id uses current run_id if set."""
        clear_run_id()
        rid = set_run_id("custom123")
        assert rid == "custom123"

        assert generate_run_id() == "custom123"
        clear_run_id()

    def test_get_csv_header_lines(self):
        """Header lines have correct format."""
        lines = get_csv_header_lines(1, "abc123", "complete")
        assert any("# schema_version=1" in line for line in lines)
        assert any("# run_id=abc123" in line for line in lines)
        assert any("# run_status=complete" in line for line in lines)


class TestBackup:
    """Test backup creation (Design 9.17, 9.63)."""

    def test_create_backup(self, tmp_path):
        """Backup file is created."""
        f = tmp_path / "output.csv"
        f.write_text("data")
        bak = create_backup(str(f))
        assert bak is not None
        assert os.path.exists(bak)
        assert Path(bak).read_text() == "data"


class TestSummaryReport:
    """Test summary report with confidence distribution and unmatched handling (Design 9)."""

    def test_write_summary_report_confidence_distribution(
        self, sample_results, tmp_path
    ):
        """Summary report includes confidence distribution (high, medium, low)."""
        path = tmp_path / "summary.json"
        output_files = {"main": str(tmp_path / "main.csv")}
        write_summary_report(sample_results, str(path), "run99", output_files)
        assert path.exists()
        data = json.loads(path.read_text(encoding="utf-8"))
        assert data["run_id"] == "run99"
        assert "summary" in data
        assert data["summary"]["total_tracks"] == 2
        assert data["summary"]["matched"] == 1
        assert data["summary"]["unmatched"] == 1
        dist = data["summary"]["confidence_distribution"]
        assert "high" in dist
        assert "medium" in dist
        assert "low" in dist
        assert dist["high"] >= 1  # Track 1 has score 95

    def test_write_summary_report_unmatched_with_recommended_actions(
        self, sample_results, tmp_path
    ):
        """Unmatched tracks include recommended_actions."""
        path = tmp_path / "summary.json"
        write_summary_report(sample_results, str(path), "run99", {})
        data = json.loads(path.read_text(encoding="utf-8"))
        assert "unmatched_tracks" in data
        unmatched = data["unmatched_tracks"]
        assert len(unmatched) == 1
        entry = unmatched[0]
        assert entry["playlist_index"] == 2
        assert entry["title"] == "Another Track"
        assert "recommended_actions" in entry
        actions = entry["recommended_actions"]
        assert "Verify artist and title spelling." in actions
        assert "Track may not be available on Beatport." in actions
        assert any("No search results found" in a for a in actions)  # candidates=0

    def test_write_summary_report_unmatched_with_artist_gets_artist_action(
        self, tmp_path
    ):
        """Unmatched track with artist gets 'Try searching with artist name only'."""
        results = [
            TrackResult(
                playlist_index=1,
                title="Obscure Track",
                artist="Known Artist",
                matched=False,
                queries_data=[{"index": 0, "query": "Obscure", "candidates": 0}],
                candidates_data=[],
            )
        ]
        path = tmp_path / "summary.json"
        write_summary_report(results, str(path), "run1", {})
        data = json.loads(path.read_text(encoding="utf-8"))
        actions = data["unmatched_tracks"][0]["recommended_actions"]
        assert "Try searching with artist name only." in actions


class TestDiffReport:
    """Test diff report comparing input vs output metadata (Design 9.151, 9.152)."""

    def test_generate_diff_report_matched_track(self, sample_results, tmp_path):
        """Diff report shows changes for matched track."""
        path = tmp_path / "diff.json"
        generate_diff_report(sample_results, str(path), "run42")
        assert path.exists()
        data = json.loads(path.read_text(encoding="utf-8"))
        assert data["run_id"] == "run42"
        assert data["track_count"] == 2
        diffs = data["diffs"]
        assert len(diffs) == 2
        # First track: matched, same title/artist
        d0 = diffs[0]
        assert d0["playlist_index"] == 1
        assert d0["input"]["title"] == "Test Song"
        assert d0["output"]["title"] == "Test Song"
        assert "changes" in d0

    def test_generate_diff_report_unmatched_track(self, sample_results, tmp_path):
        """Diff report shows 'No match found' for unmatched track."""
        path = tmp_path / "diff.json"
        generate_diff_report(sample_results, str(path), "run42")
        data = json.loads(path.read_text(encoding="utf-8"))
        d1 = data["diffs"][1]
        assert d1["playlist_index"] == 2
        assert "No match found" in d1["changes"]

    def test_generate_diff_report_title_change(self, tmp_path):
        """Diff report records title change when input differs from output."""
        results = [
            TrackResult(
                playlist_index=1,
                title="Original Title",
                artist="Artist",
                matched=True,
                beatport_title="Corrected Title",
                beatport_artists="Artist",
                match_score=90.0,
            )
        ]
        path = tmp_path / "diff.json"
        generate_diff_report(results, str(path), "run1")
        data = json.loads(path.read_text(encoding="utf-8"))
        changes = data["diffs"][0]["changes"]
        assert any(
            "Title:" in c and "Original" in c and "Corrected" in c for c in changes
        )


class TestVerifyOutputs:
    """Test verify_outputs (Design 9.58, 9.97)."""

    def test_verify_outputs_ok(self, sample_results, tmp_path):
        """Verify passes for valid outputs."""
        write_csv_files(sample_results, "test", str(tmp_path))
        ok, errors = verify_outputs(str(tmp_path))
        assert ok is True
        assert len(errors) == 0

    def test_verify_outputs_no_main_csv(self, tmp_path):
        """Verify fails when no main CSV (D005)."""
        ok, errors = verify_outputs(str(tmp_path))
        assert ok is False
        assert any("D005" in e for e in errors)


class TestWriteCsvWithIntegrity:
    """Test write_csv_files with integrity features (Design 9)."""

    def test_write_csv_includes_headers(self, sample_results, tmp_path):
        """Main CSV includes schema_version and run_id headers."""
        set_run_id("test_run_123")
        try:
            out = write_csv_files(sample_results, "playlist", str(tmp_path))
            assert "main" in out
            main_path = out["main"]
            content = Path(main_path).read_text(encoding="utf-8")
            assert "# schema_version=" in content
            assert "# run_id=" in content
        finally:
            clear_run_id()

    def test_write_csv_creates_checksum(self, sample_results, tmp_path):
        """Checksum file is created for main CSV."""
        out = write_csv_files(sample_results, "playlist", str(tmp_path), checksums=True)
        main_path = out.get("main")
        assert main_path
        sha_path = main_path + ".sha256"
        assert os.path.exists(sha_path)

    def test_write_csv_creates_audit_log(self, sample_results, tmp_path):
        """Audit log is created."""
        out = write_csv_files(sample_results, "playlist", str(tmp_path), audit_log=True)
        assert "audit" in out
        assert os.path.exists(out["audit"])

    def test_write_csv_skips_checksum_when_disabled(self, sample_results, tmp_path):
        """No checksum when checksums=False."""
        out = write_csv_files(
            sample_results, "playlist", str(tmp_path), checksums=False
        )
        main_path = out.get("main")
        assert main_path
        assert not os.path.exists(main_path + ".sha256")

    def test_write_csv_review_only_exports_only_review_and_summary(
        self, sample_results, tmp_path
    ):
        """Review-only mode exports only review CSV and summary report (Design 9)."""
        set_run_id("review_run")
        try:
            out = write_csv_files(
                sample_results,
                "playlist",
                str(tmp_path),
                review_only=True,
                summary_report=True,
            )
            # Should have review (low-confidence/unmatched) and summary
            assert "summary" in out
            assert os.path.exists(out["summary"])
            # Track 2 is unmatched -> needs review
            if "review" in out and out["review"]:
                assert os.path.exists(out["review"])
            # Should NOT have main, candidates, queries, audit, diff, checksum
            assert "main" not in out
            assert "candidates" not in out
            assert "queries" not in out
            assert "audit" not in out
            assert "diff" not in out
        finally:
            clear_run_id()

    def test_write_csv_review_only_summary_has_unmatched(
        self, sample_results, tmp_path
    ):
        """Review-only summary report contains unmatched tracks with actions."""
        out = write_csv_files(
            sample_results,
            "playlist",
            str(tmp_path),
            review_only=True,
            summary_report=True,
        )
        summary_path = out.get("summary")
        assert summary_path
        data = json.loads(Path(summary_path).read_text(encoding="utf-8"))
        assert data["summary"]["unmatched"] == 1
        assert len(data["unmatched_tracks"]) == 1
        assert "recommended_actions" in data["unmatched_tracks"][0]

    def test_write_csv_creates_summary_and_diff_by_default(
        self, sample_results, tmp_path
    ):
        """Default write_csv_files creates summary and diff reports."""
        out = write_csv_files(sample_results, "playlist", str(tmp_path))
        assert "summary" in out
        assert "diff" in out
        assert os.path.exists(out["summary"])
        assert os.path.exists(out["diff"])
