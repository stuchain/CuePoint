"""Regression: the sidecar analysis check must be able to load ``audio_decode.py``.

``scripts/fetch_player_sidecar.py --check-analysis`` loads the module from its
file in a plain interpreter, where ``cuepoint`` is not installed. A ``cuepoint``
import added to the module broke that release check on every leg with
``ModuleNotFoundError``; the first fix kept the module standard-library only,
and when it later needed ``cuepoint.utils.long_path`` the check broke again on
both Macs. The loader now puts the repository's ``src`` on the path.

The test runs the script's own loader in an isolated interpreter that has no
``cuepoint`` on its path, so it fails whichever side breaks: the module gaining
an import the loader cannot satisfy, or the loader losing its path.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / "scripts" / "fetch_player_sidecar.py"

LOADER = """
import importlib.util, sys
spec = importlib.util.spec_from_file_location("sidecar_script", sys.argv[1])
script = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = script
spec.loader.exec_module(script)
try:
    import cuepoint
except ModuleNotFoundError:
    pass
else:
    raise SystemExit("cuepoint was importable before the loader ran")
module = script._load_audio_decode()
assert hasattr(module, "decode_envelope")
assert str(script.PROJECT_ROOT / "src") not in sys.path, "the loader left src on sys.path"
"""


def test_the_analysis_check_loads_audio_decode_in_a_plain_interpreter(
    tmp_path: Path,
) -> None:
    result = subprocess.run(
        [sys.executable, "-I", "-c", LOADER, str(SCRIPT)],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert result.returncode == 0, result.stderr
