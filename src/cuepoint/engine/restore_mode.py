"""``python -m cuepoint.engine --restore NAME``: restore a backup, no server (HARDEN-01).

The desktop app stops the engine, runs this once, then starts the engine again,
so a restore never happens beside a live engine and runs the same code as its
tests. It must work on a library too damaged to open: nothing here opens the
library; :meth:`BackupService.restore` decides how to keep it.

Exits 0 on success. Otherwise it prints ONE JSON line to stderr,
``{"error_code": ..., "message": ...}``, and exits non-zero. The library is left
as it was for any failure before the swap.
"""

from __future__ import annotations

import json
import sys
from typing import List, Optional

from cuepoint.exceptions.cuepoint_exceptions import DatabaseError


def _fail(error_code: str, message: str) -> int:
    try:
        print(
            json.dumps({"error_code": error_code, "message": message}),
            file=sys.stderr,
            flush=True,
        )
    except Exception:  # noqa: BLE001 - nothing left to tell
        pass
    return 1


def run_restore(name: str) -> int:
    """Restore the backup called ``name``; return the process exit code."""
    try:
        from cuepoint.services.bootstrap import bootstrap_services
        from cuepoint.services.interfaces import IBackupService
        from cuepoint.utils.di_container import get_container

        bootstrap_services()
        service = get_container().resolve(IBackupService)
        service.restore(service.backup_path(name))
        return 0
    except DatabaseError as exc:
        return _fail(exc.error_code or "RESTORE_FAILED", exc.message)
    except Exception:  # noqa: BLE001 - the one-line contract holds for anything
        return _fail("RESTORE_FAILED", "The backup could not be restored")


def main(arguments: Optional[List[str]] = None) -> int:
    """Entry point: ``arguments`` are those after ``--restore``."""
    args = list(sys.argv[1:] if arguments is None else arguments)
    # The app spawns this with the engine's own arguments and environment, so
    # whatever follows the name (a flag meant for the server) is ignored.
    if not args or not args[0] or args[0].startswith("--"):
        return _fail("RESTORE_USAGE", "Say which backup to restore")
    return run_restore(args[0])
