#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test script for Phase 3 Performance Monitoring

This script tests:
1. Performance metrics collection
2. Query tracking
3. Track metrics
4. Performance report generation
"""

import sys
import os
import time

# Add SRC to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from performance import performance_collector, PerformanceStats, TrackMetrics, QueryMetrics
from output_writer import write_performance_report


def test_performance_collector():
    """Test basic performance collector functionality"""
    print("=" * 80)
    print("Test 1: Performance Collector Basic Functionality")
    print("=" * 80)
    
    # Reset collector
    performance_collector.reset()
    
    # Start session
    performance_collector.start_session()
    print("[OK] Session started")
    
    # Record a track
    track_metrics = performance_collector.record_track_start("track_1", "Test Track - Test Artist")
    print("[OK] Track started")
    
    # Record some queries
    for i, query in enumerate(["priority query", "remix query", "n_gram query"], 1):
        time.sleep(0.1)  # Simulate query execution
        performance_collector.record_query(
            track_metrics=track_metrics,
            query_text=query,
            execution_time=0.1 + i * 0.05,
            candidates_found=10 + i * 5,
            cache_hit=(i == 2),  # Second query is cached
            query_type="priority" if i == 1 else "remix" if i == 2 else "n_gram"
        )
        print(f"[OK] Query {i} recorded")
    
    # Complete track
    performance_collector.record_track_complete(
        track_metrics=track_metrics,
        total_time=0.5,
        match_found=True,
        match_score=95.5,
        early_exit=False,
        early_exit_query_index=0,
        candidates_evaluated=25
    )
    print("[OK] Track completed")
    
    # End session
    performance_collector.end_session()
    print("[OK] Session ended")
    
    # Get stats
    stats = performance_collector.get_stats()
    if stats:
        print(f"\n[OK] Stats retrieved:")
        print(f"  - Total tracks: {stats.total_tracks}")
        print(f"  - Matched tracks: {stats.matched_tracks}")
        print(f"  - Total queries: {len(stats.query_metrics)}")
        print(f"  - Cache hits: {stats.cache_stats['hits']}")
        print(f"  - Cache misses: {stats.cache_stats['misses']}")
        print(f"  - Match rate: {stats.match_rate():.1f}%")
        print(f"  - Cache hit rate: {stats.cache_hit_rate():.1f}%")
        print(f"  - Avg time per track: {stats.average_time_per_track():.3f}s")
        print(f"  - Avg time per query: {stats.average_time_per_query():.3f}s")
        return True
    else:
        print("✗ Failed to retrieve stats")
        return False


def test_performance_report():
    """Test performance report generation"""
    print("\n" + "=" * 80)
    print("Test 2: Performance Report Generation")
    print("=" * 80)
    
    stats = performance_collector.get_stats()
    if not stats:
        print("[FAIL] No stats available for report generation")
        return False
    
    try:
        # Generate report
        report_path = write_performance_report(stats, "test_performance", "output")
        print(f"[OK] Performance report generated: {report_path}")
        
        # Check if file exists
        if os.path.exists(report_path):
            print(f"[OK] Report file exists ({os.path.getsize(report_path)} bytes)")
            
            # Read and display first few lines
            with open(report_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()[:10]
                print("\nFirst 10 lines of report:")
                for line in lines:
                    print(f"  {line.rstrip()}")
            return True
        else:
            print("[FAIL] Report file not found")
            return False
    except Exception as e:
        print(f"[FAIL] Error generating report: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_multiple_tracks():
    """Test with multiple tracks"""
    print("\n" + "=" * 80)
    print("Test 3: Multiple Tracks Processing")
    print("=" * 80)
    
    # Reset and start new session
    performance_collector.reset()
    performance_collector.start_session()
    
    # Process 5 tracks
    for track_idx in range(1, 6):
        track_metrics = performance_collector.record_track_start(
            f"track_{track_idx}",
            f"Track {track_idx} - Artist {track_idx}"
        )
        
        # Simulate queries
        num_queries = 3 + track_idx  # Varying number of queries
        for q_idx in range(1, num_queries + 1):
            time.sleep(0.05)  # Simulate query
            performance_collector.record_query(
                track_metrics=track_metrics,
                query_text=f"query_{q_idx}",
                execution_time=0.1 + q_idx * 0.02,
                candidates_found=5 + q_idx * 2,
                cache_hit=(q_idx % 2 == 0),
                query_type="priority" if q_idx == 1 else "n_gram"
            )
        
        # Complete track
        match_found = track_idx % 2 == 0  # Every other track matches
        performance_collector.record_track_complete(
            track_metrics=track_metrics,
            total_time=0.5 + track_idx * 0.1,
            match_found=match_found,
            match_score=90.0 if match_found else 0.0,
            early_exit=(track_idx == 3),
            early_exit_query_index=2 if track_idx == 3 else 0,
            candidates_evaluated=10 + track_idx * 2
        )
        print(f"[OK] Track {track_idx} processed")
    
    performance_collector.end_session()
    
    stats = performance_collector.get_stats()
    if stats:
        print(f"\n[OK] Multi-track stats:")
        print(f"  - Total tracks: {stats.total_tracks}")
        print(f"  - Matched: {stats.matched_tracks}, Unmatched: {stats.unmatched_tracks}")
        print(f"  - Total queries: {len(stats.query_metrics)}")
        print(f"  - Total time: {stats.total_time:.2f}s")
        print(f"  - Avg time per track: {stats.average_time_per_track():.3f}s")
        print(f"  - Match rate: {stats.match_rate():.1f}%")
        return True
    else:
        print("[FAIL] Failed to retrieve stats")
        return False


def test_retry_decorator():
    """Test retry decorator (basic functionality)"""
    print("\n" + "=" * 80)
    print("Test 4: Retry Decorator")
    print("=" * 80)
    
    from utils import retry_with_backoff
    
    # Try to import requests exceptions, fallback to generic Exception
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
            raise exception_type("Simulated network error")
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


def main():
    """Run all tests"""
    print("\n" + "=" * 80)
    print("Phase 3 Performance Monitoring - Test Suite")
    print("=" * 80)
    
    results = []
    
    # Run tests
    results.append(("Basic Collector", test_performance_collector()))
    results.append(("Report Generation", test_performance_report()))
    results.append(("Multiple Tracks", test_multiple_tracks()))
    results.append(("Retry Decorator", test_retry_decorator()))
    
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
        print("\n[SUCCESS] All tests passed!")
        return 0
    else:
        print(f"\n[WARNING] {total - passed} test(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())

