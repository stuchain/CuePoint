# Architecture Decision Records (UI overhaul)

This folder holds **ADRs** for the Electron + Python engine migration. The **working list** lives in phase-0-architecture.md (`docs/ui-overhaul/phase-0-architecture.md`, removed in Phase 12; in git history).

When an ADR is promoted from “Proposed” to “Accepted”, add a file:

`NNNN-title.md` using this template:

```markdown
# ADR-NNNN: Title

## Status
Proposed | Accepted | Superseded

## Context
What forces the decision.

## Decision
What we chose.

## Consequences
Positive and negative outcomes.
```

Suggested first commits:

- `docs(adr): add adr template for ui overhaul`
- `docs(adr): accept adr-001 electron shell decision` (when ready)

## Accepted ADRs

| ID | File | Summary |
| --- | --- | --- |
| ADR-001 | [001-electron-shell.md](001-electron-shell.md) | Electron shell + React renderer |
| ADR-002 | [002-engine-packaging.md](002-engine-packaging.md) | PyInstaller one-dir; dev module for spikes |
| ADR-003 | [003-http-ipc.md](003-http-ipc.md) | HTTP on loopback + session token |
| ADR-004 | [004-player-backend.md](004-player-backend.md) | Bundled mpv sidecar over JSON IPC |
| ADR-005 | [005-matching-on-the-library.md](005-matching-on-the-library.md) | Desktop matching runs on library tracks; inKey's file-based routes removed |
| ADR-006 | [006-rekordbox-export-patches.md](006-rekordbox-export-patches.md) | The Rekordbox export patches a copy of the imported XML; it never generates one |
| ADR-007 | [007-discover-on-the-library.md](007-discover-on-the-library.md) | Discovery reads the library; ownership is computed; an artist is a Beatport id or a name; similarity is local; inCrate's routes removed |
| ADR-008 | [008-sets-as-a-collection-kind.md](008-sets-as-a-collection-kind.md) | A Set is a kind of Collection node with side tables; m0025 rebuilds the tree without cascading; a Set's plan stays in CuePoint |
| ADR-009 | [009-waveform-decoder.md](009-waveform-decoder.md) | Waveforms are decoded by the player's mpv; FFmpeg splits, squares and reduces the bands; the log proves the output; no numpy |
| ADR-010 | [010-waveform-store.md](010-waveform-store.md) | Waveforms live in `waveforms.db` beside the library, keyed by file path, outside backups and "Clear cache"; rebuilt, never migrated |
| ADR-011 | [011-beatport-sign-in-window.md](011-beatport-sign-in-window.md) | Beatport sign-in runs in a second sandboxed window with its own partition, no preload and a host allow-list; the main window's one-window rule is otherwise unchanged |
| ADR-012 | [012-waveform-detail.md](012-waveform-detail.md) | Zoomed-waveform detail is a separate 75-a-second `CPWD` stream, made on demand when a track plays and kept in a 256 MB least-recently-used table in `waveforms.db` |
| ADR-013 | [013-analysis-worker-process.md](013-analysis-worker-process.md) | Waveform analysis (decoder supervision, parse, reduce, encode) runs in one long-lived worker process speaking JSON lines; the engine keeps the store writes and falls back to in-process |

## ADR quality bar (analytical)

Each ADR SHOULD quantify **when superseded**: list **signals** (e.g. “Electron bundle size > X MB sustained for two releases”). Link to **Phase 0** drivers if tradeoff touches correctness, security, or parity.
