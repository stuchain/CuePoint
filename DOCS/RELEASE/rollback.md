# Release Rollback Plan

Design: 02 Release Engineering and Distribution (2.4, 2.20, 2.37, 2.89).

## Purpose

When a release is broken (critical bug, security issue, or failed installs), follow this plan to withdraw the release and optionally publish a hotfix.

## Rollback Steps

### 1. Identify the broken version

- Note the version (e.g. `1.2.3`) and the GitHub release tag (e.g. `v1.2.3`).
- Document the incident: what failed, who is affected, and root cause if known.

### 2. Remove appcast entry

- So that auto-update no longer offers the broken version:
  - Edit or regenerate the appcast so the broken version is no longer the latest (or remove its `<item>`).
  - Appcast files: `updates/macos/stable/appcast.xml`, `updates/windows/stable/appcast.xml` (on `gh-pages` or your feed host).
- Publish the updated appcast (e.g. push to `gh-pages` or update the feed).

### 3. Mark GitHub release as withdrawn

- Open the GitHub release for the broken tag.
- Either:
  - **Unpublish**: Use “Unpublish release” so the release page and assets are no longer the default; or
  - **Draft**: Convert to draft so it is not shown as a normal release.
- Add a note in the release description: “WITHDRAWN: [brief reason]. Do not use this build.”

### 4. Notify users (if applicable)

- Post release notes or a notice that the version was withdrawn and why.
- If you have a beta or mailing list, notify testers.

### 5. Publish a hotfix (if applicable)

- Follow the [Emergency Hotfix Checklist](#emergency-hotfix-checklist) to ship a patched version.

## Emergency Hotfix Checklist

- [ ] Create hotfix branch from the **last good** release tag (e.g. `git checkout -b hotfix/1.2.4 v1.2.3`).
- [ ] Apply the minimal fix; run tests.
- [ ] Bump version (e.g. to `1.2.4`) in `SRC/cuepoint/version.py` and sync (e.g. `scripts/sync_version.py`).
- [ ] Update `DOCS/RELEASE/changelog.md` with the fix and version.
- [ ] Create and push tag (e.g. `v1.2.4`).
- [ ] Let CI build, sign, and run release workflow.
- [ ] After release is published, regenerate appcast so the new version is the latest entry.
- [ ] Verify update check offers the hotfix and not the withdrawn version.

## Rollback drill (periodic test)

Design 2.37: run periodically to validate rollback steps.

1. **Simulate a bad release**: Add a test entry to a copy of the appcast (or use a test channel).
2. **Remove the appcast entry**: Edit the appcast so the test version is no longer the latest; publish.
3. **Confirm clients no longer see that version**: Run the app’s update check; it should not offer the removed version.
4. **Publish a “fix” entry**: Add a new version entry; confirm the update flow offers it.
5. **Validate appcast**: Run `python scripts/validate_appcast.py` on the modified appcast to ensure structure remains valid.

## Optional: checksum file signing

Design 2.17: you may sign `SHA256SUMS` (e.g. with GPG) when a key is available. See [Key management](key-management.md#checksum-file-signing-optional).

## References

- Design: `DOCS/prerelease/designs/02-release-engineering-and-distribution.md` (2.4, 2.20, 2.37, 2.89).
- Release strategy: `DOCS/RELEASE/release-strategy.md`.
- Key management: [key-management.md](key-management.md).
