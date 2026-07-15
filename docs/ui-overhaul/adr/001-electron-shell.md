# ADR-001: Desktop shell runtime

## Status

Accepted

## Context

CuePoint needs a modern pixel-art UI with faster web-native iteration than PySide6 allows. The product direction (Phase 0) is to replace the Qt GUI with a packaged desktop shell while keeping Python as the domain engine.

Alternatives considered: keep PySide6 with pixel theme (rejected), Tauri + Python (deferred), rewrite core in Node/Rust (rejected).

## Decision

Use **Electron** as the packaged desktop shell. The renderer is **Vite + React + TypeScript** (`apps/desktop-electron/renderer/`). The Python `cuepoint` package remains the engine in a separate process.

## Consequences

**Positive**

- Mature ecosystem, team can reuse lab components and Storybook workflow.
- Clear separation: shell (windowing, OS dialogs) vs engine (matching, I/O).

**Negative**

- Larger install footprint than Tauri.
- Two-process model requires IPC, packaging, and supervision (Phase 4).

## Supersedes

N/A (initial decision).

**Signals for revisit:** Sustained bundle size or memory regressions beyond agreed budgets in Spike S4 for two consecutive releases.
