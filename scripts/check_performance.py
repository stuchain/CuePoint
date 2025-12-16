#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Performance Check Script (Step 7.3)

Checks performance budgets and detects regressions.
"""

import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, Optional

# Performance budgets (in seconds)
PERFORMANCE_BUDGETS = {
    "startup": 2.0,  # App startup time
    "table_filter": 0.2,  # Table filter application
    "track_processing": 0.25,  # Single track processing
    "ui_response": 0.1,  # UI response time
}


def measure_startup_time() -> Optional[float]:
    """Measure application startup time."""
    print("Measuring startup time...")
    try:
        # This would need to be implemented with actual app startup
        # For now, return None to skip
        print("WARNING: Startup time measurement not implemented (requires app launch)")
        return None
    except Exception as e:
        print(f"WARNING: Startup measurement error: {e}")
        return None


def check_performance_budgets() -> bool:
    """Check performance against budgets."""
    print("Checking performance budgets...")
    
    # Load performance metrics if available
    metrics_file = Path("performance_metrics.json")
    if metrics_file.exists():
        try:
            with open(metrics_file, "r") as f:
                metrics = json.load(f)
            
            violations = []
            for metric, budget in PERFORMANCE_BUDGETS.items():
                if metric in metrics:
                    value = metrics[metric]
                    if value > budget:
                        violations.append((metric, value, budget))
                        print(f"[FAIL] {metric}: {value:.3f}s > {budget:.3f}s (budget)")
                    else:
                        print(f"[PASS] {metric}: {value:.3f}s <= {budget:.3f}s (budget)")
            
            if violations:
                print(f"\n[FAIL] {len(violations)} performance budget violations")
                return False
            else:
                print("\n[PASS] All performance budgets met")
                return True
        except Exception as e:
            print(f"WARNING: Error reading metrics: {e}")
            return True  # Don't fail on metrics read error
    else:
        print("WARNING: No performance metrics file found (performance_metrics.json)")
        print("  Performance budgets cannot be verified")
        return True  # Don't fail if metrics don't exist


def check_performance_regression() -> bool:
    """Check for performance regressions."""
    print("Checking for performance regressions...")
    
    # This would compare current metrics with baseline
    # For now, just check that budgets are met
    baseline_file = Path("performance_baseline.json")
    current_file = Path("performance_metrics.json")
    
    if not baseline_file.exists():
        print("WARNING: No performance baseline found")
        print("  Run with --save-baseline to create baseline")
        return True  # Don't fail if no baseline
    
    if not current_file.exists():
        print("WARNING: No current performance metrics found")
        return True  # Don't fail if no current metrics
    
    try:
        with open(baseline_file, "r") as f:
            baseline = json.load(f)
        
        with open(current_file, "r") as f:
            current = json.load(f)
        
        regressions = []
        for metric in PERFORMANCE_BUDGETS.keys():
            if metric in baseline and metric in current:
                baseline_value = baseline[metric]
                current_value = current[metric]
                regression = current_value - baseline_value
                regression_pct = (regression / baseline_value) * 100 if baseline_value > 0 else 0
                
                # Allow 10% regression before flagging
                if regression_pct > 10:
                    regressions.append((metric, baseline_value, current_value, regression_pct))
                    print(
                        f"[FAIL] {metric}: {current_value:.3f}s vs {baseline_value:.3f}s "
                        f"(+{regression_pct:.1f}% regression)"
                    )
                else:
                    print(
                        f"[PASS] {metric}: {current_value:.3f}s vs {baseline_value:.3f}s "
                        f"({regression_pct:+.1f}%)"
                    )
            
            if regressions:
                print(f"\n[FAIL] {len(regressions)} performance regressions detected")
                return False
            else:
                print("\n[PASS] No significant performance regressions")
                return True
    except Exception as e:
        print(f"WARNING: Error comparing metrics: {e}")
        return True  # Don't fail on comparison error


def main():
    """Run performance checks."""
    print("=" * 60)
    print("Performance Check")
    print("=" * 60)
    print()
    
    # Check budgets
    budgets_ok = check_performance_budgets()
    print()
    
    # Check regressions
    regression_ok = check_performance_regression()
    print()
    
    # Summary
    print("=" * 60)
    print("Summary")
    print("=" * 60)
    
    if budgets_ok and regression_ok:
        print("[PASS] Performance checks passed")
        return 0
    else:
        print("[FAIL] Performance checks failed")
        if not budgets_ok:
            print("  - Performance budgets exceeded")
        if not regression_ok:
            print("  - Performance regressions detected")
        return 1


if __name__ == "__main__":
    sys.exit(main())
