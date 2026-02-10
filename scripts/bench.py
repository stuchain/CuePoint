#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Performance Benchmark Script (Design 6.14, 6.139).

Runs benchmarks for 1k, 5k, 10k track datasets.
Outputs JSON results for regression comparison.
Targets (Design 6.128): 1k < 5m, 5k < 15m, 10k < 30m.

Design 6.19, 6.20: Profiling - use cProfile, capture hot paths, top 20 slowest.

Usage:
    python scripts/bench.py [--dataset 1k|5k|10k|all] [--output-dir path] [--mock] [--profile]
"""

import argparse
import cProfile
import json
import os
import pstats
import sys
import tempfile
import time
from io import StringIO
from pathlib import Path

# Add src to path
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
SOURCE_DIR = PROJECT_ROOT / "src"
if str(SOURCE_DIR) not in sys.path:
    sys.path.insert(0, str(SOURCE_DIR))

# Design 6.128: Benchmark targets (seconds)
TARGETS = {
    "1k": 300,   # 5 minutes
    "5k": 900,   # 15 minutes
    "10k": 1800, # 30 minutes
}


def get_fixture_path(dataset: str) -> Path:
    """Get path to benchmark fixture."""
    fixtures_dir = SOURCE_DIR / "tests" / "fixtures" / "rekordbox"
    name = f"benchmark_{dataset}.xml"
    path = fixtures_dir / name
    if not path.exists():
        # Fallback to medium/large for backward compat
        if dataset == "1k":
            path = fixtures_dir / "small.xml"  # 10 tracks - not ideal
        elif dataset == "5k":
            path = fixtures_dir / "medium.xml"  # 500 tracks
        elif dataset == "10k":
            path = fixtures_dir / "large.xml"
    return path


def run_benchmark(
    dataset: str,
    use_mock: bool = True,
    output_dir: Path = None,
    profile: bool = False,
    profile_output_path: Path = None,
) -> dict:
    """Run benchmark for given dataset. Returns metrics dict."""
    from unittest.mock import Mock

    from cuepoint.data.rekordbox import parse_rekordbox
    from cuepoint.services.bootstrap import bootstrap_services
    from cuepoint.services.interfaces import IConfigService, ILoggingService
    from cuepoint.services.processor_service import ProcessorService
    from cuepoint.utils.di_container import get_container
    from cuepoint.utils.run_performance_collector import RunPerformanceCollector

    fixture_path = get_fixture_path(dataset)
    if not fixture_path.exists():
        raise FileNotFoundError(f"Fixture not found: {fixture_path}. Run: python scripts/generate_test_xml.py --benchmark")

    # Get playlist name from fixture (benchmark files use "Benchmark 1k", etc.)
    playlists = parse_rekordbox(str(fixture_path))
    playlist_name = list(playlists.keys())[0] if playlists else f"Benchmark {dataset}"

    # Bootstrap
    bootstrap_services()
    container = get_container()

    # Create processor with mocks for fast benchmark (no network)
    beatport_service = Mock()
    beatport_service.search_tracks.return_value = []
    beatport_service.fetch_track_details.return_value = None

    matcher_service = Mock()
    matcher_service.find_best_match.return_value = (None, [], [], 1)

    config_service = container.resolve(IConfigService)
    logging_service = container.resolve(ILoggingService)

    # Disable network preflight for benchmark (no network in mock mode)
    config_service.set("product.preflight_network_check", False)

    processor = ProcessorService(
        beatport_service=beatport_service,
        matcher_service=matcher_service,
        logging_service=logging_service,
        config_service=config_service,
    )

    collector = RunPerformanceCollector()
    start = time.perf_counter()

    def _run():
        import unittest.mock as mock
        with tempfile.TemporaryDirectory() as tmpdir:
            out_dir = tmpdir if output_dir is None else str(output_dir)
            with mock.patch("cuepoint.services.processor_service.NetworkState") as mock_net:
                mock_net.is_online.return_value = True
                return processor.process_playlist_from_xml(
                    str(fixture_path),
                    playlist_name,
                    output_dir=out_dir,
                    performance_collector=collector,
                )

    if profile:
        profiler = cProfile.Profile()
        profiler.enable()
        results = _run()
        profiler.disable()
        # Design 6.20: Store top 20 slowest functions
        s = StringIO()
        ps = pstats.Stats(profiler, stream=s).sort_stats(pstats.SortKey.CUMULATIVE)
        ps.print_stats(20)
        report_text = s.getvalue()
        out_path = profile_output_path or (output_dir or SCRIPT_DIR / "benchmarks") / f"profile_{dataset}.txt"
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(report_text)
        print(f"  Profile saved to {out_path}")
    else:
        results = _run()

    duration_sec = time.perf_counter() - start
    report = collector.get_report()

    return {
        "dataset": dataset,
        "tracks": len(results),
        "duration_sec": round(duration_sec, 2),
        "memory_mb_peak": round(report.memory_mb_peak, 2),
        "target_sec": TARGETS.get(dataset, 0),
        "passed": duration_sec < TARGETS.get(dataset, float("inf")),
        "stages": report.stages,
    }


def compare_with_baseline(
    current: dict, baseline: dict, runtime_regression_pct: float = 20, memory_regression_pct: float = 30
) -> tuple[bool, list[str]]:
    """Compare current results with baseline. Design 6.114, 6.115, 6.148.

    Returns (passed, messages). Fails if runtime regression > 20%, warns if memory > 30%.
    """
    messages = []
    passed = True
    if baseline.get("duration_sec") and current.get("duration_sec"):
        delta = (current["duration_sec"] - baseline["duration_sec"]) / baseline["duration_sec"]
        if delta > runtime_regression_pct / 100:
            passed = False
            messages.append(
                f"Runtime regression: {delta * 100:.1f}% (threshold {runtime_regression_pct}%)"
            )
    if baseline.get("memory_mb_peak") and current.get("memory_mb_peak"):
        delta = (current["memory_mb_peak"] - baseline["memory_mb_peak"]) / baseline["memory_mb_peak"]
        if delta > memory_regression_pct / 100:
            messages.append(
                f"Memory regression: {delta * 100:.1f}% (threshold {memory_regression_pct}%)"
            )
            # Memory is warn-only per Design 6.148
    return passed, messages


def main() -> int:
    parser = argparse.ArgumentParser(description="Performance benchmarks (Design 6.14)")
    parser.add_argument("--dataset", choices=["1k", "5k", "10k", "all"], default="1k",
                        help="Dataset size to benchmark")
    parser.add_argument("--output-dir", type=Path, default=None,
                        help="Output directory for benchmark results")
    parser.add_argument("--mock", action="store_true", default=True,
                        help="Use mock services (no network) for fast benchmark")
    parser.add_argument("--save", type=Path, default=None,
                        help="Save results to JSON file")
    parser.add_argument("--profile", action="store_true",
                        help="Run with cProfile, save top 20 slowest functions (Design 6.19)")
    parser.add_argument("--compare-baseline", action="store_true",
                        help="Compare against scripts/benchmarks/baseline.json, fail if regression > 20% (Design 6.115)")
    parser.add_argument("--update-baseline", action="store_true",
                        help="Update baseline.json with current results (Design 6.54)")
    args = parser.parse_args()

    output_dir = args.output_dir or (SCRIPT_DIR / "benchmarks")
    output_dir.mkdir(parents=True, exist_ok=True)

    datasets = ["1k", "5k", "10k"] if args.dataset == "all" else [args.dataset]
    results = []

    print("=" * 60)
    print("CuePoint Performance Benchmarks (Design 6)")
    print("=" * 60)

    for dataset in datasets:
        fixture = get_fixture_path(dataset)
        if not fixture.exists():
            print(f"\n[SKIP] {dataset}: Fixture not found. Run: python scripts/generate_test_xml.py --benchmark")
            continue

        print(f"\n[Benchmark] {dataset} tracks ({fixture.name})...")
        try:
            metrics = run_benchmark(
                dataset,
                use_mock=args.mock,
                output_dir=output_dir,
                profile=args.profile,
                profile_output_path=output_dir / f"profile_{dataset}.txt" if args.profile else None,
            )
            results.append(metrics)
            status = "PASS" if metrics["passed"] else "FAIL"
            print(f"  Duration: {metrics['duration_sec']}s (target: {metrics['target_sec']}s)")
            print(f"  Memory: {metrics['memory_mb_peak']} MB")
            print(f"  [{status}]")
        except Exception as e:
            print(f"  [ERROR] {e}")
            results.append({"dataset": dataset, "error": str(e), "passed": False})

    # Save results
    if args.save or results:
        save_path = args.save or (output_dir / "benchmark_results.json")
        with open(save_path, "w", encoding="utf-8") as f:
            json.dump({"benchmarks": results}, f, indent=2)
        print(f"\nResults saved to {save_path}")

    # Design 6.54: Update baseline
    if args.update_baseline and results:
        baseline_path = output_dir / "baseline.json"
        baseline_data = {r["dataset"]: r for r in results}
        with open(baseline_path, "w", encoding="utf-8") as f:
            json.dump(baseline_data, f, indent=2)
        print(f"Baseline updated at {baseline_path}")

    # Design 6.115: Compare with baseline, fail if regression > 20%
    if args.compare_baseline and results:
        baseline_path = output_dir / "baseline.json"
        if baseline_path.exists():
            with open(baseline_path, encoding="utf-8") as f:
                baseline_data = json.load(f)
            regression_fail = False
            for r in results:
                ds = r.get("dataset")
                base = baseline_data.get(ds) if isinstance(baseline_data, dict) else None
                if base and ds:
                    reg_passed, msgs = compare_with_baseline(r, base)
                    if not reg_passed:
                        regression_fail = True
                        print(f"\n[REGRESSION] {ds}: {'; '.join(msgs)}")
            if regression_fail:
                print("\nRegression check FAILED (Design 6.115)")
                return 1
            print("\nRegression check passed (vs baseline)")
        else:
            print(f"\n[WARN] No baseline at {baseline_path}, run with --update-baseline first")

    # Summary
    passed = sum(1 for r in results if r.get("passed", False))
    total = len(results)
    print("\n" + "=" * 60)
    print(f"Summary: {passed}/{total} benchmarks passed")
    print("=" * 60)

    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
