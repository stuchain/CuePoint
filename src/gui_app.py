#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Desktop application entry point — launches the Electron shell.

The legacy Qt desktop GUI has been removed from the product path (Phase 10).
Use ``apps/desktop-electron`` for development and packaged releases.
"""

from __future__ import annotations

import os
import subprocess
import sys


def _project_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ensure_src_on_path() -> None:
    src_path = os.path.dirname(os.path.abspath(__file__))
    if src_path not in sys.path:
        sys.path.insert(0, src_path)


def _maybe_reexec_venv() -> None:
    """Re-exec into project .venv on Unix when not already in a venv."""
    try:
        if sys.prefix == sys.base_prefix:
            venv_python = os.path.join(_project_root(), ".venv", "bin", "python")
            if os.path.exists(venv_python) and os.access(venv_python, os.X_OK):
                os.execv(venv_python, [venv_python] + sys.argv)
    except Exception:
        pass


def _run_search_dependency_test() -> int:
    import argparse
    import io
    import traceback

    parser = argparse.ArgumentParser(description="CuePoint desktop launcher")
    parser.add_argument(
        "--test-search-dependencies",
        action="store_true",
        help="Test search dependencies and exit",
    )
    args, _unknown = parser.parse_known_args()
    if not args.test_search_dependencies:
        return -1

    try:
        if getattr(sys, "frozen", False):
            base_path = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
        else:
            base_path = _project_root()

        for scripts_path in (
            os.path.join(base_path, "scripts"),
            os.path.join(_project_root(), "scripts"),
        ):
            if os.path.exists(scripts_path) and scripts_path not in sys.path:
                sys.path.insert(0, scripts_path)

        output_buffer = io.StringIO()
        old_stdout = sys.stdout
        sys.stdout = output_buffer
        try:
            from test_search_dependencies import test_imports

            print("Testing search dependencies...")
            print(f"Python version: {sys.version}")
            print(f"Frozen (packaged): {getattr(sys, 'frozen', False)}")
            print(f"Executable: {sys.executable}")
            print("=" * 60 + "\n")
            success = test_imports()
            output_text = output_buffer.getvalue()
        finally:
            sys.stdout = old_stdout

        stream = sys.stderr if getattr(sys, "frozen", False) else sys.stdout
        print(output_text, file=stream)
        return 0 if success else 1
    except Exception as exc:
        print(f"Error running search dependency test: {exc}", file=sys.stderr)
        traceback.print_exc()
        return 1


def launch_electron() -> int:
    """Start the Electron desktop shell."""
    electron_dir = os.path.join(_project_root(), "apps", "desktop-electron")
    package_json = os.path.join(electron_dir, "package.json")
    if not os.path.exists(package_json):
        print(
            "Electron desktop shell not found "
            "(missing apps/desktop-electron/package.json)."
        )
        print("Install Node.js dependencies: cd apps/desktop-electron && npm install")
        return 1

    print("Launching Electron desktop shell…")
    print("Tip: for a packaged build, use the installer from GitHub Releases.")
    try:
        proc = subprocess.run(
            ["npm", "run", "electron:dev"],
            cwd=electron_dir,
            check=False,
        )
    except FileNotFoundError as exc:
        print(f"Electron launch failed ({exc}). Install Node.js/npm and retry.")
        return 1

    if proc.returncode != 0:
        print(f"Electron shell exited with code {proc.returncode}.")
    return proc.returncode


def main() -> int:
    """CLI entry for the desktop app."""
    if "--legacy-qt" in sys.argv:
        print(
            "The legacy Qt desktop GUI has been removed from the product path.\n"
            "Use the Electron desktop app:\n"
            "  cd apps/desktop-electron && npm install && npm run electron:dev\n"
            "Or run: python src/gui_app.py",
            file=sys.stderr,
        )
        return 2

    dep_code = _run_search_dependency_test()
    if dep_code >= 0:
        return dep_code

    return launch_electron()


if __name__ == "__main__":
    _maybe_reexec_venv()
    _ensure_src_on_path()
    raise SystemExit(main())
