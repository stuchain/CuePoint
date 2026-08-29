---
name: cuepoint-release
description: Prepare, validate, package, or troubleshoot CuePoint versions, installers, checksums, signatures, update feeds, and release CI. Use for release readiness or publishing; not ordinary feature work or commit-message suggestions.
---

# CuePoint release

Make release work reproducible, auditable, and explicit about external side effects.

## Establish scope before mutation

Determine whether the request is only to inspect/prepare or also authorizes tagging, pushing,
signing, uploading, publishing feeds, creating a GitHub release, or announcing it. Preparation
does not authorize those external actions. Ask immediately before any missing authorization.

Inspect the branch, `git status`, target version/tag, release channel, and target platforms.
Do not release from an unexplained dirty worktree.

## Use current sources of truth

- Workflows: `.github/workflows/release.yml`, `desktop-electron.yml`, and platform build files.
- Operational entry point: `docs/release/ops-index.md`.
- Deployment and rollback: `docs/release/release-deployment-runbook.md` and `rollback.md`.
- Checklist: `docs/release/pre-release-checklist.md`.
- Changelog: `docs/release/CHANGELOG.md` and `docs/policy/changelog-policy.md`.
- Versions: `src/cuepoint/version.py`, Electron `package.json` `cuepoint.engineVersion`, and any
  files identified by `scripts/sync_version.py`.
- Reproducible Python build inputs: `requirements-build.txt` and generated hashed requirements.

Treat old step-numbered guides and helper scripts as supporting context. Confirm their paths and
assumptions against current workflows before running them; some historical helpers predate the
current changelog and Electron layout.

## Safety and release invariants

- Use SemVer tags with a leading `v` unless the active workflow explicitly establishes another
  format.
- Keep Python and desktop engine versions coupled; run the coupling check.
- Update `docs/release/CHANGELOG.md` under `Unreleased` during development and cut a dated
  version section only as part of an authorized release.
- Build platform artifacts on their intended OS. Do not treat a local cross-platform package as
  equivalent to CI artifacts.
- Keep stable and test update channels separate. Validate appcasts and download URLs before
  publishing.
- Never print or commit signing keys, certificates, passwords, API tokens, or environment
  secrets. Do not weaken signature, checksum, notarization, or publisher-identity checks to make
  a release pass.
- Generate artifacts rather than hand-editing checksums, SBOMs, license bundles, build metadata,
  or update feeds.
- Record exact failed gates. Do not bypass a required gate without explicit user direction and a
  documented risk.

## Validate progressively

Use the checks applicable to the requested release surface:

```bash
python scripts/validate_version.py
python scripts/validate_changelog.py
python scripts/check_desktop_version_coupling.py
python scripts/check_release_readiness.py
python scripts/check_no_qt_in_core.py
python scripts/check_large_files.py
python scripts/validate_compliance.py
cd apps/desktop-electron && npm run build
```

Run the full Python and renderer/engine/E2E suites before declaring a release candidate ready.
Use workflow-specific validators for installers, signatures, appcasts, feeds, SBOM, licenses,
and reproducible requirements when those artifacts are in scope.

End with a release checklist that distinguishes completed local checks, CI-only checks, manual
platform verification, and any not-yet-authorized publishing step.
