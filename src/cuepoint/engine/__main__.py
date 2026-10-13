"""Run CuePoint engine: python -m cuepoint.engine

``--analysis-worker`` runs the waveform analysis worker instead (C19g). Both
entry points land here: Electron's dev spawn (``python -m cuepoint.engine``) and
the frozen sidecar, whose PyInstaller entry is this file and which the engine
runs again with that flag. The worker is imported without the server, so it
starts without the engine's import cost.

``--analysis-selftest DECODER FILE`` is the release check's half (C19g): it
analyses FILE through a real worker, as the app does, and prints one JSON line
(``fetch_player_sidecar.py --check-analysis-worker``).
"""

import sys


def _run_worker() -> int:
    """Run the worker; never let an exception reach the interpreter's hook.

    A windowed (``console=False``) build shows an uncaught traceback as a modal
    dialog, which nobody is there to close.
    """
    try:
        from cuepoint.engine.analysis_worker import main

        return int(main())
    except Exception as error:
        try:
            print(f"analysis worker failed: {error!r}", file=sys.stderr)
        except Exception:
            pass
        return 1


def _run_selftest(arguments: list) -> int:
    """Run the self-test; the same promise as :func:`_run_worker`."""
    if len(arguments) != 2:
        print("usage: --analysis-selftest DECODER FILE", file=sys.stderr)
        return 2
    try:
        from cuepoint.engine.analysis_worker import selftest

        return int(selftest(arguments[0], arguments[1]))
    except Exception as error:
        try:
            print(f"analysis selftest failed: {error!r}", file=sys.stderr)
        except Exception:
            pass
        return 1


if __name__ == "__main__":
    if "--analysis-worker" in sys.argv[1:]:
        raise SystemExit(_run_worker())
    if "--analysis-selftest" in sys.argv[1:]:
        _at = sys.argv.index("--analysis-selftest")
        raise SystemExit(_run_selftest(sys.argv[_at + 1 :]))

    from cuepoint.engine.server import run_engine
    from cuepoint.services.analysis_worker_client import enable_worker

    # The engine process analyses in a worker; tests that start the engine in
    # a thread (`start_engine_thread`) do not come here and stay in-process.
    enable_worker()
    run_engine()
