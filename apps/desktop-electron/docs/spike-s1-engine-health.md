# Spike S1 — Engine health from Electron shell

**Phase 0 spike** | **Status:** Done (2026-07-15)  
**Prerequisite ADRs:** ADR-001 (Electron), ADR-002 (PyInstaller), ADR-003 (HTTP IPC)

## Goal

Demonstrate that the Electron main process can **spawn**, **supervise**, and **health-check** the Python engine on Windows, macOS, and Linux.

## Success criteria

1. Engine binds **`127.0.0.1` only** (SEC-01).
2. `GET /health` returns `{ "status": "ok", "version": "..." }` without auth.
3. Authenticated `GET /api/v1/status` returns engine ready state with Bearer token (SEC-02).
4. Cold start time recorded (baseline for Phase 0 quality attributes).

## Suggested implementation slice

```
feat(engine): add localhost health endpoint stub
feat(electron): spawn engine sidecar and poll health
test(engine): assert bind address is loopback only
```

## Algorithm (port + token)

1. Main picks ephemeral port on `127.0.0.1`.
2. Main generates random session token (memory only).
3. Main spawns engine with `CUEPOINT_PORT`, `CUEPOINT_TOKEN`, `CUEPOINT_CWD`.
4. Main polls `/health` with backoff until 200 or timeout (show error UI per Phase 0 failure modes).
5. Main passes `{ baseUrl, token }` to renderer via preload (never persist token in localStorage — SEC-03).

## Out of scope for S1

- Full OpenAPI surface (Phase 3)
- PyInstaller packaging (Phase 9) — dev mode `python -m cuepoint.engine` acceptable for spike
- Beatport/network calls

## References

- [phase-0-architecture.md](../../../docs/ui-overhaul/phase-0-architecture.md)
- [phase-0b-security-and-privacy.md](../../../docs/ui-overhaul/phase-0b-security-and-privacy.md)
- [phase-4-electron-shell.md](../../../docs/ui-overhaul/phase-4-electron-shell.md)
