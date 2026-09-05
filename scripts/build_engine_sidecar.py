#!/usr/bin/env python3
"""Build PyInstaller engine sidecar for Electron desktop packaging."""

from __future__ import annotations

import json
import os
import platform
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from typing import Optional

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SPEC = PROJECT_ROOT / "build" / "engine-sidecar.spec"
RESOURCES_ROOT = PROJECT_ROOT / "apps" / "desktop-electron" / "resources" / "engine"

#: ``sys.platform`` -> the ``${os}`` value electron-builder expands.
#:
#: These are electron-builder's names, not Python's. ``extraResources.from`` in
#: ``apps/desktop-electron/package.json`` is macro-expanded as
#: ``resources/engine/${os}-${arch}``, where ``${os}`` is a Platform's
#: ``buildConfigurationKey`` (``mac``/``win``/``linux``) and ``${arch}`` is
#: ``x64``/``arm64``. They are deliberately *not* ``darwin``/``win32``.
#:
#: This mapping previously used Python's names, and the mismatch meant the
#: ``from`` path never resolved on Windows or macOS: electron-builder skipped
#: the payload with a warning and produced installers with no engine in them.
#: ``src/tests/unit/scripts/test_packaging_resource_paths.py`` now holds the two
#: sides together.
PLATFORM_DIRS = {
    "win32": "win",
    "darwin": "mac",
    "linux": "linux",
}


def normalize_arch(machine: str) -> str:
    """Map a ``platform.machine()`` value onto electron-builder's ``${arch}``."""
    m = (machine or "").lower()
    if m in ("amd64", "x86_64", "x64"):
        return "x64"
    if m in ("arm64", "aarch64"):
        return "arm64"
    return m or "unknown"


def platform_dir(
    system: Optional[str] = None, machine: Optional[str] = None
) -> Optional[str]:
    """The ``resources/engine/`` subdirectory this build should write to.

    Returns ``None`` for a platform the sidecar cannot be built for. Separated
    from :func:`main` so the packaging contract can be tested without running
    PyInstaller.
    """
    key = PLATFORM_DIRS.get(system or sys.platform)
    if key is None:
        return None
    return f"{key}-{normalize_arch(machine or platform.machine())}"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _smoke_test_executable(exe: Path) -> None:
    port = _free_port()
    token = "sidecar-smoke-token"
    env = os.environ.copy()
    env["CUEPOINT_HOST"] = "127.0.0.1"
    env["CUEPOINT_PORT"] = str(port)
    env["CUEPOINT_TOKEN"] = token
    env["CUEPOINT_HEADLESS"] = "1"

    proc = subprocess.Popen(
        [str(exe)],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        url = f"http://127.0.0.1:{port}/health"
        for _ in range(40):
            if proc.poll() is not None:
                out, err = proc.communicate(timeout=2)
                detail = (err or out or b"").decode("utf-8", errors="replace").strip()
                raise RuntimeError(
                    f"Engine sidecar exited early (code {proc.returncode}): {detail[:500]}"
                )
            try:
                with urllib.request.urlopen(url, timeout=1) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode("utf-8"))
                        if data.get("status") == "ok":
                            print(f"OK: sidecar health version={data.get('version')}")
                            return
            except Exception:
                time.sleep(0.25)
        raise RuntimeError("Engine sidecar health check timed out")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


def main() -> int:
    platform_key = platform_dir()
    if not platform_key:
        print(f"Unsupported platform: {sys.platform}", file=sys.stderr)
        return 1

    if not SPEC.exists():
        print(f"Missing spec: {SPEC}", file=sys.stderr)
        return 1

    print(f"Building engine sidecar with {SPEC}...")
    result = subprocess.run(
        [sys.executable, "-m", "PyInstaller", "--clean", "--noconfirm", str(SPEC)],
        cwd=PROJECT_ROOT,
        check=False,
    )
    if result.returncode != 0:
        print("PyInstaller build failed", file=sys.stderr)
        return result.returncode

    built_name = "cuepoint-engine.exe" if sys.platform == "win32" else "cuepoint-engine"
    built_exe = PROJECT_ROOT / "dist" / built_name
    if not built_exe.exists():
        print(f"Expected output missing: {built_exe}", file=sys.stderr)
        return 1

    dest_dir = RESOURCES_ROOT / platform_key
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_exe = dest_dir / built_name
    shutil.copy2(built_exe, dest_exe)
    print(f"Copied sidecar to {dest_exe}")

    if sys.platform != "win32":
        # shutil.copy2 can preserve mode, but on some runners it may not.
        # Ensure the copied binary is executable for smoke tests.
        try:
            dest_exe.chmod(dest_exe.stat().st_mode | 0o111)
        except OSError:
            pass

    _smoke_test_executable(dest_exe)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
