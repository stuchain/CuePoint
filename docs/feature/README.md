# Feature implementation designs

This folder contains **analytical implementation designs** for CuePoint features. Each document is in **implementation order**: implement Phase 1 first, then Phase 2, and so on. Each doc is ~1000 lines and specifies exactly what to implement, where, and how, including full testing design.

---

## Implementation order (inCrate)

| Phase | Doc | Scope | Build after |
|-------|-----|--------|-------------|
| **1** | [01 – Inventory](incrate-01-inventory.md) | Rekordbox full-collection parse, SQLite schema, label enrichment on first import | — (first) |
| **2** | [02 – Beatport API client](incrate-02-beatport-api.md) | Beatport API integration: auth, charts, labels, releases | Phase 1 |
| **3** | [03 – Discovery flow](incrate-03-discovery.md) | Charts from library artists, new releases from labels, deduplication | Phases 1, 2 |
| **4** | [04 – Playlist and auth](incrate-04-playlist-and-auth.md) | Per-run playlist naming, create/add tracks, API vs browser auth | Phase 3 |
| **5** | [05 – UI and integration](incrate-05-ui-and-integration.md) | inCrate entry point, wizard/tabs, tool selection, config | Phases 1–4 |

**Spec:** [../incrate-spec.md](../incrate-spec.md)

---

## inCrate document index

| Doc | Title | Lines (target) |
|-----|--------|-----------------|
| [incrate-01-inventory.md](incrate-01-inventory.md) | Inventory (Phase 1) | ~1000 |
| [incrate-02-beatport-api.md](incrate-02-beatport-api.md) | Beatport API client (Phase 2) | ~1000 |
| [incrate-03-discovery.md](incrate-03-discovery.md) | Discovery flow (Phase 3) | ~1000 |
| [incrate-04-playlist-and-auth.md](incrate-04-playlist-and-auth.md) | Playlist and auth (Phase 4) | ~1000 |
| [incrate-05-ui-and-integration.md](incrate-05-ui-and-integration.md) | UI and integration (Phase 5) | ~1000 |

Each document includes:

- **Implementation order:** Phase 1 → 2 → 3 → 4 → 5; each doc states "build after Phase N" and "next phase".
- **Exact file paths and function signatures:** Where to create/modify files; full signatures and return types.
- **Step-by-step implementation:** Line-by-line checklist (Appendix A), algorithm pseudocode, SQL and code snippets.
- **Full testing design:** Per-doc test matrix (test file, class, method), assertions, mocks, fixtures; Appendix B (test case specs), Appendix F (test file layout and pytest markers).
- **Super analytic detail:** Data models (DDL, dataclasses), configuration keys, error/edge-case matrix (Appendix C), dependency graph (Appendix D), exact function signatures (Appendix E).
- **Target length:** ~1000 lines per doc; appendices can be extended with more test cases or implementation notes as needed.
