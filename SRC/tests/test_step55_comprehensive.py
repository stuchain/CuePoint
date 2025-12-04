#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Comprehensive test for Step 5.5: Type Hints & Documentation.

This script runs all validation checks and writes results to a file.
"""

import inspect
import subprocess
import sys
from pathlib import Path
from typing import get_type_hints

# Import modules to check
from cuepoint.core import matcher, mix_parser, query_generator, text_processing
from cuepoint.data import beatport, rekordbox
from cuepoint.services import (
    beatport_service,
    cache_service,
    config_service,
    export_service,
    logging_service,
    matcher_service,
    processor_service,
)
from cuepoint.ui.controllers import (
    config_controller,
    export_controller,
    main_controller,
    results_controller,
)

results = []
errors = []


def check_type_hints(obj, name):
    """Check if object has type hints."""
    try:
        hints = get_type_hints(obj)
        if hints:
            results.append(f"✅ {name}: Has type hints ({len(hints)} parameters)")
            return True
        else:
            errors.append(f"❌ {name}: Missing type hints")
            return False
    except Exception as e:
        errors.append(f"⚠️  {name}: Error getting type hints: {e}")
        return False


def check_docstring(obj, name):
    """Check if object has docstring."""
    doc = inspect.getdoc(obj)
    if doc and len(doc.strip()) > 10:
        results.append(f"✅ {name}: Has docstring ({len(doc)} chars)")
        return True
    else:
        errors.append(f"❌ {name}: Missing or too short docstring")
        return False


def check_docstring_sections(doc, name):
    """Check if docstring has required sections."""
    if not doc:
        return False
    
    has_args = "Args:" in doc or "Parameters:" in doc
    has_returns = "Returns:" in doc
    has_example = "Example:" in doc or "Examples:" in doc
    
    sections = []
    if has_args:
        sections.append("Args")
    if has_returns:
        sections.append("Returns")
    if has_example:
        sections.append("Example")
    
    if sections:
        results.append(f"✅ {name}: Docstring has sections: {', '.join(sections)}")
    else:
        errors.append(f"⚠️  {name}: Docstring missing sections (Args/Returns/Example)")
    
    return len(sections) > 0


print("=" * 80)
print("Step 5.5: Type Hints & Documentation - Comprehensive Test")
print("=" * 80)
print()

# Test Services
print("Testing Services...")
print("-" * 80)

# ProcessorService
check_type_hints(processor_service.ProcessorService.__init__, "ProcessorService.__init__")
check_type_hints(processor_service.ProcessorService.process_track, "ProcessorService.process_track")
check_docstring(processor_service.ProcessorService, "ProcessorService")
check_docstring(processor_service.ProcessorService.process_track, "ProcessorService.process_track")
doc = processor_service.ProcessorService.process_track.__doc__
if doc:
    check_docstring_sections(doc, "ProcessorService.process_track")

# BeatportService
check_type_hints(beatport_service.BeatportService.__init__, "BeatportService.__init__")
check_type_hints(beatport_service.BeatportService.search_tracks, "BeatportService.search_tracks")
check_docstring(beatport_service.BeatportService, "BeatportService")
check_docstring(beatport_service.BeatportService.search_tracks, "BeatportService.search_tracks")

# CacheService
check_type_hints(cache_service.CacheService.get, "CacheService.get")
check_type_hints(cache_service.CacheService.set, "CacheService.set")
check_docstring(cache_service.CacheService, "CacheService")

# MatcherService
check_type_hints(matcher_service.MatcherService.find_best_match, "MatcherService.find_best_match")
check_docstring(matcher_service.MatcherService, "MatcherService")
check_docstring(matcher_service.MatcherService.find_best_match, "MatcherService.find_best_match")
doc = matcher_service.MatcherService.find_best_match.__doc__
if doc:
    check_docstring_sections(doc, "MatcherService.find_best_match")

print()
print("Testing Core Modules...")
print("-" * 80)

# Core functions
check_type_hints(matcher.best_beatport_match, "best_beatport_match")
check_docstring(matcher.best_beatport_match, "best_beatport_match")
check_type_hints(query_generator.make_search_queries, "make_search_queries")
check_docstring(query_generator.make_search_queries, "make_search_queries")
check_type_hints(text_processing.normalize_text, "normalize_text")
check_docstring(text_processing.normalize_text, "normalize_text")

print()
print("Testing Data Layer...")
print("-" * 80)

# Data functions
check_type_hints(rekordbox.parse_rekordbox, "parse_rekordbox")
check_docstring(rekordbox.parse_rekordbox, "parse_rekordbox")
check_type_hints(beatport.is_track_url, "is_track_url")
check_docstring(beatport.is_track_url, "is_track_url")

print()
print("Testing Controllers...")
print("-" * 80)

# Controllers
check_type_hints(results_controller.ResultsController.apply_filters, "ResultsController.apply_filters")
check_docstring(results_controller.ResultsController, "ResultsController")
check_type_hints(export_controller.ExportController.validate_export_options, "ExportController.validate_export_options")
check_docstring(export_controller.ExportController, "ExportController")

print()
print("Testing Module Docstrings...")
print("-" * 80)

# Module docstrings
modules = [
    ("processor_service", processor_service),
    ("beatport_service", beatport_service),
    ("cache_service", cache_service),
    ("matcher", matcher),
    ("rekordbox", rekordbox),
]
for name, module in modules:
    check_docstring(module, f"Module {name}")

print()
print("=" * 80)
print("Summary")
print("=" * 80)
print(f"✅ Passed: {len(results)}")
print(f"❌ Failed/Warnings: {len(errors)}")
print()

if errors:
    print("Issues Found:")
    print("-" * 80)
    for error in errors:
        print(f"  {error}")
    print()

# Run mypy validation
print("=" * 80)
print("Running Mypy Type Checking...")
print("=" * 80)

src_dir = Path(__file__).parent
mypy_config = src_dir.parent / "mypy.ini"

mypy_modules = [
    "cuepoint/services/",
    "cuepoint/core/",
    "cuepoint/data/",
    "cuepoint/ui/controllers/",
]

mypy_errors = []
for module in mypy_modules:
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "mypy",
            module,
            "--config-file",
            str(mypy_config),
        ],
        cwd=src_dir,
        capture_output=True,
        text=True,
    )
    
    if result.returncode != 0:
        output = result.stdout + result.stderr
        if "error:" in output.lower():
            mypy_errors.append(f"{module}: {output[:200]}...")
            print(f"❌ {module}: Type errors found")
        else:
            print(f"⚠️  {module}: Warnings (but no errors)")
    else:
        print(f"✅ {module}: No type errors")

print()
print("=" * 80)
print("Final Results")
print("=" * 80)
print(f"Type Hints & Docstrings: {len(results)} checks passed, {len(errors)} issues")
print(f"Mypy Validation: {len(mypy_modules) - len(mypy_errors)}/{len(mypy_modules)} modules passed")

if errors or mypy_errors:
    print()
    print("⚠️  Some issues found. See details above.")
    sys.exit(1)
else:
    print()
    print("✅ All Step 5.5 validation checks passed!")
    sys.exit(0)

