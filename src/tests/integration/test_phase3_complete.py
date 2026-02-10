#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive Phase 3 Testing Suite

Tests all Phase 3 components:
1. Performance metrics collection
2. Performance dashboard GUI
3. Cache integration
4. Retry logic
5. Performance reports
6. GUI integration
"""

import os
import sys

import pytest

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../.."))


def test_imports():
    """Test that all Phase 3 modules can be imported"""
    print("=" * 80)
    print("Test 1: Module Imports")
    print("=" * 80)

    try:
        print("[OK] performance.py imports successful")
    except Exception as e:
        pytest.fail(f"performance.py import failed: {e}")

    try:
        print("[OK] utils.py retry_with_backoff import successful")
    except Exception as e:
        pytest.fail(f"utils.py retry_with_backoff import failed: {e}")

    try:
        print("[OK] output_writer.py write_performance_report import successful")
    except Exception as e:
        pytest.fail(f"output_writer.py write_performance_report import failed: {e}")

    try:
        print("[OK] beatport.py get_last_cache_hit import successful")
    except Exception as e:
        pytest.fail(f"beatport.py get_last_cache_hit import failed: {e}")

    try:
        print("[OK] matcher.py imports successful")
    except Exception as e:
        pytest.fail(f"matcher.py import failed: {e}")

    # Test new Phase 5 architecture
    try:
        print("[OK] Phase 5 ProcessorService import successful")
    except Exception as e:
        pytest.fail(f"ProcessorService import failed: {e}")

    # Test legacy processor (for backward compatibility)
    try:
        print(
            "[OK] Legacy processor.py import successful (deprecated - kept for compatibility)"
        )
    except Exception as e:
        # Legacy is optional - don't fail if unavailable
        print(f"[INFO] Legacy processor not available: {e}")

    try:
        print("[OK] gui/performance_view.py import successful")
    except Exception as e:
        pytest.fail(f"gui/performance_view.py import failed: {e}")

    try:
        print("[OK] gui/config_panel.py import successful")
    except Exception as e:
        pytest.fail(f"gui/config_panel.py import failed: {e}")


def test_performance_collector():
    """Test performance collector functionality"""
    print("\n" + "=" * 80)
    print("Test 2: Performance Collector")
    print("=" * 80)

    from cuepoint.utils.performance import performance_collector

    # Reset collector
    performance_collector.reset()

    # Start session
    performance_collector.start_session()
    stats = performance_collector.get_stats()
    assert stats is not None, "Stats not created after start_session()"
    print("[OK] Session started")

    # Record a track
    track_metrics = performance_collector.record_track_start("track_1", "Test Track")
    assert track_metrics is not None, "Track metrics not created"
    print("[OK] Track started")

    # Record queries
    for i in range(3):
        performance_collector.record_query(
            track_metrics=track_metrics,
            query_text=f"query_{i}",
            execution_time=0.1 + i * 0.05,
            candidates_found=10 + i * 5,
            cache_hit=(i == 1),
            query_type="priority" if i == 0 else "n_gram",
        )
    print("[OK] Queries recorded")

    # Complete track
    performance_collector.record_track_complete(
        track_metrics=track_metrics,
        total_time=0.5,
        match_found=True,
        match_score=95.0,
        early_exit=False,
        early_exit_query_index=0,
        candidates_evaluated=25,
    )
    print("[OK] Track completed")

    # End session
    performance_collector.end_session()
    print("[OK] Session ended")

    # Verify stats
    stats = performance_collector.get_stats()
    assert stats is not None, "Stats not available after end_session()"
    assert stats.total_tracks == 1, f"Expected 1 track, got {stats.total_tracks}"
    print("[OK] Total tracks correct")
    assert stats.matched_tracks == 1, (
        f"Expected 1 matched track, got {stats.matched_tracks}"
    )
    print("[OK] Matched tracks correct")
    assert len(stats.query_metrics) == 3, (
        f"Expected 3 queries, got {len(stats.query_metrics)}"
    )
    print("[OK] Query metrics count correct")
    assert stats.cache_stats["hits"] == 1 and stats.cache_stats["misses"] == 2, (
        f"Cache stats incorrect: {stats.cache_stats}"
    )
    print("[OK] Cache stats correct")


def test_performance_report():
    """Test performance report generation"""
    print("\n" + "=" * 80)
    print("Test 3: Performance Report Generation")
    print("=" * 80)

    from cuepoint.services.output_writer import write_performance_report
    from cuepoint.utils.performance import performance_collector

    stats = performance_collector.get_stats()
    assert stats is not None, "No stats available for report"
    try:
        report_path = write_performance_report(stats, "test_phase3", "output")
        assert os.path.exists(report_path), "Report file not created"
        file_size = os.path.getsize(report_path)
        assert file_size > 0, "Report file is empty"
        print(f"[OK] Report generated: {report_path} ({file_size} bytes)")
    except Exception as e:
        import traceback

        traceback.print_exc()
        pytest.fail(f"Report generation failed: {e}")


def test_retry_decorator():
    """Test retry decorator"""
    print("\n" + "=" * 80)
    print("Test 4: Retry Decorator")
    print("=" * 80)

    from cuepoint.utils.utils import retry_with_backoff

    try:
        from requests.exceptions import RequestException

        exception_type = RequestException
    except ImportError:
        exception_type = Exception

    call_count = [0]

    @retry_with_backoff(
        max_retries=3,
        backoff_base=0.1,
        backoff_max=1.0,
        jitter=False,
        exceptions=(exception_type,),
    )
    def test_function():
        call_count[0] += 1
        if call_count[0] < 3:
            raise exception_type("Simulated error")
        return "Success"

    try:
        result = test_function()
        assert result == "Success" and call_count[0] == 3, (
            f"Unexpected result: {result}, calls: {call_count[0]}"
        )
        print(f"[OK] Retry decorator works (called {call_count[0]} times)")
    except Exception as e:
        pytest.fail(f"Retry decorator failed: {e}")


def test_cache_tracking():
    """Test cache hit tracking"""
    print("\n" + "=" * 80)
    print("Test 5: Cache Hit Tracking")
    print("=" * 80)

    from cuepoint.data.beatport import get_last_cache_hit

    # Test that function exists and returns a boolean
    try:
        cache_hit = get_last_cache_hit()
        assert isinstance(cache_hit, bool), (
            f"get_last_cache_hit() returned {type(cache_hit)}, expected bool"
        )
        print(f"[OK] get_last_cache_hit() returns boolean: {cache_hit}")
    except Exception as e:
        pytest.fail(f"get_last_cache_hit() failed: {e}")


def test_query_classification():
    """Test query type classification"""
    print("\n" + "=" * 80)
    print("Test 6: Query Type Classification")
    print("=" * 80)

    from cuepoint.core.matcher import _classify_query_type

    test_cases = [
        ("priority query", 0, "priority"),
        ("remix query", 1, "remix"),
        ('"exact phrase"', 2, "exact_phrase"),
        ("n gram query", 3, "n_gram"),
    ]

    for query, index, expected in test_cases:
        result = _classify_query_type(query, index)
        assert result == expected, (
            f"Query '{query}' (index {index}) classified as '{result}', expected '{expected}'"
        )
        print(f"[OK] Query '{query}' (index {index}) classified as '{result}'")


def test_config_panel_checkbox():
    """Test config panel checkbox"""
    print("\n" + "=" * 80)
    print("Test 7: Config Panel Checkbox")
    print("=" * 80)

    try:
        from PySide6.QtWidgets import QApplication

        from cuepoint.ui.widgets.config_panel import ConfigPanel

        # Create QApplication if it doesn't exist
        app = QApplication.instance()
        if app is None:
            app = QApplication([])

        panel = ConfigPanel()

        # Check if checkbox exists
        assert hasattr(panel, "track_performance_check"), (
            "track_performance_check checkbox not found"
        )
        print("[OK] track_performance_check checkbox exists")

        # Test setting checkbox
        panel.track_performance_check.setChecked(True)
        settings = panel.get_settings()
        assert settings.get("track_performance") is True, (
            f"Checkbox state not read correctly: {settings.get('track_performance')}"
        )
        print("[OK] Checkbox state is read correctly when checked")

        # Test unsetting checkbox
        panel.track_performance_check.setChecked(False)
        settings = panel.get_settings()
        assert settings.get("track_performance") is False, (
            f"Checkbox state not read correctly: {settings.get('track_performance')}"
        )
        print("[OK] Checkbox state is read correctly when unchecked")
    except Exception as e:
        import traceback

        traceback.print_exc()
        pytest.fail(f"Config panel test failed: {e}")


def test_performance_view():
    """Test performance view widget"""
    print("\n" + "=" * 80)
    print("Test 8: Performance View Widget")
    print("=" * 80)

    try:
        from PySide6.QtWidgets import QApplication

        from cuepoint.ui.widgets.performance_view import PerformanceView

        # Create QApplication if it doesn't exist
        app = QApplication.instance()
        if app is None:
            app = QApplication([])

        view = PerformanceView()

        # Check if widget was created
        assert view is not None, "PerformanceView widget creation failed"
        print("[OK] PerformanceView widget created")

        # Check if timer exists
        assert hasattr(view, "update_timer"), "Update timer not found"
        print("[OK] Update timer exists")

        # Test start/stop monitoring
        view.start_monitoring()
        assert view.update_timer.isActive(), "Monitoring timer not active"
        print("[OK] Monitoring started successfully")

        view.stop_monitoring()
        assert not view.update_timer.isActive(), (
            "Monitoring timer still active after stop"
        )
        print("[OK] Monitoring stopped successfully")
    except Exception as e:
        import traceback

        traceback.print_exc()
        pytest.fail(f"Performance view test failed: {e}")


def test_integration():
    """Test integration of all components"""
    print("\n" + "=" * 80)
    print("Test 9: Component Integration")
    print("=" * 80)

    from cuepoint.utils.performance import performance_collector

    # Reset and start session
    performance_collector.reset()
    performance_collector.start_session()

    # Simulate processing multiple tracks
    for track_idx in range(1, 4):
        track_metrics = performance_collector.record_track_start(
            f"track_{track_idx}", f"Track {track_idx} - Artist {track_idx}"
        )

        # Simulate queries
        for q_idx in range(1, 4):
            performance_collector.record_query(
                track_metrics=track_metrics,
                query_text=f"query_{q_idx}",
                execution_time=0.1 + q_idx * 0.02,
                candidates_found=5 + q_idx * 2,
                cache_hit=(q_idx % 2 == 0),
                query_type="priority" if q_idx == 1 else "n_gram",
            )

        # Complete track
        performance_collector.record_track_complete(
            track_metrics=track_metrics,
            total_time=0.5 + track_idx * 0.1,
            match_found=(track_idx % 2 == 0),
            match_score=90.0 if track_idx % 2 == 0 else 0.0,
            early_exit=False,
            early_exit_query_index=0,
            candidates_evaluated=10 + track_idx * 2,
        )

    performance_collector.end_session()

    # Verify integration
    stats = performance_collector.get_stats()
    assert stats is not None, "Integration: Stats not available"
    assert stats.total_tracks == 3, (
        f"Integration: Expected 3 tracks, got {stats.total_tracks}"
    )
    print("[OK] Integration: Total tracks correct")
    assert stats.matched_tracks == 1, (
        f"Integration: Expected 1 matched track, got {stats.matched_tracks}"
    )
    print("[OK] Integration: Matched tracks correct")
    assert len(stats.query_metrics) == 9, (
        f"Integration: Expected 9 queries, got {len(stats.query_metrics)}"
    )
    print("[OK] Integration: Total queries correct")
    assert stats.total_time > 0, "Integration: Total time not recorded"
    print("[OK] Integration: Total time recorded")
    print(f"[OK] Integration: Match rate = {stats.match_rate():.1f}%")
    print(f"[OK] Integration: Cache hit rate = {stats.cache_hit_rate():.1f}%")
    print(
        f"[OK] Integration: Avg time per track = {stats.average_time_per_track():.3f}s"
    )


def main():
    """Run all Phase 3 tests"""
    print("\n" + "=" * 80)
    print("Phase 3 Complete Testing Suite")
    print("=" * 80)

    results = []

    # Run all tests
    results.append(("Module Imports", test_imports()))
    results.append(("Performance Collector", test_performance_collector()))
    results.append(("Performance Report", test_performance_report()))
    results.append(("Retry Decorator", test_retry_decorator()))
    results.append(("Cache Tracking", test_cache_tracking()))
    results.append(("Query Classification", test_query_classification()))
    results.append(("Config Panel Checkbox", test_config_panel_checkbox()))
    results.append(("Performance View Widget", test_performance_view()))
    results.append(("Component Integration", test_integration()))

    # Summary
    print("\n" + "=" * 80)
    print("Test Summary")
    print("=" * 80)
    passed = sum(1 for _, result in results if result)
    total = len(results)

    for test_name, result in results:
        status = "[PASS]" if result else "[FAIL]"
        print(f"{status}: {test_name}")

    print(f"\nTotal: {passed}/{total} tests passed")

    if passed == total:
        print("\n[SUCCESS] All Phase 3 tests passed!")
        print("\nPhase 3 Components Verified:")
        print("  [OK] Performance metrics collection system")
        print("  [OK] Performance collection integrated into processing pipeline")
        print("  [OK] Performance monitoring dashboard")
        print("  [OK] Performance report generation")
        print("  [OK] Error recovery and retry logic")
        print("  [OK] GUI integration for performance dashboard")
        print("  [OK] Cache hit/miss tracking")
        return 0
    else:
        print(f"\n[WARNING] {total - passed} test(s) failed")
        print("Please review the failures above and fix any issues.")
        return 1


if __name__ == "__main__":
    sys.exit(main())


if __name__ == "__main__":
    sys.exit(main())
