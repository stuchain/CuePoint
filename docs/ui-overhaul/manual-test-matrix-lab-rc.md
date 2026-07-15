# Manual test matrix — Electron lab RC

Use during **Phase 6 parity** sign-off before Qt cutover ([phase-10-cutover-remove-qt.md](phase-10-cutover-remove-qt.md)). Copy this file per release candidate (e.g. `manual-test-matrix-rc1.md`).

| Date | RC / commit | Tester | OS |
|------|-------------|--------|-----|
| | | | |

**Build:** `npm run electron:dev` from `apps/desktop-electron/` with renderer on 5173 (or `CUEPOINT_RENDERER_URL`).

## Environment

- [ ] Engine badge shows **Engine connected** on `/match` and `/incrate`
- [ ] Beatport token configured in Settings (for real discover / enrich)

## inKey (`/match`)

| Case | Win | macOS | Linux | Notes |
|------|-----|-------|-------|-------|
| Tool picker → inKey | ☐ | ☐ | ☐ | |
| Browse XML → single match job | ☐ | ☐ | ☐ | |
| Drop XML on input zone | ☐ | ☐ | ☐ | |
| Batch playlist picker → batch job | ☐ | ☐ | ☐ | |
| M3U source → browse / drop → job | ☐ | ☐ | ☐ | |
| Cancel running job | ☐ | ☐ | ☐ | |
| Past searches → load CSV | ☐ | ☐ | ☐ | |
| Re-run XML export | ☐ | ☐ | ☐ | |
| Re-run M3U export | ☐ | ☐ | ☐ | |
| Open review tracks filter | ☐ | ☐ | ☐ | |

## Results (`/results`)

| Case | Win | macOS | Linux | Notes |
|------|-----|-------|-------|-------|
| Live results after job | ☐ | ☐ | ☐ | |
| Batch playlist tabs | ☐ | ☐ | ☐ | |
| Candidate dialog | ☐ | ☐ | ☐ | |
| Needs review filter | ☐ | ☐ | ☐ | |
| Export CSV / JSON / Excel | ☐ | ☐ | ☐ | |
| Write column + Sync with Rekordbox | ☐ | ☐ | ☐ | Requires audio files |

## Settings (`/settings`)

| Case | Win | macOS | Linux | Notes |
|------|-----|-------|-------|-------|
| Beatport token save / test | ☐ | ☐ | ☐ | |
| Theme / scale | ☐ | ☐ | ☐ | |

## inCrate (`/incrate`)

| Case | Win | macOS | Linux | Notes |
|------|-----|-------|-------|-------|
| Drop / browse XML → import | ☐ | ☐ | ☐ | |
| Enrich labels (with token) | ☐ | ☐ | ☐ | |
| Reset database | ☐ | ☐ | ☐ | |
| Discover (real + demo) | ☐ | ☐ | ☐ | |
| Create Beatport playlist | ☐ | ☐ | ☐ | |

## Sign-off

| Role | Name | Date |
|------|------|------|
| Tester | | |

**Gate:** All P0 rows pass on all three OS columns, or waivers documented in an ADR.

Reference: [phase-8-testing.md](phase-8-testing.md), [parity-matrix.md](parity-matrix.md).
