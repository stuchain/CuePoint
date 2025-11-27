#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Analyze coverage gaps and suggest test improvements."""

import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Tuple

def get_coverage_report() -> List[str]:
    """Get coverage report from pytest."""
    src_dir = Path(__file__).parent
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "--cov=cuepoint", "--cov-report=term-missing", "-q"],
        cwd=src_dir,
        capture_output=True,
        text=True
    )
    return result.stdout.split('\n')

def parse_coverage_line(line: str) -> Tuple[str, int, int, float]:
    """Parse a coverage report line.
    
    Returns: (module_path, statements, missed, coverage_percent)
    """
    parts = line.split()
    if len(parts) < 4:
        return None
    
    try:
        module = parts[0]
        statements = int(parts[1])
        missed = int(parts[2])
        coverage_str = parts[3].rstrip('%')
        coverage = float(coverage_str)
        return (module, statements, missed, coverage)
    except (ValueError, IndexError):
        return None

def analyze_coverage() -> Dict[str, Dict]:
    """Analyze coverage and identify gaps."""
    lines = get_coverage_report()
    
    # Find the coverage section
    in_coverage = False
    modules = {}
    
    for line in lines:
        if "Name" in line and "Stmts" in line:
            in_coverage = True
            continue
        
        if in_coverage:
            if line.startswith("---"):
                continue
            if line.startswith("TOTAL"):
                break
            
            parsed = parse_coverage_line(line)
            if parsed:
                module, statements, missed, coverage = parsed
                if missed > 0:  # Only track modules with missing coverage
                    modules[module] = {
                        'statements': statements,
                        'missed': missed,
                        'coverage': coverage,
                        'priority': 'high' if missed > 100 else 'medium' if missed > 50 else 'low'
                    }
    
    return modules

def generate_report(modules: Dict[str, Dict]) -> None:
    """Generate a coverage gap report."""
    print("=" * 80)
    print("COVERAGE GAP ANALYSIS")
    print("=" * 80)
    print()
    
    # Sort by missed statements (descending)
    sorted_modules = sorted(
        modules.items(),
        key=lambda x: x[1]['missed'],
        reverse=True
    )
    
    print("🔴 HIGH PRIORITY (100+ statements missed):")
    print("-" * 80)
    high_priority = [m for m in sorted_modules if m[1]['priority'] == 'high']
    for module, data in high_priority[:10]:
        print(f"  {module:60} {data['missed']:4} missed ({data['coverage']:5.1f}% coverage)")
    print()
    
    print("🟡 MEDIUM PRIORITY (50-99 statements missed):")
    print("-" * 80)
    medium_priority = [m for m in sorted_modules if m[1]['priority'] == 'medium']
    for module, data in medium_priority[:10]:
        print(f"  {module:60} {data['missed']:4} missed ({data['coverage']:5.1f}% coverage)")
    print()
    
    print("🟢 LOWER PRIORITY (<50 statements missed):")
    print("-" * 80)
    low_priority = [m for m in sorted_modules if m[1]['priority'] == 'low']
    for module, data in low_priority[:10]:
        print(f"  {module:60} {data['missed']:4} missed ({data['coverage']:5.1f}% coverage)")
    print()
    
    # Calculate potential impact
    total_missed = sum(m[1]['missed'] for m in sorted_modules)
    high_missed = sum(m[1]['missed'] for m in high_priority)
    medium_missed = sum(m[1]['missed'] for m in medium_priority)
    
    print("=" * 80)
    print("POTENTIAL IMPACT")
    print("=" * 80)
    print(f"Total statements missed: {total_missed}")
    print(f"High priority missed: {high_missed} ({high_missed/total_missed*100:.1f}%)")
    print(f"Medium priority missed: {medium_missed} ({medium_missed/total_missed*100:.1f}%)")
    print()
    print("Focusing on high-priority modules could significantly improve coverage!")

def main():
    """Main entry point."""
    print("Analyzing coverage gaps...")
    print()
    
    modules = analyze_coverage()
    
    if not modules:
        print("Could not parse coverage report. Make sure to run tests with coverage first:")
        print("  pytest --cov=cuepoint --cov-report=term-missing")
        return
    
    generate_report(modules)
    
    print()
    print("=" * 80)
    print("RECOMMENDATIONS")
    print("=" * 80)
    print("1. Focus on high-priority modules first (biggest impact)")
    print("2. Create test files for modules with 0% coverage")
    print("3. Expand existing test files for modules with low coverage")
    print("4. Consider excluding legacy code (processor.py) from coverage")
    print("5. See COVERAGE_IMPROVEMENT_PLAN.md for detailed strategy")

if __name__ == "__main__":
    main()

