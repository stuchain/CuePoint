---
name: cuepoint-release
description: Drive a full CuePoint release - survey every commit back to the previous release, write the changelog and release notes, sync README and docs, get CI green, then version, tag, publish the GitHub release, and verify it. Use for release readiness, cutting a release, or troubleshooting release CI; not ordinary feature work or commit-message suggestions.
---

# CuePoint release

Make release work reproducible, auditable, and explicit about external side effects. The source of
truth is `docs/release/release-deployment-runbook.md`; read it first and follow it. This skill is
the order of work and the checks around it, not a second copy of the steps.

Facts that shape every release:

- **There is no release workflow and no auto-updater.** `release.yml` and the per-OS build workflows
  are gone. `.github/workflows/desktop-electron.yml` builds the installers on each push, and you
  publish a green commit's artifacts by hand (DEC-147). A tag starts nothing.
- **There are no update feeds.** The app does not check for updates until Phase 16 (DEC-145). Users
  install a new version by hand from the GitHub release. Never publish an appcast or feed.
- **Windows builds are unsigned.** The macOS build is signed and notarized only when credentials are
  present (`apps/desktop-electron/build/signNestedBinaries.cjs`, `notarize.cjs`); CI has none today.

## Phase 1 - scope and authorization

Determine whether the request is only to inspect or prepare, or also authorizes tagging, pushing,
uploading, creating a GitHub release, or announcing it. Preparation does not authorize those
external actions. Ask immediately before any missing authorization.

Inspect the branch, `git status`, the target version and tag, and the target platforms. Do not
release from an unexplained dirty worktree, and do not release a commit whose CI is red.

## Phase 2 - survey the change set

Everything downstream, the changelog, the release notes and which documents to update, comes from
one reading of what changed. Baseline is the previous release tag; for a stable release skip
`-test` tags, because users may have skipped every test build.

```bash
git fetch --tags
TARGET=v1.2.3
BASELINE=$(git tag --list 'v*' --sort=-creatordate | grep -v -- '-test' | grep -vxF "$TARGET" | head -1)
echo "baseline: $BASELINE"
git log --no-merges --pretty='%s' "$BASELINE..HEAD" | sed 's/(.*)//; s/:.*//' | sort | uniq -c | sort -rn
git log --no-merges --pretty='%h %s' "$BASELINE..HEAD"
git log --no-merges --name-only --pretty=format: "$BASELINE..HEAD" \
  | grep -E '^(src|apps|docs|scripts|\.github)/' | cut -d/ -f1-2 | sort | uniq -c | sort -rn
```

Sort by `creatordate`, not by version, and confirm the baseline really is the release this one
follows (a deleted tag drops out of the list). For a test build, use the immediately preceding
release of any kind.

Produce a work list before editing: every commit is either user-facing (it belongs in the
changelog) or consciously excluded as internal; which documents the touched areas imply; anything
architectural enough to need an ADR.

## Phase 3 - changelog and release notes

- `docs/release/CHANGELOG.md` is the source. Follow `docs/policy/changelog-policy.md`. Entries
  cover the whole range from the survey, written for the person using CuePoint.
- Cut `[Unreleased]` into a dated version section as part of an authorized release.
  `python scripts/validate_changelog.py` fails unless the changelog has an entry for the current
  version or a non-empty `[Unreleased]`.
- Release notes are written by hand from the template in the runbook ("Release notes and
  announcement templates"). There is no generator script. Link known issues to
  `docs/user-guide/troubleshooting.md` where there is a workaround.

## Phase 4 - sync docs and README

Drive this from the touched areas in the survey.

- `README.md`: features, install and quickstart steps, supported platforms, any version or
  download reference.
- User-facing docs, `docs/user-guide/` first, for any behavior changed in this release. Refresh
  `docs/user-guide/troubleshooting.md` (known issues and workarounds) and
  `docs/user-guide/support-policy.md` (supported systems and versions), since they describe the
  release users are about to install.
- ADRs for architectural change.

`docs-check.yml` runs a lychee link check over `docs/` and `.github/` and fails on dead links. Fix
the link or the reference; use `.lycheeignore` only for external URLs that are not live yet.

## Phase 5 - version and coupling

The version is `__version__` in `src/cuepoint/version.py`. The desktop `package.json` carries it
as `cuepoint.engineVersion` (its own `version` stays `0.0.0`). Set both to the same string, then:

```bash
python scripts/check_desktop_version_coupling.py   # fails if the two differ
```

Run `python scripts/validate_version.py` after Phase 8 tags the commit, not now. It checks that
the version is SemVer and that its base matches the latest `v*` tag, so until the new tag exists it
fails, and `release-gates` R001 (which runs it) is expected to be red on the version-bump commit.

## Phase 6 - local gates

From the repository root unless noted. Run the full Python suite and the desktop suites before
declaring a release candidate ready.

```bash
python scripts/validate_changelog.py
python scripts/check_no_qt.py
python scripts/check_file_sizes.py
python scripts/validate_compliance.py
python scripts/run_tests.py --all --no-slow
ruff check src/ && ruff format --check src/
python -m pytest src/tests/integration/test_mypy_foundation.py -q
cd apps/desktop-electron/renderer && npm run lint && npm run typecheck && npm test
cd apps/desktop-electron && npm test && npm run typecheck && npm run test:e2e
```

For packaging, `npm run pack:full` (engine sidecar, mpv, unpacked app) or `npm run dist` in
`apps/desktop-electron` build locally. CI's artifacts, not a local build, are what you publish.
A macOS bundle can be checked with
`python scripts/verify_macos_bundle.py <CuePoint.app> --expect-hardened-runtime`.

## Phase 7 - get CI green

No tag until the release commit is green, except that `release-gates` R001 stays red until the tag
exists (Phase 5). On the branch, check these workflows:
`desktop-electron` (all three operating systems), `test`, `release-gates`, `compliance-check`,
`docs-check`, `license-compliance`, `security-scan`.

```bash
gh run list --branch "$(git branch --show-current)" --limit 15
gh run view <run-id> --log-failed
```

Treat a red run as a release blocker. Recurring causes, to check before deep debugging:

- **`npm ci` lockfile drift.** `npm ci` fails when `package-lock.json` disagrees with
  `package.json`. Refresh with an intentional `npm install` and commit the lockfile.
- **mypy gate and ruff.** `test` and `release-gates` fail on type errors and on `ruff check` /
  `ruff format --check`.
- **`pip-audit` advisories.** `security-scan` fails on a known vulnerability; upgrade, do not
  suppress.
- **Hashed-install gate.** `release-gates` installs `requirements-build-hashed.txt` with
  `--require-hashes`; a requirement change needs the hashes regenerated
  (`scripts/generate_requirements_hashes.py`).
- **Pinned mpv expired.** `fetch_player_sidecar.py` fails when a pinned asset disappears; re-pin
  with `--update-manifest` and review the diff.
- **Dead documentation links.** See phase 4.

Verify current failures yourself; this list is a starting point, not a fixed one.

## Phase 8 - tag and publish (only when authorized)

Follow "Publish" in the runbook:

1. Tag the green commit: `git tag vX.Y.Z <commit>`, then `git push origin vX.Y.Z`. A test build is
   `vX.Y.Z-test.N`. SemVer with a leading `v`; the `-test` suffix means pre-release. Then run
   `python scripts/validate_version.py`; it passes once the tag matches `version.py`.
2. Download the `desktop-electron-<os>` artifacts from that commit's run. Each leg's
   `SHA256SUMS.txt` has the same name: rename them `SHA256SUMS-windows.txt`, `-macos.txt` and
   `-linux.txt`, and check each with `sha256sum -c --ignore-missing SHA256SUMS-<os>.txt` (macOS:
   `shasum -a 256 -c --ignore-missing`). For a normal release, check that the macOS build is signed
   and notarized (`xcrun stapler validate`).
3. Create the GitHub release from the tag: paste the release notes, attach the installers and the
   checksum files, mark a test build as a pre-release, mark a normal release as latest.
4. Announce it with the runbook's template.

Do not hand-edit checksums, SBOMs or licence bundles; generate them (`generate_sha256_sums.py`,
`generate_sbom.py`, `generate_licenses.py`).

## Phase 9 - verify

After publishing, verify rather than assume:

- The release state matches intent: a normal release is published, not a pre-release and not a
  draft; a test build is a pre-release.
- Assets are complete: the macOS DMG, the Windows NSIS installer, the Linux AppImage if you ship
  it, and `SHA256SUMS-<os>.txt` for each.
- The release body carries this release's changelog entries.
- One installer downloads and installs on a clean machine, and **About CuePoint...** shows the
  right version.
- The GitHub Pages site, if `gh-pages-root/` changed, is published by
  `publish-gh-pages-site.yml`; check that workflow ran.

## Sources of truth

- Runbook: `docs/release/release-deployment-runbook.md`. Signing keys and secrets:
  `docs/release/key-management.md`. Withdrawal: `docs/release/rollback.md`. Live incidents:
  `docs/release/incident-response-runbook.md`.
- Known issues and workarounds: `docs/user-guide/troubleshooting.md`. Supported systems:
  `docs/user-guide/support-policy.md`. Support targets: `docs/policy/support-sla.md`.
- Changelog: `docs/release/CHANGELOG.md` and `docs/policy/changelog-policy.md`.
- Workflows: `desktop-electron.yml`, `release-gates.yml`, `test.yml`, `security-scan.yml`,
  `compliance-check.yml`, `license-compliance.yml`, `docs-check.yml`, `publish-gh-pages-site.yml`.
- Versions: `src/cuepoint/version.py` and the desktop `package.json` `cuepoint.engineVersion`.
- Reproducible build inputs: `requirements-build.txt`, `build/engine-sidecar.spec`,
  `scripts/player_sidecar_manifest.json`.

## Safety and release invariants

- Keep the Python engine version and the desktop `cuepoint.engineVersion` coupled.
- Build platform artifacts on their intended OS. A local cross-platform package is not equivalent
  to CI's artifacts.
- Never print or commit signing keys, certificates, passwords, API tokens or environment secrets.
  Do not weaken signature, checksum or notarization checks to make a release pass.
- Record exact failed gates. Do not bypass a required gate without explicit user direction and a
  documented risk.
- A published tag is not retractable in practice. Prefer a forward hotfix over deleting a tag or a
  release, and follow `rollback.md` when withdrawal is genuinely required.

End with a release checklist that walks the phases and distinguishes completed local checks,
CI-only checks, manual platform verification, and any not-yet-authorized publishing step.
