"""Regression: ``audio_decode.py`` must load by path with only the standard library.

``scripts/fetch_player_sidecar.py --check-analysis`` loads the module from its
file, with no ``cuepoint`` package importable. A ``cuepoint`` import added to it
broke that release check on every leg with ``ModuleNotFoundError``.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

AUDIO_DECODE = (
    Path(__file__).resolve().parents[2] / "cuepoint" / "data" / "audio_decode.py"
)

LOADER = """
import importlib.util, sys
spec = importlib.util.spec_from_file_location("cuepoint_audio_decode", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
assert hasattr(module, "decode_envelope")
"""


def test_audio_decode_loads_without_the_cuepoint_package(tmp_path: Path) -> None:
    result = subprocess.run(
        [sys.executable, "-I", "-c", LOADER, str(AUDIO_DECODE)],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert result.returncode == 0, result.stderr
