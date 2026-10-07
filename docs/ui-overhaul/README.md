# UI overhaul: decision records

This folder keeps the architecture decision records (ADRs) for the move to the Electron desktop app. The Electron app is the only desktop UI. The planning and tracking notes that used to sit here were removed in Phase 12 and are in git history.

## Records

| ADR | What it decides |
| --- | --- |
| [001: Desktop shell runtime](adr/001-electron-shell.md) | Electron is the desktop shell, with a Vite, React and TypeScript renderer. Python stays the engine, in a separate process. |
| [002: Engine packaging](adr/002-engine-packaging.md) | The engine ships as a one-directory sidecar per platform and runs from source in development. |
| [003: IPC style](adr/003-http-ipc.md) | The renderer reaches the engine over loopback HTTP JSON with a per-session bearer token. |
| [004: Player backend and packaging](adr/004-player-backend.md) | The player is a bundled prebuilt `mpv`, controlled over its JSON IPC, as a second sidecar. |
| [005: Matching on the library](adr/005-matching-on-the-library.md) | The desktop app matches library tracks, not files. |
| [006: The Rekordbox export](adr/006-rekordbox-export-patches.md) | The export patches a copy of the imported file and never generates a new one. |
| [007: Discovery on the library](adr/007-discover-on-the-library.md) | Discover reads the library's values, and inCrate is retired. |
| [008: Sets as a Collection kind](adr/008-sets-as-a-collection-kind.md) | A Set is a fourth kind of node in the Collection tree. |
| [009: The waveform decoder](adr/009-waveform-decoder.md) | The player's `mpv` decodes audio and FFmpeg reduces it to a waveform. |
| [010: The waveform store](adr/010-waveform-store.md) | Waveforms live in their own store, keyed by file, and are rebuilt rather than migrated. |

The [ADR index](adr/README.md) has the template for a new record.

## Assets

[Pixel UI assets](assets/README.md) has the export checklist for the pixel-art assets.
