"""Tests for engine M3U playlist match jobs."""

import time
from unittest.mock import patch

from cuepoint.engine.jobs import JobStore, start_match_job
from cuepoint.ui.gui_interface import ProgressInfo, TrackResult


def test_start_m3u_match_job_with_mock_processor(tmp_path):
    m3u_path = tmp_path / "set.m3u"
    m3u_path.write_text("#EXTM3U\nC:\\Music\\track.mp3\n", encoding="utf-8")
    store = JobStore()

    def fake_process(m3u_path_arg, progress_callback=None, controller=None):
        assert m3u_path_arg == str(m3u_path)
        if progress_callback:
            progress_callback(
                ProgressInfo(
                    completed_tracks=1,
                    total_tracks=1,
                    matched_count=1,
                    unmatched_count=0,
                    status_message="Done",
                    reliability_state="running",
                )
            )
        return (
            [
                TrackResult(
                    playlist_index=1,
                    title="Track One",
                    artist="Artist One",
                    matched=True,
                    beatport_title="Match",
                )
            ],
            None,
        )

    with patch("cuepoint.utils.di_container.get_container") as mock_container:
        processor = mock_container.return_value.resolve.return_value
        processor.process_playlist_from_m3u.side_effect = fake_process

        job = start_match_job(store, {"m3u_path": str(m3u_path)})

        for _ in range(100):
            current = store.get(job.id)
            assert current is not None
            if current.state.value in ("succeeded", "failed", "cancelled"):
                break
            time.sleep(0.02)

    finished = store.get(job.id)
    assert finished is not None
    assert finished.state.value == "succeeded"
    assert finished.demo is False
    assert len(finished.results) == 1
    assert finished.results[0].title == "Track One"


def test_start_m3u_match_job_surfaces_warning(tmp_path):
    m3u_path = tmp_path / "partial.m3u"
    m3u_path.write_text("#EXTM3U\n", encoding="utf-8")
    store = JobStore()

    def fake_process(_m3u_path_arg, progress_callback=None, controller=None):
        return ([], "Some tracks missing from disk")

    with patch("cuepoint.utils.di_container.get_container") as mock_container:
        processor = mock_container.return_value.resolve.return_value
        processor.process_playlist_from_m3u.side_effect = fake_process

        job = start_match_job(store, {"m3u_path": str(m3u_path)})

        for _ in range(100):
            current = store.get(job.id)
            if current and current.state.value in ("succeeded", "failed", "cancelled"):
                break
            time.sleep(0.02)

    finished = store.get(job.id)
    assert finished is not None
    assert finished.state.value == "succeeded"
    assert finished.progress is not None
    assert "Some tracks missing" in (finished.progress.status_message or "")


def test_m3u_path_takes_priority_over_xml(tmp_path):
    """When both paths are sent, M3U job runs (playlist file source)."""
    m3u_path = tmp_path / "set.m3u"
    m3u_path.write_text("#EXTM3U\n", encoding="utf-8")
    store = JobStore()
    called = {"m3u": False, "xml": False}

    def fake_m3u(*_args, **_kwargs):
        called["m3u"] = True
        return ([], None)

    def fake_xml(*_args, **_kwargs):
        called["xml"] = True
        return []

    with patch("cuepoint.utils.di_container.get_container") as mock_container:
        processor = mock_container.return_value.resolve.return_value
        processor.process_playlist_from_m3u.side_effect = fake_m3u
        processor.process_playlist_from_xml.side_effect = fake_xml

        job = start_match_job(
            store,
            {
                "m3u_path": str(m3u_path),
                "xml_path": str(tmp_path / "collection.xml"),
                "playlist_name": "Warm Up",
            },
        )

        for _ in range(100):
            current = store.get(job.id)
            if current and current.state.value in ("succeeded", "failed", "cancelled"):
                break
            time.sleep(0.02)

    assert called["m3u"] is True
    assert called["xml"] is False
    finished = store.get(job.id)
    assert finished is not None
    assert finished.state.value == "succeeded"
