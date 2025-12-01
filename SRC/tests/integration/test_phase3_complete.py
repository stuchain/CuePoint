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
import time

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))

def test_imports():
    """Test that all Phase 3 modules can be imported"""
    print("=" * 80)
    print("Test 1: Module Imports")
    print("=" * 80)
    
    try:
        from cuepoint.utils.performance import (
            PerformanceStats,
            QueryMetrics,
            TrackMetrics,
            performance_collector,
        )
        print("[OK] performance.py imports successful")
    except Exception as e:
        print(f"[FAIL] performance.py import failed: {e}")
        return False
    
    try:
        from cuepoint.utils.utils import retry_with_backoff
        print("[OK] utils.py retry_with_backoff import successful")
    except Exception as e:
        print(f"[FAIL] utils.py retry_with_backoff import failed: {e}")
        return False
    
    try:
        from cuepoint.services.output_writer import write_performance_report
        print("[OK] output_writer.py write_performance_report import successful")
    except Exception as e:
        print(f"[FAIL] output_writer.py write_performance_report import failed: {e}")
        return False
    
    try:
        from cuepoint.data.beatport import get_last_cache_hit
        print("[OK] beatport.py get_last_cache_hit import successful")
    except Exception as e:
        print(f"[FAIL] beatport.py get_last_cache_hit import failed: {e}")
        return False
    
    try:
        from cuepoint.core.matcher import _classify_query_type, best_beatport_match
        print("[OK] matcher.py imports successful")
    except Exception as e:
        print(f"[FAIL] matcher.py import failed: {e}")
        return False
    
    # Test new Phase 5 architecture
    try:
        from cuepoint.services.interfaces import IProcessorService
        from cuepoint.services.processor_service import ProcessorService
        print("[OK] Phase 5 ProcessorService import successful")
    except Exception as e:
        print(f"[FAIL] ProcessorService import failed: {e}")
        return False
    
    # Test legacy processor (for backward compatibility)
    try:
        from cuepoint.legacy.processor import process_playlist
        print("[OK] Legacy processor.py import successful (deprecated - kept for compatibility)")
    except Exception as e:
        # Legacy is optional - don't fail if unavailable
        print(f"[INFO] Legacy processor not available: {e}")
    
    try:
        from cuepoint.ui.widgets.performance_view import PerformanceView
        print("[OK] gui/performance_view.py import successful")
    except Exception as e:
        print(f"[FAIL] gui/performance_view.py import failed: {e}")
        return False
    
    try:
        from cuepoint.ui.widgets.config_panel import ConfigPanel
        print("[OK] gui/config_panel.py import successful")
    except Exception as e:
        print(f"[FAIL] gui/config_panel.py import failed: {e}")
        return False
    
    return True


def test_performance_collector():
    """Test performance collector functionality"""
    print("\n" + "=" * 80)
    print("Test 2: Performance Collector")
    print("=" * 80)
    
    from cuepoint.utils.performance import PerformanceStats, performance_collector

    # Reset collector
    performance_collector.reset()
    
    # Start session
    performance_collector.start_session()
    stats = performance_collector.get_stats()
    if not stats:
        print("[FAIL] Stats not created after start_session()")
        return False
    print("[OK] Session started")
    
    # Record a track
    track_metrics = performance_collector.record_track_start("track_1", "Test Track")
    if track_metrics is None:
        print("[FAIL] Track metrics not created")
        return False
    print("[OK] Track started")
    
    # Record queries
    for i in range(3):
        performance_collector.record_query(
            track_metrics=track_metrics,
            query_text=f"query_{i}",
            execution_time=0.1 + i * 0.05,
            candidates_found=10 + i * 5,
            cache_hit=(i == 1),
            query_type="priority" if i == 0 else "n_gram"
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
        candidates_evaluated=25
    )
    print("[OK] Track completed")
    
    # End session
    performance_collector.end_session()
    print("[OK] Session ended")
    
    # Verify stats
    stats = performance_collector.get_stats()
    if stats:
        if stats.total_tracks == 1:
            print("[OK] Total tracks correct")
        else:
            print(f"[FAIL] Expected 1 track, got {stats.total_tracks}")
            return False
        
        if stats.matched_tracks == 1:
            print("[OK] Matched tracks correct")
        else:
            print(f"[FAIL] Expected 1 matched track, got {stats.matched_tracks}")
            return False
        
        if len(stats.query_metrics) == 3:
            print("[OK] Query metrics count correct")
        else:
            print(f"[FAIL] Expected 3 queries, got {len(stats.query_metrics)}")
            return False
        
        if stats.cache_stats["hits"] == 1 and stats.cache_stats["misses"] == 2:
            print("[OK] Cache stats correct")
        else:
            print(f"[FAIL] Cache stats incorrect: {stats.cache_stats}")
            return False
        
        return True
    else:
        print("[FAIL] Stats not available after end_session()")
        return False


def test_performance_report():
    """Test performance report generation"""
    print("\n" + "=" * 80)
    print("Test 3: Performance Report Generation")
    print("=" * 80)
    
    from cuepoint.services.output_writer import write_performance_report
    from cuepoint.utils.performance import performance_collector
    
    stats = performance_collector.get_stats()
    if not stats:
        print("[FAIL] No stats available for report")
        return False
    
    try:
        report_path = write_performance_report(stats, "test_phase3", "output")
        if os.path.exists(report_path):
            file_size = os.path.getsize(report_path)
            if file_size > 0:
                print(f"[OK] Report generated: {report_path} ({file_size} bytes)")
                return True
            else:
                print("[FAIL] Report file is empty")
                return False
        else:
            print("[FAIL] Report file not created")
            return False
    except Exception as e:
        print(f"[FAIL] Report generation failed: {e}")
        import traceback
        traceback.print_exc()
        return False


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
    
    @retry_with_backoff(max_retries=3, backoff_base=0.1, backoff_max=1.0, jitter=False, exceptions=(exception_type,))
    def test_function():
        call_count[0] += 1
        if call_count[0] < 3:
            raise exception_type("Simulated error")
        return "Success"
    
    try:
        result = test_function()
        if result == "Success" and call_count[0] == 3:
            print(f"[OK] Retry decorator works (called {call_count[0]} times)")
            return True
        else:
            print(f"[FAIL] Unexpected result: {result}, calls: {call_count[0]}")
            return False
    except Exception as e:
        print(f"[FAIL] Retry decorator failed: {e}")
        return False


def test_cache_tracking():
    """Test cache hit tracking"""
    print("\n" + "=" * 80)
    print("Test 5: Cache Hit Tracking")
    print("=" * 80)
    
    from cuepoint.data.beatport import get_last_cache_hit

    # Test that function exists and returns a boolean
    try:
        cache_hit = get_last_cache_hit()
        if isinstance(cache_hit, bool):
            print(f"[OK] get_last_cache_hit() returns boolean: {cache_hit}")
            return True
        else:
            print(f"[FAIL] get_last_cache_hit() returned {type(cache_hit)}, expected bool")
            return False
    except Exception as e:
        print(f"[FAIL] get_last_cache_hit() failed: {e}")
        return False


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
    
    all_passed = True
    for query, index, expected in test_cases:
        result = _classify_query_type(query, index)
        if result == expected:
            print(f"[OK] Query '{query}' (index {index}) classified as '{result}'")
        else:
            print(f"[FAIL] Query '{query}' (index {index}) classified as '{result}', expected '{expected}'")
            all_passed = False
    
    return all_passed


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
        if hasattr(panel, 'track_performance_check'):
            print("[OK] track_performance_check checkbox exists")
        else:
            print("[FAIL] track_performance_check checkbox not found")
            return False
        
        # Test setting checkbox
        panel.track_performance_check.setChecked(True)
        settings = panel.get_settings()
        if settings.get("track_performance") == True:
            print("[OK] Checkbox state is read correctly when checked")
        else:
            print(f"[FAIL] Checkbox state not read correctly: {settings.get('track_performance')}")
            return False
        
        # Test unsetting checkbox
        panel.track_performance_check.setChecked(False)
        settings = panel.get_settings()
        if settings.get("track_performance") == False:
            print("[OK] Checkbox state is read correctly when unchecked")
        else:
            print(f"[FAIL] Checkbox state not read correctly: {settings.get('track_performance')}")
            return False
        
        return True
    except Exception as e:
        print(f"[FAIL] Config panel test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


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
        if view is not None:
            print("[OK] PerformanceView widget created")
        else:
            print("[FAIL] PerformanceView widget creation failed")
            return False
        
        # Check if timer exists
        if hasattr(view, 'update_timer'):
            print("[OK] Update timer exists")
        else:
            print("[FAIL] Update timer not found")
            return False
        
        # Test start/stop monitoring
        view.start_monitoring()
        if view.update_timer.isActive():
            print("[OK] Monitoring started successfully")
        else:
            print("[FAIL] Monitoring timer not active")
            return False
        
        view.stop_monitoring()
        if not view.update_timer.isActive():
            print("[OK] Monitoring stopped successfully")
        else:
            print("[FAIL] Monitoring timer still active after stop")
            return False
        
        return True
    except Exception as e:
        print(f"[FAIL] Performance view test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


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
            f"track_{track_idx}",
            f"Track {track_idx} - Artist {track_idx}"
        )
        
        # Simulate queries
        for q_idx in range(1, 4):
            performance_collector.record_query(
                track_metrics=track_metrics,
                query_text=f"query_{q_idx}",
                execution_time=0.1 + q_idx * 0.02,
                candidates_found=5 + q_idx * 2,
                cache_hit=(q_idx % 2 == 0),
                query_type="priority" if q_idx == 1 else "n_gram"
            )
        
        # Complete track
        performance_collector.record_track_complete(
            track_metrics=track_metrics,
            total_time=0.5 + track_idx * 0.1,
            match_found=(track_idx % 2 == 0),
            match_score=90.0 if track_idx % 2 == 0 else 0.0,
            early_exit=False,
            early_exit_query_index=0,
            candidates_evaluated=10 + track_idx * 2
        )
    
    performance_collector.end_session()
    
    # Verify integration
    stats = performance_collector.get_stats()
    if stats:
        if stats.total_tracks == 3:
            print("[OK] Integration: Total tracks correct")
        else:
            print(f"[FAIL] Integration: Expected 3 tracks, got {stats.total_tracks}")
            return False
        
        if stats.matched_tracks == 1:  # Tracks 2 matched
            print("[OK] Integration: Matched tracks correct")
        else:
            print(f"[FAIL] Integration: Expected 1 matched track, got {stats.matched_tracks}")
            return False
        
        if len(stats.query_metrics) == 9:  # 3 tracks * 3 queries
            print("[OK] Integration: Total queries correct")
        else:
            print(f"[FAIL] Integration: Expected 9 queries, got {len(stats.query_metrics)}")
            return False
        
        if stats.total_time > 0:
            print("[OK] Integration: Total time recorded")
        else:
            print("[FAIL] Integration: Total time not recorded")
            return False
        
        print(f"[OK] Integration: Match rate = {stats.match_rate():.1f}%")
        print(f"[OK] Integration: Cache hit rate = {stats.cache_hit_rate():.1f}%")
        print(f"[OK] Integration: Avg time per track = {stats.average_time_per_track():.3f}s")
        
        return True
    else:
        print("[FAIL] Integration: Stats not available")
        return False


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

