# ADR-003: IPC style (HTTP + session token)

## Status

Accepted

## Context

The renderer and engine run in separate processes. Communication must be debuggable, versionable, and safe on localhost (Phase 0b: bind loopback only, session token for authenticated routes).

## Decision

Use **HTTP JSON** on `127.0.0.1` for request/response APIs. Add **WebSocket or SSE** later for streaming progress (Phase 3).

**Handshake (Spike S1+):**

1. Electron main picks an ephemeral port on loopback.
2. Main generates a random session token (memory only in main; not persisted in renderer `localStorage`).
3. Main spawns engine with `CUEPOINT_PORT`, `CUEPOINT_TOKEN`, `CUEPOINT_CWD`.
4. `GET /health` is unauthenticated (status + version only).
5. All other routes require `Authorization: Bearer <token>`.

## Consequences

**Positive**

- OpenAPI-friendly (Phase 3); easy to test with curl during development.
- Clear security boundary: renderer never holds filesystem or Beatport secrets directly.

**Negative**

- HTTP overhead vs shared memory (acceptable for desktop localhost).
- Token lifecycle and engine restart must be handled in main (Phase 4).

## References

- [phase-0b-security-and-privacy.md](../phase-0b-security-and-privacy.md)
- [phase-3-engine-api.md](../phase-3-engine-api.md)
