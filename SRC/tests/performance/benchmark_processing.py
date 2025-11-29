#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Performance benchmarks for processing operations.

This module provides benchmarking functions for measuring performance
of critical processing paths in the CuePoint application.
"""

import cProfile
import pstats
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from cuepoint.models.track import Track
from cuepoint.models.result import TrackResult
from cuepoint.services.processor_service import ProcessorService
from cuepoint.services.interfaces import (
    IBeatportService,
    IConfigService,
    ILoggingService,
    IMatcherService,
)


def create_test_track(index: int) -> Track:
    """Create a test track for benchmarking."""
    return Track(
        title=f"Test Track {index}",
        artist=f"Test Artist {index}",
        track_id=str(index),
    )


def create_test_tracks(count: int) -> List[Track]:
    """Create multiple test tracks for benchmarking."""
    return [create_test_track(i) for i in range(1, count + 1)]


def benchmark_process_track(
    service: ProcessorService,
    track: Optional[Track] = None,
    profile: bool = False,
) -> Tuple[float, TrackResult]:
    """Benchmark single track processing.

    Args:
        service: ProcessorService instance to use.
        track: Track to process (creates test track if None).
        profile: If True, run with cProfile profiling.

    Returns:
        Tuple of (duration in seconds, TrackResult).
    """
    if track is None:
        track = create_test_track(1)

    if profile:
        profiler = cProfile.Profile()
        profiler.enable()

    start_time = time.perf_counter()
    result = service.process_track(1, track)
    end_time = time.perf_counter()

    if profile:
        profiler.disable()
        stats = pstats.Stats(profiler)
        stats.sort_stats("cumulative")
        stats.print_stats(20)  # Top 20 functions
        # Save profile
        profile_path = Path("reports/profile_process_track.prof")
        profile_path.parent.mkdir(parents=True, exist_ok=True)
        stats.dump_stats(str(profile_path))
        print(f"Profile saved to: {profile_path}")

    duration = end_time - start_time
    return duration, result


def benchmark_process_playlist(
    service: ProcessorService,
    track_count: int = 100,
    profile: bool = False,
) -> Tuple[float, List[TrackResult]]:
    """Benchmark playlist processing.

    Args:
        service: ProcessorService instance to use.
        track_count: Number of tracks to process.
        profile: If True, run with cProfile profiling.

    Returns:
        Tuple of (duration in seconds, List[TrackResult]).
    """
    tracks = create_test_tracks(track_count)

    if profile:
        profiler = cProfile.Profile()
        profiler.enable()

    start_time = time.perf_counter()
    results = service.process_playlist(tracks)
    end_time = time.perf_counter()

    if profile:
        profiler.disable()
        stats = pstats.Stats(profiler)
        stats.sort_stats("cumulative")
        stats.print_stats(20)  # Top 20 functions
        # Save profile
        profile_path = Path(f"reports/profile_process_playlist_{track_count}.prof")
        profile_path.parent.mkdir(parents=True, exist_ok=True)
        stats.dump_stats(str(profile_path))
        print(f"Profile saved to: {profile_path}")

    duration = end_time - start_time
    avg_time_per_track = duration / track_count if track_count > 0 else 0.0

    print(f"Processed {track_count} tracks in {duration:.3f} seconds")
    print(f"Average time per track: {avg_time_per_track:.3f} seconds")

    return duration, results


def benchmark_export_csv(
    results: List[TrackResult],
    output_dir: str = "output",
    profile: bool = False,
) -> float:
    """Benchmark CSV export operation.

    Args:
        results: List of TrackResult objects to export.
        output_dir: Output directory for CSV file.
        profile: If True, run with cProfile profiling.

    Returns:
        Duration in seconds.
    """
    from cuepoint.services.output_writer import write_main_csv

    if profile:
        profiler = cProfile.Profile()
        profiler.enable()

    start_time = time.perf_counter()
    write_main_csv(results, "benchmark_test", output_dir)
    end_time = time.perf_counter()

    if profile:
        profiler.disable()
        stats = pstats.Stats(profiler)
        stats.sort_stats("cumulative")
        stats.print_stats(10)  # Top 10 functions

    duration = end_time - start_time
    return duration


def benchmark_export_json(
    results: List[TrackResult],
    output_dir: str = "output",
    profile: bool = False,
) -> float:
    """Benchmark JSON export operation.

    Args:
        results: List of TrackResult objects to export.
        output_dir: Output directory for JSON file.
        profile: If True, run with cProfile profiling.

    Returns:
        Duration in seconds.
    """
    import json
    from pathlib import Path

    if profile:
        profiler = cProfile.Profile()
        profiler.enable()

    start_time = time.perf_counter()
    json_path = Path(output_dir) / "benchmark_test.json"
    json_path.parent.mkdir(parents=True, exist_ok=True)

    # Convert results to JSON-serializable format
    json_data = {
        "version": "1.0",
        "total_tracks": len(results),
        "tracks": [result.to_dict() for result in results],
    }

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(json_data, f, indent=2)

    end_time = time.perf_counter()

    if profile:
        profiler.disable()
        stats = pstats.Stats(profiler)
        stats.sort_stats("cumulative")
        stats.print_stats(10)  # Top 10 functions

    duration = end_time - start_time
    return duration


def run_all_benchmarks(
    service: ProcessorService,
    profile: bool = False,
) -> Dict[str, float]:
    """Run all performance benchmarks.

    Args:
        service: ProcessorService instance to use.
        profile: If True, run with cProfile profiling.

    Returns:
        Dictionary mapping benchmark name to duration in seconds.
    """
    results: Dict[str, float] = {}

    print("=" * 60)
    print("Running Performance Benchmarks")
    print("=" * 60)

    # Single track processing
    print("\n1. Benchmarking single track processing...")
    duration, _ = benchmark_process_track(service, profile=profile)
    results["process_single_track"] = duration
    print(f"   Single track: {duration:.3f} seconds")

    # Playlist processing (different sizes)
    for count in [10, 50, 100]:
        print(f"\n2. Benchmarking playlist processing ({count} tracks)...")
        duration, _ = benchmark_process_playlist(service, track_count=count, profile=profile)
        results[f"process_playlist_{count}"] = duration
        avg_time = duration / count
        print(f"   {count} tracks: {duration:.3f} seconds (avg: {avg_time:.3f}s per track)")

    # Export benchmarks (need results first)
    print("\n3. Generating test results for export benchmarks...")
    _, export_results = benchmark_process_playlist(service, track_count=100, profile=False)

    # CSV export
    print("\n4. Benchmarking CSV export (100 results)...")
    csv_duration = benchmark_export_csv(export_results, profile=profile)
    results["export_csv_100"] = csv_duration
    print(f"   CSV export: {csv_duration:.3f} seconds")

    # JSON export
    print("\n5. Benchmarking JSON export (100 results)...")
    json_duration = benchmark_export_json(export_results, profile=profile)
    results["export_json_100"] = json_duration
    print(f"   JSON export: {json_duration:.3f} seconds")

    print("\n" + "=" * 60)
    print("Benchmark Summary")
    print("=" * 60)
    for name, duration in results.items():
        print(f"{name:30s}: {duration:8.3f} seconds")

    return results


if __name__ == "__main__":
    # This allows running benchmarks directly
    from cuepoint.services.bootstrap import bootstrap_services

    # Bootstrap services
    container = bootstrap_services()
    service = container.resolve(ProcessorService)  # type: ignore

    # Run benchmarks
    results = run_all_benchmarks(service, profile=False)
    print("\nBenchmarks complete!")

