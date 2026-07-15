# Phase 9 — CI and release

## Purpose

Define **continuous integration** and **release** for **Electron + Python engine** on **Windows, macOS, Linux**: build matrix, **artifacts**, **versioning**, **code signing** placeholders, **secret scanning** (Phase 0c), and **update** channels.

**Prerequisites:** Phases 2–4, 8.

---

## Release train (analytical)

| Stage | Gate | Artifact |
|-------|------|----------|
| **PR** | Lint + unit + secret scan | — |
| **Main** | Nightly optional contract + build | Unsigned artifacts |
| **RC** | Manual matrix (Phase 8) signed | Signed / notarized TBD |
| **GA** | Release notes + version coupling check | Public download |

**Rollback:** If GA is broken, **yank** download + publish **previous** version pointer; document in runbook (TBD file).

---

## Supply chain controls (target state)

| Control | Implementation | Evidence |
|---------|------------------|----------|
| Locked dependencies | `package-lock.json` / `pip-tools` or lockfile | Committed hashes |
| Reproducible engine build | Same tag → same binary hash (best effort) | CI artifact digest |
| Signed updates | `electron-updater` + certs | Release checklist |
| Vuln scan | `npm audit` / OSV (optional) | CI summary |

---

## Signing and notarization (placeholder matrix)

Document **which** platforms require which steps; **no secrets** in repo.

| OS | Sign | Notarize / equivalent |
|----|------|------------------------|
| Windows | Authenticode (TBD) | — |
| macOS | Apple Developer ID | `notarytool` flow TBD |
| Linux | GPG or distro-specific | TBD |

---

## Goals vs non-goals

| Goals | Non-goals |
|--------|-----------|
| Three-OS build | Microsoft Store / Mac App Store specifics (unless product requires) |
| Signed artifacts where keys exist | Full notarization playbook in v1 doc |

---

## Build outputs

| Artifact | Contents |
|----------|----------|
| Desktop installer / archive | Electron app + bundled engine binary |
| SBOM (optional) | Python + npm deps |

---

## Version coupling

- **Shell version** and **engine version** must **match** or engine shows **blocking** warning (ADR).

---

## CI matrix

| OS | Build | Test |
|----|-------|------|
| windows-latest | Electron + PyInstaller | Python + smoke |
| macos-latest | Same | Same |
| ubuntu-latest | Same | Same |

---

## Secret scanning

- Run **gitleaks** or equivalent on **PR** (Phase 0c).
- **Suggested commit:** `ci: add secret scanning workflow for pull requests`

---

## Measurable acceptance criteria

- [ ] **Release** produces **three** platform artifacts from one workflow (or documented matrix).
- [ ] **Engine** binary starts and responds to `/health` in CI **smoke** step.
- [ ] **Digest file** (`SHA256SUMS` or equivalent) published next to artifacts.
- [ ] **Version coupling** test fails CI if shell `package.json` version ≠ engine embedded version.

---

## Substeps and suggested commits

| ID | Description | Suggested commit message | Verification |
|----|-------------|---------------------------|--------------|
| 9.1 | Add Phase 9 doc | `docs(ui-overhaul): add phase 9 ci and release` | |
| 9.2 | GitHub Actions matrix for desktop (future) | `ci: add electron and engine build matrix` | Green CI |
| 9.3 | Upload artifacts (future) | `ci: upload desktop build artifacts` | |
| 9.4 | Document signing env vars (no values) | `docs: document code signing environment variables` | |

---

## Revision history

| Date | Change | Author |
|------|--------|--------|
| 2026-04-03 | Initial version | — |
| 2026-04-03 | Added release train, supply chain controls, signing matrix, stricter acceptance | — |
