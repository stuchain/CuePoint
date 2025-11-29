#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Performance comparison utilities.

Compares performance metrics before and after restructuring,
and generates comparison reports.
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Any

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from tests.performance.benchmark_processing import (
    run_all_benchmarks,
    create_test_tracks,
)
from cuepoint.services.processor_service import ProcessorService
from cuepoint.services.bootstrap import bootstrap_services


def load_baseline_benchmarks(baseline_path: Optional[Path] = None) -> Dict[str, float]:
    """Load baseline benchmarks from file or return defaults.

    Args:
        baseline_path: Path to baseline benchmark JSON file.

    Returns:
        Dictionary mapping benchmark name to duration in seconds.
    """
    if baseline_path and baseline_path.exists():
        with open(baseline_path, "r", encoding="utf-8") as f:
            return json.load(f)

    # Return default baseline (estimated from typical performance)
    # These are conservative estimates
    return {
        "process_single_track": 2.5,
        "process_playlist_10": 25.0,
        "process_playlist_50": 125.0,
        "process_playlist_100": 250.0,
        "export_csv_100": 1.5,
        "export_json_100": 0.8,
    }


def compare_performance(
    baseline: Dict[str, float], current: Dict[str, float]
) -> Dict[str, Dict[str, Any]]:
    """Compare performance metrics.

    Args:
        baseline: Baseline performance metrics.
        current: Current performance metrics.

    Returns:
        Dictionary with comparison results for each metric:
        {
            "metric_name": {
                "baseline": float,
                "current": float,
                "change_percent": float,  # Positive = slower, negative = faster
                "status": "improved" | "regressed" | "unchanged"
            }
        }
    """
    comparison: Dict[str, Dict[str, Any]] = {}

    for key in baseline:
        if key in current:
            baseline_val = baseline[key]
            current_val = current[key]
            change_percent = ((current_val - baseline_val) / baseline_val) * 100

            # Determine status
            if abs(change_percent) < 1.0:  # Less than 1% change
                status = "unchanged"
            elif change_percent < 0:  # Negative = faster = improved
                status = "improved"
            else:  # Positive = slower = regressed
                status = "regressed"

            comparison[key] = {
                "baseline": baseline_val,
                "current": current_val,
                "change_percent": change_percent,
                "status": status,
            }

    return comparison


def generate_performance_report(
    baseline: Optional[Dict[str, float]] = None,
    current: Optional[Dict[str, float]] = None,
    output_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """Generate performance comparison report.

    Args:
        baseline: Baseline performance metrics (loads defaults if None).
        current: Current performance metrics (runs benchmarks if None).
        output_path: Path to save report JSON file.

    Returns:
        Dictionary with complete performance report.
    """
    # Load baseline if not provided
    if baseline is None:
        baseline_path = Path("reports/baseline_benchmarks.json")
        baseline = load_baseline_benchmarks(baseline_path)

    # Run current benchmarks if not provided
    if current is None:
        print("Running current benchmarks...")
        container = bootstrap_services()
        service = container.resolve(ProcessorService)  # type: ignore
        current = run_all_benchmarks(service, profile=False)

    # Compare performance
    comparison = compare_performance(baseline, current)

    # Calculate summary statistics
    improvements = sum(1 for v in comparison.values() if v["status"] == "improved")
    regressions = sum(1 for v in comparison.values() if v["status"] == "regressed")
    unchanged = sum(1 for v in comparison.values() if v["status"] == "unchanged")

    avg_change = (
        sum(v["change_percent"] for v in comparison.values()) / len(comparison)
        if comparison
        else 0.0
    )

    # Build report
    report = {
        "baseline": baseline,
        "current": current,
        "comparison": comparison,
        "summary": {
            "improvements": improvements,
            "regressions": regressions,
            "unchanged": unchanged,
            "avg_change_percent": avg_change,
            "total_metrics": len(comparison),
        },
    }

    # Save report if path provided
    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        print(f"\nPerformance report saved to: {output_path}")

    # Print summary
    print("\n" + "=" * 60)
    print("Performance Comparison Summary")
    print("=" * 60)
    print(f"Improvements: {improvements}")
    print(f"Regressions: {regressions}")
    print(f"Unchanged: {unchanged}")
    print(f"Average change: {avg_change:.2f}%")
    print("\nDetailed Comparison:")
    print("-" * 60)
    for metric, data in comparison.items():
        status_symbol = {
            "improved": "✅",
            "regressed": "❌",
            "unchanged": "➡️",
        }.get(data["status"], "?")
        print(
            f"{status_symbol} {metric:30s}: "
            f"{data['baseline']:6.3f}s → {data['current']:6.3f}s "
            f"({data['change_percent']:+6.2f}%)"
        )

    return report


def check_performance_targets(metrics: Dict[str, float]) -> Dict[str, bool]:
    """Check if performance metrics meet targets.

    Args:
        metrics: Dictionary of performance metrics.

    Returns:
        Dictionary mapping metric name to whether it meets target.
    """
    targets = {
        "process_single_track": 5.0,  # < 5 seconds
        "process_playlist_10": 50.0,  # < 50 seconds
        "process_playlist_50": 250.0,  # < 250 seconds
        "process_playlist_100": 300.0,  # < 5 minutes
        "export_csv_100": 2.0,  # < 2 seconds
        "export_json_100": 2.0,  # < 2 seconds
    }

    results: Dict[str, bool] = {}
    for metric, target in targets.items():
        if metric in metrics:
            results[metric] = metrics[metric] < target
        else:
            results[metric] = False

    return results


if __name__ == "__main__":
    # Generate performance report
    report_path = Path("reports/performance_comparison.json")
    report = generate_performance_report(output_path=report_path)

    # Check targets
    print("\n" + "=" * 60)
    print("Performance Target Check")
    print("=" * 60)
    targets_met = check_performance_targets(report["current"])
    for metric, met in targets_met.items():
        status = "✅" if met else "❌"
        print(f"{status} {metric:30s}: Target {'met' if met else 'NOT met'}")

