# Phase 2 — Repository layout

## Purpose

Define how **Electron**, **web UI**, and **Python engine** coexist in the repo: **directory layout**, **package managers**, **dev scripts**, and **environment variables**—without breaking the existing **`src/cuepoint/`** Python package.

**Prerequisites:** Phase 0 ADRs.

**Outcomes:** Agreed folder structure, `README` dev instructions, substeps with commits.

---

## Evaluation criteria (for layout choices)

When deviating from the **recommended layout**, score alternatives against:

| Criterion | Weight | Question |
|-----------|--------|----------|
| **Clarity** | High | Can a new contributor find shell vs engine in < 5 min? |
| **CI cost** | Medium | Does the matrix need duplicate installs? |
| **Tooling** | Medium | Single lockfile per ecosystem? |
| **Migration** | High | Minimal moves of existing `src/cuepoint/`? |

---

## Boundary definitions (analytical)

| Boundary | Owns | Must NOT own |
|----------|------|----------------|
| `apps/desktop-electron` | Windowing, packaging manifest, renderer build | Beatport logic |
| `src/cuepoint` | Domain + CLI + engine HTTP (when added) | React components |
| `docs/ui-overhaul` | Specs | Production secrets |

---

## Problem statement and constraints

- **Problem:** Monorepo must stay **navigable** and **CI-friendly** for **three** OS builds.
- **Constraint:** Existing Python **CLI** and **tests** must keep working during migration.

---

## Goals vs non-goals

| Goals | Non-goals |
|--------|-----------|
| Clear separation: shell / ui / engine | Migrating Python packaging in Phase 2 |
| `pnpm` or `npm` lockfile | Yarn 1 vs Berry debate (pick one) |

---

## Recommended layout (illustrative)

```
repo/
  src/cuepoint/              # existing Python package (unchanged at first)
  apps/
    desktop-electron/        # Electron main + renderer + vite build
      package.json
      electron/              # main process TS
      renderer/              # or src/ for React
  packages/                  # optional shared TS types
    shared-types/
  scripts/                   # dev: launch engine + electron
  docs/ui-overhaul/
```

**Engine binary:** Built from `src/` + `pyproject` / `requirements` into `dist/engine/` per platform (Phase 9).

---

## Alternatives considered

| Layout | Pros | Cons |
|--------|------|------|
| **apps/** + **packages/** | Scales | More tooling |
| Electron at repo root | Simple | Clutters Python root |

---

## Environment variables (document in `.env.example`)

| Variable | Purpose |
|----------|---------|
| `CUEPOINT_ENGINE_PATH` | Dev override to engine executable |
| `CUEPOINT_ENGINE_PORT` | Optional fixed port (dev only) |
| `CUEPOINT_LOG_LEVEL` | `debug` / `info` |

**Never** commit real `.env`.

---

## Design decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| RL-1 | **Single `package.json`** per Electron app | Standard tooling |
| RL-2 | **Python engine** invoked by **relative path** from packaged app | Avoid PATH hacks |

---

## Dependency closure

| This phase enables | Blocked without it |
|--------------------|--------------------|
| Clean `npm`/`pip` separation | 4 (Electron cannot guess paths) |
| Reproducible dev | 8 (tests need one way to launch) |

---

## Traceability

| Topic | Phase |
|-------|-----|
| Layout | 4, 9 |
| Types | 3 (OpenAPI client) |

---

## Measurable acceptance criteria

- [ ] `README` or `docs/how-to-run.md` updated with **dev** instructions (when implementation starts).
- [ ] `git clone` + documented steps run **Python tests** unchanged.

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Path length on Windows | Short folder names |

---

## Substeps and suggested commits

| ID | Description | Suggested commit message | Verification |
|----|-------------|---------------------------|--------------|
| 2.1 | Add Phase 2 doc | `docs(ui-overhaul): add phase 2 repository layout` | |
| 2.2 | Scaffold `apps/desktop-electron` (future) | `feat(electron): scaffold vite react electron workspace` | `npm run dev` |
| 2.3 | Add root `package.json` workspaces (optional) | `chore: add npm workspaces for desktop shell` | |
| 2.4 | Add `scripts/dev-desktop.ps1` / `.sh` stub | `chore: add dev script to run engine and electron` | |

---

## Revision history

| Date | Change | Author |
|------|--------|--------|
| 2026-04-03 | Initial version | — |
| 2026-04-03 | Added evaluation criteria, boundary definitions, dependency closure | — |
