---
name: cuepoint-release
description: Drive a full CuePoint release - survey every commit back to the previous release, write the changelog and release notes, sync README and docs, get release CI green, then version, tag, publish, and verify update feeds. Use for release readiness, cutting a release, or troubleshooting release CI; not ordinary feature work or commit-message suggestions.
---

# CuePoint release

Make release work reproducible, auditable, and explicit about external side effects. A release is
not just a tag: the docs, both changelog surfaces, and every release workflow must be correct
before the tag exists, because the tag is what triggers publication.

The phase sections below run in order and are the working procedure. The reference sections after
them — channel rules, sources of truth, script routing, and invariants — apply throughout.

## Phase 1 - establish scope before mutation

Determine whether the request is only to inspect/prepare or also authorizes tagging, pushing,
signing, uploading, publishing feeds, creating a GitHub release, or announcing it. Preparation
does not authorize those external actions. Ask immediately before any missing authorization.

Inspect the branch, `git status`, target version/tag, release channel, and target platforms.
Do not release from an unexplained dirty worktree, and do not tag a branch whose CI is red.

## The release run sheet

For a real release, work these phases in order and do not skip ahead. Each phase gates the next.

1. **Scope the version.** Decide the version and channel, and for a test release decide whether it
   is for manual install testing or for exercising the auto-update flow, since that determines
   whether it stays a draft. See "Channel and tag format". Confirm the authorization above.
2. **Get CI green.** No tag until every release-relevant workflow passes on the branch.
3. **Survey the change set** back to the previous stable release for a stable release, or to the
   immediately preceding release for a test release. One reading, feeding phases 4 and 5.
4. **Write the changelog and release notes** from that survey.
5. **Sync docs and README** from that survey. Reality must match what ships.
6. **Bump and couple versions.**
7. **Run local gates.**
8. **Tag** (only when authorized), then watch CI.
9. **Verify the published release and feeds.**

Report progress against these phases and stop at the first that cannot be completed.

## Phase 2 - get CI green before tagging

This is the phase most often skipped, and it is the one that makes a tag unrecoverable. Pushing a
`v*` tag starts `build-macos.yml`, `build-windows.yml`, and `release.yml`; `release.yml` then
polls for up to 60 minutes for builds that will never go green if they are already broken. Fix
the branch first.

```bash
gh run list --branch "$(git branch --show-current)" --limit 15
gh run view <run-id> --log-failed
```

Every workflow that a tag will trigger must pass: `build-macos`, `build-windows`,
`desktop-electron`, `test`, `release-gates`, `compliance-check`, `docs-check`,
`license-compliance`, `security-scan`. Treat a red run as a release blocker, not a warning.

Failures cluster into recurring causes; check these before deep debugging:

- **Stale paths left by the Qt to Electron migration.** `src/cuepoint/ui/` no longer exists, so
  icon generation, compliance checks, and doc links that still point into it fail. Icon
  generation failing on both build workflows blocks the release outright.
- **`npm ci` lockfile drift.** `npm ci` fails whenever `package-lock.json` disagrees with
  `package.json`. Refresh the lockfile with an intentional `npm install` and commit it.
- **mypy gates.** `test` and `release-gates` both fail the build on type errors, including
  platform-conditional `Unused "type: ignore"` comments that only appear on some runners.
- **`pip-audit` advisories.** `security-scan` fails on any known vulnerability in production
  dependencies; resolve by upgrading, not by suppressing.
- **Dead documentation links.** See phase 5.

Verify current failures yourself; the clusters above are a starting point, not a fixed list.

## Phase 3 - survey the change set

Everything downstream — the changelog, the release notes, and which documents need updating —
comes from one reading of what changed since the last stable release. Do the survey once, up
front, and carry its output through phases 4 and 5.

First establish the baseline. Which tag that is depends on what is being cut, because the two
release kinds answer to different audiences:

- **Stable release** -> the previous **stable** tag. Users installing it may have skipped every
  test release since, so the notes must be cumulative. A `-test` tag is never a stable baseline.
- **Test release** -> the **immediately preceding release, test or stable**. These are
  incremental: what matters is what changed since the last build that shipped.

```bash
git fetch --tags
TARGET=v1.2.3-mar1-test1   # the tag about to be created

if [[ "$TARGET" == *-test* ]]; then
  BASELINE=$(git tag --list 'v*' --sort=-creatordate | grep -vxF "$TARGET" | head -1)
else
  BASELINE=$(git tag --list 'v*' --sort=-creatordate | grep -v -- '-test' | grep -vxF "$TARGET" | head -1)
fi
echo "baseline: $BASELINE"
```

Sort by `creatordate`, not by version. Version sorting ranks `v1.0.0-feb1-test2` above the stable
`v1.0.0-feb1` that shipped after it, so "the immediately preceding release" comes out wrong.
`creatordate` also covers this repository's mixed tag types — `v0.0.1` and `v0.0.2` are
lightweight, `v0.0.3` is annotated, and `taggerdate` is empty for lightweight tags.

Sanity-check the result before trusting it. A deleted tag disappears from this list even though
its GitHub release still exists, and the command excludes only `$TARGET`, so re-cutting a tag
that is not the newest will pick a later one. Confirm the baseline really is the release this one
follows.

Then read the range — its shape first, then the full list:

```bash
git log --no-merges --pretty='%s' "$BASELINE..HEAD" \
  | sed 's/(.*)//; s/:.*//' | sort | uniq -c | sort -rn
git log --no-merges --name-only --pretty=format: "$BASELINE..HEAD" \
  | grep -E '^(src|apps|docs|scripts|\.github)/' | cut -d/ -f1-2 | sort | uniq -c | sort -rn
git log --no-merges --pretty='%h %s' "$BASELINE..HEAD"
```

The type counts show where the release's weight sits; `feat` and `fix` are the user-facing ones.
The touched areas say which documents are in play — commits under `docs/user-guide/` or a renderer
directory imply user-visible behavior whose documentation must be checked.

Produce a work list from the survey before editing anything:

- Every commit is either user-facing, and so belongs in the changelog, or consciously excluded as
  internal. Say which; do not leave the set unexamined.
- Which README sections and which documents the touched areas imply.
- Anything architectural enough to need an ADR.

Expect this range to be large when several test releases have shipped since the last stable
release. That is the normal case, not a reason to narrow the range.

## Phase 4 - write the changelog and release notes

Work from the phase 3 survey. `docs/release/CHANGELOG.md` is the source, and it reaches users
through a chain — verify each hop:

`docs/release/CHANGELOG.md` -> `scripts/generate_release_notes.py` -> `RELEASE_NOTES.md` ->
the GitHub Release body -> the appcast `<description>` -> the in-app update dialog, which
`src/cuepoint/update/update_checker.py` reads from that feed element.

- The changelog covers the range phase 3 established: **back to the previous stable release** for
  a stable release, **back to the immediately preceding release** for a test release. So a stable
  release's entries are the union of every test release since the last stable one, plus anything
  after — carry those entries forward rather than assuming a test release already delivered them
  to the people installing this one.
- Write for the person using CuePoint, not the person who wrote the code. The end of this chain
  is an update prompt, so the entries are what a user reads when deciding to install.
- Keep entries under `Unreleased` during development; cut a dated version section only as part of
  an authorized release, following `docs/policy/changelog-policy.md`.
- `generate_release_notes.py` lifts the changelog section into `RELEASE_NOTES.md`. It resolves
  the section in this order: the full version (`[1.2.3-feb1]`), then `[Unreleased]` when it has
  content, then the base version (`[1.2.3]`). `[Unreleased]` outranks the base version because
  labelled tags like `v1.0.0-feb1` share a base version with sections published long ago, and
  matching one of those would ship stale notes. Cut `[Unreleased]` into a dated section before
  tagging a stable release and the exact match wins.
- It **exits non-zero when no section with content resolves**, so a release fails before
  publishing empty notes rather than after. If that stops a release, write the changelog entry;
  do not work around it. `--section` forces a specific section when resolution needs overriding.
- The generator formats notes; it does not discover them. It never establishes the change set —
  that is phase 3's job, and the changelog it reads is only as complete as that survey was.

## Phase 5 - sync docs and README

Drive this from the touched areas in the phase 3 survey, so documentation is checked because
something changed under it rather than from memory.

- `README.md`: features, screenshots, install and quickstart steps, supported platforms, and any
  version or download reference.
- User-facing docs under `docs/`, `docs/user-guide/` first: anything describing behavior changed
  in this release.
- `docs/release/known-issues.md` and `docs/release/compatibility-matrix.md`: refresh both, since
  they describe the release users are about to install.
- ADRs for architectural change, per the repository guidance.

`docs-check.yml` runs a lychee link check over `docs/` and `.github/` and fails on dead links,
including relative links to files that were deleted. Fix the link or the underlying reference;
use `.lycheeignore` only for genuinely external or not-yet-live URLs, never to hide a real
broken reference.

## Phase 6 - version and coupling

Bump `src/cuepoint/version.py` and the Electron `package.json` `cuepoint.engineVersion` together
and run the coupling check. Note that `version.py` carries both `__version__` (packaged builds)
and `__version_local_dev__` (unpackaged runs, so local update checks use the test track); when
diagnosing a wrong reported version or update track, establish which one is in play.

Because `release.yml` runs `sync_version.py --tag`, the tag is authoritative and version files
follow it: a tag that disagrees with `version.py` rewrites the version rather than failing.

## Phase 7 - local gates

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

## Phase 8 - tag, and what CI owns

Tag only when the phases above are complete and tagging is authorized. Confirm the tag string
against "Channel and tag format" before pushing it.

CI owns these on tag push. Do not produce or hand-place their outputs locally as if they were the
release: `sync_version.py --tag`, `generate_licenses.py`, `generate_sbom.py`,
`generate_checksums.py`, `sign_checksums.py`, `generate_release_notes.py`, the GitHub Release
itself, and `generate_appcast.py` / `generate_update_feed.py` / `validate_feeds.py` /
`publish_feeds.py`. Run them locally only to reproduce or diagnose a CI failure, and say so.

## Phase 9 - verify the published release and feeds

After the workflows finish, verify rather than assume:

- The release state matches the intent for its channel: a stable release is **published** and not
  marked prerelease; a test release is a draft while under manual test, or a published prerelease
  when the auto-update flow is being exercised. A *stable* release sitting as a draft means
  something did not run as expected — investigate before announcing.
- Assets are complete: the macOS DMG, the Windows installer and `README.txt`,
  `sbom.spdx.json`, `THIRD_PARTY_LICENSES.txt`, and `SHA256SUMS` (plus `SHA256SUMS.asc` when
  GPG signing ran).
- The release body carries the changelog entries for this release, and matches what the changelog
  says shipped.
- The correct appcast was updated for the channel, download URLs resolve, and an existing install
  is offered the update. `check_appcast_diff.py` and `validate_feeds.py` help here.

## Channel and tag format

The channel is chosen by one substring test on the tag name. There is no separate channel input.

- A tag containing `-test` is a **test release**. It goes to the test feeds and must never appear
  as a normal release: it exists so the maintainer can install and exercise the build first.
- Every other tag, including suffixed ones like `v1.0.0-feb1`, is a **stable release** and
  publishes publicly.

Confirm the intended channel against the tag string before tagging; a mistyped or dropped suffix
silently ships to stable. `scripts/create_release_tag.sh` accepts bare `X.Y.Z` only, so it cannot
create the suffixed tags this project actually uses — tag manually when a suffix is required.

### Draft or published, for test releases

The intended behavior is that a test release lands as a **draft** so it is not offered to anyone
while it is being tested. That intent collides with how the update feed works, so decide which
kind of testing this release is for before tagging:

- **Manual install testing** (download the DMG or installer yourself and run it): draft is
  correct. Draft assets are reachable by the maintainer while signed in.
- **Auto-update flow testing** (install an older build and confirm it detects, downloads, and
  applies the update): the release must be **published as a prerelease**. Draft release assets
  are not publicly downloadable, and the test appcast embeds public
  `releases/download/<tag>/<asset>` URLs, so against a draft those downloads 404.

While a test release stays a draft, treat its published test appcast as invalid: the feed exists
on gh-pages but its download URLs do not resolve. Do not rely on it, and do not ask anyone else
to update from it until the release is published.

Note the current implementation does not yet match the draft intent: `release.yml` sets
`draft: false` and marks only `prerelease: contains(github.ref_name, '-test')`, with a comment
explaining that test tags are published as prereleases specifically so assets stay public while
the website's `releases/latest` continues to show stable only. So a test tag today produces a
published prerelease, and getting a draft means converting the release after the fact. Flag this
gap rather than silently working around it, and re-check the workflow before relying on either
behavior.

## Use current sources of truth

- Workflows: `release.yml`, `release-gates.yml`, `build-macos.yml`, `build-windows.yml`.
- Operational entry point: `docs/release/ops-index.md`; deployment steps in
  `release-deployment-runbook.md`, withdrawal in `rollback.md`, feed damage in
  `update-feed-recovery-runbook.md`.
- Checklist: `docs/release/pre-release-checklist.md`.
- Changelog: `docs/release/CHANGELOG.md` and `docs/policy/changelog-policy.md`.
- Versions: `src/cuepoint/version.py`, Electron `package.json` `cuepoint.engineVersion`.
- Reproducible Python build inputs: `requirements-build.txt` and the hashed requirements
  generated by `scripts/generate_requirements_hashes.py`.

## Choosing among the release scripts

`scripts/` holds many overlapping helpers. Prefer these; treat the rest as supporting context.

| Need | Use |
| --- | --- |
| Readiness before tagging | `check_release_readiness.py` (the runbook gate) |
| Guided preparation | `prepare_release.py` |
| Version/changelog gates | `validate_version.py`, `validate_changelog.py` |
| Desktop coupling | `check_desktop_version_coupling.py` |
| Signing and notarization | `validate_signatures.py`, `validate_notarization.py` |
| Feeds and appcasts | `validate_appcast.py`, `validate_feeds.py`, `check_appcast_diff.py` |
| Installers | `verify_installer.py` |

`release_readiness.py`, `step10_release_readiness.py`, `validate_release.py`, and
`test_pre_release.py` are older step-numbered masters that predate the current changelog and
Electron layout. Read them before running them, and do not treat their verdicts as the gate.

## Safety and release invariants

- Use SemVer tags with a leading `v`; keep the `-test` suffix meaningful.
- Keep Python and desktop engine versions coupled; run the coupling check.
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
- A published tag is not retractable in practice. Prefer a forward hotfix over deleting a tag or
  a release, and follow `rollback.md` when withdrawal is genuinely required.

End with a release checklist that walks the phases and distinguishes completed local checks,
CI-only checks, manual platform verification, and any not-yet-authorized publishing step.
