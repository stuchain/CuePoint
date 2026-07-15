# Phase 10 — Cutover and Qt removal

## Purpose

Plan the **switch** of the default desktop entry from **PySide6** to **Electron**, complete **final parity** verification, **delete** Qt GUI modules, and update **user-facing** documentation (`docs/how-to-run.md`, README).

**Prerequisites:** Phase 6 (all **verified**), Phase 9 (release pipeline).

---

## Go / no-go criteria (analytical)

| Criterion | Evidence required |
|-----------|-------------------|
| Parity | Phase 6 P0 rows `verified` |
| Security | SEC-xx checks signed off (Phase 0b) |
| Stability | No open **P0** crashes in RC burn-in window (TBD days) |
| Support | Support bundle + docs updated (Phase 7) |

**No-go:** If any criterion fails, **delay** cutover; Qt remains until next RC.

---

## User communication plan

| Audience | Message | Channel |
|----------|---------|---------|
| Existing users | Desktop app is new shell; **CLI unchanged** | Release notes, in-app banner (optional) |
| Contributors | `gui_app.py` removed; new dev setup | CONTRIBUTING, README |

---

## CLI and automation compatibility

- **CLI** (`cuepoint` / documented entry) MUST remain for scripting after Qt removal.
- Document any **flag** changes if shared code paths moved during refactor.

---

## Goals vs non-goals

| Goals | Non-goals |
|--------|-----------|
| Single supported desktop GUI | Indefinite Qt maintenance |

---

## Cutover checklist

| Step | Action |
|------|--------|
| 1 | Tag **release candidate** with Electron + engine |
| 2 | **Manual** parity sign-off on **Win / macOS / Linux** |
| 3 | Update download links and **install** docs |
| 4 | Remove `gui_app.py` entry or repoint to Electron launcher |
| 5 | Remove `src/cuepoint/ui/` Qt code (or move to `legacy/` archive branch if policy requires) |
| 6 | Remove PySide6 **dependencies** from packaging where unused |
| 7 | Run **full** Python test suite; fix imports |

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Users on old installer | Med | Low | Migration note; optional update nag |
| Hidden Qt import | Low | High | CI grep `PySide6`, `PyQt`, `QtWidgets` |
| Engine missing from bundle | Low | High | Install integration test in Phase 9 |

---

## Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| Feature flag two GUIs one release | Safer | Maintenance |
| **Big bang** cutover (chosen per plan) | Clean | Higher testing burden |

---

## Substeps and suggested commits

| ID | Description | Suggested commit message | Verification |
|----|-------------|---------------------------|--------------|
| 10.1 | Add Phase 10 doc | `docs(ui-overhaul): add phase 10 cutover and qt removal` | |
| 10.2 | Document cutover checklist in release notes template | `docs: add desktop cutover checklist to release template` | |
| 10.3 | Remove Qt UI modules (future) | `refactor!: remove pyside6 gui in favor of electron shell` | Tests pass |
| 10.4 | Update how-to-run for Electron (future) | `docs: update how-to-run for electron desktop` | |
| 10.5 | Remove PySide6 from dependencies (future) | `chore: drop pyside6 dependency` | CI |

---

## Revision history

| Date | Change | Author |
|------|--------|--------|
| 2026-04-03 | Initial version | — |
| 2026-04-03 | Added go/no-go criteria, communication plan, CLI note, expanded risks | — |
