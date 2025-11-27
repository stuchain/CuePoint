#!/usr/bin/env python3
"""Quick validation script for Step 5.5."""

import sys
from pathlib import Path
from typing import get_type_hints

# Test imports
try:
    from cuepoint.services.processor_service import ProcessorService
    from cuepoint.services.beatport_service import BeatportService
    from cuepoint.services.cache_service import CacheService
    from cuepoint.services.matcher_service import MatcherService
    from cuepoint.core.matcher import best_beatport_match
    from cuepoint.data.rekordbox import parse_rekordbox
    print("✅ All imports successful")
except Exception as e:
    print(f"❌ Import error: {e}")
    sys.exit(1)

# Test type hints
try:
    hints = get_type_hints(ProcessorService.process_track)
    print(f"✅ ProcessorService.process_track has {len(hints)} type hints")
except Exception as e:
    print(f"❌ Type hint error: {e}")
    sys.exit(1)

# Test docstrings
if ProcessorService.__doc__:
    print(f"✅ ProcessorService has docstring ({len(ProcessorService.__doc__)} chars)")
else:
    print("❌ ProcessorService missing docstring")
    sys.exit(1)

if ProcessorService.process_track.__doc__:
    doc = ProcessorService.process_track.__doc__
    has_args = "Args:" in doc
    has_returns = "Returns:" in doc
    print(f"✅ process_track docstring: Args={has_args}, Returns={has_returns}")
else:
    print("❌ process_track missing docstring")
    sys.exit(1)

# Test mypy
src_dir = Path(__file__).parent
mypy_config = src_dir.parent / "mypy.ini"

import subprocess
result = subprocess.run(
    [sys.executable, "-m", "mypy", "cuepoint/services/processor_service.py", "--config-file", str(mypy_config)],
    cwd=src_dir,
    capture_output=True,
    text=True,
)

if result.returncode == 0:
    print("✅ Mypy validation passed for processor_service")
else:
    if "error:" in result.stdout.lower() or "error:" in result.stderr.lower():
        print(f"❌ Mypy found errors:\n{result.stdout}{result.stderr}")
        sys.exit(1)
    else:
        print("⚠️  Mypy warnings (but no errors)")

print("\n✅ Step 5.5 validation complete!")

