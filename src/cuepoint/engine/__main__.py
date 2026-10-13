"""Run CuePoint engine: python -m cuepoint.engine

``--analysis-worker`` runs the waveform analysis worker instead (C19g). Both
entry points land here: Electron's dev spawn (``python -m cuepoint.engine``) and
the frozen sidecar, whose PyInstaller entry is this file and which the engine
runs again with that flag. The worker is imported without the server, so it
starts without the engine's import cost.
"""

import sys

if __name__ == "__main__":
    if "--analysis-worker" in sys.argv[1:]:
        from cuepoint.engine.analysis_worker import main

        raise SystemExit(main())

    from cuepoint.engine.server import run_engine
    from cuepoint.services.analysis_worker_client import enable_worker

    # The engine process analyses in a worker; tests that start the engine in
    # a thread (`start_engine_thread`) do not come here and stay in-process.
    enable_worker()
    run_engine()
