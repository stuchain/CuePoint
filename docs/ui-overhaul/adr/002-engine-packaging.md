# ADR-002: Engine packaging

## Status

Accepted

## Context

The Electron shell cannot embed Python domain logic. The existing `src/cuepoint/` package must ship as a **sidecar** the main process spawns and supervises on Windows, macOS, and Linux.

## Decision

Package the engine as **PyInstaller one-directory** per platform for production releases.

For **development and Spike S1**, allow `python -m cuepoint.engine` (or equivalent module entry) without PyInstaller so health-check and IPC can be proven before CI packaging (Phase 9).

## Consequences

**Positive**

- Reuses existing Python package layout with minimal moves.
- One-dir layout simplifies resource paths relative to the executable.

**Negative**

- PyInstaller cold-start and AV false-positive risk (baseline in Spike S4).
- Three OS build artifacts to maintain in release pipeline.

## References

- [phase-0-architecture.md](../phase-0-architecture.md)
- [spike-s1-engine-health.md](../../../apps/desktop-electron/docs/spike-s1-engine-health.md)
