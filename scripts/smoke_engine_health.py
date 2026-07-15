#!/usr/bin/env python3
"""Smoke test: engine module starts and /health responds."""

from __future__ import annotations

import json
import socket
import sys
import urllib.request

from cuepoint.engine.server import EngineConfig, start_engine_thread


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def main() -> int:
    port = _free_port()
    config = EngineConfig(host="127.0.0.1", port=port, token="smoke-token")
    server, thread = start_engine_thread(config)
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=5) as resp:
            if resp.status != 200:
                print(f"FAIL: /health returned {resp.status}", file=sys.stderr)
                return 1
            data = json.loads(resp.read().decode("utf-8"))
        if data.get("status") != "ok":
            print(f"FAIL: unexpected health payload: {data}", file=sys.stderr)
            return 1
        print(f"OK: engine health version={data.get('version')}")
        return 0
    except Exception as exc:  # noqa: BLE001 — smoke script
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    finally:
        server.shutdown()
        thread.join(timeout=3)


if __name__ == "__main__":
    raise SystemExit(main())
