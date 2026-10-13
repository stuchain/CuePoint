"""CuePoint Python engine sidecar (HTTP on loopback).

The server is imported on first use (PEP 562), not with the package: the
analysis worker (C19g) is a child of the engine that lives in this package, and
it must not pay for, or load, everything the engine does.
"""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from cuepoint.engine.server import EngineConfig, get_job_store, run_engine

__all__ = ["EngineConfig", "get_job_store", "run_engine"]


def __getattr__(name: str) -> Any:
    if name in __all__:
        from cuepoint.engine import server

        return getattr(server, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
