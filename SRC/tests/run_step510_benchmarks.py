#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Run Step 5.10 performance benchmarks.

This script runs all performance benchmarks and generates a comparison report.
"""

import sys
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path(__file__).parent))

import sys
from pathlib import Path

# Add tests directory to path
sys.path.insert(0, str(Path(__file__).parent))

from tests.performance.benchmark_processing import run_all_benchmarks
from tests.performance.compare_performance import (
    generate_performance_report,
    check_performance_targets,
)
from cuepoint.services.bootstrap import bootstrap_services
from cuepoint.services.processor_service import ProcessorService


def main():
    """Run performance benchmarks and generate report."""
    print("=" * 60)
    print("Step 5.10: Performance & Optimization Review")
    print("=" * 60)

    # Bootstrap services
    print("\n1. Bootstrapping services...")
    container = bootstrap_services()
    service = container.resolve(ProcessorService)  # type: ignore
    print("   Services ready")

    # Run benchmarks
    print("\n2. Running performance benchmarks...")
    current_metrics = run_all_benchmarks(service, profile=False)

    # Generate comparison report
    print("\n3. Generating performance comparison report...")
    report_path = Path("reports/performance_comparison.json")
    report = generate_performance_report(current=current_metrics, output_path=report_path)

    # Check targets
    print("\n4. Checking performance targets...")
    targets_met = check_performance_targets(report["current"])
    all_met = all(targets_met.values())

    print("\n" + "=" * 60)
    print("Performance Target Status")
    print("=" * 60)
    for metric, met in targets_met.items():
        status = "✅ PASS" if met else "❌ FAIL"
        print(f"{status} {metric}")

    if all_met:
        print("\n✅ All performance targets met!")
    else:
        print("\n⚠️  Some performance targets not met. Review results above.")

    print(f"\nFull report saved to: {report_path}")
    print("\nBenchmarks complete!")


if __name__ == "__main__":
    main()

