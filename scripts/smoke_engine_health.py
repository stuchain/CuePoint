#!/usr/bin/env python3
"""Smoke test: engine module starts and /health responds.

When a decoder is known it also starts the analysis worker (C19g): ``--decoder
PATH``, else ``CUEPOINT_DECODER_PATH``, else the fetched player sidecar. The
engine is run as ``python -m cuepoint.engine --analysis-selftest DECODER
bands.flac``, which must print a ready result from a real worker. With no
decoder that step is skipped and the smoke still passes (Linux pins none).

    python scripts/smoke_engine_health.py [--decoder PATH]
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import subprocess
import sys
import urllib.request
from pathlib import Path
from typing import Optional, Sequence

from cuepoint.engine.server import EngineConfig, start_engine_thread

_ROOT = Path(__file__).resolve().parents[1]
FIXTURE = _ROOT / "src" / "tests" / "fixtures" / "audio" / "bands.flac"
DECODER_ENV = "CUEPOINT_DECODER_PATH"
SELFTEST_TIMEOUT_SECONDS = 180


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _fetched_sidecar() -> Optional[Path]:
    """The player sidecar ``fetch_player_sidecar.py`` installed, if there is one."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    try:
        import fetch_player_sidecar as fps

        manifest = fps.load_manifest()
        target = manifest.targets.get(fps.host_target_key())
        if target is None or not target.supported:
            return None
        found = Path(fps.binary_path_for(target, fps.DEFAULT_DEST))
    except Exception:  # noqa: BLE001 — no sidecar is not a failure of the smoke
        return None
    finally:
        sys.path.pop(0)
    return found if found.is_file() else None


def find_decoder(
    named: Optional[str], environ: Optional[dict] = None
) -> Optional[Path]:
    """``--decoder``, else ``CUEPOINT_DECODER_PATH``, else the fetched sidecar."""
    env = os.environ if environ is None else environ
    for candidate in (named, env.get(DECODER_ENV)):
        if candidate:
            return Path(candidate)
    return _fetched_sidecar()


def check_analysis_worker(decoder: Optional[Path]) -> bool:
    """Run the engine's worker self-test; ``True`` when it passed or was skipped."""
    if decoder is None:
        print("SKIP: analysis worker (no decoder)")
        return True
    if not decoder.is_file():
        print(f"FAIL: analysis worker: no decoder at {decoder}", file=sys.stderr)
        return False
    env = dict(os.environ)
    src = str(_ROOT / "src")
    env["PYTHONPATH"] = src + (
        os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else ""
    )
    try:
        done = subprocess.run(
            [
                sys.executable,
                "-m",
                "cuepoint.engine",
                "--analysis-selftest",
                str(decoder),
                str(FIXTURE),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=SELFTEST_TIMEOUT_SECONDS,
            env=env,
            check=False,
        )
        said = json.loads(done.stdout.strip().splitlines()[-1])
    except (OSError, subprocess.TimeoutExpired, ValueError, IndexError) as exc:
        print(f"FAIL: analysis worker: {exc!r}", file=sys.stderr)
        return False
    if done.returncode != 0 or said.get("outcome") != "ready":
        print(
            f"FAIL: analysis worker: exit {done.returncode}, {said.get('outcome')}"
            f" ({said.get('reason')}); {done.stderr[-300:]!r}",
            file=sys.stderr,
        )
        return False
    print(
        f"OK: analysis worker pid={said.get('worker_pid')} "
        f"started in {said.get('start_seconds')} s"
    )
    return True


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--decoder", help=f"The decoder for the worker step (else ${DECODER_ENV})"
    )
    args = parser.parse_args(argv)
    port = _free_port()
    config = EngineConfig(host="127.0.0.1", port=port, token="smoke-token")
    server, thread = start_engine_thread(config)
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{port}/health", timeout=5
        ) as resp:
            if resp.status != 200:
                print(f"FAIL: /health returned {resp.status}", file=sys.stderr)
                return 1
            data = json.loads(resp.read().decode("utf-8"))
        if data.get("status") != "ok":
            print(f"FAIL: unexpected health payload: {data}", file=sys.stderr)
            return 1
        print(f"OK: engine health version={data.get('version')}")
        return 0 if check_analysis_worker(find_decoder(args.decoder)) else 1
    except Exception as exc:  # noqa: BLE001 — smoke script
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    finally:
        server.shutdown()
        thread.join(timeout=3)


if __name__ == "__main__":
    raise SystemExit(main())
