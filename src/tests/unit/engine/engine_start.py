"""Running ``run_engine`` to the end of its start, without a real server (HARDEN-03).

The engine binds its port first and does its library work (the launch backup, the
upgrade, the background jobs) on a thread started after that. A test that wants to see
that work stands a server in that serves nothing and waits for the thread.
"""

from __future__ import annotations

from typing import Any, List

from cuepoint.engine import server


class FakeServer:
    """Stands in for ``ThreadingHTTPServer``: binds nothing, serves until the start is done."""

    created: List["FakeServer"] = []

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        FakeServer.created.append(self)

    def serve_forever(self) -> None:
        thread = server._LIBRARY_START
        if thread is not None:
            thread.join(60)

    def server_close(self) -> None:
        pass

    def shutdown(self) -> None:
        pass


def run_engine_to_the_end(monkeypatch: Any, port: int = 8123) -> None:
    """Run ``run_engine`` with a server that serves nothing, and return once the start is done."""
    monkeypatch.setattr(server, "ThreadingHTTPServer", FakeServer)
    server.run_engine(server.EngineConfig(host="127.0.0.1", port=port))
